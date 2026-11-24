-- Verificação da licença HTAI e do segundo fator do superadmin, no banco do ensaio.
-- Roda depois das migrações (ensaiar.mjs --verificar) numa transação desfeita no fim.
-- Cada bloco usa ASSERT: qualquer falha interrompe com a mensagem do caso.
--
-- Casos:
--  1. produção (nenhum segredo htai_* no cofre): modo off, nenhuma trava, superadmin igual a hoje;
--  2. escopo instalação sem modo: enforce; sem envelope = não ativado → nega leitura, escrita,
--     API e Storage; Configurações/Ajuda e RPCs livres continuam; service_role passa na API;
--  3. envelope ativo: libera tudo; 4. vencido além da folga: nega; 5. shadow: só registra;
--  6. superadmin exige aal2 no escopo instalação; 7. remover_travas desfaz tudo.

BEGIN;

-- Primeira conta (vira admin da empresa principal, como no primeiro acesso).
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('11111111-1111-1111-1111-111111111111', 'dona@exemplo.com', '{"nome":"Dona","empresa_nome":"Empresa Teste"}');
INSERT INTO auth.sessions (id, user_id) VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.clients (nome, tenant_id) VALUES ('Cliente A', '00000000-0000-0000-0000-000000000001');

CREATE FUNCTION pg_temp.como(p_papel text, p_aal text DEFAULT 'aal1', p_path text DEFAULT '') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', '11111111-1111-1111-1111-111111111111', 'role', p_papel, 'aal', p_aal,
    'session_id', '22222222-2222-2222-2222-222222222222')::text, true);
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  PERFORM set_config('request.path', p_path, true);
  PERFORM set_config('htai.licenca_situacao', '', true);
END $$;
CREATE FUNCTION pg_temp.api_recusa(p_path text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.path', p_path, true);
  PERFORM public.htai_licenca_pre_request();
  RETURN false;
EXCEPTION WHEN SQLSTATE 'PGRST' THEN
  RETURN SQLERRM LIKE '%htai_licenca%';
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

-- 1. Produção -----------------------------------------------------------------
DO $$ BEGIN
  ASSERT public.htai_licenca_modo() = 'off', '1: sem segredo, modo off';
  ASSERT NOT public.htai_licenca_escopo_instalacao(), '1: fora do escopo instalação';
  ASSERT public.htai_licenca_aplicar_travas() = 0, '1: off não instala trava';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'htai_licenca_trava'), '1: nenhum gatilho';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname LIKE 'htai_licenca%'), '1: nenhuma política';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_roles r, unnest(r.rolconfig) c WHERE r.rolname = 'authenticator'
                       AND c LIKE 'pgrst.db_pre_request%'), '1: pré-requisição desligada';
  ASSERT (public.htai_licenca_situacao() ->> 'modo') = 'off', '1: situação desligada';
END $$;
SELECT pg_temp.como('authenticated', 'aal1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT public.is_master_admin(), '1: superadmin sem segundo fator continua valendo na produção';
  ASSERT (public.desk_mfa_situacao() ->> 'pendente')::boolean = false, '1: nada pendente na produção';
  ASSERT (SELECT count(*) FROM public.clients) = 1, '1: leitura normal';
END $$;
RESET ROLE;

-- 2. Escopo instalação, modo ausente, não ativado ------------------------------
SELECT vault.create_secret('instalacao', 'htai_escopo');
DO $$ BEGIN
  ASSERT public.htai_licenca_escopo_instalacao(), '2: escopo instalação';
  ASSERT public.htai_licenca_modo() = 'enforce', '2: modo ausente = enforce';
  ASSERT public.htai_licenca_aplicar_travas() > 0, '2: instala travas';
  ASSERT public.htai_licenca_aplicar_travas() = 0, '2: idempotente';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clients' AND policyname = 'htai_licenca_leitura'
                   AND permissive = 'RESTRICTIVE'), '2: política restritiva em clients';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'htai_licenca_leitura'), '2: users livre';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'htai_licenca_arquivos'), '2: Storage';
  ASSERT EXISTS (SELECT 1 FROM pg_roles r, unnest(r.rolconfig) c WHERE r.rolname = 'authenticator'
                   AND c = 'pgrst.db_pre_request=public.htai_licenca_pre_request'), '2: pré-requisição ligada';
  ASSERT (public.htai_licenca_situacao() ->> 'motivo') = 'nao_ativado', '2: não ativado';
END $$;
-- Modo explícito 'off' no escopo instalação continua enforce.
SELECT vault.create_secret('off', 'htai_entitlements_mode');
DO $$ BEGIN ASSERT public.htai_licenca_modo() = 'enforce', '2: off no escopo instalação = enforce'; END $$;

SELECT pg_temp.como('authenticated', 'aal1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.clients) = 0, '2: leitura de dados bloqueada';
  ASSERT (SELECT count(*) FROM public.users) = 1, '2: Configurações (users) aberta';
  ASSERT (SELECT count(*) FROM public.tenants) >= 1, '2: marca/empresa aberta';
  ASSERT pg_temp.api_recusa('/clients'), '2: API recusa tabela de dados';
  ASSERT pg_temp.api_recusa('/rpc/get_agent_tma'), '2: API recusa RPC de dados';
  ASSERT pg_temp.api_recusa('/v_contratos_alertas'), '2: API recusa visão';
  ASSERT NOT pg_temp.api_recusa('/users'), '2: API aceita users';
  ASSERT NOT pg_temp.api_recusa('/reportes_erro'), '2: API aceita Ajuda';
  ASSERT NOT pg_temp.api_recusa('/rpc/htai_licenca_situacao'), '2: API aceita a situação da licença';
  ASSERT NOT pg_temp.api_recusa('/rpc/desk_password_change_status'), '2: API aceita o login';
  ASSERT NOT pg_temp.api_recusa('/rpc/desk_mfa_situacao'), '2: API aceita o segundo fator';
  -- Credenciais de integração ficam travadas (contrato: Configurações = conta).
  ASSERT pg_temp.api_recusa('/app_settings'), '2: API recusa app_settings (integrações)';
  ASSERT pg_temp.api_recusa('/tenant_integracoes'), '2: API recusa integrações';
  ASSERT pg_temp.api_recusa('/api_keys'), '2: API recusa chaves de API';
  ASSERT pg_temp.api_recusa('/rpc/salvar_uazapi_token_numero'), '2: API recusa token de WhatsApp';
  ASSERT pg_temp.api_recusa('/rpc/save_omnx_integracao_secret'), '2: API recusa segredo de integração';
END $$;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.clients (nome, tenant_id) VALUES ('Cliente B', '00000000-0000-0000-0000-000000000001');
    ASSERT false, '2: escrita deveria ser negada';
  EXCEPTION WHEN SQLSTATE 'P0402' THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.como('service_role', 'aal1', '/clients');
DO $$ BEGIN ASSERT NOT pg_temp.api_recusa('/clients'), '2: service_role (exportação) passa na API'; END $$;
RESET ROLE;

-- 3. Envelope ativo -----------------------------------------------------------
INSERT INTO public.htai_licenca_estado (id, status, valid_until, renew_after, offline_grace_seconds, versao)
VALUES (true, 'active', now() + interval '1 hour', now() + interval '30 minutes', 259200, 1);
SELECT pg_temp.como('authenticated', 'aal1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.clients) = 1, '3: ativa libera leitura';
  ASSERT NOT pg_temp.api_recusa('/clients'), '3: ativa libera a API';
END $$;
RESET ROLE;

-- 4. Vencido além da folga ------------------------------------------------------
UPDATE public.htai_licenca_estado SET valid_until = now() - interval '4 days', offline_grace_seconds = 259200;
SELECT pg_temp.como('authenticated', 'aal1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.clients) = 0, '4: vencida além da folga bloqueia leitura';
END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (public.htai_licenca_situacao() ->> 'motivo') = 'vencida', '4: motivo vencida'; END $$;
-- Dentro da folga offline (central fora do ar há 2 dias): libera.
UPDATE public.htai_licenca_estado SET valid_until = now() - interval '2 days';
DO $$ BEGIN ASSERT NOT (public.htai_licenca_situacao() ->> 'nega')::boolean, '4: dentro da folga libera'; END $$;

-- 5. Shadow --------------------------------------------------------------------
UPDATE public.htai_licenca_estado SET status = 'revoked';
UPDATE vault.secrets SET secret = 'shadow' WHERE name = 'htai_entitlements_mode';
SELECT pg_temp.como('authenticated', 'aal1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.clients) = 1, '5: shadow não bloqueia leitura';
  ASSERT NOT pg_temp.api_recusa('/clients'), '5: shadow não bloqueia a API';
END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (public.htai_licenca_situacao() ->> 'negaria')::boolean, '5: shadow registra'; END $$;

-- 6. Segundo fator do superadmin no escopo instalação ---------------------------
SELECT pg_temp.como('authenticated', 'aal1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT NOT public.is_master_admin(), '6: sem segundo fator não é superadmin';
  ASSERT (public.desk_mfa_situacao() ->> 'pendente')::boolean, '6: tela pede o segundo fator';
END $$;
RESET ROLE;
SELECT pg_temp.como('authenticated', 'aal2');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT public.is_master_admin(), '6: com aal2 é superadmin';
  ASSERT NOT (public.desk_mfa_situacao() ->> 'pendente')::boolean, '6: nada pendente com aal2';
END $$;
RESET ROLE;

-- 7. Remover as travas -----------------------------------------------------------
DO $$ BEGIN
  ASSERT public.htai_licenca_remover_travas() > 0, '7: remove';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'htai_licenca_trava'), '7: sem gatilho';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname LIKE 'htai_licenca%'), '7: sem política';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_roles r, unnest(r.rolconfig) c WHERE r.rolname = 'authenticator'
                       AND c LIKE 'pgrst.db_pre_request%'), '7: pré-requisição desligada';
END $$;

\echo 'verificar-licenca: todos os casos passaram'
ROLLBACK;
