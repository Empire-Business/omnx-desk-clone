import { AtendimentoPainelPage } from '@/pages/atendimento/AtendimentoPainelPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { useIsAppEnabled } from '@/hooks/useAppModules'
import { usePermissoes } from '@/hooks/usePermissoes'
import { EsqueletoLista } from '@/components/atendimento/TicketUi'

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
  // carregamento faz a home "piscar" de uma para outra. Mostra um esqueleto
  // (DS `.sk`) no lugar da tela em branco.
  if (carregando) return <EsqueletoInicio />

  const atendimentoDisponivel = isAppEnabled('atendimento') && can('atendimento', 'ver')

  return atendimentoDisponivel ? <AtendimentoPainelPage /> : <DashboardPage />
}

function EsqueletoInicio() {
  return (
    <div className="mx-auto grid w-full max-w-[1280px] gap-6" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <div aria-hidden className="grid gap-2">
        <span className="sk h-7 w-64 max-w-full" />
        <span className="sk h-3.5 w-96 max-w-full" />
      </div>
      <div aria-hidden className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={i === 4 ? 'col-span-2 grid gap-3 rounded-lg border border-card-border bg-card p-4 lg:col-span-1' : 'grid gap-3 rounded-lg border border-card-border bg-card p-4'}>
            <span className="sk h-3 w-2/3" />
            <span className="sk h-6 w-10" />
          </div>
        ))}
      </div>
      <EsqueletoLista linhas={3} />
    </div>
  )
}
