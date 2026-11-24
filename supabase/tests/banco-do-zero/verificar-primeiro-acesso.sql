-- Primeiro acesso pela tela de entrada (D3 do ensaio real de 19/11/2026, migração 20261119180000).
-- Roda depois das migrações (ensaiar.mjs --verificar) numa transação desfeita no fim.
-- A corrida de dois cadastros ao mesmo tempo fica em corrida-primeiro-acesso.mjs (precisa de duas conexões).
--
-- Casos:
--  1. banco recém-instalado: porta aberta; anon pode perguntar e recebe só um booleano;
--  2. primeira conta (o que o botão faz): administradora da empresa principal, com o nome informado;
--  3. cadastro direto depois disso: recusado (20261119150000), não vira "primeira conta" nem troca o nome;
--  4. rebaixar ou trocar papéis pela tela não reabre a porta;
--  5. licença negada: a tela de entrada ainda consegue perguntar; o resto da API continua travado.

BEGIN;

CREATE FUNCTION pg_temp.como(p_papel text, p_sub text DEFAULT '', p_path text DEFAULT '') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', p_papel, 'sub', nullif(p_sub, ''))::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_sub, true);
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
-- Imita o Supabase Auth: INSERT, o UPDATE do app_metadata (só a API administrativa) e o "commit"
-- (SET CONSTRAINTS dispara agora o gatilho adiado de 20261119150000).
CREATE FUNCTION pg_temp.cadastro(p_id uuid, p_email text, p_user jsonb, p_app jsonb DEFAULT NULL) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (p_id, p_email, p_user);
  IF p_app IS NOT NULL THEN
    UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || p_app WHERE id = p_id;
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  RETURN 'aceito';
EXCEPTION WHEN OTHERS THEN
  RETURN 'recusado: ' || SQLERRM;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO anon, authenticated;

-- 1. Banco recém-instalado ------------------------------------------------------
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.users), '1: banco novo sem contas';
  ASSERT public.desk_primeiro_acesso_aberto(), '1: porta aberta';
  ASSERT has_function_privilege('anon', 'public.desk_primeiro_acesso_aberto()', 'EXECUTE'), '1: anon pergunta';
  ASSERT NOT has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'), '1: anon não chama o gatilho';
  ASSERT pg_get_function_result('public.desk_primeiro_acesso_aberto()'::regprocedure) = 'boolean', '1: devolve só um booleano';
  ASSERT pg_get_function_identity_arguments('public.desk_primeiro_acesso_aberto()'::regprocedure) = '', '1: sem parâmetro';
  ASSERT (SELECT p.prosecdef AND p.provolatile = 's' FROM pg_proc p WHERE p.oid = 'public.desk_primeiro_acesso_aberto()'::regprocedure),
    '1: security definer e só leitura';
  ASSERT 'desk_primeiro_acesso_aberto' = ANY (public.htai_licenca_rpcs_livres()), '1: aberta com a licença negada';
  ASSERT cardinality(public.htai_licenca_rpcs_livres()) = 20, '1: nenhuma RPC livre a mais nem a menos (19 + 1)';
END $$;
SELECT pg_temp.como('anon');
SET LOCAL ROLE anon;
DO $$ BEGIN ASSERT public.desk_primeiro_acesso_aberto(), '1: anon recebe true'; END $$;
RESET ROLE;

-- 2. Primeira conta pelo cadastro (o que o botão "Criar a primeira conta" faz) ---
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('11111111-1111-1111-1111-111111111111', 'dona@exemplo.com', '{"nome":"Dona","empresa":"Empresa da Dona"}');
DO $$ BEGIN
  ASSERT (SELECT perfil FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111') = 'admin', '2: perfil admin';
  ASSERT (SELECT role::text FROM public.user_roles WHERE user_id = '11111111-1111-1111-1111-111111111111') = 'admin', '2: papel admin';
  ASSERT (SELECT t.is_master FROM public.users u JOIN public.tenants t ON t.id = u.tenant_id
           WHERE u.id = '11111111-1111-1111-1111-111111111111'), '2: na empresa principal';
  ASSERT (SELECT t.name FROM public.tenants t WHERE t.is_master) = 'Empresa da Dona', '2: nome da empresa informado';
  ASSERT (SELECT count(*) FROM public.tenants) = 1, '2: não criou segunda empresa';
  ASSERT NOT public.desk_primeiro_acesso_aberto(), '2: porta fechada';
END $$;
SELECT pg_temp.como('anon');
SET LOCAL ROLE anon;
DO $$ BEGIN ASSERT NOT public.desk_primeiro_acesso_aberto(), '2: anon recebe false'; END $$;
RESET ROLE;

-- 3. Cadastro direto depois (cadastro público ainda aberto no Supabase) ----------
DO $$ BEGIN
  ASSERT pg_temp.cadastro('33333333-3333-3333-3333-333333333330', 'direto@exemplo.com',
    '{"nome":"Direto","empresa":"Empresa do Direto"}') LIKE 'recusado: Cadastro recusado%', '3: cadastro direto recusado';
  ASSERT NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '33333333-3333-3333-3333-333333333330'), '3: nada ficou';
  ASSERT (SELECT t.name FROM public.tenants t WHERE t.is_master) = 'Empresa da Dona', '3: nome da empresa não muda';
  ASSERT (SELECT count(*) FROM public.tenants) = 1, '3: nenhuma empresa nova';
  ASSERT (SELECT count(*) FROM public.users WHERE perfil = 'admin') = 1, '3: uma administradora só';
  -- Conta da equipe, como o admin-create-user cria (papel e empresa no app_metadata).
  ASSERT pg_temp.cadastro('33333333-3333-3333-3333-333333333333', 'outra@exemplo.com', '{"nome":"Outra"}',
    '{"perfil":"cliente","tenant_id":"00000000-0000-0000-0000-000000000001"}') = 'aceito', '3: conta pela função aceita';
  ASSERT (SELECT role::text FROM public.user_roles WHERE user_id = '33333333-3333-3333-3333-333333333333') = 'member', '3: papel comum';
END $$;

-- 4. Trocas de perfil pela tela não reabrem a porta ------------------------------
-- A tela muda só users.perfil (user_roles fica como estava).
UPDATE public.users SET perfil = 'admin' WHERE id = '33333333-3333-3333-3333-333333333333';
UPDATE public.users SET perfil = 'gerente' WHERE id = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN ASSERT NOT public.desk_primeiro_acesso_aberto(), '4: papel admin antigo segura a porta'; END $$;
-- Sem nenhum papel 'admin' em user_roles, o perfil 'admin' da outra pessoa ainda segura a porta
-- (com a regra antiga, só por user_roles, o próximo cadastro viraria administradora de uma empresa nova).
UPDATE public.user_roles SET role = 'manager' WHERE user_id = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN ASSERT NOT public.desk_primeiro_acesso_aberto(), '4: perfil admin segura a porta'; END $$;
DO $$ BEGIN
  ASSERT pg_temp.cadastro('44444444-4444-4444-4444-444444444444', 'terceira@exemplo.com',
    '{"nome":"Terceira","empresa":"Empresa Nova"}') LIKE 'recusado:%', '4: cadastro novo não vira administradora (recusado)';
  ASSERT (SELECT count(*) FROM public.tenants) = 1, '4: nenhuma empresa nova';
END $$;

-- 5. Licença negada (escopo instalação, ainda não ativada) -----------------------
SELECT vault.create_secret('instalacao', 'htai_escopo');
DO $$ BEGIN ASSERT public.htai_licenca_aplicar_travas() > 0, '5: travas instaladas'; END $$;
SELECT pg_temp.como('anon');
SET LOCAL ROLE anon;
DO $$ BEGIN
  ASSERT NOT pg_temp.api_recusa('/rpc/desk_primeiro_acesso_aberto'), '5: a tela de entrada pergunta com a licença negada';
  ASSERT pg_temp.api_recusa('/rpc/get_agent_tma'), '5: o resto da API continua travado';
  ASSERT pg_temp.api_recusa('/clients'), '5: dados continuam travados';
  ASSERT NOT public.desk_primeiro_acesso_aberto(), '5: e a resposta continua false';
END $$;
RESET ROLE;

\echo 'verificar-primeiro-acesso: todos os casos passaram'
ROLLBACK;
