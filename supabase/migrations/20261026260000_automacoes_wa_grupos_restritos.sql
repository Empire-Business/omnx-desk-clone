-- ============================================================================
-- Automações WhatsApp — GRUPOS INTERNOS só para admin e gerente (no banco)
-- ============================================================================
-- Requisito do dono: "esse grupo de admin nunca pode aparecer para ninguém que
-- não seja admin ou gestor na plataforma".
--
-- Os grupos internos (relatório diário — wa_auto_gestores tipo = 'grupo'; e, em
-- breve, o assistente de IA — futura wa_agente_grupos) estão em números da UAZAPI
-- que o Chat também usa. O uazapi-webhook grava o grupo como chat_contacts
-- (numero_whatsapp = id do grupo SEM "@g.us"), chat_conversations (is_group) e
-- chat_messages. Sem esta migration, qualquer perfil com acesso ao Chat
-- (atendimento, agente_chat, estrategista…) veria essas conversas, porque contato
-- sem cliente é "Caixa Geral" (user_can_access_client(NULL) = true).
--
-- O que esta migration faz:
--   1) chat_contacts.restrito_admin (bool, padrão false) + índices.
--   2) Registro genérico public.chat_grupos_restritos (tenant, grupo_base, origem):
--      a fonte da verdade de "este grupo é interno". Hoje alimentado por
--      wa_auto_gestores; a futura wa_agente_grupos só precisa chamar
--      private.marcar_grupo_restrito(tenant_id, grupo_jid, 'agente_ia') num
--      trigger AFTER INSERT/UPDATE (igual ao de wa_auto_gestores abaixo).
--   3) public.pode_ver_restrito(): true só para users.perfil IN ('admin','gerente'),
--      ativo, do mesmo tenant da sessão.
--   4) Triggers que marcam restrito_admin = true:
--        - wa_grupo_restrito_sync (AFTER em wa_auto_gestores): ao cadastrar /
--          alterar / reativar um grupo, registra e marca TODOS os chat_contacts
--          da empresa com aquele grupo (em todas as instâncias);
--        - zzz_chat_contacts_restrito_admin (BEFORE em chat_contacts): contato
--          criado/alterado depois (ex.: pelo webhook, em outro número) herda a
--          marca se o grupo estiver no registro.
--   5) Políticas RESTRICTIVE (somam às existentes; nenhuma é substituída):
--        USING (NOT restrito OR pode_ver_restrito()) em chat_contacts,
--        chat_conversations, chat_messages, chat_group_members, chat_message_reads,
--        chat_conversation_user_prefs, chat_csat, chat_contact_clients,
--        chat_weekly_reports, meetings, wa_auto_satisfacao, wa_auto_alertas_ignorados.
--      Valem para TODOS os papéis (TO public), inclusive anon.
--   6) RPC SECURITY DEFINER get_unread_counts_for_user passa a esconder as
--      conversas restritas (e, de quebra, a filtrar pela empresa da sessão —
--      antes ela devolvia ids de conversa de todas as empresas).
--   7) RESTRICTIVE restrito_admin em wa_auto_envios (envio para grupo) e
--      wa_auto_gestores (destino tipo = 'grupo'): só admin/gerente.
--
-- DESMARCAR — decisão: NUNCA automático.
--   * Excluir/pausar o grupo em wa_auto_gestores NÃO tira a marca nem o registro
--     (o histórico do grupo continua sendo conversa interna).
--   * Usuário logado (qualquer perfil) não consegue desmarcar: o trigger devolve
--     true se OLD era true e auth.uid() não é nulo.
--   * Só quem administra o banco (SQL editor / service_role, sem sessão) pode
--     desmarcar, e só depois de apagar o grupo de chat_grupos_restritos:
--       DELETE FROM public.chat_grupos_restritos WHERE tenant_id = … AND grupo_base = …;
--       UPDATE public.chat_contacts SET restrito_admin = false WHERE id = …;
--
-- Desempenho: as políticas de conversas/mensagens usam
--   (SELECT pode_ver_restrito()) OR coalesce(coluna <> ALL ((SELECT private.…_ids())::uuid[]), true)
-- — os dois SELECTs viram initPlan (rodam UMA vez por consulta) e a lista de ids
-- restritos é pequena (≤ 10 grupos por empresa × números). As funções de lista
-- ficam no schema "private" (fora da API/PostgREST) para que ninguém consiga
-- chamar por RPC e descobrir ids de conversas restritas.
--
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS.
-- Reversível: DROP das políticas "restrito_admin" (inclusive em wa_auto_envios e
--   wa_auto_gestores), dos triggers, das funções, da
--   tabela chat_grupos_restritos e da coluna; get_unread_counts_for_user volta à
--   versão anterior (sem os dois filtros novos).
-- ============================================================================

BEGIN;
-- Não fica esperando lock em tabela quente do Chat (falha rápido e pode repetir).
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 0) Schema privado (não exposto pela API) para as funções auxiliares
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
-- USAGE é necessário para avaliar as políticas (que chamam private.*). O schema
-- não está em [api].schemas, então não vira endpoint de RPC.
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) Coluna e índices
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_contacts
  ADD COLUMN IF NOT EXISTS restrito_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.chat_contacts.restrito_admin IS
  'Grupo INTERNO (relatório diário / assistente de IA): só admin e gerente veem no Chat (RLS restritiva). Marcado pelo banco; nunca desmarcado por usuário logado.';

CREATE INDEX IF NOT EXISTS idx_chat_contacts_restrito_admin
  ON public.chat_contacts (tenant_id) WHERE restrito_admin;
-- Achar os contatos de um grupo na empresa (todas as instâncias).
CREATE INDEX IF NOT EXISTS idx_chat_contacts_tenant_numero
  ON public.chat_contacts (tenant_id, numero_whatsapp);
-- Conversas de um contato (lista de conversas restritas).
CREATE INDEX IF NOT EXISTS idx_chat_conversations_contact_id
  ON public.chat_conversations (contact_id);

-- ---------------------------------------------------------------------------
-- 2) Registro genérico de grupos internos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_grupos_restritos (
  tenant_id  UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  grupo_base TEXT        NOT NULL,
  origem     TEXT        NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, grupo_base)
);

ALTER TABLE public.chat_grupos_restritos DROP CONSTRAINT IF EXISTS chat_grupos_restritos_base_check;
ALTER TABLE public.chat_grupos_restritos
  ADD CONSTRAINT chat_grupos_restritos_base_check CHECK (
    length(grupo_base) <= 60
    AND grupo_base ~ '^(120363[0-9]{9,15}|[1-9][0-9]{9,14}-[0-9]{9,11})$'
  );
ALTER TABLE public.chat_grupos_restritos DROP CONSTRAINT IF EXISTS chat_grupos_restritos_origem_check;
ALTER TABLE public.chat_grupos_restritos
  ADD CONSTRAINT chat_grupos_restritos_origem_check CHECK (origem IN ('relatorio_diario', 'agente_ia', 'manual'));

COMMENT ON TABLE public.chat_grupos_restritos IS
  'Grupos de WhatsApp INTERNOS por empresa (id sem "@g.us"). Contatos do Chat com esse id ganham restrito_admin = true. Só o banco grava (funções SECURITY DEFINER); nunca é apagado automaticamente.';

ALTER TABLE public.chat_grupos_restritos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_grupos_restritos FROM anon, authenticated;
GRANT SELECT ON public.chat_grupos_restritos TO authenticated;
GRANT ALL ON public.chat_grupos_restritos TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Quem pode ver o que é restrito
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pode_ver_restrito()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE((
    SELECT u.perfil IN ('admin', 'gerente')
      FROM public.users u
      JOIN public.profiles p ON p.user_id = u.id
     WHERE u.id = auth.uid()
       AND u.ativo IS DISTINCT FROM false
       AND u.tenant_id = p.tenant_id
     LIMIT 1
  ), false)
$fn$;

COMMENT ON FUNCTION public.pode_ver_restrito() IS
  'true só para admin/gerente ativo da empresa da sessão. Sem sessão (anon/service_role) = false.';

REVOKE ALL ON FUNCTION public.pode_ver_restrito() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pode_ver_restrito() TO anon, authenticated, service_role;

-- Ids de CONTATOS restritos da empresa da sessão (sem sessão: de todas).
CREATE OR REPLACE FUNCTION private.chat_contatos_restritos_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH t AS (SELECT public.get_user_tenant_id() AS tid)
  SELECT COALESCE(array_agg(c.id), '{}'::uuid[])
    FROM public.chat_contacts c, t
   WHERE c.restrito_admin
     AND (t.tid IS NULL OR c.tenant_id = t.tid)
$fn$;

-- Ids de CONVERSAS de contatos restritos da empresa da sessão (sem sessão: de todas).
CREATE OR REPLACE FUNCTION private.chat_conversas_restritas_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH t AS (SELECT public.get_user_tenant_id() AS tid)
  SELECT COALESCE(array_agg(cv.id), '{}'::uuid[])
    FROM public.chat_contacts c
    JOIN public.chat_conversations cv ON cv.contact_id = c.id
    CROSS JOIN t
   WHERE c.restrito_admin
     AND (t.tid IS NULL OR c.tenant_id = t.tid)
$fn$;

REVOKE ALL ON FUNCTION private.chat_contatos_restritos_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.chat_conversas_restritas_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.chat_contatos_restritos_ids() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.chat_conversas_restritas_ids() TO anon, authenticated, service_role;

-- Políticas do registro (somente leitura, admin/gerente, própria empresa).
DROP POLICY IF EXISTS chat_grupos_restritos_select ON public.chat_grupos_restritos;
CREATE POLICY chat_grupos_restritos_select ON public.chat_grupos_restritos
  FOR SELECT TO authenticated
  USING ((SELECT public.pode_ver_restrito()));
DROP POLICY IF EXISTS chat_grupos_restritos_tenant_isolation ON public.chat_grupos_restritos;
CREATE POLICY chat_grupos_restritos_tenant_isolation ON public.chat_grupos_restritos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

-- ---------------------------------------------------------------------------
-- 4) Marcar grupos
-- ---------------------------------------------------------------------------
-- Registra o grupo e marca todos os contatos dele na empresa. Só o banco chama
-- (triggers SECURITY DEFINER); não tem GRANT para anon/authenticated.
CREATE OR REPLACE FUNCTION private.marcar_grupo_restrito(p_tenant_id uuid, p_grupo text, p_origem text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_base TEXT;
  v_n    INTEGER := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_grupo IS NULL THEN
    RETURN 0;
  END IF;
  v_base := lower(btrim(p_grupo));
  IF right(v_base, 5) = '@g.us' THEN
    v_base := left(v_base, length(v_base) - 5);
  END IF;
  IF length(v_base) > 60
     OR v_base !~ '^(120363[0-9]{9,15}|[1-9][0-9]{9,14}-[0-9]{9,11})$' THEN
    RETURN 0; -- não é grupo real: nada a marcar (o CHECK de wa_auto_gestores já recusa)
  END IF;

  INSERT INTO public.chat_grupos_restritos (tenant_id, grupo_base, origem)
  VALUES (p_tenant_id, v_base, COALESCE(p_origem, 'manual'))
  ON CONFLICT (tenant_id, grupo_base) DO NOTHING;

  UPDATE public.chat_contacts c
     SET restrito_admin = true
   WHERE c.tenant_id = p_tenant_id
     AND lower(btrim(c.numero_whatsapp)) IN (v_base, v_base || '@g.us')
     AND NOT c.restrito_admin;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;

REVOKE ALL ON FUNCTION private.marcar_grupo_restrito(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Trigger de wa_auto_gestores: grupo cadastrado / alterado / reativado ⇒ marca.
-- Pausar ou excluir NÃO desmarca (ver cabeçalho).
CREATE OR REPLACE FUNCTION public.wa_grupo_restrito_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.tipo = 'grupo' AND NEW.grupo_jid IS NOT NULL AND NEW.tenant_id IS NOT NULL THEN
    PERFORM private.marcar_grupo_restrito(NEW.tenant_id, NEW.grupo_jid, 'relatorio_diario');
  END IF;
  RETURN NULL; -- AFTER
END;
$fn$;

REVOKE ALL ON FUNCTION public.wa_grupo_restrito_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wa_grupo_restrito_sync ON public.wa_auto_gestores;
CREATE TRIGGER wa_grupo_restrito_sync
  AFTER INSERT OR UPDATE OF tipo, grupo_jid, ativo, tenant_id ON public.wa_auto_gestores
  FOR EACH ROW EXECUTE FUNCTION public.wa_grupo_restrito_sync();

-- Trigger de chat_contacts: contato novo/alterado herda a marca do registro; usuário
-- logado nunca desmarca. Nome "zzz_" para rodar DEPOIS de zz_herda_tenant_id
-- (triggers BEFORE rodam em ordem alfabética), com o tenant já resolvido.
CREATE OR REPLACE FUNCTION public.chat_contacts_herda_restrito()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant UUID := NEW.tenant_id;
  v_base   TEXT;
BEGIN
  -- Usuário logado não desmarca (nem admin): só o banco, sem sessão.
  IF TG_OP = 'UPDATE' AND OLD.restrito_admin AND NOT NEW.restrito_admin
     AND auth.uid() IS NOT NULL THEN
    NEW.restrito_admin := true;
  END IF;

  IF NEW.restrito_admin THEN
    RETURN NEW;
  END IF;

  IF v_tenant IS NULL AND NEW.instance_id IS NOT NULL THEN
    SELECT wi.tenant_id INTO v_tenant FROM public.whatsapp_instances wi WHERE wi.id = NEW.instance_id;
  END IF;
  IF v_tenant IS NULL OR NEW.numero_whatsapp IS NULL THEN
    RETURN NEW;
  END IF;

  v_base := lower(btrim(NEW.numero_whatsapp));
  IF right(v_base, 5) = '@g.us' THEN
    v_base := left(v_base, length(v_base) - 5);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.chat_grupos_restritos g
     WHERE g.tenant_id = v_tenant AND g.grupo_base = v_base
  ) THEN
    NEW.restrito_admin := true;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.chat_contacts_herda_restrito() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zzz_chat_contacts_restrito_admin ON public.chat_contacts;
CREATE TRIGGER zzz_chat_contacts_restrito_admin
  BEFORE INSERT OR UPDATE ON public.chat_contacts
  FOR EACH ROW EXECUTE FUNCTION public.chat_contacts_herda_restrito();

-- Backfill: grupos já cadastrados no relatório diário.
SELECT private.marcar_grupo_restrito(g.tenant_id, g.grupo_jid, 'relatorio_diario')
  FROM public.wa_auto_gestores g
 WHERE g.tipo = 'grupo' AND g.grupo_jid IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5) Políticas RESTRICTIVE (somam às existentes)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS restrito_admin ON public.chat_contacts;
CREATE POLICY restrito_admin ON public.chat_contacts
  AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.pode_ver_restrito()) OR NOT restrito_admin)
  WITH CHECK ((SELECT public.pode_ver_restrito()) OR NOT restrito_admin);

-- Demais tabelas: (tabela, coluna, tipo da lista: contato | conversa).
-- Coluna NULL (ex.: reunião sem conversa) continua visível como antes.
DO $do$
DECLARE
  r     RECORD;
  v_fn  TEXT;
  v_exp TEXT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('chat_conversations',           'contact_id',      'contato'),
      ('chat_group_members',           'contact_id',      'contato'),
      ('chat_contact_clients',         'contact_id',      'contato'),
      ('chat_weekly_reports',          'contact_id',      'contato'),
      ('wa_auto_alertas_ignorados',    'contact_id',      'contato'),
      ('chat_messages',                'conversation_id', 'conversa'),
      ('chat_message_reads',           'conversation_id', 'conversa'),
      ('chat_conversation_user_prefs', 'conversation_id', 'conversa'),
      ('chat_csat',                    'conversation_id', 'conversa')
    ) AS x(tabela, coluna, tipo)
  LOOP
    IF to_regclass('public.' || r.tabela) IS NULL THEN
      CONTINUE;
    END IF;
    v_fn := CASE r.tipo WHEN 'contato' THEN 'private.chat_contatos_restritos_ids()'
                        ELSE 'private.chat_conversas_restritas_ids()' END;
    v_exp := format('(SELECT public.pode_ver_restrito()) OR COALESCE(%I <> ALL ((SELECT %s)::uuid[]), true)',
                    r.coluna, v_fn);
    EXECUTE format('DROP POLICY IF EXISTS restrito_admin ON public.%I', r.tabela);
    EXECUTE format('CREATE POLICY restrito_admin ON public.%I AS RESTRICTIVE FOR ALL TO public USING (%s) WITH CHECK (%s)',
                   r.tabela, v_exp, v_exp);
  END LOOP;

  -- Tabelas com contato E conversa.
  FOR r IN
    SELECT * FROM (VALUES ('meetings'), ('wa_auto_satisfacao')) AS x(tabela)
  LOOP
    IF to_regclass('public.' || r.tabela) IS NULL THEN
      CONTINUE;
    END IF;
    v_exp := '(SELECT public.pode_ver_restrito()) OR ('
          || 'COALESCE(contact_id <> ALL ((SELECT private.chat_contatos_restritos_ids())::uuid[]), true)'
          || ' AND COALESCE(conversation_id <> ALL ((SELECT private.chat_conversas_restritas_ids())::uuid[]), true))';
    EXECUTE format('DROP POLICY IF EXISTS restrito_admin ON public.%I', r.tabela);
    EXECUTE format('CREATE POLICY restrito_admin ON public.%I AS RESTRICTIVE FOR ALL TO public USING (%s) WITH CHECK (%s)',
                   r.tabela, v_exp, v_exp);
  END LOOP;
END;
$do$;

-- ---------------------------------------------------------------------------
-- 6) RPC SECURITY DEFINER do Chat: contagem de não lidas
-- ---------------------------------------------------------------------------
-- Ignora a RLS (SECURITY DEFINER), então aplica a mesma regra por conta própria:
--   * só conversas da empresa da sessão (antes: de todas as empresas);
--   * conversas de grupo restrito só para admin/gerente — decidido por auth.uid(),
--     não por p_user_id (que vem do cliente e pode ser de outra pessoa).
CREATE OR REPLACE FUNCTION public.get_unread_counts_for_user(p_user_id uuid, p_instance_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(conversation_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT
    m.conversation_id,
    count(*) AS unread_count
  FROM public.chat_messages m
  JOIN public.chat_conversations c ON c.id = m.conversation_id
  LEFT JOIN public.chat_message_reads r
    ON r.conversation_id = m.conversation_id
   AND r.user_id = p_user_id
  WHERE m.enviado_por_agente = false
    AND m.tipo != 'nota_interna'
    AND (r.last_read_at IS NULL OR m.criado_em > r.last_read_at)
    AND (p_instance_ids IS NULL OR c.instance_id = ANY(p_instance_ids))
    AND (auth.uid() IS NULL OR c.tenant_id = (SELECT public.get_user_tenant_id()))
    AND ((SELECT public.pode_ver_restrito())
         OR COALESCE(c.contact_id <> ALL ((SELECT private.chat_contatos_restritos_ids())::uuid[]), true))
  GROUP BY m.conversation_id
  HAVING count(*) > 0;
$fn$;

-- ---------------------------------------------------------------------------
-- 7) Automações WhatsApp: envios e destinos de GRUPO só para admin/gerente
-- ---------------------------------------------------------------------------
-- A tela de Automações (has_permissao('automacoes-wa', …)) mostra o histórico de
-- envios e os destinos do relatório. Linha de grupo revela id/nome de grupo
-- interno, então soma uma RESTRICTIVE: grupo ⇒ pode_ver_restrito().
--   * wa_auto_envios: payload.destino_tipo = 'grupo' OU destino é id de grupo
--     ("…@g.us" ou o formato do id sem sufixo). Vale também para o resumo
--     semanal em grupo de cliente (escolha segura: na dúvida, esconde).
--   * wa_auto_gestores: tipo = 'grupo' (ler, cadastrar, alterar e excluir).
-- O servidor grava com service_role (ignora RLS), então os envios continuam.
DO $do$
BEGIN
  IF to_regclass('public.wa_auto_envios') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS restrito_admin ON public.wa_auto_envios';
    EXECUTE $p$
      CREATE POLICY restrito_admin ON public.wa_auto_envios
        AS RESTRICTIVE FOR ALL TO public
        USING ((SELECT public.pode_ver_restrito()) OR NOT (
          COALESCE(payload->>'destino_tipo', '') = 'grupo'
          OR lower(btrim(destino)) LIKE '%@g.us'
          OR lower(btrim(destino)) ~ '^(120363[0-9]{9,15}|[1-9][0-9]{9,14}-[0-9]{9,11})$'
        ))
        WITH CHECK ((SELECT public.pode_ver_restrito()) OR NOT (
          COALESCE(payload->>'destino_tipo', '') = 'grupo'
          OR lower(btrim(destino)) LIKE '%@g.us'
          OR lower(btrim(destino)) ~ '^(120363[0-9]{9,15}|[1-9][0-9]{9,14}-[0-9]{9,11})$'
        ))
    $p$;
  END IF;

  IF to_regclass('public.wa_auto_gestores') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS restrito_admin ON public.wa_auto_gestores';
    EXECUTE $p$
      CREATE POLICY restrito_admin ON public.wa_auto_gestores
        AS RESTRICTIVE FOR ALL TO public
        USING ((SELECT public.pode_ver_restrito()) OR tipo IS DISTINCT FROM 'grupo')
        WITH CHECK ((SELECT public.pode_ver_restrito()) OR tipo IS DISTINCT FROM 'grupo')
    $p$;
  END IF;
END;
$do$;

COMMIT;

NOTIFY pgrst, 'reload schema';
