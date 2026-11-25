-- Capacidade administrativa excepcional para DUAS fontes históricas conhecidas.
-- Esta migration só prepara o mecanismo. Não importa dados automaticamente.
-- A execução explícita, autorizada pelo usuário em 05/11/2026, é:
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

COMMIT;
NOTIFY pgrst, 'reload schema';
