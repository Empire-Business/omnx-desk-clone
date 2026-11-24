-- ============================================================================
-- Vínculo de conversas e grupos a clientes PELO CANAL (Fases F0 e F1 do plano
-- "Íris e satisfação dos clientes: histórico de conversas", 27/10/2026)
-- ============================================================================
-- Problema (investigação de 27/10/2026, empresa principal):
--   * 0 de 115 clientes vigentes tinham conversa recente VINCULADA. 80% das
--     mensagens estão em grupos sem vínculo; o vínculo antigo ficou preso ao
--     número (instância) antigo — o mesmo grupo "renasceu" sem vínculo no número
--     novo (83 grupos estão em 2+ números).
--   * match_contact_to_client era SECURITY DEFINER, SEM filtro de empresa e com
--     EXECUTE para authenticated (qualquer logado gravava client_id de outra
--     empresa); comparava só os 11 últimos dígitos de clients.telefone (contato
--     gravado sem o 9 nunca casava) e ignorava clients.whatsapp/contratos.whatsapp.
--     O gatilho trg_auto_match_contact (BEFORE INSERT em chat_contacts) repetia a
--     mesma regra, também sem empresa.
--
-- O que esta migration faz, em ordem:
--   1) Funções de CHAVE do canal (schema private, puras): grupo = id do grupo
--      sem "@g.us"; privado = telefone só dígitos, com o 9º dígito no celular BR
--      (mesma regra de chaveTelefoneBR / wa_agente_membros.telefone_chave).
--      Comparação de telefone com o cadastro: DDD + 8 últimos dígitos (com ou
--      sem o 9, com ou sem o 55); internacional = todos os dígitos.
--   2) Tabela public.cliente_canais (vínculo por canal, não por linha de contato):
--      status sugerido | confirmado | rejeitado | interno | nao_cliente;
--      origem legado | mesmo_jid | telefone | nome_grupo | nome_membro | manual;
--      evidências só com códigos e contagens (nunca texto livre).
--   3) public.vinculos_execucoes: registro das execuções de wa-vinculos-sugerir
--      (só contagens), para a tela mostrar "última atualização".
--   4) Sincronização cliente_canais → chat_contacts.client_id / chat_contact_clients
--      (compatibilidade: Chat, RLS do Chat, relatório e Íris continuam lendo as
--      tabelas antigas). Vale para TODOS os contatos da empresa com a mesma chave,
--      em todas as instâncias. Contato restrito (grupo interno) nunca é tocado.
--      Decisão negativa (interno / não é cliente) e "rejeitado" tiram o vínculo.
--   5) Contato NOVO (outra instância, grupo que "renasce") herda o vínculo
--      confirmado da chave; sem vínculo, tenta o telefone (correspondência única).
--      Substitui o gatilho antigo trg_auto_match_contact (sem empresa).
--   6) Vínculo feito/desfeito à mão no Chat (usuário logado) só vira decisão do
--      canal com autorização real (private.vinculo_do_chat): perfil cliente
--      nunca; quem não enxerga todos os contatos do canal só gera 'sugerido';
--      decisão negativa nunca é apagada fora da tela. Políticas de
--      chat_contact_clients amarradas ao contato e ao cliente visíveis.
--   7) Grupo interno (chat_grupos_restritos: relatório diário / assistente) vira
--      'interno' automaticamente.
--   8) match_contact_to_client corrigida (mesma assinatura — o uazapi-webhook
--      chama com service_role): empresa obrigatória, telefone/whatsapp do cliente
--      e whatsapp do contrato, com e sem o 9, só correspondência ÚNICA; grava em
--      cliente_canais (confirmado/telefone). REVOKE de PUBLIC, anon, authenticated.
--   9) RPCs da tela "Vínculos" (admin/gerente do app): vinculos_listar,
--      vinculos_decidir, vinculos_buscar_clientes, vinculos_pode_gerir.
--      RPC de serviço (só service_role): vinculos_gravar_sugestoes — nunca
--      sobrescreve decisão humana e nunca confirma por nome.
--  9b) Cópia de segurança (private.backup_vinculos_20261027_*) de
--      chat_contacts.client_id e chat_contact_clients antes do legado, com o
--      comando de reversão em comentário.
--  10) Migração do legado: cada chat_contacts.client_id e cada
--      chat_contact_clients vira confirmado/legado pela chave; grupos internos
--      (restrito_admin, chat_grupos_restritos, wa_agente_grupos, destinos de
--      wa_auto_gestores) viram 'interno'. A sincronização (4) propaga o vínculo
--      para a mesma chave nas outras instâncias (F0 item 3).
--  11) Backfill por telefone: contatos privados sem vínculo que casam com UM
--      cliente (telefone/whatsapp do cadastro ou whatsapp do contrato).
--  12) Agendador 'wa-vinculos-sugerir-diario' (06:30 BRT = 09:30 UTC), mesmo
--      padrão dos jobs wa-auto-* (segredo do Vault lido na hora, x-cron-secret).
--
-- Segurança:
--   * RLS em cliente_canais e vinculos_execucoes: RESTRICTIVE por empresa +
--     leitura só para admin/gerente com automacoes-wa·admin (vinculos_pode_gerir).
--     O front NÃO escreve direto (sem GRANT de escrita): só pelas RPCs.
--   * Funções de chave, sincronização e telefone ficam em "private" (fora da API).
--   * Todas as SECURITY DEFINER com SET search_path; REVOKE de PUBLIC/anon.
--   * Sem regex com contador > 255 (limite do Postgres); tamanhos com length().
--
-- Depende de: 20261026260000 (chat_grupos_restritos, pode_ver_restrito, schema
-- private), 20261027090000 (wa_agente_grupos), 20261026160000 (segredo do cron).
-- Publique a função `wa-vinculos-sugerir` (verify_jwt = false) junto.
--
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS; job do cron
-- removido e recriado pelo nome; inserções do legado com ON CONFLICT DO NOTHING.
--
-- Reversão (manual, nesta ordem):
--   SELECT cron.unschedule('wa-vinculos-sugerir-diario');
--   DROP TRIGGER IF EXISTS zzzz_chat_contacts_herda_vinculo ON public.chat_contacts;
--   DROP TRIGGER IF EXISTS chat_contacts_vinculo_pos ON public.chat_contacts;
--   DROP TRIGGER IF EXISTS chat_contacts_client_para_canal ON public.chat_contacts;
--   DROP TRIGGER IF EXISTS chat_contact_clients_para_canal ON public.chat_contact_clients;
--   DROP TRIGGER IF EXISTS chat_grupos_restritos_vinculo ON public.chat_grupos_restritos;
--   DROP TABLE IF EXISTS public.cliente_canais, public.vinculos_execucoes CASCADE;
--   (vínculos de volta ao estado anterior: comando na seção 9b, com a cópia
--    private.backup_vinculos_20261027_*; políticas antigas de
--    chat_contact_clients: recriar as 4 de 20260505192242 se for preciso)
--   DROP FUNCTION IF EXISTS public.vinculos_listar(int, text, text, int),
--     public.vinculos_decidir(uuid, text, uuid), public.vinculos_buscar_clientes(text, int),
--     public.vinculos_gravar_sugestoes(uuid, jsonb, text[]), public.vinculos_pode_gerir();
--   (match_contact_to_client: manter a versão nova — a antiga era insegura.
--    Os client_id / chat_contact_clients gravados pela propagação ficam: são
--    vínculos válidos, iguais aos que já existiam em outro número.)
-- ============================================================================

BEGIN;
-- Não fica esperando lock em tabela quente do Chat (falha rápido e pode repetir).
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS private;

-- ---------------------------------------------------------------------------
-- 1) Chave do canal e comparação de telefone (puras)
--    MESMAS regras de supabase/functions/_shared/vinculo-sugestoes.ts
--    (canalDoContato, telCmpContato, telCmpCadastro). Mudou aqui → mude lá.
-- ---------------------------------------------------------------------------

-- 'grupo' | 'privado' | NULL (LID, vazio, formato desconhecido).
CREATE OR REPLACE FUNCTION private.canal_tipo(p_numero text, p_group_size integer DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  v     TEXT := lower(btrim(coalesce(p_numero, '')));
  v_dig TEXT;
BEGIN
  IF v = '' OR length(v) > 80 THEN
    RETURN NULL;
  END IF;
  IF right(v, 5) = '@g.us' OR coalesce(p_group_size, 0) > 0
     OR v ~ '^(120363[0-9]{9,15}|[1-9][0-9]{9,14}-[0-9]{9,11})$' THEN
    RETURN 'grupo';
  END IF;
  IF position('@' IN v) > 0 THEN
    -- Só JID de pessoa com telefone; LID ("…@lid") não é telefone.
    IF split_part(v, '@', 2) NOT IN ('s.whatsapp.net', 'c.us') THEN
      RETURN NULL;
    END IF;
    v := split_part(split_part(v, '@', 1), ':', 1);
  END IF;
  v_dig := regexp_replace(v, '[^0-9]', '', 'g');
  IF length(v_dig) > 15 THEN
    RETURN 'grupo'; -- id longo (contatoEhGrupo); sem formato conhecido a chave sai NULL
  END IF;
  IF length(v_dig) BETWEEN 8 AND 15 THEN
    RETURN 'privado';
  END IF;
  RETURN NULL;
END;
$fn$;

-- Chave canônica: grupo = id sem "@g.us"; privado = dígitos com o 9º dígito
-- no celular BR (igual a chaveTelefoneBR). NULL = sem chave confiável.
CREATE OR REPLACE FUNCTION private.canal_chave(p_numero text, p_group_size integer DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  v      TEXT := lower(btrim(coalesce(p_numero, '')));
  v_tipo TEXT := private.canal_tipo(p_numero, p_group_size);
  v_dig  TEXT;
BEGIN
  IF v_tipo IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_tipo = 'grupo' THEN
    IF right(v, 5) = '@g.us' THEN
      v := left(v, length(v) - 5);
    END IF;
    IF length(v) <= 60 AND v ~ '^(120363[0-9]{9,15}|[1-9][0-9]{9,14}-[0-9]{9,11})$' THEN
      RETURN v;
    END IF;
    RETURN NULL;
  END IF;
  IF position('@' IN v) > 0 THEN
    v := split_part(split_part(v, '@', 1), ':', 1);
  END IF;
  v_dig := regexp_replace(v, '[^0-9]', '', 'g');
  IF v_dig ~ '^55[1-9][0-9][6-9][0-9]{7}$' THEN
    RETURN '55' || substr(v_dig, 3, 2) || '9' || substr(v_dig, 5);
  END IF;
  RETURN v_dig;
END;
$fn$;

-- Como a chave pode estar gravada em chat_contacts.numero_whatsapp.
CREATE OR REPLACE FUNCTION private.canal_formas(p_tipo text, p_chave text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT CASE
    WHEN p_chave IS NULL THEN '{}'::text[]
    WHEN p_tipo = 'grupo' THEN ARRAY[p_chave, p_chave || '@g.us']
    -- celular BR com o 9: também a forma antiga, sem o 9
    WHEN p_tipo = 'privado' AND p_chave ~ '^55[1-9][0-9]9[6-9][0-9]{7}$'
      THEN ARRAY[p_chave, '55' || substr(p_chave, 3, 2) || substr(p_chave, 6)]
    WHEN p_tipo = 'privado' THEN ARRAY[p_chave]
    ELSE '{}'::text[]
  END
$fn$;

-- Telefone de CONTATO (vem do WhatsApp, sempre com DDI) → chave de comparação.
--   BR (55 + DDD + 8 ou 9 dígitos) → 'br' || DDD || 8 últimos dígitos;
--   outro país → 'x' || dígitos.
CREATE OR REPLACE FUNCTION private.tel_cmp_contato(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  d TEXT := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
BEGIN
  IF d ~ '^55[1-9][0-9][0-9]{8,9}$' THEN
    RETURN 'br' || substr(d, 3, 2) || right(d, 8);
  END IF;
  IF length(d) BETWEEN 8 AND 15 THEN
    RETURN 'x' || d;
  END IF;
  RETURN NULL;
END;
$fn$;

-- Telefone digitado no CADASTRO (cliente/contrato): aceita sem o 55 (DDD +
-- número). Sem DDD (8–9 dígitos) não compara: NULL.
CREATE OR REPLACE FUNCTION private.tel_cmp_cadastro(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  d TEXT := ltrim(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '0');
BEGIN
  IF d ~ '^55[1-9][0-9][0-9]{8,9}$' THEN
    RETURN 'br' || substr(d, 3, 2) || right(d, 8);
  END IF;
  IF d ~ '^[1-9][0-9][0-9]{8,9}$' THEN
    RETURN 'br' || left(d, 2) || right(d, 8);
  END IF;
  IF length(d) BETWEEN 12 AND 15 THEN
    RETURN 'x' || d;
  END IF;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION private.canal_tipo(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.canal_chave(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.canal_formas(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.tel_cmp_contato(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.tel_cmp_cadastro(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.canal_tipo(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION private.canal_chave(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION private.canal_formas(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION private.tel_cmp_contato(text) TO service_role;
GRANT EXECUTE ON FUNCTION private.tel_cmp_cadastro(text) TO service_role;

-- Clientes da empresa cujo telefone / whatsapp (cadastro) ou whatsapp (contrato
-- do cliente) tem a mesma chave de comparação. Ordenado (resultado estável).
CREATE OR REPLACE FUNCTION private.clientes_por_telefone(p_tenant uuid, p_cmp text)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(array_agg(DISTINCT x.id ORDER BY x.id), '{}'::uuid[])
    FROM (
      SELECT cl.id
        FROM public.clients cl
       WHERE p_tenant IS NOT NULL AND p_cmp IS NOT NULL
         AND cl.tenant_id = p_tenant
         AND (private.tel_cmp_cadastro(cl.telefone) = p_cmp
              OR private.tel_cmp_cadastro(cl.whatsapp) = p_cmp)
      UNION
      SELECT cl.id
        FROM public.contratos co
        JOIN public.clients cl ON cl.id = co.cliente_id AND cl.tenant_id = p_tenant
       WHERE p_tenant IS NOT NULL AND p_cmp IS NOT NULL
         AND co.tenant_id = p_tenant
         AND private.tel_cmp_cadastro(co.whatsapp) = p_cmp
    ) x
$fn$;
REVOKE ALL ON FUNCTION private.clientes_por_telefone(uuid, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) cliente_canais
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cliente_canais (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- NULL só quando status ∈ (interno, nao_cliente): a decisão vale para o canal.
  client_id     UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL,
  chave         TEXT NOT NULL,
  status        TEXT NOT NULL,
  origem        TEXT NOT NULL,
  score         NUMERIC(3,2),
  -- Só códigos e contagens (ex.: {"nome_grupo":"completo","membro_com_nome_do_cliente":1}).
  evidencias    JSONB NOT NULL DEFAULT '{}'::jsonb,
  revisado_por  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  revisado_em   TIMESTAMPTZ,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cliente_canais DROP CONSTRAINT IF EXISTS cliente_canais_tipo_check;
ALTER TABLE public.cliente_canais
  ADD CONSTRAINT cliente_canais_tipo_check CHECK (tipo IN ('grupo', 'privado'));
ALTER TABLE public.cliente_canais DROP CONSTRAINT IF EXISTS cliente_canais_status_check;
ALTER TABLE public.cliente_canais
  ADD CONSTRAINT cliente_canais_status_check
  CHECK (status IN ('sugerido', 'confirmado', 'rejeitado', 'interno', 'nao_cliente'));
ALTER TABLE public.cliente_canais DROP CONSTRAINT IF EXISTS cliente_canais_origem_check;
ALTER TABLE public.cliente_canais
  ADD CONSTRAINT cliente_canais_origem_check
  CHECK (origem IN ('legado', 'mesmo_jid', 'telefone', 'nome_grupo', 'nome_membro', 'manual'));
ALTER TABLE public.cliente_canais DROP CONSTRAINT IF EXISTS cliente_canais_cliente_status_check;
ALTER TABLE public.cliente_canais
  ADD CONSTRAINT cliente_canais_cliente_status_check
  CHECK ((client_id IS NULL) = (status IN ('interno', 'nao_cliente')));
ALTER TABLE public.cliente_canais DROP CONSTRAINT IF EXISTS cliente_canais_chave_check;
ALTER TABLE public.cliente_canais
  ADD CONSTRAINT cliente_canais_chave_check CHECK (
    length(chave) BETWEEN 8 AND 60
    AND (
      (tipo = 'grupo' AND chave ~ '^(120363[0-9]{9,15}|[1-9][0-9]{9,14}-[0-9]{9,11})$')
      OR (tipo = 'privado' AND chave ~ '^[0-9]{8,15}$')
    )
  );
ALTER TABLE public.cliente_canais DROP CONSTRAINT IF EXISTS cliente_canais_score_check;
ALTER TABLE public.cliente_canais
  ADD CONSTRAINT cliente_canais_score_check CHECK (score IS NULL OR (score >= 0 AND score <= 1));
ALTER TABLE public.cliente_canais DROP CONSTRAINT IF EXISTS cliente_canais_evidencias_check;
ALTER TABLE public.cliente_canais
  ADD CONSTRAINT cliente_canais_evidencias_check
  CHECK (jsonb_typeof(evidencias) = 'object' AND length(evidencias::text) <= 1000);

COMMENT ON TABLE public.cliente_canais IS
  'Vínculo de canal de WhatsApp (grupo = id do grupo; privado = telefone canônico) com cliente, valendo para TODAS as instâncias. Só "confirmado" vale para análise/linha do tempo; "sugerido" só aparece na tela de revisão. Escrita pelas RPCs vinculos_* e pelos gatilhos; sincroniza chat_contacts.client_id / chat_contact_clients.';
COMMENT ON COLUMN public.cliente_canais.evidencias IS
  'Códigos e contagens da sugestão (sem texto livre, sem nome, sem telefone).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_canais_chave_cliente
  ON public.cliente_canais (tenant_id, tipo, chave, (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)));
CREATE INDEX IF NOT EXISTS idx_cliente_canais_cliente
  ON public.cliente_canais (tenant_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cliente_canais_status
  ON public.cliente_canais (tenant_id, status);

-- Conferência: empresa da sessão, cliente da mesma empresa, chave imutável.
CREATE OR REPLACE FUNCTION public.cliente_canais_confere()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não identificada.' USING ERRCODE = 'check_violation';
  END IF;
  IF auth.uid() IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM public.get_user_tenant_id() THEN
    RAISE EXCEPTION 'Registro não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.tipo IS DISTINCT FROM OLD.tipo
       OR NEW.chave IS DISTINCT FROM OLD.chave OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      RAISE EXCEPTION 'Canal e cliente não mudam: crie outro registro.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.criado_em := OLD.criado_em;
  ELSE
    NEW.criado_em := now();
  END IF;
  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients cl WHERE cl.id = NEW.client_id AND cl.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.cliente_canais_confere() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cliente_canais_confere ON public.cliente_canais;
CREATE TRIGGER cliente_canais_confere
  BEFORE INSERT OR UPDATE ON public.cliente_canais
  FOR EACH ROW EXECUTE FUNCTION public.cliente_canais_confere();

-- ---------------------------------------------------------------------------
-- 3) Registro das execuções do wa-vinculos-sugerir (sem conteúdo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vinculos_execucoes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  origem     TEXT NOT NULL CHECK (origem IN ('cron', 'manual')),
  user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Só contagens (sugeridos, confirmados, removidos…).
  resultado  JSONB NOT NULL DEFAULT '{}'::jsonb
             CHECK (jsonb_typeof(resultado) = 'object' AND length(resultado::text) <= 2000),
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.vinculos_execucoes IS
  'Execuções de wa-vinculos-sugerir (cron diário ou botão "Recalcular"): só contagens. Retenção de 90 dias (a própria função apaga).';
CREATE INDEX IF NOT EXISTS idx_vinculos_execucoes_tenant_data
  ON public.vinculos_execucoes (tenant_id, criado_em DESC);

-- ---------------------------------------------------------------------------
-- Quem pode ver e decidir vínculos: admin/gerente ativo da empresa da sessão
-- (pode_ver_restrito — vê grupos internos) E quem administra o app.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vinculos_pode_gerir()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(public.pode_ver_restrito(), false)
     AND COALESCE(public.has_permissao('automacoes-wa', 'admin'), false)
$fn$;
COMMENT ON FUNCTION public.vinculos_pode_gerir() IS
  'true só para admin/gerente ativo da empresa da sessão que administra o app Automações WhatsApp.';
REVOKE ALL ON FUNCTION public.vinculos_pode_gerir() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vinculos_pode_gerir() TO authenticated, service_role;

-- RLS e privilégios das duas tabelas novas.
ALTER TABLE public.cliente_canais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vinculos_execucoes ENABLE ROW LEVEL SECURITY;

DO $do$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cliente_canais', 'vinculos_execucoes']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_tenant_isolation ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY %1$s_tenant_isolation ON public.%1$s AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (tenant_id = (SELECT public.get_user_tenant_id())) '
      'WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY %1$s_select ON public.%1$s FOR SELECT TO authenticated '
      'USING ((SELECT public.vinculos_pode_gerir()))', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END
$do$;
-- Escrita do front: só pelas RPCs (SECURITY DEFINER). Nada de INSERT/UPDATE/DELETE
-- direto, nem TRUNCATE.

-- ---------------------------------------------------------------------------
-- 4) Sincronização cliente_canais → chat_contacts / chat_contact_clients
-- ---------------------------------------------------------------------------
-- Para a chave (tenant, tipo, chave), em TODOS os contatos da empresa com ela
-- (todas as instâncias), menos os restritos (grupo interno):
--   * decisão negativa (interno / nao_cliente) → tira todos os vínculos;
--   * cliente 'rejeitado' → tira esse cliente;
--   * clientes 'confirmado' → garante chat_contact_clients e, se o contato está
--     sem client_id (ou com um rejeitado), client_id = o confirmado mais antigo.
-- Vínculo existente que não está em cliente_canais (nem rejeitado) fica como está.
-- Marca omnx.vinculo_sync = 'on' durante a escrita: os gatilhos de "vínculo
-- manual no Chat" (6) ignoram o que a sincronização grava (sem recursão).
CREATE OR REPLACE FUNCTION private.vinculo_sincronizar(p_tenant uuid, p_tipo text, p_chave text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_prev   TEXT := current_setting('omnx.vinculo_sync', true);
  v_formas TEXT[] := private.canal_formas(p_tipo, p_chave);
  v_conf   UUID[];
  v_rej    UUID[];
  v_neg    BOOLEAN;
  v_alvo   UUID[];
  v_n      INTEGER := 0;
BEGIN
  IF p_tenant IS NULL OR p_chave IS NULL OR cardinality(v_formas) = 0 THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(array_agg(c.client_id ORDER BY COALESCE(c.revisado_em, c.criado_em), c.id), '{}'::uuid[])
    INTO v_conf
    FROM public.cliente_canais c
   WHERE c.tenant_id = p_tenant AND c.tipo = p_tipo AND c.chave = p_chave
     AND c.status = 'confirmado' AND c.client_id IS NOT NULL;
  SELECT COALESCE(array_agg(c.client_id), '{}'::uuid[])
    INTO v_rej
    FROM public.cliente_canais c
   WHERE c.tenant_id = p_tenant AND c.tipo = p_tipo AND c.chave = p_chave
     AND c.status = 'rejeitado' AND c.client_id IS NOT NULL;
  v_neg := EXISTS (
    SELECT 1 FROM public.cliente_canais c
     WHERE c.tenant_id = p_tenant AND c.tipo = p_tipo AND c.chave = p_chave
       AND c.client_id IS NULL AND c.status IN ('interno', 'nao_cliente')
  );
  IF v_neg THEN
    v_conf := '{}'::uuid[];
  END IF;

  SELECT COALESCE(array_agg(ct.id), '{}'::uuid[])
    INTO v_alvo
    FROM public.chat_contacts ct
   WHERE ct.tenant_id = p_tenant
     AND ct.numero_whatsapp = ANY (v_formas)
     AND NOT ct.restrito_admin
     AND private.canal_tipo(ct.numero_whatsapp, ct.group_size) = p_tipo;
  IF cardinality(v_alvo) = 0 THEN
    RETURN 0;
  END IF;

  PERFORM set_config('omnx.vinculo_sync', 'on', true);

  DELETE FROM public.chat_contact_clients cc
   WHERE cc.tenant_id = p_tenant
     AND cc.contact_id = ANY (v_alvo)
     AND (v_neg OR cc.client_id = ANY (v_rej));

  INSERT INTO public.chat_contact_clients (contact_id, client_id, tenant_id)
  SELECT a.id, c.id, p_tenant
    FROM unnest(v_alvo) AS a(id)
   CROSS JOIN unnest(v_conf) AS c(id)
  ON CONFLICT (contact_id, client_id) DO NOTHING;

  UPDATE public.chat_contacts ct
     SET client_id = x.novo
    FROM (
      SELECT ct2.id,
             CASE
               WHEN v_neg THEN NULL
               WHEN ct2.client_id IS NULL OR ct2.client_id = ANY (v_rej) THEN v_conf[1]
               ELSE ct2.client_id
             END AS novo
        FROM public.chat_contacts ct2
       WHERE ct2.id = ANY (v_alvo)
    ) x
   WHERE ct.id = x.id
     AND ct.client_id IS DISTINCT FROM x.novo;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM set_config('omnx.vinculo_sync', COALESCE(NULLIF(v_prev, ''), 'off'), true);
  RETURN v_n;
END;
$fn$;
REVOKE ALL ON FUNCTION private.vinculo_sincronizar(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cliente_canais_sincroniza()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'sugerido' THEN
      PERFORM private.vinculo_sincronizar(OLD.tenant_id, OLD.tipo, OLD.chave);
    END IF;
    RETURN NULL;
  END IF;
  -- Sugestão não mexe no Chat; mudança só de score/evidências também não.
  IF NEW.status = 'sugerido' AND (TG_OP = 'INSERT' OR OLD.status = 'sugerido') THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;
  PERFORM private.vinculo_sincronizar(NEW.tenant_id, NEW.tipo, NEW.chave);
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.cliente_canais_sincroniza() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cliente_canais_sincroniza ON public.cliente_canais;
CREATE TRIGGER cliente_canais_sincroniza
  AFTER INSERT OR UPDATE OR DELETE ON public.cliente_canais
  FOR EACH ROW EXECUTE FUNCTION public.cliente_canais_sincroniza();

-- Vínculo feito / desfeito por uma PESSOA no Chat (não pela tela de Vínculos).
-- O Chat deixa vários perfis mexerem em chat_contacts.client_id e em
-- chat_contact_clients, então isso só vira decisão do CANAL (que vale em todos
-- os números) com autorização real de quem fez:
--   * perfil 'cliente', usuário inativo ou de outra empresa → nada;
--   * precisa enxergar o contato (instância) e o cliente escolhido;
--   * 'confirmado' / 'rejeitado' só se a pessoa enxerga TODOS os contatos do
--     canal (todas as instâncias e os clientes já confirmados nele) — ou se
--     gere vínculos (vinculos_pode_gerir). Senão: ligar vira só 'sugerido'
--     (revisão na tela) e desligar não muda o canal (fica só no contato dela);
--   * nunca apaga nem passa por cima de decisão negativa (interno / não é
--     cliente) — só a tela (vinculos_decidir) faz isso; com decisão negativa,
--     ligar vira 'sugerido'. 'rejeitado' só quem gere vínculos reverte.
-- Devolve o que fez: 'confirmado' | 'rejeitado' | 'sugerido' | 'nada'.
CREATE OR REPLACE FUNCTION private.vinculo_do_chat(p_contato uuid, p_cliente uuid, p_ligar boolean)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid    UUID := auth.uid();
  v_ct     RECORD;
  v_tipo   TEXT;
  v_chave  TEXT;
  v_formas TEXT[];
  v_neg    BOOLEAN;
  v_gestor BOOLEAN;
  v_total  BOOLEAN;
  v_atual  TEXT;
BEGIN
  IF v_uid IS NULL OR p_contato IS NULL OR p_cliente IS NULL THEN
    RETURN 'nada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = v_uid AND u.ativo IS TRUE AND u.perfil IS DISTINCT FROM 'cliente'
  ) THEN
    RETURN 'nada';
  END IF;

  SELECT ct.tenant_id, ct.instance_id, ct.numero_whatsapp, ct.group_size, ct.restrito_admin INTO v_ct
    FROM public.chat_contacts ct WHERE ct.id = p_contato;
  -- Contato apagado (cascata), restrito ou de outra empresa → nada.
  IF NOT FOUND OR v_ct.restrito_admin OR v_ct.tenant_id IS DISTINCT FROM public.get_user_tenant_id() THEN
    RETURN 'nada';
  END IF;
  -- Cliente apagado (cascata) ou de outra empresa → nada.
  IF NOT EXISTS (SELECT 1 FROM public.clients cl WHERE cl.id = p_cliente AND cl.tenant_id = v_ct.tenant_id) THEN
    RETURN 'nada';
  END IF;
  IF NOT COALESCE(public.user_can_access_client(p_cliente), false)
     OR NOT COALESCE(public.user_can_access_instance(v_ct.instance_id), false) THEN
    RETURN 'nada';
  END IF;

  v_tipo := private.canal_tipo(v_ct.numero_whatsapp, v_ct.group_size);
  v_chave := private.canal_chave(v_ct.numero_whatsapp, v_ct.group_size);
  IF v_chave IS NULL THEN
    RETURN 'nada';
  END IF;
  v_formas := private.canal_formas(v_tipo, v_chave);

  v_neg := EXISTS (
    SELECT 1 FROM public.cliente_canais c
     WHERE c.tenant_id = v_ct.tenant_id AND c.tipo = v_tipo AND c.chave = v_chave
       AND c.client_id IS NULL AND c.status IN ('interno', 'nao_cliente')
  );
  v_gestor := COALESCE(public.vinculos_pode_gerir(), false);
  v_total := v_gestor OR (
    NOT EXISTS (
      SELECT 1 FROM public.chat_contacts ct
       WHERE ct.tenant_id = v_ct.tenant_id
         AND ct.numero_whatsapp = ANY (v_formas)
         AND private.canal_tipo(ct.numero_whatsapp, ct.group_size) = v_tipo
         AND (ct.restrito_admin
              OR NOT COALESCE(public.user_can_access_instance(ct.instance_id), false)
              OR NOT COALESCE(public.user_can_access_client(ct.client_id), false))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.cliente_canais c
       WHERE c.tenant_id = v_ct.tenant_id AND c.tipo = v_tipo AND c.chave = v_chave
         AND c.status = 'confirmado' AND NOT COALESCE(public.user_can_access_client(c.client_id), false)
    )
  );

  SELECT c.status INTO v_atual
    FROM public.cliente_canais c
   WHERE c.tenant_id = v_ct.tenant_id AND c.tipo = v_tipo AND c.chave = v_chave AND c.client_id = p_cliente;

  IF p_ligar THEN
    IF v_atual = 'confirmado' THEN
      RETURN 'confirmado';
    END IF;
    IF v_atual = 'rejeitado' AND NOT v_gestor THEN
      RETURN 'nada'; -- recusado na tela: só quem gere vínculos volta atrás
    END IF;
    IF v_neg OR NOT v_total THEN
      INSERT INTO public.cliente_canais (tenant_id, client_id, tipo, chave, status, origem, evidencias)
      VALUES (v_ct.tenant_id, p_cliente, v_tipo, v_chave, 'sugerido', 'manual', '{"pedido_chat":true}'::jsonb)
      ON CONFLICT (tenant_id, tipo, chave, (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)))
      DO UPDATE SET evidencias = public.cliente_canais.evidencias || '{"pedido_chat":true}'::jsonb
              WHERE public.cliente_canais.status = 'sugerido';
      RETURN 'sugerido';
    END IF;
    INSERT INTO public.cliente_canais
      (tenant_id, client_id, tipo, chave, status, origem, revisado_por, revisado_em)
    VALUES (v_ct.tenant_id, p_cliente, v_tipo, v_chave, 'confirmado', 'manual', v_uid, now())
    ON CONFLICT (tenant_id, tipo, chave, (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    DO UPDATE SET status = 'confirmado', revisado_por = EXCLUDED.revisado_por, revisado_em = EXCLUDED.revisado_em;
    RETURN 'confirmado';
  END IF;

  -- Desligar
  IF v_neg OR NOT v_total OR v_atual = 'rejeitado' THEN
    RETURN 'nada';
  END IF;
  INSERT INTO public.cliente_canais
    (tenant_id, client_id, tipo, chave, status, origem, revisado_por, revisado_em)
  VALUES (v_ct.tenant_id, p_cliente, v_tipo, v_chave, 'rejeitado', 'manual', v_uid, now())
  ON CONFLICT (tenant_id, tipo, chave, (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  DO UPDATE SET status = 'rejeitado', revisado_por = EXCLUDED.revisado_por, revisado_em = EXCLUDED.revisado_em;
  RETURN 'rejeitado';
END;
$fn$;
REVOKE ALL ON FUNCTION private.vinculo_do_chat(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Contato novo herda o vínculo da chave (substitui trg_auto_match_contact)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_auto_match_contact ON public.chat_contacts;
DROP FUNCTION IF EXISTS public.trg_auto_match_contact_client();

-- BEFORE INSERT. Nome "zzzz_" para rodar DEPOIS de zz_herda_tenant_id e de
-- zzz_chat_contacts_restrito_admin (BEFORE roda em ordem alfabética): tenant e
-- marca de restrito já resolvidos.
CREATE OR REPLACE FUNCTION public.chat_contacts_herda_vinculo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tipo  TEXT;
  v_chave TEXT;
  v_cli   UUID;
  v_ids   UUID[];
BEGIN
  IF NEW.restrito_admin OR NEW.client_id IS NOT NULL OR NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_tipo := private.canal_tipo(NEW.numero_whatsapp, NEW.group_size);
  v_chave := private.canal_chave(NEW.numero_whatsapp, NEW.group_size);
  IF v_chave IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cliente_canais c
     WHERE c.tenant_id = NEW.tenant_id AND c.tipo = v_tipo AND c.chave = v_chave
       AND c.client_id IS NULL AND c.status IN ('interno', 'nao_cliente')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT c.client_id INTO v_cli
    FROM public.cliente_canais c
   WHERE c.tenant_id = NEW.tenant_id AND c.tipo = v_tipo AND c.chave = v_chave
     AND c.status = 'confirmado' AND c.client_id IS NOT NULL
   ORDER BY COALESCE(c.revisado_em, c.criado_em), c.id
   LIMIT 1;

  IF v_cli IS NULL AND v_tipo = 'privado' THEN
    v_ids := ARRAY(
      SELECT u FROM unnest(private.clientes_por_telefone(NEW.tenant_id, private.tel_cmp_contato(v_chave))) AS u
      EXCEPT
      SELECT c.client_id FROM public.cliente_canais c
       WHERE c.tenant_id = NEW.tenant_id AND c.tipo = v_tipo AND c.chave = v_chave AND c.status = 'rejeitado'
    );
    IF cardinality(v_ids) = 1 THEN
      v_cli := v_ids[1];
    END IF;
  END IF;

  -- Usuário logado só recebe aqui cliente que ele enxerga (senão a RLS do Chat
  -- recusaria o INSERT); o vínculo do canal chega depois pela sincronização.
  IF v_cli IS NOT NULL AND (auth.uid() IS NULL OR COALESCE(public.user_can_access_client(v_cli), false)) THEN
    NEW.client_id := v_cli;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.chat_contacts_herda_vinculo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zzzz_chat_contacts_herda_vinculo ON public.chat_contacts;
CREATE TRIGGER zzzz_chat_contacts_herda_vinculo
  BEFORE INSERT ON public.chat_contacts
  FOR EACH ROW EXECUTE FUNCTION public.chat_contacts_herda_vinculo();

-- AFTER INSERT: completa chat_contact_clients dos confirmados e registra em
-- cliente_canais o vínculo que nasceu fora dele (telefone ou client_id enviado).
CREATE OR REPLACE FUNCTION public.chat_contacts_vinculo_pos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tipo   TEXT;
  v_chave  TEXT;
  v_ids    UUID[];
  v_origem TEXT;
BEGIN
  IF NEW.restrito_admin OR NEW.tenant_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_tipo := private.canal_tipo(NEW.numero_whatsapp, NEW.group_size);
  v_chave := private.canal_chave(NEW.numero_whatsapp, NEW.group_size);
  IF v_chave IS NULL THEN
    RETURN NULL;
  END IF;

  -- Contato criado por uma PESSOA já com cliente: mesmas regras do Chat.
  IF NEW.client_id IS NOT NULL AND auth.uid() IS NOT NULL THEN
    PERFORM private.vinculo_do_chat(NEW.id, NEW.client_id, true);
    IF EXISTS (
      SELECT 1 FROM public.cliente_canais c
       WHERE c.tenant_id = NEW.tenant_id AND c.tipo = v_tipo AND c.chave = v_chave AND c.status = 'confirmado'
    ) THEN
      PERFORM private.vinculo_sincronizar(NEW.tenant_id, v_tipo, v_chave);
    END IF;
    RETURN NULL;
  END IF;

  -- Servidor (webhook, sem sessão): telefone único ou client_id enviado.
  IF NEW.client_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.clients cl WHERE cl.id = NEW.client_id AND cl.tenant_id = NEW.tenant_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.cliente_canais c
        WHERE c.tenant_id = NEW.tenant_id AND c.tipo = v_tipo AND c.chave = v_chave
          AND (c.client_id = NEW.client_id OR (c.client_id IS NULL AND c.status IN ('interno', 'nao_cliente')))
     ) THEN
    v_origem := 'legado';
    IF v_tipo = 'privado' THEN
      v_ids := private.clientes_por_telefone(NEW.tenant_id, private.tel_cmp_contato(v_chave));
      IF v_ids = ARRAY[NEW.client_id] THEN
        v_origem := 'telefone';
      END IF;
    END IF;
    INSERT INTO public.cliente_canais
      (tenant_id, client_id, tipo, chave, status, origem, score, evidencias, revisado_por, revisado_em)
    VALUES (
      NEW.tenant_id, NEW.client_id, v_tipo, v_chave, 'confirmado', v_origem, 1,
      CASE WHEN v_origem = 'telefone' THEN '{"telefone":"unico"}'::jsonb ELSE '{}'::jsonb END,
      NULL, NULL
    )
    ON CONFLICT (tenant_id, tipo, chave, (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    DO NOTHING; -- o gatilho de cliente_canais sincroniza
  ELSIF EXISTS (
    SELECT 1 FROM public.cliente_canais c
     WHERE c.tenant_id = NEW.tenant_id AND c.tipo = v_tipo AND c.chave = v_chave AND c.status = 'confirmado'
  ) THEN
    PERFORM private.vinculo_sincronizar(NEW.tenant_id, v_tipo, v_chave);
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.chat_contacts_vinculo_pos() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_contacts_vinculo_pos ON public.chat_contacts;
CREATE TRIGGER chat_contacts_vinculo_pos
  AFTER INSERT ON public.chat_contacts
  FOR EACH ROW EXECUTE FUNCTION public.chat_contacts_vinculo_pos();

-- ---------------------------------------------------------------------------
-- 6) Vínculo feito / desfeito à mão no Chat (só usuário logado)
-- ---------------------------------------------------------------------------
-- O Chat (useUpdateContact) grava chat_contacts.client_id e chat_contact_clients.
-- private.vinculo_do_chat decide se isso vira decisão do canal (ver acima).
-- Ignora: escrita do servidor (sem sessão), a própria sincronização
-- (omnx.vinculo_sync), apagamento em cascata e grupo restrito.
CREATE OR REPLACE FUNCTION public.chat_contact_clients_para_canal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR current_setting('omnx.vinculo_sync', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM private.vinculo_do_chat(NEW.contact_id, NEW.client_id, true);
  ELSE
    PERFORM private.vinculo_do_chat(OLD.contact_id, OLD.client_id, false);
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.chat_contact_clients_para_canal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_contact_clients_para_canal ON public.chat_contact_clients;
CREATE TRIGGER chat_contact_clients_para_canal
  AFTER INSERT OR DELETE ON public.chat_contact_clients
  FOR EACH ROW EXECUTE FUNCTION public.chat_contact_clients_para_canal();

CREATE OR REPLACE FUNCTION public.chat_contacts_client_para_canal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR current_setting('omnx.vinculo_sync', true) = 'on' OR NEW.client_id IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM private.vinculo_do_chat(NEW.id, NEW.client_id, true);
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.chat_contacts_client_para_canal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_contacts_client_para_canal ON public.chat_contacts;
CREATE TRIGGER chat_contacts_client_para_canal
  AFTER UPDATE OF client_id ON public.chat_contacts
  FOR EACH ROW
  WHEN (NEW.client_id IS NOT NULL AND NEW.client_id IS DISTINCT FROM OLD.client_id)
  EXECUTE FUNCTION public.chat_contacts_client_para_canal();

-- Políticas de chat_contact_clients (antes: qualquer logado da empresa lia
-- tudo — USING true — e gravava/apagava com auth.uid() IS NOT NULL).
-- Agora: só quem enxerga o CONTATO (RLS de chat_contacts + acesso à instância)
-- e o CLIENTE do vínculo; perfil 'cliente' nunca. O servidor (service_role)
-- ignora a RLS. As RESTRICTIVE tenant_isolation e restrito_admin continuam.
-- Consumidores conferidos: front só em src/hooks/useChat.ts (lista de vínculos,
-- upsert ao vincular, delete ao desvincular — sempre de contato visível); as
-- edge functions usam service_role; as funções SQL que leem são SECURITY DEFINER.
DROP POLICY IF EXISTS "Authenticated users can read chat_contact_clients" ON public.chat_contact_clients;
DROP POLICY IF EXISTS chat_contact_clients_insert ON public.chat_contact_clients;
DROP POLICY IF EXISTS chat_contact_clients_update ON public.chat_contact_clients;
DROP POLICY IF EXISTS chat_contact_clients_delete ON public.chat_contact_clients;
DROP POLICY IF EXISTS chat_contact_clients_select ON public.chat_contact_clients;

CREATE POLICY chat_contact_clients_select ON public.chat_contact_clients
  FOR SELECT TO authenticated
  USING (
    (SELECT u.perfil FROM public.users u WHERE u.id = (SELECT auth.uid())) IS DISTINCT FROM 'cliente'
    AND public.user_can_access_client(client_id)
    AND EXISTS (SELECT 1 FROM public.chat_contacts ct
                 WHERE ct.id = chat_contact_clients.contact_id
                   AND public.user_can_access_instance(ct.instance_id))
  );
CREATE POLICY chat_contact_clients_insert ON public.chat_contact_clients
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND (SELECT u.perfil FROM public.users u WHERE u.id = (SELECT auth.uid())) IS DISTINCT FROM 'cliente'
    AND public.user_can_access_client(client_id)
    AND EXISTS (SELECT 1 FROM public.chat_contacts ct
                 WHERE ct.id = chat_contact_clients.contact_id
                   AND public.user_can_access_instance(ct.instance_id))
  );
CREATE POLICY chat_contact_clients_update ON public.chat_contact_clients
  FOR UPDATE TO authenticated
  USING (
    (SELECT u.perfil FROM public.users u WHERE u.id = (SELECT auth.uid())) IS DISTINCT FROM 'cliente'
    AND public.user_can_access_client(client_id)
    AND EXISTS (SELECT 1 FROM public.chat_contacts ct
                 WHERE ct.id = chat_contact_clients.contact_id
                   AND public.user_can_access_instance(ct.instance_id))
  )
  WITH CHECK (
    (SELECT u.perfil FROM public.users u WHERE u.id = (SELECT auth.uid())) IS DISTINCT FROM 'cliente'
    AND public.user_can_access_client(client_id)
    AND EXISTS (SELECT 1 FROM public.chat_contacts ct
                 WHERE ct.id = chat_contact_clients.contact_id
                   AND public.user_can_access_instance(ct.instance_id))
  );
CREATE POLICY chat_contact_clients_delete ON public.chat_contact_clients
  FOR DELETE TO authenticated
  USING (
    (SELECT u.perfil FROM public.users u WHERE u.id = (SELECT auth.uid())) IS DISTINCT FROM 'cliente'
    AND public.user_can_access_client(client_id)
    AND EXISTS (SELECT 1 FROM public.chat_contacts ct
                 WHERE ct.id = chat_contact_clients.contact_id
                   AND public.user_can_access_instance(ct.instance_id))
  );
-- anon nunca (a tabela tinha GRANT amplo para anon; a RLS já negava).
REVOKE ALL ON public.chat_contact_clients FROM anon;
REVOKE TRUNCATE ON public.chat_contact_clients FROM authenticated;

-- ---------------------------------------------------------------------------
-- 7) Grupo interno registrado ⇒ canal 'interno'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_grupos_restritos_vinculo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.tenant_id IS NOT NULL AND private.canal_chave(NEW.grupo_base, 1) IS NOT NULL THEN
    INSERT INTO public.cliente_canais (tenant_id, client_id, tipo, chave, status, origem, evidencias)
    VALUES (NEW.tenant_id, NULL, 'grupo', private.canal_chave(NEW.grupo_base, 1), 'interno', 'manual', '{}'::jsonb)
    ON CONFLICT (tenant_id, tipo, chave, (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    DO NOTHING;
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.chat_grupos_restritos_vinculo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_grupos_restritos_vinculo ON public.chat_grupos_restritos;
CREATE TRIGGER chat_grupos_restritos_vinculo
  AFTER INSERT ON public.chat_grupos_restritos
  FOR EACH ROW EXECUTE FUNCTION public.chat_grupos_restritos_vinculo();

-- ---------------------------------------------------------------------------
-- 8) match_contact_to_client corrigida (mesma assinatura)
-- ---------------------------------------------------------------------------
-- Chamada pelo uazapi-webhook (service_role) para contato PRIVADO sem client_id.
-- p_whatsapp é ignorado de propósito: a fonte da verdade é o número gravado no
-- contato (o parâmetro fica só para não quebrar quem chama).
-- Ordem: decisão negativa do canal → não vincula; vínculo confirmado da chave
-- (outra instância) → sincroniza; telefone com correspondência ÚNICA (tirando os
-- clientes já rejeitados para o canal) → grava confirmado/telefone.
CREATE OR REPLACE FUNCTION public.match_contact_to_client(p_contact_id uuid, p_whatsapp text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ct    RECORD;
  v_tipo  TEXT;
  v_chave TEXT;
  v_cli   UUID;
  v_ids   UUID[];
BEGIN
  SELECT ct.id, ct.tenant_id, ct.numero_whatsapp, ct.group_size, ct.client_id, ct.restrito_admin
    INTO v_ct
    FROM public.chat_contacts ct
   WHERE ct.id = p_contact_id;
  IF NOT FOUND OR v_ct.tenant_id IS NULL OR v_ct.restrito_admin THEN
    RETURN NULL;
  END IF;
  IF v_ct.client_id IS NOT NULL THEN
    RETURN v_ct.client_id;
  END IF;
  v_tipo := private.canal_tipo(v_ct.numero_whatsapp, v_ct.group_size);
  v_chave := private.canal_chave(v_ct.numero_whatsapp, v_ct.group_size);
  IF v_tipo IS DISTINCT FROM 'privado' OR v_chave IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cliente_canais c
     WHERE c.tenant_id = v_ct.tenant_id AND c.tipo = v_tipo AND c.chave = v_chave
       AND c.client_id IS NULL AND c.status IN ('interno', 'nao_cliente')
  ) THEN
    RETURN NULL;
  END IF;

  SELECT c.client_id INTO v_cli
    FROM public.cliente_canais c
   WHERE c.tenant_id = v_ct.tenant_id AND c.tipo = v_tipo AND c.chave = v_chave
     AND c.status = 'confirmado' AND c.client_id IS NOT NULL
   ORDER BY COALESCE(c.revisado_em, c.criado_em), c.id
   LIMIT 1;
  IF v_cli IS NOT NULL THEN
    PERFORM private.vinculo_sincronizar(v_ct.tenant_id, v_tipo, v_chave);
  ELSE
    v_ids := ARRAY(
      SELECT u FROM unnest(private.clientes_por_telefone(v_ct.tenant_id, private.tel_cmp_contato(v_chave))) AS u
      EXCEPT
      SELECT c.client_id FROM public.cliente_canais c
       WHERE c.tenant_id = v_ct.tenant_id AND c.tipo = v_tipo AND c.chave = v_chave AND c.status = 'rejeitado'
    );
    IF cardinality(v_ids) <> 1 THEN
      RETURN NULL;
    END IF;
    INSERT INTO public.cliente_canais
      (tenant_id, client_id, tipo, chave, status, origem, score, evidencias)
    VALUES (v_ct.tenant_id, v_ids[1], v_tipo, v_chave, 'confirmado', 'telefone', 1, '{"telefone":"unico"}'::jsonb)
    ON CONFLICT (tenant_id, tipo, chave, (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    DO UPDATE SET status = 'confirmado', origem = 'telefone', score = 1, evidencias = EXCLUDED.evidencias
            WHERE public.cliente_canais.status = 'sugerido';
  END IF;

  SELECT ct.client_id INTO v_cli FROM public.chat_contacts ct WHERE ct.id = p_contact_id;
  RETURN v_cli;
END;
$fn$;

COMMENT ON FUNCTION public.match_contact_to_client(uuid, text) IS
  'uazapi-webhook: vincula contato PRIVADO sem cliente pelo canal (vínculo confirmado da chave) ou pelo telefone (DDD + 8 últimos dígitos; cadastro e contrato; correspondência única), sempre na empresa do contato. Grava em cliente_canais. Só service_role.';
REVOKE ALL ON FUNCTION public.match_contact_to_client(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_contact_to_client(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 9) RPCs da tela "Vínculos"
-- ---------------------------------------------------------------------------

-- Lista os canais (grupo / privado) da empresa, agrupando as instâncias.
--   p_filtro: 'ativos' (mensagem em p_dias dias), 'pendentes' (sem decisão,
--   também ativos em p_dias dias), 'todos'. p_tipo: 'grupo' | 'privado' | NULL.
-- Telefone nunca sai inteiro: só os 4 últimos dígitos.
CREATE OR REPLACE FUNCTION public.vinculos_listar(
  p_dias integer DEFAULT 30, p_filtro text DEFAULT 'ativos', p_tipo text DEFAULT NULL, p_limite integer DEFAULT 300
)
RETURNS TABLE (
  contato_id       uuid,
  tipo             text,
  nome             text,
  final_telefone   text,
  msgs_30d         integer,
  ultima_msg_em    timestamptz,
  instancias       integer,
  instancias_nomes text[],
  ocultar_grupos   boolean,
  instancias_ocultas text[],
  restrito         boolean,
  decisao          text,
  clientes         jsonb,
  sugestoes        jsonb,
  rejeitados       integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant UUID := public.get_user_tenant_id();
  v_filtro TEXT := COALESCE(p_filtro, 'ativos');
  v_dias   INTEGER;
  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limite, 300), 1), 500);
  v_janela TIMESTAMPTZ;
BEGIN
  IF v_tenant IS NULL OR NOT public.vinculos_pode_gerir() THEN
    RAISE EXCEPTION 'Sem permissão para ver os vínculos de conversas.' USING ERRCODE = '42501';
  END IF;
  IF v_filtro NOT IN ('ativos', 'pendentes', 'todos') THEN
    RAISE EXCEPTION 'Filtro inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo IS NOT NULL AND p_tipo NOT IN ('grupo', 'privado') THEN
    RAISE EXCEPTION 'Tipo inválido.' USING ERRCODE = '22023';
  END IF;
  v_dias := CASE v_filtro
              WHEN 'todos' THEN NULL
              ELSE LEAST(GREATEST(COALESCE(p_dias, 30), 1), 365)
            END;
  -- Mensagens lidas: a janela do filtro (mínimo 30 dias, para a contagem).
  v_janela := now() - make_interval(days => GREATEST(COALESCE(v_dias, 30), 30));

  RETURN QUERY
  WITH ct AS (
    SELECT c.id, c.instance_id, c.nome AS c_nome, c.restrito_admin, c.atualizado_em,
           private.canal_tipo(c.numero_whatsapp, c.group_size) AS tp,
           private.canal_chave(c.numero_whatsapp, c.group_size) AS ch
      FROM public.chat_contacts c
     WHERE c.tenant_id = v_tenant
  ),
  ctk AS (
    SELECT * FROM ct WHERE ct.tp IS NOT NULL AND ct.ch IS NOT NULL AND (p_tipo IS NULL OR ct.tp = p_tipo)
  ),
  conv AS (
    -- Última mensagem do cliente (atualizado_em muda por outros motivos).
    SELECT cv.contact_id, max(cv.ultima_msg_cliente_em) AS ult_conv
      FROM public.chat_conversations cv
     WHERE cv.tenant_id = v_tenant
     GROUP BY cv.contact_id
  ),
  msg AS (
    SELECT cv.contact_id,
           (count(*) FILTER (WHERE m.criado_em >= now() - interval '30 days'))::int AS n30,
           max(m.criado_em) AS ult
      FROM public.chat_messages m
      JOIN public.chat_conversations cv ON cv.id = m.conversation_id AND cv.tenant_id = v_tenant
     WHERE m.tenant_id = v_tenant
       AND m.criado_em >= v_janela
       AND COALESCE(m.tipo, '') <> 'nota_interna'
     GROUP BY cv.contact_id
  ),
  pk AS (
    SELECT k.tp, k.ch,
           (array_agg(k.id ORDER BY COALESCE(msg.ult, conv.ult_conv, k.atualizado_em) DESC NULLS LAST))[1] AS rep,
           (array_agg(NULLIF(btrim(k.c_nome), '')
              ORDER BY (NULLIF(btrim(k.c_nome), '') IS NULL), COALESCE(msg.ult, conv.ult_conv, k.atualizado_em) DESC NULLS LAST))[1] AS p_nome,
           COALESCE(sum(msg.n30), 0)::int AS n30,
           max(COALESCE(msg.ult, conv.ult_conv)) AS ult,
           count(DISTINCT k.instance_id)::int AS ninst,
           array_agg(DISTINCT wi.nome) FILTER (WHERE wi.nome IS NOT NULL) AS nomes_inst,
           bool_or(COALESCE(wi.ocultar_grupos, false)) AS ocultar,
           array_agg(DISTINCT wi.nome) FILTER (WHERE wi.ocultar_grupos AND wi.nome IS NOT NULL) AS nomes_ocultos,
           bool_or(k.restrito_admin) AS restr
      FROM ctk k
      LEFT JOIN msg ON msg.contact_id = k.id
      LEFT JOIN conv ON conv.contact_id = k.id
      LEFT JOIN public.whatsapp_instances wi ON wi.id = k.instance_id AND wi.tenant_id = v_tenant
     GROUP BY k.tp, k.ch
  ),
  cc AS (
    SELECT c.* FROM public.cliente_canais c WHERE c.tenant_id = v_tenant
  ),
  dec AS (
    SELECT pk.tp, pk.ch,
           (SELECT x.status FROM cc x WHERE x.tipo = pk.tp AND x.chave = pk.ch AND x.client_id IS NULL LIMIT 1) AS neg,
           EXISTS (SELECT 1 FROM cc x WHERE x.tipo = pk.tp AND x.chave = pk.ch AND x.status = 'confirmado') AS conf
      FROM pk
  )
  SELECT pk.rep,
         pk.tp,
         left(COALESCE(pk.p_nome, CASE WHEN pk.tp = 'grupo' THEN 'Grupo sem nome' ELSE 'Contato sem nome' END), 120),
         CASE WHEN pk.tp = 'privado' THEN right(pk.ch, 4) END,
         pk.n30,
         pk.ult,
         pk.ninst,
         COALESCE(pk.nomes_inst, '{}'::text[]),
         (pk.tp = 'grupo' AND pk.ocultar),
         CASE WHEN pk.tp = 'grupo' THEN COALESCE(pk.nomes_ocultos, '{}'::text[]) ELSE '{}'::text[] END,
         pk.restr,
         COALESCE(dec.neg, CASE WHEN dec.conf THEN 'confirmado' END),
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'id', cl.id, 'nome', left(cl.nome, 120), 'origem', x.origem,
                    'revisado', x.revisado_por IS NOT NULL)
                  ORDER BY COALESCE(x.revisado_em, x.criado_em))
             FROM cc x JOIN public.clients cl ON cl.id = x.client_id AND cl.tenant_id = v_tenant
            WHERE x.tipo = pk.tp AND x.chave = pk.ch AND x.status = 'confirmado'
         ), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'id', cl.id, 'nome', left(cl.nome, 120), 'origem', x.origem,
                    'score', x.score, 'evidencias', x.evidencias)
                  ORDER BY x.score DESC NULLS LAST, cl.nome)
             FROM cc x JOIN public.clients cl ON cl.id = x.client_id AND cl.tenant_id = v_tenant
            WHERE x.tipo = pk.tp AND x.chave = pk.ch AND x.status = 'sugerido'
         ), '[]'::jsonb),
         (SELECT count(*)::int FROM cc x WHERE x.tipo = pk.tp AND x.chave = pk.ch AND x.status = 'rejeitado')
    FROM pk
    JOIN dec ON dec.tp = pk.tp AND dec.ch = pk.ch
   WHERE (v_dias IS NULL OR pk.ult >= now() - make_interval(days => v_dias))
     AND (v_filtro <> 'pendentes' OR (NOT pk.restr AND dec.neg IS NULL AND NOT dec.conf))
   ORDER BY (pk.tp = 'grupo') DESC, pk.n30 DESC, pk.ult DESC NULLS LAST
   LIMIT v_lim;
END;
$fn$;
COMMENT ON FUNCTION public.vinculos_listar(integer, text, text, integer) IS
  'Tela Vínculos: canais (grupos e privados, todas as instâncias juntas) com mensagens em 30 dias, decisão, clientes confirmados e sugestões. Só admin/gerente do app; telefone só com 4 dígitos finais.';
REVOKE ALL ON FUNCTION public.vinculos_listar(integer, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vinculos_listar(integer, text, text, integer) TO authenticated;

-- Decide o vínculo de um canal (identificado por qualquer contato dele).
--   aceitar   → confirma o cliente; as outras sugestões viram 'rejeitado'.
--   trocar    → confirma o cliente; TODOS os outros (confirmados e sugeridos)
--               viram 'rejeitado' ("é outro cliente").
--   adicionar → confirma mais um cliente (grupo de dois clientes).
--   rejeitar  → "não é este cliente".
--   interno / nao_cliente → decisão do canal; todos os clientes viram 'rejeitado'.
--   reabrir   → desfaz interno / nao_cliente (volta a pendente).
CREATE OR REPLACE FUNCTION public.vinculos_decidir(p_contato_id uuid, p_acao text, p_client_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant UUID := public.get_user_tenant_id();
  v_ct     RECORD;
  v_tipo   TEXT;
  v_chave  TEXT;
  v_restr  BOOLEAN;
BEGIN
  IF v_tenant IS NULL OR NOT public.vinculos_pode_gerir() THEN
    RAISE EXCEPTION 'Sem permissão para decidir vínculos de conversas.' USING ERRCODE = '42501';
  END IF;
  IF p_acao IS NULL OR p_acao NOT IN ('aceitar', 'trocar', 'adicionar', 'rejeitar', 'interno', 'nao_cliente', 'reabrir') THEN
    RAISE EXCEPTION 'Ação inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT ct.numero_whatsapp, ct.group_size INTO v_ct
    FROM public.chat_contacts ct
   WHERE ct.id = p_contato_id AND ct.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa não encontrada nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  v_tipo := private.canal_tipo(v_ct.numero_whatsapp, v_ct.group_size);
  v_chave := private.canal_chave(v_ct.numero_whatsapp, v_ct.group_size);
  IF v_chave IS NULL THEN
    RAISE EXCEPTION 'Esta conversa não tem um número ou grupo reconhecido.' USING ERRCODE = 'check_violation';
  END IF;

  v_restr := EXISTS (
    SELECT 1 FROM public.chat_contacts ct
     WHERE ct.tenant_id = v_tenant AND ct.restrito_admin
       AND ct.numero_whatsapp = ANY (private.canal_formas(v_tipo, v_chave))
  );
  IF v_restr AND p_acao IN ('aceitar', 'trocar', 'adicionar', 'reabrir') THEN
    RAISE EXCEPTION 'Este é um grupo interno (relatório diário ou assistente) e não pode ser ligado a cliente.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_acao IN ('aceitar', 'trocar', 'adicionar', 'rejeitar') THEN
    IF p_client_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.clients cl WHERE cl.id = p_client_id AND cl.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'Cliente não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Uma decisão por canal de cada vez.
  PERFORM pg_advisory_xact_lock(hashtext('cliente_canais:' || v_tenant::text || ':' || v_tipo || ':' || v_chave));

  IF p_acao IN ('aceitar', 'trocar', 'adicionar') THEN
    DELETE FROM public.cliente_canais c
     WHERE c.tenant_id = v_tenant AND c.tipo = v_tipo AND c.chave = v_chave AND c.client_id IS NULL;
    IF p_acao IN ('aceitar', 'trocar') THEN
      UPDATE public.cliente_canais c
         SET status = 'rejeitado', revisado_por = auth.uid(), revisado_em = now()
       WHERE c.tenant_id = v_tenant AND c.tipo = v_tipo AND c.chave = v_chave
         AND c.client_id IS NOT NULL AND c.client_id <> p_client_id
         AND (c.status = 'sugerido' OR (p_acao = 'trocar' AND c.status = 'confirmado'));
    END IF;
    INSERT INTO public.cliente_canais
      (tenant_id, client_id, tipo, chave, status, origem, revisado_por, revisado_em)
    VALUES (v_tenant, p_client_id, v_tipo, v_chave, 'confirmado', 'manual', auth.uid(), now())
    ON CONFLICT (tenant_id, tipo, chave, (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    DO UPDATE SET status = 'confirmado', revisado_por = EXCLUDED.revisado_por, revisado_em = EXCLUDED.revisado_em;

  ELSIF p_acao = 'rejeitar' THEN
    INSERT INTO public.cliente_canais
      (tenant_id, client_id, tipo, chave, status, origem, revisado_por, revisado_em)
    VALUES (v_tenant, p_client_id, v_tipo, v_chave, 'rejeitado', 'manual', auth.uid(), now())
    ON CONFLICT (tenant_id, tipo, chave, (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    DO UPDATE SET status = 'rejeitado', revisado_por = EXCLUDED.revisado_por, revisado_em = EXCLUDED.revisado_em;

  ELSIF p_acao IN ('interno', 'nao_cliente') THEN
    UPDATE public.cliente_canais c
       SET status = 'rejeitado', revisado_por = auth.uid(), revisado_em = now()
     WHERE c.tenant_id = v_tenant AND c.tipo = v_tipo AND c.chave = v_chave
       AND c.client_id IS NOT NULL AND c.status IN ('confirmado', 'sugerido');
    INSERT INTO public.cliente_canais
      (tenant_id, client_id, tipo, chave, status, origem, revisado_por, revisado_em)
    VALUES (v_tenant, NULL, v_tipo, v_chave, p_acao, 'manual', auth.uid(), now())
    ON CONFLICT (tenant_id, tipo, chave, (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    DO UPDATE SET status = EXCLUDED.status, origem = 'manual',
                  revisado_por = EXCLUDED.revisado_por, revisado_em = EXCLUDED.revisado_em;

  ELSE -- reabrir
    DELETE FROM public.cliente_canais c
     WHERE c.tenant_id = v_tenant AND c.tipo = v_tipo AND c.chave = v_chave AND c.client_id IS NULL;
  END IF;

  RETURN jsonb_build_object('ok', true, 'tipo', v_tipo);
END;
$fn$;
COMMENT ON FUNCTION public.vinculos_decidir(uuid, text, uuid) IS
  'Tela Vínculos: aceitar / trocar / adicionar / rejeitar cliente, ou marcar o canal como interno / não é cliente (reabrir desfaz). Vale para todas as instâncias. Só admin/gerente do app.';
REVOKE ALL ON FUNCTION public.vinculos_decidir(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vinculos_decidir(uuid, text, uuid) TO authenticated;

-- Busca de clientes para "Outro cliente" (nome, empresa ou razão social).
CREATE OR REPLACE FUNCTION public.vinculos_buscar_clientes(p_texto text, p_limite integer DEFAULT 20)
RETURNS TABLE (id uuid, nome text, empresa text, ativo boolean, vigente boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_tenant UUID := public.get_user_tenant_id();
  v_txt    TEXT := btrim(COALESCE(p_texto, ''));
  v_padrao TEXT;
BEGIN
  IF v_tenant IS NULL OR NOT public.vinculos_pode_gerir() THEN
    RAISE EXCEPTION 'Sem permissão para buscar clientes.' USING ERRCODE = '42501';
  END IF;
  IF length(v_txt) < 2 OR length(v_txt) > 80 THEN
    RETURN;
  END IF;
  v_padrao := '%' || replace(replace(replace(
                lower(extensions.unaccent('extensions.unaccent'::regdictionary, v_txt)),
                '\', '\\'), '%', '\%'), '_', '\_') || '%';
  RETURN QUERY
    SELECT cl.id, left(cl.nome, 120), left(cl.empresa, 120), (cl.ativo IS DISTINCT FROM false),
           EXISTS (
             SELECT 1 FROM public.contratos co
              WHERE co.tenant_id = v_tenant AND co.cliente_id = cl.id
                AND lower(extensions.unaccent('extensions.unaccent'::regdictionary, btrim(COALESCE(co.status, ''))))
                    NOT IN ('cancelado', 'concluido', 'encerrado', 'distrato', 'finalizado', 'rescindido')
           )
      FROM public.clients cl
     WHERE cl.tenant_id = v_tenant
       AND (
         lower(extensions.unaccent('extensions.unaccent'::regdictionary, COALESCE(cl.nome, ''))) LIKE v_padrao
         OR lower(extensions.unaccent('extensions.unaccent'::regdictionary, COALESCE(cl.empresa, ''))) LIKE v_padrao
         OR lower(extensions.unaccent('extensions.unaccent'::regdictionary, COALESCE(cl.razao_social, ''))) LIKE v_padrao
       )
     ORDER BY (cl.ativo IS DISTINCT FROM false) DESC, cl.nome
     LIMIT LEAST(GREATEST(COALESCE(p_limite, 20), 1), 50);
END;
$fn$;
REVOKE ALL ON FUNCTION public.vinculos_buscar_clientes(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vinculos_buscar_clientes(text, integer) TO authenticated;

-- Evidências: só chaves e códigos da lista (nada de texto livre).
CREATE OR REPLACE FUNCTION private.vinculo_evidencias_limpas(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT COALESCE(jsonb_object_agg(e.k, e.v), '{}'::jsonb)
    FROM jsonb_each(CASE WHEN jsonb_typeof(p) = 'object' THEN p ELSE '{}'::jsonb END) AS e(k, v)
   WHERE (e.k = 'nome_grupo' AND jsonb_typeof(e.v) = 'string'
          AND (e.v #>> '{}') IN ('completo', 'primeiro_ultimo', 'empresa', 'razao_social', 'instagram'))
      OR (e.k = 'fonte' AND jsonb_typeof(e.v) = 'string' AND (e.v #>> '{}') IN ('cadastro', 'contrato'))
      OR (e.k = 'telefone' AND jsonb_typeof(e.v) = 'string' AND (e.v #>> '{}') IN ('unico', 'ambiguo'))
      OR (e.k IN ('membro_com_nome_do_cliente', 'instancias', 'contatos') AND jsonb_typeof(e.v) = 'number'
          AND (e.v #>> '{}')::numeric BETWEEN 0 AND 9999)
      OR (e.k IN ('contrato_vigente', 'ambiguo', 'pedido_chat') AND jsonb_typeof(e.v) = 'boolean')
$fn$;
REVOKE ALL ON FUNCTION private.vinculo_evidencias_limpas(jsonb) FROM PUBLIC;

-- Gravação das sugestões do wa-vinculos-sugerir (SÓ service_role).
--   * nunca mexe em decisão humana nem em confirmado/rejeitado: só cria linha
--     nova ou atualiza linha 'sugerido';
--   * canal com decisão negativa (interno / não é cliente) ou grupo restrito: pula;
--   * 'confirmado' só para origem determinística, conferida AQUI:
--       telefone  → correspondência única (mesma regra de match_contact_to_client);
--       legado / mesmo_jid → algum contato da chave já está ligado ao cliente;
--     qualquer outra origem (nome) vira 'sugerido';
--   * p_chaves ('grupo:<chave>' / 'privado:<chave>'): canais analisados nesta
--     execução — sugestões antigas deles que não vieram de novo são apagadas.
CREATE OR REPLACE FUNCTION public.vinculos_gravar_sugestoes(p_tenant uuid, p_itens jsonb, p_chaves text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  r          RECORD;
  v_status   TEXT;
  v_ids      UUID[];
  v_gravados INTEGER := 0;
  v_conf     INTEGER := 0;
  v_ignor    INTEGER := 0;
  v_remov    INTEGER := 0;
  v_n        INTEGER;
BEGIN
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) > 5000 THEN
    RAISE EXCEPTION 'Lista de sugestões inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_chaves IS NOT NULL AND cardinality(p_chaves) > 20000 THEN
    RAISE EXCEPTION 'Lista de canais grande demais.' USING ERRCODE = '22023';
  END IF;

  FOR r IN
    SELECT x.tipo, x.chave, x.client_id, x.status, x.origem, x.score, x.evidencias
      FROM jsonb_to_recordset(p_itens) AS x(tipo text, chave text, client_id uuid, status text,
                                            origem text, score numeric, evidencias jsonb)
  LOOP
    IF r.tipo NOT IN ('grupo', 'privado') OR r.chave IS NULL OR r.client_id IS NULL
       OR r.status NOT IN ('sugerido', 'confirmado')
       OR r.origem NOT IN ('legado', 'mesmo_jid', 'telefone', 'nome_grupo', 'nome_membro')
       OR private.canal_tipo(r.chave, CASE WHEN r.tipo = 'grupo' THEN 1 END) IS DISTINCT FROM r.tipo
       OR private.canal_chave(r.chave, CASE WHEN r.tipo = 'grupo' THEN 1 END) IS DISTINCT FROM r.chave
       OR NOT EXISTS (SELECT 1 FROM public.clients cl WHERE cl.id = r.client_id AND cl.tenant_id = p_tenant)
       OR EXISTS (
         SELECT 1 FROM public.cliente_canais c
          WHERE c.tenant_id = p_tenant AND c.tipo = r.tipo AND c.chave = r.chave
            AND c.client_id IS NULL AND c.status IN ('interno', 'nao_cliente'))
       OR EXISTS (
         SELECT 1 FROM public.chat_contacts ct
          WHERE ct.tenant_id = p_tenant AND ct.restrito_admin
            AND ct.numero_whatsapp = ANY (private.canal_formas(r.tipo, r.chave)))
    THEN
      v_ignor := v_ignor + 1;
      CONTINUE;
    END IF;

    v_status := r.status;
    IF v_status = 'confirmado' THEN
      IF r.origem = 'telefone' THEN
        v_ids := ARRAY(
          SELECT u FROM unnest(private.clientes_por_telefone(p_tenant, private.tel_cmp_contato(r.chave))) AS u
          EXCEPT
          SELECT c.client_id FROM public.cliente_canais c
           WHERE c.tenant_id = p_tenant AND c.tipo = r.tipo AND c.chave = r.chave AND c.status = 'rejeitado'
        );
        IF r.tipo <> 'privado' OR v_ids IS DISTINCT FROM ARRAY[r.client_id] THEN
          v_status := 'sugerido';
        END IF;
      ELSIF r.origem IN ('legado', 'mesmo_jid') THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.chat_contacts ct
           WHERE ct.tenant_id = p_tenant
             AND ct.numero_whatsapp = ANY (private.canal_formas(r.tipo, r.chave))
             AND (ct.client_id = r.client_id OR EXISTS (
                   SELECT 1 FROM public.chat_contact_clients cc
                    WHERE cc.tenant_id = p_tenant AND cc.contact_id = ct.id AND cc.client_id = r.client_id))
        ) THEN
          v_ignor := v_ignor + 1;
          CONTINUE;
        END IF;
      ELSE
        v_status := 'sugerido'; -- nome nunca confirma sozinho
      END IF;
    END IF;

    INSERT INTO public.cliente_canais
      (tenant_id, client_id, tipo, chave, status, origem, score, evidencias)
    VALUES (
      p_tenant, r.client_id, r.tipo, r.chave, v_status, r.origem,
      CASE WHEN r.score IS NULL THEN NULL ELSE round(LEAST(GREATEST(r.score, 0), 1), 2) END,
      private.vinculo_evidencias_limpas(r.evidencias)
    )
    ON CONFLICT (tenant_id, tipo, chave, (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    DO UPDATE SET status = EXCLUDED.status, origem = EXCLUDED.origem,
                  score = EXCLUDED.score, evidencias = EXCLUDED.evidencias
            WHERE public.cliente_canais.status = 'sugerido'
              AND public.cliente_canais.origem <> 'manual' -- pedido feito no Chat fica como está
              AND (public.cliente_canais.status, public.cliente_canais.origem, public.cliente_canais.score, public.cliente_canais.evidencias)
                  IS DISTINCT FROM (EXCLUDED.status, EXCLUDED.origem, EXCLUDED.score, EXCLUDED.evidencias);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
      v_gravados := v_gravados + 1;
      IF v_status = 'confirmado' THEN
        v_conf := v_conf + 1;
      END IF;
    END IF;
  END LOOP;

  IF p_chaves IS NOT NULL THEN
    DELETE FROM public.cliente_canais c
     WHERE c.tenant_id = p_tenant
       AND c.status = 'sugerido'
       AND c.origem <> 'manual'
       AND (c.tipo || ':' || c.chave) = ANY (p_chaves)
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_to_recordset(p_itens) AS x(tipo text, chave text, client_id uuid)
          WHERE x.tipo = c.tipo AND x.chave = c.chave AND x.client_id = c.client_id);
    GET DIAGNOSTICS v_remov = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('gravados', v_gravados, 'confirmados', v_conf, 'ignorados', v_ignor, 'removidos', v_remov);
END;
$fn$;
COMMENT ON FUNCTION public.vinculos_gravar_sugestoes(uuid, jsonb, text[]) IS
  'wa-vinculos-sugerir: grava sugestões sem sobrescrever decisão humana; confirma só telefone único / legado / mesmo_jid (conferidos aqui). Só service_role.';
REVOKE ALL ON FUNCTION public.vinculos_gravar_sugestoes(uuid, jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vinculos_gravar_sugestoes(uuid, jsonb, text[]) TO service_role;

-- Botão "Recalcular sugestões": reserva ATÔMICA de 1 execução manual por
-- empresa a cada p_intervalo_s segundos (lock por empresa + conferência + linha
-- de registro). NULL = já houve uma há pouco. Só service_role (wa-vinculos-sugerir).
CREATE OR REPLACE FUNCTION public.vinculos_reservar_execucao(p_tenant uuid, p_user uuid, p_intervalo_s integer DEFAULT 60)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id UUID;
BEGIN
  IF p_tenant IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('vinculos_execucoes:' || p_tenant::text));
  IF EXISTS (
    SELECT 1 FROM public.vinculos_execucoes e
     WHERE e.tenant_id = p_tenant AND e.origem = 'manual'
       AND e.criado_em > now() - make_interval(secs => LEAST(GREATEST(COALESCE(p_intervalo_s, 60), 10), 3600))
  ) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.vinculos_execucoes (tenant_id, origem, user_id, resultado)
  VALUES (p_tenant, 'manual', p_user, '{"em_andamento":1}'::jsonb)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.vinculos_reservar_execucao(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vinculos_reservar_execucao(uuid, uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 9b) Cópia de segurança dos vínculos ANTES da migração do legado
-- ---------------------------------------------------------------------------
-- Guarda (id, client_id) de chat_contacts e as linhas de chat_contact_clients
-- como estavam. Só grava na primeira vez (rodar a migration de novo não
-- sobrescreve). Fica no schema private, sem acesso para anon/authenticated.
--
-- REVERSÃO dos vínculos (rodar no SQL editor, sem sessão; de preferência logo
-- depois da publicação — apaga também vínculos feitos no Chat depois dela):
--   BEGIN;
--   SELECT cron.unschedule('wa-vinculos-sugerir-diario');
--   DROP TABLE IF EXISTS public.cliente_canais CASCADE;  -- para de sincronizar
--   SELECT set_config('omnx.vinculo_sync', 'on', true);
--   UPDATE public.chat_contacts c SET client_id = b.client_id
--     FROM private.backup_vinculos_20261027_contatos b
--    WHERE b.id = c.id AND c.client_id IS DISTINCT FROM b.client_id
--      AND (b.client_id IS NULL OR EXISTS (SELECT 1 FROM public.clients cl WHERE cl.id = b.client_id));
--   DELETE FROM public.chat_contact_clients cc
--    WHERE NOT EXISTS (SELECT 1 FROM private.backup_vinculos_20261027_juncao b WHERE b.id = cc.id)
--      AND EXISTS (SELECT 1 FROM private.backup_vinculos_20261027_contatos b WHERE b.id = cc.contact_id);
--   INSERT INTO public.chat_contact_clients (id, contact_id, client_id, tenant_id, criado_em)
--   SELECT b.id, b.contact_id, b.client_id, b.tenant_id, b.criado_em
--     FROM private.backup_vinculos_20261027_juncao b
--    WHERE EXISTS (SELECT 1 FROM public.chat_contacts c WHERE c.id = b.contact_id)
--      AND EXISTS (SELECT 1 FROM public.clients cl WHERE cl.id = b.client_id)
--   ON CONFLICT DO NOTHING;
--   COMMIT;
-- (Contatos criados depois da publicação não estão na cópia e ficam como estão.)
CREATE TABLE IF NOT EXISTS private.backup_vinculos_20261027_contatos (
  id        UUID PRIMARY KEY,
  tenant_id UUID,
  client_id UUID,
  copiado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS private.backup_vinculos_20261027_juncao (
  id         UUID PRIMARY KEY,
  contact_id UUID NOT NULL,
  client_id  UUID NOT NULL,
  tenant_id  UUID,
  criado_em  TIMESTAMPTZ,
  copiado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON private.backup_vinculos_20261027_contatos, private.backup_vinculos_20261027_juncao
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO private.backup_vinculos_20261027_contatos (id, tenant_id, client_id)
SELECT c.id, c.tenant_id, c.client_id FROM public.chat_contacts c
 WHERE NOT EXISTS (SELECT 1 FROM private.backup_vinculos_20261027_contatos LIMIT 1);
INSERT INTO private.backup_vinculos_20261027_juncao (id, contact_id, client_id, tenant_id, criado_em)
SELECT cc.id, cc.contact_id, cc.client_id, cc.tenant_id, cc.criado_em FROM public.chat_contact_clients cc
 WHERE NOT EXISTS (SELECT 1 FROM private.backup_vinculos_20261027_juncao LIMIT 1);

-- ---------------------------------------------------------------------------
-- 10) Migração do legado
-- ---------------------------------------------------------------------------
-- 10a) Grupos internos ⇒ 'interno' (antes dos confirmados: canal interno nunca
--      recebe vínculo de cliente). Fontes: contato restrito, registro de grupos
--      restritos, grupos do assistente e destinos de grupo do relatório.
INSERT INTO public.cliente_canais (tenant_id, client_id, tipo, chave, status, origem, evidencias)
SELECT DISTINCT i.tenant_id, NULL::uuid, 'grupo', i.chave, 'interno', 'legado', '{}'::jsonb
  FROM (
    SELECT ct.tenant_id, private.canal_chave(ct.numero_whatsapp, ct.group_size) AS chave
      FROM public.chat_contacts ct
     WHERE ct.restrito_admin
       AND private.canal_tipo(ct.numero_whatsapp, ct.group_size) = 'grupo'
    UNION
    SELECT g.tenant_id, private.canal_chave(g.grupo_base, 1) FROM public.chat_grupos_restritos g
    UNION
    SELECT g.tenant_id, private.canal_chave(g.grupo_jid, 1) FROM public.wa_agente_grupos g
    UNION
    SELECT g.tenant_id, private.canal_chave(g.grupo_jid, 1)
      FROM public.wa_auto_gestores g
     WHERE g.tipo = 'grupo' AND g.grupo_jid IS NOT NULL
  ) i
 WHERE i.tenant_id IS NOT NULL AND i.chave IS NOT NULL
ON CONFLICT (tenant_id, tipo, chave, (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)))
DO NOTHING;

-- 10b) Vínculos existentes ⇒ confirmado/legado pela chave (o gatilho de
--      cliente_canais propaga para a mesma chave nas outras instâncias).
INSERT INTO public.cliente_canais (tenant_id, client_id, tipo, chave, status, origem, score, evidencias)
SELECT v.tenant_id, v.client_id, v.tipo, v.chave, 'confirmado', 'legado', 1,
       jsonb_build_object('contatos', count(DISTINCT v.contact_id))
  FROM (
    SELECT ct.tenant_id, ct.id AS contact_id, ct.client_id,
           private.canal_tipo(ct.numero_whatsapp, ct.group_size) AS tipo,
           private.canal_chave(ct.numero_whatsapp, ct.group_size) AS chave
      FROM public.chat_contacts ct
     WHERE ct.client_id IS NOT NULL AND NOT ct.restrito_admin
    UNION ALL
    SELECT ct.tenant_id, ct.id, cc.client_id,
           private.canal_tipo(ct.numero_whatsapp, ct.group_size),
           private.canal_chave(ct.numero_whatsapp, ct.group_size)
      FROM public.chat_contact_clients cc
      JOIN public.chat_contacts ct ON ct.id = cc.contact_id AND ct.tenant_id = cc.tenant_id
     WHERE NOT ct.restrito_admin
  ) v
  JOIN public.clients cl ON cl.id = v.client_id AND cl.tenant_id = v.tenant_id
 WHERE v.tipo IS NOT NULL AND v.chave IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.cliente_canais c
      WHERE c.tenant_id = v.tenant_id AND c.tipo = v.tipo AND c.chave = v.chave
        AND c.client_id IS NULL AND c.status IN ('interno', 'nao_cliente'))
 GROUP BY v.tenant_id, v.client_id, v.tipo, v.chave
ON CONFLICT (tenant_id, tipo, chave, (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)))
DO NOTHING;

-- ---------------------------------------------------------------------------
-- 11) Backfill por telefone: privado sem vínculo, correspondência única
--     (a própria match_contact_to_client grava em cliente_canais e sincroniza).
-- ---------------------------------------------------------------------------
SELECT count(public.match_contact_to_client(ct.id, NULL))
  FROM public.chat_contacts ct
 WHERE ct.client_id IS NULL
   AND NOT ct.restrito_admin
   AND private.canal_tipo(ct.numero_whatsapp, ct.group_size) = 'privado';

-- ---------------------------------------------------------------------------
-- 12) Agendador: sugestões diárias às 06:30 BRT (09:30 UTC)
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-vinculos-sugerir-diario') THEN
    PERFORM cron.unschedule('wa-vinculos-sugerir-diario');
  END IF;
END
$do$;

SELECT cron.schedule(
  'wa-vinculos-sugerir-diario',
  '30 9 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://wuzmckatbmlpkdxtfhqr.supabase.co/functions/v1/wa-vinculos-sugerir',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', s.decrypted_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  FROM vault.decrypted_secrets s
  WHERE s.name = 'wa_auto_cron_secret'
    AND EXISTS (
      SELECT 1 FROM public.app_modules a
       WHERE a.slug = 'automacoes-wa' AND a.enabled IS TRUE
    );
  $cron$
);

COMMIT;

NOTIFY pgrst, 'reload schema';
