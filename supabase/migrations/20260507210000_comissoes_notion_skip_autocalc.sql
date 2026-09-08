-- Skip auto-calc when contract was imported from Notion.
-- Imported contracts come with comissoes already populated month-by-month
-- by the notion-import edge function.
CREATE OR REPLACE FUNCTION public.calcular_comissoes_contrato(p_contrato_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  v_offset INT;
  v_primeiro_mes DATE;
  v_valor_parcela NUMERIC(12,2);
  v_valor_comissao NUMERIC(12,2);
  i INT;
BEGIN
  SELECT * INTO c FROM public.contratos WHERE id = p_contrato_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Imported from Notion: comissoes are inserted directly by the importer
  IF c.notion_page_id IS NOT NULL THEN RETURN; END IF;

  DELETE FROM public.comissoes
   WHERE contrato_id = p_contrato_id AND status = 'prevista';

  IF c.status <> 'ativo' THEN RETURN; END IF;
  IF c.num_parcelas IS NULL OR c.num_parcelas < 1 THEN RETURN; END IF;

  v_offset := CASE WHEN EXTRACT(DAY FROM c.data_fechamento) <= 15 THEN 1 ELSE 2 END;
  v_primeiro_mes := date_trunc('month', c.data_fechamento + (v_offset || ' months')::interval)::date;

  v_valor_parcela := round(c.valor_total / c.num_parcelas, 2);
  v_valor_comissao := round(v_valor_parcela * (c.percentual_aplicado / 100.0), 2);

  FOR i IN 1..c.num_parcelas LOOP
    INSERT INTO public.comissoes (
      contrato_id, estrategista_id, cliente_nome,
      parcela_num, total_parcelas, mes_referencia,
      valor_calculado, valor_final, status
    ) VALUES (
      c.id, c.estrategista_id, c.cliente_nome,
      i, c.num_parcelas,
      (v_primeiro_mes + ((i - 1) || ' months')::interval)::date,
      v_valor_comissao, v_valor_comissao, 'prevista'
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calcular_comissoes_contrato(UUID) FROM anon, authenticated;

-- Allow estrategista_id to be NULL temporarily for unmapped imports
ALTER TABLE public.contratos ALTER COLUMN estrategista_id DROP NOT NULL;

-- Add unique key for idempotent comissao import per (contrato, mês)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_comissoes_contrato_mes_parcela
  ON public.comissoes(contrato_id, mes_referencia, parcela_num);
