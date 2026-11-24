-- ============================================================================
-- Segurança: bucket chat-media sem LISTAGEM pública
-- ============================================================================
-- Achado (auditoria 26/10/2026): a política public_read_chat_media
-- (SELECT em storage.objects, TO public, USING bucket_id = 'chat-media') deixa
-- qualquer pessoa — até sem login, só com a chave anon que vai no navegador —
-- LISTAR o bucket (storage.from('chat-media').list()). As pastas têm o nome da
-- conversation_id, então dava para descobrir todas as conversas de todas as
-- empresas (inclusive grupos internos) e baixar todas as mídias.
--
-- Como as mídias são exibidas hoje (conferido no código):
--   * Upload: front (uploadChatMedia / uploadNoteMedia, upsert: false) e edge
--     functions com service_role (uazapi-webhook, fetch-profile-pic,
--     instagram-stats*). Todos salvam a URL PÚBLICA (getPublicUrl) em
--     chat_messages.media_url / chat_contacts.foto_url / clients.
--   * Ninguém usa .list(), .download() nem createSignedUrl no bucket chat-media.
--   * O bucket é PÚBLICO: o endpoint /storage/v1/object/public/chat-media/…
--     serve o arquivo SEM consultar políticas de storage.objects. Por isso tirar
--     a política NÃO quebra a exibição das mídias nem das fotos.
--
-- O que muda:
--   1) DROP de public_read_chat_media (fim da listagem/leitura via API para
--      anon e authenticated).
--   2) SELECT só do PRÓPRIO upload para authenticated (autor = auth.uid()),
--      para o upload do front continuar funcionando caso o Storage leia a linha
--      recém-inserida (INSERT … RETURNING passa pelas políticas de SELECT).
--      Ninguém lista arquivo de outra pessoa.
--
-- Risco residual (aceito por ora): quem TEM a URL pública de uma mídia continua
-- conseguindo abrir (é assim que o Chat exibe). As URLs têm a conversation_id
-- (UUID) + timestamp; sem a listagem, não dá mais para descobri-las.
--
-- Opção futura (mais forte) — bucket PRIVADO com URL assinada:
--   a) gravar o CAMINHO (não a URL) em chat_messages.media_path;
--   b) exibir com createSignedUrl(path, 3600) gerado sob demanda (hook no front),
--      com política SELECT que exige ver a conversa:
--        USING (bucket_id = 'chat-media' AND EXISTS (SELECT 1 FROM chat_conversations c
--               WHERE c.id::text = (storage.foldername(name))[1]))  -- RLS da conversa vale
--   c) migrar as media_url antigas para path; d) UPDATE storage.buckets SET public = false.
--   Atenção: a UAZAPI baixa a mídia pela URL ao enviar (uazapi-send-message usa
--   media_url como "file") — gerar URL assinada curta antes do envio.
--
-- Reversão:
--   DROP POLICY IF EXISTS chat_media_select_proprio_upload ON storage.objects;
--   CREATE POLICY public_read_chat_media ON storage.objects FOR SELECT TO public
--     USING (bucket_id = 'chat-media');
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS public_read_chat_media ON storage.objects;

DROP POLICY IF EXISTS chat_media_select_proprio_upload ON storage.objects;
CREATE POLICY chat_media_select_proprio_upload ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND public.storage_autor_do_upload(owner, owner_id) = (SELECT auth.uid())
  );

COMMIT;
