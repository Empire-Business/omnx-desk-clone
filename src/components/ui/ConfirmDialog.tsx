import { Modal } from './Modal'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  loading?: boolean
}

/** Confirmação de ação destrutiva (DS: perigo sempre com confirmação). */
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirmar', loading }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading} className="btn btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={loading} aria-busy={loading || undefined} className="btn btn-danger">
            {loading && <span className="btn-spin" aria-hidden />}
            {loading ? 'Aguarde…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-fg-2">{description}</p>
    </Modal>
  )
}
