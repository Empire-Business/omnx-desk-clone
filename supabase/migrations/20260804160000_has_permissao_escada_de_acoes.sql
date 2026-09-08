-- ============================================================================
-- has_permissao() passa a respeitar a escada admin ⊃ editar ⊃ ver
-- ============================================================================
-- O front (`usePermissoes.can`, constante COBERTURA) sempre tratou 'editar'
-- como suficiente para 'ver'. A função no banco comparava a ação exata, então
-- os dois discordavam — e ninguém percebeu porque, até hoje, nenhuma policy
-- chamava has_permissao(): o gate vivia só no front.
--
-- O app Atendimento é o primeiro a usar a função na RLS, e aí a divergência
-- vira bug de verdade: a matriz de /admin (`useDefinirPermissao`) grava UMA
-- linha por par (perfil, recurso), então marcar "editar" para atendimento
-- apagaria a linha "ver" e derrubaria o SELECT — o usuário perderia acesso ao
-- app ao ganhar permissão de editar nele.
--
-- Seguro: verificado em 04/08/2026 que as únicas policies que chamam
-- has_permissao() são as do Atendimento, criadas na mesma leva. Nenhum acesso
-- existente muda; a função só passa a conceder o que a escada já concedia.
--
-- Aplicada em produção em 04/08/2026 via Management API.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_permissao(p_recurso text, p_acao text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $fn$
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
         AND pa.acao IN (
           SELECT unnest(
             CASE p_acao
               WHEN 'ver'    THEN ARRAY['ver','editar','admin']
               WHEN 'editar' THEN ARRAY['editar','admin']
               WHEN 'admin'  THEN ARRAY['admin']
               ELSE ARRAY[p_acao]
             END
           )
         )
    );
$fn$;

-- Com a escada valendo, a linha 'ver' de atendimento (semeada na migration
-- anterior como contorno) vira redundante e só atrapalharia a matriz de /admin,
-- que espera um registro por par.
DELETE FROM public.permissoes_app
 WHERE recurso = 'atendimento' AND acao = 'ver';

-- O seed de tenant novo também deixa de duplicar.
CREATE OR REPLACE FUNCTION public.seed_permissoes_on_tenant_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $fn$
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
      ('gerente',      'atendimento',          'editar'),
      ('estrategista', 'dashboard',            'ver'),
      ('estrategista', 'clientes',             'editar'),
      ('estrategista', 'chat',                 'editar'),
      ('estrategista', 'atendimento',          'editar'),
      ('atendimento',  'dashboard',            'ver'),
      ('atendimento',  'clientes',             'ver'),
      ('atendimento',  'chat',                 'editar'),
      ('atendimento',  'contratos.onboarding', 'editar'),
      ('atendimento',  'atendimento',          'editar'),
      ('cliente',      'portal',               'ver'),
      ('admin_cobranca',  'cobranca',          'admin'),
      ('admin_cobranca',  'dashboard',         'ver'),
      ('agente_cobranca', 'cobranca',          'editar'),
      ('agente_chat',     'chat',              'editar')
    ) AS v(perfil, recurso, acao)
  ON CONFLICT (tenant_id, perfil, recurso, acao) DO NOTHING;
  RETURN NEW;
END;
$fn$;

NOTIFY pgrst, 'reload schema';
