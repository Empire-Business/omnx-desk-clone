import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  Sun,
  Moon,
  Settings,
  User,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { safeInternalRoute } from '@/lib/safeInternalRoute'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/hooks/useTheme'
import {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
  useRealtimeNotifications,
} from '@/hooks/useNotifications'
import { BRAND } from '@/config/brand'

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffSec < 60) return 'agora mesmo'
  if (diffMin < 60) return `${diffMin}min atrás`
  if (diffHour < 24) return `${diffHour}h atrás`
  if (diffDay === 1) return 'ontem'
  return `${diffDay} dias atrás`
}

function getInitials(name?: string | null): string {
  if (!name) return ''
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

interface SidebarBottomProps {
  collapsed?: boolean
  tenantName?: string
  /** Esconder a linha de utilitários (notificações/tema); no topo, esconde o sino de avisos. */
  hideUtils?: boolean
  /** 'topo': mesmos avisos, menu do usuário e Sair, montados na barra superior (Cume). */
  placement?: 'lateral' | 'topo'
}

export function SidebarBottom({ collapsed = false, tenantName = BRAND.appName, hideUtils, placement = 'lateral' }: SidebarBottomProps) {
  const topo = placement === 'topo'
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const isAdmin = user?.perfil === 'admin'
  const isManager = user?.perfil === 'gerente'
  const userName = user?.nome ?? user?.email?.split('@')[0] ?? 'Usuário'
  const userEmail = user?.email ?? ''
  const userAvatar = user?.foto_url ?? null
  const userRole = isAdmin
    ? 'Administrador'
    : isManager
      ? 'Gestor'
      : user?.perfil
        ? user.perfil.charAt(0).toUpperCase() + user.perfil.slice(1)
        : 'Colaborador'
  const userInitials = getInitials(userName)

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/login')
    } catch {
      /* silencioso */
    }
  }

  return (
    <>
      {/* Linha de utilitários */}
      {topo && !hideUtils && <NotificationsButton collapsed={false} topo />}
      {!hideUtils && !topo && (
        <div className={cn('flex items-center gap-1 py-1.5', collapsed && 'flex-col')}>
          <NotificationsButton collapsed={collapsed} />
          <UtilButton
            icon={theme === 'dark' ? Sun : Moon}
            label={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            onClick={toggleTheme}
            collapsed={collapsed}
          />
        </div>
      )}

      {/* Footer com avatar + popover */}
      <div ref={ref} className={cn('relative', topo && 'cume-top-userwrap')}>
        {/* DS `.sb-user`: 44 px, avatar 28, nome 13 px e papel 11,5 px */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            topo
              ? 'cume-top-user focus-ds'
              : [
                  'flex h-11 w-full items-center gap-2.5 rounded-md text-left text-sidebar-foreground transition-colors duration-fast ease-std',
                  'hover:bg-sidebar-accent/70 focus-ds',
                  collapsed ? 'justify-center px-0' : 'px-2',
                ],
          )}
          aria-label="Menu do usuário"
        >
          {topo ? (
            <>
              <span className="cume-top-user-text">
                <strong>{userName}</strong>
                <small>{tenantName}</small>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
            </>
          ) : userAvatar ? (
            <img src={userAvatar} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="av" data-h="0" aria-hidden>
              {userInitials || <User className="h-3.5 w-3.5" />}
            </span>
          )}
          {!topo && !collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight text-foreground">{userName}</span>
                <span className="block truncate text-[11.5px] leading-tight text-muted-foreground">
                  {userRole} · {tenantName}
                </span>
              </span>
              <Settings className="h-[15px] w-[15px] shrink-0 text-fg-4" aria-hidden />
            </>
          )}
        </button>

        {open && (
          <div
            role="menu"
            className={cn(
              // DS `.menu` com cabeçalho (`.menu-head`)
              'absolute z-50 w-[232px] rounded-lg bg-popover p-1.5 text-popover-foreground shadow-[var(--elev-pop),var(--ring-1)] animate-fade-in-up',
              topo ? 'right-0 top-full mt-2' : collapsed ? 'bottom-0 left-full ml-2' : 'bottom-full left-0 mb-2',
            )}
          >
            <div className="mb-1 flex items-center gap-2.5 border-b border-border px-2 pb-2.5 pt-2">
              <span className="av av-lg" data-h="0" aria-hidden>{userInitials || <User className="h-4 w-4" />}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold leading-tight">{userName}</span>
                <span className="block truncate text-xs leading-tight text-muted-foreground">{userEmail}</span>
              </span>
            </div>
            <div className="flex flex-col">
              <MenuItem
                icon={User}
                label="Meu perfil"
                onClick={() => {
                  setOpen(false)
                  navigate('/configuracoes')
                }}
              />
              {/* "Configurações", "Gerenciar colaboradores" e "FAQ & Tutoriais"
                  (botão sem ação) saíram: estão em Ajustes e no ponto de Ajuda. */}
              <MenuItem
                icon={Settings}
                label="Ajustes"
                onClick={() => {
                  setOpen(false)
                  navigate('/ajustes')
                }}
              />
              <div className="my-1 border-t border-border" />
              <MenuItem
                icon={theme === 'dark' ? Sun : Moon}
                label={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
                onClick={toggleTheme}
              />
              <div className="my-1 border-t border-border" />
              <MenuItem
                icon={LogOut}
                label="Sair"
                destructive
                onClick={() => {
                  setOpen(false)
                  handleSignOut()
                }}
              />
            </div>
          </div>
        )}
      </div>

      {topo && (
        <button type="button" onClick={handleSignOut} className="cume-top-link">
          <LogOut aria-hidden className="h-[17px] w-[17px]" />
          Sair
        </button>
      )}
    </>
  )
}

export function NotificationsButton({ collapsed, topo = false }: { collapsed: boolean; topo?: boolean }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data: unreadCount = 0 } = useUnreadCount()
  const { data: notifications = [] } = useNotifications()
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead()
  useRealtimeNotifications()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function handleClick(id: string, link: string | null) {
    await markAsRead.mutateAsync(id)
    setOpen(false)
    const destination = safeInternalRoute(link)
    if (destination) navigate(destination)
  }

  return (
    <div ref={ref} className={cn('relative', topo ? 'cume-top-bell' : collapsed ? 'w-full' : 'flex-1')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={topo ? 'cume-top-link relative' : 'btn btn-ghost relative w-full px-0 text-fg-4'}
        title="Notificações"
        aria-label={unreadCount > 0 ? `Notificações (${unreadCount} não lidas)` : 'Notificações'}
      >
        <Bell aria-hidden className={topo ? 'h-[17px] w-[17px]' : undefined} />
        {topo && 'Avisos'}
        {unreadCount > 0 && (
          <span className={cn('count is-danger absolute h-4 min-w-4 px-1 text-[10px]', topo ? 'right-0 top-0' : 'right-1 top-0.5')} aria-hidden>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-[var(--elev-pop),var(--ring-1)] animate-fade-in-up',
            topo ? 'right-0 top-full mt-2' : collapsed ? 'bottom-0 left-full ml-2' : 'bottom-full left-0 mb-2',
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-[13.5px] font-semibold">Notificações</span>
            {notifications.some((n) => !n.lida) && (
              <button
                type="button"
                onClick={() => markAllAsRead.mutate()}
                disabled={markAllAsRead.isPending}
                className="text-xs font-medium text-link hover:underline disabled:opacity-45"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="flex items-center justify-center py-10">
                <span className="text-[13px] text-muted-foreground">Nenhuma notificação</span>
              </li>
            ) : (
              notifications.map((notif) => (
                <li key={notif.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(notif.id, notif.link)}
                    className={cn(
                      'w-full px-3 py-2.5 text-left transition-colors duration-fast hover:bg-accent focus-ds',
                      'border-b border-stroke-weak last:border-b-0',
                      !notif.lida && 'border-l-2 border-l-primary pl-[10px]',
                    )}
                  >
                    <p className={cn('text-[13px]', !notif.lida && 'font-semibold')}>{notif.titulo}</p>
                    {notif.mensagem && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {notif.mensagem}
                      </p>
                    )}
                    <p className="mono mt-1 text-[11px] text-fg-4">
                      {formatRelativeTime(notif.criado_em)}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                navigate('/notificacoes')
              }}
              className="w-full text-center text-xs font-medium text-link hover:underline"
            >
              Ver todas
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function UtilButton({
  icon: Icon,
  label,
  onClick,
  collapsed,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  collapsed: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('btn btn-ghost px-0 text-fg-4', collapsed ? 'w-full' : 'flex-1')}
      title={label}
      aria-label={label}
    >
      <Icon aria-hidden />
    </button>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        // DS `.mi`: 32 px, raio 6, 13,5 px 500, ícone 15 px
        'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13.5px] font-medium transition-colors duration-fast hover:bg-accent focus-ds',
        destructive ? 'text-danger' : 'text-popover-foreground',
      )}
    >
      <Icon className={cn('h-[15px] w-[15px] shrink-0', destructive ? 'text-danger' : 'text-muted-foreground')} aria-hidden />
      <span className="flex-1">{label}</span>
    </button>
  )
}
