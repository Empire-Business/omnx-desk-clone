-- Capacidade administrativa FECHADA para reconciliar o Report Entregas de 05/11/2026.
-- Apenas instala o lote; NÃO executa atribuições durante a migration.
-- Execução separada: SELECT private.client_assignment_reconciliar_report_20261105();
-- Sem argumentos, callbacks, JWT/GUC, impersonação, acesso frontend ou service_role.
-- Bruno é o SOLICITANTE; executor_sql registra a sessão administrativa real.
-- Toda execução usa RPC operacional, revisão, idempotência e histórico atuais.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE private.client_assignment_report_20261105 (
  client_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL CHECK (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid),
  solicitante_id uuid NOT NULL CHECK (solicitante_id = '0295d401-6270-4fbe-be47-ee9b6a9ed9c9'::uuid),
  pedido_fonte_id uuid NOT NULL,
  mensagem_fonte_id uuid NOT NULL,
  rotulo text NOT NULL,
  acao text NOT NULL CHECK (acao IN ('adicionar','trocar','encerrar')),
  assignment_id uuid,
  user_id uuid,
  revisao_esperada bigint NOT NULL CHECK (revisao_esperada = 0),
  idempotencia uuid NOT NULL UNIQUE,
  backend_pid integer,
  transacao bigint,
  executor_sql text,
  iniciado_em timestamptz,
  executado_em timestamptz,
  recibo jsonb,
  CHECK ((acao='adicionar' AND assignment_id IS NULL AND user_id IS NOT NULL)
    OR (acao='trocar' AND assignment_id IS NOT NULL AND user_id IS NOT NULL)
    OR (acao='encerrar' AND assignment_id IS NOT NULL AND user_id IS NULL)),
  CHECK ((backend_pid IS NULL AND transacao IS NULL) OR (backend_pid IS NOT NULL AND transacao IS NOT NULL)),
  CHECK ((recibo IS NULL AND executado_em IS NULL) OR (recibo IS NOT NULL AND executado_em IS NOT NULL))
);
COMMENT ON TABLE private.client_assignment_report_20261105 IS
  'Lote autorizado por Bruno em 05/11/2026 nesta operação Codex. Origem manutencao_codex; solicitante_id não representa login do executor. Executor SQL e recibos preservados; sem datas retroativas.';
ALTER TABLE private.client_assignment_report_20261105 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.client_assignment_report_20261105 FROM PUBLIC,anon,authenticated,service_role;
-- Os 11 alvos são carregados pelo SQL operacional separado, após conferir
-- identificadores reais e a autorização específica. Esta migration não insere
-- dados operacionais; lote ausente ou incompleto é recusado pela execução.


ALTER TABLE public.client_assignment_operations DROP CONSTRAINT client_assignment_operations_origem_check,
  ADD CONSTRAINT client_assignment_operations_origem_check CHECK (origem IN ('desk_rpc','iris_whatsapp','manutencao_codex'));
ALTER TABLE public.client_assignment_events DROP CONSTRAINT client_assignment_events_origem_check,
  ADD CONSTRAINT client_assignment_events_origem_check CHECK (origem IN ('desk_rpc','legado_dml','iris_whatsapp','manutencao_codex'));

-- Ausência de capacidade retorna NULL: os caminhos anteriores continuam intactos.
-- session_user não muda dentro de SECURITY DEFINER; sessões Data API não passam.
CREATE FUNCTION private.client_assignment_report_contexto_20261105(p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp
AS $m$
DECLARE r private.client_assignment_report_20261105%ROWTYPE; u public.users%ROWTYPE;
  total boolean; ids uuid[];
BEGIN
  IF session_user NOT IN ('postgres','supabase_admin') OR auth.uid() IS NOT NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM private.client_assignment_report_20261105
    WHERE client_id=p_client_id AND backend_pid=pg_backend_pid() AND transacao=txid_current()
      AND executor_sql=session_user AND recibo IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO u FROM public.users WHERE id=r.solicitante_id AND tenant_id=r.tenant_id
    AND ativo IS TRUE AND perfil <> 'cliente' FOR SHARE;
  IF NOT FOUND OR NOT coalesce(public.has_permissao_de(u.id,'clientes.atribuir','editar'),false) THEN
    RAISE EXCEPTION 'manutencao_solicitante_sem_alcada' USING ERRCODE='42501';
  END IF;
  SELECT s.total,s.client_ids INTO total,ids FROM public.wa_agente_escopo(r.tenant_id,r.solicitante_id) s;
  IF total IS NOT TRUE AND NOT (r.client_id=ANY(coalesce(ids,'{}'::uuid[]))) THEN
    RAISE EXCEPTION 'manutencao_cliente_fora_escopo' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('tenant_id',r.tenant_id,'ator_id',r.solicitante_id,'ator_nome',u.nome,
    'origem','manutencao_codex','proposta_id',r.idempotencia,'executor_sql',r.executor_sql,
    'motivo','Manutenção Codex autorizada por Bruno em 05/11/2026; executor SQL: '||r.executor_sql||'; pedido fonte: '||r.pedido_fonte_id::text||'; mensagem fonte: '||r.mensagem_fonte_id::text||'.',
    'item',jsonb_build_object('cliente_id',r.client_id,'acao',r.acao,'assignment_id',r.assignment_id,
      'user_id',r.user_id,'expected_revision',r.revisao_esperada));
END;
$m$;
REVOKE ALL ON FUNCTION private.client_assignment_report_contexto_20261105(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.client_assignment_autorizar(p_client_id uuid,p_escrita boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $f$
DECLARE c jsonb; t uuid; a uuid; total boolean; ids uuid[];
BEGIN
  c:=private.client_assignment_report_contexto_20261105(p_client_id);
  IF c IS NOT NULL THEN
    IF p_escrita IS DISTINCT FROM true THEN RAISE EXCEPTION 'manutencao_somente_escrita' USING ERRCODE='42501'; END IF;
    PERFORM 1 FROM public.clients WHERE id=p_client_id AND tenant_id=(c->>'tenant_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'manutencao_cliente_ausente' USING ERRCODE='42501'; END IF;
    c:=private.client_assignment_report_contexto_20261105(p_client_id);
    IF c IS NULL THEN RAISE EXCEPTION 'manutencao_contexto_ausente' USING ERRCODE='42501'; END IF;
    RETURN c;
  END IF;
  IF auth.uid() IS NOT NULL THEN RETURN private.client_assignment_autorizar_sessao(p_client_id,p_escrita); END IF;
  IF p_escrita IS DISTINCT FROM true THEN RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501'; END IF;
  c:=private.client_assignment_iris_contexto(p_client_id); t:=(c->>'tenant_id')::uuid; a:=(c->>'ator_id')::uuid;
  PERFORM 1 FROM public.clients WHERE id=p_client_id AND tenant_id=t FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501'; END IF;
  -- Revalidação após mutex; uma operação pendente conserva apenas o próprio
  -- acesso inicial durante a troca da última membership do autor.
  c:=private.client_assignment_iris_contexto(p_client_id);
  SELECT s.total,s.client_ids INTO total,ids FROM public.wa_agente_escopo(t,a) s;
  IF total IS NOT TRUE AND NOT (p_client_id=ANY(coalesce(ids,'{}'::uuid[]))) AND NOT EXISTS (
    SELECT 1 FROM public.client_assignment_operations op WHERE op.tenant_id=t AND op.client_id=p_client_id
      AND op.ator_id=a AND op.transacao=txid_current() AND op.resposta IS NULL
      AND op.idempotencia=(c->>'proposta_id')::uuid AND op.origem='iris_whatsapp'
  ) THEN RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501'; END IF;
  RETURN c;
END;
$f$;
REVOKE ALL ON FUNCTION private.client_assignment_autorizar(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.client_assignment_iris_operacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $f$
DECLARE c jsonb; i jsonb; esperado jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.origem IS DISTINCT FROM 'desk_rpc' THEN RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  c:=private.client_assignment_report_contexto_20261105(NEW.client_id);
  IF c IS NOT NULL THEN
    i:=c->'item';
    esperado:=jsonb_build_object('acao',i->>'acao','tipo','estrategista',
      'assignment_id',(i->>'assignment_id')::uuid,'user_id',(i->>'user_id')::uuid,
      'revisao_esperada',i->'expected_revision','motivo',c->>'motivo');
    IF NEW.tenant_id IS DISTINCT FROM (c->>'tenant_id')::uuid OR NEW.ator_id IS DISTINCT FROM (c->>'ator_id')::uuid
      OR NEW.idempotencia IS DISTINCT FROM (c->>'proposta_id')::uuid OR NEW.pedido IS DISTINCT FROM esperado
      OR NEW.transacao IS DISTINCT FROM txid_current() OR NEW.resposta IS NOT NULL
      OR NEW.acao IS DISTINCT FROM (esperado->>'acao') OR NEW.motivo IS DISTINCT FROM (esperado->>'motivo') THEN
      RAISE EXCEPTION 'manutencao_operacao_fora_lote' USING ERRCODE='42501';
    END IF;
    NEW.origem:='manutencao_codex';
    RETURN NEW;
  END IF;
  c:=private.client_assignment_iris_contexto(NEW.client_id); i:=c->'item';
  esperado:=jsonb_build_object('acao',CASE WHEN i->>'assignment_id' IS NULL THEN 'adicionar' ELSE 'trocar' END,
    'tipo','estrategista','assignment_id',(i->>'assignment_id')::uuid,'user_id',(i->>'user_id')::uuid,
    'revisao_esperada',i->'expected_revision','motivo','Confirmação explícita de responsáveis pela Íris no WhatsApp.');
  IF NEW.tenant_id IS DISTINCT FROM (c->>'tenant_id')::uuid OR NEW.ator_id IS DISTINCT FROM (c->>'ator_id')::uuid
    OR NEW.idempotencia IS DISTINCT FROM (c->>'proposta_id')::uuid OR NEW.pedido IS DISTINCT FROM esperado
    OR NEW.transacao IS DISTINCT FROM txid_current() OR NEW.resposta IS NOT NULL
    OR NEW.acao IS DISTINCT FROM (esperado->>'acao') OR NEW.motivo IS DISTINCT FROM (esperado->>'motivo') THEN
    RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501';
  END IF;
  NEW.origem:='iris_whatsapp';
  RETURN NEW;
END;
$f$;
REVOKE ALL ON FUNCTION private.client_assignment_iris_operacao() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.client_assignment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE v_ctx jsonb; v_client uuid; v_tenant uuid; v_user uuid; v_ativo boolean; v_perfil text; v_item jsonb;
BEGIN
  v_client := CASE WHEN TG_OP = 'DELETE' THEN OLD.client_id ELSE NEW.client_id END;
  v_ctx := private.client_assignment_autorizar(v_client, true);
  v_tenant := (v_ctx->>'tenant_id')::uuid;
  IF auth.uid() IS NULL THEN
    v_item:=v_ctx->'item';
    IF NOT EXISTS (SELECT 1 FROM public.client_assignment_operations op
      WHERE op.tenant_id=v_tenant AND op.client_id=v_client AND op.ator_id=(v_ctx->>'ator_id')::uuid
        AND op.transacao=txid_current() AND op.resposta IS NULL AND op.origem=coalesce(v_ctx->>'origem','iris_whatsapp')
        AND op.idempotencia=(v_ctx->>'proposta_id')::uuid) THEN
      RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501';
    END IF;
    IF TG_OP='DELETE' THEN
      IF OLD.id IS DISTINCT FROM (v_item->>'assignment_id')::uuid OR OLD.tipo IS DISTINCT FROM 'estrategista'
        OR OLD.ativo IS DISTINCT FROM true THEN RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501'; END IF;
    ELSE
      IF NEW.tipo IS DISTINCT FROM 'estrategista' OR NEW.user_id IS DISTINCT FROM (v_item->>'user_id')::uuid
        OR NEW.ativo IS DISTINCT FROM true THEN RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501'; END IF;
      IF TG_OP='UPDATE' AND OLD.ativo IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'ativo') IS DISTINCT FROM (to_jsonb(OLD) - 'ativo') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'atribuicao_identidade_imutavel';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.tenant_id IS DISTINCT FROM v_tenant THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='atribuicao_sem_permissao'; END IF;
    v_user := OLD.user_id;
  ELSE
    IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='atribuicao_sem_permissao';
    END IF;
    NEW.tenant_id := v_tenant;
    IF NEW.ativo IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='atribuicao_use_encerrar';
    END IF;
    IF NEW.tipo NOT IN ('estrategista','atendimento') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='atribuicao_parametros_invalidos';
    END IF;
    IF TG_OP = 'INSERT' THEN NEW.criado_em := clock_timestamp(); END IF;
    v_user := NEW.user_id;
  END IF;
  -- Mantém nome/atividade do alvo estáveis até o commit. Encerrar aceita alvo inativo.
  SELECT ativo, perfil INTO v_ativo, v_perfil FROM public.users
   WHERE id = v_user AND tenant_id = v_tenant FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='atribuicao_retencao_historico'; END IF;
  IF TG_OP <> 'DELETE' THEN
    IF v_ativo IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='atribuicao_destino_inativo'; END IF;
    IF NOT coalesce(private.client_assignment_elegivel(v_tenant, v_user, NEW.tipo), false) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='atribuicao_destino_inelegivel';
    END IF;
  END IF;
  INSERT INTO public.client_assignment_state (client_id, tenant_id) VALUES (v_client, v_tenant) ON CONFLICT (client_id) DO NOTHING;
  PERFORM 1 FROM public.client_assignment_state WHERE client_id = v_client AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='atribuicao_sem_permissao'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.client_assignment_guard() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.client_assignment_auditar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE a public.client_assignments%ROWTYPE; v_before jsonb; v_after jsonb; v_nome text;
  v_rev bigint; v_ator_nome text; v_op public.client_assignment_operations%ROWTYPE; v_ator uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' THEN a := OLD; ELSE a := NEW; END IF;
  v_ator:=auth.uid();
  IF v_ator IS NULL THEN v_ator:=coalesce((private.client_assignment_report_contexto_20261105(a.client_id)->>'ator_id')::uuid,
    (private.client_assignment_iris_contexto(a.client_id)->>'ator_id')::uuid); END IF;
  SELECT nome INTO STRICT v_nome FROM public.users WHERE id = a.user_id AND tenant_id = a.tenant_id;
  SELECT nome INTO STRICT v_ator_nome FROM public.users WHERE id = v_ator AND tenant_id = a.tenant_id;
  IF TG_OP <> 'INSERT' THEN v_before := jsonb_build_object('id',OLD.id,'client_id',OLD.client_id,
    'user_id',OLD.user_id,'tipo',OLD.tipo,'ativo',OLD.ativo,'criado_em',OLD.criado_em,'usuario_nome',v_nome); END IF;
  IF TG_OP <> 'DELETE' THEN v_after := jsonb_build_object('id',NEW.id,'client_id',NEW.client_id,
    'user_id',NEW.user_id,'tipo',NEW.tipo,'ativo',NEW.ativo,'criado_em',NEW.criado_em,'usuario_nome',v_nome); END IF;
  UPDATE public.client_assignment_state SET revisao = revisao + 1
   WHERE client_id = a.client_id AND tenant_id = a.tenant_id RETURNING revisao INTO STRICT v_rev;
  SELECT * INTO v_op FROM public.client_assignment_operations
   WHERE tenant_id = a.tenant_id AND client_id = a.client_id AND ator_id = v_ator
     AND transacao = txid_current() AND resposta IS NULL;
  INSERT INTO public.client_assignment_events
    (tenant_id, client_id, revisao, operacao_id, acao, origem, motivo, ator_id, ator_nome, antes, depois)
  VALUES (a.tenant_id, a.client_id, v_rev, coalesce(v_op.id, gen_random_uuid()),
    coalesce(v_op.acao, CASE WHEN TG_OP = 'DELETE' THEN 'encerrar' ELSE 'adicionar' END),
    coalesce(v_op.origem, 'legado_dml'),
    coalesce(v_op.motivo, 'Alteração direta legada; motivo não informado pelo escritor.'),
    v_ator, v_ator_nome, v_before, v_after);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.client_assignment_auditar() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.tempo_resposta_sincronizar_titular(p_tenant uuid,p_client uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ep public.tempo_resposta_episodios; titular uuid; nome text; sid uuid; instante timestamptz:=clock_timestamp(); rev bigint; ator uuid:=auth.uid(); ctx jsonb;
BEGIN
  IF ator IS NULL THEN
    ctx:=private.client_assignment_report_contexto_20261105(p_client);
    IF ctx IS NOT NULL THEN
      IF (ctx->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
        RAISE EXCEPTION 'manutencao_cliente_fora_escopo' USING ERRCODE='42501';
      END IF;
      ator:=(ctx->>'ator_id')::uuid;
    END IF;
  END IF;
  -- Só a ponte confirmada fornece ator para chamada sem sessão. Rotinas
  -- automáticas sem contexto mantêm sua auditoria anterior, sem impersonação.
  IF ator IS NULL AND EXISTS (SELECT 1 FROM private.client_assignment_iris_context
    WHERE backend_pid=pg_backend_pid() AND transacao=txid_current()) THEN
    ctx:=private.client_assignment_iris_contexto(p_client);
    IF (ctx->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
      RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501';
    END IF;
    ator:=(ctx->>'ator_id')::uuid;
  END IF;
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
      VALUES(p_tenant,ator,'troca_titular',jsonb_build_object('episodio_id',ep.id,'anterior',ep.responsavel_id,'novo',titular,'segmento_id',sid)
        || CASE WHEN ctx IS NULL THEN '{}'::jsonb
        WHEN ctx->>'origem'='manutencao_codex' THEN jsonb_build_object('origem','manutencao_codex',
          'operacao_manutencao_id',ctx->'proposta_id','executor_sql',ctx->'executor_sql')
        ELSE jsonb_build_object('origem','iris_whatsapp',
          'proposta_id',ctx->'proposta_id','pedido_confirmacao_id',ctx->'pedido_id') END);
  END LOOP;
END;
$fn$;
REVOKE ALL ON FUNCTION private.tempo_resposta_sincronizar_titular(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- SECURITY INVOKER: só uma sessão SQL administrativa pode invocar este lote.
-- Todos os alvos/valores são registros fechados acima; nenhum argumento externo.
CREATE FUNCTION private.client_assignment_reconciliar_report_20261105()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog,public
SET lock_timeout = '5s' SET statement_timeout = '30s'
AS $m$
DECLARE r private.client_assignment_report_20261105%ROWTYPE; c jsonb; resultado jsonb;
  n integer; rev bigint; ids uuid[]; pessoas uuid[];
BEGIN
  IF session_user NOT IN ('postgres','supabase_admin') OR current_user NOT IN ('postgres','supabase_admin') OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'manutencao_sessao_administrativa_exigida' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM private.client_assignment_report_20261105 ORDER BY client_id FOR UPDATE;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>11 THEN RAISE EXCEPTION 'manutencao_lote_incompleto' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM private.client_assignment_report_20261105 WHERE backend_pid IS NOT NULL OR transacao IS NOT NULL) THEN
    RAISE EXCEPTION 'manutencao_contexto_ja_ativo' USING ERRCODE='42501';
  END IF;
  SELECT array_agg(client_id ORDER BY client_id) INTO ids FROM private.client_assignment_report_20261105;
  PERFORM id FROM public.clients WHERE tenant_id='00000000-0000-0000-0000-000000000001' AND id=ANY(ids) ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>11 THEN RAISE EXCEPTION 'manutencao_cliente_ausente' USING ERRCODE='42501'; END IF;
  SELECT array_agg(DISTINCT pessoa) INTO pessoas FROM (
    SELECT user_id AS pessoa FROM private.client_assignment_report_20261105 WHERE user_id IS NOT NULL
    UNION ALL SELECT solicitante_id FROM private.client_assignment_report_20261105
    UNION ALL SELECT user_id FROM public.client_assignments WHERE client_id=ANY(ids)
  ) x;
  PERFORM id FROM public.users WHERE tenant_id='00000000-0000-0000-0000-000000000001' AND id=ANY(pessoas) ORDER BY id FOR SHARE;
  PERFORM client_id FROM public.client_assignment_state WHERE client_id=ANY(ids) ORDER BY client_id FOR UPDATE;
  PERFORM id FROM public.client_assignments WHERE client_id=ANY(ids) ORDER BY client_id,id FOR UPDATE;

  -- Primeiro confere o lote inteiro. Mudança concorrente falha sem aplicar subset.
  FOR r IN SELECT * FROM private.client_assignment_report_20261105 ORDER BY client_id LOOP
    UPDATE private.client_assignment_report_20261105 SET backend_pid=pg_backend_pid(),transacao=txid_current(),
      executor_sql=session_user,iniciado_em=coalesce(iniciado_em,clock_timestamp()) WHERE client_id=r.client_id AND recibo IS NULL;
    IF r.recibo IS NOT NULL THEN
      -- Retry de lote concluído devolve somente recibos que constam no ledger.
      PERFORM 1 FROM public.client_assignment_operations op WHERE op.tenant_id=r.tenant_id AND op.client_id=r.client_id
        AND op.ator_id=r.solicitante_id AND op.idempotencia=r.idempotencia AND op.origem='manutencao_codex'
        AND op.resposta=r.recibo;
      IF NOT FOUND THEN RAISE EXCEPTION 'manutencao_recibo_divergente' USING ERRCODE='40001'; END IF;
      CONTINUE;
    END IF;
    c:=private.client_assignment_report_contexto_20261105(r.client_id);
    IF c IS NULL THEN RAISE EXCEPTION 'manutencao_contexto_ausente' USING ERRCODE='42501'; END IF;
    PERFORM 1 FROM public.wa_agente_pedidos p
      JOIN public.chat_messages m ON m.id=p.chat_message_id AND m.tenant_id=p.tenant_id
      WHERE p.id=r.pedido_fonte_id AND p.tenant_id=r.tenant_id AND p.eh_grupo IS TRUE
        AND m.id=r.mensagem_fonte_id AND p.chat_jid='120363415422487266@g.us'
        AND p.chat_jid=(SELECT principal.chat_jid FROM public.wa_agente_pedidos principal
          WHERE principal.id='b24d7590-d7b8-44ec-aa9c-ad3475d5c746'::uuid
            AND principal.chat_message_id='1583771d-b531-4d0d-bfce-85668eb107c8'::uuid
            AND principal.tenant_id=r.tenant_id AND principal.eh_grupo IS TRUE
            AND principal.chat_jid='120363415422487266@g.us');
    IF NOT FOUND THEN RAISE EXCEPTION 'manutencao_fonte_ausente' USING ERRCODE='42501'; END IF;
    SELECT coalesce((SELECT revisao FROM public.client_assignment_state WHERE tenant_id=r.tenant_id AND client_id=r.client_id),0) INTO rev;
    IF rev<>r.revisao_esperada THEN RAISE EXCEPTION 'manutencao_revisao_alterada' USING ERRCODE='40001'; END IF;
    SELECT count(*) INTO n FROM public.client_assignments WHERE tenant_id=r.tenant_id AND client_id=r.client_id AND tipo='estrategista' AND ativo IS TRUE;
    IF (r.assignment_id IS NULL AND n<>0) OR (r.assignment_id IS NOT NULL AND n<>1) THEN
      RAISE EXCEPTION 'manutencao_vinculos_alterados' USING ERRCODE='40001';
    END IF;
    IF r.assignment_id IS NOT NULL THEN
      PERFORM 1 FROM public.client_assignments WHERE id=r.assignment_id AND tenant_id=r.tenant_id AND client_id=r.client_id AND tipo='estrategista' AND ativo IS TRUE;
      IF NOT FOUND THEN RAISE EXCEPTION 'manutencao_vinculo_alterado' USING ERRCODE='40001'; END IF;
    END IF;
    IF r.user_id IS NOT NULL THEN
      PERFORM 1 FROM public.users WHERE id=r.user_id AND tenant_id=r.tenant_id AND ativo IS TRUE;
      IF NOT FOUND OR NOT coalesce(private.client_assignment_elegivel(r.tenant_id,r.user_id,'estrategista'),false) THEN
        RAISE EXCEPTION 'manutencao_destino_inelegivel' USING ERRCODE='42501';
      END IF;
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM private.client_assignment_report_20261105 WHERE recibo IS NULL ORDER BY client_id LOOP
    c:=private.client_assignment_report_contexto_20261105(r.client_id);
    IF c IS NULL THEN RAISE EXCEPTION 'manutencao_contexto_ausente' USING ERRCODE='42501'; END IF;
    resultado:=public.client_assignment_decidir(r.client_id,r.acao,'estrategista',r.assignment_id,r.user_id,
      r.revisao_esperada,r.idempotencia,c->>'motivo');
    IF resultado->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'manutencao_resultado_nao_confirmado' USING ERRCODE='40001'; END IF;
    UPDATE private.client_assignment_report_20261105 SET recibo=resultado,executado_em=clock_timestamp(),
      backend_pid=NULL,transacao=NULL WHERE client_id=r.client_id;
  END LOOP;
  SELECT jsonb_agg(jsonb_build_object('cliente_id',client_id,'rotulo',rotulo,'acao',acao,
    'solicitante_id',solicitante_id,'executor_sql',executor_sql,'executado_em',executado_em,'recibo',recibo) ORDER BY client_id)
    INTO resultado FROM private.client_assignment_report_20261105;
  RETURN jsonb_build_object('ok',true,'origem','manutencao_codex','itens',resultado);
END;
$m$;
REVOKE ALL ON FUNCTION private.client_assignment_reconciliar_report_20261105() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
