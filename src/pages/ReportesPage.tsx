import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Bug, Inbox, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
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
  recebido: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  em_triagem: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  precisa_info: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  confirmado: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  em_desenvolvimento: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  em_validacao: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  corrigido: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  nao_reproduzido: 'bg-muted text-muted-foreground',
  duplicado: 'bg-muted text-muted-foreground',
  encerrado: 'bg-muted text-muted-foreground',
}

const IMPACTO_CLS: Record<string, string> = {
  baixo: 'text-muted-foreground',
  medio: 'text-blue-600 dark:text-blue-400',
  alto: 'text-amber-600 dark:text-amber-400',
  critico: 'text-destructive font-semibold',
}

const inputCls =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30'

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
    <div className="space-y-6">
      <PageHeader
        title="Reportes de erro"
        description="Problemas reportados pelos usuários desta conta. Clique para triar."
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Status:</span>
        <select
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
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
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {lista.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelecionado(r)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                <Bug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{r.protocolo}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_CLS[r.status])}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span className={cn('text-[11px] uppercase', IMPACTO_CLS[r.impacto])}>{r.impacto}</span>
                  </div>
                  <p className="mt-0.5 truncate font-medium text-foreground">{r.titulo}</p>
                  <p className="text-xs text-muted-foreground">
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
    </div>
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
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-[11px]">
              {reporte.console_logs.map((l, i) => (
                <li
                  key={i}
                  className={cn(
                    'flex gap-2 rounded px-1.5 py-0.5',
                    l.nivel === 'error' && 'bg-destructive/10 text-destructive',
                    l.nivel === 'warn' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
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
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-[11px]">
              {reporte.network_logs.map((r, i) => (
                <li
                  key={i}
                  className={cn(
                    'flex gap-2 rounded px-1.5 py-0.5',
                    // Sem status = falhou antes de responder (rede caiu, CORS).
                    (r.status === null || r.status >= 400)
                      ? 'bg-destructive/10 text-destructive'
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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as ReporteStatus)}>
                {(Object.keys(STATUS_LABEL) as ReporteStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Prioridade</label>
              <select className={inputCls} value={prioridade} onChange={(e) => setPrioridade(e.target.value as ReportePrioridade)}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nota interna</label>
            <textarea
              className={cn(inputCls, 'min-h-[60px] resize-y')}
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              placeholder="Anotações da equipe (não visível ao usuário)"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Resposta ao usuário
            </label>
            <textarea
              className={cn(inputCls, 'min-h-[60px] resize-y')}
              value={respostaUsuario}
              onChange={(e) => setRespostaUsuario(e.target.value)}
              placeholder="Aparece para quem reportou, em Meus reportes"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Link da task (opcional)
            </label>
            <input
              className={inputCls}
              value={linkExterno}
              onChange={(e) => setLinkExterno(e.target.value)}
              placeholder="https://… issue ou card onde a correção é acompanhada"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={atualizar.isPending}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={atualizar.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
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
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-sm font-medium capitalize text-foreground">{valor}</div>
    </div>
  )
}

function Bloco({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{texto}</p>
    </div>
  )
}
