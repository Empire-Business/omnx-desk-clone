import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { filtrarPerfisRestrito, type UsuarioPerfil } from '../_shared/chat-restrito.ts'
import { waNumberVariants } from '../_shared/wa-telefone.ts'
import { caminhoSemToken, segmentosDoEvento, tokenDaUrl } from '../_shared/wa-webhook-token.ts'
import { aprenderLidDaInstancia, avaliarAgente } from './agente.ts'
import { aprenderLidEquipe, colunaAutorAusente, resolverAutorWebhook } from './autoria.ts'
import type { EntradaAutor } from '../_shared/wa-autoria.ts'
import { type UltimaMensagem, estadoAguardando, tsEmMs } from '../_shared/wa-recuperacao.ts'
import { registrarIngressoTempo } from '../_shared/tempo-resposta-ingresso.ts'
import { registrarEntradaTicket } from '../_shared/wa-atendimento-ingresso.ts'
import { hostDe, tokenUazapi, urlUazapi } from '../_shared/uazapi-credenciais.ts'

/** Endereço da UAZAPI da empresa + token do número (ver _shared/uazapi-credenciais.ts). */
interface ConexaoUazapi { base: string; token: string }
declare const EdgeRuntime: { waitUntil(tarefa: Promise<unknown>): void }

// Nenhuma chamada externa pode prender o webhook (na recuperação, uma chamada
// presa derrubava a função por tempo/memória). Arquivo maior que o teto não é
// copiado para o Storage (fica o link da UAZAPI) — copiar exige o arquivo inteiro
// em memória.
const TIMEOUT_UAZAPI_MS = 20_000
const TIMEOUT_ARQUIVO_MS = 30_000
const MAX_BYTES_STORAGE = 20 * 1024 * 1024

function comTempo(ms: number): { signal: AbortSignal } {
  return { signal: AbortSignal.timeout(ms) }
}

// Nono dígito brasileiro: waNumberVariants vem de _shared/wa-telefone.ts.

// ─── UAZAPI v2 message type detection ────────────────────────────────────────

function detectMessageType(msg: Record<string, unknown>): {
  tipo: string
  conteudo: string | null
  hasMedia: boolean
} {
  const messageType = (msg.messageType as string) ?? ''
  // Only use string values for text — msg.content can be an object (document metadata, etc.)
  const textStr = typeof msg.text === 'string' ? msg.text : null
  const contentStr = typeof msg.content === 'string' ? msg.content : null

  // Detect if the string content is actually a JSON media metadata object (not real text)
  function isMediaMetadata(s: string | null): boolean {
    if (!s) return false
    const trimmed = s.trim()
    if (!trimmed.startsWith('{')) return false
    // Common WhatsApp media metadata fields
    return trimmed.includes('"mimetype"') || trimmed.includes('"mediaKey"') || trimmed.includes('"fileSHA256"')
  }

  const safeTextStr = isMediaMetadata(textStr) ? null : textStr
  const safeContentStr = isMediaMetadata(contentStr) ? null : contentStr
  const text = safeTextStr || safeContentStr || null

  // For documents, try to extract filename from content object or caption
  const docFileName = messageType === 'DocumentMessage'
    ? (textStr
      || (typeof msg.content === 'object' && msg.content !== null ? (msg.content as Record<string, unknown>).fileName as string ?? null : null)
      || (msg.fileName as string)
      || (msg.caption as string)
      || null)
    : null

  switch (messageType) {
    case 'Conversation':
    case 'ExtendedTextMessage':
      return { tipo: 'texto', conteudo: text, hasMedia: false }

    case 'ImageMessage':
      return { tipo: 'imagem', conteudo: text ?? (msg.caption as string) ?? null, hasMedia: true }

    case 'VideoMessage':
      return { tipo: 'video', conteudo: text ?? (msg.caption as string) ?? null, hasMedia: true }

    case 'AudioMessage':
    case 'PttMessage':
      return { tipo: 'audio', conteudo: text, hasMedia: true }

    case 'DocumentMessage':
      return { tipo: 'documento', conteudo: docFileName, hasMedia: true }

    case 'StickerMessage':
      return { tipo: 'sticker', conteudo: null, hasMedia: true }

    default:
      // Fallback: if there's text content, treat as text
      if (text) return { tipo: 'texto', conteudo: text, hasMedia: false }
      return { tipo: 'texto', conteudo: null, hasMedia: false }
  }
}

// ─── Download media from UAZAPI ──────────────────────────────────────────────

async function downloadMedia(
  messageIdWpp: string,
  conn: ConexaoUazapi,
  isAudio: boolean
): Promise<string | null> {
  try {
    const res = await fetch(`${conn.base}/message/download`, {
      ...comTempo(TIMEOUT_UAZAPI_MS),
      method: 'POST',
      headers: { 'token': conn.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: messageIdWpp,
        return_link: true,
        return_base64: false,
        generate_mp3: isAudio,
      }),
    })
    if (!res.ok) {
      console.error('Media download failed:', res.status, await res.text())
      return null
    }
    const data = await res.json()
    return data.fileURL ?? null
  } catch (err) {
    console.error('Media download error:', err)
    return null
  }
}

// ─── Persist media to Supabase Storage ──────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', webm: 'audio/webm',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

async function persistMediaToStorage(
  supabase: SupabaseClient,
  uazapiUrl: string,
  conversationId: string,
): Promise<string | null> {
  try {
    // Download file bytes from UAZAPI
    const res = await fetch(uazapiUrl, comTempo(TIMEOUT_ARQUIVO_MS))
    if (!res.ok) {
      console.error('Media fetch from UAZAPI failed:', res.status)
      return null
    }
    const tamanho = Number(res.headers.get('content-length') ?? '')
    if (Number.isFinite(tamanho) && tamanho > MAX_BYTES_STORAGE) {
      await res.body?.cancel().catch(() => {})
      console.warn('Media grande demais para o Storage — mantém o link da UAZAPI')
      return null
    }
    const blob = await res.blob()
    if (blob.size > MAX_BYTES_STORAGE) {
      console.warn('Media grande demais para o Storage — mantém o link da UAZAPI')
      return null
    }

    // Determine extension from URL or content-type
    const urlPath = new URL(uazapiUrl).pathname
    const ext = urlPath.split('.').pop()?.toLowerCase() ?? 'bin'
    const contentType = MIME_MAP[ext] ?? res.headers.get('content-type') ?? 'application/octet-stream'

    const storagePath = `${conversationId}/${Date.now()}.${ext}`
    const { data, error } = await supabase.storage
      .from('chat-media')
      .upload(storagePath, blob, {
        contentType,
        cacheControl: '31536000',
        upsert: false,
      })

    if (error) {
      console.error('Storage upload error:', error.message)
      return null
    }

    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(data.path)
    return urlData.publicUrl
  } catch (err) {
    console.error('persistMediaToStorage error:', err)
    return null
  }
}

// ─── Fetch profile picture from UAZAPI ──────────────────────────────────────

async function fetchProfilePicture(
  number: string,
  conn: ConexaoUazapi
): Promise<string | null> {
  try {
    const res = await fetch(`${conn.base}/chat/details`, {
      ...comTempo(TIMEOUT_UAZAPI_MS),
      method: 'POST',
      headers: { 'token': conn.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.profilePicUrl ?? data.wa_profilePicUrl ?? data.pictureUrl ?? data.picture ?? null
  } catch (err) {
    console.error('Profile pic fetch error:', err)
    return null
  }
}

// ─── Fetch group info from UAZAPI ───────────────────────────────────────────

async function fetchGroupInfo(
  chatid: string,
  conn: ConexaoUazapi
): Promise<{ name: string | null; pictureUrl: string | null }> {
  try {
    // UAZAPI v2 usa `groupjid` (não `chatid`)
    const res = await fetch(`${conn.base}/group/info`, {
      ...comTempo(TIMEOUT_UAZAPI_MS),
      method: 'POST',
      headers: { 'token': conn.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupjid: chatid }),
    })
    if (!res.ok) return { name: null, pictureUrl: null }
    const data = await res.json()
    return {
      // UAZAPI v2 retorna `Name` (capital N)
      name: data.Name ?? data.subject ?? data.name ?? null,
      pictureUrl: data.profilePicUrl ?? data.pictureUrl ?? data.picture ?? null,
    }
  } catch (err) {
    console.error('Group info fetch error:', err)
    return { name: null, pictureUrl: null }
  }
}

// ─── IA Bot Auto-Activation ──────────────────────────────────────────────────

interface BotActivationContext {
  instanceId: string
  departmentId: string | null
  conversationId: string
  contactId: string
  message: string
  isNewContact: boolean
}

async function tryActivateBot(
  supabase: SupabaseClient,
  ctx: BotActivationContext
) {
  try {
    const { data: bots } = await supabase
      .from('ia_bots')
      .select('id, instance_id, department_id, ia_bot_activation_rules(tipo, valor)')
      .eq('ativo', true)
    if (!bots || bots.length === 0) return

    for (const bot of bots) {
      if (bot.instance_id && bot.instance_id !== ctx.instanceId) continue
      if (bot.department_id && bot.department_id !== ctx.departmentId) continue

      const rules = (bot.ia_bot_activation_rules ?? []) as { tipo: string; valor: string | null }[]
      if (rules.length === 0) continue

      const shouldActivate = rules.some(rule => {
        switch (rule.tipo) {
          case 'sempre':
            return true
          case 'novo_contato':
            return ctx.isNewContact
          case 'palavra_chave': {
            if (!rule.valor) return false
            const keywords = rule.valor.toLowerCase().split(',').map(k => k.trim())
            const msgLower = ctx.message.toLowerCase()
            return keywords.some(kw => kw && msgLower.includes(kw))
          }
          case 'fora_horario': {
            const now = new Date()
            const spHour = (now.getUTCHours() - 3 + 24) % 24
            let startHour = 8, endHour = 18
            if (rule.valor) {
              const match = rule.valor.match(/(\d{1,2}):?\d{0,2}\s*-\s*(\d{1,2})/)
              if (match) {
                startHour = parseInt(match[1])
                endHour = parseInt(match[2])
              }
            }
            return spHour < startHour || spHour >= endHour
          }
          default:
            return false
        }
      })

      if (!shouldActivate) continue

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

      const res = await fetch(`${supabaseUrl}/functions/v1/ia-bot-respond`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bot_id: bot.id,
          message: ctx.message,
          conversation_id: ctx.conversationId,
          auto_mode: true,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.response) {
          await fetch(`${supabaseUrl}/functions/v1/uazapi-send-message`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              conversation_id: ctx.conversationId,
              conteudo: data.response,
              enviado_por_ia: true,
            }),
          })
        }
      } else {
        console.error('IA bot invocation failed:', res.status, await res.text())
      }

      break // Only activate the first matching bot
    }
  } catch (err) {
    console.error('Bot activation error:', err)
  }
}

// ─── Main webhook handler ────────────────────────────────────────────────────

servirComLicenca(async (req) => {
  const body = await req.json().catch(() => ({}))
  const url = new URL(req.url)

  // Log synchronously so it appears in edge function logs.
  // NUNCA logar url.search nem o caminho cru: o token do webhook vai na URL
  // (/uazapi-webhook/k/<token>). caminhoSemToken() troca o token por "***".
  const pathEvent = segmentosDoEvento(url)[0] ?? ''
  const eventType = body.EventType ?? body.event ?? body.type ?? pathEvent ?? ''
  const instanceIdStr = body.instanceName ?? body.instance ?? body.instanceId ?? url.searchParams.get('instance') ?? ''
  console.log('[webhook] event:', eventType, '| instance:', instanceIdStr, '| path:', caminhoSemToken(url), '| bodyKeys:', Object.keys(body).join(','))

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ── Modo recuperação (uazapi-recuperar-mensagens) ────────────────────────
  // Mensagem ANTIGA buscada na UAZAPI (/message/find) pelo próprio servidor,
  // autenticada pelo segredo do Vault (header x-recuperacao). Grava com o
  // horário original e NÃO dispara push, Íris, robô nem CSAT. Processa antes de
  // responder (quem chama vai uma por vez). Segredo errado → 401 (nada gravado).
  let recuperacao = false
  const segredoRec = req.headers.get('x-recuperacao')
  if (segredoRec !== null) {
    const { data: okRec, error: errRec } = segredoRec.length >= 32 && segredoRec.length <= 256
      ? await supabase.rpc('wa_auto_cron_secret_confere', { p_segredo: segredoRec })
      : { data: false, error: null }
    if (errRec || okRec !== true) return new Response('unauthorized', { status: 401 })
    recuperacao = true
  }
  const tsOriginal = recuperacao ? tsEmMs((body.message as Record<string, unknown> | undefined)?.messageTimestamp) : NaN
  const criadoEmOriginal = Number.isFinite(tsOriginal) ? new Date(tsOriginal).toISOString() : null
  let recuperacaoGravada = false

  // ── Token por instância (assistente da equipe, Fase 1a) ──────────────────
  //   * sem token, token inválido ou não reconhecido → grava como sempre, mas o
  //     assistente NÃO é acionado. Na transição recusar não protege nada (quem
  //     forja só tira o /k/…) e evita que uma falha no meio do "proteger" deixe
  //     o número descartando todas as mensagens do Chat em silêncio;
  //   * token válido → a instância/empresa do TOKEN manda; se o body disser
  //     outra instância, grava pela do token e não aciona o assistente.
  type InstanciaToken = { id: string; instance_id: string; tenant_id: string }
  let instanciaDoToken: InstanciaToken | null = null
  let agenteAutorizado = false
  const tk = tokenDaUrl(url)
  if (tk.tipo === 'invalido') {
    console.warn('[webhook] token inválido — grava sem acionar o assistente')
  }
  if (tk.tipo === 'presente') {
    const { data: rows, error: errTk } = await supabase.rpc('wa_webhook_instancia_do_token', { p_token: tk.token })
    const row = Array.isArray(rows) ? rows[0] : null
    if (errTk || !row?.instance_uuid) {
      console.warn('[webhook] token não reconhecido — grava sem acionar o assistente')
    } else {
      instanciaDoToken = { id: row.instance_uuid, instance_id: row.instance_id, tenant_id: row.tenant_id }
    }
  }
  if (instanciaDoToken) {
    const row = { instance_id: instanciaDoToken.instance_id }
    const nomeBody = typeof body.instanceName === 'string' ? body.instanceName.trim() : ''
    if (nomeBody && nomeBody.toLowerCase() === String(row.instance_id).toLowerCase()) {
      agenteAutorizado = true
    } else {
      console.warn('[webhook] instância do body diverge do token — assistente não acionado')
    }
  }

  // DEBUG: log everything for diagnostics (sem o token da instância que a UAZAPI
  // manda no body — segredo não fica gravado em tabela). Recuperação não loga.
  if (!recuperacao) try {
    const msgBody = (body.message as Record<string, unknown> | undefined) ?? body
    const chatid = (msgBody?.chatid as string) ?? null
    const isGroupBody = (msgBody?.isGroup === true) || (chatid?.endsWith('@g.us') ?? false)
    const { token: _tokenInstancia, ...bodySemToken } = body as Record<string, unknown>
    await supabase.from('_webhook_debug').insert({
      event_type: eventType || null,
      instance: instanceIdStr || null,
      chatid,
      is_group: isGroupBody,
      body: bodySemToken,
    })
  } catch (e) {
    console.error('[debug-log] failed:', e)
  }

  const tarefa = (async () => {
    try {
      // ── Handle status updates (delivery/read receipts) ───────────────
      if (eventType === 'messages_update' || eventType === 'messages.update' || eventType === 'MESSAGE_UPDATE') {
        const state = body.state as string | undefined
        const event = body.event as Record<string, unknown> | undefined
        const messageIDs = (event?.MessageIDs ?? []) as string[]

        let statusEnvio: string | null = null
        if (state === 'Delivered') statusEnvio = 'entregue'
        if (state === 'Read' || state === 'Played') statusEnvio = 'lida'

        if (statusEnvio && messageIDs.length > 0) {
          for (const msgId of messageIDs) {
            await supabase
              .from('chat_messages')
              .update({ status_envio: statusEnvio })
              .eq('message_id_wpp', msgId)
          }
        }
        return
      }

      // ── Handle new messages ──────────────────────────────────────────
      // When addUrlTypesMessages is enabled, body IS the message (not wrapped in body.message)
      const msg = (body.message as Record<string, unknown> | undefined)
        ?? (body.chatid ? (body as Record<string, unknown>) : undefined)

      // Skip non-message events. When UAZAPI uses addUrlEvents with a query-param URL (no path suffix),
      // EventType is stripped from body — in that case, use body shape to detect message events.
      // UAZAPI envia EventType 'messages' para mensagens individuais e 'groups' para mensagens de grupo
      if (eventType !== 'messages' && eventType !== 'groups' && !(eventType === '' && msg)) return
      if (!msg) return

      // ── Handle reaction messages ────────────────────────────────────
      const messageType = (msg.messageType as string) ?? ''
      if (messageType === 'ReactionMessage') {
        // Reações também exigem origem autenticada e o mesmo grupo/empresa.
        // O ID global de uma mensagem, isoladamente, não autoriza sua alteração.
        if (!agenteAutorizado && !recuperacao) return
        const instanciaReacao = instanciaDoToken ?? (recuperacao
          ? (await supabase.from('whatsapp_instances').select('id, instance_id, tenant_id')
            .eq('instance_id', instanceIdStr).maybeSingle()).data : null)
        if (!instanciaReacao) return
        // Extract reaction data
        const emoji = (msg.text as string) ?? (msg.content as Record<string, unknown>)?.text as string ?? ''
        const reactedMsgKey = (msg.content as Record<string, unknown>)?.key as Record<string, unknown> | undefined
        const originalMsgId = (reactedMsgKey?.id as string)
          ?? (reactedMsgKey?.ID as string)
          ?? (msg.quotedMessageId as string)
          ?? (msg.reaction_messageid as string)
          ?? (typeof msg.reaction === 'string' ? msg.reaction : null)
          ?? null
        if (!originalMsgId) return

        const chatid = (msg.chatid as string) ?? ''
        const numeroReacao = chatid.replace(/@(s\.whatsapp\.net|g\.us)$/, '')
        const variantesReacao = chatid.endsWith('@g.us') ? [chatid, numeroReacao] : waNumberVariants(numeroReacao)
        const { data: contatosReacao } = await supabase.from('chat_contacts').select('id')
          .eq('tenant_id', instanciaReacao.tenant_id).eq('instance_id', instanciaReacao.id)
          .in('numero_whatsapp', variantesReacao).limit(20)
        if (!contatosReacao?.length || contatosReacao.length >= 20) return
        const { data: conversasReacao } = await supabase.from('chat_conversations').select('id')
          .eq('tenant_id', instanciaReacao.tenant_id).eq('instance_id', instanciaReacao.id)
          .in('contact_id', contatosReacao.map(c => c.id)).limit(100)
        if (!conversasReacao?.length || conversasReacao.length >= 100) return
        const senderNumber = String(msg.sender_pn ?? msg.sender_lid ?? msg.sender ?? chatid).replace(/:\d+@/, '@')
        const fromMe = msg.fromMe === true

        // Find the original message in DB
        const { data: originalMsg } = await supabase
          .from('chat_messages')
          .select('id, reactions')
          .eq('tenant_id', instanciaReacao.tenant_id)
          .in('conversation_id', conversasReacao.map(c => c.id))
          .eq('message_id_wpp', originalMsgId)
          .single()

        if (!originalMsg) return

        const existing: { emoji: string; from: string; from_me: boolean }[] =
          (originalMsg.reactions as { emoji: string; from: string; from_me: boolean }[]) ?? []

        // Remove previous reaction from same sender
        let updated = existing.filter(r => r.from !== senderNumber)

        // Add new reaction (empty emoji = remove)
        if (emoji) {
          updated.push({ emoji, from: senderNumber, from_me: fromMe })
        }

        const { data: reacaoGravada, error: erroReacao } = await supabase
          .from('chat_messages')
          .update({ reactions: updated })
          .eq('tenant_id', instanciaReacao.tenant_id)
          .eq('id', originalMsg.id)
          .select('id').maybeSingle()
        if (recuperacao && !erroReacao && reacaoGravada?.id) recuperacaoGravada = true

        return
      }

      // Skip messages sent by EmpireDesk itself (already saved by uazapi-send-message)
      if (msg.wasSentByApi === true) return

      // Flag messages sent outside EmpireDesk (another CRM, phone, WhatsApp Web)
      const isExternalSend = msg.fromMe === true

      // Get instance from DB (try exact match, then case-insensitive, then by nome, then query param fallback)
      // Com token válido, a instância é a do token (não a que o body diz).
      const instanceQueryParam = url.searchParams.get('instance') ?? ''
      let { data: instance } = instanciaDoToken
        ? { data: instanciaDoToken }
        : await supabase
          .from('whatsapp_instances')
          .select('id, instance_id, tenant_id')
          .eq('instance_id', instanceIdStr)
          .single()
      if (!instance && instanceIdStr) {
        const { data: instanceCI } = await supabase
          .from('whatsapp_instances')
          .select('id, instance_id, tenant_id')
          .ilike('instance_id', instanceIdStr)
          .single()
        instance = instanceCI
      }
      if (!instance && instanceIdStr) {
        // Try matching by nome (display name) — UAZAPI may send display name as instanceName
        const { data: instanceByNome } = await supabase
          .from('whatsapp_instances')
          .select('id, instance_id, tenant_id')
          .ilike('nome', instanceIdStr)
          .single()
        instance = instanceByNome
      }
      if (!instance && instanceQueryParam && instanceQueryParam !== instanceIdStr) {
        // Last resort: use ?instance= query param directly
        const { data: instanceFallback } = await supabase
          .from('whatsapp_instances')
          .select('id, instance_id, tenant_id')
          .ilike('instance_id', instanceQueryParam)
          .single()
        instance = instanceFallback
        if (instance) console.log('[webhook] instance resolved via query param fallback:', instanceQueryParam)
      }
      if (!instance) {
        console.error('Instance not found:', instanceIdStr, '| query param:', instanceQueryParam)
        return
      }
      // Conexão com a UAZAPI deste número: resolvida uma vez, só se for usada.
      const instanciaResolvida = instance
      let conexaoMemo: Promise<ConexaoUazapi | null> | null = null
      const conexaoUazapi = (): Promise<ConexaoUazapi | null> => (conexaoMemo ??= (async () => {
        const tok = await tokenUazapi(supabase, String(instanciaResolvida.instance_id ?? ''), instanciaResolvida.tenant_id ?? null)
        return tok ? { base: await urlUazapi(supabase, instanciaResolvida.tenant_id ?? null), token: tok } : null
      })())

      // Extract contact info from UAZAPI v2 format
      const chatid = (msg.chatid as string) ?? ''
      const isGroup = (msg.isGroup === true) || chatid.endsWith('@g.us')
      const numero = chatid.replace('@s.whatsapp.net', '').replace('@g.us', '')
      if (!numero) return

      const messageIdWpp = (msg.messageid as string) ?? null
      const senderName = (msg.senderName as string) ?? null

      // Detect message type
      const { tipo, conteudo, hasMedia } = detectMessageType(msg)

      // Download media if needed
      let mediaUrl: string | null = null
      if (hasMedia && messageIdWpp) {
        const instanceToken = await conexaoUazapi()
        if (instanceToken) {
          // UAZAPI needs the full message ID format: "owner:messageid"
          const fullMsgId = (msg.id as string) ?? `${body.owner}:${messageIdWpp}`
          const uazapiUrl = await downloadMedia(fullMsgId, instanceToken, tipo === 'audio')
          if (uazapiUrl) {
            // Persist to Supabase Storage (we need conversation.id — will be set below)
            // Store temporarily; will upload after conversation is resolved
            mediaUrl = uazapiUrl
          }
        }
      }

      // Extract contact/group name from chat object
      const chat = body.chat as Record<string, unknown> | undefined
      let contactName: string | null = null
      let contactPicUrl: string | null = null

      if (isGroup) {
        // Try to get group name from payload first
        contactName = (chat?.name as string)
          ?? (chat?.wa_name as string)
          ?? (msg.groupSubject as string)
          ?? null

        // If no group name in payload, fetch from UAZAPI API
        const instanceToken = await conexaoUazapi()
        if (instanceToken && !contactName) {
          const groupInfo = await fetchGroupInfo(chatid, instanceToken)
          contactName = groupInfo.name
          contactPicUrl = groupInfo.pictureUrl
        } else if (instanceToken && !contactPicUrl) {
          // We have the name but not the pic — fetch pic only
          const groupInfo = await fetchGroupInfo(chatid, instanceToken)
          contactPicUrl = groupInfo.pictureUrl
        }
      } else {
        // When fromMe=true, senderName is the instance's own name — use only chat name
        contactName = (isExternalSend ? null : senderName)
          ?? (chat?.wa_name as string)
          ?? (chat?.name as string)
          ?? null
      }

      // Resolve o contato considerando o nono dígito (com/sem o 9) para não duplicar.
      // Grupos usam um JID que não é BR, então a busca por variações simplesmente
      // não encontra nada e um contato novo é criado normalmente.
      const variants = isGroup ? [...new Set([chatid, numero])] : waNumberVariants(numero)
      let contact: Record<string, any> | null = null

      const { data: existingContacts } = await supabase
        .from('chat_contacts')
        .select('*')
        .eq('tenant_id', instance.tenant_id)
        .eq('instance_id', instance.id)
        .in('numero_whatsapp', variants)
        .order('criado_em', { ascending: true })
        .limit(1)

      if (existingContacts && existingContacts.length > 0) {
        // Já existe um contato (mesma pessoa, com ou sem o 9) — reutiliza
        contact = existingContacts[0]
      } else {
        // Primeiro contato — cria. (name não sobrescreve com null para grupos)
        const upsertPayload: Record<string, unknown> = {
          tenant_id: instance.tenant_id,
          instance_id: instance.id,
          numero_whatsapp: numero,
        }
        if (contactName) upsertPayload.nome = contactName

        const { data: created } = await supabase
          .from('chat_contacts')
          .upsert(
            upsertPayload,
            { onConflict: 'instance_id,numero_whatsapp' }
          )
          .select()
          .single()
        contact = created
      }
      if (!contact) return

      // Auto-link contact to client by matching phone number (skip groups)
      if (!contact.client_id && !isGroup) {
        try {
          const { data: matchedClient } = await supabase.rpc('match_contact_to_client', {
            p_contact_id: contact.id,
            p_whatsapp: numero,
          })
          if (matchedClient) contact.client_id = matchedClient
        } catch { /* non-critical — skip */ }
      }

      // Update name if we fetched it and contact didn't have one
      if (contactName && !contact.nome) {
        await supabase.from('chat_contacts').update({ nome: contactName }).eq('id', contact.id)
        contact.nome = contactName
      }

      // Fetch/update profile picture if not already set
      if (!contact.foto_url) {
        if (contactPicUrl) {
          // Already fetched from group info
          await supabase.from('chat_contacts').update({ foto_url: contactPicUrl }).eq('id', contact.id)
          contact.foto_url = contactPicUrl
        } else {
          const instanceToken = await conexaoUazapi()
          if (instanceToken) {
            const picUrl = isGroup
              ? (await fetchGroupInfo(chatid, instanceToken)).pictureUrl
              : await fetchProfilePicture(numero, instanceToken)
            if (picUrl) {
              await supabase.from('chat_contacts').update({ foto_url: picUrl }).eq('id', contact.id)
              contact.foto_url = picUrl
            }
          }
        }
      }

      // Find or create conversation
      let { data: conversation } = await supabase
        .from('chat_conversations')
        .select('id, status, department_id')
        .eq('tenant_id', instance.tenant_id)
        .eq('contact_id', contact.id)
        .eq('instance_id', instance.id)
        .neq('status', 'encerrada')
        .order('criado_em', { ascending: false })
        .limit(1)
        .single()

      if (!conversation) {
        const { data: newConv } = await supabase
          .from('chat_conversations')
          .insert({ tenant_id: instance.tenant_id, instance_id: instance.id, contact_id: contact.id, status: 'aberta', is_group: isGroup })
          .select('id, status, department_id')
          .single()
        conversation = newConv
      }
      if (!conversation) return

      // ── Autoria (quem escreveu: cliente, equipe ou IA) ─────────────────
      // Nos grupos a equipe escreve do celular pessoal (não é fromMe): o
      // remetente (sender_pn/LID/nome) é comparado com equipe_identidades.
      // O prefixo "[Nome] " no texto continua (o Chat e outras partes leem);
      // o nome também vai em autor_nome — inclusive em mídia, que não tem prefixo.
      const entradaAutor: EntradaAutor = {
        ehGrupo: isGroup,
        fromMe: isExternalSend,
        numeroChat: numero,
        senderPn: msg.sender_pn,
        senderLid: msg.sender_lid ?? msg.sender,
        senderName: msg.senderName,
        owner: body.owner ?? msg.owner,
      }
      // Só com token válido da instância o remetente pode virar "equipe" por
      // telefone/LID/nome (sem token, sender_pn seria forjável); fromMe vale sempre.
      // Na recuperação a mensagem veio da própria UAZAPI (consulta do servidor
      // com o token da instância), então o remetente também é confiável.
      const remetenteConfiavel = agenteAutorizado || recuperacao
      const autor = await resolverAutorWebhook(supabase, instance.tenant_id, entradaAutor, remetenteConfiavel)

      // For group messages, prefix content with sender name
      const groupSender = isGroup
        ? ((msg.sender_pn as string)?.replace('@s.whatsapp.net', '') ?? senderName)
        : null
      const finalContent = isGroup && groupSender && conteudo
        ? `[${senderName ?? groupSender}] ${conteudo}`
        : conteudo

      // Persist media to Supabase Storage (permanent URL)
      // Link temporário da UAZAPI (mesmo servidor configurado para este número).
      const hostUazapi = mediaUrl ? hostDe((await conexaoUazapi())?.base ?? '') : ''
      if (mediaUrl && hostUazapi && hostDe(mediaUrl) === hostUazapi) {
        const permanentUrl = await persistMediaToStorage(supabase, mediaUrl, conversation.id)
        if (permanentUrl) mediaUrl = permanentUrl
      }

      // Insert message (idempotent via message_id_wpp)
      // O webhook roda com service_role (sem sessão de usuário), então o carimbo
      // automático do banco não resolve o tenant sozinho com mais de uma empresa
      // cadastrada — o tenant vem da instância de WhatsApp que recebeu a mensagem.
      const messagePayload: Record<string, unknown> = {
        tenant_id: instance.tenant_id,
        conversation_id: conversation.id,
        tipo,
        conteudo: finalContent,
        media_url: mediaUrl,
        enviado_por_agente: isExternalSend,
        fonte_envio: isExternalSend ? 'externo' : null,
        lida: false,
        // Recuperada: horário original (o trigger de "aguardando" usa criado_em)
        // e já lida (é antiga — não vira um monte de não lidas no Chat).
        ...(recuperacao && criadoEmOriginal ? { criado_em: criadoEmOriginal, lida: true } : {}),
      }
      const camposAutor: Record<string, unknown> = autor
        ? {
          autor_tipo: autor.tipo,
          autor_user_id: autor.user_id,
          autor_chave: autor.chave,
          autor_nome: autor.nome,
          autor_origem: autor.origem,
        }
        : {}

      const gravarMensagem = async (extra: Record<string, unknown>) => {
        if (messageIdWpp) {
          return await supabase.from('chat_messages').upsert(
            { ...messagePayload, ...extra, message_id_wpp: messageIdWpp },
            { onConflict: 'message_id_wpp', ignoreDuplicates: true }
          ).select('id').maybeSingle()
        }
        return await supabase.from('chat_messages').insert({ ...messagePayload, ...extra }).select('id').maybeSingle()
      }
      let { error: erroMsg, data: mensagemGravada } = await gravarMensagem(camposAutor)
      // Banco ainda sem as colunas de autoria (migration não aplicada): grava sem elas.
      if (erroMsg && autor && colunaAutorAusente(erroMsg)) {
        const fallback = await gravarMensagem({})
        erroMsg = fallback.error
        mensagemGravada = fallback.data
      }
      if (recuperacao && erroMsg) throw new Error('recovery_message_not_persisted')

      // Preserva a prova de ingresso já instalada em produção (v88).
      // Duplicatas não ganham autoria nem horário por suposição.
      if (!erroMsg && mensagemGravada?.id && remetenteConfiavel) {
        const eventoMs = tsEmMs(msg.messageTimestamp)
        await registrarIngressoTempo(supabase, { mensagemId: mensagemGravada.id,
          confiavel: true, ocorridoEm: Number.isFinite(eventoMs) ? new Date(eventoMs).toISOString() : null,
          recuperada: recuperacao })
      }
      // Uma reentrega autenticada também pode recuperar atestação transitória
      // que falhou após o INSERT. O snapshot original/hash/janela continuam
      // obrigatórios na RPC; linha antiga sem snapshot nunca recebe backfill.
      if (!erroMsg && agenteAutorizado && remetenteConfiavel && !recuperacao) {
        const eventoMs = tsEmMs(msg.messageTimestamp)
        await registrarEntradaTicket(supabase, {
          tenantId: instance.tenant_id, mensagemId: mensagemGravada?.id ?? null,
          messageIdWpp: messageIdWpp ?? null, conversationId: conversation.id,
          autenticada: agenteAutorizado && remetenteConfiavel, recuperada: recuperacao,
          ocorridoEm: Number.isFinite(eventoMs) ? new Date(eventoMs).toISOString() : null,
          tipo, conteudoOriginal: finalContent, autorOrigem: autor?.origem ?? null,
          autorTipo: autor?.tipo ?? null, autorUserId: autor?.user_id ?? null, body, msg,
        }, async (idWpp) => {
          const { data: existente, error } = await supabase.from('chat_messages').select('id')
            .eq('tenant_id', instance.tenant_id).eq('conversation_id', conversation.id)
            .eq('message_id_wpp', idWpp).maybeSingle()
          return error ? null : existente?.id ?? null
        })
      }

      // Grupo: aprende o LID de quem é da equipe (só com webhook autenticado).
      if (isGroup && !isExternalSend) {
        await aprenderLidEquipe(supabase, remetenteConfiavel, instance.tenant_id, entradaAutor)
      }

      if (recuperacao) {
        const { data: persistida, error: erroPersistida } = messageIdWpp
          ? await supabase.from('chat_messages').select('id').eq('tenant_id', instance.tenant_id)
            .eq('conversation_id', conversation.id).eq('message_id_wpp', messageIdWpp).maybeSingle()
          : { data: mensagemGravada, error: null }
        if (erroPersistida || !persistida?.id) throw new Error('recovery_receipt_missing')
        recuperacaoGravada = true
        // Antiga: a conversa só "anda" se esta for a mais nova, e o "aguardando
        // resposta" volta a refletir a mensagem mais recente (o trigger tratou a
        // recuperada como a última).
        if (criadoEmOriginal) {
          await supabase.from('chat_conversations')
            .update({ atualizado_em: criadoEmOriginal })
            .eq('id', conversation.id).eq('tenant_id', instance.tenant_id).lt('atualizado_em', criadoEmOriginal)
        }
        const { data: esperaAntes, error: erroEsperaAntes } = await supabase.from('chat_conversations')
          .select('aguardando_resposta, ultima_msg_cliente_em, atualizado_em')
          .eq('tenant_id', instance.tenant_id).eq('id', conversation.id).maybeSingle()
        const { data: recentes } = await supabase.from('chat_messages')
          .select('autor_tipo, autor_origem, criado_em, conteudo, tipo')
          .eq('tenant_id', instance.tenant_id).eq('conversation_id', conversation.id)
          .order('criado_em', { ascending: false }).limit(20)
        const lista = (recentes ?? []) as UltimaMensagem[]
        const estado = estadoAguardando(lista)
        const ultimaCliente = lista.find((m) => m.autor_tipo === 'cliente' || m.autor_tipo === 'desconhecido')
        if (estado && esperaAntes && !erroEsperaAntes) {
          let ajustarEspera = supabase.from('chat_conversations')
            .update({
              aguardando_resposta: estado.aguardando,
              ...(ultimaCliente ? { ultima_msg_cliente_em: ultimaCliente.criado_em } : {}),
            })
            .eq('id', conversation.id).eq('tenant_id', instance.tenant_id)
          ajustarEspera = esperaAntes.aguardando_resposta === null ? ajustarEspera.is('aguardando_resposta', null) : ajustarEspera.eq('aguardando_resposta', esperaAntes.aguardando_resposta)
          ajustarEspera = esperaAntes.ultima_msg_cliente_em === null ? ajustarEspera.is('ultima_msg_cliente_em', null) : ajustarEspera.eq('ultima_msg_cliente_em', esperaAntes.ultima_msg_cliente_em)
          ajustarEspera = esperaAntes.atualizado_em === null ? ajustarEspera.is('atualizado_em', null) : ajustarEspera.eq('atualizado_em', esperaAntes.atualizado_em)
          await ajustarEspera
        }
        return
      }

      // Update conversation timestamp
      await supabase.from('chat_conversations')
        .update({ atualizado_em: new Date().toISOString() })
        .eq('id', conversation.id)

      // ── Push notifications ─────────────────────────────────────────
      if (!isExternalSend) {
        try {
          // Find users to notify: assigned agent, or department agents, or all
          let targetUserIds: string[] = []

          // Get conversation with assignment info
          const { data: fullConv } = await supabase
            .from('chat_conversations')
            .select('atribuido_a, department_id')
            .eq('id', conversation.id)
            .single()

          if (fullConv?.atribuido_a) {
            targetUserIds = [fullConv.atribuido_a]
          } else if (fullConv?.department_id) {
            const { data: deptUsers } = await supabase
              .from('users')
              .select('id')
              .eq('department_id', fullConv.department_id)
              .eq('ativo', true)
            targetUserIds = (deptUsers ?? []).map(u => u.id)
          } else {
            const { data: allAgents } = await supabase
              .from('users')
              .select('id')
              .eq('ativo', true)
              .in('perfil', ['admin', 'gerente', 'agente_chat'])
            targetUserIds = (allAgents ?? []).map(u => u.id)
          }

          // Grupo INTERNO (chat_contacts.restrito_admin): o push leva nome do grupo
          // e trecho da mensagem, então só vai para admin/gerente ativo da empresa.
          // Em erro de consulta, ninguém recebe (falha fechada).
          if (contact.restrito_admin === true && targetUserIds.length > 0) {
            const { data: perfis } = await supabase
              .from('users')
              .select('id, perfil, ativo, tenant_id')
              .in('id', targetUserIds)
            targetUserIds = filtrarPerfisRestrito(targetUserIds, (perfis ?? []) as UsuarioPerfil[], instance.tenant_id)
          }

          if (targetUserIds.length > 0) {
            const pushTitle = contactName ?? numero
            const pushBody = tipo === 'texto' ? (conteudo ?? 'Nova mensagem') : `[${tipo}]`
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!
            const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

            await fetch(`${supabaseUrl}/functions/v1/send-push`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                user_ids: targetUserIds,
                title: pushTitle,
                body: pushBody,
                url: `/conversas?id=${conversation.id}`,
                tag: `chat-${conversation.id}`,
              }),
            })
          }
        } catch (pushErr) {
          console.error('Push notification error:', pushErr)
        }
      }

      // ── CSAT response capture ──────────────────────────────────────
      // If contact sends a single digit 1-5 and has a pending CSAT, capture it
      if (!isExternalSend && !isGroup && tipo === 'texto' && conteudo) {
        const trimmed = conteudo.trim()
        const nota = parseInt(trimmed, 10)
        if (!isNaN(nota) && nota >= 1 && nota <= 5 && trimmed === String(nota)) {
          const { data: pendingCsat } = await supabase
            .from('chat_csat')
            .select('id')
            .eq('contact_id', contact.id)
            .is('nota', null)
            .order('enviado_em', { ascending: false })
            .limit(1)
            .single()

          if (pendingCsat) {
            await supabase
              .from('chat_csat')
              .update({ nota, respondido_em: new Date().toISOString() })
              .eq('id', pendingCsat.id)
            console.log(`[webhook] CSAT captured: contact ${contact.id} nota ${nota}`)
          }
        }
      }

      // ── Assistente da equipe (fila) ───────────────────────────────
      // Mensagem do próprio número (celular): aprende o LID da instância.
      if (isExternalSend) {
        await aprenderLidDaInstancia(supabase, agenteAutorizado, instance.id, msg, isGroup)
      }
      let pularBotAntigo = false
      // Texto com conteúdo; no grupo, também áudio (a Íris ouve no wa-agente-responder).
      if (!isExternalSend && ((tipo === 'texto' && conteudo) || (isGroup && tipo === 'audio'))) {
        const r = await avaliarAgente({
          supabase,
          agenteAutorizado,
          instance,
          body: body as Record<string, unknown>,
          msg,
          chatid,
          isGroup,
          numero,
          tipo,
          conteudo,
          messageIdWpp,
          conversationId: conversation.id,
        })
        pularBotAntigo = r.pularBotAntigo
      }

      // ── IA Bot auto-activation ─────────────────────────────────────
      // Grupo INTERNO (restrito_admin): o bot nunca responde lá. Nem com membro
      // da equipe / grupo do assistente (quem responde é o assistente).
      if (!isExternalSend && !pularBotAntigo && contact.restrito_admin !== true && tipo === 'texto' && conteudo) {
        await tryActivateBot(supabase, {
          instanceId: instance.id,
          departmentId: conversation.department_id ?? null,
          conversationId: conversation.id,
          contactId: contact.id,
          message: conteudo,
          isNewContact: !conversation.status || conversation.status === 'aberta',
        })
      }

    } catch (err) {
      console.error('Webhook processing error:', err)
    }
  })()
  if (recuperacao) await tarefa
  else EdgeRuntime.waitUntil(tarefa)

  return new Response(recuperacao && !recuperacaoGravada ? 'recovery_not_persisted' : 'ok', {
    status: recuperacao && !recuperacaoGravada ? 500 : 200,
  })
})
