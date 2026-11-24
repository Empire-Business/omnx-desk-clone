import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Columns3, GripVertical, Plus } from 'lucide-react'
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { AtendimentoTabs } from '@/components/atendimento/AtendimentoTabs'
import { DemandaForm } from '@/components/atendimento/DemandaForm'
import {
  EsperaTicket, lerTicket, ResponsavelTicket, SeloSugestaoIris, SeloWhatsApp, StatusTicketBadge, useAgora, useTicketsComStatus,
  type TicketComStatus,
} from '@/components/atendimento/TicketUi'
import { useDemandas, useAtualizarDemanda } from '@/hooks/useAtendimento'
import { usePermissoes } from '@/hooks/usePermissoes'
import { classeEtapa } from '@/lib/atendimento'
import { rotuloEtapa, textoPrazoTicket } from '@/lib/ticketStatus'
import { prazoVencido } from '@/lib/ticketEspera'
import { cn } from '@/lib/utils'

/** Coluna de rede de segurança para ticket sem etapa. Não é destino de arraste. */
const SEM_ETAPA = 'sem-etapa'
/** Quantos dias de resolvidos aparecem na coluna final. */
const DIAS_RESOLVIDOS = 7

/**
 * Quadro de tickets — as colunas são as etapas configuradas.
 *
 * Mostra os tickets em aberto e, na coluna final, os resolvidos dos últimos
 * dias: arrastar para "Resolvido" deixa o cartão visível ali, em vez de sumir
 * como se fosse um erro. O histórico completo fica na lista de tickets.
 */
export function DemandasKanbanPage() {
  const navigate = useNavigate()
  const { data: demandas, isLoading } = useDemandas({ situacao: 'todas' })
  const { tickets, etapas } = useTicketsComStatus(demandas)
  const atualizar = useAtualizarDemanda()
  const { can } = usePermissoes()

  const [arrastando, setArrastando] = useState<TicketComStatus | null>(null)
  const [novaAberta, setNovaAberta] = useState(false)

  const podeEditar = can('atendimento', 'editar')
  const agora = useAgora(30_000)
  // O arraste começa só pela alça (que tem `touch-none`): o toque no resto do
  // cartão continua rolando o quadro de lado no celular.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const idsEtapas = useMemo(() => new Set(etapas.map((e) => e.id)), [etapas])

  const porEtapa = useMemo(() => {
    const limite = Date.now() - DIAS_RESOLVIDOS * 86_400_000
    const mapa: Record<string, TicketComStatus[]> = {}
    tickets.forEach((t) => {
      if (t.status === 'resolvido') {
        const quando = new Date(t.demanda.concluida_em ?? t.demanda.updated_at).getTime()
        if (quando < limite) return
      }
      const chave = t.demanda.etapa_id && idsEtapas.has(t.demanda.etapa_id) ? t.demanda.etapa_id : SEM_ETAPA
      ;(mapa[chave] ??= []).push(t)
    })
    return mapa
  }, [tickets, idsEtapas])

  const handleDragStart = (e: DragStartEvent) => {
    setArrastando((e.active.data.current as { ticket?: TicketComStatus })?.ticket ?? null)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setArrastando(null)
    const destino = e.over?.id ? String(e.over.id) : null
    const ticket = (e.active.data.current as { ticket?: TicketComStatus })?.ticket
    // Só etapas de verdade são destino: soltar em "Sem etapa" (ou fora de uma
    // coluna) não faz nada, em vez de tentar gravar um id que não existe.
    if (!destino || !ticket || !idsEtapas.has(destino) || ticket.demanda.etapa_id === destino) return
    atualizar.mutate({ id: ticket.demanda.id, etapa_id: destino })
  }

  return (
    <PageContainer largura="total" className="gap-5 md:gap-6">
      <PageHeader
        title="Quadro de tickets"
        description={`Arraste o ticket pela alça para a etapa em que ele está. A coluna final mostra os resolvidos dos últimos ${DIAS_RESOLVIDOS} dias.`}
        action={
          podeEditar && (
            <button type="button" onClick={() => setNovaAberta(true)} className="btn btn-primary">
              <Plus aria-hidden /> Novo ticket
            </button>
          )
        }
      />

      <AtendimentoTabs />

      {atualizar.isError && (
        <p role="alert" className="m-0 rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
          Não foi possível mover o ticket. Tente novamente.
        </p>
      )}

      {isLoading && (
        <div aria-hidden className="grid auto-cols-[min(288px,85vw)] grid-flow-col gap-3 overflow-hidden sm:auto-cols-[288px]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="grid content-start gap-2 rounded-lg bg-bg-2 p-2 ring-hairline">
              <span className="sk m-1 h-5 w-24 rounded-full" />
              {[0, 1, 2].slice(0, 3 - (i % 2)).map((j) => <span key={j} className="sk h-24 rounded-lg" />)}
            </div>
          ))}
        </div>
      )}

      {!isLoading && etapas.length === 0 && (
        <EmptyState
          icon={Columns3}
          title="Nenhuma etapa configurada"
          description="As etapas viram as colunas do quadro. Sem elas, não há onde colocar os tickets."
          action={can('atendimento', 'admin') && (
            <button type="button" onClick={() => navigate('/tickets/configurar')} className="btn btn-primary">
              Configurar etapas
            </button>
          )}
        />
      )}

      {!isLoading && etapas.length > 0 && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* Celular: uma coluna por vez, que encaixa ao rolar de lado. */}
          <div className="-mx-4 grid snap-x snap-mandatory scroll-px-4 auto-cols-[min(288px,85vw)] grid-flow-col items-start gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:snap-proximity sm:scroll-px-0 sm:auto-cols-[288px] sm:px-0">
            {etapas.map((etapa) => (
              <Coluna
                key={etapa.id}
                id={etapa.id}
                nome={rotuloEtapa(etapa, etapas)}
                cor={etapa.cor}
                final={etapa.is_final}
                itens={porEtapa[etapa.id] ?? []}
                onAbrir={(t) => navigate(`/tickets/${t.demanda.id}`)}
                arrastavel={podeEditar}
                aceitaSoltar
                agora={agora}
              />
            ))}

            {/* Só aparece se houver ticket sem etapa — rede de segurança para nada
                sumir do quadro. Não recebe cartões: "sem etapa" não é destino. */}
            {(porEtapa[SEM_ETAPA]?.length ?? 0) > 0 && (
              <Coluna
                id={SEM_ETAPA}
                nome="Sem etapa"
                cor="rose"
                itens={porEtapa[SEM_ETAPA]}
                onAbrir={(t) => navigate(`/tickets/${t.demanda.id}`)}
                arrastavel={podeEditar}
                aceitaSoltar={false}
                agora={agora}
              />
            )}
          </div>

          <DragOverlay>
            {arrastando && (
              <div className="w-64 rotate-2 rounded-lg border border-primary-200 bg-card p-3 shadow-pop">
                <p className="m-0 truncate text-sm font-[650] text-foreground">{arrastando.demanda.titulo}</p>
                <p className="m-0 mt-1 truncate text-[12.5px] text-muted-foreground">
                  {arrastando.demanda.cliente?.nome ?? 'Sem cliente'}
                </p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <DemandaForm open={novaAberta} onClose={() => setNovaAberta(false)} />
    </PageContainer>
  )
}

function Coluna({
  id, nome, cor, final = false, itens, onAbrir, arrastavel, aceitaSoltar, agora,
}: {
  id: string
  nome: string
  cor: string
  final?: boolean
  itens: TicketComStatus[]
  onAbrir: (t: TicketComStatus) => void
  arrastavel: boolean
  aceitaSoltar: boolean
  agora: Date
}) {
  const { isOver, setNodeRef } = useDroppable({ id, disabled: !aceitaSoltar })

  return (
    <section
      ref={setNodeRef}
      aria-label={`${nome}: ${itens.length} ${itens.length === 1 ? 'ticket' : 'tickets'}`}
      className={cn(
        'flex snap-start flex-col rounded-lg bg-bg-2 ring-hairline transition-[background-color,box-shadow] duration-base ease-std',
        isOver && aceitaSoltar && 'bg-primary-light shadow-[inset_0_0_0_1.5px_var(--primary-muted)]',
      )}
    >
      <div className="flex min-h-11 items-center justify-between gap-2 px-3 py-2">
        <span className={cn('truncate rounded-full px-2 py-0.5 text-[12px] font-semibold', classeEtapa(cor))}>{nome}</span>
        <span className="count">{itens.length}</span>
      </div>

      <div className="grid flex-1 gap-2 p-2 pt-0">
        {itens.length === 0 && (
          <p className="m-0 rounded-md border border-dashed border-stroke-default px-2 py-6 text-center text-[12.5px] text-muted-foreground">
            {final ? 'Nenhum ticket resolvido nos últimos dias.' : 'Nada aqui por enquanto.'}
          </p>
        )}
        {itens.map((t) => (
          <CartaoTicket key={t.demanda.id} ticket={t} onAbrir={() => onAbrir(t)} arrastavel={arrastavel} agora={agora} />
        ))}
      </div>
    </section>
  )
}

function CartaoTicket({
  ticket, onAbrir, arrastavel, agora,
}: {
  ticket: TicketComStatus
  onAbrir: () => void
  arrastavel: boolean
  agora: Date
}) {
  const { demanda, status, wa } = ticket
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: demanda.id,
    data: { ticket },
    disabled: !arrastavel,
  })
  const leitura = lerTicket(ticket, agora)
  const resolvido = status === 'resolvido'

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group relative flex items-stretch overflow-hidden rounded-lg border bg-card transition-[border-color,opacity] duration-fast ease-std hover:border-stroke-default',
        leitura.atrasado ? 'border-[color-mix(in_srgb,var(--st-late-fg)_35%,var(--card-border))]' : 'border-card-border',
        resolvido && 'bg-bg-0',
        isDragging && 'opacity-30',
      )}
    >
      {leitura.atrasado && <span aria-hidden className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-[3px] bg-st-late-fg" />}
      {arrastavel && (
        <button
          {...listeners}
          {...attributes}
          className="flex w-11 shrink-0 cursor-grab touch-none items-center justify-center text-fg-4 transition-colors duration-fast hover:bg-accent hover:text-fg-2 focus-ds active:cursor-grabbing md:w-8"
          title="Arrastar"
          aria-label={`Arrastar ${demanda.titulo}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      <button
        type="button"
        onClick={onAbrir}
        className={cn('grid min-h-11 min-w-0 flex-1 gap-1.5 py-2.5 pr-3 text-left focus-ds', !arrastavel && 'pl-3')}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="mono text-[11.5px] text-fg-4">{demanda.codigo}</span>
          {wa && <SeloWhatsApp variante="linha" />}
          <span className="ml-auto flex-none">
            <StatusTicketBadge status={status} pelaIris={leitura.pelaIris} atrasado={leitura.atrasado} />
          </span>
        </span>
        <span className="line-clamp-2 text-[14px] font-[650] leading-[1.35] text-foreground">{demanda.titulo}</span>
        <span className="truncate text-[12.5px] text-muted-foreground">{demanda.cliente?.nome ?? 'Sem cliente'}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <EsperaTicket status={status} minutos={leitura.minutos} faixa={leitura.faixa} pelaIris={leitura.pelaIris} />
          {leitura.paraConfirmar && <SeloSugestaoIris />}
          {demanda.prazo && !resolvido && (
            <span className={cn('text-[12px]', prazoVencido(demanda.prazo, agora) ? 'font-semibold text-danger' : 'text-muted-foreground')}>
              {textoPrazoTicket(demanda.prazo, agora)}
            </span>
          )}
          <ResponsavelTicket
            id={demanda.responsavel_id}
            nome={demanda.responsavel?.nome}
            mostrarNome={false}
            className="ml-auto text-[12px]"
          />
        </span>
      </button>
    </div>
  )
}
