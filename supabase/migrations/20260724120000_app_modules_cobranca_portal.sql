-- ============================================================================
-- Modularização — Fase 1 (extensão): Cobrança e Portal viram apps ligáveis
-- ============================================================================
-- Até agora o catálogo app_modules (20260723170000) só tinha dashboard, chat e
-- contratos. Cobrança (CobrancaLayout, /cobranca/*) e Portal do Cliente
-- (PortalLayout, /portal/*) também são apps isoláveis (roadmap Fase 1) — aqui
-- entram no catálogo, todos LIGADOS por padrão (fail-open, ninguém perde acesso).
--
-- O guard de rota RequireApp (front) passa a bloquear /cobranca e /portal quando
-- o app estiver desligado para o tenant.
--
-- Reaproveita seed_app_modules_for_tenant: reescreve a função pra incluir os dois
-- novos slugs e faz o backfill nos tenants já existentes (ON CONFLICT DO NOTHING,
-- então não mexe nos apps já presentes).
--
-- Idempotente. Não destrutivo (só INSERT com ON CONFLICT DO NOTHING).
-- ============================================================================
SET search_path = public, pg_catalog;

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
    (p_tenant, 'contratos', 'Contratos', 'Gestão de contratos, kanban e recebíveis.',  'FileText',        'app', true, 30),
    (p_tenant, 'cobranca',  'Cobrança',  'Régua de cobrança e recuperação de débitos.', 'Banknote',        'app', true, 40),
    (p_tenant, 'portal',    'Portal do Cliente', 'Área externa onde o cliente final acompanha entregas.', 'ExternalLink', 'app', true, 50)
  ON CONFLICT (tenant_id, slug) DO NOTHING;
$$;

-- Backfill: garante cobranca/portal nos tenants que já existem.
SELECT public.seed_app_modules_for_tenant(t.id) FROM public.tenants t;

NOTIFY pgrst, 'reload schema';
