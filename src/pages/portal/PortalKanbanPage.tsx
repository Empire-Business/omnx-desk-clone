import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAuth } from '@/contexts/AuthContext'
import { useEntregas } from '@/hooks/useEntregas'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { DeliveryStatus, DeliveryWithDetails } from '@/types/database'

const COLUMNS: Array<{ status: DeliveryStatus; label: string }> = [
  { status: 'aguardando_aprovacao', label: 'Aguardando' },
  { status: 'em_revisao', label: 'Em Revisão' },
  { status: 'aprovado', label: 'Aprovado' },
  { status: 'publicado', label: 'Publicado' },
]

// ---------------------------------------------------------------------------
// Sortable card
// ---------------------------------------------------------------------------

interface KanbanCardProps {
  delivery: DeliveryWithDetails
}

function KanbanCard({ delivery }: KanbanCardProps) {
  const navigate = useNavigate()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: delivery.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => navigate(`/portal/entregas/${delivery.id}`)}
      className={cn(
        'glass-card cursor-pointer select-none rounded-xl p-4 space-y-2 hover:shadow-md transition-all',
        isDragging && 'opacity-50 shadow-xl ring-2 ring-primary',
      )}
    >
      <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
        {delivery.titulo}
      </p>
      <p className="text-xs text-muted-foreground">{delivery.deliverables.nome}</p>
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={delivery.status} size="sm" />
        {delivery.prazo && (
          <span className="text-2xs text-muted-foreground">
            {new Date(delivery.prazo).toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

interface KanbanColumnProps {
  status: DeliveryStatus
  label: string
  items: DeliveryWithDetails[]
}

function KanbanColumn({ label, items }: KanbanColumnProps) {
  return (
    <div className="flex w-72 shrink-0 flex-col gap-3">
      {/* Column header */}
      <div className="flex items-center justify-between rounded-xl glass-card px-4 py-3">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-bold text-muted-foreground">
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <SortableContext
        items={items.map((d) => d.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2 min-h-[80px]">
          {items.length === 0 ? (
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-border py-8 text-xs text-muted-foreground">
              Sem entregas
            </div>
          ) : (
            items.map((delivery) => (
              <KanbanCard key={delivery.id} delivery={delivery} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PortalKanbanPage() {
  const { user } = useAuth()

  const { data: assignment } = useQuery({
    queryKey: ['my-assignment', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('client_assignments')
        .select('client_id')
        .eq('user_id', user!.id)
        .limit(1)
        .single()
      return data
    },
    enabled: Boolean(user?.id),
  })

  const { data: entregas, isLoading } = useEntregas(
    assignment?.client_id ? { clientId: assignment.client_id } : undefined,
  )

  // Group deliveries by status — only kanban columns
  const columnStatuses = new Set<DeliveryStatus>(COLUMNS.map((c) => c.status))
  const byStatus = (entregas ?? []).reduce<Record<DeliveryStatus, DeliveryWithDetails[]>>(
    (acc, d) => {
      if (columnStatuses.has(d.status)) {
        acc[d.status] = [...(acc[d.status] ?? []), d]
      }
      return acc
    },
    {} as Record<DeliveryStatus, DeliveryWithDetails[]>,
  )

  // Visual-only drag: no status change on drop
  function handleDragEnd(_event: DragEndEvent) {
    // Portal kanban is read-only — dragging is visual only.
    // No status mutations are performed from the client portal.
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Quadro de entregas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Arraste para visualizar • Clique em um cartão para ver detalhes
        </p>
      </div>

      {isLoading ? (
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <div
              key={col.status}
              className="w-72 shrink-0 space-y-3"
            >
              <div className="h-12 shimmer rounded-xl" />
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-24 shimmer rounded-xl" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-3 sm:gap-4 min-w-max">
              {COLUMNS.map(({ status, label }) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  label={label}
                  items={byStatus[status] ?? []}
                />
              ))}
            </div>
          </div>
        </DndContext>
      )}
    </div>
  )
}
