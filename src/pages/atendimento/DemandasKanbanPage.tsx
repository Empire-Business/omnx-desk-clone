import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GripVertical, Loader2, Plus } from 'lucide-react'
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { PageHeader } from '@/components/ui/PageHeader'
import { AtendimentoTabs } from '@/components/atendimento/AtendimentoTabs'
import { DemandaForm } from '@/components/atendimento/DemandaForm'
import {
  useDemandas, useAtendimentoEtapas, useAtualizarDemanda, useSegmentoAtendimento,
  type Demanda,
} from '@/hooks/useAtendimento'
import { usePermissoes } from '@/hooks/usePermissoes'
import { classeEtapa, CLASSE_PRAZO, situacaoPrazo, textoPrazo } from '@/lib/atendimento'
import { cn } from '@/lib/utils'

/**
 * Kanban das demandas — as colunas são as etapas configuradas pelo tenant.
 *
 * Só mostra demandas em aberto: o kanban é ferramenta de trabalho em andamento,
 * e arrastar cartão entre 300 entregas antigas atrapalha em vez de ajudar. O
 * histórico completo fica na aba Demandas, com filtro de situação.
 */
export function DemandasKanbanPage() {
  const navigate = useNavigate()
  const { data: etapas, isLoading: carregandoEtapas } = useAtendimentoEtapas()
  const { data: demandas, isLoading } = useDemandas({ situacao: 'abertas' })
  const atualizar = useAtualizarDemanda()
  const { can } = usePermissoes()
  const { segmento } = useSegmentoAtendimento()

  const [arrastando, setArrastando] = useState<Demanda | null>(null)
  const [novaAberta, setNovaAberta] = useState(false)

  const podeEditar = can('atendimento', 'editar')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const porEtapa = useMemo(() => {
    const mapa: Record<string, Demanda[]> = {}
    ;(demandas ?? []).forEach((d) => {
      const chave = d.etapa_id ?? 'sem-etapa'
      ;(mapa[chave] ??= []).push(d)
    })
    return mapa
  }, [demandas])

  const handleDragStart = (e: DragStartEvent) => {
    setArrastando((e.active.data.current as { demanda?: Demanda })?.demanda ?? null)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setArrastando(null)
    const destino = e.over?.id
    const demanda = (e.active.data.current as { demanda?: Demanda })?.demanda
    if (!destino || !demanda || demanda.etapa_id === destino) return
    atualizar.mutate({ id: demanda.id, etapa_id: String(destino) })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kanban"
        description={`Arraste a ${segmento.rotuloItem} para a etapa em que ela está. Só aparecem ${segmento.rotuloItens} em aberto.`}
        action={
          podeEditar && (
            <button
              onClick={() => setNovaAberta(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {segmento.acaoNovo}
            </button>
          )
        }
      />

      <AtendimentoTabs />

      {(isLoading || carregandoEtapas) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      )}

      {!carregandoEtapas && (etapas ?? []).length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma etapa configurada.</p>
          {can('atendimento', 'admin') && (
            <button
              onClick={() => navigate('/atendimento/config')}
              className="mt-2 text-sm text-primary hover:underline"
            >
              Configurar etapas →
            </button>
          )}
        </div>
      )}

      {!isLoading && (etapas ?? []).length > 0 && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid auto-cols-[280px] grid-flow-col gap-4 overflow-x-auto pb-4">
            {(etapas ?? []).map((etapa) => (
              <Coluna
                key={etapa.id}
                id={etapa.id}
                nome={etapa.nome}
                cor={etapa.cor}
                itens={porEtapa[etapa.id] ?? []}
                onAbrir={(d) => navigate(`/atendimento/demandas/${d.id}`)}
                arrastavel={podeEditar}
              />
            ))}

            {/* Só aparece se houver demanda órfã — não é uma etapa de verdade,
                é a rede de segurança para nada sumir do kanban. */}
            {(porEtapa['sem-etapa']?.length ?? 0) > 0 && (
              <Coluna
                id="sem-etapa"
                nome="Sem etapa"
                cor="rose"
                itens={porEtapa['sem-etapa']}
                onAbrir={(d) => navigate(`/atendimento/demandas/${d.id}`)}
                arrastavel={false}
              />
            )}
          </div>

          <DragOverlay>
            {arrastando && (
              <div className="w-64 rotate-2 rounded-md border border-primary/40 bg-card p-2.5 shadow-lg">
                <p className="truncate text-sm font-medium text-foreground">{arrastando.titulo}</p>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">
                  {arrastando.cliente?.nome ?? 'Sem cliente'}
                </p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <DemandaForm open={novaAberta} onClose={() => setNovaAberta(false)} />
    </div>
  )
}

function Coluna({
  id,
  nome,
  cor,
  itens,
  onAbrir,
  arrastavel,
}: {
  id: string
  nome: string
  cor: string
  itens: Demanda[]
  onAbrir: (d: Demanda) => void
  arrastavel: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col rounded-lg bg-muted/30 transition-colors',
        isOver && 'bg-primary/10 ring-2 ring-primary/20',
      )}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', classeEtapa(cor))}>
          {nome}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{itens.length}</span>
      </div>

      <div className="flex-1 space-y-2 p-2 pt-0">
        {itens.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            Nada aqui por enquanto.
          </p>
        )}
        {itens.map((d) => (
          <CartaoDemanda key={d.id} demanda={d} onAbrir={() => onAbrir(d)} arrastavel={arrastavel} />
        ))}
      </div>
    </div>
  )
}

function CartaoDemanda({
  demanda,
  onAbrir,
  arrastavel,
}: {
  demanda: Demanda
  onAbrir: () => void
  arrastavel: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: demanda.id,
    data: { demanda },
    disabled: !arrastavel,
  })
  const situacao = situacaoPrazo(demanda)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group flex items-start gap-1 rounded-md border border-border bg-card p-2.5 transition-all hover:border-primary/40 hover:shadow-sm',
        isDragging && 'opacity-30',
      )}
    >
      {arrastavel && (
        <button
          {...listeners}
          {...attributes}
          className="mt-0.5 shrink-0 cursor-grab rounded p-0.5 text-muted-foreground/40 hover:bg-muted hover:text-muted-foreground active:cursor-grabbing"
          title="Arrastar"
          aria-label={`Arrastar ${demanda.titulo}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}

      <button onClick={onAbrir} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium text-foreground">{demanda.titulo}</p>
        <p className="mt-1 truncate text-[10px] text-muted-foreground">
          {demanda.cliente?.nome ?? 'Sem cliente'}
          {demanda.responsavel?.nome ? ` · ${demanda.responsavel.nome}` : ''}
        </p>
        <p className={cn('mt-1 text-[10px]', CLASSE_PRAZO[situacao])}>{textoPrazo(demanda)}</p>
      </button>
    </div>
  )
}
