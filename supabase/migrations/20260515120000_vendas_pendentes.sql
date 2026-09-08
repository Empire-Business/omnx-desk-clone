-- Módulo de Vendas Pendentes
-- Formulário público preenchido por closers; equipe de atendimento valida e segue o fluxo.

-- =====================================================================
-- TABELA
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.vendas_pendentes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- closer (identificação manual, sem cadastro)
  closer_nome     TEXT NOT NULL,
  closer_email    TEXT NOT NULL,
  -- cliente
  cliente_nome    TEXT NOT NULL,
  cliente_cpf_cnpj TEXT,
  cliente_email   TEXT,
  cliente_whatsapp TEXT NOT NULL,
  -- produto vendido (FK opcional pra catálogo)
  produto_id      UUID REFERENCES public.products(id) ON DELETE SET NULL,
  produto_nome    TEXT,
  -- pagamentos: array de objetos { data, valor, forma, plataforma, sinal }
  pagamentos      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- comprovantes: array de objetos { storage_path, nome_original, mime_type, tamanho_bytes }
  comprovantes    JSONB NOT NULL DEFAULT '[]'::jsonb,
  observacoes     TEXT,
  -- workflow
  status          TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','em_atendimento','concluida','descartada')),
  atendido_por    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  atendido_em     TIMESTAMPTZ,
  -- rastreio
  ip_origem       TEXT,
  user_agent      TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendas_pendentes_status ON public.vendas_pendentes(status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_vendas_pendentes_criado ON public.vendas_pendentes(criado_em DESC);

-- Trigger atualizado_em
CREATE OR REPLACE FUNCTION public.tg_vendas_pendentes_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendas_pendentes_updated ON public.vendas_pendentes;
CREATE TRIGGER trg_vendas_pendentes_updated
  BEFORE UPDATE ON public.vendas_pendentes
  FOR EACH ROW EXECUTE FUNCTION public.tg_vendas_pendentes_updated();

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE public.vendas_pendentes ENABLE ROW LEVEL SECURITY;

-- Leitura/escrita: somente perfil atendimento/admin/gerente
DROP POLICY IF EXISTS "vendas_pendentes_atendimento_all" ON public.vendas_pendentes;
CREATE POLICY "vendas_pendentes_atendimento_all" ON public.vendas_pendentes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente','atendimento'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente','atendimento'))
  );

-- Nota: inserção do form público é feita via edge function com service_role (bypassa RLS).

-- =====================================================================
-- BUCKET STORAGE: vendas-comprovantes (privado)
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('vendas-comprovantes', 'vendas-comprovantes', false)
ON CONFLICT (id) DO NOTHING;

-- Leitura: atendimento/admin/gerente
DROP POLICY IF EXISTS "vendas_comprovantes_atendimento_read" ON storage.objects;
CREATE POLICY "vendas_comprovantes_atendimento_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'vendas-comprovantes'
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente','atendimento'))
  );

-- Escrita do form público também via edge function com service_role.
