-- Conta nova: papel e empresa só do servidor (migração 20261119150000).
-- Roda depois das migrações (ensaiar.mjs --verificar) numa transação desfeita no fim.
--
-- pg_temp.cadastro imita o Supabase Auth: INSERT em auth.users com o user_metadata
-- (o que a pessoa ou a função mandam), depois, se houver, o UPDATE do app_metadata
-- (só a API administrativa faz; internal/api/admin.go) e, por fim, o "commit"
-- (SET CONSTRAINTS ALL IMMEDIATE dispara o gatilho adiado agora). Recusa = a
-- transação do cadastro volta inteira.
--
-- Casos:
--  1. primeiro acesso continua igual (papel e empresa dos dados da pessoa ignorados);
--  2. a brecha: cadastro com perfil admin e a empresa de outra pessoa nos dados é recusado;
--  3. cadastro público sem nada, ou só com perfil, também é recusado;
--  4. função antiga (só user_metadata, migração antes das funções): recusado, sem cair em empresa nenhuma;
--  5. admin-create-user novo (app_metadata): conta certa, papel e cargo certos;
--  6. app_metadata vence o user_metadata;
--  7. provision-tenant novo: dono e membro na empresa nova;
--  8. empresa inexistente no app_metadata: recusado;
--  9. o gatilho é adiado (precisa ser, porque o app_metadata chega depois do INSERT).

BEGIN;

CREATE FUNCTION pg_temp.cadastro(p_id uuid, p_email text, p_user jsonb, p_app jsonb DEFAULT NULL) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (p_id, p_email, coalesce(p_user, '{}'::jsonb), '{"provider":"email","providers":["email"]}'::jsonb);
  IF p_app IS NOT NULL THEN
    UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || p_app WHERE id = p_id;
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  RETURN 'aceito';
EXCEPTION WHEN OTHERS THEN
  RETURN 'recusado: ' || SQLERRM;
END $$;

-- Nada da conta em lugar nenhum (nem em auth.users, nem no app).
CREATE FUNCTION pg_temp.sumiu(p_id uuid) RETURNS boolean LANGUAGE sql AS $$
  SELECT NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_id)
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_id)
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_id)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_id)
$$;

DO $$
DECLARE
  mestre CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
  outra  uuid;
  r      text;
BEGIN
  -- 9. Gatilho adiado para o fim da transação
  ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND tgname = 'desk_conta_nova_conferida'
                   AND tgdeferrable AND tginitdeferred), '9: gatilho de restrição adiado em auth.users';
  ASSERT NOT has_function_privilege('anon', 'public.desk_provisionar_conta(uuid,text,text,text,uuid)', 'EXECUTE'), '9: anon não chama o vínculo';
  ASSERT NOT has_function_privilege('authenticated', 'public.desk_provisionar_conta(uuid,text,text,text,uuid)', 'EXECUTE'), '9: logado não chama o vínculo';

  -- 1. Primeiro acesso: mesmo mandando papel e empresa, vira admin da empresa principal
  r := pg_temp.cadastro('11111111-1111-1111-1111-111111111111', 'dona@exemplo.com',
         jsonb_build_object('nome', 'Dona', 'empresa', 'Empresa da Dona', 'perfil', 'gerente', 'tenant_id', gen_random_uuid()));
  ASSERT r = 'aceito', '1: primeiro acesso aceito (' || r || ')';
  ASSERT (SELECT perfil FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111') = 'admin', '1: admin';
  ASSERT (SELECT tenant_id FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111') = mestre, '1: na empresa principal';
  ASSERT (SELECT name FROM public.tenants WHERE id = mestre) = 'Empresa da Dona', '1: nome da empresa informado';
  ASSERT (SELECT role::text FROM public.user_roles WHERE user_id = '11111111-1111-1111-1111-111111111111') = 'admin', '1: papel admin';
  ASSERT EXISTS (SELECT 1 FROM public.employees WHERE user_id = '11111111-1111-1111-1111-111111111111'), '1: cargo de administradora';

  -- Outra empresa (como o provision-tenant cria)
  INSERT INTO public.tenants (name, slug, primary_color) VALUES ('Outra Empresa', 'outra-empresa-teste', '#000000')
  RETURNING id INTO outra;

  -- 2. A brecha
  r := pg_temp.cadastro('22222222-2222-2222-2222-222222222222', 'intrusa@exemplo.com',
         jsonb_build_object('nome', 'Intrusa', 'perfil', 'admin', 'tenant_id', outra));
  ASSERT r LIKE 'recusado: Cadastro recusado%', '2: perfil admin e empresa de outra pessoa nos dados: recusado (' || r || ')';
  ASSERT pg_temp.sumiu('22222222-2222-2222-2222-222222222222'), '2: nada ficou';
  r := pg_temp.cadastro('22222222-2222-2222-2222-222222222223', 'intrusa2@exemplo.com',
         jsonb_build_object('perfil', 'admin', 'tenant_id', mestre));
  ASSERT r LIKE 'recusado:%' AND pg_temp.sumiu('22222222-2222-2222-2222-222222222223'), '2: nem na empresa principal';

  -- 3. Cadastro público comum
  r := pg_temp.cadastro('33333333-3333-3333-3333-333333333333', 'alguem@exemplo.com', '{"nome":"Alguém"}');
  ASSERT r LIKE 'recusado:%' AND pg_temp.sumiu('33333333-3333-3333-3333-333333333333'), '3: sem dados: recusado';
  r := pg_temp.cadastro('33333333-3333-3333-3333-333333333334', 'alguem2@exemplo.com', '{"perfil":"gerente"}');
  ASSERT r LIKE 'recusado:%' AND pg_temp.sumiu('33333333-3333-3333-3333-333333333334'), '3: só perfil: recusado';

  -- 4. Função antiga (só user_metadata): migração entrou antes das funções novas
  r := pg_temp.cadastro('44444444-4444-4444-4444-444444444444', 'equipe-antiga@exemplo.com',
         jsonb_build_object('nome', 'Equipe', 'perfil', 'estrategista', 'tenant_id', mestre));
  ASSERT r LIKE 'recusado:%' AND pg_temp.sumiu('44444444-4444-4444-4444-444444444444'), '4: função antiga: recusado, sem empresa errada';

  -- 5. admin-create-user novo
  r := pg_temp.cadastro('55555555-5555-5555-5555-555555555555', 'gerente@exemplo.com',
         jsonb_build_object('nome', 'Gerente', 'perfil', 'gerente', 'tenant_id', mestre),
         jsonb_build_object('perfil', 'gerente', 'tenant_id', mestre));
  ASSERT r = 'aceito', '5: aceito (' || r || ')';
  ASSERT (SELECT perfil || '/' || tenant_id::text || '/' || nome FROM public.users WHERE id = '55555555-5555-5555-5555-555555555555')
         = 'gerente/' || mestre::text || '/Gerente', '5: perfil, empresa e nome';
  ASSERT (SELECT role::text FROM public.user_roles WHERE user_id = '55555555-5555-5555-5555-555555555555') = 'manager', '5: papel manager';
  ASSERT EXISTS (SELECT 1 FROM public.employees WHERE user_id = '55555555-5555-5555-5555-555555555555'), '5: cargo na empresa principal';

  -- 6. app_metadata vence o user_metadata
  r := pg_temp.cadastro('66666666-6666-6666-6666-666666666666', 'mista@exemplo.com',
         jsonb_build_object('nome', 'Mista', 'perfil', 'admin', 'tenant_id', outra),
         jsonb_build_object('perfil', 'estrategista', 'tenant_id', mestre));
  ASSERT r = 'aceito', '6: aceito';
  ASSERT (SELECT perfil || '/' || tenant_id::text FROM public.users WHERE id = '66666666-6666-6666-6666-666666666666')
         = 'estrategista/' || mestre::text, '6: perfil e empresa do servidor';
  ASSERT (SELECT role::text FROM public.user_roles WHERE user_id = '66666666-6666-6666-6666-666666666666') = 'member', '6: sem papel admin';

  -- 7. provision-tenant novo: dono e membro da empresa nova
  r := pg_temp.cadastro('77777777-7777-7777-7777-777777777777', 'dono-outra@exemplo.com',
         jsonb_build_object('nome', 'Dono', 'perfil', 'admin', 'tenant_id', outra),
         jsonb_build_object('perfil', 'admin', 'tenant_id', outra));
  ASSERT r = 'aceito', '7: dono aceito';
  ASSERT (SELECT perfil || '/' || tenant_id::text FROM public.users WHERE id = '77777777-7777-7777-7777-777777777777')
         = 'admin/' || outra::text, '7: dono admin da empresa nova';
  ASSERT (SELECT tenant_id FROM public.user_roles WHERE user_id = '77777777-7777-7777-7777-777777777777') = outra, '7: papel na empresa nova';
  ASSERT NOT EXISTS (SELECT 1 FROM public.employees WHERE user_id = '77777777-7777-7777-7777-777777777777'), '7: cargos-semente só na principal';
  r := pg_temp.cadastro('77777777-7777-7777-7777-777777777778', 'membro-outra@exemplo.com',
         jsonb_build_object('nome', 'Membro', 'perfil', 'atendimento', 'tenant_id', outra),
         jsonb_build_object('perfil', 'atendimento', 'tenant_id', outra));
  ASSERT r = 'aceito' AND (SELECT tenant_id FROM public.users WHERE id = '77777777-7777-7777-7777-777777777778') = outra, '7: membro na empresa nova';
  ASSERT (SELECT name FROM public.tenants WHERE id = mestre) = 'Empresa da Dona', '7: empresa principal intacta';

  -- 8. Empresa inexistente
  r := pg_temp.cadastro('88888888-8888-8888-8888-888888888888', 'perdida@exemplo.com', '{}',
         jsonb_build_object('perfil', 'estrategista', 'tenant_id', gen_random_uuid()));
  ASSERT r LIKE 'recusado:%' AND pg_temp.sumiu('88888888-8888-8888-8888-888888888888'), '8: empresa inexistente: recusado';
END $$;

\echo 'verificar-cadastro-servidor: todos os casos passaram'
ROLLBACK;
