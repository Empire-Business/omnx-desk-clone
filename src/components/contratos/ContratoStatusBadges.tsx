import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ativo: { bg: 'bg-success/15', text: 'text-success', label: 'Ativo' },
  pausado: { bg: 'bg-warning/15', text: 'text-warning', label: 'Pausado' },
  rascunho: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Não iniciado' },
  cancelado: { bg: 'bg-danger/15', text: 'text-danger', label: 'Cancelado' },
  concluido: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Concluído' },
}

function normalizarStatus(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function ContratoStatusBadges({ status, statusSecundario }: {
  status: string
  statusSecundario?: string | null
}) {
  const chave = normalizarStatus(status)
  const principal = Object.hasOwn(STATUS_STYLES, chave)
    ? STATUS_STYLES[chave]
    : { bg: 'bg-muted', text: 'text-muted-foreground', label: status.trim() || 'Não informado' }
  const secundario = statusSecundario?.trim() ?? ''
  const chaveSecundaria = normalizarStatus(secundario)
  const mostrarSecundario = secundario !== ''
    && chaveSecundaria !== chave
    && chaveSecundaria !== normalizarStatus(principal.label)

  return (
    <>
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wider', principal.bg, principal.text)}>
        {principal.label}
      </span>
      {mostrarSecundario && (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-2xs font-semibold text-warning">
          {secundario}
        </span>
      )}
    </>
  )
}
