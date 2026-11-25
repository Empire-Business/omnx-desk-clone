-- ============================================================================
-- Automações WhatsApp — ASSISTENTE DA EQUIPE: base (Fases 1a e 1b do plano)
-- ============================================================================
-- Plano aprovado em 26/10/2026 ("Assistente da equipe no WhatsApp").
--
-- O que cria (nada responde ainda; quem responde é wa-agente-responder, Fase 1c):
--   1) wa_webhook_tokens + RPC wa_webhook_instancia_do_token: token por instância
--      na URL do webhook da UAZAPI (só o sha256 fica no banco). Sem token válido o
--      uazapi-webhook não aciona o assistente; token inválido nem grava.
--   2) wa_auto_config + agente_* (liga/desliga, nome, onde responde, limite/hora).
--   3) wa_agente_membros: quem da equipe fala com o assistente (user ↔ telefone).
--   4) wa_agente_grupos (+ acesso_total) e wa_agente_grupo_numeros (reservas):
--      grupos internos liberados. Grupo liberado vira RESTRITO no Chat
--      (private.marcar_grupo_restrito, migration 20261026260000).
--   5) wa_agente_pedidos (fila + idempotência por message_id_wpp) e
--      wa_agente_execucoes (log SEM conteúdo).
--   6) has_permissao_de / wa_agente_escopo / wa_agente_reivindicar (service_role).
--   7) Acordar wa-agente-responder: trigger (pg_net) + varredura de 1 min;
--      retenção diária (pedidos 30 dias, execuções 90 dias).
--
-- Segurança:
--   * RLS em tudo + policy RESTRICTIVE tenant_isolation. Escrita do front só com
--     has_permissao('automacoes-wa','admin') e só nas colunas que o front pode
--     mexer (GRANT por coluna). Colunas do servidor (boas_vindas_em,
--     participantes_*) só service_role grava — senão o front "provaria" que um
--     grupo não tem gente de fora.
--   * wa_agente_pedidos / wa_webhook_tokens: front não lê nem escreve.
--   * Funções de identidade/escopo/fila: só service_role (REVOKE de PUBLIC,
--     anon, authenticated).
--   * Sem regex com contador > 255 (limite do Postgres); tamanhos via length().
--
-- Ordem de publicação: ver docs (relato da entrega). Resumo: esta migration →
--   publicar uazapi-webhook (aceita /k/<token>) → wa-agente-admin → proteger o
--   webhook de cada número pela tela → wa-agente-responder (Fase 1c).
--
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS; jobs do cron
-- removidos e recriados pelo nome.
--
-- Reversão (manual, nesta ordem):
--   SELECT cron.unschedule('wa-agente-varredura-1min');
--   SELECT cron.unschedule('wa-agente-retencao');
--   DROP TABLE IF EXISTS public.wa_agente_execucoes, public.wa_agente_pedidos,
--     public.wa_agente_grupo_numeros, public.wa_agente_grupos,
--     public.wa_agente_membros, public.wa_webhook_tokens CASCADE;
--   DROP FUNCTION IF EXISTS public.wa_agente_reivindicar(int),
--     public.wa_agente_escopo(uuid, uuid), public.has_permissao_de(uuid, text, text),
--     public.wa_webhook_instancia_do_token(text);
--   ALTER TABLE public.wa_auto_config DROP COLUMN IF EXISTS agente_ativo, … (6 colunas);
--   (grupos já marcados como restritos continuam restritos — decisão de 20261026260000)
-- ============================================================================

BEGIN;
-- Não fica esperando lock em tabela quente (falha rápido e pode repetir).
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1) Token por instância do webhook
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_webhook_tokens (
  instance_id     UUID PRIMARY KEY REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- sha256(token em UTF-8). O token em si nunca é gravado.
  token_hash      BYTEA NOT NULL,
  -- Rotação sem perder mensagem: o hash anterior vale por alguns minutos.
  token_hash_anterior BYTEA,
  anterior_ate    TIMESTAMPTZ,
  -- LID ("<n>@lid") do próprio número — em grupo o WhatsApp menciona por LID.
  -- Preenchido pelo servidor (uazapi-webhook), nunca pelo front.
  instancia_lid   TEXT CHECK (instancia_lid IS NULL OR (length(instancia_lid) <= 40 AND instancia_lid ~ '^[0-9]+@lid$')),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotacionado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_uso_em   TIMESTAMPTZ,
  CHECK (length(token_hash) = 32),
  CHECK (token_hash_anterior IS NULL OR length(token_hash_anterior) = 32)
);

COMMENT ON TABLE public.wa_webhook_tokens IS
  'Token do webhook da UAZAPI por instância (só o sha256). Escrito por wa-agente-admin (service_role). Front não lê.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_webhook_tokens_hash ON public.wa_webhook_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_wa_webhook_tokens_hash_anterior
  ON public.wa_webhook_tokens (token_hash_anterior) WHERE token_hash_anterior IS NOT NULL;

-- tenant_id vem SEMPRE da instância (nunca de quem grava).
CREATE OR REPLACE FUNCTION public.wa_webhook_tokens_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  SELECT wi.tenant_id INTO NEW.tenant_id FROM public.whatsapp_instances wi WHERE wi.id = NEW.instance_id;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Instância não encontrada.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.wa_webhook_tokens_tenant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wa_webhook_tokens_tenant ON public.wa_webhook_tokens;
CREATE TRIGGER wa_webhook_tokens_tenant
  BEFORE INSERT OR UPDATE OF instance_id, tenant_id ON public.wa_webhook_tokens
  FOR EACH ROW EXECUTE FUNCTION public.wa_webhook_tokens_tenant();

ALTER TABLE public.wa_webhook_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_webhook_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wa_webhook_tokens TO service_role;
DROP POLICY IF EXISTS wa_webhook_tokens_tenant_isolation ON public.wa_webhook_tokens;
CREATE POLICY wa_webhook_tokens_tenant_isolation ON public.wa_webhook_tokens
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));
-- Sem policy permissiva: authenticated não vê nada (e nem tem GRANT).

-- Token → instância/empresa. Compara resumos (tamanho fixo). Atualiza
-- ultimo_uso_em no máximo 1x/minuto (não escreve a cada mensagem).
CREATE OR REPLACE FUNCTION public.wa_webhook_instancia_do_token(p_token text)
RETURNS TABLE (instance_uuid uuid, tenant_id uuid, instance_id text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_hash BYTEA;
  v_inst UUID;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 OR length(p_token) > 256 THEN
    RETURN;
  END IF;
  v_hash := sha256(convert_to(p_token, 'UTF8'));

  SELECT t.instance_id INTO v_inst
    FROM public.wa_webhook_tokens t
   WHERE t.token_hash = v_hash
      OR (t.token_hash_anterior = v_hash AND t.anterior_ate > now())
   LIMIT 1;
  IF v_inst IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.wa_webhook_tokens t
     SET ultimo_uso_em = now()
   WHERE t.instance_id = v_inst
     AND (t.ultimo_uso_em IS NULL OR t.ultimo_uso_em < now() - interval '1 minute');

  RETURN QUERY
    SELECT wi.id, wi.tenant_id, wi.instance_id
      FROM public.whatsapp_instances wi
      JOIN public.wa_webhook_tokens t ON t.instance_id = wi.id AND t.tenant_id = wi.tenant_id
     WHERE wi.id = v_inst;
END;
$fn$;

COMMENT ON FUNCTION public.wa_webhook_instancia_do_token(text) IS
  'uazapi-webhook: token da URL → instância e empresa (vazio = token inválido). Só service_role.';
REVOKE ALL ON FUNCTION public.wa_webhook_instancia_do_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_webhook_instancia_do_token(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Configuração do assistente (wa_auto_config)
-- ---------------------------------------------------------------------------
ALTER TABLE public.wa_auto_config
  ADD COLUMN IF NOT EXISTS agente_ativo        BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agente_nome         TEXT     NOT NULL DEFAULT 'Ana',
  ADD COLUMN IF NOT EXISTS agente_nome_contato TEXT,
  ADD COLUMN IF NOT EXISTS agente_privado      BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS agente_grupos       BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agente_limite_hora  SMALLINT NOT NULL DEFAULT 30;

ALTER TABLE public.wa_auto_config DROP CONSTRAINT IF EXISTS wa_auto_config_agente_nome_check;
ALTER TABLE public.wa_auto_config
  ADD CONSTRAINT wa_auto_config_agente_nome_check CHECK (
    length(btrim(agente_nome)) BETWEEN 2 AND 24
    AND agente_nome ~ '^[[:alpha:]][[:alpha:] ]*$'
  );
ALTER TABLE public.wa_auto_config DROP CONSTRAINT IF EXISTS wa_auto_config_agente_nome_contato_check;
ALTER TABLE public.wa_auto_config
  ADD CONSTRAINT wa_auto_config_agente_nome_contato_check CHECK (
    agente_nome_contato IS NULL OR length(agente_nome_contato) <= 60
  );
ALTER TABLE public.wa_auto_config DROP CONSTRAINT IF EXISTS wa_auto_config_agente_limite_hora_check;
ALTER TABLE public.wa_auto_config
  ADD CONSTRAINT wa_auto_config_agente_limite_hora_check CHECK (agente_limite_hora BETWEEN 1 AND 120);

COMMENT ON COLUMN public.wa_auto_config.agente_ativo IS 'Assistente da equipe ligado. false = silêncio imediato.';
COMMENT ON COLUMN public.wa_auto_config.agente_nome IS 'Nome do assistente (2–24 letras/espaços). Usado no gatilho por nome no grupo.';
COMMENT ON COLUMN public.wa_auto_config.agente_nome_contato IS 'Nome salvo/perfil do número do assistente (só para a instrução "como chamar").';
COMMENT ON COLUMN public.wa_auto_config.agente_privado IS 'Responde no privado de membros da equipe.';
COMMENT ON COLUMN public.wa_auto_config.agente_grupos IS 'Responde nos grupos internos liberados (wa_agente_grupos).';
COMMENT ON COLUMN public.wa_auto_config.agente_limite_hora IS 'Máximo de respostas por pessoa por hora (1–120).';

-- ---------------------------------------------------------------------------
-- 3) Permissão de OUTRO usuário (servidor decide escopo de quem perguntou)
--    Mesmo corpo de has_permissao (20260804160000), trocando auth.uid() por
--    p_user_id e o tenant da sessão por users.tenant_id; exige users.ativo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permissao_de(p_user_id uuid, p_recurso text, p_acao text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH u AS (
    SELECT us.perfil, us.tenant_id
      FROM public.users us
     WHERE us.id = p_user_id
       AND us.ativo IS TRUE
  )
  SELECT
    COALESCE((SELECT u.perfil = 'admin' FROM u), false)
    OR EXISTS (
      SELECT 1
        FROM public.permissoes_app pa
        JOIN u ON pa.tenant_id = u.tenant_id AND pa.perfil = u.perfil
       WHERE pa.recurso IN (p_recurso, '*')
         AND pa.acao IN (
           SELECT unnest(
             CASE p_acao
               WHEN 'ver'    THEN ARRAY['ver','editar','admin']
               WHEN 'editar' THEN ARRAY['editar','admin']
               WHEN 'admin'  THEN ARRAY['admin']
               ELSE ARRAY[p_acao]
             END
           )
         )
    );
$fn$;

COMMENT ON FUNCTION public.has_permissao_de(uuid, text, text) IS
  'has_permissao para um usuário informado pelo servidor (ativo, tenant do próprio usuário). Só service_role.';
REVOKE ALL ON FUNCTION public.has_permissao_de(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_permissao_de(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Membros da equipe que falam com o assistente
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_agente_membros (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- E.164, mesmo CHECK de wa_auto_gestores.telefone.
  telefone      TEXT NOT NULL CHECK (telefone ~ '^\+[1-9][0-9]{9,14}$'),
  -- Chave canônica (só dígitos), sempre com o 9º dígito no celular BR:
  --   celular BR gravado sem o 9 (+55 DDD [6-9]xxxxxxx) → '55' || DDD || '9' || 8 dígitos;
  --   qualquer outro → os dígitos do E.164 sem o '+'.
  -- MESMA regra de chaveTelefoneBR (supabase/functions/_shared/wa-telefone.ts).
  telefone_chave TEXT GENERATED ALWAYS AS (
    CASE
      WHEN telefone ~ '^\+55[1-9][0-9][6-9][0-9]{7}$'
        THEN '55' || substr(telefone, 4, 2) || '9' || substr(telefone, 6)
      ELSE substr(telefone, 2)
    END
  ) STORED,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  boas_vindas_em TIMESTAMPTZ,
  created_by    UUID DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, telefone_chave),
  UNIQUE (tenant_id, user_id)
);

COMMENT ON TABLE public.wa_agente_membros IS
  'Pessoas da equipe (usuário ativo, não cliente) que podem falar com o assistente pelo WhatsApp. Máximo de 100 por empresa.';

CREATE OR REPLACE FUNCTION public.wa_agente_confere_membro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- Usuário logado só grava na própria empresa (recusa genérica, antes do RLS).
  IF auth.uid() IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM public.get_user_tenant_id() THEN
    RAISE EXCEPTION 'Registro não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  -- Pausar nunca é bloqueado.
  IF TG_OP = 'UPDATE' AND NEW.ativo = false
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = NEW.user_id
       AND u.tenant_id = NEW.tenant_id
       AND u.ativo IS TRUE
       AND u.perfil IS DISTINCT FROM 'cliente'
  ) THEN
    RAISE EXCEPTION 'Usuário não encontrado nesta empresa (ou inativo, ou é cliente).' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtext('wa_agente_membros:' || NEW.tenant_id::text));
    IF (SELECT count(*) FROM public.wa_agente_membros WHERE tenant_id = NEW.tenant_id) >= 100 THEN
      RAISE EXCEPTION 'Limite de 100 pessoas por empresa atingido.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.wa_agente_confere_membro() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wa_agente_confere_membro ON public.wa_agente_membros;
-- Depois do carimbo de tenant (set_tenant_id_* < wa_agente_*).
CREATE TRIGGER wa_agente_confere_membro
  BEFORE INSERT OR UPDATE OF user_id, telefone, ativo, tenant_id ON public.wa_agente_membros
  FOR EACH ROW EXECUTE FUNCTION public.wa_agente_confere_membro();

CREATE INDEX IF NOT EXISTS idx_wa_agente_membros_user ON public.wa_agente_membros (user_id);

-- ---------------------------------------------------------------------------
-- 5) Grupos internos liberados
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_agente_grupos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  grupo_jid     TEXT NOT NULL,
  nome          TEXT,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  -- true = QUALQUER participante do grupo pode acionar o assistente e vê tudo
  -- (decisão do dono, 26/10/2026). false = só membros (wa_agente_membros).
  acesso_total  BOOLEAN NOT NULL DEFAULT false,
  -- Colunas do SERVIDOR (front não grava — GRANT por coluna abaixo):
  boas_vindas_em              TIMESTAMPTZ,
  participantes_verificados_em TIMESTAMPTZ,
  participantes_membros       UUID[],
  participantes_externos      INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, grupo_jid)
);

ALTER TABLE public.wa_agente_grupos DROP CONSTRAINT IF EXISTS wa_agente_grupos_grupo_jid_check;
ALTER TABLE public.wa_agente_grupos
  ADD CONSTRAINT wa_agente_grupos_grupo_jid_check CHECK (
    length(grupo_jid) <= 60
    AND grupo_jid ~ '^(120363[0-9]{9,15}|[1-9][0-9]{9,14}-[0-9]{9,11})@g\.us$'
  );
ALTER TABLE public.wa_agente_grupos DROP CONSTRAINT IF EXISTS wa_agente_grupos_nome_check;
ALTER TABLE public.wa_agente_grupos
  ADD CONSTRAINT wa_agente_grupos_nome_check CHECK (nome IS NULL OR length(nome) <= 120);

COMMENT ON TABLE public.wa_agente_grupos IS
  'Grupos INTERNOS onde o assistente responde (quando chamado). Conferidos pelo banco: grupo do número configurado, sem vínculo/nome de cliente. Viram restritos no Chat (só admin/gerente). Máximo de 10 por empresa.';
COMMENT ON COLUMN public.wa_agente_grupos.acesso_total IS
  'true = qualquer participante do grupo aciona o assistente e vê tudo; false = só membros cadastrados, cada um com a própria carteira.';

-- Mesma conferência de wa_auto_confere_grupo_gestor (20261026250000), para a
-- tabela do assistente. SECURITY DEFINER: lê Chat/clientes sem depender da RLS.
CREATE OR REPLACE FUNCTION public.wa_agente_confere_grupo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_inst_txt TEXT;
  v_inst     UUID;
  v_base     TEXT;
  v_nome     TEXT;
  v_chave    TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM public.get_user_tenant_id() THEN
    RAISE EXCEPTION 'Registro não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  -- Pausar nunca é bloqueado.
  IF TG_OP = 'UPDATE' AND NEW.ativo = false
     AND NEW.grupo_jid IS NOT DISTINCT FROM OLD.grupo_jid
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id THEN
    RETURN NEW;
  END IF;

  NEW.grupo_jid := lower(btrim(coalesce(NEW.grupo_jid, '')));
  IF NEW.grupo_jid <> '' AND right(NEW.grupo_jid, 5) <> '@g.us' THEN
    NEW.grupo_jid := NEW.grupo_jid || '@g.us';
  END IF;
  IF length(NEW.grupo_jid) > 60
     OR NEW.grupo_jid !~ '^(120363[0-9]{9,15}|[1-9][0-9]{9,14}-[0-9]{9,11})@g\.us$' THEN
    RAISE EXCEPTION 'Grupo inválido.' USING ERRCODE = 'check_violation';
  END IF;
  v_base := left(NEW.grupo_jid, length(NEW.grupo_jid) - length('@g.us'));

  SELECT c.uazapi_instance_id INTO v_inst_txt
    FROM public.wa_auto_config c
   WHERE c.tenant_id = NEW.tenant_id;
  IF v_inst_txt IS NULL THEN
    RAISE EXCEPTION 'Escolha primeiro o número do assistente (aba Conexão): o grupo precisa ser desse número.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT wi.id INTO v_inst
    FROM public.whatsapp_instances wi
   WHERE wi.tenant_id = NEW.tenant_id AND wi.instance_id = v_inst_txt;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'O número do assistente não foi encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.chat_contacts ct
      JOIN public.chat_conversations cv
        ON cv.contact_id = ct.id AND cv.tenant_id = ct.tenant_id
     WHERE ct.tenant_id = NEW.tenant_id
       AND ct.instance_id = v_inst
       AND cv.instance_id = v_inst
       AND cv.is_group = true
       AND lower(btrim(ct.numero_whatsapp)) IN (v_base, NEW.grupo_jid)
  ) THEN
    RAISE EXCEPTION 'Grupo não encontrado nas conversas do número do assistente. O número precisa estar no grupo.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.chat_contacts ct
     WHERE ct.tenant_id = NEW.tenant_id
       AND lower(btrim(ct.numero_whatsapp)) IN (v_base, NEW.grupo_jid)
       AND (
         ct.client_id IS NOT NULL
         OR EXISTS (
           SELECT 1 FROM public.chat_contact_clients cc
            WHERE cc.tenant_id = NEW.tenant_id AND cc.contact_id = ct.id
         )
       )
  ) THEN
    RAISE EXCEPTION 'Este grupo está vinculado a um cliente. O assistente só responde em grupos internos da equipe.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT nullif(btrim(ct.nome), '') INTO v_nome
    FROM public.chat_contacts ct
   WHERE ct.tenant_id = NEW.tenant_id
     AND ct.instance_id = v_inst
     AND lower(btrim(ct.numero_whatsapp)) IN (v_base, NEW.grupo_jid)
     AND nullif(btrim(ct.nome), '') IS NOT NULL
   ORDER BY ct.atualizado_em DESC NULLS LAST
   LIMIT 1;
  NEW.nome := left(coalesce(v_nome, 'Grupo sem nome'), 120);

  v_chave := btrim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, NEW.nome)), '\s+', ' ', 'g'));
  IF v_chave <> '' AND EXISTS (
    SELECT 1
      FROM public.clients cl
     WHERE cl.tenant_id = NEW.tenant_id
       AND cl.ativo IS DISTINCT FROM false
       AND btrim(regexp_replace(
             lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(cl.nome, ''))), '\s+', ' ', 'g'))
           = v_chave
  ) THEN
    RAISE EXCEPTION 'Este grupo tem o mesmo nome de um cliente. O assistente só responde em grupos internos da equipe.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtext('wa_agente_grupos:' || NEW.tenant_id::text));
    IF (SELECT count(*) FROM public.wa_agente_grupos WHERE tenant_id = NEW.tenant_id) >= 10 THEN
      RAISE EXCEPTION 'Limite de 10 grupos por empresa atingido.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.wa_agente_confere_grupo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wa_agente_confere_grupo ON public.wa_agente_grupos;
CREATE TRIGGER wa_agente_confere_grupo
  BEFORE INSERT OR UPDATE OF grupo_jid, ativo, tenant_id ON public.wa_agente_grupos
  FOR EACH ROW EXECUTE FUNCTION public.wa_agente_confere_grupo();

-- Grupo liberado ⇒ restrito no Chat (só admin/gerente). Pausar/excluir NÃO desmarca.
CREATE OR REPLACE FUNCTION public.wa_agente_grupo_restrito_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.grupo_jid IS NOT NULL AND NEW.tenant_id IS NOT NULL THEN
    PERFORM private.marcar_grupo_restrito(NEW.tenant_id, NEW.grupo_jid, 'agente_ia');
  END IF;
  RETURN NULL; -- AFTER
END;
$fn$;
REVOKE ALL ON FUNCTION public.wa_agente_grupo_restrito_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wa_agente_grupo_restrito_sync ON public.wa_agente_grupos;
CREATE TRIGGER wa_agente_grupo_restrito_sync
  AFTER INSERT OR UPDATE OF grupo_jid, ativo, tenant_id ON public.wa_agente_grupos
  FOR EACH ROW EXECUTE FUNCTION public.wa_agente_grupo_restrito_sync();

-- ---------------------------------------------------------------------------
-- 6) Números reserva por grupo (ordem 1 = principal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_agente_grupo_numeros (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  grupo_id      UUID NOT NULL REFERENCES public.wa_agente_grupos(id) ON DELETE CASCADE,
  instance_uuid UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  ordem         SMALLINT NOT NULL CHECK (ordem BETWEEN 1 AND 5),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, instance_uuid),
  UNIQUE (grupo_id, ordem)
);

COMMENT ON TABLE public.wa_agente_grupo_numeros IS
  'Números (instâncias UAZAPI) do assistente em cada grupo interno: ordem 1 = principal, demais = reservas. Cada número precisa estar no grupo.';

CREATE INDEX IF NOT EXISTS idx_wa_agente_grupo_numeros_inst ON public.wa_agente_grupo_numeros (instance_uuid);

CREATE OR REPLACE FUNCTION public.wa_agente_confere_grupo_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_grupo_tenant UUID;
  v_jid  TEXT;
  v_base TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM public.get_user_tenant_id() THEN
    RAISE EXCEPTION 'Registro não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT g.tenant_id, g.grupo_jid INTO v_grupo_tenant, v_jid
    FROM public.wa_agente_grupos g WHERE g.id = NEW.grupo_id;
  IF v_grupo_tenant IS NULL OR v_grupo_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Grupo não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.whatsapp_instances wi
     WHERE wi.id = NEW.instance_uuid AND wi.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Número de WhatsApp não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  v_base := left(v_jid, length(v_jid) - length('@g.us'));
  IF NOT EXISTS (
    SELECT 1
      FROM public.chat_contacts ct
      JOIN public.chat_conversations cv
        ON cv.contact_id = ct.id AND cv.tenant_id = ct.tenant_id
     WHERE ct.tenant_id = NEW.tenant_id
       AND ct.instance_id = NEW.instance_uuid
       AND cv.instance_id = NEW.instance_uuid
       AND cv.is_group = true
       AND lower(btrim(ct.numero_whatsapp)) IN (v_base, v_jid)
  ) THEN
    RAISE EXCEPTION 'Esse número não está no grupo (o grupo não aparece nas conversas dele).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.wa_agente_confere_grupo_numero() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wa_agente_confere_grupo_numero ON public.wa_agente_grupo_numeros;
CREATE TRIGGER wa_agente_confere_grupo_numero
  BEFORE INSERT OR UPDATE OF grupo_id, instance_uuid, tenant_id ON public.wa_agente_grupo_numeros
  FOR EACH ROW EXECUTE FUNCTION public.wa_agente_confere_grupo_numero();

-- ---------------------------------------------------------------------------
-- 7) Fila de pedidos (escrita só pelo servidor; front não lê)
--    Sem FK para chat_conversations/chat_messages de propósito: não trava as
--    tabelas quentes do Chat e a fila não impede apagar conversa.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_agente_pedidos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instance_uuid    UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  conversation_id  UUID,
  chat_message_id  UUID,
  chat_jid         TEXT NOT NULL CHECK (length(chat_jid) <= 100),
  eh_grupo         BOOLEAN NOT NULL DEFAULT false,
  -- NULL quando o grupo tem acesso_total e quem chamou não é membro cadastrado.
  membro_id        UUID REFERENCES public.wa_agente_membros(id) ON DELETE SET NULL,
  user_id          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Chave interna de quem mandou (chaveTelefoneBR, ou 'lid:<n>' sem telefone):
  -- debounce e limites por pessoa, inclusive não membros em grupo acesso_total.
  remetente_chave  TEXT CHECK (remetente_chave IS NULL OR length(remetente_chave) <= 40),
  -- Id da mensagem no WhatsApp: igual em TODAS as instâncias do grupo ⇒ a mesma
  -- pergunta que chega por 2 números vira 1 pedido só.
  message_id_wpp   TEXT NOT NULL UNIQUE CHECK (length(message_id_wpp) <= 128),
  gatilho          TEXT NOT NULL CHECK (gatilho IN ('privado', 'mencao', 'quote', 'nome')),
  status           TEXT NOT NULL DEFAULT 'aguardando'
                   CHECK (status IN ('aguardando', 'processando', 'agrupado', 'respondido', 'ignorado', 'falhou', 'incerto')),
  motivo           TEXT CHECK (motivo IS NULL OR length(motivo) <= 200),
  processar_apos   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '5 seconds',
  lock_ate         TIMESTAMPTZ,
  tentativas       SMALLINT NOT NULL DEFAULT 0,
  resposta_message_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_agente_pedidos IS
  'Fila do assistente: 1 linha por mensagem que acionou (UNIQUE message_id_wpp). Escrita por uazapi-webhook e wa-agente-responder (service_role). Sem texto da mensagem. Retenção 30 dias.';

CREATE INDEX IF NOT EXISTS idx_wa_agente_pedidos_chat_user
  ON public.wa_agente_pedidos (tenant_id, chat_jid, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_agente_pedidos_fila
  ON public.wa_agente_pedidos (processar_apos)
  WHERE status IN ('aguardando', 'processando');
CREATE INDEX IF NOT EXISTS idx_wa_agente_pedidos_remetente
  ON public.wa_agente_pedidos (tenant_id, remetente_chave, created_at DESC)
  WHERE remetente_chave IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_agente_pedidos_created ON public.wa_agente_pedidos (created_at);

-- ---------------------------------------------------------------------------
-- 8) Log das execuções (sem conteúdo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_agente_execucoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Pedidos somem em 30 dias; execuções ficam 90 ⇒ SET NULL.
  pedido_id     UUID REFERENCES public.wa_agente_pedidos(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  canal         TEXT CHECK (canal IS NULL OR length(canal) <= 20),
  gatilho       TEXT CHECK (gatilho IS NULL OR length(gatilho) <= 20),
  modelo        TEXT CHECK (modelo IS NULL OR length(modelo) <= 100),
  passos        SMALLINT,
  ferramentas   TEXT[] NOT NULL DEFAULT '{}',
  tokens_entrada INTEGER,
  tokens_saida   INTEGER,
  tokens_cache   INTEGER,
  custo_usd     NUMERIC(8,4),
  duracao_ms    INTEGER,
  resultado     TEXT NOT NULL CHECK (resultado IN
                  ('respondido', 'sem_escopo', 'limite', 'teto', 'erro_ia', 'recusado', 'humano_assumiu', 'simulado', 'restrito')),
  mensagens     INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_agente_execucoes IS
  'Log do assistente: ferramentas, tokens, custo e resultado — NUNCA texto de pergunta/resposta. Escrito só pelo servidor. Retenção 90 dias.';

CREATE INDEX IF NOT EXISTS idx_wa_agente_execucoes_tenant_data
  ON public.wa_agente_execucoes (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_agente_execucoes_pedido ON public.wa_agente_execucoes (pedido_id);

-- ---------------------------------------------------------------------------
-- 9) Carimbo de tenant, RLS, policies e GRANTs
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['wa_agente_membros', 'wa_agente_grupos', 'wa_agente_grupo_numeros',
                           'wa_agente_pedidos', 'wa_agente_execucoes']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id_%1$s ON public.%1$s', t);
    EXECUTE format(
      'CREATE TRIGGER set_tenant_id_%1$s BEFORE INSERT ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.tg_set_tenant_id()', t);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %1$s_tenant_isolation ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY %1$s_tenant_isolation ON public.%1$s AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (tenant_id = (SELECT public.get_user_tenant_id())) '
      'WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()))', t);

    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END
$do$;

-- Membros, grupos e números: quem administra o app lê e escreve.
DO $do$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['wa_agente_membros', 'wa_agente_grupos', 'wa_agente_grupo_numeros']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_admin ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY %1$s_admin ON public.%1$s FOR ALL TO authenticated '
      'USING ((SELECT public.has_permissao(''automacoes-wa'', ''admin''))) '
      'WITH CHECK ((SELECT public.has_permissao(''automacoes-wa'', ''admin'')))', t);
  END LOOP;
END
$do$;

-- Grupos internos: só admin/gerente enxergam (mesma regra do Chat restrito).
DROP POLICY IF EXISTS restrito_admin ON public.wa_agente_grupos;
CREATE POLICY restrito_admin ON public.wa_agente_grupos
  AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.pode_ver_restrito()))
  WITH CHECK ((SELECT public.pode_ver_restrito()));
DROP POLICY IF EXISTS restrito_admin ON public.wa_agente_grupo_numeros;
CREATE POLICY restrito_admin ON public.wa_agente_grupo_numeros
  AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.pode_ver_restrito()))
  WITH CHECK ((SELECT public.pode_ver_restrito()));

-- Execuções: só leitura para quem vê o app.
DROP POLICY IF EXISTS wa_agente_execucoes_select ON public.wa_agente_execucoes;
CREATE POLICY wa_agente_execucoes_select ON public.wa_agente_execucoes
  FOR SELECT TO authenticated
  USING ((SELECT public.has_permissao('automacoes-wa', 'ver')));
GRANT SELECT ON public.wa_agente_execucoes TO authenticated;

-- GRANT por coluna: o front só mexe no que é dele.
GRANT SELECT ON public.wa_agente_membros TO authenticated;
GRANT INSERT (id, tenant_id, user_id, telefone, ativo) ON public.wa_agente_membros TO authenticated;
GRANT UPDATE (telefone, ativo) ON public.wa_agente_membros TO authenticated;
GRANT DELETE ON public.wa_agente_membros TO authenticated;

GRANT SELECT ON public.wa_agente_grupos TO authenticated;
GRANT INSERT (id, tenant_id, grupo_jid, ativo, acesso_total) ON public.wa_agente_grupos TO authenticated;
GRANT UPDATE (ativo, acesso_total) ON public.wa_agente_grupos TO authenticated;
GRANT DELETE ON public.wa_agente_grupos TO authenticated;

GRANT SELECT ON public.wa_agente_grupo_numeros TO authenticated;
GRANT INSERT (id, tenant_id, grupo_id, instance_uuid, ordem) ON public.wa_agente_grupo_numeros TO authenticated;
GRANT UPDATE (ordem) ON public.wa_agente_grupo_numeros TO authenticated;
GRANT DELETE ON public.wa_agente_grupo_numeros TO authenticated;

-- wa_agente_pedidos: nada para o front (só a RESTRICTIVE + nenhum GRANT).

-- Nunca TRUNCATE pelo front (TRUNCATE ignora RLS).
REVOKE TRUNCATE ON public.wa_webhook_tokens, public.wa_agente_membros, public.wa_agente_grupos,
  public.wa_agente_grupo_numeros, public.wa_agente_pedidos, public.wa_agente_execucoes
  FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10) Escopo de quem perguntou (falha fechada)
--     total = vê a carteira inteira (clientes.carteira · ver) — client_ids vem
--     vazio e deve ser ignorado. Senão, os clientes atribuídos (ativos) dele.
--     Usuário inexistente, inativo, de outra empresa ou cliente ⇒ (false, {}).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_agente_escopo(p_tenant uuid, p_user uuid)
RETURNS TABLE (total boolean, client_ids uuid[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_tenant IS NULL OR p_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = p_user
       AND u.tenant_id = p_tenant
       AND u.ativo IS TRUE
       AND u.perfil IS DISTINCT FROM 'cliente'
  ) THEN
    RETURN QUERY SELECT false, '{}'::uuid[];
    RETURN;
  END IF;

  IF COALESCE(public.has_permissao_de(p_user, 'clientes.carteira', 'ver'), false) THEN
    RETURN QUERY SELECT true, '{}'::uuid[];
    RETURN;
  END IF;

  RETURN QUERY
    SELECT false, COALESCE(array_agg(DISTINCT ca.client_id), '{}'::uuid[])
      FROM public.client_assignments ca
      JOIN public.clients cl ON cl.id = ca.client_id AND cl.tenant_id = p_tenant
     WHERE ca.tenant_id = p_tenant
       AND ca.user_id = p_user
       AND ca.ativo IS TRUE;
END;
$fn$;

COMMENT ON FUNCTION public.wa_agente_escopo(uuid, uuid) IS
  'Escopo do assistente para um usuário: total (carteira inteira) ou lista de clientes atribuídos. Falha fechada. Só service_role.';
REVOKE ALL ON FUNCTION public.wa_agente_escopo(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_agente_escopo(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 11) Reivindicar pedidos da fila (vários workers sem pegar o mesmo)
--     Antes de pegar: pedido com 3 tentativas e lock vencido ⇒ 'falhou';
--     'aguardando' há mais de 30 min (ex.: função fora do ar) ⇒ 'ignorado'
--     (resposta velha confunde mais do que ajuda).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_agente_reivindicar(p_limite int)
RETURNS SETOF public.wa_agente_pedidos
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  UPDATE public.wa_agente_pedidos p
     SET status = 'falhou', motivo = 'tentativas_esgotadas', lock_ate = NULL
   WHERE p.status = 'processando' AND p.lock_ate < now() AND p.tentativas >= 3;

  UPDATE public.wa_agente_pedidos p
     SET status = 'ignorado', motivo = 'expirado'
   WHERE p.status = 'aguardando' AND p.processar_apos < now() - interval '30 minutes';

  RETURN QUERY
    WITH alvo AS (
      SELECT p.id
        FROM public.wa_agente_pedidos p
       WHERE (p.status = 'aguardando' AND p.processar_apos <= now())
          OR (p.status = 'processando' AND p.lock_ate < now() AND p.tentativas < 3)
       ORDER BY p.processar_apos, p.created_at
       LIMIT LEAST(GREATEST(COALESCE(p_limite, 10), 1), 50)
       FOR UPDATE SKIP LOCKED
    )
    UPDATE public.wa_agente_pedidos p
       SET status = 'processando',
           lock_ate = now() + interval '3 minutes',
           tentativas = p.tentativas + 1
      FROM alvo
     WHERE p.id = alvo.id
    RETURNING p.*;
END;
$fn$;

COMMENT ON FUNCTION public.wa_agente_reivindicar(int) IS
  'wa-agente-responder: pega até p_limite (1–50) pedidos prontos, marca processando por 3 min. Só service_role.';
REVOKE ALL ON FUNCTION public.wa_agente_reivindicar(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_agente_reivindicar(int) TO service_role;

-- ---------------------------------------------------------------------------
-- 12) Acordar wa-agente-responder ao chegar pedido (pg_net)
--     Mesmo padrão do agendador (20261026160000): x-cron-secret lido do Vault na
--     hora; nada de chave no SQL. Falha do pg_net não derruba o INSERT — a
--     varredura de 1 min cobre. O pedido nasce com processar_apos = +5 s
--     (debounce): a função respeita esse horário ao reivindicar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_agente_pedido_acorda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_segredo TEXT;
BEGIN
  SELECT s.decrypted_secret INTO v_segredo
    FROM vault.decrypted_secrets s
   WHERE s.name = 'wa_auto_cron_secret'
   LIMIT 1;
  IF v_segredo IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM net.http_post(
      url := 'https://seu-projeto-supabase.supabase.co/functions/v1/wa-agente-responder',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
      body := jsonb_build_object('pedido_id', NEW.id),
      timeout_milliseconds := 150000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'wa_agente_pedido_acorda: pg_net indisponível (%)', SQLSTATE;
  END;
  RETURN NULL; -- AFTER
END;
$fn$;
REVOKE ALL ON FUNCTION public.wa_agente_pedido_acorda() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wa_agente_pedido_acorda ON public.wa_agente_pedidos;
CREATE TRIGGER wa_agente_pedido_acorda
  AFTER INSERT ON public.wa_agente_pedidos
  FOR EACH ROW
  WHEN (NEW.status = 'aguardando')
  EXECUTE FUNCTION public.wa_agente_pedido_acorda();

-- Varredura a cada minuto: só chama se há pedido pronto (ou travado vencido).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-agente-varredura-1min') THEN
    PERFORM cron.unschedule('wa-agente-varredura-1min');
  END IF;
END
$do$;

SELECT cron.schedule(
  'wa-agente-varredura-1min',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://seu-projeto-supabase.supabase.co/functions/v1/wa-agente-responder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', s.decrypted_secret
    ),
    body := '{"varredura":true}'::jsonb,
    timeout_milliseconds := 150000
  )
  FROM vault.decrypted_secrets s
  WHERE s.name = 'wa_auto_cron_secret'
    AND EXISTS (
      SELECT 1 FROM public.wa_agente_pedidos p
       WHERE (p.status = 'aguardando' AND p.processar_apos <= now())
          OR (p.status = 'processando' AND p.lock_ate < now())
    );
  $cron$
);

-- Retenção: pedidos 30 dias, execuções 90 dias — todo dia às 04:27 BRT (07:27 UTC).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-agente-retencao') THEN
    PERFORM cron.unschedule('wa-agente-retencao');
  END IF;
END
$do$;

SELECT cron.schedule(
  'wa-agente-retencao',
  '27 7 * * *',
  $cron$
  DELETE FROM public.wa_agente_pedidos WHERE created_at < now() - interval '30 days';
  DELETE FROM public.wa_agente_execucoes WHERE created_at < now() - interval '90 days';
  $cron$
);

COMMIT;

NOTIFY pgrst, 'reload schema';
