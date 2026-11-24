-- Superadmin pela régua do is_admin() no banco do SaaS da empresa (migração 20261119180100),
-- e a 20261119180200 saindo limpa onde a licença HTAI não existe.
-- Roda com `ensaiar.mjs --verificar --sem-licenca` (banco sem as migrações da licença, do jeito
-- que é a produção: sem htai_licencas, sem htai_licenca_*, com o único htai* sendo htai_banco_novo).
-- Transação desfeita no fim.
--
-- Casos:
--  0. o banco é mesmo o formato do SaaS: nada de htai_licenca_* e nem a MFA do app instalado;
--  1. as duas migrações rodaram limpas (o corpo montado não chama a licença) e o D4 está fechado:
--     dona admin é admin e superadmin; rebaixada pela tela (perfil gerente, papel admin) não é
--     nem admin nem superadmin — antes da 180100 ela era superadmin;
--  2. sem app instalado não há segundo fator a pedir: exigida e pendente falsos, e a dona é
--     superadmin com aal1 (não fica presa esperando aal2);
--  3. a 180200 não criou aviso de licença nenhum ("a licença venceu" não aparece na API).

BEGIN;

DO $$
BEGIN
  ASSERT to_regprocedure('public.htai_licenca_escopo_instalacao()') IS NULL, '0: sem htai_licenca_escopo_instalacao';
  ASSERT to_regclass('public.htai_licenca_estado') IS NULL, '0: sem htai_licenca_estado';
  ASSERT to_regprocedure('public.htai_licenca_modo()') IS NULL, '0: sem htai_licenca_modo';
  ASSERT to_regprocedure('public.htai_licenca_situacao()') IS NULL, '0: sem htai_licenca_situacao';
END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('11111111-1111-1111-1111-111111111111', 'dona@exemplo.com', '{"nome":"Dona","empresa":"Empresa Teste"}');
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('33333333-3333-3333-3333-333333333333', 'outra@exemplo.com', '{"nome":"Outra"}');
UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"perfil":"cliente","tenant_id":"00000000-0000-0000-0000-000000000001"}'
 WHERE id = '33333333-3333-3333-3333-333333333333';
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO auth.sessions (id, user_id) VALUES
  ('11111111-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('33333333-0000-4000-8000-000000000003', '33333333-3333-3333-3333-333333333333');

CREATE FUNCTION pg_temp.como(p_sub text, p_aal text DEFAULT 'aal1') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal,
    'session_id', (SELECT s.id FROM auth.sessions s WHERE s.user_id = p_sub::uuid))::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_sub, true);
END $$;
CREATE FUNCTION pg_temp.poderes(p_sub text, p_aal text DEFAULT 'aal1') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp.como(p_sub, p_aal);
  SET LOCAL ROLE authenticated;
  r := jsonb_build_object('admin', public.is_admin(), 'master', public.is_master_admin(),
                          'mfa', public.desk_mfa_situacao());
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN r;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

DO $$
DECLARE
  dona  CONSTANT text := '11111111-1111-1111-1111-111111111111';
  outra CONSTANT text := '33333333-3333-3333-3333-333333333333';
  p jsonb;
BEGIN
  -- 1. O corpo que a 180100 montou aqui não chama licença nenhuma, e a régua é só o perfil.
  ASSERT position('htai_licenca' IN pg_get_functiondef('public.is_master_admin()'::regprocedure)) = 0,
    '1: is_master_admin do SaaS sem chamada da licença';
  ASSERT position('htai_licenca' IN pg_get_functiondef('public.desk_mfa_situacao()'::regprocedure)) = 0,
    '1: desk_mfa_situacao do SaaS sem chamada da licença';
  ASSERT position('user_roles' IN pg_get_functiondef('public.is_master_admin()'::regprocedure)) = 0,
    '1: is_master_admin sem user_roles';
  ASSERT position('user_roles' IN pg_get_functiondef('public.desk_mfa_situacao()'::regprocedure)) = 0,
    '1: desk_mfa_situacao sem user_roles';

  p := pg_temp.poderes(dona);
  ASSERT (p ->> 'admin')::boolean AND (p ->> 'master')::boolean, '1: dona admin é admin e superadmin';
  p := pg_temp.poderes(outra);
  ASSERT NOT (p ->> 'master')::boolean, '1: conta comum não é superadmin';

  -- 2. Rebaixada pela tela (só perfil): o papel antigo continua admin e não pode valer.
  UPDATE public.users SET perfil = 'gerente' WHERE id = dona::uuid;
  ASSERT (SELECT role::text FROM public.user_roles WHERE user_id = dona::uuid) = 'admin', '2: papel antigo continua admin';
  p := pg_temp.poderes(dona);
  ASSERT NOT (p ->> 'admin')::boolean, '2: rebaixada não é admin';
  ASSERT NOT (p ->> 'master')::boolean, '2: rebaixada não é superadmin (era o D4 no SaaS)';
  ASSERT NOT (p -> 'mfa' ->> 'superadmin')::boolean, '2: a tela também não a trata como superadmin';
  UPDATE public.users SET perfil = 'admin' WHERE id = dona::uuid;
  ASSERT (pg_temp.poderes(dona) ->> 'master')::boolean, '2: de volta a admin, superadmin de novo';

  -- 3. Sem app instalado não há segundo fator a pedir (exigida e pendente falsos).
  p := pg_temp.poderes(dona);
  ASSERT NOT (p -> 'mfa' ->> 'exigida')::boolean, '3: exigida falsa no SaaS';
  ASSERT (p ->> 'master')::boolean AND NOT (p -> 'mfa' ->> 'pendente')::boolean,
    '3: superadmin sem segundo fator no SaaS';
  p := pg_temp.poderes(dona, 'aal2');
  ASSERT (p ->> 'master')::boolean, '3: com aal2 continua superadmin';

  -- 4. Nenhum aviso de licença foi criado pela 180200 (ela saiu limpa).
  ASSERT to_regprocedure('public.htai_licenca_situacao()') IS NULL, '4: 180200 não criou função de licença';
END $$;

\echo 'verificar-saas-sem-licenca: todos os casos passaram'
ROLLBACK;
