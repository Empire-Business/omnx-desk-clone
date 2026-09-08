import { useCallback, useEffect, useState } from 'react'
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react'

export interface TourStep {
  /** valor do atributo data-tour do elemento a destacar. Ausente = balão centralizado. */
  target?: string
  title: string
  body: React.ReactNode
}

/**
 * Tour guiado com spotlight: escurece a tela, ilumina o elemento do passo atual
 * (via [data-tour="..."]) e mostra um balão explicativo. Navega com Voltar/Próximo.
 */
export function GuidedTour({
  steps, open, onClose,
}: {
  steps: TourStep[]
  open: boolean
  onClose: () => void
}) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = steps[i]

  const recalc = useCallback(() => {
    if (!step?.target) { setRect(null); return }
    const el = document.querySelector(`[data-tour="${step.target}"]`)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [step])

  useEffect(() => {
    if (!open) return
    const el = step?.target ? document.querySelector(`[data-tour="${step.target}"]`) : null
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    recalc()
    const t = setTimeout(recalc, 350)
    window.addEventListener('resize', recalc)
    window.addEventListener('scroll', recalc, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', recalc)
      window.removeEventListener('scroll', recalc, true)
    }
  }, [open, i, recalc, step])

  // Reinicia no passo 1 sempre que reabrir.
  useEffect(() => { if (open) setI(0) }, [open])

  if (!open || !step) return null

  const isLast = i === steps.length - 1
  const isFirst = i === 0
  const pad = 8

  // Posição do balão: abaixo do alvo se couber, senão acima; centralizado sem alvo.
  const vh = window.innerHeight
  const vw = window.innerWidth
  const below = rect ? rect.bottom < vh * 0.6 : true
  const cardStyle: React.CSSProperties = rect
    ? {
        top: below ? rect.bottom + 14 : undefined,
        bottom: below ? undefined : vh - rect.top + 14,
        left: Math.min(Math.max(12, rect.left), Math.max(12, vw - 340)),
      }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Escurecimento + spotlight no alvo */}
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-primary/70 transition-all duration-200"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.66)',
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/66" />
      )}

      {/* Balão */}
      <div
        className="fixed w-[min(20.5rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-card p-4 shadow-2xl animate-fade-in"
        style={cardStyle}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            Passo {i + 1} de {steps.length}
          </span>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Fechar tutorial">
            <X className="h-4 w-4" />
          </button>
        </div>

        <h3 className="text-sm font-bold text-foreground">{step.title}</h3>
        <div className="mt-1 text-sm leading-snug text-muted-foreground">{step.body}</div>

        {/* Barra de progresso */}
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            onClick={() => setI((v) => Math.max(0, v - 1))}
            disabled={isFirst}
            className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </button>
          {isLast ? (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Check className="h-3.5 w-3.5" /> Entendi, começar
            </button>
          ) : (
            <button
              onClick={() => setI((v) => Math.min(steps.length - 1, v + 1))}
              className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              Próximo <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
