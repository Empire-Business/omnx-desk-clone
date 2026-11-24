-- ============================================================================
-- Verificação em duas etapas obrigatória para o superadmin (app instalado)
-- ============================================================================
-- Decisão do dono (09/11/2026, F-02): no app instalado nas contas do cliente,
-- quem administra a empresa principal (is_master_admin: cria e enxerga as outras
-- empresas da instalação) só tem esse poder com a sessão confirmada pelo segundo
-- fator (TOTP do Supabase Auth, `aal2` no token).
--
-- Fora do escopo instalação (a produção da empresa: nenhum segredo htai_* no
-- cofre), htai_licenca_escopo_instalacao() = false e nada muda.
--
-- Mantém o corpo de 20261105135312 (gate canônico get_user_tenant_id) e só
-- acrescenta a exigência do segundo fator no fim. Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
    JOIN public.tenants t ON t.id = p.tenant_id AND t.is_master
    JOIN public.users u ON u.id = p.user_id AND u.tenant_id = p.tenant_id
    LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.tenant_id = p.tenant_id
    WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_user_tenant_id()
      AND (u.perfil = 'admin' OR ur.role = 'admin'))
  AND (NOT public.htai_licenca_escopo_instalacao()
       OR coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
$$;

COMMENT ON FUNCTION public.is_master_admin() IS
  'Admin da empresa principal (superadmin). No app instalado (escopo instalação) exige sessão aal2 (segundo fator).';

-- Situação para a tela: a pessoa é superadmin, o segundo fator é exigido e a
-- sessão atual já está confirmada? Não devolve segredo nenhum.
CREATE OR REPLACE FUNCTION public.desk_mfa_situacao()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.tenants t ON t.id = p.tenant_id AND t.is_master
      JOIN public.users u ON u.id = p.user_id AND u.tenant_id = p.tenant_id
      LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.tenant_id = p.tenant_id
      WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_user_tenant_id()
        AND (u.perfil = 'admin' OR ur.role = 'admin')) AS superadmin,
      public.htai_licenca_escopo_instalacao() AS exigida,
      coalesce(auth.jwt() ->> 'aal', 'aal1') AS aal
  )
  SELECT jsonb_build_object(
    'superadmin', superadmin,
    'exigida', exigida AND superadmin,
    'aal', aal,
    'pendente', exigida AND superadmin AND aal <> 'aal2'
  ) FROM base
$$;

REVOKE ALL ON FUNCTION public.desk_mfa_situacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desk_mfa_situacao() TO authenticated, service_role;
