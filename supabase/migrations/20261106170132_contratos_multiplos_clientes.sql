-- Um contrato financeiro, vários clientes atendidos. O principal legado permanece implícito.
-- Sem backfill, criação de clientes, mudança financeira ou operação de CRM.
BEGIN;
ALTER TABLE public.contratos ADD CONSTRAINT contratos_id_tenant_multicliente_key UNIQUE (id,tenant_id);
ALTER TABLE public.clients ADD CONSTRAINT clients_id_tenant_multicliente_key UNIQUE (id,tenant_id);
CREATE TABLE public.contrato_clientes (
  contrato_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contrato_id,cliente_id),
  FOREIGN KEY (contrato_id,tenant_id) REFERENCES public.contratos(id,tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (cliente_id,tenant_id) REFERENCES public.clients(id,tenant_id) ON DELETE RESTRICT
);
COMMENT ON TABLE public.contrato_clientes IS 'Clientes adicionais atendidos; contratos.cliente_id permanece principal e referência financeira. Não somar valores por associação.';
CREATE INDEX contrato_clientes_cliente_idx ON public.contrato_clientes(tenant_id,cliente_id,contrato_id);
ALTER TABLE public.contrato_clientes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contrato_clientes FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.contrato_clientes TO authenticated,service_role;
CREATE POLICY contrato_clientes_read ON public.contrato_clientes FOR SELECT TO authenticated USING (
  tenant_id=(SELECT public.get_user_tenant_id())
  AND public.user_can_access_client(cliente_id)
  AND EXISTS (SELECT 1 FROM public.contratos c WHERE c.id=contrato_id AND c.tenant_id=contrato_clientes.tenant_id)
);

CREATE VIEW public.contrato_clientes_atendidos WITH (security_invoker=true) AS
  SELECT c.tenant_id,c.id AS contrato_id,c.cliente_id,true AS principal
  FROM public.contratos c WHERE c.cliente_id IS NOT NULL
  UNION ALL
  SELECT cc.tenant_id,cc.contrato_id,cc.cliente_id,false AS principal
  FROM public.contrato_clientes cc JOIN public.contratos c ON c.id=cc.contrato_id AND c.tenant_id=cc.tenant_id
  WHERE cc.cliente_id IS DISTINCT FROM c.cliente_id;
REVOKE ALL ON public.contrato_clientes_atendidos FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.contrato_clientes_atendidos TO authenticated,service_role;

-- Helper interno: não exposto por RPC, não concede acesso operacional a clientes.
CREATE FUNCTION public.recalcular_cliente_ativo_contratos(p_cliente_id uuid,p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_ativo boolean;
BEGIN
  PERFORM 1 FROM public.clients WHERE id=p_cliente_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.contratos c WHERE c.tenant_id=p_tenant_id
      AND (c.cliente_id=p_cliente_id OR EXISTS (
        SELECT 1 FROM public.contrato_clientes cc WHERE cc.contrato_id=c.id
          AND cc.tenant_id=c.tenant_id AND cc.cliente_id=p_cliente_id))
      AND (c.status='pausado' OR (c.status='ativo' AND (upper(coalesce(c.status_secundario,''))='PAUSADO'
        OR c.vigencia_fim IS NULL OR c.vigencia_fim>=(now() AT TIME ZONE 'America/Sao_Paulo')::date)))
  ) INTO v_ativo;
  UPDATE public.clients SET ativo=v_ativo WHERE id=p_cliente_id AND tenant_id=p_tenant_id AND ativo IS DISTINCT FROM v_ativo;
END;
$$;
REVOKE ALL ON FUNCTION public.recalcular_cliente_ativo_contratos(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.sync_cliente_ativo_from_contratos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old_client uuid; v_old_tenant uuid; v_new_client uuid; v_new_tenant uuid; v_contrato uuid; v record;
BEGIN
  IF TG_OP<>'INSERT' THEN v_old_client:=OLD.cliente_id; v_old_tenant:=OLD.tenant_id; v_contrato:=OLD.id; END IF;
  IF TG_OP<>'DELETE' THEN v_new_client:=NEW.cliente_id; v_new_tenant:=NEW.tenant_id; v_contrato:=NEW.id; END IF;
  FOR v IN
    SELECT x.client_id,x.tenant_id FROM (VALUES(v_old_client,v_old_tenant),(v_new_client,v_new_tenant)) x(client_id,tenant_id)
      WHERE x.client_id IS NOT NULL
    UNION SELECT cc.cliente_id,cc.tenant_id FROM public.contrato_clientes cc WHERE cc.contrato_id=v_contrato
    ORDER BY 2,1
  LOOP
    PERFORM public.recalcular_cliente_ativo_contratos(v.client_id,v.tenant_id);
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_cliente_ativo_from_contratos() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.sync_cliente_ativo_from_participantes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM public.recalcular_cliente_ativo_contratos(OLD.cliente_id,OLD.tenant_id);
  ELSE
    PERFORM public.recalcular_cliente_ativo_contratos(NEW.cliente_id,NEW.tenant_id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_cliente_ativo_from_participantes() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER contrato_clientes_sync_ativo AFTER INSERT OR DELETE ON public.contrato_clientes
  FOR EACH ROW EXECUTE FUNCTION public.sync_cliente_ativo_from_participantes();

CREATE FUNCTION public.definir_clientes_contrato(
  p_contrato_id uuid,p_actor_esperado uuid,p_cliente_ids uuid[],p_cliente_ids_esperados uuid[],
  p_cliente_principal_esperado uuid,p_motivo text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  c public.contratos%ROWTYPE; v_tenant uuid:=public.get_user_tenant_id();
  v_atuais uuid[]; v_novos uuid[]; v_esperados uuid[]; v_client uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor_esperado OR v_tenant IS NULL
    OR NOT coalesce(public.pode_gerir_contratos(),false) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO c FROM public.contratos WHERE id=p_contrato_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato indisponível.' USING ERRCODE='P0002'; END IF;
  IF p_cliente_ids IS NULL OR p_cliente_ids_esperados IS NULL
    OR array_position(p_cliente_ids,NULL) IS NOT NULL OR array_position(p_cliente_ids_esperados,NULL) IS NOT NULL
    OR char_length(btrim(coalesce(p_motivo,''))) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'Informe os clientes e um motivo entre 8 e 2000 caracteres.' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO v_novos FROM unnest(p_cliente_ids) x(id);
  SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO v_esperados FROM unnest(p_cliente_ids_esperados) x(id);
  SELECT coalesce(array_agg(id ORDER BY id),'{}'::uuid[]) INTO v_atuais FROM (
    SELECT c.cliente_id AS id WHERE c.cliente_id IS NOT NULL
    UNION SELECT cc.cliente_id FROM public.contrato_clientes cc WHERE cc.contrato_id=c.id AND cc.tenant_id=v_tenant
  ) x;
  IF c.cliente_id IS DISTINCT FROM p_cliente_principal_esperado OR v_atuais IS DISTINCT FROM v_esperados THEN
    RAISE EXCEPTION 'O contrato mudou. Atualize a ficha antes de confirmar.' USING ERRCODE='40001';
  END IF;
  IF cardinality(v_novos)<>cardinality(p_cliente_ids) OR cardinality(v_esperados)<>cardinality(p_cliente_ids_esperados)
    OR (c.cliente_id IS NOT NULL AND NOT c.cliente_id=ANY(v_novos)) THEN
    RAISE EXCEPTION 'Preserve o cliente principal e não repita clientes.' USING ERRCODE='22023';
  END IF;
  -- Valida também removidos; vínculo não cria permissão para editar um cliente inacessível.
  FOR v_client IN SELECT id FROM unnest(v_atuais||v_novos) x(id) GROUP BY id ORDER BY id LOOP
    PERFORM 1 FROM public.clients cl WHERE cl.id=v_client AND cl.tenant_id=v_tenant
      AND coalesce(public.user_can_access_client(cl.id),false) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cliente indisponível para esta operação.' USING ERRCODE='42501'; END IF;
  END LOOP;
  IF v_atuais=v_novos THEN
    RETURN jsonb_build_object('id',c.id,'cliente_id',c.cliente_id,'cliente_ids',v_atuais);
  END IF;
  DELETE FROM public.contrato_clientes cc WHERE cc.contrato_id=c.id AND cc.tenant_id=v_tenant
    AND (NOT cc.cliente_id=ANY(v_novos) OR cc.cliente_id IS NOT DISTINCT FROM c.cliente_id);
  INSERT INTO public.contrato_clientes(contrato_id,cliente_id,tenant_id)
    SELECT c.id,id,v_tenant FROM unnest(v_novos) x(id) WHERE id IS DISTINCT FROM c.cliente_id
    ON CONFLICT (contrato_id,cliente_id) DO NOTHING;
  INSERT INTO public.contratos_audit_log(contrato_id,operacao,campo,valor_antigo,valor_novo,alterado_por,tenant_id)
    VALUES(c.id,'UPDATE','clientes_atendidos',jsonb_build_object('cliente_ids',v_atuais)::text,
      jsonb_build_object('cliente_ids',v_novos,'motivo',btrim(p_motivo))::text,auth.uid(),v_tenant);
  RETURN jsonb_build_object('id',c.id,'cliente_id',c.cliente_id,'cliente_ids',v_novos);
END;
$$;
REVOKE ALL ON FUNCTION public.definir_clientes_contrato(uuid,uuid,uuid[],uuid[],uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.definir_clientes_contrato(uuid,uuid,uuid[],uuid[],uuid,text) TO authenticated;
-- Mesmo corpo LIVE da guarda de cadastro; amplia somente os dois predicados
-- que impedem inativação com contrato não encerrado. Wrapper/atribuições preservados.
CREATE OR REPLACE FUNCTION private.wa_agente_acoes_estado_cadastro(p wa_agente_pedidos, p_acao text, p_alvo uuid, p_novo jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c public.clients%ROWTYPE;
  k public.contratos%ROWTYPE;
  v_cliente uuid;
  v_total boolean;
  v_ids uuid[];
  v_nome text;
  v_antes jsonb;
  v_depois jsonb;
  v_esperado jsonb;
BEGIN
  IF p_acao NOT IN ('cliente_ativo', 'vincular_contrato_cliente') OR p_acao IS NULL OR p_alvo IS NULL
    OR p_novo IS NULL OR jsonb_typeof(p_novo) <> 'object' THEN
    RAISE EXCEPTION 'Ação ou valor inválido.' USING ERRCODE = '22023';
  END IF;
  IF NOT coalesce(public.has_permissao_de(p.user_id, CASE p_acao WHEN 'cliente_ativo' THEN 'clientes' ELSE 'contratos' END, 'editar'), false) THEN
    RAISE EXCEPTION 'Sem permissão atual para esta operação.' USING ERRCODE = '42501';
  END IF;
  IF p_acao = 'cliente_ativo' THEN
    IF p_novo - 'ativo' <> '{}'::jsonb OR jsonb_typeof(p_novo -> 'ativo') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Informe somente ativo como booleano.' USING ERRCODE = '22023';
    END IF;
    v_cliente := p_alvo;
  ELSE
    IF p_novo - 'cliente_id' <> '{}'::jsonb OR jsonb_typeof(p_novo -> 'cliente_id') IS DISTINCT FROM 'string'
      OR (p_novo ->> 'cliente_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Informe somente um cliente válido.' USING ERRCODE = '22023';
    END IF;
    v_cliente := (p_novo ->> 'cliente_id')::uuid;
  END IF;
  SELECT total, client_ids INTO v_total, v_ids FROM public.wa_agente_escopo(p.tenant_id, p.user_id);
  IF v_total IS NOT TRUE AND NOT (v_cliente = ANY(coalesce(v_ids, '{}'::uuid[]))) THEN
    RAISE EXCEPTION 'Registro fora da carteira autorizada.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.clients WHERE id = v_cliente AND tenant_id = p.tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado nesta empresa.' USING ERRCODE = '42501'; END IF;
  v_nome := private.wa_agente_acoes_nome(c.nome);
  IF p_acao = 'cliente_ativo' THEN
    IF c.ativo IS NOT DISTINCT FROM (p_novo ->> 'ativo')::boolean THEN
      RAISE EXCEPTION 'O cliente já está nesse estado.' USING ERRCODE = '22023';
    END IF;
    -- Inclui FK e contrato antigo sem FK pelo nome. Ambiguidade recusa a ação,
    -- em vez de considerar que o contrato não pertence a ninguém.
    IF (p_novo ->> 'ativo')::boolean IS FALSE THEN
      PERFORM id FROM public.contratos WHERE tenant_id = p.tenant_id
        AND (cliente_id = c.id OR EXISTS (SELECT 1 FROM public.contrato_clientes cc WHERE cc.contrato_id = contratos.id AND cc.tenant_id = p.tenant_id AND cc.cliente_id = c.id) OR (cliente_id IS NULL AND v_nome <> '' AND private.wa_agente_acoes_nome(cliente_nome) = v_nome))
        ORDER BY id FOR UPDATE;
      IF EXISTS (
        SELECT 1 FROM public.contratos WHERE tenant_id = p.tenant_id
          AND (cliente_id = c.id OR EXISTS (SELECT 1 FROM public.contrato_clientes cc WHERE cc.contrato_id = contratos.id AND cc.tenant_id = p.tenant_id AND cc.cliente_id = c.id) OR (cliente_id IS NULL AND v_nome <> '' AND private.wa_agente_acoes_nome(cliente_nome) = v_nome))
          AND private.wa_agente_acoes_nome(status) NOT IN ('cancelado','concluido','encerrado','distrato','finalizado','rescindido')
      ) THEN RAISE EXCEPTION 'Cliente possui contrato não encerrado; inativação recusada.' USING ERRCODE = '22023'; END IF;
    END IF;
    v_antes := jsonb_build_object('ativo', c.ativo);
    v_depois := p_novo;
    v_esperado := jsonb_build_object('cliente_id', c.id, 'ativo', c.ativo, 'nome', c.nome, 'atualizado_em', c.atualizado_em);
  ELSE
    SELECT * INTO k FROM public.contratos WHERE id = p_alvo AND tenant_id = p.tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado nesta empresa.' USING ERRCODE = '42501'; END IF;
    IF k.cliente_id IS NOT NULL THEN RAISE EXCEPTION 'O contrato já tem cliente vinculado.' USING ERRCODE = '22023'; END IF;
    IF c.ativo IS NOT TRUE AND private.wa_agente_acoes_nome(k.status) NOT IN ('cancelado','concluido','encerrado','distrato','finalizado','rescindido') THEN
      RAISE EXCEPTION 'Contrato não encerrado exige cliente ativo.' USING ERRCODE = '22023';
    END IF;
    -- Contrato sem FK não fornece carteira canônica. Quem não pode ver carteira
    -- inteira precisa ser o estrategista atual do contrato E possuir o destino.
    IF v_total IS NOT TRUE AND k.estrategista_id IS DISTINCT FROM p.user_id THEN
      RAISE EXCEPTION 'Contrato fora da carteira autorizada.' USING ERRCODE = '42501';
    END IF;
    v_antes := jsonb_build_object('cliente_id', NULL);
    v_depois := jsonb_build_object('cliente_id', c.id, 'cliente_nome', c.nome);
    v_esperado := jsonb_build_object('contrato_id', k.id, 'cliente_id', k.cliente_id, 'status', k.status,
      'cliente_nome', k.cliente_nome, 'atualizado_em', k.atualizado_em,
      'destino_id', c.id, 'destino_nome', c.nome, 'destino_ativo', c.ativo, 'destino_atualizado_em', c.atualizado_em);
  END IF;
  RETURN jsonb_build_object('esperado', v_esperado, 'previa', jsonb_build_object('acao', p_acao,
    'alvo_nome', CASE p_acao WHEN 'cliente_ativo' THEN c.nome ELSE k.cliente_nome END, 'antes', v_antes, 'depois', v_depois));
END;
$function$;


NOTIFY pgrst,'reload schema';
COMMIT;
