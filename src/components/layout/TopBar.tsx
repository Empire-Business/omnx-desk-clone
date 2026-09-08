import { Menu, PanelLeftClose, Sun, Moon } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { resolvePageTitle } from '@/lib/page-title'
import { NotificationBell } from './NotificationBell'

interface TopBarProps {
  onToggleSidebar: () => void
  sidebarCollapsed: boolean
}

export function TopBar({ onToggleSidebar, sidebarCollapsed }: TopBarProps) {
  const { theme, toggleTheme } = useTheme()
  const { user } = useAuth()
  const { pathname } = useLocation()
  const pageTitle = resolvePageTitle(pathname) ?? 'OMNX Desk'

  const initials = user?.nome
    ? user.nome
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'ED'

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-card/95 backdrop-blur-xl px-4">
      {/* Left section */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        >
          {sidebarCollapsed ? (
            <Menu className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>

        <div className="hidden sm:block">
          <h1 className="font-display text-xl font-semibold text-foreground tracking-tight">
            {pageTitle}
          </h1>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>

        <NotificationBell />

        <button
          className={cn(
            'flex items-center gap-2 rounded-md p-1.5 transition-colors',
            'hover:bg-muted',
          )}
          aria-label="Menu do usuário"
        >
          {user?.foto_url ? (
            <img src={user.foto_url} alt={user.nome} className="h-8 w-8 rounded-md object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
              {initials}
            </div>
          )}
        </button>
      </div>
    </header>
  )
}
