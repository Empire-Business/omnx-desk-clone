import { useState } from 'react'
import { LifeBuoy, Paperclip, ChevronRight, MessageSquare } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import {
  useMeusReportes,
  urlAnexoReporte,
  type Reporte,
  type ReporteStatus,
} from '@/hooks/useReportes'

/**
 * Acompanhamento do próprio reporte (§14.5 da Fase 5). Antes, quem reportava um
 * problema não tinha como saber o que aconteceu depois — só recebia o protocolo.
 */

/** Rótulo e cor por status, na linguagem de quem reportou (não a interna da equipe). */
const STATUS_INFO: Record<ReporteStatus, { label: string; classe: string }> = {
  recebido:           { label: 'Recebido',            classe: 'bg-st-open text-st-open-fg' },
  em_triagem:         { label: 'Em análise',          classe: 'bg-st-progress text-st-progress-fg' },
  precisa_info:       { label: 'Precisamos de você',  classe: 'bg-st-waiting text-st-waiting-fg' },
  confirmado:         { label: 'Confirmado',          classe: 'bg-st-progress text-st-progress-fg' },
  em_desenvolvimento: { label: 'Sendo corrigido',     classe: 'bg-st-progress text-st-progress-fg' },
  em_validacao:       { label: 'Em teste',            classe: 'bg-st-progress text-st-progress-fg' },
  corrigido:          { label: 'Corrigido',           classe: 'bg-st-done text-st-done-fg' },
  nao_reproduzido:    { label: 'Não reproduzido',     classe: 'bg-muted text-muted-foreground' },
  duplicado:          { label: 'Já reportado antes',  classe: 'bg-muted text-muted-foreground' },
  encerrado:          { label: 'Encerrado',           classe: 'bg-muted text-muted-foreground' },
}

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function MeusReportesPage() {
  const { data: reportes, isLoading } = useMeusReportes()
  const [aberto, setAberto] = useState<string | null>(null)

  return (
    <PageContainer largura="leitura">
      <PageHeader
        title="Meus pedidos de suporte"
        description="Os problemas que você relatou e em que pé está cada um."
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="sk h-16 rounded-lg" />)}
        </div>
      ) : !reportes || reportes.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="Você ainda não reportou nada"
          description="Quando encontrar um problema, use o botão “Reportar problema” no canto da tela."
        />
      ) : (
        <div className="space-y-2">
          {reportes.map((r) => (
            <ReporteCard
              key={r.id}
              reporte={r}
              expandido={aberto === r.id}
              onToggle={() => setAberto((a) => (a === r.id ? null : r.id))}
            />
          ))}
        </div>
      )}
    </PageContainer>
  )
}

function ReporteCard({
  reporte, expandido, onToggle,
}: {
  reporte: Reporte
  expandido: boolean
  onToggle: () => void
}) {
  const info = STATUS_INFO[reporte.status] ?? STATUS_INFO.recebido
  const anexos = reporte.anexos ?? []

  async function abrirAnexo(path: string) {
    const url = await urlAnexoReporte(path)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={cn('glass-card overflow-hidden transition-colors', expandido && 'ring-1 ring-primary/20')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expandido}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-fast hover:bg-bg-1 focus-ds min-h-14 sm:px-4"
      >
        <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expandido && 'rotate-90')} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{reporte.titulo}</span>
          <span className="block text-[13px] text-muted-foreground">
            {reporte.protocolo} · {dataBR(reporte.created_at)}
          </span>
        </span>
        {anexos.length > 0 && (
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
            <Paperclip className="h-3 w-3" /> {anexos.length}
          </span>
        )}
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium', info.classe)}>
          {info.label}
        </span>
      </button>

      {expandido && (
        <div className="space-y-3 border-t border-stroke-subtle bg-bg-1 px-3 py-4 text-sm sm:px-4">
          {reporte.descricao && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">O que você relatou</p>
              <p className="whitespace-pre-wrap text-foreground">{reporte.descricao}</p>
            </div>
          )}

          {/* Só a resposta destinada ao usuário. A nota interna da equipe nunca aparece aqui. */}
          {reporte.resposta_usuario && (
            <div className="rounded-lg border border-stroke-default bg-primary-muted p-3">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-primary">
                <MessageSquare className="h-3 w-3" /> Resposta da equipe
              </p>
              <p className="mt-1 whitespace-pre-wrap text-foreground">{reporte.resposta_usuario}</p>
            </div>
          )}

          {anexos.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Anexos</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {anexos.map((a) => (
                  <button
                    key={a.storage_path}
                    type="button"
                    onClick={() => abrirAnexo(a.storage_path)}
                    className="btn btn-secondary btn-sm"
                  >
                    <Paperclip className="h-3 w-3" />
                    <span className="max-w-[180px] truncate">{a.nome_original}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {reporte.status === 'precisa_info' && (
            <p className="rounded-lg border border-note-border bg-note px-3 py-2 text-[13px] text-note-fg">
              A equipe precisa de mais detalhes para seguir. Responda pelo canal de sempre citando o
              protocolo {reporte.protocolo}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
