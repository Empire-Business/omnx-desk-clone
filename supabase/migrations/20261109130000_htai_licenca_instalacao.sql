-- ============================================================================
-- Licença HTAI por instalação (contrato htai.entitlement.v1, escopo instalação)
-- ============================================================================
-- Ver docs/LICENCA-HTAI.md.
--
-- Escopo e modo vêm do cofre, gravados pelo instalador do HTAI:
--   * `htai_escopo` = 'instalacao' ou `htai_instalacao_id` preenchido → escopo
--     instalação. Nele, `htai_entitlements_mode` = 'shadow' só registra; qualquer
--     outro valor, inclusive ausente, = 'enforce' (contrato §1).
--   * Fora do escopo instalação (a produção da empresa, que não tem nenhum desses
--     segredos), `htai_entitlements_mode` ausente = 'off' e NADA muda:
--       - htai_licenca_situacao() responde "desligada";
--       - nenhuma trava é instalada (htai_licenca_aplicar_travas só roda pelo
--         agendador, e o agendador não faz nada em 'off');
--       - o agendador não chama a função htai-licenca nem a central.
--
-- Com a licença negada em 'enforce' (não ativada, vencida, suspensa ou revogada)
-- só ficam abertos login, Configurações, Ajuda e exportar (contrato §4):
--   * escrita negada por gatilho por comando nas tabelas de dados (vale também
--     para a service_role das funções);
--   * leitura negada por política RESTRITIVA nas tabelas de dados (navegador e
--     Realtime) e no Storage (menos marca, fotos e anexos de reporte);
--   * a API do banco (PostgREST) recusa, antes de executar, qualquer tabela,
--     visão ou RPC fora da lista de conta/Ajuda (função de pré-requisição).
--     "Configurações" = conta (perfil, senha, segundo fator, licença, dados da
--     empresa); credenciais de integração ficam travadas;
--   * a exportação sai pela função htai-exportar (service_role), sempre aberta.
-- Conta, empresa, ajuda e registro ficam fora das travas (listas em
-- htai_licenca_tabelas_livres() e htai_licenca_tabelas_leitura_livre()); chaves de
-- API, tokens e integrações ficam travados como os dados.
-- 'shadow': avalia e só registra no log do Postgres o que negaria.
--
-- Idempotente. Seguro em produção (modo 'off').
-- ============================================================================

-- 1) Estado (linha única) ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.htai_licenca_estado (
  id                     boolean PRIMARY KEY DEFAULT true CHECK (id),
  instalacao_id          text,
  status                 text CHECK (status IS NULL OR status IN ('active','grace','suspended','revoked','expired')),
  valid_until            timestamptz,
  renew_after            timestamptz,
  offline_grace_seconds  integer NOT NULL DEFAULT 0 CHECK (offline_grace_seconds >= 0),
  versao                 integer,
  envelope               jsonb,
  envelope_hash          text,
  verificado_em          timestamptz,
  ultima_tentativa_em    timestamptz,
  ultimo_erro            text,
  atualizado_em          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.htai_licenca_estado IS
  'Último envelope de licença HTAI válido (assinatura conferida) desta instalação. Só a função htai-licenca escreve.';

-- Anti-replay das respostas assinadas da central.
CREATE TABLE IF NOT EXISTS public.htai_licenca_assinaturas (
  hash       text PRIMARY KEY,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.htai_licenca_estado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.htai_licenca_assinaturas ENABLE ROW LEVEL SECURITY;
-- Sem política: nenhum acesso pelo navegador; só service_role e funções do banco.
REVOKE ALL ON public.htai_licenca_estado FROM anon, authenticated;
REVOKE ALL ON public.htai_licenca_assinaturas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.htai_licenca_estado TO service_role;
GRANT SELECT, INSERT, DELETE ON public.htai_licenca_assinaturas TO service_role;

-- 2) Escopo e modo (do cofre) ------------------------------------------------
CREATE OR REPLACE FUNCTION public.htai_licenca_segredo(p_nome text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v text;
BEGIN
  BEGIN
    SELECT btrim(decrypted_secret) INTO v
      FROM vault.decrypted_secrets
     WHERE name = p_nome
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v := NULL;  -- cofre indisponível = segredo ausente
  END;
  RETURN v;
END
$fn$;

-- Escopo instalação: o instalador grava `htai_escopo` = 'instalacao' (fixo na
-- receita) e, depois da ativação, `htai_instalacao_id`. A produção não tem nenhum.
CREATE OR REPLACE FUNCTION public.htai_licenca_escopo_instalacao()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT coalesce(public.htai_licenca_segredo('htai_instalacao_id'), '') <> ''
      OR lower(coalesce(public.htai_licenca_segredo('htai_escopo'), '')) = 'instalacao';
$fn$;

CREATE OR REPLACE FUNCTION public.htai_licenca_modo()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v text := lower(coalesce(public.htai_licenca_segredo('htai_entitlements_mode'), ''));
BEGIN
  IF public.htai_licenca_escopo_instalacao() THEN
    -- App instalado: só 'shadow' afrouxa; ausente, vazio, 'off' ou inválido = 'enforce'.
    RETURN CASE WHEN v = 'shadow' THEN 'shadow' ELSE 'enforce' END;
  END IF;
  -- Produção da empresa: sem modo configurado = desligado.
  RETURN CASE WHEN v IN ('shadow', 'enforce') THEN v ELSE 'off' END;
END
$fn$;

-- 3) Situação (mesma regra de avaliarLicenca em _shared/htai-licenca-core.ts) --
CREATE OR REPLACE FUNCTION public.htai_licenca_situacao()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_modo   text := public.htai_licenca_modo();
  e        public.htai_licenca_estado%ROWTYPE;
  v_motivo text;
  v_folga  timestamptz;
BEGIN
  IF v_modo = 'off' THEN
    RETURN jsonb_build_object('modo', 'off', 'nega', false, 'negaria', false, 'motivo', NULL,
                              'mensagem', NULL, 'valido_ate', NULL, 'folga_ate', NULL);
  END IF;

  SELECT * INTO e FROM public.htai_licenca_estado WHERE id;
  IF NOT FOUND OR e.status IS NULL OR e.valid_until IS NULL THEN
    v_motivo := 'nao_ativado';
  ELSIF e.status NOT IN ('active', 'grace') THEN
    v_motivo := e.status;
  ELSE
    v_folga := e.valid_until + make_interval(secs => greatest(e.offline_grace_seconds, 0));
    IF now() >= v_folga THEN v_motivo := 'vencida'; END IF;
  END IF;

  RETURN jsonb_build_object(
    'modo', v_modo,
    'nega', v_motivo IS NOT NULL AND v_modo = 'enforce',
    'negaria', v_motivo IS NOT NULL AND v_modo = 'shadow',
    'motivo', v_motivo,
    'mensagem', CASE
      WHEN v_motivo IS NULL THEN NULL
      WHEN v_motivo = 'nao_ativado' THEN 'Ative a licença deste app. Seus dados estão guardados e você pode exportá-los.'
      ELSE 'A licença deste app venceu. Renove na sua conta HTAI para voltar a usar. Seus dados estão guardados e você pode exportá-los.'
    END,
    'valido_ate', e.valid_until,
    'folga_ate', v_folga
  );
END
$fn$;

COMMENT ON FUNCTION public.htai_licenca_situacao() IS
  'Situação da licença HTAI desta instalação (sem segredo). Modo off = sempre liberada.';

CREATE OR REPLACE FUNCTION public.htai_licenca_libera()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT NOT coalesce((public.htai_licenca_situacao() ->> 'nega')::boolean, false);
$fn$;

REVOKE ALL ON FUNCTION public.htai_licenca_segredo(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.htai_licenca_escopo_instalacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.htai_licenca_escopo_instalacao() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.htai_licenca_modo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.htai_licenca_modo() TO service_role;
REVOKE ALL ON FUNCTION public.htai_licenca_situacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.htai_licenca_situacao() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.htai_licenca_libera() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.htai_licenca_libera() TO authenticated, service_role;

-- 4) Trava de escrita --------------------------------------------------------
-- "Configurações" abertas com a licença negada = configurações da CONTA (perfil,
-- senha, segundo fator, licença e dados da empresa). Credenciais de integração
-- (chaves de API, tokens de WhatsApp, integrações) ficam travadas como o resto
-- (definição do contrato para os seis apps, 09/11/2026).
-- Tabelas que continuam aceitando escrita com a licença negada:
--   conta e empresa: tenants (dados da empresa e marca), users, profiles,
--     desk_password_requirements, push_subscriptions (aparelhos da própria conta);
--   marcação de leitura (não cria dado): chat_message_reads, internal_message_reads;
--   ajuda e registro: reportes_erro, app_logs, audit_logs, contratos_audit_log,
--     webhook_logs;
--   a própria licença: htai_licenca_estado, htai_licenca_assinaturas.
CREATE OR REPLACE FUNCTION public.htai_licenca_tabelas_livres()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT ARRAY[
    'tenants','users','profiles','desk_password_requirements','push_subscriptions',
    'chat_message_reads','internal_message_reads',
    'reportes_erro','app_logs','audit_logs','contratos_audit_log','webhook_logs',
    'htai_licenca_estado','htai_licenca_assinaturas'
  ]::text[];
$fn$;

CREATE OR REPLACE FUNCTION public.htai_licenca_trava_escrita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  s jsonb;
  cache text := current_setting('htai.licenca_situacao', true);
BEGIN
  -- Uma avaliação por transação (o gatilho é por comando).
  IF cache IS NULL OR cache = '' THEN
    s := public.htai_licenca_situacao();
    PERFORM set_config('htai.licenca_situacao', s::text, true);
  ELSE
    s := cache::jsonb;
  END IF;

  IF coalesce((s ->> 'nega')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0402',
      MESSAGE = s ->> 'mensagem',
      HINT = 'htai_licenca:' || coalesce(s ->> 'motivo', '');
  ELSIF coalesce((s ->> 'negaria')::boolean, false) THEN
    RAISE LOG 'htai_licenca shadow: negaria % em %.% (%)', tg_op, tg_table_schema, tg_table_name, s ->> 'motivo';
  END IF;
  RETURN NULL;
END
$fn$;

-- 4b) Trava de leitura ------------------------------------------------------
-- Tabelas que continuam legíveis com a licença negada: conta, empresa, o que o
-- menu precisa para saber o que a pessoa pode (app_modules, permissoes_app,
-- user_roles) e Ajuda (reportes_erro). As demais tabelas com tenant_id ganham a
-- política RESTRITIVA htai_licenca_leitura (navegador e Realtime; a service_role
-- da exportação não passa por RLS). Integrações e tokens ficam de fora.
CREATE OR REPLACE FUNCTION public.htai_licenca_tabelas_leitura_livre()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT ARRAY[
    'tenants','users','user_roles','profiles','desk_password_requirements','push_subscriptions',
    'app_modules','permissoes_app',
    'reportes_erro'
  ]::text[];
$fn$;

-- Buckets do Storage que continuam abertos (marca, fotos de perfil, anexos de reporte).
CREATE OR REPLACE FUNCTION public.htai_licenca_buckets_livres()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT ARRAY['branding','avatars','reportes-anexos']::text[];
$fn$;

-- RPCs que a API do banco continua aceitando com a licença negada: as que dizem
-- quem é a pessoa e o que ela pode (login, menu, permissões), a própria licença e
-- a verificação em duas etapas. RPCs de integração e de token ficam travadas.
CREATE OR REPLACE FUNCTION public.htai_licenca_rpcs_livres()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT ARRAY[
    'desk_password_change_status','desk_password_session_allowed','desk_mfa_situacao',
    'get_user_tenant_id','get_tenant_by_domain','resolve_tenant_default',
    'has_role','has_permissao','is_admin','is_admin_or_manager','is_manager','is_master_admin',
    'is_comissoes_admin','is_comissoes_gestor','pode_gerir_contratos','pode_ver_restrito',
    'htai_licenca_situacao','htai_licenca_libera','htai_licenca_escopo_instalacao'
  ]::text[];
$fn$;

-- Função de pré-requisição da API do banco (PostgREST `db-pre-request`): roda
-- antes de cada pedido do navegador. Com a licença negada, só deixa passar as
-- tabelas livres (leitura ou escrita) e as RPCs livres; o resto recebe 402 com a
-- mensagem do contrato. Cobre também visões e RPCs SECURITY DEFINER, que não
-- passam pelas políticas das tabelas. Só é ligada por htai_licenca_aplicar_travas.
CREATE OR REPLACE FUNCTION public.htai_licenca_pre_request()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_papel text;
  v_path  text := btrim(coalesce(current_setting('request.path', true), ''), '/');
  v_alvo  text;
  s       jsonb;
BEGIN
  BEGIN
    v_papel := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  EXCEPTION WHEN OTHERS THEN
    v_papel := '';
  END;
  IF v_papel = 'service_role' THEN
    RETURN;
  END IF;

  IF v_path LIKE 'rpc/%' THEN
    v_alvo := split_part(substr(v_path, 5), '/', 1);
    IF v_alvo = ANY (public.htai_licenca_rpcs_livres()) THEN
      RETURN;
    END IF;
  ELSE
    v_alvo := split_part(v_path, '/', 1);
    IF v_alvo = ANY (public.htai_licenca_tabelas_leitura_livre())
       OR v_alvo = ANY (public.htai_licenca_tabelas_livres()) THEN
      RETURN;
    END IF;
  END IF;

  s := public.htai_licenca_situacao();
  IF coalesce((s ->> 'nega')::boolean, false) THEN
    -- Formato de erro do PostgREST: status HTTP 402 e corpo JSON com a mensagem.
    RAISE SQLSTATE 'PGRST' USING
      MESSAGE = jsonb_build_object(
        'code', 'htai_licenca',
        'message', s ->> 'mensagem',
        'details', s ->> 'motivo',
        'hint', 'Login, Configurações, Ajuda e exportar continuam abertos.'
      )::text,
      DETAIL = '{"status": 402, "headers": {}}';
  ELSIF coalesce((s ->> 'negaria')::boolean, false) THEN
    RAISE LOG 'htai_licenca shadow: negaria a API em /% (%)', v_path, s ->> 'motivo';
  END IF;
END
$fn$;

-- Instala as travas (idempotente; devolve quantas peças novas criou). Só tem
-- efeito com modo diferente de 'off':
--   * gatilho de escrita por comando (BEFORE INSERT/UPDATE/DELETE ... FOR EACH
--     STATEMENT) em toda tabela com tenant_id fora de htai_licenca_tabelas_livres();
--   * política restritiva de leitura em toda tabela com tenant_id fora de
--     htai_licenca_tabelas_leitura_livre();
--   * política restritiva no Storage (fora dos buckets livres);
--   * função de pré-requisição da API do banco (se nenhuma outra estiver ligada).
-- Em 'shadow' as políticas existem mas liberam (htai_licenca_libera() = true).
CREATE OR REPLACE FUNCTION public.htai_licenca_aplicar_travas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  t record;
  n integer := 0;
  v_atual text;
BEGIN
  IF public.htai_licenca_modo() = 'off' THEN
    RETURN 0;
  END IF;

  -- Escrita
  FOR t IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'tenant_id'
       AND tb.table_type = 'BASE TABLE'
       AND c.table_name <> ALL (public.htai_licenca_tabelas_livres())
       AND c.table_name NOT LIKE '\_backup%'
       AND NOT EXISTS (
         SELECT 1 FROM pg_trigger g
          WHERE g.tgrelid = format('public.%I', c.table_name)::regclass
            AND g.tgname = 'htai_licenca_trava'
       )
  LOOP
    EXECUTE format(
      'CREATE TRIGGER htai_licenca_trava BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION public.htai_licenca_trava_escrita()',
      t.table_name);
    n := n + 1;
  END LOOP;

  -- Leitura (navegador e Realtime)
  FOR t IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'tenant_id'
       AND tb.table_type = 'BASE TABLE'
       AND c.table_name <> ALL (public.htai_licenca_tabelas_leitura_livre())
       AND c.table_name NOT LIKE '\_backup%'
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies pp
          WHERE pp.schemaname = 'public' AND pp.tablename = c.table_name
            AND pp.policyname = 'htai_licenca_leitura'
       )
  LOOP
    EXECUTE format(
      'CREATE POLICY htai_licenca_leitura ON public.%I AS RESTRICTIVE FOR SELECT '
      'TO anon, authenticated USING ((SELECT public.htai_licenca_libera()))',
      t.table_name);
    n := n + 1;
  END LOOP;

  -- Storage (arquivos fora dos buckets livres: leitura e escrita)
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'storage' AND tablename = 'objects'
                    AND policyname = 'htai_licenca_arquivos') THEN
    BEGIN
      EXECUTE 'CREATE POLICY htai_licenca_arquivos ON storage.objects AS RESTRICTIVE FOR ALL '
              'TO anon, authenticated '
              'USING (bucket_id = ANY (public.htai_licenca_buckets_livres()) OR (SELECT public.htai_licenca_libera())) '
              'WITH CHECK (bucket_id = ANY (public.htai_licenca_buckets_livres()) OR (SELECT public.htai_licenca_libera()))';
      n := n + 1;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'htai_licenca: sem permissão para criar a política do Storage (%).', SQLERRM;
    END;
  END IF;

  -- API do banco: função de pré-requisição (não troca uma já ligada por outra peça).
  SELECT (SELECT split_part(c, '=', 2) FROM unnest(r.rolconfig) c WHERE c LIKE 'pgrst.db\_pre\_request=%' LIMIT 1)
    INTO v_atual
    FROM pg_roles r WHERE r.rolname = 'authenticator';
  IF v_atual IS NULL THEN
    BEGIN
      ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.htai_licenca_pre_request';
      NOTIFY pgrst, 'reload config';
      n := n + 1;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'htai_licenca: sem permissão para ligar a pré-requisição da API (%).', SQLERRM;
    END;
  ELSIF v_atual <> 'public.htai_licenca_pre_request' THEN
    RAISE WARNING 'htai_licenca: a API já usa outra pré-requisição (%); a lista de RPCs livres não está ativa.', v_atual;
  END IF;

  RETURN n;
END
$fn$;

-- Desfaz as travas (para voltar ao modo off por decisão do dono). Não roda sozinha.
CREATE OR REPLACE FUNCTION public.htai_licenca_remover_travas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  t record;
  n integer := 0;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_trigger g
      JOIN pg_class c ON c.oid = g.tgrelid
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND g.tgname = 'htai_licenca_trava'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS htai_licenca_trava ON public.%I', t.relname);
    n := n + 1;
  END LOOP;
  FOR t IN
    SELECT tablename FROM pg_policies
     WHERE schemaname = 'public' AND policyname = 'htai_licenca_leitura'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS htai_licenca_leitura ON public.%I', t.tablename);
    n := n + 1;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                AND policyname = 'htai_licenca_arquivos') THEN
    DROP POLICY IF EXISTS htai_licenca_arquivos ON storage.objects;
    n := n + 1;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles r, unnest(r.rolconfig) c
              WHERE r.rolname = 'authenticator'
                AND c = 'pgrst.db_pre_request=public.htai_licenca_pre_request') THEN
    ALTER ROLE authenticator RESET pgrst.db_pre_request;
    NOTIFY pgrst, 'reload config';
    n := n + 1;
  END IF;
  RETURN n;
END
$fn$;

REVOKE ALL ON FUNCTION public.htai_licenca_trava_escrita() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.htai_licenca_aplicar_travas() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.htai_licenca_remover_travas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.htai_licenca_aplicar_travas() TO service_role;
GRANT EXECUTE ON FUNCTION public.htai_licenca_remover_travas() TO service_role;
-- A pré-requisição roda com o papel do pedido (anon/authenticated).
REVOKE ALL ON FUNCTION public.htai_licenca_pre_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.htai_licenca_pre_request() TO anon, authenticated, service_role;

-- Se o modo já estiver configurado quando esta migração roda, instala agora.
SELECT public.htai_licenca_aplicar_travas();

-- 5) Agendador (a cada 5 min) ------------------------------------------------
-- Em 'off' (sem o segredo no cofre) o comando não faz nada: nem trava, nem
-- chamada. Em shadow/enforce: garante as travas (inclusive em tabelas novas) e
-- chama a função htai-licenca com o segredo do agendador, que faz o pull
-- assinado só quando renew_after venceu. O endereço vem de
-- public.app_url_funcoes() (migração 20261109100000).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'htai-licenca-5min') THEN
    PERFORM cron.unschedule('htai-licenca-5min');
  END IF;
END
$do$;

SELECT cron.schedule(
  'htai-licenca-5min',
  '*/5 * * * *',
  $cron$
  DO $job$
  BEGIN
    IF public.htai_licenca_modo() <> 'off' THEN
      PERFORM public.htai_licenca_aplicar_travas();
      PERFORM net.http_post(
        url := public.app_url_funcoes('htai-licenca'),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s.decrypted_secret),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      )
      FROM vault.decrypted_secrets s
      WHERE s.name = 'wa_auto_cron_secret';
      DELETE FROM public.htai_licenca_assinaturas WHERE criado_em < now() - interval '2 days';
    END IF;
  END
  $job$;
  $cron$
);

-- 6) Exportação (sempre aberta) ----------------------------------------------
-- Lista das tabelas que a função htai-exportar copia da empresa da pessoa: toda
-- tabela do esquema public com tenant_id, menos cópias de segurança e as que só
-- guardam segredo ou endereço de aparelho; `ordem` é a coluna usada para paginar
-- (id, criado_em ou created_at; NULL = sem ordem estável). Só a service_role chama.
CREATE OR REPLACE FUNCTION public.htai_exportar_tabelas()
RETURNS TABLE (tabela text, ordem text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT c.table_name::text,
         (SELECT o.column_name::text
            FROM information_schema.columns o
           WHERE o.table_schema = 'public' AND o.table_name = c.table_name
             AND o.column_name IN ('id', 'criado_em', 'created_at')
           ORDER BY array_position(ARRAY['id','criado_em','created_at'], o.column_name::text)
           LIMIT 1)
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
   WHERE c.table_schema = 'public'
     AND c.column_name = 'tenant_id'
     AND tb.table_type = 'BASE TABLE'
     AND c.table_name NOT LIKE '\_%'
     AND c.table_name NOT LIKE '%\_tokens'
     AND c.table_name <> ALL (ARRAY['api_keys','push_subscriptions','wa_webhook_tokens',
                                    'htai_licenca_estado','htai_licenca_assinaturas'])
   ORDER BY 1;
$fn$;

REVOKE ALL ON FUNCTION public.htai_exportar_tabelas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.htai_exportar_tabelas() TO service_role;
