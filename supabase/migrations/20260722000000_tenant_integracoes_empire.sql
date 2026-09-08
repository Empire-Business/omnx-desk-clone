-- Integração omnx-desk → Empire (CRM) multi-tenant: cofre de credenciais por tenant.
-- Espelha o padrão do Empire (workspace_integration_credentials): o secret real nunca
-- fica em texto puro numa tabela de negócio — vai para o Supabase Vault e a tabela guarda
-- apenas um ponteiro (secret_key_id) + metadados não sensíveis + rotation_version.
--
-- Modelo: "1 empresa por clone" (Single-Tenant Lock). Cada instância do omnx-desk atende
-- um tenant; a resolução em runtime pega o único integração 'empire' ativa. A estrutura por
-- tenant_id existe por baixo para permitir replicação e a fusão futura com o empire-manager.

-- 1. Vault (idempotente) --------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- 2. Tabela de credenciais por tenant -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_integracoes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider         text NOT NULL CHECK (provider IN ('empire')),
  secret_key_id    uuid,                     -- ponteiro para vault.secrets (nunca plaintext)
  base_url         text,                     -- ex.: https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  rotation_version integer NOT NULL DEFAULT 1,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_tenant_integracoes_tenant ON public.tenant_integracoes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_integracoes_provider_ativa
  ON public.tenant_integracoes(provider) WHERE is_active = true;

COMMENT ON TABLE public.tenant_integracoes IS
  'Cofre de credenciais de integração por tenant. O segredo real fica no Vault; aqui só o ponteiro (secret_key_id), base_url e metadados. Padrão espelhado do Empire.';

-- 3. RLS: admins leem o status (sem segredo); escrita/decrypt só via RPC / service_role ------
ALTER TABLE public.tenant_integracoes ENABLE ROW LEVEL SECURITY;

-- defesa em profundidade: nega tudo por padrão (sem policy para anon/authenticated de escrita)
DROP POLICY IF EXISTS tenant_integracoes_admin_select ON public.tenant_integracoes;
CREATE POLICY tenant_integracoes_admin_select ON public.tenant_integracoes
  FOR SELECT TO authenticated
  USING ((SELECT perfil FROM public.users WHERE id = auth.uid()) = 'admin');

-- trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_tenant_integracoes_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_integracoes_updated_at ON public.tenant_integracoes;
CREATE TRIGGER trg_tenant_integracoes_updated_at
  BEFORE UPDATE ON public.tenant_integracoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_tenant_integracoes_updated_at();

-- 4. Helper interno: resolve o tenant do clone (1 empresa por instância) ---------------------
-- Preferência: tenant do usuário logado (profiles). Fallback: único tenant existente.
CREATE OR REPLACE FUNCTION public.resolve_tenant_do_clone()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
  v_count  int;
BEGIN
  BEGIN
    v_tenant := public.get_user_tenant_id();
  EXCEPTION WHEN OTHERS THEN
    v_tenant := NULL;
  END;
  IF v_tenant IS NOT NULL THEN
    RETURN v_tenant;
  END IF;
  SELECT count(*) INTO v_count FROM public.tenants;
  IF v_count = 1 THEN
    SELECT id INTO v_tenant FROM public.tenants LIMIT 1;
    RETURN v_tenant;
  END IF;
  RETURN NULL; -- ambíguo: 0 ou >1 tenant e sem contexto de usuário
END;
$$;

-- 5. RPC de escrita (self-service, admin): grava o segredo no Vault e faz upsert -------------
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
BEGIN
  IF p_provider IS DISTINCT FROM 'empire' THEN
    RAISE EXCEPTION 'provider inválido: %', p_provider;
  END IF;
  IF p_secret IS NULL OR length(trim(p_secret)) = 0 THEN
    RAISE EXCEPTION 'secret vazio';
  END IF;

  SELECT (perfil = 'admin') INTO v_is_admin FROM public.users WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'apenas admin pode configurar integrações';
  END IF;

  v_tenant := public.resolve_tenant_do_clone();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'não foi possível resolver o tenant desta conta';
  END IF;

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
      'Secret da ponte omnx-desk → Empire'
    );
    v_new_version := COALESCE(v_existing.rotation_version, 0) + 1;
  END IF;

  INSERT INTO public.tenant_integracoes AS ti (tenant_id, provider, secret_key_id, base_url, metadata, rotation_version, is_active)
  VALUES (v_tenant, p_provider, v_secret_id, NULLIF(trim(COALESCE(p_base_url, '')), ''), COALESCE(p_metadata, '{}'::jsonb), v_new_version, true)
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

-- 6. RPC de status (admin): informa se está conectado, sem expor o segredo -------------------
CREATE OR REPLACE FUNCTION public.get_omnx_integracao_status(p_provider text DEFAULT 'empire')
RETURNS TABLE (provider text, base_url text, rotation_version integer, is_active boolean, connected boolean, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant   uuid;
  v_is_admin boolean;
BEGIN
  SELECT (perfil = 'admin') INTO v_is_admin FROM public.users WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'apenas admin';
  END IF;
  v_tenant := public.resolve_tenant_do_clone();
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT ti.provider, ti.base_url, ti.rotation_version, ti.is_active,
           (ti.secret_key_id IS NOT NULL) AS connected, ti.updated_at
    FROM public.tenant_integracoes ti
    WHERE ti.tenant_id = v_tenant AND ti.provider = p_provider;
END;
$$;

-- 7. RPC de revogação (admin): apaga o segredo do Vault e desativa -------------------------
CREATE OR REPLACE FUNCTION public.revoke_omnx_integracao(p_provider text DEFAULT 'empire')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant    uuid;
  v_is_admin  boolean;
  v_secret_id uuid;
BEGIN
  SELECT (perfil = 'admin') INTO v_is_admin FROM public.users WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'apenas admin';
  END IF;
  v_tenant := public.resolve_tenant_do_clone();
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  SELECT secret_key_id INTO v_secret_id
  FROM public.tenant_integracoes
  WHERE tenant_id = v_tenant AND provider = p_provider;

  DELETE FROM public.tenant_integracoes WHERE tenant_id = v_tenant AND provider = p_provider;
  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;
END;
$$;

-- 8. RPC de resolução em runtime (SÓ service_role): devolve o segredo decifrado -------------
-- Usada pelas edge functions da ponte. Fail-closed: NULL quando não há integração ativa.
CREATE OR REPLACE FUNCTION public.get_omnx_bridge_credential(p_provider text DEFAULT 'empire')
RETURNS TABLE (secret text, base_url text, tenant_id uuid, rotation_version integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  -- "1 empresa por clone": deve haver no máximo 1 integração ativa deste provider.
  SELECT count(*) INTO v_count
  FROM public.tenant_integracoes
  WHERE provider = p_provider AND is_active = true AND secret_key_id IS NOT NULL;

  IF v_count <> 1 THEN
    RETURN; -- 0 (não configurado ainda) ou >1 (ambíguo) → fail-closed, edge cai no fallback/erro
  END IF;

  RETURN QUERY
    SELECT ds.decrypted_secret, ti.base_url, ti.tenant_id, ti.rotation_version
    FROM public.tenant_integracoes ti
    JOIN vault.decrypted_secrets ds ON ds.id = ti.secret_key_id
    WHERE ti.provider = p_provider AND ti.is_active = true
    LIMIT 1;
END;
$$;

-- 9. Grants: fail-closed. Escrita/status/revogação para authenticated (guarda admin interna);
--    resolução decifrada SÓ para service_role. ---------------------------------------------
REVOKE ALL ON FUNCTION public.save_omnx_integracao_secret(text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_omnx_integracao_status(text)                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_omnx_integracao(text)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_omnx_bridge_credential(text)                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_tenant_do_clone()                             FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_omnx_integracao_secret(text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_omnx_integracao_status(text)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_omnx_integracao(text)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_omnx_bridge_credential(text)                      TO service_role;
