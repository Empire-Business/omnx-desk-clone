
create table if not exists cobranca_instances (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  instance_id text unique not null,
  numero_whatsapp text,
  status text default 'desconectado' check (status in ('conectado','desconectado','aguardando_qr','banido')),
  envios_hora_max integer default 60,
  intervalo_min_segundos integer default 30,
  intervalo_max_segundos integer default 120,
  horario_inicio time default '08:00',
  horario_fim time default '20:00',
  dias_semana integer[] default '{1,2,3,4,5}',
  ativo boolean default true,
  criado_em timestamptz default now()
);

create table if not exists cobranca_reguas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  ativo boolean default true,
  criado_em timestamptz default now()
);

create table if not exists cobranca_regua_passos (
  id uuid primary key default gen_random_uuid(),
  regua_id uuid references cobranca_reguas(id) on delete cascade,
  ordem integer not null,
  dias_apos_anterior integer default 1,
  mensagem_template text not null,
  usar_ia_variacao boolean default false,
  criado_em timestamptz default now()
);

create table if not exists cobranca_devedores (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references cobranca_instances(id) on delete cascade,
  regua_id uuid references cobranca_reguas(id) on delete set null,
  nome text not null,
  numero_whatsapp text not null,
  valor_divida numeric(10,2),
  descricao_divida text,
  data_vencimento date,
  status text default 'ativa' check (status in ('ativa','pausada','encerrada','pago')),
  passo_atual integer default 0,
  proximo_envio_em timestamptz,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists cobranca_sends (
  id uuid primary key default gen_random_uuid(),
  devedor_id uuid references cobranca_devedores(id) on delete cascade,
  instance_id uuid references cobranca_instances(id) on delete cascade,
  passo integer not null,
  mensagem_enviada text not null,
  status_envio text default 'enviado' check (status_envio in ('enviando','enviado','falha')),
  enviado_em timestamptz default now()
);

-- RLS
alter table cobranca_instances enable row level security;
alter table cobranca_reguas enable row level security;
alter table cobranca_regua_passos enable row level security;
alter table cobranca_devedores enable row level security;
alter table cobranca_sends enable row level security;

-- Only cobranca profiles + admin
create policy "cobranca_team_instances" on cobranca_instances for all using ((select perfil from public.users where id = auth.uid()) in ('admin','admin_cobranca','agente_cobranca'));
create policy "cobranca_team_reguas" on cobranca_reguas for all using ((select perfil from public.users where id = auth.uid()) in ('admin','admin_cobranca','agente_cobranca'));
create policy "cobranca_team_passos" on cobranca_regua_passos for all using ((select perfil from public.users where id = auth.uid()) in ('admin','admin_cobranca','agente_cobranca'));
create policy "cobranca_team_devedores" on cobranca_devedores for all using ((select perfil from public.users where id = auth.uid()) in ('admin','admin_cobranca','agente_cobranca'));
create policy "cobranca_team_sends" on cobranca_sends for all using ((select perfil from public.users where id = auth.uid()) in ('admin','admin_cobranca','agente_cobranca'));

create index cobranca_devedores_status_idx on cobranca_devedores(status);
create index cobranca_devedores_proximo_envio_idx on cobranca_devedores(proximo_envio_em) where status = 'ativa';
