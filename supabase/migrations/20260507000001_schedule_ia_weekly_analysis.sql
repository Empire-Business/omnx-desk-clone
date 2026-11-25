-- Agenda execução semanal da edge function ia-weekly-analysis
-- Roda toda segunda-feira às 03:00 BRT (06:00 UTC)
-- Gera relatórios da semana anterior (segunda a domingo)

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove agendamento anterior se existir (idempotência)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ia-weekly-analysis-monday-3am-brt') then
    perform cron.unschedule('ia-weekly-analysis-monday-3am-brt');
  end if;
end $$;

select cron.schedule(
  'ia-weekly-analysis-monday-3am-brt',
  '0 6 * * 1',
  $cron$
  select net.http_post(
    url := 'https://seu-projeto-supabase.supabase.co/functions/v1/ia-weekly-analysis',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1em1ja2F0Ym1scGtkeHRmaHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjUxNzEsImV4cCI6MjA4ODc0MTE3MX0.dL8LHbCJv69zJtt-aA3iAEO6PMcJBHlDC1HAEu9O9Ho'
    ),
    body := jsonb_build_object(
      'start_date', to_char(((now() at time zone 'America/Sao_Paulo')::date - 7), 'YYYY-MM-DD'),
      'end_date',   to_char(((now() at time zone 'America/Sao_Paulo')::date - 1), 'YYYY-MM-DD')
    ),
    timeout_milliseconds := 150000
  );
  $cron$
);
