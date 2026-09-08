import { cn } from '@/lib/utils'
import type { DeliveryStatus } from '@/types/database'

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; classes: string; dotClass: string }> = {
  rascunho:              { label: 'Rascunho',              classes: 'bg-muted text-muted-foreground',         dotClass: 'bg-muted-foreground' },
  aguardando_aprovacao:  { label: 'Aguardando aprovação',  classes: 'bg-warning-light text-warning',          dotClass: 'bg-warning' },
  em_revisao:            { label: 'Em revisão',            classes: 'bg-info-light text-info',                dotClass: 'bg-info' },
  aprovado:              { label: 'Aprovado',              classes: 'bg-success-light text-success',          dotClass: 'bg-success' },
  reprovado:             { label: 'Reprovado',             classes: 'bg-danger-light text-danger',            dotClass: 'bg-danger' },
  publicado:             { label: 'Publicado',             classes: 'bg-area-delivery-light text-area-delivery', dotClass: 'bg-area-delivery' },
}

interface StatusBadgeProps {
  status: DeliveryStatus
  size?: 'sm' | 'md'
  className?: string
}

export function StatusBadge({ status, size = 'md', className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-sm font-mono tracking-wider uppercase font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]',
      config.classes,
      className
    )}>
      <span className={cn('rounded-full shrink-0', size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2', config.dotClass)} />
      {config.label}
    </span>
  )
}
