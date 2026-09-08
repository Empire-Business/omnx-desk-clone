import type { ReactNode } from 'react'
import { ChevronRight, ArrowLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface Breadcrumb { label: string; href?: string }

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  breadcrumb?: Breadcrumb[]
  className?: string
  backTo?: string
}

export function PageHeader({ title, description, action, breadcrumb, className, backTo }: PageHeaderProps) {
  const navigate = useNavigate()
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 animate-fade-in', className)}>
      <div className="flex items-start gap-3 min-w-0">
        {backTo !== undefined && (
          <button
            onClick={() => backTo ? navigate(backTo) : navigate(-1)}
            className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Voltar"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="space-y-1 min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="flex items-center gap-1 font-mono text-[11px] tracking-wider uppercase text-muted-foreground">
            {breadcrumb.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                {crumb.href ? (
                  <Link to={crumb.href} className="hover:text-foreground transition-colors">{crumb.label}</Link>
                ) : (
                  <span className="text-primary font-medium">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
