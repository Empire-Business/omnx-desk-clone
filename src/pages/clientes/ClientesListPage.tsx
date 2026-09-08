import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Plus, Search, Instagram, MessageSquare, Building2,
  Sparkles, ChevronRight, LayoutGrid, List as ListIcon, ShieldCheck, Star,
  Filter, X,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useClientes, useAllContracts, useCatalogProducts } from '@/hooks/useClientes'
import { useClientAvatars } from '@/hooks/useInstagramStats'
import { useAssignments } from '@/hooks/useUsers'
import { ClienteForm } from '@/components/clientes/ClienteForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import type { Client } from '@/types/database'

type StatusFilter = 'todos' | 'ativos' | 'inativos'
type ViewMode = 'grid' | 'list'

function cleanName(nome: string) {
  return nome.replace(/\s*\[MERGED\]\s*/gi, '').trim()
}

function getInitials(nome: string) {
  return cleanName(nome)
    .split(/\s+/)
    .filter(Boolean)
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function normalizeIg(ig: string | null | undefined) {
  if (!ig) return null
  let h = ig.trim()
  const m = h.match(/instagram\.com\/([^/?#]+)/i)
  if (m) h = m[1]
  return h.replace(/^@+/, '').replace(/\/+$/, '') || null
}

function formatPhone(raw: string | null | undefined) {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return raw
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const dd = digits.slice(2, 4)
    const rest = digits.slice(4)
    const half = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4)
    const tail = rest.slice(half.length)
    return `(${dd}) ${half}-${tail}`
  }
  return raw
}

type TeamMember = { id: string; nome: string; tipo: 'estrategista' | 'atendimento' }

function StatCard({
  icon: Icon, label, value, color = 'primary',
}: {
  icon: React.ElementType
  label: string
  value: number | string
  color?: 'primary' | 'success' | 'warning' | 'accent'
}) {
  const colorMap = {
    primary: { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20' },
    success: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/20' },
    warning: { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/20' },
    accent: { bg: 'bg-accent/10', text: 'text-accent', border: 'border-accent/20' },
  }[color]

  return (
    <div className={cn('glass-card border p-4 flex items-center gap-3', colorMap.border)}>
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', colorMap.bg)}>
        <Icon className={cn('h-5 w-5', colorMap.text)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <p className="text-xl font-extrabold text-foreground tabular-nums leading-tight">{value}</p>
      </div>
    </div>
  )
}

function TeamAvatars({ team }: { team: TeamMember[] }) {
  if (team.length === 0) return null
  const shown = team.slice(0, 3)
  const extra = team.length - shown.length
  return (
    <div className="flex items-center gap-1">
      <div className="flex -space-x-1.5">
        {shown.map(m => (
          <div
            key={m.id}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border-2 border-card text-[10px] font-bold',
              m.tipo === 'estrategista' ? 'bg-accent/20 text-accent' : 'bg-success/20 text-success',
            )}
            title={`${m.nome} (${m.tipo})`}
          >
            {m.nome.charAt(0).toUpperCase()}
          </div>
        ))}
        {extra > 0 && (
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-bold text-muted-foreground">
            +{extra}
          </div>
        )}
      </div>
    </div>
  )
}

function ClienteRichCard({
  client, avatarUrl, team, onClick,
}: {
  client: Client
  avatarUrl: string | null | undefined
  team: TeamMember[]
  onClick: () => void
}) {
  const nome = cleanName(client.nome)
  const initials = getInitials(nome)
  const ig = normalizeIg(client.instagram)
  const phone = formatPhone(client.whatsapp ?? client.telefone)
  const [imgFailed, setImgFailed] = useState(false)
  const showImage = !!avatarUrl && !imgFailed

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative w-full h-full text-left rounded-xl border border-border bg-card p-5',
        'flex flex-col transition-all duration-200',
        'hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5',
        !client.ativo && 'opacity-70',
      )}
    >
      {/* Decorative gradient */}
      <div className="pointer-events-none absolute -top-10 -right-10 h-24 w-24 rounded-full bg-primary/5 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          {showImage ? (
            <img
              src={avatarUrl!}
              alt={nome}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="h-14 w-14 rounded-full object-cover border-2 border-border group-hover:border-primary/40 transition-colors"
            />
          ) : (
            <div className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full text-base font-extrabold border-2 transition-colors',
              client.ativo
                ? 'bg-gradient-to-br from-primary/15 to-accent/15 text-primary border-border group-hover:border-primary/40'
                : 'bg-muted text-muted-foreground border-border',
            )}>
              {initials || '?'}
            </div>
          )}
          {client.nota != null && (
            <span
              className={cn(
                'absolute -bottom-1 -right-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold border-2 border-card',
                client.nota >= 9 ? 'bg-success text-white' :
                client.nota >= 7 ? 'bg-accent text-white' :
                client.nota >= 5 ? 'bg-warning text-white' : 'bg-danger text-white',
              )}
              title={`Nota: ${client.nota}/10`}
            >
              <Star className="h-2.5 w-2.5 fill-current" />
              {client.nota}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-sm text-foreground leading-tight line-clamp-2">{nome}</h3>
            <span
              className={cn(
                'mt-1 h-2 w-2 shrink-0 rounded-full ring-2 ring-card',
                client.ativo ? 'bg-success' : 'bg-muted-foreground/40',
              )}
              title={client.ativo ? 'Ativo' : 'Inativo'}
            />
          </div>

          {(client.empresa || client.segmento) && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
              {client.empresa && (
                <span className="inline-flex items-center gap-1 min-w-0">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{client.empresa}</span>
                </span>
              )}
              {client.empresa && client.segmento && <span className="text-muted-foreground/40">·</span>}
              {client.segmento && <span className="truncate flex-1 min-w-0">{client.segmento}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Contact pills */}
      {(phone || ig) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 min-h-[26px]">
          {phone && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-2xs font-medium text-foreground">
              <MessageSquare className="h-3 w-3 text-success" />
              <span className="font-mono">{phone}</span>
            </span>
          )}
          {ig && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-2xs font-medium text-foreground">
              <Instagram className="h-3 w-3 text-pink-500" />
              <span>@{ig}</span>
            </span>
          )}
        </div>
      )}

      {/* Footer: team + action — sempre no fundo */}
      <div className="mt-auto pt-3 border-t border-border/60 flex items-center justify-between">
        {team.length > 0 ? (
          <TeamAvatars team={team} />
        ) : (
          <span className="text-2xs text-muted-foreground italic">Sem equipe vinculada</span>
        )}
        <span className="inline-flex items-center gap-0.5 text-2xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">
          Ver detalhes
          <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>
    </button>
  )
}

function ClienteRow({
  client, avatarUrl, team, onClick,
}: {
  client: Client
  avatarUrl: string | null | undefined
  team: TeamMember[]
  onClick: () => void
}) {
  const nome = cleanName(client.nome)
  const initials = getInitials(nome)
  const ig = normalizeIg(client.instagram)
  const phone = formatPhone(client.whatsapp ?? client.telefone)
  const [imgFailed, setImgFailed] = useState(false)
  const showImage = !!avatarUrl && !imgFailed

  return (
    <button
      onClick={onClick}
      className={cn(
        'group w-full text-left rounded-lg border border-border bg-card px-4 py-3',
        'flex items-center gap-4 transition-all hover:border-primary/40 hover:bg-muted/30',
        !client.ativo && 'opacity-70',
      )}
    >
      {showImage ? (
        <img src={avatarUrl!} alt={nome} loading="lazy" onError={() => setImgFailed(true)}
          className="h-10 w-10 shrink-0 rounded-full object-cover border border-border" />
      ) : (
        <div className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          client.ativo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}>
          {initials || '?'}
        </div>
      )}

      <div className="min-w-0 flex-1 grid grid-cols-12 gap-3 items-center">
        <div className="col-span-12 sm:col-span-4 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', client.ativo ? 'bg-success' : 'bg-muted-foreground/40')} />
            <p className="font-semibold text-sm text-foreground truncate">{nome}</p>
          </div>
          {client.empresa && <p className="text-xs text-muted-foreground truncate mt-0.5">{client.empresa}</p>}
        </div>
        <div className="col-span-6 sm:col-span-3 min-w-0">
          {client.segmento && <p className="text-xs text-muted-foreground truncate">{client.segmento}</p>}
        </div>
        <div className="col-span-6 sm:col-span-3 min-w-0 flex flex-col gap-0.5">
          {phone && (
            <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground truncate">
              <MessageSquare className="h-3 w-3 text-success" /> <span className="font-mono">{phone}</span>
            </span>
          )}
          {ig && (
            <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground truncate">
              <Instagram className="h-3 w-3 text-pink-500" /> @{ig}
            </span>
          )}
        </div>
        <div className="col-span-12 sm:col-span-2 flex items-center justify-end gap-2">
          <TeamAvatars team={team} />
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </button>
  )
}

export function ClientesListPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ativos')
  const [modalOpen, setModalOpen] = useState(false)
  const [view, setView] = useState<ViewMode>('grid')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [produtoFilter, setProdutoFilter] = useState<string>('')
  const [segmentoFilter, setSegmentoFilter] = useState<string>('')
  const [nichoFilter, setNichoFilter] = useState<string>('')
  const [assinaturaDe, setAssinaturaDe] = useState<string>('')
  const [assinaturaAte, setAssinaturaAte] = useState<string>('')
  const [cadastroDe, setCadastroDe] = useState<string>('')
  const [cadastroAte, setCadastroAte] = useState<string>('')
  const navigate = useNavigate()
  const { user: authUser } = useAuth()
  const { can } = usePermissoes()
  // "Vê a carteira inteira?" virou regra editável em /admin (recurso
  // clientes.carteira). Antes era `admin || gerente` fixo no código.
  const isAdminOrGerente = can('clientes.carteira', 'ver')
  const { data: clients, isLoading } = useClientes()
  const { data: avatarByClient } = useClientAvatars()
  const { data: assignments } = useAssignments()
  const { data: contracts } = useAllContracts()
  const { data: catalogProducts } = useCatalogProducts()

  const teamByClient = useMemo(() => {
    const m = new Map<string, TeamMember[]>()
    for (const a of assignments ?? []) {
      if (!a.users) continue
      const arr = m.get(a.client_id) ?? []
      arr.push({ id: a.users.id, nome: a.users.nome, tipo: a.tipo as 'estrategista' | 'atendimento' })
      m.set(a.client_id, arr)
    }
    return m
  }, [assignments])

  const contractsByClient = useMemo(() => {
    const m = new Map<string, { produto: string | null; data_assinatura: string | null }[]>()
    for (const c of contracts ?? []) {
      const arr = m.get(c.client_id) ?? []
      arr.push({ produto: c.produto, data_assinatura: c.data_assinatura })
      m.set(c.client_id, arr)
    }
    return m
  }, [contracts])

  const produtoOptions = useMemo(() => {
    const s = new Set<string>()
    for (const c of contracts ?? []) if (c.produto?.trim()) s.add(c.produto.trim())
    for (const p of catalogProducts ?? []) if (p.nome?.trim()) s.add(p.nome.trim())
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [contracts, catalogProducts])

  const segmentoOptions = useMemo(() => {
    const s = new Set<string>()
    for (const c of clients ?? []) if (c.segmento?.trim()) s.add(c.segmento.trim())
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [clients])

  const nichoOptions = useMemo(() => {
    const s = new Set<string>()
    for (const c of clients ?? []) if (c.nicho?.trim()) s.add(c.nicho.trim())
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [clients])

  const activeFiltersCount =
    (produtoFilter ? 1 : 0) + (segmentoFilter ? 1 : 0) +
    (nichoFilter ? 1 : 0) + (assinaturaDe ? 1 : 0) + (assinaturaAte ? 1 : 0) +
    (cadastroDe ? 1 : 0) + (cadastroAte ? 1 : 0)

  const clearFilters = () => {
    setProdutoFilter(''); setSegmentoFilter(''); setNichoFilter('')
    setAssinaturaDe(''); setAssinaturaAte('')
    setCadastroDe(''); setCadastroAte('')
  }

  const filtered = useMemo(() => {
    if (!clients) return []
    let result = clients
    if (statusFilter === 'ativos') result = result.filter(c => c.ativo)
    if (statusFilter === 'inativos') result = result.filter(c => !c.ativo)
    const q = search.toLowerCase()
    if (q) {
      result = result.filter(c =>
        c.nome.toLowerCase().includes(q) ||
        (c.segmento?.toLowerCase().includes(q) ?? false) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.empresa?.toLowerCase().includes(q) ?? false) ||
        (c.instagram?.toLowerCase().includes(q) ?? false)
      )
    }
    if (segmentoFilter) result = result.filter(c => c.segmento === segmentoFilter)
    if (nichoFilter) result = result.filter(c => c.nicho === nichoFilter)
    if (cadastroDe) result = result.filter(c => c.criado_em && c.criado_em.slice(0, 10) >= cadastroDe)
    if (cadastroAte) result = result.filter(c => c.criado_em && c.criado_em.slice(0, 10) <= cadastroAte)
    if (produtoFilter || assinaturaDe || assinaturaAte) {
      result = result.filter(c => {
        const cs = contractsByClient.get(c.id) ?? []
        return cs.some(ct => {
          if (produtoFilter && ct.produto !== produtoFilter) return false
          if (assinaturaDe && (!ct.data_assinatura || ct.data_assinatura < assinaturaDe)) return false
          if (assinaturaAte && (!ct.data_assinatura || ct.data_assinatura > assinaturaAte)) return false
          return true
        })
      })
    }
    return [...result].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [clients, search, statusFilter, segmentoFilter, nichoFilter, produtoFilter, assinaturaDe, assinaturaAte, cadastroDe, cadastroAte, contractsByClient])

  const stats = useMemo(() => {
    if (!clients) return { total: 0, ativos: 0, inativos: 0, comInstagram: 0, comEquipe: 0 }
    let ativos = 0, comInstagram = 0, comEquipe = 0
    for (const c of clients) {
      if (c.ativo) ativos++
      if (normalizeIg(c.instagram)) comInstagram++
      if ((teamByClient.get(c.id)?.length ?? 0) > 0) comEquipe++
    }
    return {
      total: clients.length,
      ativos,
      inativos: clients.length - ativos,
      comInstagram,
      comEquipe,
    }
  }, [clients, teamByClient])

  return (
    <div className="space-y-4 lg:space-y-5">
      <PageHeader
        title="Clientes"
        description={clients
          ? isAdminOrGerente
            ? `${clients.length} cliente${clients.length !== 1 ? 's' : ''} no total`
            : `Você está acompanhando ${clients.length} cliente${clients.length !== 1 ? 's' : ''}`
          : 'Gerencie seus clientes'}
        action={
          <button onClick={() => setModalOpen(true)}
            className="gradient-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" />
            Novo cliente
          </button>
        }
      />

      {/* Hero stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Total" value={stats.total} color="primary" />
        <StatCard icon={Sparkles} label="Ativos" value={stats.ativos} color="success" />
        <StatCard icon={Instagram} label="Com Instagram" value={stats.comInstagram} color="accent" />
        <StatCard icon={ShieldCheck} label="Com equipe" value={stats.comEquipe} color="warning" />
      </div>

      {/* Toolbar: search + filters + view toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, empresa, segmento ou @handle..."
            className="w-full rounded-lg border border-input bg-card pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
          />
        </div>

        <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
          {([
            { key: 'todos', label: `Todos (${stats.total})` },
            { key: 'ativos', label: `Ativos (${stats.ativos})` },
            { key: 'inativos', label: `Inativos (${stats.inativos})` },
          ] as const).map(opt => (
            <button
              key={opt.key}
              onClick={() => setStatusFilter(opt.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                statusFilter === opt.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setFiltersOpen(o => !o)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            filtersOpen || activeFiltersCount > 0
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Filtros
          {activeFiltersCount > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {activeFiltersCount}
            </span>
          )}
        </button>

        <div className="ml-auto flex items-center rounded-lg border border-border bg-card p-0.5">
          <button
            onClick={() => setView('grid')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              view === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            title="Visualização em cards"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Cards
          </button>
          <button
            onClick={() => setView('list')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            title="Visualização em lista"
          >
            <ListIcon className="h-3.5 w-3.5" />
            Lista
          </button>
        </div>
      </div>

      {filtersOpen && (
        <div className="glass-card border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filtros avançados</h3>
            {activeFiltersCount > 0 && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-2xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> Limpar
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
            <div>
              <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Produto</label>
              <select
                value={produtoFilter}
                onChange={e => setProdutoFilter(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Todos</option>
                {produtoOptions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Ramo</label>
              <select
                value={segmentoFilter}
                onChange={e => setSegmentoFilter(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Todos</option>
                {segmentoOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Nicho</label>
              <select
                value={nichoFilter}
                onChange={e => setNichoFilter(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Todos</option>
                {nichoOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Cadastrado de</label>
              <input
                type="date"
                value={cadastroDe}
                onChange={e => setCadastroDe(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Cadastrado até</label>
              <input
                type="date"
                value={cadastroAte}
                onChange={e => setCadastroAte(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Assinatura de</label>
              <input
                type="date"
                value={assinaturaDe}
                onChange={e => setAssinaturaDe(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Assinatura até</label>
              <input
                type="date"
                value={assinaturaAte}
                onChange={e => setAssinaturaAte(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className={cn(
          view === 'grid'
            ? 'grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            : 'flex flex-col gap-2',
        )}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={cn('glass-card shimmer', view === 'grid' ? 'h-44' : 'h-16')} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
          description={search ? 'Tente outros termos de busca.' : 'Comece adicionando o primeiro cliente.'}
          action={!search ? (
            <button onClick={() => setModalOpen(true)}
              className="gradient-primary rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
              Novo cliente
            </button>
          ) : undefined}
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((client, i) => (
            <div key={client.id} className="stagger-enter" style={{ animationDelay: `${i * 20}ms` }}>
              <ClienteRichCard
                client={client}
                avatarUrl={avatarByClient?.get(client.id)}
                team={teamByClient.get(client.id) ?? []}
                onClick={() => navigate(`/clientes/${client.id}`)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((client, i) => (
            <div key={client.id} className="stagger-enter" style={{ animationDelay: `${i * 10}ms` }}>
              <ClienteRow
                client={client}
                avatarUrl={avatarByClient?.get(client.id)}
                team={teamByClient.get(client.id) ?? []}
                onClick={() => navigate(`/clientes/${client.id}`)}
              />
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo cliente" size="md">
        <ClienteForm onClose={() => setModalOpen(false)} />
      </Modal>
    </div>
  )
}
