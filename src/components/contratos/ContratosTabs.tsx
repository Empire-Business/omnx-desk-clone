import { LayoutDashboard, List, Columns3, ClipboardList, Package, Tags, TrendingUp } from 'lucide-react'
import { usePermissoes } from '@/hooks/usePermissoes'
import { AbasRolaveis, type AbaItem } from '@/components/ui/AbasRolaveis'

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
      ? [{ to: '/contratos', label: 'Visão geral', icon: LayoutDashboard, end: true }]
      : []),
    // Onboarding fica em segundo, logo atrás do Dashboard
    ...(podeOnboarding
      ? [{ to: '/contratos/onboarding', label: 'Vendas novas', icon: ClipboardList, end: false }]
      : []),
    ...(podeContratos
      ? [
          { to: '/contratos/lista', label: 'Contratos', icon: List, end: false },
          { to: '/contratos/kanban', label: 'Quadro', icon: Columns3, end: false },
          { to: '/contratos/recebiveis', label: 'A receber', icon: TrendingUp, end: false },
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
        { to: '/contratos/tags', label: 'Etiquetas', icon: Tags, end: false },
      ]
    : []

  if (trabalho.length + configuracao.length <= 1) return null

  // Faixa única que rola de lado no celular (antes estourava em 375 px).
  const itens: AbaItem[] = [
    ...trabalho.map((t) => ({ id: t.to, para: t.to, fim: t.end, rotulo: t.label, icone: t.icon })),
    ...configuracao.map((t, i) => ({
      id: t.to,
      para: t.to,
      fim: t.end,
      rotulo: t.label,
      icone: t.icon,
      dica: 'Configuração do módulo',
      separadorAntes: i === 0 && trabalho.length > 0,
    })),
  ]

  return <AbasRolaveis rotulo="Seções de Contratos" itens={itens} />
}
