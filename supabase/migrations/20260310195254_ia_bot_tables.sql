
create table if not exists ia_bots (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  instance_id uuid references whatsapp_instances(id) on delete cascade,
  department_id uuid references chat_departments(id) on delete set null,
  modelo_openrouter text not null default 'anthropic/claude-haiku-4-5-20251001',
  system_prompt text,
  temperatura numeric(3,2) default 0.7,
  ativo boolean default false,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists ia_bot_documents (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid references ia_bots(id) on delete cascade,
  nome text not null,
  tipo text default 'texto' check (tipo in ('texto','pdf','url')),
  conteudo text,
  url text,
  criado_em timestamptz default now()
);

create table if not exists ia_bot_activation_rules (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid references ia_bots(id) on delete cascade,
  tipo text not null check (tipo in ('fora_horario','palavra_chave','sempre','novo_contato')),
  valor text,
  criado_em timestamptz default now()
);

create table if not exists ia_bot_conversation_overrides (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid references ia_bots(id) on delete cascade,
  conversation_id uuid references chat_conversations(id) on delete cascade,
  pausado boolean default false,
  pausado_por uuid references public.users(id) on delete set null,
  criado_em timestamptz default now(),
  unique(bot_id, conversation_id)
);

create table if not exists ia_bot_execution_logs (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid references ia_bots(id) on delete cascade,
  conversation_id uuid references chat_conversations(id) on delete cascade,
  message_id uuid references chat_messages(id) on delete set null,
  tokens_input integer,
  tokens_output integer,
  tools_executadas jsonb,
  escalada boolean default false,
  erro text,
  criado_em timestamptz default now()
);

-- RLS
alter table ia_bots enable row level security;
alter table ia_bot_documents enable row level security;
alter table ia_bot_activation_rules enable row level security;
alter table ia_bot_conversation_overrides enable row level security;
alter table ia_bot_execution_logs enable row level security;

create policy "admin_manage_bots" on ia_bots for all using ((select perfil from public.users where id = auth.uid()) in ('admin','agente_chat'));
create policy "admin_manage_bot_docs" on ia_bot_documents for all using ((select perfil from public.users where id = auth.uid()) in ('admin','agente_chat'));
create policy "admin_manage_bot_rules" on ia_bot_activation_rules for all using ((select perfil from public.users where id = auth.uid()) in ('admin','agente_chat'));
create policy "admin_manage_bot_overrides" on ia_bot_conversation_overrides for all using ((select perfil from public.users where id = auth.uid()) in ('admin','agente_chat'));
create policy "admin_read_bot_logs" on ia_bot_execution_logs for select using ((select perfil from public.users where id = auth.uid()) in ('admin','agente_chat'));
