-- ============================================================================
-- Atendimento assume a tela inicial; Dashboard vira legado
-- ============================================================================
-- Decisão do usuário (04/08/2026): "atendimento vai ser onde hoje é o dashboard".
-- A rota "/" passa a abrir o painel de Atendimento e o item do menu ocupa a
-- posição — e o ícone — que eram do Dashboard. O motivo de reaproveitar o ícone:
-- quem já usa o sistema procura aquele desenho no topo do menu; trocar o símbolo
-- de lugar custa mais do que ganha.
--
-- O Dashboard **não é apagado**: continua na rota /dashboard-legado, fora do
-- menu, porque concentra métricas de contratos, entregas e Instagram que ainda
-- não têm outro lugar. Some da Loja de Apps (categoria 'nucleo' nunca aparece
-- lá) e do menu, mas nenhum dado nem código foi removido.
--
-- A rede de segurança do front (`src/pages/HomePage.tsx`): se o Atendimento
-- estiver desligado nesta empresa, ou se o perfil não tiver permissão no
-- recurso, a home cai no Dashboard legado. Sem isso, desligar o app deixaria a
-- empresa sem tela inicial.
--
-- Aplicada em produção em 04/08/2026 via Management API.
-- ============================================================================

UPDATE public.app_modules
   SET icone = 'LayoutDashboard',
       descricao = 'Tela inicial: demandas dos clientes e painel operacional, adaptados ao ramo da empresa.',
       ordem = 10,
       updated_at = now()
 WHERE slug = 'atendimento';

UPDATE public.app_modules
   SET descricao = 'Painel antigo (legado). Fora do menu; acessível por /dashboard-legado.',
       ordem = 90,
       updated_at = now()
 WHERE slug = 'dashboard';

CREATE OR REPLACE FUNCTION public.seed_app_modules_for_tenant(p_tenant UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  INSERT INTO public.app_modules (tenant_id, slug, nome, descricao, icone, categoria, enabled, ordem)
  VALUES
    (p_tenant, 'atendimento', 'Atendimento', 'Tela inicial: demandas dos clientes e painel operacional, adaptados ao ramo da empresa.', 'LayoutDashboard', 'app', true, 10),
    (p_tenant, 'chat',        'OMNXChat',    'Central de conversas do WhatsApp.',                          'MessageSquare', 'app',       true,  20),
    (p_tenant, 'contratos',   'Contratos',   'Gestão de contratos, kanban e recebíveis.',                  'FileText',      'app',       true,  30),
    (p_tenant, 'dashboard',   'Dashboard',   'Painel antigo (legado). Fora do menu; acessível por /dashboard-legado.', 'LayoutDashboard', 'nucleo', true, 90),
    (p_tenant, 'cobranca',    'Cobrança',    'Régua de cobrança e recuperação de débitos.',                'Banknote',      'arquivado', false, 40),
    (p_tenant, 'portal',      'Portal do Cliente', 'Área externa onde o cliente final acompanha entregas.', 'ExternalLink', 'arquivado', false, 50)
  ON CONFLICT (tenant_id, slug) DO NOTHING;
$fn$;

NOTIFY pgrst, 'reload schema';
