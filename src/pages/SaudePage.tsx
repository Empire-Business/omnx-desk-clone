import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePermissoes } from '@/hooks/usePermissoes'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

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

interface ResumoApp {
  app: string
  erros: number
  avisos: number
  ultimo: string | null
}

interface LinhaLog {
  id: string
  app: string
  nivel: string
  evento: string
  mensagem: string | null
  rota: string | null
  created_at: string
}

function fmtQuando(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function SaudePage() {
  const { can, carregando } = usePermissoes()
  const [horas, setHoras] = useState<number>(24)

  const { data: resumo, isLoading } = useQuery({
    queryKey: ['saude', 'resumo', horas],
    queryFn: async (): Promise<ResumoApp[]> => {
      const { data, error } = await supabase.rpc('resumo_saude_apps' as never, { p_horas: horas } as never)
      if (error) throw error
      return (data ?? []) as unknown as ResumoApp[]
    },
    enabled: can('auditoria', 'admin'),
  })

  const { data: ultimos } = useQuery({
    queryKey: ['saude', 'ultimos'],
    queryFn: async (): Promise<LinhaLog[]> => {
      const { data, error } = await supabase
        .from('app_logs' as never)
        .select('id, app, nivel, evento, mensagem, rota, created_at')
        .eq('nivel', 'erro')
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as unknown as LinhaLog[]
    },
    enabled: can('auditoria', 'admin'),
  })

  if (carregando) return null
  // Mesmo gate da Auditoria: quem investiga incidente é quem lê os dois.
  if (!can('auditoria', 'admin')) return <Navigate to="/" replace />

  const totalErros = (resumo ?? []).reduce((s, r) => s + Number(r.erros), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saúde do sistema"
        description="Erros registrados por app. Serve para descobrir o que está quebrando antes de alguém reclamar."
      />

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/40 p-1 w-fit">
        {JANELAS.map((j) => (
          <button
            key={j.horas}
            onClick={() => setHoras(j.horas)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              horas === j.horas
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {j.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
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
              <p className="mt-2 font-display text-2xl font-bold tabular-nums text-foreground">
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

      {(ultimos?.length ?? 0) > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-semibold text-foreground">Últimos erros</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Quando</th>
                  <th className="px-4 py-2 font-medium">App</th>
                  <th className="px-4 py-2 font-medium">Evento</th>
                  <th className="px-4 py-2 font-medium">Mensagem</th>
                  <th className="px-4 py-2 font-medium">Tela</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(ultimos ?? []).map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{fmtQuando(l.created_at)}</td>
                    <td className="px-4 py-2 capitalize">{l.app}</td>
                    <td className="px-4 py-2 font-mono text-xs">{l.evento}</td>
                    <td className="max-w-md truncate px-4 py-2 text-muted-foreground" title={l.mensagem ?? ''}>
                      {l.mensagem ?? '—'}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{l.rota ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
