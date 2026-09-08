-- Módulo de Pipeline de Vendas
-- Permite criar múltiplos pipelines, com etapas configuráveis e checkboxes por etapa.
-- Cada oportunidade é vinculada a um cliente e gera eventos para timeline.

-- =====================================================================
-- TABELAS
-- =====================================================================

CREATE TABLE IF NOT EXISTS sales_pipelines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  descricao   TEXT,
  ordem       INTEGER NOT NULL DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_por  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES sales_pipelines(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  ordem       INTEGER NOT NULL DEFAULT 0,
  cor         TEXT,
  -- status_final indica que oportunidades nessa etapa contam como ganhas/perdidas
  status_final TEXT CHECK (status_final IN ('ganho','perdido') OR status_final IS NULL),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_stages_pipeline ON sales_stages (pipeline_id, ordem);

CREATE TABLE IF NOT EXISTS sales_stage_checklist_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id    UUID NOT NULL REFERENCES sales_stages(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  ordem       INTEGER NOT NULL DEFAULT 0,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_stage_checklist_stage ON sales_stage_checklist_items (stage_id, ordem);

CREATE TABLE IF NOT EXISTS sales_opportunities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id   UUID NOT NULL REFERENCES sales_pipelines(id) ON DELETE RESTRICT,
  stage_id      UUID NOT NULL REFERENCES sales_stages(id) ON DELETE RESTRICT,
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL,
  produto       TEXT,                                                 -- produto/oferta livre
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,      -- opcional: vínculo com catálogo
  valor         NUMERIC(14,2),
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','ganha','perdida')),
  notas         TEXT,
  fechada_em    TIMESTAMPTZ,
  criado_por    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_opps_pipeline ON sales_opportunities (pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_sales_opps_client ON sales_opportunities (client_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS sales_opportunity_checklist (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  UUID NOT NULL REFERENCES sales_opportunities(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES sales_stage_checklist_items(id) ON DELETE CASCADE,
  marcada         BOOLEAN NOT NULL DEFAULT false,
  marcada_em      TIMESTAMPTZ,
  marcada_por     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (opportunity_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_sales_opp_checklist_opp ON sales_opportunity_checklist (opportunity_id);

CREATE TABLE IF NOT EXISTS sales_opportunity_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  UUID NOT NULL REFERENCES sales_opportunities(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('criada','moveu_etapa','checkbox_marcada','checkbox_desmarcada','nota','ganha','perdida','reaberta','editada')),
  payload         JSONB,
  autor_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  autor_nome      TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_events_opp ON sales_opportunity_events (opportunity_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_sales_events_client ON sales_opportunity_events (client_id, criado_em DESC);

-- =====================================================================
-- TRIGGER updated_at
-- =====================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_sales_pipelines_updated_at ON sales_pipelines;
CREATE TRIGGER set_sales_pipelines_updated_at BEFORE UPDATE ON sales_pipelines
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_sales_stages_updated_at ON sales_stages;
CREATE TRIGGER set_sales_stages_updated_at BEFORE UPDATE ON sales_stages
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_sales_opps_updated_at ON sales_opportunities;
CREATE TRIGGER set_sales_opps_updated_at BEFORE UPDATE ON sales_opportunities
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================

ALTER TABLE sales_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_stage_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_opportunity_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_opportunity_events ENABLE ROW LEVEL SECURITY;

-- --------- sales_pipelines ---------
-- Leitura: qualquer autenticado.
DROP POLICY IF EXISTS sales_pipelines_select ON sales_pipelines;
CREATE POLICY sales_pipelines_select ON sales_pipelines FOR SELECT TO authenticated USING (true);
-- Escrita: admin/gerente.
DROP POLICY IF EXISTS sales_pipelines_write ON sales_pipelines;
CREATE POLICY sales_pipelines_write ON sales_pipelines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin','gerente')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin','gerente')));

-- --------- sales_stages ---------
DROP POLICY IF EXISTS sales_stages_select ON sales_stages;
CREATE POLICY sales_stages_select ON sales_stages FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS sales_stages_write ON sales_stages;
CREATE POLICY sales_stages_write ON sales_stages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin','gerente')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin','gerente')));

-- --------- sales_stage_checklist_items ---------
DROP POLICY IF EXISTS sales_stage_checklist_items_select ON sales_stage_checklist_items;
CREATE POLICY sales_stage_checklist_items_select ON sales_stage_checklist_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS sales_stage_checklist_items_write ON sales_stage_checklist_items;
CREATE POLICY sales_stage_checklist_items_write ON sales_stage_checklist_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin','gerente')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin','gerente')));

-- --------- sales_opportunities ---------
-- Leitura: admin/gerente veem tudo; demais veem somente oportunidades de clientes atribuídos.
DROP POLICY IF EXISTS sales_opportunities_select ON sales_opportunities;
CREATE POLICY sales_opportunities_select ON sales_opportunities FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid()
      AND (
        u.perfil IN ('admin','gerente','atendimento')
        OR EXISTS (
          SELECT 1 FROM client_assignments ca
          WHERE ca.client_id = sales_opportunities.client_id AND ca.user_id = auth.uid()
        )
      )
  )
);
-- Escrita: admin/gerente/atendimento ou estrategista vinculado.
DROP POLICY IF EXISTS sales_opportunities_insert ON sales_opportunities;
CREATE POLICY sales_opportunities_insert ON sales_opportunities FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid()
      AND (
        u.perfil IN ('admin','gerente','atendimento')
        OR EXISTS (
          SELECT 1 FROM client_assignments ca
          WHERE ca.client_id = sales_opportunities.client_id AND ca.user_id = auth.uid()
        )
      )
  )
);
DROP POLICY IF EXISTS sales_opportunities_update ON sales_opportunities;
CREATE POLICY sales_opportunities_update ON sales_opportunities FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid()
      AND (
        u.perfil IN ('admin','gerente','atendimento')
        OR EXISTS (
          SELECT 1 FROM client_assignments ca
          WHERE ca.client_id = sales_opportunities.client_id AND ca.user_id = auth.uid()
        )
      )
  )
);
DROP POLICY IF EXISTS sales_opportunities_delete ON sales_opportunities;
CREATE POLICY sales_opportunities_delete ON sales_opportunities FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin','gerente'))
);

-- --------- sales_opportunity_checklist ---------
DROP POLICY IF EXISTS sales_opp_checklist_select ON sales_opportunity_checklist;
CREATE POLICY sales_opp_checklist_select ON sales_opportunity_checklist FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM sales_opportunities o
    WHERE o.id = sales_opportunity_checklist.opportunity_id
      AND EXISTS (
        SELECT 1 FROM users u WHERE u.id = auth.uid()
          AND (
            u.perfil IN ('admin','gerente','atendimento')
            OR EXISTS (SELECT 1 FROM client_assignments ca WHERE ca.client_id = o.client_id AND ca.user_id = auth.uid())
          )
      )
  )
);
DROP POLICY IF EXISTS sales_opp_checklist_write ON sales_opportunity_checklist;
CREATE POLICY sales_opp_checklist_write ON sales_opportunity_checklist FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales_opportunities o
      WHERE o.id = sales_opportunity_checklist.opportunity_id
        AND EXISTS (
          SELECT 1 FROM users u WHERE u.id = auth.uid()
            AND (
              u.perfil IN ('admin','gerente','atendimento')
              OR EXISTS (SELECT 1 FROM client_assignments ca WHERE ca.client_id = o.client_id AND ca.user_id = auth.uid())
            )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales_opportunities o
      WHERE o.id = sales_opportunity_checklist.opportunity_id
        AND EXISTS (
          SELECT 1 FROM users u WHERE u.id = auth.uid()
            AND (
              u.perfil IN ('admin','gerente','atendimento')
              OR EXISTS (SELECT 1 FROM client_assignments ca WHERE ca.client_id = o.client_id AND ca.user_id = auth.uid())
            )
        )
    )
  );

-- --------- sales_opportunity_events ---------
DROP POLICY IF EXISTS sales_opp_events_select ON sales_opportunity_events;
CREATE POLICY sales_opp_events_select ON sales_opportunity_events FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid()
      AND (
        u.perfil IN ('admin','gerente','atendimento')
        OR EXISTS (SELECT 1 FROM client_assignments ca WHERE ca.client_id = sales_opportunity_events.client_id AND ca.user_id = auth.uid())
      )
  )
);
DROP POLICY IF EXISTS sales_opp_events_insert ON sales_opportunity_events;
CREATE POLICY sales_opp_events_insert ON sales_opportunity_events FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid()
      AND (
        u.perfil IN ('admin','gerente','atendimento')
        OR EXISTS (SELECT 1 FROM client_assignments ca WHERE ca.client_id = sales_opportunity_events.client_id AND ca.user_id = auth.uid())
      )
  )
);

-- =====================================================================
-- SEED — pipeline "Evento presencial"
-- =====================================================================

DO $$
DECLARE
  v_pipeline_id UUID;
  v_stage_prospec_id UUID;
  v_stage_base UUID;
  v_stage_conexao UUID;
  v_stage_reuagend UUID;
  v_stage_noshow UUID;
  v_stage_reureal UUID;
  v_stage_proposta UUID;
  v_stage_nego UUID;
  v_stage_perdido UUID;
BEGIN
  -- Não duplicar se já existir
  IF EXISTS (SELECT 1 FROM sales_pipelines WHERE nome = 'Evento presencial') THEN
    RETURN;
  END IF;

  INSERT INTO sales_pipelines (nome, descricao, ordem)
  VALUES ('Evento presencial', 'Pipeline padrão para vendas em eventos presenciais', 0)
  RETURNING id INTO v_pipeline_id;

  INSERT INTO sales_stages (pipeline_id, nome, ordem, cor) VALUES (v_pipeline_id, 'Base', 1, '#94a3b8') RETURNING id INTO v_stage_base;
  INSERT INTO sales_stages (pipeline_id, nome, ordem, cor) VALUES (v_pipeline_id, 'Prospecção', 2, '#3b82f6') RETURNING id INTO v_stage_prospec_id;
  INSERT INTO sales_stages (pipeline_id, nome, ordem, cor) VALUES (v_pipeline_id, 'Conexão', 3, '#06b6d4') RETURNING id INTO v_stage_conexao;
  INSERT INTO sales_stages (pipeline_id, nome, ordem, cor) VALUES (v_pipeline_id, 'Reunião Agendada', 4, '#8b5cf6') RETURNING id INTO v_stage_reuagend;
  INSERT INTO sales_stages (pipeline_id, nome, ordem, cor) VALUES (v_pipeline_id, 'No Show', 5, '#f59e0b') RETURNING id INTO v_stage_noshow;
  INSERT INTO sales_stages (pipeline_id, nome, ordem, cor) VALUES (v_pipeline_id, 'Reunião Realizada', 6, '#10b981') RETURNING id INTO v_stage_reureal;
  INSERT INTO sales_stages (pipeline_id, nome, ordem, cor) VALUES (v_pipeline_id, 'Proposta enviada', 7, '#22c55e') RETURNING id INTO v_stage_proposta;
  INSERT INTO sales_stages (pipeline_id, nome, ordem, cor) VALUES (v_pipeline_id, 'Em negociação', 8, '#84cc16') RETURNING id INTO v_stage_nego;
  INSERT INTO sales_stages (pipeline_id, nome, ordem, cor, status_final) VALUES (v_pipeline_id, 'Perdido', 9, '#ef4444', 'perdido') RETURNING id INTO v_stage_perdido;

  -- Checklist da etapa "Prospecção"
  INSERT INTO sales_stage_checklist_items (stage_id, label, ordem) VALUES
    (v_stage_prospec_id, 'Tentativa de contato 1 (ligação)',  1),
    (v_stage_prospec_id, 'Tentativa de contato 1 (instagram)', 2),
    (v_stage_prospec_id, 'Tentativa de contato 1 (whatsapp)',  3),
    (v_stage_prospec_id, 'Tentativa de contato 2 (ligação)',   4),
    (v_stage_prospec_id, 'Tentativa de contato 2 (instagram)', 5),
    (v_stage_prospec_id, 'Tentativa de contato 2 (whatsapp)',  6),
    (v_stage_prospec_id, 'Tentativa de contato 3 (ligação)',   7),
    (v_stage_prospec_id, 'Tentativa de contato 3 (instagram)', 8),
    (v_stage_prospec_id, 'Tentativa de contato 3 (whatsapp)',  9);
END $$;
