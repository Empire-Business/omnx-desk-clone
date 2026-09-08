-- ============================================================================
-- Multi-tenant — fechar furos achados na bateria de testes (23/07/2026)
-- ============================================================================
-- Achados via teste de isolamento + advisors de segurança:
--   1. reportes_erro (tabela nova) tinha tenant_id + trigger mas SEM a policy de
--      isolamento → adiciona tenant_isolation.
--   2. Tabelas de backup/dedup estavam com RLS DESLIGADO no schema public →
--      expostas via API. Liga RLS (sem policy = deny-all p/ anon/authenticated;
--      service_role segue acessando) e revoga grants de tabela.
--   3. Funções de trigger (tg_set_tenant_id, handle_new_user) e helper
--      (resolve_tenant_default) estavam executáveis via RPC por PUBLIC → revoga.
--      Trigger dispara pelo mecanismo de trigger (não exige EXECUTE do chamador),
--      então revogar NÃO quebra insert/signup (verificado por teste).
--
-- Idempotente. Não destrutivo (só liga RLS e revoga privilégios excedentes).
-- ============================================================================
SET search_path = public, pg_catalog;

-- 1. reportes_erro isolado por tenant
DROP POLICY IF EXISTS tenant_isolation ON public.reportes_erro;
CREATE POLICY tenant_isolation ON public.reportes_erro
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

-- 2. Trancar backups/dedup (RLS deny-all + sem grant de tabela)
DO $$
DECLARE t text;
  backups text[] := ARRAY[
    'contratos_backup_20260602','contratos_backup_20260630',
    'comissoes_backup_20260602','comissoes_backup_20260630','comissoes_backup_20260706',
    'contratos_dedup_removidos_20260602'
  ];
BEGIN
  FOREACH t IN ARRAY backups LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- 3. Tirar funções internas de trigger/helper da superfície RPC pública
REVOKE EXECUTE ON FUNCTION public.tg_set_tenant_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_tenant_default() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
