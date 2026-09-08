// ATENÇÃO: Esta função DEVE ser deployada com verify_jwt: FALSE
// Ela suporta dois tipos de autenticação: JWT de usuário E service role key (usado pelo bot/webhook)
// Se deployada com verify_jwt: true, o gateway do Supabase rejeita os requests com 401
// e os envios de mensagem param de funcionar completamente.
// A validação de JWT é feita manualmente dentro da função (linhas abaixo).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UAZAPI_URL = 'https://empirebusiness.uazapi.com'

// Map our internal types to UAZAPI media types
const MEDIA_TYPE_MAP: Record<string, string> = {
  imagem: 'image',
  video: 'video',
  audio: 'ptt', // Send as voice message (blue bubble)
  documento: 'document',
  sticker: 'sticker',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const jwt = authHeader.replace('Bearer ', '')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Support both user JWT and service role key (for auto_mode from webhook/bot)
    let agentId: string | null = null
    if (jwt !== serviceKey) {
      const { data: { user } } = await supabase.auth.getUser(jwt)
      if (!user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
      agentId = user.id
    }

    const { conversation_id, conteudo, tipo = 'texto', media_url, enviado_por_ia = false, reply_to_id } = await req.json()

    // Fetch agent name and setting in parallel (only if agent is sending)
    let agentName: string | null = null
    let showNameOnWpp = false
    if (agentId && !enviado_por_ia) {
      const [agentRes, settingRes] = await Promise.all([
        supabase.from('users').select('nome').eq('id', agentId).single(),
        supabase.from('app_settings').select('valor').eq('chave', 'chat_mostrar_nome_agente_wpp').single(),
      ])
      agentName = agentRes.data?.nome ?? null
      showNameOnWpp = settingRes.data?.valor === 'true'
    }

    const { data: conv } = await supabase
      .from('chat_conversations')
      .select('*, chat_contacts(numero_whatsapp), whatsapp_instances(instance_id), chat_departments(nome)')
      .eq('id', conversation_id)
      .single()
    if (!conv) return new Response('Conversation not found', { status: 404, headers: corsHeaders })

    // Prepend agent name to text if enabled
    let textoFinal = conteudo
    if (showNameOnWpp && agentName && conteudo) {
      const deptName = conv.chat_departments?.nome
      const label = deptName ? `${deptName} - ${agentName}` : agentName
      textoFinal = `*${label}:*\n${conteudo}`
    }

    const instanceId = conv.whatsapp_instances?.instance_id
    const token = Deno.env.get(`UAZAPI_TOKEN_${instanceId}`)
    if (!token) return new Response('Instance token not configured', { status: 500, headers: corsHeaders })

    // Normalize phone: only add BR country code 55 if number has no country code yet
    // (10-11 digits = local BR format without DDI). Numbers with DDI already (12+ digits) are kept as-is.
    let numero = conv.chat_contacts?.numero_whatsapp ?? ''
    const digitsOnly = numero.replace(/\D/g, '')
    if (digitsOnly.length >= 10 && digitsOnly.length <= 11) {
      numero = `55${digitsOnly}`
    } else {
      numero = digitsOnly
    }

    // Resolve reply_to_id to WhatsApp message ID for quoting
    let quotedMsgId: string | null = null
    if (reply_to_id) {
      const { data: replyMsg } = await supabase
        .from('chat_messages')
        .select('message_id_wpp')
        .eq('id', reply_to_id)
        .single()
      quotedMsgId = replyMsg?.message_id_wpp ?? null
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
      if (quotedMsgId) textPayload.quotedMsgId = quotedMsgId

      uazapiRes = await fetch(`${UAZAPI_URL}/send/text`, {
        method: 'POST',
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(textPayload),
      })
      uazapiData = await uazapiRes.json()
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

      if (quotedMsgId) mediaPayload.quotedMsgId = quotedMsgId

      uazapiRes = await fetch(`${UAZAPI_URL}/send/media`, {
        method: 'POST',
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(mediaPayload),
      })
      uazapiData = await uazapiRes.json()
    }

    // Record message in DB
    // O tenant vem da conversa. A edge function roda com service_role (sem sessão),
    // então o carimbo automático do banco não consegue resolver o tenant sozinho
    // quando existe mais de uma empresa no sistema — por isso ele é informado aqui.
    const { error: insertError } = await supabase.from('chat_messages').insert({
      tenant_id: conv.tenant_id,
      conversation_id,
      message_id_wpp: uazapiData?.messageid ?? uazapiData?.key?.id ?? null,
      tipo,
      conteudo,
      media_url: media_url ?? null,
      enviado_por_agente: !enviado_por_ia,
      enviado_por_ia,
      agente_id: agentId,
      status_envio: uazapiRes.ok ? 'enviada' : 'falha',
      reply_to_id: reply_to_id ?? null,
    })

    if (insertError) {
      console.error('Falha ao salvar mensagem no banco:', insertError)
      return new Response(
        JSON.stringify({ error: 'Mensagem enviada ao WhatsApp, mas falhou ao salvar no banco', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    await supabase.from('chat_conversations')
      .update({ atualizado_em: new Date().toISOString() })
      .eq('id', conversation_id)

    return new Response(JSON.stringify({ ok: true, uazapi: uazapiData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
