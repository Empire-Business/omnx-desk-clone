-- ============================================================================
-- Multi-tenant — fix: unique do kanban de contratos vira POR TENANT
-- ============================================================================
-- O índice idx_kanban_colunas_status_chave era UNIQUE global em upper(status_chave)
-- — impedia duas empresas de terem a mesma coluna (ex.: "Ativo"). Passa a ser
-- único por (tenant_id, upper(status_chave)). Necessário pro seed_tenant funcionar.
--
-- NOTA (Fase C): outros UNIQUE globais em tabelas de negócio podem precisar do
-- mesmo tratamento quando entrar a 2ª empresa — auditar antes de escalar.
-- ============================================================================
SET search_path = public, pg_catalog;

DROP INDEX IF EXISTS public.idx_kanban_colunas_status_chave;
CREATE UNIQUE INDEX idx_kanban_colunas_status_chave
  ON public.contratos_kanban_colunas (tenant_id, upper(status_chave));
