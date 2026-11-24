import { useMemo, useState } from 'react'
import {
  Users, Plus, Search, Pencil, UserX, UserCheck, Filter, X, Circle,
  Mail, Crown, Download, AlertTriangle, Shield,
} from 'lucide-react'
import { useUsers, useUpdateUser } from '@/hooks/useUsers'
import { useDepartments } from '@/hooks/useChat'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { UserForm } from '@/components/usuarios/UserForm'
import { UserAccessPanel } from '@/components/usuarios/UserAccessPanel'
import { cn } from '@/lib/utils'
import type { User, UserProfile } from '@/types/database'

function relativeTime(iso: string | null): string {
  if (!iso) return 'Nunca acessou'
  const then = new Date(iso).getTime()
  const diffMs = Date.now() - then
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'Agora há pouco'
  if (min < 60) return `Há ${min}min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `Há ${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `Há ${day}d`
  if (day < 30) return `Há ${Math.floor(day / 7)} sem.`
  if (day < 365) return `Há ${Math.floor(day / 30)} mês`
  return `Há ${Math.floor(day / 365)} ano${Math.floor(day / 365) > 1 ? 's' : ''}`
}

const PROFILE_LABELS: Record<UserProfile, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  atendimento: 'Atendimento',
  estrategista: 'Estrategista',
  cliente: 'Cliente',
}

const PROFILE_TONE: Record<UserProfile, { dot: string; chip: string }> = {
  admin:        { dot: 'text-primary',          chip: 'bg-primary-muted text-primary' },
  gerente:      { dot: 'text-warning',          chip: 'bg-warning-light text-warning' },
  atendimento:  { dot: 'text-info',             chip: 'bg-info-light text-info' },
  estrategista: { dot: 'text-area-acquisition', chip: 'bg-area-acquisition-muted text-area-acquisition' },
  cliente:      { dot: 'text-muted-foreground', chip: 'bg-muted text-muted-foreground' },
}

function getInitials(nome: string): string {
  const parts = nome.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function exportCSV(users: User[]) {
  const header = ['Nome', 'Email', 'Perfil', 'Status', 'Cadastrado em']
  const rows = users.map((u) => [
    u.nome,
    u.email,
    PROFILE_LABELS[u.perfil],
    u.ativo ? 'Ativo' : 'Inativo',
    u.criado_em ? new Date(u.criado_em).toLocaleDateString('pt-BR') : '',
  ])
  const csv = [header, ...rows]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `colaboradores-${new Date().toISOString().split('T')[0]}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function ColaboradoresPage() {
  const { user: authUser } = useAuth()
  const { can } = usePermissoes()
  const { data: users, isLoading, isError } = useUsers()
  const { data: departments = [] } = useDepartments()
  const updateUser = useUpdateUser()

  const departmentById = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of departments) m.set(d.id, d.nome)
    return m
  }, [departments])

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [filterProfile, setFilterProfile] = useState<UserProfile | 'all'>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [formUser, setFormUser] = useState<User | undefined>(undefined)
  const [formOpen, setFormOpen] = useState(false)
  const [statusChangeUser, setStatusChangeUser] = useState<User | null>(null)
  const [statusReason, setStatusReason] = useState('')

  function openCreate() {
    setFormUser(undefined)
    setFormOpen(true)
  }

  function openEdit(user: User) {
    setFormUser(user)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setFormUser(undefined)
  }

  const stats = useMemo(() => {
    if (!users) return { active: 0, inactive: 0, total: 0 }
    const active = users.filter((u) => u.ativo).length
    return { active, inactive: users.length - active, total: users.length }
  }, [users])

  const isAdmin = can('colaboradores', 'admin')

  const filtered = useMemo(() => {
    if (!users) return []
    const q = search.toLowerCase().trim()
    return users.filter((u) => {
      // Inativos só visíveis para admin
      if (!isAdmin && !u.ativo) return false
      const matchSearch = !q ||
        u.nome.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        PROFILE_LABELS[u.perfil].toLowerCase().includes(q)
      const matchStatus = filterStatus === 'all' ||
        (filterStatus === 'active' && u.ativo) ||
        (filterStatus === 'inactive' && u.ativo === false && isAdmin)
      const matchProfile = filterProfile === 'all' || u.perfil === filterProfile
      return matchSearch && matchStatus && matchProfile
    })
  }, [users, search, filterStatus, filterProfile, isAdmin])

  const hasActiveFilters = filterStatus !== 'all' || filterProfile !== 'all'

  function clearFilters() {
    setFilterStatus('all')
    setFilterProfile('all')
  }

  async function handleStatusToggle() {
    if (!statusChangeUser) return
    try {
      const novoAtivo = !statusChangeUser.ativo
      await updateUser.mutateAsync({
        id: statusChangeUser.id,
        ativo: novoAtivo,
        // Ao inativar, registra trilha. Ao reativar, limpa.
        inativacao_motivo: novoAtivo ? null : (statusReason.trim() || null),
        inativacao_em: novoAtivo ? null : new Date().toISOString(),
        inativacao_por: novoAtivo ? null : (authUser?.id ?? null),
      })
      setStatusChangeUser(null)
      setStatusReason('')
    } catch {
      /* erro silencioso por enquanto */
    }
  }

  if (isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Erro ao carregar colaboradores"
        description="Não foi possível buscar os dados. Tente recarregar a página."
      />
    )
  }

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        title="Colaboradores"
        description={
          users
            ? `${filtered.length} colaborador${filtered.length !== 1 ? 'es' : ''}${hasActiveFilters || search ? ' (filtrado)' : ''}`
            : 'Gerencie a equipe da plataforma'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => users && exportCSV(filtered)}
              className="btn btn-secondary"
            >
              <Download aria-hidden /> CSV
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="btn btn-primary"
            >
              <Plus className="h-4 w-4" />
              Novo colaborador
            </button>
          </div>
        }
      />

      {/* Status counter chips */}
      {users && users.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setFilterStatus(filterStatus === 'active' ? 'all' : 'active')}
            className={cn(
              'inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors duration-fast md:min-h-8',
              filterStatus === 'active'
                ? 'bg-success-light border-success/40 text-success'
                : 'border-success/30 text-success hover:bg-success-light/50',
            )}
          >
            <Circle className="w-2 h-2 fill-current" /> {stats.active} ativos
          </button>
          {isAdmin && stats.inactive > 0 && (
            <button
              type="button"
              onClick={() => setFilterStatus(filterStatus === 'inactive' ? 'all' : 'inactive')}
              className={cn(
                'inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors duration-fast md:min-h-8',
                filterStatus === 'inactive'
                  ? 'bg-danger-light border-danger/40 text-danger'
                  : 'border-danger/30 text-danger hover:bg-danger-light/50',
              )}
            >
              <Circle className="w-2 h-2 fill-current" /> {stats.inactive} inativos
            </button>
          )}
        </div>
      )}

      {/* Search + filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, email ou perfil..."
              className="input w-full pl-9"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={cn(
              'btn',
              showFilters || hasActiveFilters ? 'btn-primary' : 'btn-secondary',
            )}
          >
            <Filter className="h-4 w-4" />
            Filtros
            {hasActiveFilters && (
              <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary text-primary-foreground text-[12px] font-semibold px-1">
                {(filterStatus !== 'all' ? 1 : 0) + (filterProfile !== 'all' ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[12.5px] font-semibold text-fg-2">Perfil</label>
                <select
                  value={filterProfile}
                  onChange={(e) => setFilterProfile(e.target.value as UserProfile | 'all')}
                  className="select w-full"
                >
                  <option value="all">Todos</option>
                  {(Object.keys(PROFILE_LABELS) as UserProfile[]).map((p) => (
                    <option key={p} value={p}>{PROFILE_LABELS[p]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[12.5px] font-semibold text-fg-2">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                  className="select w-full"
                >
                  <option value="all">Todos</option>
                  <option value="active">Ativos</option>
                  {isAdmin && <option value="inactive">Inativos</option>}
                </select>
              </div>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="btn btn-ghost btn-sm mt-3"
              >
                <X className="h-3 w-3" /> Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : !users || users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum colaborador cadastrado"
          description="Cadastre o primeiro colaborador para começar."
          action={
            <button
              type="button"
              onClick={openCreate}
              className="btn btn-primary"
            >
              Cadastrar colaborador
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nenhum resultado encontrado"
          description={hasActiveFilters || search ? 'Tente ajustar os filtros ou limpar a busca.' : 'Nenhum colaborador corresponde aos critérios.'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((user, i) => (
            <CollaboratorCard
              key={user.id}
              user={user}
              departmentName={user.department_id ? departmentById.get(user.department_id) ?? null : null}
              index={i}
              onClick={() => setSelectedUser(user)}
              onEdit={() => openEdit(user)}
              onChangeStatus={() => setStatusChangeUser(user)}
            />
          ))}
        </div>
      )}

      {/* Form modal: criar / editar */}
      <Modal
        open={formOpen}
        onClose={closeForm}
        title={formUser ? 'Editar colaborador' : 'Novo colaborador'}
        description={formUser ? 'Atualize os dados e gerencie acessos.' : 'Preencha os dados para cadastrar um novo colaborador.'}
        size="lg"
      >
        <div className="space-y-6">
          <UserForm initial={formUser} onClose={closeForm} />
          {formUser && (
            <>
              <div className="border-t border-border" />
              <div>
                <h3 className="text-sm font-bold text-foreground mb-1">Controle de Acesso</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Escolha quais números de WhatsApp e clientes este colaborador pode acessar.
                </p>
                <UserAccessPanel user={formUser} />
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title={selectedUser?.nome ?? 'Colaborador'}
      >
        {selectedUser && (
          <CollaboratorDetail
            user={selectedUser}
            departmentName={selectedUser.department_id ? departmentById.get(selectedUser.department_id) ?? null : null}
            inativadoPorNome={selectedUser.inativacao_por ? users?.find(u => u.id === selectedUser.inativacao_por)?.nome ?? null : null}
          />
        )}
      </Modal>

      {/* Status change modal */}
      <Modal
        open={!!statusChangeUser}
        onClose={() => { setStatusChangeUser(null); setStatusReason('') }}
        title={statusChangeUser?.ativo ? 'Inativar colaborador' : 'Reativar colaborador'}
      >
        {statusChangeUser && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {statusChangeUser.ativo
                ? <>Tem certeza que deseja inativar <strong className="text-foreground">{statusChangeUser.nome}</strong>? O usuário perde acesso ao sistema, mas seus dados permanecem.</>
                : <>Reativar <strong className="text-foreground">{statusChangeUser.nome}</strong>? O acesso ao sistema será restaurado.</>
              }
            </p>
            <div>
              <label className="mb-1.5 block text-[12.5px] font-semibold text-fg-2">
                Motivo (opcional)
              </label>
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                rows={3}
                placeholder="Registre o motivo dessa mudança..."
                className="textarea w-full"
              />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => { setStatusChangeUser(null); setStatusReason('') }}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleStatusToggle}
                disabled={updateUser.isPending}
                className={cn('btn', statusChangeUser.ativo ? 'btn-danger' : 'btn-primary')}
              >
                {updateUser.isPending ? 'Salvando...' : statusChangeUser.ativo ? 'Inativar' : 'Reativar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  )
}

// ─── Card ──────────────────────────────────────────────────────────────────

function CollaboratorCard({
  user,
  departmentName,
  index,
  onClick,
  onEdit,
  onChangeStatus,
}: {
  user: User
  departmentName: string | null
  index: number
  onClick: () => void
  onEdit: () => void
  onChangeStatus: () => void
}) {
  const tone = PROFILE_TONE[user.perfil]
  const isCeo = user.perfil === 'admin'

  return (
    <div
      onClick={onClick}
      style={{ animationDelay: `${index * 30}ms` }}
      className={cn(
        'group relative rounded-lg border border-border/60 bg-card p-5 cursor-pointer entity-card-hover stagger-enter',
        !user.ativo && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {user.foto_url ? (
            <img
              src={user.foto_url}
              alt={user.nome}
              className="h-12 w-12 rounded-full object-cover ring-2 ring-border/30"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-primary-muted ring-2 ring-border/20 flex items-center justify-center text-primary text-sm font-bold">
              {getInitials(user.nome)}
            </div>
          )}
          {isCeo && (
            <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-warning flex items-center justify-center">
              <Crown className="h-3 w-3 text-warning-foreground" />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <h3 className="t-h4 truncate text-foreground">{user.nome}</h3>
          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
            <Mail className="h-3 w-3 shrink-0" />
            {user.email}
          </p>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium', tone.chip)}>
              <Circle className={cn('h-2 w-2 fill-current', tone.dot)} />
              {PROFILE_LABELS[user.perfil]}
            </span>
            {departmentName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium text-muted-foreground border border-border">
                {departmentName}
              </span>
            )}
            {!user.ativo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger-light text-danger px-2 py-0.5 text-[12px] font-medium">
                <Circle className="h-2 w-2 fill-current" />
                Inativo
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
            {user.criado_em && (
              <span>Cadastrado em {new Date(user.criado_em).toLocaleDateString('pt-BR')}</span>
            )}
            <span className={cn('truncate', !user.last_seen_at && 'text-fg-4')}>
              {relativeTime(user.last_seen_at)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            title="Editar"
            aria-label="Editar colaborador" className="btn btn-ghost btn-icon"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChangeStatus() }}
            title={user.ativo ? 'Inativar' : 'Reativar'}
            aria-label={user.ativo ? 'Inativar colaborador' : 'Reativar colaborador'}
            className={cn(
              'btn btn-ghost btn-icon',
              user.ativo
                ? 'text-muted-foreground hover:bg-danger-light hover:text-danger'
                : 'text-muted-foreground hover:bg-success-light hover:text-success',
            )}
          >
            {user.ativo ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-card-border bg-card p-5">
      <div className="flex items-start gap-4">
        <div className="sk h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="sk h-4 w-32 rounded" />
          <div className="sk h-3 w-44 rounded" />
          <div className="sk mt-2 h-5 w-20 rounded-full" />
        </div>
      </div>
    </div>
  )
}

function CollaboratorDetail({
  user,
  departmentName,
  inativadoPorNome,
}: {
  user: User
  departmentName: string | null
  inativadoPorNome: string | null
}) {
  const tone = PROFILE_TONE[user.perfil]
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {user.foto_url ? (
          <img src={user.foto_url} alt={user.nome} className="h-16 w-16 rounded-full object-cover ring-2 ring-border/30" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-primary-muted ring-2 ring-border/20 flex items-center justify-center text-primary text-base font-bold">
            {getInitials(user.nome)}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="t-h3 truncate text-foreground">{user.nome}</h2>
          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-[12px] uppercase tracking-wider text-muted-foreground mb-1">Perfil</p>
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tone.chip)}>
            <Shield className="h-3 w-3" />
            {PROFILE_LABELS[user.perfil]}
          </span>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-[12px] uppercase tracking-wider text-muted-foreground mb-1">Status</p>
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            user.ativo ? 'bg-success-light text-success' : 'bg-danger-light text-danger',
          )}>
            <Circle className="h-2 w-2 fill-current" />
            {user.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-[12px] uppercase tracking-wider text-muted-foreground mb-1">Departamento</p>
          <p className="text-sm text-foreground">{departmentName ?? <span className="text-muted-foreground/60">—</span>}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-[12px] uppercase tracking-wider text-muted-foreground mb-1">Última atividade</p>
          <p className="text-sm text-foreground">{relativeTime(user.last_seen_at)}</p>
        </div>
        {user.criado_em && (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 col-span-2">
            <p className="text-[12px] uppercase tracking-wider text-muted-foreground mb-1">Cadastrado em</p>
            <p className="text-sm text-foreground">
              {new Date(user.criado_em).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}
        {!user.ativo && (user.inativacao_motivo || user.inativacao_em) && (
          <div className="rounded-lg border border-danger/30 bg-danger-light/40 p-3 col-span-2">
            <p className="text-[12px] uppercase tracking-wider text-danger mb-1">Inativação</p>
            {user.inativacao_em && (
              <p className="text-xs text-muted-foreground">
                {new Date(user.inativacao_em).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                {inativadoPorNome && <> · por {inativadoPorNome}</>}
              </p>
            )}
            {user.inativacao_motivo && (
              <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{user.inativacao_motivo}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
