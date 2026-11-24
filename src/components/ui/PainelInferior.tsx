import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PainelInferiorProps {
  aberto: boolean
  onFechar: () => void
  titulo: string
  descricao?: string
  children: ReactNode
  className?: string
}

/**
 * Painel que sobe do rodapé no celular e vira uma janela central no computador.
 *
 * Usa o `<dialog>` nativo: o navegador já cuida de prender o foco dentro do
 * painel, fechar com Esc e devolver o foco a quem abriu. Tocar fora (no fundo
 * escurecido) também fecha. Altura limitada em `dvh` para não ficar atrás da
 * barra de endereço do celular.
 */
export function PainelInferior({ aberto, onFechar, titulo, descricao, children, className }: PainelInferiorProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (aberto && !el.open) {
      // jsdom (testes) não implementa showModal.
      if (typeof el.showModal === 'function') el.showModal()
      else el.setAttribute('open', '')
    } else if (!aberto && el.open) {
      if (typeof el.close === 'function') el.close()
      else el.removeAttribute('open')
    }
  }, [aberto])

  return (
    <dialog
      ref={ref}
      aria-label={titulo}
      onCancel={(e) => { e.preventDefault(); onFechar() }}
      onClick={(e) => { if (e.target === e.currentTarget) onFechar() }}
      className={cn(
        // DS: sheet do celular (cantos de 16 px em cima, alça 36 × 4, sombra "bloqueia").
        'fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-full max-h-[85dvh] overflow-hidden',
        'rounded-t-[16px] border-0 bg-popover p-0 text-popover-foreground shadow-[var(--elev-modal)] backdrop:bg-[var(--scrim)]',
        'open:animate-sheet-in md:open:animate-modal-in',
        // computador: janela central de 420 px
        'md:inset-0 md:m-auto md:h-fit md:max-w-[420px] md:rounded-xl md:shadow-[var(--elev-modal),var(--ring-1)]',
        className,
      )}
    >
      <div className="flex max-h-[85dvh] flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-stroke-default md:hidden" aria-hidden />
        <header className="flex shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-3">
          <div className="min-w-0">
            <h2 className="m-0 text-[17px] font-[650] leading-snug text-foreground [font-stretch:104%]">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-[13.5px] text-muted-foreground">{descricao}</p>}
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="btn btn-ghost btn-icon -mr-1 shrink-0">
            <X aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">{children}</div>
      </div>
    </dialog>
  )
}

/** Linha de ação dentro do painel: alvo de toque de 48 px. */
export function LinhaPainel({
  icone: Icone,
  rotulo,
  descricao,
  contador,
  destrutivo,
  ...props
}: {
  icone: React.ComponentType<{ className?: string }>
  rotulo: string
  descricao?: string
  contador?: number
  destrutivo?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        // DS `.sheet-item`: alvo de 48 px, raio 8, ícone 18 px.
        'flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-fast ease-std',
        'hover:bg-accent active:bg-accent focus-ds disabled:cursor-not-allowed disabled:opacity-45',
        destrutivo ? 'text-danger' : 'text-foreground',
        props.className,
      )}
    >
      <Icone className={cn('h-[18px] w-[18px] shrink-0', destrutivo ? 'text-danger' : 'text-muted-foreground')} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-snug md:text-sm">{rotulo}</span>
        {descricao && <span className="block text-[12.5px] leading-snug text-muted-foreground">{descricao}</span>}
      </span>
      {!!contador && contador > 0 && (
        <span className="count is-primary">
          {contador > 99 ? '99+' : contador}
        </span>
      )}
    </button>
  )
}
