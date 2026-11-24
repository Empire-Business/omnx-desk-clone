import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  /** sm = 480 px (padrão do DS) · md = 560 px · lg = 720 px (modal largo do DS). */
  size?: 'sm' | 'md' | 'lg'
  /** Rodapé fixo com as ações (fica sempre visível, mesmo com o corpo rolando). */
  footer?: ReactNode
}

const SIZE_CLASSES = { sm: 'sm:max-w-[480px]', md: 'sm:max-w-[560px]', lg: 'sm:max-w-[720px]' }

/**
 * Modal do DS (seção 08): no computador, janela central com anel fino e
 * sombra "bloqueia"; abaixo de 640 px vira sheet colado ao rodapé, com alça,
 * cantos de 16 px só em cima e respeito à área segura do iPhone.
 * Altura limitada em `dvh` (a barra de endereço do celular não esconde nada).
 */
export function Modal({ open, onClose, title, description, children, size = 'md', footer }: ModalProps) {
  const painel = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const idDescricao = useId()

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Foco entra no modal ao abrir e volta para quem abriu ao fechar.
  useEffect(() => {
    if (!open) return
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    painel.current?.focus({ preventScroll: true })
    return () => { if (anterior && document.contains(anterior)) anterior.focus({ preventScroll: true }) }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-[var(--scrim)] animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={description ? idDescricao : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex w-full flex-col bg-popover text-popover-foreground outline-none',
          'shadow-[var(--elev-modal),var(--ring-1)]',
          // celular: sheet
          'max-h-[calc(100dvh-0.5rem)] rounded-t-[16px] animate-sheet-in pb-[env(safe-area-inset-bottom)]',
          // computador: janela central
          'sm:max-h-[calc(100dvh-2rem)] sm:max-w-[calc(100vw-2rem)] sm:rounded-xl sm:pb-0 sm:animate-modal-in',
          SIZE_CLASSES[size],
        )}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-stroke-default sm:hidden" aria-hidden />
        <div className="flex shrink-0 items-start gap-3 px-4 pt-3 sm:px-[18px] sm:pt-[18px]">
          <div className="min-w-0 flex-1">
            <h2 id={idTitulo} className="m-0 break-words text-[17px] font-[650] leading-snug text-foreground [font-stretch:104%]">
              {title}
            </h2>
            {description && (
              <p id={idDescricao} className="mt-1 text-[13.5px] text-muted-foreground">{description}</p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="btn btn-ghost btn-icon -mr-1.5 -mt-1 shrink-0">
            <X aria-hidden />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-4 pb-4 pt-4 sm:px-[18px]">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-bg-0 px-4 py-3 max-sm:[&>*]:flex-1 sm:rounded-b-xl sm:px-[18px]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
