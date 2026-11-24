-- A tela de contatos já cadastra/edita notas e filtra/atualiza tags em lote.
-- Catálogo Desk wuzmckatbmlpkdxtfhqr em 2026-11-05: ambas as colunas ausentes;
-- chat_contacts pertence a postgres e tem RLS ativo, com isolamento de tenant,
-- bloqueio anon e grupos restritos. Essas policies e grants não são alterados.
-- Tags vazias mantêm os contatos existentes sem rótulos inventados.
BEGIN;
ALTER TABLE public.chat_contacts
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN notas text;
NOTIFY pgrst, 'reload schema';
COMMIT;
