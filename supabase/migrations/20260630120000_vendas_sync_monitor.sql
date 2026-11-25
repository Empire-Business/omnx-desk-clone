-- Monitor de sincronização de vendas EmpireDesk → GHL.
-- 1) Tabela de estado (guarda a assinatura do último quadro de problemas, p/ anti-spam).
-- 2) Agenda a edge function vendas-sync-monitor 1x/dia às 09:00 BRT (12:00 UTC).

-- ── 1. Estado do monitor ─────────────────────────────────────────────────────
create table if not exists public.sync_monitor_estado (
  id            int primary key,
  assinatura    text not null default '',
  atualizado_em timestamptz not null default now()
);

-- Só a service role (edge function) toca nesta tabela. RLS ligada sem policy =
-- ninguém via API pública lê/escreve; a service role faz bypass.
alter table public.sync_monitor_estado enable row level security;

-- ── 2. Agendamento (cron) ────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'vendas-sync-monitor-daily-9am-brt') then
    perform cron.unschedule('vendas-sync-monitor-daily-9am-brt');
  end if;
end $$;

select cron.schedule(
  'vendas-sync-monitor-daily-9am-brt',
  '0 12 * * *',
  $cron$
  select net.http_post(
    url := 'https://seu-projeto-supabase.supabase.co/functions/v1/vendas-sync-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1em1ja2F0Ym1scGtkeHRmaHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjUxNzEsImV4cCI6MjA4ODc0MTE3MX0.dL8LHbCJv69zJtt-aA3iAEO6PMcJBHlDC1HAEu9O9Ho'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
