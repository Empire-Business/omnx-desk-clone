-- EXECUTE de desk_mfa_situacao() no banco do SaaS da empresa (migrações 20261119180100 +
-- 20261120140000). Roda com `ensaiar.mjs --verificar --sem-licenca`.
-- Aqui está o defeito que apareceu na produção (seu-projeto-supabase): como a
-- 20261109140000 não roda sem a licença HTAI, a função nascia pelo CREATE OR REPLACE da
-- 20261119180100 com o EXECUTE de fábrica para PUBLIC, e anon podia chamar a RPC.
-- Transação desfeita no fim.
--
-- Casos:
--  0. é mesmo o SaaS (sem a pilha de licença) e a função existe;
--  1. anon não executa, PUBLIC não executa (ACL cru sem "=X/" e sem "anon=");
--  2. authenticated e service_role executam;
--  3. a resposta para quem não está logado não mudou (nada de superadmin).

BEGIN;

DO $$
DECLARE
  v_acl text;
  v_r   jsonb;
BEGIN
  ASSERT to_regprocedure('public.htai_licenca_escopo_instalacao()') IS NULL, '0: sem htai_licenca_escopo_instalacao';
  ASSERT to_regprocedure('public.desk_mfa_situacao()') IS NOT NULL, '0: sem desk_mfa_situacao()';

  ASSERT NOT has_function_privilege('anon', 'public.desk_mfa_situacao()', 'EXECUTE'),
    '1: anon não pode executar desk_mfa_situacao()';

  SELECT coalesce(p.proacl::text, '')
    INTO v_acl
    FROM pg_proc p
   WHERE p.oid = 'public.desk_mfa_situacao()'::regprocedure;

  ASSERT v_acl NOT LIKE '{=X/%' AND position(',=X/' in v_acl) = 0,
    '1: ACL com EXECUTE para PUBLIC: ' || v_acl;
  ASSERT position('anon=' in v_acl) = 0, '1: ACL com EXECUTE para anon: ' || v_acl;

  ASSERT has_function_privilege('authenticated', 'public.desk_mfa_situacao()', 'EXECUTE'),
    '2: authenticated executa desk_mfa_situacao()';
  ASSERT has_function_privilege('service_role', 'public.desk_mfa_situacao()', 'EXECUTE'),
    '2: service_role executa desk_mfa_situacao()';

  PERFORM set_config('request.jwt.claims', '', true);
  v_r := public.desk_mfa_situacao();
  ASSERT v_r->>'superadmin' = 'false' AND v_r->>'exigida' = 'false' AND v_r->>'pendente' = 'false',
    '3: resposta para quem não está logado mudou: ' || v_r::text;
END $$;

ROLLBACK;
