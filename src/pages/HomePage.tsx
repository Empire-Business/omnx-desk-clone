import { AtendimentoPainelPage } from '@/pages/atendimento/AtendimentoPainelPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { useIsAppEnabled } from '@/hooks/useAppModules'
import { usePermissoes } from '@/hooks/usePermissoes'

/**
 * Tela inicial do sistema.
 *
 * Desde 04/08/2026 a home é o painel de **Atendimento** (decisão do usuário).
 * Mas a home não pode ser uma tela de bloqueio: quem entra no sistema precisa
 * cair em algum lugar útil. Então há dois casos em que ela cai no Dashboard
 * antigo, que continua vivo como legado:
 *
 * 1. O admin **desligou** o app Atendimento nesta empresa.
 * 2. O perfil da pessoa **não tem permissão** no recurso `atendimento`
 *    (ex.: um agente de cobrança).
 *
 * Sem isso, o primeiro caso deixaria a empresa sem tela inicial e o segundo
 * mostraria um painel permanentemente vazio — a RLS devolveria nada e a pessoa
 * concluiria que o sistema está quebrado.
 */
export function HomePage() {
  const { isAppEnabled } = useIsAppEnabled()
  const { can, carregando } = usePermissoes()

  // Enquanto as permissões carregam, não decide: trocar de tela no meio do
  // carregamento faz a home "piscar" de uma para outra.
  if (carregando) return null

  const atendimentoDisponivel = isAppEnabled('atendimento') && can('atendimento', 'ver')

  return atendimentoDisponivel ? <AtendimentoPainelPage /> : <DashboardPage />
}
