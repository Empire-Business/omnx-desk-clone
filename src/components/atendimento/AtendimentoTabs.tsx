import { NavLink } from 'react-router-dom'
import { LayoutDashboard, List, Columns3, Settings2, Sparkles } from 'lucide-react'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsAppEnabled } from '@/hooks/useAppModules'
import { useSegmentoAtendimento } from '@/hooks/useAtendimento'
import type { ChaveAba } from '@/lib/atendimentoSegmentos'
import { cn } from '@/lib/utils'

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

  const disponiveis: Record<ChaveAba, { to: string; label: string; icon: typeof List; end: boolean }> = {
    // O painel é a tela inicial do sistema, então mora em "/" e não em
    // /atendimento — ver a rota raiz em App.tsx.
    painel: { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
    demandas: {
      to: '/atendimento/demandas',
      // "Demandas" numa clínica seria "Atendimentos" — o rótulo vem do segmento.
      label: segmento.rotuloItens.charAt(0).toUpperCase() + segmento.rotuloItens.slice(1),
      icon: List,
      end: false,
    },
    kanban: { to: '/atendimento/kanban', label: 'Kanban', icon: Columns3, end: false },
    // Leitura das conversas pela IA: como o cliente está se sentindo, o que
    // pediu e o que ficou pendente. Mora aqui porque é insumo de atendimento —
    // até então só existia numa aba do dashboard legado, que saiu do menu.
    sentimento: { to: '/atendimento/sentimento', label: 'Sentimental', icon: Sparkles, end: false },
    config: { to: '/atendimento/config', label: 'Configuração', icon: Settings2, end: false },
  }

  const tabs = segmento.abas
    .filter((aba) => aba !== 'config' || can('atendimento', 'admin'))
    // A análise lê as conversas do Chat: sem o app ligado (ou sem permissão
    // nele), a aba abriria vazia — melhor não oferecer.
    .filter((aba) => aba !== 'sentimento' || (isAppEnabled('chat') && can('chat', 'ver')))
    .map((aba) => disponiveis[aba])

  return (
    <div className="flex w-fit items-center gap-1 rounded-full bg-muted/50 p-1">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              isActive
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )
          }
        >
          <t.icon className="h-3.5 w-3.5" />
          {t.label}
        </NavLink>
      ))}
    </div>
  )
}
