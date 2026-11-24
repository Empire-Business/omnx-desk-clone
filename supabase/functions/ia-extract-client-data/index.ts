import { servirComLicenca } from '../_shared/htai-licenca.ts'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const openrouterKey = (Deno.env.get('OPENROUTER_API_KEY') ?? '').trim()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const jwt = authHeader.replace('Bearer ', '')

    if (jwt !== supabaseKey) {
      const authRes = await fetch(supabaseUrl + '/auth/v1/user', {
        headers: { 'Authorization': authHeader, 'apikey': supabaseKey },
      })
      if (!authRes.ok) {
        return jsonResponse({ error: 'Invalid token' }, 401)
      }
    }

    const { conversation_id } = await req.json()
    if (!conversation_id || typeof conversation_id !== 'string') {
      return jsonResponse({ error: 'conversation_id is required' }, 400)
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversation_id)) {
      return jsonResponse({ error: 'conversation_id inválido' }, 400)
    }

    // As leituras abaixo usam service_role (sem RLS). Antes, confere COMO o usuário
    // (JWT dele + RLS) que ele enxerga a conversa — inclui empresa, número atribuído
    // e grupo interno (restrito_admin, só admin/gerente).
    if (jwt !== supabaseKey) {
      const visRes = await fetch(
        supabaseUrl + '/rest/v1/chat_conversations?id=eq.' + conversation_id + '&select=id&limit=1',
        { headers: { 'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '', 'Authorization': authHeader } }
      )
      const vis = visRes.ok ? await visRes.json() : []
      if (!Array.isArray(vis) || vis.length === 0) {
        return jsonResponse({ error: 'Conversa não encontrada' }, 404)
      }
    }

    const msgRes = await fetch(
      supabaseUrl + '/rest/v1/chat_messages?conversation_id=eq.' + conversation_id + '&tipo=eq.texto&conteudo=not.is.null&select=conteudo,enviado_por_agente,criado_em&order=criado_em.asc&limit=60',
      { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    )
    if (!msgRes.ok) {
      return jsonResponse({ error: 'Failed to load messages' }, 500)
    }
    const messages = await msgRes.json()

    if (!messages || messages.length === 0) {
      return jsonResponse({ error: 'No messages found' }, 404)
    }

    const convRes = await fetch(
      supabaseUrl + '/rest/v1/chat_conversations?id=eq.' + conversation_id + '&select=contact_id,chat_contacts(numero_whatsapp,nome)&limit=1',
      { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    )
    let contactPhone = ''
    if (convRes.ok) {
      const convData = await convRes.json()
      if (convData?.[0]?.chat_contacts?.numero_whatsapp) {
        contactPhone = convData[0].chat_contacts.numero_whatsapp
      }
    }

    const conversationText = messages
      .map((m: any) => {
        const sender = m.enviado_por_agente ? 'Agente' : 'Cliente'
        return sender + ': ' + (m.conteudo ?? '')
      })
      .join('\n')

    if (!openrouterKey) {
      return jsonResponse({ error: 'OPENROUTER_API_KEY not configured' }, 500)
    }

    const systemPrompt = 'Voce e um assistente que extrai dados cadastrais de clientes a partir de conversas de WhatsApp. Analise a conversa abaixo e extraia todos os dados do CLIENTE (nao do agente) que possam ser usados para cadastro. O agente normalmente envia os dados para confirmacao do cliente. Extraia esses dados confirmados. Retorne APENAS um JSON valido (sem markdown, sem explicacao) com os seguintes campos (use string vazia "" se nao encontrar): {"nome": "Nome completo da pessoa", "empresa": "Nome da empresa (se mencionada)", "razao_social": "Razao social (se mencionada)", "cnpj": "CPF ou CNPJ", "email": "Email", "telefone": "Telefone", "whatsapp": "' + contactPhone + '", "instagram": "Instagram (com @)", "endereco": "Endereco completo com CEP", "segmento": "Segmento/area de atuacao (se identificavel)", "nicho": "Nicho (se identificavel)", "notas": "Resumo breve do contexto do cliente (ex: tipo de contrato, observacoes relevantes)"}. Regras: Extraia APENAS dados explicitamente mencionados na conversa. Se o cliente corrigiu algum dado, use a versao corrigida. O campo whatsapp ja esta preenchido com o numero do contato. Para instagram, inclua o @ no inicio. Para notas, faca um resumo util do contexto (max 200 chars).'

    const openrouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + openrouterKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-6',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Conversa:\n' + conversationText },
        ],
        temperature: 0.1,
      }),
    })

    if (!openrouterRes.ok) {
      const errorText = await openrouterRes.text()
      return jsonResponse({ error: 'OpenRouter error', status: openrouterRes.status, detail: errorText }, 502)
    }

    const completion = await openrouterRes.json()
    const responseText: string = completion.choices?.[0]?.message?.content ?? ''

    let clientData: Record<string, string>
    try {
      const cleaned = responseText.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
      clientData = JSON.parse(cleaned)
    } catch {
      return jsonResponse({ error: 'Failed to parse AI response', raw: responseText }, 500)
    }

    return jsonResponse({
      client_data: clientData,
      conversation_id,
      messages_analyzed: messages.length,
      tokens_input: completion.usage?.prompt_tokens ?? 0,
      tokens_output: completion.usage?.completion_tokens ?? 0,
    })
  } catch (err) {
    return jsonResponse({ error: 'Internal error', detail: String(err) }, 500)
  }
})
