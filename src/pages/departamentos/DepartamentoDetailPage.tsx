import { useParams, useNavigate, Link } from 'react-router-dom'
import { useState } from 'react'
import {
  ArrowLeft, Building2, Users, MessageSquare, Clock, TrendingUp,
  Timer, Crown, Circle, ChevronRight, CheckCircle2,
  User, Star, FileCheck, DollarSign, BarChart3,
  UserX, ShieldAlert, ThumbsUp, Plus, Trash2, X, Sparkles, Loader2, Send,
} from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'
import {
  useDepartments,
  useDeptMemberMetrics,
  useDeptActiveConversations,
  useDeptQueue,
  useDeptSlaViolations,
  useDeptClosedToday,
  useDeptCsatAvg,
  useDeptClientAssignments,
  useDeptPendingDeliveries,
  useDeptNpsAvg,
  useDeptAgentAssignments,
  useAddDeptAgent,
  useRemoveDeptAgent,
  useSummarizeForQueue,
} from '@/hooks/useChat'
import { useDevedores, useCobrancaSendMetrics } from '@/hooks/useCobranca'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useUsers } from '@/hooks/useUsers'
import type { DeptMemberMetric } from '@/hooks/useChat'

// ── Helpers ──────────────────────────────────────────────────────────────────

const PERFIL_LABEL: Record<string, string> = {
  admin: 'Admin', gerente: 'Gerente', agente: 'Agente',
  atendimento: 'Atendimento', estrategista: 'Estrategista', cliente: 'Cliente',
}

const STATUS_CONFIG = {
  aberta:         { label: 'Aberta',         color: 'text-muted-foreground', bg: 'bg-muted' },
  em_atendimento: { label: 'Em atendimento', color: 'text-info',             bg: 'bg-info-light' },
  aguardando:     { label: 'Aguardando',     color: 'text-warning',          bg: 'bg-warning-light' },
  encerrada:      { label: 'Encerrada',      color: 'text-success',          bg: 'bg-success-light' },
}

function fmt(iso: string) {
  const d = new Date(iso), now = new Date()
  const min = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (min < 1)  return 'agora'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24)   return `${h}h`
  return d.toLocaleDateString('pt-BR')
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string; value: string | number; sub?: string
  accent?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
}) {
  const colors = {
    primary: 'text-primary bg-primary/10', success: 'text-success bg-success-light',
    warning: 'text-warning bg-warning-light', danger: 'text-danger bg-danger/10',
    info: 'text-info bg-info-light',
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-4">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', accent ? colors[accent] : 'text-muted-foreground bg-muted')}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, icon: Icon, iconColor, count, action, children }: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  iconColor?: string; count?: number
  action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Icon className={cn('h-4 w-4', iconColor ?? 'text-muted-foreground')} />
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {count !== undefined && <span className="text-xs text-muted-foreground">{count}</span>}
          {action}
        </div>
      </div>
      {children}
    </div>
  )
}

// ── Members Table com gerenciamento ──────────────────────────────────────────

function MembersTable({
  members, loading, deptId, canManage,
}: {
  members: DeptMemberMetric[]; loading: boolean; deptId: string; canManage: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedIsGerente, setSelectedIsGerente] = useState(false)

  const { data: allUsers = [] } = useUsers()
  const { data: agentRows = [] } = useDeptAgentAssignments(deptId)
  const addDeptAgent = useAddDeptAgent()
  const removeDeptAgent = useRemoveDeptAgent()

  const memberIds = new Set(members.map(m => m.user_id))
  const availableUsers = allUsers.filter(u =>
    u.ativo && !memberIds.has(u.id) &&
    ['gerente', 'atendimento', 'estrategista'].includes(u.perfil)
  )

  const getAgentRowId = (userId: string) =>
    agentRows.find(r => r.user_id === userId)?.id

  return (
    <Section
      title="Membros da equipe"
      icon={Users}
      iconColor="text-primary"
      count={members.length}
      action={canManage && !adding ? (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          <Plus className="h-3 w-3" /> Adicionar
        </button>
      ) : undefined}
    >
      {/* Add member form */}
      {adding && (
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex flex-wrap items-center gap-2">
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="flex-1 min-w-[160px] rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Selecionar usuário...</option>
            {availableUsers.map(u => (
              <option key={u.id} value={u.id}>{u.nome} ({PERFIL_LABEL[u.perfil] ?? u.perfil})</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={selectedIsGerente}
              onChange={e => setSelectedIsGerente(e.target.checked)}
              className="h-3.5 w-3.5 accent-warning"
            />
            Gerente do dept
          </label>
          <button
            onClick={() => {
              if (!selectedUserId) return
              addDeptAgent.mutate(
                { department_id: deptId, user_id: selectedUserId, is_gerente: selectedIsGerente },
                { onSuccess: () => { setSelectedUserId(''); setSelectedIsGerente(false); setAdding(false) } }
              )
            }}
            disabled={!selectedUserId || addDeptAgent.isPending}
            className="rounded-lg px-3 py-1.5 text-xs font-medium gradient-primary text-primary-foreground disabled:opacity-50"
          >
            {addDeptAgent.isPending ? '...' : 'Salvar'}
          </button>
          <button onClick={() => { setAdding(false); setSelectedUserId('') }} className="text-xs text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <Users className="h-7 w-7 opacity-40" />
          <p className="text-sm">Nenhum membro</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1 sm:gap-2 px-2 sm:px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span>Membro</span>
            <span className="text-right w-12 sm:w-16">Msgs hoje</span>
            <span className="hidden sm:block text-right w-16">Semana</span>
            <span className="text-right w-16 sm:w-20">Conversas</span>
          </div>
          {members.map(m => {
            const rowId = getAgentRowId(m.user_id)
            return (
              <div key={m.user_id} className="grid grid-cols-[1fr_auto_auto_auto] gap-1 sm:gap-2 items-center px-2 sm:px-4 py-3 hover:bg-muted/40 transition-colors group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 text-xs font-bold text-primary uppercase">
                      {m.user_nome.split(' ').slice(0, 2).map(n => n[0]).join('')}
                    </div>
                    <span className={cn('absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card', m.msgs_hoje > 0 ? 'bg-success' : 'bg-muted-foreground/40')} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-foreground truncate">{m.user_nome}</p>
                      {m.is_gerente && <Crown className="h-3 w-3 text-warning shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{PERFIL_LABEL[m.user_perfil] ?? m.user_perfil}</p>
                  </div>
                  {canManage && rowId && (
                    <button
                      onClick={() => removeDeptAgent.mutate(rowId)}
                      disabled={removeDeptAgent.isPending}
                      className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:text-danger hover:bg-danger/10 transition-all disabled:opacity-50"
                      title="Remover membro"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <span className={cn('text-sm font-semibold text-right w-12 sm:w-16', m.msgs_hoje > 0 ? 'text-foreground' : 'text-muted-foreground')}>{m.msgs_hoje}</span>
                <span className="hidden sm:block text-sm text-muted-foreground text-right w-16">{m.msgs_semana}</span>
                <span className={cn('inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium w-16 sm:w-20', m.conversas_abertas > 0 ? 'bg-info-light text-info' : 'bg-muted text-muted-foreground')}>
                  {m.conversas_abertas} <span className="hidden sm:inline ml-0.5">abertas</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

// ══ SUPORTE DASHBOARD ════════════════════════════════════════════════════════

function SummarizeButton({ convId }: { convId: string }) {
  const summarize = useSummarizeForQueue()
  const [summary, setSummary] = useState<string | null>(null)

  if (summary) {
    return <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">{summary}</p>
  }

  return (
    <button
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        summarize.mutate(convId, {
          onSuccess: (data) => setSummary(data.resumo ?? 'Sem resumo'),
        })
      }}
      disabled={summarize.isPending}
      className="flex items-center gap-1 text-[10px] text-primary hover:underline mt-0.5 disabled:opacity-50"
    >
      {summarize.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      {summarize.isPending ? 'Gerando...' : 'Resumo IA'}
    </button>
  )
}

function SuporteDashboard({ deptId, totalAtivas, activeConvs, lConvs }: { deptId: string; totalAtivas: number; activeConvs: { id: string; status: string; protocolo: string; atualizado_em: string; resumo_ia?: string | null; chat_contacts?: { nome: string | null; numero_whatsapp: string } | null; users?: { id: string; nome: string } | null }[]; lConvs: boolean }) {
  const { data: queue   = [], isLoading: lQueue } = useDeptQueue(deptId)
  const { data: slaViol = [], isLoading: lSla   } = useDeptSlaViolations(deptId)
  const { data: closedToday = 0 }                  = useDeptClosedToday(deptId)
  const { data: csatAvg     }                      = useDeptCsatAvg(deptId)

  // Agrupar conversas ativas por agente
  const convsByAgent = activeConvs.reduce<Record<string, typeof activeConvs>>((acc, c) => {
    const key = c.users?.nome ?? 'Sem agente'
    ;(acc[key] ??= []).push(c)
    return acc
  }, {})

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={MessageSquare} label="Conversas ativas"  value={totalAtivas}       accent="info" />
        <StatCard icon={UserX}         label="Fila de espera"    value={queue.length}       sub="sem agente" accent={queue.length > 0 ? 'warning' : 'success'} />
        <StatCard icon={ShieldAlert}   label="SLA violados"      value={slaViol.length}     sub="em aberto"  accent={slaViol.length > 0 ? 'danger' : 'success'} />
        <StatCard icon={CheckCircle2}  label="Encerradas hoje"   value={closedToday}        accent="success" />
      </div>
      {csatAvg !== null && csatAvg !== undefined && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
            <Star className="h-5 w-5 text-warning" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">CSAT médio do departamento</p>
            <p className="text-2xl font-bold text-foreground">{csatAvg}<span className="text-sm font-normal text-muted-foreground">/5</span></p>
          </div>
        </div>
      )}

      {/* Conversas ativas por agente (Gerente Suporte) */}
      <Section title="Conversas em atendimento" icon={MessageSquare} iconColor="text-info" count={activeConvs.length}>
        {lConvs ? <Spinner /> : activeConvs.length === 0 ? <Empty icon={CheckCircle2} text="Nenhuma conversa ativa" /> : (
          <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
            {Object.entries(convsByAgent).map(([agentName, convs]) => (
              <div key={agentName}>
                <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">{agentName}</span>
                  <span className="text-[10px] text-muted-foreground">({convs.length})</span>
                </div>
                {convs.map(conv => {
                  const contact = conv.chat_contacts
                  const status = STATUS_CONFIG[conv.status] ?? STATUS_CONFIG.aberta
                  return (
                    <div key={conv.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
                      <Link to={`/chat?conv=${conv.id}`} className="flex items-center gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info/10 text-info text-xs font-bold">
                          {(contact?.nome ?? formatPhone(contact?.numero_whatsapp) ?? '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{contact?.nome ?? formatPhone(contact?.numero_whatsapp)}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />{fmt(conv.atualizado_em)}
                            <span className={cn('ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium', status.bg, status.color)}>{status.label}</span>
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                      </Link>
                      {conv.resumo_ia
                        ? <p className="text-xs text-muted-foreground mt-1 ml-10 line-clamp-2 italic">{conv.resumo_ia}</p>
                        : <div className="ml-10"><SummarizeButton convId={conv.id} /></div>
                      }
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="grid gap-3 sm:gap-4 lg:gap-6 lg:grid-cols-2">
        <Section title="Fila de espera" icon={UserX} iconColor="text-warning" count={queue.length}>
          {lQueue ? <Spinner /> : queue.length === 0 ? <Empty icon={CheckCircle2} text="Nenhuma conversa aguardando" /> : (
            <div className="divide-y divide-border max-h-96 overflow-y-auto">
              {queue.map(conv => (
                <div key={conv.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
                  <Link to={`/chat?conv=${conv.id}`} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning text-xs font-bold">
                      {(conv.chat_contacts?.nome ?? formatPhone(conv.chat_contacts?.numero_whatsapp) ?? '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{conv.chat_contacts?.nome ?? formatPhone(conv.chat_contacts?.numero_whatsapp)}</p>
                      <p className="text-xs text-muted-foreground font-mono">#{conv.protocolo} · {fmt(conv.criado_em)} de espera</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  </Link>
                  {conv.resumo_ia
                    ? <p className="text-xs text-muted-foreground mt-1 ml-11 line-clamp-2 italic">{conv.resumo_ia}</p>
                    : <div className="ml-11"><SummarizeButton convId={conv.id} /></div>
                  }
                </div>
              ))}
            </div>
          )}
        </Section>
        <Section title="SLA em violação" icon={ShieldAlert} iconColor="text-danger" count={slaViol.length}>
          {lSla ? <Spinner /> : slaViol.length === 0 ? <Empty icon={CheckCircle2} text="Nenhum SLA violado" /> : (
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {slaViol.map(conv => (
                <Link key={conv.id} to={`/chat?conv=${conv.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger text-xs font-bold">
                    {(conv.chat_contacts?.nome ?? formatPhone(conv.chat_contacts?.numero_whatsapp) ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conv.chat_contacts?.nome ?? formatPhone(conv.chat_contacts?.numero_whatsapp)}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {conv.sla_primeira_resposta_violado && <span className="text-[10px] rounded-full bg-danger/10 text-danger px-1.5 py-0.5">1ª resposta</span>}
                      {conv.sla_resolucao_violado         && <span className="text-[10px] rounded-full bg-danger/10 text-danger px-1.5 py-0.5">Resolução</span>}
                      <span className="text-xs text-muted-foreground">{conv.users?.nome ?? 'Sem agente'}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

// ══ ESTRATEGISTA DASHBOARD ═══════════════════════════════════════════════════

function EstrategistaDashboard({ members }: { members: DeptMemberMetric[] }) {
  const userIds = members.map(m => m.user_id)
  const { data: assignments = [], isLoading: lAssign  } = useDeptClientAssignments(userIds)
  const { data: pending     = [], isLoading: lPending } = useDeptPendingDeliveries(userIds)
  const clientIds = [...new Set(assignments.map(a => a.client_id))]
  const { data: npsAvg } = useDeptNpsAvg(clientIds)

  const byUser = members.map(m => ({
    member: m,
    clients: assignments.filter(a => a.user_id === m.user_id),
  }))
  const totalClients = new Set(assignments.map(a => a.client_id)).size

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users}     label="Clientes ativos"   value={totalClients}   accent="primary" />
        <StatCard icon={FileCheck} label="Aguard. aprovação" value={pending.length}  sub="entregas pendentes" accent={pending.length > 0 ? 'warning' : 'success'} />
        <StatCard icon={Star}      label="NPS médio"         value={npsAvg ?? '—'}  sub="clientes do dept"   accent="info" />
        <StatCard icon={ThumbsUp}  label="Estrategistas"     value={members.filter(m => !m.is_gerente).length} accent="success" />
      </div>
      <div className="grid gap-3 sm:gap-4 lg:gap-6 lg:grid-cols-2">
        <Section title="Clientes por estrategista" icon={Users} iconColor="text-primary">
          {lAssign ? <Spinner /> : byUser.filter(b => b.clients.length > 0).length === 0 ? <Empty icon={Users} text="Nenhum cliente atribuído" /> : (
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {byUser.filter(b => b.clients.length > 0).map(({ member, clients }) => (
                <div key={member.user_id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary uppercase">
                      {member.user_nome.split(' ').slice(0, 2).map(n => n[0]).join('')}
                    </div>
                    <span className="text-sm font-medium">{member.user_nome}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{clients.length} cliente(s)</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-8">
                    {clients.map(a => (
                      <Link key={a.id} to={`/clientes/${a.client_id}`}
                        className="rounded-full bg-muted hover:bg-primary/10 hover:text-primary px-2 py-0.5 text-xs text-muted-foreground transition-colors">
                        {a.clients?.nome ?? '—'}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
        <Section title="Aguardando aprovação" icon={FileCheck} iconColor="text-warning" count={pending.length}>
          {lPending ? <Spinner /> : pending.length === 0 ? <Empty icon={CheckCircle2} text="Nenhuma entrega pendente" /> : (
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {pending.map(d => (
                <Link key={d.id} to={`/entregas/${d.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/10 mt-0.5">
                    <FileCheck className="h-4 w-4 text-warning" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.titulo}</p>
                    <p className="text-xs text-muted-foreground">{d.clients?.nome ?? '—'} · {d.users?.nome ?? '—'}</p>
                    {d.prazo && <p className="text-xs text-danger mt-0.5">Prazo: {new Date(d.prazo).toLocaleDateString('pt-BR')}</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-2" />
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

// ══ COBRANÇA DASHBOARD ════════════════════════════════════════════════════════

function CobrancaDashboard() {
  const { data: devedores = [], isLoading: lDev } = useDevedores()
  const { data: metrics }                          = useCobrancaSendMetrics()

  const ativos  = devedores.filter(d => d.status === 'ativa')
  const pagos   = devedores.filter(d => d.status === 'pago')
  const valorTotal = ativos.reduce((s, d) => s + (d.valor_divida ?? 0), 0)
  const taxaRecuperacao = devedores.length > 0 ? Math.round((pagos.length / devedores.length) * 100) : 0

  const proximos = [...devedores]
    .filter(d => d.status === 'ativa' && d.proximo_envio_em)
    .sort((a, b) => new Date(a.proximo_envio_em!).getTime() - new Date(b.proximo_envio_em!).getTime())
    .slice(0, 10)

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users}        label="Devedores ativos"    value={ativos.length}        accent="danger" />
        <StatCard icon={DollarSign}   label="Valor em aberto"     value={fmtBRL(valorTotal)}   accent="warning" />
        <StatCard icon={CheckCircle2} label="Pagos"               value={pagos.length}          sub="total no sistema" accent="success" />
        <StatCard icon={BarChart3}    label="Taxa de recuperação" value={`${taxaRecuperacao}%`} accent={taxaRecuperacao >= 30 ? 'success' : 'info'} />
      </div>
      {metrics && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Send}          label="Enviados hoje"  value={metrics.enviadosHoje}  accent="info" />
          <StatCard icon={ShieldAlert}   label="Falhas hoje"    value={metrics.falhasHoje}     accent={metrics.falhasHoje > 0 ? 'danger' : 'success'} />
          <StatCard icon={Send}          label="Total enviados" value={metrics.totalEnviados ?? 0} />
          <StatCard icon={ShieldAlert}   label="Total falhas"   value={metrics.totalFalhas   ?? 0} />
        </div>
      )}
      <div className="grid gap-3 sm:gap-4 lg:gap-6 lg:grid-cols-2">
        <Section title="Próximos envios" icon={Clock} iconColor="text-info" count={proximos.length}>
          {lDev ? <Spinner /> : proximos.length === 0 ? <Empty icon={Clock} text="Nenhum envio agendado" /> : (
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {proximos.map(d => (
                <Link key={d.id} to="/cobranca/devedores" className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info/10 text-info text-xs font-bold">
                    {d.nome.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.nome}</p>
                    <p className="text-xs text-muted-foreground">{d.valor_divida ? fmtBRL(d.valor_divida) : '—'} · passo {d.passo_atual}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(d.proximo_envio_em!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Section>
        <Section title="Maiores devedores" icon={DollarSign} iconColor="text-danger">
          {lDev ? <Spinner /> : ativos.length === 0 ? <Empty icon={CheckCircle2} text="Nenhum devedor ativo" /> : (
            <>
              <div className="divide-y divide-border max-h-64 overflow-y-auto">
                {[...ativos].filter(d => d.valor_divida).sort((a, b) => (b.valor_divida ?? 0) - (a.valor_divida ?? 0)).slice(0, 10).map((d, i) => (
                  <Link key={d.id} to="/cobranca/devedores" className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                    <span className="text-xs font-bold text-muted-foreground w-5 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.nome}</p>
                      <p className="text-xs text-muted-foreground">{formatPhone(d.numero_whatsapp)}</p>
                    </div>
                    <span className="text-sm font-semibold text-danger shrink-0">{fmtBRL(d.valor_divida ?? 0)}</span>
                  </Link>
                ))}
              </div>
              <div className="border-t border-border px-4 py-2.5">
                <Link to="/cobranca" className="text-xs text-primary hover:underline flex items-center gap-1">
                  Ver módulo completo <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </>
          )}
        </Section>
      </div>
    </div>
  )
}

// ── Micro-components ──────────────────────────────────────────────────────────

function Spinner() {
  return <div className="flex items-center justify-center py-8"><div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
}

function Empty({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
      <Icon className="h-7 w-7 opacity-40" />
      <p className="text-sm">{text}</p>
    </div>
  )
}

// ══ PÁGINA PRINCIPAL ══════════════════════════════════════════════════════════

export default function DepartamentoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { can } = usePermissoes()

  const { data: departments = [] }                      = useDepartments()
  const { data: members = [],    isLoading: lMembers  } = useDeptMemberMetrics(id ?? '')
  const { data: activeConvs = [], isLoading: lConvs   } = useDeptActiveConversations(id ?? '')

  const dept = departments.find(d => d.id === id)

  if (!dept && departments.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Building2 className="h-10 w-10 opacity-40" />
        <p className="text-sm">Departamento não encontrado ou sem acesso.</p>
        <button onClick={() => navigate('/departamentos')} className="text-xs text-primary hover:underline">Voltar</button>
      </div>
    )
  }

  const gerentesMembro = members.filter(m => m.is_gerente)
  const totalMsgsHoje  = members.reduce((s, m) => s + (m.msgs_hoje ?? 0), 0)
  const totalMsgsSemana = members.reduce((s, m) => s + (m.msgs_semana ?? 0), 0)
  const modulo = dept?.modulo_acesso

  // Gerente pode gerenciar se for gerente do dept ou admin
  const isAdmin = can('departamentos', 'admin')
  const isGerenteOfDept = gerentesMembro.some(m => m.user_id === user?.id)
  const canManage = isAdmin || isGerenteOfDept

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 sm:gap-4">
        <button onClick={() => navigate('/departamentos')}
          className="mt-0.5 shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-foreground">{dept?.nome ?? '...'}</h1>
              {gerentesMembro.length > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Crown className="h-3 w-3 text-warning" />
                  {gerentesMembro.map(m => m.user_nome).join(', ')}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-12">
            <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', dept?.ativo ? 'bg-success-light text-success' : 'bg-muted text-muted-foreground')}>
              <Circle className="h-2 w-2 fill-current" /> {dept?.ativo ? 'Ativo' : 'Inativo'}
            </span>
            {dept?.distribuicao && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground capitalize">{dept.distribuicao.replace('_', ' ')}</span>}
            {dept?.sla_primeira_resposta_minutos && <span className="rounded-full bg-info-light px-2 py-0.5 text-xs text-info">SLA resposta: {dept.sla_primeira_resposta_minutos}min</span>}
            {dept?.sla_resolucao_horas && <span className="rounded-full bg-warning-light px-2 py-0.5 text-xs text-warning">SLA resolução: {dept.sla_resolucao_horas}h</span>}
          </div>
        </div>
      </div>

      {/* Cards genéricos (exceto Suporte e Cobranças que têm os próprios) */}
      {modulo !== 'suporte' && modulo !== 'cobranca' && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Users}         label="Membros"           value={members.length}       sub={`${gerentesMembro.length} gerente(s)`} accent="primary" />
          <StatCard icon={MessageSquare} label="Conversas ativas"  value={activeConvs.length}   sub="em aberto agora"                       accent={activeConvs.length > 10 ? 'warning' : 'success'} />
          <StatCard icon={TrendingUp}    label="Mensagens hoje"    value={totalMsgsHoje}         sub={`${totalMsgsSemana} esta semana`}      accent="info" />
          <StatCard icon={Timer}         label="SLA resposta"      value={`${dept?.sla_primeira_resposta_minutos ?? '—'}min`} sub={`Resolução: ${dept?.sla_resolucao_horas ?? '—'}h`} accent="warning" />
        </div>
      )}

      {/* Dashboard específico */}
      {modulo === 'suporte'      && <SuporteDashboard deptId={id!} totalAtivas={activeConvs.length} activeConvs={activeConvs as never} lConvs={lConvs} />}
      {modulo === 'estrategista' && <EstrategistaDashboard members={members} />}
      {modulo === 'cobranca'     && <CobrancaDashboard />}

      {/* Membros + Conversas */}
      <div className={cn('grid gap-3 sm:gap-4 lg:gap-6', modulo === 'suporte' ? '' : 'lg:grid-cols-5')}>
        <div className={modulo === 'suporte' ? '' : 'lg:col-span-3'}>
          <MembersTable members={members} loading={lMembers} deptId={id!} canManage={canManage} />
        </div>

        {modulo !== 'suporte' && (
          <div className="lg:col-span-2">
            <Section title="Conversas ativas" icon={MessageSquare} iconColor="text-info" count={activeConvs.length}>
              {lConvs ? <Spinner /> : activeConvs.length === 0 ? <Empty icon={CheckCircle2} text="Nenhuma conversa ativa" /> : (
                <>
                  <div className="divide-y divide-border max-h-[380px] overflow-y-auto">
                    {activeConvs.map(conv => {
                      const status  = STATUS_CONFIG[conv.status] ?? STATUS_CONFIG.aberta
                      const contact = (conv as never as { chat_contacts: { nome: string | null; numero_whatsapp: string } }).chat_contacts
                      const agente  = (conv as never as { users: { nome: string } | null }).users
                      return (
                        <Link key={conv.id} to={`/chat?conv=${conv.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground uppercase mt-0.5">
                            {(contact?.nome ?? formatPhone(contact?.numero_whatsapp) ?? '?').slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <p className="text-sm font-medium truncate">{contact?.nome ?? formatPhone(contact?.numero_whatsapp)}</p>
                              <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', status.bg, status.color)}>{status.label}</span>
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" />{agente?.nome ?? 'Sem agente'}
                              <span className="mx-0.5 opacity-40">·</span>
                              <Clock className="h-3 w-3" />{fmt(conv.atualizado_em)}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-2" />
                        </Link>
                      )
                    })}
                  </div>
                  <div className="border-t border-border px-4 py-2.5">
                    <Link to="/chat" className="text-xs text-primary hover:underline flex items-center gap-1">Ver todas no chat <ChevronRight className="h-3 w-3" /></Link>
                  </div>
                </>
              )}
            </Section>
          </div>
        )}
      </div>

    </div>
  )
}
