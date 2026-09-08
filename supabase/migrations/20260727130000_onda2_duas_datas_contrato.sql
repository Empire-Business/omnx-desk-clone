-- Onda 2 — duas datas do contrato (assinatura x pagamento)
-- Conforme docs/plano-datas-contratos.md §2, aprovado em 27/07/2026.
-- Aplicada em produção em 27/07/2026 via Management API.

-- 1) Colunas novas. Ambas nullable: "não sei" é um estado legítimo.
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS data_assinatura date,
  ADD COLUMN IF NOT EXISTS data_pagamento  date;

COMMENT ON COLUMN public.contratos.data_assinatura IS
  'Quando o contrato foi assinado. Preenchida pelo gatilho quando link_clicksign ganha valor.';
COMMENT ON COLUMN public.contratos.data_pagamento IS
  'Quando a entrada foi paga (fluxo de onboarding).';

CREATE INDEX IF NOT EXISTS ix_contratos_data_assinatura ON public.contratos (data_assinatura);
CREATE INDEX IF NOT EXISTS ix_contratos_data_pagamento  ON public.contratos (data_pagamento);

-- 2) Gatilho de assinatura.
--    O trigger que já existia (trg_notificar_contrato_assinado) é AFTER, e AFTER não
--    pode gravar em NEW — por isso um BEFORE dedicado, em vez de estender aquele.
CREATE OR REPLACE FUNCTION public.tg_set_data_assinatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Só age na transição vazio -> preenchido do link do Clicksign.
  IF NEW.link_clicksign IS NOT NULL AND NEW.link_clicksign <> ''
     AND (TG_OP = 'INSERT' OR OLD.link_clicksign IS NULL OR OLD.link_clicksign = '')
  THEN
    IF NEW.data_assinatura IS NULL THEN
      NEW.data_assinatura := CURRENT_DATE;
    END IF;

    -- Contrato que estava sem data real passa a valer a partir da assinatura.
    IF NEW.data_fechamento IS NULL OR NEW.data_fechamento <= DATE '1900-01-01' THEN
      NEW.data_fechamento := NEW.data_assinatura;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_data_assinatura ON public.contratos;
CREATE TRIGGER trg_set_data_assinatura
  BEFORE INSERT OR UPDATE OF link_clicksign ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_data_assinatura();

-- 3) Backfill: quem já tem Clicksign e data real herda a data como assinatura.
--    NÃO tocamos em data_fechamento aqui — mexer nela dispararia recálculo de
--    comissão em massa (contratos_calc_comissoes_upd) e mudaria números em produção.
--    Resultado: 300 de 300 contratos com Clicksign ganharam data_assinatura.
UPDATE public.contratos
   SET data_assinatura = data_fechamento
 WHERE data_assinatura IS NULL
   AND link_clicksign IS NOT NULL AND link_clicksign <> ''
   AND data_fechamento IS NOT NULL
   AND data_fechamento > DATE '1900-01-01';
