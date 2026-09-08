import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const UAZAPI_URL = 'https://empirebusiness.uazapi.com'

// ─── Nono dígito brasileiro ──────────────────────────────────────────────────
// O WhatsApp ora manda o número com o 9 (55 + DDD + 9 + 8 díg = 13), ora sem (12).
// Para não duplicar contatos, geramos as duas variações e procuramos por ambas.
function waNumberVariants(numero: string): string[] {
  const d = numero.replace(/\D/g, '')
  const set = new Set<string>()
  if (d) set.add(d)
  // Só trata números brasileiros (55 + DDD + número local)
  if (d.startsWith('55') && d.length >= 12) {
    const ddd = d.slice(2, 4)
    const local = d.slice(4)
    if (local.length === 9 && local.startsWith('9')) {
      set.add(`55${ddd}${local.slice(1)}`) // versão SEM o nono dígito
    } else if (local.length === 8) {
      set.add(`55${ddd}9${local}`) // versão COM o nono dígito
    }
  }
  return [...set]
}

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
  instanceToken: string,
  isAudio: boolean
): Promise<string | null> {
  try {
    const res = await fetch(`${UAZAPI_URL}/message/download`, {
      method: 'POST',
      headers: { 'token': instanceToken, 'Content-Type': 'application/json' },
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
  supabase: ReturnType<typeof createClient>,
  uazapiUrl: string,
  conversationId: string,
): Promise<string | null> {
  try {
    // Download file bytes from UAZAPI
    const res = await fetch(uazapiUrl)
    if (!res.ok) {
      console.error('Media fetch from UAZAPI failed:', res.status)
      return null
    }
    const blob = await res.blob()

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
  instanceToken: string
): Promise<string | null> {
  try {
    const res = await fetch(`${UAZAPI_URL}/chat/details`, {
      method: 'POST',
      headers: { 'token': instanceToken, 'Content-Type': 'application/json' },
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
  instanceToken: string
): Promise<{ name: string | null; pictureUrl: string | null }> {
  try {
    // UAZAPI v2 usa `groupjid` (não `chatid`)
    const res = await fetch(`${UAZAPI_URL}/group/info`, {
      method: 'POST',
      headers: { 'token': instanceToken, 'Content-Type': 'application/json' },
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
  supabase: ReturnType<typeof createClient>,
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

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}))
  const url = new URL(req.url)

  // Log synchronously so it appears in edge function logs
  const pathParts = url.pathname.split('/').filter(Boolean)
  const baseIdx = pathParts.indexOf('uazapi-webhook')
  const pathEvent = baseIdx >= 0 && pathParts[baseIdx + 1] ? pathParts[baseIdx + 1] : ''
  const eventType = body.EventType ?? body.event ?? body.type ?? pathEvent ?? ''
  const instanceIdStr = body.instanceName ?? body.instance ?? body.instanceId ?? url.searchParams.get('instance') ?? ''
  console.log('[webhook] event:', eventType, '| instance:', instanceIdStr, '| path:', url.pathname, '| bodyKeys:', Object.keys(body).join(','))

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // DEBUG: log everything for diagnostics
  try {
    const msgBody = (body.message as Record<string, unknown> | undefined) ?? body
    const chatid = (msgBody?.chatid as string) ?? null
    const isGroupBody = (msgBody?.isGroup === true) || (chatid?.endsWith('@g.us') ?? false)
    await supabase.from('_webhook_debug').insert({
      event_type: eventType || null,
      instance: instanceIdStr || null,
      chatid,
      is_group: isGroupBody,
      body,
    })
  } catch (e) {
    console.error('[debug-log] failed:', e)
  }

  EdgeRuntime.waitUntil((async () => {
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
        // Extract reaction data
        const emoji = (msg.text as string) ?? (msg.content as Record<string, unknown>)?.text as string ?? ''
        const reactedMsgKey = (msg.content as Record<string, unknown>)?.key as Record<string, unknown> | undefined
        const originalMsgId = (reactedMsgKey?.id as string)
          ?? (msg.quotedMessageId as string)
          ?? (msg.reaction_messageid as string)
          ?? null
        if (!originalMsgId) return

        const chatid = (msg.chatid as string) ?? ''
        const senderNumber = chatid.replace('@s.whatsapp.net', '').replace('@g.us', '')
        const fromMe = msg.fromMe === true

        // Find the original message in DB
        const { data: originalMsg } = await supabase
          .from('chat_messages')
          .select('id, reactions')
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

        await supabase
          .from('chat_messages')
          .update({ reactions: updated })
          .eq('id', originalMsg.id)

        return
      }

      // Skip messages sent by EmpireDesk itself (already saved by uazapi-send-message)
      if (msg.wasSentByApi === true) return

      // Flag messages sent outside EmpireDesk (another CRM, phone, WhatsApp Web)
      const isExternalSend = msg.fromMe === true

      // Get instance from DB (try exact match, then case-insensitive, then by nome, then query param fallback)
      const instanceQueryParam = url.searchParams.get('instance') ?? ''
      let { data: instance } = await supabase
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
        const instanceToken = Deno.env.get(`UAZAPI_TOKEN_${instance.instance_id}`)
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
        const instanceToken = Deno.env.get(`UAZAPI_TOKEN_${instance.instance_id}`)
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
      const variants = waNumberVariants(numero)
      let contact: Record<string, any> | null = null

      const { data: existingContacts } = await supabase
        .from('chat_contacts')
        .select('*')
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
          const instanceToken = Deno.env.get(`UAZAPI_TOKEN_${instance.instance_id}`)
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

      // For group messages, prefix content with sender name
      const groupSender = isGroup
        ? ((msg.sender_pn as string)?.replace('@s.whatsapp.net', '') ?? senderName)
        : null
      const finalContent = isGroup && groupSender && conteudo
        ? `[${senderName ?? groupSender}] ${conteudo}`
        : conteudo

      // Persist media to Supabase Storage (permanent URL)
      if (mediaUrl && mediaUrl.includes('empirebusiness.uazapi.com')) {
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
      }

      if (messageIdWpp) {
        await supabase.from('chat_messages').upsert(
          { ...messagePayload, message_id_wpp: messageIdWpp },
          { onConflict: 'message_id_wpp', ignoreDuplicates: true }
        )
      } else {
        await supabase.from('chat_messages').insert(messagePayload)
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
                url: `/chat?id=${conversation.id}`,
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

      // ── IA Bot auto-activation ─────────────────────────────────────
      if (!isExternalSend && tipo === 'texto' && conteudo) {
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
  })())

  return new Response('ok', { status: 200 })
})
