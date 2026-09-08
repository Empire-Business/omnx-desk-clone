-- Automação: contrato assinado (Clicksign) → marca a venda como GANHA (Assinada) no GHL.
--
-- Quando um contrato PASSA a ter link_clicksign, dispara a edge function
-- empire-contrato-assinado-ghl, que resolve a oportunidade do cliente no CRM Empire
-- e move o card para "Vendas SQL / Assinada / won".
--
-- Espelha o padrão de tg_notificar_contrato_assinado (mesmo disjuntor de backfill,
-- mesma detecção de transição null→preenchido). Fire-and-forget: falhas são registradas
-- em contratos.ghl_assinada_erro pela própria função, nunca quebram a escrita do contrato.

-- 1. Colunas de controle/rastreio no contrato.
alter table public.contratos
  add column if not exists ghl_assinada_sincronizada_em timestamptz,
  add column if not exists ghl_assinada_oportunidade_id  text,
  add column if not exists ghl_assinada_erro             text;

-- 2. Função de trigger.
create or replace function public.tg_ghl_marcar_assinada()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $function$
declare
  v_link_novo  text := nullif(btrim(coalesce(new.link_clicksign, '')), '');
  v_link_velho text;
  v_secret     text;
begin
  -- Disjuntor para imports/backfills em massa (mesmo flag do e-mail de assinatura):
  --   SET LOCAL app.skip_contrato_notify = 'on';  antes do lote.
  if coalesce(current_setting('app.skip_contrato_notify', true), '') = 'on' then
    return new;
  end if;

  -- Só interessa quando o contrato PASSA a ter link do Clicksign.
  if v_link_novo is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_link_velho := nullif(btrim(coalesce(old.link_clicksign, '')), '');
    if v_link_velho is not null then
      return new;  -- já tinha link antes; não é uma nova assinatura
    end if;
  end if;

  -- Idempotência: não redispara se já foi sincronizado com sucesso.
  if new.ghl_assinada_sincronizada_em is not null then
    return new;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'notify_webhook_secret';

  -- Chamada assíncrona (pg_net enfileira e envia após o commit).
  -- Authorization usa a anon key (pública) só para passar o gateway;
  -- a autorização real é o header x-notify-secret.
  perform net.http_post(
    url := 'https://wuzmckatbmlpkdxtfhqr.supabase.co/functions/v1/empire-contrato-assinado-ghl',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1em1ja2F0Ym1scGtkeHRmaHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjUxNzEsImV4cCI6MjA4ODc0MTE3MX0.dL8LHbCJv69zJtt-aA3iAEO6PMcJBHlDC1HAEu9O9Ho',
      'x-notify-secret', v_secret
    ),
    body := jsonb_build_object('contrato_id', new.id),
    timeout_milliseconds := 60000
  );

  return new;
end $function$;

-- 3. Trigger: dispara na criação com link já presente ou quando o link passa a existir.
drop trigger if exists trg_ghl_marcar_assinada on public.contratos;
create trigger trg_ghl_marcar_assinada
  after insert or update of link_clicksign on public.contratos
  for each row execute function public.tg_ghl_marcar_assinada();
