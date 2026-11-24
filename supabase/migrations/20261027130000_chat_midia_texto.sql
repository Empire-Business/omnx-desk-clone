-- ============================================================================
-- Chat / Automações WhatsApp — transcrição de áudios e descrição de imagens (F4)
-- ============================================================================
-- Contexto (plano "Íris e satisfação dos clientes", §1.7 e §3.2d): áudio e
-- imagem sem legenda viram "(enviou um áudio)" / "(enviou uma imagem)" para a
-- análise de satisfação e para a Íris. Em grupo são ~176 áudios/mês. Agora cada
-- áudio (e imagem sem legenda ou com legenda curta) que está no Storage entra
-- numa fila; a função `wa-midia-processar` transcreve/descreve e grava aqui.
--
-- Como a mídia é guardada (conferido no banco em 27/10/2026):
--   chat_messages.tipo = 'audio' | 'imagem' | ... ; chat_messages.media_url =
--   URL PÚBLICA do bucket `chat-media`
--   (https://<projeto>.supabase.co/storage/v1/object/public/chat-media/<conversation_id>/<arquivo>).
--   O uazapi-webhook sobe a mídia ANTES de inserir a mensagem (a URL já vem no
--   INSERT) e o front faz o mesmo (uploadChatMedia). Áudio = mp3 (audio/mpeg).
--
-- O que cria:
--   1) chat_midia_texto — uma linha por mensagem (PK = message_id, apaga junto
--      com a mensagem). Texto ≤ 4.000 (length(), sem regex com contador).
--   2) Trigger de consistência: tenant_id da linha = tenant_id da mensagem.
--   3) RLS: quem VÊ a mensagem vê o texto dela. A política de leitura é um
--      EXISTS em chat_messages — a subconsulta roda com a RLS de chat_messages
--      (acesso por instância/cliente, grupos restritos `restrito_admin` /
--      pode_ver_restrito() da migration 20261026260000 e isolamento por
--      empresa). Mais um RESTRICTIVE de empresa nesta tabela. Ninguém logado
--      escreve; o servidor (service_role) só lê e atualiza.
--   4) Fila: trigger AFTER INSERT em chat_messages (só dispara para mídia, pela
--      cláusula WHEN). Enfileira áudio; imagem só sem legenda ou com legenda
--      curta (< 20 caracteres, sem contar o prefixo "[Nome] " dos grupos). Exige
--      mídia no bucket chat-media, na pasta da própria conversa. NÃO enfileira
--      conversa de grupo interno (chat_contacts.restrito_admin) nem empresa com
--      o app Automações WhatsApp desligado. Nunca derruba o INSERT da mensagem
--      (erro vira WARNING).
--   5) RPC chat_midia_reivindicar(limite, máximo por empresa/dia) — só
--      service_role: tira da fila o que virou grupo interno / app desligado,
--      encerra os travados e reivindica um lote com FOR UPDATE SKIP LOCKED
--      (duas execuções simultâneas nunca pegam a mesma mídia). Devolve caminho,
--      tamanho e tipo do arquivo (storage.objects) para a função não baixar o
--      que passa do limite.
--   6) Backfill: áudios dos últimos 90 dias (mesmas regras da fila).
--   7) Agendador 'wa-midia-processar-5min' (pg_cron + pg_net), mesmo padrão dos
--      jobs wa-auto-*: segredo `wa_auto_cron_secret` lido do Vault NA HORA e
--      enviado no header x-cron-secret (conferido pela RPC
--      wa_auto_cron_secret_confere). Só chama a função se houver pendente.
--
-- Depende de: 20261026160000 (segredo + RPC do cron), 20261026260000
--   (restrito_admin). Publique a função `wa-midia-processar` (verify_jwt = false)
--   ANTES ou junto, com OPENROUTER_API_KEY nos secrets.
--
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS / job
-- recriado pelo nome / backfill com ON CONFLICT DO NOTHING).
--
-- Reversão (manual):
--   SELECT cron.unschedule('wa-midia-processar-5min');
--   DROP TRIGGER IF EXISTS zz_chat_midia_enfileirar ON public.chat_messages;
--   DROP FUNCTION IF EXISTS public.chat_midia_reivindicar(integer, integer);
--   DROP TABLE IF EXISTS public.chat_midia_texto;
--   DROP FUNCTION IF EXISTS private.chat_midia_enfileirar();
--   DROP FUNCTION IF EXISTS private.chat_midia_texto_confere();
--   DROP FUNCTION IF EXISTS private.chat_midia_tipo_fila(text, text);
--   DROP FUNCTION IF EXISTS private.chat_midia_caminho(text, uuid);
-- ============================================================================

BEGIN;
-- Não fica esperando lock em tabela quente do Chat (falha rápido e pode repetir).
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1) Tabela
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_midia_texto (
  message_id            UUID PRIMARY KEY REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pendente',
  texto                 TEXT NULL,
  duracao_s             INTEGER NULL,
  idioma                TEXT NULL,
  modelo                TEXT NULL,
  tentativas            SMALLINT NOT NULL DEFAULT 0,
  erro_code             TEXT NULL,
  custo_usd             NUMERIC(10,6) NULL,
  -- Data da mensagem (copiada): a fila anda das mais NOVAS para as mais antigas.
  mensagem_em           TIMESTAMPTZ NOT NULL,
  -- Reprocessamento com espera (falha temporária) e "aluguel" do lote.
  proxima_tentativa_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reivindicado_em       TIMESTAMPTZ NULL,
  processado_em         TIMESTAMPTZ NULL,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_midia_texto DROP CONSTRAINT IF EXISTS chat_midia_texto_tipo_check;
ALTER TABLE public.chat_midia_texto
  ADD CONSTRAINT chat_midia_texto_tipo_check CHECK (tipo IN ('transcricao', 'descricao'));

ALTER TABLE public.chat_midia_texto DROP CONSTRAINT IF EXISTS chat_midia_texto_status_check;
ALTER TABLE public.chat_midia_texto
  ADD CONSTRAINT chat_midia_texto_status_check CHECK (status IN ('pendente', 'ok', 'falhou', 'ignorado'));

-- Texto: até 4.000 caracteres; 'ok' exige texto não vazio.
ALTER TABLE public.chat_midia_texto DROP CONSTRAINT IF EXISTS chat_midia_texto_texto_check;
ALTER TABLE public.chat_midia_texto
  ADD CONSTRAINT chat_midia_texto_texto_check CHECK (
    (texto IS NULL OR length(texto) <= 4000)
    AND (status <> 'ok' OR (texto IS NOT NULL AND length(btrim(texto)) >= 1))
  );

ALTER TABLE public.chat_midia_texto DROP CONSTRAINT IF EXISTS chat_midia_texto_campos_check;
ALTER TABLE public.chat_midia_texto
  ADD CONSTRAINT chat_midia_texto_campos_check CHECK (
    (duracao_s IS NULL OR duracao_s BETWEEN 0 AND 86400)
    AND (idioma IS NULL OR length(idioma) BETWEEN 2 AND 16)
    AND (modelo IS NULL OR length(modelo) BETWEEN 1 AND 120)
    AND tentativas BETWEEN 0 AND 20
    AND (erro_code IS NULL OR length(erro_code) BETWEEN 1 AND 40)
    AND (custo_usd IS NULL OR custo_usd >= 0)
  );

COMMENT ON TABLE public.chat_midia_texto IS
  'Transcrição de áudio / descrição de imagem de uma mensagem do Chat (fila + resultado). Escrita só pelo servidor (wa-midia-processar). Leitura: quem vê a mensagem (RLS de chat_messages via EXISTS). Texto é DADO não confiável (vem do que o cliente falou/enviou).';
COMMENT ON COLUMN public.chat_midia_texto.erro_code IS
  'Código curto da última falha ou do motivo de ignorar (ex.: ia_timeout, grande_demais, restrito). Nunca conteúdo.';
COMMENT ON COLUMN public.chat_midia_texto.custo_usd IS
  'Custo informado pelo OpenRouter (usage.cost) da última chamada que deu certo — soma diária = custo do dia.';

-- Fila: pendentes, das mensagens mais novas para as mais antigas.
CREATE INDEX IF NOT EXISTS idx_chat_midia_texto_fila
  ON public.chat_midia_texto (mensagem_em DESC)
  WHERE status = 'pendente';
-- Limite diário por empresa (reivindicações do dia) e custo por dia.
CREATE INDEX IF NOT EXISTS idx_chat_midia_texto_tenant_reivindicado
  ON public.chat_midia_texto (tenant_id, reivindicado_em)
  WHERE reivindicado_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_midia_texto_tenant_processado
  ON public.chat_midia_texto (tenant_id, processado_em);

-- ---------------------------------------------------------------------------
-- 2) Consistência: a linha é da MESMA empresa da mensagem
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.chat_midia_texto_confere()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.chat_messages m WHERE m.id = NEW.message_id AND m.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Mensagem não encontrada nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.chat_midia_texto_confere() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_midia_texto_confere ON public.chat_midia_texto;
CREATE TRIGGER chat_midia_texto_confere
  BEFORE INSERT OR UPDATE ON public.chat_midia_texto
  FOR EACH ROW EXECUTE FUNCTION private.chat_midia_texto_confere();

-- ---------------------------------------------------------------------------
-- 3) RLS e privilégios
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_midia_texto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_midia_texto_tenant_isolation ON public.chat_midia_texto;
CREATE POLICY chat_midia_texto_tenant_isolation ON public.chat_midia_texto
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

-- Quem vê a mensagem vê o texto: a subconsulta em chat_messages passa pela RLS
-- de chat_messages (chat_messages_access + restrito_admin + tenant_isolation).
-- Sem SECURITY DEFINER de propósito — é exatamente a RLS de quem pergunta.
DROP POLICY IF EXISTS chat_midia_texto_select ON public.chat_midia_texto;
CREATE POLICY chat_midia_texto_select ON public.chat_midia_texto
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = chat_midia_texto.message_id));

-- Front: só lê. Servidor: lê e atualiza o resultado (a fila é preenchida pelo
-- trigger/backfill como dono; apagar só em cascata com a mensagem).
REVOKE ALL ON public.chat_midia_texto FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.chat_midia_texto TO authenticated;
GRANT SELECT, UPDATE ON public.chat_midia_texto TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Regras da fila (espelhadas em supabase/functions/_shared/wa-midia.ts →
--    tipoFila / caminhoDaMidia, com teste no Vitest)
-- ---------------------------------------------------------------------------
-- Tipo de processamento da mensagem: 'transcricao' (áudio), 'descricao' (imagem
-- sem legenda ou com legenda < 20 caracteres, sem o prefixo "[Nome] " dos
-- grupos) ou NULL (não entra).
CREATE OR REPLACE FUNCTION private.chat_midia_tipo_fila(p_tipo text, p_conteudo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT CASE
    WHEN lower(coalesce(p_tipo, '')) IN ('audio', 'ptt') THEN 'transcricao'
    WHEN lower(coalesce(p_tipo, '')) IN ('imagem', 'image')
         AND length(btrim(regexp_replace(coalesce(p_conteudo, ''), '^\s*\[[^\]]{1,80}\]\s*', ''))) < 20
      THEN 'descricao'
    ELSE NULL
  END
$fn$;

-- Caminho do arquivo dentro do bucket chat-media, só se estiver na pasta da
-- própria conversa (senão NULL). Ex.: '<conversation_id>/1730000000000.mp3'.
CREATE OR REPLACE FUNCTION private.chat_midia_caminho(p_media_url text, p_conversation_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT CASE
    WHEN p_media_url IS NULL OR p_conversation_id IS NULL THEN NULL
    WHEN p_media_url NOT LIKE 'https://%/storage/v1/object/public/chat-media/%' THEN NULL
    WHEN position('..' IN p_media_url) > 0 OR position('?' IN p_media_url) > 0 THEN NULL
    WHEN split_part(split_part(p_media_url, '/storage/v1/object/public/chat-media/', 2), '/', 1)
         <> p_conversation_id::text THEN NULL
    WHEN length(split_part(p_media_url, '/storage/v1/object/public/chat-media/', 2)) > 300 THEN NULL
    ELSE split_part(p_media_url, '/storage/v1/object/public/chat-media/', 2)
  END
$fn$;

REVOKE ALL ON FUNCTION private.chat_midia_tipo_fila(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.chat_midia_caminho(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.chat_midia_tipo_fila(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION private.chat_midia_caminho(text, uuid) TO service_role;

-- Trigger de enfileiramento. SECURITY DEFINER é necessário: a mensagem pode ser
-- inserida por usuário logado (envio pelo Chat), que não tem INSERT nesta tabela.
-- Nunca derruba o INSERT da mensagem.
CREATE OR REPLACE FUNCTION private.chat_midia_enfileirar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tipo text;
BEGIN
  v_tipo := private.chat_midia_tipo_fila(NEW.tipo, NEW.conteudo);
  IF v_tipo IS NULL
     OR NEW.tenant_id IS NULL
     OR private.chat_midia_caminho(NEW.media_url, NEW.conversation_id) IS NULL THEN
    RETURN NULL;
  END IF;

  -- Grupo interno (relatório / assistente): nunca vai para a IA.
  IF EXISTS (
    SELECT 1
      FROM public.chat_conversations cv
      JOIN public.chat_contacts c ON c.id = cv.contact_id
     WHERE cv.id = NEW.conversation_id
       AND c.restrito_admin
  ) THEN
    RETURN NULL;
  END IF;

  -- Só empresa com o app Automações WhatsApp ligado (custo de IA).
  IF NOT EXISTS (
    SELECT 1 FROM public.app_modules a
     WHERE a.tenant_id = NEW.tenant_id AND a.slug = 'automacoes-wa' AND a.enabled
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.chat_midia_texto (message_id, tenant_id, tipo, status, mensagem_em)
  VALUES (NEW.id, NEW.tenant_id, v_tipo, 'pendente', coalesce(NEW.criado_em, now()))
  ON CONFLICT (message_id) DO NOTHING;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'chat_midia_enfileirar: falhou (%)', SQLSTATE;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION private.chat_midia_enfileirar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_chat_midia_enfileirar ON public.chat_messages;
CREATE TRIGGER zz_chat_midia_enfileirar
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  WHEN (NEW.media_url IS NOT NULL AND NEW.tipo IN ('audio', 'ptt', 'imagem', 'image'))
  EXECUTE FUNCTION private.chat_midia_enfileirar();

-- ---------------------------------------------------------------------------
-- 5) RPC de reivindicação do lote (só service_role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_midia_reivindicar(
  p_limite integer DEFAULT 20,
  p_max_tenant_dia integer DEFAULT 300
)
RETURNS TABLE (
  message_id uuid,
  tenant_id uuid,
  tipo text,
  tentativas smallint,
  conversation_id uuid,
  media_url text,
  caminho text,
  tamanho bigint,
  mimetype text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_limite int := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_max int := least(greatest(coalesce(p_max_tenant_dia, 300), 0), 5000);
  v_inicio_dia timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  -- a) Travados: a função caiu no meio da 3ª tentativa (aluguel vencido).
  UPDATE public.chat_midia_texto q
     SET status = 'falhou', erro_code = 'tempo_esgotado', reivindicado_em = NULL, processado_em = now()
   WHERE q.status = 'pendente' AND q.tentativas >= 3
     AND q.reivindicado_em < now() - interval '10 minutes';

  -- b) A conversa virou grupo interno depois de entrar na fila.
  UPDATE public.chat_midia_texto q
     SET status = 'ignorado', erro_code = 'restrito', reivindicado_em = NULL, processado_em = now()
   WHERE q.status = 'pendente'
     AND EXISTS (
       SELECT 1
         FROM public.chat_messages m
         JOIN public.chat_conversations cv ON cv.id = m.conversation_id
         JOIN public.chat_contacts c ON c.id = cv.contact_id
        WHERE m.id = q.message_id AND c.restrito_admin
     );

  -- c) A empresa desligou o app.
  UPDATE public.chat_midia_texto q
     SET status = 'ignorado', erro_code = 'app_desligado', reivindicado_em = NULL, processado_em = now()
   WHERE q.status = 'pendente'
     AND NOT EXISTS (
       SELECT 1 FROM public.app_modules a
        WHERE a.tenant_id = q.tenant_id AND a.slug = 'automacoes-wa' AND a.enabled
     );

  -- d) Lote: pendentes vencidos, sem aluguel ativo, com menos de 3 tentativas,
  --    de empresas abaixo do limite do dia (reivindicações desde 00:00 BRT; o lote
  --    pode passar do limite em até p_limite − 1). Mais novas primeiro.
  RETURN QUERY
  WITH uso AS (
    SELECT u.tenant_id, count(*) AS n
      FROM public.chat_midia_texto u
     WHERE u.reivindicado_em >= v_inicio_dia
     GROUP BY u.tenant_id
  ),
  cand AS (
    SELECT q.message_id
      FROM public.chat_midia_texto q
      LEFT JOIN uso ON uso.tenant_id = q.tenant_id
     WHERE q.status = 'pendente'
       AND q.proxima_tentativa_em <= now()
       AND q.tentativas < 3
       AND (q.reivindicado_em IS NULL OR q.reivindicado_em < now() - interval '10 minutes')
       AND coalesce(uso.n, 0) < v_max
     ORDER BY q.mensagem_em DESC
     LIMIT v_limite
     FOR UPDATE OF q SKIP LOCKED
  ),
  marcados AS (
    UPDATE public.chat_midia_texto q
       SET reivindicado_em = now(), tentativas = q.tentativas + 1
      FROM cand
     WHERE q.message_id = cand.message_id
    RETURNING q.message_id, q.tenant_id, q.tipo, q.tentativas
  )
  SELECT mk.message_id, mk.tenant_id, mk.tipo, mk.tentativas,
         m.conversation_id, m.media_url,
         private.chat_midia_caminho(m.media_url, m.conversation_id) AS caminho,
         (o.metadata ->> 'size')::bigint AS tamanho,
         (o.metadata ->> 'mimetype') AS mimetype
    FROM marcados mk
    JOIN public.chat_messages m ON m.id = mk.message_id AND m.tenant_id = mk.tenant_id
    LEFT JOIN storage.objects o
      ON o.bucket_id = 'chat-media'
     AND o.name = private.chat_midia_caminho(m.media_url, m.conversation_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.chat_midia_reivindicar(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_midia_reivindicar(integer, integer) TO service_role;

COMMENT ON FUNCTION public.chat_midia_reivindicar(integer, integer) IS
  'Fila de transcrição/descrição (wa-midia-processar): limpa o que não deve mais ser processado e reivindica um lote com FOR UPDATE SKIP LOCKED. Só service_role.';

-- ---------------------------------------------------------------------------
-- 6) Backfill: áudios dos últimos 90 dias (mesmas regras do trigger)
-- ---------------------------------------------------------------------------
INSERT INTO public.chat_midia_texto (message_id, tenant_id, tipo, status, mensagem_em)
SELECT m.id, m.tenant_id, 'transcricao', 'pendente', coalesce(m.criado_em, now())
  FROM public.chat_messages m
  JOIN public.chat_conversations cv ON cv.id = m.conversation_id
  LEFT JOIN public.chat_contacts c ON c.id = cv.contact_id
 WHERE m.criado_em >= now() - interval '90 days'
   AND m.tenant_id IS NOT NULL
   AND m.tipo IN ('audio', 'ptt')
   AND private.chat_midia_caminho(m.media_url, m.conversation_id) IS NOT NULL
   AND coalesce(c.restrito_admin, false) = false
   AND EXISTS (
     SELECT 1 FROM public.app_modules a
      WHERE a.tenant_id = m.tenant_id AND a.slug = 'automacoes-wa' AND a.enabled
   )
ON CONFLICT (message_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7) Agendador: a cada 5 min, só se houver pendente vencido
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-midia-processar-5min') THEN
    PERFORM cron.unschedule('wa-midia-processar-5min');
  END IF;
END
$do$;

SELECT cron.schedule(
  'wa-midia-processar-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://wuzmckatbmlpkdxtfhqr.supabase.co/functions/v1/wa-midia-processar',
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
      SELECT 1 FROM public.chat_midia_texto q
       WHERE q.status = 'pendente' AND q.proxima_tentativa_em <= now()
    );
  $cron$
);

COMMIT;

NOTIFY pgrst, 'reload schema';
