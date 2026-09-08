-- =====================================================================
-- Fase 1 — Estrutura organizacional (espelho empire-manager)
-- =====================================================================
-- Cria a base pra separar RBAC (user_roles) de cargo funcional
-- (areas/subareas/positions/employees). Schema 1:1 com empire-manager
-- pra permitir fusão futura via tenant_id compartilhado.
--
-- Esta migration é ADITIVA: não toca em users.perfil nem em policies
-- existentes. O backfill e a migração das policies vêm em migrations
-- subsequentes.
-- =====================================================================

-- ── ENUMs ──────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.employee_status AS ENUM ('active', 'inactive', 'on_leave');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── TRIGGER GENÉRICO updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ── tenants ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#7C3AED',
  secondary_color TEXT,
  favicon_url TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── profiles ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON public.profiles(tenant_id);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── user_roles (RBAC) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);


-- ── company_areas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('acquisition', 'delivery', 'operation')),
  position TEXT NOT NULL CHECK (position IN ('left', 'right', 'bottom')),
  color TEXT DEFAULT '#7C3AED',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, type)
);

CREATE INDEX IF NOT EXISTS idx_company_areas_tenant ON public.company_areas(tenant_id);

DROP TRIGGER IF EXISTS trg_company_areas_updated_at ON public.company_areas;
CREATE TRIGGER trg_company_areas_updated_at
  BEFORE UPDATE ON public.company_areas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── subareas ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subareas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  area_id UUID NOT NULL REFERENCES public.company_areas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subareas_area ON public.subareas(area_id);
CREATE INDEX IF NOT EXISTS idx_subareas_tenant ON public.subareas(tenant_id);

DROP TRIGGER IF EXISTS trg_subareas_updated_at ON public.subareas;
CREATE TRIGGER trg_subareas_updated_at
  BEFORE UPDATE ON public.subareas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── positions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  subarea_id UUID REFERENCES public.subareas(id) ON DELETE CASCADE,
  area_id UUID REFERENCES public.company_areas(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  responsibilities TEXT[],
  goals TEXT[],
  level INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  reports_to_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT positions_no_self_reference CHECK (reports_to_id IS NULL OR reports_to_id <> id),
  CONSTRAINT positions_area_or_subarea CHECK (area_id IS NOT NULL OR subarea_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_positions_subarea ON public.positions(subarea_id);
CREATE INDEX IF NOT EXISTS idx_positions_area ON public.positions(area_id);
CREATE INDEX IF NOT EXISTS idx_positions_reports_to ON public.positions(reports_to_id);
CREATE INDEX IF NOT EXISTS idx_positions_tenant ON public.positions(tenant_id);

DROP TRIGGER IF EXISTS trg_positions_updated_at ON public.positions;
CREATE TRIGGER trg_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── trigger anti-ciclo de hierarquia (positions.reports_to_id) ─────
CREATE OR REPLACE FUNCTION public.check_position_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  visited_ids UUID[];
  current_id  UUID;
BEGIN
  IF NEW.reports_to_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reports_to_id = NEW.id THEN
    RAISE EXCEPTION 'Um cargo não pode reportar para si mesmo';
  END IF;

  visited_ids := ARRAY[NEW.id];
  current_id  := NEW.reports_to_id;

  WHILE current_id IS NOT NULL LOOP
    IF current_id = ANY(visited_ids) THEN
      RAISE EXCEPTION 'Ciclo detectado na hierarquia de cargos';
    END IF;
    visited_ids := array_append(visited_ids, current_id);
    SELECT reports_to_id INTO current_id FROM public.positions WHERE id = current_id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_position_cycle ON public.positions;
CREATE TRIGGER trg_check_position_cycle
  BEFORE INSERT OR UPDATE OF reports_to_id ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.check_position_cycle();


-- ── employees ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  user_id UUID REFERENCES auth.users(id),
  position_id UUID REFERENCES public.positions(id),
  manager_id UUID REFERENCES public.employees(id),
  status public.employee_status DEFAULT 'active',
  admission_date DATE,
  phone TEXT,
  work_email TEXT,
  is_ceo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_tenant ON public.employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_user ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_position ON public.employees(position_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON public.employees(manager_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees(status);

DROP TRIGGER IF EXISTS trg_employees_updated_at ON public.employees;
CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.check_employee_self_management()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.manager_id = NEW.id THEN
    RAISE EXCEPTION 'Um funcionário não pode ser seu próprio gestor';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_self_management ON public.employees;
CREATE TRIGGER trg_employees_self_management
  BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.check_employee_self_management();


-- ── employee_positions (N:N user ↔ cargo) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES public.positions(id),
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (employee_id, position_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_positions_employee ON public.employee_positions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_positions_position ON public.employee_positions(position_id);


-- ── HELPERS RLS (SECURITY DEFINER) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'manager')
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.is_manager()
$$;


-- ── RLS habilitado (policies serão adicionadas em migrations futuras) ──
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_positions ENABLE ROW LEVEL SECURITY;

-- Policies mínimas pra desbloquear leitura durante a fase de transição.
-- Front da Fase 5 vai ler essas tabelas; sem policy, RLS bloqueia tudo.
-- Mantemos escrita restrita a admins (via is_admin()).

-- tenants: todo authenticated lê (organograma é público interno)
CREATE POLICY "tenants_read_all" ON public.tenants
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tenants_admin_all" ON public.tenants
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- profiles: cada um lê o seu + admin vê todos; admin escreve
CREATE POLICY "profiles_read_own" ON public.profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "profiles_admin_read_all" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "profiles_admin_write" ON public.profiles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- user_roles: cada um lê o seu + admin vê todos; só admin escreve
CREATE POLICY "user_roles_read_own" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_roles_admin_read_all" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "user_roles_admin_write" ON public.user_roles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- company_areas / subareas / positions: leitura ampla (organograma), escrita admin
CREATE POLICY "company_areas_read_all" ON public.company_areas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_areas_admin_write" ON public.company_areas
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "subareas_read_all" ON public.subareas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "subareas_admin_write" ON public.subareas
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "positions_read_all" ON public.positions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "positions_admin_write" ON public.positions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- employees / employee_positions: leitura ampla (organograma interno),
-- escrita admin ou manager
CREATE POLICY "employees_read_all" ON public.employees
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "employees_admin_manager_write" ON public.employees
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "employee_positions_read_all" ON public.employee_positions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "employee_positions_admin_manager_write" ON public.employee_positions
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());
