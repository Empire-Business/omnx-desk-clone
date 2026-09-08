import { useState } from 'react'
import { LayoutDashboard, Users, Sparkles, FileCheck, Sun, Sunset, Moon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardData } from '@/hooks/useDashboardMetrics'
import { cn } from '@/lib/utils'
import { ClientesPage } from '@/pages/clientes/ClientesPage'
import { EntregasCamiPage } from '@/pages/entregas/EntregasCamiPage'
import ChatRelatorioSemanalPage from '@/pages/chat/ChatRelatorioSemanalPage'
import { DashboardOverview } from '@/components/dashboard/DashboardOverview'

function greetingTime() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function GreetingIcon() {
  const h = new Date().getHours()
  if (h < 12) {
    // Bom dia — sol amarelo
    return <Sun className="h-5 w-5 text-warning shrink-0" aria-hidden="true" />
  }
  if (h < 18) {
    // Boa tarde — sol no entardecer (laranja/dourado)
    return <Sunset className="h-5 w-5 text-warning shrink-0" aria-hidden="true" />
  }
  // Boa noite — lua azul
  return <Moon className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
}

type Tab = 'geral' | 'clientes' | 'entregas' | 'relatorio'

export function DashboardPage() {
  const [tab, setTab] = useState<Tab>('geral')
  const { user } = useAuth()
  const { data: dashData } = useDashboardData()
  const criticosCount = dashData?.criticos.length ?? 0
  const alertasCount = (dashData?.sentiment?.alertas.length ?? 0) + (dashData?.sentiment?.proximos_passos.length ?? 0)
  // Entregas: contagem virá do hook do cami quando integração estiver ativa
  const entregasPendentes = 0

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  const TABS: Array<{
    value: Tab
    label: string
    icon: React.ElementType
    badge?: { value: number; tone: 'danger' | 'warning' | 'accent' | 'info' }
    iconAlwaysOn?: boolean
  }> = [
    { value: 'geral', label: 'Visão Geral', icon: LayoutDashboard },
    {
      value: 'clientes', label: 'Clientes', icon: Users,
      badge: criticosCount > 0 ? { value: criticosCount, tone: 'danger' } : undefined,
    },
    {
      value: 'entregas', label: 'Entregas & Avaliações', icon: FileCheck,
      badge: entregasPendentes > 0 ? { value: entregasPendentes, tone: 'warning' } : undefined,
    },
    {
      value: 'relatorio', label: 'Sentimental', icon: Sparkles, iconAlwaysOn: true,
      badge: alertasCount > 0 ? { value: alertasCount, tone: 'accent' } : undefined,
    },
  ]

  return (
    <div className="space-y-4 lg:space-y-6 animate-fade-in">
      {/* Header compacto */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-xl lg:text-2xl font-bold text-foreground tracking-tight">
            {greetingTime()}, {user?.nome?.split(' ')[0] ?? 'Usuário'}
          </h1>
          <GreetingIcon />
        </div>
        <p className="text-xs text-muted-foreground capitalize font-mono">{today}</p>
      </div>

      {/* Tabs em pills com badges acionáveis */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/40 p-1 w-fit max-w-full overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon
          const isActive = tab === t.value
          const badgeColors: Record<string, string> = {
            danger:  isActive ? 'bg-white/25 text-white' : 'bg-danger/15 text-danger',
            warning: isActive ? 'bg-white/25 text-white' : 'bg-warning/15 text-warning',
            accent:  isActive ? 'bg-white/25 text-white' : 'bg-accent/15 text-accent',
            info:    isActive ? 'bg-white/25 text-white' : 'bg-info/15 text-info',
          }
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card',
              )}
            >
              <Icon className={cn(
                'h-3.5 w-3.5 shrink-0',
                t.iconAlwaysOn && !isActive && 'text-accent',
              )} />
              <span className="whitespace-nowrap">{t.label}</span>
              {t.badge && (
                <span className={cn(
                  'rounded-md px-1.5 py-0 text-[10.5px] font-bold tabular-nums',
                  badgeColors[t.badge.tone],
                )}>
                  {t.badge.value > 99 ? '99+' : t.badge.value}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'geral' && <DashboardOverview onTabChange={setTab} />}
      {tab === 'clientes' && <ClientesPage disableNav />}
      {tab === 'entregas' && <EntregasCamiPage />}
      {tab === 'relatorio' && <ChatRelatorioSemanalPage />}

    </div>
  )
}
