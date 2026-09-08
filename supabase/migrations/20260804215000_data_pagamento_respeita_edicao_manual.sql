-- A data de pagamento do contrato passa a aceitar correção à mão.
--
-- Problema que resolve: tg_set_data_pagamento recalculava a data a partir do cronograma
-- em TODA gravação. Com o campo agora editável na tela de detalhe do contrato, isso
-- tornaria o campo inútil — a pessoa digitava, salvava, e o gatilho desfazia na hora.
-- Como a lista de contratos passou a ser ordenada por essa data, contrato sem entrada
-- registrada ficaria preso no fim da lista sem jeito de corrigir.
--
-- Regra nova: o gatilho só age quando a data está vazia ou quando o próprio cronograma
-- de pagamentos mudou. Edição manual com cronograma intacto é preservada.

create or replace function public.tg_set_data_pagamento()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_data date;
begin
  if new.pagamentos is null or jsonb_typeof(new.pagamentos) <> 'array' then
    return new;
  end if;

  -- Edição manual da data, com o cronograma intacto: respeita o que a pessoa digitou.
  if tg_op = 'UPDATE'
     and new.data_pagamento is not null
     and old.pagamentos is not distinct from new.pagamentos
  then
    return new;
  end if;

  -- Primeira parcela marcada como "Entrada" que tenha data utilizável.
  select (p->>'data')::date
    into v_data
    from jsonb_array_elements(new.pagamentos) as p
   where lower(coalesce(p->>'sinal','')) = 'entrada'
     and coalesce(p->>'data','') <> ''
     and (p->>'data') ~ '^\d{4}-\d{2}-\d{2}$'
   order by (p->>'data')::date
   limit 1;

  if v_data is not null then
    new.data_pagamento := v_data;
  end if;

  return new;
end;
$function$;

comment on function public.tg_set_data_pagamento() is
  'Preenche contratos.data_pagamento a partir da entrada do cronograma, sem sobrescrever edição manual feita na tela.';
