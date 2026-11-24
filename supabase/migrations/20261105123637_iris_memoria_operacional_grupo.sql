-- Memória operacional atribuída, separada de preferências/instruções.
-- Origem/ator/permissões continuam conferidos no executor e na transação.
-- IDs de auditoria são snapshots: a retenção da fila não apaga a proveniência.
-- Depende de private.wa_agente_acoes_pedido(uuid,boolean) e wa_agente_escopo.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.wa_agente_fatos_equipe (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  grupo_jid text NOT NULL CHECK (length(grupo_jid) <= 60 AND grupo_jid ~ '@g\.us$'),
  sujeito_tipo text NOT NULL CHECK (sujeito_tipo IN ('pessoa','cliente')),
  sujeito_id uuid NOT NULL,
  sujeito_nome text NOT NULL CHECK (length(sujeito_nome) BETWEEN 2 AND 160),
  trecho text NOT NULL CHECK (length(trecho) BETWEEN 5 AND 600 AND trecho = btrim(trecho)),
  trecho_sha256 text NOT NULL CHECK (trecho_sha256 ~ '^[0-9a-f]{64}$'),
  autor_id uuid NOT NULL,
  autor_nome text NOT NULL CHECK (length(autor_nome) BETWEEN 1 AND 120),
  pedido_id uuid NOT NULL,
  mensagem_id uuid NOT NULL,
  entrada_sha256 text NOT NULL CHECK (entrada_sha256 ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  ativo boolean NOT NULL DEFAULT true,
  desativado_em timestamptz,
  desativado_por uuid,
  pedido_desativacao_id uuid,
  CHECK ((ativo AND desativado_em IS NULL AND desativado_por IS NULL AND pedido_desativacao_id IS NULL)
    OR (NOT ativo AND desativado_em IS NOT NULL AND desativado_por IS NOT NULL AND pedido_desativacao_id IS NOT NULL)),
  UNIQUE (tenant_id, grupo_jid, pedido_id, trecho_sha256)
);
COMMENT ON TABLE public.wa_agente_fatos_equipe IS
  'Declarações operacionais literais atribuídas a administrador no grupo de origem. Dados não verificados; nunca instruções, autorização ou alteração do cadastro. Somente serviço, no máximo 100 ativos por grupo.';
CREATE INDEX wa_agente_fatos_equipe_grupo ON public.wa_agente_fatos_equipe (tenant_id, grupo_jid, criado_em DESC) WHERE ativo;
ALTER TABLE public.wa_agente_fatos_equipe ENABLE ROW LEVEL SECURITY;
-- Sem policies de navegador: o grupo é uma fronteira que não se resume ao tenant.
REVOKE ALL ON TABLE public.wa_agente_fatos_equipe FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.wa_agente_fatos_equipe TO service_role;
GRANT UPDATE (ativo,desativado_em,desativado_por,pedido_desativacao_id) ON TABLE public.wa_agente_fatos_equipe TO service_role;

CREATE FUNCTION private.wa_agente_fatos_equipe_confere()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $f$
DECLARE
  p public.wa_agente_pedidos%ROWTYPE;
  v_texto text;
  v_nome text;
  v_total boolean;
  v_ids uuid[];
BEGIN
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
CREATE TRIGGER wa_agente_fatos_equipe_confere BEFORE INSERT OR UPDATE ON public.wa_agente_fatos_equipe
  FOR EACH ROW EXECUTE FUNCTION private.wa_agente_fatos_equipe_confere();
COMMIT;
NOTIFY pgrst, 'reload schema';
