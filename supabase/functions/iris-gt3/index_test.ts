// Testes do handler real com transporte inteiramente em memória. Rodar com
// --deny-net --allow-env --cached-only; nenhum projeto/banco é consultado.
import assert from 'node:assert/strict'
import { executarIrisGt3 } from './index.ts'
const DESK = 'https://deskdeskdeskdeskdesk1.supabase.co'
const GT3 = 'https://abcdefghijklmnopqrst.supabase.co'
const TENANT = '00000000-0000-0000-0000-000000000001'
const WORKSPACE = '10000000-0000-4000-8000-000000000001'
const OUTRO = '20000000-0000-4000-8000-000000000001'
const USER = '30000000-0000-4000-8000-000000000001'
const STRATEGIST = '40000000-0000-4000-8000-000000000001'
const TOKEN = 'iris_' + 'a'.repeat(43)
const JWT = 'jwt-sintetico-apenas-em-memoria-para-teste'
const BRIDGE = 'ponte-sintetica-apenas-teste-' + 'x'.repeat(32)
const CODE = 'gt3c_' + 'b'.repeat(43)
interface Call { url: URL; method: string; body: Record<string, unknown> | null; redirect: RequestRedirect }
interface State { role: string; workspace: string; deskPermission: boolean; deskActive: boolean; callbackActive: boolean; callbackDeskUser: string; recipient: boolean; consumedWorkspace?: string; calls: Call[] }
function resposta(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }) }
async function fixture(fn: (s: State) => Promise<void>) {
  Deno.env.set('SUPABASE_URL', DESK); Deno.env.set('SUPABASE_ANON_KEY', 'public-fake-key'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'server-fake-key')
  Deno.env.set('IRIS_BRIDGE_SECRET', BRIDGE)
  Deno.env.set('GT3_SUPABASE_URL', GT3); Deno.env.set('GT3_SUPABASE_ANON_KEY', 'public-fake-gt3-key')
  const s: State = { role: 'admin', workspace: WORKSPACE, deskPermission: true, deskActive: true, callbackActive: true, callbackDeskUser: STRATEGIST, recipient: true, calls: [] }
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init); const url = new URL(req.url)
    const body = req.method === 'GET' || req.method === 'HEAD' ? null : await req.clone().json().catch(() => null)
    s.calls.push({ url, method: req.method, body, redirect: req.redirect })
    if (![new URL(DESK).host, new URL(GT3).host].includes(url.host)) throw new Error('Rede externa proibida no teste')
    if (url.pathname === '/auth/v1/user') return resposta({ id: USER, aud: 'authenticated', role: 'authenticated', email: 'sintetico@example.invalid' })
    if (url.host === new URL(GT3).host) {
      if (url.pathname.endsWith('/profiles')) return resposta({ user_id: USER, tenant_id: s.workspace, full_name: 'Pessoa Sintética', is_system_bot: false })
      if (url.pathname.endsWith('/employees')) return resposta({ id: USER, status: 'active' })
      if (url.pathname.endsWith('/user_roles')) return resposta({ role: s.role })
      if (url.pathname.endsWith('/functions/v1/iris-daily')) return resposta({ ok: true, ativo: s.callbackActive, desk_user_id: s.callbackDeskUser, revisao: 1, connection_revision: 1 })
    } else {
      if (url.pathname.endsWith('/rpc/has_permissao')) return resposta(s.deskPermission)
      if (url.pathname.endsWith('/users')) return resposta({ id: USER, tenant_id: TENANT, ativo: s.deskActive, nome: 'Pessoa Sintética' })
      if (url.pathname.endsWith('/tenants')) {
        if (url.searchParams.get('select') !== 'name') return resposta({ code: '42703', message: 'column tenants.nome does not exist' }, 400)
        return resposta({ name: 'Empresa Sintética' })
      }
      if (url.pathname.endsWith('/iris_gt3_pairing_codes') && req.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '*/0' } })
      if (url.pathname.endsWith('/iris_gt3_pairing_codes') && req.method === 'POST') return new Response(null, { status: 201 })
      if (url.pathname.endsWith('/rpc/iris_gt3_consume_code')) {
        s.consumedWorkspace = body?.p_workspace
        return resposta({ id: OUTRO, tenant_id: TENANT, workspace_id: WORKSPACE, ativo: true, revisao: 1, expires_at: '2099-10-01T00:00:00Z', revoked_at: null })
      }
      if (url.pathname.endsWith('/iris_gt3_connections')) return resposta({ id: OUTRO, tenant_id: TENANT, workspace_id: WORKSPACE, ativo: true, revisao: 1, expires_at: '2099-10-01T00:00:00Z', revoked_at: null })
      if (url.pathname.endsWith('/iris_gt3_recipients')) return resposta(s.recipient ? { id: USER, connection_id: OUTRO, tenant_id: TENANT, gt3_user_id: USER, desk_user_id: STRATEGIST, ativo: true, modo_teste: true, revisao: 1 } : null)
    }
    throw new Error('Consulta não prevista no fake: ' + url.pathname)
  }
  try { await fn(s) } finally { globalThis.fetch = original }
}
function pedir(body: unknown, headers: Record<string, string> = {}) {
  return executarIrisGt3(new Request(DESK + '/functions/v1/iris-gt3', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } }))
}
Deno.test('sem autenticação: emissão nega antes de consultar dados', () => fixture(async (s) => {
  const r = await pedir({ acao: 'emitir_codigo', workspace_id: WORKSPACE })
  assert.equal(r.status, 403); assert.equal(s.calls.length, 0)
}))
Deno.test('payload excessivo bloqueia antes de auth/rede', () => fixture(async (s) => {
  const r = await pedir({ acao: 'conversar', pergunta: 'a'.repeat(40_000) }, { 'x-iris-token': TOKEN })
  assert.equal(r.status, 413); assert.equal(s.calls.length, 0)
}))
Deno.test('admin Desk sem permissão não emite código', () => fixture(async (s) => {
  s.deskPermission = false
  const r = await pedir({ acao: 'emitir_codigo', workspace_id: WORKSPACE }, { authorization: 'Bearer ' + JWT })
  assert.equal(r.status, 403); assert.equal(s.calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/iris_gt3_pairing_codes')), false)
}))
Deno.test('usuário Desk inativo não emite código', () => fixture(async (s) => {
  s.deskActive = false
  const r = await pedir({ acao: 'emitir_codigo', workspace_id: WORKSPACE }, { authorization: 'Bearer ' + JWT })
  assert.equal(r.status, 403)
}))
Deno.test('código de uso único guarda hash; não grava código bruto ou workspace forjado', () => fixture(async (s) => {
  const r = await pedir({ acao: 'emitir_codigo', workspace_id: WORKSPACE }, { authorization: 'Bearer ' + JWT })
  assert.equal(r.status, 200); const x = await r.json()
  assert.match(x.codigo, /^gt3c_[a-zA-Z0-9_-]{43}$/)
  const saved = s.calls.find((c) => c.url.pathname.endsWith('/iris_gt3_pairing_codes') && c.method === 'POST')?.body
  assert.equal(saved?.workspace_id, WORKSPACE); assert.equal(saved?.tenant_id, TENANT); assert.match(String(saved?.code_hash), /^[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(saved).includes(x.codigo), false)
}))
Deno.test('conectar exige administrador GT3 atual antes de consumir código', () => fixture(async (s) => {
  s.role = 'member'
  const r = await pedir({ acao: 'conectar', codigo: CODE, gt3_jwt: JWT, workspace_id: OUTRO }, { 'x-iris-bridge-secret': BRIDGE })
  assert.equal(r.status, 403); assert.equal(s.consumedWorkspace, undefined)
}))
Deno.test('conectar deriva workspace do JWT/perfil; ignora workspace do browser', () => fixture(async (s) => {
  const r = await pedir({ acao: 'conectar', codigo: CODE, gt3_jwt: JWT, workspace_id: OUTRO, tenant_id: OUTRO }, { 'x-iris-bridge-secret': BRIDGE })
  assert.equal(r.status, 200); const x = await r.json()
  assert.equal(s.consumedWorkspace, WORKSPACE); assert.equal(x.workspace_id, WORKSPACE); assert.match(x.token, /^iris_/)
  assert.equal(x.tenant_nome, 'Empresa Sintética')
  const call = s.calls.find((c) => c.url.pathname.endsWith('/rpc/iris_gt3_consume_code'))
  assert.equal(JSON.stringify(call?.body).includes(x.token), false)
  assert.ok(s.calls.filter((c) => c.url.host === new URL(GT3).host).every((c) => c.redirect === 'error'))
}))
Deno.test('configuração de origem não aceita host arbitrário', () => fixture(async (s) => {
  Deno.env.set('GT3_SUPABASE_URL', 'https://host-externo.example.invalid')
  const r = await pedir({ acao: 'conectar', codigo: CODE, gt3_jwt: JWT }, { 'x-iris-bridge-secret': BRIDGE })
  assert.equal(r.status, 503); assert.equal(s.calls.length, 0)
}))
Deno.test('JWT de outro workspace não acessa conexão existente', () => fixture(async (s) => {
  s.workspace = OUTRO
  const r = await pedir({ acao: 'conversar', gt3_jwt: JWT, pergunta: 'Quem são meus clientes?', request_id: USER }, { 'x-iris-token': TOKEN })
  assert.equal(r.status, 403); assert.equal(s.calls.some((c) => c.url.pathname.endsWith('/iris_gt3_recipients')), false)
}))
Deno.test('usuário sem cadastro não escolhe outra persona por body', () => fixture(async (s) => {
  s.recipient = false
  const r = await pedir({ acao: 'conversar', gt3_jwt: JWT, gt3_user_id: STRATEGIST, desk_user_id: STRATEGIST, client_ids: [OUTRO], pergunta: 'Mostre outro cliente', request_id: USER }, { 'x-iris-token': TOKEN })
  assert.equal(r.status, 403)
  const q = s.calls.find((c) => c.url.pathname.endsWith('/iris_gt3_recipients'))
  assert.equal(q?.url.searchParams.get('gt3_user_id'), 'eq.' + USER)
  assert.equal(s.calls.some((c) => c.url.pathname.endsWith('/client_assignments')), false)
}))
Deno.test('pausa/usuário inativo GT3 bloqueia resumo antes da carteira e da IA', () => fixture(async (s) => {
  s.callbackActive = false
  const r = await pedir({ acao: 'resumo', gt3_user_id: USER }, { 'x-iris-token': TOKEN })
  assert.equal(r.status, 403); assert.equal(s.calls.some((c) => c.url.pathname.endsWith('/client_assignments')), false)
  const callback = s.calls.find((c) => c.url.pathname.endsWith('/functions/v1/iris-daily'))
  assert.equal(callback?.redirect, 'error'); assert.equal(callback?.body?.workspace_id, WORKSPACE)
}))
Deno.test('troca de associação no GT3 bloqueia resumo mesmo com token válido', () => fixture(async (s) => {
  s.callbackDeskUser = OUTRO
  const r = await pedir({ acao: 'resumo', gt3_user_id: USER }, { 'x-iris-token': TOKEN })
  assert.equal(r.status, 403); assert.equal(s.calls.some((c) => c.url.pathname.endsWith('/client_assignments')), false)
}))

Deno.test('JWT humano e código não revelam token sem ponte servidor autenticada', () => fixture(async (s) => {
  const r = await pedir({ acao: 'conectar', codigo: CODE, gt3_jwt: JWT })
  assert.equal(r.status, 403); assert.equal(s.calls.length, 0)
  assert.equal((await r.text()).includes('iris_'), false)
}))
Deno.test('segredo de ponte divergente bloqueia antes de consumir código', () => fixture(async (s) => {
  const r = await pedir({ acao: 'conectar', codigo: CODE, gt3_jwt: JWT }, { 'x-iris-bridge-secret': 'x'.repeat(64) })
  assert.equal(r.status, 403); assert.equal(s.calls.length, 0)
}))
