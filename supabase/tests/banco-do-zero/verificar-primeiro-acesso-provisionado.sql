-- Conta provisionada numa instalação que ainda não tem administradora.
-- Roda depois das migrações (ensaiar.mjs --verificar) numa transação desfeita no fim.
--
-- O CASO (achado da revisão): numa instalação nova não há administradora, então o
-- gatilho imediato (handle_new_user) trata a conta que o provision-tenant cria como
-- primeiro acesso — põe a dona na empresa principal e renomeia a principal. O
-- app_metadata, que diz a empresa de verdade, só chega depois do INSERT. No fim da
-- transação o gatilho adiado tem de ver esse app_metadata e corrigir: desfazer o que
-- o primeiro acesso criou (vínculo, nome da principal e a empresa que ele criou, se
-- foi o caso) e refazer o vínculo na empresa que o servidor mandou. Conta que já
-- existia antes nunca é mexida: nesse caso o cadastro é recusado.
--
-- pg_temp.cadastro imita o Supabase Auth (igual a verificar-cadastro-servidor.sql),
-- com p_tenant_antes para simular uma conta que já existia, vinculada por outro caminho.
--
-- Casos:
--  1. app_metadata com só o tenant_id: recusa alta ("incompletos"), nada fica na principal;
--  2. app_metadata com só o perfil: a mesma recusa;
--  3. tenant_id que não é uuid: mensagem clara, sem o "invalid input syntax" cru;
--  4. principal renomeada por outra pessoa no meio da transação: o nome novo (e o slug)
--     não são reescritos, mas o vínculo da dona é corrigido;
--  5. instalação nova + dona provisionada (provision-tenant): vínculo na empresa nova,
--     empresa principal de volta ao nome de antes, sem sobra da dona na principal;
--  6. instalação nova + membra provisionada (atendimento): igual, com papel de membro;
--  7. conta que já existia em outra empresa (não veio do primeiro acesso) e o
--     app_metadata manda outra: recusada, e nada se move;
--  8. conta já na empresa certa, faltando perfil público e papel: o vínculo é completado.

BEGIN;

CREATE FUNCTION pg_temp.cadastro(p_id uuid, p_email text, p_user jsonb, p_app jsonb DEFAULT NULL,
                                 p_tenant_antes uuid DEFAULT NULL,
                                 p_renomeia_principal text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (p_id, p_email, coalesce(p_user, '{}'::jsonb), '{"provider":"email","providers":["email"]}'::jsonb);
  IF p_tenant_antes IS NOT NULL THEN
    INSERT INTO public.users (id, nome, email, perfil, tenant_id)
    VALUES (p_id, coalesce(p_user->>'nome', p_email), p_email, 'atendimento', p_tenant_antes);
  END IF;
  IF p_app IS NOT NULL THEN
    UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || p_app WHERE id = p_id;
  END IF;
  -- Alguém mexe no nome da principal entre o primeiro acesso e o fim da transação.
  IF p_renomeia_principal IS NOT NULL THEN
    UPDATE public.tenants SET name = p_renomeia_principal
     WHERE id = '00000000-0000-0000-0000-000000000001';
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  RETURN 'aceito';
EXCEPTION WHEN OTHERS THEN
  RETURN 'recusado: ' || SQLERRM;
END $$;

-- A conta ficou vinculada certa: empresa, perfil, perfil público e papel no lugar.
CREATE FUNCTION pg_temp.vinculada(p_id uuid, p_tenant uuid, p_perfil text) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = p_id AND tenant_id = p_tenant AND perfil = p_perfil)
     AND EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_id AND tenant_id = p_tenant)
     AND EXISTS (SELECT 1 FROM public.user_roles
                  WHERE user_id = p_id AND tenant_id = p_tenant
                    AND role = (CASE p_perfil WHEN 'admin' THEN 'admin'
                                              WHEN 'gerente' THEN 'manager'
                                              ELSE 'member' END)::public.app_role)
$$;

DO $$
DECLARE
  mestre  CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
  dona    CONSTANT uuid := 'aaaaaaa1-0000-0000-0000-000000000001';
  membra  CONSTANT uuid := 'aaaaaaa2-0000-0000-0000-000000000002';
  antiga  CONSTANT uuid := 'aaaaaaa3-0000-0000-0000-000000000003';
  certa   CONSTANT uuid := 'aaaaaaa4-0000-0000-0000-000000000004';
  metade1 CONSTANT uuid := 'aaaaaaa5-0000-0000-0000-000000000005';
  metade2 CONSTANT uuid := 'aaaaaaa6-0000-0000-0000-000000000006';
  invalida CONSTANT uuid := 'aaaaaaa7-0000-0000-0000-000000000007';
  mexida  CONSTANT uuid := 'aaaaaaa8-0000-0000-0000-000000000008';
  empresa uuid;
  outra   uuid;
  r       text;
  v_nome  text;
  v_slug  text;
BEGIN
  -- A principal tem que existir com nome (o do seed ou o que o cliente puser) e sem
  -- ninguém dentro: na instalação nova a primeira conta é criada pela tela, não pelo seed.
  -- Não se compara com o nome do seed: o banco montado pelo pacote chama a principal de
  -- "Empresa modelo", e a regra vale igual.
  SELECT name, slug INTO v_nome, v_slug FROM public.tenants WHERE id = mestre;
  ASSERT v_nome IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE tenant_id = mestre),
    '0: principal vazia na instalação nova';

  INSERT INTO public.tenants (name, slug) VALUES ('Clínica Aurora', 'clinica-aurora') RETURNING id INTO empresa;

  -- 1. app_metadata com só o tenant_id, sem perfil (ressalva da Vera): antes o gatilho
  --    adiado saía calado e a conta ficava na principal. Agora recusa alto e nada sobra.
  r := pg_temp.cadastro(metade1, 'metade@tenant.com', '{"nome":"Metade Tenant"}'::jsonb,
         jsonb_build_object('tenant_id', empresa));
  ASSERT r LIKE 'recusado: %', '1: só tenant_id é recusado (' || r || ')';
  ASSERT r LIKE '%incompletos%', '1: motivo da recusa com só tenant_id (' || r || ')';
  ASSERT NOT EXISTS (SELECT 1 FROM auth.users WHERE id = metade1), '1: conta com só tenant_id não sobrou';
  ASSERT NOT EXISTS (SELECT 1 FROM public.users WHERE tenant_id = mestre), '1: principal sem ninguém';
  ASSERT (SELECT name FROM public.tenants WHERE id = mestre) = v_nome, '1: principal não foi renomeada';

  -- 2. app_metadata com só o perfil, sem tenant_id: mesma recusa.
  r := pg_temp.cadastro(metade2, 'metade@perfil.com', '{"nome":"Metade Perfil"}'::jsonb,
         jsonb_build_object('perfil', 'admin'));
  ASSERT r LIKE 'recusado: %', '2: só perfil é recusado (' || r || ')';
  ASSERT r LIKE '%incompletos%', '2: motivo da recusa com só perfil (' || r || ')';
  ASSERT NOT EXISTS (SELECT 1 FROM auth.users WHERE id = metade2), '2: conta com só perfil não sobrou';
  ASSERT NOT EXISTS (SELECT 1 FROM public.users WHERE tenant_id = mestre), '2: principal sem ninguém';

  -- 3. tenant_id que não é uuid: mensagem clara, não o "invalid input syntax" cru.
  r := pg_temp.cadastro(invalida, 'invalida@aurora.com', '{"nome":"Conta Inválida"}'::jsonb,
         '{"perfil":"admin","tenant_id":"nao-e-uuid"}'::jsonb);
  ASSERT r LIKE 'recusado: %', '3: tenant_id inválido é recusado (' || r || ')';
  ASSERT r LIKE '%uuid válido%', '3: mensagem clara para tenant_id inválido (' || r || ')';
  ASSERT r NOT LIKE '%invalid input syntax%', '3: sem erro cru do Postgres (' || r || ')';
  ASSERT NOT EXISTS (SELECT 1 FROM auth.users WHERE id = invalida), '3: conta com tenant_id inválido não sobrou';

  -- 4. A principal é renomeada por outra pessoa entre o primeiro acesso e o fim da
  --    transação: o gatilho adiado não reescreve o nome que já mudou (nem o slug), mas
  --    o vínculo da dona é corrigido do mesmo jeito.
  r := pg_temp.cadastro(mexida, 'mexida@aurora.com',
         jsonb_build_object('nome', 'Dona Mexida', 'perfil', 'admin', 'tenant_id', empresa),
         jsonb_build_object('perfil', 'admin', 'tenant_id', empresa),
         NULL, 'Nome Que Alguém Pôs');
  ASSERT r = 'aceito', '4: dona provisionada aceita (' || r || ')';
  ASSERT pg_temp.vinculada(mexida, empresa, 'admin'), '4: dona vinculada como admin da empresa nova';
  ASSERT (SELECT name FROM public.tenants WHERE id = mestre) = 'Nome Que Alguém Pôs',
         '4: nome novo da principal preservado (' || (SELECT name FROM public.tenants WHERE id = mestre) || ')';
  ASSERT (SELECT slug FROM public.tenants WHERE id = mestre) <> v_slug,
         '4: slug da principal não foi devolvido quando o nome já tinha mudado';
  -- Devolve a principal ao estado de fábrica para os casos seguintes.
  UPDATE public.tenants SET name = v_nome, slug = v_slug WHERE id = mestre;

  -- 5. Instalação nova: a dona provisionada. O INSERT chega sem administradora (o
  --    primeiro acesso a põe na principal); o app_metadata diz a empresa de verdade.
  r := pg_temp.cadastro(dona, 'dona@aurora.com',
         jsonb_build_object('nome', 'Dona Aurora', 'perfil', 'admin', 'tenant_id', empresa),
         jsonb_build_object('perfil', 'admin', 'tenant_id', empresa));
  ASSERT r = 'aceito', '5: dona provisionada aceita (' || r || ')';
  ASSERT pg_temp.vinculada(dona, empresa, 'admin'), '5: dona vinculada como admin da empresa nova';
  ASSERT (SELECT nome FROM public.users WHERE id = dona) = 'Dona Aurora', '5: nome da dona';
  ASSERT NOT EXISTS (SELECT 1 FROM public.users WHERE tenant_id = mestre), '5: principal sem ninguém';
  ASSERT NOT EXISTS (SELECT 1 FROM public.profiles WHERE tenant_id = mestre), '5: principal sem perfil';
  ASSERT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE tenant_id = mestre), '5: principal sem papel';
  ASSERT NOT EXISTS (SELECT 1 FROM public.employees WHERE user_id = dona), '5: dona sem cargo na principal';
  ASSERT (SELECT name FROM public.tenants WHERE id = mestre) = v_nome, '5: nome da principal de volta';
  ASSERT (SELECT slug FROM public.tenants WHERE id = mestre) = v_slug, '5: slug da principal de volta';
  ASSERT (SELECT name FROM public.tenants WHERE id = empresa) = 'Clínica Aurora', '5: empresa nova com o nome dela';

  -- 6. Instalação nova, membra provisionada: o mesmo caminho, com papel de membro.
  INSERT INTO public.tenants (name, slug) VALUES ('Clínica Boreal', 'clinica-boreal') RETURNING id INTO outra;
  r := pg_temp.cadastro(membra, 'membra@boreal.com',
         jsonb_build_object('nome', 'Membra Boreal', 'perfil', 'atendimento', 'tenant_id', outra),
         jsonb_build_object('perfil', 'atendimento', 'tenant_id', outra));
  ASSERT r = 'aceito', '6: membra provisionada aceita (' || r || ')';
  ASSERT pg_temp.vinculada(membra, outra, 'atendimento'), '6: membra vinculada como membro da empresa nova';
  ASSERT NOT EXISTS (SELECT 1 FROM public.users WHERE id = membra AND tenant_id = mestre), '6: sem sobra da membra na principal';

  -- 7. Conta que já existia em outra empresa (não veio do primeiro acesso) e o
  --    app_metadata manda outra: recusada, e nada se move.
  r := pg_temp.cadastro(antiga, 'antiga@boreal.com', '{"nome":"Conta Antiga"}'::jsonb,
         jsonb_build_object('perfil', 'admin', 'tenant_id', empresa), outra);
  ASSERT r LIKE 'recusado: %', '7: conta já vinculada a outra empresa é recusada (' || r || ')';
  ASSERT r LIKE '%já vinculada a outra empresa%', '7: motivo da recusa (' || r || ')';
  ASSERT NOT EXISTS (SELECT 1 FROM auth.users WHERE id = antiga), '7: nada da conta sobrou';
  ASSERT NOT EXISTS (SELECT 1 FROM public.users WHERE id = antiga), '7: vínculo antigo não foi movido';
  ASSERT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = antiga), '7: sem papel novo';

  -- 8. Conta já na empresa certa, faltando perfil público e papel (vínculo pela
  --    metade): o servidor completa o vínculo em vez de recusar.
  r := pg_temp.cadastro(certa, 'certa@aurora.com', '{"nome":"Conta Certa"}'::jsonb,
         jsonb_build_object('perfil', 'atendimento', 'tenant_id', empresa), empresa);
  ASSERT r = 'aceito', '8: conta da própria empresa aceita (' || r || ')';
  ASSERT pg_temp.vinculada(certa, empresa, 'atendimento'), '8: vínculo completado';

  RAISE NOTICE 'verificar-primeiro-acesso-provisionado: ok';
END $$;

\echo 'verificar-primeiro-acesso-provisionado: todos os casos passaram'
ROLLBACK;
