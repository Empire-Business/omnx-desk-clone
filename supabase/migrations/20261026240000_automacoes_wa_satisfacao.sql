-- ============================================================================
-- App Automações WhatsApp — análise diária de satisfação dos clientes
-- ============================================================================
-- Contexto: o alerta "Clientes insatisfeitos ou em risco" do relatório diário
-- dependia de chat_conversations.sentimento (quase sempre vazio) e de
-- chat_weekly_reports (parado desde 09/10/2026) — saía sempre zero. Agora a
-- função `wa-auto-satisfacao` lê, toda manhã, as conversas com movimento e grava
-- aqui o resultado; a coleta do relatório (_shared/wa-relatorio-dados.ts) lê a
-- última análise de cada conversa dos últimos 3 dias.
--
-- O que cria:
--   1) wa_auto_satisfacao — uma linha por análise (conversa × manhã). Só nível,
--      confiança, um MOTIVO curto parafraseado (≤ 240, nunca trecho da conversa —
--      validado na função), sinais de lista fixa e tendência. Sem texto de conversa.
--   2) Trigger que confere que conversa/contato/cliente são da MESMA empresa.
--   3) RLS: isolamento RESTRICTIVE por empresa + leitura só com
--      has_permissao('automacoes-wa','admin'). Hoje o front NÃO lê esta tabela
--      direto (o relatório é montado no servidor), então o SELECT de
--      authenticated nem é concedido; a policy fica como segunda trava. Ninguém
--      logado escreve: só o servidor (service_role, com tenant_id explícito).
--   4) Agendador 'wa-auto-satisfacao-diaria': a cada 15 min das 06:00 às 07:45 de
--      Brasília (10:00–11:45 UTC). A função é incremental — a 1ª execução faz o
--      grosso e as seguintes só pegam o que faltou (orçamento de 150 s por chamada).
--      Mesmo padrão de autenticação dos outros jobs wa-auto-*: o segredo
--      `wa_auto_cron_secret` é lido do Vault NA HORA (não fica em cron.job) e vai no
--      header x-cron-secret (conferido pela RPC wa_auto_cron_secret_confere).
--      Só chama a função se alguma empresa tem o relatório diário ligado E a regra
--      de insatisfeitos ativa.
--   5) Retenção de 90 dias (job próprio, todo dia às 04:23 BRT).
--
-- Depende de: 20261026120000 (wa_auto_*), 20261026160000 (segredo + RPC do cron).
-- Publique a função `wa-auto-satisfacao` (verify_jwt = false) ANTES ou junto.
--
-- Idempotente (IF NOT EXISTS / DROP ... IF EXISTS / jobs recriados pelo nome).
-- Sem regex com contador (tamanhos com length()).
--
-- Reversão (manual):
--   SELECT cron.unschedule('wa-auto-satisfacao-diaria');
--   SELECT cron.unschedule('wa-auto-satisfacao-retencao-90d');
--   DROP TABLE IF EXISTS public.wa_auto_satisfacao;
--   DROP FUNCTION IF EXISTS public.wa_auto_satisfacao_confere();
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Tabela
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_auto_satisfacao (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id        UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  contact_id       UUID NULL REFERENCES public.chat_contacts(id) ON DELETE SET NULL,
  conversation_id  UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  nivel            TEXT NOT NULL,
  confianca        NUMERIC(3,2) NOT NULL,
  motivo           TEXT NOT NULL,
  sinais           TEXT[] NOT NULL DEFAULT '{}'::text[],
  tendencia        TEXT NULL,
  analisado_ate    TIMESTAMPTZ NOT NULL,
  modelo           TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wa_auto_satisfacao DROP CONSTRAINT IF EXISTS wa_auto_satisfacao_nivel_check;
ALTER TABLE public.wa_auto_satisfacao
  ADD CONSTRAINT wa_auto_satisfacao_nivel_check
  CHECK (nivel IN ('satisfeito', 'neutro', 'atencao', 'insatisfeito'));

ALTER TABLE public.wa_auto_satisfacao DROP CONSTRAINT IF EXISTS wa_auto_satisfacao_confianca_check;
ALTER TABLE public.wa_auto_satisfacao
  ADD CONSTRAINT wa_auto_satisfacao_confianca_check
  CHECK (confianca >= 0 AND confianca <= 1);

ALTER TABLE public.wa_auto_satisfacao DROP CONSTRAINT IF EXISTS wa_auto_satisfacao_motivo_check;
ALTER TABLE public.wa_auto_satisfacao
  ADD CONSTRAINT wa_auto_satisfacao_motivo_check
  CHECK (length(btrim(motivo)) >= 1 AND length(motivo) <= 240);

-- Sinais só da lista fixa, sem nulo, no máximo 9 (o tamanho da lista).
ALTER TABLE public.wa_auto_satisfacao DROP CONSTRAINT IF EXISTS wa_auto_satisfacao_sinais_check;
ALTER TABLE public.wa_auto_satisfacao
  ADD CONSTRAINT wa_auto_satisfacao_sinais_check
  CHECK (
    cardinality(sinais) <= 9
    AND array_position(sinais, NULL) IS NULL
    AND sinais <@ ARRAY[
      'cancelamento', 'reclamacao', 'atraso', 'cobranca', 'demora_resposta',
      'insatisfacao_resultado', 'comparacao_concorrente', 'elogio', 'outro'
    ]::text[]
  );

ALTER TABLE public.wa_auto_satisfacao DROP CONSTRAINT IF EXISTS wa_auto_satisfacao_tendencia_check;
ALTER TABLE public.wa_auto_satisfacao
  ADD CONSTRAINT wa_auto_satisfacao_tendencia_check
  CHECK (tendencia IS NULL OR tendencia IN ('piorando', 'estavel', 'melhorando'));

ALTER TABLE public.wa_auto_satisfacao DROP CONSTRAINT IF EXISTS wa_auto_satisfacao_modelo_check;
ALTER TABLE public.wa_auto_satisfacao
  ADD CONSTRAINT wa_auto_satisfacao_modelo_check
  CHECK (length(modelo) BETWEEN 1 AND 80);

COMMENT ON TABLE public.wa_auto_satisfacao IS
  'Análise diária de satisfação por conversa (app Automações WhatsApp): nível, confiança, motivo curto parafraseado pela IA (sem trecho da conversa), sinais de lista fixa e tendência. Escrita só pelo servidor (wa-auto-satisfacao). Retenção 90 dias.';
COMMENT ON COLUMN public.wa_auto_satisfacao.analisado_ate IS
  'Data da última mensagem considerada na análise. A próxima só acontece se houver mensagem depois disto.';

-- Última análise de cada conversa (incremental) e leitura do relatório por empresa.
CREATE INDEX IF NOT EXISTS idx_wa_auto_satisfacao_conversa
  ON public.wa_auto_satisfacao (tenant_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_auto_satisfacao_tenant_data
  ON public.wa_auto_satisfacao (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2) Conversa/contato/cliente precisam ser da MESMA empresa da linha
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_auto_satisfacao_confere()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não identificada.' USING ERRCODE = 'check_violation';
  END IF;
  -- Usuário logado só grava na própria empresa: recusa já aqui (antes do RLS), com
  -- resposta genérica, para não revelar se um id existe em outra empresa.
  IF auth.uid() IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM public.get_user_tenant_id() THEN
    RAISE EXCEPTION 'Registro não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_conversations c WHERE c.id = NEW.conversation_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Conversa não encontrada nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.chat_contacts ct WHERE ct.id = NEW.contact_id AND ct.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Contato não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients cl WHERE cl.id = NEW.client_id AND cl.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.wa_auto_satisfacao_confere() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wa_auto_satisfacao_confere ON public.wa_auto_satisfacao;
CREATE TRIGGER wa_auto_satisfacao_confere
  BEFORE INSERT ON public.wa_auto_satisfacao
  FOR EACH ROW EXECUTE FUNCTION public.wa_auto_satisfacao_confere();

-- ---------------------------------------------------------------------------
-- 3) RLS e privilégios
-- ---------------------------------------------------------------------------
ALTER TABLE public.wa_auto_satisfacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_auto_satisfacao_tenant_isolation ON public.wa_auto_satisfacao;
CREATE POLICY wa_auto_satisfacao_tenant_isolation ON public.wa_auto_satisfacao
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = (SELECT get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT get_user_tenant_id()));

DROP POLICY IF EXISTS wa_auto_satisfacao_select ON public.wa_auto_satisfacao;
CREATE POLICY wa_auto_satisfacao_select ON public.wa_auto_satisfacao
  FOR SELECT TO authenticated
  USING ((SELECT public.has_permissao('automacoes-wa', 'admin')));

-- Front: nada (nenhuma tela lê esta tabela direto; se um dia ler, conceda SELECT
-- a authenticated — a policy acima já limita a admin do app). Servidor: só lê e
-- insere (sem UPDATE/DELETE/TRUNCATE; a retenção roda no pg_cron como dono).
REVOKE ALL ON public.wa_auto_satisfacao FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.wa_auto_satisfacao TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Agendador: a cada 15 min das 06:00 às 07:45 BRT (09:00–10:45 UTC), antes do relatório das 08:00
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-auto-satisfacao-diaria') THEN
    PERFORM cron.unschedule('wa-auto-satisfacao-diaria');
  END IF;
END
$do$;

SELECT cron.schedule(
  'wa-auto-satisfacao-diaria',
  '*/15 9-10 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://wuzmckatbmlpkdxtfhqr.supabase.co/functions/v1/wa-auto-satisfacao',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', s.decrypted_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  FROM vault.decrypted_secrets s
  WHERE s.name = 'wa_auto_cron_secret'
    AND EXISTS (
      SELECT 1
        FROM public.wa_auto_config c
        JOIN public.wa_auto_regras_anomalia r
          ON r.tenant_id = c.tenant_id
         AND r.tipo = 'sentimento_negativo'
         AND r.ativo
       WHERE c.relatorio_ativo
    );
  $cron$
);

-- ---------------------------------------------------------------------------
-- 5) Retenção de 90 dias — todo dia às 04:23 BRT (07:23 UTC)
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-auto-satisfacao-retencao-90d') THEN
    PERFORM cron.unschedule('wa-auto-satisfacao-retencao-90d');
  END IF;
END
$do$;

SELECT cron.schedule(
  'wa-auto-satisfacao-retencao-90d',
  '23 7 * * *',
  $cron$ DELETE FROM public.wa_auto_satisfacao WHERE created_at < now() - interval '90 days'; $cron$
);

COMMIT;

NOTIFY pgrst, 'reload schema';
