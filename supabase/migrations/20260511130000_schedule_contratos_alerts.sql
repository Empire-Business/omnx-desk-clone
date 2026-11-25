-- Agenda contratos-alerts pra rodar diariamente às 09:00 BRT (12:00 UTC).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'contratos-alerts-daily-9am-brt') then
    perform cron.unschedule('contratos-alerts-daily-9am-brt');
  end if;
end $$;

select cron.schedule(
  'contratos-alerts-daily-9am-brt',
  '0 12 * * *',
  $cron$
  select net.http_post(
    url := 'https://seu-projeto-supabase.supabase.co/functions/v1/contratos-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1em1ja2F0Ym1scGtkeHRmaHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjUxNzEsImV4cCI6MjA4ODc0MTE3MX0.dL8LHbCJv69zJtt-aA3iAEO6PMcJBHlDC1HAEu9O9Ho'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
