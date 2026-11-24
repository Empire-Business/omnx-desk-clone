import { useState, useEffect } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  GitBranch,
  ArrowLeft,
  Menu,
  X,
  Banknote,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { NotificationsButton, SidebarBottom } from './SidebarBottom'
import { BarraSuperior } from './BarraSuperior'
import { BottomNav } from './BottomNav'
import { OmnxBrandBand } from './OmnxBrandBand'
import { BRAND } from '@/config/brand'

const navItems = [
  { label: 'Visão geral', icon: LayoutDashboard, to: '/cobranca' },
  { label: 'Devedores', icon: Users, to: '/cobranca/devedores' },
  { label: 'Réguas', icon: GitBranch, to: '/cobranca/reguas' },
] as const

export function CobrancaLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    function checkMobile() {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) {
        setCollapsed(false)
        setMobileOpen(false)
      }
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  function handleNavClick() {
    if (isMobile) setMobileOpen(false)
  }

  const showSidebar = isMobile ? mobileOpen : true
  const isCollapsed = isMobile ? false : collapsed

  return (
    <div className="cume-frame flex h-dvh overflow-hidden">
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      {showSidebar && (
        <aside
          className={cn(
            'tema-marinho flex flex-col h-dvh bg-sidebar border-r border-sidebar-border transition-[width] duration-300 z-40',
            isCollapsed ? 'w-16' : 'w-64',
            isMobile && 'fixed inset-y-0 left-0 animate-slide-in-right',
          )}
        >
          {/* Faixa de marca OMNX */}
          <OmnxBrandBand collapsed={isCollapsed} />

          {/* Workspace card — padrão AppSidebar */}
          <div className={cn('px-3 pt-2.5 pb-2', isCollapsed && 'px-2')}>
            <div className={cn('flex items-center gap-2', isCollapsed && 'flex-col gap-2')}>
              <Link
                to="/"
                onClick={handleNavClick}
                title="Voltar ao sistema"
                className={cn(
                  'flex items-center gap-2 flex-1 min-w-0 rounded-[7px] bg-sidebar-accent/40 hover:bg-sidebar-accent/70 py-[7px] px-[9px] transition-colors text-left',
                  isCollapsed && 'justify-center w-full',
                )}
              >
                <span className="flex-shrink-0 inline-flex items-center justify-center w-[22px] h-[22px]">
                  <Banknote className="w-4 h-4 text-accent" />
                </span>
                {!isCollapsed && (
                  <>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[12.5px] font-semibold text-sidebar-foreground leading-tight truncate">
                        {BRAND.cobranca}
                      </span>
                      <span className="text-[10.5px] text-sidebar-foreground/55 leading-tight">
                        Voltar ao sistema
                      </span>
                    </div>
                    <ArrowLeft className="w-3 h-3 text-sidebar-foreground/55 flex-shrink-0" />
                  </>
                )}
              </Link>
              {isMobile ? (
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Fechar sidebar"
                  className="flex-shrink-0 rounded-md p-1.5 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => setCollapsed((p) => !p)}
                  aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
                  className="flex-shrink-0 rounded-md p-1.5 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                >
                  {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          {/* Section header */}
          {!isCollapsed && (
            <div className="px-3 mb-1 mt-3.5">
              <p className="px-2.5 text-[11px] font-semibold text-sidebar-foreground/45 uppercase tracking-[0.04em]">
                COBRANÇA
              </p>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 pb-4 sidebar-scroll">
            <ul className="flex flex-col gap-px">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/cobranca'}
                    onClick={handleNavClick}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-[9px] rounded-md text-[13px] min-h-[30px] transition-colors duration-100',
                        isCollapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-1.5',
                        isActive
                          ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/15'
                          : 'text-sidebar-foreground/85 font-[450] hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                      )
                    }
                    title={isCollapsed ? item.label : undefined}
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={cn(
                            'flex-shrink-0 w-[15px] h-[15px] transition-colors',
                            isActive ? 'text-primary' : 'text-sidebar-foreground/55 group-hover:text-sidebar-foreground/85',
                          )}
                        />
                        {!isCollapsed && <span className="truncate flex-1">{item.label}</span>}
                        {isCollapsed && (
                          <span
                            className={cn(
                              'pointer-events-none absolute left-full ml-2 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap z-50',
                              'bg-popover text-popover-foreground shadow-[var(--shadow-md)] border border-sidebar-border',
                              'opacity-0 transition-opacity group-hover:opacity-100',
                            )}
                          >
                            {item.label}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {isMobile ? (
            <SidebarBottom collapsed={isCollapsed} tenantName={BRAND.appName} />
          ) : (
            /* Sino de avisos de volta no rodapé da barra lateral, como na main: a barra superior
               do Cume aqui vai sem ele, mas a notificação continua alcançável dentro da Cobrança. */
            <div className={cn('shrink-0 px-3 pb-2.5 pt-1.5', isCollapsed && 'px-2')}>
              <div className="flex items-center gap-1">
                <NotificationsButton collapsed={isCollapsed} />
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* No app de Cobrança a barra vai sem a busca global e sem o sino: os dois não existiam antes. */}
      {!isMobile && <BarraSuperior busca={false} avisos={false} />}
      <div className="cume-sheet flex min-h-0 flex-1 flex-col min-w-0 overflow-hidden">
        {isMobile && (
          <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 shrink-0">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/20">
              <Banknote className="h-3.5 w-3.5 text-accent" />
            </div>
            <span className="text-sm font-semibold text-foreground">{BRAND.cobranca}</span>
          </header>
        )}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-4 lg:pb-6">
          <Outlet />
        </main>
      </div>
      </div>
      <BottomNav />
    </div>
  )
}
