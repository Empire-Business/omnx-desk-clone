import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  ShieldCheck,
  Blocks,
  LifeBuoy,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Check,
  Lock,
  Users,
  UserCircle,
  Building2,
  Activity,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useInboxUnreadConversationCount, useMyModules } from '@/hooks/useChat'
import { useIsMasterAdmin } from '@/hooks/useProvisionTenant'
import { useIsAppEnabled } from '@/hooks/useAppModules'
import { usePermissoes } from '@/hooks/usePermissoes'
import { cn } from '@/lib/utils'
import { OmnxBrandBand } from './OmnxBrandBand'
import { SidebarBottom } from './SidebarBottom'

type NavItemDef = {
  label: string
  icon: typeof LayoutDashboard
  to: string
  /** Restrição por perfil — vazio = todos veem. */
  roles?: string[]
  /** Apenas admins. */
  adminOnly?: boolean
  /** Apenas admin do tenant mestre (provisionamento de empresas). */
  masterOnly?: boolean
  /** Restrição por módulo (useMyModules). */
  module?: string
  /** Módulo Contratos: gestores (admin/gerente/acesso_contratos) + atendimento (só vê a aba Onboarding). */
  access?: 'contratos'
  /** Recurso da matriz de permissões — o item some para quem não pode nem ver. */
  recurso?: string
  /** Ação exigida no recurso. Padrão: 'ver'. */
  acao?: 'ver' | 'editar' | 'admin'
  /** Slug do app na modularização (app_modules). Se o app estiver desligado, o item some. */
  appSlug?: string
}

type NavGroup = {
  section: string
  items: NavItemDef[]
}

// Fonte da palavra do produto no seletor de hub (próxima da wordmark OMNX).
const HUB_FONT = "'Chakra Petch','Space Grotesk','Segoe UI',system-ui,sans-serif"

const navItems: NavGroup[] = [
  {
    section: 'PRINCIPAL',
    items: [
      // Atendimento é a tela inicial desde 04/08/2026 e ocupa o lugar que era
      // do Dashboard — inclusive o ícone, para quem já usa não perder a
      // referência visual. O Dashboard antigo virou legado sem item de menu
      // (rota /dashboard-legado).
      { label: 'Atendimento', icon: LayoutDashboard, to: '/', recurso: 'atendimento', appSlug: 'atendimento' },
      { label: 'OMNXChat', icon: MessageSquare, to: '/chat', appSlug: 'chat' },
    ],
  },
  {
    section: 'OPERAÇÃO',
    items: [
      { label: 'Contratos', icon: FileText, to: '/contratos', access: 'contratos', appSlug: 'contratos' },
    ],
  },
  {
    section: 'GESTÃO',
    items: [
      { label: 'Clientes', icon: UserCircle, to: '/clientes' },
      { label: 'Colaboradores', icon: Users, to: '/colaboradores' },
      { label: 'Apps', icon: Blocks, to: '/apps', recurso: 'apps', acao: 'admin' },
      { label: 'Reportes', icon: LifeBuoy, to: '/reportes', recurso: 'reportes', acao: 'admin' },
      // Erros por app — vizinho de Reportes de propósito: um é o que a pessoa
      // viu, o outro é o que o sistema sentiu. Investiga-se os dois juntos.
      { label: 'Saúde do sistema', icon: Activity, to: '/saude', recurso: 'auditoria', acao: 'admin' },
      // Acompanhamento do próprio reporte — todo usuário logado.
      { label: 'Meus reportes', icon: LifeBuoy, to: '/meus-reportes' },
      { label: 'Empresas', icon: Building2, to: '/empresas', masterOnly: true },
      // Continua preso ao perfil, não à matriz: /admin é a tela que EDITA a
      // matriz. Delegá-la por ela mesma deixaria alguém se auto-promover.
      { label: 'Admin', icon: ShieldCheck, to: '/admin', adminOnly: true },
    ],
  },
]

interface AppSidebarProps {
  /** Mobile drawer mode — chama ao navegar para fechar o drawer. */
  onNavigate?: () => void
  /** Tenant atual (opcional). */
  tenant?: { name: string; logo_url: string | null } | null
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export function AppSidebar({
  onNavigate,
  tenant,
  collapsed: collapsedProp,
  onToggleCollapsed,
}: AppSidebarProps) {
  const location = useLocation()
  const { user } = useAuth()
  const { data: myModules } = useMyModules()
  const { isAppEnabled } = useIsAppEnabled()
  const { can } = usePermissoes()
  const chatUnread = useInboxUnreadConversationCount()

  const isAdmin = user?.perfil === 'admin'
  const { isMaster } = useIsMasterAdmin()

  // Estado interno se não controlado por fora
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const collapsed = collapsedProp ?? internalCollapsed
  const handleToggleCollapsed = onToggleCollapsed ?? (() => setInternalCollapsed((c) => !c))

  // Estado das seções colapsáveis (default todas abertas)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navItems.map((g) => [g.section, true])),
  )

  // Popover de troca de hub
  const [hubOpen, setHubOpen] = useState(false)
  const hubRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hubOpen) return
    const onDown = (e: MouseEvent) => {
      if (hubRef.current && !hubRef.current.contains(e.target as Node)) setHubOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHubOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [hubOpen])

  const isActive = (to: string) => {
    // "/" é o painel de Atendimento; as demais telas do app ficam em
    // /atendimento/* e devem manter o item do menu aceso.
    if (to === '/') return location.pathname === '/' || location.pathname.startsWith('/atendimento')
    return location.pathname.startsWith(to)
  }

  const handleNav = () => {
    onNavigate?.()
  }

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  // Filtragem por permissão / módulo
  const canSee = (item: NavItemDef): boolean => {
    // Modularização: app desligado nesta instalação não aparece no menu (fail-open).
    if (item.appSlug && !isAppEnabled(item.appSlug)) return false
    if (item.adminOnly && !isAdmin) return false
    if (item.masterOnly && !isMaster) return false
    if (item.access === 'contratos') {
      // Fase 2: a pergunta virou "pode neste recurso?". Quem só tem Onboarding
      // (atendimento) continua vendo o item — as abas internas é que se ajustam.
      if (!can('contratos', 'ver') && !can('contratos.onboarding', 'ver')) return false
    }
    if (item.recurso && !can(item.recurso, item.acao ?? 'ver')) return false
    if (item.roles && item.roles.length > 0 && !item.roles.includes(user?.perfil ?? '')) return false
    if (item.module) {
      if (!myModules) return false
      if (!myModules.has('all') && !myModules.has(item.module)) return false
    }
    return true
  }

  const visibleGroups = navItems
    .map((g) => ({ ...g, visibleItems: g.items.filter(canSee) }))
    .filter((g) => g.visibleItems.length > 0)

  // Tenant
  const tenantName = tenant?.name ?? 'OMNX Desk'

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-sidebar border-r border-sidebar-border sticky top-0 transition-[width] duration-300 z-30',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Faixa de marca OMNX */}
      <OmnxBrandBand collapsed={collapsed} />

      {/* Workspace card */}
      <div className={cn('px-3 pt-2.5 pb-2', collapsed && 'px-2')}>
        <div className={cn('flex items-center gap-2', collapsed && 'flex-col gap-2')} ref={hubRef}>
          <div className="relative flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setHubOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={hubOpen}
              className={cn(
                'flex items-center gap-2 w-full min-w-0 rounded-[7px] bg-card shadow-[var(--shadow-sm)] hover:bg-muted/40 py-[7px] px-[9px] transition-colors text-left',
                collapsed && 'justify-center',
              )}
            >
              <span
                className="flex-1 min-w-0 truncate text-sidebar-foreground font-bold uppercase leading-none text-[15px]"
                style={{ fontFamily: HUB_FONT, letterSpacing: '0.12em' }}
              >
                Desk
              </span>
              {!collapsed && (
                <ChevronDown className="w-3 h-3 text-sidebar-foreground/55 flex-shrink-0" />
              )}
            </button>

            {hubOpen && (
              <div
                role="menu"
                className={cn(
                  'absolute left-0 top-full mt-1 z-50 w-60 rounded-md border border-sidebar-border bg-popover text-popover-foreground shadow-[var(--shadow-lg)] animate-fade-in-up',
                  collapsed && 'left-full top-0 ml-2 mt-0',
                )}
              >
                <p className="px-2.5 pt-2 pb-1 text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide">
                  Trocar de hub
                </p>
                <div className="border-t border-sidebar-border" />
                {/* Atual — Desk */}
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[13px] font-bold uppercase text-foreground leading-none" style={{ fontFamily: HUB_FONT, letterSpacing: '0.1em' }}>Desk</span>
                    <span className="text-[10.5px] text-muted-foreground leading-tight truncate mt-1">
                      Atendimento ao cliente
                    </span>
                  </div>
                  <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                </div>
                {/* GT3 (link externo) */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    window.location.href = 'https://gt3.omnx.pro'
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-muted/40 transition-colors text-left"
                >
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[13px] font-bold uppercase text-foreground leading-none" style={{ fontFamily: HUB_FONT, letterSpacing: '0.1em' }}>GT3</span>
                    <span className="text-[10.5px] text-muted-foreground leading-tight truncate mt-1">Gestão estratégica</span>
                  </div>
                </button>
                {/* CRM (em breve) */}
                <div
                  role="menuitem"
                  aria-disabled="true"
                  className="flex items-center gap-2.5 px-2.5 py-2 opacity-60"
                >
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[13px] font-bold uppercase text-foreground leading-none" style={{ fontFamily: HUB_FONT, letterSpacing: '0.1em' }}>CRM</span>
                    <span className="text-[10.5px] text-muted-foreground leading-tight truncate mt-1">Em breve</span>
                  </div>
                  <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </div>
              </div>
            )}
          </div>

          {/* Toggle colapsar — escondido em modo drawer (onNavigate definido) */}
          {!onNavigate && (
            <button
              type="button"
              onClick={handleToggleCollapsed}
              className="flex-shrink-0 rounded-md p-1.5 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
              aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
              title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav
        className={cn(
          'flex-1 overflow-y-auto py-4 px-3 sidebar-scroll',
          collapsed && 'overflow-x-hidden',
        )}
      >
        {visibleGroups.map((group) => {
          const sectionOpen = openSections[group.section] ?? true
          return (
            <div key={group.section} className="mb-2">
              {!collapsed && (
                <div className="flex items-center justify-between px-2.5 mb-1 mt-3.5">
                  <button
                    type="button"
                    onClick={() => toggleSection(group.section)}
                    className="flex items-center gap-1 group cursor-pointer"
                  >
                    <ChevronDown
                      className={cn(
                        'w-[11px] h-[11px] text-sidebar-foreground/45 transition-transform duration-200',
                        !sectionOpen && '-rotate-90',
                      )}
                    />
                    <p className="text-[11px] font-semibold text-sidebar-foreground/45 uppercase tracking-[0.04em] group-hover:text-sidebar-foreground/80 transition-colors">
                      {group.section}
                    </p>
                  </button>
                  {/* Botão "+" reservado para futuras ações por seção */}
                  <button
                    type="button"
                    onClick={() => {
                      /* TODO: ação por seção — ex: criar item rápido */
                    }}
                    className="text-sidebar-foreground/45 hover:text-sidebar-foreground/80 p-0.5 rounded hover:bg-sidebar-accent transition-colors"
                    title="Adicionar"
                    aria-label="Adicionar"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              )}

              {(sectionOpen || collapsed) && (
                <ul className="flex flex-col gap-px">
                  {group.visibleItems.map((item) => {
                    const active = isActive(item.to)
                    const unread = item.to === '/chat' ? chatUnread : 0
                    const hasUnread = unread > 0
                    const badgeColor = 'bg-primary text-primary-foreground'

                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          onClick={handleNav}
                          className={cn(
                            'group relative flex items-center gap-[9px] rounded-md text-[13px] min-h-[30px] transition-colors duration-100',
                            collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-1.5',
                            active
                              ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/15'
                              : 'text-sidebar-foreground/85 font-[450] hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                          )}
                          title={collapsed ? item.label : undefined}
                        >
                          <item.icon
                            className={cn(
                              'flex-shrink-0 w-[15px] h-[15px] transition-colors',
                              active ? 'text-primary' : 'text-sidebar-foreground/55 group-hover:text-sidebar-foreground/85',
                            )}
                          />
                          {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                          {!collapsed && hasUnread && (
                            <span className="text-[11px] font-medium text-primary bg-primary/15 px-[5px] rounded-[4px] leading-[1.4] tabular-nums">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          )}
                          {collapsed && hasUnread && (
                            <span
                              className={cn(
                                'absolute top-1 right-1 w-4 h-4 rounded-full text-2xs flex items-center justify-center font-bold leading-none',
                                badgeColor,
                              )}
                            >
                              {unread > 9 ? '9+' : unread}
                            </span>
                          )}
                          {/* Tooltip CSS-only no modo colapsado */}
                          {collapsed && (
                            <span
                              className={cn(
                                'pointer-events-none absolute left-full ml-2 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap z-50',
                                'bg-popover text-popover-foreground shadow-[var(--shadow-md)] border border-sidebar-border',
                                'opacity-0 transition-opacity group-hover:opacity-100',
                              )}
                            >
                              {item.label}
                              {hasUnread && (
                                <span
                                  className={cn(
                                    'ml-2 inline-flex min-w-[18px] h-[18px] rounded-full text-2xs items-center justify-center font-bold px-1 leading-none',
                                    badgeColor,
                                  )}
                                >
                                  {unread > 99 ? '99+' : unread}
                                </span>
                              )}
                            </span>
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </nav>

      <SidebarBottom collapsed={collapsed} tenantName={tenantName} />
    </aside>
  )
}
