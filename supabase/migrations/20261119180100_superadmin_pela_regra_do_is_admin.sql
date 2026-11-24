-- ============================================================================
-- Superadmin pela mesma régua do is_admin() (D4 do ensaio real de 19/11/2026)
-- ============================================================================
-- O DEFEITO
-- A tela de Colaboradores muda só users.perfil; user_roles (tabela antiga, de
-- gravação dupla desde 08/05/2026) não acompanha. is_master_admin() e
-- desk_mfa_situacao() aceitavam `u.perfil = 'admin' OR ur.role = 'admin'`
-- (20261109140000). Quem era administradora e foi rebaixada pela tela ficava com
-- perfil 'gerente' e papel 'admin':
--   * is_admin() = false (não administra a própria empresa, não exporta: a
--     função htai-exportar decide por is_admin());
--   * is_master_admin() = true (continuava criando e enxergando as outras
--     empresas pela tela Empresas e pela função provision-tenant).
--
-- A CORREÇÃO
-- As duas funções passam a usar só `u.perfil = 'admin'`, a mesma régua de
-- is_admin(), has_permissao(), das políticas, da exportação e da trava de
-- autopromoção. O resto do corpo é igual ao de 20261109140000 (gate canônico
-- get_user_tenant_id, que já exige conta ativa, e o segundo fator no escopo
-- instalação). Rebaixar pela tela passa a tirar a superadministração na hora.
--
-- OS DOIS BANCOS (SaaS da empresa e app instalado na conta do cliente)
-- No app instalado as duas funções chamam public.htai_licenca_escopo_instalacao()
-- para exigir segundo fator. No SaaS da empresa essa função não existe: lá
-- HTAI_ENTITLEMENTS_MODE está off, não há htai_licencas e o único objeto htai* é
-- htai_banco_novo() (conferido em 20/11/2026). Como o corpo de uma função escrita
-- em SQL é conferido no próprio CREATE, chamar a licença direto abortava a
-- migração inteira na produção. Por isso as duas versões são montadas dentro de
-- um DO e escolhidas por to_regprocedure:
--   * com a função de licença  -> corpo igual ao da instalação (segundo fator);
--   * sem ela (SaaS)           -> só a régua do perfil, sem segundo fator.
-- O D4 é o mesmo nos dois: quem foi rebaixado pela tela deixa de ser superadmin.
--
-- Alternativa avaliada e descartada: a tela limpar user_roles ao rebaixar. Ver
-- docs/MUDANCAS.md (19/11/2026). Em resumo: seriam duas gravações separadas feitas
-- pelo navegador, só valeria para a tela (SQL, funções e linhas já divergentes
-- continuariam erradas) e, sem nenhum papel 'admin' sobrando, a porta do primeiro
-- acesso poderia se reabrir.
--
-- NA PRODUÇÃO DA EMPRESA
-- Perde a superadministração só quem está com papel 'admin' e perfil diferente
-- de 'admin' na empresa principal. Conferir ANTES, só lendo:
--   select u.email from public.users u
--     join public.tenants t on t.id = u.tenant_id and t.is_master
--     join public.user_roles ur on ur.user_id = u.id
--    where ur.role = 'admin' and u.perfil <> 'admin';
-- Em 20/11/2026 essa consulta devolveu 0 linhas no EmpireDesk de produção.
-- Idempotente. Permissões das funções não mudam (CREATE OR REPLACE as mantém).
-- ============================================================================

DO $do$
DECLARE
  v_instalacao constant boolean :=
    to_regprocedure('public.htai_licenca_escopo_instalacao()') IS NOT NULL;
  v_gate text := '';
  v_exigida text := 'false';
BEGIN
  IF v_instalacao THEN
    v_gate := $q$
  AND (NOT public.htai_licenca_escopo_instalacao()
       OR coalesce(auth.jwt() ->> 'aal', '') = 'aal2')$q$;
    v_exigida := 'public.htai_licenca_escopo_instalacao()';
  END IF;

  EXECUTE format($sql$
    CREATE OR REPLACE FUNCTION public.is_master_admin()
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $fn$
      SELECT EXISTS (SELECT 1 FROM public.profiles p
        JOIN public.tenants t ON t.id = p.tenant_id AND t.is_master
        JOIN public.users u ON u.id = p.user_id AND u.tenant_id = p.tenant_id
        WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_user_tenant_id()
          AND u.perfil = 'admin')%s
    $fn$;
  $sql$, v_gate);

  EXECUTE format($sql$
    COMMENT ON FUNCTION public.is_master_admin() IS %L;
  $sql$,
  'Admin da empresa principal (superadmin): users.perfil = admin, a mesma régua de is_admin(). '
  || CASE WHEN v_instalacao
       THEN 'No app instalado (escopo instalação) exige sessão aal2 (segundo fator).'
       ELSE 'No SaaS da empresa, sem a licença HTAI, não há segundo fator a exigir.' END);

  EXECUTE format($sql$
    CREATE OR REPLACE FUNCTION public.desk_mfa_situacao()
    RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $fn$
      WITH base AS (
        SELECT EXISTS (SELECT 1 FROM public.profiles p
          JOIN public.tenants t ON t.id = p.tenant_id AND t.is_master
          JOIN public.users u ON u.id = p.user_id AND u.tenant_id = p.tenant_id
          WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_user_tenant_id()
            AND u.perfil = 'admin') AS superadmin,
          %s AS exigida,
          coalesce(auth.jwt() ->> 'aal', 'aal1') AS aal
      )
      SELECT jsonb_build_object(
        'superadmin', superadmin,
        'exigida', exigida AND superadmin,
        'aal', aal,
        'pendente', exigida AND superadmin AND aal <> 'aal2'
      ) FROM base
    $fn$;
  $sql$, v_exigida);

  -- CREATE OR REPLACE não mexe em ACL: sem repetir o fecho da 20261109140000, uma
  -- instalação nova pelo caminho do SaaS (onde aquela migração não roda, porque não há
  -- licença HTAI) ficava com o EXECUTE de fábrica para PUBLIC — na prática, anon
  -- podia chamar a RPC. Fica repetido aqui, e a 20261120140000 fecha instalação
  -- que já aplicou a versão anterior desta migração.
  EXECUTE 'REVOKE ALL ON FUNCTION public.desk_mfa_situacao() FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.desk_mfa_situacao() TO authenticated, service_role';

  RAISE NOTICE '180100: is_master_admin e desk_mfa_situacao refeitos (% da licença)',
    CASE WHEN v_instalacao THEN 'com o escopo de instalação' ELSE 'sem a licença HTAI, este é o SaaS' END;
END
$do$;

NOTIFY pgrst, 'reload schema';
