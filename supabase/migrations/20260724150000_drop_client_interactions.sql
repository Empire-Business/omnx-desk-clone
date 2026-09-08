-- ============================================================================
-- Fase 6 — Remoção do legado: feature Interações (client_interactions)
-- ============================================================================
-- A tela interna /interacoes (InteracoesPage) e o hook exclusivo useInteractions
-- foram removidos do frontend. A tabela client_interactions era usada APENAS por
-- esse hook (auditoria de dependências: 0 referências fora dele, 0 no Portal, 0 no
-- ClienteDetailPage), está com 0 linhas e não tem nenhuma FK externa apontando
-- para ela. Drop seguro.
--
-- Diferente de NPS/Entregas/Trilhas — cujas tabelas FICAM porque o Portal do
-- cliente as consome — Interações não tem nenhum consumidor vivo.
-- ============================================================================
SET search_path = public, pg_catalog;

DROP TABLE IF EXISTS public.client_interactions CASCADE;

NOTIFY pgrst, 'reload schema';
