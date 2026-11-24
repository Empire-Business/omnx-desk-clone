// API externa do Chat (X-API-Key). Roda com service_role (sem RLS), então TODA
// consulta aqui é filtrada à mão pela empresa da chave (api_keys.tenant_id) e
// esconde grupos INTERNOS (chat_contacts.restrito_admin / chat_grupos_restritos),
// que só admin/gerente podem ver — e uma chave de API não é admin nem gerente.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { chatEhRestrito } from '../_shared/chat-restrito.ts'
import { variantesDoNumero } from '../_shared/uazapi-acoes.ts'
import {
  avaliarChave,
  type ChaveApi,
  ehUuid,
  listaUuidsFiltro,
  paginacao,
  sanitizarBusca,
  tipoDaMensagem,
} from '../_shared/chat-api-regras.ts'
import { travaDeLicenca } from '../_shared/htai-licenca.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

type Db = SupabaseClient

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

// Coluna/tabela ainda não existe (migration 20261026260000 não aplicada).
const OBJETO_INEXISTENTE = new Set(['42703', '42P01', 'PGRST204', 'PGRST205'])

// ─── API Key verification ────────────────────────────────────────────────────

async function verifyApiKey(supabase: Db, apiKey: string) {
  // Hash the provided key with SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey))
  const keyHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')

  const { data: keyRecord } = await supabase
    .from('api_keys')
    .select('id, permissoes, ativo, expira_em, tenant_id')
    .eq('key_hash', keyHash)
    .maybeSingle()

  const auth = avaliarChave(keyRecord as ChaveApi | null)
  if (!auth.valid) return auth

  // Update last used
  await supabase.from('api_keys').update({ ultimo_uso: new Date().toISOString() }).eq('id', auth.keyId)
  return auth
}

function hasPermission(permissions: string[], required: string): boolean {
  return permissions.includes('*') || permissions.includes(required)
}

// ─── Empresa e grupos internos ───────────────────────────────────────────────

/** Ids dos contatos INTERNOS da empresa. Erro (exceto objeto inexistente) = exceção (falha fechada). */
async function contatosRestritos(supabase: Db, tenantId: string): Promise<string[]> {
  const ids = new Set<string>()

  const marcados = await supabase
    .from('chat_contacts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('restrito_admin', true)
  if (marcados.error) {
    if (!OBJETO_INEXISTENTE.has(marcados.error.code ?? '')) throw new Error('Falha ao checar grupos internos')
  } else {
    for (const c of marcados.data ?? []) ids.add((c as { id: string }).id)
  }

  const registro = await supabase.from('chat_grupos_restritos').select('grupo_base').eq('tenant_id', tenantId)
  if (registro.error) {
    if (!OBJETO_INEXISTENTE.has(registro.error.code ?? '')) throw new Error('Falha ao checar grupos internos')
  } else {
    const bases = (registro.data ?? []).map((g) => (g as { grupo_base: string }).grupo_base)
    if (bases.length > 0) {
      const { data, error: err } = await supabase
        .from('chat_contacts')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('numero_whatsapp', bases.flatMap((b) => [b, `${b}@g.us`]))
      if (err) throw new Error('Falha ao checar grupos internos')
      for (const c of data ?? []) ids.add((c as { id: string }).id)
    }
  }
  return [...ids]
}

interface ConversaTenant { id: string; contact_id: string | null; instance_id: string | null }

/** Conversa da empresa e que não é de grupo interno; senão null. */
async function conversaDoTenant(supabase: Db, tenantId: string, conversationId: string): Promise<ConversaTenant | null> {
  if (!ehUuid(conversationId)) return null
  const { data: conv } = await supabase
    .from('chat_conversations')
    .select('id, contact_id, instance_id')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!conv) return null
  const restritos = await contatosRestritos(supabase, tenantId)
  if (conv.contact_id && restritos.includes(conv.contact_id)) return null
  return conv as ConversaTenant
}

async function usuarioDoTenant(supabase: Db, tenantId: string, userId: unknown): Promise<boolean> {
  if (!ehUuid(userId)) return false
  const { data } = await supabase
    .from('users').select('id').eq('id', userId).eq('tenant_id', tenantId).neq('ativo', false).maybeSingle()
  return Boolean(data)
}

async function departamentoDoTenant(supabase: Db, tenantId: string, departmentId: unknown): Promise<boolean> {
  if (!ehUuid(departmentId)) return false
  const { data } = await supabase
    .from('chat_departments').select('id').eq('id', departmentId).eq('tenant_id', tenantId).maybeSingle()
  return Boolean(data)
}

async function instanciaDoTenant(supabase: Db, tenantId: string, instanceId: unknown): Promise<{ id: string } | null> {
  if (!ehUuid(instanceId)) return null
  const { data } = await supabase
    .from('whatsapp_instances')
    .select('id')
    .eq('id', instanceId)
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .maybeSingle()
  return (data as { id: string } | null) ?? null
}

// ─── Route handlers ──────────────────────────────────────────────────────────

/**
 * Envia texto/mídia numa conversa EXISTENTE da empresa.
 * Body: { conversation_id } ou { instance_id, number } (+ text, media_url?, tipo?).
 */
async function handleSendMessage(supabase: Db, tenantId: string, body: Record<string, unknown>) {
  const { conversation_id, instance_id, number, text, media_url, tipo } = body
  if (typeof text !== 'string' || !text.trim()) return error('Missing required: text')

  let conversationId: string | null = null
  if (typeof conversation_id === 'string') {
    conversationId = (await conversaDoTenant(supabase, tenantId, conversation_id))?.id ?? null
  } else {
    if (typeof number !== 'string' || !number.trim()) return error('Missing required: conversation_id or (instance_id, number)')
    const instance = await instanciaDoTenant(supabase, tenantId, instance_id)
    if (!instance) return error('Instance not found or inactive', 404)
    if (await chatEhRestrito(supabase, number, tenantId)) return error('Conversation not found', 404)
    const { data: contatos } = await supabase
      .from('chat_contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('instance_id', instance.id)
      .in('numero_whatsapp', variantesDoNumero(number))
      .limit(1)
    const contato = (contatos ?? [])[0] as { id: string } | undefined
    if (contato) {
      const { data: convs } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('contact_id', contato.id)
        .order('ultima_mensagem_em', { ascending: false })
        .limit(1)
      const cand = (convs ?? [])[0] as { id: string } | undefined
      conversationId = cand ? (await conversaDoTenant(supabase, tenantId, cand.id))?.id ?? null : null
    }
  }
  if (!conversationId) return error('Conversation not found', 404)

  const sendResp = await fetch(`${supabaseUrl}/functions/v1/uazapi-send-message`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: conversationId,
      conteudo: text,
      tipo: tipoDaMensagem(tipo, media_url),
      media_url: typeof media_url === 'string' && media_url ? media_url : undefined,
    }),
  })

  const sendResult = await sendResp.json().catch(() => ({ error: 'Falha no envio' }))
  return json(sendResult, sendResp.status)
}

async function handleListConversations(supabase: Db, tenantId: string, url: URL) {
  const status = url.searchParams.get('status')
  const instance_id = url.searchParams.get('instance_id')
  const department_id = url.searchParams.get('department_id')
  const { limit, offset } = paginacao(url.searchParams.get('limit'), url.searchParams.get('offset'))

  const restritos = await contatosRestritos(supabase, tenantId)

  let query = supabase
    .from('chat_conversations')
    .select('*, chat_contacts(*)', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('ultima_mensagem_em', { ascending: false })
    .range(offset, offset + limit - 1)

  if (restritos.length > 0) query = query.not('contact_id', 'in', listaUuidsFiltro(restritos))
  if (status) query = query.eq('status', status)
  if (instance_id) query = query.eq('instance_id', instance_id)
  if (department_id) query = query.eq('department_id', department_id)

  const { data, count, error: err } = await query

  if (err) return error('Failed to list conversations', 500)
  return json({ data, total: count, limit, offset })
}

async function handleGetConversation(supabase: Db, tenantId: string, conversationId: string) {
  if (!(await conversaDoTenant(supabase, tenantId, conversationId))) return error('Conversation not found', 404)

  const { data: conversation } = await supabase
    .from('chat_conversations')
    .select('*, chat_contacts(*)')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!conversation) return error('Conversation not found', 404)

  const { data: messages } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', tenantId)
    .order('criado_em', { ascending: true })
    .limit(200)

  return json({ ...conversation, messages: messages ?? [] })
}

async function handleAssignConversation(
  supabase: Db,
  tenantId: string,
  conversationId: string,
  body: Record<string, unknown>,
) {
  const { agent_id } = body
  if (!agent_id) return error('Missing required: agent_id')
  if (!(await conversaDoTenant(supabase, tenantId, conversationId))) return error('Conversation not found', 404)
  if (!(await usuarioDoTenant(supabase, tenantId, agent_id))) return error('Agent not found', 404)

  const { error: err } = await supabase
    .from('chat_conversations')
    .update({ atribuido_a: agent_id, status: 'em_atendimento' })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)

  if (err) return error('Failed to assign conversation', 500)
  return json({ success: true })
}

async function handleTransferConversation(
  supabase: Db,
  tenantId: string,
  conversationId: string,
  body: Record<string, unknown>,
) {
  const { department_id, agent_id } = body

  const updates: Record<string, unknown> = {}
  if (department_id) {
    if (!(await departamentoDoTenant(supabase, tenantId, department_id))) return error('Department not found', 404)
    updates.department_id = department_id
  }
  if (agent_id) {
    if (!(await usuarioDoTenant(supabase, tenantId, agent_id))) return error('Agent not found', 404)
    updates.atribuido_a = agent_id
  }

  if (Object.keys(updates).length === 0) {
    return error('Provide department_id or agent_id')
  }
  if (!(await conversaDoTenant(supabase, tenantId, conversationId))) return error('Conversation not found', 404)

  const { error: err } = await supabase
    .from('chat_conversations')
    .update(updates)
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)

  if (err) return error('Failed to transfer conversation', 500)
  return json({ success: true })
}

async function handleCloseConversation(supabase: Db, tenantId: string, conversationId: string) {
  if (!(await conversaDoTenant(supabase, tenantId, conversationId))) return error('Conversation not found', 404)

  const { error: err } = await supabase
    .from('chat_conversations')
    .update({ status: 'encerrada', encerrada_em: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)

  if (err) return error('Failed to close conversation', 500)
  return json({ success: true })
}

async function handleContacts(
  supabase: Db,
  tenantId: string,
  method: string,
  url: URL,
  body?: Record<string, unknown>,
) {
  if (method === 'GET') {
    const { limit, offset } = paginacao(url.searchParams.get('limit'), url.searchParams.get('offset'))
    const search = sanitizarBusca(url.searchParams.get('search'))
    const restritos = await contatosRestritos(supabase, tenantId)

    let query = supabase
      .from('chat_contacts')
      .select('id, instance_id, numero_whatsapp, nome, foto_url, client_id, bloqueado, criado_em, atualizado_em', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('criado_em', { ascending: false })
      .range(offset, offset + limit - 1)

    if (restritos.length > 0) query = query.not('id', 'in', listaUuidsFiltro(restritos))
    if (search) query = query.or(`nome.ilike.%${search}%,numero_whatsapp.ilike.%${search}%`)

    const { data, count, error: err } = await query
    if (err) return error('Failed to list contacts', 500)
    return json({ data, total: count, limit, offset })
  }

  if (method === 'POST' && body) {
    const { instance_id, numero, nome } = body
    if (typeof numero !== 'string' || !numero.trim()) return error('Missing required: numero')
    const instance = await instanciaDoTenant(supabase, tenantId, instance_id)
    if (!instance) return error('Missing or invalid: instance_id', 400)
    // Grupo interno não é criado/alterado pela API.
    if (await chatEhRestrito(supabase, numero, tenantId)) return error('Contact not allowed', 403)

    const numeroLimpo = numero.trim()
    const { data, error: err } = await supabase
      .from('chat_contacts')
      .upsert(
        {
          tenant_id: tenantId,
          instance_id: instance.id,
          numero_whatsapp: numeroLimpo,
          nome: typeof nome === 'string' && nome.trim() ? nome.trim() : numeroLimpo,
        },
        { onConflict: 'instance_id,numero_whatsapp' },
      )
      .select('id, instance_id, numero_whatsapp, nome, criado_em')
      .single()

    if (err) return error('Failed to save contact', 500)
    return json(data, 201)
  }

  return error('Method not allowed', 405)
}

async function handleInstances(supabase: Db, tenantId: string) {
  const { data, error: err } = await supabase
    .from('whatsapp_instances')
    .select('id, nome, numero_whatsapp, ativo')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .order('nome')

  if (err) return error('Failed to list instances', 500)
  return json({ data })
}

// ─── Main router ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  // Licença HTAI (desligada sem HTAI_ENTITLEMENTS_MODE; ver docs/LICENCA-HTAI.md)
  const licencaNegada = await travaDeLicenca(CORS_HEADERS)
  if (licencaNegada) return licencaNegada

  const supabase: Db = createClient(supabaseUrl, supabaseKey)

  // Authenticate via X-API-Key header
  const apiKey = req.headers.get('X-API-Key')
  if (!apiKey) {
    return error('Missing X-API-Key header', 401)
  }

  const auth = await verifyApiKey(supabase, apiKey)
  if (!auth.valid) {
    return error('Invalid or expired API key', 401)
  }
  const tenantId = auth.tenantId

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
      return await handleSendMessage(supabase, tenantId, body)
    }

    // GET /conversations
    if (path === 'conversations' && method === 'GET') {
      if (!hasPermission(auth.permissions, 'list_conversations')) return error('Forbidden', 403)
      return await handleListConversations(supabase, tenantId, url)
    }

    // GET /conversations/:id
    const convMatch = path.match(/^conversations\/([0-9a-f-]+)$/)
    if (convMatch && method === 'GET') {
      if (!hasPermission(auth.permissions, 'list_conversations')) return error('Forbidden', 403)
      return await handleGetConversation(supabase, tenantId, convMatch[1])
    }

    // PATCH /conversations/:id/assign
    const assignMatch = path.match(/^conversations\/([0-9a-f-]+)\/assign$/)
    if (assignMatch && method === 'PATCH') {
      if (!hasPermission(auth.permissions, 'manage_contacts')) return error('Forbidden', 403)
      return await handleAssignConversation(supabase, tenantId, assignMatch[1], body)
    }

    // PATCH /conversations/:id/transfer
    const transferMatch = path.match(/^conversations\/([0-9a-f-]+)\/transfer$/)
    if (transferMatch && method === 'PATCH') {
      if (!hasPermission(auth.permissions, 'manage_contacts')) return error('Forbidden', 403)
      return await handleTransferConversation(supabase, tenantId, transferMatch[1], body)
    }

    // PATCH /conversations/:id/close
    const closeMatch = path.match(/^conversations\/([0-9a-f-]+)\/close$/)
    if (closeMatch && method === 'PATCH') {
      if (!hasPermission(auth.permissions, 'manage_contacts')) return error('Forbidden', 403)
      return await handleCloseConversation(supabase, tenantId, closeMatch[1])
    }

    // GET|POST /contacts
    if (path === 'contacts' && (method === 'GET' || method === 'POST')) {
      if (!hasPermission(auth.permissions, 'manage_contacts')) return error('Forbidden', 403)
      return await handleContacts(supabase, tenantId, method, url, body)
    }

    // GET /instances
    if (path === 'instances' && method === 'GET') {
      if (!hasPermission(auth.permissions, 'view_instances')) return error('Forbidden', 403)
      return await handleInstances(supabase, tenantId)
    }

    return error(`Not found: ${method} /${path}`, 404)
  } catch (err) {
    console.error('[chat-api]', err)
    return error('Internal server error', 500)
  }
})
