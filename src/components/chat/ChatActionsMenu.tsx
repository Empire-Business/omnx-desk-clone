import { useState } from 'react'
import {
  Archive, Pin, VolumeX, Ban, Search, Info,
  Volume2, ArchiveRestore, PinOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useArchiveChat,
  usePinChat,
  useMuteChat,
  useBlockContact,
  useChatDetails,
  useFindMessages,
  useToggleMute,
} from '@/hooks/useChat'

interface ChatActionsMenuProps {
  instanceId: string
  contactNumber: string
  conversationId?: string
  silenciado?: boolean
  onClose: () => void
  onShowDetails?: (details: Record<string, unknown>) => void
  onShowMessages?: (messages: unknown[]) => void
  /** When true, renders items inline without absolute wrapper (for embedding inside another dropdown) */
  inline?: boolean
}

export function ChatActionsMenu({
  instanceId,
  contactNumber,
  conversationId,
  silenciado = false,
  onClose,
  onShowDetails,
  onShowMessages,
  inline = false,
}: ChatActionsMenuProps) {
  const archiveMutation = useArchiveChat()
  const pinMutation = usePinChat()
  const muteMutation = useMuteChat()
  const blockMutation = useBlockContact()
  const detailsMutation = useChatDetails()
  const findMessagesMutation = useFindMessages()
  const toggleMuteMutation = useToggleMute()

  const [showMuteOptions, setShowMuteOptions] = useState(false)
  const [isArchived, setIsArchived] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)

  const isPending = archiveMutation.isPending || pinMutation.isPending ||
    muteMutation.isPending || blockMutation.isPending || detailsMutation.isPending

  function handleArchive() {
    archiveMutation.mutate(
      { instance_id: instanceId, number: contactNumber, archive: !isArchived },
      { onSuccess: () => { setIsArchived(!isArchived); onClose() } },
    )
  }

  function handlePin() {
    pinMutation.mutate(
      { instance_id: instanceId, number: contactNumber, pin: !isPinned },
      { onSuccess: () => { setIsPinned(!isPinned); onClose() } },
    )
  }

  function handleMute(hours: number) {
    muteMutation.mutate(
      { instance_id: instanceId, number: contactNumber, hours },
      {
        onSuccess: () => {
          // Also toggle silenciado in local DB
          if (conversationId) {
            const shouldMute = hours > 0
            if (shouldMute !== silenciado) {
              toggleMuteMutation.mutate({ id: conversationId, silenciado })
            }
          }
          setShowMuteOptions(false)
          onClose()
        },
      },
    )
  }

  function handleBlock() {
    blockMutation.mutate(
      { instance_id: instanceId, number: contactNumber, block: !isBlocked },
      { onSuccess: () => { setIsBlocked(!isBlocked); onClose() } },
    )
  }

  function handleDetails() {
    detailsMutation.mutate(
      { instance_id: instanceId, number: contactNumber },
      { onSuccess: (data) => { onShowDetails?.(data); onClose() } },
    )
  }

  function handleFindMessages() {
    findMessagesMutation.mutate(
      { instance_id: instanceId, number: contactNumber, limit: 50 },
      { onSuccess: (data) => { onShowMessages?.(data?.messages ?? data ?? []); onClose() } },
    )
  }

  const wrapperClass = inline
    ? ''
    : 'absolute right-0 top-full mt-1 z-30 min-w-[200px] rounded-xl border border-border bg-card shadow-xl backdrop-blur-sm animate-fade-in'

  return (
    <div className={wrapperClass}>
      <div className={inline ? '' : 'py-1'}>
        {/* Archive */}
        <button
          onClick={handleArchive}
          disabled={isPending}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          {isArchived ? <ArchiveRestore className="h-4 w-4 text-muted-foreground" /> : <Archive className="h-4 w-4 text-muted-foreground" />}
          {isArchived ? 'Desarquivar' : 'Arquivar'}
        </button>

        {/* Pin */}
        <button
          onClick={handlePin}
          disabled={isPending}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          {isPinned ? <PinOff className="h-4 w-4 text-muted-foreground" /> : <Pin className="h-4 w-4 text-muted-foreground" />}
          {isPinned ? 'Desafixar' : 'Fixar conversa'}
        </button>

        {/* Mute */}
        <div className="relative">
          <button
            onClick={() => setShowMuteOptions(!showMuteOptions)}
            disabled={isPending}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            <VolumeX className="h-4 w-4 text-muted-foreground" />
            Silenciar
          </button>
          {showMuteOptions && (
            inline ? (
              <div className="border-l-2 border-border ml-6 pl-2 py-1">
                <button onClick={() => handleMute(8)} className="w-full px-3 py-1.5 text-sm hover:bg-muted text-left">8 horas</button>
                <button onClick={() => handleMute(168)} className="w-full px-3 py-1.5 text-sm hover:bg-muted text-left">1 semana</button>
                <button onClick={() => handleMute(999999)} className="w-full px-3 py-1.5 text-sm hover:bg-muted text-left">Permanente</button>
                <div className="border-t border-border my-0.5" />
                <button onClick={() => handleMute(0)} className="w-full px-3 py-1.5 text-sm hover:bg-muted text-left flex items-center gap-2">
                  <Volume2 className="h-3.5 w-3.5" /> Reativar som
                </button>
              </div>
            ) : (
              <div className="absolute right-full top-0 mr-1 min-w-[160px] rounded-lg border border-border bg-card shadow-lg">
                <button onClick={() => handleMute(8)} className="w-full px-3 py-2 text-sm hover:bg-muted text-left">8 horas</button>
                <button onClick={() => handleMute(168)} className="w-full px-3 py-2 text-sm hover:bg-muted text-left">1 semana</button>
                <button onClick={() => handleMute(999999)} className="w-full px-3 py-2 text-sm hover:bg-muted text-left">Permanente</button>
                <div className="border-t border-border" />
                <button onClick={() => handleMute(0)} className="w-full px-3 py-2 text-sm hover:bg-muted text-left flex items-center gap-2">
                  <Volume2 className="h-3.5 w-3.5" /> Reativar som
                </button>
              </div>
            )
          )}
        </div>

        <div className="border-t border-border my-1" />

        {/* Details */}
        <button
          onClick={handleDetails}
          disabled={isPending}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Info className="h-4 w-4 text-muted-foreground" />
          {detailsMutation.isPending ? 'Carregando...' : 'Detalhes completos'}
        </button>

        {/* Find messages */}
        <button
          onClick={handleFindMessages}
          disabled={isPending}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Search className="h-4 w-4 text-muted-foreground" />
          {findMessagesMutation.isPending ? 'Buscando...' : 'Buscar mensagens'}
        </button>

        <div className="border-t border-border my-1" />

        {/* Block */}
        <button
          onClick={handleBlock}
          disabled={isPending}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors disabled:opacity-50',
            isBlocked ? 'hover:bg-muted' : 'hover:bg-destructive/10 text-destructive',
          )}
        >
          <Ban className="h-4 w-4" />
          {isBlocked ? 'Desbloquear' : 'Bloquear contato'}
        </button>
      </div>
    </div>
  )
}

// ── Chat Details Overlay ─────────────────────────────────────────────────────

interface ChatDetailsOverlayProps {
  details: Record<string, unknown>
  onClose: () => void
}

export function ChatDetailsOverlay({ details, onClose }: ChatDetailsOverlayProps) {
  const relevantFields = Object.entries(details).filter(
    ([, v]) => v !== null && v !== undefined && v !== '' && v !== false,
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg max-h-[80vh] rounded-2xl border border-border bg-card shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Detalhes do WhatsApp</h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors"
          >
            <span className="text-muted-foreground text-lg">&times;</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1.5">
            {relevantFields.map(([key, value]) => (
              <div key={key} className="flex gap-2 text-sm">
                <span className="shrink-0 font-mono text-xs text-muted-foreground w-40 truncate pt-0.5">{key}</span>
                <span className="text-foreground break-all text-xs">
                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
