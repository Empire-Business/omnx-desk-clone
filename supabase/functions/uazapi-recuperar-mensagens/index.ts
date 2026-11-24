// Recupera mensagens que a UAZAPI recebeu mas NÃO chegaram ao Chat — por
// exemplo, quando o número parou de mandar o webhook (Suporte1, 26–27/10/2026:
// ~35 h sem nenhuma mensagem no Chat, e o aviso diário disse "zero mensagens"
// de um cliente que tinha conversado no grupo).
//
// Quem chama: SÓ o servidor/operador, com o segredo do Vault `wa_auto_cron_secret`
// (header `x-cron-secret`, conferido pela RPC wa_auto_cron_secret_confere — mesmo
// esquema do wa-midia-processar). verify_jwt = false no config.toml. Ex. (SQL):
//   SELECT net.http_post(url := '<SUPABASE_URL>/functions/v1/uazapi-recuperar-mensagens',
//     headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', s.decrypted_secret),
//     body := '{"instance_uuid":"…","desde":"2026-10-26T02:00:00Z","dry_run":true}'::jsonb,
//     timeout_milliseconds := 150000)
//   FROM vault.decrypted_secrets s WHERE s.name = 'wa_auto_cron_secret';
//
// POST { instance_uuid, desde, ate?, dry_run? (padrão TRUE), max_mensagens? }
//   1. POST /chat/find (mais recentes primeiro) → chats com última mensagem ≥ desde;
//   2. POST /message/find por chat (páginas de 200) → mensagens no período;
//   3. confere quais message_id_wpp já estão em chat_messages (da empresa);
//   4. dry_run → só contagens. Senão, cada faltante (da mais antiga para a mais
//      nova) é reenviada ao uazapi-webhook no MODO RECUPERAÇÃO (header
//      x-recuperacao = o mesmo segredo): grava com o horário original, baixa a
//      mídia, calcula a autoria e NÃO dispara push, Íris, robô nem CSAT.
//      Idempotente (message_id_wpp é único): rodar de novo só completa o que faltou.
//
// Limites operacionais: janela geral ≤7 dias; grupo direcionado ≤366 dias; até300 mensagens e
// ~110 s por chamada (o resto sai em `restantes` — é só chamar de novo). Textos
// vão primeiro e mídia depois; cada reenvio tem no máximo 45 s (mídia presa
// conta como falha e a próxima chamada tenta de novo).
//
// Segurança: service_role com `.eq('tenant_id', T)` (F2); token da UAZAPI só
// do cofre ou do env (_shared/uazapi-credenciais.ts); resposta e logs só com contagens/códigos (F5) — nunca nome, telefone,
// texto ou URL.
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type ChatUazapi, type MensagemUazapi, type Periodo, chatsDoPeriodo, contarPorTipo, corpoParaWebhook, faltantes,
  mensagensDoPeriodo, ordemDeReenvio, validarPeriodo,
  estadoAguardando, type UltimaMensagem,
} from '../_shared/wa-recuperacao.ts'
import { autoriaIgual, opcoesRecuperacao, lerMensagensDirecionadas, resultadoHistorySync, permiteReconciliarAutoria, type ResultadoSync, type MensagemExistenteRecuperacao } from '../_shared/wa-recuperacao-direcionada.ts'
import { resolverAutorWebhook } from '../uazapi-webhook/autoria.ts'
import { tokenUazapi, urlUazapi } from '../_shared/uazapi-credenciais.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
/** Endereço da UAZAPI da empresa + token do número. */
interface ConexaoUazapi { base: string; token: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PAGINA_CHATS = 100
const MAX_PAGINAS_CHATS = 20
const PAGINA_MSGS = 200
const MAX_PAGINAS_MSGS = 15
const MAX_CHATS = 400
const MAX_MENSAGENS_PADRAO = 300
const ORCAMENTO_MS = 110_000
const LOTE_IDS = 150
/** Uma mensagem presa (mídia lenta) não pode segurar as outras. */
const TIMEOUT_WEBHOOK_MS = 45_000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function uazapi(conn: ConexaoUazapi, caminho: string, corpo: Record<string, unknown>, timeoutMs = 20_000): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(1, timeoutMs))
  try {
    const r = await fetch(`${conn.base}${caminho}`, {
      method: 'POST',
      headers: { token: conn.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
      redirect: 'error',
    })
    if (!r.ok) {
      console.error('uazapi-recuperar-mensagens: UAZAPI respondeu', caminho, r.status)
      if (caminho === '/message/history-sync') {
        // O parser seguinte só expõe estado/código/documentação, nunca mensagem livre do provedor.
        const body = await r.json().catch(() => null)
        return body && typeof body === 'object' && !Array.isArray(body) ? { ...body, http_status: r.status } : { http_status: r.status }
      }
      await r.body?.cancel().catch(() => {})
      return null
    }
    return await r.json().catch(() => null) as Record<string, unknown> | null
  } catch (e) {
    console.error('uazapi-recuperar-mensagens: falha na UAZAPI', caminho, (e as Error)?.name)
    return caminho === '/message/history-sync' && ctrl.signal.aborted ? { status: 'unknown', code: 'request_timeout' } : null
  } finally {
    clearTimeout(timer)
  }
}

async function listarChats(token: ConexaoUazapi, desde: number, prazo: number): Promise<{ chats: ChatUazapi[]; erro: boolean }> {
  const out: ChatUazapi[] = []
  for (let pag = 0; pag < MAX_PAGINAS_CHATS && out.length < MAX_CHATS; pag++) {
    if (prazo - Date.now() < 500) return { chats: out, erro: true }
    const r = await uazapi(token, '/chat/find', { sort: '-wa_lastMsgTimestamp', limit: PAGINA_CHATS, offset: pag * PAGINA_CHATS }, Math.min(20_000, prazo - Date.now()))
    if (!r) return { chats: out, erro: true }
    const lista = (Array.isArray(r.chats) ? r.chats : []) as ChatUazapi[]
    const { chats, fim } = chatsDoPeriodo(lista, desde)
    out.push(...chats)
    if (fim || lista.length < PAGINA_CHATS) break
  }
  return { chats: out.slice(0, MAX_CHATS), erro: false }
}

async function mensagensDoChat(token: ConexaoUazapi, chatid: string, p: Periodo, prazo: number): Promise<{ msgs: MensagemUazapi[]; erro: boolean }> {
  const out: MensagemUazapi[] = []
  let offset = 0
  for (let pag = 0; pag < MAX_PAGINAS_MSGS; pag++) {
    if (prazo - Date.now() < 500) return { msgs: out, erro: true }
    const r = await uazapi(token, '/message/find', { chatid, limit: PAGINA_MSGS, offset }, Math.min(20_000, prazo - Date.now()))
    if (!r) return { msgs: out, erro: true }
    const lista = (Array.isArray(r.messages) ? r.messages : []) as MensagemUazapi[]
    const { msgs, fim } = mensagensDoPeriodo(lista, p)
    out.push(...msgs)
    const pg = (r.pagination ?? {}) as { hasMore?: unknown; nextOffset?: unknown }
    if (fim || lista.length === 0 || pg.hasMore === false) break
    offset = typeof pg.nextOffset === 'number' ? pg.nextOffset : offset + lista.length
  }
  return { msgs: out, erro: false }
}

async function idsJaNoChat(admin: SupabaseClient, tenantId: string, ids: string[]): Promise<Set<string> | null> {
  const ja = new Set<string>()
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const { data, error } = await admin.from('chat_messages').select('message_id_wpp')
      .eq('tenant_id', tenantId).in('message_id_wpp', ids.slice(i, i + LOTE_IDS))
    if (error) return null
    for (const r of (data ?? []) as { message_id_wpp: string | null }[]) if (r.message_id_wpp) ja.add(r.message_id_wpp)
  }
  return ja
}

type Existente = MensagemExistenteRecuperacao & { id: string; conversation_id: string; message_id_wpp: string; agente_id: string | null; autor_user_id: string | null; autor_chave: string | null; autor_nome: string | null }
async function reconciliarExistentes(admin: SupabaseClient, tenant: string, conversas: string[], chatid: string, mensagens: MensagemUazapi[], prazo: number) {
  let reconciliadas = 0
  let falhas_autoria = 0
  const tocadas = new Set<string>()
  const fontes = new Map(mensagens.filter((m) => m.chatid === chatid && m.wasSentByApi !== true).map((m) => [String(m.messageid), m]))
  const ids = [...fontes.keys()]
  for (let inicio = 0; inicio < ids.length && prazo - Date.now() >= 500; inicio += LOTE_IDS) {
    const { data, error } = await admin.from('chat_messages')
      .select('id, conversation_id, message_id_wpp, agente_id, enviado_por_ia, fonte_envio, autor_tipo, autor_origem, autor_user_id, autor_chave, autor_nome')
      .eq('tenant_id', tenant).in('conversation_id', conversas).in('message_id_wpp', ids.slice(inicio, inicio + LOTE_IDS))
    if (error) { falhas_autoria++; break }
    for (const row of (data ?? []) as Existente[]) {
      if (prazo - Date.now() < 500) break
      const m = fontes.get(row.message_id_wpp)
      if (!m || row.agente_id || !permiteReconciliarAutoria(row)) continue
      const autor = await resolverAutorWebhook(admin, tenant, {
        ehGrupo: true, fromMe: m.fromMe === true, numeroChat: chatid,
        senderPn: m.sender_pn, senderLid: m.sender_lid ?? m.sender, senderName: m.senderName, owner: m.owner,
      }, true)
      // Ausência no roster ou nome semelhante não autoriza promover/demitir autoria.
      if (!autor || autor.tipo !== 'equipe' || autor.origem !== 'webhook' || autoriaIgual(row, autor)) continue
      let update = admin.from('chat_messages').update({
        autor_tipo: autor.tipo, autor_user_id: autor.user_id, autor_chave: autor.chave, autor_nome: autor.nome, autor_origem: autor.origem,
      }).eq('tenant_id', tenant).eq('id', row.id).eq('conversation_id', row.conversation_id)
        .eq('message_id_wpp', row.message_id_wpp).is('agente_id', null)
      update = row.autor_origem === null ? update.is('autor_origem', null) : update.eq('autor_origem', row.autor_origem)
      update = row.autor_tipo === null ? update.is('autor_tipo', null) : update.eq('autor_tipo', row.autor_tipo)
      update = row.autor_user_id === null ? update.is('autor_user_id', null) : update.eq('autor_user_id', row.autor_user_id)
      update = row.autor_chave === null ? update.is('autor_chave', null) : update.eq('autor_chave', row.autor_chave)
      update = row.autor_nome === null ? update.is('autor_nome', null) : update.eq('autor_nome', row.autor_nome)
      update = row.fonte_envio === null ? update.is('fonte_envio', null) : update.eq('fonte_envio', row.fonte_envio)
      update = row.enviado_por_ia === null ? update.is('enviado_por_ia', null) : update.eq('enviado_por_ia', false)
      const { data: alteradas, error: errUpdate } = await update.select('id')
      if (errUpdate) falhas_autoria++
      else if (alteradas?.length) { reconciliadas++; tocadas.add(row.conversation_id) }
    }
  }
  for (const conversationId of tocadas) {
    if (prazo - Date.now() < 500) break
    // Uma mensagem nova não pode perder seu estado de espera durante a leitura.
    const { data: antes, error: errAntes } = await admin.from('chat_conversations')
      .select('aguardando_resposta, ultima_msg_cliente_em, atualizado_em')
      .eq('tenant_id', tenant).eq('id', conversationId).maybeSingle()
    if (errAntes || !antes) { falhas_autoria++; continue }
    const { data, error } = await admin.from('chat_messages').select('autor_tipo, autor_origem, criado_em, conteudo, tipo')
      .eq('tenant_id', tenant).eq('conversation_id', conversationId).order('criado_em', { ascending: false }).limit(20)
    if (error) { falhas_autoria++; continue }
    const recentes = (data ?? []) as UltimaMensagem[]
    const estado = estadoAguardando(recentes)
    if (!estado) continue
    const cliente = recentes.find((m) => m.autor_tipo === 'cliente' || m.autor_tipo === 'desconhecido')
    let ajustar = admin.from('chat_conversations').update({ aguardando_resposta: estado.aguardando,
      ...(cliente ? { ultima_msg_cliente_em: cliente.criado_em } : {}),
    }).eq('tenant_id', tenant).eq('id', conversationId)
    ajustar = antes.aguardando_resposta === null ? ajustar.is('aguardando_resposta', null) : ajustar.eq('aguardando_resposta', antes.aguardando_resposta)
    ajustar = antes.ultima_msg_cliente_em === null ? ajustar.is('ultima_msg_cliente_em', null) : ajustar.eq('ultima_msg_cliente_em', antes.ultima_msg_cliente_em)
    ajustar = antes.atualizado_em === null ? ajustar.is('atualizado_em', null) : ajustar.eq('atualizado_em', antes.atualizado_em)
    const { error: errConv } = await ajustar
    if (errConv) falhas_autoria++
  }
  return { reconciliadas, falhas_autoria }
}

servirComLicenca(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)
  const inicio = Date.now()
  const prazo = inicio + ORCAMENTO_MS

  const segredo = req.headers.get('x-cron-secret') ?? ''
  if (segredo.length < 32 || segredo.length > 256) return json({ ok: false, error: 'unauthorized' }, 401)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(Math.max(1, prazo - Date.now()))]) }) } })
  const { data: confere, error: errSeg } = await admin.rpc('wa_auto_cron_secret_confere', { p_segredo: segredo })
  if (errSeg || confere !== true) return json({ ok: false, error: 'unauthorized' }, 401)

  if (Number(req.headers.get('content-length') ?? 0) > 4096) return json({ ok: false, error: 'corpo_muito_grande' }, 413)
  const textoPedido = await req.text().catch(() => '')
  if (new TextEncoder().encode(textoPedido).byteLength > 4096) return json({ ok: false, error: 'corpo_muito_grande' }, 413)
  let corpo: Record<string, unknown> | null = null
  try { const value = JSON.parse(textoPedido); if (value && typeof value === 'object' && !Array.isArray(value)) corpo = value } catch { /* inválido */ }
  if (!corpo) return json({ ok: false, error: 'corpo_invalido' }, 400)
  const instanceUuid = typeof corpo.instance_uuid === 'string' ? corpo.instance_uuid : ''
  if (!UUID.test(instanceUuid)) return json({ ok: false, error: 'instancia_invalida' }, 400)
  const opcoes = opcoesRecuperacao(corpo)
  if ('erro' in opcoes) return json({ ok: false, error: opcoes.erro }, 400)
  const { chatid: chatidAlvo, dryRun, solicitarHistorico, reconciliarAutoria, requestId } = opcoes
  const periodo = validarPeriodo(corpo.desde, corpo.ate, Date.now(), chatidAlvo !== null)
  if ('erro' in periodo) return json({ ok: false, error: periodo.erro }, 400)
  const maxMsgs = Math.max(1, Math.min(Number(corpo.max_mensagens) || MAX_MENSAGENS_PADRAO, 1_000))

  const { data: inst } = await admin.from('whatsapp_instances').select('id, instance_id, tenant_id, numero_whatsapp')
    .eq('id', instanceUuid).maybeSingle()
  if (!inst) return json({ ok: false, error: 'instancia_nao_encontrada' }, 404)
  const instanceId = String(inst.instance_id ?? '')
  const tenantId = String(inst.tenant_id)
  const tokenNumero = await tokenUazapi(admin, instanceId, tenantId)
  if (!tokenNumero) return json({ ok: false, error: 'sem_token_uazapi' }, 400)
  const token: ConexaoUazapi = { base: await urlUazapi(admin, tenantId), token: tokenNumero }

  // Alvo deve existir neste tenant e nesta instância; não cria contatos/conversas para solicitar histórico.
  let conversasAlvo: string[] = []
  if (chatidAlvo) {
    const { data: contatos, error } = await admin.from('chat_contacts').select('id')
      .eq('tenant_id', tenantId).eq('instance_id', instanceUuid).in('numero_whatsapp', [chatidAlvo, chatidAlvo.slice(0, -'@g.us'.length)]).limit(20)
    if (error) return json({ ok: false, error: 'leitura_grupo' }, 500)
    if (!contatos?.length) return json({ ok: false, error: 'grupo_nao_encontrado' }, 404)
    const { data: convs, error: errConv } = await admin.from('chat_conversations').select('id')
      .eq('tenant_id', tenantId).eq('instance_id', instanceUuid).eq('is_group', true).in('contact_id', contatos.map((c) => c.id)).limit(100)
    if (errConv) return json({ ok: false, error: 'leitura_grupo' }, 500)
    conversasAlvo = (convs ?? []).map((c) => String(c.id))
    if (!conversasAlvo.length) return json({ ok: false, error: 'conversa_grupo_nao_encontrada' }, 404)
  }
  let historico: ResultadoSync | null = null
  if (solicitarHistorico && chatidAlvo) {
    if (prazo - Date.now() < 26_000) return json({ ok: false, error: 'orcamento_historico_insuficiente' }, 503)
    // Uma única solicitação. blocked/timeout/no-progress não disparam retry nem outra âncora.
    historico = resultadoHistorySync(await uazapi(token, '/message/history-sync', {
      number: chatidAlvo, count: Math.max(1, Math.min(Math.floor(Number(corpo.history_count) || 100), 100)),
      sync: true, timeoutMs: 25_000, fallbackMode: 'try_alternates', ...(requestId ? { requestId } : {}),
    }, Math.min(26_000, prazo - Date.now())))
  }
  // 1–2. No modo direcionado não enumera chats nem presume retenção universal.
  const encontrados = chatidAlvo ? { chats: [{ wa_chatid: chatidAlvo, wa_isGroup: true }], erro: false }
    : await listarChats(token, periodo.desde, Math.min(prazo, inicio + ORCAMENTO_MS / 2))
  const chats = encontrados.chats
  const erroChats = encontrados.erro
  const porChat = new Map<string, ChatUazapi>()
  const doPeriodo: MensagemUazapi[] = []
  let chatsComErro = 0
  let chatsLidos = 0
  let fimPaginacao: string | null = null
  for (const c of chats) {
    if (Date.now() >= (chatidAlvo ? prazo - 1000 : inicio + ORCAMENTO_MS / 2)) break
    const chatid = c.wa_chatid as string
    porChat.set(chatid, c)
    if (chatidAlvo) {
      const r = await lerMensagensDirecionadas((path, body, timeout) => uazapi(token, path, body, timeout), chatid, periodo, prazo - 1000)
      fimPaginacao = r.fim
      if (['provider_error', 'timeout', 'pagination_no_progress', 'limite_paginas'].includes(r.fim)) chatsComErro++
      doPeriodo.push(...r.mensagens)
    } else {
      const r = await mensagensDoChat(token, chatid, periodo, Math.min(prazo, inicio + ORCAMENTO_MS / 2))
      if (r.erro) chatsComErro++
      doPeriodo.push(...r.msgs)
    }
    chatsLidos++
  }

  // 3. O que ainda não está no Chat.
  const ja = await idsJaNoChat(admin, tenantId, [...new Set(doPeriodo.map((m) => m.messageid as string))])
  if (!ja) return json({ ok: false, error: 'leitura_chat' }, 500)
  // Reação é atualização de outra mensagem, não uma linha com ID próprio no Chat.
  // Não pode reaparecer para sempre como mensagem faltante em cada lote.
  const reacoes = doPeriodo.filter((m) => m.messageType === 'ReactionMessage').length
  const falta = faltantes(doPeriodo.filter((m) => m.messageType !== 'ReactionMessage'), ja)
  const grupos = falta.filter((m) => m.isGroup === true || String(m.chatid ?? '').endsWith('@g.us')).length
  const resumo = {
    direcionado: Boolean(chatidAlvo), historico, fim_paginacao: fimPaginacao,
    eventos_de_reacao: reacoes,
    historico_completo: historico?.completo === true && fimPaginacao === 'has_more_false',
    chats_no_periodo: chats.length,
    chats_lidos: chatsLidos,
    chats_com_erro: chatsComErro + (erroChats ? 1 : 0),
    mensagens_no_periodo: doPeriodo.length,
    ja_no_chat: doPeriodo.length - reacoes - falta.length,
    faltando: falta.length,
    faltando_em_grupos: grupos,
    faltando_conversas: new Set(falta.map((m) => String(m.chatid ?? ''))).size,
    faltando_por_tipo: contarPorTipo(falta),
  }
  if (dryRun) return json({ ok: true, dry_run: true, ...resumo })

  const autoria = reconciliarAutoria && chatidAlvo
    ? await reconciliarExistentes(admin, tenantId, conversasAlvo, chatidAlvo, doPeriodo.filter((m) => ja.has(String(m.messageid))).slice(0, maxMsgs), prazo)
    : { reconciliadas: 0, falhas_autoria: 0 }

  // 4. Reenvia ao webhook no modo recuperação (uma por vez, em ordem cronológica).
  const owner = typeof inst.numero_whatsapp === 'string' ? inst.numero_whatsapp.replace(/\D/g, '') || null : null
  let gravadas = 0
  let falhas = 0
  let adiadoPorLimite = false
  for (const m of ordemDeReenvio(falta).slice(0, maxMsgs)) {
    if (prazo - Date.now() < 500) break
    const chat = porChat.get(String(m.chatid ?? '')) ?? null
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/uazapi-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-recuperacao': segredo },
        body: JSON.stringify(corpoParaWebhook(m, chat, instanceId, owner)),
        signal: AbortSignal.timeout(Math.max(1, Math.min(TIMEOUT_WEBHOOK_MS, prazo - Date.now()))),
      })
      await r.body?.cancel().catch(() => {})
      if (r.ok) gravadas++
      else { falhas++; console.error('uazapi-recuperar-mensagens: webhook respondeu', r.status) }
    } catch (e) {
      falhas++
      console.error('uazapi-recuperar-mensagens: falha ao chamar o webhook', (e as Error)?.name)
      // Limite de chamadas não melhora repetindo as demais no mesmo processo.
      // Mantém o restante para uma operação posterior, sem retry automático.
      if (e instanceof Error && e.name === 'RateLimitError') { adiadoPorLimite = true; break }
    }
  }
  console.log('uazapi-recuperar-mensagens:', instanceId, 'faltando', falta.length, 'gravadas', gravadas, 'falhas', falhas)
  return json({ ok: true, dry_run: false, ...resumo, ...autoria, reenviadas: gravadas, falhas, adiado_por_limite: adiadoPorLimite, restantes: falta.length - gravadas })
})
