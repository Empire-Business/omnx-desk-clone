-- Vigência confirmada é independente de parcelas. Nenhum contrato antigo é preenchido/encerrado aqui.
-- O agendamento nasce INATIVO; ativação/reparo são operações separadas após revisão de negócio.
BEGIN;
ALTER TABLE public.contratos
  ADD COLUMN vigencia_fim date,
  ADD COLUMN vigencia_motivo text;
COMMENT ON COLUMN public.contratos.vigencia_fim IS 'Último dia de vigência confirmado. NULL preserva acesso enquanto o prazo não for confirmado; não inferir de parcelas/vencimento legado.';
COMMENT ON COLUMN public.contratos.vigencia_motivo IS 'Motivo da confirmação/prorrogação, preservado no audit existente junto com data anterior, ator e horário.';
CREATE INDEX contratos_vigencia_ativa_idx ON public.contratos(vigencia_fim,id)
  WHERE status='ativo' AND vigencia_fim IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validar_vigencia_contrato()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.vigencia_fim IS DISTINCT FROM OLD.vigencia_fim THEN
    IF NEW.vigencia_fim IS NOT NULL THEN
      IF char_length(btrim(coalesce(NEW.vigencia_motivo,''))) NOT BETWEEN 8 AND 2000 THEN
        RAISE EXCEPTION 'Informe um motivo entre 8 e 2000 caracteres para a vigência.' USING ERRCODE='22023';
      END IF;
    END IF;
    -- Operações administrativas de reparo sem sessão são separadas e auditadas.
    -- Escritas humanas, inclusive update direto/reversão do histórico, não encurtam nem retrodatam.
    IF auth.uid() IS NOT NULL AND (TG_OP='UPDATE' OR NEW.vigencia_fim IS NOT NULL) THEN
      IF NEW.vigencia_fim IS NULL OR NEW.vigencia_fim < (now() AT TIME ZONE 'America/Sao_Paulo')::date
        OR (TG_OP='UPDATE' AND OLD.vigencia_fim IS NOT NULL AND NEW.vigencia_fim<=OLD.vigencia_fim) THEN
        RAISE EXCEPTION 'A nova vigência deve ser futura e posterior ao prazo confirmado.' USING ERRCODE='22023';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_vigencia_contrato() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER contratos_validar_vigencia BEFORE INSERT OR UPDATE OF vigencia_fim ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.validar_vigencia_contrato();

-- Mantém comissões/parcelas quando APENAS a vigência encerra ou uma prorrogação reativa.
-- Demais alterações financeiras/estrategista/status conservam o cálculo existente.
CREATE OR REPLACE FUNCTION public.trg_calcular_comissoes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND ROW(NEW.data_fechamento,NEW.valor_total,NEW.num_parcelas,NEW.percentual_aplicado,NEW.produto_id,NEW.estrategista_id)
    IS NOT DISTINCT FROM ROW(OLD.data_fechamento,OLD.valor_total,OLD.num_parcelas,OLD.percentual_aplicado,OLD.produto_id,OLD.estrategista_id)
    AND (
      (OLD.status='ativo' AND NEW.status='concluido' AND NEW.vigencia_fim IS NOT NULL
        AND NEW.vigencia_fim<(now() AT TIME ZONE 'America/Sao_Paulo')::date)
      OR (OLD.status='concluido' AND NEW.status='ativo' AND NEW.vigencia_fim IS DISTINCT FROM OLD.vigencia_fim
        AND NEW.vigencia_fim>=(now() AT TIME ZONE 'America/Sao_Paulo')::date)
    ) THEN RETURN NEW;
  END IF;
  PERFORM public.calcular_comissoes_contrato(NEW.id);
  RETURN NEW;
END;
$$;

-- Nunca confunde cadastro ativo com um único contrato: qualquer outro ativo sem prazo
-- confirmado, ativo vigente ou pausado preserva o cadastro. Cliente legado sem contrato não é varrido.
CREATE OR REPLACE FUNCTION public.sync_cliente_ativo_from_contratos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_old_client uuid; v_old_tenant uuid; v_new_client uuid; v_new_tenant uuid; v record; v_ativo boolean;
BEGIN
  IF TG_OP<>'INSERT' THEN v_old_client:=OLD.cliente_id; v_old_tenant:=OLD.tenant_id; END IF;
  IF TG_OP<>'DELETE' THEN v_new_client:=NEW.cliente_id; v_new_tenant:=NEW.tenant_id; END IF;
  FOR v IN SELECT DISTINCT x.client_id,x.tenant_id FROM (VALUES(v_old_client,v_old_tenant),(v_new_client,v_new_tenant)) x(client_id,tenant_id)
    WHERE x.client_id IS NOT NULL ORDER BY x.tenant_id,x.client_id
  LOOP
    PERFORM 1 FROM public.clients cl WHERE cl.id=v.client_id AND cl.tenant_id=v.tenant_id FOR UPDATE;
    SELECT EXISTS (
      SELECT 1 FROM public.contratos c WHERE c.cliente_id=v.client_id AND c.tenant_id=v.tenant_id
        AND (c.status='pausado' OR (c.status='ativo' AND (upper(coalesce(c.status_secundario,''))='PAUSADO'
          OR c.vigencia_fim IS NULL OR c.vigencia_fim>=(now() AT TIME ZONE 'America/Sao_Paulo')::date)))
    ) INTO v_ativo;
    UPDATE public.clients cl SET ativo=v_ativo WHERE cl.id=v.client_id AND cl.tenant_id=v.tenant_id AND cl.ativo IS DISTINCT FROM v_ativo;
  END LOOP;
  RETURN NULL;
END;
$$;
DROP TRIGGER trg_sync_cliente_ativo_from_contratos ON public.contratos;
CREATE TRIGGER trg_sync_cliente_ativo_from_contratos
  AFTER INSERT OR DELETE OR UPDATE OF status,status_secundario,cliente_id,vigencia_fim ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.sync_cliente_ativo_from_contratos();

CREATE OR REPLACE FUNCTION public.prorrogar_vigencia_contrato(
  p_contrato_id uuid,p_actor_esperado uuid,p_nova_data date,p_motivo text,p_fim_esperado date,p_status_esperado text,p_reativar boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.contratos%ROWTYPE; v_tenant uuid:=public.get_user_tenant_id(); v_skip text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor_esperado OR v_tenant IS NULL OR NOT public.pode_gerir_contratos() THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO c FROM public.contratos WHERE id=p_contrato_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato indisponível.' USING ERRCODE='P0002'; END IF;
  IF c.vigencia_fim IS DISTINCT FROM p_fim_esperado OR c.status IS DISTINCT FROM p_status_esperado THEN
    RAISE EXCEPTION 'O contrato mudou. Atualize a ficha antes de confirmar.' USING ERRCODE='40001';
  END IF;
  IF c.status NOT IN ('ativo','pausado','concluido') OR (p_reativar AND c.status<>'concluido') THEN
    RAISE EXCEPTION 'Este status não permite a operação solicitada.' USING ERRCODE='22023';
  END IF;
  IF p_nova_data IS NULL OR p_nova_data<(now() AT TIME ZONE 'America/Sao_Paulo')::date
    OR (c.vigencia_fim IS NOT NULL AND p_nova_data<=c.vigencia_fim)
    OR char_length(btrim(coalesce(p_motivo,''))) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'Informe um novo prazo futuro e um motivo entre 8 e 2000 caracteres.' USING ERRCODE='22023';
  END IF;
  v_skip:=coalesce(current_setting('app.skip_venda_resync',true),'');
  PERFORM set_config('app.skip_venda_resync','on',true);
  IF p_reativar THEN
    UPDATE public.contratos SET vigencia_fim=p_nova_data,vigencia_motivo=btrim(p_motivo),status='ativo',status_secundario='ATIVO'
      WHERE id=c.id AND tenant_id=v_tenant RETURNING * INTO c;
  ELSE
    UPDATE public.contratos SET vigencia_fim=p_nova_data,vigencia_motivo=btrim(p_motivo)
      WHERE id=c.id AND tenant_id=v_tenant RETURNING * INTO c;
  END IF;
  PERFORM set_config('app.skip_venda_resync',v_skip,true);
  RETURN jsonb_build_object('id',c.id,'vigencia_fim',c.vigencia_fim,'vigencia_motivo',c.vigencia_motivo,'status',c.status,'status_secundario',c.status_secundario);
END;
$$;
REVOKE ALL ON FUNCTION public.prorrogar_vigencia_contrato(uuid,uuid,date,text,date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prorrogar_vigencia_contrato(uuid,uuid,date,text,date,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.concluir_contratos_vencidos()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; v_total integer:=0; v_skip text; v_hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  -- EXECUTE é exclusivo de owner/service. Não recebe data/tenant/identidade forjável.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('contratos-vigencia-diaria',0)) THEN
    RETURN jsonb_build_object('concluidos',0,'em_execucao',true);
  END IF;
  v_skip:=coalesce(current_setting('app.skip_venda_resync',true),'');
  PERFORM set_config('app.skip_venda_resync','on',true);
  FOR c IN SELECT id,tenant_id FROM public.contratos
    WHERE status='ativo' AND upper(coalesce(status_secundario,''))<>'PAUSADO'
      AND vigencia_fim IS NOT NULL AND vigencia_fim<v_hoje
    ORDER BY tenant_id,id FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.contratos SET status='concluido',status_secundario='CONCLUÍDO'
      WHERE id=c.id AND tenant_id=c.tenant_id AND status='ativo' AND vigencia_fim<v_hoje;
    IF FOUND THEN v_total:=v_total+1; END IF;
  END LOOP;
  PERFORM set_config('app.skip_venda_resync',v_skip,true);
  RETURN jsonb_build_object('concluidos',v_total,'dia',v_hoje);
END;
$$;
REVOKE ALL ON FUNCTION public.concluir_contratos_vencidos() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.concluir_contratos_vencidos() TO service_role;

-- 00:05 America/Sao_Paulo (03:05 UTC). NUNCA ativa retroativamente o lote legado.
DO $$ DECLARE v_job bigint; BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname='contratos-vigencia-diaria';
  IF v_job IS NULL THEN
    SELECT cron.schedule('contratos-vigencia-diaria','5 3 * * *','select public.concluir_contratos_vencidos();') INTO v_job;
  END IF;
  PERFORM cron.alter_job(v_job,active:=false);
END $$;

-- Mesmo corpo LIVE; apenas dois campos adicionais auditados.
CREATE OR REPLACE FUNCTION public.audit_contratos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID;
  v_campos TEXT[] := ARRAY[
    'cliente_nome','empresa','cpf_cnpj','whatsapp','email','instagram',
    'nicho','faturamento','endereco','posicionamento','resumo',
    'produto_nome','status','status_secundario','data_fechamento','vencimento',
    'plano_dias','semanas','renovacao',
    'valor_total','valor_parcela','num_parcelas','percentual_aplicado',
    'entrada','pg_entrada','forma_pagamento','fat_bruto','bonus','link_clicksign',
    'venda_interna','venda_diretoria',
    'estrategista_id','estrategista_nome_raw','vendedor','treinador',
    'seguidores_inicio','seguidores_fim','crescimento_seguidores',
    'videos_postados','entregas_no_prazo','entregas_totais','nps_vip',
    'observacoes','cliente_id','vigencia_fim','vigencia_motivo'
  ];
  v_campo TEXT;
  v_old  TEXT;
  v_new  TEXT;
BEGIN
  v_user := COALESCE(auth.uid(), NULL);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.contratos_audit_log (contrato_id, operacao, alterado_por, tenant_id)
    VALUES (NEW.id, 'INSERT', v_user, NEW.tenant_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.contratos_audit_log (contrato_id, operacao, alterado_por, tenant_id)
    VALUES (OLD.id, 'DELETE', v_user, OLD.tenant_id);
    RETURN OLD;
  END IF;

  FOREACH v_campo IN ARRAY v_campos LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_campo, v_campo)
      INTO v_old, v_new USING OLD, NEW;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO public.contratos_audit_log
        (contrato_id, operacao, campo, valor_antigo, valor_novo, alterado_por, tenant_id)
      VALUES (NEW.id, 'UPDATE', v_campo, v_old, v_new, v_user, NEW.tenant_id);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst,'reload schema';
COMMIT;
