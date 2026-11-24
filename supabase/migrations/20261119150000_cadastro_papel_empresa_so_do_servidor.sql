-- ============================================================================
-- Conta nova: papel e empresa só do servidor (brecha do cadastro público)
-- ============================================================================
-- A BRECHA
-- handle_new_user() lia `perfil` e `tenant_id` de raw_user_meta_data. Esse campo
-- é escrito por quem se cadastra: no cadastro público do Supabase Auth
-- (/auth/v1/signup com a chave pública, que vai no site) a pessoa manda o que
-- quiser em `options.data`. Com o cadastro público ligado, um anônimo virava
-- administradora (ou qualquer perfil) da empresa que escolhesse; sem `tenant_id`,
-- caía na única empresa da instalação. Reproduzido no banco do ensaio.
--
-- A CORREÇÃO
-- 1. Papel e empresa só valem de raw_app_meta_data, que só a API administrativa
--    (service_role) grava. As funções admin-create-user e provision-tenant
--    passam a mandar `perfil` e `tenant_id` em app_metadata.
-- 2. A API administrativa grava o app_metadata com um UPDATE logo depois do
--    INSERT, na mesma transação (supabase/auth, internal/api/admin.go,
--    adminUserCreate: tx.Create(user) e depois user.UpdateAppMetaData). Por isso
--    o vínculo da conta (users, profiles, user_roles, cargo) sai de um gatilho de
--    restrição ADIADO para o fim da transação: desk_conta_nova_conferida. Ele lê
--    a linha já com o app_metadata e:
--      - com `perfil` e `tenant_id` do servidor: cria o vínculo;
--      - sem eles: RECUSA o cadastro (a transação inteira volta; o Supabase
--        responde "Database error ..."). Nenhuma conta fica pela metade.
-- 3. O primeiro acesso (app sem nenhuma administradora) continua igual: a
--    primeira conta vira administradora da empresa principal vazia (ou de uma
--    empresa nova, se a principal já tiver gente), com o nome da empresa que ela
--    informar. Nesse caminho nada de papel ou empresa vem dos dados dela.
-- 4. Conta provisionada numa instalação que ainda não tem administradora
--    (provision-tenant, admin-create-user): o INSERT em auth.users chega antes do
--    app_metadata, então o primeiro acesso põe a conta na empresa principal e
--    renomeia a principal. No fim da transação o gatilho adiado vê o app_metadata
--    e corrige: desfaz o que o primeiro acesso criou (vínculo, nome da principal
--    e a empresa criada, se foi o caso) e refaz o vínculo na empresa que o
--    servidor mandou. O que o primeiro acesso criou fica marcado numa variável
--    local da transação (`desk.primeiro_acesso`); conta que já existia antes
--    nunca é mexida — nesse caso o cadastro é RECUSADO ("já vinculada a outra
--    empresa").
--
-- ORDEM DE PUBLICAÇÃO (produção da empresa)
--   1º as funções admin-create-user e provision-tenant (mandam user_metadata E
--      app_metadata; o gatilho antigo segue lendo user_metadata);
--   2º esta migração.
-- Se esta migração entrar antes das funções novas, as funções antigas não mandam
-- app_metadata: o cadastro é RECUSADO no fim da transação, a criação da conta
-- falha e as duas funções respondem erro (admin-create-user: create_failed;
-- provision-tenant: provision_failed, desfazendo a empresa criada). Ninguém cai
-- em empresa errada e nada falha calado.
--
-- Comportamento que muda: com administradora, conta criada sem app_metadata
-- (cadastro público, "Add user" do painel do Supabase, login externo sem conta
-- prévia) é recusada. Antes: no multiempresa já dava erro (sem empresa); numa
-- instalação de uma empresa só, virava `cliente` dela.
-- ============================================================================

-- Vínculo da conta (o "caminho comum" do handle_new_user de 20261109100000).
CREATE OR REPLACE FUNCTION public.desk_provisionar_conta(
  p_user_id uuid, p_email text, p_nome text, p_perfil text, p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role        public.app_role;
  v_position_id UUID;
  v_employee_id UUID;
  v_master      UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Empresa % não existe.', p_tenant_id;
  END IF;

  INSERT INTO public.users (id, nome, email, perfil, tenant_id)
  VALUES (p_user_id, p_nome, p_email, p_perfil, p_tenant_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (user_id, tenant_id, full_name)
  VALUES (p_user_id, p_tenant_id, p_nome)
  ON CONFLICT (user_id) DO NOTHING;

  v_position_id := NULL;
  CASE p_perfil
    WHEN 'admin'           THEN v_role := 'admin';   v_position_id := '00000000-0000-0000-0003-000000000001';
    WHEN 'gerente'         THEN v_role := 'manager'; v_position_id := '00000000-0000-0000-0003-000000000002';
    WHEN 'admin_cobranca'  THEN v_role := 'manager'; v_position_id := '00000000-0000-0000-0003-000000000007';
    WHEN 'estrategista'    THEN v_role := 'member';  v_position_id := '00000000-0000-0000-0003-000000000003';
    WHEN 'atendimento'     THEN v_role := 'member';  v_position_id := '00000000-0000-0000-0003-000000000004';
    WHEN 'agente_chat'     THEN v_role := 'member';  v_position_id := '00000000-0000-0000-0003-000000000005';
    WHEN 'agente_cobranca' THEN v_role := 'member';  v_position_id := '00000000-0000-0000-0003-000000000006';
    WHEN 'cliente'         THEN v_role := 'member';  v_position_id := NULL;
    ELSE                        v_role := 'member';  v_position_id := NULL;
  END CASE;

  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (p_user_id, v_role, p_tenant_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Os cargos-semente (00000000-0000-0000-0003-...) só existem no tenant mestre.
  IF v_position_id IS NOT NULL AND p_tenant_id = v_master THEN
    INSERT INTO public.employees (tenant_id, user_id, position_id, status, work_email)
    VALUES (p_tenant_id, p_user_id, v_position_id, 'active', p_email)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_employee_id;

    IF v_employee_id IS NULL THEN
      SELECT id INTO v_employee_id
      FROM public.employees
      WHERE user_id = p_user_id AND tenant_id = p_tenant_id
      LIMIT 1;
    END IF;

    IF v_employee_id IS NOT NULL THEN
      INSERT INTO public.employee_positions (employee_id, position_id, is_primary, tenant_id)
      VALUES (v_employee_id, v_position_id, true, p_tenant_id)
      ON CONFLICT (employee_id, position_id) DO NOTHING;
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.desk_provisionar_conta(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Gatilho imediato (AFTER INSERT em auth.users): só o primeiro acesso.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nome        TEXT;
  v_has_admin   BOOLEAN;
  v_new_tenant  UUID;
  v_email_local TEXT;
  v_empresa     TEXT;
  v_renomeou    JSONB;
BEGIN
  -- Nome de exibição pode vir da pessoa; papel e empresa, nunca (ver o cabeçalho).
  v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email);

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO v_has_admin;

  -- Com administradora, o vínculo sai do app_metadata no fim da transação
  -- (public.desk_conferir_conta_nova), ou o cadastro é recusado.
  IF v_has_admin THEN
    RETURN NEW;
  END IF;

  -- Instância recém-criada: o 1º usuário vira admin.
  v_email_local := split_part(COALESCE(NEW.email, 'tenant'), '@', 1);
  v_empresa := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'empresa', '')), '');

  -- Instalação do zero: a semente já criou a empresa principal (mestre), vazia.
  -- A primeira conta assume essa empresa em vez de criar uma segunda.
  SELECT t.id INTO v_new_tenant
    FROM public.tenants t
   WHERE t.is_master
     AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.tenant_id = t.id)
   LIMIT 1;

  IF v_new_tenant IS NOT NULL THEN
    -- Nome da principal antes de renomear: o gatilho adiado devolve este nome se a conta
    -- vier provisionada para outra empresa (instalação que ainda não tinha administradora).
    SELECT jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug)
      INTO v_renomeou
      FROM public.tenants t
     WHERE t.id = v_new_tenant;

    UPDATE public.tenants
       SET name = COALESCE(v_empresa, v_nome, v_email_local, 'Minha Empresa'),
           slug = lower(regexp_replace(v_email_local, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substring(NEW.id::text, 1, 8)
     WHERE id = v_new_tenant
    -- Guarda também o que ficou gravado: o gatilho adiado só devolve nome e slug de antes
    -- se os dois ainda forem exatamente estes.
    RETURNING v_renomeou || jsonb_build_object('name_gravado', name, 'slug_gravado', slug)
         INTO v_renomeou;
    PERFORM public.desk_provisionar_conta(NEW.id, NEW.email, v_nome, 'admin', v_new_tenant);
  ELSE
    INSERT INTO public.tenants (name, slug, primary_color)
    VALUES (
      COALESCE(v_empresa, v_nome, v_email_local, 'Minha Empresa'),
      v_email_local || '-' || substring(NEW.id::text, 1, 8),
      '#0B57D0'
    )
    RETURNING id INTO v_new_tenant;

    INSERT INTO public.users (id, nome, email, perfil, tenant_id)
    VALUES (NEW.id, v_nome, NEW.email, 'admin', v_new_tenant)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (user_id, tenant_id, full_name)
    VALUES (NEW.id, v_new_tenant, v_nome)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role, tenant_id)
    VALUES (NEW.id, 'admin', v_new_tenant)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Marca local desta transação: a conta que o primeiro acesso criou, a empresa onde ele a
  -- pôs e, se renomeou a principal, o nome de antes. Só o que esta marca aponta pode ser
  -- desfeito pelo gatilho adiado; conta que já existia nunca é mexida.
  PERFORM set_config(
    'desk.primeiro_acesso',
    (COALESCE(NULLIF(current_setting('desk.primeiro_acesso', true), ''), '{}')::jsonb
      || jsonb_build_object(
           NEW.id::text,
           jsonb_build_object(
             'tenant', v_new_tenant,
             'renomeou', v_renomeou,
             'criada', v_renomeou IS NULL)))::text,
    true);

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Gatilho adiado (fim da transação): toda conta nova sai com vínculo ou é recusada.
CREATE OR REPLACE FUNCTION public.desk_conferir_conta_nova()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app      jsonb;
  v_user     jsonb;
  v_email      text;
  v_perfil     text;
  v_tenant     uuid;
  v_tenant_txt text;
  v_nome       text;
  v_linha    uuid;
  v_marca    jsonb;
  v_renomeou jsonb;
BEGIN
  -- Estado no fim da transação (o NEW é o da hora do INSERT, sem o app_metadata).
  SELECT u.raw_app_meta_data, u.raw_user_meta_data, u.email
    INTO v_app, v_user, v_email
    FROM auth.users u
   WHERE u.id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;  -- conta apagada na mesma transação
  END IF;

  v_perfil := NULLIF(btrim(COALESCE(v_app->>'perfil', '')), '');
  v_tenant_txt := NULLIF(btrim(COALESCE(v_app->>'tenant_id', '')), '');
  v_nome   := COALESCE(NULLIF(btrim(COALESCE(v_user->>'nome', '')), ''), v_email);

  -- Só um dos dois no app_metadata: nenhum chamador do servidor manda pela metade, então é
  -- provisionamento quebrado. Recusa alto: sair calado deixaria a conta na empresa principal.
  IF (v_perfil IS NULL) <> (v_tenant_txt IS NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Metadados de provisionamento incompletos: perfil e tenant_id vêm juntos.',
      HINT = 'Quem provisiona a conta manda os dois em app_metadata; o cadastro público não manda nenhum.';
  END IF;

  -- tenant_id fora do formato de uuid: mensagem clara em vez do erro cru do Postgres.
  IF v_tenant_txt IS NOT NULL
     AND v_tenant_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Metadados de provisionamento inválidos: tenant_id do app_metadata não é um uuid válido.',
      HINT = 'Mande em app_metadata.tenant_id o id (uuid) da empresa de destino.';
  END IF;

  v_tenant := v_tenant_txt::uuid;

  SELECT tenant_id INTO v_linha FROM public.users WHERE id = NEW.id;

  -- Marca do primeiro acesso desta mesma transação (handle_new_user), por conta.
  v_marca := NULLIF(current_setting('desk.primeiro_acesso', true), '')::jsonb -> NEW.id::text;

  -- Conta com vínculo e sem papel/empresa do servidor: primeiro acesso (ou vínculo já
  -- feito) continua como está, nada a conferir.
  IF v_linha IS NOT NULL AND (v_perfil IS NULL OR v_tenant IS NULL) THEN
    RETURN NULL;
  END IF;

  -- Papel e empresa vêm do servidor; com eles, até a conta já vinculada é conferida.
  IF v_linha IS NOT NULL THEN
    IF v_linha = v_tenant THEN
      -- Já está na empresa certa: completa o que faltar. O vínculo que existe vale (não
      -- despromove quem já é admin): só cria perfil, papel e cargo ausentes.
      PERFORM public.desk_provisionar_conta(NEW.id, v_email, v_nome, v_perfil, v_tenant);
      RETURN NULL;
    END IF;

    -- Outra empresa: só é corrigível quando foi o primeiro acesso desta transação que pôs
    -- a conta lá (a dona provisionada numa instalação que ainda não tinha administradora).
    IF v_marca IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Cadastro recusado: conta já vinculada a outra empresa.',
        HINT = 'O vínculo existente vale; para mudar de empresa, use a tela de colaboradores.';
    END IF;

    -- Desfaz o primeiro acesso: apaga o vínculo que ele criou, devolve o nome da empresa
    -- principal e apaga a empresa que ele criou (se foi o caso). Em seguida o vínculo é
    -- refeito abaixo, na empresa que o servidor mandou.
    DELETE FROM public.employee_positions
     WHERE employee_id IN (SELECT e.id FROM public.employees e WHERE e.user_id = NEW.id);
    DELETE FROM public.employees  WHERE user_id = NEW.id;
    DELETE FROM public.user_roles WHERE user_id = NEW.id;
    DELETE FROM public.profiles   WHERE user_id = NEW.id;
    DELETE FROM public.users      WHERE id = NEW.id;

    v_renomeou := v_marca->'renomeou';
    IF v_renomeou IS NOT NULL AND v_renomeou ? 'name_gravado' THEN
      -- Só devolve nome e slug de antes se a principal ainda estiver exatamente como o
      -- primeiro acesso a deixou: valor que alguém já mudou não é reescrito por aqui.
      UPDATE public.tenants
         SET name = v_renomeou->>'name',
             slug = v_renomeou->>'slug'
       WHERE id = (v_renomeou->>'id')::uuid
         AND name = v_renomeou->>'name_gravado'
         AND slug = v_renomeou->>'slug_gravado';
    END IF;

    IF COALESCE((v_marca->>'criada')::boolean, false) THEN
      BEGIN
        DELETE FROM public.tenants WHERE id = (v_marca->>'tenant')::uuid;
      EXCEPTION WHEN foreign_key_violation THEN
        NULL;  -- sobrou algo na empresa criada: fica para a limpeza, nada de cascata
      END;
    END IF;
  END IF;

  IF v_perfil IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Cadastro recusado: conta nova sem papel e empresa definidos pelo servidor.',
      HINT = 'Contas novas entram pelo cadastro de colaborador (admin-create-user) ou pelo provisionamento de empresa (provision-tenant).';
  END IF;

  PERFORM public.desk_provisionar_conta(NEW.id, v_email, v_nome, v_perfil, v_tenant);
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.desk_conferir_conta_nova() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS desk_conta_nova_conferida ON auth.users;
CREATE CONSTRAINT TRIGGER desk_conta_nova_conferida
  AFTER INSERT ON auth.users
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.desk_conferir_conta_nova();
