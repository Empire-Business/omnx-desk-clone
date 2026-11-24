import { useLocation } from 'react-router-dom'
import { CalendarClock, LayoutDashboard, List, Columns3, Settings2, Sparkles } from 'lucide-react'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsAppEnabled } from '@/hooks/useAppModules'
import { useSegmentoAtendimento } from '@/hooks/useAtendimento'
import type { ChaveAba } from '@/lib/atendimentoSegmentos'
import { AbasRolaveis } from '@/components/ui/AbasRolaveis'

/**
 * Navegação do app Atendimento.
 *
 * As abas vêm do **segmento da empresa**: uma clínica não precisa de kanban
 * (fluxo curto, a lista dá conta), e aba a mais é aba que ninguém abre. A ordem
 * segue o uso real — o painel responde "o que está pegando fogo?", a lista é
 * onde se busca algo específico e o kanban é onde o trabalho anda.
 */
export function AtendimentoTabs() {
  const { can } = usePermissoes()
  const { isAppEnabled } = useIsAppEnabled()
  const { segmento } = useSegmentoAtendimento()
  const { pathname } = useLocation()
  // "Tickets" fica acesa na lista e na ficha de um ticket (/tickets/:id),
  // mas não nas outras abas que também moram embaixo de /tickets.
  const naListaOuFicha = pathname === '/tickets'
    || (/^\/tickets\/[^/]+$/.test(pathname) && !/^\/tickets\/(quadro|prazos|analise|configurar)$/.test(pathname))

  const disponiveis: Record<ChaveAba | 'prazos', { to: string; label: string; icon: typeof List; end: boolean }> = {
    // O painel é a tela inicial do sistema, então mora em "/" e não em
    // /atendimento — ver a rota raiz em App.tsx.
    painel: { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
    // "Ticket" em todo o Atendimento, em qualquer ramo: um nome só para a
    // mesma coisa evita a dúvida "demanda é diferente de pedido?".
    demandas: { to: '/tickets', label: 'Tickets', icon: List, end: false },
    kanban: { to: '/tickets/quadro', label: 'Quadro', icon: Columns3, end: false },
    // Prazos, como no Acompanhamento do OMNX Clients. Vale para todo ramo
    // (todos têm prazo), então entra logo depois da lista e não no catálogo.
    prazos: { to: '/tickets/prazos', label: 'Prazos', icon: CalendarClock, end: false },
    // Leitura das conversas pela IA: como o cliente está se sentindo, o que
    // pediu e o que ficou pendente. Mora aqui porque é insumo de atendimento —
    // até então só existia numa aba do dashboard legado, que saiu do menu.
    sentimento: { to: '/tickets/analise', label: 'Análise das conversas', icon: Sparkles, end: false },
    config: { to: '/tickets/configurar', label: 'Configuração', icon: Settings2, end: false },
  }

  const tabs = segmento.abas
    .filter((aba) => aba !== 'config' || can('atendimento', 'admin'))
    // A análise lê as conversas do Chat: sem o app ligado (ou sem permissão
    // nele), a aba abriria vazia — melhor não oferecer.
    .filter((aba) => aba !== 'sentimento' || (isAppEnabled('chat') && can('chat', 'ver')))
    .flatMap((aba) => (aba === 'demandas' ? [disponiveis.demandas, disponiveis.prazos] : [disponiveis[aba]]))

  return (
    <AbasRolaveis
      rotulo="Áreas de atendimento"
      itens={tabs.map((t) => ({
        id: t.to,
        para: t.to,
        fim: t.end,
        rotulo: t.label,
        icone: t.icon,
        // "Tickets" fica acesa na lista e na ficha, não nas outras abas de /tickets.
        ativo: t.to === '/tickets' ? naListaOuFicha : undefined,
      }))}
    />
  )
}
