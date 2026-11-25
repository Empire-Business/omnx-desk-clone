-- Fecha somente a chamada REST direta ao recálculo interno, sem mudar cálculo,
-- dados, triggers ou autorização das operações normais de contratos.
-- Evidência de catálogo em Desk seu-projeto-supabase, 2026-11-05:
-- calcular_comissoes_contrato(uuid) é SECURITY DEFINER, owner postgres,
-- ACL {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}.
-- Não valida ator/tenant e altera previstas por UUID recebido.
-- Único caller SQL: trg_calcular_comissoes(), SECURITY DEFINER owner postgres.
-- Busca local src/ e supabase/functions/ não encontrou consumidor RPC direto.
-- O owner e o grant explícito service_role permanecem intactos; a UI continua
-- atualizando contratos sob suas policies e o trigger executa como postgres.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.calcular_comissoes_contrato(uuid)
  FROM PUBLIC, anon, authenticated;
COMMIT;
