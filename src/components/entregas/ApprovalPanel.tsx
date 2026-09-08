import { useState } from 'react'
import { CheckCircle2, XCircle, Globe, Clock } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/contexts/AuthContext'
import {
  useApprovals,
  useApproveDelivery,
  useRejectDelivery,
  usePublishDelivery,
} from '@/hooks/useApproval'
import type { Delivery } from '@/types/database'
import type { UserProfile } from '@/types/database'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ApprovalPanelProps {
  delivery: Delivery
  latestVersionId: string | null
  userPerfil: UserProfile
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApprovalPanel({ delivery, latestVersionId, userPerfil }: ApprovalPanelProps) {
  const { user } = useAuth()
  const [notas, setNotas] = useState('')
  const [actionPending, setActionPending] = useState<'approve' | 'reject' | null>(null)

  const { data: approvals, isLoading: loadingApprovals } = useApprovals(delivery.id)
  const approveDelivery = useApproveDelivery()
  const rejectDelivery = useRejectDelivery()
  const publishDelivery = usePublishDelivery()

  const isCliente = userPerfil === 'cliente'
  const isAdminOrGerente = userPerfil === 'admin' || userPerfil === 'gerente'
  const canApprove = isCliente && delivery.status === 'aguardando_aprovacao' && latestVersionId !== null
  const canPublish = isAdminOrGerente && delivery.status === 'aprovado'

  async function handleApprove() {
    if (!user || !latestVersionId) return
    setActionPending('approve')
    try {
      await approveDelivery.mutateAsync({
        deliveryId: delivery.id,
        versionId: latestVersionId,
        userId: user.id,
        notas: notas.trim() || undefined,
      })
      setNotas('')
    } finally {
      setActionPending(null)
    }
  }

  async function handleReject() {
    if (!user || !latestVersionId) return
    setActionPending('reject')
    try {
      await rejectDelivery.mutateAsync({
        deliveryId: delivery.id,
        versionId: latestVersionId,
        userId: user.id,
        notas: notas.trim() || undefined,
      })
      setNotas('')
    } finally {
      setActionPending(null)
    }
  }

  async function handlePublish() {
    await publishDelivery.mutateAsync({ deliveryId: delivery.id })
  }

  const mutationError =
    approveDelivery.error ?? rejectDelivery.error ?? publishDelivery.error

  return (
    <div className="glass-card p-5 space-y-5">
      {/* Header — status atual */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Aprovação</h3>
        <StatusBadge status={delivery.status} />
      </div>

      {/* Ação do cliente */}
      {canApprove && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground">Sua avaliação</p>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={3}
            placeholder="Observações opcionais (feedback, ajustes…)"
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
          />
          <div className="flex gap-3">
            <button
              onClick={handleApprove}
              disabled={actionPending !== null}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity',
                'bg-gradient-to-r from-success to-emerald-400',
                'hover:opacity-90 disabled:opacity-50',
              )}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {actionPending === 'approve' ? 'Aprovando…' : 'Aprovar'}
            </button>
            <button
              onClick={handleReject}
              disabled={actionPending !== null}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground',
                'hover:bg-muted transition-colors disabled:opacity-50',
              )}
            >
              <XCircle className="h-4 w-4 shrink-0" />
              {actionPending === 'reject' ? 'Enviando…' : 'Solicitar revisão'}
            </button>
          </div>
        </div>
      )}

      {/* Ação do admin/gerente — publicar */}
      {canPublish && (
        <button
          onClick={handlePublish}
          disabled={publishDelivery.isPending}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold',
            'bg-gradient-to-r from-area-delivery to-violet-400 text-white',
            'hover:opacity-90 transition-opacity disabled:opacity-50',
          )}
        >
          <Globe className="h-4 w-4 shrink-0" />
          {publishDelivery.isPending ? 'Publicando…' : 'Marcar como publicado'}
        </button>
      )}

      {/* Erro de mutação */}
      {mutationError && (
        <p className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
          {mutationError instanceof Error ? mutationError.message : 'Ocorreu um erro. Tente novamente.'}
        </p>
      )}

      {/* Histórico de aprovações */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Histórico de aprovações
        </h4>

        {loadingApprovals && (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-14 rounded-xl shimmer" />
            ))}
          </div>
        )}

        {!loadingApprovals && (!approvals || approvals.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma avaliação registrada ainda.
          </p>
        )}

        {approvals && approvals.length > 0 && (
          <ul className="space-y-2">
            {approvals.map(approval => (
              <li
                key={approval.id}
                className="rounded-xl border border-border bg-card p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {approval.users?.nome ?? 'Usuário desconhecido'}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium',
                      approval.aprovado
                        ? 'bg-success-light text-success'
                        : 'bg-warning-light text-warning',
                    )}
                  >
                    {approval.aprovado ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        Aprovado
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3" />
                        Revisão solicitada
                      </>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <Clock className="h-3 w-3 shrink-0" />
                  {formatDate(approval.criado_em)}
                </div>

                {approval.notas && (
                  <p className="text-xs text-muted-foreground border-t border-border pt-1.5 mt-1">
                    {approval.notas}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
