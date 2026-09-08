-- Onda 2 — data_pagamento derivada da entrada.
-- Aplicada em produção em 27/07/2026 via Management API.
--
-- A entrada vive em contratos.pagamentos (jsonb), no formato que o onboarding grava:
--   [{ "sinal": "Entrada", "data": "2026-05-15", "valor": 28000, ... }]
-- Derivar no banco (em vez de no front) cobre o onboarding E a edição manual do contrato.
CREATE OR REPLACE FUNCTION public.tg_set_data_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_data date;
BEGIN
  IF NEW.pagamentos IS NULL OR jsonb_typeof(NEW.pagamentos) <> 'array' THEN
    RETURN NEW;
  END IF;

  -- Primeira parcela marcada como "Entrada" que tenha data utilizável.
  SELECT (p->>'data')::date
    INTO v_data
    FROM jsonb_array_elements(NEW.pagamentos) AS p
   WHERE lower(coalesce(p->>'sinal','')) = 'entrada'
     AND coalesce(p->>'data','') <> ''
     AND (p->>'data') ~ '^\d{4}-\d{2}-\d{2}$'
   ORDER BY (p->>'data')::date
   LIMIT 1;

  IF v_data IS NOT NULL THEN
    NEW.data_pagamento := v_data;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_data_pagamento ON public.contratos;
CREATE TRIGGER trg_set_data_pagamento
  BEFORE INSERT OR UPDATE OF pagamentos ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_data_pagamento();

-- Backfill dos que já têm entrada registrada (23 contratos).
UPDATE public.contratos c
   SET data_pagamento = sub.data_entrada
  FROM (
    SELECT ct.id,
           MIN((p->>'data')::date) AS data_entrada
      FROM public.contratos ct
      CROSS JOIN LATERAL jsonb_array_elements(ct.pagamentos) AS p
     WHERE jsonb_typeof(ct.pagamentos) = 'array'
       AND lower(coalesce(p->>'sinal','')) = 'entrada'
       AND coalesce(p->>'data','') <> ''
       AND (p->>'data') ~ '^\d{4}-\d{2}-\d{2}$'
     GROUP BY ct.id
  ) AS sub
 WHERE c.id = sub.id
   AND c.data_pagamento IS DISTINCT FROM sub.data_entrada;
