-- Extensão incremental do monitor já publicado. Não altera calendário/meta,
-- titulares, conteúdo de mensagens nem estado ligado/desligado do monitor.
-- Somente disponibilidade: sem títulos, participantes ou credenciais Google.
BEGIN;

CREATE TABLE public.tempo_resposta_agendas (
  recipient_id uuid PRIMARY KEY REFERENCES public.iris_gt3_recipients(id) ON DELETE NO ACTION,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE NO ACTION,
  connection_id uuid NOT NULL REFERENCES public.iris_gt3_connections(id) ON DELETE NO ACTION,
  gt3_user_id uuid NOT NULL,
  desk_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE NO ACTION,
  recipient_revisao bigint NOT NULL CHECK (recipient_revisao > 0),
  agenda_revisao bigint NOT NULL CHECK (agenda_revisao >= 0),
  status text NOT NULL CHECK (status IN ('connected','unavailable','disconnected')),
  inicio timestamptz,
  fim timestamptz,
  consentimento_desde timestamptz,
  sincronizado_em timestamptz,
  desconectado_em timestamptz,
  ultimo_sucesso_em timestamptz,
  ja_conectada boolean NOT NULL DEFAULT false,
  ocupados jsonb NOT NULL DEFAULT '[]',
  atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (jsonb_typeof(ocupados)='array' AND jsonb_array_length(ocupados)<=256 AND octet_length(ocupados::text)<=28000),
  CHECK ((status='connected' AND inicio IS NOT NULL AND fim IS NOT NULL AND fim>inicio
    AND fim<=inicio+interval '31 days' AND sincronizado_em IS NOT NULL AND agenda_revisao>0)
    OR (status<>'connected' AND inicio IS NULL AND fim IS NULL AND sincronizado_em IS NULL AND ocupados='[]'))
);
CREATE INDEX tempo_resposta_agendas_pessoa ON public.tempo_resposta_agendas(tenant_id,desk_user_id);
ALTER TABLE public.tempo_resposta_agendas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tempo_resposta_agendas FROM PUBLIC,anon,authenticated,service_role;
-- Escrita e projeção somente pelas funções com identidade/revisão verificadas.

CREATE FUNCTION public.tempo_resposta_agenda_registrar(p_connection uuid,p_gt3_user uuid,p_recipient_revisao bigint,p_agenda jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE c public.iris_gt3_connections; r public.iris_gt3_recipients; anterior public.tempo_resposta_agendas;
  instante timestamptz:=clock_timestamp(); estado text; versao bigint; de timestamptz; ate timestamptz; sync timestamptz;
  busy jsonb; item jsonb; a timestamptz; b timestamptz; consentimento timestamptz; anterior_valido boolean;
BEGIN
  -- A mesma ordem de locks da alteração de destinatário preserva sua revisão.
  SELECT * INTO c FROM public.iris_gt3_connections WHERE id=p_connection FOR SHARE;
  IF c.id IS NULL OR NOT c.ativo OR c.revoked_at IS NOT NULL OR c.expires_at<=instante THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='tempo_resposta_agenda_conexao_inativa';
  END IF;
  SELECT * INTO r FROM public.iris_gt3_recipients WHERE connection_id=c.id AND tenant_id=c.tenant_id AND gt3_user_id=p_gt3_user FOR SHARE;
  IF r.id IS NULL OR NOT r.ativo OR r.modo_teste OR r.revisao IS DISTINCT FROM p_recipient_revisao OR NOT EXISTS
    (SELECT 1 FROM public.users u WHERE u.id=r.desk_user_id AND u.tenant_id=c.tenant_id AND u.ativo IS TRUE AND u.perfil<>'cliente') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='tempo_resposta_agenda_vinculo_invalido';
  END IF;
  IF p_agenda IS NULL OR jsonb_typeof(p_agenda)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_agenda))<>6
    OR NOT (p_agenda ?& ARRAY['status','revision','from','to','synced_at','busy'])
    OR jsonb_typeof(p_agenda->'revision')<>'number' OR (p_agenda->>'revision')!~'^[0-9]{1,16}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_agenda_invalida';
  END IF;
  estado:=p_agenda->>'status'; versao:=(p_agenda->>'revision')::bigint; busy:=p_agenda->'busy';
  IF estado NOT IN ('connected','unavailable','disconnected') OR versao>9007199254740991
    OR jsonb_typeof(busy)<>'array' OR jsonb_array_length(busy)>256 OR octet_length(busy::text)>28000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_agenda_invalida';
  END IF;
  IF estado='connected' THEN
    IF versao<1 OR jsonb_typeof(p_agenda->'from')<>'string' OR jsonb_typeof(p_agenda->'to')<>'string'
      OR jsonb_typeof(p_agenda->'synced_at')<>'string' OR (p_agenda->>'from')!~'^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$'
      OR (p_agenda->>'to')!~'^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$'
      OR (p_agenda->>'synced_at')!~'^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_agenda_periodo_invalido';
    END IF;
    de:=(p_agenda->>'from')::timestamptz; ate:=(p_agenda->>'to')::timestamptz; sync:=(p_agenda->>'synced_at')::timestamptz;
    IF NOT isfinite(de) OR NOT isfinite(ate) OR NOT isfinite(sync) OR ate<=de OR ate>de+interval '31 days'
      OR de>sync OR ate<sync OR de<sync-interval '31 days' OR ate>sync+interval '1 day'
      OR sync>instante+interval '30 seconds' OR sync<instante-interval '5 minutes' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_agenda_periodo_invalido';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(busy) LOOP
      IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>2 OR NOT(item ?& ARRAY['start','end'])
        OR jsonb_typeof(item->'start')<>'string' OR jsonb_typeof(item->'end')<>'string'
        OR (item->>'start')!~'^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' OR (item->>'end')!~'^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_agenda_intervalo_invalido';
      END IF;
      a:=(item->>'start')::timestamptz; b:=(item->>'end')::timestamptz;
      IF NOT isfinite(a) OR NOT isfinite(b) OR a<de OR b>ate OR b<=a THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_agenda_intervalo_invalido';
      END IF;
    END LOOP;
  ELSIF p_agenda->'from'<>'null'::jsonb OR p_agenda->'to'<>'null'::jsonb OR p_agenda->'synced_at'<>'null'::jsonb OR busy<>'[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_agenda_invalida';
  END IF;
  -- Serializa snapshots da mesma identidade, inclusive a primeira inserção.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.id::text,0));
  SELECT * INTO anterior FROM public.tempo_resposta_agendas WHERE recipient_id=r.id FOR UPDATE;
  anterior_valido:=anterior.recipient_id IS NOT NULL AND anterior.recipient_revisao=r.revisao AND anterior.desk_user_id=r.desk_user_id;
  IF anterior_valido AND (versao<anterior.agenda_revisao OR (versao=anterior.agenda_revisao
    AND sync IS NOT NULL AND anterior.ultimo_sucesso_em IS NOT NULL AND sync<=anterior.ultimo_sucesso_em)) THEN
    RETURN jsonb_build_object('ok',true,'ignorado',true);
  END IF;
  consentimento:=CASE WHEN anterior_valido THEN coalesce(anterior.consentimento_desde,de) ELSE de END;
  IF de IS NOT NULL AND de<consentimento THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_agenda_sem_retroativo';
  END IF;
  INSERT INTO public.tempo_resposta_agendas(recipient_id,tenant_id,connection_id,gt3_user_id,desk_user_id,recipient_revisao,
    agenda_revisao,status,inicio,fim,consentimento_desde,sincronizado_em,desconectado_em,ultimo_sucesso_em,ja_conectada,ocupados,atualizado_em)
  VALUES(r.id,c.tenant_id,c.id,r.gt3_user_id,r.desk_user_id,r.revisao,versao,estado,de,ate,consentimento,sync,
    CASE WHEN estado='disconnected' THEN CASE WHEN anterior_valido AND anterior.status='disconnected' THEN coalesce(anterior.desconectado_em,instante) ELSE instante END END,
    coalesce(sync,CASE WHEN anterior_valido AND versao=anterior.agenda_revisao THEN anterior.ultimo_sucesso_em END),
    estado='connected' OR (anterior_valido AND anterior.ja_conectada),busy,instante)
  ON CONFLICT(recipient_id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id,connection_id=EXCLUDED.connection_id,
    gt3_user_id=EXCLUDED.gt3_user_id,desk_user_id=EXCLUDED.desk_user_id,recipient_revisao=EXCLUDED.recipient_revisao,
    agenda_revisao=EXCLUDED.agenda_revisao,status=EXCLUDED.status,inicio=EXCLUDED.inicio,fim=EXCLUDED.fim,
    consentimento_desde=EXCLUDED.consentimento_desde,sincronizado_em=EXCLUDED.sincronizado_em,desconectado_em=EXCLUDED.desconectado_em,ultimo_sucesso_em=EXCLUDED.ultimo_sucesso_em,
    ja_conectada=EXCLUDED.ja_conectada,ocupados=EXCLUDED.ocupados,atualizado_em=EXCLUDED.atualizado_em;
  -- Geração avança a cada consulta; auditar transições, não repetir o mesmo estado a cada ciclo.
  IF NOT anterior_valido OR anterior.status IS DISTINCT FROM estado THEN
    INSERT INTO public.tempo_resposta_auditoria(tenant_id,ator_id,acao,dados) VALUES(c.tenant_id,NULL,'agenda_disponibilidade',
      jsonb_build_object('origem','ponte_gt3','connection_id',c.id,'recipient_id',r.id,'recipient_revisao',r.revisao,
        'agenda_revisao',versao,'status',estado));
  END IF;
  RETURN jsonb_build_object('ok',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.tempo_resposta_agenda_registrar(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tempo_resposta_agenda_registrar(uuid,uuid,bigint,jsonb) TO service_role;

-- Zero ou múltiplas fontes não equivalem a uma agenda disponível. Nunca usa
-- a agenda de quem testa outra carteira nem mistura workspaces/identidades.
CREATE FUNCTION private.tempo_resposta_agenda_projetar(p_tenant uuid,p_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE linhas jsonb; qtd integer; a jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb),count(*) INTO linhas,qtd
    FROM public.tempo_resposta_agendas g JOIN public.iris_gt3_connections c ON c.id=g.connection_id AND c.tenant_id=g.tenant_id
    JOIN public.iris_gt3_recipients r ON r.id=g.recipient_id AND r.connection_id=c.id AND r.tenant_id=c.tenant_id
    WHERE g.tenant_id=p_tenant AND g.desk_user_id=p_user AND r.desk_user_id=p_user AND r.gt3_user_id=g.gt3_user_id
      AND r.revisao=g.recipient_revisao AND r.ativo AND NOT r.modo_teste AND c.ativo AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp();
  IF qtd=0 THEN RETURN jsonb_build_object('status','not_connected'); END IF;
  IF qtd<>1 THEN RETURN jsonb_build_object('status','incomplete'); END IF;
  a:=linhas->0;
  IF a->>'status'='disconnected' AND (a->>'ja_conectada')::boolean IS NOT TRUE THEN RETURN jsonb_build_object('status','not_connected'); END IF;
  IF a->>'status'='disconnected' THEN RETURN jsonb_build_object('status','disconnected','disconnected_at',a->'desconectado_em'); END IF;
  IF a->>'status'<>'connected' THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  RETURN jsonb_build_object('status','connected','from',a->'inicio','to',a->'fim','synced_at',a->'sincronizado_em','busy',a->'ocupados');
END;
$fn$;
REVOKE ALL ON FUNCTION private.tempo_resposta_agenda_projetar(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Guarda a disponibilidade conhecida ao encerrar. Uma desconexão ou nova
-- janela de consulta não reescreve o tempo individual já apurado. Sem backfill.
ALTER TABLE public.tempo_resposta_episodios ADD COLUMN agenda_no_encerramento jsonb
  CHECK (agenda_no_encerramento IS NULL OR (jsonb_typeof(agenda_no_encerramento)='object' AND octet_length(agenda_no_encerramento::text)<=30000));
CREATE FUNCTION private.tempo_resposta_agenda_fixar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE agenda jsonb; desde timestamptz; ate timestamptz; busy jsonb; instante timestamptz:=clock_timestamp();
BEGIN
  IF OLD.estado='aberto' AND NEW.estado<>'aberto' THEN
    agenda:=private.tempo_resposta_agenda_projetar(NEW.tenant_id,NEW.responsavel_id);
    IF agenda->>'status'='connected' THEN
      IF (agenda->>'synced_at')::timestamptz<instante-interval '5 minutes'
        OR (agenda->>'synced_at')::timestamptz>instante+interval '30 seconds' THEN
        agenda:=jsonb_build_object('status','unavailable');
      ELSE
        SELECT inicio INTO desde FROM public.tempo_resposta_segmentos
          WHERE tenant_id=NEW.tenant_id AND episodio_id=NEW.id AND id=NEW.segmento_atual_id;
        desde:=coalesce(desde,NEW.inicio); ate:=coalesce(NEW.resposta_em,NEW.atualizado_em,instante);
        -- Armazena só os blocos que intersectam a responsabilidade encerrada.
        SELECT coalesce(jsonb_agg(jsonb_build_object('start',greatest((q->>'start')::timestamptz,desde),
          'end',least((q->>'end')::timestamptz,ate)) ORDER BY (q->>'start')::timestamptz),'[]'::jsonb) INTO busy
          FROM jsonb_array_elements(agenda->'busy') q WHERE (q->>'start')::timestamptz<ate AND (q->>'end')::timestamptz>desde;
        agenda:=jsonb_set(agenda,'{busy}',busy);
      END IF;
    END IF;
    NEW.agenda_no_encerramento:=agenda;
  ELSIF NEW.agenda_no_encerramento IS DISTINCT FROM OLD.agenda_no_encerramento THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='tempo_resposta_agenda_historico_imutavel';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.tempo_resposta_agenda_fixar() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tempo_resposta_agenda_fixar BEFORE UPDATE OF estado,agenda_no_encerramento ON public.tempo_resposta_episodios
  FOR EACH ROW EXECUTE FUNCTION private.tempo_resposta_agenda_fixar();

CREATE OR REPLACE FUNCTION private.tempo_resposta_projetar(p_tenant uuid,p_episodio uuid)
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
  RETURN (to_jsonb(ep)-'agenda_no_encerramento')||jsonb_build_object('cliente',coalesce(ep.cliente_nome,'Conversa sem cliente confirmado'),
    'responsavel',ep.responsavel_nome,'respondente',ep.respondente_nome,'qualidade',qualidade,'motivo',motivo,'segmentos',segmentos,'historico_alertas',alertas,
    'agenda',CASE WHEN ep.estado='aberto' THEN private.tempo_resposta_agenda_projetar(p_tenant,ep.responsavel_id)
      ELSE coalesce(ep.agenda_no_encerramento,jsonb_build_object('status','not_connected')) END);
END;
$fn$;
REVOKE ALL ON FUNCTION private.tempo_resposta_projetar(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.tempo_resposta_painel(p_cursor uuid DEFAULT NULL)
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
  SELECT coalesce(jsonb_agg(private.tempo_resposta_projetar(t,q.id)-ARRAY['agenda','agenda_no_encerramento'] ORDER BY q.ord),'[]'::jsonb) INTO episodios FROM unnest(ids) WITH ORDINALITY q(id,ord);
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


-- Apenas a Edge, depois de autorizar a pessoa e obter a página com seu JWT,
-- hidrata os IDs exatos dessa página para calcular totais. Não é RPC de usuário.
CREATE FUNCTION public.tempo_resposta_agendas_episodios(p_tenant uuid,p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE resultado jsonb;
BEGIN
  IF p_tenant IS NULL OR p_ids IS NULL OR cardinality(p_ids)>100 OR array_position(p_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tempo_resposta_agenda_ids_invalidos';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'agenda',CASE WHEN e.estado='aberto'
    THEN private.tempo_resposta_agenda_projetar(e.tenant_id,e.responsavel_id)
    ELSE coalesce(e.agenda_no_encerramento,jsonb_build_object('status','not_connected')) END) ORDER BY e.id),'[]'::jsonb) INTO resultado
    FROM public.tempo_resposta_episodios e WHERE e.tenant_id=p_tenant AND e.id=ANY(p_ids);
  RETURN resultado;
END;
$fn$;
REVOKE ALL ON FUNCTION public.tempo_resposta_agendas_episodios(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tempo_resposta_agendas_episodios(uuid,uuid[]) TO service_role;

COMMENT ON TABLE public.tempo_resposta_agendas IS 'Última disponibilidade pessoal informada pela ponte GT3 autenticada; sem conteúdo dos compromissos. Cobertura incompleta não significa zero reuniões. Nenhum disparo/ativação nesta migration.';
COMMIT;
