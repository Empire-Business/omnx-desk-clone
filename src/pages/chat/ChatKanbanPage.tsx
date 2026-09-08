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

const COLUMNS: {
  key: ChatConversation['status']
  label: string
  color: string
  lightColor: string
}[] = [
  { key: 'aberta', label: 'Abertas', color: 'bg-info', lightColor: 'bg-info-light text-info' },
  { key: 'em_atendimento', label: 'Em Atendimento', color: 'bg-success', lightColor: 'bg-success-light text-success' },
  { key: 'aguardando', label: 'Aguardando', color: 'bg-warning', lightColor: 'bg-warning-light text-warning' },
  { key: 'encerrada', label: 'Encerradas', color: 'bg-muted-foreground', lightColor: 'bg-muted text-muted-foreground' },
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
        'glass-card p-3 space-y-2 transition-shadow',
        isDragging ? 'opacity-30' : 'entity-card-hover',
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
  dragListeners?: Record<string, unknown>
  dragAttributes?: Record<string, unknown>
}) {
  const navigate = useNavigate()
  const contact = conversation.chat_contacts
  const contactName = contact?.nome ?? formatPhone(contact?.numero_whatsapp) ?? 'Desconhecido'

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div
          className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
          onClick={() => navigate('/chat')}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary font-semibold text-2xs">
            {contactName.slice(0, 2).toUpperCase()}
          </div>
          <p className="truncate text-sm font-semibold text-foreground">{contactName}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="shrink-0 text-2xs text-muted-foreground">
            {formatRelativeTime(conversation.atualizado_em)}
          </span>
          <button
            {...dragListeners}
            {...dragAttributes}
            className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 rounded text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          {conversation.protocolo}
        </span>
        {conversation.chat_departments && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {conversation.chat_departments.nome}
          </span>
        )}
      </div>

      {(conversation.sla_primeira_resposta_violado || conversation.sla_resolucao_violado) && (
        <div className="flex items-center gap-1 text-2xs text-danger">
          <Clock className="h-3 w-3" />
          SLA violado
        </div>
      )}
    </>
  )
}

// ─── Droppable Column ────────────────────────────────────────────────────────

function DroppableColumn({
  columnKey,
  label,
  color,
  lightColor,
  conversations,
}: {
  columnKey: string
  label: string
  color: string
  lightColor: string
  conversations: ConversationWithContact[]
}) {
  const { isOver, setNodeRef } = useDroppable({ id: columnKey })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl transition-colors',
        isOver && 'bg-primary-muted/30 ring-2 ring-primary/20',
      )}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={cn('h-2 w-2 rounded-full', color)} />
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <span className={cn('rounded-full px-2 py-0.5 text-2xs font-medium', lightColor)}>
          {conversations.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto pr-1 min-h-[100px]">
        {conversations.map((c) => (
          <DraggableCard key={c.id} conversation={c} />
        ))}
        {conversations.length === 0 && (
          <div
            className={cn(
              'flex items-center justify-center py-8 text-sm text-muted-foreground rounded-lg border-2 border-dashed border-border/50',
              isOver && 'border-primary/30 text-primary',
            )}
          >
            {isOver ? 'Solte aqui' : 'Nenhuma conversa'}
          </div>
        )}
      </div>
    </div>
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
    <div className="flex flex-col h-full animate-fade-in">
      <div className="px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4 lg:pt-6 pb-2 sm:pb-3 lg:pb-4">
        <PageHeader
          title="Kanban de Atendimento"
          description="Arraste os cards entre as colunas para alterar o status."
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto scrollbar-hide px-3 sm:px-4 lg:px-6 pb-3 sm:pb-4 lg:pb-6">
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
                  color={col.color}
                  lightColor={col.lightColor}
                  conversations={grouped[col.key] ?? []}
                />
              ))}
            </div>

            <DragOverlay>
              {activeCard && (
                <div className="w-72 glass-card p-3 space-y-2 shadow-lg rotate-2 opacity-90">
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
