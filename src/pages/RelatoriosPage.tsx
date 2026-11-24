import { useMemo, useState } from 'react'
import {
  FileBarChart, Package, Users, Heart, Star, Award, GraduationCap,
  CheckCircle, Clock, AlertTriangle, TrendingUp, BarChart3, Download,
  Printer, ThumbsUp, ThumbsDown, Minus,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { AbasRolaveis } from '@/components/ui/AbasRolaveis'
import { TabelaResponsiva, type ColunaTabela } from '@/components/ui/TabelaResponsiva'
import { SeloStatus, type TomStatus } from '@/components/ui/StatusBadge'
import { useEntregas } from '@/hooks/useEntregas'
import { useClientes } from '@/hooks/useClientes'
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

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
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

/** Tom do selo de status (DS: cor + forma), igual ao `StatusBadge` de entregas. */
const STATUS_TOM: Record<string, TomStatus> = {
  rascunho: 'neutro',
  aguardando_aprovacao: 'aguardando',
  em_revisao: 'andamento',
  aprovado: 'resolvido',
  reprovado: 'atrasado',
  publicado: 'resolvido',
}

/**
 * Faixa de um número (taxa, nota, média) num selo do DS: bom = "resolvido",
 * médio = "aguardando", ruim = "atrasado". Mesmas faixas de cor de antes.
 */
function tomPorFaixa(valor: number, bom: number, medio: number, ruim: TomStatus = 'atrasado'): TomStatus {
  if (valor >= bom) return 'resolvido'
  if (valor >= medio) return 'aguardando'
  return ruim
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
    <div className="glass-card flex items-center gap-4 p-4 sm:p-5">
      <div className={cn('shrink-0 rounded-lg p-2.5', VARIANT_ICON_CLS[variant])}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="t-h2 tabular-nums leading-tight text-foreground">{value}</p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

// ─── Export bar ──────────────────────────────────────────────────────────────

function ExportBar({ onCsv, csvDisabled }: { onCsv: () => void; csvDisabled?: boolean }) {
  return (
    <div className="flex items-center gap-2 print:hidden">
      <button type="button" onClick={onCsv} disabled={csvDisabled} className="btn btn-secondary btn-sm">
        <Download aria-hidden />
        <span className="hidden sm:inline">Exportar</span> CSV
      </button>
      <button type="button" onClick={exportPdf} className="btn btn-secondary btn-sm">
        <Printer aria-hidden />
        <span className="hidden sm:inline">Exportar</span> PDF
      </button>
    </div>
  )
}

// ─── Shimmer ─────────────────────────────────────────────────────────────────

function Shimmer() {
  return (
    <div role="status" aria-label="Carregando relatório" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="sk h-[88px] rounded-lg" />
        ))}
      </div>
      <div className="sk h-64 rounded-lg" />
    </div>
  )
}

// ─── Tabela (design system) ──────────────────────────────────────────────────

/** Tabela do relatório: vira cartões em largura estreita; vazia mostra o aviso. */
function TabelaRelatorio<T>({ rotulo, colunas, linhas, chave }: {
  rotulo: string
  colunas: ColunaTabela<T>[]
  linhas: T[]
  chave: (linha: T) => string
}) {
  return (
    <TabelaResponsiva
      rotulo={rotulo}
      colunas={colunas}
      linhas={linhas}
      chave={chave}
      vazio={
        <EmptyState
          icon={FileBarChart}
          title="Sem dados"
          description="Ainda não há dados suficientes para gerar este relatório."
        />
      }
    />
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
      id: e.id,
      cliente: e.clients?.nome ?? '—',
      produto: e.deliverables?.products?.nome ?? '—',
      tipo: e.deliverables?.nome ?? '—',
      status: e.status,
      prazo: e.prazo ? new Date(e.prazo).toLocaleDateString('pt-BR') : '—',
      responsavel: e.users?.nome ?? '—',
    }))
  }, [entregas])

  return (
    <section className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="t-h4 text-foreground">Entregas por Cliente</h2>
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

      <TabelaRelatorio
        rotulo="Entregas por cliente"
        linhas={rows}
        chave={(r) => r.id}
        colunas={[
          { id: 'cliente', titulo: 'Cliente', principal: true, celula: (r) => r.cliente },
          { id: 'produto', titulo: 'Produto', celula: (r) => <span className="text-muted-foreground">{r.produto}</span> },
          { id: 'tipo', titulo: 'Entregável', celula: (r) => <span className="text-muted-foreground">{r.tipo}</span> },
          {
            id: 'status', titulo: 'Status',
            celula: (r) => <SeloStatus tom={STATUS_TOM[r.status] ?? 'neutro'} size="sm">{STATUS_LABELS[r.status] ?? r.status}</SeloStatus>,
          },
          { id: 'prazo', titulo: 'Prazo', numerica: true, celula: (r) => r.prazo },
          { id: 'responsavel', titulo: 'Responsável', celula: (r) => <span className="text-muted-foreground">{r.responsavel}</span> },
        ]}
      />
    </section>
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

    const rows = Array.from(byAgent.entries())
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([id, a]) => ({
        id,
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
    <section className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="t-h4 text-foreground">Performance por Estrategista</h2>
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

      <TabelaRelatorio
        rotulo="Performance por estrategista"
        linhas={data.rows}
        chave={(r) => r.id}
        colunas={[
          { id: 'nome', titulo: 'Estrategista', principal: true, celula: (r) => r.nome },
          { id: 'total', titulo: 'Total entregas', numerica: true, celula: (r) => r.total },
          { id: 'aprovadas', titulo: 'Aprovadas', numerica: true, celula: (r) => r.aprovadas },
          {
            id: 'taxa', titulo: 'Taxa aprovação', numerica: true,
            celula: (r) => <SeloStatus tom={tomPorFaixa(r.taxa, 80, 50)} size="sm">{r.taxa}%</SeloStatus>,
          },
        ]}
      />
    </section>
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

      return { id: c.id, nome: c.nome, pendentes, npsAvg, ultimaEntrega, saude, atrasadas }
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

  const SAUDE_TOM: Record<string, TomStatus> = {
    saudavel: 'resolvido',
    atencao: 'aguardando',
    risco: 'atrasado',
  }
  const SAUDE_LABEL: Record<string, string> = {
    saudavel: 'Saudável',
    atencao: 'Atenção',
    risco: 'Risco',
  }

  return (
    <section className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="t-h4 text-foreground">Saúde da Carteira</h2>
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

      <TabelaRelatorio
        rotulo="Saúde da carteira"
        linhas={data.rows}
        chave={(r) => r.id}
        colunas={[
          { id: 'nome', titulo: 'Cliente', principal: true, celula: (r) => r.nome },
          { id: 'pendentes', titulo: 'Pendentes', numerica: true, celula: (r) => r.pendentes },
          { id: 'nps', titulo: 'NPS', numerica: true, celula: (r) => (r.npsAvg !== null ? r.npsAvg : '—') },
          {
            id: 'ultima', titulo: 'Última entrega', numerica: true,
            celula: (r) => (r.ultimaEntrega ? new Date(r.ultimaEntrega).toLocaleDateString('pt-BR') : '—'),
          },
          { id: 'saude', titulo: 'Saúde', celula: (r) => <SeloStatus tom={SAUDE_TOM[r.saude]} size="sm">{SAUDE_LABEL[r.saude]}</SeloStatus> },
        ]}
      />
    </section>
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
      id: r.id,
      cliente: r.nps_surveys?.clients?.nome ?? '—',
      nota: r.nota,
      comentario: r.comentario ?? '—',
      data: new Date(r.criado_em).toLocaleDateString('pt-BR'),
    }))
  }, [npsResponses])

  const BAR_COLORS = { promotores: 'bg-success', neutros: 'bg-warning', detratores: 'bg-danger' }

  return (
    <section className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="t-h4 text-foreground">Relatório NPS</h2>
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

      <TabelaRelatorio
        rotulo="Respostas de NPS"
        linhas={rows}
        chave={(r) => r.id}
        colunas={[
          { id: 'cliente', titulo: 'Cliente', principal: true, celula: (r) => r.cliente },
          {
            id: 'nota', titulo: 'Nota', numerica: true,
            celula: (r) => <SeloStatus tom={tomPorFaixa(r.nota, 9, 7)} size="sm">{r.nota}</SeloStatus>,
          },
          {
            id: 'comentario', titulo: 'Comentário',
            celula: (r) => <span className="line-clamp-2 break-words text-muted-foreground" title={r.comentario}>{r.comentario}</span>,
          },
          { id: 'data', titulo: 'Data', numerica: true, celula: (r) => r.data },
        ]}
      />
    </section>
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
      post_feed: 'Formato retirado',
      stories: 'Formato retirado',
      reels: 'Formato retirado',
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
        id: tipo,
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
    <section className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="t-h4 text-foreground">Avaliações por Entregável</h2>
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

      <TabelaRelatorio
        rotulo="Avaliações por entregável"
        linhas={data.rows}
        chave={(r) => r.id}
        colunas={[
          { id: 'tipo', titulo: 'Tipo entregável', principal: true, celula: (r) => r.tipo },
          {
            id: 'media', titulo: 'Média nota', numerica: true,
            celula: (r) => <SeloStatus tom={tomPorFaixa(r.media, 8, 6)} size="sm">{r.media}</SeloStatus>,
          },
          { id: 'total', titulo: 'Total avaliações', numerica: true, celula: (r) => r.total },
          { id: 'melhor', titulo: 'Melhor nota', numerica: true, celula: (r) => <span className="text-success">{r.melhor}</span> },
          { id: 'pior', titulo: 'Pior nota', numerica: true, celula: (r) => <span className="text-danger">{r.pior}</span> },
        ]}
      />
    </section>
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
        id: path.id,
        titulo: path.titulo,
        ativo: path.ativo,
        inscritos,
        concluidos,
        taxaConclusao,
        progressoMedio,
      }
    })

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
    <section className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="t-h4 text-foreground">Engajamento com Trilhas</h2>
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

      <TabelaRelatorio
        rotulo="Engajamento com trilhas"
        linhas={data.rows}
        chave={(r) => r.id}
        colunas={[
          {
            id: 'titulo', titulo: 'Trilha', principal: true,
            celula: (r) => (
              <span className="inline-flex flex-wrap items-center gap-2">
                {r.titulo}
                {!r.ativo && <SeloStatus tom="neutro" size="sm">Inativa</SeloStatus>}
              </span>
            ),
          },
          { id: 'inscritos', titulo: 'Inscritos', numerica: true, celula: (r) => r.inscritos },
          { id: 'concluidos', titulo: 'Concluídos', numerica: true, celula: (r) => r.concluidos },
          {
            id: 'taxa', titulo: 'Taxa conclusão', numerica: true,
            celula: (r) => <SeloStatus tom={tomPorFaixa(r.taxaConclusao, 60, 30, 'neutro')} size="sm">{r.taxaConclusao}%</SeloStatus>,
          },
          {
            id: 'progresso', titulo: 'Progresso médio',
            celula: (r) => (
              <div className="flex min-w-[120px] items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full transition-all', r.progressoMedio >= 50 ? 'bg-success' : 'bg-warning')}
                    style={{ width: `${r.progressoMedio}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{r.progressoMedio}%</span>
              </div>
            ),
          },
        ]}
      />
    </section>
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
    <PageContainer className="animate-fade-in print:p-0">
      <PageHeader
        title="Relatórios"
        description="Analise o desempenho da agência com relatórios detalhados."
      />

      {/* Tab bar */}
      <AbasRolaveis
        rotulo="Tipos de relatório"
        variante="segmentado"
        itens={TABS.map(tab => ({
          id: tab.id,
          rotulo: tab.label,
          icone: tab.icon,
          ativo: activeTab === tab.id,
          dica: tab.label,
          onClick: () => setActiveTab(tab.id),
        }))}
      />

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
    </PageContainer>
  )
}
