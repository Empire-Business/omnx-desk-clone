import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, User, Clock, GripVertical } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { cn, formatPhone } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { useConversations, useUpdateConversationStatus } from '@/hooks/useChat'
import type { ConversationWithContact, ChatConversation } from '@/hooks/useChat'

/** Colunas com o selo de status do DS (`.st[data-s]`): cor + forma do marcador, nunca só cor. */
const COLUMNS: {
  key: ChatConversation['status']
  label: string
  tom: 'aberto' | 'andamento' | 'aguardando' | 'resolvido'
}[] = [
  { key: 'aberta', label: 'Abertas', tom: 'aberto' },
  { key: 'em_atendimento', label: 'Em atendimento', tom: 'andamento' },
  { key: 'aguardando', label: 'Aguardando', tom: 'aguardando' },
  { key: 'encerrada', label: 'Encerradas', tom: 'resolvido' },
]

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

// ─── Draggable Card ──────────────────────────────────────────────────────────

function DraggableCard({ conversation }: { conversation: ConversationWithContact }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: conversation.id,
    data: { conversation },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg bg-card ring-hairline p-3 space-y-2 transition-[opacity,box-shadow] duration-fast animate-row-in',
        isDragging ? 'opacity-30' : 'hover:shadow-pop',
      )}
    >
      <CardContent conversation={conversation} dragListeners={listeners} dragAttributes={attributes} />
    </div>
  )
}

function CardContent({
  conversation,
  dragListeners,
  dragAttributes,
}: {
  conversation: ConversationWithContact
  dragListeners?: ReturnType<typeof useDraggable>['listeners']
  dragAttributes?: ReturnType<typeof useDraggable>['attributes']
}) {
  const navigate = useNavigate()
  const contact = conversation.chat_contacts
  const contactName = contact?.nome ?? formatPhone(contact?.numero_whatsapp) ?? 'Desconhecido'

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer rounded-md text-left focus-ds"
          onClick={() => navigate(conversation.contact_id ? `/conversas?contato=${encodeURIComponent(conversation.contact_id)}` : '/conversas')}
        >
          <span className="av" data-h="0" aria-hidden>
            {contactName.slice(0, 2).toUpperCase()}
          </span>
          <span className="truncate text-sm font-[650] text-foreground">{contactName}</span>
        </button>
        <div className="flex items-center gap-1">
          <span className="wait shrink-0">
            {formatRelativeTime(conversation.atualizado_em)}
          </span>
          <button
            type="button"
            {...dragListeners}
            {...dragAttributes}
            aria-label={`Arrastar a conversa com ${contactName} para outra coluna`}
            className="btn btn-ghost btn-icon btn-sm shrink-0 cursor-grab touch-none active:cursor-grabbing"
          >
            <GripVertical aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
        <span className="mono flex items-center gap-1">
          <MessageSquare className="h-3 w-3" aria-hidden />
          {conversation.protocolo}
        </span>
        {conversation.chat_departments && (
          <span className="flex min-w-0 items-center gap-1">
            <User className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{conversation.chat_departments.nome}</span>
          </span>
        )}
      </div>

      {(conversation.sla_primeira_resposta_violado || conversation.sla_resolucao_violado) && (
        <span className="st st-sm" data-s="atrasado">
          <span className="st-g" aria-hidden />
          <Clock className="h-3 w-3" aria-hidden />
          Passou do prazo
        </span>
      )}
    </>
  )
}

// ─── Droppable Column ────────────────────────────────────────────────────────

function DroppableColumn({
  columnKey,
  label,
  tom,
  conversations,
}: {
  columnKey: string
  label: string
  tom: string
  conversations: ConversationWithContact[]
}) {
  const { isOver, setNodeRef } = useDroppable({ id: columnKey })

  return (
    <section
      ref={setNodeRef}
      aria-label={`${label}: ${conversations.length}`}
      className={cn(
        // Coluna do quadro: 85% da tela no celular (mostra que há mais ao lado), 288 px no computador.
        'flex w-[85vw] max-w-72 shrink-0 snap-start flex-col rounded-xl bg-bg-1 p-2 ring-hairline transition-[background-color,box-shadow] duration-fast min-h-0',
        isOver && 'bg-primary-light shadow-[inset_0_0_0_2px_var(--primary-muted)]',
      )}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 mb-2 px-1 pt-0.5">
        <span className="st" data-s={tom}><span className="st-g" aria-hidden />{label}</span>
        <span className="count ml-auto">{conversations.length}</span>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto overscroll-contain min-h-[100px]">
        {conversations.map((c) => (
          <DraggableCard key={c.id} conversation={c} />
        ))}
        {conversations.length === 0 && (
          <div
            className={cn(
              'flex items-center justify-center py-8 text-[13px] text-muted-foreground rounded-lg border border-dashed border-stroke-default',
              isOver && 'border-primary text-link',
            )}
          >
            {isOver ? 'Solte aqui' : 'Nenhuma conversa'}
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ChatKanbanPage() {
  const { data: conversations = [], isLoading } = useConversations()
  const updateStatus = useUpdateConversationStatus()
  const [activeCard, setActiveCard] = useState<ConversationWithContact | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const grouped = useMemo(() => {
    const map: Record<string, ConversationWithContact[]> = {
      aberta: [],
      em_atendimento: [],
      aguardando: [],
      encerrada: [],
    }
    for (const c of conversations) {
      if (map[c.status]) map[c.status].push(c)
    }
    return map
  }, [conversations])

  function handleDragStart(event: DragStartEvent) {
    const conv = event.active.data.current?.conversation as ConversationWithContact | undefined
    setActiveCard(conv ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null)
    const { active, over } = event
    if (!over) return

    const conversationId = active.id as string
    const newStatus = over.id as ChatConversation['status']
    const conversation = conversations.find((c) => c.id === conversationId)

    if (!conversation || conversation.status === newStatus) return

    updateStatus.mutate({ id: conversationId, status: newStatus })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 md:px-8 2xl:px-10">
        <PageHeader
          title="Quadro de conversas"
          description="Arraste pelo puxador para mudar a situação da conversa."
          count={conversations.length}
        />
      </div>

      {isLoading ? (
        <div className="flex flex-1 gap-3 overflow-hidden px-4 pb-4 sm:px-6 md:px-8 2xl:px-10" aria-busy="true" aria-label="Carregando quadro">
          {COLUMNS.map((col) => (
            <div key={col.key} className="flex w-[85vw] max-w-72 shrink-0 flex-col gap-2 rounded-xl bg-bg-1 p-2 ring-hairline">
              <div className="sk h-5 w-28 rounded-full" />
              <div className="sk h-20 rounded-lg" />
              <div className="sk h-20 rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-x-auto kanban-scroll snap-x snap-mandatory scroll-px-4 sm:scroll-px-6 md:snap-none px-4 pb-4 sm:px-6 sm:pb-6 md:px-8 2xl:px-10">
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 sm:gap-4 h-full min-w-max">
              {COLUMNS.map((col) => (
                <DroppableColumn
                  key={col.key}
                  columnKey={col.key}
                  label={col.label}
                  tom={col.tom}
                  conversations={grouped[col.key] ?? []}
                />
              ))}
            </div>

            <DragOverlay>
              {activeCard && (
                <div className="w-72 rounded-lg bg-card p-3 space-y-2 shadow-modal ring-hairline rotate-1">
                  <CardContent conversation={activeCard} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}
    </div>
  )
}
