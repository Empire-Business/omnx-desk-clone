CREATE TABLE chat_quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  conteudo text NOT NULL,
  atalho text,
  categoria text DEFAULT 'geral',
  criado_por uuid REFERENCES users(id),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

ALTER TABLE chat_quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_team_quick_replies" ON chat_quick_replies
  FOR ALL USING (
    (SELECT users.perfil FROM users WHERE users.id = auth.uid())
    = ANY(ARRAY['admin', 'gerente', 'agente_chat', 'atendimento'])
  );
