import { useState } from 'react'
import { Video, Copy, ExternalLink, Send } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useSendMessage } from '@/hooks/useChat'
import { generateRoomName, getMeetUrl } from '@/lib/livekit'

interface StartMeetingDialogProps {
  open: boolean
  onClose: () => void
  conversationId: string
  clientId?: string | null
  contactName?: string
  contactNumber?: string
}

export function StartMeetingDialog({
  open,
  onClose,
  conversationId,
  clientId,
  contactName,
}: StartMeetingDialogProps) {
  const { user } = useAuth()
  const sendMessageMutation = useSendMessage()
  const [creating, setCreating] = useState(false)
  const [meetingData, setMeetingData] = useState<{ hostUrl: string; guestUrl: string; roomName: string } | null>(null)
  const [customMessage, setCustomMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const roomName = generateRoomName()
      const title = contactName ? `Reunião com ${contactName}` : `Reunião ${new Date().toLocaleString('pt-BR')}`

      const hostUrl = getMeetUrl(roomName, { role: 'host', clientId: clientId || undefined, conversationId, name: user?.nome || undefined })
      const guestUrl = getMeetUrl(roomName, { role: 'guest', clientId: clientId || undefined, conversationId, name: contactName })

      const { error: insertErr } = await supabase.from('meetings').insert({
        title,
        client_id: clientId || null,
        conversation_id: conversationId,
        meeting_type: 'sales_call',
        status: 'scheduled',
        livekit_room_name: roomName,
        meeting_link: guestUrl,
        recording_status: 'pending',
        created_by: user?.id || null,
      } as never)

      if (insertErr) throw insertErr

      setMeetingData({ hostUrl, guestUrl, roomName })
      setCustomMessage(
        `Olá${contactName ? ' ' + contactName.split(' ')[0] : ''}! Segue o link da nossa videochamada:\n\n${guestUrl}\n\nÉ só clicar e entrar.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar reunião')
    } finally {
      setCreating(false)
    }
  }

  async function handleSendLink() {
    if (!meetingData) return
    sendMessageMutation.mutate(
      { conversation_id: conversationId, conteudo: customMessage, tipo: 'texto' },
      {
        onSuccess: () => {
          window.open(meetingData.hostUrl, '_blank', 'noopener,noreferrer')
          handleClose()
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Falha ao enviar link'),
      },
    )
  }

  function handleClose() {
    setMeetingData(null)
    setCustomMessage('')
    setError(null)
    onClose()
  }

  async function copyLink() {
    if (!meetingData) return
    await navigator.clipboard.writeText(meetingData.guestUrl)
  }

  return (
    <Modal open={open} onClose={handleClose} title="Iniciar videochamada" size="md">
      <div className="space-y-4">
        {!meetingData ? (
          <>
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 flex items-start gap-3">
              <Video className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground mb-1">Criar sala de reunião</p>
                <p className="text-muted-foreground text-xs">
                  Uma sala exclusiva será criada e o link enviado ao cliente no WhatsApp. A reunião é gravada automaticamente.
                </p>
              </div>
            </div>

            {error && (
              <div className="rounded-full bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={handleClose}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
                  'gradient-primary text-primary-foreground disabled:opacity-50',
                )}
              >
                <Video className="h-4 w-4" />
                {creating ? 'Criando sala...' : 'Criar sala'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Link do cliente</label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={meetingData.guestUrl}
                  className="flex-1 rounded-lg border border-input bg-muted px-3 py-2 text-xs font-mono focus:outline-none"
                />
                <button
                  onClick={copyLink}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
                  title="Copiar"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Mensagem para o cliente</label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={5}
                className={cn(
                  'w-full rounded-lg border border-input bg-background px-3 py-2 resize-none',
                  'text-sm focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              />
            </div>

            {error && (
              <div className="rounded-full bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive">
                {error}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => window.open(meetingData.hostUrl, '_blank', 'noopener,noreferrer')}
                className="flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Entrar sem enviar
              </button>
              <button
                onClick={handleSendLink}
                disabled={sendMessageMutation.isPending || !customMessage.trim()}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
                  'gradient-primary text-primary-foreground disabled:opacity-50',
                )}
              >
                <Send className="h-4 w-4" />
                {sendMessageMutation.isPending ? 'Enviando...' : 'Enviar link e entrar'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
