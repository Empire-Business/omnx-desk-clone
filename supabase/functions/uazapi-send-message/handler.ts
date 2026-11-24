import type { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { registrarIngressoTempo } from '../_shared/tempo-resposta-ingresso.ts'
import { tokenUazapi, urlUazapi } from '../_shared/uazapi-credenciais.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Map our internal types to UAZAPI media types
const MEDIA_TYPE_MAP: Record<string, string> = {
  imagem: 'image',
  video: 'video',
  audio: 'ptt', // Send as voice message (blue bubble)
  documento: 'document',
  sticker: 'sticker',
}

export function createSendMessageHandler(dependencies: {
  createClient: typeof createClient
  env: (key: string) => string | undefined
  fetch: typeof globalThis.fetch
}) {
const { createClient, env, fetch } = dependencies
return async (req: Request): Promise<Response> => {
  let deliveryAttempted = false
  let deliveryAccepted = false
  let persistenceConfirmed = false
  let acceptedReceipt: Record<string, unknown> = {}

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  try {
    const supabase = createClient(
      env('SUPABASE_URL')!,
      env('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const jwt = authHeader.replace('Bearer ', '')
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')!

    // Support both user JWT and service role key (for auto_mode from webhook/bot)
    let agentId: string | null = null
    if (jwt !== serviceKey) {
      const { data: { user } } = await supabase.auth.getUser(jwt)
      if (!user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
      agentId = user.id
    }

    const body: unknown = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Pedido inválido' }, 400)
    const { conversation_id, conteudo, tipo = 'texto', media_url, enviado_por_ia = false, reply_to_id } = body as Record<string, unknown>
    if (typeof enviado_por_ia !== 'boolean' || (agentId && enviado_por_ia)) return json({ error: 'Autoria de mensagem inválida' }, 400)
    if (typeof conteudo !== 'string' || typeof tipo !== 'string' || !['texto', ...Object.keys(MEDIA_TYPE_MAP)].includes(tipo)) {
      return json({ error: 'Conteúdo ou tipo de mensagem inválido' }, 400)
    }
    if (tipo === 'texto' ? !conteudo.trim() : typeof media_url !== 'string' || !media_url.startsWith('https://')) {
      return json({ error: tipo === 'texto' ? 'A mensagem está vazia' : 'Mídia inválida ou ausente' }, 400)
    }

    if (typeof conversation_id !== 'string' || !conversation_id) {
      return new Response(JSON.stringify({ error: 'conversation_id é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // As leituras abaixo usam service_role (sem RLS). Usuário logado: antes de
    // enviar, confere COMO ele (JWT + RLS) que enxerga a conversa — empresa,
    // número atribuído, carteira e grupo interno (restrito_admin, só admin/gerente).
    // service_role (bot do uazapi-webhook, chat-api) segue sem esta conferência.
    if (agentId) {
      const { data: account, error: accountError } = await supabase.from('users')
        .select('id,ativo,tenant_id').eq('id', agentId).maybeSingle()
      if (accountError || !account?.tenant_id || account.ativo === false) return json({ error: 'Acesso indisponível para esta conta' }, 403)
      const usuario = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false },
      })
      const { data: visivel } = await usuario
        .from('chat_conversations')
        .select('id')
        .eq('id', conversation_id)
        .maybeSingle()
      if (!visivel) return new Response('Conversation not found', { status: 404, headers: corsHeaders })
      const { data: canEdit, error: permissionError } = await usuario.rpc('has_permissao', { p_recurso: 'chat', p_acao: 'editar' })
      if (permissionError || canEdit !== true) return json({ error: 'Sua conta pode consultar, mas não enviar mensagens neste chat' }, 403)
    }

    const { data: conv } = await supabase
      .from('chat_conversations')
      .select('*, chat_contacts(numero_whatsapp), whatsapp_instances(instance_id), chat_departments(nome)')
      .eq('id', conversation_id)
      .single()
    if (!conv) return new Response('Conversation not found', { status: 404, headers: corsHeaders })

    // Fetch agent name and setting in parallel (only if agent is sending)
    let agentName: string | null = null
    let showNameOnWpp = false
    if (agentId && !enviado_por_ia) {
      const [agentRes, settingRes] = await Promise.all([
        supabase.from('users').select('nome').eq('id', agentId).single(),
        supabase.from('app_settings').select('valor').eq('chave', 'chat_mostrar_nome_agente_wpp').eq('tenant_id', conv.tenant_id).single(),
      ])
      agentName = agentRes.data?.nome ?? null
      showNameOnWpp = settingRes.data?.valor === 'true'
    }

    // Prepend agent name to text if enabled
    let textoFinal = conteudo
    if (showNameOnWpp && agentName && conteudo) {
      const deptName = conv.chat_departments?.nome
      const label = deptName ? `${deptName} - ${agentName}` : agentName
      textoFinal = `*${label}:*\n${conteudo}`
    }

    const instanceId = conv.whatsapp_instances?.instance_id
    const token = instanceId ? await tokenUazapi(supabase, instanceId, conv.tenant_id ?? null, env) : null
    if (!token) return new Response('Instance token not configured', { status: 500, headers: corsHeaders })
    const UAZAPI_URL = await urlUazapi(supabase, conv.tenant_id ?? null, env)

    const numero = chatDestination(conv.chat_contacts?.numero_whatsapp ?? '', conv.is_group === true)

    // Resolve reply_to_id to WhatsApp message ID for quoting
    let quotedMsgId: string | null = null
    let validatedReplyId: string | null = null
    if (reply_to_id) {
      if (typeof reply_to_id !== 'string') return json({ error: 'Referência de resposta inválida' }, 400)
      const { data: replyMsg, error: replyError } = await supabase
        .from('chat_messages')
        .select('id,message_id_wpp')
        .eq('id', reply_to_id)
        .eq('conversation_id', conversation_id) // só cita mensagem da mesma conversa
        .maybeSingle()
      if (replyError) return json({ error: 'Não foi possível conferir a mensagem citada' }, 400)
      if (!replyMsg) return json({ error: 'A mensagem citada não pertence a esta conversa ou não está disponível' }, 400)
      validatedReplyId = replyMsg.id
      quotedMsgId = replyMsg.message_id_wpp ?? null
    }

    let uazapiRes: Response
    let uazapiData: Record<string, unknown>

    if (tipo === 'texto' || !media_url) {
      // Send text message
      // Fire presence call without awaiting (fire-and-forget)
      fetch(`${UAZAPI_URL}/message/presence`, {
        method: 'POST',
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: numero, presence: 'composing' }),
      }).catch(() => {})

      const textPayload: Record<string, unknown> = {
        number: numero,
        text: textoFinal,
        readchat: true,
      }
      if (quotedMsgId) textPayload.replyid = quotedMsgId

      deliveryAttempted = true
      uazapiRes = await fetch(`${UAZAPI_URL}/send/text`, {
        method: 'POST',
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(textPayload),
      })
      uazapiData = await providerPayload(uazapiRes)
    } else {
      // Send media message
      const uazapiType = MEDIA_TYPE_MAP[tipo] ?? tipo

      // Simulate appropriate presence (fire-and-forget)
      const presence = tipo === 'audio' ? 'recording' : 'composing'
      fetch(`${UAZAPI_URL}/message/presence`, {
        method: 'POST',
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: numero, presence }),
      }).catch(() => {})

      const mediaPayload: Record<string, unknown> = {
        number: numero,
        type: uazapiType,
        file: media_url,
        readchat: true,
      }

      // Add caption for types that support it
      if (conteudo && ['image', 'video', 'document'].includes(uazapiType)) {
        mediaPayload.text = textoFinal
      }

      // Add document name if available
      if (uazapiType === 'document' && conteudo) {
        mediaPayload.docName = conteudo
      }

      if (quotedMsgId) mediaPayload.replyid = quotedMsgId

      deliveryAttempted = true
      uazapiRes = await fetch(`${UAZAPI_URL}/send/media`, {
        method: 'POST',
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(mediaPayload),
      })
      uazapiData = await providerPayload(uazapiRes)
    }

    deliveryAccepted = uazapiRes.ok && uazapiData.error == null && uazapiData.success !== false && uazapiData.ok !== false
    if (!deliveryAccepted) {
      return json({ error: 'O WhatsApp recusou o envio. Confira a conexão da instância antes de tentar novamente.', delivery: 'rejected' }, 502)
    }

    const key = uazapiData.key && typeof uazapiData.key === 'object' ? uazapiData.key as Record<string, unknown> : null
    const messageId = typeof uazapiData.messageid === 'string' && uazapiData.messageid.trim() ? uazapiData.messageid : null
    const keyId = typeof key?.id === 'string' && key.id.trim() ? key.id : null
    // Preserve legacy correlation paths without returning arbitrary provider fields.
    acceptedReceipt = { ...(messageId ? { messageid: messageId } : {}), ...(keyId ? { key: { id: keyId } } : {}) }

    // Record message in DB
    // O tenant vem da conversa. A edge function roda com service_role (sem sessão),
    // então o carimbo automático do banco não consegue resolver o tenant sozinho
    // quando existe mais de uma empresa no sistema — por isso ele é informado aqui.
    const { error: insertError, data: mensagemGravada } = await supabase.from('chat_messages').insert({
      tenant_id: conv.tenant_id,
      conversation_id,
      message_id_wpp: messageId ?? keyId,
      tipo,
      conteudo,
      media_url: media_url ?? null,
      enviado_por_agente: !enviado_por_ia,
      enviado_por_ia,
      agente_id: agentId,
      status_envio: 'enviada',
      reply_to_id: validatedReplyId,
    }).select('id,criado_em').single()

    if (insertError) {
      console.error('Mensagem aceita pelo WhatsApp; histórico não persistido:', insertError.code)
      return json({ ok: true, persisted: false, uazapi: acceptedReceipt, warning: 'Mensagem aceita pelo WhatsApp, mas o histórico não foi salvo. Atualize a conversa para conferir. Evite reenviar para não duplicar.' })
    }

    persistenceConfirmed = true
    if (uazapiRes.ok && !enviado_por_ia && agentId && mensagemGravada?.id) {
      await registrarIngressoTempo(supabase, { mensagemId: mensagemGravada.id,
        confiavel: true, ocorridoEm: mensagemGravada.criado_em, usuarioId: agentId })
    }

    await supabase.from('chat_conversations')
      .update({ atualizado_em: new Date().toISOString() })
      .eq('id', conversation_id)

    return new Response(JSON.stringify({ ok: true, persisted: true, uazapi: acceptedReceipt }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Falha em uazapi-send-message:', err instanceof Error ? err.name : 'Erro inesperado')
    if (deliveryAccepted) return json({ ok: true, persisted: persistenceConfirmed, uazapi: acceptedReceipt, warning: 'Mensagem aceita pelo WhatsApp. Atualize a conversa para confirmar o histórico antes de reenviar.' })
    if (deliveryAttempted) return json({ error: 'Não foi possível confirmar o envio. Confira o histórico no Desk e no WhatsApp antes de tentar novamente para evitar duplicação.', delivery: 'unknown' }, 504)
    return json({ error: err instanceof InvalidDestination ? err.message : 'Não foi possível preparar o envio. Tente novamente.', delivery: 'not_attempted' }, err instanceof InvalidDestination ? 400 : 500)
  }
}
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

class InvalidDestination extends Error {}

/** Preserve WhatsApp IDs; stripping their suffix can target a different chat. */
export function chatDestination(value: string, isGroup: boolean): string {
  const raw = value.trim().toLowerCase()
  if (/^\d+(?:-\d+)?@(g\.us|s\.whatsapp\.net|c\.us|lid|newsletter)$/.test(raw)) {
    if (isGroup && !raw.endsWith('@g.us')) throw new InvalidDestination('O destino não corresponde ao grupo da conversa.')
    return raw
  }
  if (isGroup && /^\d+(?:-\d+)?$/.test(raw)) return `${raw}@g.us`
  if (!/^[+\d\s().-]+$/.test(raw)) throw new InvalidDestination('O contato não possui um destino WhatsApp válido.')
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) throw new InvalidDestination('O contato não possui um telefone internacional válido.')
  return digits.length <= 11 ? `55${digits}` : digits
}

async function providerPayload(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    if (!response.ok) return { error: 'provider_rejected' }
    throw new Error('Resposta de envio não reconhecida')
  }
  return body as Record<string, unknown>
}
