-- EXECUTE de desk_mfa_situacao(): só authenticated e service_role (migração 20261120140000).
-- Roda com `ensaiar.mjs --verificar` (banco com a licença HTAI).
-- Transação desfeita no fim.
--
-- Casos:
--  0. a função existe e é a da 20261119180100 (devolve superadmin/exigida/aal/pendente);
--  1. anon não executa e PUBLIC não executa — nem por herança, nem pelo ACL cru;
--  2. authenticated e service_role executam;
--  3. o corpo não mudou: quem chama continua recebendo o mesmo jsonb.

BEGIN;

DO $$
DECLARE
  v_acl text;
BEGIN
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

  ASSERT (public.desk_mfa_situacao() ? 'superadmin')
     AND (public.desk_mfa_situacao() ? 'exigida')
     AND (public.desk_mfa_situacao() ? 'aal')
     AND (public.desk_mfa_situacao() ? 'pendente'),
    '3: o corpo da função mudou (chaves do jsonb)';
END $$;

ROLLBACK;
