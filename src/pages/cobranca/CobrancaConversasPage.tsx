import { useState, useMemo, useRef, useEffect } from 'react'
import { MessageSquare, Search, Send, CheckCircle, XCircle, ArrowLeft } from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  useCobrancaConversations,
  useCobrancaMessages,
  useSendCobrancaMessage,
  useUpdateConversationStatus,
} from '@/hooks/useCobranca'
import type { CobrancaConversation } from '@/hooks/useCobranca'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type StatusFilter = 'todas' | 'aberta' | 'respondida' | 'encerrada'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'aberta', label: 'Abertas' },
  { value: 'respondida', label: 'Respondidas' },
  { value: 'encerrada', label: 'Encerradas' },
]

const STATUS_COLORS: Record<string, string> = {
  aberta: 'bg-info-light text-info',
  respondida: 'bg-success-light text-success',
  encerrada: 'bg-muted text-muted-foreground',
}

const STATUS_LABELS: Record<string, string> = {
  aberta: 'Aberta',
  respondida: 'Respondida',
  encerrada: 'Encerrada',
}

function formatRelativeTime(iso: string | null) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getInitials(name: string | null | undefined) {
  const source = name ?? '??'
  return source.slice(0, 2).toUpperCase()
}

// ─── Conversation Item ────────────────────────────────────────────────────────

interface ConversationItemProps {
  conversation: CobrancaConversation
  selected: boolean
  onClick: () => void
}

function ConversationItem({ conversation, selected, onClick }: ConversationItemProps) {
  const devedor = conversation.cobranca_devedores
  const name = devedor?.nome ?? 'Desconhecido'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
        'hover:bg-muted/50 border-b border-border/50',
        'border-l-2',
        selected
          ? 'bg-primary-muted border-l-primary'
          : 'border-l-transparent',
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary font-semibold text-sm">
        {getInitials(devedor?.nome)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <span className="text-2xs text-muted-foreground shrink-0">
            {formatRelativeTime(conversation.ultima_mensagem_em)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {conversation.ultima_mensagem ?? 'Sem mensagens'}
          </p>
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-medium',
              STATUS_COLORS[conversation.status],
            )}
          >
            {STATUS_LABELS[conversation.status]}
          </span>
        </div>
      </div>
    </button>
  )
}

// ─── Conversation Detail ──────────────────────────────────────────────────────

function ConversationDetail({ conversation, onBack }: { conversation: CobrancaConversation; onBack?: () => void }) {
  const devedor = conversation.cobranca_devedores
  const { data: messages = [], isLoading } = useCobrancaMessages(conversation.id)
  const sendMessage = useSendCobrancaMessage()
  const updateStatus = useUpdateConversationStatus()
  const [text, setText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || !devedor) return
    sendMessage.mutate({
      conversationId: conversation.id,
      conteudo: trimmed,
      devedorNumero: devedor.numero_whatsapp,
      instanceId: conversation.instance_id,
    })
    setText('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors sm:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {devedor?.nome ?? 'Desconhecido'}
          </h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{formatPhone(devedor?.numero_whatsapp)}</span>
            <span>{formatCurrency(devedor?.valor_divida)}</span>
          </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conversation.status !== 'respondida' && (
            <button
              onClick={() => updateStatus.mutate({ id: conversation.id, status: 'respondida' })}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <CheckCircle className="h-3.5 w-3.5 text-success" />
              Respondida
            </button>
          )}
          {conversation.status !== 'encerrada' && (
            <button
              onClick={() => updateStatus.mutate({ id: conversation.id, status: 'encerrada' })}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <XCircle className="h-3.5 w-3.5 text-danger" />
              Encerrar
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma mensagem nesta conversa</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex',
                msg.enviado_por_agente ? 'justify-end' : 'justify-start',
              )}
            >
              <div
                className={cn(
                  'max-w-[70%] rounded-2xl px-4 py-2.5',
                  msg.enviado_por_agente
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted text-foreground rounded-bl-md',
                )}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{msg.conteudo}</p>
                <p
                  className={cn(
                    'mt-1 text-right text-2xs',
                    msg.enviado_por_agente ? 'text-primary-foreground/70' : 'text-muted-foreground',
                  )}
                >
                  {formatMessageTime(msg.criado_em)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {conversation.status !== 'encerrada' && (
        <div className="flex items-center gap-2 border-t border-border p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            rows={1}
            className={cn(
              'flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2',
              'text-sm placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
            )}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sendMessage.isPending}
            className={cn(
              'flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg transition-colors',
              'gradient-primary text-primary-foreground',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CobrancaConversasPage() {
  const isMobile = useIsMobile()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas')

  const { data: conversations = [], isLoading } = useCobrancaConversations(
    statusFilter !== 'todas' ? { status: statusFilter } : undefined,
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations
    const q = search.toLowerCase()
    return conversations.filter((c) => {
      const name = c.cobranca_devedores?.nome?.toLowerCase() ?? ''
      const phone = c.cobranca_devedores?.numero_whatsapp?.toLowerCase() ?? ''
      return name.includes(q) || phone.includes(q)
    })
  }, [conversations, search])

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null

  return (
    <div className="flex h-full overflow-hidden -m-3 sm:-m-4 lg:-m-6">
      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div className={cn(
        'flex shrink-0 flex-col border-r border-border',
        isMobile
          ? selectedConversation ? 'hidden' : 'w-full'
          : 'w-64 sm:w-72 lg:w-80',
      )}>
        {/* Search */}
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar devedor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                'w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3',
                'text-sm placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
              )}
            />
          </div>
        </div>

        {/* Status chips */}
        <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                statusFilter === f.value
                  ? 'gradient-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            filtered.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                selected={selectedId === c.id}
                onClick={() => setSelectedId(c.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <div className={cn(
        'flex flex-1 flex-col overflow-hidden',
        isMobile && !selectedConversation && 'hidden',
      )}>
        {selectedConversation ? (
          <ConversationDetail
            conversation={selectedConversation}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Selecione uma conversa"
              description="Escolha uma conversa na lista ao lado para visualizar as mensagens do devedor."
              className="border-none bg-transparent shadow-none"
            />
          </div>
        )}
      </div>
    </div>
  )
}
