import type { ReactNode } from 'react'
import { ChevronRight, ArrowLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface Breadcrumb { label: string; href?: string }

interface PageHeaderProps {
  title: string
  description?: ReactNode
  /**
   * Ações à direita. Em largura estreita quebram linha e ocupam a largura
   * toda; um botão com a classe `btn btn-primary` vai para a primeira linha.
   */
  action?: ReactNode
  breadcrumb?: Breadcrumb[]
  className?: string
  backTo?: string
  /** Número ao lado do título (ex.: quantos itens a lista tem). */
  count?: number
}

/**
 * Cabeçalho de página do DS (seção 08 · "Cabeçalho de página"):
 * trilha opcional, título H1 (30/28/24 px, Archivo alargada), descrição curta
 * e ações. Usa container query: quem decide a quebra é a largura do próprio
 * cabeçalho, não a da tela.
 */
export function PageHeader({ title, description, action, breadcrumb, className, backTo, count }: PageHeaderProps) {
  const navigate = useNavigate()
  return (
    <header className={cn('ph animate-fade-in', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_280px] items-start gap-3">
          {backTo !== undefined && (
            <button
              type="button"
              onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
              className="btn btn-secondary btn-icon mt-0.5 shrink-0"
              title="Voltar"
              aria-label="Voltar"
            >
              <ArrowLeft aria-hidden />
            </button>
          )}
          <div className="min-w-0">
            {breadcrumb && breadcrumb.length > 0 && (
              <nav aria-label="Trilha" className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
                {breadcrumb.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
                    {crumb.href ? (
                      <Link to={crumb.href} className="rounded-sm transition-colors duration-fast hover:text-foreground">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="font-medium text-fg-2" aria-current="page">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}
            <h1 className="t-h1 m-0 flex flex-wrap items-center gap-2.5 break-words text-foreground">
              {title}
              {count !== undefined && <span className="count mono">{count}</span>}
            </h1>
            {description && <p className="mt-1 max-w-[64ch] text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action && <div className="ph-actions">{action}</div>}
      </div>
    </header>
  )
}
