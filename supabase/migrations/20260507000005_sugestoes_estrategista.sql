-- Adiciona campo de sugestoes de melhoria para o estrategista (acionavel)
alter table public.chat_weekly_reports
  add column if not exists sugestoes_estrategista text[] default '{}'::text[];

comment on column public.chat_weekly_reports.sugestoes_estrategista is 'Sugestoes praticas geradas pela IA sobre como o estrategista pode melhorar a abordagem com este cliente especifico';
