-- =====================================================================
-- handle_new_user: branch admin-first pra clones novos da OMNX.
-- =====================================================================
-- A produção atual do omnx-desk tem dual-write (users.perfil legado +
-- user_roles/profiles/employees) e hardcoda tenant_id fixo
-- (00000000-0000-0000-0000-000000000001). Isso funciona pra empresa-mãe
-- mas quebra o clone OMNX, porque o cliente que clona não tem esse
-- tenant pré-existente — o primeiro signup vira `member` num tenant que
-- não existe e o cliente fica trancado fora.
--
-- Estratégia: branch condicional no topo do trigger.
--   • Se já existe ALGUM admin no banco  → fluxo legacy intacto (prod atual).
--   • Se NÃO existe admin (= fresh clone) → cria tenant novo, marca user
--     como admin e pula o resto. Cliente entra como dono do app dele.
--
-- UNIQUE(user_id) em user_roles é mantido (1 role por user no omnx-desk).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfil      TEXT;
  v_nome        TEXT;
  v_role        public.app_role;
  v_position_id UUID;
  v_employee_id UUID;
  v_tenant_id   UUID := '00000000-0000-0000-0000-000000000001';
  v_has_admin   BOOLEAN;
  v_new_tenant  UUID;
  v_email_local TEXT;
BEGIN
  v_nome   := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email);
  v_perfil := COALESCE(NEW.raw_user_meta_data->>'perfil', 'cliente');

  -- ── Branch admin-first (fresh clone OMNX) ─────────────────────
  -- Se ainda não existe nenhum admin no banco, esse signup é o primeiro
  -- user do clone: cria tenant novo + marca como admin e retorna.
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
    INTO v_has_admin;

  IF NOT v_has_admin THEN
    v_email_local := split_part(COALESCE(NEW.email, 'tenant'), '@', 1);

    INSERT INTO public.tenants (name, slug, primary_color)
    VALUES (
      COALESCE(v_nome, v_email_local, 'Minha Empresa'),
      v_email_local || '-' || substring(NEW.id::text, 1, 8),
      '#0B57D0'
    )
    RETURNING id INTO v_new_tenant;

    INSERT INTO public.users (id, nome, email, perfil)
    VALUES (NEW.id, v_nome, NEW.email, 'admin')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (user_id, tenant_id, full_name)
    VALUES (NEW.id, v_new_tenant, v_nome)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
  END IF;

  -- ── Fluxo legacy (dual-write inalterado) ──────────────────────
  INSERT INTO public.users (id, nome, email, perfil)
  VALUES (NEW.id, v_nome, NEW.email, v_perfil)
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

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id) DO NOTHING;

  IF v_position_id IS NOT NULL THEN
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
      INSERT INTO public.employee_positions (employee_id, position_id, is_primary)
      VALUES (v_employee_id, v_position_id, true)
      ON CONFLICT (employee_id, position_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
