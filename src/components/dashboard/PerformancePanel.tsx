import { useState } from 'react'
import {
  BarChart2, Crown, Instagram, FileCheck, Sparkles, Globe,
  TrendingUp, TrendingDown, Minus, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sparkline } from '@/components/ui/Sparkline'
import type { EstrategistaStats } from '@/hooks/useDashboardMetrics'

type Dimension = 'geral' | 'redes' | 'entregas' | 'sentimental'

const DIMENSIONS: Array<{
  key: Dimension
  label: string
  icon: React.ElementType
  color: string
  bg: string
  short: string
  metaLabel: (e: EstrategistaStats) => string | null
}> = [
  {
    key: 'geral',
    label: 'Geral',
    icon: Globe,
    color: 'text-primary',
    bg: 'bg-primary-muted',
    short: 'geral',
    metaLabel: (e) => `${e.totalClientes} cliente${e.totalClientes !== 1 ? 's' : ''}${e.diasMediaSemPostar != null ? ` · ${e.diasMediaSemPostar}d média` : ''}`,
  },
  {
    key: 'redes',
    label: 'Redes',
    icon: Instagram,
    color: 'text-pink-500',
    bg: 'bg-pink-500/10',
    short: 'redes',
    metaLabel: (e) => `${e.criticos} crítico${e.criticos !== 1 ? 's' : ''} · ${e.semIg} sem IG${e.diasMediaSemPostar != null ? ` · ${e.diasMediaSemPostar}d` : ''}`,
  },
  {
    key: 'entregas',
    label: 'Entregas & Avaliações',
    icon: FileCheck,
    color: 'text-warning',
    bg: 'bg-warning/10',
    short: 'entregas',
    metaLabel: (e) => {
      const parts: string[] = []
      if (e.camiEntregasTotal > 0) {
        parts.push(`${e.camiEntregasTotal} entrega${e.camiEntregasTotal !== 1 ? 's' : ''}`)
      }
      if (e.camiRating != null && e.camiRatedCount > 0) {
        parts.push(`⭐ ${e.camiRating.toFixed(1)} (${e.camiRatedCount} avaliação${e.camiRatedCount !== 1 ? 'ões' : ''})`)
      } else if (e.camiEntregasTotal > 0) {
        parts.push('sem avaliações')
      }
      if (parts.length === 0 && e.npsRespostas > 0) {
        return `NPS ${e.npsScoreRaw} · ${e.npsRespostas} resposta${e.npsRespostas !== 1 ? 's' : ''}`
      }
      return parts.length > 0 ? parts.join(' · ') : 'sem entregas no cami'
    },
  },
  {
    key: 'sentimental',
    label: 'Sentimental',
    icon: Sparkles,
    color: 'text-accent',
    bg: 'bg-accent/15',
    short: 'sent.',
    metaLabel: (e) => e.sentimentTotal > 0 ? `${e.sentimentPositivo}/${e.sentimentTotal} análises positivas` : 'sem análises ainda',
  },
]

function getScore(e: EstrategistaStats, dim: Dimension): number | null {
  switch (dim) {
    case 'geral': return e.score
    case 'redes': return e.scoreRedes
    case 'entregas': {
      const parts = [e.scoreEntregas, e.scoreNps].filter((v): v is number => v != null)
      if (parts.length === 0) return null
      return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length)
    }
    case 'sentimental': return e.scoreSentimental
  }
}

const eyebrow = 'text-[10.5px] font-mono uppercase tracking-[0.08em] text-muted-foreground font-medium'

// Borda esquerda por posição do pódio — transparent nos demais para manter espaçamento uniforme
const MEDAL_BORDER: Record<number, string> = {
  0: 'border-l-2 border-l-yellow-400',
  1: 'border-l-2 border-l-slate-400',
  2: 'border-l-2 border-l-orange-400',
}
const MEDAL_COLOR: Record<number, string> = {
  0: 'text-yellow-500 dark:text-yellow-400',
  1: 'text-slate-500 dark:text-slate-300',
  2: 'text-orange-500 dark:text-orange-400',
}

export function PerformancePanel({ estrategistas }: { estrategistas: EstrategistaStats[] }) {
  const hasEntregasData = estrategistas.some(e => e.camiEntregasTotal > 0)
  const visibleDimensions = DIMENSIONS.filter(d => d.key !== 'entregas' || hasEntregasData)

  const [dim, setDim] = useState<Dimension>('geral')
  const activeDim = hasEntregasData ? dim : (dim === 'entregas' ? 'geral' : dim)
  const dimConfig = DIMENSIONS.find(d => d.key === activeDim)!

  const sorted = [...estrategistas].sort((a, b) => {
    const sa = getScore(a, activeDim)
    const sb = getScore(b, activeDim)
    if (sa == null && sb == null) return a.nome.localeCompare(b.nome)
    if (sa == null) return 1
    if (sb == null) return -1
    return sb - sa
  })

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border/60">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-muted">
          <BarChart2 className="h-3.5 w-3.5 text-primary" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">Performance por estrategista</h3>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          · score 0-100 · maior = melhor
        </span>
      </div>

      {/* Tabs de dimensão */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/60 overflow-x-auto bg-muted/20">
        {visibleDimensions.map(d => {
          const Icon = d.icon
          const isActive = activeDim === d.key
          return (
            <button
              key={d.key}
              onClick={() => setDim(d.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap',
                isActive
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/60',
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', isActive && d.color)} />
              {d.label}
            </button>
          )
        })}
      </div>

      {/* Lista */}
      <div className="divide-y divide-border/60">
        {sorted.map((e, idx) => {
          const score = getScore(e, activeDim)
          const status: 'danger' | 'warning' | 'success' | 'unknown' =
            score == null ? 'unknown'
              : score >= 80 ? 'success'
              : score >= 60 ? 'warning'
              : 'danger'

          const initials = e.nome.split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase()

          const half = Math.floor(e.criticosHistory.length / 2)
          const recente = e.criticosHistory.slice(half).reduce((a, b) => a + b, 0) / Math.max(e.criticosHistory.length - half, 1)
          const anterior = e.criticosHistory.slice(0, half).reduce((a, b) => a + b, 0) / Math.max(half, 1)
          const trend: 'up' | 'down' | 'flat' = recente < anterior - 0.3 ? 'up' : recente > anterior + 0.3 ? 'down' : 'flat'
          const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
          const trendColor = trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-muted-foreground/50'

          const isTop = idx < 3 && score != null && score >= 70
          const medalBorder = isTop ? MEDAL_BORDER[idx] : 'border-l-2 border-l-transparent'
          const medalColor = isTop ? MEDAL_COLOR[idx] : ''

          const scoreTextColor =
            status === 'success' ? 'text-success' :
            status === 'warning' ? 'text-warning' :
            status === 'danger'  ? 'text-danger'  : 'text-muted-foreground'

          const barColor =
            status === 'success' ? 'bg-success' :
            status === 'warning' ? 'bg-warning' :
            status === 'danger'  ? 'bg-danger'  : 'bg-muted-foreground/40'

          return (
            <div
              key={e.user_id}
              className={cn(
                'flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors',
                medalBorder,
                isTop && 'bg-gradient-to-r from-primary/[0.06] to-transparent dark:from-primary/[0.04]',
              )}
            >
              {/* Rank com coroa pros 3 primeiros */}
              <div className="flex items-center gap-2 shrink-0 w-[56px]">
                {isTop
                  ? <Crown className={cn('h-4 w-4', medalColor)} />
                  : <span className="w-4" />
                }
                <span className={cn(
                  'text-[11px] font-mono tabular-nums w-6 text-right',
                  isTop ? cn(medalColor, 'font-bold') : 'text-muted-foreground/50',
                )}>
                  {String(idx + 1).padStart(2, '0')}
                </span>
              </div>

              {/* Avatar */}
              <span className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1',
                status === 'success' ? 'bg-success/15 text-success ring-success/20'
                  : status === 'warning' ? 'bg-warning/15 text-warning ring-warning/20'
                  : status === 'danger' ? 'bg-danger/15 text-danger ring-danger/20'
                  : 'bg-muted text-muted-foreground ring-border',
              )}>
                {initials}
              </span>

              {/* Nome + meta da dimensão */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{e.nome}</p>
                  <TrendIcon className={cn('h-3 w-3 shrink-0', trendColor)} />
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums truncate">
                  {dimConfig.metaLabel(e)}
                </p>
              </div>

              {/* Sparkline */}
              {e.criticosHistory.length >= 2 && (
                <div className="hidden lg:block shrink-0" title="Críticos nas últimas 8 semanas">
                  <Sparkline values={e.criticosHistory.map(v => -v)} width={56} height={20} />
                </div>
              )}

              {/* Score + barra de progresso */}
              <div className="flex flex-col items-end gap-0.5 shrink-0 w-[72px]">
                {score != null ? (
                  <>
                    <p className={cn('text-2xl font-extrabold tabular-nums leading-none', scoreTextColor)}>
                      {score}
                    </p>
                    <div className="w-full h-1 rounded-full bg-muted overflow-hidden mt-0.5">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', barColor)}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                    <p className={cn(eyebrow, 'text-[9.5px]')}>{dimConfig.short}</p>
                  </>
                ) : (
                  <div className="flex items-center gap-1 text-muted-foreground/50">
                    <AlertCircle className="h-3 w-3" />
                    <p className="text-base font-semibold">—</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
