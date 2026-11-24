-- MIGRATION LOCAL PREPARADA, 28/10/2026. NÃO EXECUTADA.
-- Dependências: agente_base 20261027090000, chat_autoria 20261027120000,
-- tenant_id em todas as fontes; extensions.unaccent já usado pelo projeto.
-- pgcrypto no schema extensions, digest(bytea,text), confirmado via catálogo.
-- Somente objetos novos. Sem SET ROLE/claims ou impersonação de auth.uid().
-- Garantia pontual: verifica/serializa os registros existentes nesta transação.
-- Outros escritores podem criar/reabrir contrato após o commit. Este núcleo
-- NÃO impõe invariante global aos demais escritores de contratos.
-- Encaminhamento não tem flag persistida nas fontes atuais: o adapter deve
-- recusar se conhecido e não afirmar que sua ausência foi provada pelo SQL.
-- Confirmação não usa lerPergunta, histórico, áudio, quote ou texto do modelo.
-- ROLLOUT: primeiro adicionar colunas, depois publicar produtor autenticado e
-- consumidor. Pedidos antigos/sem digest ficam inelegíveis (sem fallback).
-- Produtor só carimba tipo texto, sem quotedId/gatilho quote, não-fromMe/API e
-- sem encaminhamento conhecido. Presença do hash atesta elegibilidade original.
BEGIN;

ALTER TABLE public.wa_agente_pedidos
  ADD COLUMN entrada_texto_sha256 text CHECK (entrada_texto_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN entrada_encaminhada boolean;
COMMENT ON COLUMN public.wa_agente_pedidos.entrada_texto_sha256 IS
  'SHA-256 UTF-8 hexadecimal lowercase do ctx.conteudo original sem prefixo de autor. Produtor autenticado só preenche para texto original elegível sem quote/reply; nunca calcular da linha editável de chat_messages. NULL recusa ações.';
COMMENT ON COLUMN public.wa_agente_pedidos.entrada_encaminhada IS
  'Somente indicador do payload autenticado: true recusa ações; null significa fonte sem informação, não prova ausência de encaminhamento.';
-- Preserva política da fila: sem leitura/escrita pelo navegador.
REVOKE ALL ON TABLE public.wa_agente_pedidos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wa_agente_pedidos TO service_role;

CREATE TABLE public.wa_agente_acoes_propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  membro_id uuid NOT NULL,
  instance_uuid uuid NOT NULL,
  chat_jid text NOT NULL CHECK (length(chat_jid) BETWEEN 1 AND 100),
  eh_grupo boolean NOT NULL CHECK (eh_grupo IS TRUE),
  remetente_chave text NOT NULL CHECK (length(remetente_chave) BETWEEN 10 AND 15),
  pedido_origem_id uuid NOT NULL UNIQUE,
  mensagem_origem_id uuid NOT NULL,
  origem_criada_em timestamptz NOT NULL,
  acao text NOT NULL CHECK (acao IN ('cliente_ativo', 'vincular_contrato_cliente')),
  alvo uuid NOT NULL,
  novo jsonb NOT NULL CHECK (jsonb_typeof(novo) = 'object'),
  esperado jsonb NOT NULL CHECK (jsonb_typeof(esperado) = 'object'),
  previa jsonb NOT NULL CHECK (jsonb_typeof(previa) = 'object'),
  codigo text NOT NULL CHECK (codigo ~ '^[0-9A-F]{8}$'),
  criada_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  expira_em timestamptz NOT NULL,
  estado text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'executada', 'expirada', 'obsoleta')),
  pedido_confirmacao_id uuid UNIQUE,
  recibo jsonb,
  CHECK (expira_em > criada_em AND expira_em <= criada_em + interval '5 minutes'),
  CHECK ((estado = 'executada' AND recibo IS NOT NULL AND pedido_confirmacao_id IS NOT NULL)
    OR (estado <> 'executada' AND recibo IS NULL AND pedido_confirmacao_id IS NULL)),
  UNIQUE (tenant_id, user_id, instance_uuid, chat_jid, codigo)
);
COMMENT ON TABLE public.wa_agente_acoes_propostas IS
  'Proposta/recibo transacional de duas ações de chat. IDs de auditoria são snapshots sem ON DELETE CASCADE da fila, que expira em 30 dias. Acesso exclusivo service_role.';
CREATE INDEX wa_agente_acoes_pendentes ON public.wa_agente_acoes_propostas (tenant_id, expira_em) WHERE estado = 'pendente';
ALTER TABLE public.wa_agente_acoes_propostas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wa_agente_acoes_propostas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.wa_agente_acoes_propostas TO service_role;

CREATE FUNCTION private.wa_agente_acoes_nome(p_nome text)
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $f$
  SELECT btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_nome, ''))), '\s+', ' ', 'g'))
$f$;
REVOKE ALL ON FUNCTION private.wa_agente_acoes_nome(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.wa_agente_acoes_nome(text) TO service_role;

-- Não recebe tenant, ator, telefone ou grupo do caller. Fila e mensagem são
-- originadas pelo webhook autenticado. Locks preservam config/membro atuais
-- durante a RPC. p_exigir_lock=false só permite releitura de recibo já concluído.
CREATE FUNCTION private.wa_agente_acoes_pedido(p_pedido uuid, p_exigir_lock boolean)
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
    WHERE id = p.chat_message_id AND tenant_id = p.tenant_id AND conversation_id = p.conversation_id
      AND message_id_wpp = p.message_id_wpp FOR SHARE;
  IF NOT FOUND OR msg.tipo IS DISTINCT FROM 'texto' OR msg.reply_to_id IS NOT NULL
     OR msg.enviado_por_agente IS TRUE OR msg.enviado_por_ia IS TRUE
     OR msg.autor_tipo IS DISTINCT FROM 'equipe' OR msg.autor_origem IS DISTINCT FROM 'webhook'
     OR msg.autor_user_id IS DISTINCT FROM p.user_id OR msg.autor_chave IS DISTINCT FROM p.remetente_chave
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
    IF lower(btrim(ct.numero_whatsapp)) NOT IN (v_base, p.chat_jid) OR EXISTS (
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
REVOKE ALL ON FUNCTION private.wa_agente_acoes_pedido(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.wa_agente_acoes_pedido(uuid, boolean) TO service_role;

-- Estado mínimo autorizado. Locks: cliente destino primeiro; contratos em UUID.
-- Rascunho, pausado, status ausente/desconhecido contam como NÃO encerrados.
-- Prazo do plano não desativa contrato: não se inventa encerramento por data.
CREATE FUNCTION private.wa_agente_acoes_estado(p public.wa_agente_pedidos, p_acao text, p_alvo uuid, p_novo jsonb)
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
REVOKE ALL ON FUNCTION private.wa_agente_acoes_estado(public.wa_agente_pedidos, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.wa_agente_acoes_estado(public.wa_agente_pedidos, text, uuid, jsonb) TO service_role;

CREATE FUNCTION public.wa_agente_acoes_propor(p_pedido uuid, p_acao text, p_alvo uuid, p_novo jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
SET lock_timeout = '3s' SET statement_timeout = '8s'
AS $f$
DECLARE
  p public.wa_agente_pedidos%ROWTYPE;
  v public.wa_agente_acoes_propostas%ROWTYPE;
  v_estado jsonb;
  v_agora timestamptz;
BEGIN
  p := private.wa_agente_acoes_pedido(p_pedido, true);
  -- Uma proposta por mensagem; repetir com outro payload nunca muda a proposta.
  PERFORM pg_advisory_xact_lock(hashtextextended('wa-acoes:' || p.tenant_id || ':' || p.user_id || ':' || p.chat_jid, 0));
  SELECT * INTO v FROM public.wa_agente_acoes_propostas WHERE pedido_origem_id = p.id FOR UPDATE;
  IF FOUND THEN
    IF v.acao IS DISTINCT FROM p_acao OR v.alvo IS DISTINCT FROM p_alvo OR v.novo IS DISTINCT FROM p_novo THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'pedido_reutilizado', 'erro', 'Este pedido já possui outra proposta.');
    END IF;
    IF v.estado <> 'pendente' OR v.expira_em <= clock_timestamp() THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'proposta_indisponivel', 'erro', 'Solicite uma nova proposta em outra mensagem.');
    END IF;
    -- Revalida autorização e estado atual também no retry da criação.
    v_estado := private.wa_agente_acoes_estado(p, v.acao, v.alvo, v.novo);
    IF v_estado -> 'esperado' IS DISTINCT FROM v.esperado THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'estado_alterado', 'erro', 'O registro mudou. Solicite nova proposta.');
    END IF;
  ELSE
    v_estado := private.wa_agente_acoes_estado(p, p_acao, p_alvo, p_novo);
    v_agora := clock_timestamp();
    IF p.lock_ate <= v_agora THEN RAISE EXCEPTION 'Processamento expirado.' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.wa_agente_acoes_propostas (tenant_id, user_id, membro_id, instance_uuid, chat_jid, eh_grupo,
      remetente_chave, pedido_origem_id, mensagem_origem_id, origem_criada_em, acao, alvo, novo, esperado, previa, codigo, criada_em, expira_em)
      VALUES (p.tenant_id, p.user_id, p.membro_id, p.instance_uuid, p.chat_jid, p.eh_grupo, p.remetente_chave,
        p.id, p.chat_message_id, p.created_at, p_acao, p_alvo, p_novo, v_estado -> 'esperado', v_estado -> 'previa',
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), v_agora, v_agora + interval '5 minutes') RETURNING * INTO v;
  END IF;
  IF p.lock_ate <= clock_timestamp() THEN RAISE EXCEPTION 'Processamento expirado.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('ok', true, 'proposta_id', v.id, 'codigo', v.codigo, 'expira_em', v.expira_em, 'previa', v.previa);
END;
$f$;
REVOKE ALL ON FUNCTION public.wa_agente_acoes_propor(uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_agente_acoes_propor(uuid, text, uuid, jsonb) TO service_role;

CREATE FUNCTION public.wa_agente_acoes_confirmar(p_pedido uuid, p_codigo text)
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
  IF NOT coalesce(public.has_permissao_de(p.user_id, CASE v.acao WHEN 'cliente_ativo' THEN 'clientes' ELSE 'contratos' END, 'editar'), false) THEN
    RAISE EXCEPTION 'Sem permissão atual para esta operação.' USING ERRCODE = '42501';
  END IF;
  SELECT total, client_ids INTO v_total, v_ids FROM public.wa_agente_escopo(p.tenant_id, p.user_id);
  v_cliente := CASE v.acao WHEN 'cliente_ativo' THEN v.alvo ELSE (v.novo ->> 'cliente_id')::uuid END;
  IF v_total IS NOT TRUE AND (NOT (v_cliente = ANY(coalesce(v_ids, '{}'::uuid[])))
    OR (v.acao = 'vincular_contrato_cliente' AND NOT EXISTS (
      SELECT 1 FROM public.contratos WHERE id = v.alvo AND tenant_id = p.tenant_id AND estrategista_id = p.user_id
    ))) THEN RAISE EXCEPTION 'Registro fora da carteira autorizada.' USING ERRCODE = '42501'; END IF;
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
  IF v.acao = 'cliente_ativo' THEN
    UPDATE public.clients SET ativo = (v.novo ->> 'ativo')::boolean
      WHERE id = v.alvo AND tenant_id = p.tenant_id
        AND atualizado_em = (v.esperado ->> 'atualizado_em')::timestamptz
        AND ativo IS NOT DISTINCT FROM (v.esperado ->> 'ativo')::boolean;
  ELSE
    -- Exclusivamente a FK. Não reescreve snapshot, status, financeiro ou formulário.
    UPDATE public.contratos SET cliente_id = (v.novo ->> 'cliente_id')::uuid
      WHERE id = v.alvo AND tenant_id = p.tenant_id AND cliente_id IS NULL
        AND atualizado_em = (v.esperado ->> 'atualizado_em')::timestamptz;
  END IF;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas <> 1 THEN RAISE EXCEPTION 'O registro mudou; nenhuma ação confirmada.' USING ERRCODE = '40001'; END IF;
  IF v.expira_em <= clock_timestamp() OR p.lock_ate <= clock_timestamp() THEN
    RAISE EXCEPTION 'Processamento expirado; nenhuma ação confirmada.' USING ERRCODE = '42501';
  END IF;
  v_recibo := jsonb_build_object('proposta_id', v.id, 'pedido_confirmacao_id', p.id,
    'executada_em', clock_timestamp(), 'estado', 'executada', 'previa', v.previa);
  UPDATE public.wa_agente_acoes_propostas SET estado = 'executada', pedido_confirmacao_id = p.id, recibo = v_recibo WHERE id = v.id;
  RETURN jsonb_build_object('ok', true, 'repetida', false, 'recibo', v_recibo);
END;
$f$;
REVOKE ALL ON FUNCTION public.wa_agente_acoes_confirmar(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_agente_acoes_confirmar(uuid, text) TO service_role;

COMMIT;
-- Migration preparada e revisada estaticamente; execução e validação em banco não realizadas.
