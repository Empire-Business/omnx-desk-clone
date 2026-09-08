
-- ═══════════════════════════════════════════════════════════════════
-- 1. API Keys — chaves para acesso à API REST pública
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL, -- primeiros 8 chars para identificação visual
  permissoes jsonb NOT NULL DEFAULT '[]'::jsonb, -- array de strings: ["send_message","list_conversations",...]
  criado_por uuid REFERENCES users(id),
  ativo boolean NOT NULL DEFAULT true,
  ultimo_uso timestamptz,
  expira_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_manage_api_keys" ON api_keys FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil = 'admin')
);

-- ═══════════════════════════════════════════════════════════════════
-- 2. Webhooks — webhooks de saída (outbound)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  url text NOT NULL,
  secret text NOT NULL, -- para HMAC-SHA256
  eventos text[] NOT NULL DEFAULT '{}', -- array de eventos: message.received, conversation.closed, etc.
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_manage_webhooks" ON webhooks FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil = 'admin')
);

-- ═══════════════════════════════════════════════════════════════════
-- 3. Webhook Logs — log dos últimos disparos
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  evento text NOT NULL,
  payload jsonb,
  status_code integer,
  response_body text,
  duracao_ms integer,
  sucesso boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_view_webhook_logs" ON webhook_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil = 'admin')
);

CREATE INDEX idx_webhook_logs_webhook_id ON webhook_logs(webhook_id);
CREATE INDEX idx_webhook_logs_criado_em ON webhook_logs(criado_em DESC);

-- ═══════════════════════════════════════════════════════════════════
-- 4. Audit Logs — logs de auditoria do sistema
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  user_nome text,
  user_perfil text,
  acao text NOT NULL, -- ex: 'create', 'update', 'delete', 'login', 'logout'
  entidade text NOT NULL, -- ex: 'delivery', 'client', 'conversation', 'user'
  entidade_id text, -- ID do registro afetado
  detalhes jsonb, -- campos alterados, valores antigos/novos
  ip_address text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_view_audit_logs" ON audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil = 'admin')
);
CREATE POLICY "system_insert_audit_logs" ON audit_logs FOR INSERT WITH CHECK (true);

CREATE INDEX idx_audit_logs_criado_em ON audit_logs(criado_em DESC);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entidade ON audit_logs(entidade, entidade_id);
CREATE INDEX idx_audit_logs_acao ON audit_logs(acao);

-- ═══════════════════════════════════════════════════════════════════
-- 5. Client Interactions — registro de interações com clientes
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS client_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  tipo text NOT NULL CHECK (tipo IN ('ligacao', 'reuniao', 'email', 'whatsapp', 'visita', 'outro')),
  titulo text NOT NULL,
  descricao text,
  data_interacao timestamptz NOT NULL DEFAULT now(),
  duracao_minutos integer,
  resultado text, -- ex: 'positivo', 'neutro', 'negativo'
  proxima_acao text,
  proxima_acao_data timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_manage_interactions" ON client_interactions FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'atendimento'))
);

CREATE INDEX idx_client_interactions_client ON client_interactions(client_id);
CREATE INDEX idx_client_interactions_data ON client_interactions(data_interacao DESC);

-- ═══════════════════════════════════════════════════════════════════
-- 6. Chat Templates — templates de mensagens estruturadas WhatsApp
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS chat_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  categoria text NOT NULL CHECK (categoria IN ('saudacao', 'encerramento', 'csat', 'informativo', 'cobranca', 'outro')),
  conteudo text NOT NULL, -- texto com variáveis: {{nome}}, {{protocolo}}, {{empresa}}
  variaveis text[] NOT NULL DEFAULT '{}', -- lista de variáveis usadas
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_manage_templates" ON chat_templates FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
);
CREATE POLICY "agents_view_templates" ON chat_templates FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
);

-- ═══════════════════════════════════════════════════════════════════
-- 7. Email Queue — fila de e-mails para envio assíncrono
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_email text NOT NULL,
  destinatario_nome text,
  assunto text NOT NULL,
  corpo_html text NOT NULL,
  corpo_texto text,
  tipo text NOT NULL DEFAULT 'transacional', -- transacional, resumo_diario, marketing
  referencia_tipo text, -- notification, nps, delivery, etc.
  referencia_id text,
  tentativas integer NOT NULL DEFAULT 0,
  max_tentativas integer NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviando', 'enviado', 'erro')),
  erro text,
  enviado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_view_email_queue" ON email_queue FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil = 'admin')
);
CREATE POLICY "system_manage_email_queue" ON email_queue FOR ALL USING (true);

CREATE INDEX idx_email_queue_status ON email_queue(status) WHERE status = 'pendente';
CREATE INDEX idx_email_queue_criado_em ON email_queue(criado_em DESC);
