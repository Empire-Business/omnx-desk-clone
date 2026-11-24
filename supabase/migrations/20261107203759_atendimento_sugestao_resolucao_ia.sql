-- Fila "Para confirmar" da resolução automática (decisão do dono, 07/11/2026).
-- A Íris fecha sozinha só quando tem certeza (20261106190452). Com sinal de
-- solução SEM certeza, grava aqui uma SUGESTÃO: a etapa não muda e uma pessoa
-- com permissão de edição confirma (resolve pelo caminho normal) ou recusa
-- (limpa a sugestão). Delta aditivo; não altera as RPCs nem os recibos anteriores.

ALTER TABLE public.atendimento_demandas
  ADD COLUMN wa_sugestao_em timestamptz,
  ADD COLUMN wa_sugestao_razao text CHECK (wa_sugestao_razao IS NULL OR wa_sugestao_razao IN
    ('confianca_media','vinculo_ambiguo','so_equipe','generica_ambigua','evidencia_compartilhada','pedido_cliente')),
  ADD COLUMN wa_sugestao_motivo text CHECK (wa_sugestao_motivo IS NULL OR length(wa_sugestao_motivo) BETWEEN 12 AND 180),
  ADD COLUMN wa_sugestao_confianca numeric(4,3) CHECK (wa_sugestao_confianca IS NULL OR wa_sugestao_confianca BETWEEN 0.6 AND 1),
  ADD COLUMN wa_sugestao_evidencias uuid[] NOT NULL DEFAULT '{}'::uuid[] CHECK (cardinality(wa_sugestao_evidencias) <= 3),
  ADD COLUMN wa_sugestao_modelo text CHECK (wa_sugestao_modelo IS NULL OR length(wa_sugestao_modelo) BETWEEN 1 AND 100),
  ADD COLUMN wa_sugestao_versao text CHECK (wa_sugestao_versao IS NULL OR length(wa_sugestao_versao) BETWEEN 1 AND 100),
  -- Tudo ou nada: nunca uma sugestão pela metade.
  ADD CONSTRAINT atendimento_demandas_wa_sugestao_coerente CHECK (
    (wa_sugestao_em IS NULL AND wa_sugestao_razao IS NULL AND wa_sugestao_motivo IS NULL AND wa_sugestao_confianca IS NULL
      AND cardinality(wa_sugestao_evidencias) = 0 AND wa_sugestao_modelo IS NULL AND wa_sugestao_versao IS NULL)
    OR (wa_sugestao_em IS NOT NULL AND wa_sugestao_razao IS NOT NULL AND wa_sugestao_motivo IS NOT NULL
      AND wa_sugestao_confianca IS NOT NULL AND cardinality(wa_sugestao_evidencias) BETWEEN 1 AND 3
      AND wa_sugestao_modelo IS NOT NULL AND wa_sugestao_versao IS NOT NULL));

CREATE INDEX atendimento_demandas_wa_sugestao_abertas
  ON public.atendimento_demandas(tenant_id, wa_sugestao_em) WHERE wa_sugestao_em IS NOT NULL;

-- A pessoa pode só RECUSAR (limpar). Criar ou editar sugestão é exclusivo do
-- worker. Mudança de etapa (resolver, reabrir, mover) encerra a sugestão.
-- Roda depois de atendimento_whatsapp_guard e atendimento_whatsapp_ia_guard (ordem alfabética).
CREATE FUNCTION public.tg_atendimento_whatsapp_sugestao_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user <> 'service_role' AND (NEW.wa_sugestao_em IS NOT NULL OR cardinality(NEW.wa_sugestao_evidencias) <> 0) THEN
      RAISE EXCEPTION 'Sugestão automática não pode ser fabricada.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id AND OLD.wa_sugestao_em IS NOT NULL
     AND NEW.wa_sugestao_em IS NOT DISTINCT FROM OLD.wa_sugestao_em THEN
    NEW.wa_sugestao_em := NULL; NEW.wa_sugestao_razao := NULL; NEW.wa_sugestao_motivo := NULL;
    NEW.wa_sugestao_confianca := NULL; NEW.wa_sugestao_evidencias := '{}'::uuid[];
    NEW.wa_sugestao_modelo := NULL; NEW.wa_sugestao_versao := NULL;
  END IF;
  IF current_user <> 'service_role' AND NEW.wa_sugestao_em IS NOT NULL
     AND ROW(NEW.wa_sugestao_em, NEW.wa_sugestao_razao, NEW.wa_sugestao_motivo, NEW.wa_sugestao_confianca,
             NEW.wa_sugestao_evidencias, NEW.wa_sugestao_modelo, NEW.wa_sugestao_versao)
     IS DISTINCT FROM ROW(OLD.wa_sugestao_em, OLD.wa_sugestao_razao, OLD.wa_sugestao_motivo, OLD.wa_sugestao_confianca,
             OLD.wa_sugestao_evidencias, OLD.wa_sugestao_modelo, OLD.wa_sugestao_versao) THEN
    RAISE EXCEPTION 'Sugestão automática não é editável; só pode ser recusada.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_atendimento_whatsapp_sugestao_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER atendimento_whatsapp_sugestao_guard BEFORE INSERT OR UPDATE ON public.atendimento_demandas
  FOR EACH ROW EXECUTE FUNCTION public.tg_atendimento_whatsapp_sugestao_guard();

-- Trilha na ficha (mesmo histórico de etapa/responsável): quem aprovou ou
-- recusou e o que o worker fez. autor_id = auth.uid() (nulo para o worker).
-- Mede a calibragem: quantas sugestões as pessoas aprovam.
CREATE FUNCTION public.tg_atendimento_whatsapp_sugestao_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_final boolean; v_valor text;
BEGIN
  IF NEW.wa_sugestao_em IS NOT DISTINCT FROM OLD.wa_sugestao_em THEN RETURN NEW; END IF;
  IF OLD.wa_sugestao_em IS NULL THEN
    v_valor := 'sugerida';
  ELSIF NEW.wa_sugestao_em IS NOT NULL THEN
    v_valor := 'substituida';
  ELSE
    SELECT e.is_final INTO v_final FROM public.atendimento_etapas e WHERE e.id = NEW.etapa_id AND e.tenant_id = NEW.tenant_id;
    IF NEW.etapa_id IS NOT DISTINCT FROM OLD.etapa_id THEN v_valor := 'recusada';
    ELSIF COALESCE(v_final, false) AND auth.uid() IS NOT NULL THEN v_valor := 'aprovada';
    ELSIF COALESCE(v_final, false) THEN v_valor := 'resolvida pela Íris';
    ELSE v_valor := 'descartada';
    END IF;
  END IF;
  INSERT INTO public.atendimento_historico (tenant_id, demanda_id, autor_id, campo, valor_de, valor_para)
  VALUES (NEW.tenant_id, NEW.id, auth.uid(), 'sugestao_ia',
    COALESCE(OLD.wa_sugestao_razao, NEW.wa_sugestao_razao), v_valor);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_atendimento_whatsapp_sugestao_historico() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER atendimento_whatsapp_sugestao_historico AFTER UPDATE ON public.atendimento_demandas
  FOR EACH ROW EXECUTE FUNCTION public.tg_atendimento_whatsapp_sugestao_historico();

-- Worker apenas. Revalida no banco tudo o que a IA apontou: ticket aberto do
-- cliente, origem e provas atestadas, mesma conversa, provas depois da origem e
-- da reabertura, trecho literal e autor da equipe ativo. Nada muda de etapa.
CREATE FUNCTION public.atendimento_sugerir_resolucao_ia(p_tenant uuid, p_cliente uuid, p_sugestoes jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  r jsonb; e jsonb; d public.atendimento_demandas%ROWTYPE; origem record; m record;
  v_evidencias uuid[]; v_valida boolean; v_total integer := 0; v_conf numeric; v_motivo text;
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'Worker autorizado obrigatório.' USING ERRCODE = '42501'; END IF;
  IF p_tenant IS NULL OR p_cliente IS NULL OR jsonb_typeof(p_sugestoes) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_sugestoes) > 20 OR octet_length(p_sugestoes::text) > 30000 THEN
    RAISE EXCEPTION 'Sugestões inválidas.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_cliente AND tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'Cliente não pertence à empresa.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_modules WHERE tenant_id = p_tenant AND slug = 'atendimento' AND enabled IS FALSE) THEN
    RETURN 0;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant::text || ':' || p_cliente::text, 0));

  FOR r IN SELECT value FROM jsonb_array_elements(p_sugestoes) LOOP
    IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR COALESCE(r->>'origem_mensagem_id', '') !~ c_uuid
      OR (r->>'ticket_id' IS NOT NULL AND r->>'ticket_id' !~ c_uuid)
      OR jsonb_typeof(r->'confianca') IS DISTINCT FROM 'number'
      OR r->>'razao' IS NULL OR r->>'razao' NOT IN ('confianca_media','vinculo_ambiguo','so_equipe','generica_ambigua','evidencia_compartilhada','pedido_cliente')
      OR jsonb_typeof(r->'evidencias') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'evidencias') NOT BETWEEN 1 AND 3
      OR r->>'modelo' IS NULL OR r->>'modelo' !~ '^anthropic/claude-[a-z0-9.-]{1,40}$'
      OR r->>'versao' IS NULL OR length(r->>'versao') NOT BETWEEN 1 AND 100 THEN CONTINUE; END IF;
    v_conf := (r->>'confianca')::numeric; v_motivo := btrim(r->>'motivo');
    IF v_conf < 0.6 OR v_conf > 1 OR v_motivo IS NULL OR length(v_motivo) NOT BETWEEN 12 AND 180
      OR v_motivo ~ '[@0-9<>]' OR v_motivo ~* '(https?:|www\.|R\$)' THEN CONTINUE; END IF;
    SELECT * INTO d FROM public.atendimento_demandas WHERE tenant_id = p_tenant AND cliente_id = p_cliente
      AND wa_origem_mensagem_id = (r->>'origem_mensagem_id')::uuid FOR UPDATE;
    IF NOT FOUND OR d.concluida_em IS NOT NULL
      OR (r->>'ticket_id' IS NOT NULL AND d.id IS DISTINCT FROM (r->>'ticket_id')::uuid) THEN CONTINUE; END IF;
    SELECT * INTO origem FROM private.atendimento_mensagem_cliente(p_tenant, p_cliente, d.wa_origem_mensagem_id);
    IF NOT FOUND OR origem.atestada_em IS NULL OR origem.ocorrido_em IS NULL THEN CONTINUE; END IF;
    v_evidencias := '{}'::uuid[]; v_valida := true;
    FOR e IN SELECT value FROM jsonb_array_elements(r->'evidencias') LOOP
      IF COALESCE(e->>'mensagem_id', '') !~ c_uuid THEN v_valida := false; EXIT; END IF;
      SELECT * INTO m FROM private.atendimento_mensagem_cliente(p_tenant, p_cliente, (e->>'mensagem_id')::uuid);
      IF NOT FOUND OR m.autor_tipo NOT IN ('cliente','equipe') OR m.tipo NOT IN ('texto','text','chat')
        OR m.conversation_id IS DISTINCT FROM origem.conversation_id OR m.id = d.wa_origem_mensagem_id
        OR m.atestada_em IS NULL OR m.ocorrido_em IS NULL OR m.ocorrido_em <= origem.ocorrido_em
        OR (d.wa_reaberta_em IS NOT NULL AND m.ocorrido_em <= d.wa_reaberta_em)
        OR e->>'trecho' IS NULL OR length(e->>'trecho') NOT BETWEEN 6 AND 160 OR strpos(m.conteudo, e->>'trecho') = 0
        OR m.id = ANY(v_evidencias) THEN v_valida := false; EXIT; END IF;
      IF m.autor_tipo = 'equipe' AND (m.autor_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = m.autor_user_id AND u.tenant_id = p_tenant AND u.ativo IS TRUE AND u.perfil IS DISTINCT FROM 'cliente')) THEN
        v_valida := false; EXIT;
      END IF;
      v_evidencias := array_append(v_evidencias, m.id);
    END LOOP;
    IF NOT v_valida THEN CONTINUE; END IF;
    -- A mesma sugestão (mesmas provas) não reescreve a fila nem o histórico.
    IF d.wa_sugestao_em IS NOT NULL AND d.wa_sugestao_evidencias = v_evidencias THEN CONTINUE; END IF;
    UPDATE public.atendimento_demandas SET wa_sugestao_em = clock_timestamp(), wa_sugestao_razao = r->>'razao',
      wa_sugestao_motivo = v_motivo, wa_sugestao_confianca = round(v_conf, 3), wa_sugestao_evidencias = v_evidencias,
      wa_sugestao_modelo = r->>'modelo', wa_sugestao_versao = r->>'versao'
      WHERE id = d.id AND tenant_id = p_tenant;
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.atendimento_sugerir_resolucao_ia(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atendimento_sugerir_resolucao_ia(uuid, uuid, jsonb) TO service_role;

-- A baixa automática também encerra a sugestão pendente do mesmo ticket: a
-- mudança de etapa feita pelo worker passa pelo guard acima (service_role).
