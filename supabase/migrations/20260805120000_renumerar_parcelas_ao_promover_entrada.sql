-- Renumeração automática das parcelas do cronograma de pagamentos.
--
-- Problema que motivou (julho/2026): quando alguém corrige o cronograma e troca o
-- rótulo de uma parcela para "Entrada", as parcelas seguintes ficam com a
-- numeração antiga — sobra um buraco. Casos reais encontrados em produção:
--
--   Augusto Kraemer  Entrada | Parcela 1 (17.000, que na verdade era entrada) | Parcela 2..12
--   Victor Lacôrte   Entrada | Parcela 2 | Parcela 3 ... Parcela 11   <- sem Parcela 1
--
-- Além de feio, isso desalinha a venda do contrato e vaza para o CRM, que exibe o
-- rótulo no detalhamento de caixa.
--
-- A regra: as linhas de "Entrada" ficam como estão; as que casam com "Parcela N"
-- são renumeradas 1..N na ordem de vencimento. Rótulos fora desses dois padrões
-- ("Sinal", "Pagamento pix", "Pagamento cartão 1"...) NÃO são tocados — existem em
-- contratos antigos e não seguem numeração.
--
-- Idempotente por construção: cronograma já correto sai igual ao que entrou, então
-- o trigger não marca a linha como alterada nem dispara ressincronização à toa.

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
          (e.value->>'sinal') ~* '^\s*parcela\s+[0-9]+\s*$' AS eh_parcela,
          CASE
            WHEN (e.value->>'data') ~ '^\d{4}-\d{2}-\d{2}'
            THEN (e.value->>'data')::date
          END AS dt
        FROM jsonb_array_elements(p_pagamentos) WITH ORDINALITY AS e(value, ord)
      ),
      numeradas AS (
        SELECT
          item, ord, eh_parcela,
          -- Ordena por vencimento; `ord` desempata datas iguais e mantém estável
          -- a ordem de quem está sem data.
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

COMMENT ON FUNCTION public.renumerar_parcelas_pagamentos(jsonb) IS
  'Renumera as linhas "Parcela N" do cronograma em 1..N por ordem de vencimento. '
  'Linhas de "Entrada" e rótulos livres passam intactos. Idempotente.';

CREATE OR REPLACE FUNCTION public.tg_renumerar_parcelas_pagamentos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.pagamentos := public.renumerar_parcelas_pagamentos(NEW.pagamentos);
  RETURN NEW;
END;
$$;

-- BEFORE, para a linha já ser gravada normalizada — assim os triggers seguintes
-- (data_pagamento, ressincronização com o CRM) enxergam o cronograma final.
DROP TRIGGER IF EXISTS trg_renumerar_parcelas_contratos ON public.contratos;
CREATE TRIGGER trg_renumerar_parcelas_contratos
  BEFORE INSERT OR UPDATE OF pagamentos ON public.contratos
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_renumerar_parcelas_pagamentos();

DROP TRIGGER IF EXISTS trg_renumerar_parcelas_vendas_pendentes ON public.vendas_pendentes;
CREATE TRIGGER trg_renumerar_parcelas_vendas_pendentes
  BEFORE INSERT OR UPDATE OF pagamentos ON public.vendas_pendentes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_renumerar_parcelas_pagamentos();

-- Backfill do que já está torto hoje. Sem WHERE amplo: só toca a linha cujo
-- cronograma realmente muda, para não disparar ressincronização em massa.
UPDATE public.contratos
   SET pagamentos = public.renumerar_parcelas_pagamentos(pagamentos)
 WHERE pagamentos IS DISTINCT FROM public.renumerar_parcelas_pagamentos(pagamentos);

UPDATE public.vendas_pendentes
   SET pagamentos = public.renumerar_parcelas_pagamentos(pagamentos)
 WHERE pagamentos IS DISTINCT FROM public.renumerar_parcelas_pagamentos(pagamentos);
