import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageSquare, MessageSquarePlus, Search, Filter, X, Plus, Users, Phone, ArrowLeft, Building, UserCheck, Eye, MessageCircleWarning, UserX, MoreVertical, Archive, ArchiveRestore, BellOff, Bell, CheckSquare, Square, CheckCheck, XCircle, Pin, PinOff } from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ConversationView } from '@/components/chat/ConversationView'
import { ContactSidePanel } from '@/components/chat/ContactSidePanel'
import { NewConversationDialog } from '@/components/chat/NewConversationDialog'
import { useConversations, useInstances, useDepartments, useUnreadCounts, useMarkMessagesAsRead, useRealtimeUnread, useRealtimeConversations, useFetchProfilePicBatch, useFetchProfilePic, useContactClientLinks, useConversationsByParticipant, useToggleArquivada, useToggleMute, useToggleFixado, useConversationUserPrefs, useCloseConversation } from '@/hooks/useChat'
import { useMyInstanceIds, useMyClientIds, useAssignments, useUsers } from '@/hooks/useUsers'
import { useClientes } from '@/hooks/useClientes'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsMobile } from '@/hooks/useMediaQuery'
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

// Sets globais: evita múltiplas chamadas e loop de retry para o mesmo contato
const fetchingPicIds = new Set<string>()
const failedPicIds = new Set<string>() // não tenta de novo na mesma sessão

// ─── Conversation Item ───────────────────────────────────────────────────────

interface ConversationItemProps {
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

function ConversationItem({ conversation, selected, onClick, unreadCount = 0, clientName, estrategistaName, showClientInfo, onArchive, onMute, onTogglePin, isArquivada = false, isFixado = false, bulkSelected, onBulkToggle, onStartSelect }: ConversationItemProps) {
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
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
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
  const strategist = (showClientInfo && estrategistaName) ? estrategistaName : assignedName
  if (strategist) {
    tooltipDetails.push({ label: 'Estrategista', value: strategist })
  } else if (showClientInfo && clientName) {
    tooltipDetails.push({ label: 'Estrategista', value: 'Sem estrategista', tone: 'text-warning' })
  }
  if (showClientInfo && clientName) tooltipDetails.push({ label: 'Cliente', value: clientName })

  const itemContent = (
    <div
      className={cn(
        'group relative w-full flex items-start gap-3 px-3 sm:px-4 py-3 text-left transition-colors cursor-pointer',
        'hover:bg-muted/50 border-b border-border/50',
        'border-l-2',
        selected
          ? 'bg-primary-muted border-l-primary'
          : 'border-l-transparent',
      )}
      onClick={onClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      {/* Avatar (with optional bulk checkbox overlay) */}
      <div className="relative shrink-0">
        {conversation.is_group ? (
          <div className="relative h-11 w-11 sm:h-[49px] sm:w-[49px]">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-primary-muted text-primary">
              <Users className="h-5 w-5" />
            </div>
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-emerald-600 text-white leading-none whitespace-nowrap shadow-sm">
              Grupo
            </span>
          </div>
        ) : contact?.foto_url && !imgFailed ? (
          <img
            src={contact.foto_url}
            alt={contactName}
            className="h-11 w-11 sm:h-[49px] sm:w-[49px] rounded-full object-cover"
            onError={handleImgError}
          />
        ) : (
          <div className="flex h-11 w-11 sm:h-[49px] sm:w-[49px] items-center justify-center rounded-full bg-primary-muted text-primary font-semibold text-sm sm:text-base">
            {getInitials(contact?.nome, formatPhone(contact?.numero_whatsapp) ?? '??')}
          </div>
        )}
        {/* Checkbox overlay — sempre visível em bulk mode */}
        {onBulkToggle && (
          <button
            onClick={onBulkToggle}
            className={cn(
              'absolute inset-0 flex items-center justify-center rounded-full transition-all',
              bulkSelected
                ? 'opacity-100 bg-primary/80'
                : 'opacity-40 hover:opacity-80 bg-black/30',
            )}
          >
            {bulkSelected
              ? <CheckSquare className="h-5 w-5 text-white" />
              : <Square className="h-5 w-5 text-white" />}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 border-b border-border/50 py-[2px] group-hover:pr-6 transition-[padding]">
        {/* Row 1: Name + Time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {isFixado && <Pin className="h-3.5 w-3.5 shrink-0 text-primary fill-primary" />}
            <p className="truncate text-sm sm:text-[15px] font-semibold text-foreground">
              {contactName}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className={cn(
              'text-2xs',
              unreadCount > 0
                ? 'text-primary font-semibold'
                : conversation.sla_primeira_resposta_violado
                  ? 'text-danger font-semibold'
                  : 'text-muted-foreground',
            )}>
              {formatRelativeTime(conversation.atualizado_em)}
            </span>
            {conversation.silenciado && (
              <svg className="h-4 w-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
                <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
                <path d="M18 8a6 6 0 0 0-9.33-5" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </div>
        </div>

        {/* Row 2: Instância + status + unread */}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 text-xs leading-[18px]">
            {inst && (
              <span className="flex items-center gap-1 truncate font-medium" style={inst.cor ? { color: inst.cor } : undefined}>
                {inst.cor && <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: inst.cor }} />}
                <span className="truncate">{inst.nome}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {conversation.sla_primeira_resposta_violado && (
              <span className="rounded-full bg-danger-light text-danger px-1.5 py-0.5 text-2xs font-bold leading-none">
                SLA
              </span>
            )}
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-2xs font-bold text-primary-foreground">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
        </div>

      </div>

      {/* Botão 3 pontos */}
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); menuPos ? setMenuPos(null) : openMenu() }}
        className={cn(
          'absolute right-1 top-1/2 -translate-y-1/2',
          'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
          'text-muted-foreground hover:bg-muted hover:text-foreground',
          menuPos ? 'opacity-100 bg-muted' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {/* Dropdown fixo — renderiza acima de tudo */}
      {menuPos && (
        <div
          className="fixed z-[9999] min-w-[160px] rounded-lg border border-border bg-background shadow-xl py-1"
          style={{ top: menuPos.top, right: menuPos.right }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { onTogglePin(); setMenuPos(null) }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          >
            {isFixado
              ? <><PinOff className="h-4 w-4 text-muted-foreground" /> Desafixar</>
              : <><Pin className="h-4 w-4 text-muted-foreground" /> Fixar no topo</>
            }
          </button>
          {onStartSelect && (
            <button
              onClick={() => { onStartSelect(); setMenuPos(null) }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <CheckSquare className="h-4 w-4 text-muted-foreground" /> Selecionar
            </button>
          )}
          <button
            onClick={() => { onArchive(); setMenuPos(null) }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          >
            {isArquivada
              ? <><ArchiveRestore className="h-4 w-4 text-muted-foreground" /> Desarquivar</>
              : <><Archive className="h-4 w-4 text-muted-foreground" /> Arquivar</>
            }
          </button>
          <button
            onClick={() => { onMute(); setMenuPos(null) }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          >
            {conversation.silenciado
              ? <><Bell className="h-4 w-4 text-muted-foreground" /> Ativar som</>
              : <><BellOff className="h-4 w-4 text-muted-foreground" /> Silenciar</>
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
              <span className="text-2xs uppercase tracking-wide text-muted-foreground shrink-0">{d.label}:</span>
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

    if (qContato) {
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
  const [instanceFilter, setInstanceFilter] = useState<string>('')
  const [departmentFilter, setDepartmentFilter] = useState<string>('')
  const [agenteFilter, setAgenteFilter] = useState<string>('')
  const [contactPanelOpen, setContactPanelOpen] = useState(false)
  const [newConvOpen, setNewConvOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<ConversationTypeFilter>('todas')
  // Estrategista defaults to "meus" (no "todos" tab for them)
  const [clientScope, setClientScope] = useState<ClientScope>('todos') // updated below via effect

  // Data queries — filter by user's allowed instances and clients
  const { user } = useAuth()
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
  const isAdmin = user?.perfil === 'admin'
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
  }, [conversations, search, instanceFilter, typeFilter, apenasNaoLidas, apenasNaoRespondidas, unreadCounts, clientScope, myClientIds, getContactClientIds, agenteFilter, participantConvIds, isGerente, myManagedDeptIds, showArquivadas, fixadoSet])

  // Counts for scope tabs (using junction table for multi-client support)
  const caixaGeralCount = useMemo(() =>
    conversations.filter(c => {
      const clientIds = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
      return clientIds.length === 0
    }).length,
    [conversations, getContactClientIds],
  )
  const meusClientesConvCount = useMemo(() => {
    if (!Array.isArray(myClientIds)) return 0
    return conversations.filter(c => {
      if (c.agente_id === user?.id) return true
      const clientIds = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
      const hasOtherEstrategista = clientIds.some(cid => {
        const entry = clientEstrategistaMap.get(cid)
        return entry != null && entry.id !== user?.id
      }) || (c.agente_id != null && c.agente_id !== user?.id && (c.users as { perfil?: string } | null)?.perfil === 'estrategista')
      if (isGerente && c.department_id && myManagedDeptIds.has(c.department_id)) return !hasOtherEstrategista
      if (hasOtherEstrategista) return false
      return clientIds.some(cid => myClientIds.includes(cid))
    }).length
  }, [conversations, myClientIds, getContactClientIds, user?.id, isGerente, myManagedDeptIds, clientEstrategistaMap])

  const geralConvCount = useMemo(() => {
    if (!isGerente) return 0
    return conversations.filter(c => {
      if ((c.users as { perfil?: string } | null)?.perfil === 'estrategista') return true
      const clientIds = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
      return clientIds.length > 0
    }).length
  }, [conversations, isGerente, getContactClientIds])

  // Atendimento counts
  const caixaAtendimentoCount = useMemo(() => {
    if (!isAtendimento) return 0
    return conversations.filter(c => {
      if (c.agente_id && !atendimentoUserIds.has(c.agente_id)) return false
      if (c.status === 'encerrada') return false
      if (c.department_id) return false
      const clientIds = getContactClientIds(c.chat_contacts?.id, c.chat_contacts?.client_id)
      if (clientIds.length === 0) return true
      return !clientIds.some(cid => clientEstrategistaMap.has(cid))
    }).length
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

  function clearFilters() {
    setInstanceFilter('')
    setDepartmentFilter('')
    setAgenteFilter('')
  }

  // On mobile: show either the list or the conversation, not both
  const showList = !isMobile || !selectedId
  const showConversation = !isMobile || !!selectedId

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel — Conversation list ────────────────────────────── */}
      <div
        className={cn(
          'flex flex-col border-r border-border bg-card',
          isMobile
            ? showList ? 'w-full' : 'hidden'
            : 'w-80 shrink-0',
        )}
      >
        {/* Header */}
        {bulkMode ? (
          <div className="flex items-center gap-1 px-2 py-2.5 border-b border-border bg-primary-muted">
            <button onClick={clearBulk} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors" title="Cancelar seleção">
              <XCircle className="h-5 w-5" />
            </button>
            <span className="flex-1 text-sm font-semibold text-foreground min-w-0 truncate">
              {bulkSelected.size} selecionada{bulkSelected.size > 1 ? 's' : ''}
            </span>
            <button onClick={handleBulkMarkRead} disabled={markReadMutation.isPending} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50" title="Marcar como lidas">
              <CheckCheck className="h-4 w-4" />
            </button>
            <button onClick={handleBulkArchive} disabled={toggleArquivada.isPending} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50" title="Arquivar">
              <Archive className="h-4 w-4" />
            </button>
            <button onClick={handleBulkMute} disabled={toggleMute.isPending} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50" title="Silenciar">
              <BellOff className="h-4 w-4" />
            </button>
            <button onClick={handleBulkClose} disabled={closeConversation.isPending} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-danger hover:bg-danger/10 transition-colors disabled:opacity-50" title="Encerrar">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-border">
            <h1 className="text-base sm:text-lg font-bold text-foreground">Conversas</h1>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setNewConvOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Nova conversa"
              >
                <Plus className="h-5 w-5" />
              </button>
              <button
                onClick={() => setShowFilters((p) => !p)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                  showFilters || hasActiveFilters
                    ? 'text-accent bg-accent/10'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                title="Filtros"
              >
                <Filter className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        )}

        {/* Active instance indicator */}
        {instances.length > 0 && (
          <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 border-b border-border bg-muted/30">
            <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
            {instances.length === 1 ? (
              <span className="text-xs text-muted-foreground truncate">
                <span className="font-medium text-foreground">{instances[0].nome}</span>
                {instances[0].numero_whatsapp && (
                  <span className="ml-1 font-mono">{formatPhone(instances[0].numero_whatsapp)}</span>
                )}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {instanceFilter
                  ? <><span className="font-medium text-foreground">{instances.find(i => i.id === instanceFilter)?.nome}</span> <span className="font-mono">{formatPhone(instances.find(i => i.id === instanceFilter)?.numero_whatsapp)}</span></>
                  : <span>{instances.length} números disponíveis</span>
                }
              </span>
            )}
          </div>
        )}

        {/* Client scope tabs */}
        {showScopeTabs && (
          <div className="flex gap-0.5 px-2 py-1.5 border-b border-border">
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
                key={f.value}
                onClick={() => setClientScope(f.value)}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap cursor-pointer',
                  clientScope === f.value
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
              >
                {f.value === 'meus' && <UserCheck className="h-3.5 w-3.5 shrink-0" />}
                {f.value === 'caixa' && <MessageSquarePlus className="h-3.5 w-3.5 shrink-0" />}
                {f.value === 'geral' && <Users className="h-3.5 w-3.5 shrink-0" />}
                {f.value === 'caixa_geral' && <Building className="h-3.5 w-3.5 shrink-0" />}
                <span>{f.label}</span>
                {f.count > 0 && (
                  <span className={cn(
                    'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-2xs font-semibold tabular-nums leading-none',
                    f.value === 'caixa_geral' ? 'bg-warning/20 text-warning' :
                    f.value === 'caixa' ? 'bg-info/20 text-info' :
                    f.value === 'geral' ? 'bg-accent/20 text-accent' :
                    clientScope === f.value ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
                  )}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Search bar */}
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar nome, telefone, protocolo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                'w-full rounded-lg border border-input bg-background',
                'py-2 pl-9 pr-8 text-sm',
                'text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
              )}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Type tabs + Status select */}
        <div className="flex items-center border-b border-border">
          {/* Type tabs */}
          <div className="flex flex-1">
            {([
              { value: 'todas' as const, label: 'Todas' },
              { value: 'diretas' as const, label: 'Diretas' },
              { value: 'grupos' as const, label: 'Grupos' },
            ]).map((f) => (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                className={cn(
                  'flex-1 min-h-[44px] flex items-center justify-center text-xs font-medium transition-colors text-center',
                  typeFilter === f.value
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f.value === 'grupos' && <Users className="inline h-3 w-3 mr-1" />}
                {f.label}
              </button>
            ))}
          </div>
          {/* Status dropdown — compact, replaces 5 pills */}
          <div className="px-2 shrink-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className={cn(
                'rounded-lg border border-input bg-background px-2 py-1.5',
                'text-xs font-medium cursor-pointer',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                statusFilter !== 'todas' ? 'text-primary border-primary/30' : 'text-muted-foreground',
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
        <div className="flex items-center gap-1.5 px-3 py-2">
          {/* Não respondidas */}
          <button
            onClick={() => setApenasNaoRespondidas(v => !v)}
            title="Aguardando resposta da equipe"
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-lg px-1.5 min-h-[34px] text-2xs font-medium transition-colors cursor-pointer',
              apenasNaoRespondidas
                ? 'bg-danger text-white'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            <MessageCircleWarning className="h-3.5 w-3.5 shrink-0" />
            Aguardando
            {(() => {
              const count = conversations.filter(c => c.aguardando_resposta && c.status !== 'encerrada').length
              return count > 0 ? (
                <span className={cn(
                  'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-0.5 text-2xs font-bold',
                  apenasNaoRespondidas ? 'bg-white/20' : 'bg-danger/15 text-danger',
                )}>
                  {count}
                </span>
              ) : null
            })()}
          </button>

          {/* Não lidas */}
          <button
            onClick={() => setApenasNaoLidas(v => !v)}
            title="Mensagens não lidas"
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-lg px-1.5 min-h-[34px] text-2xs font-medium transition-colors cursor-pointer',
              apenasNaoLidas
                ? 'gradient-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            <Eye className="h-3.5 w-3.5 shrink-0" />
            Não lidas
            {(() => {
              const count = Object.values(unreadCounts).filter(v => v > 0).length
              return count > 0 ? (
                <span className={cn(
                  'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-0.5 text-2xs font-bold',
                  apenasNaoLidas ? 'bg-white/20' : 'bg-primary/15 text-primary',
                )}>
                  {count}
                </span>
              ) : null
            })()}
          </button>

          {/* Sem agente */}
          <button
            onClick={() => setNaoAtribuida(v => !v)}
            title="Conversas sem estrategista atribuído"
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-lg px-1.5 min-h-[34px] text-2xs font-medium transition-colors cursor-pointer',
              naoAtribuida
                ? 'bg-warning text-white'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            <UserX className="h-3.5 w-3.5 shrink-0" />
            S/ estrategista
          </button>

        </div>

        {/* Advanced filters (collapsible) */}
        {showFilters && (
          <div className="border-b border-border px-3 py-2.5 space-y-2 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Filtros avançados
              </span>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-2xs text-primary hover:underline"
                >
                  <X className="h-3 w-3" />
                  Limpar
                </button>
              )}
            </div>
            <select
              value={instanceFilter}
              onChange={(e) => setInstanceFilter(e.target.value)}
              className={cn(
                'w-full rounded-lg border border-input bg-background px-2.5 py-1.5',
                'text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
              )}
            >
              <option value="">Todas as instâncias</option>
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.nome}</option>
              ))}
            </select>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className={cn(
                'w-full rounded-lg border border-input bg-background px-2.5 py-1.5',
                'text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
              )}
            >
              <option value="">Todos os departamentos</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.nome}</option>
              ))}
            </select>
            {isAdminOrGerente && (
              <select
                value={agenteFilter}
                onChange={(e) => setAgenteFilter(e.target.value)}
                className={cn(
                  'w-full rounded-lg border border-input bg-background px-2.5 py-1.5',
                  'text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                )}
              >
                <option value="">Todos os membros</option>
                {teamMembers.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome} — {PERFIL_LABELS[u.perfil] ?? u.perfil}</option>
                ))}
              </select>
            )}
            {/* Toggle arquivadas */}
            <button
              onClick={() => setShowArquivadas(v => !v)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                showArquivadas
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <Archive className="h-3.5 w-3.5 shrink-0" />
              {showArquivadas ? 'Exibindo arquivadas' : 'Ver arquivadas'}
            </button>
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto wpp-scroll">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 && clientsWithoutConversation.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa'}
              </p>
            </div>
          ) : (
            <>
              {filtered.map((c) => (
                <ConversationItem
                  key={c.id}
                  conversation={c}
                  selected={selectedId === c.id}
                  onClick={() => { if (bulkMode) { toggleBulk(c.id, { stopPropagation: () => {} } as React.MouseEvent); return } handleSelectConversation(c.id) }}
                  unreadCount={unreadCounts[c.id] || 0}
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
              ))}

              {/* Clients without conversation (only in "Meus Clientes" scope) */}
              {clientsWithoutConversation.length > 0 && (
                <>
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
                    <Building className="h-3 w-3 text-muted-foreground" />
                    <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Sem conversa ({clientsWithoutConversation.length})
                    </span>
                  </div>
                  {clientsWithoutConversation.map((cl) => (
                    <button
                      key={cl.id}
                      onClick={() => {
                        setNewConvInitialNome(cl.nome)
                        setNewConvInitialWhatsapp(cl.whatsapp ?? cl.telefone ?? '')
                        setNewConvOpen(true)
                      }}
                      className={cn(
                        'w-full flex items-start gap-3 px-3 sm:px-4 py-3 text-left transition-colors',
                        'hover:bg-muted/50 border-b border-border/50',
                        'border-l-2 border-l-transparent',
                      )}
                    >
                      <div className="flex h-11 w-11 sm:h-[49px] sm:w-[49px] shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Building className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1 py-[2px]">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm sm:text-[15px] font-semibold text-foreground">
                            {cl.nome}
                          </p>
                          <MessageSquarePlus className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                        <p className="truncate text-xs text-muted-foreground mt-0.5">
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
          'flex flex-1 flex-col overflow-hidden min-h-0',
          isMobile
            ? showConversation && selectedId ? 'w-full' : 'hidden'
            : '',
        )}
      >
        {selectedId ? (
          <>
            {/* Mobile back button bar */}
            {isMobile && (
              <div className="flex h-11 items-center gap-2 border-b border-border bg-card px-2 shrink-0">
                <button
                  onClick={handleBackToList}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <span className="text-sm font-medium text-foreground truncate">
                  {selectedConversation?.chat_contacts?.nome ?? formatPhone(selectedConversation?.chat_contacts?.numero_whatsapp) ?? 'Conversa'}
                </span>
              </div>
            )}
            <ConversationView
              conversationId={selectedId}
              onToggleContactPanel={() => setContactPanelOpen((p) => !p)}
              contactPanelOpen={contactPanelOpen}
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Selecione uma conversa"
              description="Escolha uma conversa na lista ao lado para visualizar as mensagens."
              className="border-none bg-transparent shadow-none"
            />
          </div>
        )}
      </div>

      {/* ── Right panel (contact details) — hidden on mobile, fullscreen overlay instead ── */}
      {contactPanelOpen && selectedConversation?.chat_contacts && (
        <>
          {isMobile && (
            <div
              className="fixed inset-0 z-40 bg-void/50 backdrop-blur-sm"
              onClick={() => setContactPanelOpen(false)}
            />
          )}
          <div className={cn(
            isMobile && 'fixed inset-y-0 right-0 z-50 w-[85vw] max-w-[360px] shadow-2xl bg-card',
          )}>
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
