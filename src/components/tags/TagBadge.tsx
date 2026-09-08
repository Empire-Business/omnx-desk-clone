import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tag } from '@/hooks/useTags'

interface TagBadgeProps {
  tag: Pick<Tag, 'nome' | 'cor' | 'descricao'>
  onRemove?: () => void
  className?: string
}

/** Chip colorido de uma tag. Passe onRemove para exibir o "x". */
export function TagBadge({ tag, onRemove, className }: TagBadgeProps) {
  return (
    <span
      title={tag.descricao ?? undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium leading-tight',
        className,
      )}
      style={{
        backgroundColor: `${tag.cor}1a`,
        color: tag.cor,
        border: `1px solid ${tag.cor}33`,
      }}
    >
      {tag.nome}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 rounded-full hover:opacity-70"
          aria-label={`Remover tag ${tag.nome}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}
