import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  Instagram, AlertCircle, AlertTriangle,
  ArrowUpRight, Sparkles, Lightbulb, FileCheck, MessageSquare, Send,
} from 'lucide-react'
import { useDashboardData } from '@/hooks/useDashboardMetrics'
import { useCamiDeliveries, computeCamiStats } from '@/hooks/useCamiDeliveries'
import { PerformancePanel } from '@/components/dashboard/PerformancePanel'
import { Carousel } from '@/components/ui/Carousel'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'

interface Props { onTabChange?: (tab: 'geral' | 'clientes' | 'entregas' | 'relatorio') => void }

const eyebrow = 'text-[10.5px] font-mono uppercase tracking-[0.08em] text-muted-foreground font-medium'

function SectionHeader({
  icon: Icon, title, subtitle, count, iconBg = 'bg-muted', iconColor = 'text-foreground', action,
}: {
  icon: React.ElementType
  title: string
  subtitle?: string
  count?: number
  iconBg?: string
  iconColor?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-3.5">
      <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', iconBg)}>
        <Icon className={cn('h-3.5 w-3.5', iconColor)} />
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {subtitle && <span className="text-xs text-muted-foreground">· {subtitle}</span>}
      {count != null && (
        <span className="rounded-md bg-muted px-1.5 py-0 text-[10.5px] font-semibold text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
      <span className="ml-1 h-px flex-1 bg-border/60" />
      {action}
    </div>
  )
}

export function DashboardOverview({ onTabChange }: Props) {
  const navigate = useNavigate()
  const { data, isLoading } = useDashboardData()
  const { data: camiData } = useCamiDeliveries()
  const [confirmChat, setConfirmChat] = useState<{ nome: string; whatsapp: string; mensagem: string } | null>(null)

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-muted/40 shimmer" />
          ))}
        </div>
        <div className="h-48 rounded-xl bg-muted/40 shimmer" />
      </div>
    )
  }

  const { isAdmin, kpis, criticos, semIgList, estrategistas, sentiment, sentimentReports } = data
  const camiStats = computeCamiStats(camiData?.deliveries ?? [])

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()
  const atrasadasList = (camiData?.deliveries ?? [])
    .filter(d => {
      const prazo = d.client_deadline_at ?? d.publish_date ?? d.edit_deadline
      const isPend = d.status !== 'aprovado' && d.status !== 'arquivado'
      return isPend && !!prazo && new Date(prazo).getTime() < todayMs
    })
    .sort((a, b) => {
      const prazoA = new Date((a.client_deadline_at ?? a.publish_date ?? a.edit_deadline) ?? '').getTime()
      const prazoB = new Date((b.client_deadline_at ?? b.publish_date ?? b.edit_deadline) ?? '').getTime()
      return prazoA - prazoB
    })

  return (
    <div className="space-y-4 lg:space-y-6">

      {/* Grid de métricas — sempre visível, sem rotação */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard
          icon={Instagram}
          iconBg="bg-pink-500/10"
          iconColor="text-pink-500"
          topBorderClass="border-t-pink-500/60"
          title="Redes Sociais"
          onSeeAll={() => onTabChange?.('clientes')}
          metrics={[
            { value: kpis.clientesAtivos, label: isAdmin ? 'ativos' : 'seus clientes' },
            { value: kpis.criticos, label: 'críticos', tone: kpis.criticos > 0 ? 'danger' : undefined },
            { value: semIgList.length, label: 'sem Instagram', tone: semIgList.length > 0 ? 'warning' : undefined },
          ]}
        />
        <SummaryCard
          icon={Sparkles}
          iconBg="bg-accent/15"
          iconColor="text-accent"
          topBorderClass="border-t-accent/60"
          title="Sentimental"
          onSeeAll={() => onTabChange?.('relatorio')}
          metrics={sentiment ? [
            { value: sentiment.total, label: 'análises' },
            { value: sentiment.alertas.length, label: 'alertas', tone: sentiment.alertas.length > 0 ? 'danger' : undefined },
            { value: sentiment.proximos_passos.length, label: 'sugestões', tone: sentiment.proximos_passos.length > 0 ? 'success' : undefined },
          ] : [
            { value: '—', label: 'análises' },
            { value: '—', label: 'alertas' },
            { value: '—', label: 'sugestões' },
          ]}
        />
        <SummaryCard
          icon={FileCheck}
          iconBg="bg-primary-muted"
          iconColor="text-primary"
          topBorderClass="border-t-primary/60"
          title="Entregas"
          onSeeAll={() => onTabChange?.('entregas')}
          metrics={[
            { value: camiStats.total > 0 ? camiStats.total : '—', label: 'total' },
            { value: camiStats.atrasadas, label: 'atrasadas', tone: camiStats.atrasadas > 0 ? 'danger' : undefined },
            { value: camiStats.emProducao, label: 'em produção', tone: camiStats.emProducao > 0 ? 'warning' : undefined },
          ]}
        />
      </div>

      {/* Painéis de ação */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Críticos */}
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <SectionHeader
            icon={AlertCircle}
            iconBg="bg-danger/15" iconColor="text-danger"
            title="Em estado crítico"
            count={criticos.length}
            action={criticos.length > 5 && (
              <button
                onClick={() => onTabChange?.('clientes')}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                ver todos
              </button>
            )}
          />
          {criticos.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-muted-foreground">Tudo em dia. Ninguém crítico hoje.</p>
            </div>
          ) : (
            <Carousel
              items={criticos}
              itemsPerSlide={4}
              autoPlayInterval={9000}
              getKey={c => c.id}
              renderItem={c => {
                const d = c.daysWithoutPost
                const urgency =
                  d > 365 ? { bg: 'bg-danger', text: 'text-white', row: 'bg-danger/[0.04]' } :
                  d > 90  ? { bg: 'bg-danger/30', text: 'text-danger', row: '' } :
                  d > 30  ? { bg: 'bg-danger/15', text: 'text-danger', row: '' } :
                             { bg: 'bg-warning/15', text: 'text-warning', row: '' }
                const daysLabel = d >= 365 ? `${(d / 365).toFixed(1)}a` : String(d)
                const firstName = c.nome.replace(/\s*\[MERGED\]\s*/gi, '').split(' ')[0]
                const chatMsg = `oi ${firstName}, vi que você está ${d} dias sem postar, precisa de ajuda com algo?`
                return (
                  <div className={cn(
                    'grid grid-cols-[40px_1fr_auto] items-center gap-3 px-5 py-2.5 border-b border-border/60 last:border-b-0',
                    urgency.row,
                  )}>
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', urgency.bg)}>
                      <span className={cn('font-extrabold tabular-nums leading-none', urgency.text, d >= 100 ? 'text-[9px]' : 'text-xs')}>
                        {daysLabel}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-foreground truncate">
                        {c.nome.replace(/\s*\[MERGED\]\s*/gi, '')}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground truncate">
                        {d} dias sem postar
                        {isAdmin && c.estrategistas.length > 0 && ` · ${c.estrategistas.join(', ')}`}
                      </p>
                    </div>
                    {c.whatsapp ? (
                      <button
                        onClick={() => setConfirmChat({ nome: c.nome, whatsapp: c.whatsapp!, mensagem: chatMsg })}
                        title="Iniciar conversa"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/clientes/${c.id}`)}
                        title="Ver cliente"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground/40 hover:text-foreground transition-colors"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              }}
            />
          )}
        </div>

        {/* Entregas atrasadas */}
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <SectionHeader
            icon={FileCheck}
            iconBg="bg-danger/15" iconColor="text-danger"
            title="Entregas atrasadas"
            count={atrasadasList.length}
            action={atrasadasList.length > 4 && (
              <button
                onClick={() => onTabChange?.('entregas')}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                ver todas
              </button>
            )}
          />
          {atrasadasList.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {camiData ? 'Nenhuma entrega atrasada. ✓' : 'Integração de entregas pendente.'}
              </p>
            </div>
          ) : (
            <Carousel
              items={atrasadasList}
              itemsPerSlide={4}
              autoPlayInterval={9000}
              getKey={d => d.id}
              renderItem={d => {
                const prazoStr = d.client_deadline_at ?? d.publish_date ?? d.edit_deadline
                const diasAtrasada = prazoStr
                  ? Math.floor((todayMs - new Date(prazoStr).getTime()) / 86400000)
                  : 0
                const urgency =
                  diasAtrasada > 30 ? { bg: 'bg-danger', text: 'text-white' } :
                  diasAtrasada > 14 ? { bg: 'bg-danger/25', text: 'text-danger' } :
                                      { bg: 'bg-danger/15', text: 'text-danger' }
                return (
                  <div
                    onClick={() => onTabChange?.('entregas')}
                    className="grid grid-cols-[40px_1fr] items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors border-b border-border/60 last:border-b-0"
                  >
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', urgency.bg)}>
                      <span className={cn('font-extrabold tabular-nums leading-none', urgency.text, diasAtrasada >= 100 ? 'text-[9px]' : 'text-xs')}>
                        {diasAtrasada}d
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-foreground truncate">{d.title}</p>
                      <p className="text-[11.5px] text-muted-foreground truncate">
                        {d.client_nome ?? d.workspace_name ?? '—'}
                        {isAdmin && d.estrategista_nome && ` · ${d.estrategista_nome}`}
                      </p>
                    </div>
                  </div>
                )
              }}
            />
          )}
        </div>
      </div>

      {/* Performance por estrategista (admin/gerente) */}
      {isAdmin && estrategistas.length > 0 && (
        <PerformancePanel estrategistas={estrategistas} />
      )}

      {/* Relatório Sentimental — destaque com breakout visual */}
      <div className="relative rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/[0.04] via-card to-card overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-accent/15 blur-[80px]" />
        <div className="pointer-events-none absolute -bottom-32 -left-12 h-48 w-48 rounded-full bg-primary/10 blur-[80px]" />

        <div className="relative">
          <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-border/40">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 ring-1 ring-accent/20">
                <Sparkles className="h-4 w-4 text-accent" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">Relatório Sentimental</h3>
                  <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent uppercase tracking-wider">IA</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  A IA leu as conversas dos estrategistas e identificou pontos de melhoria
                </p>
              </div>
            </div>
            <button
              onClick={() => onTabChange?.('relatorio')}
              className="shrink-0 inline-flex items-center gap-1 rounded-md bg-accent/15 hover:bg-accent/25 px-3 py-1.5 text-xs font-semibold text-accent transition-colors"
            >
              Ver completo <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>

          {!sentiment ? (
            <div className="px-6 py-12 text-center">
              <Sparkles className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">A IA ainda não rodou análises. Relatórios são gerados semanalmente.</p>
            </div>
          ) : (
            <>
              {/* Stats — hierarquia clara com números grandes */}
              <div className="grid grid-cols-3 divide-x divide-border/40">
                <div className="px-6 py-4">
                  <p className={eyebrow}>Semana de</p>
                  <p className="mt-1 text-lg font-bold text-foreground">
                    {new Date(sentiment.semana).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                    {sentiment.total} análise{sentiment.total > 1 ? 's' : ''} · {sentiment.estrategistas} estrategista{sentiment.estrategistas > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="px-6 py-4">
                  <p className={eyebrow}>Sentimento</p>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    <div>
                      <p className="text-2xl font-extrabold tabular-nums leading-none text-success">{sentiment.positivo}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">positivo</p>
                    </div>
                    <div>
                      <p className="text-2xl font-extrabold tabular-nums leading-none text-warning">{sentiment.neutro}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">neutro</p>
                    </div>
                    <div>
                      <p className="text-2xl font-extrabold tabular-nums leading-none text-danger">{sentiment.negativo}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">negativo</p>
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4">
                  <p className={eyebrow}>Pontos identificados</p>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums leading-none text-foreground">
                    {sentiment.alertas.length + sentiment.proximos_passos.length}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {sentiment.alertas.length} alertas · {sentiment.proximos_passos.length} sugestões
                  </p>
                </div>
              </div>

              {/* Insights — mini-cards com borda lateral colorida */}
              {(sentiment.alertas.length > 0 || sentiment.proximos_passos.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-6 pb-5 pt-4 border-t border-border/40">
                  {sentiment.alertas.length > 0 && (
                    <div>
                      <p className={cn(eyebrow, 'flex items-center gap-1.5 text-danger mb-2')}>
                        <AlertTriangle className="h-3 w-3" /> Pontos de atenção
                      </p>
                      <div className="space-y-1.5">
                        {sentiment.alertas.slice(0, 4).map((a, i) => (
                          <div key={i} className="rounded-r-lg border-l-2 border-l-danger bg-danger/[0.04] dark:bg-danger/[0.06] px-3 py-2">
                            <p className="text-[12.5px] text-foreground leading-snug line-clamp-2">{a}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {sentiment.proximos_passos.length > 0 && (
                    <div>
                      <p className={cn(eyebrow, 'flex items-center gap-1.5 text-success mb-2')}>
                        <Lightbulb className="h-3 w-3" /> Melhorias sugeridas
                      </p>
                      <div className="space-y-1.5">
                        {sentiment.proximos_passos.slice(0, 4).map((p, i) => (
                          <div key={i} className="rounded-r-lg border-l-2 border-l-success bg-success/[0.04] dark:bg-success/[0.06] px-3 py-2">
                            <p className="text-[12.5px] text-foreground leading-snug line-clamp-2">{p}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Análises recentes — 2 por slide em desktop, badge de sentimento visível */}
              {sentimentReports.length > 0 && (
                <div className="border-t border-border/40 px-2 py-2">
                  <p className={cn(eyebrow, 'px-3 mb-1')}>Análises recentes</p>
                  <Carousel
                    items={sentimentReports}
                    itemsPerSlide={2}
                    autoPlayInterval={10000}
                    getKey={r => r.id}
                    renderItem={r => (
                      <div
                        onClick={() => onTabChange?.('relatorio')}
                        className="flex flex-col gap-1.5 px-3 py-3 cursor-pointer hover:bg-muted/30 rounded-lg transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13px] font-semibold text-foreground truncate">{r.client_nome}</p>
                          <span className={cn(
                            'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold capitalize',
                            r.sentimento_geral === 'positivo' ? 'bg-success/15 text-success' :
                            r.sentimento_geral === 'negativo' ? 'bg-danger/15 text-danger' :
                            'bg-warning/15 text-warning',
                          )}>
                            {r.sentimento_geral}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-muted-foreground line-clamp-2 leading-snug">{r.resumo}</p>
                        {isAdmin && (
                          <p className="text-[10.5px] font-mono text-muted-foreground/70">{r.estrategista_nome}</p>
                        )}
                      </div>
                    )}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {/* Modal de confirmação de chat */}
      <ChatConfirmModal
        open={confirmChat !== null}
        nome={confirmChat?.nome ?? ''}
        mensagemInicial={confirmChat?.mensagem ?? ''}
        onClose={() => setConfirmChat(null)}
        onConfirm={(mensagem) => {
          if (!confirmChat) return
          navigate(`/chat/inbox?novaConversa=true&nome=${encodeURIComponent(confirmChat.nome)}&whatsapp=${encodeURIComponent(confirmChat.whatsapp)}&mensagem=${encodeURIComponent(mensagem)}`)
          setConfirmChat(null)
        }}
      />
    </div>
  )
}

function ChatConfirmModal({
  open, nome, mensagemInicial, onClose, onConfirm,
}: {
  open: boolean
  nome: string
  mensagemInicial: string
  onClose: () => void
  onConfirm: (mensagem: string) => void
}) {
  const [mensagem, setMensagem] = useState(mensagemInicial)
  const firstName = nome.replace(/\s*\[MERGED\]\s*/gi, '').split(' ')[0]

  useEffect(() => {
    if (open) setMensagem(mensagemInicial)
  }, [open, mensagemInicial])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Iniciar conversa com ${firstName}`}
      description="Revise e edite a mensagem antes de enviar."
      size="sm"
    >
      <div className="p-5 space-y-4">
        <textarea
          value={mensagem}
          onChange={e => setMensagem(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(mensagem)}
            disabled={!mensagem.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            Iniciar conversa
          </button>
        </div>
      </div>
    </Modal>
  )
}

type MetricTone = 'danger' | 'warning' | 'success' | 'info'

function SummaryCard({
  icon: Icon, iconBg, iconColor, topBorderClass, title, metrics, onSeeAll,
}: {
  icon: React.ElementType
  iconBg: string
  iconColor: string
  topBorderClass: string
  title: string
  metrics: Array<{ value: string | number; label: string; tone?: MetricTone }>
  onSeeAll?: () => void
}) {
  const toneColor: Record<MetricTone, string> = {
    danger:  'text-danger',
    warning: 'text-warning',
    success: 'text-success',
    info:    'text-info',
  }
  return (
    <div className={cn('rounded-xl border border-border/60 bg-card overflow-hidden border-t-2', topBorderClass)}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', iconBg)}>
          <Icon className={cn('h-3.5 w-3.5', iconColor)} />
        </span>
        <span className="text-sm font-semibold text-foreground flex-1">{title}</span>
        {onSeeAll && (
          <button
            onClick={onSeeAll}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            ver todas <ArrowUpRight className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 divide-x divide-border/60">
        {metrics.map((m, i) => (
          <div key={i} className="px-4 py-3.5">
            <p className={cn(
              'text-2xl font-extrabold tabular-nums leading-none',
              m.tone ? toneColor[m.tone] : 'text-foreground',
            )}>
              {m.value}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
