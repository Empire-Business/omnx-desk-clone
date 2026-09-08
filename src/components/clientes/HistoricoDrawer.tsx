import { useEffect, useState, useRef } from 'react'
import { X, Calendar, Heart, MessageCircle, ExternalLink, Film, Layers, ImageIcon, Crown, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Sparkline } from '@/components/ui/Sparkline'
import { cn } from '@/lib/utils'
import type { SocialSnapshot } from '@/hooks/useInstagramStats'

interface HistoricoDrawerProps {
  open: boolean
  onClose: () => void
  clientName: string
  snapshot: SocialSnapshot | undefined
  history: Array<{ followers: number; t: number }> | undefined
}

interface PostRow {
  ts: number
  shortcode?: string
  likes: number
  comments: number
  type: 'Reel' | 'Carrossel' | 'Post'
  caption?: string
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'k'
  return n.toLocaleString('pt-BR')
}

const TYPE_CONFIG = {
  Reel:      { icon: Film,      bg: 'bg-pink-500/10',  text: 'text-pink-500',  activeBorder: 'border-pink-500/30 bg-pink-500/10 text-pink-600 dark:text-pink-400' },
  Carrossel: { icon: Layers,    bg: 'bg-blue-500/10',  text: 'text-blue-500',  activeBorder: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  Post:      { icon: ImageIcon, bg: 'bg-muted',        text: 'text-muted-foreground', activeBorder: 'border-border bg-muted text-foreground' },
}

export function HistoricoDrawer({ open, onClose, clientName, snapshot, history }: HistoricoDrawerProps) {
  const [visible, setVisible] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [sortBy, setSortBy] = useState<'date' | 'likes' | 'comments'>('date')
  const [filterType, setFilterType] = useState<'all' | 'Reel' | 'Carrossel' | 'Post'>('all')
  const sparkRef = useRef<HTMLDivElement>(null)
  const [sparkWidth, setSparkWidth] = useState(400)

  useEffect(() => {
    if (open) {
      setVisible(true)
      const raf = requestAnimationFrame(() => setAnimating(true))
      return () => cancelAnimationFrame(raf)
    } else {
      setAnimating(false)
      const t = setTimeout(() => setVisible(false), 220)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    const el = sparkRef.current
    if (!el || !visible) return
    setSparkWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setSparkWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [visible])

  if (!visible) return null

  const raw = snapshot?.raw as {
    data?: { user?: { edge_owner_to_timeline_media?: { edges?: Array<{ node?: Record<string, unknown> }> } } }
  } | undefined

  const allPosts: PostRow[] = (raw?.data?.user?.edge_owner_to_timeline_media?.edges ?? [])
    .map(e => e?.node)
    .filter(n => n && typeof (n as Record<string, unknown>).taken_at_timestamp === 'number')
    .map(n => {
      const x = n as Record<string, unknown>
      const likes = ((x.edge_liked_by as { count?: number } | undefined)?.count
        ?? (x.edge_media_preview_like as { count?: number } | undefined)?.count) ?? 0
      const comments = (x.edge_media_to_comment as { count?: number } | undefined)?.count ?? 0
      const captionEdges = (x.edge_media_to_caption as { edges?: Array<{ node?: { text?: string } }> } | undefined)?.edges
      const product = x.product_type as string | undefined
      const typename = x.__typename as string | undefined
      const type: PostRow['type'] = product === 'clips' || typename === 'GraphVideo' ? 'Reel'
        : typename === 'GraphSidecar' ? 'Carrossel' : 'Post'
      return {
        ts: (x.taken_at_timestamp as number) * 1000,
        shortcode: x.shortcode as string | undefined,
        likes: Math.max(likes, 0),
        comments: Math.max(comments, 0),
        type,
        caption: captionEdges?.[0]?.node?.text,
      }
    })
    .sort((a, b) => b.ts - a.ts)

  const topPost = allPosts.length > 0
    ? allPosts.reduce((best, p) => (p.likes + p.comments) > (best.likes + best.comments) ? p : best)
    : null

  const filteredPosts = allPosts
    .filter(p => filterType === 'all' || p.type === filterType)
    .sort((a, b) => {
      if (sortBy === 'likes') return b.likes - a.likes
      if (sortBy === 'comments') return b.comments - a.comments
      return b.ts - a.ts
    })

  const sparkValues = (history ?? []).map(h => h.followers)
  const followersGrowth = sparkValues.length >= 2
    ? sparkValues[sparkValues.length - 1] - sparkValues[0]
    : null
  const avgEng = allPosts.length > 0
    ? Math.round(allPosts.reduce((s, p) => s + p.likes + p.comments, 0) / allPosts.length)
    : null
  const GrowthIcon = followersGrowth == null ? Minus : followersGrowth > 0 ? TrendingUp : followersGrowth < 0 ? TrendingDown : Minus

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-foreground/30 z-40 backdrop-blur-sm transition-opacity duration-200"
        style={{ opacity: animating ? 1 : 0 }}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="hist-drawer-title"
        className={cn(
          'fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[480px] bg-card shadow-2xl flex flex-col',
          'transition-transform duration-200 ease-in-out',
          animating ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Histórico</p>
            <h2 id="hist-drawer-title" className="text-base font-bold text-foreground truncate">
              {clientName.replace(/\s*\[MERGED\]\s*/gi, '')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors"
            aria-label="Fechar"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Stats resumo */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-background/50 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Posts</p>
              <p className="text-2xl font-extrabold text-foreground tabular-nums">{allPosts.length}</p>
            </div>

            {snapshot?.followers != null && (
              <div className="rounded-xl border border-border bg-background/50 p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Seguidores</p>
                <p className="text-2xl font-extrabold text-foreground tabular-nums">{fmt(snapshot.followers)}</p>
              </div>
            )}

            {followersGrowth != null && (
              <div className={cn(
                'rounded-xl border p-3 text-center',
                followersGrowth > 0 ? 'border-success/30 bg-success/[0.05]'
                  : followersGrowth < 0 ? 'border-danger/30 bg-danger/[0.05]'
                  : 'border-border bg-background/50',
              )}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Crescimento</p>
                <p className={cn(
                  'text-2xl font-extrabold tabular-nums inline-flex items-center justify-center gap-0.5',
                  followersGrowth > 0 ? 'text-success' : followersGrowth < 0 ? 'text-danger' : 'text-foreground',
                )}>
                  <GrowthIcon className="h-5 w-5" />
                  {followersGrowth > 0 ? '+' : ''}{fmt(followersGrowth)}
                </p>
              </div>
            )}

            {avgEng != null && (
              <div className="rounded-xl border border-border bg-background/50 p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Eng. médio</p>
                <p className="text-2xl font-extrabold text-foreground tabular-nums">{fmt(avgEng)}</p>
              </div>
            )}
          </div>

          {/* Sparkline de seguidores */}
          {sparkValues.length >= 2 && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Seguidores — últimas 12 semanas
              </h3>
              <div ref={sparkRef} className="rounded-xl border border-border bg-background/50 p-4">
                <Sparkline values={sparkValues} width={sparkWidth} height={72} />
                <div className="mt-2 flex justify-between text-[10px] text-muted-foreground tabular-nums">
                  <span>{sparkValues[0].toLocaleString('pt-BR')}</span>
                  <span className="font-semibold text-foreground">{sparkValues[sparkValues.length - 1].toLocaleString('pt-BR')}</span>
                </div>
              </div>
            </section>
          )}

          {/* Postagens */}
          <section>
            {/* Cabeçalho + sort */}
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Postagens ({filteredPosts.length}{filterType !== 'all' ? ` de ${allPosts.length}` : ''})
              </h3>
              <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
                {(['date', 'likes', 'comments'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                      sortBy === s ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {s === 'date' ? 'Data' : s === 'likes' ? 'Curtidas' : 'Comentários'}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtro por tipo */}
            {allPosts.length > 0 && (
              <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                {(['all', 'Reel', 'Carrossel', 'Post'] as const).map(t => {
                  const cfg = t !== 'all' ? TYPE_CONFIG[t] : null
                  const Icon = cfg?.icon
                  const count = t === 'all' ? allPosts.length : allPosts.filter(p => p.type === t).length
                  if (t !== 'all' && count === 0) return null
                  return (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
                        filterType === t
                          ? t === 'all'
                            ? 'border-primary/30 bg-primary/10 text-primary'
                            : cfg!.activeBorder
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                      )}
                    >
                      {Icon && <Icon className="h-3 w-3" />}
                      {t === 'all' ? 'Todos' : t}
                      <span className="tabular-nums opacity-60">{count}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Lista de posts */}
            {filteredPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Sem postagens para exibir.</p>
            ) : (
              <ul className="space-y-2">
                {filteredPosts.map((p, i) => {
                  const isTop = topPost && p.ts === topPost.ts && p.shortcode === topPost.shortcode
                  const cfg = TYPE_CONFIG[p.type]
                  const Icon = cfg.icon
                  const date = new Date(p.ts)
                  const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: date.getFullYear() < new Date().getFullYear() ? 'numeric' : undefined })
                  const engTotal = p.likes + p.comments

                  return (
                    <li
                      key={i}
                      className={cn(
                        'rounded-xl border p-3 transition-colors',
                        isTop ? 'border-warning/40 bg-warning/[0.03] dark:bg-warning/[0.04]' : 'border-border bg-background/50',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Ícone do tipo */}
                        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', cfg.bg)}>
                          <Icon className={cn('h-5 w-5', cfg.text)} />
                        </div>

                        <div className="min-w-0 flex-1">
                          {/* Meta: data + tipo + coroa */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {dateStr}
                            </span>
                            <span className={cn('text-[11px] font-semibold', cfg.text)}>{p.type}</span>
                            {isTop && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0 text-[10px] font-bold text-warning">
                                <Crown className="h-2.5 w-2.5" /> top
                              </span>
                            )}
                          </div>

                          {/* Caption */}
                          {p.caption && (
                            <p className="mt-1 text-[11px] text-foreground/75 line-clamp-2 leading-snug">{p.caption}</p>
                          )}

                          {/* Métricas */}
                          <div className="mt-2 flex items-center gap-3">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                              <Heart className="h-3.5 w-3.5 text-danger/70" />
                              {fmt(p.likes)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                              <MessageCircle className="h-3.5 w-3.5 text-primary/70" />
                              {fmt(p.comments)}
                            </span>
                            <span className="ml-auto text-[10px] text-muted-foreground/60 tabular-nums">
                              {fmt(engTotal)} eng.
                            </span>
                            {p.shortcode && (
                              <a
                                href={`https://www.instagram.com/p/${p.shortcode}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
                              >
                                ver <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </>
  )
}
