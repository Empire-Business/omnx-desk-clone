import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  CheckCircle,
  XCircle,
  MessageSquare,
  AlertTriangle,
  DollarSign,
  Star,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNotifications, useMarkAsRead, useMarkAllAsRead } from '@/hooks/useNotifications'
import type { Notification } from '@/hooks/useNotifications'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'

// ─── Notification type config ────────────────────────────────────────────────

interface NotifTypeConfig {
  icon: LucideIcon
  color: string
  bgColor: string
}

const NOTIF_TYPE_MAP: Record<string, NotifTypeConfig> = {
  entrega_aprovada: { icon: CheckCircle, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  aprovado: { icon: CheckCircle, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  entrega_rejeitada: { icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500/10' },
  reprovado: { icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500/10' },
  nova_mensagem_chat: { icon: MessageSquare, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  comentario: { icon: MessageSquare, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  sla_violado: { icon: AlertTriangle, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  nova_cobranca_resposta: { icon: DollarSign, color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  nps_recebido: { icon: Star, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' },
  sistema: { icon: Bell, color: 'text-muted-foreground', bgColor: 'bg-muted' },
}

const DEFAULT_CONFIG: NotifTypeConfig = { icon: Bell, color: 'text-muted-foreground', bgColor: 'bg-muted' }

function getNotifConfig(tipo: string): NotifTypeConfig {
  return NOTIF_TYPE_MAP[tipo] ?? DEFAULT_CONFIG
}

// ─── Filter tabs ─────────────────────────────────────────────────────────────

type FilterTab = 'todas' | 'nao_lidas' | 'chat' | 'entregas' | 'cobranca' | 'sistema'

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'nao_lidas', label: 'Nao lidas' },
  { id: 'chat', label: 'Chat' },
  { id: 'entregas', label: 'Entregas' },
  { id: 'cobranca', label: 'Cobranca' },
  { id: 'sistema', label: 'Sistema' },
]

const FILTER_TYPES: Record<FilterTab, string[] | null> = {
  todas: null,
  nao_lidas: null,
  chat: ['nova_mensagem_chat', 'comentario'],
  entregas: ['entrega_aprovada', 'entrega_rejeitada', 'aprovado', 'reprovado', 'sla_violado'],
  cobranca: ['nova_cobranca_resposta'],
  sistema: ['sistema', 'nps_recebido'],
}

// ─── Relative time formatter ─────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'agora mesmo'
  if (diffMin < 60) return `ha ${diffMin} min`
  if (diffHour < 24) return `ha ${diffHour}h`
  if (diffDay === 1) return 'ontem'
  if (diffDay < 7) return `ha ${diffDay} dias`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// ─── Date grouping ───────────────────────────────────────────────────────────

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const notifDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (notifDate.getTime() === today.getTime()) return 'Hoje'
  if (notifDate.getTime() === yesterday.getTime()) return 'Ontem'
  return 'Mais antigas'
}

function groupNotifications(notifications: Notification[]): Record<string, Notification[]> {
  const groups: Record<string, Notification[]> = {}
  const order = ['Hoje', 'Ontem', 'Mais antigas']

  for (const notif of notifications) {
    const group = getDateGroup(notif.criado_em)
    if (!groups[group]) groups[group] = []
    groups[group].push(notif)
  }

  const result: Record<string, Notification[]> = {}
  for (const key of order) {
    if (groups[key]) result[key] = groups[key]
  }
  return result
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function NotificationSkeleton() {
  return (
    <div className="glass-card p-4 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-lg">
          <div className="h-9 w-9 rounded-full bg-muted shimmer shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-muted shimmer" />
            <div className="h-3 w-1/2 rounded bg-muted shimmer" />
            <div className="h-3 w-1/4 rounded bg-muted shimmer" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function NotificacoesPage() {
  const navigate = useNavigate()
  const { data: notifications = [], isLoading } = useNotifications()
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead()
  const [activeTab, setActiveTab] = useState<FilterTab>('todas')

  // Filtered notifications
  const filtered = useMemo(() => {
    let list = notifications

    if (activeTab === 'nao_lidas') {
      list = list.filter((n) => !n.lida)
    } else if (FILTER_TYPES[activeTab]) {
      const types = FILTER_TYPES[activeTab]!
      list = list.filter((n) => types.includes(n.tipo))
    }

    return list
  }, [notifications, activeTab])

  const hasUnread = notifications.some((n) => !n.lida)
  const unreadCount = notifications.filter((n) => !n.lida).length
  const grouped = groupNotifications(filtered)

  async function handleNotificationClick(notif: Notification) {
    if (!notif.lida) {
      await markAsRead.mutateAsync(notif.id)
    }
    if (notif.link) navigate(notif.link)
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 animate-fade-in">
      <PageHeader
        title="Notificacoes"
        description={unreadCount > 0 ? `${unreadCount} nao lida${unreadCount > 1 ? 's' : ''}` : 'Voce esta em dia!'}
        action={
          hasUnread ? (
            <button
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending}
              className="gradient-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              Marcar todas como lidas
            </button>
          ) : undefined
        }
      />

      {/* Filter tabs */}
      <div className="glass-card p-1.5 flex gap-1 overflow-x-auto scrollbar-hide">
        {FILTER_TABS.map((tab) => {
          const count =
            tab.id === 'nao_lidas'
              ? unreadCount
              : tab.id === 'todas'
                ? notifications.length
                : notifications.filter((n) => (FILTER_TYPES[tab.id] ?? []).includes(n.tipo)).length

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {isLoading ? (
        <NotificationSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nenhuma notificacao"
          description={
            activeTab === 'todas'
              ? 'Voce esta em dia! Nao ha notificacoes no momento.'
              : `Nenhuma notificacao na categoria "${FILTER_TABS.find((t) => t.id === activeTab)?.label}".`
          }
        />
      ) : (
        <div className="space-y-3 sm:space-y-4 lg:space-y-6">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                {group}
              </h2>
              <div className="glass-card overflow-hidden">
                <ul className="divide-y divide-border">
                  {items.map((notif) => {
                    const config = getNotifConfig(notif.tipo)
                    const Icon = config.icon
                    return (
                      <li key={notif.id}>
                        <button
                          onClick={() => handleNotificationClick(notif)}
                          className={cn(
                            'w-full text-left flex items-start gap-3 p-4 transition-colors hover:bg-muted/40',
                            !notif.lida && 'bg-primary-muted/20'
                          )}
                        >
                          {/* Icon */}
                          <div
                            className={cn(
                              'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                              config.bgColor
                            )}
                          >
                            <Icon className={cn('h-4 w-4', config.color)} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p
                                className={cn(
                                  'text-sm text-foreground',
                                  !notif.lida && 'font-semibold'
                                )}
                              >
                                {notif.titulo}
                              </p>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatRelativeTime(notif.criado_em)}
                                </span>
                                {!notif.lida && (
                                  <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                                )}
                              </div>
                            </div>
                            {notif.mensagem && (
                              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                                {notif.mensagem}
                              </p>
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
