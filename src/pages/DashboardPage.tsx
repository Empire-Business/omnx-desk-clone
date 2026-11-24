import { useState } from 'react'
import { LayoutDashboard, Users, Sparkles, Sun, Sunset, Moon, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardData } from '@/hooks/useDashboardMetrics'
import { ClientesPage } from '@/pages/clientes/ClientesPage'
import { EntregasCamiPage } from '@/pages/entregas/EntregasCamiPage'
import ChatRelatorioSemanalPage from '@/pages/chat/ChatRelatorioSemanalPage'
import { DashboardOverview } from '@/components/dashboard/DashboardOverview'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { AbasRolaveis } from '@/components/ui/AbasRolaveis'

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

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  const TABS: Array<{
    value: Tab
    label: string
    icon: LucideIcon
    badge?: { value: number; tone: 'danger' | 'warning' | 'accent' | 'info' }
    iconAlwaysOn?: boolean
  }> = [
    { value: 'geral', label: 'Visão Geral', icon: LayoutDashboard },
    {
      value: 'clientes', label: 'Clientes', icon: Users,
      badge: criticosCount > 0 ? { value: criticosCount, tone: 'danger' } : undefined,
    },
    {
      value: 'relatorio', label: 'Sentimental', icon: Sparkles, iconAlwaysOn: true,
      badge: alertasCount > 0 ? { value: alertasCount, tone: 'accent' } : undefined,
    },
  ]

  const abas = TABS.map((t) => ({
    id: t.value,
    rotulo: t.label,
    icone: t.icon,
    ativo: tab === t.value,
    // Contador de alerta: sem tom de cor, para caber no trilho de abas.
    contador: t.badge?.value,
    onClick: () => setTab(t.value),
  }))

  return (
    <PageContainer>
      <PageHeader
        title={`${greetingTime()}, ${user?.nome?.split(' ')[0] ?? 'Usuário'}`}
        description={<span className="capitalize">{today}</span>}
        action={<GreetingIcon />}
      />

      <AbasRolaveis itens={abas} rotulo="Seções do painel" variante="segmentado" />

      {tab === 'geral' && <DashboardOverview onTabChange={setTab} />}
      {tab === 'clientes' && <ClientesPage disableNav />}
      {tab === 'entregas' && <EntregasCamiPage />}
      {tab === 'relatorio' && <ChatRelatorioSemanalPage />}
    </PageContainer>
  )
}
