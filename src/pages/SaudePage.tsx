import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { AbasRolaveis } from '@/components/ui/AbasRolaveis'
import { TabelaResponsiva } from '@/components/ui/TabelaResponsiva'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useSaude } from '@/hooks/useSaude'

/**
 * Painel de saúde do sistema (§19 do brief).
 *
 * Responde uma pergunta só: **algum app está quebrando mais do que deveria?**
 * Por isso a tela abre em erros por app, e não num gráfico de volume — volume
 * de log não é problema, erro é.
 *
 * O que aparece aqui vem de `app_logs`, gravado pelo próprio front quando uma
 * query falha, uma mutação falha ou uma exceção escapa. Não há agente externo:
 * é observabilidade caseira, suficiente para dizer onde olhar.
 */

const JANELAS = [
  { horas: 24, label: 'Últimas 24h' },
  { horas: 24 * 7, label: '7 dias' },
  { horas: 24 * 30, label: '30 dias' },
] as const

function fmtQuando(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function SaudePage() {
  const { can, carregando } = usePermissoes()
  const [horas, setHoras] = useState<number>(24)

  const saude = useSaude(horas, can('auditoria', 'admin'))
  const { data: resumo, isLoading, isError: resumoFalhou } = saude.resumo
  const { data: ultimos, isLoading: ultimosCarregando, isError: ultimosFalharam } = saude.ultimos

  if (carregando) return null
  // Mesmo gate da Auditoria: quem investiga incidente é quem lê os dois.
  if (!can('auditoria', 'admin')) return <Navigate to="/" replace />

  const totalErros = (resumo ?? []).reduce((s, r) => s + Number(r.erros), 0)

  return (
    <PageContainer>
      <PageHeader
        title="Saúde do sistema"
        description="Erros registrados por app. Serve para descobrir o que está quebrando antes de alguém reclamar."
      />

      <AbasRolaveis
        variante="segmentado"
        rotulo="Período"
        itens={JANELAS.map((j) => ({ id: String(j.horas), rotulo: j.label, ativo: horas === j.horas, onClick: () => setHoras(j.horas) }))}
      />

      {resumoFalhou ? (
        <p role="alert" className="text-sm text-danger">Não foi possível carregar o resumo deste período. Tente novamente.</p>
      ) : isLoading ? (
        <div role="status" aria-label="Carregando" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="sk h-24 rounded-lg" />)}
        </div>
      ) : totalErros === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nenhum erro registrado no período"
          description="Ou está tudo bem, ou ninguém usou o sistema nesta janela. Compare com uma janela maior para saber qual dos dois."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(resumo ?? []).map((r) => (
            <div key={r.app} className="glass-card p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium capitalize text-foreground">{r.app}</p>
                {Number(r.erros) > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-danger" />
                ) : (
                  <Activity className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <p className="mt-2 t-h2 tabular-nums text-foreground">
                {r.erros}
                <span className="ml-1 text-xs font-normal text-muted-foreground">erro(s)</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {r.avisos} aviso(s) · último em {fmtQuando(r.ultimo)}
              </p>
            </div>
          ))}
        </div>
      )}

      {ultimosFalharam && <p role="alert" className="text-sm text-danger">Não foi possível carregar os últimos erros deste período.</p>}
      {ultimosCarregando && <p role="status" className="text-sm text-muted-foreground">Carregando erros do período…</p>}
      {!ultimosFalharam && (ultimos?.length ?? 0) > 0 && (
        <section>
          <h2 className="t-h4 mb-2 text-foreground">Últimos erros do período</h2>
          <p className="mb-3 text-[13px] text-muted-foreground">Até 30 registros mais recentes da janela selecionada.</p>
          <TabelaResponsiva
            rotulo="Últimos erros do período"
            linhas={ultimos ?? []}
            chave={(l) => String(l.id)}
            colunas={[
              { id: 'quando', titulo: 'Quando', principal: true, celula: (l) => fmtQuando(l.created_at) },
              { id: 'app', titulo: 'App', celula: (l) => <span className="capitalize">{l.app}</span> },
              { id: 'evento', titulo: 'Evento', celula: (l) => <span className="t-mono">{l.evento}</span> },
              { id: 'mensagem', titulo: 'Mensagem', celula: (l) => <span className="line-clamp-2 break-words" title={l.mensagem ?? ''}>{l.mensagem ?? '—'}</span> },
              { id: 'rota', titulo: 'Tela', celula: (l) => <span className="t-mono break-all text-muted-foreground">{l.rota ?? '—'}</span> },
            ]}
          />
        </section>
      )}
    </PageContainer>
  )
}
