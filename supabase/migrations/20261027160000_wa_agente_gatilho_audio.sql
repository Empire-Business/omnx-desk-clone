-- ============================================================================
-- Assistente da equipe (Íris) — entende ÁUDIO da equipe nos grupos internos
-- ============================================================================
-- Contexto: um colega respondeu (citou) o aviso diário com um áudio de 33 s
-- perguntando sobre um cliente e a Íris só viu "(mandou um áudio)". Agora:
--   * o uazapi-webhook enfileira áudio no grupo interno liberado: citando a Íris
--     → gatilho 'quote' (como texto); de MEMBRO da equipe sem menção/citação →
--     gatilho NOVO 'audio' (pode estar chamando pela voz: "Íris, quantos…");
--   * o wa-agente-responder transcreve na hora (OpenRouter, mesmo pedido da fila
--     wa-midia-processar) e grava o texto em chat_midia_texto como 'ok' (a fila
--     não refaz e o Chat mostra "Ver transcrição"). No gatilho 'audio' só
--     responde se o nome da assistente aparecer na fala; senão o pedido fica
--     'ignorado' e a execução é registrada com resultado NOVO 'audio_ignorado'
--     (só para o custo da transcrição entrar no teto diário).
--
-- O que muda:
--   1) wa_agente_pedidos.gatilho aceita 'audio'.
--   2) wa_agente_execucoes.resultado aceita 'audio_ignorado'.
--   3) service_role pode INSERIR em chat_midia_texto (antes: só SELECT/UPDATE —
--      a fila era preenchida só pelo trigger/backfill). Grupo interno nunca entra
--      na fila automática (restrito_admin), então a linha do áudio da Íris nasce
--      aqui, pelo responder. O trigger chat_midia_texto_confere continua exigindo
--      tenant_id = tenant da mensagem. Front continua só lendo (RLS da mensagem).
--
-- Sem regex com contador (CHECK só com IN). Idempotente: as CHECKs antigas são
-- removidas pelo conteúdo (nome gerado pelo Postgres) e recriadas com nome fixo.
--
-- Publicação: esta migration ANTES (ou junto) de publicar uazapi-webhook e
-- wa-agente-responder — sem ela o INSERT do pedido 'audio' falha (o webhook só
-- registra o código do erro e segue) e a transcrição não é gravada (a resposta
-- sai mesmo assim).
--
-- Reversão (manual; antes, publique as funções antigas):
--   UPDATE public.wa_agente_pedidos SET gatilho = 'nome' WHERE gatilho = 'audio';
--   UPDATE public.wa_agente_execucoes SET resultado = 'simulado' WHERE resultado = 'audio_ignorado';
--   ALTER TABLE public.wa_agente_pedidos DROP CONSTRAINT IF EXISTS wa_agente_pedidos_gatilho_check;
--   ALTER TABLE public.wa_agente_pedidos ADD CONSTRAINT wa_agente_pedidos_gatilho_check
--     CHECK (gatilho IN ('privado', 'mencao', 'quote', 'nome'));
--   ALTER TABLE public.wa_agente_execucoes DROP CONSTRAINT IF EXISTS wa_agente_execucoes_resultado_check;
--   ALTER TABLE public.wa_agente_execucoes ADD CONSTRAINT wa_agente_execucoes_resultado_check
--     CHECK (resultado IN ('respondido', 'sem_escopo', 'limite', 'teto', 'erro_ia', 'recusado',
--                          'humano_assumiu', 'simulado', 'restrito'));
--   REVOKE INSERT ON public.chat_midia_texto FROM service_role;
--   (transcrições 'ok' já gravadas ficam — são só texto da própria mensagem)
-- ============================================================================

BEGIN;
-- Não fica esperando lock em tabela quente (falha rápido e pode repetir).
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1) e 2) CHECKs: remove as antigas (pelo conteúdo) e recria com nome fixo
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.wa_agente_pedidos'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%gatilho%'
       AND pg_get_constraintdef(c.oid) LIKE '%privado%'
  LOOP
    EXECUTE format('ALTER TABLE public.wa_agente_pedidos DROP CONSTRAINT %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.wa_agente_execucoes'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%resultado%'
       AND pg_get_constraintdef(c.oid) LIKE '%respondido%'
  LOOP
    EXECUTE format('ALTER TABLE public.wa_agente_execucoes DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$do$;

ALTER TABLE public.wa_agente_pedidos
  ADD CONSTRAINT wa_agente_pedidos_gatilho_check
  CHECK (gatilho IN ('privado', 'mencao', 'quote', 'nome', 'audio'));

ALTER TABLE public.wa_agente_execucoes
  ADD CONSTRAINT wa_agente_execucoes_resultado_check
  CHECK (resultado IN ('respondido', 'sem_escopo', 'limite', 'teto', 'erro_ia', 'recusado',
                       'humano_assumiu', 'simulado', 'restrito', 'audio_ignorado'));

COMMENT ON COLUMN public.wa_agente_pedidos.gatilho IS
  'privado | mencao | quote | nome | audio (áudio de membro no grupo sem menção/citação: o responder transcreve e só segue se o nome da assistente aparecer na fala).';
COMMENT ON COLUMN public.wa_agente_execucoes.resultado IS
  'Resultado da execução. audio_ignorado = áudio transcrito que não chamava a assistente (registrado só pelo custo da transcrição).';

-- ---------------------------------------------------------------------------
-- 3) chat_midia_texto: o responder grava a transcrição feita na hora
-- ---------------------------------------------------------------------------
GRANT INSERT ON public.chat_midia_texto TO service_role;

COMMENT ON TABLE public.chat_midia_texto IS
  'Transcrição de áudio / descrição de imagem de uma mensagem do Chat (fila + resultado). Escrita só pelo servidor: wa-midia-processar (fila) e wa-agente-responder (áudio mandado para a assistente, transcrito na hora; grava só ''ok'' e nunca sobrescreve um ''ok''). Leitura: quem vê a mensagem (RLS de chat_messages via EXISTS). Texto é DADO não confiável.';

COMMIT;

NOTIFY pgrst, 'reload schema';
