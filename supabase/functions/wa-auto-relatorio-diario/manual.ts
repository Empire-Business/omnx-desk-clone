import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { carregarGruposInternos } from '../_shared/wa-grupos-internos-dados.ts'
import { destinoGrupo, motivoGrupoBloqueado } from '../_shared/wa-grupos-internos.ts'
import { disjuntorAberto, resolveUazapiDaInstancia, WaProviderError } from '../_shared/wa-provider.ts'
import type { ChamadaIa } from '../_shared/wa-humanizar.ts'
import { enviarAvisoCompleto, prepararRelatorio, redigirRelatorio } from './preparar.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-actor-id, x-relatorio-grupo, x-relatorio-instancia',
}
export function resposta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
class Recusa extends Error {
  constructor(public codigo: string, public status = 403) { super(codigo) }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function autenticar(userClient: SupabaseClient, actorId: string | null) {
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user || data.user.is_anonymous || data.user.id !== actorId) throw new Recusa('sessao_invalida', 401)
  const id = data.user.id
  const { data: user, error: eu } = await userClient.from('users').select('id, perfil, ativo, tenant_id').eq('id', id).single()
  const { data: profile, error: ep } = await userClient.from('profiles').select('tenant_id').eq('user_id', id).single()
  if (eu || ep || user?.id !== id || user?.perfil !== 'admin' || user.ativo === false || !user.tenant_id || profile?.tenant_id !== user.tenant_id) {
    throw new Recusa('acesso_negado')
  }
  return { id, tenantId: user.tenant_id as string }
}

async function destinoAutorizado(admin: SupabaseClient, tenant: string, id: string) {
  const { data: app, error: ea } = await admin.from('app_modules').select('enabled').eq('tenant_id', tenant).eq('slug', 'automacoes-wa').maybeSingle()
  const { data: cfg, error: ec } = await admin.from('wa_auto_config').select('relatorio_ativo, uazapi_instance_id').eq('tenant_id', tenant).maybeSingle()
  if (ea || ec) throw new Recusa('leitura_falhou', 503)
  if (app?.enabled !== true || cfg?.relatorio_ativo !== true) throw new Recusa('relatorio_desligado')
  const { data: g, error: eg } = await admin.from('wa_auto_gestores').select('id, nome, grupo_nome, grupo_jid')
    .eq('tenant_id', tenant).eq('id', id).eq('ativo', true).eq('tipo', 'grupo').maybeSingle()
  if (eg) throw new Recusa('leitura_falhou', 503)
  const jid = destinoGrupo(g?.grupo_jid)
  if (!g || !jid) throw new Recusa('destinatario_invalido')
  const leitura = await carregarGruposInternos(admin, tenant, cfg.uazapi_instance_id, [jid])
  if (!leitura.instanciaUuid || motivoGrupoBloqueado(jid, new Set(leitura.grupos.map(g => g.grupo_jid)), leitura.deCliente, leitura.nomeDeCliente)) {
    throw new Recusa('grupo_bloqueado')
  }
  if (await disjuntorAberto(admin, tenant, 'uazapi')) throw new Recusa('envios_pausados', 409)
  return { id: g.id as string, nome: (g.grupo_nome || g.nome) as string, destino: jid, tipo: 'grupo' as const, instancia: cfg.uazapi_instance_id as string, instanciaUuid: leitura.instanciaUuid }
}

/** Modo explícito: UM grupo cadastrado. Não agenda, não altera configuração e não executa o cron. */
export async function executarManual(req: Request, admin: SupabaseClient, userClient: SupabaseClient,
  chamarIa: ChamadaIa | null, links: { painel: string | null; vinculos: string | null }) {
  try {
    if (!/^Bearer\s+\S+$/i.test(req.headers.get('authorization') ?? '')) throw new Recusa('sessao_invalida', 401)
    const actor = await autenticar(userClient, req.headers.get('x-actor-id'))
    const texto = await req.text()
    if (texto.length > 1024) throw new Recusa('pedido_invalido', 400)
    let body: Record<string, unknown>
    try { body = JSON.parse(texto) } catch { throw new Recusa('pedido_invalido', 400) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Recusa('pedido_invalido', 400)
    const previa = body.acao === 'prever_manual'
    const permitidas = previa ? ['acao', 'destinatario_id'] : ['destinatario_id', 'request_id']
    if (Object.keys(body).some(k => !permitidas.includes(k)) || typeof body.destinatario_id !== 'string' || !uuid.test(body.destinatario_id)
      || (!previa && (typeof body.request_id !== 'string' || !uuidV4.test(body.request_id)))) throw new Recusa('pedido_invalido', 400)
    const destinatarioId = body.destinatario_id
    const requestId = body.request_id as string
    const chave = `relatorio_diario:manual:${requestId}`
    const buscarExistente = async () => {
      const { data, error } = await admin.from('wa_auto_envios').select('id, tipo, status, chave_idempotencia, payload')
        .eq('tenant_id', actor.tenantId).eq('id', requestId).maybeSingle()
      if (error) throw new Recusa('leitura_falhou', 503)
      if (!data) return null
      if (data.tipo !== 'relatorio_diario' || data.chave_idempotencia !== chave || data.payload?.manual !== true
        || data.payload?.destinatario_id !== destinatarioId || data.payload?.solicitado_por !== actor.id) throw new Recusa('pedido_conflitante', 409)
      return resposta({ ok: true, request_id: requestId, status: data.status, duplicado: true,
        accepted: data.status === 'enviado', persisted: true, incerto: data.status === 'pendente' || data.payload?.incerto === true,
        message_id: data.payload?.message_id ?? null }, data.status === 'pendente' ? 202 : 200)
    }
    if (!previa) { const anterior = await buscarExistente(); if (anterior) return anterior }
    const destino = await destinoAutorizado(admin, actor.tenantId, destinatarioId)
    // Expectativas da prévia apenas restringem; nunca selecionam destino ou instância.
    if (!previa && (req.headers.get('x-relatorio-grupo') !== destino.destino
      || req.headers.get('x-relatorio-instancia') !== destino.instanciaUuid)) throw new Recusa('destinatario_alterado', 409)
    const agora = new Date()
    const preparado = await prepararRelatorio(admin, actor.tenantId, agora, links)
    const h = await redigirRelatorio(preparado, destino, chamarIa, 15_000)
    // Revalida após coleta/IA. Troca de sessão, revogação ou mudança de grupo interrompe antes da reserva/provedor.
    const atual = await autenticar(userClient, actor.id)
    if (atual.tenantId !== actor.tenantId) throw new Recusa('acesso_negado')
    const destinoAtual = await destinoAutorizado(admin, actor.tenantId, destinatarioId)
    if (destinoAtual.destino !== destino.destino || destinoAtual.instanciaUuid !== destino.instanciaUuid) throw new Recusa('destinatario_alterado', 409)
    if (previa) return resposta({ ok: true, status: 'previa', destinatario_id: destinatarioId, destino_nome: destino.nome,
      instancia: destino.instancia, grupo_jid: destino.destino, instancia_uuid: destino.instanciaUuid, gerado_em: agora.toISOString(), mensagem: h.texto, contagem: preparado.contagem })

    const uaz = await resolveUazapiDaInstancia(admin, actor.tenantId, destino.instanciaUuid)
    if (uaz.instanceId !== destino.instancia || !['conectado', 'connected', 'open'].includes((uaz.status ?? '').toLowerCase())) {
      throw new Recusa('instancia_indisponivel', 409)
    }
    const payload = { manual: true, grupo_jid: destino.destino, instancia_uuid: destino.instanciaUuid, destinatario_id: destinatarioId, solicitado_por: actor.id, contagem: preparado.contagem, destino_tipo: 'grupo' }
    const { error: reserva } = await admin.from('wa_auto_envios').insert({ id: requestId, tenant_id: actor.tenantId,
      tipo: 'relatorio_diario', provider: 'uazapi', destino: destino.destino, destino_nome: destino.nome,
      status: 'pendente', chave_idempotencia: chave, payload })
    if (reserva) {
      if (reserva.code === '23505') return await buscarExistente() ?? resposta({ ok: false, error: 'pedido_conflitante' }, 409)
      throw new Recusa('reserva_falhou', 503)
    }
    let status: 'enviado' | 'falhou' = 'falhou'
    let messageId: string | null = null
    let incerto = false
    let erro: string | null = null
    try {
      // O aviso sai inteiro: se for longo, em mais de uma mensagem (nunca cortado).
      const resultado = await enviarAvisoCompleto(uaz.provider, destino.destino, h.texto, {
        chaveIdempotencia: `${actor.tenantId}:${chave}`, idioma: 'pt_BR', humanizado: h.origem,
      })
      messageId = resultado.messageId
      status = 'enviado'
    } catch (e) {
      incerto = e instanceof WaProviderError ? e.incerto : true
      erro = 'Falha no envio pontual. Consulte o histórico antes de solicitar outro envio.'
    }
    let persistido = false
    try {
      const { data: salvo, error: gravacao } = await admin.from('wa_auto_envios').update({ status, erro,
      payload: { ...payload, message_id: messageId, fonte_segredo: uaz.fonteSegredo, humanizado: h.origem, incerto } })
      .eq('tenant_id', actor.tenantId).eq('id', requestId).select('id').maybeSingle()
      persistido = !gravacao && salvo?.id === requestId
    } catch { /* ACK não pode virar erro genérico nem liberar uma nova tentativa. */ }
    return resposta({ ok: true, request_id: requestId, status: persistido ? status : 'pendente',
      accepted: status === 'enviado', persisted: persistido, message_id: messageId, incerto: incerto || !persistido }, persistido ? 200 : 202)
  } catch (e) {
    return resposta({ ok: false, error: e instanceof Recusa ? e.codigo : 'preparacao_falhou' }, e instanceof Recusa ? e.status : 503)
  }
}
