import { Modal } from './Modal'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  loading?: boolean
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirmar', loading }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} disabled={loading}
          className="rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50">
          Cancelar
        </button>
        <button onClick={onConfirm} disabled={loading}
          className={cn('rounded-full px-5 py-2 text-sm font-medium text-destructive-foreground transition-colors disabled:opacity-50',
            loading ? 'bg-destructive/70' : 'bg-destructive hover:bg-destructive/90')}>
          {loading ? 'Aguarde...' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
