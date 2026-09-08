import { useState } from 'react'
import { Send, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { useSendContact } from '@/hooks/useChat'

interface SendContactDialogProps {
  open: boolean
  onClose: () => void
  instanceId: string
  conversationId: string
  contactNumber: string
}

export function SendContactDialog({
  open,
  onClose,
  instanceId,
  conversationId,
  contactNumber,
}: SendContactDialogProps) {
  const sendContactMutation = useSendContact()
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [organization, setOrganization] = useState('')
  const [email, setEmail] = useState('')
  const [url, setUrl] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || !phoneNumber.trim()) return

    sendContactMutation.mutate(
      {
        instance_id: instanceId,
        conversation_id: conversationId,
        number: contactNumber,
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.replace(/\D/g, ''),
        organization: organization.trim() || undefined,
        email: email.trim() || undefined,
        url: url.trim() || undefined,
      },
      {
        onSuccess: () => {
          onClose()
          setFullName('')
          setPhoneNumber('')
          setOrganization('')
          setEmail('')
          setUrl('')
        },
      },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Enviar contato (vCard)" size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <User className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">O contato sera enviado como cartao vCard no WhatsApp</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Nome completo *</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Joao Silva"
            required
            className={cn(
              'w-full rounded-lg border border-input bg-background px-3 py-2',
              'text-sm focus:outline-none focus:ring-2 focus:ring-ring',
            )}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Telefone(s) *</label>
          <input
            type="text"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="5511999999999"
            required
            className={cn(
              'w-full rounded-lg border border-input bg-background px-3 py-2 font-mono',
              'text-sm focus:outline-none focus:ring-2 focus:ring-ring',
            )}
          />
          <p className="mt-0.5 text-2xs text-muted-foreground">Multiplos numeros separados por virgula</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Organizacao <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="Empresa XYZ"
            className={cn(
              'w-full rounded-lg border border-input bg-background px-3 py-2',
              'text-sm focus:outline-none focus:ring-2 focus:ring-ring',
            )}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Email <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="joao@empresa.com"
            className={cn(
              'w-full rounded-lg border border-input bg-background px-3 py-2',
              'text-sm focus:outline-none focus:ring-2 focus:ring-ring',
            )}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            URL <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://empresa.com"
            className={cn(
              'w-full rounded-lg border border-input bg-background px-3 py-2',
              'text-sm focus:outline-none focus:ring-2 focus:ring-ring',
            )}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={sendContactMutation.isPending || !fullName.trim() || !phoneNumber.trim()}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sendContactMutation.isPending ? 'Enviando...' : 'Enviar contato'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
