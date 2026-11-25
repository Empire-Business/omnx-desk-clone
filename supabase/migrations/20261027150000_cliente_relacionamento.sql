-- ============================================================================
-- Relacionamento POR CLIENTE, com memória (fase F5 do plano "Íris e satisfação
-- dos clientes: histórico de conversas", 27/10/2026)
-- ============================================================================
-- Problema: wa-auto-satisfacao analisava por CONVERSA, 14 dias, sem memória, e
-- misturava a demora da equipe com o humor do cliente (76 de 77 "atenção/
-- insatisfeito" tinham o sinal demora_resposta). Agora a análise é por CLIENTE
-- (todas as conversas dele, de todas as instâncias — cliente_timeline, F3),
-- incremental e com memória (resumo, pendências, eventos).
--
-- O que esta migration faz:
--   1) public.cliente_relacionamento — 1 linha por (tenant_id, client_id): estado
--      ATUAL do relacionamento. resumo ≤ 1200 (parafraseado, validado na função),
--      motivo curto ≤ 240 (para o relatório), satisfacao (só pelo que o cliente
--      demonstra), confianca, sinais_cliente (lista fixa), tendencia, pendencias
--      (≤ 5), eventos (≤ 10), metricas (determinísticas, sem IA), risco + motivos
--      (REGRA, sem IA), cobertura, analisado_ate, modelo, versao_prompt, tokens e
--      custo da última análise pela IA, e o controle de execução (dia_processado,
--      reivindicado_em) — ninguém é analisado 2× no mesmo dia.
--   2) public.cliente_relacionamento_hist — só acrescenta: uma "foto" a cada
--      mudança de satisfação, risco ou pendências (evolução no tempo).
--   3) Conferência no banco (cliente da mesma empresa, chave imutável).
--   4) RLS: RESTRICTIVE por empresa + leitura para quem pode ver o cliente
--      (user_can_access_client: admin/gerente/atendimento veem todos; estrategista
--      só a carteira) ou admin/gerente (pode_ver_restrito). Escrita SÓ pelo
--      servidor (service_role). O histórico não tem UPDATE/DELETE nem para o
--      servidor (a retenção roda no pg_cron, como dono).
--   5) RPC cliente_relacionamento_reivindicar (só service_role): cria a linha de
--      quem ainda não tem (sem_dados) e reivindica, com FOR UPDATE SKIP LOCKED,
--      até N clientes ainda não processados no dia (reivindicação expira em 10 min).
--   5b) Relatório diário — "Grupos ativos sem cliente vinculado" (pedido do dono):
--      * wa_auto_alertas_ignorados aceita o tipo novo 'grupo_sem_cliente' (o
--        gestor silencia / ignora o grupo no painel, pelo contato);
--      * RPC wa_auto_grupos_sem_cliente (só service_role): grupos com mensagem
--        nos últimos N dias sem cliente (nem confirmado em cliente_canais, nem
--        vínculo no Chat) e que não são da equipe; um por grupo (todas as
--        instâncias), com a sugestão pendente de maior nota.
--   6) Agendador 'wa-relacionamento-analisar-diario': a cada 15 min das 06:00 às
--      07:45 de Brasília (09:00–10:45 UTC), mesmo esquema da satisfação antiga
--      (segredo do Vault lido NA HORA, header x-cron-secret conferido pela RPC
--      wa_auto_cron_secret_confere). E DESAGENDA o antigo
--      'wa-auto-satisfacao-diaria' (a tabela wa_auto_satisfacao continua, só
--      leitura/fallback, com a retenção de 90 dias dela).
--   7) Retenção do histórico: 180 dias (job diário às 04:29 BRT).
--   8) public.cliente_relacionamento_uso: uso das PRÉVIAS (dry_run) por empresa e
--      dia — quantidade, chamadas à IA e custo — com a reserva ATÔMICA da prévia
--      (RPC cliente_relacionamento_previa_reservar: intervalo mínimo e teto por dia)
--      e o registro do custo (cliente_relacionamento_uso_registrar). O custo das
--      prévias entra no teto de custo diário da análise. Só service_role.
--
-- Depende de: 20261026160000 (segredo + RPC do cron), 20261026230000
-- (wa_auto_alertas_ignorados), 20261026240000 (wa_auto_satisfacao / job antigo),
-- 20261026260000 (chat_grupos_restritos), 20261027090000 (wa_agente_grupos),
-- 20261027110000 (cliente_canais, private.canal_*),
-- 20261027140000 (cliente_timeline — usada pela função, não por esta migration).
-- Publique a função `wa-relacionamento-analisar` (verify_jwt = false) ANTES ou junto.
--
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS; jobs
-- removidos e recriados pelo nome). Sem regex com contador (tamanhos com length()).
--
-- Reversão (manual):
--   SELECT cron.unschedule('wa-relacionamento-analisar-diario');
--   SELECT cron.unschedule('wa-relacionamento-hist-retencao-180d');
--   DROP FUNCTION IF EXISTS public.cliente_relacionamento_previa_reservar(uuid, date, integer, integer),
--     public.cliente_relacionamento_uso_registrar(uuid, date, integer, numeric);
--   DROP TABLE IF EXISTS public.cliente_relacionamento_uso;
--   -- religar a análise antiga (mesmo comando da migration 20261026240000):
--   SELECT cron.schedule('wa-auto-satisfacao-diaria', '*/15 9-10 * * *', $cron$
--     SELECT net.http_post(
--       url := 'https://seu-projeto-supabase.supabase.co/functions/v1/wa-auto-satisfacao',
--       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s.decrypted_secret),
--       body := '{}'::jsonb, timeout_milliseconds := 150000)
--     FROM vault.decrypted_secrets s
--     WHERE s.name = 'wa_auto_cron_secret'
--       AND EXISTS (SELECT 1 FROM public.wa_auto_config c
--                     JOIN public.wa_auto_regras_anomalia r
--                       ON r.tenant_id = c.tenant_id AND r.tipo = 'sentimento_negativo' AND r.ativo
--                    WHERE c.relatorio_ativo);
--   $cron$);
--   DROP FUNCTION IF EXISTS public.cliente_relacionamento_reivindicar(uuid, uuid[], date, integer);
--   DROP FUNCTION IF EXISTS public.wa_auto_grupos_sem_cliente(uuid, integer, timestamptz, integer);
--   DELETE FROM public.wa_auto_alertas_ignorados WHERE tipo = 'grupo_sem_cliente';
--   ALTER TABLE public.wa_auto_alertas_ignorados DROP CONSTRAINT IF EXISTS wa_auto_alertas_ignorados_tipo_check;
--   ALTER TABLE public.wa_auto_alertas_ignorados ADD CONSTRAINT wa_auto_alertas_ignorados_tipo_check
--     CHECK (tipo IN ('sem_resposta', 'sentimento_negativo', 'pendencia', 'queda_volume', 'todos'));
--   DROP TABLE IF EXISTS public.cliente_relacionamento_hist, public.cliente_relacionamento;
--   DROP FUNCTION IF EXISTS public.cliente_relacionamento_confere();
--   (o relatório volta sozinho para wa_auto_satisfacao quando a tabela não existe.)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Estado atual: 1 linha por cliente
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cliente_relacionamento (
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  resumo           TEXT NOT NULL DEFAULT '',
  motivo           TEXT NULL,
  satisfacao       TEXT NOT NULL DEFAULT 'sem_dados',
  confianca        NUMERIC(3,2) NOT NULL DEFAULT 0,
  sinais_cliente   TEXT[] NOT NULL DEFAULT '{}'::text[],
  tendencia        TEXT NULL,
  pendencias       JSONB NOT NULL DEFAULT '[]'::jsonb,
  eventos          JSONB NOT NULL DEFAULT '[]'::jsonb,
  metricas         JSONB NOT NULL DEFAULT '{}'::jsonb,
  risco            TEXT NOT NULL DEFAULT 'baixo',
  risco_motivos    TEXT[] NOT NULL DEFAULT '{}'::text[],
  cobertura        JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Até onde a IA leu (criado_em da última mensagem considerada). NULL = nunca.
  analisado_ate    TIMESTAMPTZ NULL,
  -- Quando a IA analisou pela última vez (também soma o custo do dia).
  analisado_em     TIMESTAMPTZ NULL,
  modelo           TEXT NULL,
  versao_prompt    TEXT NULL,
  tokens_entrada   INTEGER NULL,
  tokens_saida     INTEGER NULL,
  custo_usd        NUMERIC(10,6) NULL,
  -- Quando métricas e risco foram recalculados (todo dia, com ou sem IA).
  processado_em    TIMESTAMPTZ NULL,
  -- Dia (Brasília) já processado: a função não repete o cliente no mesmo dia.
  dia_processado   DATE NULL,
  -- Reivindicação da execução em andamento (expira em 10 min).
  reivindicado_em  TIMESTAMPTZ NULL,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_id)
);

DO $do$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('cliente_relacionamento_resumo_check',
       'length(resumo) <= 1200'),
      ('cliente_relacionamento_motivo_check',
       'motivo IS NULL OR (length(btrim(motivo)) >= 1 AND length(motivo) <= 240)'),
      ('cliente_relacionamento_satisfacao_check',
       $c$satisfacao IN ('satisfeito', 'neutro', 'atencao', 'insatisfeito', 'sem_dados')$c$),
      ('cliente_relacionamento_confianca_check',
       'confianca >= 0 AND confianca <= 1'),
      ('cliente_relacionamento_sinais_check',
       $c$cardinality(sinais_cliente) <= 8 AND array_position(sinais_cliente, NULL) IS NULL
          AND sinais_cliente <@ ARRAY['reclamacao', 'cobra_prazo', 'insatisfacao_resultado', 'cancelamento',
                                      'cobranca_atrito', 'comparacao_concorrente', 'elogio', 'engajado']::text[]$c$),
      ('cliente_relacionamento_tendencia_check',
       $c$tendencia IS NULL OR tendencia IN ('piorando', 'estavel', 'melhorando')$c$),
      ('cliente_relacionamento_pendencias_check',
       $c$jsonb_typeof(pendencias) = 'array' AND jsonb_array_length(pendencias) <= 5 AND length(pendencias::text) <= 2000$c$),
      ('cliente_relacionamento_eventos_check',
       $c$jsonb_typeof(eventos) = 'array' AND jsonb_array_length(eventos) <= 10 AND length(eventos::text) <= 3000$c$),
      ('cliente_relacionamento_metricas_check',
       $c$jsonb_typeof(metricas) = 'object' AND length(metricas::text) <= 1500$c$),
      ('cliente_relacionamento_cobertura_check',
       $c$jsonb_typeof(cobertura) = 'object' AND length(cobertura::text) <= 1500$c$),
      ('cliente_relacionamento_risco_check',
       $c$risco IN ('alto', 'medio', 'baixo')$c$),
      ('cliente_relacionamento_risco_motivos_check',
       $c$cardinality(risco_motivos) <= 6 AND array_position(risco_motivos, NULL) IS NULL
          AND risco_motivos <@ ARRAY['insatisfeito', 'cancelamento', 'atencao', 'pendencia_velha',
                                     'silencio', 'queda_volume']::text[]$c$),
      ('cliente_relacionamento_modelo_check',
       'modelo IS NULL OR length(modelo) BETWEEN 1 AND 80'),
      ('cliente_relacionamento_versao_check',
       'versao_prompt IS NULL OR length(versao_prompt) BETWEEN 1 AND 40'),
      ('cliente_relacionamento_tokens_check',
       '(tokens_entrada IS NULL OR tokens_entrada >= 0) AND (tokens_saida IS NULL OR tokens_saida >= 0) AND (custo_usd IS NULL OR custo_usd >= 0)')
    ) AS t(nome, expr)
  LOOP
    EXECUTE format('ALTER TABLE public.cliente_relacionamento DROP CONSTRAINT IF EXISTS %I', c.nome);
    EXECUTE format('ALTER TABLE public.cliente_relacionamento ADD CONSTRAINT %I CHECK (%s)', c.nome, c.expr);
  END LOOP;
END
$do$;

COMMENT ON TABLE public.cliente_relacionamento IS
  'Relacionamento por cliente (1 linha por cliente): memória (resumo, pendências, eventos) e satisfação escritas pela IA a partir da linha do tempo do cliente, métricas determinísticas e risco calculado por regra. Escrita só pelo servidor (wa-relacionamento-analisar). Lida pelo relatório diário e pela Íris.';
COMMENT ON COLUMN public.cliente_relacionamento.satisfacao IS
  'Só pelo que o CLIENTE demonstra. Demora da equipe não conta (é métrica / alerta "sem resposta").';
COMMENT ON COLUMN public.cliente_relacionamento.risco IS
  'Regra sem IA: alto = insatisfeito (conf ≥ 0,6) ou cancelamento; médio = atenção (conf ≥ 0,7), pendência aberta > 5 dias úteis, silêncio ≥ 21 dias com contrato vigente ou queda > 60% no mês; baixo = resto. Motivos em risco_motivos.';
COMMENT ON COLUMN public.cliente_relacionamento.analisado_ate IS
  'criado_em da última mensagem lida pela IA. A próxima análise só lê o que veio depois (+ 20 de contexto).';

CREATE INDEX IF NOT EXISTS idx_cliente_relacionamento_risco
  ON public.cliente_relacionamento (tenant_id, risco, processado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cliente_relacionamento_analise
  ON public.cliente_relacionamento (tenant_id, analisado_em DESC);

-- ---------------------------------------------------------------------------
-- 2) Histórico (só acrescenta)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cliente_relacionamento_hist (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  satisfacao       TEXT NOT NULL,
  confianca        NUMERIC(3,2) NOT NULL,
  risco            TEXT NOT NULL,
  risco_motivos    TEXT[] NOT NULL DEFAULT '{}'::text[],
  tendencia        TEXT NULL,
  sinais_cliente   TEXT[] NOT NULL DEFAULT '{}'::text[],
  pendencias       JSONB NOT NULL DEFAULT '[]'::jsonb,
  motivo           TEXT NULL,
  resumo           TEXT NOT NULL DEFAULT '',
  metricas         JSONB NOT NULL DEFAULT '{}'::jsonb,
  analisado_ate    TIMESTAMPTZ NULL,
  modelo           TEXT NULL,
  versao_prompt    TEXT NULL,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $do$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('cliente_relacionamento_hist_satisfacao_check',
       $c$satisfacao IN ('satisfeito', 'neutro', 'atencao', 'insatisfeito', 'sem_dados')$c$),
      ('cliente_relacionamento_hist_confianca_check', 'confianca >= 0 AND confianca <= 1'),
      ('cliente_relacionamento_hist_risco_check', $c$risco IN ('alto', 'medio', 'baixo')$c$),
      ('cliente_relacionamento_hist_risco_motivos_check',
       $c$cardinality(risco_motivos) <= 6 AND array_position(risco_motivos, NULL) IS NULL
          AND risco_motivos <@ ARRAY['insatisfeito', 'cancelamento', 'atencao', 'pendencia_velha',
                                     'silencio', 'queda_volume']::text[]$c$),
      ('cliente_relacionamento_hist_tendencia_check',
       $c$tendencia IS NULL OR tendencia IN ('piorando', 'estavel', 'melhorando')$c$),
      ('cliente_relacionamento_hist_sinais_check',
       $c$cardinality(sinais_cliente) <= 8 AND array_position(sinais_cliente, NULL) IS NULL
          AND sinais_cliente <@ ARRAY['reclamacao', 'cobra_prazo', 'insatisfacao_resultado', 'cancelamento',
                                      'cobranca_atrito', 'comparacao_concorrente', 'elogio', 'engajado']::text[]$c$),
      ('cliente_relacionamento_hist_pendencias_check',
       $c$jsonb_typeof(pendencias) = 'array' AND jsonb_array_length(pendencias) <= 5 AND length(pendencias::text) <= 2000$c$),
      ('cliente_relacionamento_hist_motivo_check',
       'motivo IS NULL OR (length(btrim(motivo)) >= 1 AND length(motivo) <= 240)'),
      ('cliente_relacionamento_hist_resumo_check', 'length(resumo) <= 1200'),
      ('cliente_relacionamento_hist_metricas_check',
       $c$jsonb_typeof(metricas) = 'object' AND length(metricas::text) <= 1500$c$),
      ('cliente_relacionamento_hist_modelo_check',
       'modelo IS NULL OR length(modelo) BETWEEN 1 AND 80'),
      ('cliente_relacionamento_hist_versao_check',
       'versao_prompt IS NULL OR length(versao_prompt) BETWEEN 1 AND 40')
    ) AS t(nome, expr)
  LOOP
    EXECUTE format('ALTER TABLE public.cliente_relacionamento_hist DROP CONSTRAINT IF EXISTS %I', c.nome);
    EXECUTE format('ALTER TABLE public.cliente_relacionamento_hist ADD CONSTRAINT %I CHECK (%s)', c.nome, c.expr);
  END LOOP;
END
$do$;

COMMENT ON TABLE public.cliente_relacionamento_hist IS
  'Evolução do relacionamento por cliente: uma foto a cada mudança de satisfação, risco ou pendências. Só acrescenta (sem UPDATE/DELETE). Retenção de 180 dias.';

CREATE INDEX IF NOT EXISTS idx_cliente_relacionamento_hist_cliente
  ON public.cliente_relacionamento_hist (tenant_id, client_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cliente_relacionamento_hist_data
  ON public.cliente_relacionamento_hist (criado_em);

-- ---------------------------------------------------------------------------
-- 3) Conferência: empresa, cliente da mesma empresa, chave imutável
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cliente_relacionamento_confere()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.client_id IS NULL THEN
    RAISE EXCEPTION 'Empresa ou cliente não identificado.' USING ERRCODE = 'check_violation';
  END IF;
  -- Usuário logado nunca grava aqui (sem GRANT); mesmo assim, recusa outra empresa.
  IF auth.uid() IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM public.get_user_tenant_id() THEN
    RAISE EXCEPTION 'Registro não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      RAISE EXCEPTION 'Empresa e cliente não mudam.' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_TABLE_NAME = 'cliente_relacionamento' THEN
      NEW.criado_em := OLD.criado_em;
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.clients cl WHERE cl.id = NEW.client_id AND cl.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'Cliente não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.criado_em := now();
  END IF;
  IF TG_TABLE_NAME = 'cliente_relacionamento' THEN
    NEW.atualizado_em := now();
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.cliente_relacionamento_confere() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cliente_relacionamento_confere ON public.cliente_relacionamento;
CREATE TRIGGER cliente_relacionamento_confere
  BEFORE INSERT OR UPDATE ON public.cliente_relacionamento
  FOR EACH ROW EXECUTE FUNCTION public.cliente_relacionamento_confere();

DROP TRIGGER IF EXISTS cliente_relacionamento_hist_confere ON public.cliente_relacionamento_hist;
CREATE TRIGGER cliente_relacionamento_hist_confere
  BEFORE INSERT ON public.cliente_relacionamento_hist
  FOR EACH ROW EXECUTE FUNCTION public.cliente_relacionamento_confere();

-- ---------------------------------------------------------------------------
-- 4) RLS e privilégios
-- ---------------------------------------------------------------------------
ALTER TABLE public.cliente_relacionamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_relacionamento_hist ENABLE ROW LEVEL SECURITY;

DO $do$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cliente_relacionamento', 'cliente_relacionamento_hist']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_tenant_isolation ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY %1$s_tenant_isolation ON public.%1$s AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (tenant_id = (SELECT public.get_user_tenant_id())) '
      'WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()))', t);
    -- Leitura pelo navegador só para quem administra o app e vê grupos restritos
    -- (mesma régua de wa_auto_satisfacao). O resumo é paráfrase de conversas de
    -- todas as instâncias: carteira (user_can_access_client) não basta.
    -- Hoje o front não lê esta tabela; só as edge functions (service_role).
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY %1$s_select ON public.%1$s FOR SELECT TO authenticated '
      'USING ((SELECT public.pode_ver_restrito()) AND (SELECT public.has_permissao(''automacoes-wa'', ''admin'')))', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END
$do$;
-- Servidor: estado lê/cria/atualiza (sem DELETE — sai junto com o cliente, CASCADE);
-- histórico só lê e acrescenta.
GRANT SELECT, INSERT, UPDATE ON public.cliente_relacionamento TO service_role;
GRANT SELECT, INSERT ON public.cliente_relacionamento_hist TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Reivindicação (só servidor): cria quem falta e pega até N do dia
-- ---------------------------------------------------------------------------
-- p_client_ids: os clientes que ENTRAM na análise (a função já filtrou: ativo,
-- contrato vigente, canal confirmado). Só os desta empresa são considerados.
-- Devolve as linhas reivindicadas (estado anterior = memória), na ordem: nunca
-- analisados primeiro, depois os analisados há mais tempo.
CREATE OR REPLACE FUNCTION public.cliente_relacionamento_reivindicar(
  p_tenant uuid, p_client_ids uuid[], p_dia date, p_limite integer DEFAULT 20
)
RETURNS SETOF public.cliente_relacionamento
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_tenant IS NULL OR p_dia IS NULL THEN
    RAISE EXCEPTION 'Parâmetros obrigatórios.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF coalesce(cardinality(p_client_ids), 0) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_client_ids) > 5000 THEN
    RAISE EXCEPTION 'Clientes demais.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.cliente_relacionamento (tenant_id, client_id)
  SELECT p_tenant, cl.id
    FROM public.clients cl
   WHERE cl.tenant_id = p_tenant
     AND cl.id = ANY (p_client_ids)
  ON CONFLICT (tenant_id, client_id) DO NOTHING;

  RETURN QUERY
  UPDATE public.cliente_relacionamento r
     SET reivindicado_em = now()
   WHERE (r.tenant_id, r.client_id) IN (
     SELECT x.tenant_id, x.client_id
       FROM public.cliente_relacionamento x
      WHERE x.tenant_id = p_tenant
        AND x.client_id = ANY (p_client_ids)
        AND x.dia_processado IS DISTINCT FROM p_dia
        AND (x.reivindicado_em IS NULL OR x.reivindicado_em < now() - interval '10 minutes')
      ORDER BY x.analisado_em NULLS FIRST, x.client_id
      LIMIT greatest(1, least(coalesce(p_limite, 20), 200))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING r.*;
END;
$fn$;
COMMENT ON FUNCTION public.cliente_relacionamento_reivindicar(uuid, uuid[], date, integer) IS
  'Só service_role (wa-relacionamento-analisar): cria a linha de quem ainda não tem e reivindica até N clientes não processados no dia (expira em 10 min).';
REVOKE ALL ON FUNCTION public.cliente_relacionamento_reivindicar(uuid, uuid[], date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_relacionamento_reivindicar(uuid, uuid[], date, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 5b) "Grupos ativos sem cliente vinculado" (relatório diário + painel)
-- ---------------------------------------------------------------------------
-- O alerta novo 'grupo_sem_cliente' pode ser silenciado / ignorado no painel
-- como os outros (por contato: o grupo não tem cliente).
ALTER TABLE public.wa_auto_alertas_ignorados DROP CONSTRAINT IF EXISTS wa_auto_alertas_ignorados_tipo_check;
ALTER TABLE public.wa_auto_alertas_ignorados
  ADD CONSTRAINT wa_auto_alertas_ignorados_tipo_check
  CHECK (tipo IN ('sem_resposta', 'sentimento_negativo', 'pendencia', 'queda_volume', 'grupo_sem_cliente', 'todos'));

-- Grupos com mensagem nos últimos p_dias SEM cliente: nem confirmado em
-- cliente_canais, nem vínculo no Chat (chat_contacts.client_id /
-- chat_contact_clients) em nenhuma cópia do grupo; e que não são da equipe
-- (decisão interno / não é cliente, restrito_admin, chat_grupos_restritos,
-- wa_agente_grupos, destinos de wa_auto_gestores). Um item por grupo (chave =
-- id do grupo, juntando todos os números da empresa). Devolve só nome, contagem,
-- data, o contato mais recente (para "Vincular" / silenciar), todos os contatos
-- do grupo e a sugestão pendente de maior nota. Nada de conteúdo. Só service_role.
CREATE OR REPLACE FUNCTION public.wa_auto_grupos_sem_cliente(
  p_tenant uuid, p_dias integer DEFAULT 7, p_agora timestamptz DEFAULT now(), p_limite integer DEFAULT 200
)
RETURNS TABLE (
  chave text, nome text, contato_id uuid, contato_ids uuid[], msgs integer, ultima_msg timestamptz,
  sugestao_client_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH grupos AS (
    SELECT ct.id, ct.nome, ct.client_id, ct.restrito_admin,
           private.canal_chave(ct.numero_whatsapp, ct.group_size) AS chave
      FROM public.chat_contacts ct
     WHERE ct.tenant_id = p_tenant
       AND private.canal_tipo(ct.numero_whatsapp, ct.group_size) = 'grupo'
  ),
  atividade AS (
    SELECT g.chave, g.id AS contato_id, count(*)::integer AS n, max(m.criado_em) AS ult
      FROM grupos g
      JOIN public.chat_conversations cv ON cv.tenant_id = p_tenant AND cv.contact_id = g.id
      JOIN public.chat_messages m ON m.tenant_id = p_tenant AND m.conversation_id = cv.id
     WHERE g.chave IS NOT NULL
       AND m.criado_em >= coalesce(p_agora, now()) - make_interval(days => least(greatest(coalesce(p_dias, 7), 1), 90))
       AND m.criado_em <= coalesce(p_agora, now())
       AND coalesce(m.tipo, '') <> 'nota_interna'
     GROUP BY g.chave, g.id
  ),
  por_chave AS (
    SELECT a.chave, sum(a.n)::integer AS msgs, max(a.ult) AS ult,
           (array_agg(a.contato_id ORDER BY a.ult DESC, a.contato_id))[1] AS contato_id
      FROM atividade a
     GROUP BY a.chave
  )
  SELECT pc.chave,
         (SELECT g.nome FROM grupos g WHERE g.id = pc.contato_id),
         pc.contato_id,
         (SELECT array_agg(g.id ORDER BY g.id) FROM grupos g WHERE g.chave = pc.chave),
         pc.msgs,
         pc.ult,
         (SELECT c.client_id FROM public.cliente_canais c
           WHERE c.tenant_id = p_tenant AND c.tipo = 'grupo' AND c.chave = pc.chave AND c.status = 'sugerido'
           ORDER BY c.score DESC NULLS LAST, c.criado_em
           LIMIT 1)
    FROM por_chave pc
   WHERE NOT EXISTS (
           SELECT 1 FROM public.cliente_canais c
            WHERE c.tenant_id = p_tenant AND c.tipo = 'grupo' AND c.chave = pc.chave
              AND c.status IN ('confirmado', 'interno', 'nao_cliente'))
     AND NOT EXISTS (
           SELECT 1 FROM grupos g
            WHERE g.chave = pc.chave
              AND (g.restrito_admin IS TRUE OR g.client_id IS NOT NULL
                   OR EXISTS (SELECT 1 FROM public.chat_contact_clients cc
                               WHERE cc.tenant_id = p_tenant AND cc.contact_id = g.id)))
     AND NOT EXISTS (SELECT 1 FROM public.chat_grupos_restritos r
                      WHERE r.tenant_id = p_tenant AND private.canal_chave(r.grupo_base, 1) = pc.chave)
     AND NOT EXISTS (SELECT 1 FROM public.wa_agente_grupos ag
                      WHERE ag.tenant_id = p_tenant AND private.canal_chave(ag.grupo_jid, 1) = pc.chave)
     AND NOT EXISTS (SELECT 1 FROM public.wa_auto_gestores wg
                      WHERE wg.tenant_id = p_tenant AND wg.grupo_jid IS NOT NULL
                        AND private.canal_chave(wg.grupo_jid, 1) = pc.chave)
   ORDER BY pc.msgs DESC, pc.ult DESC, pc.chave
   LIMIT least(greatest(coalesce(p_limite, 200), 1), 500)
$fn$;
COMMENT ON FUNCTION public.wa_auto_grupos_sem_cliente(uuid, integer, timestamptz, integer) IS
  'Só service_role (relatório diário / painel de alertas): grupos com conversa recente e sem cliente vinculado, um por grupo (todas as instâncias), sem grupos da equipe. Só nome, contagem e ids.';
REVOKE ALL ON FUNCTION public.wa_auto_grupos_sem_cliente(uuid, integer, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_auto_grupos_sem_cliente(uuid, integer, timestamptz, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Agendador novo + desliga o antigo
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-auto-satisfacao-diaria') THEN
    PERFORM cron.unschedule('wa-auto-satisfacao-diaria');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-relacionamento-analisar-diario') THEN
    PERFORM cron.unschedule('wa-relacionamento-analisar-diario');
  END IF;
END
$do$;

SELECT cron.schedule(
  'wa-relacionamento-analisar-diario',
  '*/15 9-10 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://seu-projeto-supabase.supabase.co/functions/v1/wa-relacionamento-analisar',
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
-- 7) Retenção do histórico: 180 dias — todo dia às 04:29 BRT (07:29 UTC)
--    (também apaga o uso das prévias com mais de 90 dias)
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-relacionamento-hist-retencao-365d') THEN
    PERFORM cron.unschedule('wa-relacionamento-hist-retencao-365d');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-relacionamento-hist-retencao-180d') THEN
    PERFORM cron.unschedule('wa-relacionamento-hist-retencao-180d');
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 8) Uso das prévias (dry_run): limite atômico e custo no teto do dia
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cliente_relacionamento_uso (
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dia              DATE NOT NULL,
  previas          INTEGER NOT NULL DEFAULT 0 CHECK (previas >= 0),
  chamadas_ia      INTEGER NOT NULL DEFAULT 0 CHECK (chamadas_ia >= 0),
  custo_usd        NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (custo_usd >= 0),
  ultima_previa_em TIMESTAMPTZ NULL,
  PRIMARY KEY (tenant_id, dia)
);
COMMENT ON TABLE public.cliente_relacionamento_uso IS
  'Uso das prévias (dry_run) de wa-relacionamento-analisar por empresa e dia (Brasília): quantidade, chamadas à IA e custo — entra no teto de custo diário. Só servidor. Retenção 90 dias.';
ALTER TABLE public.cliente_relacionamento_uso ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: logado não lê nem grava (só service_role, que ignora RLS).
REVOKE ALL ON public.cliente_relacionamento_uso FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.cliente_relacionamento_uso TO service_role;

-- Reserva ATÔMICA de uma prévia: só passa se a última foi há pelo menos
-- p_intervalo_s segundos e ainda não chegou a p_max_dia no dia. true = pode.
CREATE OR REPLACE FUNCTION public.cliente_relacionamento_previa_reservar(
  p_tenant uuid, p_dia date, p_intervalo_s integer DEFAULT 60, p_max_dia integer DEFAULT 20
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ok boolean;
BEGIN
  IF p_tenant IS NULL OR p_dia IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO public.cliente_relacionamento_uso AS u (tenant_id, dia, previas, ultima_previa_em)
  VALUES (p_tenant, p_dia, 1, now())
  ON CONFLICT (tenant_id, dia) DO UPDATE
     SET previas = u.previas + 1, ultima_previa_em = now()
   WHERE (u.ultima_previa_em IS NULL
          OR u.ultima_previa_em < now() - make_interval(secs => greatest(coalesce(p_intervalo_s, 60), 0)))
     AND u.previas < greatest(coalesce(p_max_dia, 20), 1)
  RETURNING true INTO v_ok;
  RETURN coalesce(v_ok, false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.cliente_relacionamento_previa_reservar(uuid, date, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_relacionamento_previa_reservar(uuid, date, integer, integer) TO service_role;

-- Soma chamadas e custo de uma prévia ao dia da empresa (atômico).
CREATE OR REPLACE FUNCTION public.cliente_relacionamento_uso_registrar(
  p_tenant uuid, p_dia date, p_chamadas integer, p_custo numeric
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  INSERT INTO public.cliente_relacionamento_uso AS u (tenant_id, dia, chamadas_ia, custo_usd)
  VALUES (p_tenant, p_dia, greatest(coalesce(p_chamadas, 0), 0), least(greatest(coalesce(p_custo, 0), 0), 1000))
  ON CONFLICT (tenant_id, dia) DO UPDATE
     SET chamadas_ia = u.chamadas_ia + greatest(coalesce(p_chamadas, 0), 0),
         custo_usd = u.custo_usd + least(greatest(coalesce(p_custo, 0), 0), 1000)
$fn$;
REVOKE ALL ON FUNCTION public.cliente_relacionamento_uso_registrar(uuid, date, integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_relacionamento_uso_registrar(uuid, date, integer, numeric) TO service_role;

SELECT cron.schedule(
  'wa-relacionamento-hist-retencao-180d',
  '29 7 * * *',
  $cron$
  DELETE FROM public.cliente_relacionamento_hist WHERE criado_em < now() - interval '180 days';
  DELETE FROM public.cliente_relacionamento_uso WHERE dia < current_date - 90;
  $cron$
);

COMMIT;

NOTIFY pgrst, 'reload schema';
