import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send, UserCheck, X, Bot, Mic, Image, FileText, Video,
  Paperclip, StickyNote, User, Users, Trash2, Download, File,
  ArrowRightLeft, Check, CheckCheck, Sparkles, Star, MessageSquare,
  Smartphone, ExternalLink, Smile, Pencil, MoreVertical,
  MapPin, Contact, List, ChevronDown, ZoomIn, Ban, Building, Search, Link2,
  Reply, AtSign, Loader2, RotateCcw, ShieldCheck, Play, Pause,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useUsers, useAssignments, useMyClientIds, useMyInstanceIds } from '@/hooks/useUsers'
import { useClientes } from '@/hooks/useClientes'
import { useAppSettings } from '@/hooks/useAppSettings'
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
import type { ChatMessage, QuickReply, MessageReaction, ChatDepartment, GroupMember } from '@/hooks/useChat'

interface ConversationViewProps {
  conversationId: string
  onToggleContactPanel?: () => void
  contactPanelOpen?: boolean
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
  const { user: authUser } = useAuth()
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
  const estrategistas = users.filter(u => u.ativo && (u.perfil === 'estrategista' || (u.perfil === 'gerente' && gerentesComClientes.has(u.id))))
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
      <div className="border-b border-border">
        <button
          onClick={() => setExpanded(true)}
          className="flex w-full items-center gap-2 px-3 py-1.5 bg-muted/50 text-xs"
        >
          <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground font-medium">
            {currentDeptName
              ? <><span className="text-foreground">{currentDeptName}</span>{currentAgenteName && <> · <span className="text-primary">{currentAgenteName}</span></>}</>
              : 'Atribuir'}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
        </button>
      </div>
    )
  }

  return (
    <div className="border-b border-border">
      {!onlyTransfer && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 flex-wrap">
          {isMobile && (
            <button onClick={() => setExpanded(false)} className="shrink-0 text-muted-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="text-xs font-medium text-muted-foreground shrink-0">
            {currentDeptName
              ? <><span className="text-foreground">{currentDeptName}</span>{currentAgenteName && <> · <span className="text-primary">{currentAgenteName}</span></>} —</>
              : 'Atribuir a:'}
          </span>
          <div className="flex flex-wrap gap-1.5 flex-1">
            {activeDepts.map(dept => (
              <button
                key={dept.id}
                onClick={() => handleQuickRoute(dept.id)}
                disabled={transfer.isPending || dept.id === currentDepartmentId}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50',
                  dept.id === currentDepartmentId
                    ? 'bg-primary/15 border-primary/30 text-primary'
                    : 'bg-muted hover:bg-muted/80 border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {dept.id === currentDepartmentId ? dept.nome : `→ ${dept.nome}`}
              </button>
            ))}
          </div>
          {podeAtribuirEstrategistaDireto && (
            <button
              onClick={() => setShowEstrategistas(v => !v)}
              className={cn(
                'shrink-0 text-xs font-medium underline transition-colors',
                showEstrategistas ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Atribuir a estrategista
            </button>
          )}
        </div>
      )}

      {showEstrategistas && podeAtribuirEstrategistaDireto && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 flex-wrap">
          <span className="text-xs font-medium text-primary shrink-0">Estrategista:</span>
          <div className="flex flex-wrap gap-1.5 flex-1">
            {estrategistas.map(u => (
              <button
                key={u.id}
                onClick={() => handleTransferTo(u.id)}
                disabled={transfer.isPending || u.id === currentAgenteId}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50',
                  u.id === currentAgenteId
                    ? u.perfil === 'gerente'
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-700 dark:text-amber-300'
                      : 'bg-primary/15 border-primary/30 text-primary'
                    : u.perfil === 'gerente'
                      ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-700 dark:text-amber-300'
                      : 'bg-primary/10 hover:bg-primary/20 border-primary/20 text-primary',
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
          className="inline-flex items-center gap-0.5 rounded-full bg-white/80 dark:bg-white/10 border border-border px-1.5 py-0.5 text-xs shadow-sm"
        >
          {emoji}
          {count > 1 && <span className="text-[10px] text-muted-foreground">{count}</span>}
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
      className="mb-1.5 rounded-lg border-l-[3px] border-primary/60 bg-black/5 dark:bg-white/5 px-2.5 py-1.5 cursor-pointer hover:bg-black/8 dark:hover:bg-white/8 transition-colors"
    >
      <p className="text-xs font-semibold text-primary truncate">{senderName}</p>
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
        'bg-white/90 dark:bg-[#233138]/90 backdrop-blur-sm',
        'shadow-[0_1px_6px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_6px_rgba(0,0,0,0.3)]',
        'border border-black/[0.06] dark:border-white/[0.08]',
        'animate-fade-in',
        position === 'left' ? 'left-1.5' : 'right-1.5',
      )}
    >
      <button
        onClick={onReply}
        className="flex h-7 w-7 items-center justify-center rounded-full text-[#54656f] dark:text-[#aebac1] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors"
        title="Responder"
      >
        <Reply className="h-[15px] w-[15px]" />
      </button>
      <button
        onClick={onReact}
        className="flex h-7 w-7 items-center justify-center rounded-full text-[#54656f] dark:text-[#aebac1] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors"
        title="Reagir"
      >
        <Smile className="h-[15px] w-[15px]" />
      </button>
      {onEdit && (
        <button
          onClick={onEdit}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#54656f] dark:text-[#aebac1] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors"
          title="Editar"
        >
          <Pencil className="h-[14px] w-[14px]" />
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#54656f] dark:text-[#aebac1] hover:bg-red-500/10 dark:hover:bg-red-400/10 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          title="Apagar para todos"
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
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
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

const EXT_COLORS: Record<string, string> = {
  PDF: '#E53E3E',
  DOC: '#2B6CB0', DOCX: '#2B6CB0',
  XLS: '#276749', XLSX: '#276749',
  PPT: '#C05621', PPTX: '#C05621',
  ZIP: '#6B46C1', RAR: '#6B46C1',
  TXT: '#718096', CSV: '#718096',
}

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
    <div className="flex items-center gap-2.5 min-w-[210px]">
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
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white hover:bg-[#00a884]/90 transition-colors"
      >
        {playing ? <Pause className="h-4 w-4 fill-white" /> : <Play className="h-4 w-4 fill-white" />}
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
          className="w-full h-[3px] cursor-pointer accent-[#00a884] rounded-full"
        />
        <span className="text-[11px] text-[#667781] dark:text-[#8696a0] tabular-nums">
          {playing ? fmt(current) : duration > 0 ? fmt(duration) : fmt(current)}
        </span>
      </div>
    </div>
  )
}

function MessageContent({ msg, onImageClick }: { msg: ChatMessage; onImageClick?: (url: string) => void }) {
  if (msg.tipo === 'audio') {
    const isPlayable = msg.media_url && !msg.media_url.includes('.enc')
    return (
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884]/15 dark:bg-[#00a884]/20">
          <Mic className="h-4 w-4 text-[#00a884]" />
        </div>
        {isPlayable ? (
          <AudioPlayer src={msg.media_url!} />
        ) : (
          <div className="flex flex-col flex-1 gap-0.5 min-w-[160px]">
            <span className="text-sm font-medium">Mensagem de voz</span>
            {msg.media_url && (
              <a
                href={msg.media_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
              >
                <Download className="h-3 w-3" /> Baixar áudio
              </a>
            )}
          </div>
        )}
      </div>
    )
  }
  if (msg.tipo === 'imagem' && msg.media_url) {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => onImageClick?.(msg.media_url!)}
          className="group relative text-left cursor-zoom-in"
        >
          <img src={msg.media_url} alt="imagem" crossOrigin="anonymous" className="max-w-[220px] sm:max-w-[260px] rounded-lg" loading="lazy" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors">
            <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
          </div>
        </button>
        {msg.conteudo && <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{msg.conteudo}</p>}
      </div>
    )
  }
  if (msg.tipo === 'video') {
    if (msg.media_url) {
      return (
        <div className="flex flex-col gap-1.5">
          <video src={msg.media_url} controls crossOrigin="anonymous" className="max-w-[240px] sm:max-w-[280px] rounded-lg" preload="metadata" />
          {msg.conteudo && <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{msg.conteudo}</p>}
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2">
        <Video className="h-4 w-4 shrink-0 text-[#8696a0]" />
        <span className="text-sm italic text-[#8696a0]">[vídeo não disponível]</span>
      </div>
    )
  }
  if (msg.tipo === 'documento') {
    const ext = getFileExtension(msg.media_url, 'DOC')
    const fileName = msg.conteudo || 'Documento'
    const extColor = EXT_COLORS[ext] ?? '#00a884'
    return (
      <div className="flex items-center gap-3 rounded-xl bg-black/5 dark:bg-white/5 p-3 min-w-[200px] sm:min-w-[240px] max-w-[280px] sm:max-w-[320px]">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${extColor}15` }}>
          <FileText className="h-5 w-5" style={{ color: extColor }} />
          <span
            className="absolute -bottom-1 -right-1 rounded px-1 py-0.5 text-[8px] font-bold text-white leading-none"
            style={{ backgroundColor: extColor }}
          >
            {ext}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{fileName}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Documento {getFileExtLabel(msg.media_url ?? '')}
          </p>
          {msg.media_url ? (
            <a
              href={msg.media_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline mt-1"
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
      <div className="flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2">
        <Image className="h-4 w-4 shrink-0 text-[#8696a0]" />
        <span className="text-sm italic text-[#8696a0]">Imagem indisponível</span>
      </div>
    )
  }
  // Fallback: tipo desconhecido com media
  if (msg.media_url && !msg.conteudo) {
    const ext = getFileExtension(msg.media_url)
    return (
      <div className="flex items-center gap-3 rounded-xl bg-black/5 dark:bg-white/5 p-3 min-w-[200px]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <File className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Arquivo{ext ? ` ${ext}` : ''}</p>
          <a
            href={msg.media_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline mt-0.5"
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
      <div className="flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2">
        <File className="h-4 w-4 shrink-0 text-[#8696a0]" />
        <span className="text-sm italic text-[#8696a0]">{mediaType} indisponível</span>
      </div>
    )
  }

  // Deleted message — styled indicator
  if (msg.conteudo?.includes('Mensagem apagada')) {
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        <Ban className="h-3.5 w-3.5 opacity-50 shrink-0" />
        <span className="text-[13px] italic opacity-50">
          Mensagem apagada
        </span>
      </div>
    )
  }

  return (
    <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
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
        className="underline text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 break-all"
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

const SENDER_COLORS = [
  '#25d366', '#00a884', '#53bdeb', '#7c94b6', '#e6855e',
  '#d4a574', '#a38fdb', '#e88da0', '#5cc7c0', '#c0965e',
]

function getSenderColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length]
}

function parseGroupSender(conteudo: string | null): { sender: string | null; text: string | null } {
  if (!conteudo) return { sender: null, text: null }
  const match = conteudo.match(/^\[([^\]]+)\]\s?(.*)$/s)
  if (match) return { sender: match[1], text: match[2] || null }
  return { sender: null, text: conteudo }
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
    imagem: <Image className="h-5 w-5 text-primary" />,
    video: <Video className="h-5 w-5 text-primary" />,
    audio: <Mic className="h-5 w-5 text-primary" />,
    documento: <File className="h-5 w-5 text-primary" />,
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        {preview.tipo === 'imagem' && preview.previewUrl ? (
          <img src={preview.previewUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
        ) : preview.tipo === 'video' && preview.previewUrl ? (
          <video src={preview.previewUrl} className="h-16 w-16 rounded-lg object-cover" muted />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10">
            {iconMap[preview.tipo] ?? <File className="h-5 w-5 text-primary" />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{preview.file.name}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(preview.file.size)}</p>
        </div>
        <button onClick={onCancel} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-muted transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {['imagem', 'video', 'documento'].includes(preview.tipo) && (
        <input
          type="text"
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          placeholder={preview.tipo === 'documento' ? 'Nome do arquivo (opcional)' : 'Legenda (opcional)'}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSend() } }}
        />
      )}

      <button
        onClick={onSend}
        disabled={sending}
        className={cn(
          'flex items-center justify-center gap-2 rounded-xl px-4 py-2',
          'gradient-primary text-primary-foreground text-sm font-medium',
          'transition-opacity disabled:opacity-50',
        )}
      >
        {sending ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {sending ? 'Enviando...' : 'Enviar'}
      </button>
    </div>
  )
}

// ─── Audio Recorder Hook ───────────────────────────────────────────────────────

function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mediaRecorder.start(100)
      setIsRecording(true)
      setDuration(0)
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000)
    } catch (err) {
      console.error('Failed to start recording:', err)
    }
  }, [])

  const stopRecording = useCallback((): Promise<globalThis.File | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder || recorder.state === 'inactive') { resolve(null); return }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const file = new globalThis.File([blob], `audio_${Date.now()}.webm`, { type: 'audio/webm' })
        recorder.stream.getTracks().forEach((t) => t.stop())
        resolve(file)
      }
      recorder.stop()
      setIsRecording(false)
      if (timerRef.current) clearInterval(timerRef.current)
    })
  }, [])

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
      recorder.stream.getTracks().forEach((t) => t.stop())
    }
    setIsRecording(false)
    setDuration(0)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  const formatDuration = useCallback((s: number) => {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }, [])

  return { isRecording, duration, startRecording, stopRecording, cancelRecording, formatDuration }
}

// ─── Message Ticks (delivery status) ─────────────────────────────────────────

function MessageTicks({ status, onRetry }: { status?: string | null; onRetry?: () => void }) {
  if (status === 'falha') {
    return (
      <button
        onClick={onRetry}
        disabled={!onRetry}
        title="Reenviar mensagem"
        className="text-red-500 hover:text-red-400 transition-colors disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    )
  }
  if (status === 'enviando') {
    return <Loader2 className="h-3.5 w-3.5 text-[#667781] dark:text-[#8696a0] animate-spin" />
  }
  if (status === 'lida') {
    return <CheckCheck className="h-[18px] w-[18px] text-[#53bdeb]" />
  }
  if (status === 'entregue') {
    return <CheckCheck className="h-[18px] w-[18px] text-[#667781] dark:text-[#8696a0]" />
  }
  // enviada
  return <Check className="h-4 w-4 text-[#667781] dark:text-[#8696a0]" />
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
      className="absolute bottom-full mb-2 left-0 right-0 z-50 rounded-xl border border-border bg-card shadow-xl overflow-hidden max-h-64 overflow-y-auto"
    >
      {filteredUsers.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/40">
            <User className="h-3 w-3" /> Usuários
          </div>
          {filteredUsers.map((u) => {
            const idx = allItems.findIndex((it) => it.id === u.id && it.type === 'user')
            return (
              <button
                key={u.id}
                onClick={() => onSelect(u.nome ?? '', 'user', u.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                  idx === activeIndex ? 'bg-violet-50 dark:bg-violet-900/30' : 'hover:bg-muted',
                )}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/50 shrink-0">
                  <User className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                </span>
                <span className="font-medium">{u.nome}</span>
                <span className="ml-auto text-[11px] text-muted-foreground capitalize">{u.perfil}</span>
              </button>
            )
          })}
        </div>
      )}
      {filteredContacts.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/40">
            <Contact className="h-3 w-3" /> Contatos
          </div>
          {filteredContacts.map((c) => {
            const idx = allItems.findIndex((it) => it.id === c.id && it.type === 'contact')
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.nome ?? '', 'contact', c.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                  idx === activeIndex ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'hover:bg-muted',
                )}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 shrink-0">
                  <Contact className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </span>
                <span className="font-medium">{c.nome}</span>
                {c.numero_whatsapp && (
                  <span className="ml-auto text-[11px] text-muted-foreground">{formatPhone(c.numero_whatsapp)}</span>
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
  conversationId,
  onToggleContactPanel,
  contactPanelOpen,
}: ConversationViewProps) {
  const { user } = useAuth()
  const { can } = usePermissoes()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { data: appSettings } = useAppSettings()
  const showAgentNameInPanel = appSettings?.chat_mostrar_nome_agente_painel !== 'false'
  const { data: conversation, isLoading: convLoading } = useConversation(conversationId)
  const { data: messages = [], isLoading: msgLoading } = useMessages(conversationId)
  const { data: instance } = useInstance(conversation?.instance_id ?? '')
  useRealtimeMessages(conversationId)

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

  const [inputValue, setInputValue] = useState('')
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [noteMode, setNoteMode] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editNoteText, setEditNoteText] = useState('')
  const [mentionPicker, setMentionPicker] = useState<{ query: string; atPos: number } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [quickReplySearch, setQuickReplySearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [filePreview, setFilePreview] = useState<FilePreviewData | null>(null)
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
        setMentionIndex(0)
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
      if (type === 'user') {
        navigate('/chat/equipe')
      } else {
        navigate(`/chat?cliente=${encodeURIComponent(name)}`)
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
              'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[13px] font-semibold transition-colors',
              isUser
                ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-800/50'
                : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/50',
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

  function handleSend() {
    const text = inputValue.trim()
    if (!text || isEncerrada || isSending) return

    if (noteMode) {
      if (!user) return
      noteMutation.mutate({ conversation_id: conversationId, conteudo: text, agente_id: user.id })
    } else {
      sendMutation.mutate({
        conversation_id: conversationId,
        conteudo: text,
        reply_to_id: replyTo?.id,
      })
    }
    setInputValue('')
    setReplyTo(null)

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
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
    if (!file || isEncerrada) return
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

  async function handleSendMedia() {
    if (!filePreview || uploading || sendMutation.isPending) return
    setUploading(true)
    try {
      const publicUrl = await uploadChatMedia(filePreview.file, conversationId)
      const caption = mediaCaption.trim() || (filePreview.tipo === 'documento' ? filePreview.file.name : '')
      sendMutation.mutate({
        conversation_id: conversationId,
        conteudo: caption,
        tipo: filePreview.tipo,
        media_url: publicUrl,
        reply_to_id: replyTo?.id,
      })
      setReplyTo(null)
      if (filePreview.previewUrl) URL.revokeObjectURL(filePreview.previewUrl)
      setFilePreview(null)
      setMediaCaption('')
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  function cancelFilePreview() {
    if (filePreview?.previewUrl) URL.revokeObjectURL(filePreview.previewUrl)
    setFilePreview(null)
    setMediaCaption('')
  }

  // ── Audio recording ──────────────────────────────────────────────────────────

  async function handleStopRecording() {
    const audioFile = await recorder.stopRecording()
    if (!audioFile) return
    setUploading(true)
    try {
      const publicUrl = await uploadChatMedia(audioFile, conversationId)
      sendMutation.mutate({
        conversation_id: conversationId,
        conteudo: recorder.formatDuration(recorder.duration),
        tipo: 'audio',
        media_url: publicUrl,
      })
    } catch (err) {
      console.error('Audio upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  // ── Assign ─────────────────────────────────────────────────────────────────

  function handleAssign() {
    if (!user) return
    assignMutation.mutate({ id: conversationId, agente_id: user.id })
  }

  // ── Loading / Empty ────────────────────────────────────────────────────────

  if (convLoading || msgLoading) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!conversation) return null

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
        <div className="flex items-center justify-between h-[52px] sm:h-[59px] px-2 sm:px-4">
          {/* Left: Avatar + Name */}
          <div
            role="button"
            tabIndex={0}
            onClick={onToggleContactPanel}
            onKeyDown={(e) => e.key === 'Enter' && onToggleContactPanel?.()}
            className="flex items-center gap-3 min-w-0 flex-1 group cursor-pointer"
          >
            {isGroupConv ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary">
                <Users className="h-5 w-5" />
              </div>
            ) : contact?.foto_url && !headerImgFailed ? (
              <img
                src={contact.foto_url}
                alt={contactName}
                className="h-10 w-10 shrink-0 rounded-full object-cover"
                onError={() => setHeaderImgFailed(true)}
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary font-semibold text-sm">
                {contactName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-foreground group-hover:underline decoration-1 underline-offset-2">
                {contactName}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground leading-[18px] min-w-0">
                {isGroupConv ? (
                  <>
                    {contact?.group_size != null && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowMembersModal(true) }}
                        className="text-muted-foreground hover:text-primary hover:underline underline-offset-2 transition-colors"
                      >
                        {contact.group_size} membros
                      </button>
                    )}
                    {conversation.sla_primeira_resposta_violado && (
                      <span className="rounded px-1 py-0.5 text-2xs font-bold bg-danger-light text-danger leading-none">SLA 1ª resp.</span>
                    )}
                    {conversation.sla_resolucao_violado && (
                      <span className="rounded px-1 py-0.5 text-2xs font-bold bg-danger-light text-danger leading-none">SLA resolução</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="truncate">{formatPhone(contact?.numero_whatsapp)}</span>
                    {conversation.sla_primeira_resposta_violado && (
                      <span className="shrink-0 rounded px-1 py-0.5 text-2xs font-bold bg-danger-light text-danger leading-none">SLA 1ª resp.</span>
                    )}
                    {conversation.sla_resolucao_violado && (
                      <span className="shrink-0 rounded px-1 py-0.5 text-2xs font-bold bg-danger-light text-danger leading-none">SLA resolução</span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Link contact to client — button + dropdown (hidden on mobile) */}
          <div className="relative shrink-0 hidden sm:block" ref={linkClientRef}>
            {contactClientId ? (
              <button
                onClick={() => setShowLinkClient(!showLinkClient)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                  showLinkClient
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                title={`Vinculado: ${headerClientName ?? 'Cliente'}`}
              >
                <Building className="h-3.5 w-3.5" />
                <span className="font-medium hidden sm:inline max-w-[120px] truncate">{headerClientName ?? 'Cliente'}</span>
              </button>
            ) : (
              <button
                onClick={() => setShowLinkClient(!showLinkClient)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2 py-1 text-2xs font-medium transition-colors',
                  showLinkClient
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                title="Vincular contato a um cliente"
              >
                <Link2 className="h-3 w-3" />
                <span className="hidden sm:inline">Vincular cliente</span>
              </button>
            )}
            {showLinkClient && (
              <div className="absolute right-0 top-full mt-1 z-30 rounded-xl border border-border bg-card shadow-lg w-[280px] py-1">
                {/* If already linked, show confirmation first */}
                {contactClientId && !linkClientSearch.trim() && (
                  <div className="px-3 py-2.5 border-b border-border space-y-2">
                    <div className="flex items-center gap-2">
                      <Building className="h-3.5 w-3.5 text-accent shrink-0" />
                      <span className="text-xs font-medium text-foreground truncate">{headerClientName}</span>
                    </div>
                    <p className="text-2xs text-muted-foreground">Este contato já está vinculado. Busque abaixo para trocar ou desvincule.</p>
                    <button
                      onClick={handleUnlinkClient}
                      className="flex items-center gap-1.5 w-full rounded-md px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <X className="h-3 w-3" />
                      Desvincular
                    </button>
                  </div>
                )}
                <div className="px-2 py-1.5">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={linkClientSearch}
                      onChange={(e) => setLinkClientSearch(e.target.value)}
                      placeholder={contactClientId ? 'Buscar para trocar...' : 'Buscar cliente...'}
                      className="w-full rounded-lg border border-input bg-background pl-7 pr-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-[220px] overflow-y-auto">
                  {/* Confirm swap overlay */}
                  {confirmSwap && (
                    <div className="px-3 py-3 space-y-2 border-b border-border bg-warning/5">
                      <p className="text-xs text-foreground">
                        Trocar de <strong>{headerClientName}</strong> para <strong>{confirmSwap.nome}</strong>?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            handleLinkClient(confirmSwap.id)
                            setConfirmSwap(null)
                          }}
                          className="flex-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                          Confirmar troca
                        </button>
                        <button
                          onClick={() => setConfirmSwap(null)}
                          className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {linkableClients.length === 0 && linkClientSearch.trim() && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum cliente encontrado</p>
                  )}
                  {!confirmSwap && linkableClients.map((c) => (
                    <button
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
                        'flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-muted transition-colors text-left',
                        c.id === contactClientId && 'bg-accent/10 text-accent font-medium',
                      )}
                    >
                      <Building className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{c.nome}</span>
                      {c.id === contactClientId && <span className="ml-auto text-2xs text-accent">atual</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Instance indicator + picker (hidden on mobile) */}
          {instance && (
            <div className="relative shrink-0 mr-2 hidden sm:block" ref={instancePickerRef}>
              <button
                onClick={() => setShowInstancePicker(!showInstancePicker)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-1 text-2xs font-medium transition-colors',
                  showInstancePicker
                    ? 'bg-primary-muted text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                title={`Enviando via ${instance.nome}${instance.numero_whatsapp ? ` (${formatPhone(instance.numero_whatsapp)})` : ''} — clique para trocar`}
              >
                <Smartphone className="h-3 w-3" />
                <span className="max-w-[100px] truncate">{instance.nome}</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', showInstancePicker && 'rotate-180')} />
              </button>

              {showInstancePicker && allInstances.length > 1 && (
                <div className="absolute right-0 top-full mt-1 z-20 rounded-xl border border-border bg-card shadow-lg min-w-[240px] py-1 max-h-[280px] overflow-y-auto">
                  <span className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
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
                          'w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-left',
                          isCurrent && 'bg-primary-muted',
                          isOff && 'opacity-60 cursor-not-allowed hover:bg-transparent',
                        )}
                      >
                        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                          <div className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full',
                            isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
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
                          <p className={cn('text-sm font-medium flex items-center gap-1.5', isCurrent && 'text-primary')}>
                            <span className="truncate">{inst.nome}</span>
                            <span className={cn(
                              'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                              isOff
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                            )}>
                              {isOff ? 'Off' : 'On'}
                            </span>
                          </p>
                          {inst.numero_whatsapp && (
                            <p className="text-[11px] text-muted-foreground font-mono">{formatPhone(inst.numero_whatsapp)}</p>
                          )}
                        </div>
                        {isCurrent && (
                          <Check className="h-4 w-4 text-primary shrink-0" />
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
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                showSearch ? 'text-primary bg-primary-muted' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              title="Buscar mensagens"
            >
              <Search className="h-[18px] w-[18px]" />
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
              className="hidden sm:flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
              title="Resumir conversa"
            >
              {summarizeMutation.isPending ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <FileText className="h-[18px] w-[18px]" />
              )}
            </button>

            {/* Contact panel */}
            {onToggleContactPanel && (
              <button
                onClick={onToggleContactPanel}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                  contactPanelOpen
                    ? 'text-primary bg-primary-muted'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                title="Painel do contato"
              >
                <User className="h-[18px] w-[18px]" />
              </button>
            )}

            {/* More actions dropdown — mobile only */}
            <div className="relative sm:hidden" ref={chatActionsRef}>
              <button
                onClick={() => setShowChatActions(!showChatActions)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Mais opções"
              >
                <MoreVertical className="h-[18px] w-[18px]" />
              </button>
              {showChatActions && (
                <div className="absolute right-0 top-full mt-1 z-20 flex flex-col rounded-lg border border-border bg-card shadow-lg min-w-[200px] py-1">
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
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
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
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                          >
                            <UserCheck className="h-4 w-4 text-muted-foreground" />
                            Atribuir a...
                            <ChevronDown className={cn('h-3 w-3 ml-auto text-muted-foreground transition-transform', showAssignSubmenu && 'rotate-180')} />
                          </button>
                          {showAssignSubmenu && (
                            <div className="border-t border-border bg-muted/30">
                              {/* Quick: atribuir a mim */}
                              <button
                                onClick={() => { handleAssign(); setShowChatActions(false); setShowAssignSubmenu(false) }}
                                disabled={assignMutation.isPending}
                                className={cn(
                                  'w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50',
                                  conversation.agente_id === user?.id ? 'text-primary font-medium' : 'text-foreground',
                                )}
                              >
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
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
                                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
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
                                        'w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50',
                                        conversation.agente_id === agent.id ? 'text-primary font-medium' : 'text-foreground',
                                      )}
                                    >
                                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary text-[10px] font-bold">
                                        {agent.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                      </div>
                                      <div className="min-w-0 flex-1 text-left">
                                        <p className="text-sm truncate">{agent.nome}</p>
                                        <p className="text-[10px] text-muted-foreground">{agent.perfil}</p>
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
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          <UserCheck className="h-4 w-4 text-muted-foreground" />
                          Atribuir a mim
                        </button>
                      )}
                      <button
                        onClick={() => { setTransferDialogOpen(true); setShowChatActions(false) }}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                        Atribuir
                      </button>
                      <button
                        onClick={() => { setCloseDialogOpen(true); setShowChatActions(false) }}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-muted transition-colors"
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
                            onSuccess: () => {
                              setCsatSentToast(true)
                              setTimeout(() => setCsatSentToast(false), 3000)
                              setShowChatActions(false)
                            },
                          },
                        )
                      }}
                      disabled={csatMutation.isPending || csatAlreadySent}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
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
        <div className="shrink-0 border-b border-border bg-card px-3 py-2 flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
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
            placeholder="Buscar nas mensagens..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {searchQuery.trim().length >= 2 && (
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
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
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted transition-colors"
                title="Anterior"
              >
                <ChevronDown className="h-4 w-4 rotate-180" />
              </button>
              <button
                onClick={() => {
                  const next = (searchIndex + 1) % searchResults.length
                  setSearchIndex(next)
                  document.getElementById(`msg-${searchResults[next].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }}
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted transition-colors"
                title="Próximo"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchIndex(0) }}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
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
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-6 py-4 space-y-1 chat-bg">
        {groupsWithDivider.map((group) => (
          <div key={group.label} className="space-y-1">
            {/* Day separator */}
            <div className="flex justify-center py-3">
              <span className="rounded-lg bg-white/80 dark:bg-white/10 px-4 py-1.5 text-xs font-medium text-[#54656f] dark:text-[#8696a0] shadow-sm backdrop-blur-sm">
                {group.label}
              </span>
            </div>

            {group.items.map((item, itemIndex) => {
              // Divisor "X novas mensagens" estilo WhatsApp
              if ('_divider' in item) {
                return (
                  <div key="__unread_divider__" ref={firstUnreadRef} className="flex items-center gap-3 py-3 px-2">
                    <div className="flex-1 h-px bg-[#25d366]/50 dark:bg-[#25d366]/30" />
                    <span className="shrink-0 rounded-full border border-[#25d366]/40 bg-[#25d366]/10 dark:bg-[#25d366]/10 px-3 py-1 text-[12px] font-medium text-[#128c7e] dark:text-[#25d366]">
                      {item.count} {item.count === 1 ? 'nova mensagem' : 'novas mensagens'}
                    </span>
                    <div className="flex-1 h-px bg-[#25d366]/50 dark:bg-[#25d366]/30" />
                  </div>
                )
              }
              const msg = item
              // Internal note
              if (msg.tipo === 'nota_interna') {
                const isEditingThis = editingNoteId === msg.id
                return (
                  <div key={msg.id} className="flex justify-center px-4 py-1 group/note">
                    <div className="rounded-xl bg-[#fff3cd]/90 dark:bg-amber-950/50 border border-amber-200/60 dark:border-amber-800/30 px-4 py-2.5 max-w-[85%] shadow-sm backdrop-blur-sm w-full">
                      <div className="flex items-center gap-1.5 mb-1">
                        <StickyNote className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                          Nota interna
                        </span>
                        {!isEditingThis && (
                          <button
                            onClick={() => { setEditingNoteId(msg.id); setEditNoteText(msg.conteudo ?? '') }}
                            className="ml-auto opacity-0 group-hover/note:opacity-100 transition-opacity flex items-center gap-1 text-[11px] text-amber-600/70 dark:text-amber-500/70 hover:text-amber-700 dark:hover:text-amber-400"
                          >
                            <Pencil className="h-3 w-3" />
                            Editar
                          </button>
                        )}
                      </div>
                      {isEditingThis ? (
                        <div className="space-y-2">
                          <textarea
                            value={editNoteText}
                            onChange={(e) => setEditNoteText(e.target.value)}
                            className="w-full resize-none rounded-lg px-3 py-2 text-[14px] text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-900/30 ring-1 ring-amber-300 dark:ring-amber-700 focus:outline-none focus:ring-2"
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
                              onClick={() => setEditingNoteId(null)}
                              className="text-xs text-amber-600/70 hover:text-amber-700 px-2 py-1 rounded transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              disabled={updateNoteMutation.isPending || !editNoteText.trim()}
                              onClick={() => {
                                updateNoteMutation.mutate(
                                  { id: msg.id, conteudo: editNoteText.trim(), conversation_id: conversationId },
                                  { onSuccess: () => setEditingNoteId(null) },
                                )
                              }}
                              className="text-xs font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white px-3 py-1 rounded-lg transition-colors"
                            >
                              {updateNoteMutation.isPending ? 'Salvando…' : 'Salvar'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[15px] leading-relaxed text-amber-900 dark:text-amber-100 whitespace-pre-wrap break-words">
                          {renderNoteContent(msg.conteudo ?? '')}
                        </p>
                      )}
                      <p className="mt-1.5 text-[11px] text-amber-600/70 dark:text-amber-500/70 text-right">
                        {formatTime(msg.criado_em)}
                      </p>
                    </div>
                  </div>
                )
              }

              // Received message (customer)
              if (!msg.enviado_por_agente && !msg.enviado_por_ia) {
                const { sender: groupSender, text: groupText } = isGroupConv
                  ? parseGroupSender(msg.conteudo)
                  : { sender: null, text: msg.conteudo }
                const senderColor = groupSender ? getSenderColor(groupSender) : undefined
                const displayMsg = isGroupConv && groupSender
                  ? { ...msg, conteudo: groupText }
                  : msg

                // Check if same sender as previous message (for grouping)
                const prevItem = itemIndex > 0 ? group.items[itemIndex - 1] : null
                const prevMsg = prevItem && !('_divider' in prevItem) ? prevItem : null
                const prevSender = isGroupConv && prevMsg && !prevMsg.enviado_por_agente && !prevMsg.enviado_por_ia
                  ? parseGroupSender(prevMsg.conteudo).sender
                  : null
                const isSameSender = isGroupConv && !!groupSender && groupSender === prevSender

                const isSearchMatch = showSearch && searchResults.some(r => r.id === msg.id)
                const isCurrentSearch = isSearchMatch && searchResults[searchIndex]?.id === msg.id
                return (
                  <SwipeableMessage key={msg.id} onSwipe={() => { setReplyTo(msg); textareaRef.current?.focus() }} direction="right">
                  <div id={`msg-${msg.id}`} className={cn("flex justify-start px-2 gap-2 rounded transition-colors", isSameSender ? "py-[1px]" : "py-0.5", isCurrentSearch && "bg-warning/20")}>
                    {isGroupConv && (
                      groupSender ? (
                        isSameSender ? (
                          <div className="w-7 shrink-0" />
                        ) : (
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-[10px] font-bold mt-1"
                            style={{ backgroundColor: senderColor }}
                            title={groupSender}
                          >
                            {groupSender.slice(0, 2).toUpperCase()}
                          </div>
                        )
                      ) : (
                        <div className="w-7 shrink-0" />
                      )
                    )}
                    <div
                      className={cn(
                        "relative bg-white dark:bg-[#202c33] px-3 py-2 max-w-[75%] shadow-sm text-[#111b21] dark:text-[#e9edef] group/msg",
                        isSameSender ? "rounded-xl" : "rounded-xl rounded-tl-sm",
                      )}
                      onMouseEnter={() => setHoveredMsgId(msg.id)}
                      onMouseLeave={() => { if (reactionMsgId !== msg.id) setHoveredMsgId(null) }}
                    >
                      {isGroupConv && groupSender && !isSameSender && (
                        <p className="text-xs font-semibold mb-0.5" style={{ color: senderColor }}>
                          {groupSender}
                        </p>
                      )}
                      {msg.replied_message && (
                        <QuotedMessagePreview msg={msg.replied_message} contactName={contactName} />
                      )}
                      <MessageContent msg={displayMsg} onImageClick={setLightboxUrl} />
                      <p className="mt-1 text-[11px] text-[#667781] dark:text-[#8696a0] text-right">
                        {formatTime(msg.criado_em)}
                      </p>
                      <ReactionsDisplay reactions={msg.reactions} />
                      {/* Hover action bar */}
                      {hoveredMsgId === msg.id && instance && contact && (
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
                  <div id={`msg-${msg.id}`} key={msg.id} className={cn("flex justify-start px-2 py-0.5 rounded transition-colors", isCurrentSearchIa && "bg-warning/20")}>
                    <div className="relative rounded-xl rounded-tl-sm bg-[#f0f4ff] dark:bg-[#1a2332] px-3 py-2 max-w-[75%] shadow-sm border border-blue-100/50 dark:border-blue-900/30">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Bot className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">IA Bot</span>
                      </div>
                      <p className="text-[15px] leading-relaxed text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap break-words">
                        {msg.conteudo}
                      </p>
                      <p className="mt-1 text-[11px] text-[#667781] dark:text-[#8696a0] text-right">
                        {formatTime(msg.criado_em)}
                      </p>
                      <ReactionsDisplay reactions={msg.reactions} />
                    </div>
                  </div>
                )
              }

              // Sent by agent
              const isEditing = editingMsg?.id === msg.id
              const isCurrentSearchSent = showSearch && searchResults[searchIndex]?.id === msg.id
              return (
                <SwipeableMessage key={msg.id} onSwipe={() => { setReplyTo(msg); textareaRef.current?.focus() }} direction="left">
                <div id={`msg-${msg.id}`} className={cn("flex justify-end px-2 py-0.5 rounded transition-colors", isCurrentSearchSent && "bg-warning/20")}>
                  <div
                    className="relative rounded-xl rounded-tr-sm bg-[#d9fdd3] dark:bg-[#005c4b] px-3 py-2 max-w-[75%] shadow-sm group/sent"
                    onMouseEnter={() => setHoveredMsgId(msg.id)}
                    onMouseLeave={() => { if (reactionMsgId !== msg.id) setHoveredMsgId(null) }}
                  >
                    {/* Agent name label */}
                    {msg.fonte_envio === 'externo' ? (
                      <p className="text-xs font-semibold mb-0.5 flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <ExternalLink className="h-3 w-3" />
                        Enviado fora do OMNX Desk
                      </p>
                    ) : showAgentNameInPanel && msg.enviado_por_agente && msg.agente?.nome && (
                      <p className="text-xs font-semibold mb-0.5 text-emerald-700 dark:text-emerald-400">
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
                          className="w-full min-w-0 rounded-lg border border-primary/30 bg-white/50 dark:bg-black/20 px-2 py-1.5 text-sm text-[#111b21] dark:text-[#e9edef] focus:outline-none resize-none"
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
                            onClick={() => setEditingMsg(null)}
                            className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-black/10 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
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
                            className="rounded px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            Salvar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-[#111b21] dark:text-[#e9edef]">
                          <MessageContent msg={msg} onImageClick={setLightboxUrl} />
                        </div>
                        <div className="mt-1 flex items-center justify-end gap-1">
                          <span className="text-[11px] text-[#667781] dark:text-[#8696a0]">
                            {formatTime(msg.criado_em)}
                          </span>
                          <MessageTicks
                            status={msg.status_envio}
                            onRetry={msg.enviado_por_agente && msg.conteudo ? () => sendMutation.mutate({
                              conversation_id: msg.conversation_id,
                              conteudo: msg.conteudo!,
                              tipo: msg.tipo,
                              media_url: msg.media_url ?? undefined,
                            }) : undefined}
                          />
                        </div>
                        <ReactionsDisplay reactions={msg.reactions} />
                      </>
                    )}
                    {/* Hover action bar */}
                    {hoveredMsgId === msg.id && !isEditing && instance && contact && (
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
                        onSelect={(emoji) => {
                          reactMutation.mutate({
                            instance_id: instance!.instance_id,
                            number: contact!.numero_whatsapp,
                            message_id: msg.message_id_wpp!,
                            emoji,
                          })
                          setReactionMsgId(null)
                        }}
                        onRemove={() => {
                          reactMutation.mutate({
                            instance_id: instance!.instance_id,
                            number: contact!.numero_whatsapp,
                            message_id: msg.message_id_wpp!,
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
          <div className="flex h-full items-center justify-center py-16">
            <div className="rounded-xl bg-white/80 dark:bg-white/10 px-6 py-4 shadow-sm backdrop-blur-sm text-center">
              <MessageSquare className="mx-auto mb-2 h-8 w-8 text-[#8696a0]" />
              <p className="text-sm text-[#667781] dark:text-[#8696a0]">Nenhuma mensagem ainda</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Reply preview bar ──────────────────────────────────────────── */}
      {replyTo && !isEncerrada && (
        <div className="shrink-0 bg-card border-t border-border px-3 sm:px-4 pt-2">
          <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-primary bg-primary/5 px-3 py-2">
            <Reply className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary truncate">
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
              onClick={() => setReplyTo(null)}
              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* ── Typing indicator ──────────────────────────────────────────────── */}
      {typingNames.length > 0 && (
        <div className="shrink-0 px-4 py-1 flex items-center gap-2">
          <div className="flex gap-[3px] items-end h-3">
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
      {sendMutation.isError && (
        <div className="shrink-0 bg-danger/10 border-t border-danger/20 px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-danger font-medium">
            Falha ao enviar:{' '}
            {sendMutation.error instanceof Error
              ? sendMutation.error.message
              : 'Erro desconhecido'}
          </span>
          <button
            onClick={() => sendMutation.reset()}
            className="ml-auto text-xs text-danger underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* ── Input bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-card border-t border-border px-3 sm:px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        {isEncerrada ? (
          <div className="flex items-center justify-center py-2">
            <p className="text-sm text-muted-foreground">Esta conversa foi encerrada</p>
          </div>
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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="h-3 w-3 rounded-full bg-danger animate-pulse" />
              <span className="text-sm font-medium text-danger">Gravando</span>
              <span className="text-sm text-muted-foreground font-mono">
                {recorder.formatDuration(recorder.duration)}
              </span>
            </div>
            <button
              onClick={recorder.cancelRecording}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-muted transition-colors"
              title="Cancelar gravação"
            >
              <Trash2 className="h-4 w-4 text-danger" />
            </button>
            <button
              onClick={handleStopRecording}
              disabled={uploading}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                'gradient-primary text-primary-foreground',
                'transition-opacity disabled:opacity-40',
              )}
              title="Enviar áudio"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Note mode indicator */}
            {noteMode && (
              <div className="flex items-center gap-1.5 px-1">
                <StickyNote className="h-3 w-3 text-amber-500" />
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Modo nota interna — esta mensagem não será enviada ao contato
                </span>
              </div>
            )}

            <div className="relative flex items-end gap-2">
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
              <div className="relative" ref={attachMenuRef}>
                <button
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  disabled={uploading || noteMode}
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
                  title="Anexar arquivo"
                >
                  <Paperclip className="h-5 w-5" />
                </button>

                {showAttachMenu && (
                  <div className="absolute bottom-12 left-0 z-10 flex flex-col gap-1 rounded-xl border border-border bg-card p-2 shadow-lg min-w-[140px] sm:min-w-[160px]">
                    <button
                      onClick={() => handleFilePickerOpen('image/*')}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      <Image className="h-4 w-4 text-primary" />
                      Imagem
                    </button>
                    <button
                      onClick={() => handleFilePickerOpen('video/*')}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      <Video className="h-4 w-4 text-primary" />
                      Vídeo
                    </button>
                    <button
                      onClick={() => handleFilePickerOpen(ACCEPT_MAP.documento, 'documento')}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      <FileText className="h-4 w-4 text-primary" />
                      Documento
                    </button>
                    <button
                      onClick={() => handleFilePickerOpen('audio/*')}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      <Mic className="h-4 w-4 text-primary" />
                      Áudio
                    </button>
                    <div className="border-t border-border my-1" />
                    <button
                      onClick={() => { setShowAttachMenu(false); setSendContactOpen(true) }}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      <Contact className="h-4 w-4 text-primary" />
                      Contato (vCard)
                    </button>
                    <button
                      onClick={() => { setShowAttachMenu(false); setSendLocationOpen(true) }}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      <MapPin className="h-4 w-4 text-primary" />
                      Localização
                    </button>
                    <button
                      onClick={() => { setShowAttachMenu(false); setSendMenuOpen(true) }}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      <List className="h-4 w-4 text-primary" />
                      Menu interativo
                    </button>
                    <button
                      onClick={() => { setShowAttachMenu(false); setStartMeetingOpen(true) }}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      <Video className="h-4 w-4 text-primary" />
                      Videochamada
                    </button>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

              {/* Suggest reply */}
              <div className="relative">
                <button
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
                  className={cn(
                    'flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full transition-colors',
                    showSuggestions
                      ? 'bg-primary/10 text-primary'
                      : 'text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5',
                    'disabled:opacity-40',
                  )}
                  title="Sugerir resposta (IA)"
                >
                  {suggestReplyMutation.isPending ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Sparkles className="h-5 w-5" />
                  )}
                </button>
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute bottom-12 left-0 z-10 flex flex-col gap-1 rounded-xl border border-border bg-card p-2 shadow-lg min-w-[200px] sm:min-w-[280px] max-w-[calc(100vw-2rem)] sm:max-w-[400px]">
                    <span className="px-2 py-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Sugestões de resposta
                    </span>
                    {suggestions.map((s, i) => {
                      const text = typeof s === 'string' ? s : s.text
                      const tone = typeof s === 'string' ? '' : s.tone
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            setInputValue(text)
                            setShowSuggestions(false)
                            textareaRef.current?.focus()
                          }}
                          className="text-left rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors text-foreground"
                        >
                          {text}
                          {tone && <span className="ml-2 text-2xs text-muted-foreground">({tone})</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Note toggle */}
              <button
                onClick={() => setNoteMode((prev) => !prev)}
                className={cn(
                  'flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full transition-colors',
                  noteMode
                    ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                    : 'text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5',
                )}
                title="Nota interna"
              >
                <StickyNote className="h-5 w-5" />
              </button>

              {/* Text input */}
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value, e.target.selectionStart ?? undefined)}
                onKeyDown={handleKeyDown}
                placeholder={
                  noteMode
                    ? (isMobile ? 'Nota interna... (@)' : 'Escreva uma nota interna... (@ para mencionar alguém)')
                    : (isMobile ? 'Mensagem...' : 'Digite uma mensagem... (/ para respostas rápidas)')
                }
                rows={1}
                className={cn(
                  'flex-1 resize-none rounded-lg px-4 py-2.5',
                  'text-[15px] text-[#111b21] dark:text-[#e9edef] placeholder:text-[#8696a0]',
                  'focus:outline-none',
                  'min-h-[42px] max-h-32 transition-colors',
                  noteMode
                    ? 'bg-amber-50 dark:bg-amber-950/20 ring-1 ring-amber-300 dark:ring-amber-700'
                    : 'bg-white dark:bg-[#2a3942] ring-0',
                )}
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.currentTarget
                  target.style.height = 'auto'
                  target.style.height = `${Math.min(target.scrollHeight, 128)}px`
                }}
              />

              {/* Send or Record button */}
              {inputValue.trim() ? (
                <button
                  onClick={handleSend}
                  disabled={isSending}
                  className={cn(
                    'flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-40',
                    noteMode
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-[#00a884] hover:bg-[#008f72] text-white',
                  )}
                  title="Enviar mensagem"
                >
                  {uploading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </button>
              ) : !noteMode ? (
                <button
                  onClick={recorder.startRecording}
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  title="Gravar áudio"
                >
                  <Mic className="h-5 w-5" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isSending}
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-amber-500 text-white hover:bg-amber-600 transition-all disabled:opacity-40"
                >
                  <Send className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CSAT sent toast */}
      {csatSentToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-success/30 bg-success-light px-4 py-3 shadow-lg animate-fade-in">
          <Star className="h-4 w-4 text-success" />
          <span className="text-sm font-medium text-success">Pesquisa CSAT enviada com sucesso!</span>
        </div>
      )}

      {/* Summary overlay */}
      {summaryText !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Resumo da conversa</h3>
              </div>
              <button
                onClick={() => setSummaryText(null)}
                className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{summaryText}</p>
          </div>
        </div>
      )}

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
        description="Tem certeza que deseja apagar esta mensagem para todos? Esta acao nao pode ser desfeita."
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
      {contact && (
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
      {showMembersModal && (
        <GroupMembersModal
          members={groupMembers}
          groupName={contactName}
          onClose={() => setShowMembersModal(false)}
        />
      )}
    </div>
  )
}

// ── Group Members Modal ────────────────────────────────────────────────────────

function GroupMembersModal({
  members,
  groupName,
  onClose,
}: {
  members: GroupMember[]
  groupName: string
  onClose: () => void
}) {
  const admins = members.filter((m) => m.is_admin || m.is_super_admin)
  const regular = members.filter((m) => !m.is_admin && !m.is_super_admin)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-void/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex flex-col w-full max-w-sm max-h-[80vh] rounded-xl bg-card border border-border shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Membros do grupo</h3>
            <p className="text-xs text-muted-foreground truncate max-w-[220px]">{groupName} · {members.length} membros</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {members.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              Nenhum membro encontrado.<br />Reabra o painel para atualizar.
            </p>
          ) : (
            <>
              {admins.length > 0 && (
                <>
                  <p className="px-4 py-2 text-2xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                    Admins ({admins.length})
                  </p>
                  {admins.map((m) => <MemberRow key={m.id} member={m} />)}
                </>
              )}
              {regular.length > 0 && (
                <>
                  {admins.length > 0 && (
                    <p className="px-4 py-2 text-2xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                      Membros ({regular.length})
                    </p>
                  )}
                  {regular.map((m) => <MemberRow key={m.id} member={m} />)}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MemberRow({ member }: { member: GroupMember }) {
  const initials = (member.nome ?? member.numero_whatsapp).slice(0, 2).toUpperCase()
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary text-xs font-semibold">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">
          {member.nome ?? formatPhone(member.numero_whatsapp)}
        </p>
        {member.nome && (
          <p className="text-2xs text-muted-foreground font-mono truncate">
            {formatPhone(member.numero_whatsapp)}
          </p>
        )}
      </div>
      {(member.is_admin || member.is_super_admin) && (
        <ShieldCheck
          className="h-4 w-4 shrink-0 text-primary"
          title={member.is_super_admin ? 'Super Admin' : 'Admin'}
        />
      )}
    </div>
  )
}
