-- ============================================================================
-- Catálogo de apps reorganizado — a Loja de Apps passa a ter 3 apps
-- ============================================================================
-- Decisão do usuário (04/08/2026): a tela /apps estava listando 5 apps, sendo
-- que dois deles nunca foram usados e um deles é a própria tela inicial do
-- sistema. O catálogo passa a refletir o que de fato se liga e desliga:
--
--   app        → aparece na Loja de Apps, o admin liga/desliga
--                chat, contratos, atendimento (novo)
--   nucleo     → não aparece na Loja; está sempre ligado porque é a base do
--                sistema. Desligar o Dashboard deixaria o usuário sem tela
--                inicial, então ele deixa de ser opcional.
--   arquivado  → sai da Loja e nasce DESLIGADO (menu + rota bloqueados), mas
--                a linha continua no banco e a tela /apps mostra numa seção
--                separada para religar. Nada é apagado — desligar nunca deleta.
--                cobranca, portal
--
-- Por que Portal e Cobrança foram arquivados: verificado no banco em 04/08/2026
-- que os únicos 2 usuários com perfil 'cliente' (quem entraria no Portal) são
-- contas de teste do projeto OMNX-Comissões — uma delas nunca logou. Não há
-- cliente final usando a área externa hoje.
--
-- O app 'atendimento' (Atendimento para Social Media) entra LIGADO, seguindo o
-- padrão fail-open do projeto: app só some quando um admin desliga de propósito.
-- Isso é uma divergência consciente do brief original (§7 pedia tudo desligado)
-- e já está registrada no roadmap da modularização.
--
-- Idempotente. Reversível: religar cobranca/portal pela própria tela /apps.
-- ============================================================================

BEGIN;

-- 1) Recategoriza os apps existentes -----------------------------------------

-- Dashboard: base do sistema, deixa de ser opcional.
UPDATE public.app_modules
   SET categoria = 'nucleo',
       enabled   = true,
       descricao = 'Visão geral e métricas. Faz parte do núcleo — não pode ser desligado.',
       updated_at = now()
 WHERE slug = 'dashboard';

-- Cobrança e Portal: arquivados (fora da Loja, desligados, dados preservados).
UPDATE public.app_modules
   SET categoria  = 'arquivado',
       enabled    = false,
       updated_at = now()
 WHERE slug IN ('cobranca', 'portal');

-- 2) Novo app: Atendimento para Social Media ---------------------------------
INSERT INTO public.app_modules (tenant_id, slug, nome, descricao, icone, categoria, enabled, ordem)
SELECT t.id,
       'atendimento',
       'Atendimento',
       'Demandas do cliente e painel operacional. Primeira versão voltada a Social Media.',
       'Headphones',
       'app',
       true,
       25
  FROM public.tenants t
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- 3) Seed de tenants novos reflete o mesmo catálogo ---------------------------
CREATE OR REPLACE FUNCTION public.seed_app_modules_for_tenant(p_tenant UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.app_modules (tenant_id, slug, nome, descricao, icone, categoria, enabled, ordem)
  VALUES
    -- Núcleo: sempre ligado, fora da Loja de Apps.
    (p_tenant, 'dashboard',   'Dashboard',   'Visão geral e métricas. Faz parte do núcleo — não pode ser desligado.', 'LayoutDashboard', 'nucleo',    true,  10),
    -- Apps da Loja.
    (p_tenant, 'chat',        'OMNXChat',    'Central de conversas do WhatsApp.',                                     'MessageSquare',   'app',       true,  20),
    (p_tenant, 'atendimento', 'Atendimento', 'Demandas do cliente e painel operacional. Primeira versão voltada a Social Media.', 'Headphones', 'app',    true,  25),
    (p_tenant, 'contratos',   'Contratos',   'Gestão de contratos, kanban e recebíveis.',                             'FileText',        'app',       true,  30),
    -- Arquivados: nascem desligados, fora da Loja, religáveis pela tela /apps.
    (p_tenant, 'cobranca',    'Cobrança',    'Régua de cobrança e recuperação de débitos.',                           'Banknote',        'arquivado', false, 40),
    (p_tenant, 'portal',      'Portal do Cliente', 'Área externa onde o cliente final acompanha entregas.',           'ExternalLink',    'arquivado', false, 50)
  ON CONFLICT (tenant_id, slug) DO NOTHING;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
