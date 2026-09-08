-- Fase C.4 — criar usuário sem informar a empresa não pode mais jogá-lo na master.
--
-- Antes: `COALESCE(metadata->>'tenant_id', v_master)`. Qualquer cadastro fora da
-- tela /empresas (signup direto, insert manual, integração) nascia dentro da
-- Aliança com acesso a tudo. Comprovado no teste de 04/08/2026.
--
-- Agora: sem tenant_id no metadata, só passa se a instância tiver UMA empresa só
-- (caso single-tenant, onde não há ambiguidade). Com 2+, falha explicitamente —
-- é melhor o cadastro dar erro do que o usuário nascer na empresa errada.
--
-- Também carimba o tenant em employee_positions, que dependia do resolvedor de
-- contexto e quebraria em cascata sem sessão.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_perfil      TEXT;
  v_nome        TEXT;
  v_role        public.app_role;
  v_position_id UUID;
  v_employee_id UUID;
  v_master      UUID := '00000000-0000-0000-0000-000000000001';
  v_tenant_id   UUID;
  v_has_admin   BOOLEAN;
  v_new_tenant  UUID;
  v_email_local TEXT;
  v_qtd_tenants INT;
BEGIN
  v_nome   := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email);
  v_perfil := COALESCE(NEW.raw_user_meta_data->>'perfil', 'cliente');
  v_tenant_id := NULLIF(NEW.raw_user_meta_data->>'tenant_id','')::uuid;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO v_has_admin;

  -- Instância recém-criada: o 1º usuário vira admin da própria empresa nova.
  IF NOT v_has_admin THEN
    v_email_local := split_part(COALESCE(NEW.email, 'tenant'), '@', 1);

    INSERT INTO public.tenants (name, slug, primary_color)
    VALUES (
      COALESCE(v_nome, v_email_local, 'Minha Empresa'),
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

    RETURN NEW;
  END IF;

  -- Sem empresa informada: só resolve sozinho se não houver ambiguidade.
  IF v_tenant_id IS NULL THEN
    SELECT count(*) INTO v_qtd_tenants FROM public.tenants;
    IF v_qtd_tenants = 1 THEN
      SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;
    ELSE
      RAISE EXCEPTION
        'Cadastro sem empresa definida: informe tenant_id em raw_user_meta_data (a instância tem % empresas).',
        v_qtd_tenants;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id) THEN
    RAISE EXCEPTION 'Empresa % não existe.', v_tenant_id;
  END IF;

  INSERT INTO public.users (id, nome, email, perfil, tenant_id)
  VALUES (NEW.id, v_nome, NEW.email, v_perfil, v_tenant_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (user_id, tenant_id, full_name)
  VALUES (NEW.id, v_tenant_id, v_nome)
  ON CONFLICT (user_id) DO NOTHING;

  v_position_id := NULL;
  CASE v_perfil
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
  VALUES (NEW.id, v_role, v_tenant_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Os cargos-semente (00000000-0000-0000-0003-...) só existem no tenant mestre.
  IF v_position_id IS NOT NULL AND v_tenant_id = v_master THEN
    INSERT INTO public.employees (tenant_id, user_id, position_id, status, work_email)
    VALUES (v_tenant_id, NEW.id, v_position_id, 'active', NEW.email)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_employee_id;

    IF v_employee_id IS NULL THEN
      SELECT id INTO v_employee_id
      FROM public.employees
      WHERE user_id = NEW.id AND tenant_id = v_tenant_id
      LIMIT 1;
    END IF;

    IF v_employee_id IS NOT NULL THEN
      INSERT INTO public.employee_positions (employee_id, position_id, is_primary, tenant_id)
      VALUES (v_employee_id, v_position_id, true, v_tenant_id)
      ON CONFLICT (employee_id, position_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
