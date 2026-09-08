import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, MessageSquare, Package } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useInboxUnreadConversationCount } from '@/hooks/useChat'
import { cn } from '@/lib/utils'

type Item = {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  match?: (pathname: string) => boolean
}

const ITEMS: Item[] = [
  { to: '/', label: 'Início', icon: LayoutDashboard, match: (p) => p === '/' },
  { to: '/clientes', label: 'Clientes', icon: Users, match: (p) => p.startsWith('/clientes') },
  { to: '/chat', label: 'Chat', icon: MessageSquare, match: (p) => p.startsWith('/chat') },
  { to: '/entregas', label: 'Entregas', icon: Package, match: (p) => p.startsWith('/entregas') },
]

export function BottomNav() {
  const { user } = useAuth()
  const totalUnread = useInboxUnreadConversationCount()

  const initials = (user?.nome ?? user?.email ?? '??').slice(0, 2).toUpperCase()

  return (
    <nav
      className={cn(
        'sm:hidden fixed bottom-0 inset-x-0 z-40',
        'border-t border-border bg-card/95 backdrop-blur-sm',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <div className="flex h-14 items-stretch">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => {
              const active = item.match ? item.match(window.location.pathname) : isActive
              return cn(
                'relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )
            }}
          >
            {({ isActive }) => {
              const active = item.match ? item.match(window.location.pathname) : isActive
              return (
                <>
                  <div className="relative">
                    <item.icon className="h-5 w-5" />
                    {item.to === '/chat' && totalUnread > 0 && (
                      <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                        {totalUnread > 99 ? '99+' : totalUnread}
                      </span>
                    )}
                  </div>
                  <span className={cn('text-[10px] font-medium', active && 'font-semibold')}>{item.label}</span>
                </>
              )
            }}
          </NavLink>
        ))}

        {/* Avatar → Configurações */}
        <NavLink
          to="/configuracoes"
          className={({ isActive }) =>
            cn(
              'relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )
          }
        >
          {({ isActive }) => (
            <>
              <div
                className={cn(
                  'h-6 w-6 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold',
                  isActive
                    ? 'ring-2 ring-primary ring-offset-1 ring-offset-card bg-primary-muted text-primary'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {user?.foto_url ? (
                  <img src={user.foto_url} alt={user.nome ?? ''} className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <span className={cn('text-[10px] font-medium', isActive && 'font-semibold')}>Você</span>
            </>
          )}
        </NavLink>
      </div>
    </nav>
  )
}
