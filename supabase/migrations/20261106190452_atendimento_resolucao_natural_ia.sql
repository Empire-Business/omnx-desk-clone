-- Delta aditivo: resolução NATURAL classificada pela IA já configurada.
-- Preparada somente em arquivo. Não executar sem autorização do ambiente.
-- Depende da ponte 20261106174353; não modifica seu arquivo nem sua evidência.

ALTER TABLE public.atendimento_demandas
  ADD COLUMN wa_resolucao_metodo text CHECK (wa_resolucao_metodo IS NULL OR wa_resolucao_metodo = 'ia'),
  ADD COLUMN wa_resolucao_motivo text CHECK (wa_resolucao_motivo IS NULL OR length(wa_resolucao_motivo) <= 180),
  ADD COLUMN wa_resolucao_confianca numeric(4,3) CHECK (wa_resolucao_confianca BETWEEN 0 AND 1),
  ADD COLUMN wa_resolucao_modelo text CHECK (wa_resolucao_modelo IS NULL OR length(wa_resolucao_modelo)<=100),
  ADD COLUMN wa_resolucao_versao text CHECK (wa_resolucao_versao IS NULL OR length(wa_resolucao_versao)<=100),
  ADD COLUMN wa_resolucao_evidencias uuid[] NOT NULL DEFAULT '{}'::uuid[]
    CHECK (cardinality(wa_resolucao_evidencias) <= 3);

-- Recibo permanente da decisão automática: reabrir/editar limpa o estado atual
-- da ficha, mas não apaga a prova necessária para investigar um falso positivo.
-- Sem FK com CASCADE, texto bruto, prompt ou raciocínio do modelo.
CREATE TABLE private.atendimento_resolucoes_ia_recibos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  demanda_id uuid NOT NULL,
  origem_mensagem_id uuid NOT NULL,
  evidencia_mensagem_ids uuid[] NOT NULL CHECK (cardinality(evidencia_mensagem_ids) BETWEEN 1 AND 3),
  antecedente_mensagem_id uuid,
  motivo text NOT NULL CHECK (length(motivo) BETWEEN 12 AND 180),
  modelo text NOT NULL CHECK (length(modelo) BETWEEN 1 AND 100),
  versao text NOT NULL CHECK (length(versao) BETWEEN 1 AND 100),
  confianca numeric(4,3) NOT NULL CHECK (confianca BETWEEN 0.93 AND 1),
  revisao_observada timestamptz,
  concluida_em timestamptz NOT NULL,
  registrado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.atendimento_resolucoes_ia_recibos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.atendimento_resolucoes_ia_recibos FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON private.atendimento_resolucoes_ia_recibos TO service_role;
CREATE INDEX atendimento_resolucoes_ia_recibos_ticket
  ON private.atendimento_resolucoes_ia_recibos(tenant_id,demanda_id,registrado_em);

CREATE FUNCTION private.atendimento_resolucoes_ia_recibo_imutavel()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Recibos de resolução automática são imutáveis.' USING ERRCODE='42501';
END;
$$;
REVOKE ALL ON FUNCTION private.atendimento_resolucoes_ia_recibo_imutavel() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER atendimento_resolucoes_ia_recibos_imutaveis
  BEFORE UPDATE OR DELETE ON private.atendimento_resolucoes_ia_recibos
  FOR EACH ROW EXECUTE FUNCTION private.atendimento_resolucoes_ia_recibo_imutavel();
CREATE TRIGGER atendimento_resolucoes_ia_recibos_sem_truncate
  BEFORE TRUNCATE ON private.atendimento_resolucoes_ia_recibos
  FOR EACH STATEMENT EXECUTE FUNCTION private.atendimento_resolucoes_ia_recibo_imutavel();

CREATE FUNCTION public.tg_atendimento_whatsapp_ia_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.wa_resolucao_metodo IS NOT NULL OR NEW.wa_resolucao_motivo IS NOT NULL
        OR NEW.wa_resolucao_confianca IS NOT NULL OR cardinality(NEW.wa_resolucao_evidencias) <> 0
        OR NEW.wa_resolucao_modelo IS NOT NULL OR NEW.wa_resolucao_versao IS NOT NULL THEN
        RAISE EXCEPTION 'Evidência automática não pode ser fabricada.' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF ROW(NEW.wa_resolucao_metodo, NEW.wa_resolucao_motivo, NEW.wa_resolucao_confianca, NEW.wa_resolucao_evidencias,NEW.wa_resolucao_modelo,NEW.wa_resolucao_versao)
        IS DISTINCT FROM ROW(OLD.wa_resolucao_metodo, OLD.wa_resolucao_motivo, OLD.wa_resolucao_confianca, OLD.wa_resolucao_evidencias,OLD.wa_resolucao_modelo,OLD.wa_resolucao_versao) THEN
        RAISE EXCEPTION 'Evidência automática não é editável.' USING ERRCODE = '42501';
      END IF;
      IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
        NEW.wa_resolucao_metodo := NULL; NEW.wa_resolucao_motivo := NULL;
        NEW.wa_resolucao_confianca := NULL; NEW.wa_resolucao_evidencias := '{}'::uuid[];
        NEW.wa_resolucao_modelo := NULL; NEW.wa_resolucao_versao := NULL;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_atendimento_whatsapp_ia_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER atendimento_whatsapp_ia_guard BEFORE INSERT OR UPDATE ON public.atendimento_demandas
  FOR EACH ROW EXECUTE FUNCTION public.tg_atendimento_whatsapp_ia_guard();

-- Catálogo paginado independente do resumo top-5. Apenas worker autorizado.
GRANT EXECUTE ON FUNCTION private.cliente_canais_do_cliente(uuid, uuid) TO service_role;
CREATE FUNCTION public.atendimento_contexto_tickets_ia(p_tenant uuid, p_cliente uuid, p_offset integer, p_limite integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_total integer; v_itens jsonb;
BEGIN
  IF current_user <> 'service_role' OR NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_cliente AND tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'Contexto não autorizado.' USING ERRCODE = '42501';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 100 OR p_limite IS NULL OR p_limite < 1 OR p_limite > 50 THEN
    RAISE EXCEPTION 'Página inválida.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_modules WHERE tenant_id = p_tenant AND slug = 'atendimento' AND enabled IS FALSE) THEN
    RETURN jsonb_build_object('desativado', true);
  END IF;
  SELECT count(*) INTO v_total FROM public.atendimento_demandas d
    WHERE d.tenant_id = p_tenant AND d.cliente_id = p_cliente AND d.wa_origem_mensagem_id IS NOT NULL AND d.concluida_em IS NULL;
  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.created_at, x.id), '[]'::jsonb) INTO v_itens FROM (
    SELECT d.id, d.created_at, jsonb_build_object('id', d.id, 'codigo', d.codigo, 'titulo', left(d.titulo,160),
      'origem_mensagem_id', d.wa_origem_mensagem_id, 'revisao', d.updated_at, 'reaberta_em', d.wa_reaberta_em,
      'canal_rotulo', COALESCE(canal.rotulo, '?'), 'origem_texto', left(fonte.conteudo,400),
      'origem_em', COALESCE(fonte.criado_em, origem.criado_em, d.created_at),
      'origem_pronta', fonte.atestada_em IS NOT NULL AND fonte.ocorrido_em IS NOT NULL) AS item
    FROM public.atendimento_demandas d
    LEFT JOIN private.atendimento_wa_entradas origem ON origem.mensagem_id = d.wa_origem_mensagem_id AND origem.tenant_id = p_tenant
    LEFT JOIN LATERAL private.atendimento_mensagem_cliente(p_tenant,p_cliente,d.wa_origem_mensagem_id) fonte ON true
    LEFT JOIN LATERAL (SELECT k.rotulo FROM private.cliente_canais_do_cliente(p_tenant,p_cliente) k
      WHERE k.tipo = origem.canal_tipo AND k.chave = origem.canal_chave LIMIT 1) canal ON true
    WHERE d.tenant_id = p_tenant AND d.cliente_id = p_cliente AND d.wa_origem_mensagem_id IS NOT NULL AND d.concluida_em IS NULL
    ORDER BY d.created_at,d.id OFFSET p_offset LIMIT p_limite
  ) x;
  RETURN jsonb_build_object('total',v_total,'tickets',v_itens);
END;
$$;
REVOKE ALL ON FUNCTION public.atendimento_contexto_tickets_ia(uuid,uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atendimento_contexto_tickets_ia(uuid,uuid,integer,integer) TO service_role;

CREATE FUNCTION public.atendimento_sincronizar_whatsapp_ia(
  p_tenant uuid,p_cliente uuid,p_pendencias jsonb,p_resolucoes uuid[],
  p_anterior_ate timestamptz,p_analisado_ate timestamptz,p_resolucoes_ia jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  r jsonb; e jsonb; v_aprovadas jsonb := '[]'::jsonb; v_base jsonb; v_pendencias jsonb := '[]'::jsonb; p jsonb;
  d public.atendimento_demandas%ROWTYPE; origem record; m record; anterior record;
  v_evidencias uuid[]; v_valida boolean; v_primeira timestamptz; v_primeira_id uuid;
  v_final uuid; v_total integer := 0; v_conf numeric; v_motivo text;
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'Worker autorizado obrigatório.' USING ERRCODE='42501'; END IF;
  IF p_tenant IS NULL OR p_cliente IS NULL OR p_anterior_ate IS NULL OR p_analisado_ate IS NULL
    OR p_analisado_ate < p_anterior_ate OR p_analisado_ate > now() + interval '5 minutes'
    OR jsonb_typeof(p_resolucoes_ia) IS DISTINCT FROM 'array' OR jsonb_array_length(p_resolucoes_ia) > 20
    OR octet_length(p_resolucoes_ia::text) > 30000 THEN
    RAISE EXCEPTION 'Propostas inválidas.' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id=p_cliente AND tenant_id=p_tenant) THEN
    RAISE EXCEPTION 'Cliente não pertence à empresa.' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_modules WHERE tenant_id=p_tenant AND slug='atendimento' AND enabled IS FALSE) THEN
    RETURN jsonb_build_object('desativado',true);
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant::text || ':' || p_cliente::text,0));

  -- Fixar/revalidar a revisão ANTES de a ponte tocar updated_at. Locks duram
  -- até o final: alterações manuais anteriores vencem; posteriores esperam.
  FOR r IN SELECT value FROM jsonb_array_elements(p_resolucoes_ia) ORDER BY value->>'origem_mensagem_id' LOOP
    IF r->>'origem_mensagem_id' IS NULL OR r->'vinculo_inequivoco' IS DISTINCT FROM 'true'::jsonb
      OR r->'solucao_completa' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(r->'evidencias') IS DISTINCT FROM 'array'
      OR jsonb_array_length(r->'evidencias') NOT BETWEEN 1 AND 3 THEN CONTINUE; END IF;
    SELECT * INTO d FROM public.atendimento_demandas WHERE tenant_id=p_tenant AND cliente_id=p_cliente
      AND wa_origem_mensagem_id=(r->>'origem_mensagem_id')::uuid FOR UPDATE;
    IF r->>'ticket_id' IS NOT NULL THEN
      IF NOT FOUND OR d.id IS DISTINCT FROM (r->>'ticket_id')::uuid OR d.concluida_em IS NOT NULL
        OR d.updated_at IS DISTINCT FROM (r->>'revisao')::timestamptz THEN CONTINUE; END IF;
    ELSE
      -- Pedido+solução na mesma análise: só candidato realmente novo. A ponte
      -- cria e esta mesma transação fecha; não aguarda outra fala do cliente.
      IF FOUND OR r->>'revisao' IS NOT NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_pendencias) novo
        WHERE novo->>'ticket_origem'=r->>'origem_mensagem_id') THEN CONTINUE; END IF;
    END IF;
    v_aprovadas := v_aprovadas || jsonb_build_array(r);
  END LOOP;

  v_base := public.atendimento_sincronizar_whatsapp(p_tenant,p_cliente,p_pendencias,p_resolucoes,p_anterior_ate,p_analisado_ate);
  IF v_base->>'desativado'='true' THEN RETURN v_base; END IF;
  SELECT id INTO v_final FROM public.atendimento_etapas WHERE tenant_id=p_tenant AND is_final ORDER BY ordem,id LIMIT 1;

  FOR r IN SELECT value FROM jsonb_array_elements(v_aprovadas) LOOP
    v_conf := (r->>'confianca')::numeric; v_motivo := btrim(r->>'motivo');
    IF v_conf IS NULL OR v_conf < 0.93 OR v_conf > 1 OR v_motivo IS NULL OR length(v_motivo) NOT BETWEEN 12 AND 180
      OR v_motivo ~ '[@0-9<>]' OR v_motivo ~* '(https?:|www\.|R\$)'
      OR r->>'modelo' IS NULL OR r->>'modelo' !~ '^anthropic/claude-[a-z0-9.-]{1,40}$'
      OR r->>'versao' IS NULL OR length(r->>'versao') NOT BETWEEN 1 AND 100 THEN CONTINUE; END IF;
    SELECT * INTO d FROM public.atendimento_demandas WHERE tenant_id=p_tenant AND cliente_id=p_cliente
      AND wa_origem_mensagem_id=(r->>'origem_mensagem_id')::uuid FOR UPDATE;
    IF NOT FOUND OR d.concluida_em IS NOT NULL THEN CONTINUE; END IF;
    SELECT * INTO origem FROM private.atendimento_mensagem_cliente(p_tenant,p_cliente,d.wa_origem_mensagem_id);
    IF NOT FOUND OR origem.atestada_em IS NULL OR origem.ocorrido_em IS NULL THEN CONTINUE; END IF;
    v_evidencias := '{}'::uuid[]; v_valida := true; v_primeira := NULL; v_primeira_id := NULL;
    FOR e IN SELECT value FROM jsonb_array_elements(r->'evidencias') LOOP
      SELECT * INTO m FROM private.atendimento_mensagem_cliente(p_tenant,p_cliente,(e->>'mensagem_id')::uuid);
      IF NOT FOUND OR m.autor_tipo NOT IN ('cliente','equipe') OR m.tipo NOT IN ('texto','text','chat')
        OR m.conversation_id IS DISTINCT FROM origem.conversation_id OR m.id=d.wa_origem_mensagem_id
        OR m.criado_em <= p_anterior_ate OR m.criado_em > p_analisado_ate OR m.criado_em <= origem.criado_em
        OR e->>'trecho' IS NULL OR length(e->>'trecho') NOT BETWEEN 6 AND 160
        OR strpos(m.conteudo,e->>'trecho')=0 THEN v_valida:=false; EXIT; END IF;
      IF m.autor_tipo='equipe' AND (m.autor_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u
        WHERE u.id=m.autor_user_id AND u.tenant_id=p_tenant AND u.ativo IS TRUE AND u.perfil IS DISTINCT FROM 'cliente')) THEN
        v_valida:=false; EXIT;
      END IF;
      IF m.atestada_em IS NULL OR m.ocorrido_em IS NULL THEN
        IF m.registrado_em > clock_timestamp()-interval '5 minutes' THEN
          RAISE EXCEPTION 'Evidência natural aguardando atestação.' USING ERRCODE='55P03';
        END IF;
        v_valida:=false; EXIT;
      END IF;
      IF m.ocorrido_em <= origem.ocorrido_em OR (d.wa_reaberta_em IS NOT NULL AND m.ocorrido_em <= d.wa_reaberta_em)
        OR m.id=ANY(v_evidencias) THEN v_valida:=false; EXIT; END IF;
      v_evidencias:=array_append(v_evidencias,m.id);
      IF v_primeira IS NULL OR m.criado_em<v_primeira THEN v_primeira:=m.criado_em; v_primeira_id:=m.id; END IF;
    END LOOP;
    IF NOT v_valida THEN CONTINUE; END IF;
    IF r->>'antecedente_mensagem_id' IS NOT NULL THEN
      SELECT * INTO anterior FROM private.atendimento_mensagem_cliente(p_tenant,p_cliente,(r->>'antecedente_mensagem_id')::uuid);
      IF NOT FOUND OR anterior.conversation_id IS DISTINCT FROM origem.conversation_id OR anterior.autor_tipo NOT IN ('cliente','equipe')
        OR anterior.criado_em>=v_primeira OR anterior.criado_em<v_primeira-interval '30 minutes' THEN CONTINUE; END IF;
      IF anterior.atestada_em IS NULL OR anterior.ocorrido_em IS NULL THEN
        IF anterior.registrado_em>clock_timestamp()-interval '5 minutes' THEN
          RAISE EXCEPTION 'Antecedente aguardando atestação.' USING ERRCODE='55P03';
        END IF;
        CONTINUE;
      END IF;
      IF EXISTS (SELECT 1 FROM public.chat_messages outra WHERE outra.tenant_id=p_tenant
        AND outra.conversation_id=origem.conversation_id AND outra.criado_em>anterior.criado_em AND outra.criado_em<v_primeira) THEN CONTINUE; END IF;
    END IF;
    UPDATE public.atendimento_demandas SET etapa_id=v_final, wa_resolucao_mensagem_id=v_primeira_id,
      wa_resolucao_metodo='ia', wa_resolucao_motivo=v_motivo, wa_resolucao_confianca=v_conf,
      wa_resolucao_evidencias=v_evidencias, wa_ultima_analise=greatest(wa_ultima_analise,p_analisado_ate)
      ,wa_resolucao_modelo=r->>'modelo',wa_resolucao_versao=r->>'versao'
      WHERE id=d.id AND tenant_id=p_tenant RETURNING * INTO d;
    -- Mesma transação da baixa: qualquer falha no recibo também desfaz a baixa.
    -- Valores vêm da decisão validada pelo worker, não de edição do navegador.
    INSERT INTO private.atendimento_resolucoes_ia_recibos
      (tenant_id,cliente_id,demanda_id,origem_mensagem_id,evidencia_mensagem_ids,
       antecedente_mensagem_id,motivo,modelo,versao,confianca,revisao_observada,concluida_em)
    VALUES(p_tenant,p_cliente,d.id,d.wa_origem_mensagem_id,v_evidencias,
      (r->>'antecedente_mensagem_id')::uuid,v_motivo,r->>'modelo',r->>'versao',v_conf,
      (r->>'revisao')::timestamptz,d.concluida_em);
    v_total:=v_total+1;
  END LOOP;
  -- A memória recebe o resultado transacional, não a sugestão bruta do modelo.
  FOR p IN SELECT value FROM jsonb_array_elements(v_base->'pendencias') LOOP
    IF p->>'ticket_origem' IS NOT NULL AND EXISTS (SELECT 1 FROM public.atendimento_demandas
      WHERE tenant_id=p_tenant AND cliente_id=p_cliente AND wa_origem_mensagem_id=(p->>'ticket_origem')::uuid AND concluida_em IS NOT NULL) THEN
      p:=jsonb_set(p-'criticidade','{status}','"resolvida"'::jsonb);
    END IF;
    v_pendencias:=v_pendencias||jsonb_build_array(p);
  END LOOP;
  RETURN jsonb_build_object('pendencias',v_pendencias,'resolvidas_ia',v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.atendimento_sincronizar_whatsapp_ia(uuid,uuid,jsonb,uuid[],timestamptz,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atendimento_sincronizar_whatsapp_ia(uuid,uuid,jsonb,uuid[],timestamptz,timestamptz,jsonb) TO service_role;

-- Contabilidade por tentativa: várias análises do mesmo cliente não podem
-- apagar custo anterior. Reserva conservada em timeout/resultado desconhecido.
ALTER TABLE public.cliente_relacionamento ADD COLUMN ia_uso_contabilizado_ate timestamptz;
CREATE TABLE private.cliente_relacionamento_ia_tentativas (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, client_id uuid NOT NULL, dia date NOT NULL,
  reserva numeric(12,6) NOT NULL CHECK (reserva>=0), custo_confirmado numeric(12,6),
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(), confirmado_em timestamptz
);
ALTER TABLE private.cliente_relacionamento_ia_tentativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cliente_relacionamento_ia_tentativas FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON private.cliente_relacionamento_ia_tentativas TO service_role;

CREATE FUNCTION public.cliente_relacionamento_uso_total(p_tenant uuid,p_dia date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object('chamadas',
    COALESCE((SELECT chamadas_ia FROM public.cliente_relacionamento_uso WHERE tenant_id=p_tenant AND dia=p_dia),0)+count(*),
    'custo',COALESCE((SELECT custo_usd FROM public.cliente_relacionamento_uso WHERE tenant_id=p_tenant AND dia=p_dia),0)+COALESCE(sum(r.custo_usd),0))
  FROM public.cliente_relacionamento r WHERE r.tenant_id=p_tenant
    AND (r.analisado_em AT TIME ZONE 'America/Sao_Paulo')::date=p_dia
    AND (r.ia_uso_contabilizado_ate IS NULL OR r.ia_uso_contabilizado_ate<r.analisado_em);
$$;
REVOKE ALL ON FUNCTION public.cliente_relacionamento_uso_total(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_relacionamento_uso_total(uuid,date) TO service_role;

CREATE FUNCTION public.cliente_relacionamento_ia_reservar(
  p_id uuid,p_tenant uuid,p_cliente uuid,p_dia date,p_limite integer,p_teto numeric,p_reserva numeric
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.cliente_relacionamento%ROWTYPE; t private.cliente_relacionamento_ia_tentativas%ROWTYPE; uso jsonb;
BEGIN
  IF auth.uid() IS NOT NULL OR p_id IS NULL OR p_tenant IS NULL OR p_cliente IS NULL
    OR p_dia IS DISTINCT FROM (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date
    OR p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 2000 OR p_teto IS NULL OR p_teto<=0 OR p_teto>500
    OR p_reserva IS NULL OR p_reserva<0 OR p_reserva>p_teto THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('relacionamento-uso:'||p_tenant::text||':'||p_dia::text,0));
  SELECT * INTO t FROM private.cliente_relacionamento_ia_tentativas WHERE id=p_id;
  IF FOUND THEN RETURN t.tenant_id=p_tenant AND t.client_id=p_cliente AND t.dia=p_dia AND t.reserva=round(p_reserva,6); END IF;
  SELECT * INTO r FROM public.cliente_relacionamento WHERE tenant_id=p_tenant AND client_id=p_cliente FOR UPDATE;
  IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM public.clients WHERE id=p_cliente AND tenant_id=p_tenant) THEN RETURN false; END IF;
  -- Transição sem perder nem dobrar a última chamada do worker antigo: copiar
  -- uma vez o custo legado ANTES que uma análise nova sobrescreva aquela linha.
  IF (r.analisado_em AT TIME ZONE 'America/Sao_Paulo')::date=p_dia
    AND (r.ia_uso_contabilizado_ate IS NULL OR r.ia_uso_contabilizado_ate<r.analisado_em) THEN
    PERFORM public.cliente_relacionamento_uso_registrar(p_tenant,p_dia,1,COALESCE(r.custo_usd,0));
    UPDATE public.cliente_relacionamento SET ia_uso_contabilizado_ate=r.analisado_em WHERE tenant_id=p_tenant AND client_id=p_cliente;
  END IF;
  uso:=public.cliente_relacionamento_uso_total(p_tenant,p_dia);
  IF (uso->>'chamadas')::integer>=p_limite OR (uso->>'custo')::numeric+p_reserva>p_teto THEN RETURN false; END IF;
  INSERT INTO private.cliente_relacionamento_ia_tentativas(id,tenant_id,client_id,dia,reserva)
    VALUES(p_id,p_tenant,p_cliente,p_dia,round(p_reserva,6));
  PERFORM public.cliente_relacionamento_uso_registrar(p_tenant,p_dia,1,round(p_reserva,6));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.cliente_relacionamento_ia_reservar(uuid,uuid,uuid,date,integer,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_relacionamento_ia_reservar(uuid,uuid,uuid,date,integer,numeric,numeric) TO service_role;

CREATE FUNCTION public.cliente_relacionamento_ia_confirmar(p_id uuid,p_custo numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t private.cliente_relacionamento_ia_tentativas%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL OR p_custo IS NULL OR p_custo<0 OR p_custo>1000 THEN RETURN false; END IF;
  SELECT * INTO t FROM private.cliente_relacionamento_ia_tentativas WHERE id=p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('relacionamento-uso:'||t.tenant_id::text||':'||t.dia::text,0));
  SELECT * INTO t FROM private.cliente_relacionamento_ia_tentativas WHERE id=p_id FOR UPDATE;
  IF t.confirmado_em IS NOT NULL THEN RETURN t.custo_confirmado=round(p_custo,6); END IF;
  UPDATE public.cliente_relacionamento_uso SET custo_usd=greatest(0,custo_usd-t.reserva+round(p_custo,6))
    WHERE tenant_id=t.tenant_id AND dia=t.dia;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE private.cliente_relacionamento_ia_tentativas SET custo_confirmado=round(p_custo,6),confirmado_em=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.cliente_relacionamento_ia_confirmar(uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_relacionamento_ia_confirmar(uuid,numeric) TO service_role;

-- Mesma fila/lease, endpoint novo: worker antigo continua diário durante rollout.
-- Reentrada só com mensagem atestada posterior ao cursor em canal confirmado.
CREATE FUNCTION public.cliente_relacionamento_reivindicar_ia(
  p_tenant uuid,p_client_ids uuid[],p_dia date,p_limite integer DEFAULT 20
) RETURNS SETOF public.cliente_relacionamento LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_tenant IS NULL OR p_dia IS NULL OR COALESCE(cardinality(p_client_ids),0)>5000 THEN
    RAISE EXCEPTION 'Parâmetros inválidos.' USING ERRCODE='22023';
  END IF;
  IF COALESCE(cardinality(p_client_ids),0)=0 THEN RETURN; END IF;
  INSERT INTO public.cliente_relacionamento(tenant_id,client_id)
    SELECT p_tenant,id FROM public.clients WHERE tenant_id=p_tenant AND id=ANY(p_client_ids)
    ON CONFLICT(tenant_id,client_id) DO NOTHING;
  RETURN QUERY UPDATE public.cliente_relacionamento r SET reivindicado_em=clock_timestamp()
    WHERE (r.tenant_id,r.client_id) IN (
      SELECT x.tenant_id,x.client_id FROM public.cliente_relacionamento x
      WHERE x.tenant_id=p_tenant AND x.client_id=ANY(p_client_ids)
        AND (x.reivindicado_em IS NULL OR x.reivindicado_em<clock_timestamp()-interval '10 minutes')
        AND (x.processado_em IS NULL OR x.processado_em<clock_timestamp()-interval '2 minutes')
        AND (x.dia_processado IS DISTINCT FROM p_dia OR (
          NOT EXISTS(SELECT 1 FROM public.app_modules a WHERE a.tenant_id=p_tenant AND a.slug='atendimento' AND a.enabled IS FALSE)
          AND EXISTS(SELECT 1 FROM private.atendimento_wa_entradas e JOIN public.cliente_canais c
            ON c.tenant_id=e.tenant_id AND c.tipo=e.canal_tipo AND c.chave=e.canal_chave
            AND c.client_id=x.client_id AND c.status='confirmado'
            WHERE e.tenant_id=p_tenant AND e.atestada_em IS NOT NULL
              AND e.criado_em>COALESCE(x.analisado_ate,'-infinity'::timestamptz)
              AND NOT private.cliente_canal_excluido(p_tenant,e.canal_tipo,e.canal_chave))))
      ORDER BY x.analisado_em NULLS FIRST,x.client_id
      LIMIT greatest(1,least(COALESCE(p_limite,20),200)) FOR UPDATE SKIP LOCKED
    ) RETURNING r.*;
END;
$$;
REVOKE ALL ON FUNCTION public.cliente_relacionamento_reivindicar_ia(uuid,uuid[],date,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_relacionamento_reivindicar_ia(uuid,uuid[],date,integer) TO service_role;
CREATE INDEX atendimento_wa_entradas_novidade ON private.atendimento_wa_entradas(tenant_id,canal_tipo,canal_chave,criado_em)
  WHERE atestada_em IS NOT NULL;

-- Preparação da cadência do MESMO job, sem criar novo serviço/agenda externa.
-- Só terá efeito quando esta migration for expressamente autorizada/aplicada.
DO $$ DECLARE jid bigint; BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname='wa-relacionamento-analisar-diario';
  IF jid IS NOT NULL THEN
    PERFORM cron.alter_job(jid,schedule:='*/15 * * * *',command:=$job$
      SELECT net.http_post(
        url:='https://wuzmckatbmlpkdxtfhqr.supabase.co/functions/v1/wa-relacionamento-analisar',
        headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',s.decrypted_secret),
        body:='{}'::jsonb,timeout_milliseconds:=150000)
      FROM vault.decrypted_secrets s WHERE s.name='wa_auto_cron_secret'
        AND EXISTS(SELECT 1 FROM public.app_modules a WHERE a.slug='automacoes-wa' AND a.enabled IS TRUE);
    $job$);
  END IF;
END; $$;
