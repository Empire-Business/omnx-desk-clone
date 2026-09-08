-- Fixar conversas no topo (pin) — preferência por usuário
-- Cada usuário pode fixar suas próprias conversas na lista do chat.
-- A coluna vive na mesma tabela de preferências por usuário usada para "arquivada".

alter table public.chat_conversation_user_prefs
  add column if not exists fixado boolean not null default false;

comment on column public.chat_conversation_user_prefs.fixado is
  'Quando true, a conversa aparece fixada no topo da lista para este usuário.';
