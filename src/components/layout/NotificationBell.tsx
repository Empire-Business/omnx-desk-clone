import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useUnreadCount,
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  useRealtimeNotifications,
} from '@/hooks/useNotifications'

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'agora mesmo'
  if (diffMin < 60) return `${diffMin}min atrás`
  if (diffHour < 24) return `${diffHour}h atrás`
  if (diffDay === 1) return 'ontem'
  return `${diffDay} dias atrás`
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const { data: unreadCount = 0 } = useUnreadCount()
  const { data: notifications = [] } = useNotifications()
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead()

  useRealtimeNotifications()

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => { document.removeEventListener('mousedown', handleClickOutside) }
  }, [])

  async function handleNotificationClick(id: string, link: string | null) {
    await markAsRead.mutateAsync(id)
    setIsOpen(false)
    if (link) navigate(link)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="Notificações"
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={cn(
          'absolute top-full right-0 z-50 w-80',
          'glass-card border border-border shadow-xl',
          'animate-fade-in-up',
        )}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Notificações</span>
            {notifications.some((n) => !n.lida) && (
              <button
                onClick={() => markAllAsRead.mutate()}
                disabled={markAllAsRead.isPending}
                className="text-xs text-primary hover:text-primary-hover transition-colors disabled:opacity-50"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          {/* List */}
          <ul className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="flex items-center justify-center py-10">
                <span className="text-sm text-muted-foreground">Nenhuma notificação</span>
              </li>
            ) : (
              notifications.map((notif) => (
                <li key={notif.id}>
                  <button
                    onClick={() => handleNotificationClick(notif.id, notif.link)}
                    className={cn(
                      'w-full text-left px-4 py-3 transition-colors hover:bg-muted/60',
                      'border-b border-border last:border-b-0',
                      !notif.lida && 'border-l-2 border-l-primary pl-3.5',
                    )}
                  >
                    <p className={cn('text-sm text-foreground', !notif.lida && 'font-semibold')}>
                      {notif.titulo}
                    </p>
                    {notif.mensagem && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">
                        {notif.mensagem}
                      </p>
                    )}
                    <p className="mt-1 text-2xs text-muted-foreground">
                      {formatRelativeTime(notif.criado_em)}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2.5">
            <button
              onClick={() => { setIsOpen(false); navigate('/notificacoes') }}
              className="w-full text-center text-xs text-primary hover:text-primary-hover transition-colors"
            >
              Ver todas
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
