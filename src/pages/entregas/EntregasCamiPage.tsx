import { useMemo } from 'react'
import {
  Layers, FileCheck, RefreshCw, AlertCircle, AlertTriangle,
  CheckCircle2, Clock, Star, TrendingUp, Users, Calendar,
} from 'lucide-react'
import { useCamiDeliveries, isCamiIntegrationReady, computeCamiStats, type CamiDelivery } from '@/hooks/useCamiDeliveries'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'

interface EstrategistaPanorama {
  user_id: string | null
  nome: string
  total: number
  emProducao: number
  atrasadas: number
  aprovadas: number
  ratedCount: number
  avgRating: number | null
  autoApproved: number
}

const SITUATION = {
  excelente: { label: 'Excelente', color: 'text-success', bg: 'bg-success/15', dot: 'bg-success' },
  saudavel:  { label: 'Saudável',  color: 'text-success', bg: 'bg-success/10', dot: 'bg-success/70' },
  atencao:   { label: 'Atenção',   color: 'text-warning', bg: 'bg-warning/15', dot: 'bg-warning' },
  critica:   { label: 'Crítica',   color: 'text-danger',  bg: 'bg-danger/15',  dot: 'bg-danger' },
  semDados:  { label: 'Sem dados', color: 'text-muted-foreground', bg: 'bg-muted', dot: 'bg-muted-foreground/40' },
} as const
type Situation = keyof typeof SITUATION

function classifySituation(p: EstrategistaPanorama): Situation {
  if (p.total === 0) return 'semDados'
  const atrasoPct = p.total > 0 ? p.atrasadas / p.total : 0
  if (atrasoPct >= 0.4) return 'critica'
  const rating = p.avgRating ?? null
  if (rating != null && p.ratedCount >= 3) {
    if (rating >= 4.5 && atrasoPct < 0.1) return 'excelente'
    if (rating >= 4.0 && atrasoPct < 0.2) return 'saudavel'
    if (rating < 3.0 || atrasoPct >= 0.25) return 'atencao'
  }
  if (atrasoPct >= 0.2) return 'atencao'
  return 'saudavel'
}

function aggregateByEstrategista(list: CamiDelivery[]): EstrategistaPanorama[] {
  const map = new Map<string, EstrategistaPanorama>()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()
  const PEND = new Set(['nao_iniciada', 'revisao', 'alteracao'])

  for (const d of list) {
    if (!d.estrategista_user_id) continue
    const key = d.estrategista_user_id
    const nome = d.estrategista_nome ?? '—'
    const p = map.get(key) ?? {
      user_id: d.estrategista_user_id, nome,
      total: 0, emProducao: 0, atrasadas: 0, aprovadas: 0,
      ratedCount: 0, avgRating: null, autoApproved: 0,
    }
    p.total++
    if (PEND.has(d.status)) p.emProducao++
    if (d.status === 'aprovado') p.aprovadas++
    const prazoStr = d.client_deadline_at ?? d.publish_date ?? d.edit_deadline ?? d.script_deadline
    if (PEND.has(d.status) && prazoStr && new Date(prazoStr).getTime() < todayMs) p.atrasadas++
    if (d.auto_approved) p.autoApproved++
    if (!d.auto_approved && d.rating != null) {
      const prevAvg = p.avgRating ?? 0
      const prevCount = p.ratedCount
      p.ratedCount++
      p.avgRating = (prevAvg * prevCount + d.rating) / p.ratedCount
    }
    map.set(key, p)
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

function statusDistribution(list: CamiDelivery[]) {
  const counts: Record<string, number> = {
    nao_iniciada: 0, revisao: 0, alteracao: 0, aprovado: 0, arquivado: 0,
  }
  for (const d of list) counts[d.status] = (counts[d.status] ?? 0) + 1
  const total = list.length || 1
  return [
    { key: 'nao_iniciada', label: 'Não iniciada', count: counts.nao_iniciada, pct: counts.nao_iniciada / total, tone: 'bg-muted-foreground/40' },
    { key: 'revisao',      label: 'Revisão',      count: counts.revisao,      pct: counts.revisao / total,      tone: 'bg-warning' },
    { key: 'alteracao',    label: 'Alteração',    count: counts.alteracao,    pct: counts.alteracao / total,    tone: 'bg-orange-500' },
    { key: 'aprovado',     label: 'Aprovado',     count: counts.aprovado,     pct: counts.aprovado / total,     tone: 'bg-success' },
    { key: 'arquivado',    label: 'Arquivado',    count: counts.arquivado,    pct: counts.arquivado / total,    tone: 'bg-muted/60' },
  ]
}

export function EntregasCamiPage() {
  const ready = isCamiIntegrationReady()
  const { data, isLoading, isFetching, refetch } = useCamiDeliveries({ includeArchived: true })

  const all = data?.deliveries ?? []
  const stats = useMemo(() => computeCamiStats(all), [all])
  const porEstrategista = useMemo(() => aggregateByEstrategista(all), [all])
  const dist = useMemo(() => statusDistribution(all), [all])
  const atrasadasCriticas = useMemo(() => {
    const today = Date.now()
    return all
      .filter(d => {
        if (d.status === 'aprovado' || d.status === 'arquivado') return false
        const prazo = d.client_deadline_at ?? d.publish_date ?? d.edit_deadline ?? d.script_deadline
        return prazo && new Date(prazo).getTime() < today
      })
      .map(d => {
        const prazo = d.client_deadline_at ?? d.publish_date ?? d.edit_deadline ?? d.script_deadline
        const diasAtraso = prazo ? Math.floor((today - new Date(prazo).getTime()) / 86400000) : 0
        return { ...d, diasAtraso }
      })
      .sort((a, b) => b.diasAtraso - a.diasAtraso)
      .slice(0, 8)
  }, [all])

  const taxaAprovacao = stats.total > 0 ? stats.aprovadas / stats.total : null
  const taxaAtraso = stats.total > 0 ? stats.atrasadas / stats.total : null
  const taxaAvaliacao = stats.aprovadas > 0 ? stats.ratedCount / stats.aprovadas : null

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <PageHeader
        title="Entregas & Avaliações"
        description={ready
          ? all.length > 0 ? `Panorama de ${all.length} entrega${all.length !== 1 ? 's' : ''} no cami` : 'Sincronizado com a plataforma de produção'
          : 'Integração com a plataforma de produção em preparação'
        }
        action={
          ready ? (
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
              Sincronizar
            </button>
          ) : null
        }
      />

      {!ready ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-8">
          <div className="max-w-md mx-auto text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-muted">
              <Layers className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-base font-bold text-foreground">Integração em preparação</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              As entregas serão sincronizadas automaticamente da plataforma de produção (cami-plataforma-lb).
            </p>
          </div>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted/40 shimmer" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon={FileCheck}
          title="Nenhuma entrega encontrada"
          description="Quando houver entregas para você na plataforma de produção, elas aparecem aqui."
        />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi icon={Clock}        label="Em produção" value={stats.emProducao} color="text-warning" bg="bg-warning/15" />
            <Kpi icon={AlertTriangle} label="Atrasadas"  value={stats.atrasadas}  color="text-danger"  bg="bg-danger/15" highlight />
            <Kpi icon={CheckCircle2} label="Aprovadas"   value={stats.aprovadas}  color="text-success" bg="bg-success/15" />
            <Kpi
              icon={Star}
              label="⭐ Média geral"
              value={stats.avgRating != null ? Number(stats.avgRating.toFixed(1)) : null}
              suffix={stats.avgRating != null ? `/5 (${stats.ratedCount} aval.)` : 'sem avaliações'}
              color="text-info"
              bg="bg-info/15"
            />
          </div>

          {/* Saúde geral */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border/60">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-muted">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
              </span>
              <h3 className="text-sm font-semibold text-foreground">Saúde da gestão de entregas</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
              <Health
                label="Taxa de aprovação"
                value={taxaAprovacao}
                bench={{ ok: 0.6, warn: 0.4 }}
                hint={`${stats.aprovadas} de ${stats.total}`}
              />
              <Health
                label="Taxa de atraso"
                value={taxaAtraso}
                inverted
                bench={{ ok: 0.1, warn: 0.25 }}
                hint={`${stats.atrasadas} pendentes vencidas`}
              />
              <Health
                label="Cobertura de avaliação"
                value={taxaAvaliacao}
                bench={{ ok: 0.5, warn: 0.25 }}
                hint={`${stats.ratedCount} avaliadas de ${stats.aprovadas} aprovadas`}
              />
            </div>
          </div>

          {/* Distribuição por status */}
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10.5px] font-mono uppercase tracking-[0.08em] text-muted-foreground font-medium">
                Distribuição por status
              </span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-md bg-muted/40">
              {dist.map(s => s.count > 0 && (
                <div key={s.key} className={cn('h-full transition-all', s.tone)} style={{ width: `${s.pct * 100}%` }} title={`${s.label}: ${s.count}`} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              {dist.map(s => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', s.tone)} />
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-semibold text-foreground tabular-nums">{s.count}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Performance por estrategista */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border/60">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-muted">
                <Users className="h-3.5 w-3.5 text-primary" />
              </span>
              <h3 className="text-sm font-semibold text-foreground">Panorama por estrategista</h3>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                · {porEstrategista.length} no total
              </span>
            </div>
            <div className="divide-y divide-border/60">
              {porEstrategista.map(p => {
                const sit = classifySituation(p)
                const conf = SITUATION[sit]
                const initials = p.nome.split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '—'
                const atrasoPct = p.total > 0 ? Math.round((p.atrasadas / p.total) * 100) : 0
                return (
                  <div key={p.user_id ?? p.nome} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors">
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold', conf.bg, conf.color)}>
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground truncate">{p.nome}</p>
                        <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide', conf.bg, conf.color)}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', conf.dot)} />
                          {conf.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                        {p.total} entrega{p.total !== 1 ? 's' : ''}
                        {' · '}{p.emProducao} em produção
                        {p.atrasadas > 0 && (
                          <span className="text-danger font-semibold"> · {p.atrasadas} atrasada{p.atrasadas !== 1 ? 's' : ''} ({atrasoPct}%)</span>
                        )}
                        {' · '}{p.aprovadas} aprovada{p.aprovadas !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0">
                      {p.avgRating != null && p.ratedCount > 0 ? (
                        <div className="flex items-center gap-1 text-info">
                          <Star className="h-3.5 w-3.5 fill-info" />
                          <span className="text-base font-extrabold tabular-nums">{p.avgRating.toFixed(1)}</span>
                          <span className="text-[10px] text-muted-foreground">/5</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">sem avaliações</span>
                      )}
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {p.ratedCount} {p.ratedCount === 1 ? 'avaliação' : 'avaliações'}
                        {p.autoApproved > 0 && ` · ${p.autoApproved} auto`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Atrasadas críticas */}
          {atrasadasCriticas.length > 0 && (
            <div className="rounded-xl border border-danger/30 bg-danger/[0.03] overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-danger/20">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-danger/15">
                  <AlertCircle className="h-3.5 w-3.5 text-danger" />
                </span>
                <h3 className="text-sm font-semibold text-foreground">Atrasadas críticas</h3>
                <span className="text-xs text-danger font-bold">{atrasadasCriticas.length}</span>
              </div>
              <div className="divide-y divide-danger/15">
                {atrasadasCriticas.map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Calendar className="h-3.5 w-3.5 text-danger shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{d.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {d.client_nome ?? d.workspace_name ?? '—'}
                        {d.estrategista_nome && ` · ${d.estrategista_nome}`}
                        {d.channel && ` · ${d.channel}`}
                      </p>
                    </div>
                    <span className="rounded-md bg-danger/15 px-2 py-0.5 text-[10.5px] font-bold text-danger tabular-nums">
                      {d.diasAtraso}d
                    </span>
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

function Kpi({
  icon: Icon, label, value, suffix, color, bg, highlight,
}: {
  icon: React.ElementType
  label: string
  value: number | null
  suffix?: string
  color: string
  bg: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <p className="text-[10.5px] font-mono uppercase tracking-[0.08em] text-muted-foreground font-medium">{label}</p>
      <div className="mt-1 flex items-end gap-2">
        <span className={cn('h-7 w-7 rounded-md flex items-center justify-center', bg)}>
          <Icon className={cn('h-3.5 w-3.5', color)} />
        </span>
        <p className={cn('text-2xl font-extrabold tabular-nums leading-none',
          value == null ? 'text-muted-foreground' : highlight && (value as number) > 0 ? color : 'text-foreground',
        )}>
          {value ?? '—'}
        </p>
        {suffix && <span className="text-[10.5px] text-muted-foreground pb-1">{suffix}</span>}
      </div>
    </div>
  )
}

function Health({
  label, value, bench, hint, inverted = false,
}: {
  label: string
  value: number | null
  bench: { ok: number; warn: number }   // thresholds em fração 0-1
  hint?: string
  inverted?: boolean                     // se true: menor = melhor
}) {
  let tone: Situation = 'semDados'
  if (value != null) {
    if (inverted) {
      tone = value <= bench.ok ? 'saudavel' : value <= bench.warn ? 'atencao' : 'critica'
    } else {
      tone = value >= bench.ok ? 'saudavel' : value >= bench.warn ? 'atencao' : 'critica'
    }
  }
  const conf = SITUATION[tone]
  return (
    <div className="px-5 py-4">
      <p className="text-[10.5px] font-mono uppercase tracking-[0.08em] text-muted-foreground font-medium">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn('text-2xl font-extrabold tabular-nums leading-none', conf.color)}>
          {value != null ? `${Math.round(value * 100)}%` : '—'}
        </span>
        <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0 text-[9.5px] font-bold uppercase tracking-wide', conf.bg, conf.color)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', conf.dot)} />
          {conf.label}
        </span>
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">{hint}</p>}
    </div>
  )
}
