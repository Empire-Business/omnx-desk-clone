import { useCallback, useMemo, useState } from 'react'
import {
  Network, Search, ZoomIn, ZoomOut, Maximize2,
  ChevronDown, ChevronRight, Crown, Briefcase, CheckSquare,
} from 'lucide-react'
import { useUsers } from '@/hooks/useUsers'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import type { User, UserProfile } from '@/types/database'

/* ════════════════════════════════════════════
   HIERARQUIA SINTÉTICA POR PERFIL
   ════════════════════════════════════════════ */

interface PositionNode {
  id: UserProfile
  title: string
  level: number
  reports_to_id: UserProfile | null
  area_type: 'acquisition' | 'delivery' | 'operation' | ''
  children: PositionNode[]
}

// admin (CEO) → gerente → estrategista (Aquisição) | agente (Operação) | atendimento (Entrega) → cliente
const POSITION_TREE: PositionNode[] = [
  {
    id: 'admin', title: 'Administrador', level: 0, reports_to_id: null, area_type: '',
    children: [
      {
        id: 'gerente', title: 'Gerente', level: 1, reports_to_id: 'admin', area_type: '',
        children: [
          {
            id: 'estrategista', title: 'Estrategista', level: 2, reports_to_id: 'gerente', area_type: 'acquisition',
            children: [],
          },
          {
            id: 'atendimento', title: 'Atendimento', level: 2, reports_to_id: 'gerente', area_type: 'delivery',
            children: [
              { id: 'cliente', title: 'Cliente', level: 3, reports_to_id: 'atendimento', area_type: 'delivery', children: [] },
            ],
          },
        ],
      },
    ],
  },
]

interface OrgNode {
  position: PositionNode
  user: User
  children: OrgNode[]
}

function buildPeopleOrgChart(positionTree: PositionNode[], users: User[]): OrgNode[] {
  const profileToUsers = new Map<UserProfile, User[]>()
  for (const u of users) {
    if (!u.ativo) continue
    const list = profileToUsers.get(u.perfil) ?? []
    list.push(u)
    profileToUsers.set(u.perfil, list)
  }

  const processNode = (posNode: PositionNode): OrgNode[] => {
    const us = profileToUsers.get(posNode.id) ?? []
    const childNodes = posNode.children.flatMap(processNode)

    if (us.length === 0) {
      return childNodes
    }

    return us.map((u, i) => ({
      position: posNode,
      user: u,
      children: i === 0 ? childNodes : [],
    }))
  }

  const roots = positionTree.flatMap(processNode)

  const areaOrder = ['acquisition', 'delivery', 'operation']
  roots.sort((a, b) => {
    const ai = areaOrder.indexOf(a.position.area_type)
    const bi = areaOrder.indexOf(b.position.area_type)
    const av = ai < 0 ? 99 : ai
    const bv = bi < 0 ? 99 : bi
    if (av !== bv) return av - bv
    return (a.user.nome || '').localeCompare(b.user.nome || '')
  })

  const sortChildren = (nodes: OrgNode[]) => {
    nodes.sort((a, b) => (a.user.nome || '').localeCompare(b.user.nome || ''))
    nodes.forEach((n) => sortChildren(n.children))
  }
  roots.forEach((r) => sortChildren(r.children))

  return roots
}

/* ════════════════════════════════════════════
   AREA STYLES
   ════════════════════════════════════════════ */

const AREA_STYLES: Record<string, { dot: string; label: string }> = {
  acquisition: { dot: 'bg-area-acquisition', label: 'Aquisição' },
  delivery:    { dot: 'bg-area-delivery',    label: 'Entrega' },
  operation:   { dot: 'bg-area-operation',   label: 'Operação' },
}

const AREA_LABEL_COLORS: Record<string, string> = {
  acquisition: 'text-area-acquisition',
  delivery:    'text-area-delivery',
  operation:   'text-area-operation',
}

function getInitials(nome: string): string {
  const parts = nome.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/* ════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════ */

export function OrganogramaPage() {
  const { data: users, isLoading } = useUsers()
  const [search, setSearch] = useState('')
  const [zoom, setZoom] = useState(1)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  const tree = useMemo<OrgNode[]>(() => {
    if (!users) return []
    return buildPeopleOrgChart(POSITION_TREE, users)
  }, [users])

  const searchLower = search.toLowerCase()

  const matchesSearch = useCallback(
    (node: OrgNode) => {
      if (!searchLower) return true
      const { user, position } = node
      return !!(
        user.nome?.toLowerCase().includes(searchLower) ||
        position.title?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower)
      )
    },
    [searchLower],
  )

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 2))
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.4))
  const handleZoomReset = () => setZoom(1)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 animate-fade-in h-full">
        <PageHeader title="Organograma" />
        <div className="bg-card rounded-2xl border border-border min-h-[500px] p-8">
          <div className="flex flex-wrap justify-center gap-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-3">
                <div className="h-24 w-[210px] rounded-xl shimmer" />
                <div className="h-px w-px h-8 bg-border" />
                <div className="h-24 w-[210px] rounded-xl shimmer" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const hasContent = tree.length > 0

  return (
    <div className="flex flex-col gap-4 animate-fade-in h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">Organograma</h1>

        <div className="flex items-center gap-2">
          {hasContent && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                placeholder="Buscar pessoa ou cargo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-[220px] rounded-lg border border-input bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              />
            </div>
          )}
          <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-card">
            <ZoomBtn onClick={handleZoomOut} title="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></ZoomBtn>
            <span className="text-xs text-muted-foreground w-10 text-center font-medium">
              {Math.round(zoom * 100)}%
            </span>
            <ZoomBtn onClick={handleZoomIn} title="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></ZoomBtn>
            <ZoomBtn onClick={handleZoomReset} title="Reset zoom"><Maximize2 className="w-3.5 h-3.5" /></ZoomBtn>
          </div>
        </div>
      </div>

      {/* Org chart canvas */}
      {!hasContent ? (
        <div className="bg-card rounded-2xl border border-border shadow-[var(--shadow-sm)] min-h-[500px] flex items-center justify-center">
          <EmptyState
            icon={Network}
            title="Organograma vazio"
            description="O organograma será gerado automaticamente quando colaboradores ativos forem cadastrados."
          />
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border shadow-[var(--shadow-sm)] overflow-auto flex-1 min-h-[500px]">
          <div
            className="p-8 min-w-fit transition-transform duration-200"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
          >
            <div className="flex flex-wrap justify-center gap-8 px-4 py-6">
              {tree.map((node) => {
                const areaType = node.position.area_type
                const areaLabel = AREA_STYLES[areaType]?.label
                const areaLabelColor = AREA_LABEL_COLORS[areaType] || 'text-muted-foreground'
                const areaDot = AREA_STYLES[areaType]?.dot || 'bg-muted-foreground'

                return (
                  <div key={`${node.position.id}-${node.user.id}`} className="flex flex-col items-center">
                    {areaLabel && (
                      <div className="flex items-center gap-2 mb-3">
                        <div className={cn('w-3 h-3 rounded-full', areaDot)} />
                        <span className={cn('text-sm font-semibold', areaLabelColor)}>{areaLabel}</span>
                      </div>
                    )}
                    <OrgBranch
                      node={node}
                      collapsed={collapsed}
                      toggleCollapse={toggleCollapse}
                      matchesSearch={matchesSearch}
                      searchActive={!!searchLower}
                      onSelect={setSelectedUser}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      <Modal
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title={selectedUser?.nome ?? 'Colaborador'}
      >
        {selectedUser && <OrgDetail user={selectedUser} />}
      </Modal>
    </div>
  )
}

/* ════════════════════════════════════════════
   ORG BRANCH (recursive)
   ════════════════════════════════════════════ */

interface OrgBranchProps {
  node: OrgNode
  collapsed: Set<string>
  toggleCollapse: (id: string) => void
  matchesSearch: (node: OrgNode) => boolean
  searchActive: boolean
  onSelect: (user: User) => void
}

function OrgBranch({ node, collapsed, toggleCollapse, matchesSearch, searchActive, onSelect }: OrgBranchProps) {
  const { position, user, children } = node
  const isCeo = position.level === 0
  const branchKey = `${position.id}-${user.id}`
  const isCollapsed = collapsed.has(branchKey)
  const hasChildren = children.length > 0
  const dimmed = searchActive && !matchesSearch(node)

  return (
    <div className="flex flex-col items-center">
      <OrgNodeCard
        node={node}
        hasChildren={hasChildren}
        isCollapsed={isCollapsed}
        onToggle={() => toggleCollapse(branchKey)}
        onClick={() => onSelect(user)}
        dimmed={dimmed}
        isCeo={isCeo}
      />

      {hasChildren && !isCollapsed && (
        <>
          <div className="w-px h-8 bg-border" />
          {children.length === 1 ? (
            <OrgBranch
              node={children[0]}
              collapsed={collapsed}
              toggleCollapse={toggleCollapse}
              matchesSearch={matchesSearch}
              searchActive={searchActive}
              onSelect={onSelect}
            />
          ) : (
            <div className="flex flex-col items-center">
              <div className="flex">
                {children.map((child, i) => (
                  <div
                    key={`${child.position.id}-${child.user.id}`}
                    className="flex flex-col items-center"
                    style={{ minWidth: 220 }}
                  >
                    <div className="flex w-full">
                      <div className={cn('h-px flex-1', i === 0 ? 'bg-transparent' : 'bg-border')} />
                      <div className={cn('h-px flex-1', i === children.length - 1 ? 'bg-transparent' : 'bg-border')} />
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <OrgBranch
                      node={child}
                      collapsed={collapsed}
                      toggleCollapse={toggleCollapse}
                      matchesSearch={matchesSearch}
                      searchActive={searchActive}
                      onSelect={onSelect}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   ORG NODE CARD
   ════════════════════════════════════════════ */

interface OrgNodeCardProps {
  node: OrgNode
  hasChildren: boolean
  isCollapsed: boolean
  onToggle: () => void
  onClick: () => void
  dimmed?: boolean
  isCeo?: boolean
}

function OrgNodeCard({ node, hasChildren, isCollapsed, onToggle, onClick, dimmed, isCeo }: OrgNodeCardProps) {
  const { position, user } = node
  const areaStyle = AREA_STYLES[position.area_type] || { dot: 'bg-muted-foreground', label: '' }

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative rounded-xl border border-border bg-card p-3 w-[210px] select-none cursor-pointer entity-card-hover',
        dimmed && 'opacity-30',
        !user.ativo && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-2.5">
        {user.foto_url ? (
          <img
            src={user.foto_url}
            alt={user.nome}
            className="h-10 w-10 rounded-full object-cover ring-2 ring-border/30 flex-shrink-0"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-primary/10 ring-2 ring-border/20 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
            {getInitials(user.nome)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {isCeo && <Crown className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
            <h3 className="text-sm font-semibold text-foreground truncate leading-tight">
              {user.nome || 'Sem nome'}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{position.title}</p>
          {areaStyle.label && (
            <div className="flex items-center gap-1 mt-1">
              <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', areaStyle.dot)} />
              <span className="text-2xs text-muted-foreground truncate">{areaStyle.label}</span>
            </div>
          )}
        </div>
      </div>

      {/* CEO badge */}
      {isCeo && (
        <span className="absolute top-2 right-2 inline-flex items-center rounded-md bg-secondary text-secondary-foreground px-1.5 py-0 text-2xs font-semibold">
          CEO
        </span>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-2xs font-medium',
          user.ativo ? 'bg-success-light text-success' : 'bg-muted text-muted-foreground',
        )}>
          <span className={cn('w-1.5 h-1.5 rounded-full', user.ativo ? 'bg-success' : 'bg-muted-foreground')} />
          {user.ativo ? 'Ativo' : 'Inativo'}
        </span>
        <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
          <Briefcase className="w-3 h-3" /> 0
        </span>
        <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
          <CheckSquare className="w-3 h-3" /> 0
        </span>
      </div>

      {hasChildren && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors z-10"
          title={isCollapsed ? 'Expandir' : 'Recolher'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          )}
        </button>
      )}
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

function OrgDetail({ user }: { user: User }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {user.foto_url ? (
          <img src={user.foto_url} alt={user.nome} className="h-16 w-16 rounded-full object-cover ring-2 ring-border/30" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-primary/10 ring-2 ring-border/20 flex items-center justify-center text-primary font-bold">
            {getInitials(user.nome)}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground truncate">{user.nome}</h2>
          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
        </div>
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground mb-1">Perfil</p>
        <p className="text-sm font-medium text-foreground capitalize">{user.perfil}</p>
      </div>
    </div>
  )
}
