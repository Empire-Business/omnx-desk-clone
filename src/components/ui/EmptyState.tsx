import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  /** O que aconteceu (ex.: "Nenhum ticket esperando você"). */
  title: string
  /** Por que é bom / o que fazer agora. */
  description?: string
  /** Próxima ação principal (ex.: `<button className="btn btn-primary">…`). */
  action?: ReactNode
  /** Ação de apoio ao lado da principal (ex.: "Limpar filtros"). */
  secondaryAction?: ReactNode
  /** Menos respiro (dentro de painéis e listas estreitas). */
  compact?: boolean
  /** Sem superfície de cartão (quando já está dentro de um cartão). */
  bare?: boolean
  className?: string
}

/**
 * Estado vazio do DS (seção 08): diz o que aconteceu, por que é bom e o que
 * fazer agora. Ícone em quadro com anel tracejado; ações centralizadas.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  bare = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'grid justify-items-center gap-2.5 px-5 text-center animate-fade-in',
        compact ? 'py-8' : 'py-10 sm:py-16',
        !bare && 'rounded-lg border border-card-border bg-card',
        className,
      )}
    >
      {Icon && (
        <div className="empty-ico mb-2" aria-hidden>
          <Icon />
        </div>
      )}
      <h3 className="m-0 text-base font-[650] text-foreground [font-stretch:100%]">{title}</h3>
      {description && <p className="m-0 max-w-[36ch] text-sm text-muted-foreground">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}
