-- =====================================================================
-- Propaga troca de estrategista para comissões previstas
--
-- 1. Adiciona estrategista_id na lista de campos que disparam o trigger
--    de recálculo de comissões.
-- 2. Reescreve calcular_comissoes_contrato:
--    - Contratos do Notion (notion_page_id IS NOT NULL):
--        apenas reatribui o estrategista_id das comissões 'prevista',
--        sem recalcular valores (preserva importação).
--    - Contratos nativos:
--        deleta previstas e recalcula igual antes.
--
-- Resultado: pagas/aprovadas ficam com o estrategista antigo (histórico).
-- Previstas migram para o novo estrategista automaticamente.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.calcular_comissoes_contrato(p_contrato_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  pc RECORD;
  v_offset INT;
  v_primeiro_mes DATE;
  v_valor_parcela NUMERIC(12,2);
  v_valor_comissao NUMERIC(12,2);
  i INT;
BEGIN
  SELECT * INTO c FROM public.contratos WHERE id = p_contrato_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Contratos do Notion: não recalcula valores, só reatribui estrategista das previstas
  IF c.notion_page_id IS NOT NULL THEN
    IF c.estrategista_id IS NOT NULL THEN
      UPDATE public.comissoes
         SET estrategista_id = c.estrategista_id,
             cliente_nome    = c.cliente_nome
       WHERE contrato_id = p_contrato_id
         AND status = 'prevista'
         AND estrategista_id IS DISTINCT FROM c.estrategista_id;
    END IF;
    RETURN;
  END IF;

  DELETE FROM public.comissoes
   WHERE contrato_id = p_contrato_id AND status = 'prevista';

  IF c.status <> 'ativo' THEN RETURN; END IF;
  IF c.num_parcelas IS NULL OR c.num_parcelas < 1 THEN RETURN; END IF;
  IF c.estrategista_id IS NULL THEN RETURN; END IF;

  v_offset := CASE WHEN EXTRACT(DAY FROM c.data_fechamento) <= 15 THEN 1 ELSE 2 END;
  v_primeiro_mes := date_trunc('month', c.data_fechamento + (v_offset || ' months')::interval)::date;

  v_valor_parcela := round(c.valor_total / c.num_parcelas, 2);

  SELECT tipo_comissao, valor_comissao_padrao, percentual_padrao
    INTO pc
    FROM public.produtos_comissao
   WHERE produto_id = c.produto_id;

  IF FOUND AND pc.tipo_comissao = 'valor_fixo' THEN
    v_valor_comissao := pc.valor_comissao_padrao;
  ELSIF FOUND AND pc.tipo_comissao = 'percentual' THEN
    v_valor_comissao := round(v_valor_parcela * (pc.percentual_padrao / 100.0), 2);
  ELSE
    v_valor_comissao := round(v_valor_parcela * (c.percentual_aplicado / 100.0), 2);
  END IF;

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

-- Trigger agora também dispara em troca de estrategista_id
DROP TRIGGER IF EXISTS contratos_calc_comissoes_upd ON public.contratos;
CREATE TRIGGER contratos_calc_comissoes_upd
  AFTER UPDATE OF data_fechamento, valor_total, num_parcelas, percentual_aplicado, status, produto_id, estrategista_id
  ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.trg_calcular_comissoes();

COMMIT;
