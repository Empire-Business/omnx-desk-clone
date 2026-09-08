
create table if not exists nps_surveys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade not null,
  delivery_id uuid references deliveries(id) on delete set null,
  enviado_em timestamptz default now(),
  respondido_em timestamptz,
  criado_em timestamptz default now()
);

create table if not exists nps_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid references nps_surveys(id) on delete cascade not null,
  respondido_por uuid references public.users(id) on delete set null,
  nota integer check (nota >= 0 and nota <= 10) not null,
  comentario text,
  criado_em timestamptz default now()
);

alter table nps_surveys enable row level security;
alter table nps_responses enable row level security;

create policy "team_read_nps_surveys" on nps_surveys
  for select using (
    (select perfil from public.users where id = auth.uid()) in ('admin', 'gerente', 'atendimento', 'estrategista')
  );

create policy "admin_manage_nps_surveys" on nps_surveys
  for all using (
    (select perfil from public.users where id = auth.uid()) = 'admin'
  );

create policy "client_own_surveys" on nps_surveys
  for select using (
    client_id in (
      select ca.client_id from client_assignments ca where ca.user_id = auth.uid()
    )
  );

create policy "team_read_nps_responses" on nps_responses
  for select using (
    (select perfil from public.users where id = auth.uid()) in ('admin', 'gerente', 'atendimento', 'estrategista')
  );

create policy "client_insert_own_response" on nps_responses
  for insert with check (respondido_por = auth.uid());

create policy "client_read_own_response" on nps_responses
  for select using (respondido_por = auth.uid());
