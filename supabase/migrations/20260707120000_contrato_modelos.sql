-- Gerador de contrato automático — modelos por produto.
-- Cada produto pode ter um modelo de contrato (texto com campos {{...}}).
-- produto_id NULL = modelo padrão (fallback quando o produto não tem modelo próprio).
-- RLS: leitura para quem gere contratos; escrita só admin.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contrato_modelos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id    UUID REFERENCES public.products(id) ON DELETE CASCADE,
  titulo        TEXT,
  conteudo      TEXT NOT NULL DEFAULT '',
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um modelo por produto (e um único modelo padrão com produto_id NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contrato_modelos_produto
  ON public.contrato_modelos (coalesce(produto_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE public.contrato_modelos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "modelos_read" ON public.contrato_modelos;
CREATE POLICY "modelos_read" ON public.contrato_modelos
  FOR SELECT TO authenticated
  USING (public.pode_gerir_contratos());

DROP POLICY IF EXISTS "modelos_admin_write" ON public.contrato_modelos;
CREATE POLICY "modelos_admin_write" ON public.contrato_modelos
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;
