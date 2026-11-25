-- Aquecimento de chip via WhatsApp: instâncias conversam entre si em um grupo
-- para "esquentar" números novos e reduzir risco de ban.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- ============================================================
-- Tabelas
-- ============================================================

create table if not exists public.wa_warmup_groups (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  wa_chatid text not null,
  instance_ids text[] not null default '{}',
  frases jsonb not null default '[]'::jsonb,
  intervalo_min_seg int not null default 480,    -- 8 min
  intervalo_max_seg int not null default 1500,   -- 25 min
  horario_inicio time not null default '09:00',
  horario_fim    time not null default '21:00',
  ativo bool not null default false,
  ultima_mensagem_em  timestamptz,
  proxima_mensagem_em timestamptz,
  criado_em  timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.wa_warmup_logs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.wa_warmup_groups(id) on delete cascade,
  instance_id text not null,
  mensagem text not null,
  uazapi_response jsonb,
  sucesso bool not null default true,
  enviado_em timestamptz not null default now()
);

create index if not exists idx_wa_warmup_logs_group_time
  on public.wa_warmup_logs (group_id, enviado_em desc);

-- ============================================================
-- RLS — somente admin gerencia e visualiza
-- ============================================================

alter table public.wa_warmup_groups enable row level security;
alter table public.wa_warmup_logs   enable row level security;

drop policy if exists "admin_all_warmup_groups" on public.wa_warmup_groups;
create policy "admin_all_warmup_groups" on public.wa_warmup_groups
  for all using (
    exists (select 1 from public.users where id = auth.uid() and perfil = 'admin')
  ) with check (
    exists (select 1 from public.users where id = auth.uid() and perfil = 'admin')
  );

drop policy if exists "admin_read_warmup_logs" on public.wa_warmup_logs;
create policy "admin_read_warmup_logs" on public.wa_warmup_logs
  for select using (
    exists (select 1 from public.users where id = auth.uid() and perfil = 'admin')
  );

-- ============================================================
-- Seed: grupo "Teste" com Suporte 2 / 3 / 4 e 30 frases sobre Vasco
-- ============================================================

insert into public.wa_warmup_groups (
  nome, wa_chatid, instance_ids, frases,
  intervalo_min_seg, intervalo_max_seg,
  horario_inicio, horario_fim, ativo
) values (
  'Teste',
  '120363000000000422@g.us',
  array['Cami', 'empire3', 'Suporte4'],
  $json$[
    "Vasco campeão! 🦅",
    "Que jogo do Vasco ontem hein",
    "Tô confiante no Vasco esse ano",
    "Vasco da Gama é amor ❤️🖤",
    "Cadê os vascaínos aí?",
    "Vasco vai longe esse campeonato",
    "São Januário é um caldeirão",
    "Acabei de ver o gol do Vasco kkkk",
    "Esse time tá jogando bem demais",
    "Vasco sempre Vasco",
    "Bora pra cima Vasco!",
    "O time tá afiado essa semana",
    "Vasco da Gama é tradição",
    "Quem viu o jogo ontem?",
    "Vasco no meu coração 🦅",
    "Bora vascaínos!",
    "Esse ano é nosso, anota aí",
    "Vasco gigante da colina",
    "Cruz de Malta é vida",
    "Tomara que o Vasco vença domingo",
    "Vasco é raça e amor",
    "Fala turma, e o Vasco hoje?",
    "Time tá entrosando bonito",
    "Vasco eterno",
    "Tô assistindo o jogo agora",
    "Empate amargo viu, mas segue",
    "Vasco joga bonito quando quer",
    "Bora torcer juntos pessoal",
    "São Januário lotado hoje",
    "Vasco é minha paixão desde criança"
  ]$json$::jsonb,
  480, 1500,
  '09:00', '21:00',
  false
)
on conflict do nothing;

-- ============================================================
-- Cron: roda a cada 1 minuto, função decide se envia
-- ============================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'wa-warmup-tick-every-min') then
    perform cron.unschedule('wa-warmup-tick-every-min');
  end if;
end $$;

select cron.schedule(
  'wa-warmup-tick-every-min',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://seu-projeto-supabase.supabase.co/functions/v1/wa-warmup-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1em1ja2F0Ym1scGtkeHRmaHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjUxNzEsImV4cCI6MjA4ODc0MTE3MX0.dL8LHbCJv69zJtt-aA3iAEO6PMcJBHlDC1HAEu9O9Ho'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
