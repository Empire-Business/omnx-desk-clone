// uazapi-webhook → fila do ASSISTENTE DA EQUIPE (Fase 1b do plano).
//
// Só ENFILEIRA (wa_agente_pedidos); quem responde é wa-agente-responder.
// Regras (todas falham FECHADO — na dúvida, não enfileira):
//   * webhook autenticado por token da instância (agenteAutorizado) e sem
//     divergência entre o token e o body;
//   * assistente ligado na empresa (wa_auto_config.agente_ativo);
//   * nunca por mensagem da própria instância (fromMe/wasSentByApi/enviado pela
//     IA/número do assistente) — o chamador já filtra fromMe/wasSentByApi;
//   * PRIVADO: só no número do assistente (uazapi_instance_id), agente_privado,
//     remetente = membro ativo (usuário ativo, não cliente, da empresa);
//   * GRUPO: agente_grupos, grupo liberado (wa_agente_grupos.ativo), instância =
//     número do assistente ou reserva do grupo, gatilho (@/quote/nome) e
//     remetente membro — ou qualquer participante se o grupo é acesso_total.
//     ÁUDIO no grupo também entra: citando o assistente → 'quote' (como texto);
//     de MEMBRO sem menção/citação → 'audio' (o responder transcreve e só segue
//     se o nome do assistente aparecer na fala; senão ignora em silêncio).
// Nada de conteúdo de mensagem em log.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type GatilhoAgente, detectarGatilho, ehNumeroDoAgente, extrairDadosMensagem, gatilhoComAudio, lidsDosNumeros,
  tipoAcionaAgente,
} from '../_shared/wa-agente-gatilho.ts'
import { chaveTelefoneBR, jidServidor, jidUsuario } from '../_shared/wa-telefone.ts'
import { encaminhadaEntradaAcaoChat, hashEntradaDiretaAcaoChat } from '../_shared/wa-agente-entrada-integridade.ts'
import { localizarMensagemDoAgente } from './mensagem.ts'
import { tokenUazapi, urlUazapi } from '../_shared/uazapi-credenciais.ts'


export interface ContextoAgente {
  supabase: SupabaseClient
  /** Webhook com token válido e sem divergência com o body. */
  agenteAutorizado: boolean
  instance: { id: string; instance_id: string; tenant_id: string }
  body: Record<string, unknown>
  msg: Record<string, unknown>
  chatid: string
  isGroup: boolean
  /** Dígitos do chat (privado) — já sem sufixo. */
  numero: string
  tipo: string
  conteudo: string | null
  messageIdWpp: string | null
  conversationId: string
}

export interface ResultadoAgente {
  /** Contato é membro da equipe (privado) ou o chat é grupo do assistente: o bot antigo não responde. */
  pularBotAntigo: boolean
  /** Pedido criado (ou já existia para esta mensagem). */
  enfileirado: boolean
}

interface ConfigAgente {
  uazapi_instance_id: string | null
  agente_ativo: boolean
  agente_nome: string | null
  agente_privado: boolean
  agente_grupos: boolean
}

// Cache curto por isolate (a função fica quente entre mensagens).
const cacheGrupo = new Map<string, { info: unknown; ate: number }>()
const TTL_GRUPO_MS = 10 * 60_000

async function membroAtivo(
  supabase: SupabaseClient, tenantId: string, chave: string,
): Promise<{ id: string; user_id: string } | null> {
  if (!chave) return null
  const { data: m, error } = await supabase
    .from('wa_agente_membros')
    .select('id, user_id')
    .eq('tenant_id', tenantId)
    .eq('telefone_chave', chave)
    .eq('ativo', true)
    .maybeSingle()
  if (error || !m) return null
  const { data: u, error: errU } = await supabase
    .from('users')
    .select('ativo, perfil, tenant_id')
    .eq('id', m.user_id)
    .maybeSingle()
  if (errU || !u || u.ativo !== true || u.perfil === 'cliente' || u.tenant_id !== tenantId) return null
  return { id: m.id as string, user_id: m.user_id as string }
}

/** Telefones (dígitos) das instâncias do assistente neste grupo. */
async function telefonesDasInstancias(supabase: SupabaseClient, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const { data } = await supabase.from('whatsapp_instances').select('numero_whatsapp').in('id', ids)
  return (data ?? [])
    .map((r) => String((r as { numero_whatsapp: string | null }).numero_whatsapp ?? '').replace(/\D/g, ''))
    .filter((d) => d.length >= 10)
}

/** LIDs conhecidos (gravados) das instâncias. */
async function lidsGravados(supabase: SupabaseClient, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const { data } = await supabase.from('wa_webhook_tokens').select('instancia_lid').in('instance_id', ids)
  return (data ?? [])
    .map((r) => (r as { instancia_lid: string | null }).instancia_lid)
    .filter((l): l is string => !!l)
}

/**
 * Participantes do grupo via /group/info (cache de 10 min por isolate). Só é
 * chamado quando a mensagem tem menção/citação por LID que não reconhecemos.
 */
async function infoDoGrupo(supabase: SupabaseClient, tenantId: string, groupJid: string, instanceIdTxt: string): Promise<unknown> {
  const chave = `${instanceIdTxt}|${groupJid}`
  const c = cacheGrupo.get(chave)
  if (c && c.ate > Date.now()) return c.info
  const token = await tokenUazapi(supabase, instanceIdTxt, tenantId)
  if (!token) return null
  const base = await urlUazapi(supabase, tenantId)
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(`${base}/group/info`, {
      method: 'POST',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupjid: groupJid }),
      signal: ctrl.signal,
      redirect: 'error',
    }).finally(() => clearTimeout(timer))
    if (!res.ok) {
      await res.body?.cancel().catch(() => {})
      return null
    }
    const info = await res.json().catch(() => null)
    if (cacheGrupo.size > 200) cacheGrupo.clear()
    cacheGrupo.set(chave, { info, ate: Date.now() + TTL_GRUPO_MS })
    return info
  } catch {
    return null
  }
}

/** Grava o LID da instância (servidor). Só aceita "<n>@lid". */
async function gravarLidInstancia(supabase: SupabaseClient, instanceUuid: string, lid: string): Promise<void> {
  const u = jidUsuario(lid)
  if (!/^[0-9]{5,30}$/.test(u)) return
  await supabase
    .from('wa_webhook_tokens')
    .update({ instancia_lid: `${u}@lid` })
    .eq('instance_id', instanceUuid)
}

/**
 * Mensagem enviada pelo PRÓPRIO número (fromMe, celular/WhatsApp Web): em
 * privado, sender_lid é o LID da instância. Aprende e grava (barato, raro).
 */
export async function aprenderLidDaInstancia(
  supabase: SupabaseClient, agenteAutorizado: boolean, instanceUuid: string, msg: Record<string, unknown>, isGroup: boolean,
): Promise<void> {
  if (!agenteAutorizado || isGroup || msg.fromMe !== true) return
  const lid = typeof msg.sender_lid === 'string' ? msg.sender_lid : ''
  if (jidServidor(lid) !== 'lid') return
  try {
    await gravarLidInstancia(supabase, instanceUuid, lid)
  } catch { /* não crítico */ }
}

async function enfileirar(
  supabase: SupabaseClient,
  ctx: ContextoAgente,
  dados: {
    gatilho: GatilhoAgente
    membro: { id: string; user_id: string } | null
    remetenteChave: string
  },
): Promise<boolean> {
  if (!ctx.messageIdWpp) return false
  // A fonte é o envelope autenticado atual, antes de reler o Chat editável.
  const encaminhada = encaminhadaEntradaAcaoChat(ctx.msg, ctx.body)
  const entradaTextoSha256 = await hashEntradaDiretaAcaoChat({
    autenticada: ctx.agenteAutorizado, tipo: ctx.tipo, conteudo: ctx.conteudo,
    fromMe: ctx.msg.fromMe, enviadaPorApi: ctx.msg.wasSentByApi,
    quotedId: extrairDadosMensagem(ctx.body, ctx.msg).quotedId, gatilho: dados.gatilho, encaminhada,
  })
  const chatMessageId = await localizarMensagemDoAgente(supabase, {
    tenantId: ctx.instance.tenant_id,
    conversationId: ctx.conversationId,
    messageIdWpp: ctx.messageIdWpp,
    chatJid: ctx.chatid,
    isGroup: ctx.isGroup,
  })
  const { error } = await supabase.from('wa_agente_pedidos').upsert({
    tenant_id: ctx.instance.tenant_id,
    instance_uuid: ctx.instance.id,
    conversation_id: ctx.conversationId,
    chat_message_id: chatMessageId,
    chat_jid: ctx.chatid.slice(0, 100),
    eh_grupo: ctx.isGroup,
    membro_id: dados.membro?.id ?? null,
    user_id: dados.membro?.user_id ?? null,
    remetente_chave: dados.remetenteChave.slice(0, 40) || null,
    message_id_wpp: ctx.messageIdWpp,
    gatilho: dados.gatilho,
    entrada_texto_sha256: entradaTextoSha256,
    entrada_encaminhada: encaminhada,
  }, { onConflict: 'message_id_wpp', ignoreDuplicates: true })
  if (error) {
    console.error('[agente] falha ao enfileirar:', error.code ?? 'erro')
    return false
  }
  return true
}

/** Ids de mensagens do assistente neste chat (respostas recentes + relatórios). */
async function idsDoAgenteNoChat(supabase: SupabaseClient, tenantId: string, chatid: string): Promise<string[]> {
  const desde = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const ids = new Set<string>()
  const { data: peds } = await supabase
    .from('wa_agente_pedidos')
    .select('resposta_message_ids')
    .eq('tenant_id', tenantId)
    .eq('chat_jid', chatid)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(100)
  for (const p of peds ?? []) for (const id of ((p as { resposta_message_ids: string[] | null }).resposta_message_ids ?? [])) ids.add(id)
  // Relatório diário / testes enviados para este grupo (payload.message_id).
  const { data: envs } = await supabase
    .from('wa_auto_envios')
    .select('payload')
    .eq('tenant_id', tenantId)
    .eq('destino', chatid)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(50)
  for (const e of envs ?? []) {
    const id = ((e as { payload: Record<string, unknown> | null }).payload ?? {}).message_id
    if (typeof id === 'string' && id) ids.add(id)
  }
  return [...ids]
}

export async function avaliarAgente(ctx: ContextoAgente): Promise<ResultadoAgente> {
  const nada: ResultadoAgente = { pularBotAntigo: false, enfileirado: false }
  const { supabase, instance, msg, body } = ctx
  const tenantId = instance.tenant_id
  try {
    // ── Contexto: privado de membro? grupo do assistente? (vale até com o assistente desligado,
    //    para o bot antigo nunca falar com a equipe nem nos grupos internos)
    const dadosMsg = extrairDadosMensagem(body, msg)

    if (!ctx.isGroup) {
      const membro = await membroAtivo(supabase, tenantId, chaveTelefoneBR(ctx.numero))
      if (!membro) return nada
      const res: ResultadoAgente = { pularBotAntigo: true, enfileirado: false }
      if (!ctx.agenteAutorizado || ctx.tipo !== 'texto' || !ctx.conteudo || !ctx.messageIdWpp) return res
      if (msg.fromMe === true || msg.wasSentByApi === true) return res

      const cfg = await lerConfig(supabase, tenantId)
      if (!cfg?.agente_ativo || !cfg.agente_privado) return res
      if (!cfg.uazapi_instance_id || cfg.uazapi_instance_id !== instance.instance_id) return res
      // Nunca o próprio número.
      const meusTel = await telefonesDasInstancias(supabase, [instance.id])
      if (dadosMsg.owner) meusTel.push(dadosMsg.owner)
      if (ehNumeroDoAgente(ctx.numero, meusTel)) return res

      res.enfileirado = await enfileirar(supabase, ctx, {
        gatilho: 'privado', membro, remetenteChave: chaveTelefoneBR(ctx.numero),
      })
      return res
    }

    // ── Grupo
    const jid = ctx.chatid.toLowerCase().endsWith('@g.us') ? ctx.chatid.toLowerCase() : `${ctx.chatid.toLowerCase()}@g.us`
    const { data: grupo, error: errG } = await supabase
      .from('wa_agente_grupos')
      .select('id, ativo, acesso_total')
      .eq('tenant_id', tenantId)
      .eq('grupo_jid', jid)
      .maybeSingle()
    if (errG || !grupo) return nada
    const res: ResultadoAgente = { pularBotAntigo: true, enfileirado: false }
    if (grupo.ativo !== true) return res
    // Texto com conteúdo ou áudio (sem texto; a fala é ouvida no responder).
    if (!ctx.agenteAutorizado || !tipoAcionaAgente(ctx.tipo, ctx.conteudo, true) || !ctx.messageIdWpp) return res
    if (msg.fromMe === true || msg.wasSentByApi === true) return res

    const cfg = await lerConfig(supabase, tenantId)
    if (!cfg?.agente_ativo || !cfg.agente_grupos) return res

    // Instâncias do assistente neste grupo: a configurada + reservas do grupo.
    const { data: nums } = await supabase
      .from('wa_agente_grupo_numeros')
      .select('instance_uuid')
      .eq('grupo_id', grupo.id)
    const idsInst = new Set<string>((nums ?? []).map((n) => (n as { instance_uuid: string }).instance_uuid))
    if (cfg.uazapi_instance_id) {
      const { data: wi } = await supabase
        .from('whatsapp_instances')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('instance_id', cfg.uazapi_instance_id)
        .maybeSingle()
      if (wi?.id) idsInst.add(wi.id as string)
    }
    if (!idsInst.has(instance.id)) return res

    // Remetente.
    const remetenteTel = dadosMsg.remetenteGrupo
    const remetenteLid = typeof msg.sender_lid === 'string' && jidServidor(msg.sender_lid) === 'lid'
      ? jidUsuario(msg.sender_lid) : ''
    const telefones = await telefonesDasInstancias(supabase, [...idsInst])
    if (dadosMsg.owner) telefones.push(dadosMsg.owner)
    let numerosAgente: string[] = [...telefones, ...(await lidsGravados(supabase, [...idsInst]))]
    if (remetenteTel && ehNumeroDoAgente(remetenteTel, numerosAgente)) return res
    if (remetenteLid && ehNumeroDoAgente(`${remetenteLid}@lid`, numerosAgente)) return res

    const membro = remetenteTel ? await membroAtivo(supabase, tenantId, chaveTelefoneBR(remetenteTel)) : null
    if (!membro && grupo.acesso_total !== true) return res
    const remetenteChave = remetenteTel ? chaveTelefoneBR(remetenteTel) : (remetenteLid ? `lid:${remetenteLid}` : '')
    if (!remetenteChave) return res

    // Menção/citação por LID que ainda não reconhecemos → descobre o LID do(s)
    // número(s) do assistente pelos participantes do grupo (e grava).
    const lidsDesconhecidos = [...dadosMsg.mencionados, dadosMsg.quotedParticipante ?? '']
      .filter((j) => jidServidor(j) === 'lid' && !ehNumeroDoAgente(j, numerosAgente))
    if (lidsDesconhecidos.length > 0 && telefones.length > 0) {
      const info = await infoDoGrupo(supabase, tenantId, jid, instance.instance_id)
      const novos = lidsDosNumeros(info, telefones)
      if (novos.length > 0) {
        numerosAgente = [...numerosAgente, ...novos]
        // Grava o LID da instância que recebeu (o que casa com o telefone DELA).
        const meusTel = await telefonesDasInstancias(supabase, [instance.id])
        if (dadosMsg.owner) meusTel.push(dadosMsg.owner)
        const dela = lidsDosNumeros(info, meusTel)
        if (dela.length === 1) await gravarLidInstancia(supabase, instance.id, dela[0]).catch(() => {})
      }
    }

    const idsAgente = dadosMsg.quotedId ? await idsDoAgenteNoChat(supabase, tenantId, jid) : []
    const detectado = detectarGatilho({
      texto: ctx.conteudo ?? '',
      mencionados: dadosMsg.mencionados,
      quotedId: dadosMsg.quotedId,
      quotedParticipante: dadosMsg.quotedParticipante,
      ehGrupo: true,
      nomeAgente: cfg.agente_nome,
      numerosInstancia: numerosAgente,
      idsRespostasAgente: idsAgente,
    })
    // No grupo de acesso total, qualquer participante já pode chamar por texto;
    // também pode chamar pela voz. Sem nome na fala, o consumidor fica em silêncio.
    const gatilho = gatilhoComAudio(detectado, {
      tipo: ctx.tipo, ehGrupo: true, remetenteMembro: !!membro || grupo.acesso_total === true,
    })
    if (!gatilho) return res

    res.enfileirado = await enfileirar(supabase, { ...ctx, chatid: jid }, { gatilho, membro, remetenteChave })
    return res
  } catch (e) {
    console.error('[agente] erro ao avaliar:', e instanceof Error ? e.name : 'erro')
    // Falha fechada: não enfileira; e, por segurança, o bot antigo também não fala.
    return { pularBotAntigo: true, enfileirado: false }
  }
}

async function lerConfig(supabase: SupabaseClient, tenantId: string): Promise<ConfigAgente | null> {
  const { data, error } = await supabase
    .from('wa_auto_config')
    .select('uazapi_instance_id, agente_ativo, agente_nome, agente_privado, agente_grupos')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error || !data) return null
  return data as ConfigAgente
}

