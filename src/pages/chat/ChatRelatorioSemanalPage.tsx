import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FileBarChart, Users, SmilePlus, Frown, Meh, Star, AlertTriangle,
  TrendingUp, TrendingDown, MessageSquare, Download, ChevronDown, ChevronUp,
  Sparkles, ChevronRight, BookOpen, XCircle, Bell, User,
  Lightbulb, CheckCircle, Shield, Loader2, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContactMetrics {
  totalConversas: number
  conversasEncerradas: number
  sentimentoPositivo: number
  sentimentoNeutro: number
  sentimentoNegativo: number
  csatMedia: number
  csatTotal: number
  slaViolado: number
  tmaMinutos: number | null
  score: number
}

type NivelTri = 'baixo' | 'medio' | 'alto' | null
type ClarezaTri = 'baixa' | 'media' | 'alta' | null

interface AIWeeklyReport {
  id: string
  semana_inicio: string
  estrategista_id: string | null
  estrategista_nome: string | null
  client_id: string | null
  contact_id: string | null
  client_nome: string | null
  resumo: string | null
  nota_detalhada: string | null
  topicos: string[] | null
  objecoes: string[] | null
  como_lidar: string[] | null
  proximos_passos: string[] | null
  alertas: string[] | null
  sentimento_geral: string | null
  total_mensagens: number | null
  total_conversas: number | null
  is_group: boolean | null
  // Brand consulting fields
  clareza_posicionamento: ClarezaTri
  nivel_execucao: NivelTri
  nivel_confianca_cliente: NivelTri
  risco_abandono: NivelTri
  qualidade_consultoria_estrategista: number | null
  ia_score: number | null
  temas_tratados: string[] | null
  direcionamentos_dados: string[] | null
  entregaveis_pendentes: string[] | null
  bloqueios: string[] | null
  sugestoes_estrategista: string[] | null
}

interface UnifiedReport {
  key: string
  contactId: string | null
  clientId: string | null
  nome: string
  metrics: ContactMetrics | null
  aiReport: AIWeeklyReport | null
}

interface EstrategistaGroup {
  id: string | null
  nome: string
  reports: UnifiedReport[]
}

// ─── Period helpers ───────────────────────────────────────────────────────────

type PeriodoTipo = 'semanal' | 'mensal' | 'geral'
type WeekRange = { start: Date; end: Date; label: string; startDate: string }
type MonthRange = { start: Date; end: Date; label: string; startDate: string; endDate: string }

function getMonthRanges(count: number): MonthRange[] {
  const months: MonthRange[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999)
    months.push({
      start, end,
      label: i === 0 ? 'Este mês' : i === 1 ? 'Mês passado'
        : start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    })
  }
  return months
}

function getWeekRanges(count: number): WeekRange[] {
  const weeks: WeekRange[] = []
  const now = new Date()
  // Segunda-feira da semana atual (ISO: segunda → domingo)
  const currentMonday = new Date(now)
  currentMonday.setHours(0, 0, 0, 0)
  currentMonday.setDate(currentMonday.getDate() - ((currentMonday.getDay() + 6) % 7))

  for (let i = 0; i < count; i++) {
    const monday = new Date(currentMonday)
    monday.setDate(currentMonday.getDate() - i * 7)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    weeks.push({
      start: monday,
      end: sunday,
      label: i === 0 ? 'Esta semana' : i === 1 ? 'Semana passada'
        : `${monday.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} – ${sunday.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`,
      startDate: monday.toISOString().slice(0, 10),
    })
  }
  return weeks
}

// ─── Score ────────────────────────────────────────────────────────────────────

function calcScore(m: Omit<ContactMetrics, 'score'>): number {
  let s = 50
  if (m.csatTotal > 0) s += ((m.csatMedia - 1) / 4) * 30
  const totalSent = m.sentimentoPositivo + m.sentimentoNeutro + m.sentimentoNegativo
  if (totalSent > 0) s += ((m.sentimentoPositivo - m.sentimentoNegativo) / totalSent) * 20
  if (m.totalConversas > 0) s -= (m.slaViolado / m.totalConversas) * 20
  return Math.max(0, Math.min(100, Math.round(s)))
}

const triLevel = (v: NivelTri | ClarezaTri): -1 | 0 | 1 | null => {
  if (v === 'alto' || v === 'alta') return 1
  if (v === 'medio' || v === 'media') return 0
  if (v === 'baixo' || v === 'baixa') return -1
  return null
}

// Score composto: combina leitura qualitativa da IA + métricas operacionais
function calcUnifiedScore(report: UnifiedReport): number {
  const ai = report.aiReport
  const m = report.metrics

  // Sem IA e sem métricas — fallback neutro
  if (!ai && !m) return 50

  // Só métricas — usa o calcScore existente
  if (!ai && m) return m.score

  // Com IA — score composto
  let s = 50
  if (ai?.ia_score != null) s = ai.ia_score * 0.5 + 25 // base: leitura da IA pesa 50%
  const clareza = triLevel(ai?.clareza_posicionamento ?? null)
  const exec = triLevel(ai?.nivel_execucao ?? null)
  const conf = triLevel(ai?.nivel_confianca_cliente ?? null)
  const risco = triLevel(ai?.risco_abandono ?? null)

  if (clareza !== null) s += clareza * 8
  if (exec !== null) s += exec * 12
  if (conf !== null) s += conf * 8
  if (risco !== null) s -= risco * 12 // alto risco penaliza
  if (ai?.qualidade_consultoria_estrategista != null) {
    s += (ai.qualidade_consultoria_estrategista - 3) * 4
  }
  if (ai?.sentimento_geral === 'positivo') s += 5
  else if (ai?.sentimento_geral === 'negativo') s -= 5
  s -= (ai?.bloqueios?.length ?? 0) * 2.5
  s -= (ai?.alertas?.length ?? 0) * 2

  // Métricas operacionais ajustam
  if (m) {
    if (m.csatTotal > 0) s += ((m.csatMedia - 1) / 4) * 8
    if (m.totalConversas > 0) s -= (m.slaViolado / m.totalConversas) * 10
  }

  return Math.max(0, Math.min(100, Math.round(s)))
}

function scoreVariant(score: number): 'success' | 'warning' | 'danger' {
  return score >= 70 ? 'success' : score >= 40 ? 'warning' : 'danger'
}

function scoreLabel(score: number) {
  return score >= 70 ? 'Satisfeito' : score >= 40 ? 'Atenção' : 'Risco'
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useLatestAIWeek() {
  return useQuery({
    queryKey: ['chat', 'ai-weekly-latest'],
    queryFn: async () => {
      const { data } = await supabase
        .from('chat_weekly_reports')
        .select('semana_inicio')
        .order('semana_inicio', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data?.semana_inicio ?? null
    },
    staleTime: 1000 * 60 * 10,
  })
}

function useUnifiedWeeklyReports(semanaInicio: string, week: WeekRange) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['chat', 'unified-weekly', semanaInicio, week.start.toISOString(), user?.id],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from('users')
        .select('id, perfil')
        .eq('id', user?.id ?? '')
        .single()

      // 1. AI reports
      let aiQuery = supabase
        .from('chat_weekly_reports')
        .select('*')
        .eq('semana_inicio', semanaInicio)
        .order('estrategista_nome', { ascending: true })
        .order('client_nome', { ascending: true })
      if (profile?.perfil === 'estrategista') {
        aiQuery = aiQuery.eq('estrategista_id', profile.id)
      }
      const { data: aiReports } = await aiQuery

      // Build groups from AI reports
      const groupMap: Record<string, EstrategistaGroup> = {}
      const reportMap: Record<string, UnifiedReport> = {}       // est:contact_id → report
      const clientReportMap: Record<string, UnifiedReport> = {} // est:client_id → report (fallback)

      for (const r of (aiReports ?? []) as AIWeeklyReport[]) {
        const estKey = r.estrategista_id ?? 'sem'
        if (!groupMap[estKey]) {
          groupMap[estKey] = { id: r.estrategista_id, nome: r.estrategista_nome ?? 'Sem estrategista', reports: [] }
        }
        const key = r.contact_id ?? r.client_id ?? r.id
        const unified: UnifiedReport = {
          key,
          contactId: r.contact_id,
          clientId: r.client_id,
          nome: r.client_nome ?? 'Contato',
          metrics: null,
          aiReport: r,
        }
        groupMap[estKey].reports.push(unified)
        reportMap[`${estKey}:${key}`] = unified
        // Índice secundário: quando o relatório só tem client_id (sem contact_id)
        if (r.client_id && !r.contact_id) {
          clientReportMap[`${estKey}:${r.client_id}`] = unified
        }
      }

      // 2. Conversation metrics per estrategista
      const estrategistaIds = Object.keys(groupMap).filter(k => k !== 'sem')
      if (estrategistaIds.length > 0) {
        const { data: convs } = await supabase
          .from('chat_conversations')
          .select(`
            id, status, sentimento, agente_id,
            sla_primeira_resposta_violado, sla_resolucao_violado,
            primeira_resposta_em, criado_em,
            chat_contacts(id, nome, numero_whatsapp, client_id)
          `)
          .in('agente_id', estrategistaIds)
          .gte('criado_em', week.start.toISOString())
          .lte('criado_em', week.end.toISOString())

        const convIds = (convs ?? []).map(c => c.id)
        const csatMap: Record<string, number> = {}
        if (convIds.length > 0) {
          for (let i = 0; i < convIds.length; i += 200) {
            const { data: csatData } = await supabase
              .from('chat_csat')
              .select('conversation_id, nota')
              .in('conversation_id', convIds.slice(i, i + 200))
              .not('nota', 'is', null)
            for (const c of csatData ?? []) csatMap[c.conversation_id] = c.nota
          }
        }

        // Per-estrategista, per-contact raw metrics
        type Raw = Omit<ContactMetrics, 'score'>
        const rawMap: Record<string, Record<string, Raw>> = {}

        for (const conv of convs ?? []) {
          const contact = (conv as any).chat_contacts
          if (!contact) continue
          const estId = conv.agente_id
          const contactId = contact.id
          if (!rawMap[estId]) rawMap[estId] = {}
          if (!rawMap[estId][contactId]) {
            rawMap[estId][contactId] = {
              totalConversas: 0, conversasEncerradas: 0,
              sentimentoPositivo: 0, sentimentoNeutro: 0, sentimentoNegativo: 0,
              csatMedia: 0, csatTotal: 0, slaViolado: 0, tmaMinutos: null,
            }
          }
          const m = rawMap[estId][contactId]
          m.totalConversas++
          if (conv.status === 'encerrada') m.conversasEncerradas++
          if (conv.sentimento === 'positivo') m.sentimentoPositivo++
          else if (conv.sentimento === 'neutro') m.sentimentoNeutro++
          else if (conv.sentimento === 'negativo') m.sentimentoNegativo++
          if (conv.sla_primeira_resposta_violado || conv.sla_resolucao_violado) m.slaViolado++
          const nota = csatMap[conv.id]
          if (nota !== undefined) {
            m.csatTotal++
            m.csatMedia = (m.csatMedia * (m.csatTotal - 1) + nota) / m.csatTotal
          }
          if (conv.primeira_resposta_em && conv.criado_em) {
            const diff = Math.round((new Date(conv.primeira_resposta_em).getTime() - new Date(conv.criado_em).getTime()) / 60000)
            m.tmaMinutos = m.tmaMinutos === null ? diff : Math.round((m.tmaMinutos + diff) / 2)
          }
        }

        // Attach metrics to unified reports
        for (const [estId, contactRaws] of Object.entries(rawMap)) {
          for (const [contactId, raw] of Object.entries(contactRaws)) {
            const score = { ...raw, score: calcScore(raw) }
            // Tenta por contact_id direto; fallback por client_id quando relatório só tem client_id
            const conv = (convs ?? []).find(c => (c as any).chat_contacts?.id === contactId)
            const clientId = (conv as any)?.chat_contacts?.client_id ?? null
            const matched = reportMap[`${estId}:${contactId}`]
              ?? (clientId ? clientReportMap[`${estId}:${clientId}`] : undefined)
            if (matched) {
              matched.metrics = score
            } else {
              // Contact has metrics but no AI report yet — add to group
              if (!groupMap[estId]) continue
              const unified: UnifiedReport = {
                key: contactId,
                contactId,
                clientId: (convs ?? []).find(c => (c as any).chat_contacts?.id === contactId && c.agente_id === estId)
                  ? ((convs ?? []).find(c => (c as any).chat_contacts?.id === contactId && c.agente_id === estId) as any).chat_contacts?.client_id ?? null
                  : null,
                nome: (convs ?? []).find(c => (c as any).chat_contacts?.id === contactId)
                  ? ((convs ?? []).find(c => (c as any).chat_contacts?.id === contactId) as any).chat_contacts?.nome ?? 'Contato'
                  : 'Contato',
                metrics: { ...raw, score: calcScore(raw) },
                aiReport: null,
              }
              groupMap[estId].reports.push(unified)
            }
          }
        }

        // Sort each group: score asc (worst first)
        for (const g of Object.values(groupMap)) {
          g.reports.sort((a, b) => (a.metrics?.score ?? 50) - (b.metrics?.score ?? 50))
        }
      }

      return Object.values(groupMap)
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!semanaInicio,
  })
}

function useHistoricalAvgScore(currentWeekStart: string) {
  return useQuery({
    queryKey: ['chat', 'historical-score', currentWeekStart],
    queryFn: async () => {
      // Fetch all conversations from all weeks except current
      const { data: convs } = await supabase
        .from('chat_conversations')
        .select('id, agente_id, sentimento, sla_primeira_resposta_violado, sla_resolucao_violado, criado_em, chat_contacts(id)')
        .lt('criado_em', currentWeekStart)
        .not('agente_id', 'is', null)

      if (!convs || convs.length === 0) return null

      // Group by ISO week → contact → aggregate
      const weekContactMap: Record<string, Record<string, { pos: number; neu: number; neg: number; sla: number; total: number }>> = {}

      for (const c of convs) {
        const contact = (c as any).chat_contacts
        if (!contact) continue
        const d = new Date(c.criado_em)
        const thursday = new Date(d)
        thursday.setUTCDate(d.getUTCDate() + (4 - (d.getUTCDay() || 7)))
        const year = thursday.getUTCFullYear()
        const jan4 = new Date(Date.UTC(year, 0, 4))
        const week = Math.ceil(((thursday.getTime() - jan4.getTime()) / 86400000 + jan4.getUTCDay() + 1) / 7)
        const wk = `${year}-W${String(week).padStart(2, '0')}`
        const ck = contact.id as string
        if (!weekContactMap[wk]) weekContactMap[wk] = {}
        if (!weekContactMap[wk][ck]) weekContactMap[wk][ck] = { pos: 0, neu: 0, neg: 0, sla: 0, total: 0 }
        const m = weekContactMap[wk][ck]
        m.total++
        if (c.sentimento === 'positivo') m.pos++
        else if (c.sentimento === 'neutro') m.neu++
        else if (c.sentimento === 'negativo') m.neg++
        if (c.sla_primeira_resposta_violado || c.sla_resolucao_violado) m.sla++
      }

      // Per-week avg score
      const weekScores: number[] = []
      for (const contacts of Object.values(weekContactMap)) {
        const scores = Object.values(contacts).map(m => {
          let s = 50
          const totalSent = m.pos + m.neu + m.neg
          if (totalSent > 0) s += ((m.pos - m.neg) / totalSent) * 20
          if (m.total > 0) s -= (m.sla / m.total) * 20
          return Math.max(0, Math.min(100, Math.round(s)))
        })
        if (scores.length > 0) weekScores.push(Math.round(scores.reduce((a, b) => a + b, 0) / scores.length))
      }

      if (weekScores.length === 0) return null
      return Math.round(weekScores.reduce((a, b) => a + b, 0) / weekScores.length)
    },
    staleTime: 1000 * 60 * 30,
    enabled: !!currentWeekStart,
  })
}

function usePeriodReports(start: string | null, end: string | null, active: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['chat', 'period-reports', start, end, user?.id],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from('users').select('id, perfil').eq('id', user?.id ?? '').single()

      // 1. AI reports — deduplicate by contact (keep most recent)
      let aiQuery = supabase
        .from('chat_weekly_reports')
        .select('*')
        .order('estrategista_nome', { ascending: true })
        .order('client_nome', { ascending: true })
        .order('semana_inicio', { ascending: false })
      if (start) aiQuery = aiQuery.gte('semana_inicio', start)
      if (end) aiQuery = aiQuery.lte('semana_inicio', end)
      if (profile?.perfil === 'estrategista') aiQuery = aiQuery.eq('estrategista_id', profile.id)
      const { data: aiReports } = await aiQuery

      // Dedup: keep most recent per contact
      const seenContacts = new Set<string>()
      const dedupedAI: AIWeeklyReport[] = []
      for (const r of (aiReports ?? []) as AIWeeklyReport[]) {
        const ck = r.contact_id ?? r.client_id ?? r.id
        if (!seenContacts.has(ck)) { seenContacts.add(ck); dedupedAI.push(r) }
      }

      const groupMap: Record<string, EstrategistaGroup> = {}
      const reportMap: Record<string, UnifiedReport> = {}

      for (const r of dedupedAI) {
        const estKey = r.estrategista_id ?? 'sem'
        if (!groupMap[estKey]) groupMap[estKey] = { id: r.estrategista_id, nome: r.estrategista_nome ?? 'Sem estrategista', reports: [] }
        const key = r.contact_id ?? r.client_id ?? r.id
        const unified: UnifiedReport = { key, contactId: r.contact_id, clientId: r.client_id, nome: r.client_nome ?? 'Contato', metrics: null, aiReport: r }
        groupMap[estKey].reports.push(unified)
        reportMap[`${estKey}:${key}`] = unified
      }

      // 2. Conversation metrics
      const estrategistaIds = Object.keys(groupMap).filter(k => k !== 'sem')
      if (estrategistaIds.length > 0) {
        let convQuery = supabase
          .from('chat_conversations')
          .select(`id, status, sentimento, agente_id, sla_primeira_resposta_violado, sla_resolucao_violado, primeira_resposta_em, criado_em, chat_contacts(id, nome, numero_whatsapp, client_id)`)
          .in('agente_id', estrategistaIds)
        if (start) convQuery = convQuery.gte('criado_em', `${start}T00:00:00`)
        if (end) convQuery = convQuery.lte('criado_em', `${end}T23:59:59`)
        const { data: convs } = await convQuery

        const convIds = (convs ?? []).map(c => c.id)
        const csatMap: Record<string, number> = {}
        if (convIds.length > 0) {
          for (let i = 0; i < convIds.length; i += 200) {
            const { data: csatData } = await supabase
              .from('chat_csat').select('conversation_id, nota')
              .in('conversation_id', convIds.slice(i, i + 200)).not('nota', 'is', null)
            for (const c of csatData ?? []) csatMap[c.conversation_id] = c.nota
          }
        }

        type Raw = Omit<ContactMetrics, 'score'>
        const rawMap: Record<string, Record<string, Raw>> = {}
        for (const conv of convs ?? []) {
          const contact = (conv as any).chat_contacts
          if (!contact) continue
          const estId = conv.agente_id; const contactId = contact.id
          if (!rawMap[estId]) rawMap[estId] = {}
          if (!rawMap[estId][contactId]) rawMap[estId][contactId] = { totalConversas: 0, conversasEncerradas: 0, sentimentoPositivo: 0, sentimentoNeutro: 0, sentimentoNegativo: 0, csatMedia: 0, csatTotal: 0, slaViolado: 0, tmaMinutos: null }
          const m = rawMap[estId][contactId]
          m.totalConversas++
          if (conv.status === 'encerrada') m.conversasEncerradas++
          if (conv.sentimento === 'positivo') m.sentimentoPositivo++
          else if (conv.sentimento === 'neutro') m.sentimentoNeutro++
          else if (conv.sentimento === 'negativo') m.sentimentoNegativo++
          if (conv.sla_primeira_resposta_violado || conv.sla_resolucao_violado) m.slaViolado++
          const nota = csatMap[conv.id]
          if (nota !== undefined) { m.csatTotal++; m.csatMedia = (m.csatMedia * (m.csatTotal - 1) + nota) / m.csatTotal }
          if (conv.primeira_resposta_em && conv.criado_em) {
            const diff = Math.round((new Date(conv.primeira_resposta_em).getTime() - new Date(conv.criado_em).getTime()) / 60000)
            m.tmaMinutos = m.tmaMinutos === null ? diff : Math.round((m.tmaMinutos + diff) / 2)
          }
        }

        for (const [estId, contactRaws] of Object.entries(rawMap)) {
          for (const [contactId, raw] of Object.entries(contactRaws)) {
            const key = `${estId}:${contactId}`
            if (reportMap[key]) {
              reportMap[key].metrics = { ...raw, score: calcScore(raw) }
            } else {
              if (!groupMap[estId]) continue
              const found = (convs ?? []).find(c => (c as any).chat_contacts?.id === contactId)
              const unified: UnifiedReport = {
                key: contactId, contactId, clientId: (found as any)?.chat_contacts?.client_id ?? null,
                nome: (found as any)?.chat_contacts?.nome ?? 'Contato',
                metrics: { ...raw, score: calcScore(raw) }, aiReport: null,
              }
              groupMap[estId].reports.push(unified)
            }
          }
        }

        for (const g of Object.values(groupMap)) {
          g.reports.sort((a, b) => (a.metrics?.score ?? 50) - (b.metrics?.score ?? 50))
        }
      }

      return Object.values(groupMap)
    },
    staleTime: 1000 * 60 * 10,
    enabled: active,
  })
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

const VARIANT_CLS: Record<string, string> = {
  default: 'bg-primary-muted text-primary',
  danger: 'bg-danger-light text-danger',
  warning: 'bg-warning-light text-warning',
  success: 'bg-success-light text-success',
}

function KpiCard({ label, value, icon: Icon, variant = 'default', sublabel }: {
  label: string; value: string | number
  icon: React.ElementType; variant?: 'default' | 'danger' | 'warning' | 'success'
  sublabel?: string
}) {
  return (
    <div className="glass-card p-5 flex items-center gap-4">
      <div className={cn('rounded-xl p-3 shrink-0', VARIANT_CLS[variant])}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="font-display text-2xl font-bold text-foreground leading-tight">{value}</p>
        <p className="font-mono text-[11px] tracking-wider uppercase text-muted-foreground mt-0.5">{label}</p>
        {sublabel && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sublabel}</p>}
      </div>
    </div>
  )
}

function SentimentBar({ positivo, neutro, negativo }: { positivo: number; neutro: number; negativo: number }) {
  const total = positivo + neutro + negativo
  if (total === 0) return <span className="text-xs text-muted-foreground">Sem dados de sentimento</span>
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-muted">
        {positivo > 0 && <div className="bg-success h-full" style={{ width: `${(positivo / total) * 100}%` }} />}
        {neutro > 0 && <div className="bg-amber-400 h-full" style={{ width: `${(neutro / total) * 100}%` }} />}
        {negativo > 0 && <div className="bg-danger h-full" style={{ width: `${(negativo / total) * 100}%` }} />}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-medium">
        <span className="text-success">{positivo}</span>
        <span className="text-amber-500">{neutro}</span>
        <span className="text-danger">{negativo}</span>
      </div>
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const v = scoreVariant(score)
  const cls = { success: 'bg-success-light text-success', warning: 'bg-warning-light text-warning', danger: 'bg-danger-light text-danger' }[v]
  const txtCls = { success: 'text-success', warning: 'text-warning', danger: 'text-danger' }[v]
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', cls)}>{score}</span>
      <span className={cn('text-xs font-medium', txtCls)}>{scoreLabel(score)}</span>
    </div>
  )
}

const SENT_STYLE: Record<string, { cls: string; label: string }> = {
  positivo: { cls: 'bg-success-light text-success', label: 'Positivo' },
  neutro:   { cls: 'bg-warning-light text-warning',  label: 'Neutro'  },
  negativo: { cls: 'bg-danger-light text-danger',    label: 'Negativo' },
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(groups: EstrategistaGroup[], weekLabel: string) {
  const headers = ['Estrategista', 'Cliente', 'Score', 'Status', 'Conversas', 'Encerradas', 'Sentimento', 'CSAT', 'SLA Violados', 'TMA (min)', 'Resumo IA']
  const rows: string[][] = []
  for (const g of groups) {
    for (const r of g.reports) {
      const m = r.metrics
      const sent = r.aiReport?.sentimento_geral ?? (m
        ? m.sentimentoPositivo > m.sentimentoNegativo ? 'positivo' : m.sentimentoNegativo > m.sentimentoPositivo ? 'negativo' : 'neutro'
        : '')
      rows.push([
        g.nome, r.nome,
        m ? String(m.score) : '—', m ? scoreLabel(m.score) : '—',
        m ? String(m.totalConversas) : '—', m ? String(m.conversasEncerradas) : '—',
        sent,
        m?.csatTotal ? m.csatMedia.toFixed(1) : '—',
        m ? String(m.slaViolado) : '—',
        m?.tmaMinutos != null ? String(m.tmaMinutos) : '—',
        r.aiReport?.resumo ?? '',
      ])
    }
  }
  const csv = [headers, ...rows].map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `relatorio-${weekLabel.replace(/\s/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Unified client card ──────────────────────────────────────────────────────

// Helpers de UI para campos de consultoria de marca
const TRI_STYLE = {
  alto:  { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', label: 'Alto' },
  alta:  { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', label: 'Alta' },
  medio: { bg: 'bg-amber-500/10',  text: 'text-amber-700 dark:text-amber-400',   label: 'Médio' },
  media: { bg: 'bg-amber-500/10',  text: 'text-amber-700 dark:text-amber-400',   label: 'Média' },
  baixo: { bg: 'bg-rose-500/10',   text: 'text-rose-700 dark:text-rose-400',     label: 'Baixo' },
  baixa: { bg: 'bg-rose-500/10',   text: 'text-rose-700 dark:text-rose-400',     label: 'Baixa' },
} as const

const RISK_STYLE = {
  baixo: { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', label: 'Baixo' },
  medio: { bg: 'bg-amber-500/10',  text: 'text-amber-700 dark:text-amber-400',   label: 'Médio' },
  alto:  { bg: 'bg-rose-500/10',   text: 'text-rose-700 dark:text-rose-400',     label: 'Alto' },
} as const

function TriBadge({ label, value, invert = false }: { label: string; value: NivelTri | ClarezaTri; invert?: boolean }) {
  if (!value) return null
  const style = invert ? RISK_STYLE[value as keyof typeof RISK_STYLE] : TRI_STYLE[value as keyof typeof TRI_STYLE]
  if (!style) return null
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[9px] uppercase font-mono tracking-wider text-muted-foreground">{label}</span>
      <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', style.bg, style.text)}>
        {style.label}
      </span>
    </div>
  )
}

function QualityStars({ value }: { value: number | null }) {
  if (!value) return null
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[9px] uppercase font-mono tracking-wider text-muted-foreground">Qualidade do estrategista</span>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            className={cn('h-3.5 w-3.5', i <= value ? 'fill-primary text-primary' : 'text-muted-foreground/30')}
          />
        ))}
      </div>
    </div>
  )
}

function UnifiedClientCard({ report }: { report: UnifiedReport }) {
  const [open, setOpen] = useState(false)
  const m = report.metrics
  const ai = report.aiReport
  const sentStyle = ai?.sentimento_geral ? SENT_STYLE[ai.sentimento_geral] ?? SENT_STYLE.neutro : null
  const unifiedScore = useMemo(() => calcUnifiedScore(report), [report])
  const showRiskBanner = ai?.risco_abandono === 'alto' || (ai?.alertas?.length ?? 0) > 0

  return (
    <div className={cn('glass-card overflow-hidden', open && 'ring-2 ring-primary/20')}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left p-4 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-muted text-primary text-sm font-bold">
            {report.nome.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-foreground truncate text-sm">{report.nome}</p>
              {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
            </div>

            {/* Badges row */}
            <div className="flex items-center gap-2 flex-wrap">
              {ai?.is_group ? (
                <span className="flex items-center gap-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 px-2 py-0.5 text-[10px] font-medium">
                  <Users className="h-3 w-3" />Grupo
                </span>
              ) : ai && (
                <span className="flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-medium">
                  <User className="h-3 w-3" />Conversa direta
                </span>
              )}
              {(ai || m) && <ScoreBadge score={unifiedScore} />}
              {sentStyle && (
                <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', sentStyle.cls)}>
                  <Sparkles className="h-3 w-3" />{sentStyle.label}
                </span>
              )}
              {ai?.risco_abandono === 'alto' && (
                <span className="flex items-center gap-1 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 px-2 py-0.5 text-[10px] font-medium">
                  <AlertTriangle className="h-3 w-3" />Risco de abandono
                </span>
              )}
              {!ai && (
                <span className="text-[10px] text-muted-foreground italic">Sem análise</span>
              )}
            </div>

            {/* Quick stats row */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {m && (
                <>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {m.totalConversas} conversa{m.totalConversas !== 1 ? 's' : ''}
                    <span className="text-[10px]">({m.conversasAbertas ?? m.totalConversas - m.conversasEncerradas}A/{m.conversasEncerradas}E)</span>
                  </span>
                  {m.csatTotal > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {m.csatMedia.toFixed(1)}
                    </span>
                  )}
                  {m.slaViolado > 0 && (
                    <span className="flex items-center gap-1 text-danger font-medium">
                      <AlertTriangle className="h-3 w-3" />{m.slaViolado} SLA
                    </span>
                  )}
                  {m.tmaMinutos != null && (
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />{m.tmaMinutos}min TMA
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Sentiment bar */}
            {m && (
              <SentimentBar
                positivo={m.sentimentoPositivo}
                neutro={m.sentimentoNeutro}
                negativo={m.sentimentoNegativo}
              />
            )}
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-border px-4 pb-5 pt-4 space-y-5">

          {/* Risk banner */}
          {showRiskBanner && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-0.5">
                <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                  {ai?.risco_abandono === 'alto' ? 'Atenção: risco de abandono alto' : 'Atenção: alertas críticos'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Esse cliente precisa de uma ação imediata pra não esfriar.
                </p>
              </div>
            </div>
          )}

          {/* Diagnóstico da marca (consultoria) */}
          {ai && (ai.clareza_posicionamento || ai.nivel_execucao || ai.nivel_confianca_cliente || ai.risco_abandono || ai.qualidade_consultoria_estrategista || ai.ia_score != null) && (
            <div className="rounded-xl border border-primary/15 bg-primary-muted/10 px-4 py-3 space-y-3">
              <p className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-primary">
                <Shield className="h-3 w-3" /> Diagnóstico da consultoria
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <TriBadge label="Clareza posicionamento" value={ai.clareza_posicionamento} />
                <TriBadge label="Execução do cliente" value={ai.nivel_execucao} />
                <TriBadge label="Confiança do cliente" value={ai.nivel_confianca_cliente} />
                <TriBadge label="Risco de abandono" value={ai.risco_abandono} invert />
                <QualityStars value={ai.qualidade_consultoria_estrategista} />
              </div>
              {ai.temas_tratados && ai.temas_tratados.length > 0 && (
                <div>
                  <p className="text-[9px] uppercase font-mono tracking-wider text-muted-foreground mb-1.5">Temas trabalhados</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ai.temas_tratados.map((t, i) => (
                      <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {ai.sugestoes_estrategista && ai.sugestoes_estrategista.length > 0 && (
                <div className="rounded-lg border border-primary/30 bg-primary-muted/20 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-primary mb-2">
                    <Lightbulb className="h-3 w-3" /> Como melhorar com este cliente
                  </p>
                  <ul className="space-y-1.5">
                    {ai.sugestoes_estrategista.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                        <ChevronRight className="h-3 w-3 text-primary shrink-0 mt-0.5" />{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Painel acionável: pendências e bloqueios */}
          {ai && ((ai.entregaveis_pendentes?.length ?? 0) > 0 || (ai.bloqueios?.length ?? 0) > 0 || (ai.direcionamentos_dados?.length ?? 0) > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(ai.direcionamentos_dados?.length ?? 0) > 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-emerald-700 dark:text-emerald-400 mb-2">
                    <Lightbulb className="h-3 w-3" /> Direcionamentos dados
                  </p>
                  <ul className="space-y-1.5">
                    {ai.direcionamentos_dados!.map((d, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                        <ChevronRight className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />{d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(ai.entregaveis_pendentes?.length ?? 0) > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-amber-700 dark:text-amber-400 mb-2">
                    <CheckCircle className="h-3 w-3" /> Entregáveis pendentes
                  </p>
                  <ul className="space-y-1.5">
                    {ai.entregaveis_pendentes!.map((e, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                        <ChevronRight className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />{e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(ai.bloqueios?.length ?? 0) > 0 && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-3">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-rose-700 dark:text-rose-400 mb-2">
                    <XCircle className="h-3 w-3" /> Bloqueios identificados
                  </p>
                  <ul className="space-y-1.5">
                    {ai.bloqueios!.map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                        <ChevronRight className="h-3 w-3 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />{b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* AI analysis */}
          {ai ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] uppercase font-mono tracking-wider text-primary">
                <Sparkles className="h-3 w-3" /> Análise narrativa · {ai.total_conversas ?? 0} conv · {ai.total_mensagens ?? 0} msgs
              </div>

              {ai.resumo && (
                <p className="text-sm text-foreground leading-relaxed">{ai.resumo}</p>
              )}

              {ai.nota_detalhada && (
                <div className="rounded-xl border border-primary/20 bg-primary-muted/30 px-4 py-3">
                  <p className="text-[10px] uppercase font-mono tracking-wider text-primary mb-1.5">Análise detalhada</p>
                  <p className="text-sm text-foreground leading-relaxed">{ai.nota_detalhada}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ai.topicos && ai.topicos.length > 0 && (
                  <div>
                    <p className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-muted-foreground mb-2">
                      <BookOpen className="h-3 w-3" /> Tópicos
                    </p>
                    <ul className="space-y-1">
                      {ai.topicos.map((t, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                          <ChevronRight className="h-3 w-3 text-primary shrink-0 mt-0.5" />{t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {ai.objecoes && ai.objecoes.length > 0 && (
                  <div>
                    <p className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-muted-foreground mb-2">
                      <XCircle className="h-3 w-3" /> Objeções
                    </p>
                    <ul className="space-y-2">
                      {ai.objecoes.map((o, i) => (
                        <li key={i} className="flex flex-col gap-0.5">
                          <span className="flex items-start gap-1.5 text-xs text-foreground">
                            <ChevronRight className="h-3 w-3 text-warning shrink-0 mt-0.5" />{o}
                          </span>
                          {ai.como_lidar?.[i] && (
                            <span className="ml-4 text-[10px] text-muted-foreground italic">{ai.como_lidar[i]}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {ai.proximos_passos && ai.proximos_passos.length > 0 && (
                  <div>
                    <p className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-muted-foreground mb-2">
                      <CheckCircle className="h-3 w-3 text-success" /> Próximos passos
                    </p>
                    <ul className="space-y-1.5">
                      {ai.proximos_passos.map((p, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                          <CheckCircle className="h-3 w-3 text-success shrink-0 mt-0.5" />{p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {ai.como_lidar && ai.como_lidar.length > 0 && (!ai.objecoes || ai.objecoes.length === 0) && (
                  <div>
                    <p className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-muted-foreground mb-2">
                      <Lightbulb className="h-3 w-3 text-amber-500" /> Como lidar
                    </p>
                    <ul className="space-y-1.5">
                      {ai.como_lidar.map((d, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                          <Lightbulb className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />{d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {ai.alertas && ai.alertas.length > 0 && (
                <div className="rounded-lg border border-danger/20 bg-danger-light/40 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-danger mb-2">
                    <Bell className="h-3 w-3" /> Alertas
                  </p>
                  <ul className="space-y-1">
                    {ai.alertas.map((a, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                        <AlertTriangle className="h-3 w-3 text-danger shrink-0 mt-0.5" />{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              Análise ainda não gerada para este cliente nesta semana.
            </div>
          )}

          {/* Métricas operacionais — colapsadas no fim */}
          {m && <MetricsCollapsible metrics={m} />}
        </div>
      )}
    </div>
  )
}

function MetricsCollapsible({ metrics: m }: { metrics: ContactMetrics }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-border/40 bg-muted/10">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors rounded-xl"
      >
        <span className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
          <FileBarChart className="h-3 w-3" /> Métricas operacionais
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-3 pb-3">
          <div>
            <p className="text-[9px] uppercase font-mono tracking-wider text-muted-foreground mb-0.5">Abertas</p>
            <p className="text-base font-bold text-foreground">{m.totalConversas - m.conversasEncerradas}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase font-mono tracking-wider text-muted-foreground mb-0.5">Encerradas</p>
            <p className="text-base font-bold text-foreground">{m.conversasEncerradas}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase font-mono tracking-wider text-muted-foreground mb-0.5">TMA 1ª resposta</p>
            <p className="text-base font-bold text-foreground">{m.tmaMinutos != null ? `${m.tmaMinutos} min` : '—'}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase font-mono tracking-wider text-muted-foreground mb-0.5">SLA Violados</p>
            <p className={cn('text-base font-bold', m.slaViolado > 0 ? 'text-danger' : 'text-foreground')}>{m.slaViolado}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase font-mono tracking-wider text-muted-foreground mb-0.5">Sentimento</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-0.5 text-xs"><SmilePlus className="h-3 w-3 text-success" />{m.sentimentoPositivo}</span>
              <span className="flex items-center gap-0.5 text-xs"><Meh className="h-3 w-3 text-amber-500" />{m.sentimentoNeutro}</span>
              <span className="flex items-center gap-0.5 text-xs"><Frown className="h-3 w-3 text-danger" />{m.sentimentoNegativo}</span>
            </div>
          </div>
          <div>
            <p className="text-[9px] uppercase font-mono tracking-wider text-muted-foreground mb-0.5">CSAT</p>
            {m.csatTotal > 0 ? (
              <div className="flex items-center gap-1 mt-0.5">
                {[1,2,3,4,5].map(i => (
                  <Star key={i} className={cn('h-3 w-3', i <= Math.round(m.csatMedia) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
                ))}
                <span className="text-xs font-semibold ml-0.5">{m.csatMedia.toFixed(1)}</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sem avaliação</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Estrategista section ─────────────────────────────────────────────────────

function EstrategistaSection({ group }: { group: EstrategistaGroup }) {
  const [open, setOpen] = useState(true)
  const withAI = group.reports.filter(r => r.aiReport).length
  const withMetrics = group.reports.filter(r => r.metrics).length

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 py-2 text-left"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar-accent text-primary text-xs shrink-0">
          <User className="h-3.5 w-3.5" />
        </div>
        <span className="font-semibold text-foreground text-sm">{group.nome}</span>
        <span className="text-xs text-muted-foreground">
          {group.reports.length} cliente{group.reports.length !== 1 ? 's' : ''}
          {withAI > 0 && <> · <span className="text-primary">{withAI} com análise</span></>}
        </span>
        <div className="flex-1 h-px bg-border mx-2" />
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="space-y-2 pl-2">
          {group.reports.map(r => (
            <UnifiedClientCard key={r.key} report={r} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatRelatorioSemanalPage() {
  const { user } = useAuth()
  const isEstrategista = user?.perfil === 'estrategista'
  const queryClient = useQueryClient()

  const weeks = useMemo(() => getWeekRanges(12), [])
  const months = useMemo(() => getMonthRanges(12), [])
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>('semanal')
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [selectedMonth, setSelectedMonth] = useState(0)
  const [filterEst, setFilterEst] = useState<string | null>(null)
  const [filterFlag, setFilterFlag] = useState<'todos' | 'risco' | 'baixo' | 'execucao_baixa' | 'clareza_baixa' | 'sem_analise'>('todos')
  const [sortBy, setSortBy] = useState<'score_asc' | 'score_desc' | 'nome'>('score_asc')
  const [generating, setGenerating] = useState(false)
  const [generateMsg, setGenerateMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  // Estrategista sempre fica em semanal
  const activePeriodo: PeriodoTipo = isEstrategista ? 'semanal' : periodoTipo

  const week = weeks[selectedWeek]
  const month = months[selectedMonth]

  const { data: latestWeek } = useLatestAIWeek()
  const { data: weeklyGroups = [], isLoading: loadingWeekly } = useUnifiedWeeklyReports(week.startDate, week)
  const { data: periodGroups = [], isLoading: loadingPeriod } = usePeriodReports(
    activePeriodo === 'mensal' ? month.startDate : null,
    activePeriodo === 'mensal' ? month.endDate : null,
    activePeriodo !== 'semanal',
  )
  const { data: historicalScore } = useHistoricalAvgScore(week.startDate)

  const groups = activePeriodo === 'semanal' ? weeklyGroups : periodGroups
  const isLoading = activePeriodo === 'semanal' ? loadingWeekly : loadingPeriod

  const latestIdx = useMemo(() =>
    latestWeek ? weeks.findIndex(w => w.startDate === latestWeek) : -1
  , [latestWeek, weeks])

  const estrategistaOptions = useMemo(() =>
    groups.map(g => ({ id: g.id, nome: g.nome }))
  , [groups])

  const visibleGroups = useMemo(() => {
    const matchFlag = (r: UnifiedReport): boolean => {
      switch (filterFlag) {
        case 'risco':
          return r.aiReport?.risco_abandono === 'alto' || (r.aiReport?.alertas?.length ?? 0) > 0
        case 'baixo':
          return calcUnifiedScore(r) < 50
        case 'execucao_baixa':
          return r.aiReport?.nivel_execucao === 'baixo'
        case 'clareza_baixa':
          return r.aiReport?.clareza_posicionamento === 'baixa'
        case 'sem_analise':
          return !r.aiReport
        case 'todos':
        default:
          return true
      }
    }
    const sortReports = (reports: UnifiedReport[]) => {
      const arr = [...reports]
      if (sortBy === 'score_asc') return arr.sort((a, b) => calcUnifiedScore(a) - calcUnifiedScore(b))
      if (sortBy === 'score_desc') return arr.sort((a, b) => calcUnifiedScore(b) - calcUnifiedScore(a))
      return arr.sort((a, b) => a.nome.localeCompare(b.nome))
    }
    const base = filterEst ? groups.filter(g => g.id === filterEst) : groups
    return base
      .map(g => ({ ...g, reports: sortReports(g.reports.filter(matchFlag)) }))
      .filter(g => g.reports.length > 0)
  }, [groups, filterEst, filterFlag, sortBy])

  const kpis = useMemo(() => {
    const allReports = groups.flatMap(g => g.reports)
    const withSignal = allReports.filter(r => r.metrics || r.aiReport)
    const total = withSignal.length
    const scores = withSignal.map(r => calcUnifiedScore(r))
    const avgScore = total > 0 ? Math.round(scores.reduce((s, n) => s + n, 0) / total) : 0
    const risco = withSignal.filter((r, i) => scores[i] < 50 || r.aiReport?.risco_abandono === 'alto').length
    const withMetrics = allReports.filter(r => r.metrics)
    const totalCsat = withMetrics.reduce((s, r) => s + r.metrics!.csatTotal, 0)
    const avgCsat = totalCsat > 0
      ? withMetrics.reduce((s, r) => s + r.metrics!.csatMedia * r.metrics!.csatTotal, 0) / totalCsat
      : 0
    const withAI = allReports.filter(r => r.aiReport).length
    const baixaExecucao = allReports.filter(r => r.aiReport?.nivel_execucao === 'baixo').length
    const baixaClareza = allReports.filter(r => r.aiReport?.clareza_posicionamento === 'baixa').length
    return { total, avgScore, risco, avgCsat, totalCsat, withAI, baixaExecucao, baixaClareza }
  }, [groups])

  const periodoLabel = activePeriodo === 'semanal' ? week.label
    : activePeriodo === 'mensal' ? month.label
    : 'Geral'

  const periodFooter = activePeriodo === 'semanal'
    ? `${week.start.toLocaleDateString('pt-BR')} – ${week.end.toLocaleDateString('pt-BR')}`
    : activePeriodo === 'mensal'
    ? `${month.start.toLocaleDateString('pt-BR')} – ${month.end.toLocaleDateString('pt-BR')}`
    : 'Todos os registros'

  const PERIODO_TABS: { key: PeriodoTipo; label: string }[] = [
    { key: 'semanal', label: 'Semanal' },
    { key: 'mensal', label: 'Mensal' },
    { key: 'geral', label: 'Geral' },
  ]

  async function handleGenerateWeek() {
    if (generating) return
    setGenerating(true)
    setGenerateMsg({ type: 'info', text: 'Gerando análises... isso pode levar até 2 minutos.' })
    try {
      const endDate = new Date(week.start)
      endDate.setDate(endDate.getDate() + 6)
      const { data, error } = await supabase.functions.invoke('ia-weekly-analysis', {
        body: {
          start_date: week.startDate,
          end_date: endDate.toISOString().slice(0, 10),
        },
      })
      if (error) throw error
      const result = data as { processed?: number; skipped?: number; errors?: number }
      if ((result?.errors ?? 0) > 0 && (result?.processed ?? 0) === 0) {
        setGenerateMsg({ type: 'error', text: `Falha: ${result.errors} erro(s). Veja os logs da função.` })
      } else {
        setGenerateMsg({
          type: 'success',
          text: `${result?.processed ?? 0} análise(s) gerada(s), ${result?.skipped ?? 0} ignorada(s).`,
        })
      }
      queryClient.invalidateQueries({ queryKey: ['chat', 'unified-weekly'] })
      queryClient.invalidateQueries({ queryKey: ['chat', 'ai-weekly-latest'] })
      queryClient.invalidateQueries({ queryKey: ['chat', 'period-reports'] })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isTimeout = /timeout|idle/i.test(msg)
      setGenerateMsg({
        type: isTimeout ? 'info' : 'error',
        text: isTimeout
          ? 'Função ainda processando em segundo plano. Recarregue em 1 minuto.'
          : `Erro: ${msg}`,
      })
    } finally {
      setGenerating(false)
      setTimeout(() => setGenerateMsg(null), 8000)
    }
  }

  return (
    <div className="space-y-4 p-3 sm:p-4 lg:p-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <PageHeader
          title="Relatório de Clientes"
          description="Métricas e análise sentimental por estrategista e cliente."
        />
        {/* Abas de período — apenas admin/gerente */}
        {!isEstrategista && (
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            {PERIODO_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => { setPeriodoTipo(t.key); setFilterEst(null) }}
                className={cn(
                  'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                  periodoTipo === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Seletor de período */}
      {activePeriodo === 'semanal' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={selectedWeek}
            onChange={e => setSelectedWeek(Number(e.target.value))}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {weeks.map((w, i) => <option key={i} value={i}>{w.label}</option>)}
          </select>
          {!isEstrategista && (
            <button
              onClick={handleGenerateWeek}
              disabled={generating}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60',
              )}
              title="Roda a análise IA para a semana selecionada (idempotente — pula clientes já analisados)"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {generating ? 'Gerando...' : 'Gerar análise da semana'}
            </button>
          )}
          {generateMsg && (
            <span
              className={cn(
                'text-xs',
                generateMsg.type === 'success' && 'text-emerald-600 dark:text-emerald-400',
                generateMsg.type === 'error' && 'text-red-600 dark:text-red-400',
                generateMsg.type === 'info' && 'text-muted-foreground',
              )}
            >
              {generateMsg.text}
            </span>
          )}
        </div>
      )}
      {activePeriodo === 'mensal' && (
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(Number(e.target.value))}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {months.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
        </select>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : groups.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={FileBarChart}
            title="Sem dados neste período"
            description="Nenhuma análise gerada ou conversa encontrada no período selecionado."
          />
          {activePeriodo === 'semanal' && latestIdx > 0 && (
            <div className="flex justify-center">
              <button
                onClick={() => setSelectedWeek(latestIdx)}
                className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Ver semana de {weeks[latestIdx]?.label}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* KPI row */}
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Clientes ativos" value={kpis.total} icon={Users} />
            <KpiCard
              label="Score médio"
              value={kpis.avgScore}
              icon={TrendingUp}
              variant={scoreVariant(kpis.avgScore)}
              sublabel={activePeriodo === 'semanal' && historicalScore != null ? `Histórico: ${historicalScore}` : undefined}
            />
            <KpiCard label="Em risco" value={kpis.risco} icon={AlertTriangle} variant={kpis.risco > 0 ? 'danger' : 'success'} />
            <KpiCard
              label="Análises Sentimentais"
              value={kpis.withAI}
              icon={Sparkles}
              variant={kpis.withAI > 0 ? 'default' : 'warning'}
            />
          </div>

          {/* Filtro de estrategista + CSV — oculto para o próprio estrategista */}
          {!isEstrategista && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium shrink-0">Estrategista:</span>
              <button
                onClick={() => setFilterEst(null)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  filterEst === null ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                Todos
              </button>
              {estrategistaOptions.map(e => (
                <button
                  key={e.id ?? 'sem'}
                  onClick={() => setFilterEst(e.id)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    filterEst === e.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  {e.nome}
                </button>
              ))}
              <button
                onClick={() => exportCsv(visibleGroups, periodoLabel)}
                className="ml-auto flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> CSV Completo
              </button>
            </div>
          )}

          {/* Filtros de status + ordenação */}
          {!isEstrategista && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium shrink-0">Filtrar:</span>
              {([
                { key: 'todos', label: 'Todos', icon: Users },
                { key: 'risco', label: 'Em risco', icon: AlertTriangle },
                { key: 'baixo', label: 'Score baixo', icon: TrendingDown },
                { key: 'execucao_baixa', label: 'Pouco executando', icon: XCircle },
                { key: 'clareza_baixa', label: 'Clareza baixa', icon: Sparkles },
                { key: 'sem_analise', label: 'Sem análise', icon: Meh },
              ] as const).map(f => {
                const Icon = f.icon
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilterFlag(f.key)}
                    className={cn(
                      'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      filterFlag === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3 w-3" />{f.label}
                  </button>
                )
              })}
              <span className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Ordenar:</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as typeof sortBy)}
                  className="rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="score_asc">Score: pior primeiro</option>
                  <option value="score_desc">Score: melhor primeiro</option>
                  <option value="nome">Nome (A-Z)</option>
                </select>
              </span>
            </div>
          )}

          {/* Groups */}
          <div className="space-y-6">
            {visibleGroups.map(g => (
              <EstrategistaSection key={g.id ?? 'sem'} group={g} />
            ))}
          </div>

          {/* Footer */}
          <p className="text-xs text-muted-foreground text-right">
            Período: {periodFooter}
          </p>
        </div>
      )}
    </div>
  )
}
