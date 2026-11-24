import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enriquecerPainelTempo, type BaseTempo } from './tempo-resposta-service.ts'
import type { AgendaProjetada } from './tempo-resposta-agenda.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function resposta(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } }) }
class Falha extends Error { constructor(readonly status: number, mensagem: string) { super(mensagem) } }
function exigir(ok: unknown, texto = 'Confira os dados informados.'): asserts ok { if (!ok) throw new Falha(400, texto) }
function uuid(v: unknown): v is string { return typeof v === 'string' && UUID.test(v) }
export async function corpoTempo(req: Request): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader(); if (!reader) throw new Falha(400, 'Pedido vazio.')
  const partes: Uint8Array[] = []; let total = 0
  try { for (;;) { const r = await reader.read(); if (r.done) break; total += r.value.length; if (total > 16_384) { await reader.cancel(); throw new Falha(413, 'Pedido acima do limite.'); } partes.push(r.value) } }
  finally { reader.releaseLock() }
  const bytes = new Uint8Array(total); let p = 0; for (const b of partes) { bytes.set(b, p); p += b.length }
  let body: unknown
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw new Falha(400, 'Pedido inválido.') }
  exigir(body && typeof body === 'object' && !Array.isArray(body)); return body as Record<string, unknown>
}
export function comandoAdminTempo(body: Record<string, unknown>): { rpc: string; args: Record<string, unknown> } {
  const acao = String(body.acao)
  const campos: Record<string, string[]> = { painel: ['cursor'], salvar_config: ['revisao', 'modo', 'feriados', 'anos_confirmados'], pausa: ['user_id', 'duracao_minutos', 'motivo'], encerrar_pausa: ['pausa_id'], titular: ['client_id', 'user_id'] }
  exigir(campos[acao] && Object.keys(body).every((c) => c === 'acao' || campos[acao].includes(c)))
  if (acao === 'painel') { exigir(body.cursor == null || uuid(body.cursor)); return { rpc: 'tempo_resposta_painel', args: { p_cursor: body.cursor ?? null } } }
  if (acao === 'salvar_config') {
    exigir(Number.isSafeInteger(body.revisao) && Number(body.revisao) >= 0)
    exigir(['desligado', 'observacao', 'alertas'].includes(String(body.modo)))
    exigir(Array.isArray(body.feriados) && body.feriados.length <= 150 && body.feriados.every((f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && Number.isFinite(Date.parse(f)) && new Date(f).toISOString().slice(0, 10) === f))
    exigir(Array.isArray(body.anos_confirmados) && body.anos_confirmados.length <= 5 && body.anos_confirmados.every((a) => Number.isInteger(a) && a >= 2020 && a <= 2100))
    return { rpc: 'tempo_resposta_configurar', args: { p_revisao: body.revisao, p_modo: body.modo, p_feriados: [...new Set(body.feriados)].sort(), p_anos: [...new Set(body.anos_confirmados)].sort() } }
  }
  if (acao === 'pausa') {
    exigir(uuid(body.user_id) && Number.isInteger(body.duracao_minutos) && Number(body.duracao_minutos) >= 15 && Number(body.duracao_minutos) <= 240)
    exigir(typeof body.motivo === 'string' && body.motivo.trim().length >= 3 && body.motivo.trim().length <= 300)
    return { rpc: 'tempo_resposta_pausar', args: { p_user: body.user_id, p_minutos: body.duracao_minutos, p_motivo: body.motivo.trim() } }
  }
  if (acao === 'encerrar_pausa') { exigir(uuid(body.pausa_id)); return { rpc: 'tempo_resposta_encerrar_pausa', args: { p_id: body.pausa_id } } }
  exigir(uuid(body.client_id) && (body.user_id === null || uuid(body.user_id)))
  return { rpc: 'tempo_resposta_definir_titular', args: { p_client: body.client_id, p_user: body.user_id } }
}
type LeitorAgenda = Pick<SupabaseClient, 'rpc'>
/** IDs/tenant saem da RPC autorizada pelo JWT, nunca do corpo do navegador. */
export async function hidratarAgendaPainel(base: BaseTempo, userId: string, tenantId: string, criarAdmin: (() => LeitorAgenda) | undefined): Promise<BaseTempo> {
  if (!base || base.tenant_id !== tenantId || base.ator_id !== userId || !Array.isArray(base.episodios) || base.episodios.length > 100
    || base.episodios.some((e) => !e || !uuid(e.id) || e.tenant_id !== tenantId)) throw new Falha(503, 'Não foi possível conferir o escopo desta página.')
  const ids = base.episodios.map((e) => e.id)
  if (new Set(ids).size !== ids.length) throw new Falha(503, 'A página retornou registros repetidos.')
  if (!ids.length) return base
  if (!criarAdmin) throw new Falha(503, 'A consulta da agenda aguarda configuração no servidor.')
  const r = await criarAdmin().rpc('tempo_resposta_agendas_episodios', { p_tenant: tenantId, p_ids: ids })
  if (r.error || !Array.isArray(r.data) || r.data.length !== ids.length) throw new Falha(503, 'Não foi possível conferir as agendas desta página.')
  const agendas = new Map<string, AgendaProjetada>()
  for (const row of r.data) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !ids.includes(row.id) || agendas.has(row.id)
      || !row.agenda || typeof row.agenda !== 'object' || Array.isArray(row.agenda)) throw new Falha(503, 'A consulta das agendas retornou um escopo diferente.')
    agendas.set(row.id, row.agenda as AgendaProjetada)
  }
  return { ...base, episodios: base.episodios.map((e) => ({ ...e, agenda: agendas.get(e.id)! })) }
}
/** Autorização e painel usam o JWT. A leitura privilegiada é posterior e limitada à página. */
export async function atenderAdminTempo(req: Request, criarUsuario: (auth: string) => SupabaseClient, criarAdmin?: () => LeitorAgenda): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return resposta({ ok: false, error: 'Método inválido.' }, 405)
  try {
    const auth = req.headers.get('authorization')
    if (!auth?.startsWith('Bearer ') || auth.length > 8192) return resposta({ ok: false, error: 'Entre novamente na plataforma.' }, 401)
    const usuario = criarUsuario(auth)
    const sessao = await usuario.auth.getUser()
    if (sessao.error || !sessao.data.user) return resposta({ ok: false, error: 'Entre novamente na plataforma.' }, 401)
    const userId = sessao.data.user.id
    const u = await usuario.from('users').select('id,tenant_id,ativo').eq('id', userId).maybeSingle()
    const p = await usuario.rpc('has_permissao', { p_recurso: 'automacoes-wa', p_acao: 'admin' })
    if (u.error || !u.data?.ativo || !u.data.tenant_id || p.error || p.data !== true) return resposta({ ok: false, error: 'Você não tem acesso a este monitor.' }, 403)
    const body = await corpoTempo(req); const cmd = comandoAdminTempo(body)
    const r = await usuario.rpc(cmd.rpc, cmd.args)
    if (r.error) {
      // Sem conteúdo SQL ou nomes internos na interface.
      if (r.error.code === '40001') return resposta({ ok: false, error: 'A configuração mudou. Atualize a tela antes de salvar.' }, 409)
      if (r.error.code === '42501') return resposta({ ok: false, error: 'Você não tem permissão para essa alteração.' }, 403)
      if (['22023', 'P0001'].includes(r.error.code)) return resposta({ ok: false, error: 'Não foi possível confirmar essa alteração. Confira o calendário e a pessoa selecionada.' }, 422)
      return resposta({ ok: false, error: 'O monitor ainda não está disponível. Tente atualizar a tela ou confira a publicação.' }, 503)
    }
    let painel = {}
    if (body.acao === 'painel') {
      const base = await hidratarAgendaPainel(r.data as BaseTempo, userId, u.data.tenant_id, criarAdmin)
      // Revogação/troca de tenant durante a consulta não libera os totais privados.
      const depois = await usuario.from('users').select('id,tenant_id,ativo,perfil').eq('id', userId).maybeSingle()
      const permissao = await usuario.rpc('has_permissao', { p_recurso: 'automacoes-wa', p_acao: 'admin' })
      if (depois.error || !depois.data?.ativo || depois.data.tenant_id !== u.data.tenant_id || !['admin', 'gerente'].includes(depois.data.perfil) || permissao.error || permissao.data !== true) return resposta({ ok: false, error: 'Seu acesso ao monitor mudou. Atualize a página.' }, 403)
      painel = enriquecerPainelTempo(base)
    }
    return resposta({ ...painel, ok: true, actor_id: userId, tenant_id: u.data.tenant_id })
  } catch (e) {
    return resposta({ ok: false, error: e instanceof Falha ? e.message : 'Não foi possível consultar o monitor agora.' }, e instanceof Falha ? e.status : 503)
  }
}
