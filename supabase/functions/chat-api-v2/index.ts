// API externa do Chat v2 (X-API-Key; chat-api original segue intacta, sem mudanças). Roda com service_role (sem RLS); a lógica de leitura e o
// filtro por empresa ficam em _shared/chat-api-nucleo.ts (compartilhado com o MCP desk-mcp).
// Contrato: public/docs/api/openapi.yaml. Notas: docs/API-MCP.md.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { chatEhRestrito } from '../_shared/chat-restrito.ts'
import { travaDeLicenca } from '../_shared/htai-licenca.ts'
import {
  auditar,
  conversaDoTenant,
  consumirLimite,
  departamentoDoTenant,
  instanciaDoTenant,
  listarContatos,
  listarConversas,
  listarInstancias,
  obterConversa,
  usuarioDoTenant,
  verificarChave,
} from '../_shared/chat-api-nucleo.ts'
import {
  caminhoDaRota,
  corsHeaders,
  ENVIO_PELA_API,
  extrairChave,
  origensPermitidas,
  rotaNormalizada,
  temPermissao,
} from '../_shared/chat-api-v2-regras.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ORIGENS = origensPermitidas(Deno.env.get('CHAT_API_ALLOWED_ORIGINS'))

type Db = SupabaseClient

const BASE = corsHeaders(null, [])
function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...BASE, ...extra } })
}
function error(message: string, status = 400, extra: Record<string, string> = {}) {
  return json({ error: message }, status, extra)
}
const saida = (r: { ok: true; data: unknown } | { ok: false; status: number; erro: string }) =>
  r.ok ? json(r.data) : error(r.erro, r.status)

// ─── Escrita ────────────────────────────────────────────────────────────────

async function handleAssignConversation(db: Db, tenantId: string, conversationId: string, body: Record<string, unknown>) {
  const { agent_id } = body
  if (!agent_id) return error('Missing required: agent_id')
  if (!(await conversaDoTenant(db, tenantId, conversationId))) return error('Conversation not found', 404)
  if (!(await usuarioDoTenant(db, tenantId, agent_id))) return error('Agent not found', 404)
  const { error: err } = await db
    .from('chat_conversations')
    .update({ agente_id: agent_id, status: 'em_atendimento' })
    .eq('id', conversationId).eq('tenant_id', tenantId)
  if (err) return error('Failed to assign conversation', 500)
  return json({ success: true })
}

async function handleTransferConversation(db: Db, tenantId: string, conversationId: string, body: Record<string, unknown>) {
  const { department_id, agent_id } = body
  const updates: Record<string, unknown> = {}
  if (department_id) {
    if (!(await departamentoDoTenant(db, tenantId, department_id))) return error('Department not found', 404)
    updates.department_id = department_id
  }
  if (agent_id) {
    if (!(await usuarioDoTenant(db, tenantId, agent_id))) return error('Agent not found', 404)
    updates.agente_id = agent_id
  }
  if (Object.keys(updates).length === 0) return error('Provide department_id or agent_id')
  if (!(await conversaDoTenant(db, tenantId, conversationId))) return error('Conversation not found', 404)
  const { error: err } = await db
    .from('chat_conversations').update(updates).eq('id', conversationId).eq('tenant_id', tenantId)
  if (err) return error('Failed to transfer conversation', 500)
  return json({ success: true })
}

async function handleCloseConversation(db: Db, tenantId: string, conversationId: string) {
  if (!(await conversaDoTenant(db, tenantId, conversationId))) return error('Conversation not found', 404)
  const { error: err } = await db
    .from('chat_conversations')
    .update({ status: 'encerrada', encerrada_em: new Date().toISOString() })
    .eq('id', conversationId).eq('tenant_id', tenantId)
  if (err) return error('Failed to close conversation', 500)
  return json({ success: true })
}

async function handleCreateContact(db: Db, tenantId: string, body: Record<string, unknown>) {
  const { instance_id, numero, nome } = body
  if (typeof numero !== 'string' || !numero.trim()) return error('Missing required: numero')
  const instance = await instanciaDoTenant(db, tenantId, instance_id)
  if (!instance) return error('Missing or invalid: instance_id', 400)
  // Grupo interno não é criado/alterado pela API.
  if (await chatEhRestrito(db, numero, tenantId)) return error('Contact not allowed', 403)
  const numeroLimpo = numero.trim()
  const { data, error: err } = await db
    .from('chat_contacts')
    .upsert(
      {
        tenant_id: tenantId,
        instance_id: instance.id,
        numero_whatsapp: numeroLimpo,
        nome: typeof nome === 'string' && nome.trim() ? nome.trim().slice(0, 200) : numeroLimpo,
      },
      { onConflict: 'instance_id,numero_whatsapp' },
    )
    .select('id, instance_id, numero_whatsapp, nome, criado_em')
    .single()
  if (err) return error('Failed to save contact', 500)
  return json(data, 201)
}

// ─── Roteador ───────────────────────────────────────────────────────────────

async function rotear(req: Request, db: Db, tenantId: string, permissions: string[], path: string, url: URL) {
  const method = req.method
  let body: Record<string, unknown> = {}
  if (['POST', 'PATCH', 'PUT'].includes(method)) {
    try {
      const lido = await req.json()
      if (lido && typeof lido === 'object' && !Array.isArray(lido)) body = lido as Record<string, unknown>
    } catch {
      // corpo vazio é aceito em alguns endpoints
    }
  }
  const exige = (p: string) => temPermissao(permissions, p)

  if (path === 'send-message' && method === 'POST') {
    if (!exige('send_message')) return error('Forbidden', 403)
    if (!ENVIO_PELA_API) {
      // Regra do dono: número não oficial só envia texto humanizado por LLM; esta rota enviaria texto cru.
      return error('send-message is unavailable: outbound messages must go through the humanized path', 501)
    }
  }
  if (path === 'conversations' && method === 'GET') {
    if (!exige('list_conversations')) return error('Forbidden', 403)
    return saida(await listarConversas(db, tenantId, {
      status: url.searchParams.get('status'),
      instance_id: url.searchParams.get('instance_id'),
      department_id: url.searchParams.get('department_id'),
      limit: url.searchParams.get('limit'),
      offset: url.searchParams.get('offset'),
    }))
  }
  const conv = path.match(/^conversations\/([0-9a-f-]{36})(?:\/(assign|transfer|close))?$/i)
  if (conv) {
    const [, id, acao] = conv
    if (!acao && method === 'GET') {
      if (!exige('list_conversations')) return error('Forbidden', 403)
      return saida(await obterConversa(db, tenantId, id, url.searchParams.get('messages_limit')))
    }
    if (acao && method === 'PATCH') {
      if (!exige('manage_contacts')) return error('Forbidden', 403)
      if (acao === 'assign') return await handleAssignConversation(db, tenantId, id, body)
      if (acao === 'transfer') return await handleTransferConversation(db, tenantId, id, body)
      return await handleCloseConversation(db, tenantId, id)
    }
  }
  if (path === 'contacts' && (method === 'GET' || method === 'POST')) {
    if (!exige('manage_contacts')) return error('Forbidden', 403)
    if (method === 'GET') {
      return saida(await listarContatos(db, tenantId, {
        search: url.searchParams.get('search'),
        limit: url.searchParams.get('limit'),
        offset: url.searchParams.get('offset'),
      }))
    }
    return await handleCreateContact(db, tenantId, body)
  }
  if (path === 'instances' && method === 'GET') {
    if (!exige('view_instances')) return error('Forbidden', 403)
    return saida(await listarInstancias(db, tenantId))
  }
  return error(`Not found: ${method} /${path}`, 404)
}

Deno.serve(async (req) => {
  const resp = await tratar(req)
  // CORS por requisição (sem estado global): só origem liberada recebe Access-Control-*.
  const cors = corsHeaders(req.headers.get('origin'), ORIGENS)
  for (const [k, v] of Object.entries(cors)) if (k.startsWith('Access-Control-')) resp.headers.set(k, v)
  return resp
})

async function tratar(req: Request): Promise<Response> {
  const inicio = Date.now()
  const cors = corsHeaders(req.headers.get('origin'), ORIGENS)

  if (req.method === 'OPTIONS') {
    // Preflight só é respondido para origem liberada.
    return cors['Access-Control-Allow-Origin']
      ? new Response(null, { status: 204, headers: cors })
      : new Response(null, { status: 403, headers: cors })
  }

  // Licença HTAI da instalação (contrato §4): negada, responde 402 antes de qualquer
  // trabalho (mesmo texto por motivo das outras funções). Fora do escopo instalação
  // (`HTAI_ENTITLEMENTS_MODE` ausente ou 'off') nada muda.
  const licencaNegada = await travaDeLicenca(cors)
  if (licencaNegada) return licencaNegada

  const chave = extrairChave(req.headers)
  if (!chave) return error('Missing or malformed API key (use the X-API-Key header)', 401)

  const db: Db = createClient(supabaseUrl, supabaseKey)
  const auth = await verificarChave(db, chave)
  if (!auth.valid) return error('Invalid or expired API key', 401)

  const url = new URL(req.url)
  const path = caminhoDaRota(url.pathname)
  const rota = rotaNormalizada(req.method, path)
  const fim = (resp: Response) => auditar(db, {
    tenantId: auth.tenantId, keyId: auth.keyId, canal: 'rest', metodo: req.method, rota, status: resp.status, inicio,
  }).then(() => resp)

  const limite = await consumirLimite(db, auth.keyId, Deno.env.get('CHAT_API_RATE_LIMIT'))
  if (!limite.permitido) {
    return await fim(error('Rate limit exceeded', 429, { 'Retry-After': String(limite.resetSeg) }))
  }

  try {
    const resp = await rotear(req, db, auth.tenantId, auth.permissions, path, url)
    resp.headers.set('X-RateLimit-Remaining', String(limite.restante))
    return await fim(resp)
  } catch (err) {
    console.error('[chat-api-v2]', err instanceof Error ? err.message : 'erro')
    return await fim(error('Internal server error', 500))
  }
}
