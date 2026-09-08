import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Send, AlertCircle, Upload, TrendingUp, BarChart3 } from 'lucide-react'
import { useDevedores, useCobrancaSendMetrics, useCobrancaReguas } from '@/hooks/useCobranca'
import { PageHeader } from '@/components/ui/PageHeader'
import { HistoricoPage } from './HistoricoPage'
import { cn, formatPhone } from '@/lib/utils'

function statusLabel(status: string) {
  const map: Record<string, string> = {
    ativa: 'Ativa',
    pausada: 'Pausada',
    encerrada: 'Encerrada',
    pago: 'Pago',
  }
  return map[status] ?? status
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'ativa':
      return 'bg-info-light text-info'
    case 'pausada':
      return 'bg-warning-light text-warning'
    case 'encerrada':
      return 'bg-muted text-muted-foreground'
    case 'pago':
      return 'bg-success-light text-success'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

type Tab = 'geral' | 'historico'

const TABS: { value: Tab; label: string }[] = [
  { value: 'geral', label: 'Visão Geral' },
  { value: 'historico', label: 'Histórico' },
]

export function CobrancaDashboardPage() {
  const [tab, setTab] = useState<Tab>('geral')
  const navigate = useNavigate()
  const { data: devedores, isLoading } = useDevedores()
  const { data: metrics, isLoading: metricsLoading } = useCobrancaSendMetrics()
  const { data: reguas } = useCobrancaReguas()

  const stats = useMemo(() => {
    if (!devedores) return { ativa: 0, pausada: 0, encerrada: 0, pago: 0, total: 0 }
    return devedores.reduce(
      (acc, d) => {
        acc.total += 1
        if (d.status in acc) {
          ;(acc as Record<string, number>)[d.status] += 1
        }
        return acc
      },
      { ativa: 0, pausada: 0, encerrada: 0, pago: 0, total: 0 },
    )
  }, [devedores])

  const taxaRecuperacao = useMemo(() => {
    if (!stats.total) return '0%'
    return `${((stats.pago / stats.total) * 100).toFixed(1)}%`
  }, [stats])

  const reguaStats = useMemo(() => {
    if (!devedores || !reguas) return []
    return reguas.map((r) => {
      const devs = devedores.filter((d) => d.regua_id === r.id)
      const pagos = devs.filter((d) => d.status === 'pago').length
      const ativos = devs.filter((d) => d.status === 'ativa').length
      return {
        id: r.id,
        nome: r.nome,
        total: devs.length,
        ativos,
        pagos,
        taxa: devs.length > 0 ? ((pagos / devs.length) * 100).toFixed(1) : '0.0',
      }
    }).filter((r) => r.total > 0)
  }, [devedores, reguas])

  const kpis = [
    {
      title: 'Total ativos',
      value: isLoading ? '—' : String(stats.ativa),
      icon: Users,
      color: 'text-info',
      bgColor: 'bg-info-light',
    },
    {
      title: 'Enviados hoje',
      value: metricsLoading ? '—' : String(metrics?.enviadosHoje ?? 0),
      icon: Send,
      color: 'text-primary',
      bgColor: 'bg-primary-muted',
    },
    {
      title: 'Taxa de recuperação',
      value: isLoading ? '—' : taxaRecuperacao,
      icon: TrendingUp,
      color: 'text-success',
      bgColor: 'bg-success-light',
    },
    {
      title: 'Falhas hoje',
      value: metricsLoading ? '—' : String(metrics?.falhasHoje ?? 0),
      icon: AlertCircle,
      color: 'text-danger',
      bgColor: 'bg-danger-light',
    },
  ]

  const statusDistribution = useMemo(() => {
    if (!devedores || devedores.length === 0) return []
    const total = devedores.length
    return [
      { key: 'ativa', label: 'Ativa', count: stats.ativa, pct: (stats.ativa / total) * 100, barClass: 'bg-info' },
      { key: 'pausada', label: 'Pausada', count: stats.pausada, pct: (stats.pausada / total) * 100, barClass: 'bg-warning' },
      { key: 'encerrada', label: 'Encerrada', count: stats.encerrada, pct: (stats.encerrada / total) * 100, barClass: 'bg-muted-foreground' },
      { key: 'pago', label: 'Pago', count: stats.pago, pct: (stats.pago / total) * 100, barClass: 'bg-success' },
    ]
  }, [devedores, stats])

  const recentDevedores = useMemo(() => {
    if (!devedores) return []
    return [...devedores]
      .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())
      .slice(0, 10)
  }, [devedores])

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 p-3 sm:p-4 lg:p-6 animate-fade-in">
      <PageHeader
        title="Dashboard"
        description="Visão geral da cobrança"
        action={
          tab === 'geral' ? (
            <button
              onClick={() => navigate('/cobranca/devedores')}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Upload className="h-4 w-4" />
              Importar devedores
            </button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'historico' && <HistoricoPage />}

      {tab === 'geral' && <>
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.title} className="glass-card flex items-start gap-4 p-5">
            <div className={cn('rounded-lg p-2.5 shrink-0', kpi.bgColor)}>
              <kpi.icon className={cn('h-5 w-5', kpi.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] tracking-wider uppercase text-muted-foreground">{kpi.title}</p>
              <p className="mt-1 font-display text-2xl sm:text-3xl font-bold text-foreground tracking-tight">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Send metrics summary */}
      {metrics && (metrics.totalEnviados > 0 || metrics.totalFalhas > 0) && (
        <div className="glass-card p-5 space-y-3">
          <h3 className="text-base font-bold text-foreground">Envios (geral)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Total enviados</p>
              <p className="text-lg font-bold text-foreground">{metrics.totalEnviados}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total falhas</p>
              <p className="text-lg font-bold text-foreground">{metrics.totalFalhas}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taxa de entrega</p>
              <p className="text-lg font-bold text-success">
                {metrics.totalEnviados + metrics.totalFalhas > 0
                  ? `${((metrics.totalEnviados / (metrics.totalEnviados + metrics.totalFalhas)) * 100).toFixed(1)}%`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Envios hoje</p>
              <p className="text-lg font-bold text-foreground">{metrics.totalHoje}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:gap-6 xl:grid-cols-3">
        {/* Status distribution */}
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-base font-bold text-foreground">Distribuição por status</h3>
          {isLoading ? (
            <div className="h-32 shimmer rounded-lg" />
          ) : devedores && devedores.length > 0 ? (
            <div className="space-y-3">
              <div className="flex h-4 w-full overflow-hidden rounded-full gap-0.5">
                {statusDistribution.map((s) =>
                  s.pct > 0 ? (
                    <div
                      key={s.key}
                      className={cn('h-full transition-all', s.barClass)}
                      style={{ width: `${s.pct}%` }}
                      title={`${s.label}: ${s.count}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="space-y-1.5">
                {statusDistribution.map((s) => (
                  <div key={s.key} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full', s.barClass)} />
                      <span className="text-muted-foreground">{s.label}</span>
                    </div>
                    <span className="font-medium text-foreground">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Nenhum devedor cadastrado.
            </div>
          )}
        </div>

        {/* Recent devedores */}
        <div className="glass-card xl:col-span-2 p-5 space-y-4">
          <h3 className="text-base font-bold text-foreground">Devedores recentes</h3>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 shimmer rounded-lg" />
              ))}
            </div>
          ) : recentDevedores.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Nenhum devedor cadastrado ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground">Nome</th>
                    <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground">Número</th>
                    <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground">Próximo envio</th>
                    <th className="pb-2 text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentDevedores.map((d) => (
                    <tr
                      key={d.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => navigate('/cobranca/devedores')}
                    >
                      <td className="py-2.5 pr-4 font-medium text-foreground">{d.nome}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{formatPhone(d.numero_whatsapp)}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">
                        {d.proximo_envio_em
                          ? new Date(d.proximo_envio_em).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            statusBadgeClass(d.status),
                          )}
                        >
                          {statusLabel(d.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Per-régua stats */}
      {reguaStats.length > 0 && (
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h3 className="text-base font-bold text-foreground">Métricas por régua</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground">Régua</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground text-center">Total</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground text-center">Ativos</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground text-center">Pagos</th>
                  <th className="pb-2 text-xs font-medium text-muted-foreground text-center">Taxa recuperação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reguaStats.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-4 font-medium text-foreground">{r.nome}</td>
                    <td className="py-2.5 pr-4 text-center text-muted-foreground">{r.total}</td>
                    <td className="py-2.5 pr-4 text-center text-info">{r.ativos}</td>
                    <td className="py-2.5 pr-4 text-center text-success">{r.pagos}</td>
                    <td className="py-2.5 text-center">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        parseFloat(r.taxa) >= 50 ? 'bg-success-light text-success' :
                        parseFloat(r.taxa) >= 20 ? 'bg-warning-light text-warning' :
                        'bg-muted text-muted-foreground'
                      )}>
                        {r.taxa}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>}
    </div>
  )
}
