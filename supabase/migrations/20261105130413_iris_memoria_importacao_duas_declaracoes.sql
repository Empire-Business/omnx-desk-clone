-- Capacidade administrativa excepcional para DUAS fontes históricas conhecidas.
-- Esta migration só prepara o mecanismo. Não importa dados automaticamente.
-- A execução explícita, autorizada pelo usuário em 05/11/2026, é:
-- SELECT * FROM private.wa_agente_fatos_importar_20261105();
-- Não muda pedidos para processando, não inventa mensagens nem desativa usuários.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.wa_agente_fatos_equipe
  ADD COLUMN origem text NOT NULL DEFAULT 'whatsapp' CHECK (origem IN ('whatsapp','manutencao_codex')),
  ADD COLUMN executor_bd text,
  ADD COLUMN autorizado_por uuid,
  ADD COLUMN fonte_criada_em timestamptz,
  ADD CONSTRAINT wa_agente_fatos_equipe_origem_auditoria CHECK (
    (origem = 'whatsapp' AND executor_bd IS NULL AND autorizado_por IS NULL AND fonte_criada_em IS NULL)
    OR (origem = 'manutencao_codex' AND executor_bd IS NOT NULL AND autorizado_por IS NOT NULL AND fonte_criada_em IS NOT NULL)
  );
COMMENT ON COLUMN public.wa_agente_fatos_equipe.origem IS
  'whatsapp: pedido atual validado. manutencao_codex: importação administrativa excepcional de duas fontes históricas, autorizada em 05/11/2026.';
COMMENT ON COLUMN public.wa_agente_fatos_equipe.entrada_sha256 IS
  'whatsapp: digest autenticado no ingresso. manutencao_codex: digest do snapshot histórico conferido na importação; não atesta captura original pelo webhook.';
COMMENT ON COLUMN public.wa_agente_fatos_equipe.executor_bd IS
  'session_user da sessão administrativa real que importou; não confundir com autor_id da declaração original.';

-- Sem argumento controlado por HTTP, sem SECURITY DEFINER e sem permissão para
-- service_role. Os únicos alvos ficam fixos no corpo, sujeitos a releitura.
CREATE FUNCTION private.wa_agente_fatos_fontes_20261105()
RETURNS SETOF public.wa_agente_fatos_equipe
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $f$
DECLARE
  a record;
  p public.wa_agente_pedidos%ROWTYPE;
  m public.chat_messages%ROWTYPE;
  f public.wa_agente_fatos_equipe%ROWTYPE;
  v_tenant constant uuid := '00000000-0000-0000-0000-000000000001';
  v_grupo constant text := '120363415422487266@g.us';
  v_autorizador constant uuid := '0295d401-6270-4fbe-be47-ee9b6a9ed9c9';
  v_total boolean;
  v_texto text;
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin') OR session_user <> current_user OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Importação limitada à sessão administrativa real.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.users u WHERE u.id = v_autorizador AND u.tenant_id = v_tenant AND u.ativo IS TRUE AND u.perfil IS DISTINCT FROM 'cliente' FOR SHARE;
  IF NOT FOUND OR NOT coalesce(public.has_permissao_de(v_autorizador,'automacoes-wa','admin'),false) THEN
    RAISE EXCEPTION 'Autorizador da manutenção não tem administração atual.' USING ERRCODE = '42501';
  END IF;
  SELECT total INTO v_total FROM public.wa_agente_escopo(v_tenant,v_autorizador);
  IF v_total IS NOT TRUE THEN
    RAISE EXCEPTION 'Autorizador sem carteira completa atual.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.wa_agente_grupos g WHERE g.tenant_id = v_tenant AND g.grupo_jid = v_grupo AND g.ativo IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Grupo da manutenção indisponível.' USING ERRCODE = '42501'; END IF;

  FOR a IN SELECT * FROM (VALUES
    ('b4e5ce68-6609-5c15-bc2b-5ab69b63bf22'::uuid, '683eb4c0-a057-4af0-b412-7e37066c2714'::uuid,
     '3cad0870-b074-41d1-bb8d-567ded016b4d'::uuid, '849a0faa-f08d-43a5-b381-7164363c8c68'::uuid,
     '0295d401-6270-4fbe-be47-ee9b6a9ed9c9'::uuid, '@255748827312232 virendra é um estrategista que já saiu.'::text),
    ('766e894f-7741-5911-ad30-4eda5c40bfbf'::uuid, 'c461c73d-2979-46ca-89ea-5af5e24277e5'::uuid,
     'b24d7590-d7b8-44ec-aa9c-ad3475d5c746'::uuid, '1583771d-b531-4d0d-bfce-85668eb107c8'::uuid,
     'efa3729e-de6e-4515-905d-f5fdd11dd679'::uuid, 'Herilly prado não é mais estrategista da empresa.'::text)
  ) AS alvos(id,sujeito,pedido,mensagem,autor,trecho)
  LOOP
    SELECT * INTO p FROM public.wa_agente_pedidos q WHERE q.id = a.pedido AND q.tenant_id = v_tenant FOR SHARE;
    IF NOT FOUND OR p.chat_jid IS DISTINCT FROM v_grupo OR p.eh_grupo IS NOT TRUE
      OR p.user_id IS DISTINCT FROM a.autor OR p.chat_message_id IS DISTINCT FROM a.mensagem
      OR p.entrada_encaminhada IS TRUE THEN
      RAISE EXCEPTION 'Pedido histórico não corresponde ao alvo autorizado.' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.wa_agente_membros mb WHERE mb.id = p.membro_id AND mb.tenant_id = v_tenant
      AND mb.user_id = a.autor AND mb.telefone_chave = p.remetente_chave FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ator histórico sem vínculo conferível com o pedido.' USING ERRCODE = '42501'; END IF;
    SELECT * INTO m FROM public.chat_messages x WHERE x.id = a.mensagem AND x.tenant_id = v_tenant FOR SHARE;
    IF NOT FOUND OR m.tipo IS DISTINCT FROM 'texto' OR m.autor_origem IS DISTINCT FROM 'webhook'
      OR m.autor_chave IS DISTINCT FROM p.remetente_chave OR m.message_id_wpp IS DISTINCT FROM p.message_id_wpp
      OR m.enviado_por_agente IS TRUE OR m.enviado_por_ia IS TRUE OR m.criado_em IS NULL
      OR (m.conversation_id = p.conversation_id AND (m.autor_tipo IS DISTINCT FROM 'equipe' OR m.autor_user_id IS DISTINCT FROM a.autor)) THEN
      RAISE EXCEPTION 'Autoria histórica não pôde ser conferida.' USING ERRCODE = '42501';
    END IF;
    v_texto := regexp_replace(m.conteudo, '^\[[^\]\r\n]{1,100}\] ', '');
    IF coalesce(strpos(v_texto,a.trecho),0) = 0 THEN
      RAISE EXCEPTION 'A declaração literal não consta da fonte histórica.' USING ERRCODE = '42501';
    END IF;
    IF p.entrada_texto_sha256 IS NOT NULL AND p.entrada_texto_sha256 IS DISTINCT FROM encode(extensions.digest(convert_to(v_texto,'UTF8'),'sha256'),'hex') THEN
      RAISE EXCEPTION 'O digest histórico existente diverge do corpo próprio.' USING ERRCODE = '42501';
    END IF;
    -- Identidade vem do pedido/membro autenticados; a mensagem canônica de
    -- outra conexão comprova o conteúdo/autor_chave, sem reescrever sua autoria.
    PERFORM 1 FROM public.chat_conversations cv
      JOIN public.chat_contacts ct ON ct.id = cv.contact_id AND ct.tenant_id = cv.tenant_id AND ct.instance_id = cv.instance_id
      JOIN public.whatsapp_instances wi ON wi.id = cv.instance_id AND wi.tenant_id = cv.tenant_id
      WHERE cv.id = p.conversation_id AND cv.instance_id = p.instance_uuid AND cv.tenant_id = v_tenant AND cv.is_group IS TRUE
        AND lower(btrim(ct.numero_whatsapp)) IN (v_grupo,left(v_grupo,length(v_grupo)-5)) FOR SHARE OF cv,ct,wi;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conversa do pedido fora do grupo autorizado.' USING ERRCODE = '42501'; END IF;
    -- Conferir o grupo da mensagem, inclusive se a fila veio de outra instância.
    PERFORM 1 FROM public.chat_conversations cv
      JOIN public.chat_contacts ct ON ct.id = cv.contact_id AND ct.tenant_id = cv.tenant_id AND ct.instance_id = cv.instance_id
      JOIN public.whatsapp_instances wi ON wi.id = cv.instance_id AND wi.tenant_id = cv.tenant_id
      WHERE cv.id = m.conversation_id AND cv.tenant_id = v_tenant AND cv.is_group IS TRUE
        AND lower(btrim(ct.numero_whatsapp)) IN (v_grupo,left(v_grupo,length(v_grupo)-5)) FOR SHARE OF cv,ct,wi;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fonte histórica fora do grupo autorizado.' USING ERRCODE = '42501'; END IF;
    f := NULL;
    f.id := a.id; f.tenant_id := v_tenant; f.grupo_jid := v_grupo;
    f.sujeito_tipo := 'pessoa'; f.sujeito_id := a.sujeito;
    SELECT u.nome INTO f.sujeito_nome FROM public.users u WHERE u.id = a.sujeito AND u.tenant_id = v_tenant FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sujeito histórico não cadastrado no tenant.' USING ERRCODE = '42501'; END IF;
    f.trecho := a.trecho;
    f.trecho_sha256 := encode(extensions.digest(convert_to(a.trecho,'UTF8'),'sha256'),'hex');
    f.autor_id := a.autor;
    SELECT left(u.nome,120) INTO f.autor_nome FROM public.users u WHERE u.id = a.autor AND u.tenant_id = v_tenant FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Autor histórico não cadastrado no tenant.' USING ERRCODE = '42501'; END IF;
    f.pedido_id := a.pedido; f.mensagem_id := a.mensagem;
    f.entrada_sha256 := encode(extensions.digest(convert_to(v_texto,'UTF8'),'sha256'),'hex');
    f.criado_em := clock_timestamp(); f.ativo := true;
    f.origem := 'manutencao_codex'; f.executor_bd := session_user;
    f.autorizado_por := v_autorizador; f.fonte_criada_em := m.criado_em;
    RETURN NEXT f;
  END LOOP;
END;
$f$;
REVOKE ALL ON FUNCTION private.wa_agente_fatos_fontes_20261105() FROM PUBLIC, anon, authenticated, service_role;

-- O corpo original do trigger será mantido abaixo, acrescido apenas da exceção
-- limitada à sessão administrativa real e às duas linhas produzidas acima.

CREATE OR REPLACE FUNCTION private.wa_agente_fatos_equipe_confere()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $f$
DECLARE
  p public.wa_agente_pedidos%ROWTYPE;
  esperado public.wa_agente_fatos_equipe%ROWTYPE;
  v_texto text;
  v_nome text;
  v_total boolean;
  v_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' AND NEW.origem = 'manutencao_codex' THEN
    IF current_user NOT IN ('postgres','supabase_admin') OR session_user <> current_user OR auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Importação administrativa indisponível neste canal.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO esperado FROM private.wa_agente_fatos_fontes_20261105() f WHERE f.id = NEW.id;
    IF NOT FOUND OR (to_jsonb(NEW) - 'criado_em') IS DISTINCT FROM (to_jsonb(esperado) - 'criado_em') THEN
      RAISE EXCEPTION 'A importação aceita somente as duas declarações autorizadas.' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('wa_agente_fatos:' || NEW.tenant_id::text || ':' || NEW.grupo_jid));
    IF (SELECT count(*) FROM public.wa_agente_fatos_equipe f WHERE f.tenant_id = NEW.tenant_id AND f.grupo_jid = NEW.grupo_jid AND f.ativo AND f.id <> NEW.id) >= 100 THEN
      RAISE EXCEPTION 'Limite de 100 fatos ativos neste grupo; esqueça um antes.' USING ERRCODE = '23514';
    END IF;
    RETURN esperado;
  END IF;
  p := private.wa_agente_acoes_pedido(CASE WHEN TG_OP = 'INSERT' THEN NEW.pedido_id ELSE NEW.pedido_desativacao_id END, true);
  IF p.tenant_id IS DISTINCT FROM NEW.tenant_id OR p.chat_jid IS DISTINCT FROM NEW.grupo_jid THEN
    RAISE EXCEPTION 'Memória fora do grupo autorizado.' USING ERRCODE = '42501';
  END IF;
  SELECT regexp_replace(m.conteudo, '^\[[^\]\r\n]{1,100}\] ', '') INTO v_texto
    FROM public.chat_messages m WHERE m.tenant_id = p.tenant_id AND m.id = p.chat_message_id;
  IF TG_OP = 'INSERT' THEN
    IF NOT NEW.ativo OR NEW.autor_id IS DISTINCT FROM p.user_id
      OR NEW.mensagem_id IS DISTINCT FROM p.chat_message_id OR NEW.entrada_sha256 IS DISTINCT FROM p.entrada_texto_sha256
      OR coalesce(strpos(v_texto, NEW.trecho), 0) = 0
      OR encode(extensions.digest(convert_to(NEW.trecho,'UTF8'),'sha256'),'hex') IS DISTINCT FROM NEW.trecho_sha256 THEN
      RAISE EXCEPTION 'Fonte da declaração não conferida.' USING ERRCODE = '42501';
    END IF;
    SELECT left(u.nome,120) INTO NEW.autor_nome FROM public.users u WHERE u.tenant_id = p.tenant_id AND u.id = p.user_id;
    NEW.criado_em := clock_timestamp();
    IF NEW.sujeito_tipo = 'pessoa' THEN
      SELECT u.nome INTO v_nome FROM public.users u WHERE u.tenant_id = p.tenant_id AND u.id = NEW.sujeito_id FOR SHARE;
    ELSIF NEW.sujeito_tipo = 'cliente' THEN
      SELECT c.nome INTO v_nome FROM public.clients c WHERE c.tenant_id = p.tenant_id AND c.id = NEW.sujeito_id FOR SHARE;
    END IF;
    IF v_nome IS NULL OR v_nome IS DISTINCT FROM NEW.sujeito_nome THEN
      RAISE EXCEPTION 'Sujeito da declaração não conferido.' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('wa_agente_fatos:' || NEW.tenant_id::text || ':' || NEW.grupo_jid));
    IF (SELECT count(*) FROM public.wa_agente_fatos_equipe f WHERE f.tenant_id = NEW.tenant_id AND f.grupo_jid = NEW.grupo_jid AND f.ativo AND f.id <> NEW.id) >= 100 THEN
      RAISE EXCEPTION 'Limite de 100 fatos ativos neste grupo; esqueça um antes.' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF (to_jsonb(NEW) - ARRAY['ativo','desativado_em','desativado_por','pedido_desativacao_id']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['ativo','desativado_em','desativado_por','pedido_desativacao_id'])
       OR OLD.ativo IS NOT TRUE OR NEW.ativo IS NOT FALSE OR NEW.desativado_por IS DISTINCT FROM p.user_id
       OR strpos(lower(v_texto), 'f' || left(replace(OLD.id::text,'-',''),7)) = 0 THEN
      RAISE EXCEPTION 'Só é permitido esquecer um fato identificado na mensagem atual.' USING ERRCODE = '42501';
    END IF;
    NEW.desativado_em := clock_timestamp();
  END IF;
  -- Texto livre não recebe classificação de carteira confiável do modelo.
  SELECT total, client_ids INTO v_total, v_ids FROM public.wa_agente_escopo(p.tenant_id,p.user_id);
  IF v_total IS NOT TRUE THEN
    RAISE EXCEPTION 'A memória compartilhada exige acesso à carteira completa.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$f$;
REVOKE ALL ON FUNCTION private.wa_agente_fatos_equipe_confere() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.wa_agente_fatos_equipe_confere() TO service_role;

CREATE FUNCTION private.wa_agente_fatos_importar_20261105()
RETURNS TABLE (fato_id uuid, sujeito text, resultado text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $f$
DECLARE
  esperado public.wa_agente_fatos_equipe%ROWTYPE;
  existente public.wa_agente_fatos_equipe%ROWTYPE;
BEGIN
  -- O helper também valida sessão real, autorização e ambas as fontes.
  FOR esperado IN SELECT * FROM private.wa_agente_fatos_fontes_20261105() LOOP
    PERFORM pg_advisory_xact_lock(hashtext('wa_agente_fatos:' || esperado.tenant_id::text || ':' || esperado.grupo_jid));
    SELECT * INTO existente FROM public.wa_agente_fatos_equipe f WHERE f.id = esperado.id FOR SHARE;
    IF FOUND THEN
      IF existente.origem IS DISTINCT FROM 'manutencao_codex' OR existente.tenant_id IS DISTINCT FROM esperado.tenant_id
        OR existente.grupo_jid IS DISTINCT FROM esperado.grupo_jid OR existente.sujeito_id IS DISTINCT FROM esperado.sujeito_id
        OR existente.pedido_id IS DISTINCT FROM esperado.pedido_id OR existente.mensagem_id IS DISTINCT FROM esperado.mensagem_id
        OR existente.autor_id IS DISTINCT FROM esperado.autor_id OR existente.trecho IS DISTINCT FROM esperado.trecho
        OR existente.autorizado_por IS DISTINCT FROM esperado.autorizado_por THEN
        RAISE EXCEPTION 'Identificador ocupado por outra memória; nada importado.' USING ERRCODE = '23505';
      END IF;
      RETURN QUERY SELECT existente.id, existente.sujeito_nome, CASE WHEN existente.ativo THEN 'ja_importado' ELSE 'ja_desativado_preservado' END;
    ELSE
      INSERT INTO public.wa_agente_fatos_equipe SELECT (esperado).*;
      RETURN QUERY SELECT esperado.id, esperado.sujeito_nome, 'importado'::text;
    END IF;
  END LOOP;
END;
$f$;
REVOKE ALL ON FUNCTION private.wa_agente_fatos_importar_20261105() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION private.wa_agente_fatos_importar_20261105() IS
  'Capacidade sem argumentos para duas declarações históricas fixas, autorizada por Bruno em 05/11/2026. Somente sessão administrativa real; idempotente; nunca reativa fato esquecido nem altera fila/cadastro.';
COMMIT;
NOTIFY pgrst, 'reload schema';
