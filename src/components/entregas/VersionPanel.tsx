import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ContentItemRenderer } from '@/components/entregas/ContentItemRenderer'
import type { DeliveryVersion, DeliveryContentItem } from '@/types/database'

type VersionWithItems = DeliveryVersion & { delivery_content_items: DeliveryContentItem[] }

interface VersionPanelProps {
  versions: VersionWithItems[]
  onDelete?: (versionId: string) => void
  isAdmin?: boolean
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

function VersionCard({
  version,
  defaultOpen,
  onDelete,
  isAdmin,
}: {
  version: VersionWithItems
  defaultOpen: boolean
  onDelete?: (id: string) => void
  isAdmin?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={cn('glass-card overflow-hidden transition-shadow', open && 'shadow-md')}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center rounded-full bg-primary-muted px-2.5 py-0.5 text-xs font-semibold text-primary shrink-0">
            Versão {version.versao}
          </span>
          {version.notas && (
            <span className="truncate text-sm text-muted-foreground">{version.notas}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden text-xs text-muted-foreground sm:block">
            {formatDateTime(version.criado_em)}
          </span>
          <span className="text-xs text-muted-foreground">
            {version.delivery_content_items.length} item{version.delivery_content_items.length !== 1 ? 's' : ''}
          </span>
          <ChevronIcon open={open} />
        </div>
      </button>

      {/* Collapsible body */}
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 animate-[fade-in_0.15s_ease-out]">
          {/* Meta info on mobile */}
          <p className="mb-3 text-xs text-muted-foreground sm:hidden">
            {formatDateTime(version.criado_em)}
          </p>

          {/* Full notes if truncated above */}
          {version.notas && (
            <p className="mb-3 text-sm text-foreground">{version.notas}</p>
          )}

          {/* Content items */}
          {version.delivery_content_items.length > 0 ? (
            <div className="space-y-3">
              {version.delivery_content_items.map(item => (
                <ContentItemRenderer key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Esta versão não possui itens de conteúdo.
            </p>
          )}

          {/* Admin delete */}
          {isAdmin && onDelete && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => onDelete(version.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-light transition-colors"
              >
                <TrashIcon />
                Excluir versão
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function VersionPanel({ versions, onDelete, isAdmin }: VersionPanelProps) {
  if (versions.length === 0) {
    return (
      <div className="glass-card flex flex-col items-center justify-center gap-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Nenhuma versão enviada</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Envie a primeira versão desta entrega.</p>
        </div>
      </div>
    )
  }

  // Sort descending by versao so latest is first
  const sorted = [...versions].sort((a, b) => b.versao - a.versao)

  return (
    <div className="space-y-3">
      {sorted.map((version, index) => (
        <VersionCard
          key={version.id}
          version={version}
          defaultOpen={index === 0}
          onDelete={onDelete}
          isAdmin={isAdmin}
        />
      ))}
    </div>
  )
}
