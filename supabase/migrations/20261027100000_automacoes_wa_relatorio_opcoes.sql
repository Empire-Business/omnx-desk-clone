-- ============================================================================
-- Automações WhatsApp — RELATÓRIO DIÁRIO: opções de organização (27/10/2026)
-- ============================================================================
-- Pedido da equipe (Sandro, autorizado pelo dono):
--   * relatorio_agrupar_estrategista: os pontos de atenção saem agrupados pelo
--     estrategista responsável pelo cliente (client_assignments tipo
--     'estrategista' e ativo; sem responsável → "Sem estrategista"). As reuniões
--     do dia continuam numa seção própria.
--   * relatorio_so_clientes_ativos: só entram ocorrências de clientes CADASTRADOS
--     e ATIVOS (clients.ativo = true). Contatos sem cadastro ficam fora e viram
--     uma linha de contagem ("+ N ocorrências de contatos sem cadastro ficaram fora").
--
-- Quem lê: wa-auto-relatorio-diario (envio) e wa-auto-backtest (prévia e painel),
-- via _shared/wa-relatorio-dados.ts (carregarOpcoesRelatorio). Antes desta
-- migration as funções seguem com o comportamento antigo (as duas desligadas).
--
-- Segurança: só colunas novas em wa_auto_config, que já tem RLS + isolamento por
-- empresa e escrita do front só para quem administra o app. Nada muda em policy
-- ou GRANT.
--
-- Idempotente (ADD COLUMN IF NOT EXISTS). NÃO APLICADA — aplicar só com aprovação.
-- Rollback:
--   ALTER TABLE public.wa_auto_config
--     DROP COLUMN IF EXISTS relatorio_agrupar_estrategista,
--     DROP COLUMN IF EXISTS relatorio_so_clientes_ativos;
-- ============================================================================

BEGIN;
-- Não fica esperando lock em tabela quente (falha rápido e pode repetir).
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.wa_auto_config
  ADD COLUMN IF NOT EXISTS relatorio_agrupar_estrategista BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS relatorio_so_clientes_ativos   BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.wa_auto_config.relatorio_agrupar_estrategista IS
  'Relatório diário: agrupa os pontos de atenção pelo estrategista do cliente (client_assignments estrategista ativo).';
COMMENT ON COLUMN public.wa_auto_config.relatorio_so_clientes_ativos IS
  'Relatório diário: só ocorrências de clientes cadastrados e ativos; contatos sem cadastro viram só contagem.';

COMMIT;

NOTIFY pgrst, 'reload schema';
