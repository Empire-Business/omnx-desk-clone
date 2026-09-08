-- Automação: venda editada no Desk → atualiza a venda no CRM (dashboard).
--
-- Problema que resolve: o envio ao CRM só acontecia no clique do botão. Editar a venda
-- depois de sincronizada deixava o CRM com o número velho, em silêncio, para sempre.
-- Caso real: Thiago Muniz — enviado em 03/07/2026 com 12 pagamentos (R$ 84.000) e
-- editado 24 minutos depois para 2 pagamentos (R$ 24.000). O dashboard exibiu R$ 84.000
-- por mais de um mês, inflando o faturamento de julho em R$ 60.000.
--
-- Espelha o padrão de trg_ghl_marcar_assinada: pg_net + x-notify-secret do Vault,
-- fire-and-forget (falha vira vendas_pendentes.sincronizacao_erro, nunca quebra a escrita).

create or replace function public.tg_venda_ressincronizar_crm()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $function$
declare
  v_secret text;
  v_antes  jsonb;
  v_depois jsonb;
begin
  -- Disjuntor para imports/backfills em massa:
  --   SET LOCAL app.skip_venda_resync = 'on';  antes do lote.
  if coalesce(current_setting('app.skip_venda_resync', true), '') = 'on' then
    return new;
  end if;

  -- Só ressincroniza venda que JÁ foi vinculada por uma pessoa. Venda sem vínculo
  -- não tem para onde ir: continua na fila de pendência de vínculo, como hoje.
  if new.ghl_oportunidade_id is null or new.sincronizado_em is null then
    return new;
  end if;

  -- Compara APENAS os campos que a ponte envia ao CRM. Sem este recorte, o próprio
  -- UPDATE de controle da função (sincronizado_em, ghl_venda_id, sincronizacao_erro)
  -- redispararia o trigger — laço infinito de chamadas HTTP.
  v_antes := jsonb_build_object(
    'cliente_nome',        old.cliente_nome,
    'cliente_cpf_cnpj',    old.cliente_cpf_cnpj,
    'cliente_logradouro',  old.cliente_logradouro,
    'cliente_endereco',    old.cliente_endereco,
    'cliente_numero',      old.cliente_numero,
    'cliente_complemento', old.cliente_complemento,
    'cliente_bairro',      old.cliente_bairro,
    'cliente_municipio',   old.cliente_municipio,
    'cliente_uf',          old.cliente_uf,
    'cliente_cep',         old.cliente_cep,
    'produto_nome',        old.produto_nome,
    'observacoes',         old.observacoes,
    'closer_nome',         old.closer_nome,
    'closer_email',        old.closer_email,
    'pagamentos',          old.pagamentos,
    'comprovantes',        old.comprovantes
  );
  v_depois := jsonb_build_object(
    'cliente_nome',        new.cliente_nome,
    'cliente_cpf_cnpj',    new.cliente_cpf_cnpj,
    'cliente_logradouro',  new.cliente_logradouro,
    'cliente_endereco',    new.cliente_endereco,
    'cliente_numero',      new.cliente_numero,
    'cliente_complemento', new.cliente_complemento,
    'cliente_bairro',      new.cliente_bairro,
    'cliente_municipio',   new.cliente_municipio,
    'cliente_uf',          new.cliente_uf,
    'cliente_cep',         new.cliente_cep,
    'produto_nome',        new.produto_nome,
    'observacoes',         new.observacoes,
    'closer_nome',         new.closer_nome,
    'closer_email',        new.closer_email,
    'pagamentos',          new.pagamentos,
    'comprovantes',        new.comprovantes
  );

  if v_antes is not distinct from v_depois then
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
    url := 'https://wuzmckatbmlpkdxtfhqr.supabase.co/functions/v1/vendas-ressincronizar-crm',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1em1ja2F0Ym1scGtkeHRmaHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjUxNzEsImV4cCI6MjA4ODc0MTE3MX0.dL8LHbCJv69zJtt-aA3iAEO6PMcJBHlDC1HAEu9O9Ho',
      'x-notify-secret', v_secret
    ),
    body := jsonb_build_object('venda_id', new.id),
    timeout_milliseconds := 60000
  );

  return new;
end $function$;

comment on function public.tg_venda_ressincronizar_crm() is
  'Reenvia ao CRM a venda já vinculada sempre que um campo que vai ao CRM muda. Disjuntor: app.skip_venda_resync=on.';

drop trigger if exists trg_venda_ressincronizar_crm on public.vendas_pendentes;
create trigger trg_venda_ressincronizar_crm
  after update on public.vendas_pendentes
  for each row execute function public.tg_venda_ressincronizar_crm();
