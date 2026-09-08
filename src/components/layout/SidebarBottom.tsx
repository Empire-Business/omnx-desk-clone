import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  MessageSquare,
  Sun,
  Moon,
  Settings,
  User,
  UserCog,
  BookOpen,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/hooks/useTheme'
import {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
  useRealtimeNotifications,
} from '@/hooks/useNotifications'

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
  /** Esconder a linha de utilitários (notificações/chat/tema). */
  hideUtils?: boolean
}

export function SidebarBottom({ collapsed = false, tenantName = 'OMNX Desk', hideUtils }: SidebarBottomProps) {
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
      {!hideUtils && (
        <div className={cn('px-2 py-1.5 flex items-center gap-1', collapsed && 'flex-col')}>
          <NotificationsButton collapsed={collapsed} />
          <UtilButton icon={MessageSquare} label="Chat rápido" onClick={() => navigate('/chat')} collapsed={collapsed} />
          <UtilButton
            icon={theme === 'dark' ? Sun : Moon}
            label={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            onClick={toggleTheme}
            collapsed={collapsed}
          />
        </div>
      )}

      {/* Footer com avatar + popover */}
      <div ref={ref} className="relative p-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            'w-full flex items-center gap-2 rounded-md p-2 transition-colors cursor-pointer',
            'hover:bg-sidebar-accent/60 text-sidebar-foreground',
          )}
          aria-label="Menu do usuário"
        >
          {userAvatar ? (
            <img
              src={userAvatar}
              alt={userName}
              className="h-[26px] w-[26px] flex-shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="h-[26px] w-[26px] flex-shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-semibold">
              {userInitials || <User className="h-3 w-3" />}
            </div>
          )}
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[12.5px] font-semibold truncate leading-tight">{userName}</p>
                <p className="text-[10.5px] text-sidebar-foreground/55 truncate leading-tight">
                  {userRole} · {tenantName}
                </p>
              </div>
              <Settings className="w-[15px] h-[15px] text-sidebar-foreground/55 flex-shrink-0" />
            </>
          )}
        </button>

        {open && (
          <div
            role="menu"
            className={cn(
              'absolute z-50 w-60 rounded-md border border-sidebar-border bg-popover text-popover-foreground shadow-[var(--shadow-lg)] animate-fade-in-up',
              collapsed ? 'left-full bottom-2 ml-2' : 'bottom-full mb-2 left-2 right-2',
            )}
          >
            <div className="px-3 py-2 border-b border-sidebar-border">
              <p className="text-[13px] font-semibold truncate leading-tight">{userName}</p>
              <p className="text-2xs text-popover-foreground/60 truncate leading-tight font-normal">
                {userEmail}
              </p>
            </div>
            <div className="flex flex-col p-1">
              <MenuItem
                icon={User}
                label="Meu perfil"
                onClick={() => {
                  setOpen(false)
                  navigate('/configuracoes')
                }}
              />
              {isAdmin && (
                <MenuItem
                  icon={Settings}
                  label="Configurações"
                  onClick={() => {
                    setOpen(false)
                    navigate('/configuracoes')
                  }}
                />
              )}
              {isAdmin && (
                <MenuItem
                  icon={UserCog}
                  label="Gerenciar colaboradores"
                  onClick={() => {
                    setOpen(false)
                    navigate('/colaboradores')
                  }}
                />
              )}
              <MenuItem
                icon={BookOpen}
                label="FAQ & Tutoriais"
                onClick={() => {
                  setOpen(false)
                  /* TODO: rota de FAQ */
                }}
              />
              <div className="my-1 border-t border-sidebar-border" />
              <MenuItem
                icon={theme === 'dark' ? Sun : Moon}
                label={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
                onClick={toggleTheme}
              />
              <div className="my-1 border-t border-sidebar-border" />
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
    </>
  )
}

function NotificationsButton({ collapsed }: { collapsed: boolean }) {
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
    if (link) navigate(link)
  }

  return (
    <div ref={ref} className={cn('relative', collapsed ? 'w-full' : 'flex-1')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'relative w-full flex items-center justify-center p-1.5 rounded-md text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
        )}
        title="Notificações"
        aria-label="Notificações"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 w-80 rounded-md border border-sidebar-border bg-popover text-popover-foreground shadow-[var(--shadow-lg)] animate-fade-in-up',
            collapsed ? 'left-full bottom-0 ml-2' : 'bottom-full mb-2 left-0',
          )}
        >
          <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
            <span className="text-[13px] font-semibold">Notificações</span>
            {notifications.some((n) => !n.lida) && (
              <button
                type="button"
                onClick={() => markAllAsRead.mutate()}
                disabled={markAllAsRead.isPending}
                className="text-[11px] text-primary hover:underline disabled:opacity-50"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="flex items-center justify-center py-10">
                <span className="text-[13px] text-popover-foreground/60">Nenhuma notificação</span>
              </li>
            ) : (
              notifications.map((notif) => (
                <li key={notif.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(notif.id, notif.link)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 transition-colors hover:bg-muted/40',
                      'border-b border-sidebar-border last:border-b-0',
                      !notif.lida && 'border-l-2 border-l-primary pl-[10px]',
                    )}
                  >
                    <p className={cn('text-[13px]', !notif.lida && 'font-semibold')}>{notif.titulo}</p>
                    {notif.mensagem && (
                      <p className="mt-0.5 text-[11px] text-popover-foreground/60 truncate">
                        {notif.mensagem}
                      </p>
                    )}
                    <p className="mt-1 text-2xs text-popover-foreground/55">
                      {formatRelativeTime(notif.criado_em)}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-sidebar-border px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                navigate('/notificacoes')
              }}
              className="w-full text-center text-[11px] text-primary hover:underline"
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
      className={cn(
        'flex items-center justify-center p-1.5 rounded-md text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
        collapsed ? 'w-full' : 'flex-1',
      )}
      title={label}
      aria-label={label}
    >
      <Icon className="w-4 h-4" />
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
        'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors text-left',
        destructive
          ? 'text-destructive hover:bg-destructive/10 focus:bg-destructive/10'
          : 'text-popover-foreground hover:bg-muted/40',
      )}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1">{label}</span>
    </button>
  )
}
