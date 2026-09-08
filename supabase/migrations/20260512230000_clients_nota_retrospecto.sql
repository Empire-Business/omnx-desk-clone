-- Adiciona campo de nota (badge 1-10) e tabela de anotações cronológicas (retrospecto)
-- por cliente, escrita por consultor (estrategista), gerente ou admin.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS nota SMALLINT CHECK (nota IS NULL OR (nota >= 1 AND nota <= 10));

COMMENT ON COLUMN clients.nota IS 'Nota geral do cliente de 1 a 10, atribuída pelo time interno. NULL = sem nota.';

-- Tabela de anotações (retrospecto)
CREATE TABLE IF NOT EXISTS client_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_nome TEXT,                                -- snapshot do nome no momento da anotação
  conteudo    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON client_notes (client_id, created_at DESC);

-- RLS
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado que tenha acesso ao cliente
DROP POLICY IF EXISTS client_notes_select ON client_notes;
CREATE POLICY client_notes_select ON client_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (
          u.perfil IN ('admin', 'gerente')
          OR EXISTS (
            SELECT 1 FROM client_assignments ca
            WHERE ca.client_id = client_notes.client_id
              AND ca.user_id = auth.uid()
          )
        )
    )
  );

-- Inserção: admin, gerente ou estrategista vinculado
DROP POLICY IF EXISTS client_notes_insert ON client_notes;
CREATE POLICY client_notes_insert ON client_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (
          u.perfil IN ('admin', 'gerente')
          OR EXISTS (
            SELECT 1 FROM client_assignments ca
            WHERE ca.client_id = client_notes.client_id
              AND ca.user_id = auth.uid()
              AND ca.tipo = 'estrategista'
          )
        )
    )
  );

-- Edição/remoção: apenas o próprio autor, admin ou gerente
DROP POLICY IF EXISTS client_notes_update ON client_notes;
CREATE POLICY client_notes_update ON client_notes
  FOR UPDATE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );

DROP POLICY IF EXISTS client_notes_delete ON client_notes;
CREATE POLICY client_notes_delete ON client_notes
  FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_client_notes_updated_at ON client_notes;
CREATE TRIGGER set_client_notes_updated_at
  BEFORE UPDATE ON client_notes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
