
create table if not exists whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  numero_whatsapp text,
  instance_id text unique not null,
  webhook_url text,
  status text default 'desconectado' check (status in ('conectado','desconectado','aguardando_qr','banido')),
  qr_code text,
  departamento_padrao_id uuid,
  auto_reply_fora_horario boolean default false,
  mensagem_fora_horario text,
  ativo boolean default true,
  criado_em timestamptz default now()
);

create table if not exists chat_departments (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  instance_id uuid references whatsapp_instances(id) on delete cascade,
  distribuicao text default 'manual' check (distribuicao in ('manual','round_robin','menor_carga')),
  sla_primeira_resposta_minutos integer default 60,
  sla_resolucao_horas integer default 24,
  mensagem_boas_vindas text,
  ativo boolean default true,
  criado_em timestamptz default now()
);

create table if not exists chat_department_agents (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references chat_departments(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  criado_em timestamptz default now(),
  unique(department_id, user_id)
);

create table if not exists chat_contacts (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references whatsapp_instances(id) on delete cascade,
  numero_whatsapp text not null,
  nome text,
  foto_url text,
  client_id uuid references clients(id) on delete set null,
  bloqueado boolean default false,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  unique(instance_id, numero_whatsapp)
);

create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references whatsapp_instances(id) on delete cascade,
  contact_id uuid references chat_contacts(id) on delete cascade,
  department_id uuid references chat_departments(id) on delete set null,
  agente_id uuid references public.users(id) on delete set null,
  status text default 'aberta' check (status in ('aberta','em_atendimento','aguardando','encerrada')),
  protocolo text unique default 'P-' || substr(gen_random_uuid()::text, 1, 8),
  primeira_resposta_em timestamptz,
  encerrada_em timestamptz,
  sla_primeira_resposta_violado boolean default false,
  sla_resolucao_violado boolean default false,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references chat_conversations(id) on delete cascade,
  message_id_wpp text unique,
  tipo text default 'texto' check (tipo in ('texto','imagem','video','audio','documento','sticker','localizacao','contato','sistema')),
  conteudo text,
  media_url text,
  enviado_por_agente boolean default false,
  agente_id uuid references public.users(id) on delete set null,
  enviado_por_ia boolean default false,
  lida boolean default false,
  status_envio text default 'enviada' check (status_envio in ('enviando','enviada','entregue','lida','falha')),
  criado_em timestamptz default now()
);

create table if not exists chat_csat (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references chat_conversations(id) on delete cascade unique,
  nota integer check (nota >= 1 and nota <= 5),
  comentario text,
  respondido_em timestamptz,
  criado_em timestamptz default now()
);

-- RLS
alter table whatsapp_instances enable row level security;
alter table chat_departments enable row level security;
alter table chat_department_agents enable row level security;
alter table chat_contacts enable row level security;
alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;
alter table chat_csat enable row level security;

-- whatsapp_instances: admin manages, chat agents read
create policy "admin_manage_instances" on whatsapp_instances for all using ((select perfil from public.users where id = auth.uid()) = 'admin');
create policy "chat_read_instances" on whatsapp_instances for select using ((select perfil from public.users where id = auth.uid()) in ('admin','gerente','agente_chat'));

-- departments
create policy "admin_manage_departments" on chat_departments for all using ((select perfil from public.users where id = auth.uid()) = 'admin');
create policy "chat_read_departments" on chat_departments for select using ((select perfil from public.users where id = auth.uid()) in ('admin','gerente','agente_chat','atendimento'));

-- department_agents
create policy "admin_manage_dept_agents" on chat_department_agents for all using ((select perfil from public.users where id = auth.uid()) = 'admin');
create policy "own_dept_agents" on chat_department_agents for select using (user_id = auth.uid());

-- contacts
create policy "chat_team_contacts" on chat_contacts for all using ((select perfil from public.users where id = auth.uid()) in ('admin','gerente','agente_chat','atendimento'));

-- conversations
create policy "chat_team_conversations" on chat_conversations for all using ((select perfil from public.users where id = auth.uid()) in ('admin','gerente','agente_chat','atendimento'));

-- messages
create policy "chat_team_messages" on chat_messages for all using ((select perfil from public.users where id = auth.uid()) in ('admin','gerente','agente_chat','atendimento'));

-- csat
create policy "chat_team_csat" on chat_csat for all using ((select perfil from public.users where id = auth.uid()) in ('admin','gerente','agente_chat','atendimento'));

-- indexes
create index chat_conversations_status_idx on chat_conversations(status);
create index chat_conversations_agente_idx on chat_conversations(agente_id);
create index chat_messages_conversation_idx on chat_messages(conversation_id);
create index chat_messages_criado_em_idx on chat_messages(criado_em desc);
