-- Expande o array de campos auditados para cobrir todos os campos editáveis do contrato
CREATE OR REPLACE FUNCTION public.audit_contratos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
  v_campos TEXT[] := ARRAY[
    -- Dados do cliente
    'cliente_nome','empresa','cpf_cnpj','whatsapp','email','instagram',
    'nicho','faturamento','endereco','posicionamento','resumo',
    -- Contrato e financeiro
    'produto_nome','status','status_secundario','data_fechamento','vencimento',
    'plano_dias','semanas','renovacao',
    'valor_total','valor_parcela','num_parcelas','percentual_aplicado',
    'entrada','pg_entrada','forma_pagamento','fat_bruto','bonus','link_clicksign',
    'venda_interna','venda_diretoria',
    -- Pessoas
    'estrategista_id','estrategista_nome_raw','vendedor','treinador',
    -- Métricas
    'seguidores_inicio','seguidores_fim','crescimento_seguidores',
    'videos_postados','entregas_no_prazo','entregas_totais','nps_vip',
    -- Sistema
    'observacoes','cliente_id'
  ];
  v_campo TEXT;
  v_old  TEXT;
  v_new  TEXT;
BEGIN
  v_user := COALESCE(auth.uid(), NULL);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.contratos_audit_log (contrato_id, operacao, alterado_por)
    VALUES (NEW.id, 'INSERT', v_user);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.contratos_audit_log (contrato_id, operacao, alterado_por)
    VALUES (OLD.id, 'DELETE', v_user);
    RETURN OLD;
  END IF;

  -- UPDATE: registra apenas os campos que mudaram
  FOREACH v_campo IN ARRAY v_campos LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_campo, v_campo)
      INTO v_old, v_new USING OLD, NEW;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO public.contratos_audit_log
        (contrato_id, operacao, campo, valor_antigo, valor_novo, alterado_por)
      VALUES (NEW.id, 'UPDATE', v_campo, v_old, v_new, v_user);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
