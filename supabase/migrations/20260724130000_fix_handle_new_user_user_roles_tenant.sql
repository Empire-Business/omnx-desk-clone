-- ============================================================================
-- Fix: handle_new_user carimba user_roles.tenant_id EXPLICITAMENTE
-- ============================================================================
-- BUG (achado no teste E2E de provisionamento): handle_new_user insere em
-- user_roles(user_id, role) SEM tenant_id, confiando no trigger de carimbo
-- (tg_set_tenant_id -> resolve_tenant_default). Mas resolve_tenant_default() só
-- resolve sozinho quando existe EXATAMENTE 1 tenant; com >1 tenant e sem sessão
-- (que é o contexto de criação de usuário via GoTrue) ele retorna NULL.
--
-- Com a Fase A.2 (tenant_id NOT NULL em 106 tabelas), esse NULL virou erro rígido
-- (23502) — ou seja: HOJE (1 tenant) funciona, mas assim que a 2ª empresa for
-- provisionada, criar QUALQUER usuário quebraria em user_roles.
--
-- Correção: carimbar user_roles.tenant_id = tenant alvo nos DOIS branches, igual
-- já é feito para public.users e public.profiles. A fonte de verdade é o tenant
-- do metadata (provisionamento) / o tenant recém-criado (clone admin-first) —
-- nunca deixar o carimbo automático adivinhar.
--
-- Idempotente (CREATE OR REPLACE). Não destrutivo.
-- ============================================================================
SET search_path = public, pg_catalog;

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
  v_master      UUID := '00000000-0000-0000-0000-000000000001';
  v_tenant_id   UUID;
  v_has_admin   BOOLEAN;
  v_new_tenant  UUID;
  v_email_local TEXT;
BEGIN
  v_nome   := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email);
  v_perfil := COALESCE(NEW.raw_user_meta_data->>'perfil', 'cliente');
  -- tenant alvo: o passado no metadata (provisionamento / admin criando equipe)
  -- ou o mestre por padrão (fluxo legado da empresa-mãe).
  v_tenant_id := COALESCE(NULLIF(NEW.raw_user_meta_data->>'tenant_id','')::uuid, v_master);

  -- ── Branch admin-first (clone OMNX vazio) ─────────────────────
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO v_has_admin;

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

    -- FIX: tenant_id explícito (era omitido — quebraria sob NOT NULL se o carimbo
    -- automático não resolvesse).
    INSERT INTO public.user_roles (user_id, role, tenant_id)
    VALUES (NEW.id, 'admin', v_new_tenant)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
  END IF;

  -- ── Fluxo legacy/provisionado (dual-write, tenant = v_tenant_id) ──
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

  -- FIX: tenant_id explícito (era omitido — com >1 tenant o carimbo automático
  -- resolve NULL e viola o NOT NULL da Fase A.2).
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (NEW.id, v_role, v_tenant_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- employees/positions só no MESTRE: os position_id acima são cargos do mestre.
  -- Empresas novas montam o próprio organograma depois (não referenciar cargo de
  -- outro tenant).
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
      INSERT INTO public.employee_positions (employee_id, position_id, is_primary)
      VALUES (v_employee_id, v_position_id, true)
      ON CONFLICT (employee_id, position_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
