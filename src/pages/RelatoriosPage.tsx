import { useMemo, useState } from 'react'
import {
  FileBarChart, Package, Users, Heart, Star, Award, GraduationCap,
  CheckCircle, Clock, AlertTriangle, TrendingUp, BarChart3, Download,
  Printer, ThumbsUp, ThumbsDown, Minus,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { useEntregas } from '@/hooks/useEntregas'
import { useClientes } from '@/hooks/useClientes'
import { useTrilhas } from '@/hooks/useTrilhas'
import { supabase } from '@/lib/supabase'
import type { DeliveryWithDetails } from '@/types/database'

// ─── CSV Export ──────────────────────────────────────────────────────────────

function exportCsv(headers: string[], rows: string[][], filename: string) {
  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n')
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

function exportPdf() {
  window.print()
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type TabId = 'entregas' | 'performance' | 'saude' | 'nps' | 'avaliacoes' | 'trilhas'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'entregas', label: 'Entregas por Cliente', icon: Package },
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'saude', label: 'Saúde da Carteira', icon: Heart },
  { id: 'nps', label: 'NPS', icon: Star },
  { id: 'avaliacoes', label: 'Avaliações', icon: Award },
  { id: 'trilhas', label: 'Trilhas', icon: GraduationCap },
]

// ─── Status helpers ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Aguardando',
  em_revisao: 'Em revisão',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  publicado: 'Publicado',
}

const STATUS_BADGE: Record<string, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  aguardando_aprovacao: 'bg-warning-light text-warning',
  em_revisao: 'bg-info-light text-info',
  aprovado: 'bg-success-light text-success',
  reprovado: 'bg-danger-light text-danger',
  publicado: 'bg-primary-muted text-primary',
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string | number
  icon: React.ElementType
  variant?: 'default' | 'danger' | 'warning' | 'success'
}

const VARIANT_ICON_CLS: Record<string, string> = {
  default: 'bg-primary-muted text-primary',
  danger: 'bg-danger-light text-danger',
  warning: 'bg-warning-light text-warning',
  success: 'bg-success-light text-success',
}

function KpiCard({ label, value, icon: Icon, variant = 'default' }: KpiCardProps) {
  return (
    <div className="glass-card p-5 flex items-center gap-4">
      <div className={cn('rounded-xl p-3 shrink-0', VARIANT_ICON_CLS[variant])}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="font-display text-2xl font-bold text-foreground leading-tight">{value}</p>
        <p className="font-mono text-[11px] tracking-wider uppercase text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ─── Export bar ──────────────────────────────────────────────────────────────

function ExportBar({ onCsv, csvDisabled }: { onCsv: () => void; csvDisabled?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onCsv}
        disabled={csvDisabled}
        className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg border border-border bg-card px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span className="hidden sm:inline">Exportar</span> CSV
      </button>
      <button
        onClick={exportPdf}
        className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg border border-border bg-card px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span className="hidden sm:inline">Exportar</span> PDF
      </button>
    </div>
  )
}

// ─── Shimmer ─────────────────────────────────────────────────────────────────

function Shimmer() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="glass-card p-5 h-[88px] rounded-xl" />
        ))}
      </div>
      <div className="glass-card h-64 rounded-xl" />
    </div>
  )
}

// ─── Table wrapper ───────────────────────────────────────────────────────────

type HeaderDef = string | { label: string; className?: string }

function DataTable({ headers, children, empty }: { headers: HeaderDef[]; children: React.ReactNode; empty?: boolean }) {
  if (empty) {
    return (
      <EmptyState
        icon={FileBarChart}
        title="Sem dados"
        description="Ainda não há dados suficientes para gerar este relatório."
      />
    )
  }
  return (
    <div className="glass-card overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {headers.map(h => {
              const label = typeof h === 'string' ? h : h.label
              const extra = typeof h === 'string' ? '' : (h.className ?? '')
              return (
                <th key={label} className={cn('px-3 sm:px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap', extra)}>
                  {label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  )
}

// ─── NPS query (all responses with client info via survey) ───────────────────

interface NpsResponseFull {
  id: string
  survey_id: string
  nota: number
  comentario: string | null
  criado_em: string
  nps_surveys: { id: string; client_id: string; clients: { id: string; nome: string } | null } | null
}

function useNpsResponsesFull() {
  return useQuery({
    queryKey: ['nps', 'responses', 'full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nps_responses')
        .select('*, nps_surveys(id, client_id, clients(id, nome))')
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data as NpsResponseFull[]
    },
  })
}

// ─── Delivery approvals query ────────────────────────────────────────────────

interface ApprovalFull {
  id: string
  delivery_id: string
  version_id: string
  aprovado: boolean
  criado_em: string
}

function useAllApprovals() {
  return useQuery({
    queryKey: ['approvals', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_approvals')
        .select('id, delivery_id, version_id, aprovado, criado_em')
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data as ApprovalFull[]
    },
  })
}

// ─── Learning progress query (all users) ─────────────────────────────────────

interface ProgressFull {
  id: string
  user_id: string
  lesson_id: string
  concluido: boolean
  concluido_em: string | null
}

function useAllProgress() {
  return useQuery({
    queryKey: ['trilhas', 'progress', 'all-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('learning_progress')
        .select('*')
      if (error) throw error
      return data as ProgressFull[]
    },
  })
}

// ─── Learning paths with modules+lessons ─────────────────────────────────────

interface PathWithModulesAndLessons {
  id: string
  titulo: string
  ativo: boolean
  learning_modules: { id: string; learning_lessons: { id: string }[] }[]
}

function useTrilhasWithLessons() {
  return useQuery({
    queryKey: ['trilhas', 'with-lessons'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('learning_paths')
        .select('id, titulo, ativo, learning_modules(id, learning_lessons(id))')
        .order('ordem', { ascending: true })
      if (error) throw error
      return data as PathWithModulesAndLessons[]
    },
  })
}

// ─── Tab: Entregas por Cliente ───────────────────────────────────────────────

function TabEntregas({ entregas }: { entregas: DeliveryWithDetails[] }) {
  const stats = useMemo(() => {
    const total = entregas.length
    const aprovadas = entregas.filter(e => e.status === 'aprovado' || e.status === 'publicado').length
    const noPrazo = entregas.filter(e => {
      if (!e.prazo) return true
      return new Date(e.atualizado_em) <= new Date(e.prazo)
    }).length
    const pendentes = entregas.filter(e => e.status === 'rascunho' || e.status === 'aguardando_aprovacao' || e.status === 'em_revisao').length
    // average "revisions" approximated by counting em_revisao items (not available per-entry, estimate)
    return {
      total,
      noPrazoPct: total > 0 ? Math.round((noPrazo / total) * 100) : 0,
      aprovadas,
      pendentes,
    }
  }, [entregas])

  // group by client
  const rows = useMemo(() => {
    return entregas.map(e => ({
      cliente: e.clients?.nome ?? '—',
      produto: e.deliverables?.products?.nome ?? '—',
      tipo: e.deliverables?.nome ?? '—',
      status: e.status,
      prazo: e.prazo ? new Date(e.prazo).toLocaleDateString('pt-BR') : '—',
      responsavel: e.users?.nome ?? '—',
    }))
  }, [entregas])

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <h2 className="text-base font-semibold text-foreground">Entregas por Cliente</h2>
        <ExportBar
          csvDisabled={rows.length === 0}
          onCsv={() =>
            exportCsv(
              ['Cliente', 'Produto', 'Entregável', 'Status', 'Prazo', 'Responsável'],
              rows.map(r => [r.cliente, r.produto, r.tipo, STATUS_LABELS[r.status] ?? r.status, r.prazo, r.responsavel]),
              'relatorio-entregas-cliente',
            )
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Total entregas" value={stats.total} icon={Package} />
        <KpiCard label="No prazo" value={`${stats.noPrazoPct}%`} icon={CheckCircle} variant={stats.noPrazoPct >= 80 ? 'success' : 'warning'} />
        <KpiCard label="Aprovadas" value={stats.aprovadas} icon={TrendingUp} variant="success" />
        <KpiCard label="Pendentes" value={stats.pendentes} icon={Clock} variant={stats.pendentes > 0 ? 'warning' : 'default'} />
      </div>

      <DataTable headers={['Cliente', { label: 'Produto', className: 'hidden sm:table-cell' }, { label: 'Entregável', className: 'hidden md:table-cell' }, 'Status', 'Prazo', { label: 'Responsável', className: 'hidden lg:table-cell' }]} empty={rows.length === 0}>
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-muted/20 transition-colors">
            <td className="px-3 sm:px-4 py-3 text-foreground font-medium">{r.cliente}</td>
            <td className="hidden sm:table-cell px-3 sm:px-4 py-3 text-muted-foreground">{r.produto}</td>
            <td className="hidden md:table-cell px-3 sm:px-4 py-3 text-muted-foreground">{r.tipo}</td>
            <td className="px-3 sm:px-4 py-3">
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_BADGE[r.status] ?? 'bg-muted text-muted-foreground')}>
                {STATUS_LABELS[r.status] ?? r.status}
              </span>
            </td>
            <td className="px-3 sm:px-4 py-3 text-muted-foreground">{r.prazo}</td>
            <td className="hidden lg:table-cell px-3 sm:px-4 py-3 text-muted-foreground">{r.responsavel}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}

// ─── Tab: Performance por Estrategista ───────────────────────────────────────

function TabPerformance({ entregas, approvals }: { entregas: DeliveryWithDetails[]; approvals: ApprovalFull[] }) {
  const data = useMemo(() => {
    const byAgent = new Map<string, { nome: string; total: number; aprovadas: number; deliveryIds: Set<string> }>()

    for (const e of entregas) {
      const agentName = e.users?.nome ?? 'Sem responsável'
      const agentId = e.responsavel_id ?? '__none__'
      if (!byAgent.has(agentId)) {
        byAgent.set(agentId, { nome: agentName, total: 0, aprovadas: 0, deliveryIds: new Set() })
      }
      const a = byAgent.get(agentId)!
      a.total++
      a.deliveryIds.add(e.id)
      if (e.status === 'aprovado' || e.status === 'publicado') a.aprovadas++
    }

    // count approved approvals per agent
    const approvalsByDelivery = new Map<string, boolean>()
    for (const ap of approvals) {
      if (ap.aprovado) approvalsByDelivery.set(ap.delivery_id, true)
    }

    const atrasadas = entregas.filter(e => {
      if (!e.prazo) return false
      if (e.status === 'aprovado' || e.status === 'publicado') return false
      return new Date() > new Date(e.prazo)
    }).length

    const rows = Array.from(byAgent.values())
      .sort((a, b) => b.total - a.total)
      .map(a => ({
        nome: a.nome,
        total: a.total,
        aprovadas: a.aprovadas,
        taxa: a.total > 0 ? Math.round((a.aprovadas / a.total) * 100) : 0,
      }))

    const totalAgents = rows.filter(r => r.nome !== 'Sem responsável').length
    const mediaEntregas = totalAgents > 0
      ? Math.round(rows.filter(r => r.nome !== 'Sem responsável').reduce((s, r) => s + r.total, 0) / totalAgents)
      : 0
    const taxaGlobal = entregas.length > 0
      ? Math.round((entregas.filter(e => e.status === 'aprovado' || e.status === 'publicado').length / entregas.length) * 100)
      : 0

    return { rows, totalAgents, mediaEntregas, taxaGlobal, atrasadas }
  }, [entregas, approvals])

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <h2 className="text-base font-semibold text-foreground">Performance por Estrategista</h2>
        <ExportBar
          csvDisabled={data.rows.length === 0}
          onCsv={() =>
            exportCsv(
              ['Estrategista', 'Total entregas', 'Aprovadas', 'Taxa aprovação'],
              data.rows.map(r => [r.nome, String(r.total), String(r.aprovadas), `${r.taxa}%`]),
              'relatorio-performance',
            )
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Total estrategistas" value={data.totalAgents} icon={Users} />
        <KpiCard label="Média entregas/estrategista" value={data.mediaEntregas} icon={Package} />
        <KpiCard label="Taxa de aprovação" value={`${data.taxaGlobal}%`} icon={TrendingUp} variant={data.taxaGlobal >= 70 ? 'success' : 'warning'} />
        <KpiCard label="Entregas atrasadas" value={data.atrasadas} icon={AlertTriangle} variant={data.atrasadas > 0 ? 'danger' : 'default'} />
      </div>

      <DataTable headers={['Estrategista', 'Total entregas', { label: 'Aprovadas', className: 'hidden md:table-cell' }, 'Taxa aprovação']} empty={data.rows.length === 0}>
        {data.rows.map((r, i) => (
          <tr key={i} className="hover:bg-muted/20 transition-colors">
            <td className="px-3 sm:px-4 py-3 text-foreground font-medium">{r.nome}</td>
            <td className="px-3 sm:px-4 py-3 text-muted-foreground">{r.total}</td>
            <td className="hidden md:table-cell px-3 sm:px-4 py-3 text-muted-foreground">{r.aprovadas}</td>
            <td className="px-3 sm:px-4 py-3">
              <span className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium',
                r.taxa >= 80 ? 'bg-success-light text-success' : r.taxa >= 50 ? 'bg-warning-light text-warning' : 'bg-danger-light text-danger',
              )}>
                {r.taxa}%
              </span>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}

// ─── Tab: Saúde da Carteira ──────────────────────────────────────────────────

function TabSaude({ entregas, npsResponses, clientes }: {
  entregas: DeliveryWithDetails[]
  npsResponses: NpsResponseFull[]
  clientes: { id: string; nome: string; ativo: boolean }[]
}) {
  const data = useMemo(() => {
    const clientesAtivos = clientes.filter(c => c.ativo)

    // NPS by client
    const npsByClient = new Map<string, number[]>()
    for (const r of npsResponses) {
      const clientId = r.nps_surveys?.client_id
      if (!clientId) continue
      if (!npsByClient.has(clientId)) npsByClient.set(clientId, [])
      npsByClient.get(clientId)!.push(r.nota)
    }

    // Entregas by client
    const entregasByClient = new Map<string, DeliveryWithDetails[]>()
    for (const e of entregas) {
      const cid = e.client_id
      if (!entregasByClient.has(cid)) entregasByClient.set(cid, [])
      entregasByClient.get(cid)!.push(e)
    }

    const rows = clientesAtivos.map(c => {
      const ce = entregasByClient.get(c.id) ?? []
      const pendentes = ce.filter(e => e.status === 'rascunho' || e.status === 'aguardando_aprovacao' || e.status === 'em_revisao').length
      const atrasadas = ce.filter(e => {
        if (!e.prazo) return false
        if (e.status === 'aprovado' || e.status === 'publicado') return false
        return new Date() > new Date(e.prazo)
      }).length
      const notas = npsByClient.get(c.id) ?? []
      const npsAvg = notas.length > 0 ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null
      const ultimaEntrega = ce.length > 0
        ? ce.sort((a, b) => new Date(b.atualizado_em).getTime() - new Date(a.atualizado_em).getTime())[0].atualizado_em
        : null

      // health logic
      let saude: 'saudavel' | 'atencao' | 'risco' = 'saudavel'
      if (atrasadas > 0 || (npsAvg !== null && npsAvg <= 6)) saude = 'risco'
      else if (pendentes > 3 || (npsAvg !== null && npsAvg <= 8)) saude = 'atencao'

      return { nome: c.nome, pendentes, npsAvg, ultimaEntrega, saude, atrasadas }
    })

    const emRisco = rows.filter(r => r.saude === 'risco').length
    const npsAll = npsResponses.map(r => r.nota)
    const npsMedio = npsAll.length > 0 ? Math.round((npsAll.reduce((a, b) => a + b, 0) / npsAll.length) * 10) / 10 : 0
    const totalAtrasadas = rows.reduce((s, r) => s + r.atrasadas, 0)

    return { rows: rows.sort((a, b) => {
      const order = { risco: 0, atencao: 1, saudavel: 2 }
      return order[a.saude] - order[b.saude]
    }), totalAtivos: clientesAtivos.length, emRisco, npsMedio, totalAtrasadas }
  }, [entregas, npsResponses, clientes])

  const SAUDE_BADGE: Record<string, string> = {
    saudavel: 'bg-success-light text-success',
    atencao: 'bg-warning-light text-warning',
    risco: 'bg-danger-light text-danger',
  }
  const SAUDE_LABEL: Record<string, string> = {
    saudavel: 'Saudável',
    atencao: 'Atenção',
    risco: 'Risco',
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <h2 className="text-base font-semibold text-foreground">Saúde da Carteira</h2>
        <ExportBar
          csvDisabled={data.rows.length === 0}
          onCsv={() =>
            exportCsv(
              ['Cliente', 'Pendentes', 'NPS', 'Última entrega', 'Saúde'],
              data.rows.map(r => [r.nome, String(r.pendentes), r.npsAvg !== null ? String(r.npsAvg) : '—', r.ultimaEntrega ? new Date(r.ultimaEntrega).toLocaleDateString('pt-BR') : '—', SAUDE_LABEL[r.saude]]),
              'relatorio-saude-carteira',
            )
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Clientes ativos" value={data.totalAtivos} icon={Users} />
        <KpiCard label="Clientes em risco" value={data.emRisco} icon={AlertTriangle} variant={data.emRisco > 0 ? 'danger' : 'default'} />
        <KpiCard label="NPS médio" value={data.npsMedio || '—'} icon={Star} variant={data.npsMedio >= 9 ? 'success' : data.npsMedio >= 7 ? 'warning' : 'danger'} />
        <KpiCard label="Entregas atrasadas" value={data.totalAtrasadas} icon={Clock} variant={data.totalAtrasadas > 0 ? 'danger' : 'default'} />
      </div>

      <DataTable headers={['Cliente', { label: 'Pendentes', className: 'hidden sm:table-cell' }, 'NPS', { label: 'Última entrega', className: 'hidden md:table-cell' }, 'Saúde']} empty={data.rows.length === 0}>
        {data.rows.map((r, i) => (
          <tr key={i} className="hover:bg-muted/20 transition-colors">
            <td className="px-3 sm:px-4 py-3 text-foreground font-medium">{r.nome}</td>
            <td className="hidden sm:table-cell px-3 sm:px-4 py-3 text-muted-foreground">{r.pendentes}</td>
            <td className="px-3 sm:px-4 py-3 text-muted-foreground">{r.npsAvg !== null ? r.npsAvg : '—'}</td>
            <td className="hidden md:table-cell px-3 sm:px-4 py-3 text-muted-foreground">{r.ultimaEntrega ? new Date(r.ultimaEntrega).toLocaleDateString('pt-BR') : '—'}</td>
            <td className="px-3 sm:px-4 py-3">
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', SAUDE_BADGE[r.saude])}>
                {SAUDE_LABEL[r.saude]}
              </span>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}

// ─── Tab: NPS ────────────────────────────────────────────────────────────────

function TabNps({ npsResponses }: { npsResponses: NpsResponseFull[] }) {
  const stats = useMemo(() => {
    const total = npsResponses.length
    if (total === 0) return { npsScore: 0, promotores: 0, neutros: 0, detratores: 0, total: 0 }
    const promotores = npsResponses.filter(r => r.nota >= 9).length
    const neutros = npsResponses.filter(r => r.nota >= 7 && r.nota <= 8).length
    const detratores = npsResponses.filter(r => r.nota <= 6).length
    const npsScore = Math.round(((promotores - detratores) / total) * 100)
    return { npsScore, promotores, neutros, detratores, total }
  }, [npsResponses])

  const rows = useMemo(() => {
    return npsResponses.map(r => ({
      cliente: r.nps_surveys?.clients?.nome ?? '—',
      nota: r.nota,
      comentario: r.comentario ?? '—',
      data: new Date(r.criado_em).toLocaleDateString('pt-BR'),
    }))
  }, [npsResponses])

  const BAR_COLORS = { promotores: 'bg-success', neutros: 'bg-warning', detratores: 'bg-danger' }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <h2 className="text-base font-semibold text-foreground">Relatório NPS</h2>
        <ExportBar
          csvDisabled={rows.length === 0}
          onCsv={() =>
            exportCsv(
              ['Cliente', 'Nota', 'Comentário', 'Data'],
              rows.map(r => [r.cliente, String(r.nota), r.comentario, r.data]),
              'relatorio-nps',
            )
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="NPS Score"
          value={stats.total > 0 ? stats.npsScore : '—'}
          icon={Star}
          variant={stats.npsScore >= 50 ? 'success' : stats.npsScore >= 0 ? 'warning' : 'danger'}
        />
        <KpiCard label="Promotores" value={stats.promotores} icon={ThumbsUp} variant="success" />
        <KpiCard label="Neutros" value={stats.neutros} icon={Minus} variant="warning" />
        <KpiCard label="Detratores" value={stats.detratores} icon={ThumbsDown} variant="danger" />
      </div>

      {/* Distribution bar */}
      {stats.total > 0 && (
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Distribuição NPS</h3>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {(['promotores', 'neutros', 'detratores'] as const).map(key => {
              const count = stats[key]
              if (count === 0) return null
              const pct = (count / stats.total) * 100
              return (
                <div
                  key={key}
                  className={cn('h-full transition-all', BAR_COLORS[key])}
                  style={{ width: `${pct}%` }}
                  title={`${key.charAt(0).toUpperCase() + key.slice(1)}: ${count} (${Math.round(pct)}%)`}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap gap-4">
            {(['promotores', 'neutros', 'detratores'] as const).map(key => (
              <div key={key} className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', BAR_COLORS[key])} />
                <span className="text-xs text-muted-foreground">
                  {key.charAt(0).toUpperCase() + key.slice(1)}: <strong className="text-foreground">{stats[key]}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTable headers={['Cliente', 'Nota', { label: 'Comentário', className: 'hidden md:table-cell' }, 'Data']} empty={rows.length === 0}>
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-muted/20 transition-colors">
            <td className="px-3 sm:px-4 py-3 text-foreground font-medium">{r.cliente}</td>
            <td className="px-3 sm:px-4 py-3">
              <span className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium',
                r.nota >= 9 ? 'bg-success-light text-success' : r.nota >= 7 ? 'bg-warning-light text-warning' : 'bg-danger-light text-danger',
              )}>
                {r.nota}
              </span>
            </td>
            <td className="hidden md:table-cell px-3 sm:px-4 py-3 text-muted-foreground max-w-xs truncate">{r.comentario}</td>
            <td className="px-3 sm:px-4 py-3 text-muted-foreground">{r.data}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}

// ─── Tab: Avaliações por Entregável ──────────────────────────────────────────

function TabAvaliacoes({ npsResponses, entregas }: { npsResponses: NpsResponseFull[]; entregas: DeliveryWithDetails[] }) {
  const data = useMemo(() => {
    // Map survey_id -> delivery via entregas that have matching client_id
    // Actually, NPS surveys can have a delivery_id but npsResponses join doesn't include it.
    // We'll group by deliverable type since that's what makes sense for "avaliações por entregável".
    // We use NPS as proxy for ratings per deliverable type.

    // Build deliverable type map from entregas
    const byTipo = new Map<string, { notas: number[] }>()

    // For each NPS response, find matching delivery via survey -> client -> entregas
    for (const resp of npsResponses) {
      const clientId = resp.nps_surveys?.client_id
      if (!clientId) continue
      // Find entregas for this client
      const clientEntregas = entregas.filter(e => e.client_id === clientId)
      if (clientEntregas.length === 0) {
        const key = 'Geral'
        if (!byTipo.has(key)) byTipo.set(key, { notas: [] })
        byTipo.get(key)!.notas.push(resp.nota)
      } else {
        // Distribute the rating across their deliverable types
        const tipos = new Set(clientEntregas.map(e => e.deliverables?.tipo ?? 'outro'))
        for (const tipo of tipos) {
          if (!byTipo.has(tipo)) byTipo.set(tipo, { notas: [] })
          byTipo.get(tipo)!.notas.push(resp.nota)
        }
      }
    }

    const TIPO_LABELS: Record<string, string> = {
      post_feed: 'Post Feed',
      stories: 'Stories',
      reels: 'Reels',
      video: 'Vídeo',
      copy: 'Copy',
      arte: 'Arte',
      relatorio: 'Relatório',
      outro: 'Outro',
      Geral: 'Geral',
    }

    const rows = Array.from(byTipo.entries()).map(([tipo, data]) => {
      const notas = data.notas
      const media = notas.length > 0 ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : 0
      const melhor = notas.length > 0 ? Math.max(...notas) : 0
      const pior = notas.length > 0 ? Math.min(...notas) : 0
      return {
        tipo: TIPO_LABELS[tipo] ?? tipo,
        media,
        total: notas.length,
        melhor,
        pior,
      }
    }).sort((a, b) => b.media - a.media)

    const allNotas = npsResponses.map(r => r.nota)
    const mediaGeral = allNotas.length > 0 ? Math.round((allNotas.reduce((a, b) => a + b, 0) / allNotas.length) * 10) / 10 : 0
    const totalAval = allNotas.length
    const cincoEstrelas = allNotas.filter(n => n >= 9).length
    const cincoEstrelaPct = totalAval > 0 ? Math.round((cincoEstrelas / totalAval) * 100) : 0
    const abaixoDe3 = allNotas.filter(n => n <= 3).length
    const abaixoDe3Pct = totalAval > 0 ? Math.round((abaixoDe3 / totalAval) * 100) : 0

    return { rows, mediaGeral, totalAval, cincoEstrelaPct, abaixoDe3Pct }
  }, [npsResponses, entregas])

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <h2 className="text-base font-semibold text-foreground">Avaliações por Entregável</h2>
        <ExportBar
          csvDisabled={data.rows.length === 0}
          onCsv={() =>
            exportCsv(
              ['Tipo entregável', 'Média nota', 'Total avaliações', 'Melhor nota', 'Pior nota'],
              data.rows.map(r => [r.tipo, String(r.media), String(r.total), String(r.melhor), String(r.pior)]),
              'relatorio-avaliacoes',
            )
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Média geral" value={data.mediaGeral || '—'} icon={Star} variant={data.mediaGeral >= 8 ? 'success' : data.mediaGeral >= 6 ? 'warning' : 'danger'} />
        <KpiCard label="Total avaliações" value={data.totalAval} icon={Award} />
        <KpiCard label="Nota 9-10" value={`${data.cincoEstrelaPct}%`} icon={ThumbsUp} variant="success" />
        <KpiCard label="Abaixo de 3" value={`${data.abaixoDe3Pct}%`} icon={AlertTriangle} variant={data.abaixoDe3Pct > 10 ? 'danger' : 'default'} />
      </div>

      <DataTable headers={['Tipo entregável', 'Média nota', { label: 'Total avaliações', className: 'hidden sm:table-cell' }, { label: 'Melhor nota', className: 'hidden md:table-cell' }, { label: 'Pior nota', className: 'hidden lg:table-cell' }]} empty={data.rows.length === 0}>
        {data.rows.map((r, i) => (
          <tr key={i} className="hover:bg-muted/20 transition-colors">
            <td className="px-3 sm:px-4 py-3 text-foreground font-medium">{r.tipo}</td>
            <td className="px-3 sm:px-4 py-3">
              <span className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium',
                r.media >= 8 ? 'bg-success-light text-success' : r.media >= 6 ? 'bg-warning-light text-warning' : 'bg-danger-light text-danger',
              )}>
                {r.media}
              </span>
            </td>
            <td className="hidden sm:table-cell px-3 sm:px-4 py-3 text-muted-foreground">{r.total}</td>
            <td className="hidden md:table-cell px-3 sm:px-4 py-3 text-success">{r.melhor}</td>
            <td className="hidden lg:table-cell px-3 sm:px-4 py-3 text-danger">{r.pior}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}

// ─── Tab: Engajamento com Trilhas ────────────────────────────────────────────

function TabTrilhas({ paths, progress }: { paths: PathWithModulesAndLessons[]; progress: ProgressFull[] }) {
  const data = useMemo(() => {
    // unique users who have any progress
    const uniqueUsers = new Set(progress.map(p => p.user_id))
    const totalInscritos = uniqueUsers.size

    const rows = paths.map(path => {
      const allLessonIds = new Set<string>()
      for (const mod of path.learning_modules) {
        for (const lesson of mod.learning_lessons) {
          allLessonIds.add(lesson.id)
        }
      }
      const totalLessons = allLessonIds.size

      // Find users who have progress in this path
      const userProgress = new Map<string, { completed: number; total: number }>()
      for (const p of progress) {
        if (!allLessonIds.has(p.lesson_id)) continue
        if (!userProgress.has(p.user_id)) userProgress.set(p.user_id, { completed: 0, total: totalLessons })
        if (p.concluido) userProgress.get(p.user_id)!.completed++
      }

      const inscritos = userProgress.size
      const concluidos = Array.from(userProgress.values()).filter(u => totalLessons > 0 && u.completed >= totalLessons).length
      const taxaConclusao = inscritos > 0 ? Math.round((concluidos / inscritos) * 100) : 0
      const progressoMedio = inscritos > 0 && totalLessons > 0
        ? Math.round((Array.from(userProgress.values()).reduce((s, u) => s + (u.completed / totalLessons), 0) / inscritos) * 100)
        : 0

      return {
        titulo: path.titulo,
        ativo: path.ativo,
        inscritos,
        concluidos,
        taxaConclusao,
        progressoMedio,
      }
    })

    const totalConcluidos = rows.reduce((s, r) => s + r.concluidos, 0)
    const taxaGlobal = totalInscritos > 0 && rows.length > 0
      ? Math.round(rows.reduce((s, r) => s + r.taxaConclusao, 0) / rows.length)
      : 0
    const progressoGlobal = rows.length > 0
      ? Math.round(rows.reduce((s, r) => s + r.progressoMedio, 0) / rows.length)
      : 0
    const trilhasAtivas = paths.filter(p => p.ativo).length

    return { rows, totalInscritos, taxaGlobal, progressoGlobal, trilhasAtivas }
  }, [paths, progress])

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <h2 className="text-base font-semibold text-foreground">Engajamento com Trilhas</h2>
        <ExportBar
          csvDisabled={data.rows.length === 0}
          onCsv={() =>
            exportCsv(
              ['Trilha', 'Inscritos', 'Concluídos', 'Taxa conclusão', 'Progresso médio'],
              data.rows.map(r => [r.titulo, String(r.inscritos), String(r.concluidos), `${r.taxaConclusao}%`, `${r.progressoMedio}%`]),
              'relatorio-trilhas',
            )
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Total inscritos" value={data.totalInscritos} icon={Users} />
        <KpiCard label="Taxa conclusão" value={`${data.taxaGlobal}%`} icon={CheckCircle} variant={data.taxaGlobal >= 60 ? 'success' : 'warning'} />
        <KpiCard label="Progresso médio" value={`${data.progressoGlobal}%`} icon={TrendingUp} variant={data.progressoGlobal >= 50 ? 'success' : 'warning'} />
        <KpiCard label="Trilhas ativas" value={data.trilhasAtivas} icon={GraduationCap} />
      </div>

      <DataTable headers={['Trilha', 'Inscritos', { label: 'Concluídos', className: 'hidden md:table-cell' }, 'Taxa conclusão', { label: 'Progresso médio', className: 'hidden lg:table-cell' }]} empty={data.rows.length === 0}>
        {data.rows.map((r, i) => (
          <tr key={i} className="hover:bg-muted/20 transition-colors">
            <td className="px-3 sm:px-4 py-3 text-foreground font-medium">
              <div className="flex items-center gap-2">
                {r.titulo}
                {!r.ativo && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">Inativa</span>
                )}
              </div>
            </td>
            <td className="px-3 sm:px-4 py-3 text-muted-foreground">{r.inscritos}</td>
            <td className="hidden md:table-cell px-3 sm:px-4 py-3 text-muted-foreground">{r.concluidos}</td>
            <td className="px-3 sm:px-4 py-3">
              <span className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium',
                r.taxaConclusao >= 60 ? 'bg-success-light text-success' : r.taxaConclusao >= 30 ? 'bg-warning-light text-warning' : 'bg-muted text-muted-foreground',
              )}>
                {r.taxaConclusao}%
              </span>
            </td>
            <td className="hidden lg:table-cell px-3 sm:px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', r.progressoMedio >= 50 ? 'bg-success' : 'bg-warning')}
                    style={{ width: `${r.progressoMedio}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-10 text-right">{r.progressoMedio}%</span>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const [activeTab, setActiveTab] = useState<TabId>('entregas')

  // Fetch all data at top level
  const { data: entregas = [], isLoading: loadingEntregas } = useEntregas()
  const { data: clientes = [], isLoading: loadingClientes } = useClientes()
  const { data: npsResponses = [], isLoading: loadingNps } = useNpsResponsesFull()
  const { data: approvals = [], isLoading: loadingApprovals } = useAllApprovals()
  const { data: trilhasData = [], isLoading: loadingTrilhas } = useTrilhasWithLessons()
  const { data: progress = [], isLoading: loadingProgress } = useAllProgress()

  const isLoading = loadingEntregas || loadingClientes || loadingNps || loadingApprovals || loadingTrilhas || loadingProgress

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 animate-fade-in print:p-0">
      <PageHeader
        title="Relatórios"
        description="Analise o desempenho da agência com relatórios detalhados."
      />

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 sm:px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'gradient-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {isLoading ? (
        <Shimmer />
      ) : (
        <>
          {activeTab === 'entregas' && <TabEntregas entregas={entregas} />}
          {activeTab === 'performance' && <TabPerformance entregas={entregas} approvals={approvals} />}
          {activeTab === 'saude' && <TabSaude entregas={entregas} npsResponses={npsResponses} clientes={clientes} />}
          {activeTab === 'nps' && <TabNps npsResponses={npsResponses} />}
          {activeTab === 'avaliacoes' && <TabAvaliacoes npsResponses={npsResponses} entregas={entregas} />}
          {activeTab === 'trilhas' && <TabTrilhas paths={trilhasData} progress={progress} />}
        </>
      )}
    </div>
  )
}
