-- ============================================================================
-- Primeiro acesso pela tela de entrada (D3 do ensaio real de 19/11/2026)
-- ============================================================================
-- O DEFEITO
-- O roteiro de instalação manda a pessoa "clicar em criar conta", mas a tela de
-- entrada não tinha essa opção e o login por código não cria conta
-- (shouldCreateUser: false). A primeira conta só nascia por chamada direta à API.
--
-- A CORREÇÃO
-- 1. public.desk_primeiro_acesso_aberto(): diz só se o app ainda NÃO tem nenhuma
--    administradora (nem papel 'admin' em user_roles, nem perfil 'admin' em
--    users). Executável por anon (a tela de entrada pergunta antes de mostrar
--    "Criar a primeira conta"). Devolve um booleano e nada mais.
-- 2. handle_new_user() passa a decidir a "primeira conta" pela MESMA função e,
--    quando a porta está aberta, pega uma trava consultiva da transação e confere
--    de novo. Dois cadastros ao mesmo tempo num app recém-instalado viravam duas
--    administradoras (e o segundo trocava o nome da empresa); agora o segundo
--    espera o primeiro terminar e segue a regra de 20261119150000: sem papel e
--    empresa do servidor, é recusado.
-- 3. A função entra em htai_licenca_rpcs_livres(): a tela de entrada consegue
--    perguntar mesmo com a licença negada (a resposta não é dado de negócio).
--
-- O resto do handle_new_user é cópia fiel de 20261119150000 (papel e empresa só do
-- servidor), que precisa ter rodado antes.
--
-- NA PRODUÇÃO DA EMPRESA
-- Sempre existe administradora: a função responde false, o botão não aparece e o
-- handle_new_user segue pelo mesmo caminho de hoje, sem pedir a trava. A regra
-- nova só é mais estrita (perfil 'admin' sem papel também conta como
-- administradora). Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.desk_primeiro_acesso_aberto()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE perfil = 'admin');
$fn$;

COMMENT ON FUNCTION public.desk_primeiro_acesso_aberto() IS
  'true só enquanto o app não tem nenhuma administradora (primeiro acesso). Não devolve mais nada. Usada pela tela de entrada e pelo handle_new_user.';

REVOKE ALL ON FUNCTION public.desk_primeiro_acesso_aberto() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.desk_primeiro_acesso_aberto() TO anon, authenticated, service_role;

-- Lista de RPCs que a API do banco aceita com a licença negada (20261109130000)
-- + desk_primeiro_acesso_aberto.
CREATE OR REPLACE FUNCTION public.htai_licenca_rpcs_livres()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT ARRAY[
    'desk_password_change_status','desk_password_session_allowed','desk_mfa_situacao',
    'get_user_tenant_id','get_tenant_by_domain','resolve_tenant_default',
    'has_role','has_permissao','is_admin','is_admin_or_manager','is_manager','is_master_admin',
    'is_comissoes_admin','is_comissoes_gestor','pode_gerir_contratos','pode_ver_restrito',
    'htai_licenca_situacao','htai_licenca_libera','htai_licenca_escopo_instalacao',
    'desk_primeiro_acesso_aberto'
  ]::text[];
$fn$;

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
  v_gravado     JSONB;
BEGIN
  -- Nome de exibição pode vir da pessoa; papel e empresa, nunca (ver o cabeçalho).
  v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email);

  -- Mesma regra da tela de entrada (desk_primeiro_acesso_aberto). Com a porta
  -- aberta, a trava consultiva enfileira cadastros simultâneos e a regra é
  -- conferida de novo depois dela: só um deles vira a primeira administradora.
  -- Com administradora (o caso da produção da empresa) a trava nem é pedida.
  v_has_admin := NOT public.desk_primeiro_acesso_aberto();
  IF NOT v_has_admin THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('omnx-desk:primeiro-acesso', 0));
    v_has_admin := NOT public.desk_primeiro_acesso_aberto();
  END IF;

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
    RETURNING jsonb_build_object('name_gravado', name, 'slug_gravado', slug)
         INTO v_gravado;

    -- UPDATE que não casa linha nenhuma não devolve linha e zeraria v_gravado (o COALESCE
    -- dentro do RETURNING não salva: variável sem linha volta NULL). A marca `renomeou` tem
    -- que sobreviver, porque com ela nula o gatilho adiado trata a conta como "empresa
    -- criada" e apaga a principal. Aqui a marca só é somada, nunca zerada.
    v_renomeou := COALESCE(v_renomeou, '{}'::jsonb) || COALESCE(v_gravado, '{}'::jsonb);
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

NOTIFY pgrst, 'reload schema';
