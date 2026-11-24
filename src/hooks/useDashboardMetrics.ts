import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { podeNoBanco } from '@/lib/permissaoRemota'
import { startOfWeek } from '@/hooks/useInstagramStats'
import { isCamiIntegrationReady, ratingToScore, type CamiDelivery } from '@/hooks/useCamiDeliveries'

export interface DashboardKpis {
  clientesAtivos: number
  clientesAtivosComIg: number
  clientesAtivosSemIg: number
  postsThisWeek: number
  followersDeltaWeek: number
  criticos: number
}

export interface CriticoClient {
  id: string
  nome: string
  daysWithoutPost: number
  username: string | null
  followers: number | null
  estrategistas: string[]
  whatsapp: string | null
}

export interface EstrategistaStats {
  user_id: string
  nome: string
  totalClientes: number
  criticos: number
  semIg: number
  diasMediaSemPostar: number | null

  /** Score consolidado (Geral) — média ponderada das dimensões disponíveis. */
  score: number

  /** Score 0-100 da saúde de redes sociais (já considera %crítico, %sem-IG, dias médios). null se sem dados. */
  scoreRedes: number | null
  /** Score 0-100 do NPS dos clientes vinculados. null se sem respostas. */
  scoreNps: number | null
  /** Score 0-100 das entregas. null se integração não estiver ativa. */
  scoreEntregas: number | null
  /** Score 0-100 baseado em % de análises positivas no relatório sentimental. null se sem dados. */
  scoreSentimental: number | null

  /** Métricas auxiliares pra exibir no card. */
  npsScoreRaw: number | null
  npsRespostas: number
  sentimentPositivo: number
  sentimentTotal: number
  /** Média de estrelas (1-5) das avaliações cami; null se sem avaliações. */
  camiRating: number | null
  /** Quantas entregas avaliadas no cami (excluindo auto-aprovadas). */
  camiRatedCount: number
  /** Total de entregas do cami atribuídas a este estrategista. */
  camiEntregasTotal: number

  /** Histórico das últimas 8 semanas — número de clientes críticos por semana. */
  criticosHistory: number[]
}

const SCORE_WEIGHTS = { redes: 0.4, sentimental: 0.3, nps: 0.2, entregas: 0.1 } as const

/** Score 0-100 de saúde da carteira (redes sociais). */
function computeRedesScore(criticos: number, semIg: number, total: number, avgDays: number | null): number {
  if (total === 0) return 100
  const critPct = (criticos / total) * 100
  const semIgPct = (semIg / total) * 100
  const diasPenalty = avgDays == null ? 0 : Math.min(avgDays, 30) / 30 * 100
  const penaltyTotal = 0.5 * critPct + 0.25 * semIgPct + 0.25 * diasPenalty
  return Math.max(0, Math.round(100 - penaltyTotal))
}

/** NPS-100..+100 → 0..100 (somente se tiver respostas). */
function npsScoreToScore(npsScore: number | null): number | null {
  if (npsScore == null) return null
  return Math.max(0, Math.round((npsScore + 100) / 2))
}

/** Combina scores das 4 dimensões em um overall, ignorando nulls e redistribuindo pesos. */
function computeOverall(scores: { redes: number | null; sentimental: number | null; nps: number | null; entregas: number | null }): number {
  const dims = [
    { key: 'redes',       value: scores.redes,       weight: SCORE_WEIGHTS.redes },
    { key: 'sentimental', value: scores.sentimental, weight: SCORE_WEIGHTS.sentimental },
    { key: 'nps',         value: scores.nps,         weight: SCORE_WEIGHTS.nps },
    { key: 'entregas',    value: scores.entregas,    weight: SCORE_WEIGHTS.entregas },
  ]
  const valid = dims.filter(d => d.value != null) as Array<{ key: string; value: number; weight: number }>
  if (valid.length === 0) return 100
  const totalWeight = valid.reduce((a, d) => a + d.weight, 0)
  const weighted = valid.reduce((a, d) => a + d.value * (d.weight / totalWeight), 0)
  return Math.round(weighted)
}

export interface DeliveryStats {
  total: number
  pendentes: number
  atrasadas: number
  aguardandoAprovacao: number
  aprovadas: number
  recentes: Array<{
    id: string
    titulo: string
    status: string
    prazo: string | null
    diasParaPrazo: number | null
    cliente: string
    responsavel: string | null
    atrasada: boolean
  }>
}

export interface SentimentSummary {
  semana: string
  total: number
  positivo: number
  neutro: number
  negativo: number
  estrategistas: number
  alertas: string[]
  proximos_passos: string[]
}

interface SnapshotRow {
  client_id: string
  followers: number | null
  last_post_at: string | null
  username: string | null
  fetched_at: string
}

export function useDashboardData() {
  return useQuery({
    queryKey: ['dashboard-data'] as const,
    queryFn: async () => {
      // 1. Pega usuário atual + perfil
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('Não autenticado')
      const { data: profile, error: profileError } = await supabase.from('users').select('id, nome, perfil').eq('id', user.id).single()
      if (profileError) throw profileError
      if (!profile) throw new Error('Não foi possível consultar seu perfil.')
      // Mesma pergunta das outras telas: vê a carteira inteira ou só a sua?
      // Vem da matriz (has_permissao), com o gate antigo como fallback.
      const isAdmin = await podeNoBanco(
        'clientes.carteira',
        'ver',
        profile?.perfil === 'admin' || profile?.perfil === 'gerente',
      )

      // 2. Pega clientes (filtra por assignment se não for admin)
      let clientsQuery = supabase.from('clients').select('id, nome, instagram, ativo')
      if (!isAdmin) {
        const { data: assignments, error: assignmentsError } = await supabase
          .from('client_assignments')
          .select('client_id')
          .eq('user_id', user.id)
          .eq('ativo', true)
        if (assignmentsError) throw assignmentsError
        const ids = (assignments ?? []).map(a => a.client_id)
        if (ids.length === 0) {
          return {
            isAdmin, profile, kpis: { clientesAtivos: 0, clientesAtivosComIg: 0, clientesAtivosSemIg: 0, postsThisWeek: 0, followersDeltaWeek: 0, criticos: 0 },
            criticos: [] as CriticoClient[], semIgList: [] as Array<{ id: string; nome: string; estrategistas: string[] }>,
            estrategistas: [] as EstrategistaStats[], sentiment: null as SentimentSummary | null,
            sentimentReports: [] as Array<{ id: string; client_nome: string; estrategista_nome: string; resumo: string; sentimento_geral: string; alertas: string[]; como_lidar: string[]; proximos_passos: string[] }>,
            deliveryStats: { total: 0, pendentes: 0, atrasadas: 0, aguardandoAprovacao: 0, aprovadas: 0, recentes: [] } as DeliveryStats,
          }
        }
        clientsQuery = clientsQuery.in('id', ids)
      }
      const { data: clients, error: clientsError } = await clientsQuery
      if (clientsError) throw clientsError
      const clientsList = (clients ?? []) as Array<{ id: string; nome: string; instagram: string | null; ativo: boolean }>
      const ativos = clientsList.filter(c => c.ativo)

      // Normaliza handle
      const hasIg = (s: string | null) => {
        if (!s) return false
        const t = s.trim().replace(/^@+/, '')
        return t.length > 0
      }
      const ativosComIg = ativos.filter(c => hasIg(c.instagram))
      const ativosSemIg = ativos.filter(c => !hasIg(c.instagram))

      // 3. Snapshots da semana corrente + atual (último por cliente)
      const ativoIds = ativos.map(c => c.id)
      const lastSnapshots = new Map<string, SnapshotRow>()
      const weekBaselineByClient = new Map<string, number>()
      const weekStart = startOfWeek().getTime()
      if (ativoIds.length > 0) {
        const { data: snaps, error: snapsError } = await supabase
          .from('social_snapshots')
          .select('client_id, followers, last_post_at, username, fetched_at')
          .eq('platform', 'instagram')
          .in('client_id', ativoIds)
          .order('fetched_at', { ascending: false })
        if (snapsError) throw snapsError
        for (const s of (snaps ?? []) as SnapshotRow[]) {
          if (!lastSnapshots.has(s.client_id)) lastSnapshots.set(s.client_id, s)
        }
        // baseline da semana = primeiro snapshot >= startOfWeek
        const sortedAsc = [...((snaps ?? []) as SnapshotRow[])].sort((a, b) => new Date(a.fetched_at).getTime() - new Date(b.fetched_at).getTime())
        for (const s of sortedAsc) {
          if (new Date(s.fetched_at).getTime() < weekStart) continue
          if (s.followers != null && !weekBaselineByClient.has(s.client_id)) {
            weekBaselineByClient.set(s.client_id, s.followers)
          }
        }
      }

      // 4. Computa KPIs
      const now = Date.now()
      let postsThisWeek = 0
      let followersDeltaWeek = 0
      const criticos: CriticoClient[] = []

      for (const c of ativos) {
        const snap = lastSnapshots.get(c.id)
        if (!snap) continue
        // Crítico: > 14 dias sem postar
        if (snap.last_post_at) {
          const days = Math.floor((now - new Date(snap.last_post_at).getTime()) / 86400000)
          if (days > 14) {
            criticos.push({
              id: c.id, nome: c.nome, daysWithoutPost: days,
              username: snap.username, followers: snap.followers,
              estrategistas: [], whatsapp: null,
            })
          }
        }
        // Followers delta na semana
        const baseline = weekBaselineByClient.get(c.id)
        if (baseline != null && snap.followers != null) {
          followersDeltaWeek += (snap.followers - baseline)
        }
      }
      criticos.sort((a, b) => b.daysWithoutPost - a.daysWithoutPost)

      // Busca WhatsApp dos críticos via chat_contacts
      if (criticos.length > 0) {
        const criticosIds = criticos.map(c => c.id)
        const { data: contacts, error: contactsError } = await supabase
          .from('chat_contacts')
          .select('client_id, numero_whatsapp')
          .in('client_id', criticosIds)
        if (contactsError) throw contactsError
        const whatsappByClient = new Map<string, string>()
        for (const contact of (contacts ?? []) as Array<{ client_id: string; numero_whatsapp: string }>) {
          if (!whatsappByClient.has(contact.client_id)) {
            whatsappByClient.set(contact.client_id, contact.numero_whatsapp)
          }
        }
        for (const c of criticos) {
          c.whatsapp = whatsappByClient.get(c.id) ?? null
        }
      }

      // Posts da semana — aproximação por last_post_at >= startOfWeek
      for (const c of ativos) {
        const snap = lastSnapshots.get(c.id)
        if (snap?.last_post_at && new Date(snap.last_post_at).getTime() >= weekStart) {
          postsThisWeek++
        }
      }

      // 5. Mapa client → estrategistas (admin) — pra exibir em todas as listas
      const estrategistasByClient = new Map<string, string[]>()
      if (isAdmin) {
        const ativosIds = ativos.map(c => c.id)
        if (ativosIds.length > 0) {
          const { data: allCliAssign, error: allCliAssignError } = await supabase
            .from('client_assignments')
            .select('client_id, users!inner(nome)')
            .eq('tipo', 'estrategista')
            .eq('ativo', true)
            .in('client_id', ativosIds)
          if (allCliAssignError) throw allCliAssignError
          type Row = { client_id: string; users: { nome: string } | null }
          for (const r of (allCliAssign ?? []) as unknown as Row[]) {
            if (!r.users) continue
            const arr = estrategistasByClient.get(r.client_id) ?? []
            arr.push(r.users.nome)
            estrategistasByClient.set(r.client_id, arr)
          }
        }
      }

      // Estrategistas: lista de assignments + users pra performance (admin)
      let estrategistas: EstrategistaStats[] = []

      // Carrega NPS responses agrupadas por client (todos os clientes ativos)
      // E sentimental reports agrupados por estrategista_id
      const npsByClient = new Map<string, Array<{ nota: number }>>()
      const sentimentByEstrategista = new Map<string, {
        positivo: number; total: number;
        iaScoreSum: number; iaScoreCount: number;
        riscoAlto: number; qualidadeSum: number; qualidadeCount: number;
        clarezaAlta: number; execucaoAlta: number;
      }>()
      if (isAdmin) {
        // NPS: nps_responses → nps_surveys.client_id
        const { data: npsData, error: npsError } = await supabase
          .from('nps_responses')
          .select('nota, nps_surveys!inner(client_id)')
        if (npsError) throw npsError
        type NpsRow = { nota: number; nps_surveys: { client_id: string } | null }
        for (const r of (npsData ?? []) as unknown as NpsRow[]) {
          if (!r.nps_surveys?.client_id) continue
          const arr = npsByClient.get(r.nps_surveys.client_id) ?? []
          arr.push({ nota: r.nota })
          npsByClient.set(r.nps_surveys.client_id, arr)
        }

        // Sentimental: weekly_reports por estrategista (últimas 4 semanas)
        const fourWeeksAgo = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10)
        const { data: sentData, error: sentimentError } = await supabase
          .from('chat_weekly_reports')
          .select('estrategista_id, sentimento_geral, ia_score, risco_abandono, qualidade_consultoria_estrategista, clareza_posicionamento, nivel_execucao')
          .gte('semana_inicio', fourWeeksAgo)
        if (sentimentError) throw sentimentError
        type SentRow = {
          estrategista_id: string | null
          sentimento_geral: string | null
          ia_score: number | null
          risco_abandono: string | null
          qualidade_consultoria_estrategista: number | null
          clareza_posicionamento: string | null
          nivel_execucao: string | null
        }
        for (const r of (sentData ?? []) as SentRow[]) {
          if (!r.estrategista_id) continue
          const stats = sentimentByEstrategista.get(r.estrategista_id) ?? {
            positivo: 0, total: 0,
            iaScoreSum: 0, iaScoreCount: 0,
            riscoAlto: 0, qualidadeSum: 0, qualidadeCount: 0,
            clarezaAlta: 0, execucaoAlta: 0,
          }
          stats.total++
          if (r.sentimento_geral === 'positivo') stats.positivo++
          if (r.ia_score != null) { stats.iaScoreSum += r.ia_score; stats.iaScoreCount++ }
          if (r.risco_abandono === 'alto') stats.riscoAlto++
          if (r.qualidade_consultoria_estrategista != null) {
            stats.qualidadeSum += r.qualidade_consultoria_estrategista
            stats.qualidadeCount++
          }
          if (r.clareza_posicionamento === 'alta') stats.clarezaAlta++
          if (r.nivel_execucao === 'alto') stats.execucaoAlta++
          sentimentByEstrategista.set(r.estrategista_id, stats)
        }
      }

      // Avaliações cami (content_approvals) por estrategista — só roda se integração estiver ativa
      const camiRatingByEstrategista = new Map<string, { sum: number; count: number; total: number }>()
      if (isAdmin && isCamiIntegrationReady()) {
        try {
          const { data: camiData } = await supabase.functions.invoke<{ deliveries: CamiDelivery[] }>('cami-deliveries', {
            body: { includeArchived: true },
          })
          for (const d of camiData?.deliveries ?? []) {
            if (!d.estrategista_user_id) continue
            const agg = camiRatingByEstrategista.get(d.estrategista_user_id) ?? { sum: 0, count: 0, total: 0 }
            agg.total++
            if (!d.auto_approved && d.rating != null) {
              agg.sum += d.rating
              agg.count++
            }
            camiRatingByEstrategista.set(d.estrategista_user_id, agg)
          }
        } catch {
          // Função ainda não existe ou falhou — segue sem score de entregas
        }
      }
      if (isAdmin) {
        const { data: allAssign, error: allAssignError } = await supabase
          .from('client_assignments')
          .select('user_id, client_id, tipo, ativo, users!inner(id, nome, perfil)')
          .eq('tipo', 'estrategista')
          .eq('ativo', true)
        if (allAssignError) throw allAssignError
        type AssignRow = { user_id: string; client_id: string; users: { id: string; nome: string; perfil: string } | null }
        const byUser = new Map<string, { user_id: string; nome: string; clients: string[] }>()
        for (const a of (allAssign ?? []) as unknown as AssignRow[]) {
          if (!a.users) continue
          const b = byUser.get(a.user_id) ?? { user_id: a.user_id, nome: a.users.nome, clients: [] }
          b.clients.push(a.client_id)
          byUser.set(a.user_id, b)
        }
        // Carrega histórico de snapshots (últimas 8 semanas) pra computar evolução
        const historySinceMs = now - 8 * 7 * 86400000
        const historicalSnaps = new Map<string, Array<{ last_post_at: string | null; fetched_at: string }>>()
        const allClientIds = Array.from(byUser.values()).flatMap(u => u.clients)
        if (allClientIds.length > 0) {
          const { data: hSnaps, error: historyError } = await supabase
            .from('social_snapshots')
            .select('client_id, last_post_at, fetched_at')
            .eq('platform', 'instagram')
            .in('client_id', allClientIds)
            .gte('fetched_at', new Date(historySinceMs).toISOString())
            .order('fetched_at', { ascending: false })
          if (historyError) throw historyError
          for (const r of (hSnaps ?? []) as Array<{ client_id: string; last_post_at: string | null; fetched_at: string }>) {
            const arr = historicalSnaps.get(r.client_id) ?? []
            arr.push(r)
            historicalSnaps.set(r.client_id, arr)
          }
        }

        for (const u of byUser.values()) {
          const cliList = u.clients
          let critCount = 0
          let semIgCount = 0
          let totalDays = 0
          let withDays = 0
          for (const cid of cliList) {
            const cliInfo = clientsList.find(c => c.id === cid)
            if (!cliInfo?.ativo) continue
            if (!hasIg(cliInfo.instagram)) semIgCount++
            const snap = lastSnapshots.get(cid)
            if (snap?.last_post_at) {
              const d = Math.floor((now - new Date(snap.last_post_at).getTime()) / 86400000)
              if (d > 14) critCount++
              totalDays += d
              withDays++
            }
          }

          // Histórico de críticos por semana (últimas 8 semanas)
          const criticosHistory: number[] = []
          for (let weeksBack = 7; weeksBack >= 0; weeksBack--) {
            const refMs = now - weeksBack * 7 * 86400000
            let weekCriticos = 0
            for (const cid of cliList) {
              const arr = historicalSnaps.get(cid) ?? []
              // pega snapshot mais recente FETCHED até refMs
              const ref = arr.find(s => new Date(s.fetched_at).getTime() <= refMs)
              if (ref?.last_post_at) {
                const days = (refMs - new Date(ref.last_post_at).getTime()) / 86400000
                if (days > 14) weekCriticos++
              }
            }
            criticosHistory.push(weekCriticos)
          }

          const avgDays = withDays > 0 ? Math.round(totalDays / withDays) : null

          // Score Redes
          const scoreRedes = computeRedesScore(critCount, semIgCount, cliList.length, avgDays)

          // Score NPS — agrega notas dos clientes vinculados
          let npsScoreRaw: number | null = null
          let npsRespostas = 0
          {
            const allNotas: number[] = []
            for (const cid of cliList) {
              const arr = npsByClient.get(cid)
              if (arr) for (const r of arr) allNotas.push(r.nota)
            }
            if (allNotas.length > 0) {
              const promot = allNotas.filter(n => n >= 9).length
              const detrat = allNotas.filter(n => n <= 6).length
              npsScoreRaw = Math.round(((promot - detrat) / allNotas.length) * 100)
              npsRespostas = allNotas.length
            }
          }
          const scoreNps = npsScoreToScore(npsScoreRaw)

          // Score Sentimental — agora usa ia_score (leitura qualitativa da consultoria de marca)
          // como sinal primário, com fallback para taxa de sentimento positivo quando não há ia_score.
          // Penaliza risco de abandono alto e bonifica qualidade da consultoria.
          const sentStats = sentimentByEstrategista.get(u.user_id)
          const sentimentPositivo = sentStats?.positivo ?? 0
          const sentimentTotal = sentStats?.total ?? 0
          let scoreSentimental: number | null = null
          if (sentStats && sentStats.total > 0) {
            // Base: ia_score médio quando disponível, senão % positivo
            let base: number
            if (sentStats.iaScoreCount > 0) {
              base = sentStats.iaScoreSum / sentStats.iaScoreCount
            } else {
              base = (sentStats.positivo / sentStats.total) * 100
            }
            // Penalidade por risco de abandono alto (até -20)
            const riscoPct = sentStats.riscoAlto / sentStats.total
            base -= riscoPct * 20
            // Bônus por qualidade da consultoria (média 1-5 → ajuste -8..+8)
            if (sentStats.qualidadeCount > 0) {
              const avgQual = sentStats.qualidadeSum / sentStats.qualidadeCount
              base += (avgQual - 3) * 4
            }
            // Bônus pequeno por clareza/execução altas
            const clarezaPct = sentStats.clarezaAlta / sentStats.total
            const execucaoPct = sentStats.execucaoAlta / sentStats.total
            base += clarezaPct * 5 + execucaoPct * 8
            scoreSentimental = Math.max(0, Math.min(100, Math.round(base)))
          }

          // Score Entregas — derivado das avaliações cami (content_approvals)
          const camiAgg = camiRatingByEstrategista.get(u.user_id)
          const camiRating = camiAgg && camiAgg.count > 0 ? camiAgg.sum / camiAgg.count : null
          const camiRatedCount = camiAgg?.count ?? 0
          const camiEntregasTotal = camiAgg?.total ?? 0
          const scoreEntregas: number | null = camiRating != null
            ? ratingToScore(camiRating, camiRatedCount)
            : null

          const overall = computeOverall({
            redes: scoreRedes,
            sentimental: scoreSentimental,
            nps: scoreNps,
            entregas: scoreEntregas,
          })

          estrategistas.push({
            user_id: u.user_id, nome: u.nome,
            totalClientes: cliList.length, criticos: critCount, semIg: semIgCount,
            diasMediaSemPostar: avgDays,
            score: overall,
            scoreRedes,
            scoreNps,
            scoreEntregas,
            scoreSentimental,
            npsScoreRaw,
            npsRespostas,
            sentimentPositivo,
            sentimentTotal,
            camiRating,
            camiRatedCount,
            camiEntregasTotal,
            criticosHistory,
          })
        }
        // Ordena por score (melhores primeiro)
        estrategistas.sort((a, b) => b.score - a.score)
      }

      // 6. Hidrata estrategistas em cada crítico (admin) usando o mapa
      if (isAdmin) {
        for (const c of criticos) {
          const list = estrategistasByClient.get(c.id) ?? []
          c.estrategistas = list
        }
      }

      // 7. Entregas: pendentes/atrasadas relevantes
      const ativosIdsList = ativos.map(c => c.id)
      const PENDENTES = ['rascunho', 'aguardando_aprovacao', 'em_revisao'] as const
      let deliveryStats: DeliveryStats = {
        total: 0, pendentes: 0, atrasadas: 0, aguardandoAprovacao: 0, aprovadas: 0, recentes: [],
      }
      if (ativosIdsList.length > 0) {
        let q = supabase
          .from('deliveries')
          .select('id, titulo, status, prazo, responsavel_id, client_id')
          .in('client_id', ativosIdsList)
          .order('prazo', { ascending: true, nullsFirst: false })
          .limit(200)
        // Estrategista: mostra entregas onde ele é responsável OU cliente está sob ele (já filtrado no client_id)
        if (!isAdmin) q = q.or(`responsavel_id.eq.${user.id}`)
        const { data: deliv, error: deliveriesError } = await q
        if (deliveriesError) throw deliveriesError
        const list = (deliv ?? []) as Array<{ id: string; titulo: string; status: string; prazo: string | null; responsavel_id: string | null; client_id: string }>

        const today = new Date(); today.setHours(0, 0, 0, 0)
        const todayMs = today.getTime()

        // Coleta IDs de responsáveis pra resolver nomes
        const respIds = Array.from(new Set(list.map(d => d.responsavel_id).filter(Boolean) as string[]))
        const respMap = new Map<string, string>()
        if (respIds.length > 0) {
          const { data: respUsers, error: usersError } = await supabase.from('users').select('id, nome').in('id', respIds)
          if (usersError) throw usersError
          for (const u of (respUsers ?? []) as Array<{ id: string; nome: string }>) respMap.set(u.id, u.nome)
        }
        const clientNameMap = new Map(clientsList.map(c => [c.id, c.nome.replace(/\s*\[MERGED\]\s*/gi, '')]))

        for (const d of list) {
          deliveryStats.total++
          const isPending = (PENDENTES as readonly string[]).includes(d.status)
          if (isPending) deliveryStats.pendentes++
          if (d.status === 'aguardando_aprovacao') deliveryStats.aguardandoAprovacao++
          if (d.status === 'aprovado') deliveryStats.aprovadas++
          if (d.prazo) {
            const prazoMs = new Date(d.prazo).getTime()
            if (isPending && prazoMs < todayMs) {
              deliveryStats.atrasadas++
            }
          }
        }

        // Recentes: prioriza atrasadas → aguardando_aprovacao → mais próximas do prazo
        const sorted = [...list].sort((a, b) => {
          const aPend = (PENDENTES as readonly string[]).includes(a.status)
          const bPend = (PENDENTES as readonly string[]).includes(b.status)
          const aAtras = aPend && a.prazo ? new Date(a.prazo).getTime() < todayMs : false
          const bAtras = bPend && b.prazo ? new Date(b.prazo).getTime() < todayMs : false
          if (aAtras !== bAtras) return aAtras ? -1 : 1
          if (aPend !== bPend) return aPend ? -1 : 1
          if (a.prazo && b.prazo) return new Date(a.prazo).getTime() - new Date(b.prazo).getTime()
          if (a.prazo) return -1
          if (b.prazo) return 1
          return 0
        })
        deliveryStats.recentes = sorted.slice(0, 8).map(d => {
          const isPending = (PENDENTES as readonly string[]).includes(d.status)
          let diasParaPrazo: number | null = null
          let atrasada = false
          if (d.prazo) {
            const prazoMs = new Date(d.prazo).getTime()
            diasParaPrazo = Math.floor((prazoMs - todayMs) / 86400000)
            if (isPending && prazoMs < todayMs) atrasada = true
          }
          return {
            id: d.id,
            titulo: d.titulo,
            status: d.status,
            prazo: d.prazo,
            diasParaPrazo,
            cliente: clientNameMap.get(d.client_id) ?? '—',
            responsavel: d.responsavel_id ? respMap.get(d.responsavel_id) ?? null : null,
            atrasada,
          }
        })
      }

      // 8. Sentimento: relatórios da última semana
      const { data: weeklyAll, error: weeklyError } = await supabase
        .from('chat_weekly_reports')
        .select('id, semana_inicio, sentimento_geral, estrategista_nome, client_nome, resumo, alertas, como_lidar, proximos_passos, estrategista_id')
        .order('semana_inicio', { ascending: false })
        .limit(200)
      if (weeklyError) throw weeklyError

      let sentiment: SentimentSummary | null = null
      let sentimentReports: Array<{ id: string; client_nome: string; estrategista_nome: string; resumo: string; sentimento_geral: string; alertas: string[]; como_lidar: string[]; proximos_passos: string[] }> = []
      if (weeklyAll && weeklyAll.length > 0) {
        let filtered = weeklyAll as unknown as Array<{ id: string; semana_inicio: string; sentimento_geral: string; estrategista_nome: string; client_nome: string; resumo: string; alertas: unknown; como_lidar: unknown; proximos_passos: unknown; estrategista_id: string | null }>
        if (!isAdmin) filtered = filtered.filter(r => r.estrategista_id === user.id)
        if (filtered.length > 0) {
          const latestSemana = filtered[0].semana_inicio
          const semanaData = filtered.filter(r => r.semana_inicio === latestSemana)
          const positivo = semanaData.filter(r => r.sentimento_geral === 'positivo').length
          const neutro = semanaData.filter(r => r.sentimento_geral === 'neutro').length
          const negativo = semanaData.filter(r => r.sentimento_geral === 'negativo').length
          const estrategistasCount = new Set(semanaData.map(r => r.estrategista_nome)).size
          const allAlertas: string[] = []
          const allProx: string[] = []
          for (const r of semanaData) {
            if (Array.isArray(r.alertas)) for (const a of r.alertas) if (typeof a === 'string') allAlertas.push(a)
            if (Array.isArray(r.proximos_passos)) for (const p of r.proximos_passos) if (typeof p === 'string') allProx.push(p)
          }
          sentiment = {
            semana: latestSemana, total: semanaData.length,
            positivo, neutro, negativo, estrategistas: estrategistasCount,
            alertas: allAlertas.slice(0, 5), proximos_passos: allProx.slice(0, 5),
          }

          // Reports detalhados (mais recente até 6)
          sentimentReports = filtered.slice(0, 6).map(r => ({
            id: r.id, client_nome: r.client_nome, estrategista_nome: r.estrategista_nome,
            resumo: r.resumo ?? '', sentimento_geral: r.sentimento_geral ?? '',
            alertas: Array.isArray(r.alertas) ? r.alertas.filter((x): x is string => typeof x === 'string') : [],
            como_lidar: Array.isArray(r.como_lidar) ? r.como_lidar.filter((x): x is string => typeof x === 'string') : [],
            proximos_passos: Array.isArray(r.proximos_passos) ? r.proximos_passos.filter((x): x is string => typeof x === 'string') : [],
          }))
        }
      }

      return {
        isAdmin,
        profile,
        kpis: {
          clientesAtivos: ativos.length,
          clientesAtivosComIg: ativosComIg.length,
          clientesAtivosSemIg: ativosSemIg.length,
          postsThisWeek,
          followersDeltaWeek,
          criticos: criticos.length,
        } as DashboardKpis,
        criticos,
        deliveryStats,
        semIgList: ativosSemIg.map(c => ({
          id: c.id, nome: c.nome,
          estrategistas: estrategistasByClient.get(c.id) ?? [],
        })),
        estrategistas,
        sentiment,
        sentimentReports,
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}
