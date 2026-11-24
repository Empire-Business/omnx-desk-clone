// MCP remoto do Desk (JSON-RPC 2.0 sobre HTTP, stateless). Somente leitura.
// Auth: a mesma chave edk_ da API REST, em "Authorization: Bearer edk_..." ou "X-API-Key".
// Guia: public/docs/mcp.html e docs/API-MCP.md.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  auditar,
  consumirLimite,
  listarContatos,
  listarConversas,
  listarInstancias,
  obterConversa,
  verificarChave,
} from '../_shared/chat-api-nucleo.ts'
import { extrairChave } from '../_shared/chat-api-v2-regras.ts'
import { travaDeLicenca } from '../_shared/htai-licenca.ts'
import { LIMITE_CORPO_BYTES, processarMensagem } from '../_shared/desk-mcp-protocolo.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}
const resp = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } })
const rpcErro = (code: number, message: string, status: number, extra: Record<string, string> = {}) =>
  resp({ jsonrpc: '2.0', id: null, error: { code, message } }, status, extra)

/** Lê o corpo em stream e para ao passar do teto (nunca carrega corpo gigante inteiro). null = estourou. */
async function lerCorpoLimitado(req: Request, teto: number): Promise<string | null> {
  const declarado = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declarado) && declarado > teto) return null
  if (!req.body) return ''
  const leitor = req.body.getReader()
  const partes: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    total += value.length
    if (total > teto) {
      await leitor.cancel().catch(() => {})
      return null
    }
    partes.push(value)
  }
  const tudo = new Uint8Array(total)
  let pos = 0
  for (const p of partes) { tudo.set(p, pos); pos += p.length }
  return new TextDecoder().decode(tudo)
}

Deno.serve(async (req) => {
  const inicio = Date.now()
  // Cliente MCP é programa/CLI, não navegador: sem CORS. Preflight e GET (SSE) não são suportados.
  if (req.method !== 'POST') return resp({ error: 'Use POST (JSON-RPC)' }, 405, { Allow: 'POST' })

  // Cliente MCP é programa, não navegador: pedido com Origin (página web) é recusado.
  if (req.headers.get('origin')) return rpcErro(-32003, 'Origem não permitida', 403)

  // Licença HTAI da instalação (contrato §4): negada, responde 402 antes de qualquer
  // trabalho (mesmo texto por motivo das outras funções). Fora do escopo instalação
  // (`HTAI_ENTITLEMENTS_MODE` ausente ou 'off') nada muda.
  const licencaNegada = await travaDeLicenca(HEADERS)
  if (licencaNegada) return licencaNegada

  const chave = extrairChave(req.headers)
  if (!chave) return rpcErro(-32001, 'Chave ausente ou malformada', 401, { 'WWW-Authenticate': 'Bearer realm="omnx-desk-mcp"' })

  const db = createClient(supabaseUrl, supabaseKey)
  const auth = await verificarChave(db, chave)
  if (!auth.valid) return rpcErro(-32001, 'Chave inválida ou expirada', 401, { 'WWW-Authenticate': 'Bearer realm="omnx-desk-mcp"' })

  const limite = await consumirLimite(db, auth.keyId, Deno.env.get('CHAT_API_RATE_LIMIT'))
  let rota = 'invalida'
  let status = 200
  const finalizar = async (r: Response) => {
    await auditar(db, { tenantId: auth.tenantId, keyId: auth.keyId, canal: 'mcp', metodo: 'POST', rota, status: status === 200 ? r.status : status, inicio })
    return r
  }
  if (!limite.permitido) {
    status = 429
    rota = 'rate_limited'
    return await finalizar(rpcErro(-32002, 'Limite de requisições excedido', 429, { 'Retry-After': String(limite.resetSeg) }))
  }

  let msg: unknown
  try {
    const bruto = await lerCorpoLimitado(req, LIMITE_CORPO_BYTES)
    if (bruto === null) return await finalizar(rpcErro(-32600, 'Corpo grande demais', 413))
    msg = JSON.parse(bruto)
  } catch {
    return await finalizar(rpcErro(-32700, 'JSON inválido', 400))
  }

  try {
    const r = await processarMensagem(msg, { permissoes: auth.permissions }, async (ferramenta, args) => {
      const t = auth.tenantId
      const s = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : null)
      const out =
        ferramenta === 'list_instances' ? await listarInstancias(db, t)
        : ferramenta === 'list_conversations' ? await listarConversas(db, t, {
            status: s('status'), instance_id: s('instance_id'), department_id: s('department_id'), limit: s('limit'), offset: s('offset'),
          })
        : ferramenta === 'get_conversation' ? await obterConversa(db, t, s('conversation_id') ?? '', s('messages_limit'))
        : ferramenta === 'list_contacts' ? await listarContatos(db, t, { search: s('search'), limit: s('limit'), offset: s('offset') })
        : null
      if (!out) return { ok: false as const, erro: 'Ferramenta desconhecida' }
      return out.ok ? { ok: true as const, data: out.data } : { ok: false as const, erro: out.erro }
    })
    const metodo = msg && typeof msg === 'object' ? String((msg as Record<string, unknown>).method ?? '').slice(0, 40) : ''
    rota = r.ferramenta ? `tools/call:${r.ferramenta}` : metodo || 'invalida'
    return await finalizar(r.status === 202 ? resp(null, 202) : resp(r.body))
  } catch (err) {
    console.error('[desk-mcp]', err instanceof Error ? err.message : 'erro')
    status = 500
    return await finalizar(rpcErro(-32603, 'Erro interno', 500))
  }
})
