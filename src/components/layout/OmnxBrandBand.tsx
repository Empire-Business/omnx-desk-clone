import { cn } from '@/lib/utils'
import { OmnxLockup } from '@/components/icons/OmnxLockup'

interface OmnxBrandBandProps {
  /** Sidebar recolhida — só o monograma. */
  collapsed?: boolean
  className?: string
}

/**
 * Marca no topo da barra lateral (DS `.sb-brand`): monograma 2×2 oficial +
 * "Desk". Recolhida, só o monograma. As cores seguem o tema pelas variáveis
 * --logo-ink / --logo-x (azul no claro, quase branco no escuro).
 */
export function OmnxBrandBand({ collapsed = false, className }: OmnxBrandBandProps) {
  return (
    <div className={cn('flex h-9 min-w-0 items-center', collapsed ? 'justify-center' : 'justify-start pl-2', className)}>
      <OmnxLockup height={collapsed ? 26 : 28} showWord={!collapsed} />
    </div>
  )
}
