import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { DeliveryStatus } from '@/types/database'

/**
 * Selos de status do DS (seção 08 · "Status do ticket"): fundo claro + texto +
 * marcador com FORMA própria (círculo, meio cheio, tracejado, com visto,
 * ponto central, um quarto, losango). Nunca só cor: dá para ler também
 * por quem não distingue cores.
 */
export type TomStatus = 'aberto' | 'andamento' | 'aguardando' | 'resolvido' | 'ia' | 'reaberto' | 'atrasado' | 'neutro'

interface SeloStatusProps {
  tom: TomStatus
  children: ReactNode
  size?: 'sm' | 'md'
  /** Anima a troca (escala + cor) quando o status muda. */
  animar?: boolean
  className?: string
  title?: string
}

/** Selo genérico com um dos tons do DS. */
export function SeloStatus({ tom, children, size = 'md', animar, className, title }: SeloStatusProps) {
  return (
    <span
      data-s={tom}
      title={title}
      className={cn('st', size === 'sm' && 'st-sm', animar && 'is-swap', className)}
    >
      <i className="st-g" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  )
}

/** Rótulos padrão dos status de ticket (podem ser trocados por `label`). */
const ROTULOS_STATUS_TICKET: Record<Exclude<TomStatus, 'neutro'>, string> = {
  aberto: 'Aberto',
  andamento: 'Em andamento',
  aguardando: 'Aguardando',
  resolvido: 'Resolvido',
  ia: 'Resolvido pela Íris',
  reaberto: 'Reaberto',
  atrasado: 'Atrasado',
}

export type StatusTicketTipo = keyof typeof ROTULOS_STATUS_TICKET

/** Selo de status de ticket. Ex.: `<StatusTicket status="aguardando" label="Aguardando cliente" />`. */
export function StatusTicket({
  status,
  label,
  size,
  animar,
  className,
}: {
  status: StatusTicketTipo
  label?: string
  size?: 'sm' | 'md'
  animar?: boolean
  className?: string
}) {
  return (
    <SeloStatus tom={status} size={size} animar={animar} className={className}>
      {label ?? ROTULOS_STATUS_TICKET[status]}
    </SeloStatus>
  )
}

/* Status de entregas (legado): mesmo selo, tons do DS. */
const STATUS_CONFIG: Record<DeliveryStatus, { label: string; tom: TomStatus }> = {
  rascunho:             { label: 'Rascunho',             tom: 'neutro' },
  aguardando_aprovacao: { label: 'Aguardando aprovação', tom: 'aguardando' },
  em_revisao:           { label: 'Em revisão',           tom: 'andamento' },
  aprovado:             { label: 'Aprovado',             tom: 'resolvido' },
  reprovado:            { label: 'Reprovado',            tom: 'atrasado' },
  publicado:            { label: 'Publicado',            tom: 'resolvido' },
}

interface StatusBadgeProps {
  status: DeliveryStatus
  size?: 'sm' | 'md'
  className?: string
}

export function StatusBadge({ status, size = 'md', className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  return (
    <SeloStatus tom={config.tom} size={size} className={className}>
      {config.label}
    </SeloStatus>
  )
}
