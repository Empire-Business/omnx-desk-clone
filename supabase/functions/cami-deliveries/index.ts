// Edge function: cami-deliveries
//
// Lê content_cards + content_approvals do projeto cami-plataforma-lb e devolve
// no formato esperado pelo front (CamiDelivery em src/hooks/useCamiDeliveries.ts).
//
// Mapeamento (sem tabela espelho):
//   - cliente cami (workspaces.owner_id → auth.users.email)
//       → cliente omnx (clients.email)
//   - estrategista cami (content_cards.created_by → auth.users.email)
//       → user omnx (users.email)
//
// Autorização:
//   - admin/gerente do omnx: vê tudo
//   - estrategista do omnx: vê só entregas dos clientes que tem assignment ativo
//
// Secrets necessários:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (omnx — já existem)
//   CAMI_SUPABASE_URL, CAMI_SERVICE_ROLE_KEY (do cami-plataforma-lb)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type CamiDeliveryStatus = 'nao_iniciada' | 'revisao' | 'alteracao' | 'aprovado' | 'arquivado'
type CamiDeliveryStage = 'roteiro' | 'edicao' | null

interface ReqBody {
  clientId?: string
  status?: CamiDeliveryStatus[]
  includeArchived?: boolean
}

interface CamiCardRow {
  id: string
  title: string | null
  description: string | null
  channel: string | null
  final_format: string | null
  status: CamiDeliveryStatus | string | null
  stage: CamiDeliveryStage | string | null
  responsible: string | null
  responsible_party: string | null
  scriptwriter: string | null
  editor_name: string | null
  designer: string | null
  poster_name: string | null
  script_deadline: string | null
  edit_deadline: string | null
  production_date: string | null
  publish_date: string | null
  client_deadline_at: string | null
  destination_profiles: string[] | null
  labels: string[] | null
  publish_url: string | null
  source_file_url: string | null
  internal_notes: string | null
  delivered_at: string | null
  client_approved_at: string | null
  roteiro_approved_at: string | null
  consultant_submitted_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  workspace_id: string | null
  // joins
  workspace: { id: string; name: string; owner_id: string | null } | null
  approvals: Array<{
    client_rating: number | null
    client_notes: string | null
    client_action_at: string | null
    auto_approved: boolean | null
  }> | null
}

interface CamiDelivery {
  id: string
  content_id: string | null
  client_id: string | null
  client_nome: string | null
  workspace_name: string | null
  title: string
  description: string | null
  channel: string | null
  final_format: string | null
  status: CamiDeliveryStatus
  stage: CamiDeliveryStage
  responsible: string | null
  responsible_party: string | null
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
  rating: number | null
  rating_notes: string | null
  rating_at: string | null
  auto_approved: boolean
  estrategista_user_id: string | null
  estrategista_nome: string | null
}

const VALID_STATUS = new Set<CamiDeliveryStatus>(['nao_iniciada', 'revisao', 'alteracao', 'aprovado', 'arquivado'])

function normalizeStatus(s: string | null | undefined): CamiDeliveryStatus {
  if (s && VALID_STATUS.has(s as CamiDeliveryStatus)) return s as CamiDeliveryStatus
  return 'nao_iniciada'
}

function normalizeStage(s: string | null | undefined): CamiDeliveryStage {
  if (s === 'roteiro' || s === 'edicao') return s
  return null
}

/** Lista todos os usuários do auth via RPC (SECURITY DEFINER no cami). */
async function listAllAuthEmails(client: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const { data, error } = await client.rpc('get_auth_user_emails')
  if (error) throw error
  for (const u of (data ?? []) as Array<{ id: string; email: string }>) {
    if (u.email) map.set(u.id, u.email.toLowerCase())
  }
  return map
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    // ── Secrets ──────────────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const camiUrl = Deno.env.get('CAMI_SUPABASE_URL')
    const camiKey = Deno.env.get('CAMI_SERVICE_ROLE_KEY')

    if (!camiUrl || !camiKey) {
      return json({ error: 'missing_secrets', message: 'CAMI_SUPABASE_URL e CAMI_SERVICE_ROLE_KEY precisam estar configurados.' }, 503)
    }

    // ── Auth do chamador (omnx) ─────────────────────────────────────────
    const auth = req.headers.get('authorization') ?? ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    })
    const { data: u } = await userClient.auth.getUser()
    if (!u.user) return json({ error: 'unauthorized' }, 401)

    const omnxAdmin = createClient(supabaseUrl, serviceKey)
    const { data: profile } = await omnxAdmin
      .from('users')
      .select('id, perfil')
      .eq('id', u.user.id)
      .single()
    if (!profile) return json({ error: 'forbidden' }, 403)

    const isAdmin = profile.perfil === 'admin' || profile.perfil === 'gerente'

    // ── Body ────────────────────────────────────────────────────────────
    const body: ReqBody = await req.json().catch(() => ({} as ReqBody))
    const wantedStatuses = (body.status ?? []).filter((s): s is CamiDeliveryStatus => VALID_STATUS.has(s))
    const includeArchived = !!body.includeArchived

    // ── Restringe clientes visíveis (estrategista) ──────────────────────
    let allowedClientIds: Set<string> | null = null  // null = tudo (admin)
    if (!isAdmin) {
      const { data: assigns } = await omnxAdmin
        .from('client_assignments')
        .select('client_id')
        .eq('user_id', u.user.id)
        .eq('ativo', true)
      allowedClientIds = new Set((assigns ?? []).map((a: { client_id: string }) => a.client_id))
      if (allowedClientIds.size === 0) {
        return json({ deliveries: [], unmappedWorkspaces: [], fetchedAt: new Date().toISOString() })
      }
    }

    // ── Carrega clientes do omnx (id, email, nome) ──────────────────────
    let clientsQ = omnxAdmin.from('clients').select('id, nome, email').eq('ativo', true)
    if (allowedClientIds) clientsQ = clientsQ.in('id', Array.from(allowedClientIds))
    const { data: omnxClients } = await clientsQ
    const omnxClientByEmail = new Map<string, { id: string; nome: string }>()
    for (const c of (omnxClients ?? []) as Array<{ id: string; nome: string; email: string | null }>) {
      if (c.email) omnxClientByEmail.set(c.email.toLowerCase(), { id: c.id, nome: c.nome })
    }

    // ── Carrega APENAS quem atua como estrategista no omnx ──────────────
    // Critério: usuário com pelo menos um client_assignments ativo com tipo='estrategista'.
    // Isso captura corretamente quem faz trabalho de estrategista, independente de perfil
    // (ex: gerentes que também estrategiam, mas sem incluir gerentes puros).
    const { data: estrategistaAssigns } = await omnxAdmin
      .from('client_assignments')
      .select('user_id')
      .eq('tipo', 'estrategista')
      .eq('ativo', true)
    const estrategistaUserIds = new Set(
      (estrategistaAssigns ?? []).map((a: { user_id: string }) => a.user_id),
    )

    const omnxUserByEmail = new Map<string, { id: string; nome: string }>()
    const omnxUserNameById = new Map<string, string>()
    if (estrategistaUserIds.size > 0) {
      const { data: omnxUsers } = await omnxAdmin
        .from('users')
        .select('id, email, nome')
        .in('id', Array.from(estrategistaUserIds))
      for (const usr of (omnxUsers ?? []) as Array<{ id: string; email: string | null; nome: string | null }>) {
        if (usr.email) omnxUserByEmail.set(usr.email.toLowerCase(), { id: usr.id, nome: usr.nome ?? '' })
        if (usr.nome) omnxUserNameById.set(usr.id, usr.nome)
      }
    }

    // ── Cami client + queries ────────────────────────────────────────────
    const cami = createClient(camiUrl, camiKey)

    let camiEmails: Map<string, string>
    try {
      camiEmails = await listAllAuthEmails(cami)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[cami-deliveries] listAllAuthEmails falhou:', msg)
      return json({ error: 'cami_auth_failed', message: `Falha ao listar usuários do cami: ${msg}` }, 502)
    }

    let cardsQ = cami
      .from('content_cards')
      .select(`
        id, title, description, channel, final_format,
        status, stage, responsible, responsible_party,
        scriptwriter, editor_name, designer, poster_name,
        script_deadline, edit_deadline, production_date, publish_date,
        client_deadline_at, destination_profiles, labels,
        publish_url, source_file_url, internal_notes,
        delivered_at, client_approved_at, roteiro_approved_at,
        consultant_submitted_at, created_at, updated_at,
        created_by, workspace_id,
        workspace:workspaces(id, name, owner_id),
        approvals:content_approvals(client_rating, client_notes, client_action_at, auto_approved)
      `)
      .order('updated_at', { ascending: false })
      .limit(500)

    if (!includeArchived) cardsQ = cardsQ.neq('status', 'arquivado')
    if (wantedStatuses.length > 0) cardsQ = cardsQ.in('status', wantedStatuses)

    const { data: cards, error: cardsErr } = await cardsQ
    if (cardsErr) {
      return json({ error: 'cami_query_failed', message: cardsErr.message }, 502)
    }

    // ── Normaliza ────────────────────────────────────────────────────────
    const deliveries: CamiDelivery[] = []
    const unmappedWorkspaces = new Set<string>()

    for (const c of (cards ?? []) as unknown as CamiCardRow[]) {
      const ownerId = c.workspace?.owner_id ?? null
      const ownerEmail = ownerId ? camiEmails.get(ownerId) ?? null : null
      const omnxClient = ownerEmail ? omnxClientByEmail.get(ownerEmail) ?? null : null

      // Filtro de cliente
      if (body.clientId && omnxClient?.id !== body.clientId) continue
      if (allowedClientIds && (!omnxClient || !allowedClientIds.has(omnxClient.id))) continue

      if (!omnxClient && c.workspace?.name) {
        unmappedWorkspaces.add(c.workspace.name)
      }

      const creatorEmail = c.created_by ? camiEmails.get(c.created_by) ?? null : null
      const estrategistaMatch = creatorEmail ? omnxUserByEmail.get(creatorEmail) ?? null : null
      const estrategistaUserId = estrategistaMatch?.id ?? null
      const estrategistaNome = estrategistaUserId ? (omnxUserNameById.get(estrategistaUserId) ?? null) : null

      // Descarta cards cujo criador não é estrategista no omnx
      if (!estrategistaUserId) continue

      // Última aprovação por client_action_at
      const approvals = (c.approvals ?? []).filter(a => a)
      approvals.sort((a, b) => {
        const ta = a.client_action_at ? new Date(a.client_action_at).getTime() : 0
        const tb = b.client_action_at ? new Date(b.client_action_at).getTime() : 0
        return tb - ta
      })
      const latest = approvals[0]

      deliveries.push({
        id: c.id,
        content_id: c.id,
        client_id: omnxClient?.id ?? null,
        client_nome: omnxClient?.nome ?? null,
        workspace_name: c.workspace?.name ?? null,
        title: c.title ?? '(sem título)',
        description: c.description,
        channel: c.channel,
        final_format: c.final_format,
        status: normalizeStatus(c.status as string | null),
        stage: normalizeStage(c.stage as string | null),
        responsible: c.responsible,
        responsible_party: c.responsible_party,
        scriptwriter: c.scriptwriter,
        editor_name: c.editor_name,
        designer: c.designer,
        poster_name: c.poster_name,
        script_deadline: c.script_deadline,
        edit_deadline: c.edit_deadline,
        production_date: c.production_date,
        publish_date: c.publish_date,
        client_deadline_at: c.client_deadline_at,
        destination_profiles: c.destination_profiles ?? [],
        labels: c.labels ?? [],
        publish_url: c.publish_url,
        source_file_url: c.source_file_url,
        internal_notes: c.internal_notes,
        delivered_at: c.delivered_at,
        client_approved_at: c.client_approved_at,
        roteiro_approved_at: c.roteiro_approved_at,
        consultant_submitted_at: c.consultant_submitted_at,
        created_at: c.created_at,
        updated_at: c.updated_at,
        rating: latest?.client_rating ?? null,
        rating_notes: latest?.client_notes ?? null,
        rating_at: latest?.client_action_at ?? null,
        auto_approved: !!latest?.auto_approved,
        estrategista_user_id: estrategistaUserId,
        estrategista_nome: estrategistaNome,
      })
    }

    return json({
      deliveries,
      unmappedWorkspaces: Array.from(unmappedWorkspaces).sort(),
      fetchedAt: new Date().toISOString(),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cami-deliveries] erro inesperado:', msg)
    return json({ error: 'internal_error', message: msg }, 500)
  }
})
