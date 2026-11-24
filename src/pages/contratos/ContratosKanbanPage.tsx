import { nomesClientesContrato } from '@/lib/contratoClientes'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings2, GripVertical } from 'lucide-react'
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { ContratosTabs } from '@/components/contratos/ContratosTabs'
import { GerenciarColunasModal } from '@/components/contratos/GerenciarColunasModal'
import { useContratos, useUpdateContrato, type Contrato } from '@/hooks/useComissoes'
import { useKanbanColunas, statusPrimarioDaChave, type KanbanColuna } from '@/hooks/useKanbanColunas'
import { usePermissoes } from '@/hooks/usePermissoes'
import { cn } from '@/lib/utils'

function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

// ─── Cartão arrastável ───────────────────────────────────────────────────────
function ContratoCard({ c, onOpen }: { c: Contrato; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id, data: { contrato: c } })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group relative flex items-start gap-1 p-2.5 rounded-md bg-card border border-border hover:border-primary/40 hover:shadow-sm transition-all',
        isDragging && 'opacity-30',
      )}
    >
      {/* Alça de arraste */}
      <button
        {...listeners}
        {...attributes}
        className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted"
        title="Arrastar"
        aria-label="Arrastar cartão"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="text-sm font-medium text-foreground truncate">{nomesClientesContrato(c)}</p>
        <div className="flex items-baseline justify-between gap-2 mt-1">
          <span className="text-[11px] text-muted-foreground truncate">{c.produto_nome ?? '—'}</span>
          <span className="text-[11px] tabular-nums text-foreground">{fmtBRL(Number(c.valor_total ?? 0))}</span>
        </div>
      </button>
    </div>
  )
}

// ─── Coluna (área de solte) ──────────────────────────────────────────────────
function Coluna({ col, items, onOpen }: { col: KanbanColuna; items: Contrato[]; onOpen: (c: Contrato) => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: col.status_chave })
  const total = items.reduce((s, c) => s + Number(c.valor_total ?? 0), 0)
  return (
    <div
      ref={setNodeRef}
      className={cn('flex flex-col rounded-lg bg-muted/30 transition-colors', isOver && 'bg-primary/10 ring-2 ring-primary/20')}
    >
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', col.cor)} />
          <h3 className="text-sm font-medium text-foreground">{col.titulo}</h3>
          <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
          {col.is_onboarding && (
            <span className="rounded-full bg-primary-muted px-1.5 py-0.5 text-[11px] font-medium text-link" title="Clientes vindos do formulário, ainda sem Clicksign">
              formulário
            </span>
          )}
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">{fmtBRL(total)}</span>
      </div>
      <div className="flex-1 px-2 pb-2 space-y-1.5 max-h-[70dvh] overflow-y-auto min-h-[80px]">
        {items.length === 0 ? (
          <p className={cn('py-6 text-center text-xs', isOver ? 'text-primary' : 'text-muted-foreground/60')}>
            {isOver ? 'Solte aqui' : 'vazio'}
          </p>
        ) : items.map((c) => (
          <ContratoCard key={c.id} c={c} onOpen={() => onOpen(c)} />
        ))}
      </div>
    </div>
  )
}

export function ContratosKanbanPage() {
  const navigate = useNavigate()
  const { can } = usePermissoes()
  // Gerir colunas do kanban sempre foi exclusivo de admin; agora a regra
  // vive na matriz de permissoes e pode ser delegada sem mexer no codigo.
  const isAdmin = can('contratos', 'admin')

  const { data: contratos, isLoading } = useContratos()
  const { data: colunas, isLoading: loadingColunas } = useKanbanColunas()
  const updateMut = useUpdateContrato()

  const [gerirOpen, setGerirOpen] = useState(false)
  const [ativo, setAtivo] = useState<Contrato | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const grouped = useMemo(() => {
    const map: Record<string, Contrato[]> = {}
    for (const col of colunas ?? []) map[col.status_chave.toUpperCase()] = []
    if (contratos) {
      for (const c of contratos) {
        const k = (c.status_secundario ?? c.status ?? '').toUpperCase()
        if (map[k]) map[k].push(c)
      }
    }
    return map
  }, [contratos, colunas])

  function handleDragStart(e: DragStartEvent) {
    setAtivo((e.active.data.current?.contrato as Contrato) ?? null)
  }

  async function handleDragEnd(e: DragEndEvent) {
    setAtivo(null)
    const { active, over } = e
    if (!over) return
    const c = active.data.current?.contrato as Contrato | undefined
    const chave = String(over.id)
    if (!c) return
    const atual = (c.status_secundario ?? c.status ?? '').toUpperCase()
    if (atual === chave.toUpperCase()) return
    await updateMut.mutateAsync({
      id: c.id,
      status_secundario: chave,
      status: statusPrimarioDaChave(chave),
    })
  }

  const carregando = isLoading || loadingColunas
  const cols = colunas ?? []

  return (
    <PageContainer className="animate-fade-in">
      <PageHeader
        title="Quadro"
        description="Arraste um cartão pela alça para mudar o status. Clique para abrir."
        action={
          isAdmin ? (
            <button
              onClick={() => setGerirOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Settings2 className="h-4 w-4" /> Gerenciar colunas
            </button>
          ) : undefined
        }
      />

      <ContratosTabs />

      {carregando ? (
        <div className="grid grid-flow-col auto-cols-[280px] gap-4 overflow-x-auto">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-96 shimmer rounded-lg" />)}
        </div>
      ) : cols.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma coluna configurada.</p>
          {isAdmin && (
            <button onClick={() => setGerirOpen(true)} className="mt-2 text-sm text-primary hover:underline">
              Configurar colunas →
            </button>
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-flow-col auto-cols-[280px] gap-4 overflow-x-auto pb-4">
            {cols.map((col) => (
              <Coluna
                key={col.id}
                col={col}
                items={grouped[col.status_chave.toUpperCase()] ?? []}
                onOpen={(c) => navigate(`/contratos/${c.id}`)}
              />
            ))}
          </div>
          <DragOverlay>
            {ativo && (
              <div className="w-64 p-2.5 rounded-md bg-card border border-primary/40 shadow-lg rotate-2">
                <p className="text-sm font-medium text-foreground truncate">{nomesClientesContrato(ativo)}</p>
                <div className="flex items-baseline justify-between gap-2 mt-1">
                  <span className="text-[11px] text-muted-foreground truncate">{ativo.produto_nome ?? '—'}</span>
                  <span className="text-[11px] tabular-nums text-foreground">{fmtBRL(Number(ativo.valor_total ?? 0))}</span>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {isAdmin && <GerenciarColunasModal open={gerirOpen} onClose={() => setGerirOpen(false)} />}
    </PageContainer>
  )
}
