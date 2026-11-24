import { useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { AtendimentoTabs } from '@/components/atendimento/AtendimentoTabs'
import {
  EsqueletoLista, LinhaTicket, ListaTickets, useAgora, useTicketsComStatus,
} from '@/components/atendimento/TicketUi'
import { useDemandas } from '@/hooks/useAtendimento'
import { useAuth } from '@/contexts/AuthContext'
import { ORDEM_FAIXAS, ROTULO_FAIXA, agruparPorFaixa, type FaixaPrazo } from '@/lib/faixasPrazo'
import { cn } from '@/lib/utils'

const LIMITE_POR_FAIXA = 15

const TOM_FAIXA: Partial<Record<FaixaPrazo, string>> = {
  vencida: 'text-danger',
  hoje: 'text-warning',
}

/**
 * Prazos — os tickets em aberto agrupados por vencimento, como a tela de
 * prazos do Acompanhamento do OMNX Clients. Só leitura: mesma consulta da
 * fila de tickets (RLS e carteira valem igual) e a mesma linha de ticket.
 */
export function PrazosPage() {
  const { data: demandas, isLoading, isError } = useDemandas({ situacao: 'todas' })
  const { tickets } = useTicketsComStatus(demandas)
  const { user } = useAuth()
  const agora = useAgora(60_000)
  const [soMeus, setSoMeus] = useState(false)
  const [abertas, setAbertas] = useState<Partial<Record<FaixaPrazo, boolean>>>({})

  const grupos = useMemo(() => {
    const emAberto = tickets.filter((t) => t.status !== 'resolvido' && !t.demanda.concluida_em)
    const recorte = soMeus ? emAberto.filter((t) => Boolean(user?.id) && t.demanda.responsavel_id === user?.id) : emAberto
    return agruparPorFaixa(recorte, (t) => t.demanda.prazo, agora)
  }, [tickets, soMeus, user?.id, agora])

  const total = ORDEM_FAIXAS.reduce((s, f) => s + grupos[f].length, 0)

  return (
    <PageContainer>
      <AtendimentoTabs />
      <PageHeader
        title="Prazos"
        description="Os tickets em aberto pela data combinada: o que venceu, o que vence hoje e o que vem nos próximos 7 dias."
        action={
          <button
            type="button"
            aria-pressed={soMeus}
            onClick={() => setSoMeus((v) => !v)}
            className={cn('btn btn-sm', soMeus ? 'btn-primary' : 'btn-secondary')}
          >
            Só os meus
          </button>
        }
      />

      {isLoading && <EsqueletoLista linhas={4} />}

      {isError && (
        <div role="alert" className="rounded-lg border border-card-border bg-card p-4 text-sm text-muted-foreground">
          Não foi possível carregar os tickets. Se isso persistir, use o botão
          "Reportar problema" — ele já envia o contexto técnico junto.
        </div>
      )}

      {!isLoading && !isError && (
        total === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={soMeus ? 'Nenhum ticket seu em aberto' : 'Nenhum ticket em aberto'}
            description="Quando um ticket tiver prazo, ele aparece aqui na faixa certa."
          />
        ) : (
          <div className="grid gap-4">
            <nav aria-label="Resumo dos prazos" className="cume-band grid grid-cols-2 rounded-lg border border-card-border bg-card sm:grid-cols-5">
              {ORDEM_FAIXAS.map((f) => (
                <a key={f} href={`#prazo-${f}`} className="grid gap-1 px-4 py-3 text-foreground no-underline hover:bg-accent focus-ds">
                  <span className="text-[12.5px] font-medium text-muted-foreground">{ROTULO_FAIXA[f]}</span>
                  <span className={cn('text-[26px] font-bold leading-tight', grupos[f].length > 0 && TOM_FAIXA[f])}>
                    {grupos[f].length}
                  </span>
                </a>
              ))}
            </nav>

            {ORDEM_FAIXAS.filter((f) => grupos[f].length > 0).map((f) => {
              const itens = grupos[f]
              const verTodos = abertas[f] || itens.length <= LIMITE_POR_FAIXA
              return (
                <section key={f} id={`prazo-${f}`} aria-labelledby={`prazo-${f}-titulo`} className="cume-panel grid content-start">
                  <div className="cume-panel-head flex items-end justify-between gap-3">
                    <h2 id={`prazo-${f}-titulo`} className={cn('m-0 flex items-center gap-2 text-[15px] font-bold text-foreground', TOM_FAIXA[f])}>
                      <CalendarClock aria-hidden className="h-4 w-4" /> {ROTULO_FAIXA[f]}
                      <span className="mono text-[12.5px] font-semibold text-muted-foreground">{itens.length}</span>
                    </h2>
                    {!verTodos && (
                      <button type="button" className="btn btn-ghost btn-sm text-link" onClick={() => setAbertas((a) => ({ ...a, [f]: true }))}>
                        Ver todos ({itens.length})
                      </button>
                    )}
                  </div>
                  <ListaTickets>
                    {(verTodos ? itens : itens.slice(0, LIMITE_POR_FAIXA)).map((t) => (
                      <LinhaTicket key={t.demanda.id} ticket={t} agora={agora} />
                    ))}
                  </ListaTickets>
                </section>
              )
            })}
          </div>
        )
      )}
    </PageContainer>
  )
}
