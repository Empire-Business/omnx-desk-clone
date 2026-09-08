-- ============================================================================
-- Logs de console e de rede no reporte de erro
-- ============================================================================
-- Até agora o ticket trazia só metadados do ambiente (navegador, SO, rota). Quem
-- ia corrigir precisava pedir print e "o que apareceu no console?" por WhatsApp —
-- e a essa altura a pessoa já tinha recarregado a página, perdendo o rastro.
--
-- A captura acontece no cliente (`src/lib/reporte-buffers.ts`), instalada no
-- boot do app: o JavaScript não recupera o que já foi impresso no console, então
-- interceptor que começa depois do erro chega vazio.
--
-- Colunas separadas de `contexto` porque têm natureza diferente: contexto é um
-- objeto pequeno e estável; estes são listas que crescem e que a triagem quer
-- ler e filtrar em separado.
--
-- Privacidade: o cliente mascara token/senha/Authorization antes de enviar e
-- nunca grava corpo de requisição ou resposta — é onde trafegam dados do cliente.
--
-- Aplicada em produção em 04/08/2026 via Management API.
-- ============================================================================

ALTER TABLE public.reportes_erro
  -- [{ nivel, mensagem, em }] — ring buffer das últimas ~120 entradas
  ADD COLUMN IF NOT EXISTS console_logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{ metodo, url, status, duracao_ms, erro?, em }] — últimas ~40 requisições
  ADD COLUMN IF NOT EXISTS network_logs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.reportes_erro.console_logs IS
  'Ring buffer do console capturado desde o boot do app. Valores sensíveis são mascarados no cliente antes do envio.';

COMMENT ON COLUMN public.reportes_erro.network_logs IS
  'Últimas requisições (método, URL, status, duração). Nunca corpo de requisição ou resposta.';

NOTIFY pgrst, 'reload schema';
