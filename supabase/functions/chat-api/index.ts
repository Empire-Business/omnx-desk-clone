import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-API-Key',
  'Content-Type': 'application/json',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS })
}

function error(message: string, status = 400) {
  return json({ error: message }, status)
}

// ─── API Key verification ────────────────────────────────────────────────────

async function verifyApiKey(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
): Promise<{ valid: boolean; permissions: string[]; keyId?: string }> {
  // Hash the provided key with SHA-256
  const encoder = new TextEncoder()
  const data = encoder.encode(apiKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const keyHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

  const { data: keyRecord } = await supabase
    .from('api_keys')
    .select('id, permissoes, ativo, expira_em')
    .eq('key_hash', keyHash)
    .single()

  if (!keyRecord || !keyRecord.ativo) {
    return { valid: false, permissions: [] }
  }

  // Check expiration
  if (keyRecord.expira_em && new Date(keyRecord.expira_em) < new Date()) {
    return { valid: false, permissions: [] }
  }

  // Update last used
  await supabase
    .from('api_keys')
    .update({ ultimo_uso: new Date().toISOString() })
    .eq('id', keyRecord.id)

  return {
    valid: true,
    permissions: (keyRecord.permissoes as string[]) ?? [],
    keyId: keyRecord.id,
  }
}

function hasPermission(permissions: string[], required: string): boolean {
  return permissions.includes('*') || permissions.includes(required)
}

// ─── Route handlers ──────────────────────────────────────────────────────────

async function handleSendMessage(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const { instance_id, number, text, media_url } = body as {
    instance_id?: string
    number?: string
    text?: string
    media_url?: string
  }

  if (!instance_id || !number || !text) {
    return error('Missing required: instance_id, number, text')
  }

  // Get instance token
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('id, instance_id, nome')
    .eq('id', instance_id)
    .eq('ativo', true)
    .single()

  if (!instance) {
    return error('Instance not found or inactive', 404)
  }

  // Call uazapi-send-message
  const sendResp = await fetch(`${supabaseUrl}/functions/v1/uazapi-send-message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instance_id: instance.id,
      to: number,
      text,
      media_url,
    }),
  })

  const sendResult = await sendResp.json()
  return json(sendResult, sendResp.status)
}

async function handleListConversations(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const status = url.searchParams.get('status')
  const instance_id = url.searchParams.get('instance_id')
  const department_id = url.searchParams.get('department_id')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100)
  const offset = parseInt(url.searchParams.get('offset') ?? '0')

  let query = supabase
    .from('chat_conversations')
    .select('*, chat_contacts(*)', { count: 'exact' })
    .order('ultima_mensagem_em', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)
  if (instance_id) query = query.eq('instance_id', instance_id)
  if (department_id) query = query.eq('department_id', department_id)

  const { data, count, error: err } = await query

  if (err) return error(err.message, 500)
  return json({ data, total: count, limit, offset })
}

async function handleGetConversation(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
) {
  const { data: conversation } = await supabase
    .from('chat_conversations')
    .select('*, chat_contacts(*)')
    .eq('id', conversationId)
    .single()

  if (!conversation) return error('Conversation not found', 404)

  const { data: messages } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('criado_em', { ascending: true })
    .limit(200)

  return json({ ...conversation, messages: messages ?? [] })
}

async function handleAssignConversation(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  body: Record<string, unknown>,
) {
  const { agent_id } = body as { agent_id?: string }
  if (!agent_id) return error('Missing required: agent_id')

  const { error: err } = await supabase
    .from('chat_conversations')
    .update({ atribuido_a: agent_id, status: 'em_atendimento' })
    .eq('id', conversationId)

  if (err) return error(err.message, 500)
  return json({ success: true })
}

async function handleTransferConversation(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  body: Record<string, unknown>,
) {
  const { department_id, agent_id } = body as { department_id?: string; agent_id?: string }

  const updates: Record<string, unknown> = {}
  if (department_id) updates.department_id = department_id
  if (agent_id) updates.atribuido_a = agent_id

  if (Object.keys(updates).length === 0) {
    return error('Provide department_id or agent_id')
  }

  const { error: err } = await supabase
    .from('chat_conversations')
    .update(updates)
    .eq('id', conversationId)

  if (err) return error(err.message, 500)
  return json({ success: true })
}

async function handleCloseConversation(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
) {
  const { error: err } = await supabase
    .from('chat_conversations')
    .update({ status: 'encerrada', encerrada_em: new Date().toISOString() })
    .eq('id', conversationId)

  if (err) return error(err.message, 500)
  return json({ success: true })
}

async function handleContacts(
  supabase: ReturnType<typeof createClient>,
  method: string,
  url: URL,
  body?: Record<string, unknown>,
) {
  if (method === 'GET') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100)
    const offset = parseInt(url.searchParams.get('offset') ?? '0')
    const search = url.searchParams.get('search')

    let query = supabase
      .from('chat_contacts')
      .select('*', { count: 'exact' })
      .order('criado_em', { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.or(`nome.ilike.%${search}%,numero.ilike.%${search}%`)
    }

    const { data, count, error: err } = await query
    if (err) return error(err.message, 500)
    return json({ data, total: count, limit, offset })
  }

  if (method === 'POST' && body) {
    const { numero, nome, tags } = body as { numero?: string; nome?: string; tags?: string[] }
    if (!numero) return error('Missing required: numero')

    const { data, error: err } = await supabase
      .from('chat_contacts')
      .upsert({ numero, nome: nome ?? numero, tags: tags ?? [] }, { onConflict: 'numero' })
      .select()
      .single()

    if (err) return error(err.message, 500)
    return json(data, 201)
  }

  return error('Method not allowed', 405)
}

async function handleInstances(supabase: ReturnType<typeof createClient>) {
  const { data, error: err } = await supabase
    .from('whatsapp_instances')
    .select('id, nome, instance_id, numero, ativo')
    .eq('ativo', true)
    .order('nome')

  if (err) return error(err.message, 500)
  return json({ data })
}

// ─── Main router ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Authenticate via X-API-Key header
  const apiKey = req.headers.get('X-API-Key')
  if (!apiKey) {
    return error('Missing X-API-Key header', 401)
  }

  const auth = await verifyApiKey(supabase, apiKey)
  if (!auth.valid) {
    return error('Invalid or expired API key', 401)
  }

  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/functions\/v1\/chat-api\/?/, '').replace(/^\//, '')
  const method = req.method

  let body: Record<string, unknown> = {}
  if (['POST', 'PATCH', 'PUT'].includes(method)) {
    try {
      body = await req.json()
    } catch {
      // empty body is ok for some endpoints
    }
  }

  try {
    // POST /send-message
    if (path === 'send-message' && method === 'POST') {
      if (!hasPermission(auth.permissions, 'send_message')) return error('Forbidden', 403)
      return await handleSendMessage(supabase, body)
    }

    // GET /conversations
    if (path === 'conversations' && method === 'GET') {
      if (!hasPermission(auth.permissions, 'list_conversations')) return error('Forbidden', 403)
      return await handleListConversations(supabase, url)
    }

    // GET /conversations/:id
    const convMatch = path.match(/^conversations\/([0-9a-f-]+)$/)
    if (convMatch && method === 'GET') {
      if (!hasPermission(auth.permissions, 'list_conversations')) return error('Forbidden', 403)
      return await handleGetConversation(supabase, convMatch[1])
    }

    // PATCH /conversations/:id/assign
    const assignMatch = path.match(/^conversations\/([0-9a-f-]+)\/assign$/)
    if (assignMatch && method === 'PATCH') {
      if (!hasPermission(auth.permissions, 'manage_contacts')) return error('Forbidden', 403)
      return await handleAssignConversation(supabase, assignMatch[1], body)
    }

    // PATCH /conversations/:id/transfer
    const transferMatch = path.match(/^conversations\/([0-9a-f-]+)\/transfer$/)
    if (transferMatch && method === 'PATCH') {
      if (!hasPermission(auth.permissions, 'manage_contacts')) return error('Forbidden', 403)
      return await handleTransferConversation(supabase, transferMatch[1], body)
    }

    // PATCH /conversations/:id/close
    const closeMatch = path.match(/^conversations\/([0-9a-f-]+)\/close$/)
    if (closeMatch && method === 'PATCH') {
      if (!hasPermission(auth.permissions, 'manage_contacts')) return error('Forbidden', 403)
      return await handleCloseConversation(supabase, closeMatch[1])
    }

    // GET|POST /contacts
    if (path === 'contacts' && (method === 'GET' || method === 'POST')) {
      if (!hasPermission(auth.permissions, 'manage_contacts')) return error('Forbidden', 403)
      return await handleContacts(supabase, method, url, body)
    }

    // GET /instances
    if (path === 'instances' && method === 'GET') {
      if (!hasPermission(auth.permissions, 'view_instances')) return error('Forbidden', 403)
      return await handleInstances(supabase)
    }

    return error(`Not found: ${method} /${path}`, 404)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return error(message, 500)
  }
})
