import { useState } from 'react'
import {
  Archive, Pin, VolumeX, Ban, Search, Info,
  Volume2, ArchiveRestore, PinOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import {
  useArchiveChat,
  usePinChat,
  useMuteChat,
  useBlockContact,
  useChatDetails,
  useFindMessages,
  useToggleMute,
} from '@/hooks/useChat'
import { useAuth } from '@/contexts/AuthContext'

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
  // Bloquear contato mexe no número inteiro: o servidor (uazapi-actions) só aceita de admin.
  const { user } = useAuth()
  const podeBloquear = user?.perfil === 'admin'

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
    : 'absolute right-0 top-full mt-1 z-30 w-[min(240px,calc(100vw-2rem))] rounded-xl bg-popover shadow-pop ring-hairline animate-fade-in-up'

  // Itens com alvo de toque de 44 px no celular (DS).
  const item = 'w-full flex min-h-11 sm:min-h-9 items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors duration-fast disabled:opacity-50 focus-ds'
  const subitem = 'w-full flex min-h-11 sm:min-h-9 items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent text-left transition-colors duration-fast rounded-md focus-ds'

  return (
    <div className={wrapperClass}>
      <div className={inline ? '' : 'py-1'}>
        {/* Archive */}
        <button type="button" onClick={handleArchive} disabled={isPending} className={item}>
          {isArchived ? <ArchiveRestore className="h-4 w-4 text-muted-foreground" aria-hidden /> : <Archive className="h-4 w-4 text-muted-foreground" aria-hidden />}
          {isArchived ? 'Desarquivar' : 'Arquivar'}
        </button>

        {/* Pin */}
        <button type="button" onClick={handlePin} disabled={isPending} className={item}>
          {isPinned ? <PinOff className="h-4 w-4 text-muted-foreground" aria-hidden /> : <Pin className="h-4 w-4 text-muted-foreground" aria-hidden />}
          {isPinned ? 'Desafixar' : 'Fixar conversa'}
        </button>

        {/* Mute — opções abrem logo abaixo (antes abriam para o lado e saíam da tela no celular) */}
        <div>
          <button
            type="button"
            onClick={() => setShowMuteOptions(!showMuteOptions)}
            disabled={isPending}
            aria-expanded={showMuteOptions}
            className={item}
          >
            <VolumeX className="h-4 w-4 text-muted-foreground" aria-hidden />
            Silenciar
          </button>
          {showMuteOptions && (
            <div className="border-l-2 border-stroke-default ml-5 pl-1.5 py-1 mr-1.5">
              <button type="button" onClick={() => handleMute(8)} className={subitem}>8 horas</button>
              <button type="button" onClick={() => handleMute(168)} className={subitem}>1 semana</button>
              <button type="button" onClick={() => handleMute(999999)} className={subitem}>Sempre</button>
              <div className="border-t border-border my-0.5" />
              <button type="button" onClick={() => handleMute(0)} className={subitem}>
                <Volume2 className="h-3.5 w-3.5" aria-hidden /> Reativar som
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-border my-1" />

        {/* Details */}
        <button type="button" onClick={handleDetails} disabled={isPending} className={item}>
          <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
          {detailsMutation.isPending ? 'Carregando…' : 'Detalhes completos'}
        </button>

        {/* Find messages */}
        <button type="button" onClick={handleFindMessages} disabled={isPending} className={item}>
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          {findMessagesMutation.isPending ? 'Buscando…' : 'Buscar mensagens'}
        </button>

        {podeBloquear && (
          <>
            <div className="border-t border-border my-1" />

            {/* Block */}
            <button
              type="button"
              onClick={handleBlock}
              disabled={isPending}
              className={cn(item, !isBlocked && '!text-danger hover:!bg-danger-light')}
            >
              <Ban className="h-4 w-4" aria-hidden />
              {isBlocked ? 'Desbloquear' : 'Bloquear contato'}
            </button>
          </>
        )}
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
    <Modal open onClose={onClose} title="Detalhes do WhatsApp" size="md">
      <dl className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        {relevantFields.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="mono truncate pt-0.5 text-xs text-muted-foreground max-sm:mt-1.5">{key}</dt>
            <dd className="m-0 break-all text-[13px] text-foreground">
              {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
