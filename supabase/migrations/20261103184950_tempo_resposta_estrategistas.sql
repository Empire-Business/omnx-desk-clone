-- Preparada localmente. Não executar sem autorização nominal de ambiente.
-- Sem backfill: relógio novo exige ingresso comprovado, calendário e titular.
-- Nenhuma mudança em contratos, comissões ou carteiras; sem cron novo no Desk.
BEGIN;

CREATE TABLE public.tempo_resposta_config (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE NO ACTION,
  modo text NOT NULL DEFAULT 'desligado' CHECK (modo IN ('desligado','observacao','alertas')),
  feriados date[] NOT NULL DEFAULT '{}',
  anos_confirmados integer[] NOT NULL DEFAULT '{}',
  revisao bigint NOT NULL DEFAULT 0 CHECK (revisao >= 0),
  monitorando_desde timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  atualizado_por uuid,
  CHECK (cardinality(feriados) <= 150 AND array_position(feriados,NULL) IS NULL),
  CHECK (cardinality(anos_confirmados) <= 5 AND array_position(anos_confirmados,NULL) IS NULL)
);
CREATE TABLE public.tempo_resposta_titulares (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE NO ACTION,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE NO ACTION,
  user_id uuid NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  atualizado_por uuid NOT NULL,
  PRIMARY KEY (tenant_id,client_id)
);
CREATE TABLE public.tempo_resposta_episodios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE NO ACTION,
  client_id uuid REFERENCES public.clients(id) ON DELETE NO ACTION,
  cliente_nome text,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE NO ACTION,
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE NO ACTION,
  primeira_mensagem_id uuid NOT NULL,
  inicio timestamptz NOT NULL,
  ultima_mensagem_em timestamptz NOT NULL,
  resposta_em timestamptz,
  respondente_id uuid,
  respondente_nome text,
  estado text NOT NULL DEFAULT 'aberto' CHECK (estado IN ('aberto','respondido','cancelado')),
  qualidade text NOT NULL DEFAULT 'confiavel' CHECK (qualidade IN ('confiavel','inconclusiva')),
  motivo text,
  feriados date[] NOT NULL,
  anos_confirmados integer[] NOT NULL,
  config_revisao bigint NOT NULL,
  responsavel_id uuid,
  responsavel_nome text,
  segmento_atual_id uuid,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,primeira_mensagem_id),
  CHECK (resposta_em IS NULL OR resposta_em >= inicio)
);
CREATE UNIQUE INDEX tempo_resposta_uma_espera ON public.tempo_resposta_episodios(tenant_id,conversation_id) WHERE estado='aberto';
CREATE INDEX tempo_resposta_abertos ON public.tempo_resposta_episodios(tenant_id,id) WHERE estado='aberto';
CREATE INDEX tempo_resposta_cliente ON public.tempo_resposta_episodios(tenant_id,client_id) WHERE estado='aberto';
CREATE INDEX tempo_resposta_historico ON public.tempo_resposta_episodios(tenant_id,criado_em DESC,id DESC);
CREATE TABLE public.tempo_resposta_segmentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  episodio_id uuid NOT NULL,
  user_id uuid NOT NULL,
  nome text NOT NULL,
  inicio timestamptz NOT NULL,
  fim timestamptz,
  assignment_revision bigint NOT NULL DEFAULT 0,
  FOREIGN KEY (tenant_id,episodio_id) REFERENCES public.tempo_resposta_episodios(tenant_id,id) ON DELETE NO ACTION,
  UNIQUE (tenant_id,episodio_id,id),
  CHECK (fim IS NULL OR fim >= inicio)
);
CREATE UNIQUE INDEX tempo_resposta_segmento_aberto ON public.tempo_resposta_segmentos(tenant_id,episodio_id) WHERE fim IS NULL;
CREATE INDEX tempo_resposta_segmentos_pessoa ON public.tempo_resposta_segmentos(tenant_id,user_id,inicio);
ALTER TABLE public.tempo_resposta_episodios ADD CONSTRAINT tempo_resposta_segmento_atual_fk
  FOREIGN KEY (tenant_id,id,segmento_atual_id) REFERENCES public.tempo_resposta_segmentos(tenant_id,episodio_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE public.tempo_resposta_pausas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE NO ACTION,
  user_id uuid NOT NULL,
  nome text NOT NULL,
  inicio timestamptz NOT NULL DEFAULT clock_timestamp(),
  fim timestamptz NOT NULL,
  previsto_fim timestamptz NOT NULL,
  motivo text NOT NULL CHECK (length(motivo) BETWEEN 3 AND 300),
  criado_por uuid NOT NULL,
  encerrado_por uuid,
  CHECK (fim >= inicio AND previsto_fim > inicio AND previsto_fim <= inicio + interval '4 hours' AND fim <= previsto_fim)
);
CREATE INDEX tempo_resposta_pausas_pessoa ON public.tempo_resposta_pausas(tenant_id,user_id,inicio,fim);
CREATE TABLE public.tempo_resposta_ingressos (
  mensagem_id uuid PRIMARY KEY REFERENCES public.chat_messages(id) ON DELETE NO ACTION,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE NO ACTION,
  conversation_id uuid NOT NULL,
  ocorrido_em timestamptz,
  recebido_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  recuperada boolean NOT NULL,
  confiavel boolean NOT NULL CHECK (confiavel),
  ator_verificado uuid,
  UNIQUE (tenant_id,mensagem_id)
);
CREATE INDEX tempo_resposta_ingressos_conversa ON public.tempo_resposta_ingressos(tenant_id,conversation_id,ocorrido_em);
CREATE TABLE public.tempo_resposta_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE NO ACTION,
  connection_id uuid NOT NULL REFERENCES public.iris_gt3_connections(id) ON DELETE NO ACTION,
  recipient_id uuid NOT NULL REFERENCES public.iris_gt3_recipients(id) ON DELETE NO ACTION,
  gt3_user_id uuid NOT NULL,
  recipient_revisao bigint NOT NULL,
  episodio_id uuid NOT NULL,
  segmento_id uuid NOT NULL,
  etapa text NOT NULL CHECK (etapa IN ('30','50','60')),
  config_revisao bigint NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','sem_alertas','cancelado','falhou')),
  texto text CHECK (octet_length(texto) <= 8000),
  delivery_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id,episodio_id,segmento_id) REFERENCES public.tempo_resposta_segmentos(tenant_id,episodio_id,id) ON DELETE NO ACTION,
  UNIQUE(connection_id,recipient_id,recipient_revisao,episodio_id,segmento_id,etapa)
);
CREATE INDEX tempo_resposta_alertas_pendentes ON public.tempo_resposta_alertas(tenant_id,connection_id,id) WHERE status IN ('pendente','falhou');
CREATE INDEX tempo_resposta_alertas_episodio ON public.tempo_resposta_alertas(tenant_id,episodio_id,created_at);
CREATE TABLE public.tempo_resposta_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE NO ACTION,
  ator_id uuid,
  acao text NOT NULL,
  ocorrido_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  dados jsonb NOT NULL CHECK (jsonb_typeof(dados)='object' AND octet_length(dados::text)<=32000)
);
CREATE INDEX tempo_resposta_auditoria_tenant ON public.tempo_resposta_auditoria(tenant_id,ocorrido_em DESC);

ALTER TABLE public.tempo_resposta_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tempo_resposta_titulares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tempo_resposta_episodios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tempo_resposta_segmentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tempo_resposta_pausas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tempo_resposta_ingressos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tempo_resposta_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tempo_resposta_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tempo_resposta_config,public.tempo_resposta_titulares,public.tempo_resposta_episodios,
  public.tempo_resposta_segmentos,public.tempo_resposta_pausas,public.tempo_resposta_ingressos,
  public.tempo_resposta_alertas,public.tempo_resposta_auditoria FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.tempo_resposta_config,public.tempo_resposta_titulares,public.tempo_resposta_episodios,
  public.tempo_resposta_segmentos,public.tempo_resposta_pausas,public.tempo_resposta_ingressos,
  public.tempo_resposta_alertas,public.tempo_resposta_auditoria TO service_role;
GRANT INSERT,UPDATE ON public.tempo_resposta_alertas TO service_role;

-- Todas as chamadas de pessoa usam sua sessão, nunca user/tenant enviados pelo navegador.
CREATE FUNCTION private.tempo_resposta_autorizar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u record;
BEGIN
  SELECT id,tenant_id,nome INTO u FROM public.users
   WHERE id=auth.uid() AND tenant_id=public.get_user_tenant_id() AND ativo IS TRUE
     AND perfil IN ('admin','gerente') FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=u.id AND p.tenant_id=u.tenant_id)
    OR NOT coalesce(public.has_permissao('automacoes-wa','admin'),false) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='tempo_resposta_sem_permissao';
  END IF;
  RETURN jsonb_build_object('tenant_id',u.tenant_id,'ator_id',u.id,'ator_nome',u.nome);
END;
$fn$;
REVOKE ALL ON FUNCTION private.tempo_resposta_autorizar() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.tempo_resposta_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='tempo_resposta_historico_imutavel';
END;
$fn$;
REVOKE ALL ON FUNCTION private.tempo_resposta_append_only() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tempo_resposta_auditoria_imutavel BEFORE UPDATE OR DELETE ON public.tempo_resposta_auditoria
  FOR EACH ROW EXECUTE FUNCTION private.tempo_resposta_append_only();
CREATE TRIGGER tempo_resposta_auditoria_sem_truncate BEFORE TRUNCATE ON public.tempo_resposta_auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION private.tempo_resposta_append_only();
CREATE TRIGGER tempo_resposta_ingressos_imutaveis BEFORE UPDATE OR DELETE ON public.tempo_resposta_ingressos
  FOR EACH ROW EXECUTE FUNCTION private.tempo_resposta_append_only();
CREATE TRIGGER tempo_resposta_ingressos_sem_truncate BEFORE TRUNCATE ON public.tempo_resposta_ingressos
  FOR EACH STATEMENT EXECUTE FUNCTION private.tempo_resposta_append_only();

CREATE FUNCTION private.tempo_resposta_resolver_titular(p_tenant uuid,p_client uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  WITH candidatos AS (
    SELECT DISTINCT a.user_id FROM public.client_assignments a JOIN public.users u
      ON u.id=a.user_id AND u.tenant_id=a.tenant_id AND u.ativo IS TRUE AND u.perfil<>'cliente'
     WHERE a.tenant_id=p_tenant AND a.client_id=p_client AND a.tipo='estrategista' AND a.ativo IS TRUE
  ), escolhido AS (
    SELECT t.user_id FROM public.tempo_resposta_titulares t JOIN candidatos c ON c.user_id=t.user_id
     WHERE t.tenant_id=p_tenant AND t.client_id=p_client
  )
  SELECT coalesce((SELECT user_id FROM escolhido),
    (SELECT (array_agg(user_id))[1] FROM candidatos HAVING count(*)=1))
$fn$;
REVOKE ALL ON FUNCTION private.tempo_resposta_resolver_titular(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.tempo_resposta_resolver_cliente(p_tenant uuid,p_contact uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ct record; ids uuid[]; tp text; ch text;
BEGIN
  SELECT * INTO ct FROM public.chat_contacts WHERE id=p_contact AND tenant_id=p_tenant;
  IF NOT FOUND THEN RETURN NULL; END IF;
  tp:=private.canal_tipo(ct.numero_whatsapp,ct.group_size); ch:=private.canal_chave(ct.numero_whatsapp,ct.group_size);
  IF coalesce(ct.restrito_admin,false) OR private.cliente_canal_excluido(p_tenant,tp,ch) THEN RETURN NULL; END IF;
  SELECT array_agg(DISTINCT c.client_id) INTO ids FROM public.cliente_canais c
   WHERE c.tenant_id=p_tenant AND c.tipo=tp AND c.chave=ch AND c.status='confirmado';
  IF cardinality(ids)>0 THEN
    IF cardinality(ids)=1 THEN RETURN ids[1]; END IF;
    RETURN NULL;
  END IF;
  SELECT array_agg(DISTINCT v.client_id) INTO ids FROM (
    SELECT ct.client_id WHERE ct.client_id IS NOT NULL
    UNION SELECT cc.client_id FROM public.chat_contact_clients cc WHERE cc.tenant_id=p_tenant AND cc.contact_id=p_contact
  ) v WHERE NOT EXISTS (SELECT 1 FROM public.cliente_canais r WHERE r.tenant_id=p_tenant
    AND r.client_id=v.client_id AND r.tipo=tp AND r.chave=ch AND r.status='rejeitado');
  IF cardinality(ids)=1 THEN RETURN ids[1]; END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION private.tempo_resposta_resolver_cliente(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Nova identidade de segmento a cada troca. A→B→A jamais revive entrega anterior.
CREATE FUNCTION private.tempo_resposta_sincronizar_titular(p_tenant uuid,p_client uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ep public.tempo_resposta_episodios; titular uuid; nome text; sid uuid; instante timestamptz:=clock_timestamp(); rev bigint;
BEGIN
  titular:=private.tempo_resposta_resolver_titular(p_tenant,p_client);
  SELECT u.nome INTO nome FROM public.users u WHERE u.tenant_id=p_tenant AND u.id=titular;
  SELECT revisao INTO rev FROM public.client_assignment_state WHERE tenant_id=p_tenant AND client_id=p_client;
  FOR ep IN SELECT * FROM public.tempo_resposta_episodios
    WHERE tenant_id=p_tenant AND client_id=p_client AND estado='aberto' ORDER BY id FOR UPDATE LOOP
    IF ep.responsavel_id IS NOT DISTINCT FROM titular THEN CONTINUE; END IF;
    UPDATE public.tempo_resposta_segmentos SET fim=greatest(inicio,instante)
     WHERE tenant_id=p_tenant AND episodio_id=ep.id AND fim IS NULL;
    UPDATE public.tempo_resposta_alertas SET status='cancelado',updated_at=instante
     WHERE tenant_id=p_tenant AND episodio_id=ep.id AND status IN ('pendente','falhou');
    sid:=NULL;
    IF titular IS NOT NULL THEN
      INSERT INTO public.tempo_resposta_segmentos(tenant_id,episodio_id,user_id,nome,inicio,assignment_revision)
        VALUES(p_tenant,ep.id,titular,coalesce(nome,'Estrategista'),greatest(ep.inicio,instante),coalesce(rev,0)) RETURNING id INTO sid;
    END IF;
    UPDATE public.tempo_resposta_episodios SET responsavel_id=titular,responsavel_nome=nome,
      segmento_atual_id=sid,atualizado_em=instante,
      qualidade=CASE WHEN motivo='titular_indefinido' AND titular IS NOT NULL THEN 'confiavel' ELSE qualidade END,
      motivo=CASE WHEN motivo='titular_indefinido' AND titular IS NOT NULL THEN NULL ELSE motivo END
      WHERE tenant_id=p_tenant AND id=ep.id;
    INSERT INTO public.tempo_resposta_auditoria(tenant_id,ator_id,acao,dados)
      VALUES(p_tenant,auth.uid(),'troca_titular',jsonb_build_object('episodio_id',ep.id,'anterior',ep.responsavel_id,'novo',titular,'segmento_id',sid));
  END LOOP;
END;
$fn$;
REVOKE ALL ON FUNCTION private.tempo_resposta_sincronizar_titular(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.tempo_resposta_assignment_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a public.client_assignments;
BEGIN
  IF TG_OP='DELETE' THEN a:=OLD; ELSE a:=NEW; END IF;
  IF a.tipo='estrategista' THEN PERFORM private.tempo_resposta_sincronizar_titular(a.tenant_id,a.client_id); END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.tempo_resposta_assignment_changed() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zzzz_tempo_resposta_assignment AFTER INSERT OR UPDATE OR DELETE ON public.client_assignments
  FOR EACH ROW EXECUTE FUNCTION private.tempo_resposta_assignment_changed();

CREATE FUNCTION private.tempo_resposta_instancia_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM 'conectado' OR NEW.ativo IS DISTINCT FROM true THEN
    UPDATE public.tempo_resposta_episodios SET qualidade='inconclusiva',motivo='conexao_interrompida',atualizado_em=clock_timestamp()
      WHERE tenant_id=NEW.tenant_id AND instance_id=NEW.id AND estado='aberto';
    UPDATE public.tempo_resposta_alertas a SET status='cancelado',updated_at=clock_timestamp()
      WHERE a.tenant_id=NEW.tenant_id AND a.status IN ('pendente','falhou') AND EXISTS
        (SELECT 1 FROM public.tempo_resposta_episodios e WHERE e.tenant_id=NEW.tenant_id AND e.id=a.episodio_id AND e.instance_id=NEW.id AND e.estado='aberto');
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.tempo_resposta_instancia_changed() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tempo_resposta_instancia_changed AFTER UPDATE OF status,ativo ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION private.tempo_resposta_instancia_changed();

CREATE FUNCTION public.tempo_resposta_configurar(p_revisao bigint,p_modo text,p_feriados date[],p_anos integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ctx jsonb:=private.tempo_resposta_autorizar(); t uuid:=(ctx->>'tenant_id')::uuid;
  cfg public.tempo_resposta_config; antes jsonb; ano integer:=extract(year FROM clock_timestamp() AT TIME ZONE 'America/Sao_Paulo');
  feriados date[]; anos integer[]; instante timestamptz:=clock_timestamp();
BEGIN
  IF p_revisao IS NULL OR p_modo IS NULL OR p_modo NOT IN ('desligado','observacao','alertas')
    OR p_feriados IS NULL OR p_anos IS NULL OR cardinality(p_feriados)>150 OR cardinality(p_anos)>5
    OR array_position(p_feriados,NULL) IS NOT NULL OR array_position(p_anos,NULL) IS NOT NULL
    OR EXISTS (SELECT 1 FROM unnest(p_anos) y WHERE y<2020 OR y>2100)
    OR EXISTS (SELECT 1 FROM unnest(p_feriados) d WHERE d<'2020-01-01'::date OR d>'2100-12-31'::date) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_config_invalida';
  END IF;
  IF p_modo<>'desligado' AND NOT (ano=ANY(p_anos)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_confirme_calendario';
  END IF;
  SELECT coalesce(array_agg(DISTINCT d ORDER BY d),'{}'::date[]) INTO feriados FROM unnest(p_feriados) d;
  SELECT coalesce(array_agg(DISTINCT y ORDER BY y),'{}'::integer[]) INTO anos FROM unnest(p_anos) y;
  INSERT INTO public.tempo_resposta_config(tenant_id) VALUES(t) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT cfg FROM public.tempo_resposta_config WHERE tenant_id=t FOR UPDATE;
  IF cfg.revisao<>p_revisao THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='tempo_resposta_revisao_alterada'; END IF;
  antes:=to_jsonb(cfg);
  UPDATE public.tempo_resposta_config SET modo=p_modo,feriados=tempo_resposta_configurar.feriados,
    anos_confirmados=anos,revisao=revisao+1,atualizado_em=instante,atualizado_por=auth.uid(),
    monitorando_desde=CASE WHEN p_modo='desligado' THEN NULL WHEN cfg.modo='desligado' THEN instante ELSE cfg.monitorando_desde END
    WHERE tenant_id=t RETURNING * INTO cfg;
  -- Ordem de bloqueio consistente com captura/troca: episódio antes de
  -- segmento/outbox. Evita a inversão segmento→episódio ao desligar.
  PERFORM id FROM public.tempo_resposta_episodios WHERE tenant_id=t AND estado='aberto' ORDER BY id FOR UPDATE;
  IF p_modo='desligado' THEN
    -- Observação/calendário preservam a identidade do aviso para retomar sem
    -- perda nem duplicidade. A ponte sempre reconfere a política atual.
    UPDATE public.tempo_resposta_alertas SET status='cancelado',updated_at=instante
      WHERE tenant_id=t AND status IN ('pendente','falhou');
    UPDATE public.tempo_resposta_segmentos s SET fim=greatest(s.inicio,instante)
     FROM public.tempo_resposta_episodios e WHERE e.tenant_id=t AND e.estado='aberto'
       AND s.tenant_id=t AND s.episodio_id=e.id AND s.fim IS NULL;
    UPDATE public.tempo_resposta_episodios SET estado='cancelado',motivo='monitor_desligado',atualizado_em=instante
      WHERE tenant_id=t AND estado='aberto';
  END IF;
  INSERT INTO public.tempo_resposta_auditoria(tenant_id,ator_id,acao,dados)
    VALUES(t,auth.uid(),'configurar',jsonb_build_object('antes',antes,'depois',to_jsonb(cfg)));
  RETURN jsonb_build_object('ok',true,'config',to_jsonb(cfg));
END;
$fn$;
REVOKE ALL ON FUNCTION public.tempo_resposta_configurar(bigint,text,date[],integer[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tempo_resposta_configurar(bigint,text,date[],integer[]) TO authenticated;

CREATE FUNCTION public.tempo_resposta_definir_titular(p_client uuid,p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ctx jsonb:=private.tempo_resposta_autorizar(); t uuid:=(ctx->>'tenant_id')::uuid; antes uuid;
BEGIN
  PERFORM 1 FROM public.clients WHERE id=p_client AND tenant_id=t AND ativo IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='tempo_resposta_cliente_indisponivel'; END IF;
  IF p_user IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.client_assignments a JOIN public.users u
    ON u.id=a.user_id AND u.tenant_id=t AND u.ativo IS TRUE AND u.perfil<>'cliente'
    WHERE a.tenant_id=t AND a.client_id=p_client AND a.user_id=p_user AND a.tipo='estrategista' AND a.ativo IS TRUE) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_titular_nao_vinculado';
  END IF;
  SELECT user_id INTO antes FROM public.tempo_resposta_titulares WHERE tenant_id=t AND client_id=p_client;
  IF p_user IS NULL THEN DELETE FROM public.tempo_resposta_titulares WHERE tenant_id=t AND client_id=p_client;
  ELSE INSERT INTO public.tempo_resposta_titulares(tenant_id,client_id,user_id,atualizado_por)
    VALUES(t,p_client,p_user,auth.uid()) ON CONFLICT(tenant_id,client_id) DO UPDATE
      SET user_id=excluded.user_id,atualizado_por=excluded.atualizado_por,atualizado_em=clock_timestamp();
  END IF;
  PERFORM private.tempo_resposta_sincronizar_titular(t,p_client);
  INSERT INTO public.tempo_resposta_auditoria(tenant_id,ator_id,acao,dados)
    VALUES(t,auth.uid(),'definir_titular',jsonb_build_object('client_id',p_client,'antes',antes,'depois',p_user));
  RETURN jsonb_build_object('ok',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.tempo_resposta_definir_titular(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tempo_resposta_definir_titular(uuid,uuid) TO authenticated;

CREATE FUNCTION public.tempo_resposta_pausar(p_user uuid,p_minutos integer,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ctx jsonb:=private.tempo_resposta_autorizar(); t uuid:=(ctx->>'tenant_id')::uuid;
  instante timestamptz:=clock_timestamp(); nome text; p public.tempo_resposta_pausas;
BEGIN
  IF p_minutos IS NULL OR p_minutos NOT BETWEEN 15 AND 240 OR p_motivo IS NULL OR length(trim(p_motivo)) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_pausa_invalida';
  END IF;
  SELECT u.nome INTO nome FROM public.users u WHERE u.id=p_user AND u.tenant_id=t AND u.ativo IS TRUE
    AND u.perfil<>'cliente' AND EXISTS (SELECT 1 FROM public.client_assignments a
      WHERE a.tenant_id=t AND a.user_id=u.id AND a.tipo='estrategista' AND a.ativo IS TRUE) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='tempo_resposta_pessoa_indisponivel'; END IF;
  INSERT INTO public.tempo_resposta_pausas(tenant_id,user_id,nome,inicio,fim,previsto_fim,motivo,criado_por)
    VALUES(t,p_user,nome,instante,instante+make_interval(mins=>p_minutos),instante+make_interval(mins=>p_minutos),trim(p_motivo),auth.uid()) RETURNING * INTO p;
  INSERT INTO public.tempo_resposta_auditoria(tenant_id,ator_id,acao,dados) VALUES(t,auth.uid(),'pausar',to_jsonb(p));
  RETURN jsonb_build_object('ok',true,'pausa',to_jsonb(p));
END;
$fn$;
REVOKE ALL ON FUNCTION public.tempo_resposta_pausar(uuid,integer,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tempo_resposta_pausar(uuid,integer,text) TO authenticated;
CREATE FUNCTION public.tempo_resposta_encerrar_pausa(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ctx jsonb:=private.tempo_resposta_autorizar(); t uuid:=(ctx->>'tenant_id')::uuid; p public.tempo_resposta_pausas;
BEGIN
  SELECT * INTO p FROM public.tempo_resposta_pausas WHERE tenant_id=t AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='tempo_resposta_pausa_indisponivel'; END IF;
  IF p.fim>clock_timestamp() THEN
    UPDATE public.tempo_resposta_pausas SET fim=greatest(inicio,clock_timestamp()),encerrado_por=auth.uid()
      WHERE tenant_id=t AND id=p_id RETURNING * INTO p;
    INSERT INTO public.tempo_resposta_auditoria(tenant_id,ator_id,acao,dados) VALUES(t,auth.uid(),'encerrar_pausa',to_jsonb(p));
  END IF;
  RETURN jsonb_build_object('ok',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.tempo_resposta_encerrar_pausa(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tempo_resposta_encerrar_pausa(uuid) TO authenticated;

-- Handler é responsável por comprovar token de ingresso / sessão real. Nenhum
-- navegador pode executar esta RPC ou gravar a comprovação diretamente.
CREATE FUNCTION public.tempo_resposta_registrar(p_mensagem uuid,p_confiavel boolean,p_ocorrido_em timestamptz,p_recuperada boolean,p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE m public.chat_messages; cv public.chat_conversations; ct public.chat_contacts; cfg public.tempo_resposta_config;
  ep public.tempo_resposta_episodios; instante timestamptz:=clock_timestamp(); quando timestamptz;
  cliente uuid; cliente_nome text; titular uuid; titular_nome text; ator uuid; ator_nome text; sid uuid; rev bigint;
  inc text; tp text; ch text; ultimo timestamptz; linhas integer;
BEGIN
  IF p_confiavel IS DISTINCT FROM true OR p_recuperada IS NULL THEN RETURN jsonb_build_object('ok',true,'ignorado',true); END IF;
  SELECT * INTO m FROM public.chat_messages WHERE id=p_mensagem;
  IF NOT FOUND OR m.tenant_id IS NULL THEN RETURN jsonb_build_object('ok',true,'ignorado',true); END IF;
  SELECT * INTO cfg FROM public.tempo_resposta_config WHERE tenant_id=m.tenant_id FOR SHARE;
  IF NOT FOUND OR cfg.modo='desligado' OR cfg.monitorando_desde IS NULL THEN RETURN jsonb_build_object('ok',true,'ignorado',true); END IF;
  SELECT * INTO cv FROM public.chat_conversations WHERE id=m.conversation_id AND tenant_id=m.tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'ignorado',true); END IF;
  SELECT * INTO ct FROM public.chat_contacts WHERE id=cv.contact_id AND tenant_id=m.tenant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'ignorado',true); END IF;
  tp:=private.canal_tipo(ct.numero_whatsapp,ct.group_size); ch:=private.canal_chave(ct.numero_whatsapp,ct.group_size);
  IF coalesce(ct.restrito_admin,false) OR private.cliente_canal_excluido(m.tenant_id,tp,ch) THEN RETURN jsonb_build_object('ok',true,'ignorado',true); END IF;
  IF p_user IS NOT NULL THEN
    IF p_user IS DISTINCT FROM m.agente_id OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=p_user
      AND u.tenant_id=m.tenant_id AND u.ativo IS TRUE AND u.perfil<>'cliente') THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='tempo_resposta_autor_incoerente';
    END IF;
    ator:=p_user;
  ELSIF m.autor_tipo='equipe' AND coalesce(m.autor_origem,'') NOT LIKE 'heuristica%'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=m.autor_user_id AND u.tenant_id=m.tenant_id AND u.ativo IS TRUE AND u.perfil<>'cliente') THEN
    ator:=m.autor_user_id;
  END IF;
  -- Eventos falhos/IA/sistema/reação não são resposta humana nem pedido novo.
  IF m.status_envio IN ('enviando','falha') OR m.enviado_por_ia IS TRUE OR m.autor_tipo IN ('ia','sistema')
    OR m.tipo IN ('sistema','reacao','reaction') THEN RETURN jsonb_build_object('ok',true,'ignorado',true); END IF;
  INSERT INTO public.tempo_resposta_ingressos(mensagem_id,tenant_id,conversation_id,ocorrido_em,recuperada,confiavel,ator_verificado)
    VALUES(m.id,m.tenant_id,m.conversation_id,p_ocorrido_em,p_recuperada,true,ator) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS linhas=ROW_COUNT;
  IF linhas=0 THEN RETURN jsonb_build_object('ok',true,'duplicado',true); END IF;
  SELECT * INTO ep FROM public.tempo_resposta_episodios WHERE tenant_id=m.tenant_id AND conversation_id=cv.id AND estado='aberto' FOR UPDATE;
  SELECT max(ocorrido_em) INTO ultimo FROM public.tempo_resposta_ingressos
    WHERE tenant_id=m.tenant_id AND conversation_id=cv.id AND mensagem_id<>m.id;
  quando:=coalesce(p_ocorrido_em,instante);
  inc:=CASE WHEN p_ocorrido_em IS NULL THEN 'horario_nao_confirmado'
    WHEN p_recuperada THEN 'mensagem_recuperada'
    WHEN p_ocorrido_em>instante+interval '1 minute' THEN 'horario_futuro'
    WHEN p_ocorrido_em<instante-interval '5 minutes' THEN 'sincronizacao_atrasada'
    WHEN ultimo IS NOT NULL AND p_ocorrido_em<ultimo THEN 'mensagem_fora_de_ordem'
    WHEN coalesce(m.autor_origem,'') LIKE 'heuristica%' OR m.autor_tipo IS NULL OR m.autor_tipo='desconhecido' THEN 'autoria_nao_confirmada'
    WHEN m.autor_tipo='equipe' AND ator IS NULL THEN 'equipe_sem_identificacao'
    WHEN NOT (extract(year FROM quando AT TIME ZONE 'America/Sao_Paulo')::integer=ANY(cfg.anos_confirmados)) THEN 'calendario_nao_confirmado'
    ELSE NULL END;
  IF quando<cfg.monitorando_desde OR p_recuperada OR (ultimo IS NOT NULL AND quando<ultimo) OR quando>instante+interval '1 minute' THEN
    IF ep.id IS NOT NULL AND quando>=ep.inicio THEN
      UPDATE public.tempo_resposta_episodios SET qualidade='inconclusiva',motivo=coalesce(inc,'mensagem_fora_de_ordem'),atualizado_em=instante
        WHERE tenant_id=m.tenant_id AND id=ep.id;
      UPDATE public.tempo_resposta_alertas SET status='cancelado',updated_at=instante
        WHERE tenant_id=m.tenant_id AND episodio_id=ep.id AND status IN ('pendente','falhou');
    END IF;
    RETURN jsonb_build_object('ok',true,'ignorado',true);
  END IF;
  IF ator IS NOT NULL THEN
    IF ep.id IS NOT NULL AND quando>=ep.inicio THEN
      SELECT nome INTO ator_nome FROM public.users WHERE id=ator AND tenant_id=m.tenant_id;
      UPDATE public.tempo_resposta_episodios SET estado='respondido',resposta_em=quando,respondente_id=ator,
        respondente_nome=ator_nome,ultima_mensagem_em=greatest(ultima_mensagem_em,quando),atualizado_em=instante,
        qualidade=CASE WHEN inc IS NULL THEN qualidade ELSE 'inconclusiva' END,motivo=coalesce(inc,motivo)
        WHERE tenant_id=m.tenant_id AND id=ep.id;
      UPDATE public.tempo_resposta_segmentos SET fim=greatest(inicio,quando) WHERE tenant_id=m.tenant_id AND episodio_id=ep.id AND fim IS NULL;
      UPDATE public.tempo_resposta_alertas SET status='cancelado',updated_at=instante
        WHERE tenant_id=m.tenant_id AND episodio_id=ep.id AND status IN ('pendente','falhou');
    END IF;
    RETURN jsonb_build_object('ok',true);
  END IF;
  IF m.autor_tipo='equipe' OR m.enviado_por_agente IS TRUE THEN
    IF ep.id IS NOT NULL THEN UPDATE public.tempo_resposta_episodios SET qualidade='inconclusiva',motivo=coalesce(inc,'equipe_sem_identificacao'),atualizado_em=instante
      WHERE tenant_id=m.tenant_id AND id=ep.id; END IF;
    RETURN jsonb_build_object('ok',true);
  END IF;
  IF ep.id IS NOT NULL THEN
    UPDATE public.tempo_resposta_episodios SET ultima_mensagem_em=greatest(ultima_mensagem_em,quando),atualizado_em=instante,
      qualidade=CASE WHEN inc IS NULL THEN qualidade ELSE 'inconclusiva' END,motivo=coalesce(inc,motivo)
      WHERE tenant_id=m.tenant_id AND id=ep.id;
    RETURN jsonb_build_object('ok',true);
  END IF;
  IF cv.status='encerrada' OR cv.arquivada IS TRUE THEN RETURN jsonb_build_object('ok',true,'ignorado',true); END IF;
  cliente:=private.tempo_resposta_resolver_cliente(m.tenant_id,cv.contact_id);
  IF cliente IS NOT NULL THEN
    SELECT nome INTO cliente_nome FROM public.clients WHERE id=cliente AND tenant_id=m.tenant_id AND ativo IS TRUE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'ignorado',true); END IF;
    titular:=private.tempo_resposta_resolver_titular(m.tenant_id,cliente);
    SELECT nome INTO titular_nome FROM public.users WHERE id=titular AND tenant_id=m.tenant_id;
  END IF;
  inc:=coalesce(inc,CASE WHEN cliente IS NULL THEN 'cliente_nao_confirmado' WHEN titular IS NULL THEN 'titular_indefinido' END);
  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_instances w WHERE w.id=cv.instance_id AND w.tenant_id=m.tenant_id
    AND w.status='conectado' AND w.ativo IS TRUE) THEN inc:=coalesce(inc,'conexao_interrompida'); END IF;
  INSERT INTO public.tempo_resposta_episodios(tenant_id,client_id,cliente_nome,conversation_id,instance_id,primeira_mensagem_id,
    inicio,ultima_mensagem_em,qualidade,motivo,feriados,anos_confirmados,config_revisao,responsavel_id,responsavel_nome)
  VALUES(m.tenant_id,cliente,cliente_nome,cv.id,cv.instance_id,m.id,quando,quando,
    CASE WHEN inc IS NULL THEN 'confiavel' ELSE 'inconclusiva' END,inc,cfg.feriados,cfg.anos_confirmados,cfg.revisao,titular,titular_nome)
    RETURNING * INTO ep;
  IF titular IS NOT NULL THEN
    SELECT revisao INTO rev FROM public.client_assignment_state WHERE tenant_id=m.tenant_id AND client_id=cliente;
    INSERT INTO public.tempo_resposta_segmentos(tenant_id,episodio_id,user_id,nome,inicio,assignment_revision)
      VALUES(m.tenant_id,ep.id,titular,coalesce(titular_nome,'Estrategista'),quando,coalesce(rev,0)) RETURNING id INTO sid;
    UPDATE public.tempo_resposta_episodios SET segmento_atual_id=sid WHERE tenant_id=m.tenant_id AND id=ep.id;
  END IF;
  RETURN jsonb_build_object('ok',true,'episodio_id',ep.id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.tempo_resposta_registrar(uuid,boolean,timestamptz,boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tempo_resposta_registrar(uuid,boolean,timestamptz,boolean,uuid) TO service_role;

-- Projeção conservadora. Mensagem relevante não comprovada interrompe a medição,
-- inclusive quando a captura falhou após o Chat já ter gravado a mensagem.
CREATE FUNCTION private.tempo_resposta_projetar(p_tenant uuid,p_episodio uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ep public.tempo_resposta_episodios; cv public.chat_conversations; qualidade text; motivo text; segmentos jsonb; alertas jsonb;
BEGIN
  SELECT * INTO ep FROM public.tempo_resposta_episodios WHERE tenant_id=p_tenant AND id=p_episodio;
  IF NOT FOUND THEN RETURN NULL; END IF;
  qualidade:=ep.qualidade; motivo:=ep.motivo;
  SELECT * INTO cv FROM public.chat_conversations WHERE tenant_id=p_tenant AND id=ep.conversation_id;
  IF ep.estado='aberto' AND (cv.id IS NULL OR ep.instance_id IS DISTINCT FROM cv.instance_id OR cv.status='encerrada' OR cv.arquivada IS TRUE
    OR ep.client_id IS DISTINCT FROM private.tempo_resposta_resolver_cliente(p_tenant,cv.contact_id)
    OR (ep.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=ep.client_id AND c.tenant_id=p_tenant AND c.ativo IS TRUE))) THEN
    qualidade:='inconclusiva'; motivo:='conversa_ou_vinculo_alterado';
  END IF;
  IF ep.estado='aberto' AND (ep.responsavel_id IS NULL OR ep.responsavel_id IS DISTINCT FROM private.tempo_resposta_resolver_titular(p_tenant,ep.client_id)) THEN
    qualidade:='inconclusiva'; motivo:='titular_indefinido';
  END IF;
  IF ep.estado='aberto' AND NOT EXISTS (SELECT 1 FROM public.whatsapp_instances w WHERE w.tenant_id=p_tenant
    AND w.id=ep.instance_id AND w.status='conectado' AND w.ativo IS TRUE) THEN
    qualidade:='inconclusiva'; motivo:='conexao_interrompida';
  END IF;
  IF EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.tenant_id=p_tenant AND m.conversation_id=ep.conversation_id
    AND m.criado_em>=ep.inicio AND m.criado_em<=coalesce(ep.resposta_em,clock_timestamp())
    AND coalesce(m.tipo,'') NOT IN ('sistema','reacao','reaction') AND coalesce(m.autor_tipo,'') NOT IN ('ia','sistema')
    AND m.enviado_por_ia IS DISTINCT FROM true AND coalesce(m.status_envio,'') NOT IN ('enviando','falha')
    AND NOT EXISTS (SELECT 1 FROM public.tempo_resposta_ingressos i WHERE i.tenant_id=p_tenant AND i.mensagem_id=m.id AND i.confiavel)) THEN
    qualidade:='inconclusiva'; motivo:='mensagem_sem_comprovacao';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.inicio,s.id),'[]'::jsonb) INTO segmentos
    FROM public.tempo_resposta_segmentos s WHERE s.tenant_id=p_tenant AND s.episodio_id=ep.id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'etapa',a.etapa,'status',a.status,'created_at',a.created_at,'texto',a.texto) ORDER BY a.created_at,a.id),'[]'::jsonb)
    INTO alertas FROM public.tempo_resposta_alertas a WHERE a.tenant_id=p_tenant AND a.episodio_id=ep.id;
  RETURN to_jsonb(ep)||jsonb_build_object('cliente',coalesce(ep.cliente_nome,'Conversa sem cliente confirmado'),
    'responsavel',ep.responsavel_nome,'respondente',ep.respondente_nome,'qualidade',qualidade,'motivo',motivo,'segmentos',segmentos,'historico_alertas',alertas);
END;
$fn$;
REVOKE ALL ON FUNCTION private.tempo_resposta_projetar(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.tempo_resposta_detalhe(p_tenant uuid,p_episodio uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ep jsonb; cfg jsonb; pausas jsonb;
BEGIN
  ep:=private.tempo_resposta_projetar(p_tenant,p_episodio);
  IF ep IS NULL THEN RETURN NULL; END IF;
  SELECT to_jsonb(c) INTO cfg FROM public.tempo_resposta_config c WHERE c.tenant_id=p_tenant;
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.inicio,p.id),'[]'::jsonb) INTO pausas
    FROM public.tempo_resposta_pausas p WHERE p.tenant_id=p_tenant
    AND p.inicio<coalesce((ep->>'resposta_em')::timestamptz,clock_timestamp()) AND p.fim>(ep->>'inicio')::timestamptz
    AND EXISTS (SELECT 1 FROM public.tempo_resposta_segmentos s WHERE s.tenant_id=p_tenant AND s.episodio_id=p_episodio AND s.user_id=p.user_id);
  RETURN jsonb_build_object('agora',clock_timestamp(),'config',cfg,'episodio',ep,'pausas',pausas);
END;
$fn$;
REVOKE ALL ON FUNCTION public.tempo_resposta_detalhe(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tempo_resposta_detalhe(uuid,uuid) TO service_role;

CREATE FUNCTION public.tempo_resposta_lote(p_tenant uuid,p_cursor uuid DEFAULT NULL,p_limite integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE cfg jsonb; episodios jsonb; ids uuid[]; prox uuid; pausas jsonb; lim integer:=least(25,greatest(1,coalesce(p_limite,25)));
BEGIN
  SELECT to_jsonb(c) INTO cfg FROM public.tempo_resposta_config c WHERE c.tenant_id=p_tenant;
  SELECT array_agg(id ORDER BY id) INTO ids FROM (SELECT id FROM public.tempo_resposta_episodios
    WHERE tenant_id=p_tenant AND estado='aberto' AND (p_cursor IS NULL OR id>p_cursor) ORDER BY id LIMIT lim+1) q;
  IF cardinality(ids)>lim THEN prox:=ids[lim]; ids:=ids[1:lim]; END IF;
  SELECT coalesce(jsonb_agg(private.tempo_resposta_projetar(p_tenant,q.id) ORDER BY q.id),'[]'::jsonb)
    INTO episodios FROM unnest(ids) q(id);
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.inicio,p.id),'[]'::jsonb) INTO pausas
    FROM public.tempo_resposta_pausas p WHERE p.tenant_id=p_tenant AND EXISTS
      (SELECT 1 FROM public.tempo_resposta_episodios e JOIN public.tempo_resposta_segmentos s ON s.tenant_id=p_tenant AND s.episodio_id=e.id
       WHERE e.tenant_id=p_tenant AND e.id=ANY(coalesce(ids,'{}'::uuid[])) AND s.user_id=p.user_id AND p.fim>e.inicio AND p.inicio<clock_timestamp());
  RETURN jsonb_build_object('agora',clock_timestamp(),'config',cfg,'episodios',episodios,'pausas',pausas,'proximo_cursor',prox);
END;
$fn$;
REVOKE ALL ON FUNCTION public.tempo_resposta_lote(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tempo_resposta_lote(uuid,uuid,integer) TO service_role;

CREATE FUNCTION public.tempo_resposta_painel(p_cursor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ctx jsonb:=private.tempo_resposta_autorizar(); t uuid:=(ctx->>'tenant_id')::uuid;
  cfg jsonb; episodios jsonb; ids uuid[]; prox uuid; cursor_em timestamptz; estrategistas jsonb; titulares jsonb; pausas jsonb; avisos jsonb:='[]'::jsonb;
BEGIN
  SELECT to_jsonb(c) INTO cfg FROM public.tempo_resposta_config c WHERE c.tenant_id=t;
  cfg:=coalesce(cfg,jsonb_build_object('tenant_id',t,'modo','desligado','feriados','[]'::jsonb,'anos_confirmados','[]'::jsonb,'revisao',0,'monitorando_desde',NULL));
  IF p_cursor IS NOT NULL THEN
    SELECT criado_em INTO cursor_em FROM public.tempo_resposta_episodios WHERE tenant_id=t AND id=p_cursor;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_cursor_invalido'; END IF;
  END IF;
  SELECT array_agg(id ORDER BY criado_em DESC,id DESC) INTO ids FROM (SELECT id,criado_em FROM public.tempo_resposta_episodios
    WHERE tenant_id=t AND (p_cursor IS NULL OR (criado_em,id)<(cursor_em,p_cursor)) ORDER BY criado_em DESC,id DESC LIMIT 101) q;
  IF cardinality(ids)>100 THEN prox:=ids[100]; ids:=ids[1:100]; END IF;
  SELECT coalesce(jsonb_agg(private.tempo_resposta_projetar(t,q.id) ORDER BY q.ord),'[]'::jsonb) INTO episodios FROM unnest(ids) WITH ORDINALITY q(id,ord);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'nome',u.nome) ORDER BY u.nome,u.id),'[]'::jsonb) INTO estrategistas
    FROM public.users u WHERE u.tenant_id=t AND u.ativo IS TRUE AND u.perfil<>'cliente' AND EXISTS
      (SELECT 1 FROM public.client_assignments a WHERE a.tenant_id=t AND a.user_id=u.id AND a.ativo IS TRUE AND a.tipo='estrategista');
  SELECT coalesce(jsonb_agg(jsonb_build_object('client_id',c.id,'cliente',c.nome,'titular_id',tr.user_id,
    'candidatos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'nome',x.nome) ORDER BY x.nome,x.id)
      FROM (SELECT DISTINCT u.id,u.nome FROM public.client_assignments a JOIN public.users u ON u.id=a.user_id AND u.tenant_id=t
        WHERE a.tenant_id=t AND a.client_id=c.id AND a.tipo='estrategista' AND a.ativo IS TRUE AND u.ativo IS TRUE AND u.perfil<>'cliente') x),'[]'::jsonb))
    ORDER BY c.nome,c.id),'[]'::jsonb) INTO titulares FROM public.clients c
    LEFT JOIN public.tempo_resposta_titulares tr ON tr.tenant_id=t AND tr.client_id=c.id WHERE c.tenant_id=t AND c.ativo IS TRUE;
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.inicio,p.id),'[]'::jsonb) INTO pausas
    FROM public.tempo_resposta_pausas p WHERE p.tenant_id=t AND (p.fim>clock_timestamp() OR EXISTS
      (SELECT 1 FROM public.tempo_resposta_episodios e JOIN public.tempo_resposta_segmentos s ON s.tenant_id=t AND s.episodio_id=e.id
       WHERE e.tenant_id=t AND e.id=ANY(coalesce(ids,'{}'::uuid[])) AND s.user_id=p.user_id AND p.fim>e.inicio AND p.inicio<coalesce(e.resposta_em,clock_timestamp())));
  IF prox IS NOT NULL THEN avisos:=avisos||jsonb_build_array('Exibindo uma página do histórico. Carregue mais para ampliar a consulta.'); END IF;
  IF NOT (extract(year FROM clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::integer=ANY(ARRAY(SELECT jsonb_array_elements_text(cfg->'anos_confirmados')::integer))) THEN
    avisos:=avisos||jsonb_build_array('Confira e confirme os feriados do ano atual antes de monitorar.');
  END IF;
  RETURN jsonb_build_object('agora',clock_timestamp(),'ator_id',ctx->>'ator_id','tenant_id',t,'config',cfg,'episodios',episodios,
    'proximo_cursor',prox,'estrategistas',estrategistas,'titulares',titulares,'pausas',pausas,'avisos',avisos);
END;
$fn$;
REVOKE ALL ON FUNCTION public.tempo_resposta_painel(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tempo_resposta_painel(uuid) TO authenticated;

-- Outbox recebe apenas cadeias coerentes. A rechecagem de calendário/carteira e
-- minutos pertence à ponte; esta guarda não cria autorização de leitura nova.
CREATE FUNCTION private.tempo_resposta_alerta_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['status','texto','delivery_id','updated_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','texto','delivery_id','updated_at']) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_alerta_identidade_imutavel';
  END IF;
  IF TG_OP='INSERT' AND NOT EXISTS (SELECT 1 FROM public.iris_gt3_connections c JOIN public.iris_gt3_recipients r
    ON r.connection_id=c.id AND r.tenant_id=c.tenant_id
    JOIN public.tempo_resposta_segmentos s ON s.tenant_id=c.tenant_id AND s.id=NEW.segmento_id AND s.episodio_id=NEW.episodio_id
    WHERE c.id=NEW.connection_id AND c.tenant_id=NEW.tenant_id AND r.id=NEW.recipient_id
      AND r.gt3_user_id=NEW.gt3_user_id AND r.desk_user_id=s.user_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='tempo_resposta_alerta_incoerente';
  END IF;
  IF TG_OP='UPDATE' AND OLD.delivery_id IS NOT NULL AND NEW.delivery_id IS DISTINCT FROM OLD.delivery_id THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_delivery_imutavel';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status IN ('enviado','sem_alertas')
    AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.texto IS DISTINCT FROM OLD.texto OR NEW.delivery_id IS DISTINCT FROM OLD.delivery_id) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_recibo_imutavel';
  END IF;
  -- Uma resposta/troca pode cancelar no Desk após o GT3 já ter commitado. O
  -- recibo autenticado do serviço registra a entrega real, sem reabrir o caso.
  IF TG_OP='UPDATE' AND OLD.status='cancelado' AND NEW.status<>'cancelado'
    AND NOT (NEW.status='enviado' AND NEW.delivery_id IS NOT NULL AND length(trim(coalesce(NEW.texto,'')))>0) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_recibo_imutavel';
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.tempo_resposta_alerta_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tempo_resposta_alerta_guard BEFORE INSERT OR UPDATE ON public.tempo_resposta_alertas
  FOR EACH ROW EXECUTE FUNCTION private.tempo_resposta_alerta_guard();

COMMENT ON TABLE public.tempo_resposta_episodios IS 'Esperas capturadas após ativação; calendário congelado por episódio. Não prova resposta anterior ao início do monitor.';
COMMENT ON TABLE public.tempo_resposta_ingressos IS 'Proveniência explícita pelo handler autenticado, sem conteúdo da mensagem; apenas RPC service_role.';
COMMENT ON TABLE public.tempo_resposta_auditoria IS 'Append-only: configuração, calendário, pausas e titular; datas e ator do servidor.';

-- Correção delimitada do job LEGADO observado em produção. Mantém exatamente
-- seu agendamento/estado; não cria job nem segredo. O handler novo fecha sem
-- x-cron-secret, portanto só publicar ambos após autorização da migration.
DO $cron$
DECLARE jid bigint; comando text;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  SELECT jobid,command INTO jid,comando FROM cron.job WHERE jobname='chat-sla-monitor-every-5min';
  IF jid IS NULL THEN RETURN; END IF;
  IF position('https://seu-projeto-supabase.supabase.co/functions/v1/chat-sla-monitor' IN comando)=0 THEN
    RAISE EXCEPTION 'tempo_resposta_cron_destino_divergente';
  END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN RAISE EXCEPTION 'tempo_resposta_cron_segredo_ausente'; END IF;
  IF (SELECT count(*) FROM vault.decrypted_secrets WHERE name='wa_auto_cron_secret' AND length(decrypted_secret)>=32)<>1 THEN
    RAISE EXCEPTION 'tempo_resposta_cron_segredo_ausente';
  END IF;
  PERFORM cron.alter_job(jid,command:=$job$
    SELECT net.http_post(
      url:='https://seu-projeto-supabase.supabase.co/functions/v1/chat-sla-monitor',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='wa_auto_cron_secret')),
      body:='{}'::jsonb
    );
  $job$);
END;
$cron$;
COMMIT;
