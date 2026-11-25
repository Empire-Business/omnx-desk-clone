-- Automação: contrato mudou no Desk → reenvia a venda ao CRM (dashboard).
--
-- Problema que resolve: o dashboard do CRM listava como "sem contrato assinado" vendas
-- cujo contrato estava ATIVO aqui. O CRM não recebia nada sobre contratos — só via a
-- etapa do card no funil, que não muda quando o contrato é fechado fora do Clicksign.
-- Eram 17 contratos ativos sem link de assinatura aparecendo como pendentes lá.
--
-- Par do trg_venda_ressincronizar_crm (migration 20260804190000): aquele vigia a venda,
-- este vigia o contrato. Ambos chamam a mesma edge function e respeitam o mesmo
-- disjuntor app.skip_venda_resync, para que um backfill em massa não dispare milhares
-- de chamadas HTTP.

create or replace function public.tg_contrato_ressincronizar_venda_crm()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $function$
declare
  v_secret text;
  v_venda  record;
begin
  -- Disjuntor para imports/backfills em massa:
  --   SET LOCAL app.skip_venda_resync = 'on';  antes do lote.
  if coalesce(current_setting('app.skip_venda_resync', true), '') = 'on' then
    return new;
  end if;

  -- Sem venda vinculada não há o que atualizar no CRM.
  if new.venda_pendente_id is null then
    return new;
  end if;

  -- Só interessa quando algo que o CRM exibe muda. Sem este recorte, qualquer edição
  -- do contrato (valor, produto, tag) viraria uma chamada HTTP inútil.
  if tg_op = 'UPDATE'
     and old.status           is not distinct from new.status
     and old.link_clicksign   is not distinct from new.link_clicksign
     and old.data_assinatura  is not distinct from new.data_assinatura
  then
    return new;
  end if;

  -- A venda precisa já estar vinculada a uma oportunidade no CRM. Venda sem vínculo
  -- não tem para onde ir: continua na fila de pendência de vínculo, como hoje.
  select id, ghl_oportunidade_id, sincronizado_em
    into v_venda
  from public.vendas_pendentes
  where id = new.venda_pendente_id;

  if v_venda.id is null or v_venda.ghl_oportunidade_id is null or v_venda.sincronizado_em is null then
    return new;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'notify_webhook_secret';

  if v_secret is null then
    return new;  -- sem secret configurado, não há como chamar: não quebra a edição
  end if;

  -- Assíncrono (pg_net enfileira e envia após o commit). O Authorization com a anon key
  -- só passa pelo gateway; a autorização real é o header x-notify-secret.
  perform net.http_post(
    url := 'https://seu-projeto-supabase.supabase.co/functions/v1/vendas-ressincronizar-crm',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1em1ja2F0Ym1scGtkeHRmaHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjUxNzEsImV4cCI6MjA4ODc0MTE3MX0.dL8LHbCJv69zJtt-aA3iAEO6PMcJBHlDC1HAEu9O9Ho',
      'x-notify-secret', v_secret
    ),
    body := jsonb_build_object('venda_id', v_venda.id),
    timeout_milliseconds := 60000
  );

  return new;
end $function$;

comment on function public.tg_contrato_ressincronizar_venda_crm() is
  'Reenvia ao CRM a venda do contrato sempre que status, link do Clicksign ou data de assinatura mudam. Disjuntor: app.skip_venda_resync=on.';

drop trigger if exists trg_contrato_ressincronizar_venda_crm on public.contratos;
create trigger trg_contrato_ressincronizar_venda_crm
  after insert or update of status, link_clicksign, data_assinatura on public.contratos
  for each row execute function public.tg_contrato_ressincronizar_venda_crm();
