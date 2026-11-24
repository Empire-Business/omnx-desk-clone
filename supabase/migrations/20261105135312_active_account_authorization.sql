-- Gate canônico da sessão web. Sem mudanças em dados, policies, Storage,
-- RPCs financeiras, grants, jobs ou integrações.
-- users.ativo é nullable/default true: NULL legado é preservado; false revoga.
-- get_user_tenant_id sem auth.uid continua NULL como na definição anterior.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.tenant_id FROM public.profiles p
  JOIN public.users u ON u.id = p.user_id AND u.tenant_id = p.tenant_id
  WHERE p.user_id = auth.uid() AND u.ativo IS DISTINCT FROM false
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.perfil = 'admin'
      AND u.tenant_id = public.get_user_tenant_id())
$$;

-- is_manager/is_admin_or_manager dependem de has_role. O alvo explícito continua
-- disponível ao serviço; false revoga a autoridade da conta desativada.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r
    JOIN public.users u ON u.id = r.user_id AND u.tenant_id = r.tenant_id
    JOIN public.profiles p ON p.user_id = u.id AND p.tenant_id = u.tenant_id
    WHERE r.user_id = _user_id AND r.role = _role AND u.ativo IS DISTINCT FROM false)
$$;

CREATE OR REPLACE FUNCTION public.pode_gerir_contratos()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.tenant_id = public.get_user_tenant_id()
      AND (u.perfil IN ('admin','gerente') OR u.acesso_contratos = true))
$$;

CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
    JOIN public.tenants t ON t.id = p.tenant_id AND t.is_master
    JOIN public.users u ON u.id = p.user_id AND u.tenant_id = p.tenant_id
    LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.tenant_id = p.tenant_id
    WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_user_tenant_id()
      AND (u.perfil = 'admin' OR ur.role = 'admin'))
$$;

CREATE OR REPLACE FUNCTION public.has_permissao(p_recurso text, p_acao text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.get_user_tenant_id() IS NOT NULL AND (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.permissoes_app pa
      JOIN public.users u ON u.id = auth.uid() AND u.perfil = pa.perfil
      WHERE pa.tenant_id = public.get_user_tenant_id()
        AND pa.recurso IN (p_recurso, '*')
        AND pa.acao = ANY (CASE p_acao
          WHEN 'ver' THEN ARRAY['ver','editar','admin']
          WHEN 'editar' THEN ARRAY['editar','admin']
          WHEN 'admin' THEN ARRAY['admin'] ELSE ARRAY[]::text[] END)
    )
  )
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
