import { Fragment, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Wallet, CalendarClock, Users, Receipt, ChevronRight, ChevronLeft, Search, Package, CalendarRange, Tag as TagIcon, X, CalendarDays } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ContratosTabs } from '@/components/contratos/ContratosTabs'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useContratos, useConsultores, type Contrato } from '@/hooks/useComissoes'
import { useTags } from '@/hooks/useTags'
import { cn } from '@/lib/utils'
import { FilterChip, OptionPicker, CHIP_INPUT } from '@/components/filters/FilterChip'
import { parcelasFuturasDoContrato, parcelasDoContrato, agruparPorMes, rotuloMes, rotuloDia, rotuloDiaExtenso, somaDias, type ParcelaFutura } from './fluxoFuturo'

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtCompacto(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (v >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
  return fmtBRL(v)
}
function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Avatar do cliente nas linhas expandidas: inicial + cor determinística (mesmo nome → mesma cor).
const AVATAR_CORES = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500']
function avatarCor(nome: string): string {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0
  return AVATAR_CORES[h % AVATAR_CORES.length]
}
function inicial(nome: string): string {
  const t = (nome ?? '').trim()
  return t ? t[0].toUpperCase() : '?'
}

interface Filtros {
  busca: string
  estrategistaId: string
  produto: string
  tags: string[]
  status: 'ativos' | 'todos'
  de: string // "YYYY-MM"
  ate: string // "YYYY-MM"
}

const FILTROS_INIT: Filtros = { busca: '', estrategistaId: '', produto: '', tags: [], status: 'ativos', de: '', ate: '' }

/**
 * Tira acentos para a busca casar do jeito que a pessoa digita: "jose" acha
 * "José", "goncalves" acha "Gonçalves". Mesma regra da lista de contratos.
 */
function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function FluxoFuturoPage() {
  const { user } = useAuth()
  const { can } = usePermissoes()
  if (user && !can('contratos', 'ver')) return <Navigate to="/contratos/onboarding" replace />
  return <FluxoFuturo />
}

function FluxoFuturo() {
  const navigate = useNavigate()
  const { data: contratos, isLoading } = useContratos()
  const { data: consultores } = useConsultores()
  const { data: allTags = [] } = useTags()
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INIT)
  const [mesAberto, setMesAberto] = useState<string | null>(null)
  const hoje = useMemo(() => hojeISO(), [])

  const patch = (p: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...p }))
  const toggleTag = (id: string) =>
    patch({ tags: filtros.tags.includes(id) ? filtros.tags.filter((t) => t !== id) : [...filtros.tags, id] })

  const produtos = useMemo(() => {
    const set = new Set<string>()
    contratos?.forEach((c) => c.produto_nome && set.add(c.produto_nome))
    return Array.from(set).sort()
  }, [contratos])

  const estrategistas = useMemo(
    () => (consultores ?? []).filter((c) => c.perfil === 'estrategista'),
    [consultores],
  )

  // Contratos que passam nos filtros de contrato (fora o período, que filtra por mês da parcela).
  const contratosFiltrados = useMemo(() => {
    if (!contratos) return []
    const q = semAcento(filtros.busca.trim())
    return contratos.filter((c) => {
      if (filtros.status === 'ativos' && c.status !== 'ativo') return false
      if (filtros.estrategistaId && c.estrategista_id !== filtros.estrategistaId) return false
      if (filtros.produto && c.produto_nome !== filtros.produto) return false
      if (filtros.tags.length > 0) {
        const ids = new Set((c.tags ?? []).map((t) => t.id))
        if (!filtros.tags.some((id) => ids.has(id))) return false
      }
      if (q && !semAcento(c.cliente_nome ?? '').includes(q)) return false
      return true
    })
  }, [contratos, filtros.status, filtros.estrategistaId, filtros.produto, filtros.tags, filtros.busca])

  const contratoById = useMemo(() => {
    const m = new Map<string, Contrato>()
    contratosFiltrados.forEach((c) => m.set(c.id, c))
    return m
  }, [contratosFiltrados])

  // Parcelas futuras (>= hoje) de todos os contratos filtrados, aplicando o período por mês.
  const parcelas = useMemo(() => {
    const out: ParcelaFutura[] = []
    for (const c of contratosFiltrados) {
      for (const p of parcelasFuturasDoContrato(c, hoje)) {
        if (filtros.de && p.mes < filtros.de) continue
        if (filtros.ate && p.mes > filtros.ate) continue
        out.push(p)
      }
    }
    return out
  }, [contratosFiltrados, hoje, filtros.de, filtros.ate])

  const meses = useMemo(() => agruparPorMes(parcelas), [parcelas])
  const maxValor = Math.max(1, ...meses.map((m) => m.valor))

  // ---- Agenda do dia ------------------------------------------------------
  // Aqui usamos TODAS as parcelas (inclusive as já vencidas), porque a agenda
  // diária também serve para olhar para trás: "o que era para cair ontem?".
  // Os filtros de contrato valem; o filtro de período (mês) não, já que o dia
  // escolhido é o próprio recorte.
  const [dia, setDia] = useState<string>(hoje)
  const parcelasTodas = useMemo(() => {
    const out: ParcelaFutura[] = []
    for (const c of contratosFiltrados) out.push(...parcelasDoContrato(c))
    return out
  }, [contratosFiltrados])

  const recebimentosDoDia = useMemo(
    () => parcelasTodas.filter((p) => p.data === dia).sort((a, b) => b.valor - a.valor),
    [parcelasTodas, dia],
  )
  const totalDia = recebimentosDoDia.reduce((s, p) => s + p.valor, 0)
  const clientesNoDia = new Set(recebimentosDoDia.map((p) => p.contratoId)).size

  // Próximos dias (a partir de hoje) que têm algum recebimento — atalhos rápidos.
  const proximosDias = useMemo(() => {
    const porDia = new Map<string, { valor: number; parcelas: number }>()
    for (const p of parcelasTodas) {
      if (p.data < hoje) continue
      const cur = porDia.get(p.data) ?? { valor: 0, parcelas: 0 }
      cur.valor += p.valor
      cur.parcelas += 1
      porDia.set(p.data, cur)
    }
    return Array.from(porDia.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([data, agg]) => ({ data, ...agg }))
  }, [parcelasTodas, hoje])

  // Para o estado vazio: o próximo dia com dinheiro entrando depois do dia aberto.
  const proximoComRecebimento = useMemo(
    () => proximosDias.find((d) => d.data > dia) ?? proximosDias[0],
    [proximosDias, dia],
  )

  const totalReceber = parcelas.reduce((s, p) => s + p.valor, 0)
  const totalParcelas = parcelas.length
  const clientesDistintos = new Set(parcelas.map((p) => p.contratoId)).size
  // Próximos 30 dias
  const limite30 = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const proximos30 = parcelas.filter((p) => p.data <= limite30).reduce((s, p) => s + p.valor, 0)

  const parcelasDoMes = (mes: string) =>
    parcelas
      .filter((p) => p.mes === mes)
      .sort((a, b) => a.data.localeCompare(b.data))

  const kpis = [
    { title: 'Total a receber', value: fmtBRL(totalReceber), icon: Wallet, color: 'text-primary', bg: 'bg-primary-muted', accent: 'bg-primary' },
    { title: 'Próximos 30 dias', value: fmtBRL(proximos30), icon: CalendarClock, color: 'text-info', bg: 'bg-info-light', accent: 'bg-info' },
    { title: 'Parcelas futuras', value: String(totalParcelas), icon: Receipt, color: 'text-warning', bg: 'bg-warning-light', accent: 'bg-warning' },
    { title: 'Clientes', value: String(clientesDistintos), icon: Users, color: 'text-success', bg: 'bg-success-light', accent: 'bg-success' },
  ]

  const algumFiltro = Boolean(
    filtros.busca || filtros.estrategistaId || filtros.produto || filtros.tags.length > 0 ||
    filtros.de || filtros.ate || filtros.status !== 'ativos',
  )

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <PageHeader
        title="Fluxo de recebíveis"
        description="Parcelas futuras a receber, mês a mês. Só conta parcelas com vencimento a partir de hoje."
      />
      <ContratosTabs />

      {/* Filtros — barra estilo Linear/Notion */}
      <div className="glass-card space-y-3 p-4">
        <div className="relative sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filtros.busca}
            onChange={(e) => patch({ busca: e.target.value })}
            placeholder="Buscar pelo nome do cliente…"
            className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Recebíveis são sempre só de contratos ATIVOS — cancelado/pausado/concluído não entram. */}

          {/* Tags */}
          <FilterChip
            icon={<TagIcon className="h-3.5 w-3.5" />} label="Tags" active={filtros.tags.length > 0}
            valueLabel={filtros.tags.length === 1 ? (allTags.find((t) => t.id === filtros.tags[0])?.nome ?? '1') : filtros.tags.length > 1 ? `${filtros.tags.length} tags` : undefined}
            onClear={() => patch({ tags: [] })} panelClass="w-64"
          >
            {() => (
              allTags.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma tag criada ainda.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((t) => {
                    const on = filtros.tags.includes(t.id)
                    return (
                      <button key={t.id} type="button" onClick={() => toggleTag(t.id)}
                        className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
                          on ? '' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30')}
                        style={on ? { backgroundColor: `${t.cor}1a`, color: t.cor, borderColor: `${t.cor}55` } : undefined}>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.cor }} />
                        {t.nome}
                      </button>
                    )
                  })}
                </div>
              )
            )}
          </FilterChip>

          {/* Estrategista */}
          <FilterChip
            icon={<Users className="h-3.5 w-3.5" />} label="Estrategista" active={Boolean(filtros.estrategistaId)}
            valueLabel={estrategistas.find((c) => c.id === filtros.estrategistaId)?.nome}
            onClear={() => patch({ estrategistaId: '' })} panelClass="w-60"
          >
            {(close) => (
              <OptionPicker
                options={estrategistas.map((c) => ({ value: c.id, label: c.nome }))}
                value={filtros.estrategistaId} placeholder="Todos os estrategistas"
                onPick={(v) => { patch({ estrategistaId: v }); close() }}
              />
            )}
          </FilterChip>

          {/* Produto */}
          <FilterChip
            icon={<Package className="h-3.5 w-3.5" />} label="Produto" active={Boolean(filtros.produto)}
            valueLabel={filtros.produto || undefined}
            onClear={() => patch({ produto: '' })} panelClass="w-60"
          >
            {(close) => (
              <OptionPicker
                options={produtos.map((p) => ({ value: p, label: p }))}
                value={filtros.produto} placeholder="Todos os produtos"
                onPick={(v) => { patch({ produto: v }); close() }}
              />
            )}
          </FilterChip>

          {/* Período (mês) */}
          <FilterChip
            icon={<CalendarRange className="h-3.5 w-3.5" />} label="Período" active={Boolean(filtros.de || filtros.ate)}
            valueLabel={(filtros.de || filtros.ate) ? `${filtros.de || '…'} → ${filtros.ate || '…'}` : undefined}
            onClear={() => patch({ de: '', ate: '' })} panelClass="w-64"
          >
            {() => (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">De</label>
                  <input type="month" value={filtros.de} onChange={(e) => patch({ de: e.target.value })} className={CHIP_INPUT} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Até</label>
                  <input type="month" value={filtros.ate} onChange={(e) => patch({ ate: e.target.value })} className={CHIP_INPUT} />
                </div>
              </div>
            )}
          </FilterChip>

          {algumFiltro && (
            <button onClick={() => setFiltros(FILTROS_INIT)}
              className="ml-auto inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <X className="h-3.5 w-3.5" /> Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.title}
            className="group glass-card relative overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className={cn('absolute inset-x-0 top-0 h-0.5 opacity-70', k.accent)} />
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{k.title}</p>
              <div className={cn('rounded-lg p-2 shrink-0 transition-transform group-hover:scale-105', k.bg)}>
                <k.icon className={cn('h-4 w-4', k.color)} />
              </div>
            </div>
            <p className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground tabular-nums">{isLoading ? '—' : k.value}</p>
          </div>
        ))}
      </div>

      {/* Recebimentos do dia */}
      <div className="glass-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-xl bg-info-light p-2.5">
              <CalendarDays className="h-5 w-5 text-info" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">Recebimentos do dia</h3>
                {dia === hoje ? (
                  <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">hoje</span>
                ) : dia < hoje ? (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">passado</span>
                ) : null}
              </div>
              <p className="truncate text-xs capitalize text-muted-foreground">{rotuloDiaExtenso(dia)}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {dia !== hoje && (
              <button
                type="button" onClick={() => setDia(hoje)}
                className="mr-1 inline-flex h-9 items-center rounded-lg px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                Hoje
              </button>
            )}
            <div className="flex items-center rounded-lg border border-border bg-background">
              <button
                type="button" aria-label="Dia anterior" onClick={() => setDia((d) => somaDias(d, -1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input
                type="date" value={dia} aria-label="Data dos recebimentos"
                onChange={(e) => e.target.value && setDia(e.target.value)}
                className="h-9 border-x border-border bg-transparent px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/40"
              />
              <button
                type="button" aria-label="Próximo dia" onClick={() => setDia((d) => somaDias(d, 1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Atalhos: próximos dias com recebimento */}
        {proximosDias.length > 0 && (
          <div className="border-b border-border/60 px-5 py-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Próximos dias com entrada</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {proximosDias.map((d) => {
                const on = d.data === dia
                return (
                  <button
                    key={d.data} type="button" onClick={() => setDia(d.data)}
                    className={cn(
                      'shrink-0 rounded-xl border px-3 py-2 text-left transition-all',
                      on
                        ? 'border-primary bg-primary/10 shadow-sm shadow-primary/10'
                        : 'border-border hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted',
                    )}
                  >
                    <span className={cn('block text-[11px] font-medium capitalize', on ? 'text-primary' : 'text-muted-foreground')}>
                      {d.data === hoje ? 'Hoje' : rotuloDia(d.data)}
                    </span>
                    <span className={cn('mt-0.5 block text-sm font-bold tabular-nums', on ? 'text-primary' : 'text-foreground')}>
                      {fmtCompacto(d.valor)}
                    </span>
                    <span className="mt-0.5 block text-[10px] tabular-nums text-muted-foreground">
                      {d.parcelas} parcela{d.parcelas > 1 ? 's' : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="px-5 py-4"><div className="h-24 shimmer rounded-lg" /></div>
        ) : recebimentosDoDia.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <div className="rounded-full bg-muted p-3">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Nenhum recebimento nesse dia</p>
              <p className="mt-0.5 text-xs capitalize text-muted-foreground">{rotuloDiaExtenso(dia)}</p>
            </div>
            {proximoComRecebimento && (
              <button
                type="button" onClick={() => setDia(proximoComRecebimento.data)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
              >
                Ir para {proximoComRecebimento.data === hoje ? 'hoje' : rotuloDia(proximoComRecebimento.data)}
                <span className="tabular-nums text-primary">{fmtCompacto(proximoComRecebimento.valor)}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Faixa de total — o número que a pessoa veio buscar */}
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 bg-primary/[0.04] px-5 py-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Total do dia</p>
                <p className="mt-1 font-display text-3xl font-bold tracking-tight tabular-nums text-primary">{fmtBRL(totalDia)}</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Receipt className="h-3.5 w-3.5" />
                <span className="tabular-nums">
                  {recebimentosDoDia.length} parcela{recebimentosDoDia.length > 1 ? 's' : ''}
                </span>
                <span className="text-muted-foreground/40">·</span>
                <Users className="h-3.5 w-3.5" />
                <span className="tabular-nums">
                  {clientesNoDia} cliente{clientesNoDia > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <div className="divide-y divide-border/50">
              {recebimentosDoDia.map((p, i) => {
                const c = contratoById.get(p.contratoId)
                const nome = c?.cliente_nome ?? '—'
                return (
                  <div
                    key={`${p.contratoId}-${i}`}
                    role="button" tabIndex={0}
                    onClick={() => navigate(`/contratos/${p.contratoId}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/contratos/${p.contratoId}`) } }}
                    className="group/row flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
                  >
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white', avatarCor(nome))}>
                      {inicial(nome)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{nome}</p>
                      {c?.produto_nome && (
                        <p className="truncate text-xs text-muted-foreground">{c.produto_nome}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{fmtBRL(p.valor)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover/row:translate-x-0.5 group-hover/row:text-muted-foreground" />
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Gráfico */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-base font-bold text-foreground">Recebíveis por mês</h3>
          <span className="text-xs text-muted-foreground tabular-nums">{fmtCompacto(totalReceber)} no total</span>
        </div>
        {isLoading ? (
          <div className="h-48 shimmer rounded-lg" />
        ) : meses.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma parcela futura com os filtros atuais.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex h-56 items-end gap-2 border-b border-border/50">
              {meses.map((m) => {
                const pico = m.valor === maxValor && m.valor > 0
                const h = m.valor > 0 ? Math.max(3, (m.valor / maxValor) * 88) : 0
                return (
                  <div
                    key={m.mes}
                    className="group relative flex h-full flex-1 flex-col items-center justify-end"
                    title={`${m.label}: ${fmtBRL(m.valor)} · ${m.parcelas} parcela(s) · ${m.contratos} cliente(s)`}
                  >
                    <span
                      className={cn(
                        'mb-1 whitespace-nowrap text-[10px] font-semibold tabular-nums transition-opacity',
                        pico ? 'text-primary opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100',
                      )}
                    >
                      {m.valor > 0 ? fmtCompacto(m.valor).replace('R$ ', '') : ''}
                    </span>
                    <div
                      className={cn(
                        'w-full rounded-t-lg bg-gradient-to-t transition-all',
                        pico ? 'from-primary to-primary shadow-sm shadow-primary/30' : 'from-primary/25 to-primary/60 group-hover:from-primary/45 group-hover:to-primary',
                      )}
                      style={{ height: `${h}%` }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2">
              {meses.map((m) => (
                <span
                  key={m.mes}
                  className={cn('flex-1 text-center text-[10px]', m.valor === maxValor && m.valor > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground')}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabela mês a mês */}
      {!isLoading && meses.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <div>
              <h3 className="text-base font-bold text-foreground">Detalhe mês a mês</h3>
              <p className="text-xs text-muted-foreground">Clique num mês para ver os contratos.</p>
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total no período</p>
              <p className="text-sm font-bold tabular-nums text-primary">{fmtBRL(totalReceber)}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2.5 pl-5 pr-3 font-semibold">Mês</th>
                  <th className="py-2.5 pr-3 text-center font-semibold">Parcelas</th>
                  <th className="py-2.5 pr-3 text-center font-semibold">Clientes</th>
                  <th className="py-2.5 pr-5 text-right font-semibold">A receber</th>
                </tr>
              </thead>
              <tbody>
                {meses.filter((m) => m.valor > 0).map((m, idx) => {
                  const aberto = mesAberto === m.mes
                  const pct = maxValor > 0 ? Math.max(3, Math.round((m.valor / maxValor) * 100)) : 0
                  const pico = m.valor === maxValor && m.valor > 0
                  return (
                    <Fragment key={m.mes}>
                      <tr
                        onClick={() => setMesAberto(aberto ? null : m.mes)}
                        className={cn(
                          'group cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50',
                          aberto && 'bg-muted/40',
                        )}
                      >
                        <td className="py-3 pl-5 pr-3">
                          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                            <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', aberto && 'rotate-90')} />
                            {rotuloMes(m.mes)}
                            {idx === 0 && <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary">próximo</span>}
                            {pico && idx !== 0 && <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">pico</span>}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-center tabular-nums text-muted-foreground">{m.parcelas}</td>
                        <td className="py-3 pr-3 text-center tabular-nums text-muted-foreground">{m.contratos}</td>
                        <td className="py-3 pr-5">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-semibold tabular-nums text-foreground">{fmtBRL(m.valor)}</span>
                            <span className="h-1 w-24 overflow-hidden rounded-full bg-primary/12">
                              <span className={cn('block h-full rounded-full', pico ? 'bg-primary' : 'bg-primary/60')} style={{ width: `${pct}%` }} />
                            </span>
                          </div>
                        </td>
                      </tr>
                      {aberto && (
                        <tr className="bg-muted/15">
                          <td colSpan={4} className="px-3 py-2 sm:px-5">
                            <div className="flex flex-col gap-0.5">
                              {parcelasDoMes(m.mes).map((p, i) => {
                                const c = contratoById.get(p.contratoId)
                                const nome = c?.cliente_nome ?? '—'
                                return (
                                  <div
                                    key={`${p.contratoId}-${p.data}-${i}`}
                                    onClick={() => navigate(`/contratos/${p.contratoId}`)}
                                    className="group/row flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-xs transition-colors hover:bg-card"
                                  >
                                    <span className="shrink-0 rounded-md bg-background px-1.5 py-0.5 font-medium tabular-nums text-muted-foreground ring-1 ring-border">
                                      {p.data.slice(8, 10)}/{p.data.slice(5, 7)}
                                    </span>
                                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white', avatarCor(nome))}>
                                      {inicial(nome)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{nome}</span>
                                    <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block">{c?.produto_nome ?? ''}</span>
                                    <span className="shrink-0 tabular-nums font-semibold text-foreground">{fmtBRL(p.valor)}</span>
                                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover/row:translate-x-0.5" />
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40">
                  <td className="py-3 pl-5 pr-3 text-sm font-bold text-foreground">Total</td>
                  <td className="py-3 pr-3 text-center text-sm font-semibold tabular-nums text-muted-foreground">{totalParcelas}</td>
                  <td className="py-3 pr-3 text-center text-sm font-semibold tabular-nums text-muted-foreground">{clientesDistintos}</td>
                  <td className="py-3 pr-5 text-right text-sm font-bold tabular-nums text-primary">{fmtBRL(totalReceber)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
