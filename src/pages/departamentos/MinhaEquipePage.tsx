import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { AbasRolaveis } from '@/components/ui/AbasRolaveis'
import {
  Building2, MessageSquare, Users, Clock, ShieldAlert, CheckCircle2,
  Timer, UserX, ChevronRight, Star, FileCheck, TrendingUp,
  AlertCircle, Inbox, BarChart3, DollarSign, Send, XCircle,
  Bell, Plus, Check, X, CalendarClock, Sparkles, Loader2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn, formatPhone } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import {
  useDeptAgentAssignmentsByUser,
  useDepartments,
  useDeptQueue,
  useDeptSlaViolations,
  useDeptClientAssignments,
  useDeptPendingDeliveries,
  useDeptNpsAvg,
  useConversations,
  useClientAlerts,
  useCreateClientAlert,
  useResolveClientAlert,
  useClientLastContact,
  useAgentTma,
  useSummarizeForQueue,
} from '@/hooks/useChat'
import { useDevedores, useCobrancaSendMetrics, useUpdateDevedorStatus } from '@/hooks/useCobranca'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  const d = new Date(iso), now = new Date()
  const min = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (min < 1)  return 'agora'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h  < 24)  return `${h}h`
  return d.toLocaleDateString('pt-BR')
}

function diasSemContato(iso: string | null | undefined): number {
  if (!iso) return 999
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

function healthColor(dias: number): 'success' | 'warning' | 'danger' {
  if (dias < 7)  return 'success'
  if (dias < 15) return 'warning'
  return 'danger'
}

const HEALTH_LABEL: Record<string, string> = {
  success: 'Em dia', warning: 'Atenção', danger: 'Sem contato',
}

// ── Blocos de UI ──────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string; value: string | number; sub?: string
  accent?: 'success' | 'warning' | 'danger' | 'info' | 'primary'
}) {
  const colors: Record<string, string> = {
    primary: 'text-primary bg-primary-muted',
    success: 'text-success bg-success-light',
    warning: 'text-warning bg-warning-light',
    danger:  'text-danger bg-danger/10',
    info:    'text-info bg-info-light',
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-start gap-3">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', accent ? colors[accent] : 'text-muted-foreground bg-muted')}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
        {sub && <p className="text-[12px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function Panel({ title, icon: Icon, iconColor, count, badge, action, children }: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  iconColor?: string; count?: number; badge?: 'warning' | 'danger'
  action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className={cn('rounded-lg border bg-card overflow-hidden', badge === 'danger' ? 'border-danger/40' : badge === 'warning' ? 'border-warning/40' : 'border-border')}>
      <div className={cn('flex items-center justify-between px-4 py-3 border-b', badge === 'danger' ? 'border-danger/20 bg-danger/5' : badge === 'warning' ? 'border-warning/20 bg-warning/5' : 'border-border')}>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Icon className={cn('h-4 w-4', iconColor ?? 'text-muted-foreground')} />
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {count !== undefined && <span className="text-xs text-muted-foreground">{count}</span>}
          {action}
        </div>
      </div>
      {children}
    </div>
  )
}

function Spinner() {
  return <div className="flex items-center justify-center py-8"><div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
}

function Empty({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
      <Icon className="h-7 w-7 opacity-30" />
      <p className="text-sm">{text}</p>
    </div>
  )
}


// ── SummarizeButton ──────────────────────────────────────────────────────────

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
      className="flex items-center gap-1 text-[12px] text-primary hover:underline mt-0.5 disabled:opacity-50"
    >
      {summarize.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      {summarize.isPending ? 'Gerando...' : 'Resumo IA'}
    </button>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ══ SPRINT SUPORTE — PAINEL DO AGENTE ═════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════

function AgentPanel({ userId, deptId }: { userId: string; deptId: string }) {
  const { data: allMyConvs = [], isLoading: lConvs } = useConversations({
    agente_id: userId,
    department_id: deptId,
  })
  const { data: queue = [], isLoading: lQueue } = useDeptQueue(deptId)
  const { data: deptSlaViol = [] } = useDeptSlaViolations(deptId)

  // TMA (tempo médio de atendimento)
  const { data: tmaHoje }   = useAgentTma(userId, 1)
  const { data: tmaSemana } = useAgentTma(userId, 7)

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const minhasAbertas      = allMyConvs.filter(c => c.status !== 'encerrada')
  const minhasEncerradasHj = allMyConvs.filter(c =>
    c.status === 'encerrada' && c.encerrada_em && new Date(c.encerrada_em) >= todayStart
  )
  const minhaSla = minhasAbertas.filter(c => c.sla_primeira_resposta_violado || c.sla_resolucao_violado)
  const slaDept  = deptSlaViol.filter(c => c.agente_id !== userId)

  // Separar "em atendimento" (preciso agir) de "aguardando" (esperando cliente)
  const emAtendimento = minhasAbertas.filter(c => c.status === 'em_atendimento')
  const aguardando    = minhasAbertas.filter(c => c.status === 'aguardando')

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Stats pessoais */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Inbox}        label="Preciso responder"  value={emAtendimento.length}     accent={emAtendimento.length > 0 ? 'info' : 'success'} />
        <StatCard icon={AlertCircle}  label="Aguardando cliente" value={aguardando.length}         accent={aguardando.length > 5 ? 'warning' : 'success'} />
        <StatCard icon={ShieldAlert}  label="SLA violado (meu)"  value={minhaSla.length}           accent={minhaSla.length > 0 ? 'danger' : 'success'} />
        <StatCard icon={CheckCircle2} label="Encerradas hoje"    value={minhasEncerradasHj.length} accent="success" />
      </div>

      {/* TMA */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info-light shrink-0">
            <Timer className="h-4 w-4 text-info" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">TMA hoje</p>
            <p className="text-xl font-bold text-foreground">
              {tmaHoje?.tmaMinutos != null ? `${tmaHoje.tmaMinutos}min` : '—'}
            </p>
            <p className="text-[12px] text-muted-foreground">{tmaHoje?.totalConversas ?? 0} conversas</p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-muted shrink-0">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">TMA semana</p>
            <p className="text-xl font-bold text-foreground">
              {tmaSemana?.tmaMinutos != null ? `${tmaSemana.tmaMinutos}min` : '—'}
            </p>
            <p className="text-[12px] text-muted-foreground">{tmaSemana?.totalConversas ?? 0} conversas</p>
          </div>
        </div>
      </div>

      {/* Listas: minhas conversas vs fila */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">

        {/* Preciso responder (em_atendimento) */}
        <Panel title="Preciso responder" icon={Inbox} iconColor="text-info" count={emAtendimento.length}>
          {lConvs ? <Spinner /> : emAtendimento.length === 0
            ? <Empty icon={CheckCircle2} text="Nenhuma conversa pendente" />
            : (
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {emAtendimento.map(conv => {
                  const contact = conv.chat_contacts
                  const slaViol = conv.sla_primeira_resposta_violado || conv.sla_resolucao_violado
                  return (
                    <div key={conv.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
                      <Link to={`/conversas?conv=${conv.id}`} className="flex items-center gap-3">
                        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                          slaViol ? 'bg-danger/10 text-danger' : 'bg-primary-muted text-primary'
                        )}>
                          {(contact?.nome ?? formatPhone(contact?.numero_whatsapp) ?? '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{contact?.nome ?? formatPhone(contact?.numero_whatsapp)}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />{fmt(conv.atualizado_em)}
                            {slaViol && <span className="ml-1 text-[12px] rounded-full bg-danger/10 text-danger px-1.5 py-0.5">SLA</span>}
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
            )}
        </Panel>

        {/* Fila do departamento */}
        <Panel
          title="Fila do departamento"
          icon={UserX}
          iconColor={queue.length > 0 ? 'text-warning' : 'text-muted-foreground'}
          count={queue.length}
          badge={queue.length > 2 ? 'warning' : undefined}
        >
          {lQueue ? <Spinner /> : queue.length === 0
            ? <Empty icon={CheckCircle2} text="Fila vazia" />
            : (
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {queue.map(conv => (
                  <div key={conv.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
                    <Link to={`/conversas?conv=${conv.id}`} className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning text-xs font-bold">
                        {(conv.chat_contacts?.nome ?? formatPhone(conv.chat_contacts?.numero_whatsapp) ?? '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{conv.chat_contacts?.nome ?? formatPhone(conv.chat_contacts?.numero_whatsapp)}</p>
                        <p className="text-xs text-muted-foreground">#{conv.protocolo} · {fmt(conv.criado_em)} esperando</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    </Link>
                    {conv.resumo_ia
                      ? <p className="text-xs text-muted-foreground mt-1 ml-10 line-clamp-2 italic">{conv.resumo_ia}</p>
                      : <div className="ml-10"><SummarizeButton convId={conv.id} /></div>
                    }
                  </div>
                ))}
              </div>
            )}
        </Panel>
      </div>

      {/* Aguardando resposta do cliente */}
      {aguardando.length > 0 && (
        <Panel title="Aguardando resposta do cliente" icon={AlertCircle} iconColor="text-warning" count={aguardando.length}>
          <div className="divide-y divide-border max-h-56 overflow-y-auto">
            {aguardando.map(conv => {
              const contact = conv.chat_contacts
              return (
                <Link key={conv.id} to={`/conversas?conv=${conv.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning text-xs font-bold">
                    {(contact?.nome ?? formatPhone(contact?.numero_whatsapp) ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{contact?.nome ?? formatPhone(contact?.numero_whatsapp)}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />Último contato {fmt(conv.atualizado_em)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                </Link>
              )
            })}
          </div>
        </Panel>
      )}

      {/* Meus SLA violados */}
      {minhaSla.length > 0 && (
        <Panel title="Meus SLA em violação" icon={ShieldAlert} iconColor="text-danger" count={minhaSla.length} badge="danger">
          <div className="divide-y divide-danger/10 max-h-56 overflow-y-auto">
            {minhaSla.map(conv => (
              <Link key={conv.id} to={`/conversas?conv=${conv.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-danger/10 transition-colors">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger text-xs font-bold">
                  {(conv.chat_contacts?.nome ?? formatPhone(conv.chat_contacts?.numero_whatsapp) ?? '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{conv.chat_contacts?.nome ?? formatPhone(conv.chat_contacts?.numero_whatsapp)}</p>
                  <div className="flex gap-1 mt-0.5 flex-wrap">
                    {conv.sla_primeira_resposta_violado && <span className="text-[12px] rounded-full bg-danger/10 text-danger px-1.5 py-0.5">1ª resposta</span>}
                    {conv.sla_resolucao_violado         && <span className="text-[12px] rounded-full bg-danger/10 text-danger px-1.5 py-0.5">Resolução</span>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-danger/40 shrink-0" />
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {/* SLA violado por outros no dept */}
      {slaDept.length > 0 && (
        <Panel title={`SLA de outros no departamento`} icon={ShieldAlert} iconColor="text-warning" count={slaDept.length}>
          <div className="divide-y divide-border max-h-48 overflow-y-auto">
            {slaDept.slice(0, 6).map(conv => (
              <div key={conv.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning text-xs font-bold">
                  {(conv.chat_contacts?.nome ?? formatPhone(conv.chat_contacts?.numero_whatsapp) ?? '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{conv.chat_contacts?.nome ?? formatPhone(conv.chat_contacts?.numero_whatsapp)}</p>
                  <p className="text-xs text-muted-foreground">{conv.users?.nome ?? 'Sem agente'}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// ══ SPRINT COBRANÇA — PAINEL DO AGENTE ════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════

function CobrancaAgentPanel() {
  const { data: devedores = [], isLoading: lDev } = useDevedores()
  const { data: metrics }                          = useCobrancaSendMetrics()
  const updateStatus                                = useUpdateDevedorStatus()
  const [confirmAction, setConfirmAction]           = useState<{ id: string; status: string } | null>(null)

  const ativos       = devedores.filter(d => d.status === 'ativa')
  const pausados   = devedores.filter(d => d.status === 'pausada')
  const pagos        = devedores.filter(d => d.status === 'pago')
  const valorTotal   = ativos.reduce((s, d) => s + (d.valor_divida ?? 0), 0)
  const taxaRecup    = devedores.length > 0 ? Math.round((pagos.length / devedores.length) * 100) : 0

  // Devedores sem resposta nenhuma (passo_atual = 0 ou sem proximo envio e nenhum send)
  const semResposta = devedores.filter(d =>
    d.status === 'ativa' && d.passo_atual === 0
  )

  const proximosEnvios = [...devedores]
    .filter(d => d.status === 'ativa' && d.proximo_envio_em)
    .sort((a, b) => new Date(a.proximo_envio_em!).getTime() - new Date(b.proximo_envio_em!).getTime())
    .slice(0, 8)

  const falhasHoje   = metrics?.falhasHoje   ?? 0
  const enviadosHoje = metrics?.enviadosHoje ?? 0

  const handleQuickStatus = (id: string, status: 'ativa' | 'pago' | 'pausada') => {
    updateStatus.mutate({ id, status })
    setConfirmAction(null)
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Stats principais */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Users}        label="Devedores ativos"   value={ativos.length}
          sub={`R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} accent="danger" />
        <StatCard icon={MessageSquare} label="Cobranças pausadas"      value={pausados.length} accent={pausados.length > 0 ? 'warning' : 'info'} />
        <StatCard icon={Send}          label="Envios hoje"        value={enviadosHoje}      accent="info" />
        <StatCard icon={BarChart3}     label="Taxa recuperação"   value={`${taxaRecup}%`}
          sub={`${pagos.length} de ${devedores.length}`} accent={taxaRecup >= 30 ? 'success' : 'info'} />
      </div>

      {/* Falhas alerta */}
      {falhasHoje > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 flex items-center gap-3">
          <XCircle className="h-5 w-5 text-danger shrink-0" />
          <div>
            <p className="text-sm font-medium text-danger">{falhasHoje} envio(s) falharam hoje</p>
            <p className="text-xs text-muted-foreground">Confira o número de WhatsApp e os registros.</p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">

        {/* Cobranças pausadas — com ações rápidas */}
        <Panel
          title="Cobranças pausadas"
          icon={MessageSquare}
          iconColor="text-warning"
          count={pausados.length}
          badge={pausados.length > 0 ? 'warning' : undefined}
        >
          {lDev ? <Spinner /> : pausados.length === 0
            ? <Empty icon={CheckCircle2} text="Nenhuma cobrança pausada" />
            : (
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {pausados.map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning text-xs font-bold">
                      {d.nome.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.valor_divida ? `R$ ${d.valor_divida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                      </p>
                    </div>
                    {confirmAction?.id === d.id ? (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => handleQuickStatus(d.id, 'pago')}
                          className="text-[12px] rounded-full bg-success-light text-success px-2 py-0.5 font-medium hover:bg-success/20">Pago</button>
                        <button onClick={() => handleQuickStatus(d.id, 'ativa')}
                          className="text-[12px] rounded-full bg-info-light text-info px-2 py-0.5 font-medium hover:bg-info/20">Retomar</button>
                        <button onClick={() => setConfirmAction(null)}
                          className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmAction({ id: d.id, status: '' })}
                        className="text-xs text-primary hover:underline shrink-0">Ação</button>
                    )}
                  </div>
                ))}
              </div>
            )}
        </Panel>

        {/* Próximos envios */}
        <Panel title="Próximos envios" icon={Clock} iconColor="text-info" count={proximosEnvios.length}>
          {lDev ? <Spinner /> : proximosEnvios.length === 0
            ? <Empty icon={Clock} text="Nenhum envio agendado" />
            : (
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {proximosEnvios.map(d => (
                  <Link key={d.id} to="/cobranca/devedores" className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info/10 text-info text-xs font-bold">
                      {d.nome.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.nome}</p>
                      <p className="text-xs text-muted-foreground">passo {d.passo_atual}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                      {new Date(d.proximo_envio_em!).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
        </Panel>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        {/* Sem resposta */}
        <Panel title="Ainda sem envio" icon={XCircle} iconColor="text-danger" count={semResposta.length}>
          {lDev ? <Spinner /> : semResposta.length === 0
            ? <Empty icon={CheckCircle2} text="Nenhuma cobrança aguardando o primeiro envio" />
            : (
              <div className="divide-y divide-border max-h-60 overflow-y-auto">
                {semResposta.slice(0, 8).map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger text-xs font-bold">
                      {d.nome.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.nome}</p>
                      <p className="text-xs text-muted-foreground">{formatPhone(d.numero_whatsapp)}</p>
                    </div>
                    {confirmAction?.id === d.id ? (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => handleQuickStatus(d.id, 'pago')}
                          className="text-[12px] rounded-full bg-warning-light text-warning px-2 py-0.5 font-medium">Pago</button>
                        <button onClick={() => handleQuickStatus(d.id, 'pausada')}
                          className="text-[12px] rounded-full bg-muted text-muted-foreground px-2 py-0.5 font-medium">Pausar</button>
                        <button onClick={() => setConfirmAction(null)}>
                          <X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmAction({ id: d.id, status: '' })}
                        className="text-xs text-primary hover:underline shrink-0">Ação</button>
                    )}
                  </div>
                ))}
              </div>
            )}
        </Panel>

        {/* Maiores devedores */}
        <Panel title="Maiores devedores" icon={DollarSign} iconColor="text-danger">
          {lDev ? <Spinner /> : ativos.length === 0
            ? <Empty icon={CheckCircle2} text="Nenhum devedor ativo" />
            : (
              <>
                <div className="divide-y divide-border max-h-60 overflow-y-auto">
                  {[...ativos].filter(d => d.valor_divida).sort((a, b) => (b.valor_divida ?? 0) - (a.valor_divida ?? 0)).slice(0, 8).map((d, i) => (
                    <Link key={d.id} to="/cobranca/devedores" className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                      <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{d.nome}</p>
                      </div>
                      <span className="text-sm font-semibold text-danger shrink-0">
                        R$ {(d.valor_divida ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
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
        </Panel>
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// ══ SPRINT ESTRATEGISTA — PAINEL DO ESTRATEGISTA ══════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════

function EstrategistaPanel({ userId }: { userId: string }) {
  const { data: assignments = [], isLoading: lAssign } = useDeptClientAssignments([userId])
  const { data: pending = [], isLoading: lPending }    = useDeptPendingDeliveries([userId])
  const clientIds = [...new Set(assignments.map(a => a.client_id))]
  const { data: npsAvg }                               = useDeptNpsAvg(clientIds)
  const { data: lastContactMap = {} }                   = useClientLastContact(clientIds)

  // Alertas
  const { data: alerts = [], isLoading: lAlerts }      = useClientAlerts(userId)
  const createAlert                                     = useCreateClientAlert()
  const resolveAlert                                    = useResolveClientAlert()

  // Form de novo alerta
  const [showAlertForm, setShowAlertForm]   = useState(false)
  const [alertClientId, setAlertClientId]   = useState('')
  const [alertTitulo, setAlertTitulo]       = useState('')
  const [alertData, setAlertData]           = useState('')

  // Clientes com saúde
  const clientesComSaude = assignments.map(a => {
    const dias = diasSemContato(lastContactMap[a.client_id])
    const color = healthColor(dias)
    return { ...a, dias, color }
  }).sort((a, b) => b.dias - a.dias) // piores primeiro

  const clientesSemContato = clientesComSaude.filter(c => c.color === 'danger')
  const prazoVencendo = pending.filter(d => {
    if (!d.prazo) return false
    const diff = new Date(d.prazo).getTime() - Date.now()
    return diff >= 0 && diff < 1000 * 60 * 60 * 48
  })

  const handleCreateAlert = () => {
    if (!alertClientId || !alertTitulo.trim()) return
    createAlert.mutate({
      client_id: alertClientId,
      user_id: userId,
      titulo: alertTitulo.trim(),
      data_alerta: alertData || undefined,
    }, {
      onSuccess: () => {
        setAlertClientId(''); setAlertTitulo(''); setAlertData('')
        setShowAlertForm(false)
      },
    })
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Stats pessoais */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Users}     label="Meus clientes"          value={clientIds.length}   accent="primary" />
        <StatCard icon={FileCheck}  label="Entregas pendentes"     value={pending.length}
          sub={prazoVencendo.length > 0 ? `${prazoVencendo.length} vence em 48h` : undefined}
          accent={pending.length > 0 ? 'warning' : 'success'} />
        <StatCard icon={Star}       label="NPS médio"              value={npsAvg ?? '—'}
          accent={npsAvg != null ? (npsAvg >= 8 ? 'success' : npsAvg >= 6 ? 'warning' : 'danger') : undefined} />
        <StatCard icon={AlertCircle} label="Sem contato (+7d)"     value={clientesSemContato.length}
          accent={clientesSemContato.length > 0 ? 'danger' : 'success'} />
      </div>

      {/* Alertas do estrategista */}
      <Panel
        title="Meus alertas"
        icon={Bell}
        iconColor={alerts.length > 0 ? 'text-warning' : 'text-muted-foreground'}
        count={alerts.length}
        action={
          <button onClick={() => setShowAlertForm(!showAlertForm)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary-muted transition-colors">
            <Plus className="h-3 w-3" /> Novo
          </button>
        }
      >
        {/* Form de criação */}
        {showAlertForm && (
          <div className="px-4 py-3 border-b border-border bg-muted/30 space-y-2">
            <div className="flex flex-wrap gap-2">
              <select value={alertClientId} onChange={e => setAlertClientId(e.target.value)}
                className="flex-1 min-w-[140px] rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Cliente...</option>
                {assignments.map(a => (
                  <option key={a.client_id} value={a.client_id}>{a.clients?.nome ?? '—'}</option>
                ))}
              </select>
              <input type="date" value={alertData} onChange={e => setAlertData(e.target.value)}
                className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex gap-2">
              <input type="text" value={alertTitulo} onChange={e => setAlertTitulo(e.target.value)}
                placeholder="Ex: Reunião marcada, Cliente solicitou proposta..."
                className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <button onClick={handleCreateAlert} disabled={!alertClientId || !alertTitulo.trim() || createAlert.isPending}
                className="rounded-lg px-3 py-1.5 text-xs font-medium gradient-primary text-primary-foreground disabled:opacity-50">
                {createAlert.isPending ? '...' : 'Salvar'}
              </button>
              <button onClick={() => setShowAlertForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {lAlerts ? <Spinner /> : alerts.length === 0
          ? <Empty icon={Bell} text="Nenhum alerta pendente" />
          : (
            <div className="divide-y divide-border max-h-56 overflow-y-auto">
              {alerts.map(alert => (
                <div key={alert.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/10">
                    {alert.data_alerta ? <CalendarClock className="h-3.5 w-3.5 text-warning" /> : <Bell className="h-3.5 w-3.5 text-warning" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{alert.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {alert.clients?.nome ?? '—'}
                      {alert.data_alerta && ` · ${new Date(alert.data_alerta).toLocaleDateString('pt-BR')}`}
                    </p>
                  </div>
                  <button onClick={() => resolveAlert.mutate(alert.id)} disabled={resolveAlert.isPending}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-success hover:bg-success-light transition-colors"
                    title="Resolver">
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
      </Panel>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">

        {/* Entregas aguardando aprovação */}
        <Panel
          title="Entregas aguardando aprovação"
          icon={FileCheck}
          iconColor={pending.length > 0 ? 'text-warning' : 'text-muted-foreground'}
          count={pending.length}
          badge={prazoVencendo.length > 0 ? 'warning' : undefined}
        >
          {lPending ? <Spinner /> : pending.length === 0
            ? <Empty icon={CheckCircle2} text="Nenhuma entrega pendente" />
            : (
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {pending.map(d => {
                  const isUrgente = d.prazo && (new Date(d.prazo).getTime() - Date.now()) < 1000 * 60 * 60 * 48
                  return (
                    <div key={d.id} className="flex items-start gap-3 px-4 py-3">
                      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mt-0.5', isUrgente ? 'bg-danger/10' : 'bg-warning/10')}>
                        <FileCheck className={cn('h-3.5 w-3.5', isUrgente ? 'text-danger' : 'text-warning')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{d.titulo}</p>
                        <p className="text-xs text-muted-foreground">{d.clients?.nome ?? '—'}</p>
                        {d.prazo && (
                          <p className={cn('text-xs mt-0.5', isUrgente ? 'text-danger font-medium' : 'text-muted-foreground')}>
                            Prazo: {new Date(d.prazo).toLocaleDateString('pt-BR')}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
        </Panel>

        {/* Saúde dos clientes (com último contato) */}
        <Panel title="Saúde dos clientes" icon={Users} iconColor="text-primary" count={clientIds.length}>
          {lAssign ? <Spinner /> : clientesComSaude.length === 0
            ? <Empty icon={Users} text="Nenhum cliente atribuído" />
            : (
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {clientesComSaude.map(c => {
                  const colorCls: Record<string, string> = {
                    success: 'bg-success text-success', warning: 'bg-warning text-warning', danger: 'bg-danger text-danger',
                  }
                  return (
                    <Link key={c.id} to={`/clientes/${c.client_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary text-xs font-bold uppercase">
                        {(c.clients?.nome ?? '?').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.clients?.nome ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.dias < 999 ? `Último contato há ${c.dias}d` : 'Sem conversas registradas'}
                        </p>
                      </div>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className={cn('h-2 w-2 rounded-full', colorCls[c.color]?.split(' ')[0])} />
                        <span className={cn('text-[12px] font-medium', colorCls[c.color]?.split(' ')[1])}>
                          {HEALTH_LABEL[c.color]}
                        </span>
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
        </Panel>
      </div>

      {/* NPS destaque */}
      {npsAvg != null && (
        <div className={cn('rounded-lg border px-4 py-3 flex items-center gap-4',
          npsAvg >= 8 ? 'border-success/30 bg-success-light' : npsAvg >= 6 ? 'border-warning/30 bg-warning-light' : 'border-danger/30 bg-danger/5'
        )}>
          <Star className={cn('h-5 w-5 shrink-0', npsAvg >= 8 ? 'text-success' : npsAvg >= 6 ? 'text-warning' : 'text-danger')} />
          <div>
            <p className="text-xs text-muted-foreground">NPS médio dos seus clientes</p>
            <p className="text-2xl font-bold text-foreground">{npsAvg}<span className="text-sm font-normal text-muted-foreground">/10</span></p>
            <p className="text-xs text-muted-foreground">
              {npsAvg >= 9 ? 'Promotores — excelente!' : npsAvg >= 7 ? 'Passivos — pode melhorar' : 'Detratores — atenção!'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// ══ PÁGINA PRINCIPAL ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════

export default function MinhaEquipePage() {
  const { user } = useAuth()
  const { data: assignments = [], isLoading: lAssign } = useDeptAgentAssignmentsByUser(user?.id ?? '')
  const { data: departments = [], isLoading: lDepts  } = useDepartments()

  const [activeTab, setActiveTab] = useState<string | null>(null)

  const myDepts = assignments
    .map(a => {
      const dept = departments.find(d => d.id === a.department_id)
      return dept ? { ...dept, assignment: a } : null
    })
    .filter(Boolean) as (typeof departments[number] & { assignment: typeof assignments[number] })[]

  const isLoading = lAssign || lDepts

  const currentDept = myDepts.find(d => d.id === (activeTab ?? myDepts[0]?.id)) ?? myDepts[0] ?? null

  return (
    <PageContainer>
      <PageHeader title="Minha equipe" description="Seu painel de trabalho e chat interno da equipe" />

      {isLoading ? (
        <div role="status" aria-label="Carregando" className="space-y-3">
          <div className="sk h-16 rounded-lg" />
          <div className="sk h-48 rounded-lg" />
        </div>
      ) : myDepts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Building2 className="h-10 w-10 opacity-30" />
          <p className="text-sm font-medium">Você não está em nenhum departamento ainda.</p>
          <p className="text-xs">Aguarde ser adicionado por um gerente ou administrador.</p>
        </div>
      ) : (
        <>
          {/* Tabs se múltiplos depts */}
          {myDepts.length > 1 && (
            <AbasRolaveis
              rotulo="Departamentos"
              itens={myDepts.map(dept => ({ id: dept.id, rotulo: dept.nome, icone: Building2, ativo: currentDept?.id === dept.id, onClick: () => setActiveTab(dept.id) }))}
            />
          )}

          {currentDept && (
            <>
              {/* Dept info bar */}
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-muted shrink-0">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{currentDept.nome}</p>
                  <div className="flex flex-wrap gap-3 mt-0.5">
                    {currentDept.sla_primeira_resposta_minutos && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> SLA resposta: {currentDept.sla_primeira_resposta_minutos}min
                      </span>
                    )}
                    {currentDept.sla_resolucao_horas && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Timer className="h-3 w-3" /> Resolução: {currentDept.sla_resolucao_horas}h
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Painel específico por módulo */}
              {currentDept.modulo_acesso === 'estrategista'
                ? <EstrategistaPanel userId={user!.id} />
                : currentDept.modulo_acesso === 'cobranca'
                ? <CobrancaAgentPanel />
                : <AgentPanel userId={user!.id} deptId={currentDept.id} />
              }

            </>
          )}
        </>
      )}
    </PageContainer>
  )
}
