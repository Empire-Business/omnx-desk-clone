import React, { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users2,
  GraduationCap,
  MessageSquare,
  Banknote,
  Settings,
  ShieldCheck,
  LogOut,
  UserCircle2,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  PanelLeftClose,
} from 'lucide-react'
import { OmnxLogo } from '@/components/icons/OmnxLogo'
import { OmnxLockup } from '@/components/icons/OmnxLockup'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'
import { useUnreadCounts, useMyModules } from '@/hooks/useChat'
import { useMyInstanceIds } from '@/hooks/useUsers'
import { NotificationBell } from './NotificationBell'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

type NavItem = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  to: string
  roles: string[]
  module?: string
  badge?: number | (() => number)
}

type NavSection = {
  /** Título da seção; null = sem título (primeiro grupo) */
  title: string | null
  collapsible?: boolean
  defaultOpen?: boolean
  items: NavItem[]
}

const eyebrow = 'text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/70'

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!accountOpen) return
    const onDown = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAccountOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [accountOpen])

  const { theme, toggleTheme } = useTheme()
  const { data: myInstanceIds } = useMyInstanceIds()
  const { data: unreadCounts } = useUnreadCounts(myInstanceIds)
  const { data: myModules } = useMyModules()
  const totalUnread = unreadCounts ? Object.values(unreadCounts).reduce((sum, n) => sum + n, 0) : 0

  const initials = user?.nome
    ? user.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'ED'

  const sections: NavSection[] = [
    {
      title: 'PRINCIPAL',
      items: [
        { label: 'Dashboard', icon: LayoutDashboard, to: '/', roles: [] },
        { label: 'OMNXChat', icon: MessageSquare, to: '/chat', roles: [], badge: totalUnread },
        { label: 'Trilhas', icon: GraduationCap, to: '/trilhas', roles: [] },
      ],
    },
    {
      title: 'OPERAÇÃO',
      items: [
        { label: 'Cobrança', icon: Banknote, to: '/cobranca', roles: [], module: 'cobranca' },
      ],
    },
    {
      title: 'EQUIPE',
      items: [
        { label: 'Minha Equipe', icon: Users2, to: '/minha-equipe', roles: ['atendimento', 'estrategista'] },
      ],
    },
    {
      title: 'GESTÃO',
      items: [
        { label: 'Configurações', icon: Settings, to: '/configuracoes', roles: [] },
        { label: 'Admin', icon: ShieldCheck, to: '/admin', roles: ['admin'] },
      ],
    },
  ]

  function canSee(item: NavItem): boolean {
    if (item.roles.length > 0 && !item.roles.includes(user?.perfil ?? '')) return false
    if (item.module) {
      if (!myModules) return false
      if (!myModules.has('all') && !myModules.has(item.module)) return false
    }
    return true
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-dvh flex-col overflow-hidden',
        'bg-sidebar border-r border-sidebar-border',
        'transition-all duration-300 ease-in-out',
        collapsed ? 'w-[64px]' : 'w-[256px]',
      )}
    >
      {/* Header: ícone + nome + versão + botão colapsar */}
      <div className={cn(
        'shrink-0 border-b border-sidebar-border',
        collapsed ? 'flex justify-center items-center px-2 py-3' : 'flex items-center justify-between gap-2 px-4 py-3',
      )}>
        <button
          onClick={collapsed ? onToggle : undefined}
          className={cn(
            'flex items-center gap-2.5 min-w-0',
            collapsed && 'cursor-pointer',
          )}
        >
          {collapsed ? (
            <span className="shrink-0">
              <OmnxLogo size={36} />
            </span>
          ) : (
            <div className="min-w-0 text-left">
              <OmnxLockup word="DESK" height={26} variant="light" />
              <p className="text-[10.5px] font-mono text-muted-foreground/60 mt-1">v1.0.0</p>
            </div>
          )}
        </button>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground/70 hover:bg-sidebar-accent hover:text-foreground transition-colors"
            aria-label="Recolher sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation sections */}
      <nav className={cn(
        'flex-1 overflow-x-hidden px-2 py-3 sidebar-scroll',
        collapsed ? 'overflow-y-hidden' : 'overflow-y-auto',
      )}>
        {sections.map((section, sIdx) => {
          const visibleItems = section.items.filter(canSee)
          if (visibleItems.length === 0) return null
          // Conta sections já visíveis antes desta para decidir separador
          const isFirstVisible = sections.slice(0, sIdx).every(s => s.items.filter(canSee).length === 0)
          return (
            <React.Fragment key={section.title ?? `_${sIdx}`}>
              {!isFirstVisible && !collapsed && (
                <div className="my-2 mx-2 border-t border-white/5" />
              )}
              <SidebarSection
                title={section.title}
                collapsed={collapsed}
                defaultOpen={section.defaultOpen ?? true}
                collapsible={section.collapsible ?? !!section.title}
              >
                {visibleItems.map(item => {
                  const badgeValue = typeof item.badge === 'function' ? item.badge() : item.badge
                  return (
                    <SidebarNavItem
                      key={item.to}
                      item={item}
                      badge={badgeValue}
                      collapsed={collapsed}
                    />
                  )
                })}
              </SidebarSection>
            </React.Fragment>
          )
        })}
      </nav>

      {/* Toolbar: notificações + tema */}
      <div className={cn(
        'shrink-0 border-t border-sidebar-border p-2',
        collapsed ? 'flex flex-col items-center gap-1' : 'flex items-center justify-around gap-1',
      )}>
        <SidebarToolButton onClick={toggleTheme} label={theme === 'dark' ? 'Modo claro' : 'Modo escuro'} collapsed={collapsed}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </SidebarToolButton>
        <SidebarBellWrapper collapsed={collapsed} />
      </div>

      {/* Footer: usuário compacto — abre popover de conta */}
      <div ref={accountRef} className="relative shrink-0 border-t border-sidebar-border">
      <button
        onClick={() => setAccountOpen(o => !o)}
        title="Conta"
        aria-haspopup="menu"
        aria-expanded={accountOpen}
        className={cn(
          'w-full p-3 group hover:bg-white/4 transition-colors',
          collapsed && 'p-2',
        )}
      >
        <div className={cn('flex items-center gap-2.5', collapsed && 'flex-col gap-1')}>
          {user?.foto_url ? (
            <img src={user.foto_url} alt={user.nome} className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-[11px] font-semibold font-mono tracking-wider">
              {initials}
            </div>
          )}
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-[13px] font-semibold text-sidebar-foreground leading-tight">
                  {user?.nome ?? 'Usuário'}
                </p>
                <p className="truncate text-[11px] text-muted-foreground leading-tight mt-0.5 capitalize">
                  {user?.perfil ?? '...'}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-foreground/85 transition-colors" />
            </>
          )}
        </div>
      </button>

      {accountOpen && (
        <div
          role="menu"
          className={cn(
            'absolute bottom-full mb-2 z-40 rounded-lg border border-sidebar-border bg-sidebar shadow-2xl shadow-void/40 animate-fade-in-up',
            collapsed ? 'left-full ml-2 w-60' : 'left-2 right-2',
          )}
        >
          <div className="flex items-center gap-3 border-b border-sidebar-border p-3">
            {user?.foto_url ? (
              <img src={user.foto_url} alt={user.nome} className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-[11px] font-semibold font-mono tracking-wider">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-sidebar-foreground leading-tight">{user?.nome ?? 'Usuário'}</p>
              <p className="truncate text-[11px] text-muted-foreground leading-tight mt-0.5">{user?.email ?? ''}</p>
            </div>
          </div>
          <div className="flex flex-col p-1.5">
            <button
              role="menuitem"
              onClick={() => { setAccountOpen(false); navigate('/configuracoes') }}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-foreground/85 hover:bg-sidebar-accent hover:text-foreground transition-colors text-left"
            >
              <UserCircle2 className="h-4 w-4" />
              <span className="flex-1">Configurar perfil</span>
            </button>
            <button
              role="menuitem"
              onClick={() => { setAccountOpen(false); navigate('/configuracoes') }}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-foreground/85 hover:bg-sidebar-accent hover:text-foreground transition-colors text-left"
            >
              <Settings className="h-4 w-4" />
              <span className="flex-1">Configurações</span>
            </button>
            <div className="my-1 border-t border-sidebar-border" />
            <button
              role="menuitem"
              onClick={() => { setAccountOpen(false); signOut() }}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-destructive hover:bg-destructive/10 transition-colors text-left"
            >
              <LogOut className="h-4 w-4" />
              <span className="flex-1">Sair</span>
            </button>
          </div>
        </div>
      )}
      </div>
    </aside>
  )
}

function SidebarToolButton({ onClick, label, children, collapsed }: {
  onClick: () => void
  label: string
  children: React.ReactNode
  collapsed: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors',
        collapsed ? 'w-full' : 'flex-1',
      )}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  )
}

function SidebarBellWrapper({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('flex items-center justify-center', collapsed ? 'w-full' : 'flex-1')}>
      <NotificationBell />
    </div>
  )
}

function SidebarSection({
  title, children, collapsed, defaultOpen, collapsible,
}: {
  title: string | null
  children: React.ReactNode
  collapsed: boolean
  defaultOpen: boolean
  collapsible: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      {title && !collapsed && (
        <button
          onClick={() => collapsible && setOpen(o => !o)}
          className={cn(
            'flex items-center gap-1 px-2 mb-1 transition-colors',
            eyebrow,
            collapsible && 'hover:text-foreground/80',
          )}
        >
          {collapsible && (
            open
              ? <ChevronDown className="h-2.5 w-2.5" />
              : <ChevronRight className="h-2.5 w-2.5" />
          )}
          {title}
        </button>
      )}
      {(open || !collapsible || collapsed) && (
        <div className="flex flex-col gap-0.5">
          {children}
        </div>
      )}
    </div>
  )
}

function SidebarNavItem({
  item, badge, collapsed,
}: {
  item: NavItem
  badge?: number
  collapsed: boolean
}) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-full px-3 py-1.5',
          'transition-colors duration-200 ease-[cubic-bezier(.2,0,0,1)]',
          collapsed && 'justify-center px-2 py-2',
          isActive
            ? 'bg-secondary text-secondary-foreground font-medium'
            : 'text-foreground/85 font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className="relative">
            <item.icon
              className={cn(
                'h-[15px] w-[15px] shrink-0',
                isActive ? 'text-secondary-foreground' : 'text-muted-foreground group-hover:text-foreground/85',
              )}
              strokeWidth={isActive ? 2.2 : 1.8}
            />
            {collapsed && badge != null && badge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary px-0.5 text-[8.5px] font-bold text-white">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-[13px]">
                {item.label}
              </span>
              {badge != null && badge > 0 && (
                <span className={cn(
                  'ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/85',
                )}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </>
          )}
          {collapsed && (
            <span
              className={cn(
                'pointer-events-none absolute left-full ml-2 rounded-md px-2 py-1 text-xs font-medium',
                'bg-popover text-popover-foreground shadow-md border border-border',
                'opacity-0 transition-opacity group-hover:opacity-100',
                'whitespace-nowrap z-50',
              )}
            >
              {item.label}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}
