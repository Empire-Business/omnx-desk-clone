import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Detecta clientes em estado crítico (>14d sem postar OU crescimento negativo) e
// cria notifications pros estrategistas, mas só se NÃO houver notification 'instagram_alert'
// recente (últimas 48h) pra evitar spam.

interface AlertCandidate {
  client_id: string
  client_nome: string
  user_ids: string[]
  reason: string
  days?: number
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const cronSecret = Deno.env.get('CRON_SECRET')
  const provided = req.headers.get('x-cron-secret')
  if (cronSecret && provided !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Pega snapshots mais recentes via SQL (DISTINCT ON) — calcula days_since_post
  const { data: snaps, error } = await supabase.rpc('latest_instagram_snapshots').catch(() => ({ data: null, error: null }))

  // Fallback: query direta se RPC não existir
  let snapshots: Array<{ client_id: string; last_post_at: string | null; followers: number | null }> = []
  if (snaps) {
    snapshots = snaps as typeof snapshots
  } else {
    const { data, error: e2 } = await supabase
      .from('social_snapshots')
      .select('client_id, last_post_at, followers, fetched_at')
      .eq('platform', 'instagram')
      .order('fetched_at', { ascending: false })
    if (e2) {
      return new Response(JSON.stringify({ error: e2.message }), { status: 500, headers: corsHeaders })
    }
    const seen = new Set<string>()
    for (const row of (data ?? []) as Array<{ client_id: string; last_post_at: string | null; followers: number | null; fetched_at: string }>) {
      if (seen.has(row.client_id)) continue
      seen.add(row.client_id)
      snapshots.push(row)
    }
  }
  if (error) console.error('[alerts] RPC error', error)

  const now = Date.now()
  const FOURTEEN_D = 14 * 86400000

  // Critérios: >14 dias sem postar
  const candidatesByClientId: Record<string, AlertCandidate> = {}
  for (const s of snapshots) {
    if (!s.last_post_at) continue
    const days = Math.floor((now - new Date(s.last_post_at).getTime()) / 86400000)
    if (days > 14) {
      candidatesByClientId[s.client_id] = {
        client_id: s.client_id,
        client_nome: '',
        user_ids: [],
        reason: `há ${days} dias sem postar`,
        days,
      }
    }
  }

  if (Object.keys(candidatesByClientId).length === 0) {
    return new Response(JSON.stringify({ created: 0, candidates: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Carrega nomes dos clientes
  const clientIds = Object.keys(candidatesByClientId)
  const { data: clients } = await supabase
    .from('clients')
    .select('id, nome, ativo')
    .in('id', clientIds)
  for (const c of (clients ?? []) as Array<{ id: string; nome: string; ativo: boolean }>) {
    if (!c.ativo) {
      delete candidatesByClientId[c.id]
      continue
    }
    if (candidatesByClientId[c.id]) candidatesByClientId[c.id].client_nome = c.nome
  }

  // Para cada cliente, pega estrategistas vinculados
  const { data: assignments } = await supabase
    .from('client_assignments')
    .select('client_id, user_id, tipo')
    .in('client_id', Object.keys(candidatesByClientId))
    .eq('tipo', 'estrategista')
  for (const a of (assignments ?? []) as Array<{ client_id: string; user_id: string }>) {
    if (candidatesByClientId[a.client_id]) {
      candidatesByClientId[a.client_id].user_ids.push(a.user_id)
    }
  }

  // Filtra notifications recentes (48h) pra evitar spam
  const cutoff = new Date(now - 48 * 3600 * 1000).toISOString()
  const allCandidatePairs: Array<{ client_id: string; user_id: string }> = []
  for (const cand of Object.values(candidatesByClientId)) {
    for (const uid of cand.user_ids) allCandidatePairs.push({ client_id: cand.client_id, user_id: uid })
  }

  const { data: recent } = await supabase
    .from('notifications')
    .select('user_id, metadata, criado_em')
    .eq('tipo', 'instagram_alert')
    .gte('criado_em', cutoff)
  const recentSet = new Set(
    ((recent ?? []) as Array<{ user_id: string; metadata: Record<string, unknown> | null }>)
      .map(r => `${r.user_id}|${(r.metadata ?? {}).client_id}`)
  )

  const toInsert: Array<{ user_id: string; tipo: string; titulo: string; mensagem: string; link: string; metadata: Record<string, unknown> }> = []
  for (const cand of Object.values(candidatesByClientId)) {
    for (const uid of cand.user_ids) {
      if (recentSet.has(`${uid}|${cand.client_id}`)) continue
      toInsert.push({
        user_id: uid,
        tipo: 'instagram_alert',
        titulo: `${cand.client_nome} sem postar`,
        mensagem: `${cand.client_nome} está ${cand.reason}. Considere acionar.`,
        link: `/clientes/${cand.client_id}`,
        metadata: { client_id: cand.client_id, days: cand.days },
      })
    }
  }

  if (toInsert.length === 0) {
    return new Response(JSON.stringify({ created: 0, candidates: Object.keys(candidatesByClientId).length, skipped: 'all already notified within 48h' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { error: insertErr } = await supabase.from('notifications').insert(toInsert)
  if (insertErr) {
    return new Response(JSON.stringify({ error: insertErr.message, attempted: toInsert.length }), { status: 500, headers: corsHeaders })
  }

  return new Response(JSON.stringify({
    created: toInsert.length,
    candidates: Object.keys(candidatesByClientId).length,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
