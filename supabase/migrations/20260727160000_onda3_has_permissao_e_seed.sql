-- Onda 3 — função de consulta + seed espelhando o gate atual.
-- Aplicada em produção em 27/07/2026 via Management API.

-- has_permissao('contratos','editar') -> boolean, para o usuário logado.
-- Admin passa sempre: é o fail-safe que impede um seed errado trancar o dono do tenant.
CREATE OR REPLACE FUNCTION public.has_permissao(p_recurso text, p_acao text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    COALESCE(
      (SELECT u.perfil FROM public.users u WHERE u.id = auth.uid()) = 'admin',
      false
    )
    OR EXISTS (
      SELECT 1
        FROM public.permissoes_app pa
       WHERE pa.tenant_id = (SELECT get_user_tenant_id())
         AND pa.perfil = (SELECT u.perfil FROM public.users u WHERE u.id = auth.uid())
         AND pa.recurso IN (p_recurso, '*')
         AND (pa.acao = p_acao OR pa.acao = 'admin')
    );
$$;

-- Seed por tenant, derivado de docs/reestruturacao/NIVEIS-DE-ACESSO.md.
-- Reproduz o comportamento de hoje — não é a oportunidade de mudar regra.
-- Verificado com 12 asserções (perfil x recurso): 12/12 iguais ao gate anterior.
INSERT INTO public.permissoes_app (tenant_id, perfil, recurso, acao)
SELECT t.id, v.perfil, v.recurso, v.acao
  FROM public.tenants t
 CROSS JOIN (VALUES
    ('admin',        '*',                     'admin'),
    ('gerente',      'dashboard',             'ver'),
    ('gerente',      'contratos',             'editar'),
    ('gerente',      'contratos.onboarding',  'editar'),
    ('gerente',      'chat',                  'editar'),
    ('gerente',      'clientes',              'editar'),
    ('gerente',      'colaboradores',         'ver'),
    ('gerente',      'cobranca',              'ver'),
    ('estrategista', 'dashboard',             'ver'),
    ('estrategista', 'clientes',              'editar'),
    ('estrategista', 'chat',                  'editar'),
    ('atendimento',  'dashboard',             'ver'),
    ('atendimento',  'clientes',              'ver'),
    ('atendimento',  'chat',                  'editar'),
    ('atendimento',  'contratos.onboarding',  'editar'),
    ('cliente',      'portal',                'ver'),
    ('admin_cobranca',  'cobranca',           'admin'),
    ('admin_cobranca',  'dashboard',          'ver'),
    ('agente_cobranca', 'cobranca',           'editar'),
    ('agente_chat',     'chat',               'editar')
 ) AS v(perfil, recurso, acao)
ON CONFLICT (tenant_id, perfil, recurso, acao) DO NOTHING;

-- Tenant novo nasce com o mesmo seed.
CREATE OR REPLACE FUNCTION public.seed_permissoes_on_tenant_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.permissoes_app (tenant_id, perfil, recurso, acao)
  SELECT NEW.id, v.perfil, v.recurso, v.acao
    FROM (VALUES
      ('admin',        '*',                    'admin'),
      ('gerente',      'dashboard',            'ver'),
      ('gerente',      'contratos',            'editar'),
      ('gerente',      'contratos.onboarding', 'editar'),
      ('gerente',      'chat',                 'editar'),
      ('gerente',      'clientes',             'editar'),
      ('gerente',      'colaboradores',        'ver'),
      ('gerente',      'cobranca',             'ver'),
      ('estrategista', 'dashboard',            'ver'),
      ('estrategista', 'clientes',             'editar'),
      ('estrategista', 'chat',                 'editar'),
      ('atendimento',  'dashboard',            'ver'),
      ('atendimento',  'clientes',             'ver'),
      ('atendimento',  'chat',                 'editar'),
      ('atendimento',  'contratos.onboarding', 'editar'),
      ('cliente',      'portal',               'ver'),
      ('admin_cobranca',  'cobranca',          'admin'),
      ('admin_cobranca',  'dashboard',         'ver'),
      ('agente_cobranca', 'cobranca',          'editar'),
      ('agente_chat',     'chat',              'editar')
    ) AS v(perfil, recurso, acao)
  ON CONFLICT (tenant_id, perfil, recurso, acao) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_permissoes_on_tenant_insert ON public.tenants;
CREATE TRIGGER seed_permissoes_on_tenant_insert
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_permissoes_on_tenant_insert();
