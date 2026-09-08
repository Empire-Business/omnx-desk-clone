
-- App settings key-value table
CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text UNIQUE NOT NULL,
  valor text NOT NULL DEFAULT '',
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Auto-update atualizado_em
CREATE OR REPLACE FUNCTION update_app_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_app_settings_updated
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_app_settings_timestamp();

-- RLS: only admins can read/write
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read app_settings"
  ON app_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.perfil = 'admin'
    )
  );

CREATE POLICY "Admins can insert app_settings"
  ON app_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.perfil = 'admin'
    )
  );

CREATE POLICY "Admins can update app_settings"
  ON app_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.perfil = 'admin'
    )
  );

-- Seed default values
INSERT INTO app_settings (chave, valor) VALUES
  ('chat_sla_primeira_resposta', '5'),
  ('chat_sla_resolucao', '24'),
  ('chat_auto_close_hours', '48'),
  ('chat_greeting_message', ''),
  ('cobranca_horario_inicio', '08:00'),
  ('cobranca_horario_fim', '18:00'),
  ('cobranca_max_envios_hora', '30'),
  ('cobranca_intervalo_min', '30'),
  ('cobranca_intervalo_max', '120'),
  ('uazapi_server_url', 'https://empirebusiness.uazapi.com'),
  ('openrouter_api_key', ''),
  ('app_name', 'EmpireDesk'),
  ('data_retention_days', '365')
ON CONFLICT (chave) DO NOTHING;
