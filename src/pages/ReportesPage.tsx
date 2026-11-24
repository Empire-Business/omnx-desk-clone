import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Bug, Inbox, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { usePermissoes } from '@/hooks/usePermissoes'
import { cn } from '@/lib/utils'
import {
  useReportes,
  useAtualizarReporte,
  type Reporte,
  type ReporteStatus,
  type ReportePrioridade,
} from '@/hooks/useReportes'

const STATUS_LABEL: Record<ReporteStatus, string> = {
  recebido: 'Recebido',
  em_triagem: 'Em triagem',
  precisa_info: 'Precisa de info',
  confirmado: 'Confirmado',
  em_desenvolvimento: 'Em desenvolvimento',
  em_validacao: 'Em validação',
  corrigido: 'Corrigido',
  nao_reproduzido: 'Não reproduzido',
  duplicado: 'Duplicado',
  encerrado: 'Encerrado',
}

const STATUS_CLS: Record<ReporteStatus, string> = {
  recebido: 'bg-st-open text-st-open-fg',
  em_triagem: 'bg-st-waiting text-st-waiting-fg',
  precisa_info: 'bg-st-waiting text-st-waiting-fg',
  confirmado: 'bg-st-progress text-st-progress-fg',
  em_desenvolvimento: 'bg-st-progress text-st-progress-fg',
  em_validacao: 'bg-st-progress text-st-progress-fg',
  corrigido: 'bg-st-done text-st-done-fg',
  nao_reproduzido: 'bg-muted text-muted-foreground',
  duplicado: 'bg-muted text-muted-foreground',
  encerrado: 'bg-muted text-muted-foreground',
}

const IMPACTO_CLS: Record<string, string> = {
  baixo: 'text-muted-foreground',
  medio: 'text-st-open-fg',
  alto: 'text-st-waiting-fg',
  critico: 'text-danger font-semibold',
}

export function ReportesPage() {
  const { can, carregando } = usePermissoes()
  // Triagem passa a ser delegavel pela matriz (ex.: um suporte dedicado).
  if (!carregando && !can('reportes', 'admin')) return <Navigate to="/" replace />
  return <ReportesBoard />
}

function ReportesBoard() {
  const { data: reportes, isLoading } = useReportes()
  const [filtroStatus, setFiltroStatus] = useState<'todos' | ReporteStatus>('todos')
  const [selecionado, setSelecionado] = useState<Reporte | null>(null)

  const lista = useMemo(() => {
    const arr = reportes ?? []
    return filtroStatus === 'todos' ? arr : arr.filter((r) => r.status === filtroStatus)
  }, [reportes, filtroStatus])

  return (
    <PageContainer>
      <PageHeader
        title="Problemas relatados"
        description="Problemas reportados pelos usuários desta conta. Clique para triar."
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Status:</span>
        <select
          className="select w-auto min-w-[180px]"
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value as 'todos' | ReporteStatus)}
        >
          <option value="todos">Todos</option>
          {(Object.keys(STATUS_LABEL) as ReporteStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div role="status" aria-label="Carregando reportes" className="space-y-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="sk h-16 rounded-lg" />)}
        </div>
      )}

      {!isLoading && lista.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="Nenhum reporte por aqui"
          description="Quando alguém reportar um problema pelo botão flutuante, ele aparece aqui."
        />
      )}

      {!isLoading && lista.length > 0 && (
        <ul className="divide-y divide-stroke-subtle overflow-hidden rounded-lg border border-card-border bg-card">
          {lista.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelecionado(r)}
                className="focus-ds flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-fast hover:bg-bg-1"
              >
                <Bug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="t-mono text-muted-foreground">{r.protocolo}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', STATUS_CLS[r.status])}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span className={cn('text-[11.5px] uppercase', IMPACTO_CLS[r.impacto])}>{r.impacto}</span>
                  </div>
                  <p className="mt-0.5 truncate font-medium text-foreground">{r.titulo}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {r.reportado_nome || 'Anônimo'} · {r.rota || '—'} ·{' '}
                    {new Date(r.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selecionado && (
        <ReporteDetalhe reporte={selecionado} onClose={() => setSelecionado(null)} />
      )}
    </PageContainer>
  )
}

function ReporteDetalhe({ reporte, onClose }: { reporte: Reporte; onClose: () => void }) {
  const atualizar = useAtualizarReporte()
  const [status, setStatus] = useState<ReporteStatus>(reporte.status)
  const [prioridade, setPrioridade] = useState<ReportePrioridade>(reporte.prioridade)
  const [resposta, setResposta] = useState(reporte.resposta_interna ?? '')
  const [respostaUsuario, setRespostaUsuario] = useState(reporte.resposta_usuario ?? '')
  const [linkExterno, setLinkExterno] = useState(reporte.link_externo ?? '')

  const salvar = () => {
    atualizar.mutate(
      {
        id: reporte.id,
        status,
        prioridade,
        resposta_interna: resposta,
        resposta_usuario: respostaUsuario.trim() || null,
        link_externo: linkExterno.trim() || null,
      },
      { onSuccess: onClose },
    )
  }

  const ctx = reporte.contexto as Record<string, unknown>

  return (
    <Modal open onClose={onClose} title={`${reporte.protocolo} — ${reporte.titulo}`} size="lg">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Categoria" valor={reporte.categoria} />
          <Campo label="Impacto" valor={reporte.impacto} />
          <Campo label="Reportado por" valor={reporte.reportado_nome || '—'} />
        </div>

        {reporte.descricao && <Bloco titulo="Detalhes" texto={reporte.descricao} />}
        {reporte.passos && <Bloco titulo="Passos para reproduzir" texto={reporte.passos} />}
        {(reporte.resultado_esperado || reporte.resultado_ocorrido) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Bloco titulo="Esperado" texto={reporte.resultado_esperado || '—'} />
            <Bloco titulo="Ocorrido" texto={reporte.resultado_ocorrido || '—'} />
          </div>
        )}

        <details className="rounded-lg border border-border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Contexto técnico</summary>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {Object.entries(ctx).map(([k, v]) => (
              <div key={k} className="flex gap-1">
                <dt className="font-medium">{k}:</dt>
                <dd className="truncate">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </details>

        {/* Logs capturados no navegador do usuário. Ficam recolhidos: são a
            resposta para "o que aconteceu antes?", mas só quando a pergunta
            aparece — abertos por padrão, empurrariam a triagem para baixo. */}
        {reporte.console_logs?.length > 0 && (
          <details className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              Console ({reporte.console_logs.length} entradas, mais recentes por último)
            </summary>
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-[12px]">
              {reporte.console_logs.map((l, i) => (
                <li
                  key={i}
                  className={cn(
                    'flex gap-2 rounded px-1.5 py-0.5',
                    l.nivel === 'error' && 'bg-danger-light text-danger',
                    l.nivel === 'warn' && 'bg-note text-note-fg',
                    (l.nivel === 'log' || l.nivel === 'info') && 'text-muted-foreground',
                  )}
                >
                  <span className="shrink-0 opacity-60">
                    {new Date(l.em).toLocaleTimeString('pt-BR')}
                  </span>
                  <span className="whitespace-pre-wrap break-all">{l.mensagem}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {reporte.network_logs?.length > 0 && (
          <details className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              Requisições ({reporte.network_logs.length})
            </summary>
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-[12px]">
              {reporte.network_logs.map((r, i) => (
                <li
                  key={i}
                  className={cn(
                    'flex gap-2 rounded px-1.5 py-0.5',
                    // Sem status = falhou antes de responder (rede caiu, CORS).
                    (r.status === null || r.status >= 400)
                      ? 'bg-danger-light text-danger'
                      : 'text-muted-foreground',
                  )}
                >
                  <span className="shrink-0 opacity-60">{r.metodo}</span>
                  <span className="shrink-0 font-semibold">{r.status ?? 'erro'}</span>
                  <span className="shrink-0 opacity-60">{r.duracao_ms}ms</span>
                  <span className="truncate">{r.url}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Triagem */}
        <div className="rounded-lg border border-border p-3 space-y-3">
          <p className="text-sm font-semibold text-foreground">Triagem</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12.5px] font-semibold text-fg-2">Status</label>
              <select className="select w-full" value={status} onChange={(e) => setStatus(e.target.value as ReporteStatus)}>
                {(Object.keys(STATUS_LABEL) as ReporteStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12.5px] font-semibold text-fg-2">Prioridade</label>
              <select className="select w-full" value={prioridade} onChange={(e) => setPrioridade(e.target.value as ReportePrioridade)}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-fg-2">Nota interna</label>
            <textarea
              className={cn('textarea w-full min-h-[72px] resize-y')}
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              placeholder="Anotações da equipe (não visível ao usuário)"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-fg-2">
              Resposta ao usuário
            </label>
            <textarea
              className={cn('textarea w-full min-h-[72px] resize-y')}
              value={respostaUsuario}
              onChange={(e) => setRespostaUsuario(e.target.value)}
              placeholder="Aparece para quem reportou, em Meus reportes"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-fg-2">
              Link da task (opcional)
            </label>
            <input
              className="input w-full"
              value={linkExterno}
              onChange={(e) => setLinkExterno(e.target.value)}
              placeholder="https://… issue ou card onde a correção é acompanhada"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={atualizar.isPending}
            className="btn btn-secondary"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={atualizar.isPending}
            className="btn btn-primary"
          >
            {atualizar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar triagem
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <div className="text-sm font-medium capitalize text-foreground">{valor}</div>
    </div>
  )
}

function Bloco({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <p className="text-[12.5px] font-semibold text-fg-2">{titulo}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{texto}</p>
    </div>
  )
}
