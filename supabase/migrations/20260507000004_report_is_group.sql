-- Adiciona flag para distinguir relatorios de grupos vs conversas privadas
alter table public.chat_weekly_reports
  add column if not exists is_group boolean default false;

comment on column public.chat_weekly_reports.is_group is 'True quando a analise se refere a uma conversa de grupo no WhatsApp; false para conversa privada';
