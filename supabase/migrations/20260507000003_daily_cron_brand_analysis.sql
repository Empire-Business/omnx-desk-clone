-- Substitui o cron semanal por execução diária da análise de consultoria de marca
-- Roda todo dia às 03:00 BRT (06:00 UTC); cada execução analisa os últimos 7 dias rolando
-- Cria 1 snapshot por dia, semana_inicio = data de execução

-- Remove o cron semanal anterior
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ia-weekly-analysis-monday-3am-brt') then
    perform cron.unschedule('ia-weekly-analysis-monday-3am-brt');
  end if;
  if exists (select 1 from cron.job where jobname = 'ia-brand-analysis-daily-3am-brt') then
    perform cron.unschedule('ia-brand-analysis-daily-3am-brt');
  end if;
end $$;

select cron.schedule(
  'ia-brand-analysis-daily-3am-brt',
  '0 6 * * *',
  $cron$
  select net.http_post(
    url := 'https://seu-projeto-supabase.supabase.co/functions/v1/ia-weekly-analysis',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1em1ja2F0Ym1scGtkeHRmaHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjUxNzEsImV4cCI6MjA4ODc0MTE3MX0.dL8LHbCJv69zJtt-aA3iAEO6PMcJBHlDC1HAEu9O9Ho'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $cron$
);
