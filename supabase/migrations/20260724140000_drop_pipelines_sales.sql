-- ============================================================================
-- Fase 6 — Remoção do legado: domínio Pipelines / Oportunidades de venda
-- ============================================================================
-- Decisão do usuário (24/07/2026): a feature de Pipelines/Oportunidades sai do
-- produto por completo — a tela standalone /pipelines, o painel de oportunidades
-- no detalhe do cliente (ClienteOportunidades) e o hook useSalesPipelines já foram
-- removidos do frontend. Aqui caem as tabelas.
--
-- Auditoria pré-remoção:
--   • Nenhuma FK externa apontava para sales_* (só relações internas do domínio).
--   • Nenhuma função/RPC do schema referencia sales_*.
--   • Dump dos dados (168 oportunidades + relacionadas) salvo fora do banco antes
--     do drop. PITR do Supabase cobre recuperação por janela de tempo.
--
-- IRREVERSÍVEL (destrói dados). CASCADE remove policies/índices/triggers e as FKs
-- internas do domínio.
-- ============================================================================
SET search_path = public, pg_catalog;

DROP TABLE IF EXISTS public.sales_opportunity_checklist    CASCADE;
DROP TABLE IF EXISTS public.sales_opportunity_events       CASCADE;
DROP TABLE IF EXISTS public.sales_opportunities            CASCADE;
DROP TABLE IF EXISTS public.sales_stage_checklist_items    CASCADE;
DROP TABLE IF EXISTS public.sales_stages                   CASCADE;
DROP TABLE IF EXISTS public.sales_pipelines                CASCADE;

NOTIFY pgrst, 'reload schema';
