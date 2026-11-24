-- Integração Íris/GT3: preparação local, NÃO executada nesta tarefa.
-- Dados acessíveis apenas aos endpoints autenticados; nenhuma credencial no cliente.
create table public.iris_gt3_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  workspace_id uuid not null,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz
);
create table public.iris_gt3_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  workspace_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  ativo boolean not null default true,
  revisao bigint not null default 1 check (revisao > 0),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  revoked_at timestamptz
);
create unique index iris_gt3_workspace_live on public.iris_gt3_connections(workspace_id) where revoked_at is null;
create index iris_gt3_connections_tenant on public.iris_gt3_connections(tenant_id);
create table public.iris_gt3_recipients (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.iris_gt3_connections(id),
  tenant_id uuid not null references public.tenants(id),
  gt3_user_id uuid not null,
  desk_user_id uuid not null references public.users(id),
  ativo boolean not null default true,
  modo_teste boolean not null default false,
  revisao bigint not null default 1 check (revisao > 0),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  unique(connection_id, gt3_user_id)
);
create index iris_gt3_recipients_tenant on public.iris_gt3_recipients(tenant_id, connection_id);
create table public.iris_gt3_context (
  connection_id uuid not null references public.iris_gt3_connections(id),
  gt3_user_id uuid not null,
  tenant_id uuid not null references public.tenants(id),
  scope_hash text not null check (scope_hash ~ '^[a-f0-9]{64}$'),
  mensagens jsonb not null default '[]' check (jsonb_typeof(mensagens)='array' and jsonb_array_length(mensagens)<=8 and octet_length(mensagens::text)<=20000),
  updated_at timestamptz not null default now(),
  primary key(connection_id,gt3_user_id,scope_hash)
);
create table public.iris_gt3_requests (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.iris_gt3_connections(id),
  tenant_id uuid not null references public.tenants(id),
  gt3_user_id uuid not null,
  request_id uuid not null,
  scope_hash text not null check (scope_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'running' check(status in ('running','done','failed')),
  lease uuid not null default gen_random_uuid(),
  lease_until timestamptz not null default now()+interval '2 minutes',
  texto text check(octet_length(texto)<=16000),
  created_at timestamptz not null default now(),
  unique(connection_id,gt3_user_id,request_id)
);
create index iris_gt3_requests_quota on public.iris_gt3_requests(connection_id,gt3_user_id,created_at);

alter table public.iris_gt3_pairing_codes enable row level security;
alter table public.iris_gt3_connections enable row level security;
alter table public.iris_gt3_recipients enable row level security;
alter table public.iris_gt3_context enable row level security;
alter table public.iris_gt3_requests enable row level security;
revoke all on public.iris_gt3_pairing_codes,public.iris_gt3_connections,public.iris_gt3_recipients,public.iris_gt3_context,public.iris_gt3_requests from public,anon,authenticated;
grant select,insert,update,delete on public.iris_gt3_pairing_codes,public.iris_gt3_connections,public.iris_gt3_recipients,public.iris_gt3_context,public.iris_gt3_requests to service_role;

-- Todas as funções abaixo são INVOKER e só service_role recebe EXECUTE.
create function public.iris_gt3_consume_code(p_hash text,p_workspace uuid,p_token_hash text)
returns public.iris_gt3_connections language plpgsql set search_path='' as $$
declare c public.iris_gt3_pairing_codes; r public.iris_gt3_connections;
begin
  select * into c from public.iris_gt3_pairing_codes where code_hash=p_hash and workspace_id=p_workspace for update;
  if c.id is null or c.consumed_at is not null or c.expires_at<=now() then raise exception 'invalid_pairing'; end if;
  -- Serializa consumo concorrente para o mesmo workspace, inclusive sem linha anterior.
  perform pg_advisory_xact_lock(hashtextextended('iris-workspace:'||p_workspace::text,0));
  update public.iris_gt3_connections set ativo=false,revoked_at=now(),revisao=revisao+1 where workspace_id=p_workspace and revoked_at is null;
  update public.iris_gt3_pairing_codes set consumed_at=now() where id=c.id;
  insert into public.iris_gt3_connections(tenant_id,workspace_id,token_hash,created_by)
    values(c.tenant_id,c.workspace_id,p_token_hash,c.created_by) returning * into r;
  return r;
end $$;

create function public.iris_gt3_save_recipient(p_connection uuid,p_gt3_user uuid,p_desk_user uuid,p_ativo boolean,p_teste boolean,p_actor uuid)
returns public.iris_gt3_recipients language plpgsql set search_path='' as $$
declare c public.iris_gt3_connections; r public.iris_gt3_recipients;
begin
  select * into c from public.iris_gt3_connections where id=p_connection for update;
  if c.id is null or not c.ativo or c.revoked_at is not null or c.expires_at<=now() then raise exception 'connection_inactive'; end if;
  if p_ativo then
    if not exists(select 1 from public.users where id=p_desk_user and tenant_id=c.tenant_id and ativo=true) then raise exception 'invalid_recipient'; end if;
  else
    if not exists(select 1 from public.iris_gt3_recipients where connection_id=c.id and tenant_id=c.tenant_id and gt3_user_id=p_gt3_user and desk_user_id=p_desk_user) then raise exception 'invalid_recipient'; end if;
  end if;
  insert into public.iris_gt3_recipients(connection_id,tenant_id,gt3_user_id,desk_user_id,ativo,modo_teste,updated_by)
  values(c.id,c.tenant_id,p_gt3_user,p_desk_user,p_ativo,p_teste,p_actor)
  on conflict(connection_id,gt3_user_id) do update set desk_user_id=excluded.desk_user_id,ativo=excluded.ativo,modo_teste=excluded.modo_teste,revisao=iris_gt3_recipients.revisao+1,updated_at=now(),updated_by=excluded.updated_by returning * into r;
  return r;
end $$;

create function public.iris_gt3_begin_chat(p_connection uuid,p_gt3_user uuid,p_request uuid,p_scope_hash text)
returns jsonb language plpgsql set search_path='' as $$
declare c public.iris_gt3_connections; r public.iris_gt3_recipients; q public.iris_gt3_requests;
begin
  select * into c from public.iris_gt3_connections where id=p_connection for update;
  select * into r from public.iris_gt3_recipients where connection_id=p_connection and gt3_user_id=p_gt3_user for update;
  if c.id is null or not c.ativo or c.revoked_at is not null or c.expires_at<=now() or r.id is null or not r.ativo then raise exception 'access_inactive'; end if;
  select * into q from public.iris_gt3_requests where connection_id=p_connection and gt3_user_id=p_gt3_user and request_id=p_request for update;
  if q.id is not null then
    if q.scope_hash<>p_scope_hash then raise exception 'scope_changed'; end if;
    if q.status='done' then return jsonb_build_object('cached',true,'texto',q.texto); end if;
    if q.status='running' and q.lease_until>now() then raise exception 'request_running'; end if;
    update public.iris_gt3_requests set status='running',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id=q.id returning * into q;
  else
    if (select count(*) from public.iris_gt3_requests where connection_id=p_connection and gt3_user_id=p_gt3_user and created_at>now()-interval '1 hour')>=30 then raise exception 'request_limit'; end if;
    insert into public.iris_gt3_requests(connection_id,tenant_id,gt3_user_id,request_id,scope_hash) values(p_connection,c.tenant_id,p_gt3_user,p_request,p_scope_hash) returning * into q;
  end if;
  return jsonb_build_object('cached',false,'id',q.id,'lease',q.lease);
end $$;

create function public.iris_gt3_finish_chat(p_id uuid,p_lease uuid,p_connection_revision bigint,p_recipient_revision bigint,p_texto text,p_mensagens jsonb)
returns boolean language plpgsql set search_path='' as $$
declare q public.iris_gt3_requests; c public.iris_gt3_connections; r public.iris_gt3_recipients;
begin
  -- Ordem de lock constante: conexão, destinatário, pedido.
  select * into q from public.iris_gt3_requests where id=p_id;
  if q.id is null then return false; end if;
  select * into c from public.iris_gt3_connections where id=q.connection_id for update;
  select * into r from public.iris_gt3_recipients where connection_id=q.connection_id and gt3_user_id=q.gt3_user_id for update;
  select * into q from public.iris_gt3_requests where id=p_id for update;
  if q.status<>'running' or q.lease<>p_lease or q.lease_until<=now() or c.id is null or not c.ativo or c.revoked_at is not null or c.expires_at<=now() or c.revisao<>p_connection_revision or r.id is null or not r.ativo or r.revisao<>p_recipient_revision then return false; end if;
  insert into public.iris_gt3_context(connection_id,gt3_user_id,tenant_id,scope_hash,mensagens)
    values(q.connection_id,q.gt3_user_id,q.tenant_id,q.scope_hash,p_mensagens)
    on conflict(connection_id,gt3_user_id,scope_hash) do update set mensagens=excluded.mensagens,updated_at=now();
  update public.iris_gt3_requests set status='done',texto=p_texto where id=q.id;
  return true;
end $$;

revoke execute on function public.iris_gt3_consume_code(text,uuid,text),public.iris_gt3_save_recipient(uuid,uuid,uuid,boolean,boolean,uuid),public.iris_gt3_begin_chat(uuid,uuid,uuid,text),public.iris_gt3_finish_chat(uuid,uuid,bigint,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.iris_gt3_consume_code(text,uuid,text),public.iris_gt3_save_recipient(uuid,uuid,uuid,boolean,boolean,uuid),public.iris_gt3_begin_chat(uuid,uuid,uuid,text),public.iris_gt3_finish_chat(uuid,uuid,bigint,bigint,text,jsonb) to service_role;
