import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SCRAPECREATORS_URL = 'https://api.scrapecreators.com/v1/instagram/profile'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6h

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Baixa a URL temporária do Instagram CDN e persiste no Storage `chat-media/instagram/<client_id>.<ext>`.
// Retorna a public URL ou null se falhar.
async function persistInstagramPic(
  supabase: ReturnType<typeof createClient>,
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
    const { error } = await supabase.storage
      .from('chat-media')
      .upload(path, bytes, { contentType, upsert: true })
    if (error) {
      console.error('[instagram-stats] storage upload failed:', error.message)
      return null
    }
    const { data } = supabase.storage.from('chat-media').getPublicUrl(path)
    // Cache-bust pra forçar atualização nos browsers que já carregaram a versão antiga
    return `${data.publicUrl}?v=${Date.now()}`
  } catch (err) {
    console.error('[instagram-stats] persistInstagramPic error:', err)
    return null
  }
}

function normalizeHandle(input: string | null | undefined): string | null {
  if (!input) return null
  let h = input.trim()
  if (!h) return null
  // Remove URL prefix
  const m = h.match(/instagram\.com\/([^/?#]+)/i)
  if (m) h = m[1]
  h = h.replace(/^@+/, '').replace(/\/+$/, '')
  return h || null
}

type ScrapePost = {
  node?: {
    id?: string
    shortcode?: string
    taken_at_timestamp?: number
    pinned_for_users?: unknown[]
    is_pinned?: boolean
    edge_media_to_caption?: { edges?: Array<{ node?: { text?: string } }> }
  }
}

function isPinned(node: NonNullable<ScrapePost['node']>): boolean {
  if (node.is_pinned === true) return true
  if (Array.isArray(node.pinned_for_users) && node.pinned_for_users.length > 0) return true
  return false
}

type ScrapeProfileResponse = {
  data?: {
    user?: {
      username?: string
      full_name?: string
      profile_pic_url?: string
      profile_pic_url_hd?: string
      edge_followed_by?: { count?: number }
      edge_owner_to_timeline_media?: { edges?: ScrapePost[] }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const apiKey = Deno.env.get('SCRAPECREATORS_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'SCRAPECREATORS_API_KEY not configured' }), { status: 500, headers: corsHeaders })
  }

  let body: { client_id?: string; force?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: corsHeaders })
  }

  const { client_id, force } = body
  if (!client_id) {
    return new Response(JSON.stringify({ error: 'client_id required' }), { status: 400, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Validate caller has access to this client (admin/gerente or assigned)
  const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('perfil')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.perfil === 'admin' || profile?.perfil === 'gerente'
  if (!isAdmin) {
    const { count } = await supabase
      .from('client_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client_id)
      .eq('user_id', user.id)
    if (!count) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    }
  }

  // Load client
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, instagram')
    .eq('id', client_id)
    .single()
  if (clientErr || !client) {
    return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404, headers: corsHeaders })
  }

  const handle = normalizeHandle(client.instagram as string | null)
  if (!handle) {
    return new Response(JSON.stringify({ error: 'Cliente sem Instagram cadastrado' }), { status: 400, headers: corsHeaders })
  }

  // Check cache
  const { data: latest } = await supabase
    .from('social_snapshots')
    .select('*')
    .eq('client_id', client_id)
    .eq('platform', 'instagram')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!force && latest) {
    const age = Date.now() - new Date(latest.fetched_at).getTime()
    if (age < CACHE_TTL_MS) {
      return new Response(JSON.stringify({ snapshot: latest, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Fetch fresh data
  const url = `${SCRAPECREATORS_URL}?handle=${encodeURIComponent(handle)}`
  let scrape: ScrapeProfileResponse
  try {
    const res = await fetch(url, { headers: { 'x-api-key': apiKey } })
    if (!res.ok) {
      const text = await res.text()
      console.error('[instagram-stats] scrapecreators failed:', res.status, text)
      // Fallback: return latest snapshot if exists, mark stale
      if (latest) {
        return new Response(JSON.stringify({ snapshot: latest, cached: true, stale: true, error: 'API ScrapeCreators indisponível' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: 'Falha ao buscar Instagram', status: res.status }), { status: 502, headers: corsHeaders })
    }
    scrape = await res.json()
  } catch (err) {
    console.error('[instagram-stats] fetch error:', err)
    return new Response(JSON.stringify({ error: 'Falha ao buscar Instagram' }), { status: 502, headers: corsHeaders })
  }

  const u = scrape.data?.user
  if (!u) {
    return new Response(JSON.stringify({ error: 'Perfil não encontrado' }), { status: 404, headers: corsHeaders })
  }

  const followers = u.edge_followed_by?.count ?? null
  const fullName = u.full_name ?? null
  const rawProfilePic = u.profile_pic_url_hd ?? u.profile_pic_url ?? null
  // Persiste a foto no Storage pra evitar URL temporária do CDN expirando
  const profilePic = rawProfilePic
    ? (await persistInstagramPic(supabase, rawProfilePic, client_id)) ?? rawProfilePic
    : null
  // Pega o post mais recente NÃO fixado (pinned posts aparecem no topo do feed mas têm timestamp antigo)
  const allEdges = u.edge_owner_to_timeline_media?.edges ?? []
  const nonPinned = allEdges
    .map(e => e?.node)
    .filter((n): n is NonNullable<ScrapePost['node']> => !!n && !isPinned(n) && typeof n.taken_at_timestamp === 'number')
    .sort((a, b) => (b.taken_at_timestamp ?? 0) - (a.taken_at_timestamp ?? 0))
  const realLast = nonPinned[0]
  const lastPostAt = realLast?.taken_at_timestamp
    ? new Date(realLast.taken_at_timestamp * 1000).toISOString()
    : null
  const lastPostCaption = realLast?.edge_media_to_caption?.edges?.[0]?.node?.text ?? null
  const lastPostUrl = realLast?.shortcode ? `https://www.instagram.com/p/${realLast.shortcode}/` : null

  const insertPayload = {
    client_id,
    platform: 'instagram' as const,
    username: u.username ?? handle,
    followers,
    full_name: fullName,
    profile_pic_url: profilePic,
    last_post_at: lastPostAt,
    last_post_caption: lastPostCaption,
    last_post_url: lastPostUrl,
    raw: scrape as unknown as Record<string, unknown>,
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('social_snapshots')
    .insert(insertPayload)
    .select('*')
    .single()

  if (insertErr) {
    console.error('[instagram-stats] insert error:', insertErr)
    return new Response(JSON.stringify({ error: 'Falha ao salvar snapshot', details: insertErr.message }), { status: 500, headers: corsHeaders })
  }

  return new Response(JSON.stringify({ snapshot: inserted, cached: false }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
