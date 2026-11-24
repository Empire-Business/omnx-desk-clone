import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { avaliarTempoResposta, estaEmExpedienteTempoResposta, formatarAlertaTempoResposta } from './tempo-resposta-core.ts'
import { ErroIrisGt3, exigirLeitura, exigirUuid, type ConexaoIrisGt3, type VinculoIrisGt3 } from './iris-gt3-dados.ts'
import { podeVerInstancia, type EscopoAgente } from './wa-agente-escopo.ts'
import { avaliarAgendaEpisodio, validarSnapshotAgenda, type AgendaProjetada } from './tempo-resposta-agenda.ts'

export interface ConfigTempo { modo: 'desligado' | 'observacao' | 'alertas'; feriados: string[]; anos_confirmados: number[]; revisao: number; monitorando_desde: string | null }
export interface PausaTempo { id: string; user_id: string; nome?: string; inicio: string; fim: string; motivo: string }
export interface SegmentoTempo { id: string; user_id: string; nome: string; inicio: string; fim: string | null }
export interface EpisodioTempo {
  id: string; tenant_id: string; client_id: string | null; cliente: string; conversation_id: string; instance_id: string;
  inicio: string; resposta_em: string | null; atualizado_em?: string; respondente_id?: string | null; respondente?: string | null;
  estado: 'aberto' | 'respondido' | 'cancelado'; qualidade: 'confiavel' | 'inconclusiva'; motivo: string | null;
  responsavel_id: string | null; responsavel: string | null; segmento_atual_id: string | null;
  config_revisao: number; feriados: string[]; anos_confirmados: number[];
  segmentos: SegmentoTempo[]; historico_alertas?: unknown[]; agenda?: AgendaProjetada;
}
export interface BaseTempo { agora: string; config: ConfigTempo; pausas: PausaTempo[]; episodios: EpisodioTempo[]; proximo_cursor: string | null; [key: string]: unknown }
interface DetalheTempo { agora: string; config: ConfigTempo; pausas: PausaTempo[]; episodio: EpisodioTempo | null }
interface AlertaTempo { id: string; tenant_id: string; connection_id: string; recipient_id: string; gt3_user_id: string; recipient_revisao: number; episodio_id: string; segmento_id: string; etapa: '30' | '50' | '60'; config_revisao: number; status: string; delivery_id: string | null; texto: string | null }
export type AcessoTempo = { c: ConexaoIrisGt3; v: VinculoIrisGt3; escopo: EscopoAgente; scope_hash: string; [key: string]: unknown }
export interface PonteTempo {
  admin: SupabaseClient; c: ConexaoIrisGt3;
  acesso: (userId: string) => Promise<AcessoTempo>;
  reconferir: (antes: AcessoTempo) => Promise<unknown>;
}
const ANO = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' })
function calendarioCoberto(e: EpisodioTempo, fim: string): boolean {
  const a = Number(ANO.format(new Date(e.inicio))); const b = Number(ANO.format(new Date(fim)))
  return Array.isArray(e.anos_confirmados) && b - a <= 2 && Array.from({ length: b - a + 1 }, (_, i) => a + i).every((ano) => e.anos_confirmados.includes(ano))
}

/** Calcula a mesma régua para painel e aviso; nenhum total parcial vira ranking global. */
export function medirEpisodioTempo(e: EpisodioTempo, pausas: PausaTempo[], agora: string) {
  const fim = e.resposta_em ?? (e.estado === 'cancelado' ? e.atualizado_em ?? e.inicio : agora)
  const vazio = { ...e, minutos_cliente: null as number | null, minutos_estrategista: null as number | null, minutos_descontados: null as number | null, etapa: null as '30' | '50' | '60' | null, pausado: false, agenda_status: 'not_connected' as AgendaProjetada['status'], qualidade_individual: 'sem_agenda' as 'confiavel' | 'sem_agenda' | 'inconclusiva', agenda_alertas_disponiveis: true }
  try {
    if (!calendarioCoberto(e, fim)) return { ...vazio, qualidade: 'inconclusiva' as const, motivo: 'calendario_nao_conferido' }
    const cliente = avaliarTempoResposta({ inicio: e.inicio, fim, feriados: e.feriados })
    const segmento = e.segmentos.find((s) => s.id === e.segmento_atual_id && s.user_id === e.responsavel_id)
    const individuais = segmento ? pausas.filter((p) => p.user_id === segmento.user_id && Date.parse(p.fim) > Date.parse(p.inicio)) : []
    const limite = segmento?.fim && Date.parse(segmento.fim) < Date.parse(fim) ? segmento.fim : fim
    const agenda = avaliarAgendaEpisodio(e.agenda, segmento?.inicio ?? e.inicio, limite, agora, e.estado === 'aberto')
    const pessoa = segmento && agenda.coberto ? avaliarTempoResposta({ inicio: segmento.inicio, fim: limite, feriados: e.feriados, pausas: [...individuais.map((p) => ({ inicio: p.inicio, fim: p.fim })), ...agenda.pausas] }) : null
    return { ...vazio, minutos_cliente: cliente.minutosCliente, minutos_estrategista: pessoa?.minutosEstrategista ?? null,
      minutos_descontados: pessoa?.minutosDescontados ?? null,
      agenda_status: agenda.agenda_status, qualidade_individual: agenda.qualidade_individual, agenda_alertas_disponiveis: agenda.alertas_disponiveis,
      etapa: e.qualidade === 'confiavel' && e.estado === 'aberto' && segmento ? cliente.etapa : null,
      pausado: e.estado === 'aberto' && (agenda.ocupado || individuais.some((p) => Date.parse(p.inicio) <= Date.parse(agora) && Date.parse(p.fim) > Date.parse(agora))),
    }
  } catch { return { ...vazio, qualidade: 'inconclusiva' as const, motivo: 'periodo_nao_mensuravel' } }
}
export function enriquecerPainelTempo(base: BaseTempo) {
  if (!base || !Array.isArray(base.episodios) || !Array.isArray(base.pausas) || !base.config || !Number.isFinite(Date.parse(base.agora))) throw new Error('painel_invalido')
  const motivos: Record<string, string> = {
    calendario_nao_conferido: 'O calendário deste período ainda precisa de conferência.', calendario_nao_confirmado: 'O calendário deste período ainda precisa de conferência.',
    periodo_nao_mensuravel: 'Não foi possível medir este período com segurança.', horario_nao_confirmado: 'O horário original da mensagem não foi confirmado.',
    mensagem_recuperada: 'Houve recuperação de mensagens antigas durante esta espera.', horario_futuro: 'O horário recebido está adiantado e precisa de conferência.',
    sincronizacao_atrasada: 'A mensagem chegou ao Desk com atraso de sincronização.', mensagem_fora_de_ordem: 'As mensagens chegaram fora de ordem.',
    autoria_nao_confirmada: 'Não foi possível identificar quem enviou uma mensagem.', equipe_sem_identificacao: 'Houve mensagem da equipe sem identificação da pessoa.',
    cliente_nao_confirmado: 'Vincule esta conversa ao cliente correto.', titular_indefinido: 'Defina o titular entre os estrategistas vinculados ao cliente.',
    conversa_ou_vinculo_alterado: 'A conversa ou o vínculo com o cliente mudou durante a espera.', conexao_interrompida: 'A conexão com o WhatsApp foi interrompida.',
    mensagem_sem_comprovacao: 'Há uma mensagem sem confirmação de origem; a medição precisa de revisão.', monitor_desligado: 'A medição foi encerrada ao desligar o monitor.',
  }
  return { ...base, episodios: base.episodios.map((e) => {
    const m = medirEpisodioTempo(e, base.pausas, base.agora)
    // O painel precisa do estado e dos totais, não da agenda inteira.
    delete m.agenda
    return { ...m, motivo: m.motivo ? motivos[m.motivo] ?? 'A medição precisa de conferência.' : null }
  }) }
}
function vigente(e: ReturnType<typeof medirEpisodioTempo>, config: ConfigTempo, agora: string): boolean {
  return config.modo === 'alertas' && config.anos_confirmados.includes(Number(ANO.format(new Date(agora)))) && e.estado === 'aberto' && e.qualidade === 'confiavel'
    && !!e.client_id && !!e.responsavel_id && !!e.segmento_atual_id && !!e.etapa && !e.pausado && e.agenda_alertas_disponiveis && estaEmExpedienteTempoResposta(agora, e.feriados)
}
function invalidar(): never { throw new ErroIrisGt3(400, 'parametros_invalidos', 'Pedido de monitoramento inválido.') }
function apenas(body: Record<string, unknown>, campos: string[]) { if (Object.keys(body).some((k) => !['acao', ...campos].includes(k))) invalidar() }

/** Somente após token da conexão + segredo da ponte verificados pelo handler. */
export async function executarPonteTempo(ctx: PonteTempo, body: Record<string, unknown>) {
  const { admin, c } = ctx
  if (body.acao === 'tempo_resposta_agenda') {
    apenas(body, ['gt3_user_id', 'vinculo_revisao', 'agenda'])
    const userId = exigirUuid(body.gt3_user_id)
    if (!Number.isSafeInteger(body.vinculo_revisao) || Number(body.vinculo_revisao) < 1) invalidar()
    let agenda
    try { agenda = validarSnapshotAgenda(body.agenda, new Date().toISOString()) } catch { invalidar() }
    // A agenda pessoal do usuário de teste não pode descontar a carteira real
    // de outro estrategista. O usuário do Desk sempre vem do vínculo revalidado.
    const antes = await ctx.acesso(userId)
    if (antes.v.modo_teste || Number(antes.v.revisao) !== Number(body.vinculo_revisao)) throw new ErroIrisGt3(409, 'agenda_vinculo_invalido', 'A agenda exige um vínculo real e atual com o estrategista.')
    await ctx.reconferir(antes)
    return exigirLeitura(await admin.rpc('tempo_resposta_agenda_registrar', { p_connection: c.id, p_gt3_user: userId, p_recipient_revisao: antes.v.revisao, p_agenda: agenda }))
  }
  if (body.acao === 'tempo_resposta_candidatos') {
    apenas(body, ['cursor', 'limite'])
    const cursor = body.cursor == null ? null : exigirUuid(body.cursor)
    if (body.limite !== undefined && (!Number.isInteger(body.limite) || Number(body.limite) < 1 || Number(body.limite) > 25)) invalidar()
    // Dez episódios por página: trabalho limitado, cursor persistido pelo GT3.
    const base = exigirLeitura(await admin.rpc('tempo_resposta_lote', { p_tenant: c.tenant_id, p_cursor: cursor, p_limite: Math.min(Number(body.limite ?? 10), 10) })) as BaseTempo
    if (!base || !Array.isArray(base.episodios) || !base.config) throw new Error('lote_indisponivel')
    const saida: { alerta_id: string; gt3_user_id: string; episodio_id: string; etapa: string; vinculo_revisao: number }[] = []
    if (base.config.modo !== 'alertas') return { ok: true, candidatos: [], proximo_cursor: null }
    for (const bruto of base.episodios) {
      if (bruto.tenant_id !== c.tenant_id) throw new Error('tenant_incoerente')
      const e = medirEpisodioTempo(bruto, base.pausas, base.agora)
      if (!vigente(e, base.config, base.agora)) continue
      const rs = exigirLeitura(await admin.from('iris_gt3_recipients').select('*').eq('tenant_id', c.tenant_id).eq('connection_id', c.id).eq('desk_user_id', e.responsavel_id).eq('ativo', true).limit(11)) as VinculoIrisGt3[]
      if (rs.length > 10) throw new ErroIrisGt3(422, 'destinatarios_limite', 'Revise os destinatários do monitoramento.')
      for (const r of rs) {
        const chave = { tenant_id: c.tenant_id, connection_id: c.id, recipient_id: r.id, gt3_user_id: r.gt3_user_id, recipient_revisao: r.revisao, episodio_id: e.id, segmento_id: e.segmento_atual_id, etapa: e.etapa, config_revisao: base.config.revisao }
        exigirLeitura(await admin.from('tempo_resposta_alertas').upsert(chave, { onConflict: 'connection_id,recipient_id,recipient_revisao,episodio_id,segmento_id,etapa', ignoreDuplicates: true }))
        const a = exigirLeitura(await admin.from('tempo_resposta_alertas').select('id,status,config_revisao').eq('tenant_id', c.tenant_id).eq('connection_id', c.id).eq('recipient_id', r.id).eq('recipient_revisao', r.revisao).eq('episodio_id', e.id).eq('segmento_id', e.segmento_atual_id).eq('etapa', e.etapa).single()) as Pick<AlertaTempo, 'id' | 'status' | 'config_revisao'>
        // O mesmo aviso mantém sua identidade após salvar calendário/modo.
        // A revisão gravada documenta sua origem; a política atual é reconferida abaixo.
        if (['pendente', 'falhou'].includes(a.status)) saida.push({ alerta_id: a.id, gt3_user_id: r.gt3_user_id, episodio_id: e.id, etapa: e.etapa!, vinculo_revisao: r.revisao })
      }
    }
    return { ok: true, candidatos: saida, proximo_cursor: base.proximo_cursor }
  }
  if (!['tempo_resposta_confirmar', 'tempo_resposta_recibo'].includes(String(body.acao))) invalidar()
  apenas(body, body.acao === 'tempo_resposta_confirmar' ? ['alerta_id', 'gt3_user_id', 'request_id'] : ['alerta_id', 'gt3_user_id', 'delivery_id', 'status'])
  const id = exigirUuid(body.alerta_id); const userId = exigirUuid(body.gt3_user_id)
  const a = exigirLeitura(await admin.from('tempo_resposta_alertas').select('*').eq('tenant_id', c.tenant_id).eq('connection_id', c.id).eq('id', id).eq('gt3_user_id', userId).maybeSingle()) as AlertaTempo | null
  if (!a) throw new ErroIrisGt3(404, 'alerta_indisponivel', 'Alerta indisponível.')
  if (body.acao === 'tempo_resposta_recibo') {
    const delivery = exigirUuid(body.delivery_id); const status = String(body.status)
    if (!['enviado', 'sem_alertas', 'cancelado', 'falhou'].includes(status)) invalidar()
    if (a.delivery_id && a.delivery_id !== delivery) invalidar()
    if (status === 'enviado' && (a.delivery_id !== delivery || !a.texto)) invalidar()
    if (a.status === 'enviado') return { ok: true }
    exigirLeitura(await admin.from('tempo_resposta_alertas').update({ status, delivery_id: delivery, updated_at: new Date().toISOString() }).eq('tenant_id', c.tenant_id).eq('connection_id', c.id).eq('id', a.id).neq('status', 'enviado'))
    return { ok: true }
  }
  const requestId = exigirUuid(body.request_id)
  const antes = await ctx.acesso(userId)
  const vazio = { ok: true, texto: '', tem_alertas: false, scope_hash: antes.scope_hash, vinculo_revisao: antes.v.revisao }
  if (a.recipient_id !== antes.v.id || Number(a.recipient_revisao) !== Number(antes.v.revisao) || a.status === 'enviado' || ['sem_alertas', 'cancelado'].includes(a.status)) return vazio
  const lerDetalhe = async () => exigirLeitura(await admin.rpc('tempo_resposta_detalhe', { p_tenant: c.tenant_id, p_episodio: a.episodio_id })) as DetalheTempo
  const valido = (d: DetalheTempo) => {
    if (!d?.episodio || d.episodio.tenant_id !== c.tenant_id) return null
    const e = medirEpisodioTempo(d.episodio, d.pausas, d.agora)
    const atual = e.estado === 'aberto' && e.qualidade === 'confiavel' && e.etapa === a.etapa && e.segmento_atual_id === a.segmento_id
      && e.responsavel_id === antes.v.desk_user_id && antes.escopo.clientIds.has(e.client_id!) && podeVerInstancia(antes.escopo, e.instance_id)
    if (!atual || d.config.modo === 'desligado') return null
    // Pausa, observação ou fim do expediente podem acontecer depois da seleção.
    // São impedimentos temporários: não consumir o aviso como "sem alertas".
    if (!vigente(e, d.config, d.agora)) throw new ErroIrisGt3(503, 'tempo_resposta_adiado', 'O aviso aguarda a retomada da medição.')
    return e
  }
  const d = await lerDetalhe(); const e = valido(d)
  if (!e) return vazio
  const texto = formatarAlertaTempoResposta({ cliente: e.cliente, etapa: a.etapa, minutosCliente: e.minutos_cliente!, minutosEstrategista: e.minutos_estrategista ?? undefined })
  await ctx.reconferir(antes)
  if (!valido(await lerDetalhe())) return vazio
  if (a.delivery_id && a.delivery_id !== requestId) invalidar()
  const gravacao = admin.from('tempo_resposta_alertas').update({ delivery_id: requestId, texto, updated_at: new Date().toISOString() }).eq('tenant_id', c.tenant_id).eq('connection_id', c.id).eq('id', a.id).in('status', ['pendente', 'falhou'])
  // Compare-and-set: dois workers não podem associar recibos distintos ao mesmo aviso.
  const gravado = exigirLeitura(await (a.delivery_id ? gravacao.eq('delivery_id', requestId) : gravacao.is('delivery_id', null)).select('id').maybeSingle())
  if (!gravado) return vazio
  return { ...vazio, texto, tem_alertas: true }
}
