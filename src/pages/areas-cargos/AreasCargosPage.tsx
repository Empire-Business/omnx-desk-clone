import { useMemo, useState } from 'react'
import {
  Building2, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Briefcase, Layers, Crown, ZoomIn, ZoomOut, Maximize2, Search,
} from 'lucide-react'
import { useUsers } from '@/hooks/useUsers'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'

/* ════════════════════════════════════════════
   TIPOS LOCAIS (sem Supabase ainda)
   Estrutura T: Aquisição | Entrega | Operação
   ════════════════════════════════════════════ */

type AreaType = 'acquisition' | 'delivery' | 'operation'

interface Area {
  id: string
  name: string
  type: AreaType
}
interface Subarea {
  id: string
  name: string
  area_id: string
}
interface Position {
  id: string
  title: string
  area_id: string
  subarea_id: string | null
  level: number
}

const AREA_TYPE_CONFIG: Record<AreaType, { label: string; colorClass: string; dotClass: string }> = {
  acquisition: { label: 'Aquisição', colorClass: 'text-area-acquisition', dotClass: 'bg-area-acquisition' },
  delivery:    { label: 'Entrega',   colorClass: 'text-area-delivery',    dotClass: 'bg-area-delivery' },
  operation:   { label: 'Operação',  colorClass: 'text-area-operation',   dotClass: 'bg-area-operation' },
}

const AREA_DEFAULTS: { type: AreaType; name: string }[] = [
  { type: 'acquisition', name: 'Aquisição' },
  { type: 'delivery',    name: 'Entrega' },
  { type: 'operation',   name: 'Operação' },
]

/* ════════════════════════════════════════════
   LOCAL STORE — substitua por hooks Supabase quando tabelas existirem
   ════════════════════════════════════════════ */

const STORAGE_KEY = 'omnx-areas-cargos-v1'

interface Store {
  areas: Area[]
  subareas: Subarea[]
  positions: Position[]
}

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { areas: [], subareas: [], positions: [] }
    return JSON.parse(raw) as Store
  } catch {
    return { areas: [], subareas: [], positions: [] }
  }
}

function saveStore(s: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/* ════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════ */

export function AreasCargosPage() {
  const [store, setStore] = useState<Store>(() => loadStore())
  useUsers()

  const [zoom, setZoom] = useState(1)
  const [search, setSearch] = useState('')
  const [showCeoDetail, setShowCeoDetail] = useState(false)

  const update = (patch: (s: Store) => Store) => {
    setStore((prev) => {
      const next = patch(prev)
      saveStore(next)
      return next
    })
  }

  const ceoPosition = useMemo(() => {
    return store.positions.find(
      (p) => p.level === 0 || p.title.toLowerCase().includes('ceo') || p.title.toLowerCase().includes('diretor geral'),
    )
  }, [store.positions])

  // Mapeamento user→position ainda não modelado. Conta zerada por enquanto.
  const employeeCountByPosition: Record<string, number> = useMemo(() => ({}), [])

  const handleInitializeAreas = () => {
    const newAreas: Area[] = AREA_DEFAULTS.map((a) => ({ id: uid(), name: a.name, type: a.type }))
    update((s) => ({ ...s, areas: [...s.areas, ...newAreas] }))
  }

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 2))
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.4))
  const handleZoomReset = () => setZoom(1)

  const totalPositions = store.positions.length
  const totalSubareas = store.subareas.length
  const hasAreas = store.areas.length > 0

  if (!hasAreas) {
    return (
      <div className="flex flex-col gap-6 animate-fade-in">
        <PageHeader title="Áreas e Cargos" description="Estrutura organizacional T (Aquisição · Entrega · Operação)." />
        <EmptyState
          icon={Building2}
          title="Estrutura T não configurada"
          description="Inicialize as 3 áreas padrão (Aquisição, Entrega, Operação) para começar."
          action={
            <button
              type="button"
              onClick={handleInitializeAreas}
              className="gradient-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Inicializar Estrutura T
            </button>
          }
        />
      </div>
    )
  }

  const sortedAreas = [...store.areas].sort((a, b) => {
    const order: Record<AreaType, number> = { acquisition: 0, delivery: 1, operation: 2 }
    return order[a.type] - order[b.type]
  })

  return (
    <div className="flex flex-col gap-4 animate-fade-in h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">Áreas e Cargos</h1>
          <p className="text-sm text-muted-foreground">
            {store.areas.length} área{store.areas.length !== 1 ? 's' : ''} · {totalSubareas} subárea{totalSubareas !== 1 ? 's' : ''} · {totalPositions} cargo{totalPositions !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              placeholder="Buscar área, subárea ou cargo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[220px] rounded-lg border border-input bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-card">
            <ZoomBtn onClick={handleZoomOut} title="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></ZoomBtn>
            <span className="text-xs text-muted-foreground w-10 text-center font-medium">{Math.round(zoom * 100)}%</span>
            <ZoomBtn onClick={handleZoomIn} title="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></ZoomBtn>
            <ZoomBtn onClick={handleZoomReset} title="Reset zoom"><Maximize2 className="w-3.5 h-3.5" /></ZoomBtn>
          </div>
        </div>
      </div>

      {/* Tree canvas */}
      <div className="bg-card rounded-2xl border border-border shadow-[var(--shadow-sm)] overflow-auto flex-1 min-h-[500px]">
        <div className="p-8 min-w-fit transition-transform duration-200" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
          {/* CEO Card */}
          <div className="flex flex-col items-center">
            <div
              onClick={() => setShowCeoDetail(true)}
              className="relative rounded-xl border border-border bg-card p-3 w-full max-w-[210px] select-none cursor-pointer entity-card-hover"
            >
              <div className="flex items-start gap-2.5">
                <div className="h-10 w-10 rounded-full bg-primary/10 ring-2 ring-border/20 flex items-center justify-center text-primary font-bold flex-shrink-0">
                  <Crown className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <Crown className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <h3 className="text-sm font-semibold text-foreground truncate leading-tight">
                      {ceoPosition?.title || 'CEO'}
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">Nível executivo</p>
                </div>
              </div>
              <span className="absolute top-2 right-2 inline-flex items-center rounded-md bg-secondary text-secondary-foreground px-1.5 py-0 text-2xs font-semibold">CEO</span>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
                <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
                  <Building2 className="w-3 h-3" /> Executivo
                </span>
              </div>
            </div>
          </div>

          {/* Vertical connector */}
          <div className="flex justify-center"><div className="w-px h-8 bg-border" /></div>

          {/* Area Cards */}
          <div className="flex flex-wrap justify-center gap-8">
            {sortedAreas.map((area) => {
              const config = AREA_TYPE_CONFIG[area.type]
              const areaSubareas = store.subareas.filter((s) => s.area_id === area.id)
              const areaPositionCount = store.positions.filter((p) =>
                p.area_id === area.id && (p.subarea_id == null || areaSubareas.some((s) => s.id === p.subarea_id)),
              ).length

              return (
                <AreaCard
                  key={area.id}
                  area={area}
                  config={config}
                  subareas={areaSubareas}
                  positions={store.positions}
                  positionCount={areaPositionCount}
                  subareaCount={areaSubareas.length}
                  employeeCountByPosition={employeeCountByPosition}
                  search={search}
                  onAddSubarea={(name) => update((s) => ({ ...s, subareas: [...s.subareas, { id: uid(), name, area_id: area.id }] }))}
                  onAddPosition={(payload) => update((s) => ({ ...s, positions: [...s.positions, { id: uid(), level: 1, ...payload }] }))}
                  onDeleteSubarea={(subId) => update((s) => ({
                    ...s,
                    subareas: s.subareas.filter((x) => x.id !== subId),
                    positions: s.positions.filter((p) => p.subarea_id !== subId),
                  }))}
                  onUpdateSubarea={(subId, name) => update((s) => ({
                    ...s,
                    subareas: s.subareas.map((x) => x.id === subId ? { ...x, name } : x),
                  }))}
                  onDeletePosition={(posId) => update((s) => ({ ...s, positions: s.positions.filter((p) => p.id !== posId) }))}
                  onUpdatePosition={(posId, title) => update((s) => ({
                    ...s,
                    positions: s.positions.map((p) => p.id === posId ? { ...p, title } : p),
                  }))}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* CEO Detail */}
      <Modal open={showCeoDetail} onClose={() => setShowCeoDetail(false)} title={ceoPosition?.title || 'CEO'}>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Posição executiva no topo da hierarquia da plataforma.
          </p>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-2xs uppercase tracking-wider text-muted-foreground mb-1">Nível</p>
            <p className="text-sm font-medium text-foreground">Executivo</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/* ════════════════════════════════════════════
   AREA CARD
   ════════════════════════════════════════════ */

function AreaCard({
  area, config, subareas, positions, positionCount, subareaCount,
  employeeCountByPosition, search,
  onAddSubarea, onAddPosition, onDeleteSubarea, onUpdateSubarea, onDeletePosition, onUpdatePosition,
}: {
  area: Area
  config: { label: string; colorClass: string; dotClass: string }
  subareas: Subarea[]
  positions: Position[]
  positionCount: number
  subareaCount: number
  employeeCountByPosition: Record<string, number>
  search: string
  onAddSubarea: (name: string) => void
  onAddPosition: (payload: { title: string; area_id: string; subarea_id: string | null }) => void
  onDeleteSubarea: (id: string) => void
  onUpdateSubarea: (id: string, name: string) => void
  onDeletePosition: (id: string) => void
  onUpdatePosition: (id: string, title: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showDirectorDialog, setShowDirectorDialog] = useState(false)
  const [showSubareaDialog, setShowSubareaDialog] = useState(false)

  const areaPositions = positions.filter((p) => p.area_id === area.id && p.subarea_id == null)
  const searchLower = search.toLowerCase()
  const hasSearchMatch = !!searchLower && (
    area.name.toLowerCase().includes(searchLower) ||
    areaPositions.some((p) => p.title.toLowerCase().includes(searchLower)) ||
    subareas.some((s) => s.name.toLowerCase().includes(searchLower)) ||
    positions.filter((p) => subareas.some((s) => s.id === p.subarea_id)).some((p) => p.title.toLowerCase().includes(searchLower))
  )

  const isExpanded = expanded || hasSearchMatch
  const hasChildren = subareas.length > 0 || areaPositions.length > 0

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative rounded-xl border border-border bg-card p-3 w-full max-w-[210px] select-none cursor-pointer entity-card-hover group"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-2.5">
          <div className={cn('w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0', config.dotClass.replace('bg-', 'bg-') + '/15')}>
            <div className={cn('w-4 h-4 rounded-full', config.dotClass)} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={cn('text-sm font-semibold truncate leading-tight', config.colorClass)}>
              {area.name}
            </h3>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {subareaCount} subárea{subareaCount !== 1 ? 's' : ''} · {positionCount} cargo{positionCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
          <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
            <Layers className="w-3 h-3" /> {subareaCount}
          </span>
          <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
            <Briefcase className="w-3 h-3" /> {positionCount}
          </span>
          <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            <IconBtn title="Adicionar Diretor" onClick={() => setShowDirectorDialog(true)}>
              <Plus className="w-3 h-3" />
            </IconBtn>
          </div>
        </div>

        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors z-10"
            title={isExpanded ? 'Recolher' : 'Expandir'}
          >
            {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          </button>
        )}
      </div>

      {isExpanded && (
        <>
          <div className="w-px h-8 bg-border" />

          {areaPositions.length > 0 && (
            <div className="flex flex-col items-center gap-2 mb-6">
              {areaPositions.map((pos, i) => (
                <div key={pos.id} className="flex flex-col items-center">
                  {i > 0 && <div className="w-px h-2 bg-border" />}
                  <PositionLeaf
                    position={pos}
                    areaType={area.type}
                    employeeCount={employeeCountByPosition[pos.id] || 0}
                    subareaName="Diretoria"
                    areaName={area.name}
                    onDelete={() => onDeletePosition(pos.id)}
                    onUpdate={(title) => onUpdatePosition(pos.id, title)}
                  />
                </div>
              ))}
              <div className="w-px h-8 bg-border" />
            </div>
          )}

          {subareas.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-6">
              {subareas
                .filter((sub) => {
                  if (!searchLower) return true
                  if (sub.name.toLowerCase().includes(searchLower)) return true
                  return positions.filter((p) => p.subarea_id === sub.id).some((p) => p.title.toLowerCase().includes(searchLower))
                })
                .map((sub) => (
                  <div key={sub.id} className="flex flex-col items-center">
                    <SubareaNode
                      subarea={sub}
                      positions={positions.filter((p) => p.subarea_id === sub.id)}
                      areaType={area.type}
                      employeeCountByPosition={employeeCountByPosition}
                      search={search}
                      onAddPosition={(title) => onAddPosition({ title, area_id: area.id, subarea_id: sub.id })}
                      onDelete={() => onDeleteSubarea(sub.id)}
                      onUpdate={(name) => onUpdateSubarea(sub.id, name)}
                      onDeletePosition={onDeletePosition}
                      onUpdatePosition={onUpdatePosition}
                    />
                  </div>
                ))
              }
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-2">Nenhuma subárea</p>
          )}

          <button
            type="button"
            onClick={() => setShowSubareaDialog(true)}
            className={cn(
              'mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium transition-colors',
              'border-border text-muted-foreground hover:border-foreground hover:text-foreground',
            )}
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar subárea
          </button>
        </>
      )}

      {/* Add Director (area-level position) */}
      <NameDialog
        open={showDirectorDialog}
        onClose={() => setShowDirectorDialog(false)}
        title={`Novo diretor — ${area.name}`}
        placeholder="Ex: Diretor de Aquisição"
        onConfirm={(title) => onAddPosition({ title, area_id: area.id, subarea_id: null })}
      />

      {/* Add Subarea */}
      <NameDialog
        open={showSubareaDialog}
        onClose={() => setShowSubareaDialog(false)}
        title={`Nova subárea — ${area.name}`}
        placeholder="Ex: Marketing"
        onConfirm={(name) => onAddSubarea(name)}
      />
    </div>
  )
}

/* ════════════════════════════════════════════
   SUBAREA NODE
   ════════════════════════════════════════════ */

function SubareaNode({
  subarea, positions, areaType, search,
  onAddPosition, onDelete, onUpdate, onDeletePosition, onUpdatePosition,
}: {
  subarea: Subarea
  positions: Position[]
  areaType: AreaType
  employeeCountByPosition: Record<string, number>
  search: string
  onAddPosition: (title: string) => void
  onDelete: () => void
  onUpdate: (name: string) => void
  onDeletePosition: (id: string) => void
  onUpdatePosition: (id: string, title: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showPositionDialog, setShowPositionDialog] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const config = AREA_TYPE_CONFIG[areaType]
  const searchLower = search.toLowerCase()
  const hasSearchMatch = !!searchLower && (
    subarea.name.toLowerCase().includes(searchLower) ||
    positions.some((p) => p.title.toLowerCase().includes(searchLower))
  )
  const isExpanded = expanded || hasSearchMatch
  const hasChildren = positions.length > 0

  const filteredPositions = positions.filter((p) => {
    if (!searchLower) return true
    return p.title.toLowerCase().includes(searchLower) || subarea.name.toLowerCase().includes(searchLower)
  })

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative rounded-xl border border-border bg-card p-3 w-full max-w-[210px] select-none cursor-pointer entity-card-hover group"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-2.5">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <Layers className={cn('w-4 h-4', config.colorClass)} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate leading-tight">{subarea.name}</h3>
            <div className="flex items-center gap-1 mt-0.5">
              <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', config.dotClass)} />
              <span className="text-xs text-muted-foreground truncate">{config.label}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
          <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
            <Briefcase className="w-3 h-3" /> {positions.length} cargo{positions.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            <IconBtn title="Adicionar cargo" onClick={() => setShowPositionDialog(true)}>
              <Plus className="w-3 h-3" />
            </IconBtn>
            <IconBtn title="Editar subárea" onClick={() => setEditing(true)}>
              <Pencil className="w-3 h-3" />
            </IconBtn>
            <IconBtn title="Remover subárea" onClick={() => setConfirmDelete(true)} destructive>
              <Trash2 className="w-3 h-3" />
            </IconBtn>
          </div>
        </div>

        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors z-10"
            title={isExpanded ? 'Recolher' : 'Expandir'}
          >
            {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          </button>
        )}
      </div>

      {isExpanded && hasChildren && (
        <>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col items-center gap-2">
            {filteredPositions.map((pos, i) => (
              <div key={pos.id} className="flex flex-col items-center">
                {i > 0 && <div className="w-px h-2 bg-border" />}
                <PositionLeaf
                  position={pos}
                  areaType={areaType}
                  employeeCount={0}
                  subareaName={subarea.name}
                  areaName={config.label}
                  onDelete={() => onDeletePosition(pos.id)}
                  onUpdate={(title) => onUpdatePosition(pos.id, title)}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add position */}
      <NameDialog
        open={showPositionDialog}
        onClose={() => setShowPositionDialog(false)}
        title={`Novo cargo — ${subarea.name}`}
        placeholder="Ex: SDR Sênior"
        onConfirm={onAddPosition}
      />

      {/* Edit subarea */}
      <NameDialog
        open={editing}
        onClose={() => setEditing(false)}
        title="Editar subárea"
        placeholder={subarea.name}
        defaultValue={subarea.name}
        onConfirm={onUpdate}
      />

      {/* Confirm delete */}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Remover subárea?">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover <strong className="text-foreground">{subarea.name}</strong>? Todos os cargos vinculados também serão removidos.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => { onDelete(); setConfirmDelete(false) }}
              className="rounded-lg bg-danger hover:bg-danger/90 px-4 py-2 text-sm font-semibold text-destructive-foreground transition-colors"
            >
              Remover
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/* ════════════════════════════════════════════
   POSITION LEAF
   ════════════════════════════════════════════ */

function PositionLeaf({
  position, areaType, employeeCount, subareaName, areaName, onDelete, onUpdate,
}: {
  position: Position
  areaType: AreaType
  employeeCount: number
  subareaName: string
  areaName: string
  onDelete: () => void
  onUpdate: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const config = AREA_TYPE_CONFIG[areaType]

  return (
    <div className="relative rounded-xl border border-border bg-card p-3 w-full max-w-[210px] select-none entity-card-hover group">
      <div className="flex items-start gap-2.5">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <Briefcase className={cn('w-4 h-4', config.colorClass)} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate leading-tight">{position.title}</h3>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{areaName} › {subareaName}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
        <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
          <Briefcase className="w-3 h-3" /> {employeeCount} pessoa{employeeCount !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
          <IconBtn title="Editar cargo" onClick={() => setEditing(true)}>
            <Pencil className="w-3 h-3" />
          </IconBtn>
          <IconBtn title="Remover cargo" onClick={() => setConfirmDelete(true)} destructive>
            <Trash2 className="w-3 h-3" />
          </IconBtn>
        </div>
      </div>

      <NameDialog
        open={editing}
        onClose={() => setEditing(false)}
        title="Editar cargo"
        placeholder={position.title}
        defaultValue={position.title}
        onConfirm={onUpdate}
      />

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Remover cargo?">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover <strong className="text-foreground">{position.title}</strong>?
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40 transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={() => { onDelete(); setConfirmDelete(false) }} className="rounded-lg bg-danger hover:bg-danger/90 px-4 py-2 text-sm font-semibold text-destructive-foreground transition-colors">
              Remover
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/* ════════════════════════════════════════════
   AUX
   ════════════════════════════════════════════ */

function ZoomBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      {children}
    </button>
  )
}

function IconBtn({ onClick, title, children, destructive }: { onClick: () => void; title: string; children: React.ReactNode; destructive?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'h-5 w-5 inline-flex items-center justify-center rounded transition-colors',
        destructive
          ? 'text-muted-foreground hover:bg-danger-light hover:text-danger'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function NameDialog({
  open, onClose, title, placeholder, defaultValue = '', onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  placeholder: string
  defaultValue?: string
  onConfirm: (name: string) => void
}) {
  const [value, setValue] = useState(defaultValue)

  return (
    <Modal open={open} onClose={() => { onClose(); setValue(defaultValue) }} title={title}>
      <div className="space-y-4">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              onConfirm(value.trim())
              setValue('')
              onClose()
            }
          }}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { onClose(); setValue(defaultValue) }}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              if (!value.trim()) return
              onConfirm(value.trim())
              setValue('')
              onClose()
            }}
            disabled={!value.trim()}
            className="gradient-primary rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  )
}
