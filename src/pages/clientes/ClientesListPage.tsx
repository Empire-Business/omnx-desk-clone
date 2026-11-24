import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Plus, Search, Instagram, MessageSquare, Building2,
  Sparkles, ChevronRight, LayoutGrid, List as ListIcon, ShieldCheck, Star,
  Filter, X,
} from 'lucide-react'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useClientes, useAllContracts, useCatalogProducts } from '@/hooks/useClientes'
import { useClientAvatars } from '@/hooks/useInstagramStats'
import { useAssignments } from '@/hooks/useUsers'
import { ClienteForm } from '@/components/clientes/ClienteForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
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

function tomAvatar(chave: string): string {
  return 'c' + ([...chave].reduce((soma, ch) => (soma * 31 + ch.charCodeAt(0)) >>> 0, 7) % 8 + 1)
}

/**
 * Foto do Instagram quando existe; sem foto, com erro ou com imagem vazia,
 * as iniciais na cor do cliente ficam por baixo — nunca um círculo vazio.
 */
function AvatarCliente({ nome, chave, foto, tamanho }: {
  nome: string
  chave: string
  foto?: string | null
  tamanho?: 'xs' | 'lg'
}) {
  const [falhou, setFalhou] = useState(false)
  return (
    <span className="cl-av-stack">
      <span className={cn('cl-av', tamanho, tomAvatar(chave))} aria-hidden="true">{getInitials(nome) || '·'}</span>
      {foto && !falhou && (
        <img src={foto} alt="" className={cn('cl-av', tamanho)} onError={() => setFalhou(true)} />
      )}
    </span>
  )
}

/** Cabeçalho de colunas do painel de lista — mesmas colunas das linhas. */
function CabecalhoLista() {
  return (
    <div className="cl-grid cll-grid cl-thead" aria-hidden="true">
      <span>Cliente</span>
      <span>Contato</span>
      <span className="cll-ramo">Empresa / ramo</span>
      <span className="cll-equipe">Equipe</span>
      <span />
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
              'flex h-6 w-6 items-center justify-center rounded-full border-2 border-card text-[11px] font-bold',
              m.tipo === 'estrategista' ? 'bg-primary-muted text-link' : 'bg-success/20 text-success',
            )}
            title={`${m.nome} (${m.tipo})`}
          >
            {m.nome.charAt(0).toUpperCase()}
          </div>
        ))}
        {extra > 0 && (
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[11px] font-bold text-muted-foreground">
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
  const ig = normalizeIg(client.instagram)
  const phone = formatPhone(client.whatsapp ?? client.telefone)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'cl-card group w-full text-left flex flex-col gap-3',
        'transition-colors hover:border-primary/40',
        !client.ativo && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        <AvatarCliente nome={nome} chave={client.id} foto={avatarUrl} tamanho="lg" />
        <div className="min-w-0 flex-1">
          <p className="cl-name truncate" title={nome}>{nome}</p>
          <p className="cl-quiet flex items-center gap-1.5 min-w-0">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', client.ativo ? 'bg-success' : 'bg-muted-foreground/40')} />
            <span className="truncate">{client.ativo ? 'Ativo' : 'Inativo'}</span>
            {client.nota != null && (
              <span
                className={cn(
                  'ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0 text-2xs font-bold',
                  client.nota >= 9 ? 'bg-success text-white' :
                  client.nota >= 7 ? 'bg-primary text-primary-foreground' :
                  client.nota >= 5 ? 'bg-warning text-white' : 'bg-danger text-white',
                )}
                title={`Nota: ${client.nota}/10`}
              >
                <Star className="h-2.5 w-2.5 fill-current" />
                {client.nota}
              </span>
            )}
          </p>
        </div>
      </div>

      {(client.empresa || client.segmento) && (
        <div className="cl-quiet flex items-center gap-1.5 min-w-0">
          {client.empresa && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{client.empresa}</span>
            </span>
          )}
          {client.empresa && client.segmento && <span className="opacity-40">·</span>}
          {client.segmento && <span className="truncate flex-1 min-w-0">{client.segmento}</span>}
        </div>
      )}

      {(phone || ig) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {phone && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
              <MessageSquare className="h-3 w-3 text-success" /> <span className="font-mono">{phone}</span>
            </span>
          )}
          {ig && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
              <Instagram className="h-3 w-3 text-pink-500" />
              <span className="truncate">@{ig}</span>
            </span>
          )}
        </div>
      )}

      {/* Rodapé em uma linha: o time encolhe com reticências, a ação nunca quebra */}
      <div className="mt-auto pt-3 border-t border-border flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 truncate">
          {team.length > 0 ? (
            <TeamAvatars team={team} />
          ) : (
            <span className="text-2xs text-muted-foreground italic">Sem equipe vinculada</span>
          )}
        </span>
        <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-0.5 text-2xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">
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
  const ig = normalizeIg(client.instagram)
  const phone = formatPhone(client.whatsapp ?? client.telefone)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('cl-grid cll-grid cl-row group w-full text-left', !client.ativo && 'opacity-70')}
    >
      <div className="cl-who cll-quem">
        <AvatarCliente nome={nome} chave={client.id} foto={avatarUrl} tamanho="xs" />
        <div className="min-w-0">
          <p className="cl-name truncate" title={nome}>{nome}</p>
          <p className="cl-quiet flex items-center gap-1.5 min-w-0">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', client.ativo ? 'bg-success' : 'bg-muted-foreground/40')} />
            <span className="truncate">{client.ativo ? 'Ativo' : 'Inativo'}</span>
          </p>
        </div>
      </div>

      <div className="cll-contato">
        {phone && (
          <span className="cl-quiet inline-flex min-w-0 items-center gap-1">
            <MessageSquare className="h-3 w-3 shrink-0 text-success" />
            <span className="font-mono truncate">{phone}</span>
          </span>
        )}
        {ig && (
          <span className="cl-quiet inline-flex min-w-0 items-center gap-1">
            <Instagram className="h-3 w-3 shrink-0 text-pink-500" />
            <span className="truncate">@{ig}</span>
          </span>
        )}
        {!phone && !ig && <span className="cl-quiet">—</span>}
      </div>

      <div className="cll-ramo">
        {client.empresa && <span className="cl-quiet truncate">{client.empresa}</span>}
        {client.segmento && <span className="cl-quiet truncate">{client.segmento}</span>}
        {!client.empresa && !client.segmento && <span className="cl-quiet">—</span>}
      </div>

      <div className="cll-equipe">
        {team.length > 0 ? <TeamAvatars team={team} /> : <span className="cl-quiet italic">Sem equipe</span>}
      </div>

      <div className="cll-acao">
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
    </button>
  )
}

export function ClientesListPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ativos')
  const [modalOpen, setModalOpen] = useState(false)
  const [view, setView] = useState<ViewMode>('list')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [produtoFilter, setProdutoFilter] = useState<string>('')
  const [segmentoFilter, setSegmentoFilter] = useState<string>('')
  const [nichoFilter, setNichoFilter] = useState<string>('')
  const [assinaturaDe, setAssinaturaDe] = useState<string>('')
  const [assinaturaAte, setAssinaturaAte] = useState<string>('')
  const [cadastroDe, setCadastroDe] = useState<string>('')
  const [cadastroAte, setCadastroAte] = useState<string>('')
  const navigate = useNavigate()
  const { can } = usePermissoes()
  // "Vê a carteira inteira?" virou regra editável em /admin (recurso
  // clientes.carteira). Antes era `admin || gerente` fixo no código.
  const isAdminOrGerente = can('clientes.carteira', 'ver')
  const { data: clients, isLoading, isError, isFetching, refetch } = useClientes()
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
    <PageContainer className="cl-page gap-5 md:gap-6">
      <PageHeader
        title="Clientes"
        description={clients
          ? isAdminOrGerente
            ? <><b>{clients.length} cliente{clients.length !== 1 ? 's' : ''}</b> no total · {stats.ativos} ativo{stats.ativos !== 1 ? 's' : ''}</>
            : <>Você está acompanhando <b>{clients.length} cliente{clients.length !== 1 ? 's' : ''}</b></>
          : 'Gerencie seus clientes'}
        action={
          <button onClick={() => setModalOpen(true)} className="btn btn-primary">
            <Plus aria-hidden />
            Novo cliente
          </button>
        }
      />

      {/* Faixa de números: os mesmos números que a página já calcula, sem cartões */}
      <dl className="cl-strip" aria-label="Resumo da carteira">
        <div>
          <dt><Users aria-hidden />Clientes</dt>
          <dd>
            <span className="v">{stats.total}</span>
            <span className="quem">{isAdminOrGerente ? 'na carteira' : 'no seu acompanhamento'}</span>
          </dd>
        </div>
        <div>
          <dt><Sparkles aria-hidden />Ativos</dt>
          <dd>
            <span className="v">{stats.ativos}</span>
            <span className="quem">{stats.inativos} inativo{stats.inativos !== 1 ? 's' : ''}</span>
          </dd>
        </div>
        <div>
          <dt><Instagram aria-hidden />Com Instagram</dt>
          <dd>
            <span className="v">{stats.comInstagram}</span>
            <span className="quem">@handle preenchido</span>
          </dd>
        </div>
        <div>
          <dt><ShieldCheck aria-hidden />Com equipe</dt>
          <dd>
            <span className="v">{stats.comEquipe}</span>
            <span className="quem">estrategista ou atendimento</span>
          </dd>
        </div>
      </dl>

      {/* Controles: abas em pílula, busca, filtros e modo */}
      <div className="cl-controls">
        <div className="cl-views" role="group" aria-label="Situação do cliente">
          {([
            { key: 'todos', label: 'Todos', n: stats.total },
            { key: 'ativos', label: 'Ativos', n: stats.ativos },
            { key: 'inativos', label: 'Inativos', n: stats.inativos },
          ] as const).map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setStatusFilter(opt.key)}
              aria-pressed={statusFilter === opt.key}
              className={cn('cl-tab', statusFilter === opt.key && 'on')}
            >
              {opt.label} <span className="n">{opt.n}</span>
            </button>
          ))}
        </div>

        <div className="cl-modo" role="group" aria-label="Modo de exibição">
          <button type="button" onClick={() => setView('list')} aria-pressed={view === 'list'} title="Modo lista">
            <ListIcon aria-hidden /><span>Lista</span>
          </button>
          <button type="button" onClick={() => setView('grid')} aria-pressed={view === 'grid'} title="Modo cartões">
            <LayoutGrid aria-hidden /><span>Cartões</span>
          </button>
        </div>

        <div className="cl-search">
          <Search aria-hidden />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar nome, empresa, e-mail ou @handle"
            aria-label="Buscar cliente por nome, empresa, e-mail, segmento ou @handle"
          />
        </div>

        <div className="cl-filters">
          <button
            type="button"
            onClick={() => setFiltersOpen(o => !o)}
            aria-expanded={filtersOpen}
            className={cn('cl-chip', activeFiltersCount > 0 && 'set')}
          >
            <Filter aria-hidden />
            Filtros
            {activeFiltersCount > 0 && <span className="n">{activeFiltersCount}</span>}
          </button>
        </div>
      </div>


      {filtersOpen && (
        <div className="cl-filtros space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="rot">Filtros avançados</h3>
            {activeFiltersCount > 0 && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-2xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> Limpar
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
            <div>
              <label className="rot">Produto</label>
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
              <label className="rot">Ramo</label>
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
              <label className="rot">Nicho</label>
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
              <label className="rot">Cadastrado de</label>
              <input
                type="date"
                value={cadastroDe}
                onChange={e => setCadastroDe(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="rot">Cadastrado até</label>
              <input
                type="date"
                value={cadastroAte}
                onChange={e => setCadastroAte(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="rot">Assinatura de</label>
              <input
                type="date"
                value={assinaturaDe}
                onChange={e => setAssinaturaDe(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="rot">Assinatura até</label>
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

      {/* Conteúdo */}
      {isError ? (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-5 space-y-3">
          <p className="text-sm text-danger">Não foi possível carregar os clientes. Seus cadastros não foram alterados.</p>
          <button type="button" onClick={() => void refetch()} disabled={isFetching}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50">
            {isFetching ? 'Tentando novamente…' : 'Tentar novamente'}
          </button>
        </div>
      ) : isLoading ? (
        view === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="cl-card h-40 shimmer" aria-hidden="true" />
            ))}
          </div>
        ) : (
          <div className="cl-panel" aria-busy="true" aria-label="Carregando clientes">
            <CabecalhoLista />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="cl-grid cll-grid cl-row">
                <div className="cl-who">
                  <span className="cl-av xs shimmer" aria-hidden="true" />
                  <span className="h-3 w-40 rounded shimmer" aria-hidden="true" />
                </div>
                <div /><div /><div /><div />
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
          description={search ? 'Tente outros termos de busca.' : 'Comece adicionando o primeiro cliente.'}
          action={!search ? (
            <button onClick={() => setModalOpen(true)} className="btn btn-primary">
              <Plus aria-hidden />
              Novo cliente
            </button>
          ) : undefined}
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
        <div className="cl-panel">
          <CabecalhoLista />
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

      <p className="cl-note">
        Foto do Instagram quando o cliente tem snapshot da conta; sem foto, iniciais na cor do cliente.
        A lista já vem filtrada pela aba escolhida; os cartões mostram a mesma carteira em blocos.
      </p>


      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo cliente" size="md">
        <ClienteForm onClose={() => setModalOpen(false)} />
      </Modal>
    </PageContainer>
  )
}
