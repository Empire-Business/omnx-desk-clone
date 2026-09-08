import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type SocialSnapshot = {
  id: string
  client_id: string
  platform: 'instagram'
  username: string
  followers: number | null
  full_name: string | null
  profile_pic_url: string | null
  last_post_at: string | null
  last_post_caption: string | null
  last_post_url: string | null
  raw?: unknown
  fetched_at: string
  created_at: string
}

/** Início da semana corrente (domingo 00:00 horário local). */
export function startOfWeek(now = new Date()): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay()) // 0 = domingo
  return d
}

/** Início da semana anterior. */
export function startOfPrevWeek(now = new Date()): Date {
  const d = startOfWeek(now)
  d.setDate(d.getDate() - 7)
  return d
}

export interface FormatBreakdown { reels: number; carousels: number; images: number }

export interface WeeklyMetrics {
  postsThisWeek: number
  avgEngagementPerPost: number | null
  followersDelta: number | null  // null se não houver baseline da semana
  formatBreakdown: FormatBreakdown
  // Comparativo com semana anterior
  postsDelta: number | null            // posts - postsAnterior
  engagementDeltaPct: number | null    // (atual-ant) / ant * 100
  followersDeltaVsPrev: number | null  // delta de seguidores vs delta da semana anterior
}

interface RawPostNode {
  taken_at_timestamp?: number
  pinned_for_users?: unknown[]
  is_pinned?: boolean
  __typename?: string
  is_video?: boolean
  product_type?: string
  edge_liked_by?: { count?: number }
  edge_media_preview_like?: { count?: number }
  edge_media_to_comment?: { count?: number }
}

function classifyPost(n: RawPostNode): keyof FormatBreakdown {
  // ScrapeCreators: __typename = GraphImage | GraphVideo | GraphSidecar
  // product_type pode ser 'clips' (reels) | 'feed' | 'carousel'
  if (n.product_type === 'clips' || n.__typename === 'GraphVideo') return 'reels'
  if (n.__typename === 'GraphSidecar') return 'carousels'
  return 'images'
}

interface RawShape {
  data?: { user?: { edge_owner_to_timeline_media?: { edges?: Array<{ node?: RawPostNode }> } } }
}

function isPinned(n: RawPostNode): boolean {
  if (n.is_pinned === true) return true
  if (Array.isArray(n.pinned_for_users) && n.pinned_for_users.length > 0) return true
  return false
}

function engOf(n: RawPostNode): number {
  const likes = n.edge_liked_by?.count ?? n.edge_media_preview_like?.count ?? 0
  const comments = n.edge_media_to_comment?.count ?? 0
  return Math.max(likes, 0) + Math.max(comments, 0)
}

export function computeWeeklyMetrics(
  snapshot: SocialSnapshot | undefined,
  weekBaselineFollowers: number | null,
  prevWeekBaselineFollowers: number | null = null,
): WeeklyMetrics {
  const result: WeeklyMetrics = {
    postsThisWeek: 0,
    avgEngagementPerPost: null,
    followersDelta: null,
    formatBreakdown: { reels: 0, carousels: 0, images: 0 },
    postsDelta: null,
    engagementDeltaPct: null,
    followersDeltaVsPrev: null,
  }
  if (!snapshot) return result
  const now = new Date()
  const weekStart = startOfWeek(now).getTime()
  const prevStart = startOfPrevWeek(now).getTime()
  const raw = snapshot.raw as RawShape | undefined
  const edges = raw?.data?.user?.edge_owner_to_timeline_media?.edges ?? []
  const validPosts = edges
    .map(e => e?.node)
    .filter((n): n is RawPostNode => !!n && !isPinned(n) && typeof n.taken_at_timestamp === 'number')

  const weekPosts = validPosts.filter(n => (n.taken_at_timestamp! * 1000) >= weekStart)
  const prevWeekPosts = validPosts.filter(n => {
    const ts = n.taken_at_timestamp! * 1000
    return ts >= prevStart && ts < weekStart
  })

  result.postsThisWeek = weekPosts.length
  for (const p of weekPosts) result.formatBreakdown[classifyPost(p)]++

  if (weekPosts.length > 0) {
    const totalEng = weekPosts.reduce((a, n) => a + engOf(n), 0)
    result.avgEngagementPerPost = Math.round(totalEng / weekPosts.length)
  }

  // Deltas vs semana anterior
  result.postsDelta = result.postsThisWeek - prevWeekPosts.length
  if (prevWeekPosts.length > 0 && weekPosts.length > 0) {
    const prevAvg = prevWeekPosts.reduce((a, n) => a + engOf(n), 0) / prevWeekPosts.length
    if (prevAvg > 0 && result.avgEngagementPerPost != null) {
      result.engagementDeltaPct = Math.round(((result.avgEngagementPerPost - prevAvg) / prevAvg) * 100)
    }
  }

  if (weekBaselineFollowers != null && snapshot.followers != null) {
    result.followersDelta = snapshot.followers - weekBaselineFollowers
    if (prevWeekBaselineFollowers != null) {
      const prevDelta = weekBaselineFollowers - prevWeekBaselineFollowers
      result.followersDeltaVsPrev = result.followersDelta - prevDelta
    }
  }
  return result
}

export interface LastPostStats {
  likes: number | null
  comments: number | null
  thumbnail: string | null
}

export function computeLastPostStats(snapshot: SocialSnapshot | undefined): LastPostStats {
  if (!snapshot?.raw) return { likes: null, comments: null, thumbnail: null }
  type Node = {
    taken_at_timestamp?: number
    is_pinned?: boolean
    pinned_for_users?: unknown[]
    edge_liked_by?: { count?: number }
    edge_media_preview_like?: { count?: number }
    edge_media_to_comment?: { count?: number }
    display_url?: string
    thumbnail_src?: string
  }
  const raw = snapshot.raw as {
    data?: { user?: { edge_owner_to_timeline_media?: { edges?: Array<{ node?: Node }> } } }
  }
  const edges = raw?.data?.user?.edge_owner_to_timeline_media?.edges ?? []
  const nodes = edges
    .map(e => e?.node)
    .filter((n): n is Node =>
      !!n &&
      typeof n.taken_at_timestamp === 'number' &&
      !n.is_pinned &&
      !(n.pinned_for_users?.length),
    )
    .sort((a, b) => (b.taken_at_timestamp ?? 0) - (a.taken_at_timestamp ?? 0))
  const first = nodes[0]
  if (!first) return { likes: null, comments: null, thumbnail: null }
  return {
    likes: first.edge_liked_by?.count ?? first.edge_media_preview_like?.count ?? null,
    comments: first.edge_media_to_comment?.count ?? null,
    thumbnail: first.display_url ?? first.thumbnail_src ?? null,
  }
}

type StatsResponse = {
  snapshot: SocialSnapshot
  cached: boolean
  stale?: boolean
  error?: string
}

async function callInstagramStats(client_id: string, force = false): Promise<StatsResponse> {
  const { data, error } = await supabase.functions.invoke<StatsResponse>('instagram-stats', {
    body: { client_id, force },
  })
  if (error) throw error
  if (!data) throw new Error('Resposta vazia da função')
  return data
}

export const instagramKeys = {
  all: ['instagram-stats'] as const,
  detail: (clientId: string) => ['instagram-stats', clientId] as const,
  overview: () => ['instagram-stats', 'overview'] as const,
}

/** Mapa client_id → followers do snapshot mais antigo dentro da semana ANTERIOR. */
export function usePrevWeeklyBaselineFollowers() {
  return useQuery({
    queryKey: ['instagram-prev-weekly-baseline'] as const,
    queryFn: async () => {
      const prevStart = startOfPrevWeek().toISOString()
      const weekStart = startOfWeek().toISOString()
      const { data, error } = await supabase
        .from('social_snapshots')
        .select('client_id, followers, fetched_at')
        .eq('platform', 'instagram')
        .gte('fetched_at', prevStart)
        .lt('fetched_at', weekStart)
        .order('fetched_at', { ascending: true })
      if (error) throw error
      const m = new Map<string, number>()
      for (const row of (data ?? []) as Array<{ client_id: string; followers: number | null }>) {
        if (row.followers != null && !m.has(row.client_id)) m.set(row.client_id, row.followers)
      }
      return m
    },
    staleTime: 30 * 60 * 1000,
  })
}

/** Mapa client_id → followers do snapshot mais antigo dentro da semana corrente. */
export function useWeeklyBaselineFollowers() {
  return useQuery({
    queryKey: ['instagram-weekly-baseline'] as const,
    queryFn: async () => {
      const weekStart = startOfWeek().toISOString()
      const { data, error } = await supabase
        .from('social_snapshots')
        .select('client_id, followers, fetched_at')
        .eq('platform', 'instagram')
        .gte('fetched_at', weekStart)
        .order('fetched_at', { ascending: true })
      if (error) throw error
      const m = new Map<string, number>()
      for (const row of (data ?? []) as Array<{ client_id: string; followers: number | null }>) {
        if (row.followers != null && !m.has(row.client_id)) m.set(row.client_id, row.followers)
      }
      return m
    },
    staleTime: 30 * 60 * 1000, // 30min
  })
}

/** Latest Instagram snapshot per client (whatever is already cached in DB). */
export function useSocialOverview() {
  return useQuery({
    queryKey: instagramKeys.overview(),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_snapshots')
        .select('*')  // inclui raw — necessário pra computeWeeklyMetrics
        .eq('platform', 'instagram')
        .order('fetched_at', { ascending: false })
      if (error) throw error
      const map = new Map<string, SocialSnapshot>()
      for (const row of (data ?? []) as SocialSnapshot[]) {
        if (!map.has(row.client_id)) map.set(row.client_id, row)
      }
      return Array.from(map.values())
    },
  })
}

/** Versão leve: só client_id + profile_pic_url. Sem campo `raw` — usar em listagens. */
export function useClientAvatars() {
  return useQuery({
    queryKey: ['instagram-avatars'] as const,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_snapshots')
        .select('client_id, profile_pic_url, fetched_at')
        .eq('platform', 'instagram')
        .order('fetched_at', { ascending: false })
      if (error) throw error
      const map = new Map<string, string | null>()
      for (const row of (data ?? []) as Array<{ client_id: string; profile_pic_url: string | null }>) {
        if (!map.has(row.client_id)) map.set(row.client_id, row.profile_pic_url)
      }
      return map
    },
  })
}

/** Contagem atual de seguidores por cliente (último snapshot). Usar pra crescimento ao vivo. */
export function useCurrentFollowers() {
  return useQuery({
    queryKey: ['instagram-followers-current'] as const,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_snapshots')
        .select('client_id, followers, fetched_at, username')
        .eq('platform', 'instagram')
        .order('fetched_at', { ascending: false })
      if (error) throw error
      const map = new Map<string, { followers: number | null; fetchedAt: string; username: string | null }>()
      for (const row of (data ?? []) as Array<{ client_id: string; followers: number | null; fetched_at: string; username: string | null }>) {
        if (!map.has(row.client_id)) {
          map.set(row.client_id, { followers: row.followers, fetchedAt: row.fetched_at, username: row.username })
        }
      }
      return map
    },
  })
}

/** Histórico de seguidores (até 12 semanas atrás) por cliente — pro sparkline. */
export function useFollowersHistory() {
  return useQuery({
    queryKey: ['instagram-followers-history'] as const,
    queryFn: async () => {
      const since = new Date()
      since.setDate(since.getDate() - 84) // 12 semanas
      const { data, error } = await supabase
        .from('social_snapshots')
        .select('client_id, followers, fetched_at')
        .eq('platform', 'instagram')
        .gte('fetched_at', since.toISOString())
        .order('fetched_at', { ascending: true })
      if (error) throw error
      const m = new Map<string, Array<{ followers: number; t: number }>>()
      for (const row of (data ?? []) as Array<{ client_id: string; followers: number | null; fetched_at: string }>) {
        if (row.followers == null) continue
        const arr = m.get(row.client_id) ?? []
        arr.push({ followers: row.followers, t: new Date(row.fetched_at).getTime() })
        m.set(row.client_id, arr)
      }
      return m
    },
    staleTime: 60 * 60 * 1000,
  })
}

/** Calcula streak: nº de semanas consecutivas (incluindo a atual) com pelo menos 1 post não-fixado. */
export function computeStreak(snapshot: SocialSnapshot | undefined): number {
  if (!snapshot) return 0
  const raw = snapshot.raw as RawShape | undefined
  const edges = raw?.data?.user?.edge_owner_to_timeline_media?.edges ?? []
  const validTs = edges
    .map(e => e?.node)
    .filter((n): n is RawPostNode => !!n && !isPinned(n) && typeof n.taken_at_timestamp === 'number')
    .map(n => n.taken_at_timestamp! * 1000)
  if (validTs.length === 0) return 0

  // Conta semanas para trás começando da atual
  let streak = 0
  for (let weeksBack = 0; weeksBack < 26; weeksBack++) {
    const weekEnd = startOfWeek().getTime() - weeksBack * 7 * 86400000
    const weekStart = weekEnd - 7 * 86400000
    const weekHasPost = validTs.some(t => t >= weekStart && t < weekEnd + 7 * 86400000)
    if (weekHasPost) {
      streak++
    } else if (weeksBack === 0) {
      // se não postou esta semana, ainda não quebrou streak — testa próxima
      continue
    } else {
      break
    }
  }
  return streak
}

export function useInstagramStats(clientId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: instagramKeys.detail(clientId ?? ''),
    queryFn: () => callInstagramStats(clientId!),
    enabled: !!clientId && enabled,
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
  })
}

export function useRefreshInstagramStats(clientId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => callInstagramStats(clientId!, true),
    onSuccess: (data) => {
      if (clientId) qc.setQueryData(instagramKeys.detail(clientId), data)
    },
  })
}

export interface BatchResult {
  total: number
  succeeded: number
  failed: number
  errorBreakdown: Record<string, number>
  durationMs: number
}

export function useRefreshAllInstagramStats() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<BatchResult> => {
      const { data, error } = await supabase.functions.invoke<BatchResult>('instagram-stats-batch', {
        body: {},
      })
      if (error) throw error
      if (!data) throw new Error('Resposta vazia da função')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instagramKeys.overview() })
      qc.invalidateQueries({ queryKey: instagramKeys.all })
    },
  })
}
