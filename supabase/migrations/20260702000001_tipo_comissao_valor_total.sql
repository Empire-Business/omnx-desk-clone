-- Novo tipo de comissão "valor_total": o valor cadastrado é o TOTAL do contrato,
-- dividido igualmente pelas parcelas na geração das comissões previstas.
-- (O "valor_fixo" segue sendo por parcela — Black/Gold/Platinum dependem disso.)

ALTER TABLE public.produtos_comissao DROP CONSTRAINT produtos_comissao_tipo_comissao_check;
ALTER TABLE public.produtos_comissao ADD CONSTRAINT produtos_comissao_tipo_comissao_check
  CHECK (tipo_comissao = ANY (ARRAY['valor_fixo'::text, 'percentual'::text, 'valor_total'::text]));

CREATE OR REPLACE FUNCTION public.calcular_comissoes_contrato(p_contrato_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD;
  pc RECORD;
  v_offset INT;
  v_primeiro_mes DATE;
  v_valor_parcela NUMERIC(12,2);
  v_valor_comissao NUMERIC(12,2);
  v_mes_bonus DATE;
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

  SELECT tipo_comissao, valor_comissao_padrao, percentual_padrao, valor_bonus, bonus_condicional
    INTO pc
    FROM public.produtos_comissao
   WHERE produto_id = c.produto_id;

  IF FOUND AND pc.tipo_comissao = 'valor_fixo' THEN
    v_valor_comissao := pc.valor_comissao_padrao;
  ELSIF FOUND AND pc.tipo_comissao = 'valor_total' THEN
    v_valor_comissao := round(pc.valor_comissao_padrao / c.num_parcelas, 2);
  ELSIF FOUND AND pc.tipo_comissao = 'percentual' THEN
    v_valor_comissao := round(v_valor_parcela * (pc.percentual_padrao / 100.0), 2);
  ELSE
    v_valor_comissao := round(v_valor_parcela * (c.percentual_aplicado / 100.0), 2);
  END IF;

  FOR i IN 1..c.num_parcelas LOOP
    INSERT INTO public.comissoes (
      contrato_id, estrategista_id, cliente_nome,
      parcela_num, total_parcelas, mes_referencia,
      valor_calculado, valor_final, status, eh_bonus
    ) VALUES (
      c.id, c.estrategista_id, c.cliente_nome,
      i, c.num_parcelas,
      (v_primeiro_mes + ((i - 1) || ' months')::interval)::date,
      v_valor_comissao, v_valor_comissao, 'prevista', false
    );
  END LOOP;

  -- Bônus do produto (ex.: Acelerador de Marca = R$500 "se não cancelar").
  -- Entra como 1 linha prevista na competência da última parcela. Se o contrato
  -- for cancelado, esta linha (prevista) é removida — respeitando "só paga se não cancelar".
  IF FOUND AND COALESCE(pc.valor_bonus, 0) > 0 THEN
    v_mes_bonus := (v_primeiro_mes + ((c.num_parcelas - 1) || ' months')::interval)::date;
    INSERT INTO public.comissoes (
      contrato_id, estrategista_id, cliente_nome,
      parcela_num, total_parcelas, mes_referencia,
      valor_calculado, valor_final, status, eh_bonus
    ) VALUES (
      c.id, c.estrategista_id, c.cliente_nome,
      c.num_parcelas + 1, c.num_parcelas, v_mes_bonus,
      pc.valor_bonus, pc.valor_bonus, 'prevista', true
    );
  END IF;
END;
$function$;
