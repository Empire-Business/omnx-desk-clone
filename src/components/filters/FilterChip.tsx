import { useEffect, useState } from 'react'
import { X, ChevronDown, Search, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Classe padrão dos inputs dentro dos popovers de filtro. */
export const CHIP_INPUT = 'h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40'

/**
 * Chip de filtro estilo Linear/Notion: um botão-pílula que abre um popover
 * ancorado. Quando ativo, mostra o valor e um "x" para limpar. Fecha ao clicar
 * fora ou com Esc.
 */
export function FilterChip({
  icon, label, active, valueLabel, onClear, children, panelClass,
}: {
  icon?: React.ReactNode
  label: string
  active: boolean
  valueLabel?: string
  onClear?: () => void
  children: (close: () => void) => React.ReactNode
  panelClass?: string
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="relative">
      <div
        className={cn(
          'inline-flex items-center rounded-full border text-xs font-medium transition-colors',
          active
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
        )}
      >
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex h-8 items-center gap-1.5 pl-2.5 pr-1.5">
          {icon}
          <span className="inline-block max-w-[12rem] truncate align-middle whitespace-nowrap">
            {label}{active && valueLabel ? ': ' : ''}
            {active && valueLabel ? <span className="font-semibold">{valueLabel}</span> : null}
          </span>
          {active && onClear ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onClear() }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClear() } }}
              className="ml-0.5 rounded-full p-0.5 opacity-70 hover:bg-primary/20 hover:opacity-100"
              title="Remover filtro"
              aria-label={`Remover filtro ${label}`}
            >
              <X className="h-3 w-3" />
            </span>
          ) : (
            <ChevronDown className="h-3 w-3 opacity-60" />
          )}
        </button>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className={cn('absolute left-0 top-full z-40 mt-1.5 rounded-xl border border-border bg-popover p-3 shadow-xl', panelClass ?? 'w-64')}>
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  )
}

/** Lista de opções com busca — usada dentro de um FilterChip para escolher 1 valor. */
export function OptionPicker({ options, value, placeholder, onPick }: {
  options: Array<{ value: string; label: string }>
  value: string
  placeholder: string
  onPick: (v: string) => void
}) {
  const [q, setQ] = useState('')
  const termo = q.trim().toLowerCase()
  const filt = termo ? options.filter((o) => o.label.toLowerCase().includes(termo)) : options
  const rowCls = (on: boolean) => cn(
    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
    on ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
  )
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" autoFocus
          className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none" />
      </div>
      <div className="kanban-scroll max-h-56 space-y-0.5 overflow-y-auto">
        <button type="button" onClick={() => onPick('')} className={rowCls(value === '')}>
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">{value === '' && <Check className="h-3.5 w-3.5" />}</span>
          {placeholder}
        </button>
        {filt.map((o) => (
          <button key={o.value} type="button" onClick={() => onPick(o.value)} className={rowCls(value === o.value)}>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">{value === o.value && <Check className="h-3.5 w-3.5" />}</span>
            <span className="truncate">{o.label}</span>
          </button>
        ))}
        {filt.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">Nada encontrado.</p>}
      </div>
    </div>
  )
}
