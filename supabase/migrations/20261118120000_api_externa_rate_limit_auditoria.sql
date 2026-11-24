-- API externa (chat-api-v2 REST + desk-mcp): limite por chave e auditoria por chamada.
-- Só arquivo: NÃO aplicar com `supabase db push` (regra do dono). Aplicar via db query + migration repair.
-- Ordem de publicação: esta migration ANTES das funções chat-api-v2 / desk-mcp.
-- Reversível: DROP FUNCTION api_externa_limpar_antigos(); DROP FUNCTION api_rate_limit_hit(uuid, integer, integer);
--             DROP TABLE api_rate_limit, api_request_log. (Se agendou a limpeza: cron.unschedule('api-externa-limpeza') antes.)
SET search_path = public, pg_catalog;

COMMENT ON COLUMN api_keys.key_prefix IS 'primeiros 12 caracteres da chave (edk_ + 8) só para identificação visual';

-- ── Limite por chave (janela fixa) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_rate_limit (
  key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  janela_inicio timestamptz NOT NULL,
  contagem integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, janela_inicio)
);
ALTER TABLE api_rate_limit ENABLE ROW LEVEL SECURITY;
-- Sem policy: só service_role (edge function) acessa.

CREATE OR REPLACE FUNCTION api_rate_limit_hit(p_key_id uuid, p_limite integer, p_janela_seg integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_inicio timestamptz;
  v_conta integer;
BEGIN
  IF p_limite < 1 OR p_janela_seg < 1 THEN
    RAISE EXCEPTION 'parametros invalidos';
  END IF;
  v_inicio := to_timestamp(floor(extract(epoch FROM now()) / p_janela_seg) * p_janela_seg);
  INSERT INTO api_rate_limit AS r (key_id, janela_inicio, contagem)
  VALUES (p_key_id, v_inicio, 1)
  ON CONFLICT (key_id, janela_inicio) DO UPDATE SET contagem = r.contagem + 1
  RETURNING r.contagem INTO v_conta;
  -- limpeza oportunista de janelas antigas desta chave
  DELETE FROM api_rate_limit WHERE key_id = p_key_id AND janela_inicio < v_inicio - make_interval(secs => p_janela_seg * 5);
  RETURN jsonb_build_object(
    'permitido', v_conta <= p_limite,
    'restante', greatest(p_limite - v_conta, 0),
    'reset_seg', greatest(ceil(extract(epoch FROM (v_inicio + make_interval(secs => p_janela_seg) - now())))::int, 1)
  );
END;
$fn$;
REVOKE ALL ON FUNCTION api_rate_limit_hit(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api_rate_limit_hit(uuid, integer, integer) TO service_role;

-- ── Auditoria por chamada (sem corpo de mensagem, sem query string) ─────────
CREATE TABLE IF NOT EXISTS api_request_log (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  canal text NOT NULL CHECK (canal IN ('rest', 'mcp')),
  metodo text NOT NULL,
  rota text NOT NULL,      -- rota normalizada (ids viram :id), ex.: GET /conversations/:id ou tools/call:list_contacts
  status integer NOT NULL,
  duracao_ms integer,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_request_log_tenant_criado_idx ON api_request_log (tenant_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS api_request_log_key_idx ON api_request_log (key_id, criado_em DESC);
ALTER TABLE api_request_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_le_api_request_log ON api_request_log;
CREATE POLICY admin_le_api_request_log ON api_request_log FOR SELECT USING (
  tenant_id = (SELECT public.get_user_tenant_id())
  AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil = 'admin')
);
-- Escrita: só service_role (bypassa RLS). Retenção sugerida: apagar > 90 dias (sem cron instalado aqui).

-- ── Retenção (função apenas; NÃO agendada aqui) ─────────────────────────────
-- api_request_log: 90 dias. api_rate_limit: 7 dias. Agendar via pg_cron (ver docs/API-MCP.md).
CREATE OR REPLACE FUNCTION api_externa_limpar_antigos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_log bigint;
  v_rl bigint;
BEGIN
  DELETE FROM api_request_log WHERE criado_em < now() - interval '90 days';
  GET DIAGNOSTICS v_log = ROW_COUNT;
  DELETE FROM api_rate_limit WHERE janela_inicio < now() - interval '7 days';
  GET DIAGNOSTICS v_rl = ROW_COUNT;
  RETURN jsonb_build_object('api_request_log', v_log, 'api_rate_limit', v_rl);
END;
$fn$;
REVOKE ALL ON FUNCTION api_externa_limpar_antigos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api_externa_limpar_antigos() TO service_role;
