-- Renumeração de parcelas: aceitar também o rótulo "Parcela" sem número.
--
-- A versão de `20260805120000` só reconhecia "Parcela N". Uma linha rotulada
-- apenas "Parcela" — o que acontece quando alguém cadastra sem numerar — passava
-- batido e ficava sem número para sempre.
--
-- Descoberto na prática ao lançar as 9 parcelas do Thiago Muniz (05/08/2026):
-- entraram como "Parcela" e o cronograma ficou
-- "Parcela 1 | Parcela | Parcela | ..." em vez de 1..10.
--
-- Agora o padrão aceita as duas formas e numera 1..N por ordem de vencimento.

CREATE OR REPLACE FUNCTION public.renumerar_parcelas_pagamentos(p_pagamentos jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN p_pagamentos IS NULL
      OR jsonb_typeof(p_pagamentos) <> 'array'
      OR jsonb_array_length(p_pagamentos) = 0
    THEN p_pagamentos
    ELSE (
      WITH itens AS (
        SELECT
          e.value AS item,
          e.ord,
          (e.value->>'sinal') ~* '^\s*parcela(\s+[0-9]+)?\s*$' AS eh_parcela,
          CASE
            WHEN (e.value->>'data') ~ '^\d{4}-\d{2}-\d{2}'
            THEN (e.value->>'data')::date
          END AS dt
        FROM jsonb_array_elements(p_pagamentos) WITH ORDINALITY AS e(value, ord)
      ),
      numeradas AS (
        SELECT
          item, ord, eh_parcela,
          ROW_NUMBER() OVER (PARTITION BY eh_parcela ORDER BY dt NULLS LAST, ord) AS n
        FROM itens
      )
      SELECT jsonb_agg(
               CASE
                 WHEN eh_parcela
                 THEN jsonb_set(item, '{sinal}', to_jsonb('Parcela ' || n::text))
                 ELSE item
               END
               ORDER BY ord
             )
      FROM numeradas
    )
  END;
$$;

-- Backfill: só as linhas que realmente mudam, para não disparar ressincronização
-- em massa com o CRM.
UPDATE public.contratos
   SET pagamentos = public.renumerar_parcelas_pagamentos(pagamentos)
 WHERE pagamentos IS DISTINCT FROM public.renumerar_parcelas_pagamentos(pagamentos);

UPDATE public.vendas_pendentes
   SET pagamentos = public.renumerar_parcelas_pagamentos(pagamentos)
 WHERE pagamentos IS DISTINCT FROM public.renumerar_parcelas_pagamentos(pagamentos);
