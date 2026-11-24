-- PREPARADA LOCALMENTE. Não executada.
-- Depende das ações de chat e histórico operacional de 28/10/2026.
-- Lote de 1..10 responsáveis: uma proposta, uma confirmação, um commit.
-- Ator/tenant vêm do pedido autenticado e da proposta; nunca de claims/GUC.
-- Não modifica contratos, comissões, identidades ou cadastros de membros.
BEGIN;

ALTER TABLE public.wa_agente_acoes_propostas
  DROP CONSTRAINT wa_agente_acoes_propostas_acao_check,
  ADD CONSTRAINT wa_agente_acoes_propostas_acao_check
    CHECK (acao IN ('cliente_ativo','vincular_contrato_cliente','cliente_estrategista'));
ALTER TABLE public.client_assignment_operations
  DROP CONSTRAINT client_assignment_operations_origem_check,
  ADD CONSTRAINT client_assignment_operations_origem_check CHECK (origem IN ('desk_rpc','iris_whatsapp'));
ALTER TABLE public.client_assignment_events
  DROP CONSTRAINT client_assignment_events_origem_check,
  ADD CONSTRAINT client_assignment_events_origem_check CHECK (origem IN ('desk_rpc','legado_dml','iris_whatsapp'));

-- Não é uma sessão de usuário: só a confirmação cria esta capacidade privada,
-- por backend/transação e cliente. É removida antes de retornar ao chamador.
CREATE TABLE private.client_assignment_iris_context (
  backend_pid integer NOT NULL,
  transacao bigint NOT NULL,
  proposta_id uuid NOT NULL REFERENCES public.wa_agente_acoes_propostas(id),
  pedido_id uuid NOT NULL REFERENCES public.wa_agente_pedidos(id),
  client_id uuid NOT NULL,
  PRIMARY KEY (backend_pid, transacao)
);
ALTER TABLE private.client_assignment_iris_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.client_assignment_iris_context FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.wa_agente_atribuicoes_itens(p_alvo uuid, p_novo jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp
AS $f$
DECLARE i jsonb; ids uuid[] := '{}'; v_id uuid;
BEGIN
  IF p_alvo IS NULL OR p_novo IS NULL OR jsonb_typeof(p_novo) IS DISTINCT FROM 'object'
    OR p_novo - 'itens' <> '{}'::jsonb OR jsonb_typeof(p_novo->'itens') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Informe somente a lista de atribuições.' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_novo->'itens') NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Informe de uma a dez atribuições.' USING ERRCODE='22023';
  END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(p_novo->'itens') LOOP
    IF jsonb_typeof(i) IS DISTINCT FROM 'object'
      OR i - ARRAY['cliente_id','user_id','assignment_id','expected_revision'] <> '{}'::jsonb
      OR NOT (i ?& ARRAY['cliente_id','user_id','assignment_id','expected_revision'])
      OR jsonb_typeof(i->'cliente_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(i->'user_id') IS DISTINCT FROM 'string'
      OR coalesce(i->>'cliente_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR coalesce(i->>'user_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (i->'assignment_id' <> 'null'::jsonb AND (
        jsonb_typeof(i->'assignment_id') IS DISTINCT FROM 'string'
        OR coalesce(i->>'assignment_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
      OR jsonb_typeof(i->'expected_revision') IS DISTINCT FROM 'number'
      OR coalesce(i->>'expected_revision','') !~ '^[0-9]{1,19}$' THEN
      RAISE EXCEPTION 'Atribuição inválida ou incompleta.' USING ERRCODE='22023';
    END IF;
    IF (i->>'expected_revision')::numeric > 9223372036854775807 THEN
      RAISE EXCEPTION 'Revisão inválida.' USING ERRCODE='22023';
    END IF;
    v_id := (i->>'cliente_id')::uuid;
    IF v_id = ANY(ids) THEN RAISE EXCEPTION 'Um cliente não pode aparecer duas vezes.' USING ERRCODE='22023'; END IF;
    ids := array_append(ids, v_id);
  END LOOP;
  IF ids[1] IS DISTINCT FROM p_alvo THEN RAISE EXCEPTION 'Alvo incompatível com a lista.' USING ERRCODE='22023'; END IF;
  RETURN p_novo->'itens';
END;
$f$;
REVOKE ALL ON FUNCTION private.wa_agente_atribuicoes_itens(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Sem parâmetros de ator/tenant: reconstitui a autorização já confirmada.
CREATE FUNCTION private.client_assignment_iris_contexto(p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $f$
DECLARE x private.client_assignment_iris_context%ROWTYPE; p public.wa_agente_pedidos%ROWTYPE;
  v public.wa_agente_acoes_propostas%ROWTYPE; i jsonb; u public.users%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501'; END IF;
  SELECT * INTO x FROM private.client_assignment_iris_context
    WHERE backend_pid=pg_backend_pid() AND transacao=txid_current() AND client_id=p_client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501'; END IF;
  SELECT * INTO p FROM public.wa_agente_pedidos WHERE id=x.pedido_id;
  SELECT * INTO v FROM public.wa_agente_acoes_propostas WHERE id=x.proposta_id;
  IF p.id IS NULL OR v.id IS NULL OR v.acao IS DISTINCT FROM 'cliente_estrategista'
    OR v.estado IS DISTINCT FROM 'pendente' OR v.expira_em <= clock_timestamp()
    OR p.status IS DISTINCT FROM 'processando' OR p.lock_ate IS NULL OR p.lock_ate <= clock_timestamp()
    OR p.entrada_texto_sha256 IS NULL OR p.entrada_encaminhada IS TRUE
    OR p.user_id IS NULL OR p.membro_id IS NULL OR p.eh_grupo IS NOT TRUE
    OR p.tenant_id IS DISTINCT FROM v.tenant_id OR p.user_id IS DISTINCT FROM v.user_id
    OR p.membro_id IS DISTINCT FROM v.membro_id OR p.instance_uuid IS DISTINCT FROM v.instance_uuid
    OR p.chat_jid IS DISTINCT FROM v.chat_jid OR p.remetente_chave IS DISTINCT FROM v.remetente_chave
    OR p.id = v.pedido_origem_id OR p.chat_message_id = v.mensagem_origem_id THEN
    RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501';
  END IF;
  SELECT value INTO i FROM jsonb_array_elements(private.wa_agente_atribuicoes_itens(v.alvo,v.novo))
    WHERE (value->>'cliente_id')::uuid=p_client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.wa_agente_membros WHERE id=p.membro_id AND tenant_id=p.tenant_id
    AND user_id=p.user_id AND telefone_chave=p.remetente_chave AND ativo IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501'; END IF;
  SELECT * INTO u FROM public.users WHERE id=p.user_id AND tenant_id=p.tenant_id
    AND ativo IS TRUE AND perfil IS DISTINCT FROM 'cliente' FOR SHARE;
  IF NOT FOUND OR NOT coalesce(public.has_permissao_de(p.user_id,'automacoes-wa','admin'),false)
    OR NOT coalesce(public.has_permissao_de(p.user_id,'clientes.atribuir','editar'),false) THEN
    RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('tenant_id',p.tenant_id,'ator_id',p.user_id,'ator_nome',u.nome,
    'proposta_id',v.id,'pedido_id',p.id,'item',i,'origem','iris_whatsapp');
END;
$f$;
REVOKE ALL ON FUNCTION private.client_assignment_iris_contexto(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- O caminho autenticado conserva integralmente o autorizador anterior.
CREATE FUNCTION private.client_assignment_autorizar_sessao(p_client_id uuid, p_escrita boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE u record; v_cliente uuid;
BEGIN
  SELECT id, tenant_id, nome INTO u FROM public.users
   WHERE id = auth.uid() AND tenant_id = public.get_user_tenant_id()
     AND ativo IS TRUE AND perfil <> 'cliente' FOR SHARE;
  IF NOT FOUND OR (p_escrita AND NOT coalesce(public.has_permissao('clientes.atribuir','editar'), false))
    OR (NOT coalesce(public.client_assignment_pode_ler(p_client_id), false) AND NOT (
      p_escrita AND EXISTS (
        -- Só uma operação criada pela RPC, nesta tx/ator/cliente, preserva a
        -- autorização inicial ao transferir a última membership do próprio ator.
        SELECT 1 FROM public.client_assignment_operations op WHERE op.tenant_id = u.tenant_id
          AND op.client_id = p_client_id AND op.ator_id = auth.uid()
          AND op.transacao = txid_current() AND op.resposta IS NULL
      )
    )) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'atribuicao_sem_permissao';
  END IF;
  IF p_escrita THEN
    SELECT id INTO v_cliente FROM public.clients WHERE id = p_client_id AND tenant_id = u.tenant_id FOR UPDATE;
  ELSE
    SELECT id INTO v_cliente FROM public.clients WHERE id = p_client_id AND tenant_id = u.tenant_id FOR SHARE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'atribuicao_sem_permissao'; END IF;
  -- A espera pelo mutex pode ter permitido a outro escritor retirar o acesso.
  IF (p_escrita AND NOT coalesce(public.has_permissao('clientes.atribuir','editar'), false))
    OR (NOT coalesce(public.client_assignment_pode_ler(p_client_id), false) AND NOT (
      p_escrita AND EXISTS (SELECT 1 FROM public.client_assignment_operations op
        WHERE op.tenant_id=u.tenant_id AND op.client_id=p_client_id AND op.ator_id=auth.uid()
          AND op.transacao=txid_current() AND op.resposta IS NULL)
    )) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='atribuicao_sem_permissao'; END IF;
  RETURN jsonb_build_object('tenant_id', u.tenant_id, 'ator_id', u.id, 'ator_nome', u.nome);
END;
$fn$;
REVOKE ALL ON FUNCTION private.client_assignment_autorizar_sessao(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.client_assignment_autorizar(p_client_id uuid,p_escrita boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $f$
DECLARE c jsonb; t uuid; a uuid; total boolean; ids uuid[];
BEGIN
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

-- A RPC operacional continua authenticated-only. Sua chamada interna executa
-- com o owner, sob a capacidade acima; a operação também confere a proposta.
CREATE FUNCTION private.client_assignment_iris_operacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $f$
DECLARE c jsonb; i jsonb; esperado jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.origem IS DISTINCT FROM 'desk_rpc' THEN RAISE EXCEPTION 'atribuicao_sem_permissao' USING ERRCODE='42501'; END IF;
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
CREATE TRIGGER client_assignment_iris_operacao BEFORE INSERT ON public.client_assignment_operations
  FOR EACH ROW EXECUTE FUNCTION private.client_assignment_iris_operacao();

CREATE FUNCTION private.wa_agente_atribuicoes_estado(p public.wa_agente_pedidos,p_alvo uuid,p_novo jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $f$
DECLARE itens jsonb; i jsonb; c public.clients%ROWTYPE; u public.users%ROWTYPE;
  a public.client_assignments%ROWTYPE; ids uuid[]; usuarios uuid[]; carteira uuid[]; total boolean;
  rev bigint; n integer; nome_anterior text; antes jsonb:='[]'; depois jsonb:='[]'; esperado jsonb:='[]';
BEGIN
  itens:=private.wa_agente_atribuicoes_itens(p_alvo,p_novo);
  IF NOT coalesce(public.has_permissao_de(p.user_id,'clientes.atribuir','editar'),false) THEN
    RAISE EXCEPTION 'Sem permissão atual para esta operação.' USING ERRCODE='42501';
  END IF;
  SELECT array_agg((value->>'cliente_id')::uuid),array_agg((value->>'user_id')::uuid)
    INTO ids,usuarios FROM jsonb_array_elements(itens);
  SELECT s.total,s.client_ids INTO total,carteira FROM public.wa_agente_escopo(p.tenant_id,p.user_id) s;
  IF total IS NOT TRUE AND NOT (ids <@ coalesce(carteira,'{}'::uuid[])) THEN
    RAISE EXCEPTION 'Registro fora da carteira autorizada.' USING ERRCODE='42501';
  END IF;
  -- Todos os mutexes do lote precedem a primeira escrita; ordem global UUID.
  PERFORM id FROM public.clients WHERE tenant_id=p.tenant_id AND id=ANY(ids) ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>cardinality(ids) THEN RAISE EXCEPTION 'Registro não encontrado nesta empresa.' USING ERRCODE='42501'; END IF;
  SELECT array_agg(DISTINCT pessoa) INTO usuarios FROM (
    SELECT unnest(usuarios) AS pessoa
    UNION ALL
    SELECT user_id FROM public.client_assignments WHERE tenant_id=p.tenant_id
      AND client_id=ANY(ids) AND tipo='estrategista' AND ativo IS TRUE
  ) nomes;
  PERFORM id FROM public.users WHERE tenant_id=p.tenant_id AND id=ANY(usuarios) ORDER BY id FOR SHARE;
  PERFORM client_id FROM public.client_assignment_state WHERE tenant_id=p.tenant_id AND client_id=ANY(ids) ORDER BY client_id FOR UPDATE;
  PERFORM id FROM public.client_assignments WHERE tenant_id=p.tenant_id AND client_id=ANY(ids) ORDER BY client_id,id FOR UPDATE;
  SELECT s.total,s.client_ids INTO total,carteira FROM public.wa_agente_escopo(p.tenant_id,p.user_id) s;
  IF NOT coalesce(public.has_permissao_de(p.user_id,'clientes.atribuir','editar'),false)
    OR (total IS NOT TRUE AND NOT (ids <@ coalesce(carteira,'{}'::uuid[]))) THEN
    RAISE EXCEPTION 'Sem permissão atual para esta operação.' USING ERRCODE='42501';
  END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(itens) LOOP
    SELECT * INTO STRICT c FROM public.clients WHERE tenant_id=p.tenant_id AND id=(i->>'cliente_id')::uuid;
    SELECT * INTO u FROM public.users WHERE tenant_id=p.tenant_id AND id=(i->>'user_id')::uuid;
    IF NOT FOUND OR u.ativo IS DISTINCT FROM true THEN RAISE EXCEPTION 'atribuicao_destino_inativo' USING ERRCODE='22023'; END IF;
    IF NOT coalesce(private.client_assignment_elegivel(p.tenant_id,u.id,'estrategista'),false) THEN
      RAISE EXCEPTION 'atribuicao_destino_inelegivel' USING ERRCODE='22023';
    END IF;
    SELECT count(*) INTO n FROM public.client_assignments
      WHERE tenant_id=p.tenant_id AND client_id=c.id AND tipo='estrategista' AND ativo IS TRUE;
    IF n>1 THEN RAISE EXCEPTION 'Cliente com mais de um estrategista ativo; escolha o vínculo no cadastro.' USING ERRCODE='22023'; END IF;
    a:=NULL; nome_anterior:=NULL;
    SELECT * INTO a FROM public.client_assignments
      WHERE tenant_id=p.tenant_id AND client_id=c.id AND tipo='estrategista' AND ativo IS TRUE;
    IF a.id IS DISTINCT FROM (i->>'assignment_id')::uuid THEN RAISE EXCEPTION 'atribuicao_estado_alterado' USING ERRCODE='40001'; END IF;
    IF a.user_id=u.id THEN RAISE EXCEPTION 'atribuicao_ja_ativa' USING ERRCODE='22023'; END IF;
    SELECT nome INTO nome_anterior FROM public.users WHERE id=a.user_id AND tenant_id=p.tenant_id;
    SELECT coalesce((SELECT revisao FROM public.client_assignment_state WHERE tenant_id=p.tenant_id AND client_id=c.id),0) INTO rev;
    IF rev<>(i->>'expected_revision')::bigint THEN RAISE EXCEPTION 'atribuicao_estado_alterado' USING ERRCODE='40001'; END IF;
    antes:=antes||jsonb_build_array(jsonb_build_object('cliente_id',c.id,'cliente_nome',c.nome,
      'assignment_id',a.id,'estrategista_id',a.user_id,'estrategista_nome',nome_anterior,'revisao',rev));
    depois:=depois||jsonb_build_array(jsonb_build_object('cliente_id',c.id,'cliente_nome',c.nome,'user_id',u.id,'estrategista_nome',u.nome));
    esperado:=esperado||jsonb_build_array(jsonb_build_object('cliente_id',c.id,'cliente_nome',c.nome,
      'cliente_ativo',c.ativo,'cliente_atualizado_em',c.atualizado_em,'revisao',rev,'assignment',to_jsonb(a),
      'estrategista_nome',nome_anterior,'destino_id',u.id,'destino_nome',u.nome,'destino_perfil',u.perfil,'destino_ativo',u.ativo));
  END LOOP;
  RETURN jsonb_build_object('esperado',jsonb_build_object('itens',esperado),
    'previa',jsonb_build_object('acao','cliente_estrategista','alvo_nome','Responsáveis operacionais',
      'antes',jsonb_build_object('itens',antes),'depois',jsonb_build_object('itens',depois)));
END;
$f$;
REVOKE ALL ON FUNCTION private.wa_agente_atribuicoes_estado(public.wa_agente_pedidos,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- A implementação das duas ações antigas é preservada sem mudar sua semântica.
CREATE FUNCTION private.wa_agente_acoes_estado_cadastro(p public.wa_agente_pedidos, p_acao text, p_alvo uuid, p_novo jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $f$
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
        AND (cliente_id = c.id OR (cliente_id IS NULL AND v_nome <> '' AND private.wa_agente_acoes_nome(cliente_nome) = v_nome))
        ORDER BY id FOR UPDATE;
      IF EXISTS (
        SELECT 1 FROM public.contratos WHERE tenant_id = p.tenant_id
          AND (cliente_id = c.id OR (cliente_id IS NULL AND v_nome <> '' AND private.wa_agente_acoes_nome(cliente_nome) = v_nome))
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
$f$;
REVOKE ALL ON FUNCTION private.wa_agente_acoes_estado_cadastro(public.wa_agente_pedidos,text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.wa_agente_acoes_estado(p public.wa_agente_pedidos,p_acao text,p_alvo uuid,p_novo jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $f$
BEGIN
  IF p_acao='cliente_estrategista' THEN RETURN private.wa_agente_atribuicoes_estado(p,p_alvo,p_novo); END IF;
  RETURN private.wa_agente_acoes_estado_cadastro(p,p_acao,p_alvo,p_novo);
END;
$f$;
REVOKE ALL ON FUNCTION private.wa_agente_acoes_estado(public.wa_agente_pedidos,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.wa_agente_acoes_estado(public.wa_agente_pedidos,text,uuid,jsonb) TO service_role;

CREATE FUNCTION public.wa_agente_acoes_capacidades()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $f$ SELECT jsonb_build_object('versao',2,'cliente_estrategista',true) $f$;
REVOKE ALL ON FUNCTION public.wa_agente_acoes_capacidades() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wa_agente_acoes_capacidades() TO service_role;


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
        AND op.transacao=txid_current() AND op.resposta IS NULL AND op.origem='iris_whatsapp'
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
  IF v_ator IS NULL THEN v_ator:=(private.client_assignment_iris_contexto(a.client_id)->>'ator_id')::uuid; END IF;
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

CREATE OR REPLACE FUNCTION private.wa_agente_acoes_pedido(p_pedido uuid, p_exigir_lock boolean)
RETURNS public.wa_agente_pedidos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $f$
DECLARE
  p public.wa_agente_pedidos%ROWTYPE;
  m public.wa_agente_membros%ROWTYPE;
  u public.users%ROWTYPE;
  cfg public.wa_auto_config%ROWTYPE;
  wi public.whatsapp_instances%ROWTYPE;
  msg public.chat_messages%ROWTYPE;
  cv public.chat_conversations%ROWTYPE;
  ct public.chat_contacts%ROWTYPE;
  g public.wa_agente_grupos%ROWTYPE;
  v_base text;
  v_texto text;
  cv_origem public.chat_conversations%ROWTYPE;
  ct_origem public.chat_contacts%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Ação não autorizada para este pedido.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM public.wa_agente_pedidos WHERE id = p_pedido FOR UPDATE;
  IF NOT FOUND OR p.user_id IS NULL OR p.membro_id IS NULL OR p.chat_message_id IS NULL
     OR p.conversation_id IS NULL OR p.instance_uuid IS NULL OR p.eh_grupo IS NOT TRUE
     OR p.entrada_texto_sha256 IS NULL OR p.entrada_encaminhada IS TRUE
     OR (p_exigir_lock AND (p.status <> 'processando' OR p.lock_ate IS NULL OR p.lock_ate <= clock_timestamp())) THEN
    RAISE EXCEPTION 'Pedido indisponível ou sem processamento exclusivo.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM public.wa_agente_membros
    WHERE id = p.membro_id AND tenant_id = p.tenant_id AND user_id = p.user_id AND ativo IS TRUE FOR SHARE;
  IF NOT FOUND OR m.telefone_chave IS DISTINCT FROM p.remetente_chave THEN
    RAISE EXCEPTION 'Ação não autorizada para este pedido.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO u FROM public.users
    WHERE id = p.user_id AND tenant_id = p.tenant_id AND ativo IS TRUE AND perfil IS DISTINCT FROM 'cliente' FOR SHARE;
  IF NOT FOUND OR NOT coalesce(public.has_permissao_de(p.user_id, 'automacoes-wa', 'admin'), false) THEN
    RAISE EXCEPTION 'Ação não autorizada para este pedido.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.app_modules
    WHERE tenant_id = p.tenant_id AND slug = 'automacoes-wa' AND enabled IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assistente indisponível.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO cfg FROM public.wa_auto_config WHERE tenant_id = p.tenant_id AND agente_ativo IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assistente indisponível.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO wi FROM public.whatsapp_instances
    WHERE id = p.instance_uuid AND tenant_id = p.tenant_id AND ativo IS TRUE AND status = 'conectado' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Canal indisponível.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO msg FROM public.chat_messages
    WHERE id = p.chat_message_id AND tenant_id = p.tenant_id AND message_id_wpp = p.message_id_wpp FOR SHARE;
  IF NOT FOUND OR msg.tipo IS DISTINCT FROM 'texto' OR msg.reply_to_id IS NOT NULL
     OR msg.enviado_por_agente IS TRUE OR msg.enviado_por_ia IS TRUE
     OR msg.autor_origem IS DISTINCT FROM 'webhook' OR msg.autor_chave IS DISTINCT FROM p.remetente_chave
     OR (msg.conversation_id = p.conversation_id AND (
       msg.autor_tipo IS DISTINCT FROM 'equipe' OR msg.autor_user_id IS DISTINCT FROM p.user_id))
     OR p.gatilho NOT IN ('nome', 'mencao') THEN
    RAISE EXCEPTION 'Use uma mensagem de texto própria, direta e sem citação.' USING ERRCODE = '42501';
  END IF;
  v_texto := regexp_replace(msg.conteudo, '^\[[^\]\r\n]{1,100}\] ', '');
  IF v_texto IS NULL OR encode(extensions.digest(convert_to(v_texto, 'UTF8'), 'sha256'), 'hex') IS DISTINCT FROM p.entrada_texto_sha256 THEN
    RAISE EXCEPTION 'A entrada original não pôde ser conferida.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO cv FROM public.chat_conversations
    WHERE id = p.conversation_id AND tenant_id = p.tenant_id AND instance_id = p.instance_uuid FOR SHARE;
  IF NOT FOUND OR cv.is_group IS DISTINCT FROM p.eh_grupo THEN
    RAISE EXCEPTION 'Canal indisponível.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO ct FROM public.chat_contacts
    WHERE id = cv.contact_id AND tenant_id = p.tenant_id AND instance_id = p.instance_uuid AND bloqueado IS NOT TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Canal indisponível.' USING ERRCODE = '42501'; END IF;
  IF p.eh_grupo THEN
    IF cfg.agente_grupos IS NOT TRUE OR p.gatilho NOT IN ('nome', 'mencao')
       OR p.chat_jid !~ '^(120363[0-9]{9,15}|[1-9][0-9]{9,14}-[0-9]{9,11})@g\.us$' THEN
      RAISE EXCEPTION 'Grupo não autorizado.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO g FROM public.wa_agente_grupos
      WHERE tenant_id = p.tenant_id AND grupo_jid = p.chat_jid AND ativo IS TRUE FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Grupo não autorizado.' USING ERRCODE = '42501'; END IF;
    IF wi.instance_id IS DISTINCT FROM cfg.uazapi_instance_id AND NOT EXISTS (
      SELECT 1 FROM public.wa_agente_grupo_numeros n
        WHERE n.tenant_id = p.tenant_id AND n.grupo_id = g.id AND n.instance_uuid = p.instance_uuid
    ) THEN RAISE EXCEPTION 'Número não autorizado neste grupo.' USING ERRCODE = '42501'; END IF;
    v_base := left(p.chat_jid, length(p.chat_jid) - 5);
    -- A mensagem pode ter sido deduplicada pela primeira conexão a recebê-la.
    -- Esta segunda cadeia só comprova conteúdo/canal; não concede identidade.
    SELECT * INTO cv_origem FROM public.chat_conversations
      WHERE id=msg.conversation_id AND tenant_id=p.tenant_id AND is_group IS TRUE FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Canal de origem indisponível.' USING ERRCODE='42501'; END IF;
    PERFORM 1 FROM public.whatsapp_instances WHERE id=cv_origem.instance_id AND tenant_id=p.tenant_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Canal de origem indisponível.' USING ERRCODE='42501'; END IF;
    SELECT * INTO ct_origem FROM public.chat_contacts
      WHERE id=cv_origem.contact_id AND tenant_id=p.tenant_id AND instance_id=cv_origem.instance_id
        AND bloqueado IS NOT TRUE FOR SHARE;
    IF NOT FOUND OR lower(btrim(ct_origem.numero_whatsapp)) NOT IN (v_base,p.chat_jid)
      OR ct_origem.numero_whatsapp IS NULL THEN
      RAISE EXCEPTION 'Canal de origem indisponível.' USING ERRCODE='42501';
    END IF;
    IF ct.numero_whatsapp IS NULL OR lower(btrim(ct.numero_whatsapp)) NOT IN (v_base, p.chat_jid) OR EXISTS (
      SELECT 1 FROM public.chat_contacts c
      WHERE c.tenant_id = p.tenant_id AND lower(btrim(c.numero_whatsapp)) IN (v_base, p.chat_jid)
        AND (c.client_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM public.chat_contact_clients cc WHERE cc.tenant_id = p.tenant_id AND cc.contact_id = c.id
        ) OR EXISTS (
          SELECT 1 FROM public.clients cl WHERE cl.tenant_id = p.tenant_id AND cl.ativo IS DISTINCT FROM false
            AND private.wa_agente_acoes_nome(cl.nome) <> ''
            AND private.wa_agente_acoes_nome(cl.nome) = private.wa_agente_acoes_nome(c.nome)
        ))
    ) THEN RAISE EXCEPTION 'O grupo não é mais interno.' USING ERRCODE = '42501'; END IF;
  END IF;
  -- Mesmo critério temporal de lerPergunta, mas aqui a concatenação é recusada.
  IF EXISTS (
    SELECT 1 FROM public.wa_agente_pedidos q WHERE q.tenant_id = p.tenant_id AND q.chat_jid = p.chat_jid
      AND q.membro_id = p.membro_id AND q.id <> p.id AND q.status = 'agrupado'
      AND q.created_at >= clock_timestamp() - interval '2 minutes'
  ) THEN RAISE EXCEPTION 'Envie a confirmação sozinha em uma nova mensagem.' USING ERRCODE = '42501'; END IF;
  RETURN p;
END;
$f$;

REVOKE ALL ON FUNCTION private.wa_agente_acoes_pedido(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.wa_agente_acoes_pedido(uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.wa_agente_acoes_confirmar(p_pedido uuid, p_codigo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
SET lock_timeout = '3s' SET statement_timeout = '8s'
AS $f$
DECLARE
  p public.wa_agente_pedidos%ROWTYPE;
  v public.wa_agente_acoes_propostas%ROWTYPE;
  v_estado jsonb;
  v_texto text;
  v_match text[];
  v_mensagem_em timestamptz;
  v_recibo jsonb;
  v_linhas integer;
  v_total boolean;
  v_ids uuid[];
  v_cliente uuid;
  v_itens jsonb; v_item jsonb; v_operacoes jsonb := '[]'; v_operacao jsonb;
BEGIN
  p := private.wa_agente_acoes_pedido(p_pedido, false);
  IF p_codigo IS NULL OR p_codigo !~ '^[0-9A-F]{8}$' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'confirmacao_invalida', 'erro', 'Use o código exato da proposta.');
  END IF;
  SELECT conteudo, criado_em INTO v_texto, v_mensagem_em FROM public.chat_messages
    WHERE id = p.chat_message_id AND tenant_id = p.tenant_id;
  IF p.eh_grupo THEN v_texto := regexp_replace(v_texto, '^\[[^\]\r\n]{1,100}\] ', ''); END IF;
  v_match := regexp_match(v_texto, '^(?:[ÍI]ris, )?CONFIRMAR ([0-9A-F]{8})$', 'i');
  -- PostgreSQL regex padrão inclui todo o texto; CR/LF são sempre recusados.
  IF v_match IS NULL OR v_texto ~ '[\r\n]' OR upper(v_match[1]) IS DISTINCT FROM p_codigo THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'confirmacao_invalida', 'erro', 'Envie somente Íris, confirmar e o código, em nova mensagem direta.');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('wa-acoes:' || p.tenant_id || ':' || p.user_id || ':' || p.chat_jid, 0));
  SELECT * INTO v FROM public.wa_agente_acoes_propostas
    WHERE tenant_id = p.tenant_id AND user_id = p.user_id AND membro_id = p.membro_id
      AND instance_uuid = p.instance_uuid AND chat_jid = p.chat_jid AND eh_grupo = p.eh_grupo
      AND remetente_chave = p.remetente_chave AND codigo = p_codigo FOR UPDATE;
  IF NOT FOUND OR v.pedido_origem_id = p.id OR v.mensagem_origem_id = p.chat_message_id
      OR p.created_at <= v.origem_criada_em OR p.created_at <= v.criada_em OR v_mensagem_em <= v.criada_em THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'proposta_indisponivel', 'erro', 'Proposta não encontrada para esta nova mensagem e este chat.');
  END IF;
  -- Revalida a permissão da ação inclusive ao devolver um recibo idempotente.
  IF NOT coalesce(public.has_permissao_de(p.user_id, CASE v.acao WHEN 'cliente_ativo' THEN 'clientes' WHEN 'cliente_estrategista' THEN 'clientes.atribuir' ELSE 'contratos' END, 'editar'), false) THEN
    RAISE EXCEPTION 'Sem permissão atual para esta operação.' USING ERRCODE = '42501';
  END IF;
  SELECT total, client_ids INTO v_total, v_ids FROM public.wa_agente_escopo(p.tenant_id, p.user_id);
  IF v.acao='cliente_estrategista' THEN
    v_itens:=private.wa_agente_atribuicoes_itens(v.alvo,v.novo);
    IF v_total IS NOT TRUE AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_itens)
      WHERE NOT ((value->>'cliente_id')::uuid=ANY(coalesce(v_ids,'{}'::uuid[])))) THEN
      RAISE EXCEPTION 'Registro fora da carteira autorizada.' USING ERRCODE='42501';
    END IF;
  ELSE
    v_cliente := CASE v.acao WHEN 'cliente_ativo' THEN v.alvo ELSE (v.novo ->> 'cliente_id')::uuid END;
    IF v_total IS NOT TRUE AND (NOT (v_cliente = ANY(coalesce(v_ids, '{}'::uuid[])))
      OR (v.acao = 'vincular_contrato_cliente' AND NOT EXISTS (
        SELECT 1 FROM public.contratos WHERE id = v.alvo AND tenant_id = p.tenant_id AND estrategista_id = p.user_id
      ))) THEN RAISE EXCEPTION 'Registro fora da carteira autorizada.' USING ERRCODE = '42501'; END IF;
  END IF;
  IF v.estado = 'executada' THEN
    IF v.pedido_confirmacao_id = p.id THEN RETURN jsonb_build_object('ok', true, 'repetida', true, 'recibo', v.recibo); END IF;
    RETURN jsonb_build_object('ok', false, 'codigo', 'proposta_concluida', 'erro', 'Esta proposta já foi concluída por outra mensagem.');
  END IF;
  p := private.wa_agente_acoes_pedido(p_pedido, true);
  IF v.expira_em <= clock_timestamp() THEN
    UPDATE public.wa_agente_acoes_propostas SET estado = 'expirada' WHERE id = v.id;
    RETURN jsonb_build_object('ok', false, 'codigo', 'proposta_expirada', 'erro', 'Código expirado. Solicite nova proposta.');
  END IF;
  IF v.estado <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'proposta_indisponivel', 'erro', 'Solicite nova proposta.');
  END IF;
  v_estado := private.wa_agente_acoes_estado(p, v.acao, v.alvo, v.novo);
  IF v_estado -> 'esperado' IS DISTINCT FROM v.esperado THEN
    UPDATE public.wa_agente_acoes_propostas SET estado = 'obsoleta' WHERE id = v.id;
    RETURN jsonb_build_object('ok', false, 'codigo', 'estado_alterado', 'erro', 'O registro mudou. Solicite nova proposta.');
  END IF;
  -- Reconfere prazo/lease após adquirir os locks de negócio.
  IF v.expira_em <= clock_timestamp() OR p.lock_ate <= clock_timestamp() THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'prazo_encerrado', 'erro', 'Prazo encerrado. Solicite nova proposta.');
  END IF;
  IF v.acao='cliente_estrategista' THEN
    IF EXISTS (SELECT 1 FROM private.client_assignment_iris_context
      WHERE backend_pid=pg_backend_pid() AND transacao=txid_current()) THEN
      RAISE EXCEPTION 'Contexto de confirmação já em uso.' USING ERRCODE='42501';
    END IF;
    BEGIN
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_itens) ORDER BY (value->>'cliente_id')::uuid LOOP
        INSERT INTO private.client_assignment_iris_context(backend_pid,transacao,proposta_id,pedido_id,client_id)
          VALUES(pg_backend_pid(),txid_current(),v.id,p.id,(v_item->>'cliente_id')::uuid);
        v_operacao:=public.client_assignment_decidir((v_item->>'cliente_id')::uuid,
          CASE WHEN v_item->>'assignment_id' IS NULL THEN 'adicionar' ELSE 'trocar' END,
          'estrategista',(v_item->>'assignment_id')::uuid,(v_item->>'user_id')::uuid,
          (v_item->>'expected_revision')::bigint,v.id,'Confirmação explícita de responsáveis pela Íris no WhatsApp.');
        v_operacoes:=v_operacoes||jsonb_build_array(jsonb_build_object('cliente_id',v_item->'cliente_id','resultado',v_operacao));
        DELETE FROM private.client_assignment_iris_context WHERE backend_pid=pg_backend_pid() AND transacao=txid_current();
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      -- O bloco desfaz o lote inteiro; nenhum contexto vaza ao próximo comando.
      DELETE FROM private.client_assignment_iris_context WHERE backend_pid=pg_backend_pid() AND transacao=txid_current();
      RAISE;
    END;
    v_linhas:=1;
  ELSIF v.acao = 'cliente_ativo' THEN
    UPDATE public.clients SET ativo = (v.novo ->> 'ativo')::boolean
      WHERE id = v.alvo AND tenant_id = p.tenant_id
        AND atualizado_em = (v.esperado ->> 'atualizado_em')::timestamptz
        AND ativo IS NOT DISTINCT FROM (v.esperado ->> 'ativo')::boolean;
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
  ELSE
    -- Exclusivamente a FK. Não reescreve snapshot, status, financeiro ou formulário.
    UPDATE public.contratos SET cliente_id = (v.novo ->> 'cliente_id')::uuid
      WHERE id = v.alvo AND tenant_id = p.tenant_id AND cliente_id IS NULL
        AND atualizado_em = (v.esperado ->> 'atualizado_em')::timestamptz;
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
  END IF;
  IF v_linhas <> 1 THEN RAISE EXCEPTION 'O registro mudou; nenhuma ação confirmada.' USING ERRCODE = '40001'; END IF;
  IF v.expira_em <= clock_timestamp() OR p.lock_ate <= clock_timestamp() THEN
    RAISE EXCEPTION 'Processamento expirado; nenhuma ação confirmada.' USING ERRCODE = '42501';
  END IF;
  v_recibo := jsonb_build_object('proposta_id', v.id, 'pedido_confirmacao_id', p.id,
    'executada_em', clock_timestamp(), 'estado', 'executada', 'previa', v.previa);
  IF v.acao='cliente_estrategista' THEN v_recibo:=v_recibo||jsonb_build_object('operacoes',v_operacoes); END IF;
  UPDATE public.wa_agente_acoes_propostas SET estado = 'executada', pedido_confirmacao_id = p.id, recibo = v_recibo WHERE id = v.id;
  RETURN jsonb_build_object('ok', true, 'repetida', false, 'recibo', v_recibo);
END;
$f$;

REVOKE ALL ON FUNCTION public.wa_agente_acoes_confirmar(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wa_agente_acoes_confirmar(uuid,text) TO service_role;

-- Nenhuma concessão de DML genérico ou execução da RPC operacional ao serviço.
REVOKE ALL ON FUNCTION public.client_assignment_decidir(uuid,text,text,uuid,uuid,bigint,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.client_assignment_decidir(uuid,text,text,uuid,uuid,bigint,uuid,text) TO authenticated;


-- Dependência já existente: não sobrescrever uma versão diferente do monitor.
DO $dependencia$
BEGIN
  IF to_regprocedure('private.tempo_resposta_sincronizar_titular(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Dependência ausente: tempo_resposta_sincronizar_titular.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('private.tempo_resposta_sincronizar_titular(uuid,uuid)'))
      IS DISTINCT FROM '74680ba5ea94e388d2edff70c7d6835a' THEN
    RAISE EXCEPTION 'Dependência alterada: revisar o corpo de tempo_resposta_sincronizar_titular antes desta migration.';
  END IF;
END;
$dependencia$;

CREATE OR REPLACE FUNCTION private.tempo_resposta_sincronizar_titular(p_tenant uuid,p_client uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ep public.tempo_resposta_episodios; titular uuid; nome text; sid uuid; instante timestamptz:=clock_timestamp(); rev bigint; ator uuid:=auth.uid(); ctx jsonb;
BEGIN
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
        || CASE WHEN ctx IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('origem','iris_whatsapp',
          'proposta_id',ctx->'proposta_id','pedido_confirmacao_id',ctx->'pedido_id') END);
  END LOOP;
END;
$fn$;
REVOKE ALL ON FUNCTION private.tempo_resposta_sincronizar_titular(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON TABLE public.wa_agente_acoes_propostas IS
  'Proposta/recibo transacional de ações de chat; cliente_estrategista contém lote atômico de até dez clientes. IDs de auditoria são snapshots. Acesso exclusivo service_role.';
NOTIFY pgrst, 'reload schema';
COMMIT;
-- Migration preparada e revisada estaticamente; execução e validação em banco não realizadas.
