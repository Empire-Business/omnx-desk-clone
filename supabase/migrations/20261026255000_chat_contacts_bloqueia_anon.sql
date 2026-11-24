-- ============================================================================
-- HOTFIX de segurança: chat_contacts legível sem login (chave anon pública)
-- ============================================================================
-- Achado em 26/10/2026 (auditoria dos grupos internos): a política PERMISSIVE
-- chat_contacts_access vale para TODOS os papéis (TO public) e
-- user_can_access_client(NULL) devolve true para contato sem cliente; a
-- RESTRICTIVE tenant_isolation só cobre `authenticated`. Resultado: com a chave
-- anon (pública, vai no navegador) qualquer pessoa listava os 829 contatos do
-- Chat de todas as empresas (nome, número, foto). Nenhuma tela pública usa
-- chat_contacts (todas exigem login) e as edge functions usam service_role.
--
-- Correção: política RESTRICTIVE que nega tudo ao papel anon.
-- Reversão: DROP POLICY chat_contacts_nega_anon ON public.chat_contacts;
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS chat_contacts_nega_anon ON public.chat_contacts;
CREATE POLICY chat_contacts_nega_anon ON public.chat_contacts
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

COMMIT;
