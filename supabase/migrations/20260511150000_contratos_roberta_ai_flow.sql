-- 1) Permissão granular: usuários atendentes podem ganhar acesso ao módulo
--    de comissões/contratos sem virar gerente.
-- 2) Status 'rascunho' pra contratos criados pela IA (precisam ser revisados).
-- 3) Tabela de extrações da IA a partir do PDF (cache + revisão).
-- 4) RLS expandido nas tabelas contratos/comissoes/anexos pra incluir esses
--    usuários com acesso_contratos.

BEGIN;

-- ============================================================
-- Flag de acesso pontual ao módulo
-- ============================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS acesso_contratos BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_acesso_contratos ON public.users(acesso_contratos) WHERE acesso_contratos = true;

-- Helper SQL function (evita repetir o EXISTS em toda policy)
CREATE OR REPLACE FUNCTION public.pode_gerir_contratos()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND (perfil IN ('admin','gerente') OR acesso_contratos = true)
  );
$$;

-- ============================================================
-- Status 'rascunho' em contratos
-- ============================================================
ALTER TABLE public.contratos
  DROP CONSTRAINT IF EXISTS contratos_status_check;
ALTER TABLE public.contratos
  ADD CONSTRAINT contratos_status_check
  CHECK (status IN ('rascunho','ativo','cancelado','concluido'));

-- ============================================================
-- Extrações da IA (PDF → JSON estruturado)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contrato_pdf_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  anexo_id UUID REFERENCES public.contrato_anexos(id) ON DELETE SET NULL,
  modelo TEXT NOT NULL,                        -- ex: anthropic/claude-sonnet-4-6
  dados_extraidos JSONB NOT NULL,              -- campos + confidence
  tokens_input INT,
  tokens_output INT,
  aplicado_em TIMESTAMPTZ,                     -- quando o gestor aprovou e copiou pros campos do contrato
  aplicado_por UUID REFERENCES public.users(id),
  criado_por UUID REFERENCES public.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pdf_ext_contrato ON public.contrato_pdf_extractions(contrato_id, criado_em DESC);

ALTER TABLE public.contrato_pdf_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdf_ext_gerir_all" ON public.contrato_pdf_extractions
  FOR ALL TO authenticated
  USING (public.pode_gerir_contratos())
  WITH CHECK (public.pode_gerir_contratos());

-- ============================================================
-- Expandir RLS: contratos, comissoes, anexos, audit, aliases
-- ============================================================

-- contratos: gerir/admin/acesso_contratos
DROP POLICY IF EXISTS "contratos_admin_write" ON public.contratos;
CREATE POLICY "contratos_admin_write" ON public.contratos
  FOR ALL TO authenticated
  USING (public.pode_gerir_contratos())
  WITH CHECK (public.pode_gerir_contratos());

-- audit log
DROP POLICY IF EXISTS "audit_admin_read" ON public.contratos_audit_log;
CREATE POLICY "audit_admin_read" ON public.contratos_audit_log
  FOR SELECT TO authenticated
  USING (public.pode_gerir_contratos());

-- anexos
DROP POLICY IF EXISTS "anexos_admin_all" ON public.contrato_anexos;
CREATE POLICY "anexos_admin_all" ON public.contrato_anexos
  FOR ALL TO authenticated
  USING (public.pode_gerir_contratos())
  WITH CHECK (public.pode_gerir_contratos());

-- aliases
DROP POLICY IF EXISTS "aliases_admin_all" ON public.estrategista_aliases;
CREATE POLICY "aliases_admin_all" ON public.estrategista_aliases
  FOR ALL TO authenticated
  USING (public.pode_gerir_contratos())
  WITH CHECK (public.pode_gerir_contratos());

-- storage bucket
DROP POLICY IF EXISTS "anexos_storage_admin" ON storage.objects;
CREATE POLICY "anexos_storage_admin" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'contratos-anexos'
    AND public.pode_gerir_contratos()
  )
  WITH CHECK (
    bucket_id = 'contratos-anexos'
    AND public.pode_gerir_contratos()
  );

COMMIT;
