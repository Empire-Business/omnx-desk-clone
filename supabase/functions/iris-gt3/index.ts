// Ponte do Desk: código de uso único e credencial por workspace, nunca service
// role compartilhado. Gateway false porque também recebe JWT do outro projeto;
// cada ação possui autenticação própria abaixo, com origens fixadas no servidor.
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { pensar, type MensagemHistorico } from '../_shared/wa-agente-cerebro.ts'
import { esforcoDaEnv } from '../_shared/wa-agente-llm.ts'
import { sanitizarTextoCarteiraGt3 } from '../_shared/iris-gt3-politica.ts'
import { TIPOS_ANOMALIA, nomeSeguro, type TipoAnomalia } from '../_shared/wa-relatorio.ts'
import { resumoContextualCarteiraGt3 } from '../_shared/iris-gt3-resumo.ts'
import { executarPonteTempo, type AcessoTempo } from '../_shared/tempo-resposta-service.ts'
import {
  ErroIrisGt3, carregarCarteiraGt3, carregarEstrategistasGt3, exigirLeitura, exigirUuid, primeiraLinha,
  segredoIris, sha256Iris, type ConexaoIrisGt3, type VinculoIrisGt3,
} from '../_shared/iris-gt3-dados.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info,x-iris-token', 'Access-Control-Allow-Methods': 'POST,OPTIONS' }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }) }
function negar(codigo = 'acesso_negado'): never { throw new ErroIrisGt3(403, codigo, 'Não foi possível confirmar seu acesso à Íris neste workspace.') }
async function exigirPonteServidor(req: Request) {
  const esperado = exigirEnv('IRIS_BRIDGE_SECRET')
  const recebido = req.headers.get('x-iris-bridge-secret') ?? ''
  if (esperado.length < 32 || recebido.length < 32 || recebido.length > 512) negar()
  const a = await sha256Iris(esperado); const b = await sha256Iris(recebido)
  let diferenca = 0
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i)
  if (diferenca !== 0) negar()
}
function exigirEnv(nome: string): string {
  const v = Deno.env.get(nome)?.trim()
  if (!v) throw new ErroIrisGt3(503, 'integracao_nao_configurada', 'A integração GT3 ainda precisa ser configurada pela administração.')
  return v
}
function urlGt3(): string {
  const raw = exigirEnv('GT3_SUPABASE_URL'); let u: URL
  try { u = new URL(raw) } catch { throw new ErroIrisGt3(503, 'integracao_nao_configurada', 'Endereço do GT3 indisponível.') }
  if (u.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname) || u.port || u.username || u.password || u.search || u.hash || !['', '/'].includes(u.pathname)) throw new ErroIrisGt3(503, 'integracao_nao_configurada', 'Endereço do GT3 indisponível.')
  return u.origin
}
const fetchLimitado: typeof fetch = (input, init) => fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(8_000) })
async function corpoLimitado(req: Request | Response): Promise<Record<string, unknown>> {
  const max = 32_768; const reader = req.body?.getReader(); const chunks: Uint8Array[] = []; let n = 0
  if (!reader) throw new ErroIrisGt3(400, 'json_invalido', 'Requisição inválida.')
  try {
    for (;;) { const p = await reader.read(); if (p.done) break; n += p.value.length; if (n > max) { await reader.cancel(); throw new ErroIrisGt3(413, 'corpo_limite', 'Requisição acima do limite.'); } chunks.push(p.value) }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(n); let i = 0; for (const c of chunks) { bytes.set(c, i); i += c.length }
  let x: unknown; try { x = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw new ErroIrisGt3(400, 'json_invalido', 'Requisição inválida.') }
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new ErroIrisGt3(400, 'json_invalido', 'Requisição inválida.')
  return x as Record<string, unknown>
}
interface AtorGt3 { id: string; workspace: string; nome: string; admin: boolean; client: SupabaseClient }
async function atorGt3(jwt: unknown, workspace?: string, precisaAdmin = false): Promise<AtorGt3> {
  if (typeof jwt !== 'string' || jwt.length > 8_192 || jwt.length < 30) negar()
  const client = createClient(urlGt3(), exigirEnv('GT3_SUPABASE_ANON_KEY'), { global: { headers: { Authorization: `Bearer ${jwt}` }, fetch: fetchLimitado }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(jwt)
  if (error || !data.user) negar()
  const id = data.user.id
  const p = exigirLeitura(await client.from('profiles').select('tenant_id,full_name,is_system_bot').eq('user_id', id).maybeSingle()) as { tenant_id: string; full_name: string | null; is_system_bot: boolean } | null
  if (!p || p.is_system_bot || (workspace && p.tenant_id !== workspace)) negar()
  const emp = exigirLeitura(await client.from('employees').select('id,status').eq('tenant_id', p.tenant_id).eq('user_id', id).eq('status', 'active').maybeSingle())
  if (!emp) negar('usuario_inativo')
  // user_roles não tem tenant_id no GT3; identidade já amarrada ao perfil acima.
  const role = exigirLeitura(await client.from('user_roles').select('role').eq('user_id', id).maybeSingle()) as { role: string } | null
  const admin = role?.role === 'admin'
  if (precisaAdmin && !admin) negar('administracao_necessaria')
  return { id, workspace: p.tenant_id, nome: nomeSeguro(p.full_name, 80) ?? 'Pessoa da equipe', admin, client }
}
async function autorizarDesk(req: Request, admin: SupabaseClient) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) negar()
  const client = createClient(exigirEnv('SUPABASE_URL'), exigirEnv('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) negar()
  const permitido = await client.rpc('has_permissao', { p_recurso: 'automacoes-wa', p_acao: 'admin' })
  if (permitido.error || permitido.data !== true) negar()
  const p = exigirLeitura(await admin.from('users').select('id,tenant_id,ativo').eq('id', user.id).maybeSingle()) as { id: string; tenant_id: string; ativo: boolean } | null
  if (!p?.ativo || !p.tenant_id) negar()
  return p
}
async function conexao(admin: SupabaseClient, token: string): Promise<ConexaoIrisGt3> {
  if (!/^iris_[a-zA-Z0-9_-]{43}$/.test(token)) negar()
  const c = exigirLeitura(await admin.from('iris_gt3_connections').select('id,tenant_id,workspace_id,ativo,revisao,expires_at,revoked_at').eq('token_hash', await sha256Iris(token)).maybeSingle()) as ConexaoIrisGt3 | null
  if (!c?.ativo || c.revoked_at || Date.parse(c.expires_at) <= Date.now()) negar('conexao_inativa')
  return c
}
async function vinculo(admin: SupabaseClient, c: ConexaoIrisGt3, id: string): Promise<VinculoIrisGt3> {
  const v = exigirLeitura(await admin.from('iris_gt3_recipients').select('*').eq('tenant_id', c.tenant_id).eq('connection_id', c.id).eq('gt3_user_id', id).maybeSingle()) as VinculoIrisGt3 | null
  if (!v?.ativo) negar('vinculo_inativo')
  return v
}
async function usuarioGt3Atual(c: ConexaoIrisGt3, v: VinculoIrisGt3, token: string) {
  const r = await fetchLimitado(urlGt3() + '/functions/v1/iris-daily', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: exigirEnv('GT3_SUPABASE_ANON_KEY'), 'x-iris-token': token }, body: JSON.stringify({ acao: 'validar_usuario', workspace_id: c.workspace_id, gt3_user_id: v.gt3_user_id }) })
  if (!r.ok) negar('workspace_inativo')
  const x = await corpoLimitado(r)
  if (x.ok !== true || x.ativo !== true || x.desk_user_id !== v.desk_user_id || Number(x.revisao) !== Number(v.revisao)) negar('workspace_inativo')
  return Number(x.connection_revision)
}
async function nomeTenant(admin: SupabaseClient, tenant: string): Promise<string> {
  const r = exigirLeitura(await admin.from('tenants').select('name').eq('id', tenant).maybeSingle()) as { name: string } | null
  return nomeSeguro(r?.name, 100) ?? 'Empresa do Desk'
}
async function acessoAtual(admin: SupabaseClient, token: string, userId: string) {
  const c = await conexao(admin, token); const v = await vinculo(admin, c, userId)
  const gt3Revision = await usuarioGt3Atual(c, v, token)
  return { c, v, gt3Revision, ...await carregarCarteiraGt3(admin, c, v) }
}
async function conferirDepois(admin: SupabaseClient, token: string, antes: Awaited<ReturnType<typeof acessoAtual>>) {
  const depois = await acessoAtual(admin, token, antes.v.gt3_user_id)
  if (depois.scope_hash !== antes.scope_hash || depois.gt3Revision !== antes.gt3Revision) throw new ErroIrisGt3(409, 'acesso_alterado', 'Seu acesso mudou durante a resposta. Abra a conversa novamente.')
  return depois
}
function tiposValidos(raw: unknown): TipoAnomalia[] {
  if (raw === undefined) return [...TIPOS_ANOMALIA]
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 4 || raw.some((x) => typeof x !== 'string' || !TIPOS_ANOMALIA.includes(x as TipoAnomalia))) throw new ErroIrisGt3(400, 'tipos_invalidos', 'Tipos de alerta inválidos.')
  return [...new Set(raw)] as TipoAnomalia[]
}
function historicoValido(raw: unknown): MensagemHistorico[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(-8).flatMap((m) => m && (m.de === 'equipe' || m.de === 'assistente') && typeof m.texto === 'string' ? [{ de: m.de, texto: m.texto.slice(0, 1_200) } as MensagemHistorico] : [])
}
function novoHistorico(antes: MensagemHistorico[], pergunta: string, resposta: string): MensagemHistorico[] {
  const h = [...antes, { de: 'equipe' as const, texto: pergunta.slice(0, 1_200) }, { de: 'assistente' as const, texto: resposta.slice(0, 1_200) }].slice(-8)
  while (new TextEncoder().encode(JSON.stringify(h)).length > 16_000) h.shift()
  return h
}

export async function executarIrisGt3(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Método inválido.' }, 405)
  try {
    const body = await corpoLimitado(req)
    const admin = createClient(exigirEnv('SUPABASE_URL'), exigirEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
    const acao = body.acao
    if (acao === 'emitir_codigo') {
      const desk = await autorizarDesk(req, admin); const workspace = exigirUuid(body.workspace_id)
      const q = await admin.from('iris_gt3_pairing_codes').select('id', { count: 'exact', head: true }).eq('tenant_id', desk.tenant_id).eq('created_by', desk.id).gte('created_at', new Date(Date.now() - 3_600_000).toISOString())
      if (q.error) exigirLeitura(q)
      if ((q.count ?? 0) >= 10) throw new ErroIrisGt3(429, 'limite_codigos', 'Aguarde antes de emitir outro código.')
      const codigo = segredoIris('gt3c_'); const expires = new Date(Date.now() + 600_000).toISOString()
      exigirLeitura(await admin.from('iris_gt3_pairing_codes').insert({ tenant_id: desk.tenant_id, workspace_id: workspace, code_hash: await sha256Iris(codigo), created_by: desk.id, expires_at: expires }))
      return json({ ok: true, codigo, expires_at: expires, workspace_id: workspace })
    }
    if (acao === 'conectar') {
      await exigirPonteServidor(req)
      if (typeof body.codigo !== 'string' || !/^gt3c_[a-zA-Z0-9_-]{43}$/.test(body.codigo)) throw new ErroIrisGt3(400, 'codigo_invalido', 'Código de conexão inválido ou expirado.')
      const ator = await atorGt3(body.gt3_jwt, undefined, true); const token = segredoIris('iris_')
      const r = await admin.rpc('iris_gt3_consume_code', { p_hash: await sha256Iris(body.codigo), p_workspace: ator.workspace, p_token_hash: await sha256Iris(token) })
      if (r.error) throw new ErroIrisGt3(409, 'codigo_invalido', 'Código expirado, já utilizado ou de outro workspace.')
      const c = primeiraLinha(r.data) as ConexaoIrisGt3 | null; if (!c) negar()
      return json({ ok: true, conexao_id: c.id, workspace_id: c.workspace_id, tenant_nome: await nomeTenant(admin, c.tenant_id), token, expires_at: c.expires_at })
    }
    const token = req.headers.get('x-iris-token') ?? ''; const c = await conexao(admin, token)
    if (['tempo_resposta_candidatos', 'tempo_resposta_confirmar', 'tempo_resposta_recibo', 'tempo_resposta_agenda'].includes(String(acao))) {
      await exigirPonteServidor(req)
      const r = await executarPonteTempo({ admin, c,
        acesso: async (id) => await acessoAtual(admin, token, id) as AcessoTempo,
        reconferir: async (antes) => await conferirDepois(admin, token, antes as Awaited<ReturnType<typeof acessoAtual>>),
      }, body)
      return json(r)
    }
    if (acao === 'resumo') {
      const userId = exigirUuid(body.gt3_user_id); const antes = await acessoAtual(admin, token, userId)
      const r = await resumoContextualCarteiraGt3({
        admin, escopo: antes.escopo, nomePessoa: antes.desk_user_nome,
        apiKey: exigirEnv('OPENROUTER_API_KEY'), modelo: Deno.env.get('WA_AGENTE_MODELO'),
        esforco: esforcoDaEnv(Deno.env.get('WA_AGENTE_ESFORCO')),
      }, tiposValidos(body.tipos))
      await conferirDepois(admin, token, antes)
      return json({ ok: true, ...r, scope_hash: antes.scope_hash, vinculo_revisao: antes.v.revisao })
    }
    const ator = await atorGt3(body.gt3_jwt, c.workspace_id, ['status', 'estrategistas', 'destinatarios', 'salvar_destinatario', 'revogar'].includes(String(acao)))
    if (acao === 'status') return json({ ok: true, conexao_id: c.id, workspace_id: c.workspace_id, tenant_nome: await nomeTenant(admin, c.tenant_id), expires_at: c.expires_at })
    if (acao === 'revogar') {
      exigirLeitura(await admin.from('iris_gt3_connections').update({ ativo: false, revoked_at: new Date().toISOString(), revisao: Number(c.revisao) + 1 }).eq('id', c.id).eq('tenant_id', c.tenant_id).eq('revisao', c.revisao).select('id').single())
      return json({ ok: true })
    }
    if (acao === 'estrategistas') {
      const usuarios = await carregarEstrategistasGt3(admin, c.tenant_id)
      const estrategistas = []
      for (const u of usuarios) {
        const v = { id: c.id, tenant_id: c.tenant_id, connection_id: c.id, gt3_user_id: ator.id, desk_user_id: u.id, ativo: true, modo_teste: false, revisao: 0 }
        const e = await carregarCarteiraGt3(admin, c, v)
        estrategistas.push({ id: u.id, nome: e.desk_user_nome, clientes: e.clientes })
      }
      return json({ ok: true, estrategistas })
    }
    if (acao === 'salvar_destinatario') {
      const target = exigirUuid(body.gt3_user_id); const deskId = exigirUuid(body.desk_user_id)
      if (typeof body.ativo !== 'boolean' || typeof body.modo_teste !== 'boolean') throw new ErroIrisGt3(400, 'parametros_invalidos', 'Preencha os dados do cadastro.')
      if (body.ativo) {
        const p = exigirLeitura(await ator.client.from('employees').select('id').eq('tenant_id', c.workspace_id).eq('user_id', target).eq('status', 'active').maybeSingle())
        if (!p) negar('usuario_inativo')
      } else {
        const anterior = exigirLeitura(await admin.from('iris_gt3_recipients').select('desk_user_id').eq('tenant_id', c.tenant_id).eq('connection_id', c.id).eq('gt3_user_id', target).maybeSingle()) as { desk_user_id: string } | null
        if (anterior?.desk_user_id !== deskId) negar('vinculo_inativo')
      }
      const r = await admin.rpc('iris_gt3_save_recipient', { p_connection: c.id, p_gt3_user: target, p_desk_user: deskId, p_ativo: body.ativo, p_teste: body.modo_teste, p_actor: ator.id })
      if (r.error) throw new ErroIrisGt3(409, 'cadastro_nao_salvo', 'Não foi possível salvar esse vínculo. Confira as pessoas e tente novamente.')
      const v = primeiraLinha(r.data) as VinculoIrisGt3
      // Desativado não abre carteira; devolve apenas cadastro administrativo.
      const e = v.ativo ? await carregarCarteiraGt3(admin, c, v) : { clientes: [], desk_user_nome: 'Estrategista' }
      return json({ ok: true, vinculo: { id: v.id, gt3_user_id: v.gt3_user_id, desk_user_id: v.desk_user_id, desk_user_nome: e.desk_user_nome, ativo: v.ativo, modo_teste: v.modo_teste, revisao: v.revisao, clientes: e.clientes } })
    }
    if (acao === 'destinatarios') {
      const rows = exigirLeitura(await admin.from('iris_gt3_recipients').select('*').eq('tenant_id', c.tenant_id).eq('connection_id', c.id).limit(201)) as VinculoIrisGt3[]
      if (rows.length > 200) throw new ErroIrisGt3(422, 'lista_limite', 'Há vínculos demais para esta conexão.')
      const out = []
      for (const v of rows) {
        let e = { clientes: [] as { id: string; nome: string }[], desk_user_nome: 'Estrategista' }
        let ativo = v.ativo
        if (ativo) {
          try { e = await carregarCarteiraGt3(admin, c, v) }
          catch (erro) {
            if (!(erro instanceof ErroIrisGt3) || erro.codigo !== 'vinculo_inativo') throw erro
            ativo = false; e.desk_user_nome = 'Estrategista indisponível'
          }
        }
        out.push({ id: v.id, gt3_user_id: v.gt3_user_id, desk_user_id: v.desk_user_id, desk_user_nome: e.desk_user_nome, ativo, modo_teste: v.modo_teste, revisao: v.revisao, clientes: e.clientes })
      }
      return json({ ok: true, vinculos: out })
    }
    if (acao === 'meu_acesso') {
      const v = exigirLeitura(await admin.from('iris_gt3_recipients').select('*').eq('tenant_id', c.tenant_id).eq('connection_id', c.id).eq('gt3_user_id', ator.id).maybeSingle()) as VinculoIrisGt3 | null
      if (!v) return json({ ok: true, vinculo: null })
      if (!v.ativo) return json({ ok: true, vinculo: { id: v.id, gt3_user_id: ator.id, desk_user_id: v.desk_user_id, desk_user_nome: 'Estrategista', ativo: false, modo_teste: v.modo_teste, revisao: v.revisao, clientes: [] } })
      const e = await carregarCarteiraGt3(admin, c, v)
      return json({ ok: true, vinculo: { id: v.id, gt3_user_id: ator.id, desk_user_id: v.desk_user_id, desk_user_nome: e.desk_user_nome, ativo: v.ativo, modo_teste: v.modo_teste, revisao: v.revisao, clientes: e.clientes }, scope_hash: e.scope_hash })
    }
    if (acao !== 'conversar') throw new ErroIrisGt3(400, 'acao_invalida', 'Ação indisponível.')
    const requestId = exigirUuid(body.request_id)
    if (typeof body.pergunta !== 'string' || !body.pergunta.trim() || body.pergunta.length > 4000) throw new ErroIrisGt3(400, 'pergunta_invalida', 'Escreva uma pergunta de até 4 mil caracteres.')
    const pergunta = body.pergunta.trim(); const antes = await acessoAtual(admin, token, ator.id)
    const inicio = await admin.rpc('iris_gt3_begin_chat', { p_connection: c.id, p_gt3_user: ator.id, p_request: requestId, p_scope_hash: antes.scope_hash })
    if (inicio.error) throw new ErroIrisGt3(429, 'conversa_ocupada', 'Aguarde a resposta atual ou tente novamente em instantes.')
    const lease = inicio.data as { cached: boolean; texto?: string; id?: string; lease?: string }
    if (lease.cached && lease.texto) { await conferirDepois(admin, token, antes); return json({ ok: true, texto: lease.texto, scope_hash: antes.scope_hash, vinculo_revisao: antes.v.revisao, nome: 'Íris' }) }
    try {
      const h = exigirLeitura(await admin.from('iris_gt3_context').select('mensagens').eq('tenant_id', c.tenant_id).eq('connection_id', c.id).eq('gt3_user_id', ator.id).eq('scope_hash', antes.scope_hash).gte('updated_at', new Date(Date.now() - 48 * 3_600_000).toISOString()).maybeSingle()) as { mensagens: unknown } | null
      const historico = historicoValido(h?.mensagens)
      const r = await pensar({ admin, escopo: antes.escopo, nomeAgente: 'Íris', canal: 'privado', quemPergunta: ator.nome, pergunta, historico, apiKey: exigirEnv('OPENROUTER_API_KEY'), modelo: Deno.env.get('WA_AGENTE_MODELO'), esforco: esforcoDaEnv(Deno.env.get('WA_AGENTE_ESFORCO')), prazoMs: 45_000 })
      if (!r.ok || !r.texto) throw new ErroIrisGt3(503, 'resposta_indisponivel', 'Não consegui responder agora. Tente novamente em instantes.')
      const texto = sanitizarTextoCarteiraGt3(r.texto)
      await atorGt3(body.gt3_jwt, c.workspace_id)
      await conferirDepois(admin, token, antes)
      const fim = await admin.rpc('iris_gt3_finish_chat', { p_id: lease.id, p_lease: lease.lease, p_connection_revision: Number(c.revisao), p_recipient_revision: Number(antes.v.revisao), p_texto: texto, p_mensagens: novoHistorico(historico, pergunta, texto) })
      if (fim.error || fim.data !== true) throw new ErroIrisGt3(409, 'acesso_alterado', 'Seu acesso mudou durante a resposta. Abra a conversa novamente.')
      return json({ ok: true, texto, scope_hash: antes.scope_hash, vinculo_revisao: antes.v.revisao, nome: 'Íris' })
    } catch (e) {
      if (lease.id && lease.lease) await admin.from('iris_gt3_requests').update({ status: 'failed' }).eq('tenant_id', c.tenant_id).eq('id', lease.id).eq('lease', lease.lease).eq('status', 'running')
      throw e
    }
  } catch (e) {
    if (e instanceof ErroIrisGt3) return json({ ok: false, error: e.message, codigo: e.codigo }, e.status)
    // Nunca serializar erros de auth/DB ou corpos com JWT/código/credencial.
    console.error('iris-gt3: falha não detalhada', e instanceof Error ? e.name : 'unknown')
    return json({ ok: false, error: 'Não foi possível acessar a Íris. Tente novamente.', codigo: 'indisponivel' }, 503)
  }
}
if (import.meta.main) servirComLicenca(executarIrisGt3)
