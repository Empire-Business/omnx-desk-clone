import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Outlet, NavLink, Link, useSearchParams, useNavigate } from 'react-router-dom'
import {
  MessageSquare, Columns3, ArrowLeft,
  Contact, Settings2, BarChart3, FileText, Bot,
  X, StickyNote, GripVertical,
} from 'lucide-react'
import { SidebarBottom } from './SidebarBottom'
import { OmnxBrandBand } from './OmnxBrandBand'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useInboxUnreadConversationCount, useRealtimeUnread, useConversations, useContactClientLinks } from '@/hooks/useChat'
import { useMyClientIds } from '@/hooks/useUsers'
import { useLiveMeetingsCount } from '@/hooks/useLiveMeetings'

type ChatNavItem = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  to: string
  roles: string[]
}

/**
 * Menu do Chat.
 *
 * Auditoria de UX (06/08/2026): existem rotas de Chat sem entrada aqui —
 * Relatórios, Conteúdo, Automação, Campanhas, Bots. **Isso é proposital**: o
 * dono do produto decidiu que essas áreas não fazem parte do Chat que se quer
 * manter. Elas seguem alcançáveis por URL enquanto a auditoria de uso não
 * decide o que remover; não voltar ao menu é a decisão, não um esquecimento.
 */
const navItems: ChatNavItem[] = [
  { label: 'Inbox',       icon: MessageSquare, to: '/chat',               roles: [] },
  { label: 'Anotações',   icon: StickyNote,    to: '/chat/anotacoes',     roles: [] },
  { label: 'Kanban',      icon: Columns3,      to: '/chat/kanban',        roles: [] },
  { label: 'Contatos',    icon: Contact,       to: '/chat/contatos',      roles: [] },
  { label: 'Configurações', icon: Settings2,   to: '/chat/config',        roles: ['admin', 'gerente'] },
]

const NAV_ORDER_KEY = 'omnx-chat-nav-order'

function loadNavOrder(items: ChatNavItem[]): ChatNavItem[] {
  try {
    const saved = localStorage.getItem(NAV_ORDER_KEY)
    if (!saved) return items
    const order: string[] = JSON.parse(saved)
    const map = new Map(items.map(i => [i.to, i]))
    const sorted = order.map(to => map.get(to)).filter(Boolean) as ChatNavItem[]
    const newItems = items.filter(i => !order.includes(i.to))
    return [...sorted, ...newItems]
  } catch {
    return items
  }
}

function saveNavOrder(items: ChatNavItem[]) {
  localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(items.map(i => i.to)))
}

// ─── SortableNavItem ──────────────────────────────────────────────────────────

function SortableNavItem({
  item,
  onClick,
  inboxUnreadConvCount,
  liveMeetingsCount,
}: {
  item: ChatNavItem
  onClick?: () => void
  inboxUnreadConvCount: number
  liveMeetingsCount: number
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.to })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className="group/nav relative flex items-center">
      <button
        {...attributes}
        {...listeners}
        className="absolute left-0 flex h-full w-5 cursor-grab items-center justify-center opacity-0 group-hover/nav:opacity-100 transition-opacity active:cursor-grabbing"
        tabIndex={-1}
      >
        <GripVertical className="h-3 w-3 text-sidebar-foreground/40" />
      </button>

      <NavLink
        to={item.to}
        end={item.to === '/chat'}
        onClick={onClick}
        className={({ isActive }) =>
          cn(
            'group relative flex flex-1 items-center gap-[9px] rounded-md text-[13px] min-h-[30px] pl-7 pr-2.5 py-1.5',
            'transition-colors duration-100',
            isActive
              ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/15'
              : 'text-sidebar-foreground/85 font-[450] hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
          )
        }
      >
        {({ isActive }) => (
          <>
            <item.icon
              className={cn(
                'flex-shrink-0 w-[15px] h-[15px] transition-colors',
                isActive ? 'text-primary' : 'text-sidebar-foreground/55 group-hover:text-sidebar-foreground/85',
              )}
            />
            <span className="truncate flex-1">{item.label}</span>
            {item.label === 'Inbox' && inboxUnreadConvCount > 0 && (
              <span className="text-[11px] font-medium text-primary bg-primary/15 px-[5px] rounded-[4px] leading-[1.4] tabular-nums">
                {inboxUnreadConvCount > 99 ? '99+' : inboxUnreadConvCount}
              </span>
            )}
            {item.label === 'Reuniões' && liveMeetingsCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-500/15 text-red-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                AO VIVO
              </span>
            )}
          </>
        )}
      </NavLink>
    </div>
  )
}

// ─── ChatLayout ───────────────────────────────────────────────────────────────

export function ChatLayout() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const inboxUnreadConvCount = useInboxUnreadConversationCount()
  const liveMeetingsCount = useLiveMeetingsCount()

  const { data: myClientIds } = useMyClientIds()
  const { data: conversations = [] } = useConversations()
  const { data: contactClientLinks } = useContactClientLinks()
  const isEstrategista = user?.perfil === 'estrategista' || user?.perfil === 'gerente'
  const isAtendimento = user?.perfil === 'atendimento'

  // Track active conversation from URL to suppress sound for it
  const [searchParams] = useSearchParams()
  const activeConversationId = searchParams.get('id')

  const mutedSetRef = useRef(new Set<string>())
  const allowedSoundRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    mutedSetRef.current.clear()
    for (const c of conversations) {
      if (c.silenciado) mutedSetRef.current.add(c.id)
    }
  }, [conversations])

  useEffect(() => {
    if (isAtendimento) {
      const allowed = new Set<string>()
      for (const c of conversations) {
        if (c.agente_id === user?.id || (!c.agente_id && c.status === 'aberta')) {
          allowed.add(c.id)
        }
      }
      allowedSoundRef.current = allowed
      return
    }

    if (!isEstrategista || !Array.isArray(myClientIds)) {
      allowedSoundRef.current = null
      return
    }
    const allowed = new Set<string>()
    for (const c of conversations) {
      if (c.agente_id === user?.id) { allowed.add(c.id); continue }
      const contactId = c.chat_contacts?.id
      const singleClientId = c.chat_contacts?.client_id
      const fromJunction = contactId ? contactClientLinks?.get(contactId) : undefined
      const clientIds = (fromJunction && fromJunction.length > 0) ? fromJunction : (singleClientId ? [singleClientId] : [])
      if (clientIds.some(cid => myClientIds.includes(cid))) {
        allowed.add(c.id)
      }
    }
    allowedSoundRef.current = allowed
  }, [conversations, isEstrategista, isAtendimento, myClientIds, contactClientLinks, user?.id])

  useRealtimeUnread({ muted: mutedSetRef.current, allowedConversationIds: allowedSoundRef.current, activeConversationId })

  const [orderedItems, setOrderedItems] = useState<ChatNavItem[]>(() => loadNavOrder(navItems))

  const visibleItems = useMemo(() =>
    orderedItems.filter(item =>
      item.roles.length === 0 || item.roles.includes(user?.perfil ?? '')
    ),
    [orderedItems, user?.perfil]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrderedItems(prev => {
      const oldIndex = prev.findIndex(i => i.to === active.id)
      const newIndex = prev.findIndex(i => i.to === over.id)
      const next = arrayMove(prev, oldIndex, newIndex)
      saveNavOrder(next)
      return next
    })
  }, [])

  return (
    <div className="flex h-dvh bg-background overflow-hidden">
      {/* Mobile overlay */}
      {isMobile && mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={cn(
          'flex flex-col h-dvh bg-sidebar border-r border-sidebar-border z-40',
          isMobile
            ? 'fixed left-0 top-0 w-[280px] transition-transform duration-300 ease-in-out'
            : 'w-64 shrink-0',
          isMobile && !mobileNavOpen && '-translate-x-full',
          isMobile && mobileNavOpen && 'translate-x-0',
        )}
      >
        {/* Faixa de marca OMNX */}
        <OmnxBrandBand />

        {/* Workspace card — mesmo padrão do AppSidebar */}
        <div className="px-3 pt-2.5 pb-2">
          <div className="flex items-center gap-2">
            <Link
              to="/"
              title="Voltar ao Dashboard"
              className="flex items-center gap-2 flex-1 min-w-0 rounded-[7px] bg-sidebar-accent/40 hover:bg-sidebar-accent/70 py-[7px] px-[9px] transition-colors text-left"
            >
              <span className="flex-shrink-0 inline-flex items-center justify-center w-[22px] h-[22px]">
                <MessageSquare className="w-4 h-4 text-accent" />
              </span>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[12.5px] font-semibold text-sidebar-foreground leading-tight truncate">OMNXChat</span>
                <span className="text-[10.5px] text-sidebar-foreground/55 leading-tight">Voltar ao Dashboard</span>
              </div>
              <ArrowLeft className="w-3 h-3 text-sidebar-foreground/55 flex-shrink-0" />
            </Link>
            {isMobile && (
              <button
                onClick={() => setMobileNavOpen(false)}
                className="flex-shrink-0 rounded-md p-1.5 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Section header */}
        <div className="px-3 mb-1 mt-3.5">
          <p className="px-2.5 text-[11px] font-semibold text-sidebar-foreground/45 uppercase tracking-[0.04em]">
            OMNXCHAT
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 sidebar-scroll">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleItems.map(i => i.to)} strategy={verticalListSortingStrategy}>
              {visibleItems.map((item) => (
                <SortableNavItem
                  key={item.to}
                  item={item}
                  onClick={() => isMobile && setMobileNavOpen(false)}
                  inboxUnreadConvCount={inboxUnreadConvCount}
                  liveMeetingsCount={liveMeetingsCount}
                />
              ))}
            </SortableContext>
          </DndContext>
        </nav>

        <SidebarBottom tenantName="OMNX Desk" />
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {isMobile && (
          <div className="flex h-12 items-center gap-2 border-b border-border bg-card px-3 shrink-0">
            <button
              onClick={() => navigate('/')}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/20">
                <MessageSquare className="h-3.5 w-3.5 text-accent" />
              </div>
              <span className="text-sm font-semibold text-foreground">OMNXChat</span>
            </div>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
