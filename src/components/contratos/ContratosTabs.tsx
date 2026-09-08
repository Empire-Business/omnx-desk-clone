import { NavLink } from 'react-router-dom'
import { LayoutDashboard, List, Columns3, ClipboardList, Package, Tags, TrendingUp } from 'lucide-react'
import { usePermissoes } from '@/hooks/usePermissoes'
import { cn } from '@/lib/utils'

/**
 * Navegação em abas do módulo Contratos (Dashboard / Onboarding / Lista / Kanban / Produtos).
 *
 * Primeira tela migrada para a camada de permissões por app (Fase 2): pergunta
 * "pode neste recurso?" em vez de "qual é o perfil?". O comportamento é o mesmo
 * de antes — o seed da `permissoes_app` reproduz o gate anterior.
 */
export function ContratosTabs() {
  const { can } = usePermissoes()
  const podeAdministrar = can('contratos', 'admin')
  const podeContratos = can('contratos', 'ver')
  const podeOnboarding = podeContratos || can('contratos.onboarding', 'ver')

  // Trabalho do dia a dia: o que se abre para tocar contrato.
  const trabalho = [
    ...(podeContratos
      ? [{ to: '/contratos', label: 'Dashboard', icon: LayoutDashboard, end: true }]
      : []),
    // Onboarding fica em segundo, logo atrás do Dashboard
    ...(podeOnboarding
      ? [{ to: '/contratos/onboarding', label: 'Onboarding', icon: ClipboardList, end: false }]
      : []),
    ...(podeContratos
      ? [
          { to: '/contratos/lista', label: 'Contratos', icon: List, end: false },
          { to: '/contratos/kanban', label: 'Kanban', icon: Columns3, end: false },
          { to: '/contratos/recebiveis', label: 'Recebíveis', icon: TrendingUp, end: false },
        ]
      : []),
  ]

  // Configuração: define como o módulo se comporta, mas ninguém abre todo dia.
  // Separadas das de trabalho porque sete abas com o mesmo peso visual fazem a
  // pessoa reler a fila inteira toda vez (§9.2 e §9.4 do brief) — e "Tags" no
  // mesmo nível de "Contratos" sugere que são a mesma categoria de coisa.
  const configuracao = podeAdministrar
    ? [
        { to: '/contratos/produtos', label: 'Produtos', icon: Package, end: false },
        { to: '/contratos/tags', label: 'Tags', icon: Tags, end: false },
      ]
    : []

  if (trabalho.length + configuracao.length <= 1) return null

  const classe = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
      isActive ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <div className="flex w-fit items-center gap-1 rounded-full bg-muted/50 p-1">
      {trabalho.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={classe}>
          <t.icon className="h-3.5 w-3.5" />
          {t.label}
        </NavLink>
      ))}

      {configuracao.length > 0 && (
        <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
      )}

      {configuracao.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={classe} title="Configuração do módulo">
          <t.icon className="h-3.5 w-3.5" />
          {t.label}
        </NavLink>
      ))}
    </div>
  )
}
