
create table if not exists learning_paths (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  tipo text not null default 'interno' check (tipo in ('interno', 'cliente')),
  thumbnail_url text,
  ativo boolean default true,
  ordem integer default 0,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists learning_modules (
  id uuid primary key default gen_random_uuid(),
  path_id uuid references learning_paths(id) on delete cascade not null,
  titulo text not null,
  descricao text,
  ordem integer default 0,
  criado_em timestamptz default now()
);

create table if not exists learning_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references learning_modules(id) on delete cascade not null,
  titulo text not null,
  descricao text,
  tipo text not null default 'video' check (tipo in ('video', 'texto', 'pdf', 'link')),
  conteudo_url text,
  conteudo_texto text,
  duracao_minutos integer,
  ordem integer default 0,
  criado_em timestamptz default now()
);

create table if not exists learning_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  path_id uuid references learning_paths(id) on delete cascade not null,
  criado_em timestamptz default now(),
  unique(user_id, path_id)
);

create table if not exists learning_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  lesson_id uuid references learning_lessons(id) on delete cascade not null,
  concluido boolean default false,
  concluido_em timestamptz,
  criado_em timestamptz default now(),
  unique(user_id, lesson_id)
);

alter table learning_paths enable row level security;
alter table learning_modules enable row level security;
alter table learning_lessons enable row level security;
alter table learning_enrollments enable row level security;
alter table learning_progress enable row level security;

-- learning_paths: admin gerencia; equipe vê interno; cliente vê cliente
create policy "admin_manage_paths" on learning_paths
  for all using ((select perfil from public.users where id = auth.uid()) = 'admin');

create policy "team_read_internal_paths" on learning_paths
  for select using (
    tipo = 'interno' and
    (select perfil from public.users where id = auth.uid()) in ('admin','gerente','estrategista','atendimento')
  );

create policy "client_read_client_paths" on learning_paths
  for select using (
    tipo = 'cliente' and
    (select perfil from public.users where id = auth.uid()) = 'cliente'
  );

-- modules e lessons: seguem a trilha
create policy "read_modules" on learning_modules
  for select using (
    path_id in (select id from learning_paths)
  );

create policy "admin_manage_modules" on learning_modules
  for all using ((select perfil from public.users where id = auth.uid()) = 'admin');

create policy "read_lessons" on learning_lessons
  for select using (
    module_id in (select id from learning_modules)
  );

create policy "admin_manage_lessons" on learning_lessons
  for all using ((select perfil from public.users where id = auth.uid()) = 'admin');

-- enrollments e progress: próprio usuário
create policy "own_enrollments" on learning_enrollments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own_progress" on learning_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
