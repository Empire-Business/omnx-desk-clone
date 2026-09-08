-- Sistema de tags para contratos.
-- `tags`: catálogo de tags (nome único case-insensitive + cor para o chip).
-- `contrato_tags`: relação N-N entre contratos e tags.
-- RLS: leitura e escrita para quem gere contratos (pode_gerir_contratos), para
-- permitir criar/aplicar tags na hora — não só admin.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  cor        TEXT NOT NULL DEFAULT '#64748b',
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nome único ignorando maiúsculas/minúsculas (evita "VIP" e "vip" duplicadas).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_nome ON public.tags (lower(nome));

CREATE TABLE IF NOT EXISTS public.contrato_tags (
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  criado_por  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contrato_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_contrato_tags_tag ON public.contrato_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_contrato_tags_contrato ON public.contrato_tags (contrato_id);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tags_read" ON public.tags;
CREATE POLICY "tags_read" ON public.tags
  FOR SELECT TO authenticated
  USING (public.pode_gerir_contratos());

DROP POLICY IF EXISTS "tags_write" ON public.tags;
CREATE POLICY "tags_write" ON public.tags
  FOR ALL TO authenticated
  USING (public.pode_gerir_contratos())
  WITH CHECK (public.pode_gerir_contratos());

DROP POLICY IF EXISTS "contrato_tags_read" ON public.contrato_tags;
CREATE POLICY "contrato_tags_read" ON public.contrato_tags
  FOR SELECT TO authenticated
  USING (public.pode_gerir_contratos());

DROP POLICY IF EXISTS "contrato_tags_write" ON public.contrato_tags;
CREATE POLICY "contrato_tags_write" ON public.contrato_tags
  FOR ALL TO authenticated
  USING (public.pode_gerir_contratos())
  WITH CHECK (public.pode_gerir_contratos());

COMMIT;
