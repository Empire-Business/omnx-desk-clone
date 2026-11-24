-- PREPARADA, NÃO EXECUTADA. Sem backfill, seed, novo schema ou mudança de RLS.
-- Cada mensagem nova do cliente pode originar um único ticket. A IA não decide
-- baixas: só ação manual ou mensagem textual exata da equipe com código DEM.
-- A memória acompanha a baixa na próxima análise; nenhuma escrita bidirecional
-- em cliente_relacionamento é feita aqui (evita inversão de locks).

ALTER TABLE public.atendimento_demandas
  ADD COLUMN wa_origem_mensagem_id uuid,
  ADD COLUMN wa_ultima_analise timestamptz,
  ADD COLUMN wa_resolucao_mensagem_id uuid,
  ADD COLUMN wa_resolvida_manualmente boolean NOT NULL DEFAULT false,
  ADD COLUMN wa_reaberta_em timestamptz,
  ADD CONSTRAINT atendimento_demanda_wa_origem_unique
    UNIQUE (tenant_id, cliente_id, wa_origem_mensagem_id);

COMMENT ON COLUMN public.atendimento_demandas.wa_origem_mensagem_id IS
  'Identidade persistente da solicitação: mensagem real de canal confirmado. Sem FK destrutiva; preserva rastreio após retenção de mensagens.';

-- Conteúdo/horário/conversa do Chat são editáveis. Autoria sozinha não atesta
-- um comando. Guardar a entrada no INSERT do webhook; nunca fazer backfill.
CREATE TABLE private.atendimento_wa_entradas (
  mensagem_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  instance_id uuid NOT NULL,
  canal_tipo text NOT NULL,
  canal_chave text NOT NULL,
  criado_em timestamptz NOT NULL,
  autor_tipo text NOT NULL CHECK (autor_tipo IN ('cliente', 'equipe')),
  autor_user_id uuid,
  texto_sha256 text NOT NULL,
  atestada_em timestamptz,
  ocorrido_em timestamptz,
  registrado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.atendimento_wa_entradas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.atendimento_wa_entradas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON private.atendimento_wa_entradas TO service_role;

CREATE FUNCTION private.atendimento_wa_capturar_entrada()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user = 'service_role' AND auth.uid() IS NULL
     AND NEW.autor_origem = 'webhook' AND NEW.autor_tipo IN ('cliente', 'equipe')
     AND NEW.enviado_por_agente IS NOT TRUE AND NEW.enviado_por_ia IS NOT TRUE
     AND NEW.reply_to_id IS NULL AND NEW.conteudo IS NOT NULL
     AND NEW.tipo IN ('texto', 'text', 'chat') THEN
    INSERT INTO private.atendimento_wa_entradas
      (mensagem_id, tenant_id, conversation_id, contact_id, instance_id, canal_tipo, canal_chave,
       criado_em, autor_tipo, autor_user_id, texto_sha256)
    SELECT NEW.id, NEW.tenant_id, NEW.conversation_id, ct.id, ct.instance_id,
      private.canal_tipo(ct.numero_whatsapp, ct.group_size), private.canal_chave(ct.numero_whatsapp, ct.group_size),
      NEW.criado_em, NEW.autor_tipo, NEW.autor_user_id,
      encode(extensions.digest(convert_to(NEW.conteudo, 'UTF8'), 'sha256'), 'hex')
    FROM public.chat_conversations cv JOIN public.chat_contacts ct ON ct.id = cv.contact_id
      AND ct.tenant_id = NEW.tenant_id AND ct.instance_id = cv.instance_id
    WHERE cv.id = NEW.conversation_id AND cv.tenant_id = NEW.tenant_id
      AND private.canal_tipo(ct.numero_whatsapp, ct.group_size) IS NOT NULL
      AND private.canal_chave(ct.numero_whatsapp, ct.group_size) IS NOT NULL
    ON CONFLICT (mensagem_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.atendimento_wa_capturar_entrada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.atendimento_wa_capturar_entrada() TO service_role;
CREATE TRIGGER atendimento_wa_capturar_entrada AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION private.atendimento_wa_capturar_entrada();

-- Única escrita privilegiada: confirma o snapshot imutável, comparando o hash
-- enviado pelo handler com o conteúdo ORIGINAL recebido do provider autenticado.
-- A tabela não concede UPDATE ao worker nem qualquer acesso ao navegador.
CREATE FUNCTION public.atendimento_atestar_entrada_whatsapp(
  p_tenant uuid, p_mensagem uuid, p_conversa uuid, p_texto_sha256 text, p_ocorrido_em timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_linhas integer;
BEGIN
  IF auth.uid() IS NOT NULL OR p_texto_sha256 !~ '^[0-9a-f]{64}$' OR p_ocorrido_em IS NULL
    OR p_ocorrido_em < clock_timestamp() - interval '5 minutes'
    OR p_ocorrido_em > clock_timestamp() + interval '1 minute' THEN RETURN false; END IF;
  UPDATE private.atendimento_wa_entradas e
     SET atestada_em = COALESCE(e.atestada_em, clock_timestamp()), ocorrido_em = COALESCE(e.ocorrido_em, p_ocorrido_em)
    FROM public.chat_messages m
   WHERE e.mensagem_id = p_mensagem AND e.tenant_id = p_tenant AND e.conversation_id = p_conversa
     AND (e.atestada_em IS NULL OR e.ocorrido_em = p_ocorrido_em)
     AND e.registrado_em > clock_timestamp() - interval '5 minutes'
     AND e.texto_sha256 = p_texto_sha256
     AND m.id = e.mensagem_id AND m.tenant_id = e.tenant_id AND m.conversation_id = e.conversation_id
     AND m.criado_em = e.criado_em AND m.autor_tipo = e.autor_tipo
     AND m.autor_user_id IS NOT DISTINCT FROM e.autor_user_id
     AND m.autor_origem = 'webhook' AND m.reply_to_id IS NULL
     AND m.enviado_por_agente IS NOT TRUE AND m.enviado_por_ia IS NOT TRUE
     AND encode(extensions.digest(convert_to(m.conteudo, 'UTF8'), 'sha256'), 'hex') = p_texto_sha256;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.atendimento_atestar_entrada_whatsapp(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atendimento_atestar_entrada_whatsapp(uuid, uuid, uuid, text, timestamptz) TO service_role;

-- SECURITY INVOKER, exclusiva do worker. Usa somente canais CONFIRMADOS,
-- exclui internos/restritos e canais ambíguos entre clientes. Não infere equipe
-- por from_me/enviado_por_agente nem pelo prefixo/nome exibido no grupo.
CREATE FUNCTION private.atendimento_mensagem_cliente(p_tenant uuid, p_cliente uuid, p_mensagem uuid)
RETURNS TABLE (id uuid, criado_em timestamptz, autor_tipo text, tipo text, conteudo text, conversation_id uuid, autor_user_id uuid,
  ocorrido_em timestamptz, atestada_em timestamptz, registrado_em timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT m.id, m.criado_em, m.autor_tipo, m.tipo,
         CASE WHEN c.tipo = 'grupo' THEN regexp_replace(m.conteudo, '^\[[^]\n]{1,80}\] ', '') ELSE m.conteudo END,
         m.conversation_id, m.autor_user_id, original.ocorrido_em, original.atestada_em, original.registrado_em
    FROM public.chat_messages m
    JOIN private.atendimento_wa_entradas original ON original.mensagem_id = m.id
      AND original.tenant_id = m.tenant_id AND original.conversation_id = m.conversation_id
      AND original.criado_em = m.criado_em AND original.autor_tipo = m.autor_tipo
      AND original.autor_user_id IS NOT DISTINCT FROM m.autor_user_id
      AND original.texto_sha256 = encode(extensions.digest(convert_to(m.conteudo, 'UTF8'), 'sha256'), 'hex')
      -- Retornar também a prontidão: o intervalo INSERT→atestação não pode ser
      -- confundido com fonte inválida, pois o sucesso avançaria o cursor.
    JOIN public.chat_conversations cv ON cv.id = m.conversation_id AND cv.tenant_id = p_tenant
      AND cv.contact_id = original.contact_id AND cv.instance_id = original.instance_id
    JOIN public.chat_contacts ct ON ct.id = cv.contact_id AND ct.tenant_id = p_tenant
      AND ct.instance_id = original.instance_id
      AND private.canal_tipo(ct.numero_whatsapp, ct.group_size) = original.canal_tipo
      AND private.canal_chave(ct.numero_whatsapp, ct.group_size) = original.canal_chave
    JOIN public.cliente_canais c ON c.tenant_id = p_tenant AND c.client_id = p_cliente
      AND c.status = 'confirmado'
      AND c.tipo = private.canal_tipo(ct.numero_whatsapp, ct.group_size)
      AND c.chave = private.canal_chave(ct.numero_whatsapp, ct.group_size)
   WHERE m.id = p_mensagem AND m.tenant_id = p_tenant
     AND m.autor_origem = 'webhook' AND m.reply_to_id IS NULL
     AND m.enviado_por_agente IS NOT TRUE AND m.enviado_por_ia IS NOT TRUE
     AND NOT ct.restrito_admin
     AND NOT private.cliente_canal_excluido(p_tenant, c.tipo, c.chave)
     AND NOT EXISTS (SELECT 1 FROM public.cliente_canais outro
       WHERE outro.tenant_id = p_tenant AND outro.tipo = c.tipo AND outro.chave = c.chave
         AND outro.status = 'confirmado' AND outro.client_id IS DISTINCT FROM p_cliente)
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.atendimento_mensagem_cliente(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.atendimento_mensagem_cliente(uuid, uuid, uuid) TO service_role;
-- Dependência privada já existente: a ponte invoker precisa executar a mesma
-- exclusão de canais que a timeline usa. Nenhuma concessão ao navegador.
GRANT EXECUTE ON FUNCTION private.cliente_canal_excluido(uuid, text, text) TO service_role;

-- O operador pode trabalhar o ticket pela RLS existente, mas não fabricar origem
-- nem evidência. Executa depois de atendimento_demanda_touch (ordem alfabética).
CREATE FUNCTION public.tg_atendimento_whatsapp_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_final boolean;
BEGIN
  IF current_user <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.wa_origem_mensagem_id IS NOT NULL OR NEW.wa_ultima_analise IS NOT NULL
         OR NEW.wa_resolucao_mensagem_id IS NOT NULL OR NEW.wa_resolvida_manualmente
         OR NEW.wa_reaberta_em IS NOT NULL THEN
        RAISE EXCEPTION 'Origem WhatsApp é registrada somente pelo processamento autorizado.' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF ROW(NEW.wa_origem_mensagem_id, NEW.wa_ultima_analise, NEW.wa_resolucao_mensagem_id,
             NEW.wa_resolvida_manualmente, NEW.wa_reaberta_em)
         IS DISTINCT FROM ROW(OLD.wa_origem_mensagem_id, OLD.wa_ultima_analise, OLD.wa_resolucao_mensagem_id,
             OLD.wa_resolvida_manualmente, OLD.wa_reaberta_em) THEN
        RAISE EXCEPTION 'Metadados de sincronização não são editáveis.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  IF NEW.wa_origem_mensagem_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.cliente_id AND c.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Cliente não pertence à empresa do ticket.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND ROW(NEW.cliente_id, NEW.tenant_id, NEW.wa_origem_mensagem_id)
      IS DISTINCT FROM ROW(OLD.cliente_id, OLD.tenant_id, OLD.wa_origem_mensagem_id) THEN
    RAISE EXCEPTION 'O vínculo de origem do ticket é imutável.' USING ERRCODE = '23514';
  END IF;
  IF NEW.etapa_id IS NOT NULL THEN
    SELECT e.is_final INTO v_final FROM public.atendimento_etapas e WHERE e.id = NEW.etapa_id AND e.tenant_id = NEW.tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Etapa não pertence à empresa do ticket.' USING ERRCODE = '23514'; END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND current_user <> 'service_role' THEN
    -- Conclusão é derivada da etapa; um PATCH em concluida_em não forja baixa.
    IF NEW.etapa_id IS NOT DISTINCT FROM OLD.etapa_id THEN
      NEW.concluida_em := OLD.concluida_em;
    ELSIF COALESCE(v_final, false) THEN
      NEW.wa_resolvida_manualmente := true;
      NEW.wa_resolucao_mensagem_id := NULL;
    ELSIF OLD.concluida_em IS NOT NULL THEN
      NEW.wa_resolvida_manualmente := false;
      NEW.wa_resolucao_mensagem_id := NULL;
      NEW.wa_reaberta_em := clock_timestamp();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_atendimento_whatsapp_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER atendimento_whatsapp_guard BEFORE INSERT OR UPDATE ON public.atendimento_demandas
  FOR EACH ROW EXECUTE FUNCTION public.tg_atendimento_whatsapp_guard();

CREATE FUNCTION public.atendimento_sincronizar_whatsapp(
  p_tenant uuid, p_cliente uuid, p_pendencias jsonb, p_resolucoes uuid[],
  p_anterior_ate timestamptz, p_analisado_ate timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  p jsonb; v_origem uuid; v_msg uuid; m record; d public.atendimento_demandas%ROWTYPE;
  v_aberta uuid; v_final uuid; v_codigo text; v_saida jsonb := '[]'::jsonb;
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'Worker autorizado obrigatório.' USING ERRCODE = '42501'; END IF;
  IF p_tenant IS NULL OR p_cliente IS NULL OR p_anterior_ate IS NULL
    OR p_analisado_ate IS NULL OR p_analisado_ate < p_anterior_ate
    OR p_analisado_ate > now() + interval '5 minutes'
    OR jsonb_typeof(p_pendencias) IS DISTINCT FROM 'array' OR jsonb_array_length(p_pendencias) > 5
    OR octet_length(p_pendencias::text) > 10000 OR COALESCE(cardinality(p_resolucoes), 0) > 2000 THEN
    RAISE EXCEPTION 'Entrada de sincronização inválida.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_cliente AND c.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'Cliente não pertence à empresa.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_modules WHERE tenant_id = p_tenant AND slug = 'atendimento' AND enabled IS FALSE) THEN
    RETURN jsonb_build_object('desativado', true);
  END IF;
  -- Mesmo cliente: serializa workers. A edição manual só trava sua demanda;
  -- este procedimento não escreve na memória e não cria ordem inversa de locks.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant::text || ':' || p_cliente::text, 0));
  SELECT id INTO v_aberta FROM public.atendimento_etapas WHERE tenant_id = p_tenant AND NOT is_final ORDER BY ordem, id LIMIT 1;
  SELECT id INTO v_final FROM public.atendimento_etapas WHERE tenant_id = p_tenant AND is_final ORDER BY ordem, id LIMIT 1;
  IF v_aberta IS NULL OR v_final IS NULL THEN
    RAISE EXCEPTION 'Configure etapas aberta e final antes de sincronizar tickets.' USING ERRCODE = '23514';
  END IF;

  FOR p IN SELECT value FROM jsonb_array_elements(p_pendencias) ORDER BY value->>'ticket_origem' LOOP
    IF p->>'ticket_origem' IS NULL THEN CONTINUE; END IF;
    IF p->>'ticket_origem' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR p->>'status' NOT IN ('aberta', 'em_andamento', 'resolvida')
      OR NULLIF(btrim(p->>'tema_curto'), '') IS NULL OR length(p->>'tema_curto') > 200 THEN
      RAISE EXCEPTION 'Pendência inválida.' USING ERRCODE = '22023';
    END IF;
    v_origem := (p->>'ticket_origem')::uuid;
    SELECT * INTO d FROM public.atendimento_demandas WHERE tenant_id = p_tenant AND cliente_id = p_cliente
      AND wa_origem_mensagem_id = v_origem FOR UPDATE;
    IF NOT FOUND THEN
      SELECT * INTO m FROM private.atendimento_mensagem_cliente(p_tenant, p_cliente, v_origem);
      IF NOT FOUND OR m.autor_tipo IS DISTINCT FROM 'cliente' OR m.criado_em <= p_anterior_ate OR m.criado_em > p_analisado_ate THEN
        CONTINUE; -- fonte antiga/inválida: não criar; a memória antiga permanece útil
      END IF;
      IF m.atestada_em IS NULL OR m.ocorrido_em IS NULL THEN
        IF m.registrado_em > clock_timestamp() - interval '5 minutes' THEN
          -- Atestação ainda pode chegar/repetir. Abortar TODA a sincronização
          -- conserva o cursor no analisador; nenhum ticket parcial é confirmado.
          RAISE EXCEPTION 'Entrada WhatsApp aguardando atestação.' USING ERRCODE = '55P03';
        END IF;
        CONTINUE; -- janela encerrada: sem prova não cria e não adia indefinidamente
      END IF;
      INSERT INTO public.atendimento_demandas (tenant_id, cliente_id, etapa_id, titulo, descricao, wa_origem_mensagem_id, wa_ultima_analise)
        VALUES (p_tenant, p_cliente, v_aberta, p->>'tema_curto', 'Solicitação identificada em mensagem do cliente no WhatsApp.', v_origem, p_analisado_ate)
        ON CONFLICT ON CONSTRAINT atendimento_demanda_wa_origem_unique DO NOTHING;
    END IF;
    UPDATE public.atendimento_demandas SET wa_ultima_analise = greatest(wa_ultima_analise, p_analisado_ate)
      WHERE tenant_id = p_tenant AND cliente_id = p_cliente AND wa_origem_mensagem_id = v_origem;
    -- Nunca sobrescrever título, dono, prazo ou etapa de trabalho definida pela equipe.
  END LOOP;

  FOREACH v_msg IN ARRAY COALESCE(p_resolucoes, ARRAY[]::uuid[]) LOOP
    SELECT * INTO m FROM private.atendimento_mensagem_cliente(p_tenant, p_cliente, v_msg);
    IF NOT FOUND OR m.autor_tipo IS DISTINCT FROM 'equipe' OR COALESCE(m.tipo, '') NOT IN ('texto', 'text', 'chat', '')
      OR m.criado_em <= p_anterior_ate OR m.criado_em > p_analisado_ate
      OR btrim(m.conteudo) !~* '^resolvido[[:space:]]+DEM-[0-9]{5,}[.!]?$' THEN CONTINUE; END IF;
    -- Nome, eco e autoria heurística não autorizam a baixa. A pessoa identificada
    -- precisa continuar ativa nesta empresa e poder editar atendimento agora.
    IF m.autor_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u
      WHERE u.id = m.autor_user_id AND u.tenant_id = p_tenant AND u.ativo IS TRUE AND u.perfil IS DISTINCT FROM 'cliente')
      OR NOT COALESCE(public.has_permissao_de(m.autor_user_id, 'atendimento', 'editar'), false) THEN CONTINUE; END IF;
    v_codigo := upper(substring(btrim(m.conteudo) FROM '(?i)DEM-[0-9]{5,}'));
    SELECT * INTO d FROM public.atendimento_demandas WHERE tenant_id = p_tenant AND cliente_id = p_cliente
      AND codigo = v_codigo AND wa_origem_mensagem_id IS NOT NULL FOR UPDATE;
    IF NOT FOUND OR d.concluida_em IS NOT NULL OR (d.wa_reaberta_em IS NOT NULL AND m.ocorrido_em <= d.wa_reaberta_em) THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM private.atendimento_wa_entradas origem
      WHERE origem.mensagem_id = d.wa_origem_mensagem_id AND origem.tenant_id = p_tenant
        AND origem.conversation_id = m.conversation_id) THEN CONTINUE; END IF;
    IF m.atestada_em IS NULL OR m.ocorrido_em IS NULL THEN
      IF m.registrado_em > clock_timestamp() - interval '5 minutes' THEN
        RAISE EXCEPTION 'Comando WhatsApp aguardando atestação.' USING ERRCODE = '55P03';
      END IF;
      CONTINUE; -- nunca resolver sem prova, inclusive após expirar a espera
    END IF;
    UPDATE public.atendimento_demandas SET etapa_id = v_final, wa_resolucao_mensagem_id = v_msg,
      wa_ultima_analise = greatest(wa_ultima_analise, p_analisado_ate)
      WHERE id = d.id AND tenant_id = p_tenant;
  END LOOP;

  -- Ausência no top-5 nunca encerra demanda; memória ligada segue o ticket.
  FOR p IN SELECT value FROM jsonb_array_elements(p_pendencias) LOOP
    IF p->>'ticket_origem' IS NOT NULL THEN
      SELECT * INTO d FROM public.atendimento_demandas WHERE tenant_id = p_tenant AND cliente_id = p_cliente
        AND wa_origem_mensagem_id = (p->>'ticket_origem')::uuid;
      IF FOUND THEN
        p := jsonb_set(p, '{status}', to_jsonb(CASE WHEN d.concluida_em IS NOT NULL THEN 'resolvida'::text
          WHEN p->>'status' = 'em_andamento' THEN 'em_andamento' ELSE 'aberta' END));
        IF d.concluida_em IS NOT NULL THEN p := p - 'criticidade'; END IF;
      ELSE p := p - 'ticket_origem'; END IF;
    END IF;
    v_saida := v_saida || jsonb_build_array(p - 'origem_ref');
  END LOOP;
  RETURN jsonb_build_object('pendencias', v_saida);
END;
$$;
REVOKE ALL ON FUNCTION public.atendimento_sincronizar_whatsapp(uuid, uuid, jsonb, uuid[], timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atendimento_sincronizar_whatsapp(uuid, uuid, jsonb, uuid[], timestamptz, timestamptz) TO service_role;
