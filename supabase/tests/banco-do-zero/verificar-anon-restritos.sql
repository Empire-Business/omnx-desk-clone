-- Vazamento para anon (migração 20261120150000):
--   1. private.chat_contatos_restritos_ids() e private.chat_conversas_restritas_ids()
--      devolviam os ids de TODAS as empresas quando não havia sessão;
--   2. public.department_instance_assignments tinha SELECT TO public USING (true).
-- Roda com `ensaiar.mjs --verificar` (banco com a licença HTAI) e também no banco
-- sem licença. Transação desfeita no fim.
--
-- Casos:
--  0. as duas funções existem, são SECURITY DEFINER e o ACL de anon segue como estava
--     (não revogamos nada aqui: isso depende do ok do Bruno);
--  1. sem sessão as duas devolvem vazio, mesmo com contatos restritos de duas empresas;
--  2. com sessão cada uma devolve só a empresa da sessão (o resultado das políticas
--     continua o mesmo de antes);
--  3. a política de SELECT de department_instance_assignments vale para authenticated,
--     com escopo de empresa, e anon não lê a tabela — provado com uma atribuição
--     gravada em cada empresa (tabela vazia também dá zero linha num banco quebrado).

BEGIN;

INSERT INTO public.tenants (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Empresa A', 'empresa-a'),
  ('22222222-2222-2222-2222-222222222222', 'Empresa B', 'empresa-b')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ana@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'beto@b.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, nome, email, perfil, tenant_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana A', 'ana@a.test', 'atendimento',
   '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Beto B', 'beto@b.test', 'atendimento',
   '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.sessions (id, user_id, created_at) VALUES
  ('e1e1e1e1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '5 min'),
  ('e2e2e2e2-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', now() - interval '5 min')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (user_id, tenant_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (user_id) DO NOTHING;

-- O gatilho de auth.users já cria o perfil na empresa padrão; aqui cada um vai
-- para a sua, que é o que o caso 2 precisa provar.
UPDATE public.users SET tenant_id = '11111111-1111-1111-1111-111111111111'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.users SET tenant_id = '22222222-2222-2222-2222-222222222222'
 WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
UPDATE public.profiles SET tenant_id = '11111111-1111-1111-1111-111111111111'
 WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.profiles SET tenant_id = '22222222-2222-2222-2222-222222222222'
 WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002';

INSERT INTO public.chat_contacts (id, numero_whatsapp, nome, tenant_id, restrito_admin) VALUES
  ('c1c1c1c1-0000-0000-0000-000000000001', '5511900000001', 'Restrito A',
   '11111111-1111-1111-1111-111111111111', true),
  ('c2c2c2c2-0000-0000-0000-000000000002', '5511900000002', 'Restrito B',
   '22222222-2222-2222-2222-222222222222', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chat_conversations (id, contact_id, tenant_id) VALUES
  ('d1d1d1d1-0000-0000-0000-000000000001', 'c1c1c1c1-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111'),
  ('d2d2d2d2-0000-0000-0000-000000000002', 'c2c2c2c2-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

-- Uma atribuição de instância por empresa. Sem essas linhas o caso 3 passaria
-- calado num banco quebrado: com a tabela vazia, anon também lê zero linha.
INSERT INTO public.whatsapp_instances (id, nome, instance_id, tenant_id) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', 'Instância A', 'inst-a',
   '11111111-1111-1111-1111-111111111111'),
  ('b1b1b1b1-0000-0000-0000-000000000002', 'Instância B', 'inst-b',
   '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chat_departments (id, nome, tenant_id) VALUES
  ('a2a2a2a2-0000-0000-0000-000000000001', 'Departamento A',
   '11111111-1111-1111-1111-111111111111'),
  ('b2b2b2b2-0000-0000-0000-000000000002', 'Departamento B',
   '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.department_instance_assignments (id, department_id, instance_id, tenant_id) VALUES
  ('a3a3a3a3-0000-0000-0000-000000000001', 'a2a2a2a2-0000-0000-0000-000000000001',
   'a1a1a1a1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('b3b3b3b3-0000-0000-0000-000000000002', 'b2b2b2b2-0000-0000-0000-000000000002',
   'b1b1b1b1-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

-- 0. as funções e o ACL ------------------------------------------------------
DO $$
DECLARE
  v_proc RECORD;
BEGIN
  FOR v_proc IN
    SELECT p.oid::regprocedure::text AS nome, p.prosecdef, p.proacl::text AS acl
      FROM pg_proc p
     WHERE p.oid IN ('private.chat_contatos_restritos_ids()'::regprocedure,
                     'private.chat_conversas_restritas_ids()'::regprocedure)
  LOOP
    ASSERT v_proc.prosecdef, '0: ' || v_proc.nome || ' não é SECURITY DEFINER';
    ASSERT position('anon=' in COALESCE(v_proc.acl, '')) > 0,
      '0: o ACL de anon mudou (não era para revogar): ' || v_proc.nome;
  END LOOP;

  ASSERT to_regprocedure('private.chat_contatos_restritos_ids()') IS NOT NULL,
    '0: sem private.chat_contatos_restritos_ids()';
  ASSERT to_regprocedure('private.chat_conversas_restritas_ids()') IS NOT NULL,
    '0: sem private.chat_conversas_restritas_ids()';
END $$;

-- 1. sem sessão: vazio -------------------------------------------------------
DO $$
BEGIN
  ASSERT private.chat_contatos_restritos_ids() = '{}'::uuid[],
    '1: sem sessão, chat_contatos_restritos_ids() devolveu ' ||
    private.chat_contatos_restritos_ids()::text;
  ASSERT private.chat_conversas_restritas_ids() = '{}'::uuid[],
    '1: sem sessão, chat_conversas_restritas_ids() devolveu ' ||
    private.chat_conversas_restritas_ids()::text;
END $$;

-- 1b. e também pelo papel anon, quando ele alcança o schema private.
DO $$
BEGIN
  IF has_schema_privilege('anon', 'private', 'USAGE') THEN
    PERFORM set_config('request.jwt.claim.sub', '', true);
    EXECUTE 'SET LOCAL ROLE anon';
    ASSERT private.chat_contatos_restritos_ids() = '{}'::uuid[],
      '1b: como anon, chat_contatos_restritos_ids() devolveu ' ||
      private.chat_contatos_restritos_ids()::text;
    ASSERT private.chat_conversas_restritas_ids() = '{}'::uuid[],
      '1b: como anon, chat_conversas_restritas_ids() devolveu ' ||
      private.chat_conversas_restritas_ids()::text;
    EXECUTE 'RESET ROLE';
  END IF;
END $$;

-- 2. com sessão: só a empresa da sessão --------------------------------------
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","session_id":"e1e1e1e1-0000-0000-0000-000000000001"}', true);

DO $$
BEGIN
  ASSERT private.chat_contatos_restritos_ids() = ARRAY['c1c1c1c1-0000-0000-0000-000000000001']::uuid[],
    '2: com sessão da empresa A, chat_contatos_restritos_ids() devolveu ' ||
    private.chat_contatos_restritos_ids()::text;
  ASSERT private.chat_conversas_restritas_ids() = ARRAY['d1d1d1d1-0000-0000-0000-000000000001']::uuid[],
    '2: com sessão da empresa A, chat_conversas_restritas_ids() devolveu ' ||
    private.chat_conversas_restritas_ids()::text;
END $$;

SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true),
       set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","session_id":"e2e2e2e2-0000-0000-0000-000000000002"}', true);

DO $$
BEGIN
  ASSERT private.chat_contatos_restritos_ids() = ARRAY['c2c2c2c2-0000-0000-0000-000000000002']::uuid[],
    '2: com sessão da empresa B, chat_contatos_restritos_ids() devolveu ' ||
    private.chat_contatos_restritos_ids()::text;
END $$;

SELECT set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claims', '', true);

-- 3. department_instance_assignments ----------------------------------------
DO $$
DECLARE
  v_roles name[];
  v_qual  text;
  v_rls   boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls
    FROM pg_class WHERE oid = 'public.department_instance_assignments'::regclass;
  ASSERT v_rls, '3: department_instance_assignments está sem RLS';

  SELECT ARRAY(SELECT r.rolname FROM pg_roles r WHERE r.oid = ANY(pol.polroles))::name[],
         pg_get_expr(pol.polqual, pol.polrelid)
    INTO v_roles, v_qual
    FROM pg_policy pol
   WHERE pol.polname = 'department_instance_assignments_select';

  ASSERT v_roles IS NOT NULL, '3: sumiu a política department_instance_assignments_select';

  ASSERT v_roles = ARRAY['authenticated']::name[],
    '3: a política de SELECT de department_instance_assignments vale para ' || v_roles::text;
  ASSERT v_qual LIKE '%get_user_tenant_id%',
    '3: a política de SELECT não tem escopo de empresa: ' || v_qual;

  -- As outras políticas (INSERT e DELETE) podem continuar TO public: o que vale
  -- é que elas exijam sessão (auth.uid()) — sem sessão, a condição é NULL/false
  -- e anon não entra. A de SELECT não pode chegar em anon de jeito nenhum.
  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_policy pol
     WHERE pol.polrelid = 'public.department_instance_assignments'::regclass
       AND pol.polpermissive
       AND ARRAY(SELECT r.rolname FROM pg_roles r WHERE r.oid = ANY(pol.polroles))
           && ARRAY['public', 'anon']::name[]
       AND (pol.polcmd = 'r'
            OR coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
               NOT LIKE '%auth.uid()%'
               AND coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
                   NOT LIKE '%auth.uid()%')
  ), '3: sobrou política permissiva de department_instance_assignments sem sessão';
END $$;

-- 3a. as duas empresas têm atribuição gravada (senão o caso 3 não prova nada).
DO $$
DECLARE
  v_total bigint;
BEGIN
  SELECT count(*) INTO v_total FROM public.department_instance_assignments;
  ASSERT v_total >= 2,
    '3: a tabela só tem ' || v_total || ' linha(s): o teste de anon não provaria nada';
END $$;

-- 3b. anon não lê nenhuma das duas.
DO $$
DECLARE
  v_vistas bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_vistas FROM public.department_instance_assignments;
  EXECUTE 'RESET ROLE';
  ASSERT v_vistas = 0,
    '3: anon lê ' || v_vistas || ' linha(s) de department_instance_assignments';
END $$;

-- 3c. quem tem sessão continua vendo a própria empresa, e só ela.
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","session_id":"e1e1e1e1-0000-0000-0000-000000000001"}', true);

DO $$
DECLARE
  v_ids uuid[];
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM public.department_instance_assignments;
  EXECUTE 'RESET ROLE';
  ASSERT v_ids = ARRAY['a3a3a3a3-0000-0000-0000-000000000001']::uuid[],
    '3: com sessão da empresa A, department_instance_assignments devolveu ' || v_ids::text;
END $$;

SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true),
       set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","session_id":"e2e2e2e2-0000-0000-0000-000000000002"}', true);

DO $$
DECLARE
  v_ids uuid[];
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM public.department_instance_assignments;
  EXECUTE 'RESET ROLE';
  ASSERT v_ids = ARRAY['b3b3b3b3-0000-0000-0000-000000000002']::uuid[],
    '3: com sessão da empresa B, department_instance_assignments devolveu ' || v_ids::text;
END $$;

SELECT set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claims', '', true);

ROLLBACK;
