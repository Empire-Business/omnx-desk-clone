-- Superadmin pela mesma régua do is_admin() (D4 do ensaio real de 19/11/2026, migração 20261119180100).
-- Roda depois das migrações (ensaiar.mjs --verificar) numa transação desfeita no fim.
--
-- Casos (refazem o que o ensaio fez pela tela de Colaboradores, que muda só users.perfil):
--  1. produção (sem segredo htai_*): dona administradora é superadmin sem segundo fator;
--  2. outra pessoa promovida pela tela (perfil admin, papel member) é superadmin, como é admin;
--  3. dona rebaixada pela tela (perfil gerente, papel admin): não é admin nem superadmin
--     (antes: is_admin false e is_master_admin true);
--  4. de volta a admin: superadmin de novo; conta inativa: não;
--  5. app instalado: superadmin só com aal2, e a rebaixada não é nem com aal2.

BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('11111111-1111-1111-1111-111111111111', 'dona@exemplo.com', '{"nome":"Dona","empresa":"Empresa Teste"}');
-- Segunda conta como o admin-create-user cria: papel e empresa no app_metadata (20261119150000),
-- vínculo no fim da transação (SET CONSTRAINTS dispara agora o gatilho adiado).
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('33333333-3333-3333-3333-333333333333', 'outra@exemplo.com', '{"nome":"Outra"}');
UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"perfil":"cliente","tenant_id":"00000000-0000-0000-0000-000000000001"}'
 WHERE id = '33333333-3333-3333-3333-333333333333';
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
-- Sessão de cada uma (o gate get_user_tenant_id confere a sessão do token).
INSERT INTO auth.sessions (id, user_id) VALUES
  ('11111111-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('33333333-0000-4000-8000-000000000003', '33333333-3333-3333-3333-333333333333');

CREATE FUNCTION pg_temp.como(p_sub text, p_aal text DEFAULT 'aal1') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal,
    'session_id', (SELECT s.id FROM auth.sessions s WHERE s.user_id = p_sub::uuid))::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_sub, true);
END $$;
-- Resposta das três funções para a pessoa, como o navegador vê.
CREATE FUNCTION pg_temp.poderes(p_sub text, p_aal text DEFAULT 'aal1') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp.como(p_sub, p_aal);
  SET LOCAL ROLE authenticated;
  r := jsonb_build_object('admin', public.is_admin(), 'master', public.is_master_admin(),
                          'mfa', public.desk_mfa_situacao());
  RESET ROLE;
  -- Volta a "servidor" (sem auth.uid) para as próximas trocas de perfil do teste
  -- (a mesma gravação que a tela faz em nome de uma administradora).
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
  -- Regra nova no código das duas funções.
  ASSERT position('user_roles' IN pg_get_functiondef('public.is_master_admin()'::regprocedure)) = 0, 'regra: is_master_admin sem user_roles';
  ASSERT position('user_roles' IN pg_get_functiondef('public.desk_mfa_situacao()'::regprocedure)) = 0, 'regra: desk_mfa_situacao sem user_roles';

  -- 1. Produção
  p := pg_temp.poderes(dona);
  ASSERT (p ->> 'admin')::boolean AND (p ->> 'master')::boolean, '1: dona admin e superadmin';
  ASSERT (p -> 'mfa' ->> 'superadmin')::boolean AND NOT (p -> 'mfa' ->> 'pendente')::boolean, '1: nada pendente na produção';
  p := pg_temp.poderes(outra);
  ASSERT NOT (p ->> 'master')::boolean, '1: conta comum não é superadmin';

  -- 2. Promovida pela tela (só perfil)
  UPDATE public.users SET perfil = 'admin' WHERE id = outra::uuid;
  ASSERT (SELECT role::text FROM public.user_roles WHERE user_id = outra::uuid) = 'member', '2: a tela não mexe em user_roles';
  p := pg_temp.poderes(outra);
  ASSERT (p ->> 'admin')::boolean AND (p ->> 'master')::boolean, '2: promovida é admin e superadmin';

  -- 3. Dona rebaixada pela tela (papel admin continua)
  UPDATE public.users SET perfil = 'gerente' WHERE id = dona::uuid;
  ASSERT (SELECT role::text FROM public.user_roles WHERE user_id = dona::uuid) = 'admin', '3: papel antigo continua admin';
  p := pg_temp.poderes(dona);
  ASSERT NOT (p ->> 'admin')::boolean, '3: rebaixada não é admin';
  ASSERT NOT (p ->> 'master')::boolean, '3: rebaixada não é superadmin (era o D4)';
  ASSERT NOT (p -> 'mfa' ->> 'superadmin')::boolean, '3: a tela também não a trata como superadmin';

  -- 4. De volta a admin; depois inativada
  UPDATE public.users SET perfil = 'admin' WHERE id = dona::uuid;
  ASSERT (pg_temp.poderes(dona) ->> 'master')::boolean, '4: de volta a admin, superadmin de novo';
  UPDATE public.users SET ativo = false WHERE id = dona::uuid;
  ASSERT NOT (pg_temp.poderes(dona) ->> 'master')::boolean, '4: conta inativa não é superadmin';
  UPDATE public.users SET ativo = true WHERE id = dona::uuid;
END $$;

-- 5. App instalado (escopo instalação): segundo fator obrigatório
SELECT vault.create_secret('instalacao', 'htai_escopo');
DO $$
DECLARE
  dona CONSTANT text := '11111111-1111-1111-1111-111111111111';
  p jsonb;
BEGIN
  p := pg_temp.poderes(dona, 'aal1');
  ASSERT NOT (p ->> 'master')::boolean, '5: sem segundo fator não é superadmin';
  ASSERT (p -> 'mfa' ->> 'pendente')::boolean, '5: a tela pede o segundo fator';
  p := pg_temp.poderes(dona, 'aal2');
  ASSERT (p ->> 'master')::boolean AND NOT (p -> 'mfa' ->> 'pendente')::boolean, '5: com aal2 é superadmin';
  UPDATE public.users SET perfil = 'gerente' WHERE id = dona::uuid;
  p := pg_temp.poderes(dona, 'aal2');
  ASSERT NOT (p ->> 'master')::boolean, '5: rebaixada não é superadmin nem com aal2';
  ASSERT NOT (p -> 'mfa' ->> 'superadmin')::boolean AND NOT (p -> 'mfa' ->> 'pendente')::boolean,
    '5: rebaixada não recebe pedido de segundo fator';
END $$;

\echo 'verificar-superadmin: todos os casos passaram'
ROLLBACK;
