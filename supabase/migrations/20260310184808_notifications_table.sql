
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  tipo text not null,
  titulo text not null,
  mensagem text,
  lida boolean default false,
  link text,
  metadata jsonb,
  criado_em timestamptz default now()
);

alter table notifications enable row level security;

create policy "users_own_notifications" on notifications
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index notifications_user_id_lida_idx on notifications(user_id, lida);
create index notifications_criado_em_idx on notifications(criado_em desc);
