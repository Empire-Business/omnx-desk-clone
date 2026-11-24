import { useParams, Link } from 'react-router-dom'
import { Calendar, Package, ChevronRight, ExternalLink, FileText, Image, Video, Link as LinkIcon } from 'lucide-react'
import { useEntrega } from '@/hooks/useEntregas'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ContentItemRenderer } from '@/components/entregas/ContentItemRenderer'
import { ApprovalPanel } from '@/components/entregas/ApprovalPanel'
import type { ContentType } from '@/types/database'

const CONTENT_TYPE_ICONS: Record<ContentType, React.ElementType> = {
  imagem: Image,
  video: Video,
  documento: FileText,
  link: LinkIcon,
  texto: FileText,
}

export function PortalEntregaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: delivery, isLoading } = useEntrega(id ?? '')

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 shimmer rounded" />
        <div className="glass-card h-48 shimmer" />
      </div>
    )
  }

  if (!delivery) {
    return (
      <div className="glass-card p-8 text-center text-sm text-muted-foreground">
        Entrega não encontrada.
      </div>
    )
  }

  const latestVersion =
    delivery.delivery_versions.length > 0
      ? delivery.delivery_versions.reduce((a, b) => (a.versao > b.versao ? a : b))
      : null

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/portal" className="hover:text-foreground transition-colors">
          Portal
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to="/portal/entregas" className="hover:text-foreground transition-colors">
          Entregas
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium truncate max-w-[200px]">
          {delivery.titulo}
        </span>
      </nav>

      {/* Title + status */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground break-words">{delivery.titulo}</h1>
        </div>
        <StatusBadge status={delivery.status} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:gap-6 xl:grid-cols-3">
        {/* Info card */}
        <div className="glass-card p-3 sm:p-4 lg:p-5 space-y-4">
          <h2 className="text-sm font-bold text-foreground">Informações</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <Package className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-2xs text-muted-foreground">Entregável</p>
                <p className="text-sm text-foreground">{delivery.deliverables.nome}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Package className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-2xs text-muted-foreground">Produto</p>
                <p className="text-sm text-foreground">{delivery.deliverables.products.nome}</p>
              </div>
            </div>
            {delivery.prazo && (
              <div className="flex items-center gap-2.5">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-2xs text-muted-foreground">Prazo</p>
                  <p className="text-sm text-foreground">
                    {new Date(delivery.prazo).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content + Approval */}
        <div className="xl:col-span-2 space-y-3 sm:space-y-4 lg:space-y-5">
          {/* Latest version content */}
          <div className="glass-card p-3 sm:p-4 lg:p-5">
            <h2 className="text-sm font-bold text-foreground mb-4">
              {latestVersion ? `Conteúdo — Versão ${latestVersion.versao}` : 'Conteúdo'}
            </h2>

            {!latestVersion ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma versão disponível ainda.
              </p>
            ) : latestVersion.delivery_content_items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Esta versão não possui itens de conteúdo.
              </p>
            ) : (
              <div className="space-y-3">
                {latestVersion.delivery_content_items.map((item) => {
                  const hasRenderer = true // ContentItemRenderer imported directly
                  if (hasRenderer) {
                    return (
                      <ContentItemRenderer key={item.id} item={item} />
                    )
                  }

                  // Fallback inline renderer (unreachable, kept for safety)
                  const Icon = CONTENT_TYPE_ICONS[item.tipo] ?? FileText
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 rounded-lg border border-border p-3"
                    >
                      <div className="rounded-md bg-muted p-2 shrink-0">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                          {item.tipo}
                        </p>
                        {item.nome && (
                          <p className="text-sm text-foreground">{item.nome}</p>
                        )}
                        {item.texto && (
                          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">
                            {item.texto}
                          </p>
                        )}
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Abrir link
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Approval panel */}
          {latestVersion && (
            <ApprovalPanel
              delivery={delivery}
              latestVersionId={latestVersion.id}
              userPerfil="cliente"
            />
          )}
        </div>
      </div>
    </div>
  )
}
