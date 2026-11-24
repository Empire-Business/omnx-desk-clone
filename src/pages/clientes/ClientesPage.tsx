import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import React, { useRef } from 'react'
import { Users, Plus, Search, Instagram, RefreshCw, ExternalLink, UserCircle, UserX, MessageSquare, AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Calendar, Download, Flame, Crown, Send, Pencil, LayoutGrid, List, Heart, SlidersHorizontal, X } from 'lucide-react'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useClientes, type ClientWithBaseline } from '@/hooks/useClientes'
import { useAssignments } from '@/hooks/useUsers'
import { useAllClientContacts, type ClientContactRow } from '@/hooks/useClientContacts'
import {
  useSocialOverview, useRefreshInstagramStats, useRefreshAllInstagramStats,
  useWeeklyBaselineFollowers, usePrevWeeklyBaselineFollowers, useFollowersHistory,
  computeWeeklyMetrics, computeStreak, computeLastPostStats, type SocialSnapshot,
} from '@/hooks/useInstagramStats'
import { Sparkline } from '@/components/ui/Sparkline'
import { toCSV, downloadCSV } from '@/lib/csv'
import { ClienteForm } from '@/components/clientes/ClienteForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { GroupSection } from '@/components/ui/GroupSection'
import { cn } from '@/lib/utils'
import type { Client } from '@/types/database'

type StatusFilter = 'todos' | 'ativos' | 'inativos'

function normalizeHandle(input: string | null | undefined): string | null {
  if (!input) return null
  let h = input.trim()
  if (!h) return null
  const m = h.match(/instagram\.com\/([^/?#]+)/i)
  if (m) h = m[1]
  h = h.replace(/^@+/, '').replace(/\/+$/, '')
  return h || null
}

type AlertLevel = 'ok' | 'warn' | 'crit' | 'unknown'

function getAlertLevel(snapshot: SocialSnapshot | undefined, growth: number | null): AlertLevel {
  if (!snapshot?.last_post_at) return 'unknown'
  if (growth != null && growth < 0) return 'crit'
  const days = (Date.now() - new Date(snapshot.last_post_at).getTime()) / 86400000
  if (days <= 7) return 'ok'
  if (days <= 14) return 'warn'
  return 'crit'
}

const ALERT_STYLES: Record<AlertLevel, {
  dot: string; text: string; bg: string; icon: React.ElementType; label: string;
  border: string; ring: string; pillBg: string;
}> = {
  ok:      { dot: 'bg-success',          text: 'text-success',          bg: 'bg-success/10',          icon: CheckCircle2,  label: 'Em dia',    border: 'border-l-success',          ring: '',                                      pillBg: 'bg-success-light' },
  warn:    { dot: 'bg-warning',          text: 'text-warning',          bg: 'bg-warning/10',          icon: AlertTriangle, label: 'Atenção',   border: 'border-l-warning',          ring: 'ring-1 ring-warning/30',                pillBg: 'bg-warning-light' },
  crit:    { dot: 'bg-danger',           text: 'text-danger',           bg: 'bg-danger/10',           icon: AlertCircle,   label: 'Crítico',   border: 'border-l-danger',           ring: 'ring-2 ring-danger/40 shadow-danger/10', pillBg: 'bg-danger-light' },
  unknown: { dot: 'bg-muted-foreground', text: 'text-muted-foreground', bg: 'bg-muted',               icon: AlertCircle,   label: 'Sem dados', border: 'border-l-muted-foreground/30', ring: '',                                     pillBg: 'bg-muted' },
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'k'
  return n.toLocaleString('pt-BR')
}

function pickPrimaryContact(contacts: ClientContactRow[] | undefined): ClientContactRow | null {
  if (!contacts || contacts.length === 0) return null
  // 1. Não bloqueado
  const ativos = contacts.filter(c => !c.bloqueado)
  const pool = ativos.length > 0 ? ativos : contacts
  // 2. Preferir o que já tem nome (provavelmente é o principal)
  return pool.find(c => c.nome) ?? pool[0]
}

function buildCobrancaMessage(clientName: string, days: number | null): string {
  const greeting = `Oi! Tudo bem?`
  if (days != null && days > 14) {
    return `${greeting} Notei que faz ${days} dias desde sua última postagem no Instagram. Vamos alinhar a próxima publicação? 🚀`
  }
  if (days != null && days > 7) {
    return `${greeting} Está chegando o momento de uma nova postagem (${days} dias desde a última). Quando podemos gravar? 📲`
  }
  return `${greeting} Vamos planejar as próximas postagens da semana, ${clientName.split(' ')[0]}? 🎯`
}

function SocialCard({
  client, snapshot, contacts, weekBaseline, prevWeekBaseline, history, onOpenDetail, onOpenChat, onCobrar, onEdit,
}: {
  client: ClientWithBaseline
  snapshot: SocialSnapshot | undefined
  contacts: ClientContactRow[] | undefined
  weekBaseline: number | null
  prevWeekBaseline: number | null
  history: Array<{ followers: number; t: number }> | undefined
  onOpenDetail: () => void
  onOpenChat: (contactId?: string, mensagem?: string) => void
  onCobrar: (contactId: string, mensagem: string) => void
  onEdit: () => void
}) {
  const refresh = useRefreshInstagramStats(client.id)
  const handle = normalizeHandle(client.instagram)
  const primary = pickPrimaryContact(contacts)
  const hasMultiple = (contacts?.length ?? 0) > 1
  const [chatMenuOpen, setChatMenuOpen] = useState(false)

  const contractBaseline = client.client_contracts?.find(c => c.seguidores_inicio != null)?.seguidores_inicio ?? null
  const monitoringBaseline = history && history.length >= 2 ? history[0].followers : null
  const growth = snapshot?.followers != null && contractBaseline != null
    ? snapshot.followers - contractBaseline
    : null
  const growthFromMonitoring = snapshot?.followers != null && monitoringBaseline != null
    ? snapshot.followers - monitoringBaseline
    : null

  const alert = getAlertLevel(snapshot, growth)
  const A = ALERT_STYLES[alert]
  const days = daysSince(snapshot?.last_post_at)
  const GrowthIcon = growth == null ? Minus : growth > 0 ? TrendingUp : growth < 0 ? TrendingDown : Minus
  const lastPost = computeLastPostStats(snapshot)

  const nomeLimpo = client.nome.replace(/\s*\[MERGED\]\s*/gi, '')

  return (
    <div className="cl-card space-y-4">

      {/* Header: foto + nome + refresh + chat */}
      <div className="flex items-start gap-3">
        <button onClick={onOpenDetail} className="shrink-0 rounded-full" aria-label={`Abrir ${nomeLimpo}`}>
          <AvatarCliente nome={nomeLimpo} chave={client.id} foto={snapshot?.profile_pic_url} tamanho="lg" />
        </button>

        <button onClick={onOpenDetail} className="min-w-0 flex-1 text-left">
          <p className="cl-name text-[15px]">
            {nomeLimpo}
          </p>
          {handle && (
            <a
              href={`https://www.instagram.com/${snapshot?.username ?? handle}/`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary truncate"
            >
              @{snapshot?.username ?? handle} <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </button>

        {/* Refresh + Chat */}
        <div className="relative shrink-0 flex items-center gap-1">
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="cl-acao disabled:opacity-50"
            title={snapshot ? 'Atualizar Instagram' : 'Buscar dados do Instagram'}
            aria-label={snapshot ? 'Atualizar Instagram' : 'Buscar dados do Instagram'}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refresh.isPending && 'animate-spin')} />
          </button>

          <button
            onClick={e => { e.stopPropagation(); if (primary) onOpenChat(primary.id); else onOpenChat() }}
            disabled={!primary}
            className={cn(
              'flex h-9 items-center gap-1 rounded-l-lg px-2.5 transition-colors',
              hasMultiple ? '' : 'rounded-r-lg',
              primary
                ? 'border border-success/25 bg-success-light text-success hover:border-success/50'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
            title={primary ? `Abrir chat com ${primary.nome ?? primary.numero_whatsapp}` : 'Sem WhatsApp vinculado'}
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          {hasMultiple && (
            <button
              onClick={e => { e.stopPropagation(); setChatMenuOpen(o => !o) }}
              className="flex h-9 w-6 items-center justify-center rounded-r-lg border border-l-0 border-success/25 bg-success-light text-success hover:border-success/50 transition-colors"
            >
              <ChevronDown className={cn('h-3 w-3 transition-transform', chatMenuOpen && 'rotate-180')} />
            </button>
          )}
          {chatMenuOpen && contacts && (
            <div
              onClick={e => e.stopPropagation()}
              className="absolute right-0 top-10 z-20 min-w-[220px] glass-card p-1 shadow-lg"
            >
              {contacts.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setChatMenuOpen(false); onOpenChat(c.id) }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors',
                    c.id === primary?.id && 'bg-success/5',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', c.bloqueado ? 'bg-muted-foreground/40' : 'bg-success')} />
                  <span className="font-medium text-foreground truncate flex-1">{c.nome ?? 'Sem nome'}</span>
                  {c.id === primary?.id && <span className="text-2xs text-success">recomendado</span>}
                  <span className="text-muted-foreground font-mono text-2xs">{c.numero_whatsapp.slice(-4)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* HERO: última postagem + barra de urgência */}
      {snapshot ? (
        <div className={cn('rounded-xl px-4 py-3', A.pillBg)}>
          <div className="flex items-center gap-3">
            <Calendar className={cn('h-5 w-5 shrink-0', A.text)} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">Última postagem</p>
              {days != null ? (
                <p className={cn('text-xl font-extrabold tabular-nums leading-none mt-0.5', A.text)}>
                  {days === 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`}
                </p>
              ) : (
                <p className="text-base font-semibold text-muted-foreground italic">sem dados</p>
              )}
            </div>
            {snapshot.last_post_url && (
              <a
                href={snapshot.last_post_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="shrink-0 rounded-md bg-card/60 px-2 py-1 text-2xs font-medium text-foreground hover:bg-card transition-colors inline-flex items-center gap-1"
              >
                ver post <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
          {/* Barra de urgência: 0-30 dias, cor baseada no nível de alerta */}
          {days != null && (
            <div className="mt-2.5 h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-700', A.dot)}
                style={{ width: `${Math.min((days / 30) * 100, 100)}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-note-border bg-note p-3">
          {!handle ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground inline-flex items-center gap-1">
                  <Instagram className="h-4 w-4 text-pink-500" /> Cadastre o Instagram
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pra acompanhar postagens, seguidores e engajamento.
                </p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); onEdit() }}
                className="btn btn-primary btn-sm shrink-0"
              >
                Cadastrar
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sem dados de Instagram ainda. Use o botão de atualizar.</p>
          )}
        </div>
      )}

      {/* Último post: thumbnail + likes + comentários + caption */}
      {(lastPost.likes != null || lastPost.comments != null) && (
        <div className="cl-box flex items-center gap-3 px-3 py-2.5">
          {lastPost.thumbnail && (
            <img
              src={lastPost.thumbnail}
              alt="último post"
              className="h-12 w-12 rounded-lg object-cover shrink-0 border border-border"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Último post</p>
            <div className="flex items-center gap-4">
              {lastPost.likes != null && (
                <div className="flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5 text-danger/70" />
                  <span className="text-sm font-bold tabular-nums text-foreground">{formatCompact(lastPost.likes)}</span>
                </div>
              )}
              {lastPost.comments != null && (
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-primary/70" />
                  <span className="text-sm font-bold tabular-nums text-foreground">{formatCompact(lastPost.comments)}</span>
                </div>
              )}
            </div>
            {snapshot?.last_post_caption && (
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1 leading-tight">
                {snapshot.last_post_caption}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Métricas da semana */}
      {snapshot && (() => {
        const weekly = computeWeeklyMetrics(snapshot, weekBaseline, prevWeekBaseline)
        const streak = computeStreak(snapshot)
        const FollowersIcon = weekly.followersDelta == null ? Minus : weekly.followersDelta > 0 ? TrendingUp : weekly.followersDelta < 0 ? TrendingDown : Minus
        return (
          <div className="cl-box p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Esta semana</p>
              {streak >= 2 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-2xs font-bold text-orange-500">
                  <Flame className="h-3 w-3" />
                  {streak} sem.
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <Instagram className="h-3 w-3" /> Posts
                </div>
                <div className="flex items-baseline gap-1">
                  <p className={cn(
                    'text-lg font-extrabold tabular-nums leading-tight',
                    weekly.postsThisWeek === 0 ? 'text-danger' : 'text-foreground',
                  )}>
                    {weekly.postsThisWeek}
                  </p>
                  {weekly.postsDelta != null && weekly.postsDelta !== 0 && (
                    <span className={cn('text-2xs font-semibold tabular-nums', weekly.postsDelta > 0 ? 'text-success' : 'text-danger')}>
                      {weekly.postsDelta > 0 ? '↗+' : '↘'}{weekly.postsDelta}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3" /> Eng./post
                </div>
                <div className="flex items-baseline gap-1">
                  <p className="text-lg font-extrabold text-foreground tabular-nums leading-tight">
                    {weekly.avgEngagementPerPost != null ? formatCompact(weekly.avgEngagementPerPost) : '—'}
                  </p>
                  {weekly.engagementDeltaPct != null && weekly.engagementDeltaPct !== 0 && (
                    <span className={cn('text-2xs font-semibold tabular-nums', weekly.engagementDeltaPct > 0 ? 'text-success' : 'text-danger')}>
                      {weekly.engagementDeltaPct > 0 ? '↗+' : '↘'}{weekly.engagementDeltaPct}%
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <Users className="h-3 w-3" /> Seguidores
                </div>
                {weekly.followersDelta != null ? (
                  <p className={cn(
                    'text-lg font-extrabold tabular-nums leading-tight inline-flex items-center gap-0.5',
                    weekly.followersDelta > 0 ? 'text-success' : weekly.followersDelta < 0 ? 'text-danger' : 'text-foreground',
                  )}>
                    <FollowersIcon className="h-4 w-4" />
                    {weekly.followersDelta > 0 ? '+' : ''}{formatCompact(weekly.followersDelta)}
                  </p>
                ) : (
                  <p className="text-lg font-extrabold text-muted-foreground/40 tabular-nums leading-tight">—</p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Total de seguidores + sparkline + crescimento de contrato */}
      {snapshot && (() => {
        const MonIcon = growthFromMonitoring == null ? Minus : growthFromMonitoring > 0 ? TrendingUp : growthFromMonitoring < 0 ? TrendingDown : Minus
        return (
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Total de seguidores</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-2xl font-extrabold text-foreground tabular-nums leading-tight" title={snapshot.followers?.toLocaleString('pt-BR')}>
                  {snapshot.followers != null ? formatCompact(snapshot.followers) : '—'}
                </p>
                {growthFromMonitoring != null && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-2xs font-bold tabular-nums',
                      growthFromMonitoring > 0 ? 'bg-success/10 text-success'
                        : growthFromMonitoring < 0 ? 'bg-danger/10 text-danger'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <MonIcon className="h-3 w-3" />
                    {growthFromMonitoring > 0 ? '+' : ''}{formatCompact(growthFromMonitoring)}
                  </span>
                )}
              </div>
            </div>
            {history && history.length >= 2 && (
              <div className="flex-1 flex justify-center">
                <Sparkline values={history.map(h => h.followers)} width={80} height={26} />
              </div>
            )}
            {growth != null && (
              <div className="text-right shrink-0">
                <p className="text-xs font-medium text-muted-foreground">Contrato</p>
                <p className={cn(
                  'text-xs font-semibold tabular-nums leading-tight inline-flex items-center gap-1',
                  growth > 0 ? 'text-success' : growth < 0 ? 'text-danger' : 'text-foreground',
                )}>
                  <GrowthIcon className="h-3 w-3" />
                  {growth > 0 ? '+' : ''}{formatCompact(growth)}
                </p>
              </div>
            )}
          </div>
        )
      })()}

      {/* Ações: cobrar via chat interno / histórico / editar */}
      <div className="flex items-center gap-2 pt-1">
        {primary && (
          <button
            onClick={e => {
              e.stopPropagation()
              onCobrar(primary.id, buildCobrancaMessage(client.nome, days))
            }}
            className={cn(
              'flex-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-[12.5px] font-semibold transition-colors',
              alert === 'crit'
                ? 'border border-danger/30 bg-danger-light text-danger hover:border-danger/60'
                : alert === 'warn'
                ? 'border border-warning/30 bg-warning-light text-warning hover:border-warning/60'
                : 'border border-border bg-card text-foreground hover:bg-muted',
            )}
          >
            <Send className="h-3 w-3" />
            Cobrar postagem
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); onEdit() }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Editar cliente"
          title="Editar cliente"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function CardCarrossel({ children }: { children: React.ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const items = React.Children.toArray(children)
  const [page, setPage] = useState(0)
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / 2))
  const canPrev = page > 0
  const canNext = page < totalPages - 1

  function go(dir: 1 | -1) {
    const next = Math.min(Math.max(page + dir, 0), totalPages - 1)
    setPage(next)
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="relative px-12">
      {/* Botão anterior — fora da área dos cards */}
      <button
        onClick={() => go(-1)}
        disabled={!canPrev}
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-md transition-all z-10',
          canPrev
            ? 'hover:bg-primary hover:text-primary-foreground hover:border-primary hover:scale-110 cursor-pointer'
            : 'opacity-30 cursor-not-allowed',
        )}
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {/* Container — sem scroll visual */}
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-3 sm:gap-4 overflow-hidden"
      >
        {items.map((child, i) => (
          <div
            key={i}
            className="snap-start shrink-0 basis-full md:basis-[calc(50%-0.5rem)]"
          >
            {child}
          </div>
        ))}
      </div>

      <button
        onClick={() => go(1)}
        disabled={!canNext}
        className={cn(
          'absolute right-0 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-md transition-all z-10',
          canNext
            ? 'hover:bg-primary hover:text-primary-foreground hover:border-primary hover:scale-110 cursor-pointer'
            : 'opacity-30 cursor-not-allowed',
        )}
        aria-label="Próxima página"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Indicador de página */}
      {totalPages > 1 && (
        <p className="mt-2 text-center text-2xs text-muted-foreground tabular-nums">
          {page + 1} / {totalPages}
        </p>
      )}
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
      title={`Cobrar postagem de ${firstName}`}
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

/** Cor do avatar pela id (mesma conta do clients: 8 tons fixos). */
function tomAvatar(chave: string): string {
  return 'c' + ([...chave].reduce((soma, ch) => (soma * 31 + ch.charCodeAt(0)) >>> 0, 7) % 8 + 1)
}

function iniciaisDe(nome: string): string {
  return nome.replace(/\s*\[MERGED\]\s*/gi, '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '·'
}

/** Foto do Instagram quando existe; se não houver ou falhar, iniciais na cor do cliente. */
function AvatarCliente({ nome, chave, foto, tamanho }: { nome: string; chave: string; foto?: string | null; tamanho?: 'xs' | 'lg' }) {
  const [falhou, setFalhou] = useState(false)
  if (foto && !falhou) {
    return <img src={foto} alt="" className={cn('cl-av', tamanho)} onError={() => setFalhou(true)} />
  }
  return <span className={cn('cl-av', tamanho, tomAvatar(chave))} aria-hidden="true">{iniciaisDe(nome)}</span>
}

function textoPostagem(days: number | null): string {
  if (days == null) return 'Sem dados'
  if (days === 0) return 'Postou hoje'
  return days === 1 ? 'há 1 dia' : `há ${days} dias`
}

/** Colunas da lista (cabeçalho e linhas usam a mesma grade). */
function CabecalhoLista() {
  return (
    <div className="cl-grid cl-thead" aria-hidden="true">
      <span>Cliente</span>
      <span>Última postagem</span>
      <span className="r">Seguidores</span>
      <span className="cl-c-own">Estrategista</span>
      <span />
    </div>
  )
}

function ClienteListRow({
  client, snapshot, contacts, weekBaseline, prevWeekBaseline, estrategistas,
  onOpenDetail, onOpenChat, onEdit,
}: {
  client: Client
  snapshot: SocialSnapshot | undefined
  contacts: ClientContactRow[] | undefined
  weekBaseline: number | null
  prevWeekBaseline: number | null
  estrategistas: Array<{ id: string; nome: string }>
  onOpenDetail: () => void
  onOpenChat: (contactId?: string, mensagem?: string) => void
  onEdit: () => void
}) {
  const handle = normalizeHandle(client.instagram)
  const days = daysSince(snapshot?.last_post_at)
  const primary = pickPrimaryContact(contacts)
  const alert = getAlertLevel(snapshot, null)
  const weekly = snapshot ? computeWeeklyMetrics(snapshot, weekBaseline, prevWeekBaseline) : null
  const nome = client.nome.replace(/\s*\[MERGED\]\s*/gi, '')
  const delta = weekly?.followersDelta ?? null
  const dono = estrategistas[0]

  return (
    <div className="cl-grid cl-row" role="listitem">
      {/* Cliente */}
      <div className="cl-c-who">
        <div className="cl-who">
          <AvatarCliente nome={nome} chave={client.id} foto={snapshot?.profile_pic_url} />
          <div>
            <button type="button" onClick={onOpenDetail} className="cl-name">{nome}</button>
            <small>{handle ? `@${snapshot?.username ?? handle}` : 'Sem Instagram'}</small>
          </div>
        </div>
      </div>

      {/* Última postagem */}
      <div className="cl-c-post">
        <span className={cn('cl-post', alert)}>
          <i aria-hidden="true" />
          {textoPostagem(days)}
        </span>
        {alert !== 'unknown' && <small>{ALERT_STYLES[alert].label}</small>}
      </div>

      {/* Seguidores + variação da semana */}
      <div className="cl-c-seg r">
        {snapshot ? (
          <>
            <span className="cl-num">{formatCompact(snapshot.followers ?? 0)}</span>
            {delta == null
              ? <small>seguidores</small>
              : delta === 0
                ? <small>estável na semana</small>
                : <small className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? '+' : ''}{formatCompact(delta)} na semana</small>}
          </>
        ) : (
          <span className="cl-quiet">—</span>
        )}
      </div>

      {/* Estrategistas */}
      <div className="cl-c-own">
        {dono ? (
          <div className="cl-owner" title={estrategistas.map(e => e.nome).join(', ')}>
            <AvatarCliente nome={dono.nome} chave={dono.id} tamanho="xs" />
            <span>
              {dono.nome.split(' ')[0]}
              {estrategistas.length > 1 && <span className="cl-quiet"> +{estrategistas.length - 1}</span>}
            </span>
          </div>
        ) : (
          <span className="cl-quiet">Sem estrategista</span>
        )}
      </div>

      {/* Ações */}
      <div className="cl-c-acoes cl-acoes">
        <button
          type="button"
          onClick={() => primary ? onOpenChat(primary.id) : onOpenChat()}
          disabled={!primary}
          className="cl-acao chat"
          title={primary ? `Conversa com ${primary.nome ?? primary.numero_whatsapp}` : 'Sem WhatsApp vinculado'}
          aria-label={primary ? `Abrir conversa com ${nome}` : 'Sem WhatsApp vinculado'}
        >
          <MessageSquare />
        </button>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onEdit() }}
          className="cl-acao"
          title="Editar cliente"
          aria-label={`Editar ${nome}`}
        >
          <Pencil />
        </button>
      </div>
    </div>
  )
}

export function ClientesPage({ disableNav = false }: { disableNav?: boolean } = {}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ativos')
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('list')
  const [modalOpen, setModalOpen] = useState(false)
  // Filtros da aba "Redes sociais"
  const [followersMin, setFollowersMin] = useState<string>('')
  const [followersMax, setFollowersMax] = useState<string>('')
  const [growthFilter, setGrowthFilter] = useState<'todos' | 'pos' | 'zero' | 'neg'>('todos')
  const [alertFilter, setAlertFilter] = useState<'todos' | 'ok' | 'warn' | 'crit' | 'unknown'>('todos')
  const [onlyMissingIg, setOnlyMissingIg] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const navigate = useNavigate()
  const { can } = usePermissoes()
  // Regra editável em /admin (clientes.carteira): quem enxerga a carteira
  // inteira em vez de só os clientes atribuídos a si.
  const isAdminOrGerente = can('clientes.carteira', 'ver')
  const { data: clients, isLoading } = useClientes()
  const { data: snapshots } = useSocialOverview()
  const { data: contactsByClient } = useAllClientContacts()
  const { data: weekBaselineByClient } = useWeeklyBaselineFollowers()
  const { data: prevWeekBaselineByClient } = usePrevWeeklyBaselineFollowers()
  const { data: historyByClient } = useFollowersHistory()
  const refreshAll = useRefreshAllInstagramStats()
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [confirmCobrar, setConfirmCobrar] = useState<{
    nome: string
    contact: ClientContactRow
    mensagem: string
  } | null>(null)

  function openChat(clientName: string, contact?: ClientContactRow, mensagem?: string) {
    if (contact) {
      const params = new URLSearchParams({
        contato: contact.id,
        nome: contact.nome ?? clientName,
        whatsapp: contact.numero_whatsapp,
      })
      if (mensagem) params.set('mensagem', mensagem)
      navigate(`/conversas?${params.toString()}`)
    } else {
      navigate(`/conversas?cliente=${encodeURIComponent(clientName)}`)
    }
  }
  const { data: allAssignments } = useAssignments()

  // Map clientId -> array of estrategista users (id + nome)
  const estrategistasByClient = useMemo(() => {
    const m = new Map<string, Array<{ id: string; nome: string }>>()
    for (const a of allAssignments ?? []) {
      if (a.tipo !== 'estrategista' || !a.users) continue
      const list = m.get(a.client_id) ?? []
      list.push({ id: a.users.id, nome: a.users.nome })
      m.set(a.client_id, list)
    }
    return m
  }, [allAssignments])

  // Group filtered clients by estrategista. Clients with multiple estrategistas
  // appear in each group. Clients with none go to "Sem estrategista" at the end.
  // Dentro de cada grupo, ordena por última postagem ASC (mais tempo sem postar primeiro);
  // clientes sem dados vão pro fim.
  function sortByOldestPost(list: ClientWithBaseline[]) {
    return [...list].sort((a, b) => {
      const sa = snapshots?.find(s => s.client_id === a.id)?.last_post_at
      const sb = snapshots?.find(s => s.client_id === b.id)?.last_post_at
      const ta = sa ? new Date(sa).getTime() : Number.POSITIVE_INFINITY  // sem dados → final
      const tb = sb ? new Date(sb).getTime() : Number.POSITIVE_INFINITY
      return ta - tb
    })
  }

  function groupByEstrategista(list: ClientWithBaseline[]) {
    const buckets = new Map<string, { id: string; nome: string; clients: ClientWithBaseline[] }>()
    const noStrat: ClientWithBaseline[] = []
    for (const c of list) {
      const strats = estrategistasByClient.get(c.id) ?? []
      if (strats.length === 0) {
        noStrat.push(c)
        continue
      }
      for (const s of strats) {
        const bucket = buckets.get(s.id) ?? { id: s.id, nome: s.nome, clients: [] }
        bucket.clients.push(c)
        buckets.set(s.id, bucket)
      }
    }
    // Aplica sort em cada grupo
    for (const b of buckets.values()) b.clients = sortByOldestPost(b.clients)
    const sorted = Array.from(buckets.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return { groups: sorted, noStrat: sortByOldestPost(noStrat) }
  }

  const snapshotByClient = useMemo(() => {
    const m = new Map<string, SocialSnapshot>()
    for (const s of snapshots ?? []) m.set(s.client_id, s)
    return m
  }, [snapshots])

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
        (c.instagram?.toLowerCase().includes(q) ?? false)
      )
    }
    if (onlyMissingIg) {
      result = result.filter(c => !normalizeHandle(c.instagram))
    }
    const fMin = followersMin ? Number(followersMin) : null
    const fMax = followersMax ? Number(followersMax) : null
    if (fMin != null || fMax != null || alertFilter !== 'todos' || growthFilter !== 'todos') {
      result = result.filter(c => {
        const snap = snapshotByClient.get(c.id)
        // Seguidores: excluir sem dados quando há filtro de range
        if (fMin != null) {
          if (snap?.followers == null) return false
          if (snap.followers < fMin) return false
        }
        if (fMax != null) {
          if (snap?.followers == null) return false
          if (snap.followers > fMax) return false
        }
        // Alerta
        if (alertFilter !== 'todos') {
          const lvl = getAlertLevel(snap, null)
          if (lvl !== alertFilter) return false
        }
        // Crescimento semanal
        if (growthFilter !== 'todos') {
          const wb = weekBaselineByClient?.get(c.id) ?? null
          const delta = snap?.followers != null && wb != null ? snap.followers - wb : null
          if (delta == null) return false // sem dados → excluir de qualquer filtro específico
          if (growthFilter === 'pos' && delta <= 0) return false
          if (growthFilter === 'neg' && delta >= 0) return false
          if (growthFilter === 'zero' && delta !== 0) return false
        }
        return true
      })
    }
    return result
  }, [clients, search, statusFilter, snapshotByClient, followersMin, followersMax, alertFilter, growthFilter, onlyMissingIg, weekBaselineByClient])

  const activeCount = clients?.filter(c => c.ativo).length ?? 0
  const inactiveCount = clients?.filter(c => !c.ativo).length ?? 0

  return (
    <PageContainer className="cl-page gap-5 md:gap-6">
      <PageHeader
        title="Clientes"
        description={clients
          ? isAdminOrGerente
            ? <><b>{clients.length} cliente{clients.length !== 1 ? 's' : ''}</b> no total · {activeCount} ativo{activeCount !== 1 ? 's' : ''}</>
            : <>Você está acompanhando <b>{clients.length} cliente{clients.length !== 1 ? 's' : ''}</b></>
          : 'Gerencie seus clientes'}
        action={
          <>
            <button
              type="button"
              onClick={() => {
                if (!clients) return
                const rows = clients.map(c => {
                  const snap = snapshotByClient.get(c.id)
                  const wb = weekBaselineByClient?.get(c.id) ?? null
                  const pwb = prevWeekBaselineByClient?.get(c.id) ?? null
                  const w = computeWeeklyMetrics(snap, wb, pwb)
                  return {
                    cliente: c.nome.replace(/\s*\[MERGED\]\s*/gi, ''),
                    instagram: snap?.username ?? c.instagram ?? '',
                    seguidores: snap?.followers ?? '',
                    posts_semana: w.postsThisWeek,
                    eng_por_post: w.avgEngagementPerPost ?? '',
                    delta_seguidores_semana: w.followersDelta ?? '',
                    delta_posts_vs_anterior: w.postsDelta ?? '',
                    eng_delta_pct: w.engagementDeltaPct ?? '',
                    ultima_postagem: snap?.last_post_at ?? '',
                  }
                })
                downloadCSV(`clientes-redes-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows))
              }}
              className="btn btn-secondary"
            >
              <Download aria-hidden />
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => refreshAll.mutate()}
              disabled={refreshAll.isPending}
              className="btn btn-secondary"
            >
              <RefreshCw aria-hidden className={cn(refreshAll.isPending && 'animate-spin')} />
              {refreshAll.isPending ? 'Atualizando...' : 'Atualizar todos'}
            </button>
            <button type="button" onClick={() => setModalOpen(true)} className="btn btn-primary">
              <Plus aria-hidden />
              Novo cliente
            </button>
          </>
        }
      />

      {/* Destaques da semana: faixa de números, como no clients */}
      {clients && clients.length > 0 && (() => {
        const candidates = clients
          .map(c => {
            const snap = snapshotByClient.get(c.id)
            if (!snap) return null
            const wb = weekBaselineByClient?.get(c.id) ?? null
            const pwb = prevWeekBaselineByClient?.get(c.id) ?? null
            const w = computeWeeklyMetrics(snap, wb, pwb)
            return { client: c, snap, w }
          })
          .filter((x): x is NonNullable<typeof x> => !!x)
        if (candidates.length === 0) return null
        const topGrowth = [...candidates].filter(x => x.w.followersDelta != null && x.w.followersDelta > 0).sort((a, b) => (b.w.followersDelta ?? 0) - (a.w.followersDelta ?? 0))[0]
        const topPosts = [...candidates].filter(x => x.w.postsThisWeek > 0).sort((a, b) => b.w.postsThisWeek - a.w.postsThisWeek)[0]
        const topEng = [...candidates].filter(x => x.w.avgEngagementPerPost != null && x.w.avgEngagementPerPost > 0).sort((a, b) => (b.w.avgEngagementPerPost ?? 0) - (a.w.avgEngagementPerPost ?? 0))[0]
        const cards = [
          topGrowth ? { label: 'Maior crescimento na semana', icon: TrendingUp, up: true, value: `+${formatCompact(topGrowth.w.followersDelta!)}`, name: topGrowth.client.nome, id: topGrowth.client.id } : null,
          topPosts ? { label: 'Mais posts na semana', icon: Instagram, up: false, value: `${topPosts.w.postsThisWeek} posts`, name: topPosts.client.nome, id: topPosts.client.id } : null,
          topEng ? { label: 'Maior engajamento', icon: Crown, up: false, value: `${formatCompact(topEng.w.avgEngagementPerPost!)} por post`, name: topEng.client.nome, id: topEng.client.id } : null,
        ].filter((x): x is NonNullable<typeof x> => !!x)
        if (cards.length === 0) return null
        return (
          <dl className="cl-strip" aria-label="Destaques da semana">
            {cards.map(card => {
              const nome = card.name.replace(/\s*\[MERGED\]\s*/gi, '')
              return (
                <div key={card.label}>
                  <dt><card.icon aria-hidden />{card.label}</dt>
                  <dd>
                    <span className={cn('v', card.up && 'up')}>{card.value}</span>
                    {disableNav
                      ? <span className="quem" title={nome}>{nome}</span>
                      : <button type="button" className="quem" title={nome} onClick={() => navigate(`/clientes/${card.id}`)}>{nome}</button>}
                  </dd>
                </div>
              )
            })}
          </dl>
        )
      })()}

      {/* Aviso: clientes ATIVOS sem Instagram cadastrado */}
      {clients && !onlyMissingIg && (() => {
        const semIg = clients.filter(c => c.ativo && !normalizeHandle(c.instagram))
        if (semIg.length === 0) return null
        return (
          <div className="cl-aviso">
            <AlertTriangle aria-hidden />
            <div className="min-w-0 flex-1">
              <b>
                {semIg.length} cliente{semIg.length > 1 ? 's' : ''} ativo{semIg.length > 1 ? 's' : ''} sem Instagram cadastrado
              </b>
              <p>
                Sem o @ não conseguimos monitorar postagens, seguidores e engajamento.
                {!isAdminOrGerente && ' Cadastre o Instagram dos seus clientes pra começar a acompanhar.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setSearch(''); setStatusFilter('ativos'); setOnlyMissingIg(true) }}
              className="btn btn-secondary btn-sm shrink-0"
            >
              Ver lista
            </button>
          </div>
        )
      })()}

      {/* Situação, busca, filtros e modo de exibição */}
      <div className="space-y-3">
        <div className="cl-controls">
          <div className="cl-views" role="group" aria-label="Situação do cliente">
            {([
              { key: 'todos', label: 'Todos', n: clients?.length ?? 0 },
              { key: 'ativos', label: 'Ativos', n: activeCount },
              { key: 'inativos', label: 'Inativos', n: inactiveCount },
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
            <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} title="Modo lista">
              <List aria-hidden /><span>Lista</span>
            </button>
            <button type="button" onClick={() => setViewMode('cards')} aria-pressed={viewMode === 'cards'} title="Modo cards">
              <LayoutGrid aria-hidden /><span>Cartões</span>
            </button>
          </div>

          <label className="cl-search">
            <Search aria-hidden />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape' && search) { e.preventDefault(); setSearch('') } }}
              placeholder="Buscar por nome, segmento ou @handle"
              aria-label="Buscar cliente"
            />
            {search && (
              <button type="button" tabIndex={-1} className="cl-search-clear" aria-label="Limpar busca" title="Limpar busca (Esc)" onClick={() => setSearch('')}>
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </label>

          <div className="cl-filters" role="group" aria-label="Filtros">
            {(() => {
              const activeFilters = [
                followersMin, followersMax,
                growthFilter !== 'todos' ? growthFilter : '',
                alertFilter !== 'todos' ? alertFilter : '',
              ].filter(Boolean).length
              return (
                <button
                  type="button"
                  onClick={() => setFiltersOpen(o => !o)}
                  aria-expanded={filtersOpen}
                  className={cn('cl-chip', activeFilters > 0 && 'set')}
                >
                  <SlidersHorizontal aria-hidden />
                  Filtros avançados
                  {activeFilters > 0 && <span className="n">{activeFilters}</span>}
                  <ChevronDown aria-hidden className={cn('transition-transform duration-200', filtersOpen && 'rotate-180')} />
                </button>
              )
            })()}
            {onlyMissingIg && (
              <button type="button" onClick={() => setOnlyMissingIg(false)} className="cl-chip set" title="Remover filtro">
                <Instagram aria-hidden />
                Sem Instagram cadastrado
                <X aria-hidden />
              </button>
            )}
          </div>
        </div>

        {/* Filtros avançados */}
        {filtersOpen && (() => {
          const activeFilters = [
            followersMin, followersMax,
            growthFilter !== 'todos' ? growthFilter : '',
            alertFilter !== 'todos' ? alertFilter : '',
          ].filter(Boolean).length
          const clearAll = () => { setFollowersMin(''); setFollowersMax(''); setGrowthFilter('todos'); setAlertFilter('todos') }
          return (
            <div className="cl-filtros space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {/* Seguidores */}
                <div>
                  <p className="rot">Seguidores</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" inputMode="numeric" placeholder="mín"
                      value={followersMin} onChange={e => setFollowersMin(e.target.value)}
                      aria-label="Seguidores: mínimo"
                      className={cn(
                        'w-full h-8 rounded-lg border bg-card px-2.5 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-ring transition-colors',
                        followersMin ? 'border-primary text-primary font-semibold' : 'border-input',
                      )}
                    />
                    <span className="text-muted-foreground/50 text-sm shrink-0">—</span>
                    <input
                      type="number" inputMode="numeric" placeholder="máx"
                      value={followersMax} onChange={e => setFollowersMax(e.target.value)}
                      aria-label="Seguidores: máximo"
                      className={cn(
                        'w-full h-8 rounded-lg border bg-card px-2.5 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-ring transition-colors',
                        followersMax ? 'border-primary text-primary font-semibold' : 'border-input',
                      )}
                    />
                  </div>
                </div>

                {/* Crescimento */}
                <div>
                  <p className="rot">Crescimento semanal</p>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      { key: 'todos', label: 'Todos', icon: null },
                      { key: 'pos', label: 'Subindo', icon: TrendingUp },
                      { key: 'zero', label: 'Estável', icon: Minus },
                      { key: 'neg', label: 'Caindo', icon: TrendingDown },
                    ] as const).map(opt => {
                      const Icon = opt.icon
                      const active = growthFilter === opt.key
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setGrowthFilter(opt.key)}
                          aria-pressed={active}
                          className={cn('cl-chip', active && 'set')}
                        >
                          {Icon && <Icon aria-hidden />}
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Alerta */}
                <div>
                  <p className="rot">Alerta de postagem</p>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      { key: 'todos', label: 'Todos', dot: null },
                      { key: 'ok', label: 'Em dia', dot: 'bg-success' },
                      { key: 'warn', label: 'Atenção', dot: 'bg-warning' },
                      { key: 'crit', label: 'Crítico', dot: 'bg-danger' },
                      { key: 'unknown', label: 'Sem dados', dot: 'bg-muted-foreground' },
                    ] as const).map(opt => {
                      const active = alertFilter === opt.key
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setAlertFilter(opt.key)}
                          aria-pressed={active}
                          className={cn('cl-chip', active && 'set')}
                        >
                          {opt.dot && <span className={cn('h-2 w-2 rounded-full', opt.dot)} aria-hidden />}
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {activeFilters > 0 && (
                <div className="flex justify-end pt-2 border-t border-stroke-weak">
                  <button type="button" onClick={clearAll} className="limpar">
                    <X className="h-3.5 w-3.5" aria-hidden /> Limpar filtros
                  </button>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Content — agrupado por estrategista */}
      {isLoading ? (
        <div className="cl-panel" aria-busy="true" aria-label="Carregando clientes">
          <CabecalhoLista />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="cl-grid cl-row">
              <div className="cl-who"><span className="cl-av shimmer" /><span className="h-3 w-40 rounded shimmer" /></div>
              <span className="h-3 w-24 rounded shimmer" />
              <span className="h-3 w-12 rounded shimmer justify-self-end" />
              <span className="cl-c-own h-3 w-20 rounded shimmer" />
              <span />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
          description={search ? 'Tente outros termos de busca.' : 'Comece adicionando o primeiro cliente.'}
          action={!search ? (
            <button type="button" onClick={() => setModalOpen(true)} className="btn btn-primary">
              <Plus aria-hidden />
              Novo cliente
            </button>
          ) : undefined}
        />
      ) : (() => {
        const { groups, noStrat } = groupByEstrategista(filtered)

        const renderCard = (client: ClientWithBaseline, i: number) => (
          <div key={client.id} className="stagger-enter" style={{ animationDelay: `${i * 40}ms` }}>
            <SocialCard
              client={client}
              snapshot={snapshotByClient.get(client.id)}
              contacts={contactsByClient?.get(client.id)}
              weekBaseline={weekBaselineByClient?.get(client.id) ?? null}
              prevWeekBaseline={prevWeekBaselineByClient?.get(client.id) ?? null}
              history={historyByClient?.get(client.id)}
              onOpenDetail={disableNav ? () => {} : () => navigate(`/clientes/${client.id}`)}
              onOpenChat={(contactId) => {
                const contact = contactsByClient?.get(client.id)?.find(c => c.id === contactId)
                openChat(client.nome, contact)
              }}
              onCobrar={(contactId, mensagem) => {
                const contact = contactsByClient?.get(client.id)?.find(c => c.id === contactId)
                if (contact) setConfirmCobrar({ nome: client.nome, contact, mensagem })
              }}
              onEdit={() => setEditingClient(client)}
            />
          </div>
        )

        const renderListRow = (client: Client) => (
          <ClienteListRow
            key={client.id}
            client={client}
            snapshot={snapshotByClient.get(client.id)}
            contacts={contactsByClient?.get(client.id)}
            weekBaseline={weekBaselineByClient?.get(client.id) ?? null}
            prevWeekBaseline={prevWeekBaselineByClient?.get(client.id) ?? null}
            estrategistas={estrategistasByClient.get(client.id) ?? []}
            onOpenDetail={disableNav ? () => {} : () => navigate(`/clientes/${client.id}`)}
            onOpenChat={(contactId, mensagem) => {
              const contact = contactsByClient?.get(client.id)?.find(c => c.id === contactId)
              openChat(client.nome, contact, mensagem)
            }}
            onEdit={() => setEditingClient(client)}
          />
        )

        function buildGroupSubtitle(clients: ClientWithBaseline[]) {
          const stats = clients.reduce((acc, c) => {
            const snap = snapshotByClient.get(c.id)
            const lvl = getAlertLevel(snap, null)
            if (lvl === 'crit') acc.crit++
            if (lvl === 'warn') acc.warn++
            if (lvl === 'ok') acc.ok++
            if (snap?.last_post_at) {
              const d = daysSince(snap.last_post_at)
              if (d != null) { acc.totalDays += d; acc.withDays++ }
            }
            return acc
          }, { crit: 0, warn: 0, ok: 0, totalDays: 0, withDays: 0 })
          const avgDays = stats.withDays > 0 ? Math.round(stats.totalDays / stats.withDays) : null
          const critPct = clients.length > 0 ? Math.round((stats.crit / clients.length) * 100) : 0
          return (
            <span className="inline-flex items-center gap-2 text-xs">
              <span className="hidden text-muted-foreground sm:inline">Estrategista</span>
              {avgDays != null && (
                <span className="hidden text-muted-foreground/70 sm:inline">· {avgDays}d média sem postar</span>
              )}
              {stats.crit > 0 && (
                <span className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-danger/10 px-1.5 py-0 text-2xs font-bold text-danger">
                  <AlertCircle className="h-2.5 w-2.5" />
                  {stats.crit} crítico{stats.crit > 1 ? 's' : ''} ({critPct}%)
                </span>
              )}
              {stats.warn > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/10 px-1.5 py-0 text-2xs font-bold text-warning">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {stats.warn}
                </span>
              )}
            </span>
          )
        }

        return (
          <div className="space-y-6">
            {groups.map(g => (
              <GroupSection
                key={g.id}
                id={`grp-${g.id}`}
                title={g.nome}
                subtitle={buildGroupSubtitle(g.clients)}
                count={g.clients.length}
                icon={UserCircle}
                iconBg="bg-primary-muted"
                iconFg="text-primary"
              >
                {viewMode === 'list' ? (
                  <div className="cl-panel" role="list" aria-label={`Clientes de ${g.nome}`}>
                    <CabecalhoLista />
                    {g.clients.map(renderListRow)}
                  </div>
                ) : (
                  <CardCarrossel>
                    {g.clients.map(renderCard)}
                  </CardCarrossel>
                )}
              </GroupSection>
            ))}

            {noStrat.length > 0 && (
              <GroupSection
                id="grp-sem-estrategista"
                title="Sem estrategista"
                count={noStrat.length}
                icon={UserX}
                iconBg="bg-muted"
                iconFg="text-muted-foreground"
                defaultOpen={false}
              >
                {viewMode === 'list' ? (
                  <div className="cl-panel" role="list" aria-label="Clientes sem estrategista">
                    <CabecalhoLista />
                    {noStrat.map(renderListRow)}
                  </div>
                ) : (
                  <CardCarrossel>
                    {noStrat.map(renderCard)}
                  </CardCarrossel>
                )}
              </GroupSection>
            )}
          </div>
        )
      })()}

      <p className="cl-note">
        Instagram atualizado automaticamente: <b>domingo às 23h, segunda e sexta às 06h</b>.
        {refreshAll.data && (
          <> Última atualização em lote: <b>{refreshAll.data.succeeded}/{refreshAll.data.total} com sucesso · {refreshAll.data.failed} falhas · {(refreshAll.data.durationMs / 1000).toFixed(1)}s</b>.</>
        )}
      </p>

      <ChatConfirmModal
        open={confirmCobrar !== null}
        nome={confirmCobrar?.nome ?? ''}
        mensagemInicial={confirmCobrar?.mensagem ?? ''}
        onClose={() => setConfirmCobrar(null)}
        onConfirm={(mensagem) => {
          if (!confirmCobrar) return
          openChat(confirmCobrar.nome, confirmCobrar.contact, mensagem)
          setConfirmCobrar(null)
        }}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo cliente" size="md">
        <ClienteForm onClose={() => setModalOpen(false)} />
      </Modal>

      <Modal open={!!editingClient} onClose={() => setEditingClient(null)} title="Editar cliente" size="lg">
        {editingClient && <ClienteForm initial={editingClient} onClose={() => setEditingClient(null)} />}
      </Modal>

    </PageContainer>
  )
}
