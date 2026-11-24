import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send, UserCheck, X, Bot, Mic, Image, FileText, Video,
  Paperclip, User, Users, Trash2, Download, File,
  ArrowRightLeft, Check, CheckCheck, Sparkles, Star, MessageSquare,
  Smartphone, ExternalLink, Smile, Pencil, MoreVertical,
  MapPin, Contact, List, ChevronDown, ZoomIn, Ban, Building, Search, Link2,
  Reply, Loader2, ShieldCheck, Play, Pause, ArrowLeft, Lock, CircleAlert, MessageCircle,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { mensagemErro } from '@/lib/mensagemErro'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useUsers, useAssignments, useMyClientIds, useMyInstanceIds } from '@/hooks/useUsers'
import { useClientes } from '@/hooks/useClientes'
import { useAppSettings } from '@/hooks/useAppSettings'
import { useNomeAssistente } from '@/hooks/useAutomacoesWa'
import { cn, formatPhone } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { instanceCorHex } from '@/lib/instanceColors'
import { QuickReplyPicker } from './QuickReplyPicker'
import { TransferDialog } from './TransferDialog'
import { EmojiReactionPicker } from './EmojiReactionPicker'
import { SendContactDialog } from './SendContactDialog'
import { SendLocationDialog } from './SendLocationDialog'
import { SendMenuDialog } from './SendMenuDialog'
import { StartMeetingDialog } from './StartMeetingDialog'
import { ChatActionsMenu, ChatDetailsOverlay } from './ChatActionsMenu'
import { SeloTicketsDoCliente } from './TicketsDoCliente'
import { TranscricaoMidia } from './TranscricaoMidia'
import {
  useConversation,
  useMessages,
  useRealtimeMessages,
  useFetchProfilePic,
  useAssignConversation,
  useCloseConversation,
  useSendMessage,
  useQuickReplies,
  useAddInternalNote,
  useIaSuggestReply,
  useIaSummarizeConversation,
  useSendCsat,
  useCsatByConversation,
  useInstance,
  useInstances,
  useChangeInstance,
  uploadChatMedia,
  useReactToMessage,
  useEditMessage,
  useDeleteMessageWpp,
  useMarkRead,
  useMarkMessagesAsRead,
  useDepartments,
  useTransferConversation,
  useUpdateContact,
  useTypingIndicator,
  useSearchMessages,
  useContacts,
  useUpdateNoteContent,
  useGroupMembers,
} from '@/hooks/useChat'
import type { ChatMessage, QuickReply, MessageReaction, GroupMember } from '@/hooks/useChat'
import { BRAND } from '@/config/brand'
import { RECURSOS } from '@/config/recursos'

interface ConversationViewProps {
  historyOrigins?: readonly { id: string; nome: string }[]
  conversationId: string
  draftText?: string
  onDraftTextChange?: React.Dispatch<React.SetStateAction<string>>
  onToggleContactPanel?: () => void
  contactPanelOpen?: boolean
  /** Celular: volta para a lista de conversas (botão no próprio cabeçalho). */
  onBack?: () => void
}

// ── Triagem Banner — aparece quando conversa não tem departamento ─────────────

function TriagemBanner({
  conversationId,
  currentDepartmentId,
  currentAgenteId,
  currentAgenteName,
  isMobile,
  onlyTransfer,
}: {
  conversationId: string
  currentDepartmentId?: string | null
  currentAgenteId?: string | null
  currentAgenteName?: string | null
  isMobile?: boolean
  onlyTransfer?: boolean
}) {
  const { can } = usePermissoes()
  const { data: departments = [] } = useDepartments()
  const { data: users = [] } = useUsers()
  const { data: allAssignments = [] } = useAssignments()
  const transfer = useTransferConversation()
  const activeDepts = departments.filter(d => d.ativo)
  // "Atribuir a estrategista" (escolher pessoa específica) era exclusivo de
  // admin/gerente; virou a permissão editável `clientes.atribuir`. Quem não tem
  // usa a pílula do departamento "Estrategista", que cai no gerente — ele então
  // redistribui para um estrategista específico.
  const podeAtribuirEstrategistaDireto = can('clientes.atribuir', 'editar')
  const gerentesComClientes = new Set(allAssignments.filter(a => a.tipo === 'estrategista').map(a => a.user_id))
  // Admin e gerente com cliente vinculado como estrategista também contam: o perfil
  // é um só, e promover um estrategista a admin não pode tirá-lo desta lista.
  const estrategistas = users.filter(u => u.ativo && (
    u.perfil === 'estrategista'
    || ((u.perfil === 'gerente' || u.perfil === 'admin') && gerentesComClientes.has(u.id))
  ))
  const currentDeptName = currentDepartmentId
    ? departments.find(d => d.id === currentDepartmentId)?.nome
    : null
  const [showEstrategistas, setShowEstrategistas] = useState(!!onlyTransfer)
  const [expanded, setExpanded] = useState(false)

  const handleQuickRoute = (deptId: string) => {
    transfer.mutate({ id: conversationId, department_id: deptId, agente_id: null })
  }

  const handleTransferTo = (userId: string) => {
    transfer.mutate({ id: conversationId, agente_id: userId }, {
      onSuccess: () => setShowEstrategistas(false),
    })
  }

  // On mobile: show compact toggle bar
  if (isMobile && !expanded) {
    return (
      <div className="border-b border-border bg-card">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className="flex min-h-11 w-full items-center gap-2 px-3 text-[13px] focus-ds"
        >
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
          <span className="min-w-0 truncate text-muted-foreground font-medium">
            {currentDeptName
              ? <><span className="text-foreground">{currentDeptName}</span>{currentAgenteName && <> · <span className="text-link">{currentAgenteName}</span></>}</>
              : 'Encaminhar para uma fila'}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto shrink-0" aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="border-b border-border bg-card">
      {!onlyTransfer && (
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2 flex-wrap">
          {isMobile && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="btn btn-ghost btn-icon btn-sm shrink-0"
              aria-label="Recolher encaminhamento"
            >
              <X aria-hidden />
            </button>
          )}
          <span className="text-[12.5px] font-medium text-muted-foreground shrink-0">
            {currentDeptName
              ? <><span className="text-foreground">{currentDeptName}</span>{currentAgenteName && <> · <span className="text-link">{currentAgenteName}</span></>} —</>
              : 'Encaminhar para:'}
          </span>
          <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
            {activeDepts.map(dept => (
              <button
                key={dept.id}
                type="button"
                onClick={() => handleQuickRoute(dept.id)}
                disabled={transfer.isPending || dept.id === currentDepartmentId}
                aria-pressed={dept.id === currentDepartmentId}
                className="chip focus-ds disabled:cursor-default"
              >
                {dept.id === currentDepartmentId ? dept.nome : `→ ${dept.nome}`}
              </button>
            ))}
          </div>
          {podeAtribuirEstrategistaDireto && (
            <button
              type="button"
              onClick={() => setShowEstrategistas(v => !v)}
              aria-expanded={showEstrategistas}
              className={cn(
                'btn btn-ghost btn-sm shrink-0',
                showEstrategistas && 'text-link',
              )}
            >
              Atribuir a estrategista
            </button>
          )}
        </div>
      )}

      {showEstrategistas && podeAtribuirEstrategistaDireto && (
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary-light/60 border-t border-stroke-weak flex-wrap">
          <span className="text-[12.5px] font-semibold text-link shrink-0">Estrategista:</span>
          <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
            {estrategistas.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => handleTransferTo(u.id)}
                disabled={transfer.isPending || u.id === currentAgenteId}
                aria-pressed={u.id === currentAgenteId}
                title={u.perfil === 'gerente' ? 'Gestor' : undefined}
                className={cn(
                  'chip focus-ds disabled:cursor-default',
                  u.perfil === 'gerente' && 'border-dashed',
                )}
              >
                {u.id === currentAgenteId ? u.nome : `→ ${u.nome}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Reactions display below message bubbles ─────────────────────────────────

function ReactionsDisplay({ reactions }: { reactions?: MessageReaction[] }) {
  if (!reactions || reactions.length === 0) return null

  // Group by emoji and count
  const grouped = reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1
    return acc
  }, {})

  return (
    <div className="flex flex-wrap gap-1 mt-1 -mb-1">
      {Object.entries(grouped).map(([emoji, count]) => (
        <span
          key={emoji}
          className="inline-flex items-center gap-0.5 rounded-full bg-card ring-hairline px-1.5 py-0.5 text-xs"
        >
          {emoji}
          {count > 1 && <span className="mono text-[11px] text-muted-foreground">{count}</span>}
        </span>
      ))}
    </div>
  )
}

// ── Quoted message preview inside bubble ──────────────────────────────────────

function QuotedMessagePreview({
  msg,
  contactName,
  onClick,
}: {
  msg: ChatMessage['replied_message']
  contactName?: string
  onClick?: () => void
}) {
  if (!msg) return null

  const senderName = msg.enviado_por_agente
    ? msg.agente?.nome ?? 'Estrategista'
    : msg.enviado_por_ia
      ? 'IA Bot'
      : contactName ?? 'Cliente'

  const preview =
    msg.tipo === 'imagem' ? '📷 Imagem'
    : msg.tipo === 'video' ? '🎥 Vídeo'
    : msg.tipo === 'audio' ? '🎤 Áudio'
    : msg.tipo === 'documento' ? '📄 Documento'
    : msg.conteudo
      ? msg.conteudo.length > 80 ? msg.conteudo.slice(0, 80) + '…' : msg.conteudo
      : 'Mensagem'

  return (
    <div
      onClick={onClick}
      className="mb-1.5 rounded-md border-l-[3px] border-primary/60 bg-foreground/[0.04] px-2.5 py-1.5 cursor-pointer hover:bg-foreground/[0.07] transition-colors duration-fast"
    >
      <p className="text-xs font-semibold text-link truncate">{senderName}</p>
      <p className="text-xs text-muted-foreground truncate leading-relaxed">{preview}</p>
    </div>
  )
}

// ── Floating message action bar ───────────────────────────────────────────────

function MessageActionBar({
  position,
  onReply,
  onReact,
  onEdit,
  onDelete,
}: {
  position: 'left' | 'right'
  onReply: () => void
  onReact: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  return (
    <div
      className={cn(
        'absolute -top-3.5 z-10 flex items-center gap-0.5 rounded-full px-1 py-0.5',
        'bg-popover shadow-pop ring-hairline',
        'animate-fade-in',
        position === 'left' ? 'left-1.5' : 'right-1.5',
      )}
    >
      <button
        onClick={onReply}
        className="flex h-7 w-7 items-center justify-center rounded-full text-fg-3 hover:bg-accent hover:text-foreground transition-colors duration-fast focus-ds"
        title="Responder"
        aria-label="Responder"
      >
        <Reply className="h-[15px] w-[15px]" />
      </button>
      <button
        onClick={onReact}
        className="flex h-7 w-7 items-center justify-center rounded-full text-fg-3 hover:bg-accent hover:text-foreground transition-colors duration-fast focus-ds"
        title="Reagir"
        aria-label="Reagir"
      >
        <Smile className="h-[15px] w-[15px]" />
      </button>
      {onEdit && (
        <button
          onClick={onEdit}
          className="flex h-7 w-7 items-center justify-center rounded-full text-fg-3 hover:bg-accent hover:text-foreground transition-colors duration-fast focus-ds"
          title="Editar"
          aria-label="Editar"
        >
          <Pencil className="h-[14px] w-[14px]" />
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className="flex h-7 w-7 items-center justify-center rounded-full text-fg-3 hover:bg-danger-light hover:text-danger transition-colors duration-fast focus-ds"
          title="Apagar para todos"
          aria-label="Apagar para todos"
        >
          <Trash2 className="h-[14px] w-[14px]" />
        </button>
      )}
    </div>
  )
}

// ── Swipeable message wrapper (touch swipe to reply) ─────────────────────────

function SwipeableMessage({
  children,
  onSwipe,
  direction = 'right',
}: {
  children: React.ReactNode
  onSwipe: () => void
  direction?: 'right' | 'left'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const iconRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const swiping = useRef(false)
  const triggered = useRef(false)

  const THRESHOLD = 50

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    swiping.current = true
    triggered.current = false
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping.current || !ref.current) return
    const diff = e.touches[0].clientX - startX.current
    const allowed = direction === 'right' ? Math.max(0, diff) : Math.min(0, diff)
    const capped = direction === 'right'
      ? Math.min(allowed, THRESHOLD + 20)
      : Math.max(allowed, -(THRESHOLD + 20))
    ref.current.style.transform = `translateX(${capped}px)`
    ref.current.style.transition = 'none'
    if (iconRef.current) iconRef.current.style.opacity = String(Math.min(1, Math.abs(capped) / THRESHOLD))

    if (Math.abs(capped) >= THRESHOLD && !triggered.current) {
      triggered.current = true
      if (navigator.vibrate) navigator.vibrate(30)
    }
  }, [direction])

  const handleTouchEnd = useCallback(() => {
    if (!ref.current) return
    swiping.current = false
    ref.current.style.transform = 'translateX(0)'
    ref.current.style.transition = 'transform 0.2s ease-out'
    if (iconRef.current) { iconRef.current.style.opacity = '0'; iconRef.current.style.transition = 'opacity 0.2s' }
    if (triggered.current) onSwipe()
  }, [onSwipe])

  return (
    <div className="relative">
      <div
        ref={iconRef}
        className={cn(
          'absolute top-1/2 -translate-y-1/2 flex items-center justify-center h-8 w-8 rounded-full bg-primary/15 text-primary pointer-events-none',
          direction === 'right' ? '-left-9' : '-right-9',
        )}
        style={{ opacity: 0 }}
      >
        <Reply className="h-4 w-4" />
      </div>
      <div
        ref={ref}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ─── Image Lightbox ─────────────────────────────────────────────────────────

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-2 right-14 sm:top-4 sm:right-16 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        title="Abrir em nova aba"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="h-4 w-4" />
      </a>
      <a
        href={src}
        download
        className="absolute top-2 right-26 sm:top-4 sm:right-28 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        title="Baixar imagem"
        onClick={(e) => e.stopPropagation()}
      >
        <Download className="h-4 w-4" />
      </a>
      <img
        src={src}
        alt={alt}
        crossOrigin="anonymous"
        className="max-h-[90dvh] max-w-[90vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

// ─── File extension label ───────────────────────────────────────────────────

function getFileExtLabel(url: string): string {
  const ext = getFileExtension(url)
  return ext ? `.${ext.toLowerCase()}` : ''
}

// ─── Message Content Renderer ────────────────────────────────────────────────

function getFileExtension(url: string | null, fallback = ''): string {
  if (!url) return fallback
  const match = url.split('?')[0].match(/\.(\w{2,5})$/)
  return match ? match[1].toUpperCase() : fallback
}

/** Cor do tipo de arquivo, só com tokens do DS (sem roxo). */
const EXT_TONS: Record<string, { fundo: string; texto: string; selo: string }> = {
  PDF: { fundo: 'bg-danger-light', texto: 'text-danger', selo: 'bg-danger' },
  DOC: { fundo: 'bg-primary-light', texto: 'text-link', selo: 'bg-primary' },
  DOCX: { fundo: 'bg-primary-light', texto: 'text-link', selo: 'bg-primary' },
  XLS: { fundo: 'bg-success-light', texto: 'text-success', selo: 'bg-success' },
  XLSX: { fundo: 'bg-success-light', texto: 'text-success', selo: 'bg-success' },
  PPT: { fundo: 'bg-warning-light', texto: 'text-warning', selo: 'bg-warning' },
  PPTX: { fundo: 'bg-warning-light', texto: 'text-warning', selo: 'bg-warning' },
}
const EXT_TOM_PADRAO = { fundo: 'bg-bg-2', texto: 'text-fg-2', selo: 'bg-fg-3' }

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (playing) { el.pause() } else { el.play() }
  }

  const fmt = (s: number) => {
    if (!isFinite(s) || isNaN(s) || s === 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-2.5 min-w-[180px] sm:min-w-[210px]">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0) }}
        onTimeUpdate={() => setCurrent(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
      />
      <button
        onClick={toggle}
        aria-label={playing ? 'Pausar áudio' : 'Ouvir áudio'}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover transition-colors duration-fast focus-ds"
      >
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
      </button>
      <div className="flex flex-col flex-1 gap-1.5 min-w-0">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={current}
          onChange={(e) => {
            const t = Number(e.target.value)
            setCurrent(t)
            if (audioRef.current) audioRef.current.currentTime = t
          }}
          aria-label="Posição do áudio"
          className="w-full h-[3px] cursor-pointer accent-[var(--primary)] rounded-full"
        />
        <span className="mono text-[11px] text-muted-foreground">
          {playing ? fmt(current) : duration > 0 ? fmt(duration) : fmt(current)}
        </span>
      </div>
    </div>
  )
}

function MessageContent({ msg, onImageClick }: { msg: ChatMessage; onImageClick?: (url: string) => void }) {
  if (msg.tipo === 'audio') {
    const isPlayable = msg.media_url && !msg.media_url.includes('.enc')
    // Só áudio guardado no Storage entra na fila de transcrição (wa-midia-processar).
    const temTranscricao = Boolean(msg.id && msg.media_url?.includes('/storage/v1/object/public/chat-media/'))
    return (
      <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Mic className="h-4 w-4 text-link" aria-hidden />
        </div>
        {isPlayable ? (
          <AudioPlayer src={msg.media_url!} />
        ) : (
          <div className="flex flex-col flex-1 gap-0.5 min-w-[140px]">
            <span className="text-sm font-medium">Mensagem de voz</span>
            {msg.media_url && (
              <a
                href={msg.media_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-link hover:underline mt-0.5"
              >
                <Download className="h-3 w-3" /> Baixar áudio
              </a>
            )}
          </div>
        )}
      </div>
      {temTranscricao && <TranscricaoMidia messageId={msg.id} />}
      </div>
    )
  }
  if (msg.tipo === 'imagem' && msg.media_url) {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => onImageClick?.(msg.media_url!)}
          className="group relative block max-w-full text-left cursor-zoom-in rounded-lg focus-ds"
          aria-label="Ampliar imagem"
        >
          <img src={msg.media_url} alt="imagem" crossOrigin="anonymous" className="max-w-[min(260px,100%)] rounded-lg" loading="lazy" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors duration-fast">
            <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-fast" />
          </div>
        </button>
        {msg.conteudo && <p className="whitespace-pre-wrap break-words">{msg.conteudo}</p>}
      </div>
    )
  }
  if (msg.tipo === 'video') {
    if (msg.media_url) {
      return (
        <div className="flex flex-col gap-1.5">
          <video src={msg.media_url} controls crossOrigin="anonymous" className="max-w-[min(280px,100%)] rounded-lg" preload="metadata" />
          {msg.conteudo && <p className="whitespace-pre-wrap break-words">{msg.conteudo}</p>}
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 rounded-md bg-foreground/[0.04] px-3 py-2">
        <Video className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-sm italic text-muted-foreground">Vídeo não disponível</span>
      </div>
    )
  }
  if (msg.tipo === 'documento') {
    const ext = getFileExtension(msg.media_url, 'DOC')
    const fileName = msg.conteudo || 'Documento'
    const tom = EXT_TONS[ext] ?? EXT_TOM_PADRAO
    return (
      <div className="flex items-center gap-3 rounded-lg bg-foreground/[0.04] p-3 w-full min-w-0 sm:min-w-[240px] max-w-[320px]">
        <div className={cn('relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg', tom.fundo)}>
          <FileText className={cn('h-5 w-5', tom.texto)} aria-hidden />
          <span className={cn('mono absolute -bottom-1 -right-1 rounded-sm px-1 py-0.5 text-[10px] font-bold text-white leading-none', tom.selo)}>
            {ext}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{fileName}</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Documento {getFileExtLabel(msg.media_url ?? '')}
          </p>
          {msg.media_url ? (
            <a
              href={msg.media_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-link hover:underline mt-1"
            >
              <Download className="h-3.5 w-3.5" /> Baixar
            </a>
          ) : (
            <span className="text-xs text-muted-foreground/60 mt-1 block">Arquivo indisponível</span>
          )}
        </div>
      </div>
    )
  }
  if (msg.tipo === 'sticker' && msg.media_url) {
    return <img src={msg.media_url} alt="sticker" crossOrigin="anonymous" className="max-w-[150px] max-h-[150px]" loading="lazy" />
  }
  if (msg.tipo === 'imagem' && !msg.media_url) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-foreground/[0.04] px-3 py-2">
        <Image className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-sm italic text-muted-foreground">Imagem indisponível</span>
      </div>
    )
  }
  // Fallback: tipo desconhecido com media
  if (msg.media_url && !msg.conteudo) {
    const ext = getFileExtension(msg.media_url)
    return (
      <div className="flex items-center gap-3 rounded-lg bg-foreground/[0.04] p-3 min-w-0 sm:min-w-[200px]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <File className="h-5 w-5 text-link" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Arquivo{ext ? ` ${ext}` : ''}</p>
          <a
            href={msg.media_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-link hover:underline mt-0.5"
          >
            <Download className="h-3.5 w-3.5" /> Baixar arquivo
          </a>
        </div>
      </div>
    )
  }
  // Detect if conteudo is raw JSON media metadata (not real text)
  const isMediaJson = msg.conteudo?.trim().startsWith('{') &&
    (msg.conteudo.includes('"mimetype"') || msg.conteudo.includes('"mediaKey"'))

  if (isMediaJson) {
    // Try to detect media type from JSON
    let mediaType = 'Mídia'
    try {
      const parsed = JSON.parse(msg.conteudo!)
      if (parsed.mimetype?.startsWith('image')) mediaType = 'Imagem'
      else if (parsed.mimetype?.startsWith('video')) mediaType = 'Vídeo'
      else if (parsed.mimetype?.startsWith('audio')) mediaType = 'Áudio'
      else if (parsed.mimetype) mediaType = 'Documento'
    } catch { /* ignore */ }

    return (
      <div className="flex items-center gap-2 rounded-md bg-foreground/[0.04] px-3 py-2">
        <File className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-sm italic text-muted-foreground">{mediaType} indisponível</span>
      </div>
    )
  }

  // Deleted message — styled indicator
  if (msg.conteudo?.includes('Mensagem apagada')) {
    return (
      <div className="flex items-center gap-1.5 py-0.5 text-muted-foreground">
        <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="text-[13px] italic">
          Mensagem apagada
        </span>
      </div>
    )
  }

  return (
    <p className="whitespace-pre-wrap break-words">
      {msg.conteudo ? linkify(msg.conteudo) : <span className="italic opacity-60">[mídia não suportada]</span>}
    </p>
  )
}

// ─── Linkify text ────────────────────────────────────────────────────────────

function linkify(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlRegex)
  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 text-link hover:opacity-80 break-all"
        onClick={e => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      part
    )
  )
}

// ─── Group message sender helpers ────────────────────────────────────────────

/**
 * Tom do remetente no grupo: um dos 6 tons de avatar do DS (`.av[data-h]`).
 * O nome usa a mesma família de cor, sempre com contraste AA.
 */
const SENDER_TEXT_TONS = ['text-link', 'text-iris-fg', 'text-warning', 'text-success', 'text-st-reopen-fg', 'text-fg-2']

function getSenderTone(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % SENDER_TEXT_TONS.length
}

function parseGroupSender(conteudo: string | null): { sender: string | null; text: string | null } {
  if (!conteudo) return { sender: null, text: null }
  const match = conteudo.match(/^\[([^\]]+)\]\s?(.*)$/s)
  if (match) return { sender: match[1], text: match[2] || null }
  return { sender: null, text: conteudo }
}

/** Remetente no grupo: o prefixo "[Nome]" do texto; sem ele (mídia), o autor_nome gravado pelo webhook. */
function groupSenderOf(msg: { conteudo: string | null; autor_nome?: string | null }): { sender: string | null; text: string | null } {
  const parsed = parseGroupSender(msg.conteudo)
  if (parsed.sender) return parsed
  return { sender: msg.autor_nome?.trim() || null, text: msg.conteudo }
}

// ─── Day Grouping ────────────────────────────────────────────────────────────

function formatDateGroup(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Hoje'
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function groupMessagesByDay(messages: ChatMessage[]) {
  const groups: { label: string; messages: ChatMessage[] }[] = []

  for (const msg of messages) {
    const label = formatDateGroup(msg.criado_em)
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.messages.push(msg)
    } else {
      groups.push({ label, messages: [msg] })
    }
  }

  return groups
}

// ─── File type mapping ───────────────────────────────────────────────────────

function getFileType(file: File): string {
  if (file.type.startsWith('image/')) return 'imagem'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'documento'
}

const ACCEPT_MAP: Record<string, string> = {
  imagem: 'image/*',
  video: 'video/*',
  documento: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,image/*,video/*',
}

// ─── File Preview ──────────────────────────────────────────────────────────────

interface FilePreviewData {
  file: globalThis.File
  tipo: string
  previewUrl: string | null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FilePreviewBar({
  preview,
  caption,
  onCaptionChange,
  onSend,
  onCancel,
  sending,
}: {
  preview: FilePreviewData
  caption: string
  onCaptionChange: (v: string) => void
  onSend: () => void
  onCancel: () => void
  sending: boolean
}) {
  const iconMap: Record<string, React.ReactNode> = {
    imagem: <Image className="h-5 w-5 text-link" />,
    video: <Video className="h-5 w-5 text-link" />,
    audio: <Mic className="h-5 w-5 text-link" />,
    documento: <File className="h-5 w-5 text-link" />,
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-hairline">
      <div className="flex items-start gap-3">
        {preview.tipo === 'imagem' && preview.previewUrl ? (
          <img src={preview.previewUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
        ) : preview.tipo === 'video' && preview.previewUrl ? (
          <video src={preview.previewUrl} className="h-16 w-16 rounded-lg object-cover" muted />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-primary-light">
            {iconMap[preview.tipo] ?? <File className="h-5 w-5 text-link" />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{preview.file.name}</p>
          <p className="mono text-xs text-muted-foreground">{formatFileSize(preview.file.size)}</p>
        </div>
        <button
          type="button"
          disabled={sending}
          onClick={onCancel}
          className="btn btn-ghost btn-icon btn-sm shrink-0"
          aria-label="Cancelar envio do arquivo"
        >
          <X aria-hidden />
        </button>
      </div>

      {['imagem', 'video', 'documento'].includes(preview.tipo) && (
        <input
          type="text"
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          placeholder={preview.tipo === 'documento' ? 'Nome do arquivo (opcional)' : 'Legenda (opcional)'}
          aria-label={preview.tipo === 'documento' ? 'Nome do arquivo' : 'Legenda'}
          className="input"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSend() } }}
        />
      )}

      <button
        type="button"
        onClick={onSend}
        disabled={sending}
        aria-busy={sending}
        className={cn('btn btn-primary w-full', sending && 'is-loading')}
      >
        {sending ? <span className="btn-spin" aria-hidden /> : <Send aria-hidden />}
        <span>{sending ? 'Enviando…' : 'Enviar'}</span>
      </button>
    </div>
  )
}

// ─── Audio Recorder Hook ───────────────────────────────────────────────────────

// ─── Message Ticks (delivery status) ─────────────────────────────────────────

function MessageTicks({ status }: { status?: string | null }) {
  // A falha não vira ícone: o balão ganha a faixa "Não enviada · Tentar de novo" (DS).
  if (status === 'falha') return null
  if (status === 'enviando') {
    return <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" aria-label="Enviando" />
  }
  if (status === 'lida') {
    return <CheckCheck className="h-[15px] w-[15px] text-link" aria-label="Lida" />
  }
  if (status === 'entregue') {
    return <CheckCheck className="h-[15px] w-[15px] text-muted-foreground" aria-label="Entregue" />
  }
  // enviada
  return <Check className="h-[14px] w-[14px] text-muted-foreground" aria-label="Enviada" />
}

/** Faixa do DS para mensagem da equipe que não chegou ao WhatsApp. */
function FalhaEnvio({ onRetry, tentando }: { onRetry?: () => void; tentando?: boolean }) {
  return (
    <div
      role="alert"
      className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-dashed border-danger/40 pt-1.5 text-[12.5px] font-semibold text-danger"
    >
      <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Não enviada
      {onRetry && (
        <>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={onRetry}
            disabled={tentando}
            className="min-h-6 rounded-sm px-0.5 font-bold text-link underline underline-offset-2 disabled:opacity-50 focus-ds"
          >
            {tentando ? 'Enviando…' : 'Tentar de novo'}
          </button>
        </>
      )}
    </div>
  )
}

// ─── Mention Picker ──────────────────────────────────────────────────────────

function MentionPicker({
  query,
  onSelect,
}: {
  query: string
  onSelect: (name: string, type: 'user' | 'contact', id: string) => void
}) {
  const { data: users = [] } = useUsers()
  const { data: contacts = [] } = useContacts(query.length >= 1 ? { search: query } : undefined)

  const lq = query.toLowerCase()
  const filteredUsers = lq
    ? users.filter((u) => u.nome?.toLowerCase().includes(lq)).slice(0, 5)
    : users.slice(0, 5)
  const filteredContacts = query.length >= 1
    ? contacts.filter((c) => c.nome?.toLowerCase().includes(lq)).slice(0, 5)
    : []
  const allItems: { name: string; type: 'user' | 'contact'; id: string }[] = [
    ...filteredUsers.map((u) => ({ name: u.nome ?? '', type: 'user' as const, id: u.id })),
    ...filteredContacts.map((c) => ({ name: c.nome ?? '', type: 'contact' as const, id: c.id })),
  ]

  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setActiveIndex(0) }, [query])

  useEffect(() => {
    function onKey(e: Event) {
      const ke = e as KeyboardEvent
      if (ke.key === 'ArrowDown') setActiveIndex((i) => Math.min(i + 1, allItems.length - 1))
      else if (ke.key === 'ArrowUp') setActiveIndex((i) => Math.max(i - 1, 0))
      else if (ke.key === 'Enter' && allItems[activeIndex]) {
        const item = allItems[activeIndex]
        onSelect(item.name, item.type, item.id)
      }
    }
    window.addEventListener('mention-key', onKey)
    return () => window.removeEventListener('mention-key', onKey)
  }, [allItems, activeIndex, onSelect])

  if (allItems.length === 0) return null

  return (
    <div
      ref={listRef}
      className="absolute bottom-full mb-2 left-0 right-0 z-50 rounded-xl bg-popover shadow-pop ring-hairline overflow-hidden max-h-64 overflow-y-auto animate-fade-in-up"
    >
      {filteredUsers.length > 0 && (
        <div>
          <div className="t-h6 flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-bg-0">
            <User className="h-3 w-3" aria-hidden /> Equipe
          </div>
          {filteredUsers.map((u) => {
            const idx = allItems.findIndex((it) => it.id === u.id && it.type === 'user')
            return (
              <button
                key={u.id}
                onClick={() => onSelect(u.nome ?? '', 'user', u.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                  idx === activeIndex ? 'bg-primary-light' : 'hover:bg-accent',
                )}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-light shrink-0">
                  <User className="h-3.5 w-3.5 text-link" aria-hidden />
                </span>
                <span className="min-w-0 truncate font-medium">{u.nome}</span>
                <span className="ml-auto shrink-0 text-[12px] text-muted-foreground capitalize">{u.perfil}</span>
              </button>
            )
          })}
        </div>
      )}
      {filteredContacts.length > 0 && (
        <div>
          <div className="t-h6 flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-bg-0">
            <Contact className="h-3 w-3" aria-hidden /> Contatos
          </div>
          {filteredContacts.map((c) => {
            const idx = allItems.findIndex((it) => it.id === c.id && it.type === 'contact')
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.nome ?? '', 'contact', c.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                  idx === activeIndex ? 'bg-success-light' : 'hover:bg-accent',
                )}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success-light shrink-0">
                  <Contact className="h-3.5 w-3.5 text-success" aria-hidden />
                </span>
                <span className="min-w-0 truncate font-medium">{c.nome}</span>
                {c.numero_whatsapp && (
                  <span className="mono ml-auto shrink-0 text-[12px] text-muted-foreground">{formatPhone(c.numero_whatsapp)}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ConversationView({
  historyOrigins,
  conversationId,
  onToggleContactPanel,
  contactPanelOpen,
  draftText,
  onDraftTextChange,
  onBack,
}: ConversationViewProps) {
  const { user } = useAuth()
  const { can } = usePermissoes()
  const canSend = can('chat', 'editar')
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { data: appSettings } = useAppSettings()
  const showAgentNameInPanel = appSettings?.chat_mostrar_nome_agente_painel !== 'false'
  // Mensagens do assistente da equipe (fonte_envio 'assistente') mostram o nome dele.
  const nomeAssistente = useNomeAssistente()
  const { data: conversation, isLoading: convLoading, error: convError, refetch: refetchConversation } = useConversation(conversationId)
  const { data: messages = [], isLoading: msgLoading, error: messagesError, refetch: refetchMessages } = useMessages(conversationId, historyOrigins?.map(origin => origin.id))
  const { data: instance } = useInstance(conversation?.instance_id ?? '')
  useRealtimeMessages(conversationId, historyOrigins?.map(origin => origin.id))

  // Fetch group size/members when opening a group conversation
  const fetchGroupInfo = useFetchProfilePic()
  const { data: groupMembers = [] } = useGroupMembers(
    conversation?.is_group ? conversation?.chat_contacts?.id : undefined
  )
  useEffect(() => {
    const contact = conversation?.chat_contacts
    if (conversation?.is_group && contact?.id && contact.group_size == null && !fetchGroupInfo.isPending) {
      fetchGroupInfo.mutate(contact.id)
    }
  }, [conversation?.id, conversation?.is_group, conversation?.chat_contacts?.group_size])

  const assignMutation = useAssignConversation()
  const closeMutation = useCloseConversation()
  const sendMutation = useSendMessage()
  const noteMutation = useAddInternalNote()
  const updateNoteMutation = useUpdateNoteContent()
  const suggestReplyMutation = useIaSuggestReply()
  const summarizeMutation = useIaSummarizeConversation()
  const csatMutation = useSendCsat()
  const reactMutation = useReactToMessage()
  const editMsgMutation = useEditMessage()
  const deleteMsgMutation = useDeleteMessageWpp()
  const markReadMutation = useMarkRead()
  const markDbReadMutation = useMarkMessagesAsRead()
  const { data: csatAlreadySent = false } = useCsatByConversation(conversationId)
  const { data: quickReplies = [] } = useQuickReplies()
  const { data: clientsList = [] } = useClientes()

  const contactClientId = conversation?.chat_contacts?.client_id
  const headerClientName = contactClientId ? clientsList.find(c => c.id === contactClientId)?.nome : null

  // Link contact to client — inline in header
  const updateContactMutation = useUpdateContact()
  const { data: myClientIds } = useMyClientIds()
  const isEstrategista = user?.perfil === 'estrategista'
  const [showLinkClient, setShowLinkClient] = useState(false)
  const [linkClientSearch, setLinkClientSearch] = useState('')
  const [confirmSwap, setConfirmSwap] = useState<{ id: string; nome: string } | null>(null)
  const linkClientRef = useRef<HTMLDivElement>(null)

  const linkableClients = React.useMemo(() => {
    let list = clientsList
    // Estrategista only sees their own clients
    if (isEstrategista && Array.isArray(myClientIds)) {
      list = list.filter(c => myClientIds.includes(c.id))
    }
    if (linkClientSearch.trim()) {
      const q = linkClientSearch.toLowerCase()
      list = list.filter(c => c.nome.toLowerCase().includes(q))
    }
    return list.slice(0, 30) // limit dropdown
  }, [clientsList, myClientIds, isEstrategista, linkClientSearch])

  const handleLinkClient = (clientId: string) => {
    if (!conversation?.chat_contacts?.id) return
    updateContactMutation.mutate(
      { id: conversation.chat_contacts.id, client_id: clientId },
      { onSuccess: () => { setShowLinkClient(false); setLinkClientSearch(''); setConfirmSwap(null) } },
    )
  }

  const handleUnlinkClient = () => {
    if (!conversation?.chat_contacts?.id) return
    updateContactMutation.mutate(
      { id: conversation.chat_contacts.id, client_id: null },
      { onSuccess: () => { setShowLinkClient(false); setConfirmSwap(null) } },
    )
  }

  // Close link dropdown on outside click
  useEffect(() => {
    if (!showLinkClient) return
    const handler = (e: MouseEvent) => {
      if (linkClientRef.current && !linkClientRef.current.contains(e.target as Node)) {
        setShowLinkClient(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showLinkClient])

  const [localDraftText, setLocalDraftText] = useState('')
  const inputValue = draftText ?? localDraftText
  const setInputValue = onDraftTextChange ?? setLocalDraftText
  const [composerError, setComposerError] = useState<string | null>(null)
  const [composerWarning, setComposerWarning] = useState<string | null>(null)
  const submittingRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [noteMode, setNoteMode] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editNoteText, setEditNoteText] = useState('')
  const [mentionPicker, setMentionPicker] = useState<{ query: string; atPos: number } | null>(null)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [quickReplySearch, setQuickReplySearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [filePreview, setFilePreview] = useState<FilePreviewData | null>(null)
  useEffect(() => () => {
    if (filePreview?.previewUrl) URL.revokeObjectURL(filePreview.previewUrl)
  }, [filePreview])
  const [mediaCaption, setMediaCaption] = useState('')
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<{ text: string; tone: string }[]>([])
  const [summaryText, setSummaryText] = useState<string | null>(null)
  const [csatSentToast, setCsatSentToast] = useState(false)

  // New UAZAPI features state
  const [reactionMsgId, setReactionMsgId] = useState<string | null>(null)
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
  const [editingMsg, setEditingMsg] = useState<{ id: string; wppId: string; text: string } | null>(null)
  const [editText, setEditText] = useState('')
  const [deleteConfirmMsgId, setDeleteConfirmMsgId] = useState<string | null>(null)
  const [deleteConfirmWppId, setDeleteConfirmWppId] = useState<string | null>(null)
  const [sendContactOpen, setSendContactOpen] = useState(false)
  const [sendLocationOpen, setSendLocationOpen] = useState(false)
  const [sendMenuOpen, setSendMenuOpen] = useState(false)
  const [startMeetingOpen, setStartMeetingOpen] = useState(false)
  const [showChatActions, setShowChatActions] = useState(false)
  const [chatDetailsData, setChatDetailsData] = useState<Record<string, unknown> | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [showInstancePicker, setShowInstancePicker] = useState(false)
  const [showAssignSubmenu, setShowAssignSubmenu] = useState(false)
  const [assignSearch, setAssignSearch] = useState('')
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)

  const { data: myInstanceIds } = useMyInstanceIds()
  const { data: allInstances = [] } = useInstances(myInstanceIds)
  const changeInstanceMutation = useChangeInstance()
  // Atribuir conversa a outra pessoa: mesma pergunta de "atribuir responsável".
  const isAdminOrGerente = can('clientes.atribuir', 'editar')
  const isGerente = user?.perfil === 'gerente'
  const isAtendimento = user?.perfil === 'atendimento'
  const canAssignOthers = isAdminOrGerente || isAtendimento
  const { data: allUsers = [] } = useUsers()
  const assignableAgents = allUsers.filter(
    u => u.ativo && ['admin', 'gerente', 'atendimento', 'estrategista'].includes(u.perfil),
  )
  const instancePickerRef = useRef<HTMLDivElement>(null)

  const recorder = useAudioRecorder()
  const chatActionsRef = useRef<HTMLDivElement>(null)

  // undefined = aguardando, null = nunca lido, string = timestamp da última leitura anterior
  const [unreadSince, setUnreadSince] = useState<string | null | undefined>(undefined)
  const firstUnreadRef = useRef<HTMLDivElement>(null)
  const initialScrollDoneRef = useRef(false)

  // Auto mark-read when opening conversation (WhatsApp + local DB)
  useEffect(() => {
    // Reset para nova conversa
    setUnreadSince(undefined)
    setHeaderImgFailed(false)
    initialScrollDoneRef.current = false

    if (conversation && instance) {
      const contactNum = conversation.chat_contacts?.numero_whatsapp
      if (contactNum && instance.instance_id) {
        markReadMutation.mutate({ instance_id: instance.instance_id, number: contactNum })
      }
    }
    markDbReadMutation.mutate(conversationId, {
      onSuccess: (prev) => setUnreadSince(prev ?? null),
      onError: () => setUnreadSince(null),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  // ── Search state ───────────────────────────────────────────────────────────
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { data: searchResults = [] } = useSearchMessages(conversationId, showSearch ? searchQuery : '')

  // ── Typing indicator ───────────────────────────────────────────────────────
  const { typingNames, sendTyping } = useTypingIndicator(conversationId, user?.nome ?? null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const forcedFileTypeRef = useRef<string | null>(null)
  const attachMenuRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' })
    } else {
      const container = messagesContainerRef.current
      if (container) container.scrollTop = container.scrollHeight
    }
  }, [])

  // Scroll unificado: inicial (→ divider ou fundo) + novas mensagens (→ fundo)
  useEffect(() => {
    if (!messages.length) return

    if (!initialScrollDoneRef.current) {
      // Aguarda unreadSince ser resolvido pela mutation
      if (unreadSince === undefined) return
      initialScrollDoneRef.current = true

      const doScroll = () => {
        if (firstUnreadRef.current) {
          firstUnreadRef.current.scrollIntoView({ behavior: 'instant', block: 'center' })
        } else {
          scrollToBottom('instant')
        }
      }
      const frame = requestAnimationFrame(() => requestAnimationFrame(doScroll))
      const fallback = setTimeout(doScroll, 400)
      return () => { cancelAnimationFrame(frame); clearTimeout(fallback) }
    }

    // Nova mensagem na conversa aberta → rola suavemente ao fundo
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => scrollToBottom('smooth')))
    return () => cancelAnimationFrame(frame)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages, unreadSince])

  // Close attach menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false)
      }
      if (instancePickerRef.current && !instancePickerRef.current.contains(e.target as Node)) {
        setShowInstancePicker(false)
      }
    }
    if (showAttachMenu || showInstancePicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showAttachMenu, showInstancePicker])

  const [showMembersModal, setShowMembersModal] = useState(false)
  const [headerImgFailed, setHeaderImgFailed] = useState(false)

  const isEncerrada = conversation?.status === 'encerrada'
  const contact = conversation?.chat_contacts
  const isGroupConv = conversation?.is_group ?? false
  const contactName = isGroupConv
    ? (contact?.nome ?? 'Grupo')
    : (contact?.nome ?? formatPhone(contact?.numero_whatsapp) ?? 'Desconhecido')
  const isSending = sendMutation.isPending || noteMutation.isPending || uploading

  // ── Quick reply detection ──────────────────────────────────────────────────

  const handleInputChange = useCallback((value: string, cursorPos?: number) => {
    setInputValue(value)

    // Typing indicator broadcast
    if (value.trim()) {
      sendTyping(true)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => sendTyping(false), 2500)
    } else {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      sendTyping(false)
    }

    // Detect / at beginning of input or after newline
    const lastLine = value.split('\n').pop() ?? ''
    if (lastLine.startsWith('/')) {
      setShowQuickReplies(true)
      setQuickReplySearch(lastLine.slice(1))
    } else {
      setShowQuickReplies(false)
      setQuickReplySearch('')
    }

    // Detect @ for mention picker (only in note mode)
    if (noteMode) {
      const pos = cursorPos ?? value.length
      const textUpToCursor = value.slice(0, pos)
      const mentionMatch = textUpToCursor.match(/@(\w*)$/)
      if (mentionMatch) {
        setMentionPicker({ query: mentionMatch[1], atPos: pos - mentionMatch[0].length })
      } else {
        setMentionPicker(null)
      }
    } else {
      setMentionPicker(null)
    }
  }, [noteMode])

  const handleSelectMention = useCallback(
    (name: string, type: 'user' | 'contact', id: string) => {
      if (!mentionPicker) return
      const { atPos } = mentionPicker
      const cursorPos = textareaRef.current?.selectionStart ?? inputValue.length
      const before = inputValue.slice(0, atPos)
      const after = inputValue.slice(cursorPos)
      const mention = `@[${name}](${type}:${id})`
      setInputValue(before + mention + ' ' + after)
      setMentionPicker(null)
      setTimeout(() => {
        textareaRef.current?.focus()
        const newPos = before.length + mention.length + 1
        textareaRef.current?.setSelectionRange(newPos, newPos)
      }, 0)
    },
    [mentionPicker, inputValue],
  )

  const handleMentionClick = useCallback(
    (type: 'user' | 'contact', name: string) => {
      // Pessoa da equipe não tem tela própria: a menção fica só como destaque.
      if (type === 'user') {
        return
      } else {
        navigate(`/conversas?cliente=${encodeURIComponent(name)}`)
      }
    },
    [navigate],
  )

  function renderNoteContent(text: string) {
    const parts = text.split(/(@\[[^\]]+\]\((?:user|contact):[^)]+\))/)
    return parts.map((part, i) => {
      const match = part.match(/^@\[([^\]]+)\]\((user|contact):([^)]+)\)$/)
      if (match) {
        const [, name, type] = match
        const isUser = type === 'user'
        return (
          <button
            key={i}
            onClick={() => handleMentionClick(type as 'user' | 'contact', name)}
            className={cn(
              'inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-[13px] font-semibold transition-colors duration-fast',
              isUser
                ? 'bg-primary-light text-link hover:bg-primary-200'
                : 'bg-success-light text-success hover:opacity-80',
            )}
          >
            {isUser ? <User className="h-3 w-3" /> : <Contact className="h-3 w-3" />}
            @{name}
          </button>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  const handleSelectQuickReply = useCallback(
    (reply: QuickReply) => {
      // Replace {{name}} with contact name
      const content = reply.conteudo.replace(/\{\{name\}\}/g, contactName)

      // Replace the /search text with the reply content
      const lines = inputValue.split('\n')
      lines[lines.length - 1] = content
      setInputValue(lines.join('\n'))

      setShowQuickReplies(false)
      setQuickReplySearch('')
      textareaRef.current?.focus()
    },
    [inputValue, contactName],
  )

  // ── Send message ───────────────────────────────────────────────────────────

  async function handleSend() {
    const draft = inputValue
    const text = draft.trim()
    if (!canSend || !text || isEncerrada || isSending || submittingRef.current) return
    if (noteMode && !user) return
    const sentReplyId = replyTo?.id
    submittingRef.current = true
    setComposerError(null)
    setComposerWarning(null)
    try {
      if (noteMode) {
        await noteMutation.mutateAsync({ conversation_id: conversationId, conteudo: text, agente_id: user!.id })
      } else {
        const receipt = await sendMutation.mutateAsync({ conversation_id: conversationId, conteudo: text, reply_to_id: sentReplyId })
        if (mountedRef.current && receipt && typeof receipt.warning === 'string') setComposerWarning(receipt.warning)
      }
      // The setter belongs to the original conversation, even after navigation.
      setInputValue(current => current === draft ? '' : current)
      if (mountedRef.current) {
        setReplyTo(current => current?.id === sentReplyId ? null : current)
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
      }
    } catch (error) {
      if (mountedRef.current) setComposerError(mensagemErro(error))
    } finally {
      submittingRef.current = false
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Mention picker navigation
    if (mentionPicker) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionPicker(null)
        return
      }
      if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
        e.preventDefault()
        // dispatch a custom event that MentionPicker listens to
        window.dispatchEvent(new KeyboardEvent('mention-key', { key: e.key }))
        return
      }
    }

    // Quick reply navigation
    if (showQuickReplies) {
      if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
        // Let QuickReplyPicker handle these via window listener
        // But we need to prevent textarea default for Enter
        if (e.key === 'Enter') {
          e.preventDefault()
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setShowQuickReplies(false)
          return
        }
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── File selection with preview ────────────────────────────────────────────

  function handleFilePickerOpen(accept: string, forceType?: string) {
    setShowAttachMenu(false)
    forcedFileTypeRef.current = forceType ?? null
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept
      fileInputRef.current.click()
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!canSend || !file || isEncerrada) return
    e.target.value = '' // Reset so same file can be re-selected

    const tipo = forcedFileTypeRef.current ?? getFileType(file)
    forcedFileTypeRef.current = null
    let previewUrl: string | null = null
    if (tipo === 'imagem' || tipo === 'video' || (tipo === 'documento' && (file.type.startsWith('image/') || file.type.startsWith('video/')))) {
      previewUrl = URL.createObjectURL(file)
    }
    setFilePreview({ file, tipo, previewUrl })
    setMediaCaption('')
  }

  async function sendMedia(preview: FilePreviewData, caption: string) {
    if (!canSend || isEncerrada || submittingRef.current) return
    submittingRef.current = true
    setComposerError(null)
    setComposerWarning(null)
    setUploading(true)
    const sentReplyId = replyTo?.id
    try {
      const publicUrl = await uploadChatMedia(preview.file, conversationId)
      if (!mountedRef.current) return
      const receipt = await sendMutation.mutateAsync({
        conversation_id: conversationId,
        conteudo: caption.trim() || (preview.tipo === 'documento' ? preview.file.name : ''),
        tipo: preview.tipo,
        media_url: publicUrl,
        reply_to_id: sentReplyId,
      })
      if (mountedRef.current) {
        if (receipt && typeof receipt.warning === 'string') setComposerWarning(receipt.warning)
        setReplyTo(current => current?.id === sentReplyId ? null : current)
        setFilePreview(current => current?.file === preview.file ? null : current)
        setMediaCaption(current => current === caption ? '' : current)
      }
    } catch (error) {
      if (mountedRef.current) setComposerError(mensagemErro(error))
    } finally {
      submittingRef.current = false
      if (mountedRef.current) setUploading(false)
    }
  }

  async function handleSendMedia() {
    if (!filePreview || isSending) return
    await sendMedia(filePreview, mediaCaption)
  }

  function cancelFilePreview() {
    if (isSending || submittingRef.current) return
    setFilePreview(null)
    setMediaCaption('')
    setComposerError(null)
  }

  // ── Audio recording ──────────────────────────────────────────────────────────

  async function handleStartRecording() {
    if (!canSend || isSending) return
    setComposerError(null)
    try {
      await recorder.startRecording()
    } catch (error) {
      if (mountedRef.current) setComposerError(`Não foi possível gravar: ${mensagemErro(error)}`)
    }
  }

  async function handleStopRecording() {
    if (submittingRef.current) return
    const audioFile = await recorder.stopRecording()
    if (!audioFile || !mountedRef.current) return
    const preview: FilePreviewData = { file: audioFile, tipo: 'audio', previewUrl: null }
    const caption = recorder.formatDuration(recorder.duration)
    setFilePreview(preview)
    setMediaCaption(caption)
    await sendMedia(preview, caption)
  }

  // ── Assign ─────────────────────────────────────────────────────────────────

  function handleAssign() {
    if (!user) return
    assignMutation.mutate({ id: conversationId, agente_id: user.id })
  }

  // ── Loading / Empty ────────────────────────────────────────────────────────

  if (convError || messagesError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        {onBack && (
          <button type="button" onClick={onBack} className="btn btn-ghost btn-sm self-start">
            <ArrowLeft aria-hidden /> Voltar para a lista
          </button>
        )}
        <p className="text-sm text-danger">Não foi possível carregar esta conversa.</p>
        <button type="button" className="btn btn-secondary" onClick={() => { void refetchConversation(); void refetchMessages() }}>
          Tentar de novo
        </button>
      </div>
    )
  }

  if (convLoading || msgLoading) {
    // Esqueleto no lugar do spinner (DS): cabeçalho + alguns balões.
    return (
      <div className="flex flex-1 min-h-0 flex-col" aria-busy="true" aria-label="Carregando conversa">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 sm:px-4">
          <div className="sk h-9 w-9 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <div className="sk h-3.5 w-40 max-w-[60%]" />
            <div className="sk h-3 w-24 max-w-[40%]" />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 px-3 py-5 sm:px-6 chat-bg">
          <div className="sk h-12 w-[62%] max-w-[360px] rounded-xl" />
          <div className="sk h-9 w-[48%] max-w-[300px] self-end rounded-xl" />
          <div className="sk h-16 w-[70%] max-w-[420px] rounded-xl" />
          <div className="sk h-9 w-[40%] max-w-[240px] self-end rounded-xl" />
        </div>
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="m-auto flex flex-col items-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">Conversa não encontrada ou sem acesso.</p>
        {onBack && (
          <button type="button" onClick={onBack} className="btn btn-secondary">
            <ArrowLeft aria-hidden /> Voltar para a lista
          </button>
        )}
      </div>
    )
  }

  const groups = groupMessagesByDay(messages)

  // Conta mensagens não lidas (chegadas após a última leitura anterior)
  const unreadCount = unreadSince
    ? messages.filter(m =>
        !m.enviado_por_agente && !m.enviado_por_ia &&
        m.tipo !== 'nota_interna' && m.criado_em > unreadSince,
      ).length
    : 0

  // Injeta divisor "X novas mensagens" antes da primeira msg não lida
  type DividerItem = { _divider: true; count: number }
  type MsgOrDivider = ChatMessage | DividerItem
  const groupsWithDivider: { label: string; items: MsgOrDivider[] }[] = (() => {
    if (!unreadSince || unreadCount === 0) {
      return groups.map(g => ({ label: g.label, items: g.messages as MsgOrDivider[] }))
    }
    let inserted = false
    return groups.map(g => {
      const items: MsgOrDivider[] = []
      for (const msg of g.messages) {
        if (!inserted && !msg.enviado_por_agente && !msg.enviado_por_ia &&
            msg.tipo !== 'nota_interna' && msg.criado_em > unreadSince) {
          items.push({ _divider: true, count: unreadCount })
          inserted = true
        }
        items.push(msg)
      }
      return { label: g.label, items }
    })
  })()

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-card border-b border-border">
        <div className="flex items-center justify-between gap-1 min-h-14 sm:min-h-[60px] px-1.5 sm:px-4 py-1.5">
          {/* Celular: voltar para a lista */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="btn btn-ghost btn-icon shrink-0"
              aria-label="Voltar para a lista de conversas"
              title="Voltar"
            >
              <ArrowLeft aria-hidden />
            </button>
          )}
          {/* Left: Avatar + Name */}
          <div
            role="button"
            tabIndex={0}
            onClick={onToggleContactPanel}
            onKeyDown={(e) => e.key === 'Enter' && onToggleContactPanel?.()}
            aria-label={`Ver detalhes de ${contactName}`}
            className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 group cursor-pointer rounded-md focus-ds"
          >
            {isGroupConv ? (
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-primary-light text-link">
                <Users className="h-5 w-5" aria-hidden />
              </div>
            ) : contact?.foto_url && !headerImgFailed ? (
              <img
                src={contact.foto_url}
                alt={contactName}
                className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-full object-cover"
                onError={() => setHeaderImgFailed(true)}
              />
            ) : (
              <div className="av av-xl !h-9 !w-9 sm:!h-10 sm:!w-10 text-sm" data-h="0" aria-hidden>
                {contactName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-[650] text-foreground group-hover:underline decoration-1 underline-offset-2">
                {contactName}
              </p>
              <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground leading-[18px] min-w-0">
                {isGroupConv ? (
                  <>
                    {contact?.group_size != null && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowMembersModal(true) }}
                        className="text-muted-foreground hover:text-link hover:underline underline-offset-2 transition-colors duration-fast"
                      >
                        {contact.group_size} membros
                      </button>
                    )}
                    {conversation.sla_primeira_resposta_violado && (
                      <span className="st st-sm shrink-0" data-s="atrasado" title="Passou do prazo da primeira resposta"><span className="st-g" aria-hidden />1ª resposta atrasada</span>
                    )}
                    {conversation.sla_resolucao_violado && (
                      <span className="st st-sm shrink-0" data-s="atrasado" title="Passou do prazo de resolução"><span className="st-g" aria-hidden />Resolução atrasada</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="mono truncate">{formatPhone(contact?.numero_whatsapp)}</span>
                    {conversation.sla_primeira_resposta_violado && (
                      <span className="st st-sm shrink-0" data-s="atrasado" title="Passou do prazo da primeira resposta"><span className="st-g" aria-hidden /><span className="hidden sm:inline">1ª resposta atrasada</span><span className="sm:hidden">Atrasada</span></span>
                    )}
                    {conversation.sla_resolucao_violado && (
                      <span className="st st-sm shrink-0 max-sm:hidden" data-s="atrasado" title="Passou do prazo de resolução"><span className="st-g" aria-hidden />Resolução atrasada</span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Tickets deste cliente — selo com a lista; some sem cliente vinculado. */}
          <div className="shrink-0">
            <SeloTicketsDoCliente clienteId={contactClientId} />
          </div>

          {/* Link contact to client — button + dropdown (hidden on mobile) */}
          <div className="relative shrink-0 hidden sm:block" ref={linkClientRef}>
            {contactClientId ? (
              <button
                type="button"
                onClick={() => setShowLinkClient(!showLinkClient)}
                aria-expanded={showLinkClient}
                className={cn('btn btn-secondary btn-sm max-w-[180px]', showLinkClient && '!border-primary !text-link')}
                title={`Vinculado: ${headerClientName ?? 'Cliente'}`}
              >
                <Building aria-hidden />
                <span className="truncate">{headerClientName ?? 'Cliente'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowLinkClient(!showLinkClient)}
                aria-expanded={showLinkClient}
                className={cn('btn btn-ghost btn-sm', showLinkClient && 'text-link')}
                title="Vincular contato a um cliente"
              >
                <Link2 aria-hidden />
                <span>Vincular cliente</span>
              </button>
            )}
            {showLinkClient && (
              <div className="absolute right-0 top-full mt-1 z-30 rounded-xl bg-popover shadow-pop ring-hairline w-[min(280px,calc(100vw-2rem))] py-1 animate-fade-in-up">
                {/* If already linked, show confirmation first */}
                {contactClientId && !linkClientSearch.trim() && (
                  <div className="px-3 py-2.5 border-b border-border space-y-2">
                    <div className="flex items-center gap-2">
                      <Building className="h-3.5 w-3.5 text-link shrink-0" aria-hidden />
                      <span className="text-[13px] font-medium text-foreground truncate">{headerClientName}</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground">Este contato já está vinculado. Busque abaixo para trocar ou desvincule.</p>
                    <button
                      type="button"
                      onClick={handleUnlinkClient}
                      className="btn btn-ghost btn-sm w-full justify-start text-danger hover:!bg-danger-light"
                    >
                      <X aria-hidden />
                      Desvincular
                    </button>
                  </div>
                )}
                <div className="px-2 py-1.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    <input
                      type="text"
                      value={linkClientSearch}
                      onChange={(e) => setLinkClientSearch(e.target.value)}
                      placeholder={contactClientId ? 'Buscar para trocar…' : 'Buscar cliente…'}
                      aria-label="Buscar cliente"
                      className="input !h-8 !pl-8 text-[13px]"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-[220px] overflow-y-auto">
                  {/* Confirm swap overlay */}
                  {confirmSwap && (
                    <div className="px-3 py-3 space-y-2 border-b border-border bg-warning-light">
                      <p className="text-[13px] text-foreground">
                        Trocar de <strong>{headerClientName}</strong> para <strong>{confirmSwap.nome}</strong>?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            handleLinkClient(confirmSwap.id)
                            setConfirmSwap(null)
                          }}
                          className="btn btn-primary btn-sm flex-1"
                        >
                          Confirmar troca
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmSwap(null)}
                          className="btn btn-secondary btn-sm flex-1"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {linkableClients.length === 0 && linkClientSearch.trim() && (
                    <p className="px-3 py-2 text-[13px] text-muted-foreground">Nenhum cliente encontrado</p>
                  )}
                  {!confirmSwap && linkableClients.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => {
                        if (c.id === contactClientId) return
                        if (contactClientId) {
                          setConfirmSwap({ id: c.id, nome: c.nome })
                        } else {
                          handleLinkClient(c.id)
                        }
                      }}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 text-[13px] hover:bg-accent transition-colors duration-fast text-left',
                        c.id === contactClientId && 'bg-primary-light text-link font-medium',
                      )}
                    >
                      <Building className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{c.nome}</span>
                      {c.id === contactClientId && <span className="ml-auto text-[12px] text-link">atual</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Instance indicator + picker (hidden on mobile) */}
          {instance && (
            <div className="relative shrink-0 hidden sm:block" ref={instancePickerRef}>
              <button
                type="button"
                onClick={() => setShowInstancePicker(!showInstancePicker)}
                disabled={(historyOrigins?.length ?? 0) > 1}
                aria-expanded={showInstancePicker}
                className={cn('btn btn-ghost btn-sm', showInstancePicker && 'bg-primary-light text-link')}
                title={`Enviando via ${instance.nome}${instance.numero_whatsapp ? ` (${formatPhone(instance.numero_whatsapp)})` : ''} — clique para trocar`}
              >
                <Smartphone aria-hidden />
                <span className="max-w-[100px] truncate">{instance.nome}</span>
                <ChevronDown className={cn('transition-transform duration-fast', showInstancePicker && 'rotate-180')} aria-hidden />
              </button>

              {showInstancePicker && allInstances.length > 1 && (
                <div className="absolute right-0 top-full mt-1 z-20 rounded-xl bg-popover shadow-pop ring-hairline w-[min(260px,calc(100vw-2rem))] py-1 max-h-[280px] overflow-y-auto animate-fade-in-up">
                  <span className="t-h6 px-3 py-1.5 block">
                    Trocar número de envio
                  </span>
                  {allInstances.filter(i => i.status === 'conectado').map((inst) => {
                    const isCurrent = inst.id === instance.id
                    const isOff = !inst.ativo
                    return (
                      <button
                        key={inst.id}
                        onClick={() => {
                          if (isCurrent || isOff) {
                            setShowInstancePicker(false)
                            return
                          }
                          changeInstanceMutation.mutate(
                            { conversation_id: conversationId, new_instance_id: inst.id },
                            { onSuccess: () => setShowInstancePicker(false) },
                          )
                        }}
                        disabled={changeInstanceMutation.isPending || isOff}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-colors duration-fast text-left',
                          isCurrent && 'bg-primary-light',
                          isOff && 'opacity-60 cursor-not-allowed hover:bg-transparent',
                        )}
                      >
                        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                          <div className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full',
                            isCurrent ? 'bg-primary text-primary-foreground' : 'bg-bg-2 text-muted-foreground',
                          )}>
                            <Smartphone className="h-3.5 w-3.5" />
                          </div>
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card"
                            style={{ backgroundColor: instanceCorHex(inst.cor) }}
                            aria-hidden
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm font-medium flex items-center gap-1.5', isCurrent && 'text-link')}>
                            <span className="truncate">{inst.nome}</span>
                            <span className={cn('tag shrink-0 !h-5 !text-[11px]', isOff ? '' : 'tag-success')}>
                              {isOff ? 'Desligado' : 'Ligado'}
                            </span>
                          </p>
                          {inst.numero_whatsapp && (
                            <p className="mono text-[12px] text-muted-foreground">{formatPhone(inst.numero_whatsapp)}</p>
                          )}
                        </div>
                        {isCurrent && (
                          <Check className="h-4 w-4 text-link shrink-0" aria-label="Número atual" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Right: Action icons */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Search messages */}
            <button
              onClick={() => {
                setShowSearch(s => {
                  if (s) { setSearchQuery(''); setSearchIndex(0) }
                  else setTimeout(() => searchInputRef.current?.focus(), 50)
                  return !s
                })
              }}
              aria-pressed={showSearch}
              className={cn('btn btn-ghost btn-icon', showSearch && 'bg-primary-light text-link')}
              title="Buscar mensagens"
              aria-label="Buscar mensagens"
            >
              <Search aria-hidden />
            </button>

            {/* Summarize — hidden on mobile */}
            <button
              onClick={() => {
                summarizeMutation.mutate(conversationId, {
                  onSuccess: (data) => {
                    setSummaryText(data.summary ?? data.resumo ?? 'Sem resumo disponível.')
                  },
                })
              }}
              disabled={summarizeMutation.isPending}
              className="btn btn-ghost btn-icon hidden sm:inline-flex"
              title="Resumir conversa"
              aria-label="Resumir conversa"
              aria-busy={summarizeMutation.isPending}
            >
              {summarizeMutation.isPending ? (
                <span className="btn-spin !inline-block" aria-hidden />
              ) : (
                <FileText aria-hidden />
              )}
            </button>

            {/* Contact panel */}
            {onToggleContactPanel && (
              <button
                type="button"
                onClick={onToggleContactPanel}
                aria-pressed={contactPanelOpen}
                className={cn('btn btn-ghost btn-icon', contactPanelOpen && 'bg-primary-light text-link')}
                title="Detalhes do contato"
                aria-label="Detalhes do contato"
              >
                <User aria-hidden />
              </button>
            )}

            {/* More actions dropdown — mobile only */}
            <div className="relative sm:hidden" ref={chatActionsRef}>
              <button
                type="button"
                onClick={() => setShowChatActions(!showChatActions)}
                aria-expanded={showChatActions}
                className={cn('btn btn-ghost btn-icon', showChatActions && 'bg-accent')}
                title="Mais opções"
                aria-label="Mais opções"
              >
                <MoreVertical aria-hidden />
              </button>
              {showChatActions && (
                <div className="absolute right-0 top-full mt-1 z-30 flex flex-col rounded-xl bg-popover shadow-pop ring-hairline w-[min(280px,calc(100vw-1.5rem))] max-h-[70dvh] overflow-y-auto py-1 animate-fade-in-up">
                  {/* Resumir — visível apenas no mobile (no desktop tem botão dedicado) */}
                  {isMobile && (
                    <button
                      onClick={() => {
                        summarizeMutation.mutate(conversationId, {
                          onSuccess: (data) => {
                            setSummaryText(data.summary ?? data.resumo ?? 'Sem resumo disponível.')
                            setShowChatActions(false)
                          },
                        })
                      }}
                      disabled={summarizeMutation.isPending}
                      className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors duration-fast disabled:opacity-50"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {summarizeMutation.isPending ? 'Resumindo…' : 'Resumir conversa'}
                    </button>
                  )}
                  {conversation.status !== 'encerrada' && (
                    <>
                      {/* Atribuir — admin/gerente/atendimento veem submenu com todos os agentes */}
                      {canAssignOthers ? (
                        <div className="relative">
                          <button
                            onClick={() => { setShowAssignSubmenu(!showAssignSubmenu); setAssignSearch('') }}
                            className="w-full flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors duration-fast"
                          >
                            <UserCheck className="h-4 w-4 text-muted-foreground" />
                            Atribuir a...
                            <ChevronDown className={cn('h-3 w-3 ml-auto text-muted-foreground transition-transform', showAssignSubmenu && 'rotate-180')} />
                          </button>
                          {showAssignSubmenu && (
                            <div className="border-t border-border bg-bg-0">
                              {/* Quick: atribuir a mim */}
                              <button
                                onClick={() => { handleAssign(); setShowChatActions(false); setShowAssignSubmenu(false) }}
                                disabled={assignMutation.isPending}
                                className={cn(
                                  'w-full flex min-h-11 items-center gap-3 px-4 py-2 text-sm hover:bg-accent transition-colors duration-fast disabled:opacity-50',
                                  conversation.agente_id === user?.id ? 'text-primary font-medium' : 'text-foreground',
                                )}
                              >
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
                                  {user?.nome?.slice(0, 2).toUpperCase() ?? 'EU'}
                                </div>
                                <span>Atribuir a mim</span>
                                {conversation.agente_id === user?.id && (
                                  <Check className="h-3.5 w-3.5 text-primary ml-auto" />
                                )}
                              </button>

                              {/* Search */}
                              <div className="px-3 py-1.5">
                                <input
                                  type="text"
                                  placeholder="Buscar agente..."
                                  value={assignSearch}
                                  onChange={(e) => setAssignSearch(e.target.value)}
                                  aria-label="Buscar agente"
                                  className="input"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>

                              {/* Agent list */}
                              <div className="max-h-48 overflow-y-auto">
                                {assignableAgents
                                  .filter(a => a.id !== user?.id)
                                  .filter(a => !assignSearch.trim() || a.nome.toLowerCase().includes(assignSearch.toLowerCase()))
                                  .map((agent) => (
                                    <button
                                      key={agent.id}
                                      onClick={() => {
                                        assignMutation.mutate(
                                          { id: conversationId, agente_id: agent.id },
                                          { onSuccess: () => { setShowChatActions(false); setShowAssignSubmenu(false) } },
                                        )
                                      }}
                                      disabled={assignMutation.isPending}
                                      className={cn(
                                        'w-full flex min-h-11 items-center gap-3 px-4 py-2 text-sm hover:bg-accent transition-colors duration-fast disabled:opacity-50',
                                        conversation.agente_id === agent.id ? 'text-primary font-medium' : 'text-foreground',
                                      )}
                                    >
                                      <div className="av !h-7 !w-7 text-[11px]" data-h="0" aria-hidden>
                                        {agent.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                      </div>
                                      <div className="min-w-0 flex-1 text-left">
                                        <p className="text-sm truncate">{agent.nome}</p>
                                        <p className="text-[12px] text-muted-foreground capitalize">{agent.perfil}</p>
                                      </div>
                                      {conversation.agente_id === agent.id && (
                                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                      )}
                                    </button>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => { handleAssign(); setShowChatActions(false) }}
                          disabled={assignMutation.isPending}
                          className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors duration-fast disabled:opacity-50"
                        >
                          <UserCheck className="h-4 w-4 text-muted-foreground" />
                          Atribuir a mim
                        </button>
                      )}
                      <button
                        onClick={() => { setTransferDialogOpen(true); setShowChatActions(false) }}
                        className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors duration-fast"
                      >
                        <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                        Atribuir
                      </button>
                      <button
                        onClick={() => { setCloseDialogOpen(true); setShowChatActions(false) }}
                        className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-danger-light transition-colors duration-fast"
                      >
                        <X className="h-4 w-4" />
                        Encerrar conversa
                      </button>
                    </>
                  )}
                  {conversation.status === 'encerrada' && (
                    <button
                      onClick={() => {
                        if (!contact) return
                        csatMutation.mutate(
                          { conversation_id: conversationId, contact_id: contact.id },
                          {
                            onSuccess: receipt => {
                              if (receipt.warning) setComposerWarning(receipt.warning)
                              setCsatSentToast(true)
                              setTimeout(() => setCsatSentToast(false), 3000)
                              setShowChatActions(false)
                            },
                            onError: error => setComposerError(mensagemErro(error)),
                          },
                        )
                      }}
                      disabled={!canSend || csatMutation.isPending || csatAlreadySent}
                      className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors duration-fast disabled:opacity-50"
                    >
                      <Star className="h-4 w-4 text-muted-foreground" />
                      {csatAlreadySent ? 'CSAT já enviado' : 'Enviar CSAT'}
                    </button>
                  )}
                  {instance && contact && (
                    <>
                      <div className="border-t border-border my-1" />
                      <ChatActionsMenu
                        instanceId={instance.instance_id}
                        contactNumber={contact.numero_whatsapp}
                        conversationId={conversationId}
                        silenciado={conversation?.silenciado ?? false}
                        onClose={() => setShowChatActions(false)}
                        onShowDetails={(d) => { setChatDetailsData(d); setShowChatActions(false) }}
                        inline
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      {showSearch && (
        <div className="shrink-0 border-b border-border bg-card px-3 py-1.5 flex items-center gap-1.5 animate-band-in">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchIndex(0) }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); setSearchIndex(0) }
              if (e.key === 'Enter') {
                if (searchResults.length === 0) return
                const next = (searchIndex + 1) % searchResults.length
                setSearchIndex(next)
                document.getElementById(`msg-${searchResults[next].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
            }}
            placeholder="Buscar nas mensagens…"
            aria-label="Buscar nas mensagens"
            className="min-h-10 min-w-0 flex-1 bg-transparent text-base sm:text-sm text-foreground placeholder:text-fg-placeholder focus:outline-none"
          />
          {searchQuery.trim().length >= 2 && (
            <span className="mono text-xs text-muted-foreground shrink-0" aria-live="polite">
              {searchResults.length === 0 ? 'Sem resultados' : `${searchIndex + 1} / ${searchResults.length}`}
            </span>
          )}
          {searchResults.length > 0 && (
            <>
              <button
                onClick={() => {
                  const prev = (searchIndex - 1 + searchResults.length) % searchResults.length
                  setSearchIndex(prev)
                  document.getElementById(`msg-${searchResults[prev].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }}
                className="btn btn-ghost btn-icon btn-sm"
                title="Anterior"
                aria-label="Resultado anterior"
              >
                <ChevronDown className="rotate-180" aria-hidden />
              </button>
              <button
                onClick={() => {
                  const next = (searchIndex + 1) % searchResults.length
                  setSearchIndex(next)
                  document.getElementById(`msg-${searchResults[next].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }}
                className="btn btn-ghost btn-icon btn-sm"
                title="Próximo"
                aria-label="Próximo resultado"
              >
                <ChevronDown aria-hidden />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchIndex(0) }}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Fechar busca"
          >
            <X aria-hidden />
          </button>
        </div>
      )}

      {/* ── Triagem banner (admin/atendimento — encaminhamento para departamentos) ── */}
      {canAssignOthers && conversation.status !== 'encerrada' && (
        <TriagemBanner
          conversationId={conversationId}
          currentDepartmentId={conversation.department_id}
          currentAgenteId={conversation.agente_id}
          currentAgenteName={conversation.users?.nome}
          isMobile={isMobile}
          onlyTransfer={isGerente}
        />
      )}

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 sm:px-5 py-3 sm:py-4 space-y-1 chat-bg wpp-scroll text-[15px] sm:text-[14px] leading-[1.45]">
        {groupsWithDivider.map((group) => (
          <div key={group.label} className="space-y-1">
            {/* Separador de dia (DS: pílula com anel fino) */}
            <div className="flex justify-center py-2">
              <span className="rounded-full bg-card ring-hairline px-2.5 py-[3px] text-[11.5px] font-semibold text-muted-foreground">
                {group.label}
              </span>
            </div>

            {group.items.map((item, itemIndex) => {
              // Divisor "X novas mensagens"
              if ('_divider' in item) {
                return (
                  <div key="__unread_divider__" ref={firstUnreadRef} className="flex items-center gap-3 py-3 px-2" role="separator">
                    <div className="flex-1 h-px bg-primary/35" />
                    <span className="shrink-0 rounded-full bg-primary-light px-3 py-1 text-[12px] font-semibold text-link">
                      {item.count} {item.count === 1 ? 'nova mensagem' : 'novas mensagens'}
                    </span>
                    <div className="flex-1 h-px bg-primary/35" />
                  </div>
                )
              }
              const msg = item
              const originIsSelected = msg.conversation_id === conversationId
              const originName = historyOrigins && historyOrigins.length > 1
                ? historyOrigins.find(origin => origin.id === msg.conversation_id)?.nome : null
              // Internal note
              if (msg.tipo === 'nota_interna') {
                const isEditingThis = editingNoteId === msg.id
                return (
                  <div key={msg.id} className="px-1 sm:px-2 py-1 group/note">
                    {/* Nota interna (DS): largura toda, fundo âmbar, borda tracejada. Nunca vai ao WhatsApp. */}
                    <div className="w-full rounded-lg border border-dashed border-note-border bg-note px-3 py-[9px] text-[14px] sm:text-[13.5px] animate-row-in">
                      <div className="flex items-center gap-1.5 mb-[3px] text-[11.5px] font-[650] text-note-fg">
                        <Lock className="h-[13px] w-[13px]" aria-hidden />
                        <span>Nota interna · só a equipe vê</span>
                        {!isEditingThis && originIsSelected && (
                          <button
                            type="button"
                            onClick={() => { setEditingNoteId(msg.id); setEditNoteText(msg.conteudo ?? '') }}
                            className="ml-auto inline-flex min-h-6 items-center gap-1 rounded-sm px-1 text-[12px] font-semibold text-note-fg opacity-0 transition-opacity duration-fast group-hover/note:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 focus-ds"
                          >
                            <Pencil className="h-3 w-3" aria-hidden />
                            Editar
                          </button>
                        )}
                      </div>
                      {isEditingThis ? (
                        <div className="space-y-2">
                          <textarea
                            value={editNoteText}
                            onChange={(e) => setEditNoteText(e.target.value)}
                            aria-label="Editar nota interna"
                            className="textarea !min-h-[72px] !bg-card text-base sm:text-[14px]"
                            rows={3}
                            autoFocus
                            onInput={(e) => {
                              const t = e.currentTarget
                              t.style.height = 'auto'
                              t.style.height = `${t.scrollHeight}px`
                            }}
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingNoteId(null)}
                              className="btn btn-ghost btn-sm"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={updateNoteMutation.isPending || !editNoteText.trim()}
                              onClick={() => {
                                updateNoteMutation.mutate(
                                  { id: msg.id, conteudo: editNoteText.trim(), conversation_id: conversationId },
                                  { onSuccess: () => setEditingNoteId(null) },
                                )
                              }}
                              className="btn btn-primary btn-sm"
                            >
                              {updateNoteMutation.isPending ? 'Salvando…' : 'Salvar'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-foreground whitespace-pre-wrap break-words">
                          {renderNoteContent(msg.conteudo ?? '')}
                        </p>
                      )}
                      <p className="mono mt-1 text-[11px] text-muted-foreground text-right">
                        {originName && <span title={originIsSelected ? "Número de origem" : "Selecione este número acima para agir nesta mensagem"}>{originName} · </span>}{formatTime(msg.criado_em)}
                      </p>
                    </div>
                  </div>
                )
              }

              // Received message (customer)
              if (!msg.enviado_por_agente && !msg.enviado_por_ia) {
                const { sender: groupSender, text: groupText } = isGroupConv
                  ? groupSenderOf(msg)
                  : { sender: null, text: msg.conteudo }
                const senderTone = groupSender ? getSenderTone(groupSender) : 0
                const displayMsg = isGroupConv && groupSender
                  ? { ...msg, conteudo: groupText }
                  : msg

                // Check if same sender as previous message (for grouping)
                const prevItem = itemIndex > 0 ? group.items[itemIndex - 1] : null
                const prevMsg = prevItem && !('_divider' in prevItem) ? prevItem : null
                const prevSender = isGroupConv && prevMsg && !prevMsg.enviado_por_agente && !prevMsg.enviado_por_ia
                  ? groupSenderOf(prevMsg).sender
                  : null
                const isSameSender = isGroupConv && !!groupSender && groupSender === prevSender

                const isSearchMatch = showSearch && searchResults.some(r => r.id === msg.id)
                const isCurrentSearch = isSearchMatch && searchResults[searchIndex]?.id === msg.id
                return (
                  <SwipeableMessage key={msg.id} onSwipe={() => { if (originIsSelected) { setReplyTo(msg); textareaRef.current?.focus() } }} direction="right">
                  <div id={`msg-${msg.id}`} className={cn("flex justify-start px-1 sm:px-2 gap-2 rounded-md transition-colors duration-base", isSameSender ? "py-[1px]" : "py-0.5", isCurrentSearch && "bg-warning-light")}>
                    {isGroupConv && (
                      groupSender ? (
                        isSameSender ? (
                          <div className="w-7 shrink-0" />
                        ) : (
                          <div
                            className="av !h-7 !w-7 mt-1 text-[11px]"
                            data-h={senderTone}
                            title={groupSender}
                            aria-hidden
                          >
                            {groupSender.slice(0, 2).toUpperCase()}
                          </div>
                        )
                      ) : (
                        <div className="w-7 shrink-0" />
                      )
                    )}
                    {/* Balão do cliente (DS .msg-in): cartão com anel fino, canto inferior esquerdo fechado */}
                    <div
                      className={cn(
                        "relative min-w-0 bg-card text-foreground ring-hairline px-3 pt-2 pb-1.5 max-w-[84%] sm:max-w-[78%] group/msg animate-row-in [overflow-wrap:anywhere]",
                        isSameSender ? "rounded-xl" : "rounded-xl rounded-bl-[4px]",
                      )}
                      onMouseEnter={() => setHoveredMsgId(msg.id)}
                      onMouseLeave={() => { if (reactionMsgId !== msg.id) setHoveredMsgId(null) }}
                    >
                      {isGroupConv && groupSender && !isSameSender && (
                        <p className={cn('text-[11.5px] font-[650] mb-0.5', SENDER_TEXT_TONS[senderTone])}>
                          {groupSender}
                          {msg.autor_tipo === 'equipe' && (
                            <span className="ml-1 font-normal text-muted-foreground">· equipe</span>
                          )}
                        </p>
                      )}
                      {msg.replied_message && (
                        <QuotedMessagePreview msg={msg.replied_message} contactName={contactName} />
                      )}
                      <MessageContent msg={displayMsg} onImageClick={setLightboxUrl} />
                      <p className="mono mt-0.5 text-[11px] text-muted-foreground text-right">
                        {originName && <span title={originIsSelected ? "Número de origem" : "Selecione este número acima para agir nesta mensagem"}>{originName} · </span>}{formatTime(msg.criado_em)}
                      </p>
                      <ReactionsDisplay reactions={msg.reactions} />
                      {/* Hover action bar */}
                      {hoveredMsgId === msg.id && originIsSelected && instance && contact && (
                        <MessageActionBar
                          position="right"
                          onReply={() => { setReplyTo(msg); textareaRef.current?.focus() }}
                          onReact={() => setReactionMsgId(reactionMsgId === msg.id ? null : msg.id)}
                        />
                      )}
                      {reactionMsgId === msg.id && msg.message_id_wpp && (
                        <EmojiReactionPicker
                          onSelect={(emoji) => {
                            reactMutation.mutate({
                              instance_id: instance!.instance_id,
                              number: contact!.numero_whatsapp,
                              message_id: msg.message_id_wpp!,
                              emoji,
                              conversation_id: conversationId,
                            })
                            setReactionMsgId(null)
                          }}
                          onRemove={() => {
                            reactMutation.mutate({
                              instance_id: instance!.instance_id,
                              number: contact!.numero_whatsapp,
                              message_id: msg.message_id_wpp!,
                              emoji: '',
                              conversation_id: conversationId,
                            })
                            setReactionMsgId(null)
                          }}
                          onClose={() => { setReactionMsgId(null); setHoveredMsgId(null) }}
                        />
                      )}
                    </div>
                  </div>
                  </SwipeableMessage>
                )
              }

              // IA message
              if (msg.enviado_por_ia) {
                const isCurrentSearchIa = showSearch && searchResults[searchIndex]?.id === msg.id
                return (
                  <div id={`msg-${msg.id}`} key={msg.id} className={cn("flex justify-end px-1 sm:px-2 py-0.5 rounded-md transition-colors duration-base", isCurrentSearchIa && "bg-warning-light")}>
                    {/* Balão da Íris/IA (DS .msg-iris): à direita, verde-água, com a marca da Íris */}
                    <div className="relative min-w-0 rounded-xl rounded-br-[4px] bg-iris-light text-foreground px-3 pt-2 pb-1.5 max-w-[84%] sm:max-w-[78%] shadow-[inset_0_0_0_1px_var(--iris-line)] animate-row-in [overflow-wrap:anywhere]">
                      <div className="flex items-center gap-1.5 mb-0.5 text-[11.5px] font-[650] text-iris-fg">
                        {msg.fonte_envio === 'assistente'
                          ? <span className="iris-mark sm" aria-hidden />
                          : <Bot className="h-3.5 w-3.5" aria-hidden />}
                        <span>
                          {msg.fonte_envio === 'assistente' ? `${nomeAssistente ?? 'Assistente'} · IA` : 'IA Bot'}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words">
                        {msg.conteudo}
                      </p>
                      <p className="mono mt-0.5 text-[11px] text-muted-foreground text-right">
                        {originName && <span title={originIsSelected ? "Número de origem" : "Selecione este número acima para agir nesta mensagem"}>{originName} · </span>}{formatTime(msg.criado_em)}
                      </p>
                      <ReactionsDisplay reactions={msg.reactions} />
                    </div>
                  </div>
                )
              }

              // Sent by agent
              const isEditing = editingMsg?.id === msg.id
              const isCurrentSearchSent = showSearch && searchResults[searchIndex]?.id === msg.id
              const falhou = msg.status_envio === 'falha'
              const retry = originIsSelected && msg.enviado_por_agente && msg.conteudo ? () => sendMutation.mutate({
                conversation_id: msg.conversation_id,
                conteudo: msg.conteudo!,
                tipo: msg.tipo,
                media_url: msg.media_url ?? undefined,
              }) : undefined
              return (
                <SwipeableMessage key={msg.id} onSwipe={() => { if (originIsSelected) { setReplyTo(msg); textareaRef.current?.focus() } }} direction="left">
                <div id={`msg-${msg.id}`} className={cn("flex justify-end px-1 sm:px-2 py-0.5 rounded-md transition-colors duration-base", isCurrentSearchSent && "bg-warning-light")}>
                  {/* Balão da equipe (DS .msg-out): azul claro à direita; não enviada = cartão com borda vermelha */}
                  <div
                    className={cn(
                      'relative min-w-0 rounded-xl rounded-br-[4px] px-3 pt-2 pb-1.5 max-w-[84%] sm:max-w-[78%] text-foreground group/sent animate-row-in [overflow-wrap:anywhere]',
                      falhou
                        ? 'bg-card shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--danger)_65%,transparent)]'
                        : 'bg-primary-light shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_14%,transparent)]',
                    )}
                    onMouseEnter={() => setHoveredMsgId(msg.id)}
                    onMouseLeave={() => { if (reactionMsgId !== msg.id) setHoveredMsgId(null) }}
                  >
                    {/* Agent name label */}
                    {msg.fonte_envio === 'externo' ? (
                      <p className="text-[11.5px] font-[650] mb-0.5 flex items-center gap-1 text-warning">
                        <ExternalLink className="h-3 w-3" aria-hidden />
                        Enviado fora do {BRAND.appName}
                      </p>
                    ) : showAgentNameInPanel && msg.enviado_por_agente && msg.agente?.nome && (
                      <p className="text-[11.5px] font-[650] mb-0.5 text-fg-2">
                        {conversation?.chat_departments?.nome
                          ? `${conversation.chat_departments.nome} - ${msg.agente.nome}`
                          : msg.agente.nome}
                      </p>
                    )}
                    {msg.replied_message && !isEditing && (
                      <QuotedMessagePreview msg={msg.replied_message} contactName={contactName} />
                    )}
                    {isEditing ? (
                      /* Edit mode */
                      <div className="space-y-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          aria-label="Editar mensagem"
                          className="textarea !min-h-[60px] w-full min-w-0 !bg-card text-base sm:text-sm resize-none"
                          rows={2}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              if (editText.trim() && msg.message_id_wpp) {
                                editMsgMutation.mutate({
                                  instance_id: instance!.instance_id,
                                  message_id: msg.message_id_wpp,
                                  text: editText.trim(),
                                  conversation_id: conversationId,
                                })
                                setEditingMsg(null)
                              }
                            }
                            if (e.key === 'Escape') setEditingMsg(null)
                          }}
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingMsg(null)}
                            className="btn btn-ghost btn-sm"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (editText.trim() && msg.message_id_wpp) {
                                editMsgMutation.mutate({
                                  instance_id: instance!.instance_id,
                                  message_id: msg.message_id_wpp,
                                  text: editText.trim(),
                                  conversation_id: conversationId,
                                })
                                setEditingMsg(null)
                              }
                            }}
                            disabled={editMsgMutation.isPending}
                            className="btn btn-primary btn-sm"
                          >
                            Salvar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <MessageContent msg={msg} onImageClick={setLightboxUrl} />
                        <div className="mt-0.5 flex items-center justify-end gap-1">
                          <span className="mono text-[11px] text-muted-foreground">
                            {originName && <span title={originIsSelected ? "Número de origem" : "Selecione este número acima para agir nesta mensagem"}>{originName} · </span>}{formatTime(msg.criado_em)}
                          </span>
                          <MessageTicks status={msg.status_envio} />
                        </div>
                        {falhou && <FalhaEnvio onRetry={retry} tentando={sendMutation.isPending} />}
                        <ReactionsDisplay reactions={msg.reactions} />
                      </>
                    )}
                    {/* Hover action bar */}
                    {hoveredMsgId === msg.id && originIsSelected && !isEditing && instance && contact && (
                      <MessageActionBar
                        position="left"
                        onReply={() => { setReplyTo(msg); textareaRef.current?.focus() }}
                        onReact={() => setReactionMsgId(reactionMsgId === msg.id ? null : msg.id)}
                        onEdit={msg.tipo === 'texto' && msg.message_id_wpp ? () => {
                          setEditingMsg({ id: msg.id, wppId: msg.message_id_wpp!, text: msg.conteudo ?? '' })
                          setEditText(msg.conteudo ?? '')
                        } : undefined}
                        onDelete={msg.message_id_wpp ? () => {
                          setDeleteConfirmMsgId(msg.id)
                          setDeleteConfirmWppId(msg.message_id_wpp!)
                        } : undefined}
                      />
                    )}
                    {/* Emoji picker */}
                    {reactionMsgId === msg.id && msg.message_id_wpp && (
                      <EmojiReactionPicker
                        align="right"
                        onSelect={(emoji) => {
                          reactMutation.mutate({
                            instance_id: instance!.instance_id,
                            number: contact!.numero_whatsapp,
                            message_id: msg.message_id_wpp!,
                            conversation_id: conversationId,
                            emoji,
                          })
                          setReactionMsgId(null)
                        }}
                        onRemove={() => {
                          reactMutation.mutate({
                            instance_id: instance!.instance_id,
                            number: contact!.numero_whatsapp,
                            message_id: msg.message_id_wpp!,
                            conversation_id: conversationId,
                            emoji: '',
                          })
                          setReactionMsgId(null)
                        }}
                        onClose={() => { setReactionMsgId(null); setHoveredMsgId(null) }}
                      />
                    )}
                  </div>
                </div>
                </SwipeableMessage>
              )
            })}
          </div>
        ))}

        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center py-10">
            <EmptyState
              compact
              icon={MessageSquare}
              title="Nenhuma mensagem ainda"
              description={canSend && !isEncerrada ? 'Escreva abaixo para começar a conversa.' : undefined}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Reply preview bar ──────────────────────────────────────────── */}
      {replyTo && !isEncerrada && (
        <div className="shrink-0 px-2 sm:px-4 pt-2 animate-band-in">
          <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-primary bg-primary-light px-3 py-2">
            <Reply className="h-4 w-4 text-link shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-link truncate">
                {replyTo.enviado_por_agente
                  ? replyTo.agente?.nome ?? 'Estrategista'
                  : replyTo.enviado_por_ia
                    ? 'IA Bot'
                    : contactName ?? 'Cliente'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {replyTo.tipo === 'imagem' ? '📷 Imagem'
                  : replyTo.tipo === 'video' ? '🎥 Vídeo'
                  : replyTo.tipo === 'audio' ? '🎤 Áudio'
                  : replyTo.tipo === 'documento' ? '📄 Documento'
                  : replyTo.conteudo
                    ? replyTo.conteudo.length > 100 ? replyTo.conteudo.slice(0, 100) + '…' : replyTo.conteudo
                    : 'Mensagem'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="btn btn-ghost btn-icon btn-sm shrink-0"
              aria-label="Cancelar resposta"
            >
              <X aria-hidden />
            </button>
          </div>
        </div>
      )}

      {/* ── Typing indicator ──────────────────────────────────────────────── */}
      {typingNames.length > 0 && (
        <div className="shrink-0 px-4 py-1 flex items-center gap-2" aria-live="polite">
          <div className="flex gap-[3px] items-end h-3" aria-hidden>
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-xs text-muted-foreground">
            {typingNames.length === 1
              ? `${typingNames[0]} está digitando...`
              : `${typingNames.join(', ')} estão digitando...`}
          </span>
        </div>
      )}

      {/* ── Send error banner ─────────────────────────────────────────────── */}
      {(composerError || sendMutation.isError || noteMutation.isError) && (
        <div role="alert" className="shrink-0 mx-2 sm:mx-4 mt-2 rounded-lg bg-danger-light px-3 py-2 flex items-start gap-2 animate-band-in">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
          <span className="min-w-0 flex-1 text-[13px] text-danger font-medium">
            Não deu para enviar:{' '}
            {composerError ?? mensagemErro(sendMutation.error ?? noteMutation.error)}
          </span>
          <button
            type="button"
            onClick={() => { setComposerError(null); sendMutation.reset(); noteMutation.reset() }}
            className="btn btn-ghost btn-sm shrink-0 -my-1 text-danger"
          >
            Fechar
          </button>
        </div>
      )}

      {composerWarning && (
        <div role="status" className="shrink-0 mx-2 sm:mx-4 mt-2 rounded-lg bg-warning-light px-3 py-2 flex items-start gap-2 text-[13px] text-warning animate-band-in">
          <span className="min-w-0 flex-1">{composerWarning}</span>
          <button type="button" className="btn btn-ghost btn-sm shrink-0 -my-1 text-warning" onClick={() => setComposerWarning(null)}>Fechar</button>
        </div>
      )}

      {/* ── Campo de mensagem (DS .composer) ─────────────────────────────── */}
      <div className="shrink-0 px-2 sm:px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-4">
        {isEncerrada ? (
          <div className="flex items-center justify-center rounded-xl bg-bg-1 ring-hairline py-3">
            <p className="text-sm text-muted-foreground">Esta conversa foi encerrada</p>
          </div>
        ) : !canSend ? (
          <p className="rounded-xl bg-bg-1 ring-hairline py-3 px-3 text-center text-sm text-muted-foreground">Seu acesso a esta conversa é somente para consulta.</p>
        ) : filePreview ? (
          /* File preview mode */
          <FilePreviewBar
            preview={filePreview}
            caption={mediaCaption}
            onCaptionChange={setMediaCaption}
            onSend={handleSendMedia}
            onCancel={cancelFilePreview}
            sending={uploading || sendMutation.isPending}
          />
        ) : recorder.isRecording ? (
          /* Audio recording mode */
          <div className="flex items-center gap-2 rounded-xl bg-card ring-hairline px-3 py-2" role="status">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="h-3 w-3 shrink-0 rounded-full bg-danger animate-pulse" aria-hidden />
              <span className="text-sm font-medium text-danger">Gravando</span>
              <span className="mono text-sm text-muted-foreground">
                {recorder.formatDuration(recorder.duration)}
              </span>
            </div>
            <button
              type="button"
              onClick={recorder.cancelRecording}
              className="btn btn-secondary btn-icon shrink-0 text-danger"
              title="Cancelar gravação"
              aria-label="Cancelar gravação"
            >
              <Trash2 aria-hidden />
            </button>
            <button
              type="button"
              onClick={handleStopRecording}
              disabled={uploading}
              className="btn btn-primary btn-icon shrink-0"
              title="Enviar áudio"
              aria-label="Enviar áudio"
            >
              <Send aria-hidden />
            </button>
          </div>
        ) : (
          <div
            className={cn(
              'relative rounded-xl ring-hairline transition-[box-shadow,background-color] duration-base',
              noteMode
                ? 'bg-note focus-within:shadow-[0_0_0_1px_var(--warning),0_0_0_4px_rgb(168_90_6/.15)]'
                : 'bg-card focus-within:shadow-[0_0_0_1px_var(--ring),0_0_0_4px_var(--primary-glow)]',
            )}
          >
            {/* Abas do campo (DS .composer-tabs): responder no WhatsApp ou nota interna */}
            <div className="flex items-center gap-0.5 px-1.5 pt-1.5" role="group" aria-label="Tipo de mensagem">
              <button
                type="button"
                onClick={() => setNoteMode(false)}
                aria-pressed={!noteMode}
                className={cn(
                  'inline-flex h-8 sm:h-[26px] items-center gap-[5px] rounded-md px-2 text-[12.5px] font-semibold transition-colors duration-fast focus-ds',
                  !noteMode ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <MessageCircle className="h-[13px] w-[13px]" aria-hidden />
                <span className="sm:hidden">WhatsApp</span>
                <span className="hidden sm:inline">Responder no WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => setNoteMode(true)}
                aria-pressed={noteMode}
                title="Nota interna"
                className={cn(
                  'inline-flex h-8 sm:h-[26px] items-center gap-[5px] rounded-md px-2 text-[12.5px] font-semibold transition-colors duration-fast focus-ds',
                  noteMode ? 'bg-note-border/35 text-note-fg' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Lock className="h-[13px] w-[13px]" aria-hidden />
                Nota interna
              </button>
              {noteMode && (
                <span className="ml-auto hidden truncate pr-1 text-[12px] text-note-fg md:inline">
                  Não vai para o cliente
                </span>
              )}
            </div>

            {/* Celular: tudo numa linha (anexo · Íris · texto · enviar). A partir de 640 px:
                texto na linha de cima e ações no rodapé do campo, como no DS. */}
            <div className="relative flex flex-wrap items-end gap-1 px-1.5 pb-1.5">
              {/* Mention picker */}
              {mentionPicker && noteMode && (
                <MentionPicker
                  query={mentionPicker.query}
                  onSelect={handleSelectMention}
                />
              )}

              {/* Quick reply picker */}
              {showQuickReplies && (
                <QuickReplyPicker
                  replies={quickReplies}
                  search={quickReplySearch}
                  onSelect={handleSelectQuickReply}
                  onClose={() => setShowQuickReplies(false)}
                />
              )}

              {/* Attachment menu */}
              <div className="relative shrink-0" ref={attachMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  disabled={uploading || noteMode}
                  aria-expanded={showAttachMenu}
                  className={cn('btn btn-ghost btn-icon', showAttachMenu && 'bg-accent')}
                  title="Anexar arquivo"
                  aria-label="Anexar arquivo"
                >
                  <Paperclip aria-hidden />
                </button>

                {showAttachMenu && (
                  <div className="absolute bottom-full mb-2 left-0 z-20 flex flex-col gap-0.5 rounded-xl bg-popover p-1.5 shadow-pop ring-hairline w-[min(220px,calc(100vw-2rem))] max-h-[60dvh] overflow-y-auto animate-fade-in-up">
                    {([
                      { icone: Image, rotulo: 'Imagem', acao: () => handleFilePickerOpen('image/*') },
                      { icone: Video, rotulo: 'Vídeo', acao: () => handleFilePickerOpen('video/*') },
                      { icone: FileText, rotulo: 'Documento', acao: () => handleFilePickerOpen(ACCEPT_MAP.documento, 'documento') },
                      { icone: Mic, rotulo: 'Áudio', acao: () => handleFilePickerOpen('audio/*') },
                      null,
                      { icone: Contact, rotulo: 'Contato (vCard)', acao: () => { setShowAttachMenu(false); setSendContactOpen(true) } },
                      { icone: MapPin, rotulo: 'Localização', acao: () => { setShowAttachMenu(false); setSendLocationOpen(true) } },
                      { icone: List, rotulo: 'Menu interativo', acao: () => { setShowAttachMenu(false); setSendMenuOpen(true) } },
                      { icone: Video, rotulo: 'Videochamada', acao: () => { setShowAttachMenu(false); setStartMeetingOpen(true) } },
                    ] as const)
                      // Videochamada só com a sala de vídeo configurada (src/config/recursos.ts).
                      .filter((item) => item === null || item.rotulo !== 'Videochamada' || RECURSOS.reuniaoVideo)
                      .map((item, i) => item === null ? (
                      <div key={`sep-${i}`} className="border-t border-border my-1" />
                    ) : (
                      <button
                        key={item.rotulo}
                        type="button"
                        onClick={item.acao}
                        className="flex min-h-11 sm:min-h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-foreground hover:bg-accent transition-colors duration-fast focus-ds"
                      >
                        <item.icone className="h-4 w-4 text-link" aria-hidden />
                        {item.rotulo}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

              {/* Suggest reply */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (showSuggestions) {
                      setShowSuggestions(false)
                      return
                    }
                    suggestReplyMutation.mutate(conversationId, {
                      onSuccess: (data) => {
                        const items = data.suggestions ?? data.sugestoes ?? []
                        setSuggestions(Array.isArray(items) ? items : [])
                        setShowSuggestions(true)
                      },
                    })
                  }}
                  disabled={suggestReplyMutation.isPending || noteMode}
                  aria-expanded={showSuggestions}
                  aria-busy={suggestReplyMutation.isPending}
                  className={cn('btn btn-ghost btn-icon !text-iris-fg', showSuggestions && 'bg-iris-light')}
                  title="Sugerir resposta com IA"
                  aria-label="Sugerir resposta com IA"
                >
                  {suggestReplyMutation.isPending ? (
                    <span className="btn-spin !inline-block" aria-hidden />
                  ) : (
                    <Sparkles aria-hidden />
                  )}
                </button>
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute bottom-full mb-2 left-0 z-20 flex flex-col gap-0.5 rounded-xl bg-popover p-1.5 shadow-pop ring-hairline w-[min(400px,calc(100vw-2rem))] max-h-[60dvh] overflow-y-auto animate-fade-in-up">
                    <span className="t-h6 flex items-center gap-1.5 px-2 py-1 !text-iris-fg">
                      <span className="iris-mark sm" aria-hidden />
                      Sugestões de resposta
                    </span>
                    {suggestions.map((s, i) => {
                      const text = typeof s === 'string' ? s : s.text
                      const tone = typeof s === 'string' ? '' : s.tone
                      return (
                        <button
                          type="button"
                          key={i}
                          onClick={() => {
                            setInputValue(text)
                            setShowSuggestions(false)
                            textareaRef.current?.focus()
                          }}
                          className="min-h-11 sm:min-h-9 text-left rounded-md px-2.5 py-2 text-sm hover:bg-accent transition-colors duration-fast text-foreground focus-ds"
                        >
                          {text}
                          {tone && <span className="ml-2 text-[12px] text-muted-foreground">({tone})</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Text input */}
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value, e.target.selectionStart ?? undefined)}
                onKeyDown={handleKeyDown}
                aria-label={noteMode ? 'Nota interna' : 'Mensagem para o cliente'}
                placeholder={
                  noteMode
                    ? (isMobile ? 'Só a equipe vê… (@)' : 'Só a equipe vê. Use @ para chamar alguém.')
                    : (isMobile ? 'Mensagem…' : 'Escreva a resposta… (/ para respostas prontas)')
                }
                rows={1}
                className={cn(
                  'min-w-0 flex-1 resize-none bg-transparent px-2 sm:px-2.5 py-2.5 sm:order-first sm:basis-full',
                  'text-base sm:text-[14px] leading-[1.45] text-foreground placeholder:text-fg-placeholder',
                  'focus:outline-none',
                  'min-h-11 max-h-32',
                )}
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.currentTarget
                  target.style.height = 'auto'
                  target.style.height = `${Math.min(target.scrollHeight, 128)}px`
                }}
              />

              <span className="hidden sm:order-1 sm:block sm:flex-1" aria-hidden />

              {/* Send or Record button */}
              {inputValue.trim() || noteMode ? (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isSending || !inputValue.trim()}
                  aria-busy={isSending}
                  className="btn btn-primary shrink-0 max-sm:w-11 max-sm:px-0 sm:order-2"
                  title={noteMode ? 'Salvar nota interna' : 'Enviar mensagem'}
                  aria-label={noteMode ? 'Salvar nota interna' : 'Enviar mensagem'}
                >
                  {uploading ? (
                    <span className="btn-spin !inline-block" aria-hidden />
                  ) : (
                    <Send aria-hidden />
                  )}
                  <span className="hidden sm:inline">{noteMode ? 'Salvar nota' : 'Enviar'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartRecording}
                  className="btn btn-ghost btn-icon shrink-0 sm:order-2"
                  title="Gravar áudio"
                  aria-label="Gravar áudio"
                >
                  <Mic aria-hidden />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CSAT sent toast */}
      {/* Aviso "pesquisa enviada": no toaster do DS (acima da barra inferior no celular,
          ao lado da barra lateral no computador) — nunca sobre o campo de mensagem. */}
      {csatSentToast && (
        <div className="toaster" aria-live="polite">
          <div role="status" className="flex items-center gap-2.5 rounded-xl bg-popover px-4 py-3 shadow-pop ring-hairline animate-toast-in">
            <Star className="h-4 w-4 shrink-0 text-success" aria-hidden />
            <span className="text-sm font-medium text-foreground">Pesquisa de satisfação enviada.</span>
          </div>
        </div>
      )}

      {/* Resumo da conversa: Modal do DS (vira sheet no celular, altura em dvh) */}
      <Modal
        open={summaryText !== null}
        onClose={() => setSummaryText(null)}
        title="Resumo da conversa"
        size="sm"
      >
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{summaryText}</p>
      </Modal>

      {/* Close conversation confirm dialog */}
      <ConfirmDialog
        open={closeDialogOpen}
        onClose={() => setCloseDialogOpen(false)}
        onConfirm={() => {
          closeMutation.mutate(conversationId, {
            onSuccess: () => setCloseDialogOpen(false),
          })
        }}
        title="Encerrar conversa"
        description="Tem certeza que deseja encerrar esta conversa? Esta ação não pode ser desfeita."
        confirmLabel="Encerrar"
        loading={closeMutation.isPending}
      />

      <TransferDialog
        open={transferDialogOpen}
        onClose={() => setTransferDialogOpen(false)}
        conversationId={conversationId}
        currentAgenteId={conversation.agente_id}
        currentDepartmentId={conversation.department_id}
      />

      {/* Delete message confirm dialog */}
      <ConfirmDialog
        open={Boolean(deleteConfirmMsgId)}
        onClose={() => { setDeleteConfirmMsgId(null); setDeleteConfirmWppId(null) }}
        onConfirm={() => {
          if (deleteConfirmWppId && instance) {
            deleteMsgMutation.mutate(
              {
                instance_id: instance.instance_id,
                message_id: deleteConfirmWppId,
                conversation_id: conversationId,
              },
              { onSuccess: () => { setDeleteConfirmMsgId(null); setDeleteConfirmWppId(null) } },
            )
          }
        }}
        title="Apagar mensagem"
        description="Tem certeza que deseja apagar esta mensagem para todos? Esta ação não pode ser desfeita."
        confirmLabel="Apagar"
        loading={deleteMsgMutation.isPending}
      />

      {/* Send Contact Dialog */}
      {instance && contact && (
        <SendContactDialog
          open={sendContactOpen}
          onClose={() => setSendContactOpen(false)}
          instanceId={instance.instance_id}
          conversationId={conversationId}
          contactNumber={contact.numero_whatsapp}
        />
      )}

      {/* Send Location Dialog */}
      {instance && contact && (
        <SendLocationDialog
          open={sendLocationOpen}
          onClose={() => setSendLocationOpen(false)}
          instanceId={instance.instance_id}
          conversationId={conversationId}
          contactNumber={contact.numero_whatsapp}
        />
      )}

      {/* Send Menu Dialog */}
      {instance && contact && (
        <SendMenuDialog
          open={sendMenuOpen}
          onClose={() => setSendMenuOpen(false)}
          instanceId={instance.instance_id}
          conversationId={conversationId}
          contactNumber={contact.numero_whatsapp}
        />
      )}

      {/* Start Meeting Dialog */}
      {contact && RECURSOS.reuniaoVideo && (
        <StartMeetingDialog
          open={startMeetingOpen}
          onClose={() => setStartMeetingOpen(false)}
          conversationId={conversationId}
          clientId={contactClientId || null}
          contactName={contactName}
          contactNumber={contact.numero_whatsapp}
        />
      )}

      {/* Chat Details Overlay */}
      {chatDetailsData && (
        <ChatDetailsOverlay
          details={chatDetailsData}
          onClose={() => setChatDetailsData(null)}
        />
      )}

      {/* Image Lightbox */}
      {lightboxUrl && (
        <ImageLightbox
          src={lightboxUrl}
          alt="Imagem ampliada"
          onClose={() => setLightboxUrl(null)}
        />
      )}

      {/* Group Members Modal */}
      <GroupMembersModal
        open={showMembersModal}
        members={groupMembers}
        groupName={contactName}
        onClose={() => setShowMembersModal(false)}
      />
    </div>
  )
}

// ── Group Members Modal ────────────────────────────────────────────────────────

function GroupMembersModal({
  open,
  members,
  groupName,
  onClose,
}: {
  open: boolean
  members: GroupMember[]
  groupName: string
  onClose: () => void
}) {
  const admins = members.filter((m) => m.is_admin || m.is_super_admin)
  const regular = members.filter((m) => !m.is_admin && !m.is_super_admin)

  return (
    <Modal open={open} onClose={onClose} title="Membros do grupo" description={`${groupName} · ${members.length} membros`} size="sm">
      <div className="-mx-4 -mb-4 sm:-mx-[18px] divide-y divide-stroke-weak">
        {members.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            Nenhum membro encontrado.<br />Reabra o painel para atualizar.
          </p>
        ) : (
          <>
            {admins.length > 0 && (
              <>
                <p className="t-h6 px-4 py-2 bg-bg-0">
                  Administradores ({admins.length})
                </p>
                {admins.map((m) => <MemberRow key={m.id} member={m} />)}
              </>
            )}
            {regular.length > 0 && (
              <>
                {admins.length > 0 && (
                  <p className="t-h6 px-4 py-2 bg-bg-0">
                    Membros ({regular.length})
                  </p>
                )}
                {regular.map((m) => <MemberRow key={m.id} member={m} />)}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

function MemberRow({ member }: { member: GroupMember }) {
  const initials = (member.nome ?? member.numero_whatsapp).slice(0, 2).toUpperCase()
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors duration-fast">
      <div className="av av-lg !h-8 !w-8 text-xs" data-h="0" aria-hidden>
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">
          {member.nome ?? formatPhone(member.numero_whatsapp)}
        </p>
        {member.nome && (
          <p className="mono text-[12px] text-muted-foreground truncate">
            {formatPhone(member.numero_whatsapp)}
          </p>
        )}
      </div>
      {(member.is_admin || member.is_super_admin) && (
        <ShieldCheck
          className="h-4 w-4 shrink-0 text-link"
          aria-label={member.is_super_admin ? 'Administrador principal' : 'Administrador'}
        />
      )}
    </div>
  )
}
