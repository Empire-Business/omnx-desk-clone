-- personal_notes: scratchpad pessoal por usuário no EmpireChat
CREATE TABLE IF NOT EXISTS personal_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text        NOT NULL DEFAULT '',
  tipo        text        NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'imagem', 'documento')),
  media_url   text,
  pinned      boolean     NOT NULL DEFAULT false,
  tags        text[]      NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE personal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personal_notes_own" ON personal_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS personal_notes_user_id_idx ON personal_notes(user_id);
CREATE INDEX IF NOT EXISTS personal_notes_user_created_idx ON personal_notes(user_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE personal_notes;
