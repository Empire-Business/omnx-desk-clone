-- A intenção de uma resposta citada é exclusivamente o corpo próprio autenticado.
-- Preserva os helpers aplicados anteriormente; não preenche hashes de pedidos
-- antigos, não reabre filas e não concede execução administrativa ao serviço.
-- Confirmações continuam exigindo mensagem nova sem citação e código integral.

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
  IF NOT FOUND OR msg.tipo IS DISTINCT FROM 'texto'
     OR msg.enviado_por_agente IS TRUE OR msg.enviado_por_ia IS TRUE
     OR msg.autor_origem IS DISTINCT FROM 'webhook' OR msg.autor_chave IS DISTINCT FROM p.remetente_chave
     OR (msg.conversation_id = p.conversation_id AND (
       msg.autor_tipo IS DISTINCT FROM 'equipe' OR msg.autor_user_id IS DISTINCT FROM p.user_id))
     OR p.gatilho NOT IN ('nome', 'mencao', 'quote') THEN
    RAISE EXCEPTION 'Use o texto próprio de uma mensagem autenticada.' USING ERRCODE = '42501';
  END IF;
  -- Somente o corpo próprio atual; reply_to_id/quotedMessage nunca fornecem intenção.
  v_texto := regexp_replace(msg.conteudo, '^\[[^\]\r\n]{1,100}\] ', '');
  IF nullif(btrim(v_texto), '') IS NULL OR encode(extensions.digest(convert_to(v_texto, 'UTF8'), 'sha256'), 'hex') IS DISTINCT FROM p.entrada_texto_sha256 THEN
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
    IF cfg.agente_grupos IS NOT TRUE OR p.gatilho NOT IN ('nome', 'mencao', 'quote')
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
  -- Confirmação mantém mensagem nova, sozinha e sem citação. O helper acima
  -- aceita resposta citada apenas para ler intenção própria/preparar proposta.
  IF p.gatilho NOT IN ('nome', 'mencao') OR EXISTS (
    SELECT 1 FROM public.chat_messages WHERE id = p.chat_message_id
      AND tenant_id = p.tenant_id AND reply_to_id IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'confirmacao_invalida',
      'erro', 'Envie a confirmação sozinha em uma nova mensagem sem citação.');
  END IF;
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

