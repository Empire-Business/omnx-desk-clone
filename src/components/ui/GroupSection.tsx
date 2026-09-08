import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface GroupSectionProps {
  id: string
  title: string
  count: number
  /** Optional icon-badge (color tinted background + matching foreground) */
  icon?: React.ElementType
  iconBg?: string
  iconFg?: string
  /** Subtitle next to title (e.g., role) */
  subtitle?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
  /** Show empty hint when count === 0 */
  emptyHint?: string
}

export function GroupSection({
  id,
  title,
  count,
  icon: Icon,
  iconBg,
  iconFg,
  subtitle,
  defaultOpen = true,
  children,
  emptyHint,
}: GroupSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = `group-panel-${id}`
  const headerId = `group-header-${id}`

  return (
    <section className="space-y-3">
      <button
        id={headerId}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}

        {Icon && (
          <span
            className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', iconBg ?? 'bg-primary-muted')}
          >
            <Icon className={cn('h-3.5 w-3.5', iconFg ?? 'text-primary')} />
          </span>
        )}

        <span className="text-sm font-semibold text-foreground truncate">{title}</span>
        {subtitle && <>· {subtitle}</>}

        <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-semibold text-muted-foreground tabular-nums">
          {count}
        </span>

        <span className="ml-1 h-px flex-1 bg-border" aria-hidden="true" />
      </button>

      {open && (
        <div id={panelId} role="region" aria-labelledby={headerId}>
          {count === 0 && emptyHint ? (
            <p className="text-xs text-muted-foreground italic px-1">{emptyHint}</p>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  )
}
