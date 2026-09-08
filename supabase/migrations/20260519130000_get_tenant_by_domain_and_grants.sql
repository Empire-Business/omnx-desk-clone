-- =====================================================================
-- RPC pública get_tenant_by_domain + GRANTs explícitos pra service_role.
-- =====================================================================
-- Necessário para o padrão de clonagem OMNX:
--   * Front (pré-login) descobre o tenant pelo hostname via RPC SECURITY DEFINER
--   * Edge Functions (service_role) precisam de GRANTs explícitos em tudo
--     que foi criado depois do dump original (sem isso voltam 401/403).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_by_domain(p_domain TEXT)
RETURNS TABLE (
  id            UUID,
  name          TEXT,
  slug          TEXT,
  logo_url      TEXT,
  logo_dark_url TEXT,
  favicon_url   TEXT,
  primary_color TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, name, slug, logo_url, logo_dark_url, favicon_url, primary_color
  FROM public.tenants
  WHERE custom_domain IS NOT NULL
    AND LOWER(custom_domain) = LOWER(p_domain)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_by_domain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_by_domain(TEXT) TO anon, authenticated;

-- ── GRANTs explícitos pra service_role + postgres ────────────────────
-- Edge Functions usam service_role. Tudo que entra novo em public precisa
-- desses GRANTs senão Edge Functions devolvem permission denied.
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role, postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role, postgres;

-- Garante o mesmo pra objetos criados a partir daqui.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO service_role, postgres;
