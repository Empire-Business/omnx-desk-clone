-- ============================================================================
-- App Automações WhatsApp — adaptador de envio (etapa 9.2 do roadmap)
-- ============================================================================
-- Docs/prd.md §0.6 e ROADMAP-MODULARIZACAO.md Fase 9 (F3, F6).
--
-- Contexto: os tokens da UAZAPI e a chave da Zernio passam a morar no Vault, pelo
-- MESMO cofre já usado pela ponte Empire (tenant_integracoes + RPCs SECURITY
-- DEFINER). Até aqui o cofre só aceitava provider = 'empire' em dois pontos:
--   * o CHECK inline da coluna tenant_integracoes.provider (nome gerado pelo
--     Postgres: tenant_integracoes_provider_check — migration 20260722000000);
--   * o IF de save_omnx_integracao_secret (`p_provider IS DISTINCT FROM 'empire'`).
-- get_omnx_integracao_status, revoke_omnx_integracao e
-- get_omnx_bridge_credential_tenant já recebem o provider por parâmetro e não
-- precisam mudar.
--
-- O que muda:
--   1) CHECK do provider passa a aceitar 'empire', 'uazapi', 'zernio'.
--   2) base_url de 'uazapi'/'zernio' só pode apontar para *.uazapi.com /
--      *.zernio.com, https, sem porta/usuário/query (SSRF — F6). Vale na RPC e
--      também como CHECK da tabela (pega até escrita por service_role).
--   3) save_omnx_integracao_secret aceita os 2 providers novos; a guarda de
--      admin (users.perfil = 'admin') e a resolução de tenant NÃO mudam. Para
--      'zernio' exige metadata.account_id (id da conta WhatsApp na Zernio).
--   4) wa_auto_config ganha template_idioma (ex.: 'pt_BR'), exigido pela Zernio
--      no envio de modelo aprovado.
--
-- Idempotente: DROP/ADD de constraint por nome, ADD COLUMN IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION (mesma assinatura, grants preservados e reafirmados).
--
-- Reversão (manual, em transação):
--   -- apaga segredos dos providers novos
--   DELETE FROM vault.secrets WHERE id IN (SELECT secret_key_id FROM public.tenant_integracoes
--                                          WHERE provider IN ('uazapi','zernio'));
--   DELETE FROM public.tenant_integracoes WHERE provider IN ('uazapi','zernio');
--   ALTER TABLE public.tenant_integracoes DROP CONSTRAINT IF EXISTS tenant_integracoes_base_url_wa_check;
--   ALTER TABLE public.tenant_integracoes DROP CONSTRAINT IF EXISTS tenant_integracoes_provider_check;
--   ALTER TABLE public.tenant_integracoes ADD CONSTRAINT tenant_integracoes_provider_check
--     CHECK (provider IN ('empire'));
--   DROP FUNCTION IF EXISTS public.wa_base_url_permitida(text, text);
--   ALTER TABLE public.wa_auto_config DROP COLUMN IF EXISTS template_idioma;
--   -- e reaplicar o corpo de save_omnx_integracao_secret da migration 20260722000000.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Provider: 'empire' (existente) + 'uazapi' + 'zernio'
--    Remove qualquer CHECK que envolva só a coluna provider (o nome gerado
--    esperado é tenant_integracoes_provider_check, mas não dependemos dele).
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'public.tenant_integracoes'::regclass
       AND con.contype = 'c'
       AND con.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                                WHERE attrelid = 'public.tenant_integracoes'::regclass
                                  AND attname = 'provider')]::int2[]
  LOOP
    EXECUTE format('ALTER TABLE public.tenant_integracoes DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$do$;

ALTER TABLE public.tenant_integracoes
  ADD CONSTRAINT tenant_integracoes_provider_check
  CHECK (provider IN ('empire', 'uazapi', 'zernio'));

-- ---------------------------------------------------------------------------
-- 2) Lista de domínios permitidos para o endereço da API (SSRF — F6)
--    Espelha validarBaseUrl() de src/lib/waMensagem.ts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_base_url_permitida(p_provider text, p_url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT CASE p_provider
    WHEN 'uazapi' THEN p_url ~* '^https://([a-z0-9-]+\.)*uazapi\.com(/[a-z0-9._~/-]*)?$'
    WHEN 'zernio' THEN p_url ~* '^https://([a-z0-9-]+\.)*zernio\.com(/[a-z0-9._~/-]*)?$'
    ELSE true  -- 'empire' segue a regra antiga (sem allowlist aqui)
  END;
$fn$;

COMMENT ON FUNCTION public.wa_base_url_permitida(text, text) IS
  'Allowlist (SSRF) do endereço da API dos provedores de WhatsApp: só https em *.uazapi.com / *.zernio.com, sem porta, usuário ou query.';

ALTER TABLE public.tenant_integracoes DROP CONSTRAINT IF EXISTS tenant_integracoes_base_url_wa_check;
ALTER TABLE public.tenant_integracoes
  ADD CONSTRAINT tenant_integracoes_base_url_wa_check
  CHECK (base_url IS NULL OR public.wa_base_url_permitida(provider, base_url));

-- ---------------------------------------------------------------------------
-- 3) RPC de escrita do segredo — mesma assinatura, providers novos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_omnx_integracao_secret(
  p_provider text,
  p_secret   text,
  p_base_url text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant       uuid;
  v_is_admin     boolean;
  v_secret_id    uuid;
  v_existing     public.tenant_integracoes%ROWTYPE;
  v_new_version  integer;
  v_base_url     text;
  v_metadata     jsonb;
  v_rotulo       text;
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('empire', 'uazapi', 'zernio') THEN
    RAISE EXCEPTION 'provider inválido: %', p_provider;
  END IF;
  IF p_secret IS NULL OR length(trim(p_secret)) = 0 THEN
    RAISE EXCEPTION 'secret vazio';
  END IF;
  IF length(p_secret) > 4096 THEN
    RAISE EXCEPTION 'secret grande demais';
  END IF;

  -- Guarda de admin INALTERADA em relação à versão original.
  SELECT (perfil = 'admin') INTO v_is_admin FROM public.users WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'apenas admin pode configurar integrações';
  END IF;

  v_tenant := public.resolve_tenant_do_clone();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'não foi possível resolver o tenant desta conta';
  END IF;

  v_base_url := NULLIF(trim(COALESCE(p_base_url, '')), '');
  IF v_base_url IS NOT NULL AND p_provider IN ('uazapi', 'zernio') THEN
    v_base_url := regexp_replace(v_base_url, '/+$', '');
    IF NOT public.wa_base_url_permitida(p_provider, v_base_url) THEN
      RAISE EXCEPTION 'endereço da API não permitido para %', p_provider
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb);
  IF jsonb_typeof(v_metadata) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'metadata inválido';
  END IF;
  IF p_provider = 'zernio' THEN
    -- Toda chamada da Zernio leva o accountId da conta WhatsApp conectada.
    IF COALESCE(v_metadata->>'account_id', '') !~ '^[A-Za-z0-9_-]{1,128}$' THEN
      RAISE EXCEPTION 'informe o código da conta (account_id) da Zernio';
    END IF;
    v_metadata := jsonb_build_object('account_id', v_metadata->>'account_id');
  ELSIF p_provider = 'uazapi' THEN
    v_metadata := '{}'::jsonb;  -- nada além do token por enquanto
  END IF;

  v_rotulo := CASE p_provider
    WHEN 'empire' THEN 'Secret da ponte omnx-desk → Empire'
    WHEN 'uazapi' THEN 'Token da instância UAZAPI (Automações WhatsApp)'
    WHEN 'zernio' THEN 'Chave da API Zernio (Automações WhatsApp)'
  END;

  SELECT * INTO v_existing
  FROM public.tenant_integracoes
  WHERE tenant_id = v_tenant AND provider = p_provider;

  IF FOUND AND v_existing.secret_key_id IS NOT NULL THEN
    -- rotação: atualiza o segredo existente no Vault
    PERFORM vault.update_secret(
      v_existing.secret_key_id,
      trim(p_secret),
      'omnx_integracao:' || p_provider || ':' || v_tenant::text
    );
    v_secret_id   := v_existing.secret_key_id;
    v_new_version := v_existing.rotation_version + 1;
  ELSE
    v_secret_id := vault.create_secret(
      trim(p_secret),
      'omnx_integracao:' || p_provider || ':' || v_tenant::text || ':' || gen_random_uuid()::text,
      v_rotulo
    );
    v_new_version := COALESCE(v_existing.rotation_version, 0) + 1;
  END IF;

  INSERT INTO public.tenant_integracoes AS ti (tenant_id, provider, secret_key_id, base_url, metadata, rotation_version, is_active)
  VALUES (v_tenant, p_provider, v_secret_id, v_base_url, v_metadata, v_new_version, true)
  ON CONFLICT (tenant_id, provider) DO UPDATE
    SET secret_key_id    = EXCLUDED.secret_key_id,
        base_url         = COALESCE(EXCLUDED.base_url, ti.base_url),
        metadata         = EXCLUDED.metadata,
        rotation_version = EXCLUDED.rotation_version,
        is_active        = true,
        updated_at       = now();

  RETURN v_new_version; -- nunca retorna o segredo
END;
$$;

-- Grants reafirmados (iguais aos da 20260722000000; decifrar continua só service_role).
REVOKE ALL ON FUNCTION public.save_omnx_integracao_secret(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_omnx_integracao_secret(text, text, text, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_omnx_bridge_credential_tenant(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_omnx_bridge_credential_tenant(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Idioma do modelo aprovado (Zernio exige templateLanguage)
-- ---------------------------------------------------------------------------
ALTER TABLE public.wa_auto_config
  ADD COLUMN IF NOT EXISTS template_idioma TEXT NOT NULL DEFAULT 'pt_BR';

ALTER TABLE public.wa_auto_config DROP CONSTRAINT IF EXISTS wa_auto_config_template_idioma_check;
ALTER TABLE public.wa_auto_config
  ADD CONSTRAINT wa_auto_config_template_idioma_check
  CHECK (template_idioma ~ '^[a-z]{2,3}(_[A-Z]{2})?$');

-- Nomes de modelo: só o que a Meta aceita (minúsculas, números e _).
ALTER TABLE public.wa_auto_config DROP CONSTRAINT IF EXISTS wa_auto_config_template_nomes_check;
ALTER TABLE public.wa_auto_config
  ADD CONSTRAINT wa_auto_config_template_nomes_check
  CHECK (
        (template_relatorio IS NULL OR (template_relatorio ~ '^[a-z0-9_]+$' AND length(template_relatorio) <= 512))
    AND (template_resumo    IS NULL OR (template_resumo    ~ '^[a-z0-9_]+$' AND length(template_resumo) <= 512))
    AND (template_link      IS NULL OR (template_link      ~ '^[a-z0-9_]+$' AND length(template_link) <= 512))
  ) NOT VALID;  -- NOT VALID: não barra a migration se já houver lixo gravado; vale para escritas novas.

COMMIT;

NOTIFY pgrst, 'reload schema';
