-- ============================================================================
-- Modularização: catálogo de "apps" ligáveis — POR TENANT (multi-tenant)
-- ============================================================================
-- Substitui a versão global anterior (app_modules sem tenant_id), agora que a
-- plataforma é multi-tenant (FASE A/B: tenant_id + RLS tenant_isolation em todas
-- as tabelas de negócio).
--
-- Cada TENANT tem seu próprio conjunto de apps ligados/desligados. Desligar o
-- Chat de um cliente NÃO afeta os demais.
--
-- Segue o MESMO padrão das outras tabelas de negócio:
--   - coluna tenant_id NOT NULL (FK -> tenants)
--   - trigger public.tg_set_tenant_id() carimba tenant_id no INSERT
--   - RLS tenant_isolation (tenant_id = get_user_tenant_id())
--   - escrita (ligar/desligar) restrita a admin do próprio tenant
--
-- Reversível: DROP TABLE public.app_modules CASCADE.
-- Idempotente: DROP IF EXISTS + CREATE + ON CONFLICT DO NOTHING.
-- ============================================================================

BEGIN;

-- Remove a versão global anterior (só tinha 3 linhas de seed, sem dado real).
DROP TABLE IF EXISTS public.app_modules CASCADE;

CREATE TABLE public.app_modules (
  tenant_id   UUID    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug        TEXT    NOT NULL,                 -- identificador estável do app (ex: 'chat')
  nome        TEXT    NOT NULL,                 -- nome exibido (ex: 'OMNXChat')
  descricao   TEXT,                             -- explicação curta para a tela de Apps
  icone       TEXT,                             -- nome do ícone lucide (ex: 'MessageSquare')
  categoria   TEXT    NOT NULL DEFAULT 'app',   -- 'nucleo' | 'app'
  enabled     BOOLEAN NOT NULL DEFAULT true,    -- ligado para ESTE tenant?
  ordem       INT     NOT NULL DEFAULT 0,       -- ordem de exibição
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  PRIMARY KEY (tenant_id, slug)
);

COMMENT ON TABLE public.app_modules IS
  'Apps ligáveis POR TENANT (modularização). enabled controla menu + acesso a rota. RLS tenant_isolation.';

CREATE INDEX IF NOT EXISTS idx_app_modules_tenant ON public.app_modules(tenant_id);

-- Carimba tenant_id automaticamente no INSERT (mesma função das demais tabelas).
DROP TRIGGER IF EXISTS set_tenant_id ON public.app_modules;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.app_modules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_tenant_id();

-- RLS ---------------------------------------------------------------------
ALTER TABLE public.app_modules ENABLE ROW LEVEL SECURITY;

-- Isolamento por tenant: cada usuário só enxerga/edita os apps do próprio tenant.
DROP POLICY IF EXISTS tenant_isolation ON public.app_modules;
CREATE POLICY tenant_isolation ON public.app_modules
  FOR SELECT
  TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

-- Escrita (ligar/desligar): só admin, e só no próprio tenant.
DROP POLICY IF EXISTS app_modules_write_admin ON public.app_modules;
CREATE POLICY app_modules_write_admin ON public.app_modules
  FOR ALL
  TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.is_admin())
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND public.is_admin());

-- Seed por tenant ---------------------------------------------------------
-- Função que popula os apps padrão para UM tenant. SECURITY DEFINER para
-- funcionar tanto no backfill quanto no trigger de novos tenants (bypassa RLS).
CREATE OR REPLACE FUNCTION public.seed_app_modules_for_tenant(p_tenant UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.app_modules (tenant_id, slug, nome, descricao, icone, categoria, enabled, ordem)
  VALUES
    (p_tenant, 'dashboard', 'Dashboard', 'Visão geral e métricas do atendimento.',    'LayoutDashboard', 'app', true, 10),
    (p_tenant, 'chat',      'OMNXChat',  'Central de conversas do WhatsApp.',          'MessageSquare',   'app', true, 20),
    (p_tenant, 'contratos', 'Contratos', 'Gestão de contratos, kanban e recebíveis.',  'FileText',        'app', true, 30)
  ON CONFLICT (tenant_id, slug) DO NOTHING;
$$;

-- Novo tenant nasce com os apps padrão (todos ligados).
CREATE OR REPLACE FUNCTION public.tg_seed_app_modules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_app_modules_for_tenant(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_apps_on_tenant_insert ON public.tenants;
CREATE TRIGGER seed_apps_on_tenant_insert
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_app_modules();

-- Backfill: semeia os apps para todos os tenants já existentes.
SELECT public.seed_app_modules_for_tenant(t.id) FROM public.tenants t;

COMMIT;
