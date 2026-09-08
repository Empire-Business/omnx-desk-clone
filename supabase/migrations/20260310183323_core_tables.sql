
-- Função de atualização automática de atualizado_em
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE public.clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  razao_social  TEXT,
  cnpj          TEXT,
  email         TEXT,
  telefone      TEXT,
  segmento      TEXT,
  logo_url      TEXT,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK ((SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente','atendimento'));
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
  USING ((SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente','atendimento'));
CREATE TRIGGER clients_atualizado_em BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ============================================================
-- CLIENT ASSIGNMENTS
-- ============================================================
CREATE TABLE public.client_assignments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL CHECK (tipo IN ('estrategista','atendimento')),
  ativo      BOOLEAN NOT NULL DEFAULT true,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id, tipo)
);
ALTER TABLE public.client_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_assignments_select" ON public.client_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_assignments_all" ON public.client_assignments FOR ALL TO authenticated
  USING ((SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente'))
  WITH CHECK ((SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente'));

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE public.products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  descricao     TEXT,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_select" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK ((SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente','atendimento','estrategista'));
CREATE POLICY "products_update" ON public.products FOR UPDATE TO authenticated
  USING ((SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente','atendimento','estrategista'));
CREATE TRIGGER products_atualizado_em BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ============================================================
-- DELIVERABLES
-- ============================================================
CREATE TABLE public.deliverables (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'outro' CHECK (tipo IN ('post_feed','stories','reels','video','copy','arte','relatorio','outro')),
  descricao     TEXT,
  quantidade    INTEGER NOT NULL DEFAULT 1,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deliverables_select" ON public.deliverables FOR SELECT TO authenticated USING (true);
CREATE POLICY "deliverables_insert" ON public.deliverables FOR INSERT TO authenticated
  WITH CHECK ((SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente','atendimento','estrategista'));
CREATE POLICY "deliverables_update" ON public.deliverables FOR UPDATE TO authenticated
  USING ((SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente','atendimento','estrategista'));
CREATE POLICY "deliverables_delete" ON public.deliverables FOR DELETE TO authenticated
  USING ((SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente'));
CREATE TRIGGER deliverables_atualizado_em BEFORE UPDATE ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ============================================================
-- DELIVERIES
-- ============================================================
CREATE TABLE public.deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id  UUID NOT NULL REFERENCES public.deliverables(id) ON DELETE RESTRICT,
  client_id       UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  titulo          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','aguardando_aprovacao','em_revisao','aprovado','reprovado','publicado')),
  responsavel_id  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  prazo           DATE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deliveries_select" ON public.deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "deliveries_insert" ON public.deliveries FOR INSERT TO authenticated
  WITH CHECK ((SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente','atendimento','estrategista'));
CREATE POLICY "deliveries_update" ON public.deliveries FOR UPDATE TO authenticated
  USING ((SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente','atendimento','estrategista'));
CREATE TRIGGER deliveries_atualizado_em BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ============================================================
-- DELIVERY VERSIONS
-- ============================================================
CREATE TABLE public.delivery_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id  UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  versao       INTEGER NOT NULL DEFAULT 1,
  notas        TEXT,
  criado_por   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, versao)
);
ALTER TABLE public.delivery_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "versions_select" ON public.delivery_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "versions_insert" ON public.delivery_versions FOR INSERT TO authenticated
  WITH CHECK ((SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente','atendimento','estrategista'));

-- ============================================================
-- DELIVERY CONTENT ITEMS
-- ============================================================
CREATE TABLE public.delivery_content_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id  UUID NOT NULL REFERENCES public.delivery_versions(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('imagem','video','documento','link','texto')),
  url         TEXT,
  texto       TEXT,
  nome        TEXT,
  tamanho     BIGINT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_select" ON public.delivery_content_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "content_insert" ON public.delivery_content_items FOR INSERT TO authenticated
  WITH CHECK ((SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente','atendimento','estrategista'));
CREATE POLICY "content_delete" ON public.delivery_content_items FOR DELETE TO authenticated
  USING ((SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente','atendimento','estrategista'));

-- ============================================================
-- DELIVERY APPROVALS
-- ============================================================
CREATE TABLE public.delivery_approvals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id  UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  version_id   UUID NOT NULL REFERENCES public.delivery_versions(id) ON DELETE CASCADE,
  aprovado_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
  aprovado     BOOLEAN NOT NULL,
  notas        TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approvals_select" ON public.delivery_approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "approvals_insert" ON public.delivery_approvals FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- DELIVERY COMMENTS
-- ============================================================
CREATE TABLE public.delivery_comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id  UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  version_id   UUID REFERENCES public.delivery_versions(id) ON DELETE SET NULL,
  autor_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  texto        TEXT NOT NULL,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_select" ON public.delivery_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "comments_insert" ON public.delivery_comments FOR INSERT TO authenticated WITH CHECK (true);
