-- Onda 2 — guarda da sentinela no cálculo de comissão.
-- Aplicada em produção em 27/07/2026 via Management API.
--
-- Contrato sem data real (sentinela 1900-01-01) não pode gerar comissão prevista:
-- a data é a base do mês de referência, então a previsão sairia errada.
-- Única mudança em relação à versão anterior da função: o bloco marcado GUARDA DA SENTINELA.
-- Comissões com status 'paga' continuam intocadas (o DELETE só alcança 'prevista').
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

  -- >>> GUARDA DA SENTINELA (nova) <<<
  -- Sem data real não há mês de referência confiável. As previstas já foram
  -- apagadas acima; as pagas nunca são tocadas.
  IF c.data_fechamento IS NULL OR c.data_fechamento <= DATE '1900-01-01' THEN
    RETURN;
  END IF;

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
