import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { instalarObservabilidade, registrarEvento } from '@/lib/observabilidade'
import { mensagemErro } from '@/lib/mensagemErro'
import { AuthProvider } from '@/contexts/AuthContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useInboxUnreadConversationCount } from '@/hooks/useChat'
import { useTenantBranding } from '@/hooks/useTenantBranding'
import { BRAND } from '@/config/brand'
import { resolvePageTitle } from '@/lib/page-title'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { TravaDeLicenca } from '@/components/licenca/AvisoLicenca'
import { RequireApp } from '@/components/auth/RequireApp'
import { ExigeAcesso } from '@/components/auth/ExigeAcesso'
import { RedirecionamentoAntigo } from '@/components/navegacao/RedirecionamentoAntigo'
import { CAMINHOS_ANTIGOS } from '@/config/rotasAntigas'
import { TRAVAS_DE_PAGINA } from '@/config/navegacao'
import { AppLayout } from '@/components/layout/AppLayout'
import { ChatLayout } from '@/components/layout/ChatLayout'
import { CobrancaLayout } from '@/components/layout/CobrancaLayout'
import { PortalLayout } from '@/components/layout/PortalLayout'

import { LoginPage } from '@/pages/LoginPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import MeetRoom from '@/pages/MeetRoom'
import { NovaVendaPublicaPage } from '@/pages/vendas/NovaVendaPublicaPage'
import { VendasPendentesPage } from '@/pages/vendas/VendasPendentesPage'
import ReunioesPage from '@/pages/ReunioesPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ClientesListPage } from '@/pages/clientes/ClientesListPage'
import { ClienteDetailPage } from '@/pages/clientes/ClienteDetailPage'
import { ProdutosPage } from '@/pages/produtos/ProdutosPage'
import { ProdutoDetailPage } from '@/pages/produtos/ProdutoDetailPage'
import { NotificacoesPage } from '@/pages/notificacoes/NotificacoesPage'
import { ConfiguracoesPage } from '@/pages/ConfiguracoesPage'
import { AdminPage } from '@/pages/AdminPage'
import { AppsPage } from '@/pages/AppsPage'
import { ReportesPage } from '@/pages/ReportesPage'
import { MeusReportesPage } from '@/pages/MeusReportesPage'
import { SegurancaPage } from '@/pages/SegurancaPage'
import RelatoriosPage from '@/pages/RelatoriosPage'
import AulasEquipePage from '@/pages/aulas/AulasEquipePage'
import AulaTrilhaPage from '@/pages/aulas/AulaTrilhaPage'
import PesquisasNpsPage from '@/pages/pesquisas/PesquisasNpsPage'
import PesquisaNpsPage from '@/pages/pesquisas/PesquisaNpsPage'
import { ApiWebhooksPage } from '@/pages/ApiWebhooksPage'
import { AuditoriaPage } from '@/pages/AuditoriaPage'
import { SaudePage } from '@/pages/SaudePage'
import DepartamentosPage from '@/pages/departamentos/DepartamentosPage'
import DepartamentoDetailPage from '@/pages/departamentos/DepartamentoDetailPage'
import MinhaEquipePage from '@/pages/departamentos/MinhaEquipePage'
import { ColaboradoresPage } from '@/pages/colaboradores/ColaboradoresPage'
import { EmpresasPage } from '@/pages/empresas/EmpresasPage'
import { AjustesPage } from '@/pages/AjustesPage'
import { NaoEncontradaPage } from '@/pages/NaoEncontradaPage'
import { GruposClientesPage } from '@/pages/clientes/GruposClientesPage'

import ChatInboxPage from '@/pages/chat/ChatInboxPage'
import ChatDepartamentosPage from '@/pages/chat/ChatDepartamentosPage'
import ChatKanbanPage from '@/pages/chat/ChatKanbanPage'
import ChatContatosPage from '@/pages/chat/ChatContatosPage'
import ChatAnotacoesPage from '@/pages/chat/ChatAnotacoesPage'
import ChatConfigPage from '@/pages/chat/ChatConfigPage'
import { CobrancaDashboardPage } from '@/pages/cobranca/CobrancaDashboardPage'
import { DevedoresPage } from '@/pages/cobranca/DevedoresPage'
import { ReguasPage } from '@/pages/cobranca/ReguasPage'
import { CobrancaInstanciasPage } from '@/pages/cobranca/CobrancaInstanciasPage'
import { HistoricoPage } from '@/pages/cobranca/HistoricoPage'
import { CobrancaConversasPage } from '@/pages/cobranca/CobrancaConversasPage'

import { ContratosPage } from '@/pages/contratos/ContratosPage'
import { ContratoDetailPage } from '@/pages/contratos/ContratoDetailPage'
import { ContratosKanbanPage } from '@/pages/contratos/ContratosKanbanPage'
import { HomePage } from '@/pages/HomePage'
import { DemandasPage } from '@/pages/atendimento/DemandasPage'
import { DemandasKanbanPage } from '@/pages/atendimento/DemandasKanbanPage'
import { PrazosPage } from '@/pages/atendimento/PrazosPage'
import { DemandaDetailPage } from '@/pages/atendimento/DemandaDetailPage'
import { AutomacoesWaConfigPage } from '@/pages/automacoes-wa/AutomacoesWaConfigPage'
import { AtendimentoConfigPage } from '@/pages/atendimento/AtendimentoConfigPage'
import { AtendimentoSentimentoPage } from '@/pages/atendimento/AtendimentoSentimentoPage'
import { ContratosDashboardPage } from '@/pages/contratos/ContratosDashboardPage'
import { DisparoPage } from '@/pages/disparo/DisparoPage'
import { ProdutosCatalogoPage } from '@/pages/contratos/ProdutosCatalogoPage'
import { TagsAdminPage } from '@/pages/contratos/TagsAdminPage'
import { FluxoFuturoPage } from '@/pages/contratos/FluxoFuturoPage'

import { PortalDashboardPage } from '@/pages/portal/PortalDashboardPage'
import { PortalEntregasPage } from '@/pages/portal/PortalEntregasPage'
import { PortalEntregaDetailPage } from '@/pages/portal/PortalEntregaDetailPage'
import { PortalKanbanPage } from '@/pages/portal/PortalKanbanPage'
import { PortalCalendarioPage } from '@/pages/portal/PortalCalendarioPage'
import { PortalNpsPage } from '@/pages/portal/PortalNpsPage'
import { PortalTrilhasPage } from '@/pages/portal/PortalTrilhasPage'
import { PortalTrilhaDetailPage } from '@/pages/portal/PortalTrilhaDetailPage'

// Captura global de erros (§19 — observabilidade). Instalada no módulo, antes
// de qualquer render: erro de boot é o que mais some sem deixar rastro.
instalarObservabilidade()

const queryClient = new QueryClient({
  // Toda falha de leitura/escrita de dado vira um evento por app. É a diferença
  // entre "o Chat parece lento hoje" e "o Chat teve 40 falhas de query às 14h".
  // Só depois do retry: uma falha que se resolve sozinha não é incidente.
  queryCache: new QueryCache({
    onError: (erro, query) => {
      registrarEvento({
        evento: 'query_falhou',
        mensagem: mensagemErro(erro),
        detalhe: { chave: String(query.queryKey?.[0] ?? '') },
      })
    },
  }),
  mutationCache: new MutationCache({
    onError: (erro, _vars, _ctx, mutation) => {
      registrarEvento({
        evento: 'mutacao_falhou',
        mensagem: mensagemErro(erro),
        detalhe: { chave: String(mutation.options.mutationKey?.[0] ?? '') },
      })
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

function TitleUpdater() {
  const totalUnread = useInboxUnreadConversationCount()
  const { pathname } = useLocation()
  // Mantém o hook montado pelos side-effects de branding (favicon + cor da marca).
  useTenantBranding()

  useEffect(() => {
    const prefix = totalUnread > 10 ? '(10+) ' : totalUnread > 0 ? `(${totalUnread}) ` : ''
    const route = resolvePageTitle(pathname)
    // Aba no formato "<rota> | <nome do app>" (BRAND.appName, não o nome do tenant).
    document.title = `${prefix}${route ? `${route} | ` : ''}${BRAND.appName}`
  }, [totalUnread, pathname])

  return null
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
          <TitleUpdater />
          {/* Licença HTAI: em modo off (sem configuração) não muda nada. */}
          <TravaDeLicenca>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/trocar-senha" element={<ResetPasswordPage obrigatoria />} />
            <Route path="/meet/:roomId" element={<MeetRoom />} />
            <Route path="/vendas/nova" element={<NovaVendaPublicaPage />} />

            {/* Endereços antigos → novos (PERMANENTE; ver config/rotasAntigas.ts).
                Ficam fora do login de propósito: traduzem primeiro, e a rota
                nova é que pede login e confere o app/permissão. Preservam
                ?busca e #âncora (links já enviados no WhatsApp, push do
                celular, notificações gravadas no banco). */}
            {CAMINHOS_ANTIGOS.map((caminho) => (
              <Route key={caminho} path={caminho} element={<RedirecionamentoAntigo />} />
            ))}

            {/* Main app — AppLayout */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                {/* Tela inicial = Atendimento (decisão do usuário, 04/08/2026).
                    Sem RequireApp de propósito: se a home dependesse do app
                    estar ligado, quem desligasse o Atendimento entraria no
                    sistema e cairia numa tela de bloqueio. HomePage decide e
                    cai no Dashboard legado quando o app não está disponível. */}
                <Route path="/" element={<HomePage />} />
                {/* Dashboard antigo: mantido como legado, fora do menu. Não é
                    apagado porque concentra métricas de contratos, entregas e
                    Instagram que ainda não têm outro lugar. */}
                <Route path="/dashboard-legado" element={<DashboardPage />} />
                <Route path="/clientes" element={<ClientesListPage />} />
                <Route path="/clientes/:id" element={<ClienteDetailPage />} />
                {/* Hub de ajustes (cartões filtrados por permissão). */}
                <Route path="/ajustes" element={<AjustesPage />} />
                <Route path="/produtos" element={<ProdutosPage />} />
                <Route path="/produtos/:id" element={<ProdutoDetailPage />} />
                <Route path="/notificacoes" element={<NotificacoesPage />} />
                {/* Trava na própria rota (R8): antes só havia a RLS. */}
                <Route path="/relatorios" element={<ExigeAcesso regra={TRAVAS_DE_PAGINA.relatorios}><RelatoriosPage /></ExigeAcesso>} />
                <Route path="/relatorios/pesquisas" element={<ExigeAcesso regra={TRAVAS_DE_PAGINA.pesquisas}><PesquisasNpsPage /></ExigeAcesso>} />
                <Route path="/relatorios/pesquisas/:id" element={<ExigeAcesso regra={TRAVAS_DE_PAGINA.pesquisas}><PesquisaNpsPage /></ExigeAcesso>} />
                <Route path="/aulas" element={<ExigeAcesso regra={TRAVAS_DE_PAGINA.aulas}><AulasEquipePage /></ExigeAcesso>} />
                <Route path="/aulas/:id" element={<ExigeAcesso regra={TRAVAS_DE_PAGINA.aulas}><AulaTrilhaPage /></ExigeAcesso>} />
                <Route path="/configuracoes" element={<ConfiguracoesPage />} />
                <Route path="/admin" element={<ExigeAcesso regra={TRAVAS_DE_PAGINA.admin}><AdminPage /></ExigeAcesso>} />
                <Route path="/empresas" element={<EmpresasPage />} />
                <Route path="/apps" element={<AppsPage />} />
                <Route path="/reportes" element={<ReportesPage />} />
                {/* Acompanhamento do próprio reporte — qualquer usuário logado */}
                <Route path="/meus-reportes" element={<MeusReportesPage />} />
                <Route path="/seguranca" element={<SegurancaPage />} />
                <Route path="/api-webhooks" element={<ExigeAcesso regra={TRAVAS_DE_PAGINA.apiWebhooks}><ApiWebhooksPage /></ExigeAcesso>} />
                <Route path="/auditoria" element={<ExigeAcesso regra={TRAVAS_DE_PAGINA.auditoria}><AuditoriaPage /></ExigeAcesso>} />
                <Route path="/saude" element={<SaudePage />} />
                <Route path="/departamentos" element={<DepartamentosPage />} />
                <Route path="/departamentos/:id" element={<DepartamentoDetailPage />} />
                <Route path="/minha-equipe" element={<MinhaEquipePage />} />
                <Route path="/colaboradores" element={<ColaboradoresPage />} />
                {/* Disparo — rota NÃO listada no menu, por decisão do Bruno (28/07/2026).
                    Chega-se digitando /disparo. Não estar no menu esconde, mas não protege:
                    a trava real é o gate de admin dentro da própria página. */}
                <Route path="/disparo" element={<DisparoPage />} />
                {/* Tickets (antes /atendimento/*). Mesmo app e mesmas páginas;
                    só o endereço mudou. O painel continua em "/". */}
                <Route element={<RequireApp slug="atendimento" />}>
                  <Route path="/tickets" element={<DemandasPage />} />
                  <Route path="/tickets/quadro" element={<DemandasKanbanPage />} />
                  <Route path="/tickets/prazos" element={<PrazosPage />} />
                  <Route path="/tickets/analise" element={<AtendimentoSentimentoPage />} />
                  <Route path="/tickets/configurar" element={<AtendimentoConfigPage />} />
                  <Route path="/tickets/:id" element={<DemandaDetailPage />} />
                </Route>
                {/* Íris (antes /automacoes-wa/*) e Grupos e clientes (antes a aba
                    Vínculos): mesmo app, mesma trava de admin na página. */}
                <Route element={<RequireApp slug="automacoes-wa" />}>
                  <Route path="/ia" element={<AutomacoesWaConfigPage />} />
                  <Route path="/ia/:aba" element={<AutomacoesWaConfigPage />} />
                  <Route path="/clientes/grupos" element={<GruposClientesPage />} />
                </Route>
                <Route element={<RequireApp slug="contratos" />}>
                  <Route path="/contratos" element={<ContratosDashboardPage />} />
                  <Route path="/contratos/lista" element={<ContratosPage />} />
                  <Route path="/contratos/kanban" element={<ContratosKanbanPage />} />
                  <Route path="/contratos/onboarding" element={<VendasPendentesPage />} />
                  <Route path="/contratos/produtos" element={<ProdutosCatalogoPage />} />
                  <Route path="/contratos/tags" element={<TagsAdminPage />} />
                  <Route path="/contratos/recebiveis" element={<FluxoFuturoPage />} />
                  <Route path="/contratos/:id" element={<ContratoDetailPage />} />
                </Route>
                {/* Qualquer outro endereço: página amigável com atalhos (R5). */}
                <Route path="*" element={<NaoEncontradaPage />} />
              </Route>
            </Route>

            {/* Conversas (antes /chat) — ChatLayout, altura total.
                Som e tempo real de mensagens ficam restritos a este grupo (R6). */}
            <Route element={<ProtectedRoute />}>
              <Route path="/conversas" element={<RequireApp slug="chat"><ChatLayout /></RequireApp>}>
                <Route index element={<ChatInboxPage />} />
                <Route path="quadro" element={<ChatKanbanPage />} />
                <Route path="contatos" element={<ChatContatosPage />} />
                <Route path="anotacoes" element={<ChatAnotacoesPage />} />
                {/* Configuração do WhatsApp (abas na URL: ?aba=instancias|acessos|aquecimento) */}
                <Route path="configurar" element={<ChatConfigPage />} />
                <Route path="filas" element={<ChatDepartamentosPage />} />
                <Route path="reunioes" element={<ReunioesPage />} />
              </Route>
            </Route>

            {/* EmpireCobrança — CobrancaLayout */}
            <Route element={<ProtectedRoute />}>
              <Route path="/cobranca" element={<RequireApp slug="cobranca"><CobrancaLayout /></RequireApp>}>
                <Route index element={<CobrancaDashboardPage />} />
                <Route path="devedores" element={<DevedoresPage />} />
                <Route path="reguas" element={<ReguasPage />} />
                <Route path="instancias" element={<CobrancaInstanciasPage />} />
                <Route path="conversas" element={<CobrancaConversasPage />} />
                <Route path="historico" element={<HistoricoPage />} />
              </Route>
            </Route>

            {/* Portal do Cliente — PortalLayout */}
            <Route element={<ProtectedRoute />}>
              <Route path="/portal" element={<RequireApp slug="portal"><PortalLayout /></RequireApp>}>
                <Route index element={<PortalDashboardPage />} />
                <Route path="entregas" element={<PortalEntregasPage />} />
                <Route path="entregas/:id" element={<PortalEntregaDetailPage />} />
                <Route path="kanban" element={<PortalKanbanPage />} />
                <Route path="calendario" element={<PortalCalendarioPage />} />
                <Route path="nps/:surveyId" element={<PortalNpsPage />} />
                <Route path="trilhas" element={<PortalTrilhasPage />} />
                <Route path="trilhas/:id" element={<PortalTrilhaDetailPage />} />
              </Route>
            </Route>
          </Routes>
          </TravaDeLicenca>
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
