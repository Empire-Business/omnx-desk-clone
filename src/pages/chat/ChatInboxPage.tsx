import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageSquare, MessageSquarePlus, Search, Filter, X, Plus, Users, Phone, Building, UserCheck, Eye, MessageCircleWarning, UserX, MoreVertical, Archive, ArchiveRestore, BellOff, Bell, CheckSquare, Square, CheckCheck, XCircle, Pin, PinOff } from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'
import { agruparConversas, origensDoGrupo } from '@/lib/chatGroups'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ConversationView } from '@/components/chat/ConversationView'
import { ContactSidePanel } from '@/components/chat/ContactSidePanel'
import { NewConversationDialog } from '@/components/chat/NewConversationDialog'
import { useConversations, useInstances, useDepartments, useUnreadCounts, useMarkMessagesAsRead, useRealtimeUnread, useRealtimeConversations, useFetchProfilePicBatch, useFetchProfilePic, useContactClientLinks, useConversationsByParticipant, useToggleArquivada, useToggleMute, useToggleFixado, useConversationUserPrefs, useCloseConversation } from '@/hooks/useChat'
import { useMyInstanceIds, useMyClientIds, useAssignments, useUsers } from '@/hooks/useUsers'
import { useClientes } from '@/hooks/useClientes'
import { useConversationDraft } from '@/hooks/useConversationDraft'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsMobile, useMediaQuery } from '@/hooks/useMediaQuery'
import { useAvisarConversaAberta } from '@/components/layout/cascaConversas'
import type { ConversationWithContact } from '@/hooks/useChat'

type StatusFilter = 'todas' | 'aberta' | 'em_atendimento' | 'aguardando' | 'encerrada'
type ConversationTypeFilter = 'todas' | 'diretas' | 'grupos'
type ClientScope = 'todos' | 'meus' | 'caixa_geral' | 'novos' | 'caixa' | 'geral'

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Ontem'
  if (days < 7) {
    return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short' })
  }
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function getInitials(name: string | null | undefined, fallback: string) {
  const source = name ?? fallback
  return source.slice(0, 2).toUpperCase()
}

/** Um dos 6 tons de avatar do DS (`.av[data-h]`), estável por nome. */
function tomDoNome(nome: string): number {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) | 0
  return Math.abs(h) % 6
}

// Sets globais: evita múltiplas chamadas e loop de retry para o mesmo contato
const fetchingPicIds = new Set<string>()
const failedPicIds = new Set<string>() // não tenta de novo na mesma sessão

// ─── Conversation Item ───────────────────────────────────────────────────────

interface ConversationItemProps {
  originCount?: number
  conversation: ConversationWithContact
  selected: boolean
  onClick: () => void
  unreadCount?: number
  clientName?: string
  estrategistaName?: string
  showClientInfo?: boolean
  onArchive: () => void
  onMute: () => void
  onTogglePin: () => void
  isArquivada?: boolean
  isFixado?: boolean
  bulkSelected?: boolean
  onBulkToggle?: (e: React.MouseEvent) => void
  onStartSelect?: () => void
}

function ConversationItem({ originCount = 1, conversation, selected, onClick, unreadCount = 0, clientName, estrategistaName, showClientInfo, onArchive, onMute, onTogglePin, isArquivada = false, isFixado = false, bulkSelected, onBulkToggle, onStartSelect }: ConversationItemProps) {
  const contact = conversation.chat_contacts
  const contactName = conversation.is_group
    ? (contact?.nome ?? 'Grupo')
    : (contact?.nome ?? formatPhone(contact?.numero_whatsapp) ?? 'Desconhecido')
  const inst = conversation.whatsapp_instances

  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchPic = useFetchProfilePic()
  const [imgFailed, setImgFailed] = useState(false)

  const handleImgError = () => {
    setImgFailed(true) // mostra iniciais imediatamente
    if (!contact?.id || fetchingPicIds.has(contact.id) || failedPicIds.has(contact.id)) return
    fetchingPicIds.add(contact.id)
    fetchPic.mutate(contact.id, {
      onSettled: () => {
        fetchingPicIds.delete(contact.id)
        failedPicIds.add(contact.id) // não tenta mais nesta sessão
      },
    })
  }

  const openMenu = () => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    // Mantém o menu dentro da tela (auditoria 03: menu de contexto sem limite).
    setMenuPos({
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 220)),
      right: Math.max(8, window.innerWidth - rect.right),
    })
  }

  // Close menu on outside click or scroll
  useEffect(() => {
    if (!menuPos) return
    const close = () => setMenuPos(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [menuPos])

  // Long press (mobile)
  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => openMenu(), 500)
  }
  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  const tooltipDetails: { label: string; value: string; tone?: string }[] = []
  if (conversation.chat_departments) tooltipDetails.push({ label: 'Departamento', value: conversation.chat_departments.nome })
  const assignedName = conversation.users?.nome ?? null
  const strategist = estrategistaName
  if (strategist) {
    tooltipDetails.push({ label: 'Estrategista', value: strategist })
  } else if (showClientInfo && clientName) {
    tooltipDetails.push({ label: 'Estrategista', value: 'Sem estrategista', tone: 'text-warning' })
  }
  if (assignedName) tooltipDetails.push({ label: 'Atendente da conversa', value: assignedName })
  if (showClientInfo && clientName) tooltipDetails.push({ label: 'Cliente', value: clientName })

  const itemMenu = 'flex w-full min-h-11 sm:min-h-9 items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors duration-fast focus-ds'

  const itemContent = (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      aria-label={`${contactName}${unreadCount > 0 ? `, ${unreadCount} ${unreadCount === 1 ? 'não lida' : 'não lidas'}` : ''}`}
      className={cn(
        // Linha da lista (DS .trow): avatar + nome/hora + número/contadores
        'group relative grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 px-3 sm:pl-4 sm:pr-3 py-[11px] text-left cursor-pointer',
        'border-b border-stroke-weak transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]',
        selected
          ? 'bg-card shadow-[inset_0_0_0_1px_var(--primary-muted)]'
          : 'hover:bg-accent',
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return // Enter num botão interno não abre a conversa
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      {/* Marca da selecionada (o "traço do X" do logo, como no DS) */}
      {selected && (
        <span aria-hidden className="absolute left-1 top-3.5 h-3 w-2 bg-[image:var(--brand-x)] [clip-path:polygon(66%_0,100%_0,34%_100%,0_100%)]" />
      )}
      {/* Ponto de não lida */}
      {!selected && unreadCount > 0 && (
        <span aria-hidden className="absolute left-1 top-[18px] h-1.5 w-1.5 rounded-full bg-primary sm:left-1.5" />
      )}

      {/* Avatar (with optional bulk checkbox overlay) */}
      <div className="relative shrink-0">
        {conversation.is_group ? (
          <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-primary-light text-link">
            <Users className="h-5 w-5" aria-hidden />
          </div>
        ) : contact?.foto_url && !imgFailed ? (
          <img
            src={contact.foto_url}
            alt=""
            className="h-10 w-10 sm:h-11 sm:w-11 rounded-full object-cover"
            onError={handleImgError}
          />
        ) : (
          <div className="av !h-10 !w-10 sm:!h-11 sm:!w-11 text-sm" data-h={tomDoNome(contactName)} aria-hidden>
            {getInitials(contact?.nome, formatPhone(contact?.numero_whatsapp) ?? '??')}
          </div>
        )}
        {/* Checkbox overlay — sempre visível em bulk mode */}
        {onBulkToggle && (
          <button
            type="button"
            onClick={onBulkToggle}
            aria-pressed={bulkSelected}
            aria-label={bulkSelected ? `Desmarcar ${contactName}` : `Marcar ${contactName}`}
            className={cn(
              'absolute inset-0 flex items-center justify-center rounded-full transition-[opacity,background-color] duration-fast focus-ds',
              bulkSelected
                ? 'opacity-100 bg-primary/85'
                : 'opacity-50 hover:opacity-90 bg-foreground/35',
            )}
          >
            {bulkSelected
              ? <CheckSquare className="h-5 w-5 text-white" aria-hidden />
              : <Square className="h-5 w-5 text-white" aria-hidden />}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 grid gap-[3px] pt-px group-hover:pr-7 transition-[padding] duration-fast">
        {/* Row 1: Name + Time */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {isFixado && <Pin className="h-3.5 w-3.5 shrink-0 text-link fill-current" aria-label="Fixada" />}
            <p className={cn('truncate text-[15px] sm:text-[14px] text-foreground', unreadCount > 0 ? 'font-[700]' : 'font-[650]')}>
              {contactName}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className={cn(
              'wait',
              unreadCount > 0
                ? '!text-link !font-semibold'
                : conversation.sla_primeira_resposta_violado
                  ? '!text-danger !font-semibold'
                  : '',
            )}>
              {formatRelativeTime(conversation.atualizado_em)}
            </span>
            {conversation.silenciado && (
              <BellOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="Silenciada" />
            )}
          </div>
        </div>

        {/* Row 2: Instância + status + unread */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 text-[12.5px] sm:text-[12px] leading-[18px] text-muted-foreground">
            {conversation.is_group && <span className="tag !h-5 !px-1.5 !text-[11px] shrink-0">Grupo</span>}
            {inst && (
              <span className="flex min-w-0 items-center gap-1 truncate font-medium">
                {inst.cor && <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: inst.cor }} aria-hidden />}
                <span className="truncate">{inst.nome}{originCount > 1 ? ` + ${originCount - 1} origem(ns)` : ''}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {conversation.sla_primeira_resposta_violado && (
              <span className="st st-sm" data-s="atrasado" title="Passou do prazo da primeira resposta">
                <span className="st-g" aria-hidden />Atrasada
              </span>
            )}
            {unreadCount > 0 && (
              <span className="count is-primary" aria-label={`${unreadCount} ${unreadCount === 1 ? 'não lida' : 'não lidas'}`}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
        </div>

      </div>

      {/* Botão 3 pontos */}
      <button
        type="button"
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); menuPos ? setMenuPos(null) : openMenu() }}
        aria-label={`Ações da conversa com ${contactName}`}
        aria-expanded={Boolean(menuPos)}
        className={cn(
          'btn btn-ghost btn-icon btn-sm absolute right-1.5 top-1/2 -translate-y-1/2 !rounded-full bg-card',
          menuPos ? 'opacity-100 !bg-accent' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <MoreVertical aria-hidden />
      </button>

      {/* Dropdown fixo — renderiza acima de tudo */}
      {menuPos && (
        <div
          role="menu"
          className="fixed z-[9999] w-[min(220px,calc(100vw-1rem))] rounded-xl bg-popover shadow-pop ring-hairline py-1 animate-fade-in-up"
          style={{ top: menuPos.top, right: menuPos.right }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {originCount > 1 && <p className="px-3 py-1 text-[12px] text-muted-foreground">Ações nesta conversa: {inst?.nome}</p>}
          <button type="button" role="menuitem" onClick={() => { onTogglePin(); setMenuPos(null) }} className={itemMenu}>
            {isFixado
              ? <><PinOff className="h-4 w-4 text-muted-foreground" aria-hidden /> Desafixar</>
              : <><Pin className="h-4 w-4 text-muted-foreground" aria-hidden /> Fixar no topo</>
            }
          </button>
          {onStartSelect && (
            <button type="button" role="menuitem" onClick={() => { onStartSelect(); setMenuPos(null) }} className={itemMenu}>
              <CheckSquare className="h-4 w-4 text-muted-foreground" aria-hidden /> Selecionar
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => { onArchive(); setMenuPos(null) }} className={itemMenu}>
            {isArquivada
              ? <><ArchiveRestore className="h-4 w-4 text-muted-foreground" aria-hidden /> Desarquivar</>
              : <><Archive className="h-4 w-4 text-muted-foreground" aria-hidden /> Arquivar</>
            }
          </button>
          <button type="button" role="menuitem" onClick={() => { onMute(); setMenuPos(null) }} className={itemMenu}>
            {conversation.silenciado
              ? <><Bell className="h-4 w-4 text-muted-foreground" aria-hidden /> Ativar som</>
              : <><BellOff className="h-4 w-4 text-muted-foreground" aria-hidden /> Silenciar</>
            }
          </button>
        </div>
      )}
    </div>
  )

  if (tooltipDetails.length === 0) return itemContent

  return (
    <Tooltip>
      <TooltipTrigger asChild>{itemContent}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        <div className="flex flex-col gap-1">
          {tooltipDetails.map(d => (
            <div key={d.label} className="flex items-baseline gap-1.5">
              <span className="text-[11.5px] font-semibold text-muted-foreground shrink-0">{d.label}:</span>
              <span className={cn('font-medium', d.tone ?? 'text-foreground')}>{d.value}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ChatInboxPage() {
  const isMobile = useIsMobile()
  // DS (09 · Layout): três colunas a partir de 1280 px.
  const isWide = useMediaQuery('(min-width: 1280px)')
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showArquivadas, setShowArquivadas] = useState(false)

  // ── Bulk selection ──────────────────────────────────────────────────────────
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const bulkMode = bulkSelected.size > 0
  const closeConversation = useCloseConversation()

  const toggleBulk = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setBulkSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const clearBulk = useCallback(() => setBulkSelected(new Set()), [])

  async function handleBulkClose() {
    await Promise.all([...bulkSelected].map(id => closeConversation.mutateAsync(id)))
    clearBulk()
  }

  async function handleBulkArchive() {
    await Promise.all([...bulkSelected].map(id =>
      toggleArquivada.mutateAsync({ id, arquivada: userPrefsMap.get(id) ?? false })
    ))
    clearBulk()
  }

  async function handleBulkMarkRead() {
    await Promise.all([...bulkSelected].map(id => markReadMutation.mutateAsync(id)))
    clearBulk()
  }

  async function handleBulkMute() {
    const selectedConvs = conversations.filter(c => bulkSelected.has(c.id))
    const anyUnmuted = selectedConvs.some(c => !c.silenciado)
    await Promise.all(selectedConvs.map(c =>
      toggleMute.mutateAsync({ id: c.id, silenciado: anyUnmuted ? false : true })
    ))
    clearBulk()
  }

  // Instance-filtered unread counts + mark-read
  const { data: myInstanceIds } = useMyInstanceIds()
  const { data: unreadCounts = {} } = useUnreadCounts(myInstanceIds)
  const markReadMutation = useMarkMessagesAsRead()
  const toggleArquivada = useToggleArquivada()
  const toggleMute = useToggleMute()
  const toggleFixado = useToggleFixado()
  const { data: userPrefs = [] } = useConversationUserPrefs()
  const userPrefsMap = useMemo(() => new Map(userPrefs.map(p => [p.conversation_id, p.arquivada])), [userPrefs])
  const fixadoSet = useMemo(() => new Set(userPrefs.filter(p => p.fixado).map(p => p.conversation_id)), [userPrefs])

  // Build muted set for sound suppression (populated after conversations load below)
  const mutedSetRef = useRef(new Set<string>())

  // Realtime listener for conversation changes (assignment, status, new convs)
  // Sound is handled globally in ChatLayout
  useRealtimeUnread({ muted: mutedSetRef.current, disableSound: true })
  useRealtimeConversations()

  // Mark messages as read when selecting a conversation
  const handleSelectConversation = useCallback((id: string) => {
    setSelectedId(id)
    if (unreadCounts[id]) {
      markReadMutation.mutate(id)
    }
  }, [unreadCounts, markReadMutation])

  // Mobile: go back to list
  const handleBackToList = useCallback(() => {
    setSelectedId(null)
    setContactPanelOpen(false)
  }, [])

  // Pre-fill search or open new conversation from query params
  const [newConvInitialNome, setNewConvInitialNome] = useState('')
  const [newConvInitialWhatsapp, setNewConvInitialWhatsapp] = useState('')
  const [newConvInitialMensagem, setNewConvInitialMensagem] = useState('')
  const [pendingContactId, setPendingContactId] = useState<string | null>(null)
  const [pendingFallback, setPendingFallback] = useState<{ nome: string; whatsapp: string } | null>(null)

  useEffect(() => {
    const clienteName = searchParams.get('cliente')
    const novaConversa = searchParams.get('novaConversa')
    const qNome = searchParams.get('nome')
    const qWhatsapp = searchParams.get('whatsapp')
    const qContato = searchParams.get('contato')
    // `?id=<conversa>`: link da notificação push ("/chat?id=…" redireciona para cá com a query).
    const qId = searchParams.get('id')

    if (qId) {
      setSelectedId(qId)
      searchParams.delete('id')
      setSearchParams(searchParams, { replace: true })
    } else if (qContato) {
      // Vai tentar abrir conversa existente desse contato; se não houver, abre dialog
      setPendingContactId(qContato)
      if (qWhatsapp) setPendingFallback({ nome: qNome ?? '', whatsapp: qWhatsapp })
      searchParams.delete('contato')
      searchParams.delete('nome')
      searchParams.delete('whatsapp')
      setSearchParams(searchParams, { replace: true })
    } else if (novaConversa && qWhatsapp) {
      // Open new conversation dialog pre-filled
      setNewConvInitialNome(qNome ?? '')
      setNewConvInitialWhatsapp(qWhatsapp)
      setNewConvInitialMensagem(searchParams.get('mensagem') ?? '')
      setNewConvOpen(true)
      searchParams.delete('novaConversa')
      searchParams.delete('nome')
      searchParams.delete('whatsapp')
      searchParams.delete('mensagem')
      setSearchParams(searchParams, { replace: true })
    } else if (clienteName) {
      setSearch(clienteName)
      searchParams.delete('cliente')
      setSearchParams(searchParams, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas')
  const [naoAtribuida, setNaoAtribuida] = useState(false)
  const [apenasNaoLidas, setApenasNaoLidas] = useState(false)
  const [apenasNaoRespondidas, setApenasNaoRespondidas] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [instanceFilter, setInstanceFilter] = useState<string>(() => searchParams.get('instancia') ?? '')
  const [departmentFilter, setDepartmentFilter] = useState<string>('')
  const [agenteFilter, setAgenteFilter] = useState<string>('')
  const [contactPanelOpen, setContactPanelOpen] = useState(false)
  const [newConvOpen, setNewConvOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<ConversationTypeFilter>('todas')
  // Estrategista defaults to "meus" (no "todos" tab for them)
  const [clientScope, setClientScope] = useState<ClientScope>('todos') // updated below via effect

  // Data queries — filter by user's allowed instances and clients
  const { user } = useAuth()
  const draftIdentity = `${user?.tenant_id ?? ''}:${user?.id ?? ''}`
  const [draftText, setDraftText] = useConversationDraft(draftIdentity, selectedId)
  const { can } = usePermissoes()
  const { data: myClientIds } = useMyClientIds()
  const { data: instances = [] } = useInstances(myInstanceIds)
  const { data: departments = [] } = useDepartments()
  const { data: clientsList = [] } = useClientes()
  const { data: allAssignments = [] } = useAssignments()
  const { data: contactClientLinks } = useContactClientLinks()
  const { data: allUsers = [] } = useUsers()

  // Lookup maps for client name and estrategista
  const clientNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of clientsList) map.set(c.id, c.nome)
    return map
  }, [clientsList])

  const clientEstrategistaMap = useMemo(() => {
    const map = new Map<string, { nome: string; id: string }>()
    for (const a of allAssignments) {
      if (a.tipo === 'estrategista' && a.users) {
        map.set(a.client_id, { nome: a.users.nome, id: a.user_id })
      }
    }
    return map
  }, [allAssignments])

  // Helper: get all client IDs linked to a contact (supports groups with multiple clients)
  const getContactClientIds = useCallback((contactId: string | undefined, singleClientId: string | null | undefined): string[] => {
    if (!contactId) return singleClientId ? [singleClientId] : []
    const fromJunction = contactClientLinks?.get(contactId)
    if (fromJunction && fromJunction.length > 0) return fromJunction
    return singleClientId ? [singleClientId] : []
  }, [contactClientLinks])

  const PERFIL_LABELS: Record<string, string> = {
    admin: 'Admin', gerente: 'Gerente', agente: 'Agente',
    estrategista: 'Estrategista', atendimento: 'Atendimento',
  }
  const teamMembers = useMemo(() =>
    allUsers.filter(u => u.ativo && u.perfil !== 'cliente').sort((a, b) => a.nome.localeCompare(b.nome)),
    [allUsers],
  )

  const isEstrategista = user?.perfil === 'estrategista'
  const isAtendimento = user?.perfil === 'atendimento'
  // Ver todas as conversas (e o filtro por agente) é regra editável em /admin.
  // Separada de `clientes.carteira` porque atendimento vê todos os clientes,
  // mas não todas as conversas.
  const isAdminOrGerente = can('chat.carteira', 'ver')
  const isGerente = user?.perfil === 'gerente'
  const showScopeTabs = isEstrategista || isAdminOrGerente || isAtendimento

  // IDs de usuários com perfil atendimento (para filtro da Caixa)
  const atendimentoUserIds = useMemo(() =>
    new Set(allUsers.filter(u => u.perfil === 'atendimento').map(u => u.id)),
    [allUsers],
  )

  // Departamentos gerenciados pelo gerente (para incluir em "Meus clientes")
  const myManagedDeptIds = useMemo(() => {
    if (!isGerente || !user?.id) return new Set<string>()
    return new Set(departments.filter(d => d.gerente_id === user.id).map(d => d.id))
  }, [departments, isGerente, user?.id])

  // Define o escopo padrão conforme o perfil — UMA única vez, quando o perfil resolve.
  // Depois disso, a escolha de aba do usuário (ex.: atendimento abrir "Todos") é respeitada
  // e não é mais sobrescrita por re-renders/refetch do perfil.
  const defaultScopeAplicadoRef = useRef(false)
  useEffect(() => {
    if (defaultScopeAplicadoRef.current) return
    if (!user?.perfil) return // espera o perfil carregar
    defaultScopeAplicadoRef.current = true
    if (isEstrategista || isGerente) {
      setClientScope('meus')
    } else if (isAtendimento) {
      setClientScope('caixa')
    }
  }, [user?.perfil, isEstrategista, isGerente, isAtendimento])

  const queryFilter: { status?: string; department_id?: string; instance_ids?: string[] | null; current_user_id?: string | null; sem_agente?: boolean; incluir_grupos_ocultos?: boolean } = {}
  if (statusFilter !== 'todas') queryFilter.status = statusFilter
  if (naoAtribuida) queryFilter.sem_agente = true
  if (departmentFilter) queryFilter.department_id = departmentFilter
  // Pass instance filter for non-admin users
  if (Array.isArray(myInstanceIds)) {
    queryFilter.instance_ids = myInstanceIds
    // Also pass current user id so conversations assigned to them always appear
    queryFilter.current_user_id = user?.id ?? null
  }
  // Na aba "Todos", exibe também os grupos de instâncias com ocultar_grupos
  // (ex.: para enviar um aviso a todos os grupos de clientes).
  if (clientScope === 'todos') queryFilter.incluir_grupos_ocultos = true

  const { data: conversations = [], isLoading } = useConversations(
    Object.keys(queryFilter).length > 0 ? queryFilter : undefined,
  )
  const { data: participantConvIds } = useConversationsByParticipant(agenteFilter || undefined)

  // Update muted set for sound suppression
  useEffect(() => {
    mutedSetRef.current.clear()
    for (const c of conversations) {
      if (c.silenciado) mutedSetRef.current.add(c.id)
    }
  }, [conversations])

  // Resolve pendingContactId — abre conversa existente desse contato, ou cai pro dialog de nova conversa
  useEffect(() => {
    if (!pendingContactId) return
    if (isLoading) return // espera conversas carregarem
    const found = conversations.find(c => c.contact_id === pendingContactId)
    if (found) {
      setSelectedId(found.id)
      setPendingContactId(null)
      setPendingFallback(null)
    } else if (pendingFallback) {
      setNewConvInitialNome(pendingFallback.nome)
      setNewConvInitialWhatsapp(pendingFallback.whatsapp)
      setNewConvOpen(true)
      setPendingContactId(null)
      setPendingFallback(null)
    }
  }, [pendingContactId, conversations, isLoading, pendingFallback])

  // Auto-fetch profile pictures for contacts without photos
  const fetchPicBatch = useFetchProfilePicBatch()
  const fetchedRef = useRef(false)
  useEffect(() => {
    if (fetchedRef.current || conversations.length === 0 || fetchPicBatch.isPending) return
    const contactsWithoutPhoto = conversations
      .filter(c => c.chat_contacts && !c.chat_contacts.foto_url && c.chat_contacts.id)
      .map(c => c.chat_contacts!.id)
      .slice(0, 30)
    if (contactsWithoutPhoto.length > 0) {
      fetchedRef.current = true
      fetchPicBatch.mutate(contactsWithoutPhoto)
    }
  }, [conversations]) // eslint-disable-line react-hooks/exhaustive-deps

  // Client-side filtering (search + instance + type + client scope)
  const filtered = useMemo(() => {
    let result = conversations

    // Arquivadas: por usuário (via chat_conversation_user_prefs)
    result = result.filter(c => {
      const isArquivada = userPrefsMap.get(c.id) ?? false
      return showArquivadas ? isArquivada : !isArquivada
    })

    // Client scope filter — ignorado quando há busca ativa (busca em todas as conversas)
    const hasSearch = search.trim().length > 0
    if (!hasSearch && clientScope === 'caixa') {
      // Atendimento: "Caixa" = sem agente OU atribuída a atendimento + sem departamento + sem estrategista vinculado
      result = result.filter((c) => {
        if (c.agente_id && !atendimentoUserIds.has(c.agente_id)) return false
        if (c.status === 'encerrada') return false
        if (c.department_id) return false // encaminhada para departamento → saiu da caixa
        const clientIds = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
        if (clientIds.length === 0) return true
        return !clientIds.some(cid => clientEstrategistaMap.has(cid) )
      })
    } else if (!hasSearch && clientScope === 'meus') {
      if (isAtendimento) {
        // Atendimento: "Meus" = conversations assigned to me
        result = result.filter((c) => c.agente_id === user?.id)
      } else if (Array.isArray(myClientIds)) {
        // Estrategista/Gerente: "Meus" = my assigned clients OR managed dept (without other estrategista)
        result = result.filter((c) => {
          if (c.agente_id === user?.id) return true
          const clientIds = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
          // "tem outro estrategista" = client tem estrategista atribuído que NÃO é o usuário atual
          const hasOtherEstrategista = clientIds.some(cid => {
            const entry = clientEstrategistaMap.get(cid)
            return entry != null && entry.id !== user?.id
          }) || (c.agente_id != null && c.agente_id !== user?.id && (c.users as { perfil?: string } | null)?.perfil === 'estrategista')
          // Gerente: conversas no departamento gerenciado só enquanto sem outro estrategista
          if (isGerente && c.department_id && myManagedDeptIds.has(c.department_id)) {
            return !hasOtherEstrategista
          }
          if (hasOtherEstrategista) return false
          return clientIds.some(cid => myClientIds.includes(cid))
        })
      }
    } else if (!hasSearch && clientScope === 'geral') {
      // Gerente: "Geral" = tem cliente vinculado OU agente já é estrategista
      result = result.filter((c) => {
        if ((c.users as { perfil?: string } | null)?.perfil === 'estrategista') return true
        const clientIds = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
        return clientIds.length > 0
      })
    } else if (!hasSearch && clientScope === 'caixa_geral') {
      result = result.filter((c) => {
        const clientIds = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
        return clientIds.length === 0
      })
    }

    if (typeFilter === 'grupos') {
      result = result.filter((c) => c.is_group)
    } else if (typeFilter === 'diretas') {
      result = result.filter((c) => !c.is_group)
    }

    if (instanceFilter) {
      result = result.filter((c) => c.instance_id === instanceFilter)
    }

    if (apenasNaoLidas) {
      result = result.filter((c) => (unreadCounts[c.id] || 0) > 0)
    }

    if (apenasNaoRespondidas) {
      result = result.filter((c) => c.aguardando_resposta && c.status !== 'encerrada')
    }

    if (agenteFilter && participantConvIds) {
      result = result.filter((c) => participantConvIds.has(c.id))
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((c) => {
        const name = c.chat_contacts?.nome?.toLowerCase() ?? ''
        const phone = c.chat_contacts?.numero_whatsapp?.toLowerCase() ?? ''
        const proto = c.protocolo.toLowerCase()
        const dept = c.chat_departments?.nome?.toLowerCase() ?? ''
        return name.includes(q) || phone.includes(q) || proto.includes(q) || dept.includes(q)
      })
    }

    // Fixadas no topo (mantém a ordem por última atualização dentro de cada grupo — sort estável)
    result = [...result].sort((a, b) => Number(fixadoSet.has(b.id)) - Number(fixadoSet.has(a.id)))

    return result
  }, [conversations, search, instanceFilter, typeFilter, apenasNaoLidas, apenasNaoRespondidas, unreadCounts, clientScope, myClientIds, getContactClientIds, agenteFilter, participantConvIds, isGerente, myManagedDeptIds, showArquivadas, fixadoSet, userPrefsMap, user?.id, isAtendimento, atendimentoUserIds, clientEstrategistaMap])

  // Counts for scope tabs (using junction table for multi-client support)
  const caixaGeralCount = useMemo(() =>
    agruparConversas(conversations.filter(c => {
      const clientIds = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
      return clientIds.length === 0
    })).length,
    [conversations, getContactClientIds],
  )
  const meusClientesConvCount = useMemo(() => {
    if (!Array.isArray(myClientIds)) return 0
    return agruparConversas(conversations.filter(c => {
      if (c.agente_id === user?.id) return true
      const clientIds = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
      const hasOtherEstrategista = clientIds.some(cid => {
        const entry = clientEstrategistaMap.get(cid)
        return entry != null && entry.id !== user?.id
      }) || (c.agente_id != null && c.agente_id !== user?.id && (c.users as { perfil?: string } | null)?.perfil === 'estrategista')
      if (isGerente && c.department_id && myManagedDeptIds.has(c.department_id)) return !hasOtherEstrategista
      if (hasOtherEstrategista) return false
      return clientIds.some(cid => myClientIds.includes(cid))
    })).length
  }, [conversations, myClientIds, getContactClientIds, user?.id, isGerente, myManagedDeptIds, clientEstrategistaMap])

  const geralConvCount = useMemo(() => {
    if (!isGerente) return 0
    return agruparConversas(conversations.filter(c => {
      if ((c.users as { perfil?: string } | null)?.perfil === 'estrategista') return true
      const clientIds = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
      return clientIds.length > 0
    })).length
  }, [conversations, isGerente, getContactClientIds])

  // Atendimento counts
  const caixaAtendimentoCount = useMemo(() => {
    if (!isAtendimento) return 0
    return agruparConversas(conversations.filter(c => {
      if (c.agente_id && !atendimentoUserIds.has(c.agente_id)) return false
      if (c.status === 'encerrada') return false
      if (c.department_id) return false
      const clientIds = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
      if (clientIds.length === 0) return true
      return !clientIds.some(cid => clientEstrategistaMap.has(cid))
    })).length
  }, [conversations, isAtendimento, atendimentoUserIds, getContactClientIds, clientEstrategistaMap])

  // Clients without any conversation in chat (for "Meus Clientes" tab)
  const clientsWithoutConversation = useMemo(() => {
    if (clientScope !== 'meus' || !Array.isArray(myClientIds)) return []

    // Collect all client IDs that appear in conversations
    const clientIdsWithConv = new Set<string>()
    for (const c of conversations) {
      const ids = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
      for (const id of ids) clientIdsWithConv.add(id)
    }

    // Filter: my clients that have NO conversation
    const result = clientsList.filter(cl =>
      myClientIds.includes(cl.id) && !clientIdsWithConv.has(cl.id)
    )

    // Apply search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      return result.filter(cl =>
        cl.nome.toLowerCase().includes(q) ||
        cl.telefone?.toLowerCase().includes(q) ||
        cl.whatsapp?.toLowerCase().includes(q) ||
        cl.email?.toLowerCase().includes(q)
      )
    }

    return result
  }, [clientScope, myClientIds, conversations, clientsList, search, getContactClientIds])

  const hasActiveFilters = instanceFilter || departmentFilter || agenteFilter
  const selectedConversation = conversations.find((c) => c.id === selectedId)
  const groupedFiltered = useMemo(() => agruparConversas(filtered), [filtered])
  const selectedOrigins = useMemo(() => origensDoGrupo(selectedConversation,
    instanceFilter ? conversations.filter(c => c.instance_id === instanceFilter || c.id === selectedId) : conversations),
  [selectedConversation, conversations, instanceFilter, selectedId])

  function clearFilters() {
    setInstanceFilter('')
    setDepartmentFilter('')
    setAgenteFilter('')
  }

  // Celular: lista → conversa → detalhes (uma etapa por vez, nada se perde).
  // Computador ≥ 1280 px: três colunas (lista · conversa · detalhes do contato).
  // Entre 768 e 1279 px: lista + conversa; os detalhes abrem num painel por cima.
  const showList = !isMobile || !selectedId
  const showConversation = !isMobile || !!selectedId

  // Celular com conversa aberta: a casca esconde a barra inferior (volta ao
  // tocar em "voltar" ou ao sair da tela).
  useAvisarConversaAberta(isMobile && !!selectedId)

  // Painel por cima (tablet/celular): Esc fecha.
  useEffect(() => {
    if (!contactPanelOpen || isWide) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setContactPanelOpen(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [contactPanelOpen, isWide])

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ── Left panel — Conversation list ────────────────────────────── */}
      <div
        className={cn(
          'flex min-h-0 flex-col border-r border-border bg-card',
          isMobile
            ? showList ? 'w-full' : 'hidden'
            : 'w-[320px] shrink-0 lg:w-[340px] xl:w-[372px] 2xl:w-[400px]',
        )}
      >
        {/* Header */}
        {bulkMode ? (
          <div className="flex min-h-14 items-center gap-1 px-2 py-1.5 border-b border-border bg-primary-light animate-band-in">
            <button type="button" onClick={clearBulk} className="btn btn-ghost btn-icon shrink-0" title="Cancelar seleção" aria-label="Cancelar seleção">
              <XCircle aria-hidden />
            </button>
            <span className="flex-1 text-sm font-semibold text-foreground min-w-0 truncate" aria-live="polite">
              {bulkSelected.size} selecionada{bulkSelected.size > 1 ? 's' : ''}
            </span>
            <button type="button" onClick={handleBulkMarkRead} disabled={markReadMutation.isPending} className="btn btn-ghost btn-icon shrink-0" title="Marcar como lidas" aria-label="Marcar como lidas">
              <CheckCheck aria-hidden />
            </button>
            <button type="button" onClick={handleBulkArchive} disabled={toggleArquivada.isPending} className="btn btn-ghost btn-icon shrink-0" title="Arquivar" aria-label="Arquivar">
              <Archive aria-hidden />
            </button>
            <button type="button" onClick={handleBulkMute} disabled={toggleMute.isPending} className="btn btn-ghost btn-icon shrink-0" title="Silenciar" aria-label="Silenciar">
              <BellOff aria-hidden />
            </button>
            <button type="button" onClick={handleBulkClose} disabled={closeConversation.isPending} className="btn btn-ghost btn-icon shrink-0 !text-danger hover:!bg-danger-light" title="Encerrar" aria-label="Encerrar conversas selecionadas">
              <XCircle aria-hidden />
            </button>
          </div>
        ) : (
          <div className="flex min-h-14 items-center gap-2 px-3 sm:px-4 py-2 border-b border-border">
            <h1 className="m-0 font-display text-[20px] sm:text-[18px] font-[750] leading-tight tracking-[-0.015em] [font-stretch:108%] text-foreground">Conversas</h1>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowFilters((p) => !p)}
                aria-pressed={showFilters}
                className={cn('btn btn-ghost btn-icon relative', (showFilters || hasActiveFilters) && 'bg-primary-light text-link')}
                title="Mais filtros"
                aria-label="Mais filtros"
              >
                <Filter aria-hidden />
                {hasActiveFilters && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />}
              </button>
              <button
                type="button"
                onClick={() => setNewConvOpen(true)}
                className="btn btn-primary"
                title="Nova conversa"
              >
                <Plus aria-hidden />
                <span className="max-[380px]:sr-only">Nova</span>
              </button>
            </div>
          </div>
        )}

        {/* Active instance indicator */}
        {instances.length > 0 && (
          <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 border-b border-stroke-weak bg-bg-0">
            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
            {instances.length === 1 ? (
              <span className="min-w-0 text-[12.5px] text-muted-foreground truncate">
                <span className="font-medium text-foreground">{instances[0].nome}</span>
                {instances[0].numero_whatsapp && (
                  <span className="mono ml-1">{formatPhone(instances[0].numero_whatsapp)}</span>
                )}
              </span>
            ) : (
              <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">
                {instanceFilter
                  ? <><span className="font-medium text-foreground">{instances.find(i => i.id === instanceFilter)?.nome}</span> <span className="mono">{formatPhone(instances.find(i => i.id === instanceFilter)?.numero_whatsapp)}</span></>
                  : <span>{instances.length} números disponíveis</span>
                }
              </span>
            )}
          </div>
        )}

        {/* Client scope tabs */}
        {showScopeTabs && (
          <div className="seg !flex mx-3 mt-2.5 !w-auto" role="group" aria-label="Quais conversas mostrar">
            {(isAtendimento
              ? [
                  { value: 'caixa' as const, label: 'Caixa', count: caixaAtendimentoCount },
                  { value: 'todos' as const, label: 'Todos', count: 0 },
                ]
              : isGerente
              ? [
                  { value: 'meus' as const, label: 'Meus clientes', count: meusClientesConvCount },
                  { value: 'geral' as const, label: 'Geral', count: geralConvCount },
                  { value: 'todos' as const, label: 'Todos', count: 0 },
                ]
              : [
                  ...(!isEstrategista ? [{ value: 'todos' as const, label: 'Todos', count: 0 }] : []),
                  ...(isEstrategista ? [{ value: 'meus' as const, label: 'Meus clientes', count: meusClientesConvCount }] : []),
                  { value: 'caixa_geral' as const, label: 'Caixa Geral', count: caixaGeralCount },
                ]
            ).map((f) => (
              <button
                type="button"
                key={f.value}
                onClick={() => setClientScope(f.value)}
                aria-pressed={clientScope === f.value}
                className="!flex-1 justify-center min-w-0 max-sm:!h-9"
              >
                {f.value === 'meus' && <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                {f.value === 'caixa' && <MessageSquarePlus className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                {f.value === 'geral' && <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                {f.value === 'caixa_geral' && <Building className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                <span className="truncate">{f.label}</span>
                {f.count > 0 && (
                  <span className={cn('count', clientScope === f.value && 'is-primary')}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Search bar */}
        <div className="px-3 pt-2.5 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              placeholder="Buscar nome, telefone, protocolo…"
              aria-label="Buscar conversas"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input !pl-9 !pr-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="btn btn-ghost btn-icon btn-sm absolute right-0.5 top-1/2 -translate-y-1/2"
                aria-label="Limpar busca"
              >
                <X aria-hidden />
              </button>
            )}
          </div>
        </div>

        {/* Type tabs + Status select */}
        <div className="flex items-end gap-2 border-b border-border px-1.5">
          {/* Type tabs */}
          <div className="tabs flex-1 !border-b-0" role="tablist" aria-label="Tipo de conversa">
            {([
              { value: 'todas' as const, label: 'Todas' },
              { value: 'diretas' as const, label: 'Diretas' },
              { value: 'grupos' as const, label: 'Grupos' },
            ]).map((f) => (
              <button
                type="button"
                role="tab"
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                aria-selected={typeFilter === f.value}
                className="tab"
              >
                {f.value === 'grupos' && <Users aria-hidden />}
                {f.label}
              </button>
            ))}
          </div>
          {/* Status dropdown — compact, replaces 5 pills */}
          <div className="shrink-0 pb-1.5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Situação da conversa"
              className={cn(
                'select !h-8 !w-auto !py-0 !pl-2.5 !pr-8 !text-[12.5px] font-medium max-sm:!h-10 max-sm:!text-base',
                statusFilter !== 'todas' && '!border-primary !text-link',
              )}
            >
              <option value="todas">Todos status</option>
              <option value="aberta">Abertas</option>
              <option value="em_atendimento">Atendendo</option>
              <option value="aguardando">Aguardando</option>
              <option value="encerrada">Encerradas</option>
            </select>
          </div>
        </div>

        {/* Toggle filters — stackable, one line */}
        {/* Filtros rápidos (chips do DS): rolam de lado no celular, sem quebrar */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-3 py-2 border-b border-stroke-weak" role="group" aria-label="Filtros rápidos">
          {/* Não respondidas */}
          <button
            type="button"
            onClick={() => setApenasNaoRespondidas(v => !v)}
            aria-pressed={apenasNaoRespondidas}
            title="Aguardando resposta da equipe"
            className="chip shrink-0 focus-ds"
          >
            <MessageCircleWarning className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Aguardando
            {(() => {
              const count = conversations.filter(c => c.aguardando_resposta && c.status !== 'encerrada').length
              return count > 0 ? <span className="count is-danger">{count}</span> : null
            })()}
          </button>

          {/* Não lidas */}
          <button
            type="button"
            onClick={() => setApenasNaoLidas(v => !v)}
            aria-pressed={apenasNaoLidas}
            title="Mensagens não lidas"
            className="chip shrink-0 focus-ds"
          >
            <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Não lidas
            {(() => {
              const count = Object.values(unreadCounts).filter(v => v > 0).length
              return count > 0 ? <span className="count is-primary">{count}</span> : null
            })()}
          </button>

          {/* Sem agente */}
          <button
            type="button"
            onClick={() => setNaoAtribuida(v => !v)}
            aria-pressed={naoAtribuida}
            title="Conversas sem estrategista atribuído"
            className="chip shrink-0 focus-ds"
          >
            <UserX className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Sem estrategista
          </button>

        </div>

        {/* Advanced filters (collapsible) */}
        {showFilters && (
          <div className="border-b border-border px-3 py-3 space-y-2 bg-bg-0 animate-band-in">
            <div className="flex items-center justify-between">
              <span className="t-h6">
                Mais filtros
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="btn btn-ghost btn-sm text-link"
                >
                  <X aria-hidden />
                  Limpar
                </button>
              )}
            </div>
            <select
              value={instanceFilter}
              onChange={(e) => setInstanceFilter(e.target.value)}
              aria-label="Número de WhatsApp"
              className="select"
            >
              <option value="">Todos os números</option>
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.nome}</option>
              ))}
            </select>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              aria-label="Fila"
              className="select"
            >
              <option value="">Todas as filas</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.nome}</option>
              ))}
            </select>
            {isAdminOrGerente && (
              <select
                value={agenteFilter}
                onChange={(e) => setAgenteFilter(e.target.value)}
                aria-label="Pessoa da equipe"
                className="select"
              >
                <option value="">Toda a equipe</option>
                {teamMembers.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome} — {PERFIL_LABELS[u.perfil] ?? u.perfil}</option>
                ))}
              </select>
            )}
            {/* Toggle arquivadas */}
            <button
              type="button"
              onClick={() => setShowArquivadas(v => !v)}
              aria-pressed={showArquivadas}
              className={cn('btn btn-secondary w-full justify-start', showArquivadas && '!border-primary !bg-primary-light !text-link')}
            >
              <Archive aria-hidden />
              {showArquivadas ? 'Mostrando arquivadas' : 'Ver arquivadas'}
            </button>
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain wpp-scroll">
          {isLoading ? (
            <div aria-busy="true" aria-label="Carregando conversas">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3 sm:px-4 py-[11px] border-b border-stroke-weak">
                  <div className="sk h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-full" />
                  <div className="grid flex-1 gap-2 pt-1">
                    <div className="flex justify-between gap-3"><div className="sk h-3.5 w-[55%]" /><div className="sk h-3 w-10" /></div>
                    <div className="sk h-3 w-[40%]" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 && clientsWithoutConversation.length === 0 ? (
            <EmptyState
              compact
              bare
              icon={search ? Search : MessageSquare}
              title={search ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa por aqui'}
              description={search
                ? 'Confira o que foi digitado ou busque pelo telefone.'
                : 'Quando um cliente escrever no WhatsApp, a conversa aparece nesta lista.'}
              action={search
                ? <button type="button" className="btn btn-secondary" onClick={() => setSearch('')}>Limpar busca</button>
                : <button type="button" className="btn btn-primary" onClick={() => setNewConvOpen(true)}><Plus aria-hidden />Nova conversa</button>}
            />
          ) : (
            <>
              {groupedFiltered.map((origins) => {
                const c = origins.find(origin => origin.id === selectedId) ?? origins[0]
                return (
                <ConversationItem
                  key={c.id}
                  conversation={c}
                  originCount={origins.length}
                  selected={selectedId === c.id}
                  onClick={() => { if (bulkMode) { toggleBulk(c.id, { stopPropagation: () => {} } as React.MouseEvent); return } handleSelectConversation(c.id) }}
                  unreadCount={origins.reduce((total, origin) => total + (unreadCounts[origin.id] || 0), 0)}
                  clientName={(() => {
                    const ids = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
                    if (ids.length === 0) return undefined
                    const names = ids.map(id => clientNameMap.get(id)).filter(Boolean)
                    return names.length > 0 ? names.join(', ') : undefined
                  })()}
                  estrategistaName={(() => {
                    const ids = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
                    if (ids.length === 0) return undefined
                    const names = [...new Set(ids.map(id => clientEstrategistaMap.get(id)?.nome).filter(Boolean))]
                    return names.length > 0 ? names.join(', ') : undefined
                  })()}
                  showClientInfo={isAdminOrGerente}
                  isArquivada={userPrefsMap.get(c.id) ?? false}
                  isFixado={fixadoSet.has(c.id)}
                  onArchive={() => toggleArquivada.mutate({ id: c.id, arquivada: userPrefsMap.get(c.id) ?? false })}
                  onMute={() => toggleMute.mutate({ id: c.id, silenciado: c.silenciado })}
                  onTogglePin={() => toggleFixado.mutate({ id: c.id, fixado: fixadoSet.has(c.id) })}
                  bulkSelected={bulkSelected.has(c.id)}
                  onBulkToggle={bulkMode ? (e) => toggleBulk(c.id, e) : undefined}
                  onStartSelect={() => {
                    setBulkSelected(new Set([c.id]))
                  }}
                />
              )})}

              {/* Clients without conversation (only in "Meus Clientes" scope) */}
              {clientsWithoutConversation.length > 0 && (
                <>
                  <div className="t-h6 flex items-center gap-2 px-4 py-2 border-b border-stroke-weak bg-bg-0">
                    <Building className="h-3.5 w-3.5" aria-hidden />
                    Clientes sem conversa
                    <span className="count">{clientsWithoutConversation.length}</span>
                  </div>
                  {clientsWithoutConversation.map((cl) => (
                    <button
                      type="button"
                      key={cl.id}
                      onClick={() => {
                        setNewConvInitialNome(cl.nome)
                        setNewConvInitialWhatsapp(cl.whatsapp ?? cl.telefone ?? '')
                        setNewConvOpen(true)
                      }}
                      title="Começar conversa"
                      className="w-full flex items-start gap-2.5 px-3 sm:px-4 py-[11px] text-left transition-colors duration-fast hover:bg-accent border-b border-stroke-weak focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]"
                    >
                      <div className="av none !h-10 !w-10 sm:!h-11 sm:!w-11" aria-hidden>
                        <Building className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1 pt-px">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[15px] sm:text-[14px] font-[650] text-fg-2">
                            {cl.nome}
                          </p>
                          <MessageSquarePlus className="h-4 w-4 text-link shrink-0" aria-hidden />
                        </div>
                        <p className="truncate text-[12.5px] sm:text-[12px] text-muted-foreground mt-0.5">
                          {cl.whatsapp ?? cl.telefone ?? cl.email ?? 'Sem contato'}
                          {cl.segmento && (
                            <span className="ml-1">· {cl.segmento}</span>
                          )}
                        </p>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Center panel — Chat view ──────────────────────────────────── */}
      <div
        className={cn(
          'flex flex-1 flex-col overflow-hidden min-h-0 min-w-0',
          isMobile
            ? showConversation && selectedId ? 'w-full' : 'hidden'
            : '',
        )}
      >
        {selectedId ? (
          <>
            {selectedOrigins.length > 1 && (
              <div className="shrink-0 border-b border-border px-3 sm:px-4 py-2 text-[12.5px] bg-card">
                <label className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg-2">Responder pelo número</span>
                  <select aria-label="Número de resposta do grupo" value={selectedId} onChange={event => handleSelectConversation(event.target.value)} className="select !h-8 !w-auto max-w-full !text-[12.5px] max-sm:!h-10 max-sm:!text-base">
                    {selectedOrigins.map(origin => <option key={origin.id} value={origin.id}>{origin.whatsapp_instances?.nome ?? 'Número'} · {origin.protocolo}</option>)}
                  </select>
                </label>
                <p className="mt-1 text-muted-foreground">Histórico reunido das {selectedOrigins.length} conversas autorizadas. As ações usam o número escolhido.</p>
              </div>
            )}
            <ConversationView
              historyOrigins={selectedOrigins.map(origin => ({ id: origin.id, nome: origin.whatsapp_instances?.nome ?? 'Número' }))}
              key={`${draftIdentity}:${selectedId}`}
              draftText={draftText}
              onDraftTextChange={setDraftText}
              conversationId={selectedId}
              onToggleContactPanel={() => setContactPanelOpen((p) => !p)}
              contactPanelOpen={contactPanelOpen}
              onBack={isMobile ? handleBackToList : undefined}
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center chat-bg">
            <EmptyState
              icon={MessageSquare}
              title="Escolha uma conversa"
              description="Clique numa conversa da lista para ver as mensagens e responder."
              action={<button type="button" className="btn btn-secondary" onClick={() => setNewConvOpen(true)}><Plus aria-hidden />Nova conversa</button>}
            />
          </div>
        )}
      </div>

      {/* ── Detalhes do contato ──
          ≥ 1280 px: 3ª coluna fixa (DS: 288 px; 320 px em telas largas).
          768–1279 px: painel por cima, à direita, com fundo escurecido.
          Celular: tela inteira, com "voltar" para a conversa. */}
      {contactPanelOpen && selectedConversation?.chat_contacts && (
        <>
          {!isWide && (
            <div
              className="fixed inset-0 z-40 bg-[var(--scrim)] animate-fade-in"
              onClick={() => setContactPanelOpen(false)}
              aria-hidden
            />
          )}
          <div
            role={isWide ? 'complementary' : 'dialog'}
            aria-modal={isWide ? undefined : true}
            aria-label="Detalhes do contato"
            className={cn(
              isWide && 'h-full w-[288px] shrink-0 border-l border-border 2xl:w-[320px]',
              !isWide && !isMobile && 'fixed inset-y-0 right-0 z-50 w-[min(360px,100vw)] border-l border-border shadow-modal animate-slide-in-right',
              isMobile && 'fixed inset-0 z-50 animate-slide-in-right',
            )}
          >
            <ContactSidePanel
              contact={selectedConversation.chat_contacts}
              currentConversationId={selectedId!}
              instanceId={selectedConversation.whatsapp_instances?.instance_id}
              automacaoPausadaAte={selectedConversation.automacao_pausada_ate}
              isGroup={selectedConversation.is_group ?? false}
              onClose={() => setContactPanelOpen(false)}
              onSelectConversation={(id) => setSelectedId(id)}
            />
          </div>
        </>
      )}

      <NewConversationDialog
        open={newConvOpen}
        onClose={() => {
          setNewConvOpen(false)
          setNewConvInitialNome('')
          setNewConvInitialWhatsapp('')
        }}
        onCreated={(id) => setSelectedId(id)}
        initialNome={newConvInitialNome}
        initialWhatsapp={newConvInitialWhatsapp}
        initialMensagem={newConvInitialMensagem}
      />
    </div>
  )
}
