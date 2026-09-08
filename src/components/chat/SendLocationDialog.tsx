import { useState } from 'react'
import { Send, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { useSendLocation } from '@/hooks/useChat'

interface SendLocationDialogProps {
  open: boolean
  onClose: () => void
  instanceId: string
  conversationId: string
  contactNumber: string
}

export function SendLocationDialog({
  open,
  onClose,
  instanceId,
  conversationId,
  contactNumber,
}: SendLocationDialogProps) {
  const sendLocationMutation = useSendLocation()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    if (isNaN(lat) || isNaN(lng)) return

    sendLocationMutation.mutate(
      {
        instance_id: instanceId,
        conversation_id: conversationId,
        number: contactNumber,
        latitude: lat,
        longitude: lng,
        name: name.trim() || undefined,
        address: address.trim() || undefined,
      },
      {
        onSuccess: () => {
          onClose()
          setName('')
          setAddress('')
          setLatitude('')
          setLongitude('')
        },
      },
    )
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6))
        setLongitude(pos.coords.longitude.toFixed(6))
      },
      () => {},
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Enviar localizacao" size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Envie uma localizacao com mapa interativo</p>
          </div>
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            className="text-xs text-primary hover:underline shrink-0"
          >
            Usar minha localizacao
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Latitude *</label>
            <input
              type="text"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="-23.5616"
              required
              className={cn(
                'w-full rounded-lg border border-input bg-background px-3 py-2 font-mono',
                'text-sm focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Longitude *</label>
            <input
              type="text"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="-46.6562"
              required
              className={cn(
                'w-full rounded-lg border border-input bg-background px-3 py-2 font-mono',
                'text-sm focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Nome do local <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Empire Zap HQ"
            className={cn(
              'w-full rounded-lg border border-input bg-background px-3 py-2',
              'text-sm focus:outline-none focus:ring-2 focus:ring-ring',
            )}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Endereco <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Av. Paulista, 1578 - Sao Paulo"
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
            disabled={sendLocationMutation.isPending || !latitude || !longitude}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sendLocationMutation.isPending ? 'Enviando...' : 'Enviar localizacao'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
