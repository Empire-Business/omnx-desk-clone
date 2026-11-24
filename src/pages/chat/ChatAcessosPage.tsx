import { useState, useMemo } from 'react'
import { Users, Smartphone, Search, User, ChevronDown, ChevronRight, Building2, Plus, X, UserPlus } from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import {
  useUsers,
  useInstanceAssignments,
  useAssignments,
  useCreateAssignment,
  useDeleteAssignment,
  useDepartmentsWithManagers,
  useUpdateUserDepartment,
} from '@/hooks/useUsers'
import { useInstances, useDeptAgentAssignmentsByUser } from '@/hooks/useChat'
import type { User as UserType } from '@/types/database'

const ROLE_ACCESS: Record<string, { label: string; description: string; color: string }> = {
  admin: { label: 'Admin', description: 'Acesso total a todas as conversas e números', color: 'bg-st-open text-st-open-fg' },
  gerente: { label: 'Gerente', description: 'Acesso total a todas as conversas e números', color: 'bg-info-light text-info' },
  agente: { label: 'Agente', description: 'Acesso aos números dos departamentos atribuídos', color: 'bg-success-light text-success' },
  atendimento: { label: 'Atendimento', description: 'Acesso a todos os números atribuídos', color: 'bg-iris-light text-iris-fg' },
  estrategista: { label: 'Estrategista', description: 'Acesso apenas aos clientes atribuídos', color: 'bg-warning-light text-warning' },
  cliente: { label: 'Cliente', description: 'Acesso limitado ao portal', color: 'bg-muted text-muted-foreground' },
}

type ViewMode = 'por-departamento' | 'por-usuario' | 'por-instancia'

export default function ChatAcessosPage() {
  const { user } = useAuth()
  const { can } = usePermissoes()
  const isAdmin = can('chat', 'admin')

  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('por-departamento')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [assigningClientFor, setAssigningClientFor] = useState<string | null>(null) // userId
  const [addingMemberTo, setAddingMemberTo] = useState<string | null>(null) // deptId

  const { data: users = [], isLoading: usersLoading } = useUsers()
  const { data: instances = [], isLoading: instancesLoading } = useInstances()
  const { data: instanceAssignments = [] } = useInstanceAssignments()
  const { data: clientAssignments = [] } = useAssignments()
  const { data: departments = [], isLoading: deptsLoading } = useDepartmentsWithManagers()
  const { data: myDeptAssignments = [] } = useDeptAgentAssignmentsByUser(user?.id ?? '')
  const createAssignment = useCreateAssignment()
  const deleteAssignment = useDeleteAssignment()
  const updateUserDept = useUpdateUserDepartment()

  const isLoading = usersLoading || instancesLoading || deptsLoading

  // Gerente: only see departments they manage
  const myDeptIds = useMemo(() => {
    if (isAdmin) return null // null = all
    return new Set(myDeptAssignments.filter(a => a.is_gerente).map(a => a.department_id))
  }, [isAdmin, myDeptAssignments])

  const visibleDepartments = useMemo(() => {
    if (!myDeptIds) return departments // admin sees all
    return departments.filter(d => myDeptIds.has(d.id))
  }, [departments, myDeptIds])

  const chatUsers = useMemo(() => {
    const base = users.filter(u => u.ativo && ['admin', 'gerente', 'atendimento', 'estrategista'].includes(u.perfil))
    if (!myDeptIds) return base // admin sees all
    // Gerente: only see users in their departments
    const deptUserIds = new Set(base.filter(u => u.department_id && myDeptIds.has(u.department_id)).map(u => u.id))
    // Also include self
    deptUserIds.add(user?.id ?? '')
    return base.filter(u => deptUserIds.has(u.id))
  }, [users, myDeptIds, user?.id])

  // Clients not yet assigned to a given user
  useAssignments()
  const assignedClientIds = useMemo(() => {
    if (!assigningClientFor) return new Set<string>()
    return new Set(
      clientAssignments
        .filter(a => a.user_id === assigningClientFor)
        .map(a => a.client_id),
    )
  }, [assigningClientFor, clientAssignments])

  // Users not yet in this dept
  const usersNotInDept = useMemo(() => {
    if (!addingMemberTo) return []
    return chatUsers.filter(u =>
      u.department_id !== addingMemberTo &&
      ['estrategista', 'atendimento'].includes(u.perfil),
    )
  }, [addingMemberTo, chatUsers])

  const userInstanceMap = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; numero_whatsapp: string | null }[]>()
    for (const u of chatUsers) {
      if (u.perfil === 'admin' || u.perfil === 'gerente') {
        map.set(u.id, instances.map(i => ({ id: i.id, nome: i.nome, numero_whatsapp: i.numero_whatsapp })))
      } else {
        const assigned = instanceAssignments
          .filter(a => a.user_id === u.id && a.whatsapp_instances)
          .map(a => ({ id: a.whatsapp_instances!.id, nome: a.whatsapp_instances!.nome, numero_whatsapp: a.whatsapp_instances!.numero_whatsapp ?? null }))
        map.set(u.id, assigned)
      }
    }
    return map
  }, [chatUsers, instances, instanceAssignments])

  const userClientMap = useMemo(() => {
    const map = new Map<string, { id: string; assignmentId: string; nome: string }[]>()
    for (const u of chatUsers) {
      // Admin entra porque pode ser estrategista de clientes (vínculo em client_assignments).
      if (u.perfil === 'estrategista' || u.perfil === 'gerente' || u.perfil === 'admin') {
        const assigned = clientAssignments
          .filter(a => a.user_id === u.id && a.clients)
          .map(a => ({ id: a.clients!.id, assignmentId: a.id, nome: a.clients!.nome }))
        map.set(u.id, assigned)
      } else {
        map.set(u.id, [])
      }
    }
    return map
  }, [chatUsers, clientAssignments])

  const instanceUserMap = useMemo(() => {
    const map = new Map<string, UserType[]>()
    for (const inst of instances) {
      const usersWithAccess = chatUsers.filter(u => {
        const userInstances = userInstanceMap.get(u.id) ?? []
        return userInstances.some(i => i.id === inst.id)
      })
      map.set(inst.id, usersWithAccess)
    }
    return map
  }, [instances, chatUsers, userInstanceMap])

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return chatUsers
    const q = search.toLowerCase()
    return chatUsers.filter(u =>
      u.nome.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (ROLE_ACCESS[u.perfil]?.label ?? '').toLowerCase().includes(q),
    )
  }, [chatUsers, search])

  const filteredInstances = useMemo(() => {
    if (!search.trim()) return instances
    const q = search.toLowerCase()
    return instances.filter(i =>
      i.nome.toLowerCase().includes(q) ||
      (i.numero_whatsapp ?? '').includes(q),
    )
  }, [instances, search])

  const filteredDepts = useMemo(() => {
    if (!search.trim()) return visibleDepartments
    const q = search.toLowerCase()
    return visibleDepartments.filter(d =>
      d.nome.toLowerCase().includes(q) ||
      (d.gerente?.nome ?? '').toLowerCase().includes(q),
    )
  }, [visibleDepartments, search])

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Get clients not yet assigned to a user (unique clients from all assignments)
  const allUniqueClients = useMemo(() => {
    const seen = new Set<string>()
    return clientAssignments
      .filter(a => a.clients && !seen.has(a.clients.id) && seen.add(a.clients.id))
      .map(a => ({ id: a.clients!.id, nome: a.clients!.nome }))
  }, [clientAssignments])

  return (
    <div>
      <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6 md:px-8">
        {/* Header */}
        <PageHeader
          className="mb-4 sm:mb-6"
          title="Quem vê cada número"
          description="Filas, equipe e clientes de cada pessoa: define quais conversas cada um enxerga."
        />

        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              placeholder="Buscar fila, pessoa ou número…"
              aria-label="Buscar"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input !pl-9"
            />
          </div>
          {/* Segmentado do DS: rola de lado se não couber */}
          <div className="seg" role="group" aria-label="Ver por">
            <button
              type="button"
              onClick={() => setViewMode('por-departamento')}
              aria-pressed={viewMode === 'por-departamento'}
              className="max-sm:!h-9"
            >
              <Building2 className="h-3.5 w-3.5" aria-hidden />
              Por fila
            </button>
            <button
              type="button"
              onClick={() => setViewMode('por-usuario')}
              aria-pressed={viewMode === 'por-usuario'}
              className="max-sm:!h-9"
            >
              <User className="h-3.5 w-3.5" aria-hidden />
              Por pessoa
            </button>
            <button
              type="button"
              onClick={() => setViewMode('por-instancia')}
              aria-pressed={viewMode === 'por-instancia'}
              className="max-sm:!h-9"
            >
              <Smartphone className="h-3.5 w-3.5" aria-hidden />
              Por número
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Carregando acessos">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-card ring-hairline px-4 py-3.5">
                <div className="sk h-8 w-8 rounded-lg" />
                <div className="sk h-3.5 w-40 max-w-[50%]" />
              </div>
            ))}
          </div>
        ) : viewMode === 'por-departamento' ? (
          /* ── View: Por Departamento ──────────────────────────── */
          <div className="space-y-3">
            {filteredDepts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum departamento encontrado</p>
            ) : (
              filteredDepts.map((dept) => {
                const membros = chatUsers.filter(u => u.department_id === dept.id)
                const isExpanded = expandedIds.has(dept.id)
                const isAddingMember = addingMemberTo === dept.id

                return (
                  <div key={dept.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    {/* Dept header */}
                    <button
                      onClick={() => toggleExpand(dept.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-muted">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{dept.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {dept.gerente ? `Gerente: ${dept.gerente.nome}` : 'Sem gerente definido'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-foreground">{membros.length} membros</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border bg-muted/20">
                        {/* Gerente row */}
                        {dept.gerente && (
                          <div className="px-4 py-3 border-b border-border/60">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Gerente</p>
                            <div className="flex items-center gap-2.5 rounded-lg bg-background border border-border px-3 py-2 w-fit">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info-light text-info font-semibold text-[11px]">
                                {dept.gerente.nome.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-xs font-medium text-foreground">{dept.gerente.nome}</p>
                                <p className="text-[11px] text-muted-foreground">{dept.gerente.email}</p>
                              </div>
                              <span className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-info-light text-info">
                                Gerente
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Members */}
                        <div className="px-4 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                              Membros ({membros.length})
                            </p>
                            <button
                              onClick={() => setAddingMemberTo(isAddingMember ? null : dept.id)}
                              className="flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                            >
                              <UserPlus className="h-3 w-3" />
                              Adicionar membro
                            </button>
                          </div>

                          {/* Add member picker */}
                          {isAddingMember && (
                            <div className="mb-3 rounded-lg border border-border bg-background p-3">
                              <p className="text-xs font-medium text-foreground mb-2">Selecionar usuário para adicionar:</p>
                              {usersNotInDept.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Nenhum usuário disponível</p>
                              ) : (
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  {usersNotInDept.map(u => (
                                    <button
                                      key={u.id}
                                      onClick={() => {
                                        updateUserDept.mutate({ userId: u.id, departmentId: dept.id })
                                        setAddingMemberTo(null)
                                      }}
                                      className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted transition-colors"
                                    >
                                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary font-semibold text-[11px]">
                                        {u.nome.slice(0, 2).toUpperCase()}
                                      </div>
                                      <span className="text-xs font-medium text-foreground flex-1">{u.nome}</span>
                                      <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-medium', ROLE_ACCESS[u.perfil]?.color)}>
                                        {ROLE_ACCESS[u.perfil]?.label ?? u.perfil}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {membros.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">Nenhum membro neste departamento</p>
                          ) : (
                            <div className="space-y-2">
                              {membros.map(u => {
                                const role = ROLE_ACCESS[u.perfil]
                                const userClients = userClientMap.get(u.id) ?? []
                                const isAssigning = assigningClientFor === u.id

                                return (
                                  <div key={u.id} className="rounded-lg border border-border bg-background">
                                    <div className="flex items-center gap-2.5 px-3 py-2">
                                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary font-semibold text-[11px]">
                                        {u.nome.slice(0, 2).toUpperCase()}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium text-foreground">{u.nome}</p>
                                        <p className="text-[11px] text-muted-foreground">{u.email}</p>
                                      </div>
                                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', role?.color)}>
                                        {role?.label ?? u.perfil}
                                      </span>
                                      {(u.perfil === 'estrategista' || u.perfil === 'gerente') && (
                                        <button
                                          onClick={() => setAssigningClientFor(isAssigning ? null : u.id)}
                                          className="rounded-md px-2 py-1 text-[11px] font-medium border border-dashed border-warning/40 text-warning hover:bg-warning-light transition-colors"
                                        >
                                          <Plus className="h-3 w-3 inline mr-0.5" />
                                          Cliente
                                        </button>
                                      )}
                                    </div>

                                    {/* Client list for estrategista/gerente */}
                                    {(u.perfil === 'estrategista' || u.perfil === 'gerente') && (userClients.length > 0 || isAssigning) && (
                                      <div className="px-3 pb-2 border-t border-border/50 pt-2">
                                        {userClients.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5 mb-2">
                                            {userClients.map(c => (
                                              <span
                                                key={c.id}
                                                className="inline-flex items-center gap-1 rounded-lg bg-warning-light border border-warning/25 px-2 py-0.5 text-[11px]"
                                              >
                                                <User className="h-2.5 w-2.5 text-warning" />
                                                <span className="font-medium text-warning">{c.nome}</span>
                                                <button
                                                  onClick={() => deleteAssignment.mutate(c.assignmentId)}
                                                  className="ml-0.5 text-warning/70 hover:text-danger transition-colors"
                                                >
                                                  <X className="h-2.5 w-2.5" />
                                                </button>
                                              </span>
                                            ))}
                                          </div>
                                        )}

                                        {/* Client picker */}
                                        {isAssigning && (
                                          <div className="rounded-md border border-border bg-muted/30 p-2">
                                            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Atribuir cliente:</p>
                                            {allUniqueClients.filter(c => !assignedClientIds.has(c.id)).length === 0 ? (
                                              <p className="text-[11px] text-muted-foreground italic">Todos os clientes já atribuídos</p>
                                            ) : (
                                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                                {allUniqueClients
                                                  .filter(c => !assignedClientIds.has(c.id))
                                                  .map(c => (
                                                    <button
                                                      key={c.id}
                                                      onClick={() => {
                                                        createAssignment.mutate({ client_id: c.id, user_id: u.id, tipo: 'estrategista' })
                                                        setAssigningClientFor(null)
                                                      }}
                                                      className="w-full flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-background transition-colors text-[11px]"
                                                    >
                                                      <User className="h-3 w-3 text-warning" />
                                                      <span className="font-medium">{c.nome}</span>
                                                    </button>
                                                  ))}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        ) : viewMode === 'por-usuario' ? (
          /* ── View: Por Usuário ─────────────────────────────────── */
          <div className="space-y-2">
            {filteredUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum usuário encontrado</p>
            ) : (
              filteredUsers.map((u) => {
                const role = ROLE_ACCESS[u.perfil]
                const userInstances = userInstanceMap.get(u.id) ?? []
                const userClients = userClientMap.get(u.id) ?? []
                const isFullAccess = u.perfil === 'admin' || u.perfil === 'gerente'
                const isExpanded = expandedIds.has(u.id)
                const dept = departments.find(d => d.id === u.department_id)

                return (
                  <div key={u.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    <button
                      onClick={() => toggleExpand(u.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary font-semibold text-sm">
                        {u.nome.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{u.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {u.email}
                          {dept && <span className="ml-2 text-[11px] font-medium text-primary">· {dept.nome}</span>}
                        </p>
                      </div>
                      <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium', role?.color)}>
                        {role?.label ?? u.perfil}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-foreground">
                          {isFullAccess ? `Todas (${instances.length})` : userInstances.length}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-3">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {role?.description}
                        </p>
                        <div>
                          <p className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                            <Smartphone className="h-3.5 w-3.5" />
                            Números ({isFullAccess ? 'Todas' : userInstances.length})
                          </p>
                          {isFullAccess ? (
                            <p className="text-xs text-muted-foreground pl-5">Acesso a todos os {instances.length} números</p>
                          ) : userInstances.length === 0 ? (
                            <p className="text-xs text-muted-foreground pl-5 italic">Nenhum número atribuído</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 pl-5">
                              {userInstances.map(inst => (
                                <span key={inst.id} className="inline-flex items-center gap-1 rounded-lg bg-background border border-border px-2 py-1 text-xs">
                                  <Smartphone className="h-3 w-3 text-primary" />
                                  <span className="font-medium">{inst.nome}</span>
                                  {inst.numero_whatsapp && <span className="text-muted-foreground font-mono text-[11px]">{formatPhone(inst.numero_whatsapp)}</span>}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {(u.perfil === 'estrategista' || u.perfil === 'gerente') && (
                          <div>
                            <p className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5" />
                              Clientes ({userClients.length})
                            </p>
                            {userClients.length === 0 ? (
                              <p className="text-xs text-muted-foreground pl-5 italic">Nenhum cliente atribuído</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 pl-5">
                                {userClients.map(c => (
                                  <span key={c.id} className="inline-flex items-center gap-1 rounded-lg bg-background border border-border px-2 py-1 text-xs">
                                    <User className="h-3 w-3 text-warning" />
                                    <span className="font-medium">{c.nome}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        ) : (
          /* ── View: Por Instância ─────────────────────────────── */
          <div className="space-y-2">
            {filteredInstances.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum número encontrado</p>
            ) : (
              filteredInstances.map((inst) => {
                const usersWithAccess = instanceUserMap.get(inst.id) ?? []
                const isExpanded = expandedIds.has(inst.id)

                return (
                  <div key={inst.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    <button
                      onClick={() => toggleExpand(inst.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                      <div className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                        inst.status === 'conectado' ? 'bg-success-light text-success' : 'bg-muted text-muted-foreground',
                      )}>
                        <Smartphone className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{inst.nome}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {formatPhone(inst.numero_whatsapp) ?? 'Sem número'}
                          {inst.categoria && <span className="ml-2 font-sans text-[11px] uppercase tracking-wider">{inst.categoria}</span>}
                        </p>
                      </div>
                      <div className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', inst.status === 'conectado' ? 'bg-success-light text-success' : 'bg-muted text-muted-foreground')}>
                        {inst.status}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-foreground">{usersWithAccess.length}</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border px-4 py-3 bg-muted/20">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Usuários com acesso ({usersWithAccess.length})
                        </p>
                        {usersWithAccess.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Nenhuma pessoa tem acesso a este número</p>
                        ) : (
                          <div className="space-y-1.5">
                            {usersWithAccess.map(u => {
                              const role = ROLE_ACCESS[u.perfil]
                              return (
                                <div key={u.id} className="flex items-center gap-2.5 rounded-lg bg-background border border-border px-3 py-2">
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary font-semibold text-[11px]">
                                    {u.nome.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-foreground">{u.nome}</p>
                                    <p className="text-[11px] text-muted-foreground">{u.email}</p>
                                  </div>
                                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', role?.color)}>
                                    {role?.label ?? u.perfil}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Legend */}
        <div className="mt-8 rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Regras de acesso por perfil
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(ROLE_ACCESS).map(([key, role]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0', role.color)}>
                  {role.label}
                </span>
                <span className="text-xs text-muted-foreground">{role.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
