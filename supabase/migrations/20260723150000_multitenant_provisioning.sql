-- ============================================================================
-- Multi-tenant — Provisionamento: tenant MESTRE cria empresas novas
-- ============================================================================
-- Modelo escolhido: a empresa atual (tenant 00000000-...-001) é a MESTRE. Um
-- admin do mestre cria empresas novas (novo tenant + 1º admin). Esse admin novo
-- adiciona a própria equipe (usuários nascem no tenant dele). Todos no mesmo
-- login; o RLS (Fase B) garante que cada um só vê o seu.
--
-- Este SQL entrega o lado do banco:
--   1. tenants.is_master + marca o ...001 como mestre.
--   2. is_master_admin() — só admin do mestre enxerga a tela de criar empresa.
--   3. handle_new_user tenant-aware: lê tenant_id de user_metadata (fallback
--      ...001), carimba users.tenant_id explicitamente (senão nasceria NULL com
--      >1 tenant, já que resolve_tenant_default() é NULL sem sessão), e só cria
--      employees/positions no MESTRE (os cargos são do mestre — evita FK cruzada).
--   4. seed_tenant(p_tenant_id) — kit inicial da empresa nova (kanban + deptos).
--
-- A criação do usuário admin em si (auth) é feita pela edge function
-- provision-tenant (precisa de service_role/auth admin API).
--
-- Idempotente. Não destrutivo.
-- ============================================================================
SET search_path = public, pg_catalog;

-- 1. Flag de mestre --------------------------------------------------------
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false;
UPDATE public.tenants SET is_master = true WHERE id = '00000000-0000-0000-0000-000000000001';

-- Garante no máx. 1 mestre.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_unico_mestre
  ON public.tenants ((true)) WHERE is_master;

-- 2. Super-admin = admin do tenant mestre ----------------------------------
CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.tenants t ON t.id = p.tenant_id AND t.is_master
    LEFT JOIN public.users u ON u.id = p.user_id
    LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.user_id = auth.uid()
      AND (u.perfil = 'admin' OR ur.role = 'admin')
  );
$$;

COMMENT ON FUNCTION public.is_master_admin() IS
'True se o usuário logado é admin do tenant mestre. Porteiro do provisionamento de empresas.';

REVOKE ALL ON FUNCTION public.is_master_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_master_admin() TO authenticated, service_role;

-- 3. handle_new_user tenant-aware ------------------------------------------
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

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
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

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
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

-- 4. Seed do tenant novo ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master uuid;
BEGIN
  SELECT id INTO v_master FROM public.tenants WHERE is_master LIMIT 1;
  IF p_tenant_id IS NULL OR p_tenant_id = v_master THEN
    RETURN; -- nunca semear o mestre
  END IF;

  -- Kanban de contratos: copia as colunas do mestre (autossuficientes, sem refs).
  IF NOT EXISTS (SELECT 1 FROM public.contratos_kanban_colunas WHERE tenant_id = p_tenant_id) THEN
    INSERT INTO public.contratos_kanban_colunas (titulo, status_chave, cor, ordem, is_onboarding, tenant_id)
    SELECT titulo, status_chave, cor, ordem, is_onboarding, p_tenant_id
    FROM public.contratos_kanban_colunas
    WHERE tenant_id = v_master;
  END IF;

  -- Departamentos de chat base (instance_id/gerente_id nulos — a empresa conecta
  -- a instância dela e define o gerente depois; NÃO copiar do mestre).
  IF NOT EXISTS (SELECT 1 FROM public.chat_departments WHERE tenant_id = p_tenant_id) THEN
    INSERT INTO public.chat_departments (nome, ativo, tenant_id) VALUES
      ('Suporte', true, p_tenant_id),
      ('Estrategista', true, p_tenant_id);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.seed_tenant(uuid) IS
'Kit inicial de uma empresa nova (kanban de contratos + departamentos de chat base). Chamada pela edge function provision-tenant. Não semeia o mestre.';

REVOKE ALL ON FUNCTION public.seed_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_tenant(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
