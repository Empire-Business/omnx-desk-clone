import { Instagram, RefreshCw, ExternalLink, TrendingUp, TrendingDown, Calendar, Users } from 'lucide-react'
import { useInstagramStats, useRefreshInstagramStats } from '@/hooks/useInstagramStats'
import type { ClientContract } from '@/types/database'
import { cn } from '@/lib/utils'

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'agora'
  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)
  const week = Math.floor(day / 7)
  const month = Math.floor(day / 30)
  if (sec < 60) return 'agora há pouco'
  if (min < 60) return `há ${min} min`
  if (hr < 24) return `há ${hr} h`
  if (day < 7) return `há ${day} ${day === 1 ? 'dia' : 'dias'}`
  if (week < 5) return `há ${week} ${week === 1 ? 'semana' : 'semanas'}`
  if (month < 12) return `há ${month} ${month === 1 ? 'mês' : 'meses'}`
  const year = Math.floor(day / 365)
  return `há ${year} ${year === 1 ? 'ano' : 'anos'}`
}

function getBaselineFollowers(contracts: ClientContract[] | undefined): number | null {
  if (!contracts || contracts.length === 0) return null
  const withBaseline = contracts.filter(c => c.seguidores_inicio != null)
  if (withBaseline.length === 0) return null
  // Pega o contrato mais antigo (data_assinatura ou created_at) com seguidores_inicio
  const sorted = [...withBaseline].sort((a, b) => {
    const aDate = a.data_assinatura ?? a.criado_em ?? ''
    const bDate = b.data_assinatura ?? b.criado_em ?? ''
    return aDate.localeCompare(bDate)
  })
  return sorted[0].seguidores_inicio as number
}

export function InstagramPanel({
  clientId,
  instagramHandle,
  contracts,
}: {
  clientId: string
  instagramHandle: string | null | undefined
  contracts: ClientContract[] | undefined
}) {
  const hasHandle = !!instagramHandle?.trim()
  const { data, isLoading, error, isError } = useInstagramStats(clientId, hasHandle)
  const refresh = useRefreshInstagramStats(clientId)

  const snapshot = data?.snapshot
  const baseline = getBaselineFollowers(contracts)
  const growth = snapshot?.followers != null && baseline != null
    ? snapshot.followers - baseline
    : null

  const profileUrl = snapshot?.username
    ? `https://www.instagram.com/${snapshot.username}/`
    : instagramHandle?.startsWith('http')
      ? instagramHandle
      : instagramHandle
        ? `https://www.instagram.com/${instagramHandle.replace(/^@+/, '')}/`
        : null

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Instagram className="h-4 w-4 text-pink-500" />
          Instagram
        </h3>
        {hasHandle && (
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending || isLoading}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="Atualizar agora"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', (refresh.isPending || isLoading) && 'animate-spin')} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        )}
      </div>

      {!hasHandle && (
        <p className="text-sm text-muted-foreground">Adicione o Instagram do cliente para ver estatísticas.</p>
      )}

      {hasHandle && isLoading && !snapshot && (
        <div className="space-y-3">
          <div className="h-12 shimmer rounded-lg" />
          <div className="h-20 shimmer rounded-lg" />
        </div>
      )}

      {hasHandle && isError && !snapshot && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3">
          <p className="text-xs text-danger">
            {error instanceof Error ? error.message : 'Falha ao carregar dados do Instagram.'}
          </p>
        </div>
      )}

      {snapshot && (
        <>
          {/* Header com perfil */}
          <div className="flex items-center gap-3">
            {snapshot.profile_pic_url ? (
              <img
                src={snapshot.profile_pic_url}
                alt={snapshot.username}
                className="h-12 w-12 rounded-full object-cover border border-border"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-500/10">
                <Instagram className="h-5 w-5 text-pink-500" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              {snapshot.full_name && (
                <p className="text-sm font-semibold text-foreground truncate">{snapshot.full_name}</p>
              )}
              {profileUrl ? (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  @{snapshot.username} <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <p className="text-xs text-muted-foreground">@{snapshot.username}</p>
              )}
            </div>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-1.5 text-2xs text-muted-foreground mb-1">
                <Users className="h-3 w-3" />
                Seguidores
              </div>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {snapshot.followers?.toLocaleString('pt-BR') ?? '—'}
              </p>
            </div>

            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-1.5 text-2xs text-muted-foreground mb-1">
                {growth != null && growth >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                Crescimento
              </div>
              {growth != null ? (
                <p className={cn(
                  'text-lg font-bold tabular-nums',
                  growth > 0 ? 'text-success' : growth < 0 ? 'text-danger' : 'text-foreground',
                )}>
                  {growth > 0 ? '+' : ''}{growth.toLocaleString('pt-BR')}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic mt-1">Sem baseline</p>
              )}
            </div>

            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-1.5 text-2xs text-muted-foreground mb-1">
                <Calendar className="h-3 w-3" />
                Última post
              </div>
              {snapshot.last_post_url ? (
                <a
                  href={snapshot.last_post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  {formatRelative(snapshot.last_post_at)}
                </a>
              ) : (
                <p className="text-sm font-semibold text-foreground">{formatRelative(snapshot.last_post_at)}</p>
              )}
            </div>
          </div>

          {baseline != null && (
            <p className="text-2xs text-muted-foreground">
              Baseline: {baseline.toLocaleString('pt-BR')} seguidores no início do contrato.
            </p>
          )}

          <p className="text-2xs text-muted-foreground">
            Atualizado {formatRelative(snapshot.fetched_at)}
            {data?.stale && ' · dados em cache (API indisponível)'}
          </p>
        </>
      )}
    </div>
  )
}
