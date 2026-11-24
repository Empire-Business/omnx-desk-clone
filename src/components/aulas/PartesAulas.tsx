import { cn } from '@/lib/utils'
import { iniciaisTrilha } from '@/lib/aulasEquipe'

/** Barra de progresso fina (como o `Progress` das coleções do Clients). */
export function BarraProgresso({ percentual, rotulo, className }: { percentual: number; rotulo: string; className?: string }) {
  const valor = Math.max(0, Math.min(100, percentual))
  return (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={valor}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-bg-3', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', valor === 100 ? 'bg-success' : 'bg-primary')}
        style={{ width: `${valor}%` }}
      />
    </div>
  )
}

const TONS = [
  'bg-primary-light text-link',
  'bg-success-light text-success',
  'bg-warning-light text-warning',
  'bg-iris-light text-iris-fg',
  'bg-info-light text-info',
] as const

/** Marca com as iniciais da trilha; o tom sai do nome, então não muda entre visitas. */
export function MarcaTrilha({ titulo, className }: { titulo: string; className?: string }) {
  const tom = TONS[[...titulo].reduce((soma, c) => soma + c.charCodeAt(0), 0) % TONS.length]
  return (
    <span
      aria-hidden
      className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-[10px] font-display text-[15px] font-bold', tom, className)}
    >
      {iniciaisTrilha(titulo)}
    </span>
  )
}
