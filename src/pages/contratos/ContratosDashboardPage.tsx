import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Wallet, FileText, TrendingUp, Receipt, Plus, Link as LinkIcon, Check } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ContratosTabs } from '@/components/contratos/ContratosTabs'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useContratos, useConsultores, type Contrato } from '@/hooks/useComissoes'
import { cn } from '@/lib/utils'

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Formato compacto pra caber nos gráficos: R$ 2,6 mi / R$ 125 mil. */
function fmtCompacto(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (v >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
  return fmtBRL(v)
}

/** "TROCOU DE ESTRATEGISTA" → "Trocou de estrategista". */
function sentence(s: string) {
  const l = s.toLowerCase().trim()
  return l ? l.charAt(0).toUpperCase() + l.slice(1) : s
}

// Mesmo mapa de cores da lista/kanban de contratos
const STATUS_ACCENT: Record<string, string> = {
  'ATIVO': 'bg-success',
  'ACOMPANHAMENTO': 'bg-info',
  'FASE DE RENOVAÇÃO': 'bg-warning',
  'PAUSADO': 'bg-orange-500',
  'INADIMPLENTE': 'bg-danger',
  'TROCOU DE ESTRATEGISTA': 'bg-purple-500',
  'CANCELADO': 'bg-danger/50',
  'CONCLUÍDO': 'bg-emerald-500',
  'INATIVO': 'bg-muted-foreground',
  'BONIFICAÇÃO': 'bg-violet-500',
  'NÃO INICIADO': 'bg-muted-foreground',
}
const accentDe = (status: string) => STATUS_ACCENT[status] ?? 'bg-muted-foreground'

function statusKey(c: Contrato): string {
  return (c.status_secundario ?? c.status).toUpperCase()
}

export function ContratosDashboardPage() {
  const { user } = useAuth()
  const { can } = usePermissoes()
  // Quem só tem Onboarding cai direto nele.
  if (user && !can('contratos', 'ver')) return <Navigate to="/contratos/onboarding" replace />

  return <DashboardContratos />
}

function DashboardContratos() {
  const navigate = useNavigate()
  const { can } = usePermissoes()
  const { data: contratos, isLoading } = useContratos()
  const { data: consultores } = useConsultores()

  // Link do formulário público de vendas — só admin vê/copia pra enviar aos closers.
  const [linkCopiado, setLinkCopiado] = useState(false)
  const linkFormulario = `${window.location.origin}/vendas/nova`
  async function copiarLinkFormulario() {
    try {
      await navigator.clipboard.writeText(linkFormulario)
      setLinkCopiado(true)
      setTimeout(() => setLinkCopiado(false), 2000)
    } catch {
      window.prompt('Copie o link do formulário:', linkFormulario)
    }
  }

  const stats = useMemo(() => {
    const all = contratos ?? []
    const ativos = all.filter((c) => c.status === 'ativo')
    const faturamentoAtivo = ativos.reduce((s, c) => s + Number(c.valor_total ?? 0), 0)
    const ticketMedio = ativos.length > 0 ? faturamentoAtivo / ativos.length : 0

    const porStatus = new Map<string, { count: number; valor: number }>()
    for (const c of all) {
      const k = statusKey(c)
      const cur = porStatus.get(k) ?? { count: 0, valor: 0 }
      cur.count += 1
      cur.valor += Number(c.valor_total ?? 0)
      porStatus.set(k, cur)
    }

    const porProduto = new Map<string, { count: number; valor: number }>()
    const porEstrategista = new Map<string, { count: number; valor: number }>()
    const nomeEstrategista = (c: Contrato) => {
      const cadastrado = c.estrategista_id
        ? consultores?.find((x) => x.id === c.estrategista_id)?.nome
        : null
      return cadastrado ?? c.estrategista_nome_raw ?? 'Sem estrategista'
    }
    for (const c of ativos) {
      const p = c.produto_nome ?? 'Sem produto'
      const curP = porProduto.get(p) ?? { count: 0, valor: 0 }
      curP.count += 1
      curP.valor += Number(c.valor_total ?? 0)
      porProduto.set(p, curP)

      const e = nomeEstrategista(c)
      const curE = porEstrategista.get(e) ?? { count: 0, valor: 0 }
      curE.count += 1
      curE.valor += Number(c.valor_total ?? 0)
      porEstrategista.set(e, curE)
    }

    // Por tag — sobre TODOS os contratos (uma tag pode estar em vários; somas se sobrepõem).
    const porTag = new Map<string, { id: string; nome: string; cor: string; count: number; valor: number }>()
    for (const c of all) {
      for (const t of c.tags ?? []) {
        const cur = porTag.get(t.id) ?? { id: t.id, nome: t.nome, cor: t.cor, count: 0, valor: 0 }
        cur.count += 1
        cur.valor += Number(c.valor_total ?? 0)
        porTag.set(t.id, cur)
      }
    }

    const now = new Date()
    const meses: { key: string; label: string; count: number; valor: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      meses.push({
        key,
        label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        count: 0,
        valor: 0,
      })
    }
    const idxMes = new Map(meses.map((m, i) => [m.key, i]))
    for (const c of all) {
      const key = (c.data_fechamento ?? '').slice(0, 7)
      const i = idxMes.get(key)
      if (i !== undefined) {
        meses[i].count += 1
        meses[i].valor += Number(c.valor_total ?? 0)
      }
    }

    const sortDesc = (m: Map<string, { count: number; valor: number }>) =>
      Array.from(m.entries()).sort((a, b) => b[1].valor - a[1].valor)

    return {
      total: all.length,
      ativos: ativos.length,
      faturamentoAtivo,
      ticketMedio,
      // por status: ordena por quantidade (mais intuitivo que por valor)
      porStatus: Array.from(porStatus.entries()).sort((a, b) => b[1].count - a[1].count),
      porProduto: sortDesc(porProduto).slice(0, 8),
      porEstrategista: sortDesc(porEstrategista).slice(0, 8),
      porTag: Array.from(porTag.values()).sort((a, b) => b.count - a.count).slice(0, 12),
      meses,
      fechadosPeriodo: meses.reduce((s, m) => s + m.count, 0),
      valorPeriodo: meses.reduce((s, m) => s + m.valor, 0),
    }
  }, [contratos, consultores])

  const kpis = [
    { title: 'Faturamento ativo', value: isLoading ? '—' : fmtBRL(stats.faturamentoAtivo), icon: Wallet, color: 'text-primary', bgColor: 'bg-primary-muted' },
    { title: 'Contratos ativos', value: isLoading ? '—' : String(stats.ativos), icon: FileText, color: 'text-success', bgColor: 'bg-success-light' },
    { title: 'Ticket médio (ativos)', value: isLoading ? '—' : fmtBRL(stats.ticketMedio), icon: TrendingUp, color: 'text-info', bgColor: 'bg-info-light' },
    { title: 'Total de contratos', value: isLoading ? '—' : String(stats.total), icon: Receipt, color: 'text-warning', bgColor: 'bg-warning-light' },
  ]

  const maxMesCount = Math.max(1, ...stats.meses.map((m) => m.count))
  const totalStatus = stats.porStatus.reduce((s, [, v]) => s + v.count, 0)

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <PageHeader
        title="Contratos"
        description="Visão geral dos contratos: faturamento, status e evolução."
        action={
          <div className="flex items-center gap-2">
            {can('contratos', 'admin') && (
              <button
                onClick={copiarLinkFormulario}
                className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                title="Copia o link do formulário de vendas pra enviar aos closers"
              >
                {linkCopiado ? <Check className="h-4 w-4 text-success" /> : <LinkIcon className="h-4 w-4" />}
                {linkCopiado ? 'Link copiado!' : 'Link do formulário'}
              </button>
            )}
            <button
              onClick={() => navigate('/contratos/novo')}
              className="flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" /> Novo contrato
            </button>
          </div>
        }
      />

      <ContratosTabs />

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

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        {/* Distribuição por status */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-base font-bold text-foreground">Contratos por status</h3>
            <span className="text-xs text-muted-foreground tabular-nums">{totalStatus} no total</span>
          </div>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-6 shimmer rounded-lg" />)}</div>
          ) : stats.porStatus.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum contrato cadastrado.</p>
          ) : (
            <>
              {/* Barra de distribuição (por quantidade) */}
              <div className="flex h-2.5 w-full overflow-hidden rounded-full">
                {stats.porStatus.map(([status, v]) => (
                  <div
                    key={status}
                    className={cn('h-full', accentDe(status))}
                    style={{ width: `${(v.count / totalStatus) * 100}%` }}
                    title={`${sentence(status)}: ${v.count}`}
                  />
                ))}
              </div>
              {/* Lista */}
              <div className="space-y-2.5">
                {stats.porStatus.map(([status, v]) => (
                  <div key={status} className="flex items-center gap-3 text-sm">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', accentDe(status))} />
                    <span className="flex-1 truncate text-foreground">{sentence(status)}</span>
                    <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{v.count}</span>
                    <span className="w-28 shrink-0 text-right text-xs font-medium tabular-nums">
                      {v.valor > 0 ? <span className="text-foreground">{fmtBRL(v.valor)}</span> : <span className="text-muted-foreground/50">—</span>}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Assinaturas por mês */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-base font-bold text-foreground">Assinaturas — 12 meses</h3>
            {!isLoading && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {stats.fechadosPeriodo} contratos · {fmtCompacto(stats.valorPeriodo)}
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="h-44 shimmer rounded-lg" />
          ) : (
            <div className="space-y-2">
              {/* Área de plotagem — altura = quantidade de contratos */}
              <div className="flex items-end gap-1.5 h-40 border-b border-border/60">
                {stats.meses.map((m) => {
                  const isPico = m.count === maxMesCount && m.count > 0
                  return (
                    <div
                      key={m.key}
                      className="group relative flex h-full flex-1 flex-col items-center justify-end min-w-0"
                      title={`${m.label}: ${m.count} contratos · ${fmtBRL(m.valor)}`}
                    >
                      <span className={cn('mb-1 text-[10px] font-semibold tabular-nums', isPico ? 'text-primary' : 'text-muted-foreground')}>
                        {m.count || ''}
                      </span>
                      <div
                        className={cn(
                          'w-full rounded-t-md bg-gradient-to-t transition-all',
                          isPico
                            ? 'from-primary to-primary'
                            : 'from-primary/40 to-primary/60 group-hover:from-primary/60 group-hover:to-primary',
                        )}
                        style={{ height: `${m.count > 0 ? Math.max(4, (m.count / maxMesCount) * 90) : 0}%` }}
                      />
                    </div>
                  )
                })}
              </div>
              {/* Rótulos dos meses */}
              <div className="flex gap-1.5">
                {stats.meses.map((m) => (
                  <span key={m.key} className="flex-1 text-center text-[10px] text-muted-foreground">{m.label}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Faturamento por produto (ativos) */}
        <RankingCard
          title="Faturamento por produto"
          hint="ativos · top 8"
          rows={stats.porProduto}
          isLoading={isLoading}
          total={stats.faturamentoAtivo}
        />

        {/* Faturamento por estrategista (ativos) */}
        <RankingCard
          title="Faturamento por estrategista"
          hint="ativos · top 8"
          rows={stats.porEstrategista}
          isLoading={isLoading}
          total={stats.faturamentoAtivo}
        />

        {/* Contratos por tag */}
        <TagsCard
          rows={stats.porTag}
          isLoading={isLoading}
          onSelect={(tagId) => navigate(`/contratos/lista?tags=${tagId}`)}
        />
      </div>
    </div>
  )
}

function TagsCard({
  rows, isLoading, onSelect,
}: {
  rows: Array<{ id: string; nome: string; cor: string; count: number; valor: number }>
  isLoading: boolean
  onSelect: (tagId: string) => void
}) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-foreground">Contratos por tag</h3>
        <span className="text-xs text-muted-foreground">top 12</span>
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 shimmer rounded-lg" />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma tag aplicada ainda.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect(r.id)}
              className="w-full space-y-1 text-left"
              title={`Ver contratos com a tag ${r.nome}`}
            >
              <div className="flex items-baseline gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.cor }} />
                <span className="min-w-0 flex-1 truncate text-foreground">{r.nome}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{r.count} contrato{r.count === 1 ? '' : 's'}</span>
                <span className="w-28 shrink-0 text-right text-xs font-medium text-foreground tabular-nums">{fmtCompacto(r.valor)}</span>
              </div>
              <div className="ml-[18px] h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, backgroundColor: r.cor }} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function RankingCard({
  title, hint, rows, isLoading, total,
}: {
  title: string
  hint?: string
  rows: Array<[string, { count: number; valor: number }]>
  isLoading: boolean
  total: number
}) {
  const max = Math.max(1, ...rows.map(([, v]) => v.valor))
  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 shimmer rounded-lg" />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum contrato ativo.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(([nome, v], i) => (
            <div key={nome} className="space-y-1">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground/70">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{nome}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{v.count}</span>
                <span className="w-32 shrink-0 text-right text-xs font-medium text-foreground tabular-nums">
                  {fmtBRL(v.valor)}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {total > 0 ? Math.round((v.valor / total) * 100) : 0}%
                  </span>
                </span>
              </div>
              <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${(v.valor / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
