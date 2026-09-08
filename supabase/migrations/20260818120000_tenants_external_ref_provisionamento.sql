-- ============================================================================
-- Provisionamento externo de empresas (chamado pela plataforma Empire OS)
-- ============================================================================
-- external_ref  → id da empresa no sistema de origem. É a chave de idempotência:
--                 se a plataforma repetir a chamada (retry, timeout, duplo clique),
--                 achamos o tenant que já existe em vez de criar outro.
-- atendimento_segmento / custom_domain → campos extras do payload de onboarding.
--
-- O índice é ÚNICO PARCIAL (where external_ref is not null) porque os tenants
-- criados à mão pela tela /empresas não têm referência externa — e vários NULLs
-- num índice único simples até funcionam no Postgres, mas o parcial deixa a
-- intenção explícita e o índice menor.
-- ============================================================================
SET search_path = public, pg_catalog;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS external_ref          text,
  ADD COLUMN IF NOT EXISTS atendimento_segmento  text,
  ADD COLUMN IF NOT EXISTS custom_domain         text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_external_ref
  ON public.tenants (external_ref)
  WHERE external_ref IS NOT NULL;

COMMENT ON COLUMN public.tenants.external_ref IS
  'ID da empresa no sistema que provisionou (Empire OS). Chave de idempotência do provision-tenant.';
COMMENT ON COLUMN public.tenants.atendimento_segmento IS
  'Segmento de atendimento informado no onboarding externo.';
COMMENT ON COLUMN public.tenants.custom_domain IS
  'Domínio próprio do tenant, quando houver.';
