-- Acréscimos na tabela tenants pra suportar o padrão de clonagem da OMNX:
--   * logo_dark_url  → variante do logo pro modo escuro
--   * custom_domain  → domínio próprio do tenant (ex: app.empresax.com.br),
--                       usado pelo hook useTenantByDomain pra aplicar branding
--                       já no /auth (antes do login).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS logo_dark_url TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain TEXT;

-- Índice único case-insensitive (parcial: só rows com domínio definido).
CREATE UNIQUE INDEX IF NOT EXISTS tenants_custom_domain_key
  ON public.tenants (LOWER(custom_domain))
  WHERE custom_domain IS NOT NULL;
