import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Espelha o estado normalizado das entregas vindas do projeto cami-plataforma-lb (content_cards).
// A edge function `cami-deliveries` ainda não existe — quando for implementada, este hook
// passa a retornar dados reais sem mudança no front. Hoje retorna lista vazia.

export type CamiDeliveryStatus = 'nao_iniciada' | 'revisao' | 'alteracao' | 'aprovado' | 'arquivado'
export type CamiDeliveryStage = 'roteiro' | 'edicao' | null

export interface CamiDelivery {
  id: string
  content_id: string | null
  client_id: string | null            // resolvido no servidor (workspace cami → client omnx)
  client_nome: string | null
  workspace_name: string | null
  title: string
  description: string | null
  channel: string | null              // instagram | linkedin | youtube | tiktok | ...
  final_format: string | null         // reel | carousel | post | story | ...
  status: CamiDeliveryStatus
  stage: CamiDeliveryStage
  responsible: string | null
  responsible_party: string | null    // consultant | client | team
  scriptwriter: string | null
  editor_name: string | null
  designer: string | null
  poster_name: string | null
  script_deadline: string | null
  edit_deadline: string | null
  production_date: string | null
  publish_date: string | null
  client_deadline_at: string | null
  destination_profiles: string[]
  labels: string[]
  publish_url: string | null
  source_file_url: string | null
  internal_notes: string | null
  delivered_at: string | null
  client_approved_at: string | null
  roteiro_approved_at: string | null
  consultant_submitted_at: string | null
  created_at: string
  updated_at: string
  // Avaliação do cliente (content_approvals do cami)
  rating: number | null              // 1-5; null se não avaliado ou auto-aprovado
  rating_notes: string | null        // comentário livre do cliente
  rating_at: string | null           // timestamp da avaliação (client_action_at)
  auto_approved: boolean             // true = aprovação automática por timeout (não conta na média)
  // Quem é o estrategista responsável (mapeado server-side de content_cards.created_by)
  estrategista_user_id: string | null
  estrategista_nome: string | null
}

export const CAMI_STATUS_LABEL: Record<CamiDeliveryStatus, string> = {
  nao_iniciada: 'Não iniciada',
  revisao: 'Revisão',
  alteracao: 'Alteração',
  aprovado: 'Aprovado',
  arquivado: 'Arquivado',
}

export const CAMI_STATUS_TONE: Record<CamiDeliveryStatus, string> = {
  nao_iniciada: 'bg-muted text-muted-foreground',
  revisao: 'bg-warning/15 text-warning',
  alteracao: 'bg-orange-500/15 text-orange-600',
  aprovado: 'bg-success/15 text-success',
  arquivado: 'bg-muted/60 text-muted-foreground',
}

/** Indica se a integração com cami-plataforma-lb está ativa. */
export function isCamiIntegrationReady(): boolean {
  // Ativa quando a edge function `cami-deliveries` estiver deployada e os secrets
  // CAMI_SUPABASE_URL e CAMI_SERVICE_ROLE_KEY estiverem configurados no painel.
  return true
}

interface CamiDeliveriesResponse {
  deliveries: CamiDelivery[]
  unmappedWorkspaces?: string[]   // workspaces sem cliente correspondente no omnx
  fetchedAt: string
}

interface UseCamiDeliveriesOptions {
  /** Filtra por client_id do omnx. Se omitido, traz todas as visíveis pro usuário. */
  clientId?: string
  /** Filtra por status. */
  status?: CamiDeliveryStatus[]
  /** Inclui arquivadas? Default: false */
  includeArchived?: boolean
}

export function useCamiDeliveries(opts: UseCamiDeliveriesOptions = {}) {
  return useQuery({
    queryKey: ['cami-deliveries', opts] as const,
    queryFn: async (): Promise<CamiDeliveriesResponse> => {
      if (!isCamiIntegrationReady()) {
        return { deliveries: [], fetchedAt: new Date().toISOString() }
      }
      const { data, error } = await supabase.functions.invoke<CamiDeliveriesResponse>('cami-deliveries', {
        body: opts,
      })
      if (error) throw error
      return data ?? { deliveries: [], fetchedAt: new Date().toISOString() }
    },
    staleTime: 5 * 60 * 1000,
    enabled: isCamiIntegrationReady(),  // pula a chamada quando integração desligada
  })
}

/** Métricas agregadas pra usar no dashboard. */
export interface CamiDeliveryStats {
  total: number
  emProducao: number       // nao_iniciada + revisao + alteracao
  emRevisao: number        // revisao + alteracao
  aprovadas: number
  atrasadas: number        // pendente + prazo passado
  aguardandoAprovacao: number  // status=revisao com responsible_party=client
  avgRating: number | null     // média 1-5 ignorando auto_approved (null se sem dados)
  ratedCount: number           // quantas entregas têm rating válido (não auto-aprovadas)
}

export function computeCamiStats(list: CamiDelivery[]): CamiDeliveryStats {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()
  const PEND: CamiDeliveryStatus[] = ['nao_iniciada', 'revisao', 'alteracao']
  const stats: CamiDeliveryStats = {
    total: 0, emProducao: 0, emRevisao: 0, aprovadas: 0, atrasadas: 0, aguardandoAprovacao: 0,
    avgRating: null, ratedCount: 0,
  }
  let ratingSum = 0
  for (const d of list) {
    stats.total++
    if (PEND.includes(d.status)) stats.emProducao++
    if (d.status === 'revisao' || d.status === 'alteracao') stats.emRevisao++
    if (d.status === 'aprovado') stats.aprovadas++
    if (d.status === 'revisao' && d.responsible_party === 'client') stats.aguardandoAprovacao++

    const prazoStr = d.client_deadline_at ?? d.publish_date ?? d.edit_deadline ?? d.script_deadline
    if (PEND.includes(d.status) && prazoStr && new Date(prazoStr).getTime() < todayMs) {
      stats.atrasadas++
    }

    if (!d.auto_approved && d.rating != null) {
      ratingSum += d.rating
      stats.ratedCount++
    }
  }
  if (stats.ratedCount > 0) stats.avgRating = ratingSum / stats.ratedCount
  return stats
}

/** Converte média 1-5 → score 0-100 (linear: 5★ = 100, 4★ = 80, …). Mín. 3 avaliações. */
export function ratingToScore(avgRating: number | null, ratedCount: number, minRatings = 3): number | null {
  if (avgRating == null || ratedCount < minRatings) return null
  return Math.round((avgRating / 5) * 100)
}
