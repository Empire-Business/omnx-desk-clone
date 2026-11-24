import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { sessaoDeskLiberada } from '../_shared/desk-session.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SCRAPECREATORS_URL = 'https://api.scrapecreators.com/v1/instagram/profile'
const CONCURRENCY = 4

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function normalizeHandle(input: string | null | undefined): string | null {
  if (!input) return null
  let h = input.trim()
  if (!h) return null
  const m = h.match(/instagram\.com\/([^/?#]+)/i)
  if (m) h = m[1]
  h = h.replace(/^@+/, '').replace(/\/+$/, '')
  return h || null
}

async function persistInstagramPic(
  supabase: SupabaseClient,
  picUrl: string,
  clientId: string,
): Promise<string | null> {
  try {
    const res = await fetch(picUrl)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
    const path = `instagram/${clientId}.${ext}`
    const bytes = await res.arrayBuffer()
    const { error } = await supabase.storage.from('chat-media').upload(path, bytes, { contentType, upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('chat-media').getPublicUrl(path)
    return `${data.publicUrl}?v=${Date.now()}`
  } catch {
    return null
  }
}

async function processClient(
  supabase: SupabaseClient,
  apiKey: string,
  client: { id: string; instagram: string | null },
): Promise<{ id: string; ok: boolean; error?: string }> {
  const handle = normalizeHandle(client.instagram)
  if (!handle) return { id: client.id, ok: false, error: 'no-handle' }

  const url = `${SCRAPECREATORS_URL}?handle=${encodeURIComponent(handle)}`
  let scrape: Record<string, unknown>
  try {
    const res = await fetch(url, { headers: { 'x-api-key': apiKey } })
    if (!res.ok) return { id: client.id, ok: false, error: `scrape-${res.status}` }
    scrape = await res.json()
  } catch {
    return { id: client.id, ok: false, error: 'scrape-fetch' }
  }

  const data = scrape.data as { user?: Record<string, unknown> } | undefined
  const u = data?.user
  if (!u) return { id: client.id, ok: false, error: 'no-user' }

  const followers = (u.edge_followed_by as { count?: number } | undefined)?.count ?? null
  const fullName = (u.full_name as string | undefined) ?? null
  const rawPic = (u.profile_pic_url_hd as string | undefined) ?? (u.profile_pic_url as string | undefined) ?? null
  const profilePic = rawPic ? (await persistInstagramPic(supabase, rawPic, client.id)) ?? rawPic : null

  // Pega o post mais recente NÃO fixado (pinned posts aparecem no topo do feed mas têm timestamp antigo)
  type Node = {
    taken_at_timestamp?: number
    shortcode?: string
    pinned_for_users?: unknown[]
    is_pinned?: boolean
    edge_media_to_caption?: { edges?: Array<{ node?: { text?: string } }> }
  }
  const isPinned = (n: Node) =>
    n.is_pinned === true || (Array.isArray(n.pinned_for_users) && n.pinned_for_users.length > 0)
  const edges = (u.edge_owner_to_timeline_media as { edges?: Array<{ node?: Node }> } | undefined)?.edges ?? []
  const nonPinned = edges
    .map(e => e?.node)
    .filter((n): n is Node => !!n && !isPinned(n) && typeof n.taken_at_timestamp === 'number')
    .sort((a, b) => (b.taken_at_timestamp ?? 0) - (a.taken_at_timestamp ?? 0))
  const realLast = nonPinned[0]
  const lastPostAt = realLast?.taken_at_timestamp
    ? new Date(realLast.taken_at_timestamp * 1000).toISOString()
    : null
  const lastPostCaption = realLast?.edge_media_to_caption?.edges?.[0]?.node?.text ?? null
  const lastPostUrl = realLast?.shortcode ? `https://www.instagram.com/p/${realLast.shortcode}/` : null

  const { error: insertErr } = await supabase.from('social_snapshots').insert({
    client_id: client.id,
    platform: 'instagram',
    username: (u.username as string | undefined) ?? handle,
    followers,
    full_name: fullName,
    profile_pic_url: profilePic,
    last_post_at: lastPostAt,
    last_post_caption: lastPostCaption,
    last_post_url: lastPostUrl,
    raw: scrape,
  })
  if (insertErr) return { id: client.id, ok: false, error: 'insert' }
  return { id: client.id, ok: true }
}

async function runBatchedConcurrent<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = []
  let idx = 0
  async function next(): Promise<void> {
    while (idx < items.length) {
      const i = idx++
      results[i] = await worker(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next))
  return results
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Auth: aceita ou JWT de admin/gerente, ou um cron-secret
  const cronSecret = Deno.env.get('CRON_SECRET')
  const providedCronSecret = req.headers.get('x-cron-secret')
  const isCron = !!cronSecret && providedCronSecret === cronSecret

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (!isCron) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }
    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }
    const deskSession = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    })
    if (!await sessaoDeskLiberada(deskSession)) {
      return new Response(JSON.stringify({ error: 'password_change_required' }), {
        status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    const { data: profile } = await supabase.from('users').select('perfil').eq('id', user.id).single()
    if (profile?.perfil !== 'admin' && profile?.perfil !== 'gerente') {
      return new Response(JSON.stringify({ error: 'Forbidden — admin/gerente only' }), { status: 403, headers: corsHeaders })
    }
  }

  const apiKey = Deno.env.get('SCRAPECREATORS_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'SCRAPECREATORS_API_KEY not configured' }), { status: 500, headers: corsHeaders })
  }

  // Pega todos clientes ativos com instagram
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, instagram')
    .eq('ativo', true)
    .not('instagram', 'is', null)

  if (error) {
    return new Response(JSON.stringify({ error: 'Failed to load clients', details: error.message }), { status: 500, headers: corsHeaders })
  }

  const filtered = (clients ?? []).filter(c => normalizeHandle(c.instagram as string | null))
  const startedAt = Date.now()

  const results = await runBatchedConcurrent(
    filtered as Array<{ id: string; instagram: string | null }>,
    (c) => processClient(supabase, apiKey, c),
    CONCURRENCY,
  )

  const succeeded = results.filter(r => r.ok).length
  const failed = results.length - succeeded
  const errorBreakdown: Record<string, number> = {}
  for (const r of results) {
    if (!r.ok && r.error) errorBreakdown[r.error] = (errorBreakdown[r.error] ?? 0) + 1
  }

  return new Response(
    JSON.stringify({
      total: results.length,
      succeeded,
      failed,
      errorBreakdown,
      durationMs: Date.now() - startedAt,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
