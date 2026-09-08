-- =====================================================================
-- Fase 3 — Dual-write: handle_new_user passa a popular AMBOS os modelos
-- (users.perfil legado + user_roles/profiles/employees novos).
-- =====================================================================
-- Garante que qualquer signup novo (via Supabase Auth) já cria as linhas
-- nos dois modelos. Front continua lendo users.perfil normalmente.
--
-- Mapeamento idêntico ao backfill (Fase 2).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfil TEXT;
  v_nome   TEXT;
  v_role   public.app_role;
  v_position_id UUID;
  v_employee_id UUID;
  v_tenant_id   UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  v_nome   := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email);
  v_perfil := COALESCE(NEW.raw_user_meta_data->>'perfil', 'cliente');

  -- ── modelo legado (users.perfil) ──────────────────────────────
  INSERT INTO public.users (id, nome, email, perfil)
  VALUES (NEW.id, v_nome, NEW.email, v_perfil)
  ON CONFLICT (id) DO NOTHING;

  -- ── modelo novo: profile ──────────────────────────────────────
  INSERT INTO public.profiles (user_id, tenant_id, full_name)
  VALUES (NEW.id, v_tenant_id, v_nome)
  ON CONFLICT (user_id) DO NOTHING;

  -- ── modelo novo: resolver role + position ─────────────────────
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

  -- ── modelo novo: user_roles ───────────────────────────────────
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id) DO NOTHING;

  -- ── modelo novo: employees + employee_positions ───────────────
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

-- Trigger já existe (criado em 20260310180128). Função foi REPLACE'd acima.


-- ── View de compatibilidade: users_legacy ───────────────────────
-- Reproduz o shape da tabela users a partir do modelo novo.
-- Útil pra: 1) validar que migração ficou correta, 2) eventual rollback,
-- 3) consultas que precisam do "perfil derivado" no futuro.
CREATE OR REPLACE VIEW public.users_legacy AS
SELECT
  u.id,
  u.nome,
  u.email,
  CASE
    WHEN ur.role = 'admin' THEN 'admin'
    WHEN ur.role = 'manager' AND p.title ILIKE '%cobranca%' THEN 'admin_cobranca'
    WHEN ur.role = 'manager' THEN 'gerente'
    WHEN p.title = 'Estrategista'        THEN 'estrategista'
    WHEN p.title = 'Atendente'           THEN 'atendimento'
    WHEN p.title = 'Agente de Chat'      THEN 'agente_chat'
    WHEN p.title = 'Agente de Cobrança'  THEN 'agente_cobranca'
    ELSE 'cliente'
  END AS perfil_derivado,
  u.perfil AS perfil_legado,
  u.ativo,
  u.criado_em
FROM public.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
LEFT JOIN public.employees e   ON e.user_id  = u.id
LEFT JOIN public.positions p   ON p.id       = e.position_id;
