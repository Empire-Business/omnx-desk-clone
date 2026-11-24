import { FileCheck, Clock, AlertCircle, CheckCircle2, ArrowUpRight, Layers } from 'lucide-react'

import { useCamiDeliveries, computeCamiStats, isCamiIntegrationReady, CAMI_STATUS_LABEL, CAMI_STATUS_TONE } from '@/hooks/useCamiDeliveries'
import { Carousel } from '@/components/ui/Carousel'
import { cn } from '@/lib/utils'

interface Props { onSeeAll?: () => void; isAdmin: boolean }

export function CamiDeliveriesPanel({ onSeeAll, isAdmin }: Props) {
  const ready = isCamiIntegrationReady()
  const { data, isLoading } = useCamiDeliveries()
  const list = data?.deliveries ?? []
  const stats = computeCamiStats(list)

  // Quando integração ainda não está ativa, mostra placeholder informativo
  if (!ready) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-muted">
            <FileCheck className="h-3.5 w-3.5 text-primary" />
          </span>
          <h3 className="text-sm font-semibold text-foreground">Entregas</h3>
          <span className="rounded-md bg-muted px-1.5 py-0 text-[10.5px] font-medium text-muted-foreground">
            integração pendente
          </span>
          <span className="ml-1 h-px flex-1 bg-border/60" />
        </div>
        <div className="px-5 py-6 text-center">
          <Layers className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            As entregas vão aparecer aqui quando a integração com a plataforma de produção estiver ativa.
          </p>
          <p className="mt-1 text-[11.5px] text-muted-foreground/70">
            Status: aguardando configuração das credenciais e edge function.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <div className="rounded-xl border border-border/60 bg-card/40 h-48 shimmer" />
  }

  if (list.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-muted">
            <FileCheck className="h-3.5 w-3.5 text-primary" />
          </span>
          <h3 className="text-sm font-semibold text-foreground">Entregas</h3>
          <span className="ml-1 h-px flex-1 bg-border/60" />
        </div>
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted-foreground">Sem entregas pra mostrar.</p>
        </div>
      </div>
    )
  }

  // Lista priorizada: atrasadas → revisao/alteracao → aprovado
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()
  const sorted = [...list].sort((a, b) => {
    const aPend = a.status !== 'aprovado' && a.status !== 'arquivado'
    const bPend = b.status !== 'aprovado' && b.status !== 'arquivado'
    const prazoA = a.client_deadline_at ?? a.publish_date ?? a.edit_deadline
    const prazoB = b.client_deadline_at ?? b.publish_date ?? b.edit_deadline
    const aAtras = aPend && prazoA && new Date(prazoA).getTime() < todayMs
    const bAtras = bPend && prazoB && new Date(prazoB).getTime() < todayMs
    if (aAtras !== bAtras) return aAtras ? -1 : 1
    if (aPend !== bPend) return aPend ? -1 : 1
    if (prazoA && prazoB) return new Date(prazoA).getTime() - new Date(prazoB).getTime()
    return 0
  })
  const recentes = sorted.slice(0, 8)

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-muted">
          <FileCheck className="h-3.5 w-3.5 text-primary" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">Entregas</h3>
        <span className="text-xs text-muted-foreground">· {isAdmin ? 'visão geral' : 'suas entregas'}</span>
        <span className="rounded-md bg-muted px-1.5 py-0 text-[10.5px] font-semibold text-muted-foreground tabular-nums">
          {stats.total}
        </span>
        <span className="ml-1 h-px flex-1 bg-border/60" />
        {onSeeAll && (
          <button
            onClick={onSeeAll}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            ver todas <ArrowUpRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Lista — carrossel de 3 itens por slide */}
      <Carousel
        items={recentes}
        itemsPerSlide={3}
        autoPlayInterval={9000}
        getKey={d => d.id}
        renderItem={d => {
          const prazoStr = d.client_deadline_at ?? d.publish_date ?? d.edit_deadline
          const prazoMs = prazoStr ? new Date(prazoStr).getTime() : null
          const isPend = d.status !== 'aprovado' && d.status !== 'arquivado'
          const atrasada = !!(isPend && prazoMs && prazoMs < todayMs)
          const dias = prazoMs != null ? Math.floor((prazoMs - todayMs) / 86400000) : null
          return (
            <div className="grid grid-cols-[24px_1fr_auto] items-center gap-3 px-5 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/60 last:border-b-0">
              <span className={cn(
                'flex h-6 w-6 items-center justify-center rounded-md',
                atrasada ? 'bg-danger/15' : isPend ? 'bg-info/15' : 'bg-success/15',
              )}>
                {atrasada ? <AlertCircle className="h-3.5 w-3.5 text-danger" />
                  : isPend ? <Clock className="h-3.5 w-3.5 text-info" />
                  : <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-foreground truncate">{d.title}</p>
                <p className="text-[11.5px] text-muted-foreground truncate">
                  {d.client_nome ?? d.workspace_name ?? '—'}
                  {d.channel && ` · ${d.channel}`}
                  {isAdmin && d.estrategista_nome && (
                    <> · <span className="font-semibold text-foreground/80">{d.estrategista_nome}</span></>
                  )}
                  {prazoStr && (
                    <>
                      {' · '}
                      {atrasada
                        ? <span className="text-danger font-semibold">atrasada {Math.abs(dias ?? 0)}d</span>
                        : dias === 0 ? <span className="text-warning font-semibold">vence hoje</span>
                        : dias != null && dias > 0 ? <>vence em {dias}d</>
                        : null}
                    </>
                  )}
                </p>
              </div>
              <span className={cn('rounded-md px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap', CAMI_STATUS_TONE[d.status])}>
                {CAMI_STATUS_LABEL[d.status]}
              </span>
            </div>
          )
        }}
      />
    </div>
  )
}

