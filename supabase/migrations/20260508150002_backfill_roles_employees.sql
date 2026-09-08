-- =====================================================================
-- Fase 2 — Backfill: popular user_roles, profiles, employees a partir
-- da tabela legada `public.users` (coluna perfil).
-- =====================================================================
-- Idempotente: ON CONFLICT DO NOTHING em todos os inserts.
--
-- Mapeamento perfil → (role, position):
--   admin           → admin   + Administrador do Sistema
--   gerente         → manager + Gerente Geral
--   admin_cobranca  → manager + Gerente de Cobrança
--   estrategista    → member  + Estrategista
--   atendimento     → member  + Atendente
--   agente_chat     → member  + Agente de Chat
--   agente_cobranca → member  + Agente de Cobrança
--   cliente         → member  + (sem position — cliente externo)
-- =====================================================================

DO $$
DECLARE
  v_tenant_id       UUID := '00000000-0000-0000-0000-000000000001';
  v_pos_admin       UUID := '00000000-0000-0000-0003-000000000001';
  v_pos_gerente     UUID := '00000000-0000-0000-0003-000000000002';
  v_pos_estrat      UUID := '00000000-0000-0000-0003-000000000003';
  v_pos_atendente   UUID := '00000000-0000-0000-0003-000000000004';
  v_pos_agente_chat UUID := '00000000-0000-0000-0003-000000000005';
  v_pos_agente_cob  UUID := '00000000-0000-0000-0003-000000000006';
  v_pos_gerente_cob UUID := '00000000-0000-0000-0003-000000000007';

  rec RECORD;
  v_employee_id UUID;
  v_position_id UUID;
  v_role public.app_role;
BEGIN
  FOR rec IN
    SELECT u.id AS user_id, u.nome, u.email, u.perfil, u.ativo
    FROM public.users u
  LOOP
    -- ── 1. profile (cada user precisa de um) ───────────────────
    INSERT INTO public.profiles (user_id, tenant_id, full_name)
    VALUES (rec.user_id, v_tenant_id, rec.nome)
    ON CONFLICT (user_id) DO NOTHING;

    -- ── 2. resolver role + position por perfil ────────────────
    v_position_id := NULL;
    CASE rec.perfil
      WHEN 'admin'           THEN v_role := 'admin';   v_position_id := v_pos_admin;
      WHEN 'gerente'         THEN v_role := 'manager'; v_position_id := v_pos_gerente;
      WHEN 'admin_cobranca'  THEN v_role := 'manager'; v_position_id := v_pos_gerente_cob;
      WHEN 'estrategista'    THEN v_role := 'member';  v_position_id := v_pos_estrat;
      WHEN 'atendimento'     THEN v_role := 'member';  v_position_id := v_pos_atendente;
      WHEN 'agente_chat'     THEN v_role := 'member';  v_position_id := v_pos_agente_chat;
      WHEN 'agente_cobranca' THEN v_role := 'member';  v_position_id := v_pos_agente_cob;
      WHEN 'cliente'         THEN v_role := 'member';  v_position_id := NULL;
      ELSE                        v_role := 'member';  v_position_id := NULL;
    END CASE;

    -- ── 3. user_roles ─────────────────────────────────────────
    INSERT INTO public.user_roles (user_id, role)
    VALUES (rec.user_id, v_role)
    ON CONFLICT (user_id) DO NOTHING;

    -- ── 4. employees + employee_positions (só se for colaborador interno) ──
    IF v_position_id IS NOT NULL THEN
      INSERT INTO public.employees (
        tenant_id, user_id, position_id, status, work_email
      )
      VALUES (
        v_tenant_id,
        rec.user_id,
        v_position_id,
        CASE WHEN COALESCE(rec.ativo, true) THEN 'active'::public.employee_status
             ELSE 'inactive'::public.employee_status END,
        rec.email
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_employee_id;

      -- Se já existia, recupera o id pra criar a relação N:N
      IF v_employee_id IS NULL THEN
        SELECT id INTO v_employee_id
        FROM public.employees
        WHERE user_id = rec.user_id AND tenant_id = v_tenant_id
        LIMIT 1;
      END IF;

      IF v_employee_id IS NOT NULL THEN
        INSERT INTO public.employee_positions (employee_id, position_id, is_primary)
        VALUES (v_employee_id, v_position_id, true)
        ON CONFLICT (employee_id, position_id) DO NOTHING;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── Verificação (não falha, só loga via NOTICE) ──────────────────
DO $$
DECLARE
  v_users    INTEGER;
  v_roles    INTEGER;
  v_profiles INTEGER;
  v_emps     INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_users    FROM public.users;
  SELECT COUNT(*) INTO v_roles    FROM public.user_roles;
  SELECT COUNT(*) INTO v_profiles FROM public.profiles;
  SELECT COUNT(*) INTO v_emps     FROM public.employees;

  RAISE NOTICE 'Backfill: users=%, user_roles=%, profiles=%, employees=%',
    v_users, v_roles, v_profiles, v_emps;
END $$;
