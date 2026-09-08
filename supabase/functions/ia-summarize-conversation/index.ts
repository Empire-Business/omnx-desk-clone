import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const openrouterKey = Deno.env.get('OPENROUTER_API_KEY') ?? ''

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verify JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const jwt = authHeader.replace('Bearer ', '')
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Allow service role key or validate user token
  if (jwt !== supabaseKey) {
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // Parse body
  let body: { conversation_id: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { conversation_id } = body
  if (!conversation_id || typeof conversation_id !== 'string') {
    return new Response(JSON.stringify({ error: 'conversation_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Load ALL messages from the conversation
  const { data: messages, error: msgError } = await supabase
    .from('chat_messages')
    .select('conteudo, enviado_por_agente, enviado_por_ia, tipo, criado_em')
    .eq('conversation_id', conversation_id)
    .order('criado_em', { ascending: true })

  if (msgError) {
    return new Response(JSON.stringify({ error: 'Failed to load messages', detail: msgError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!messages || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'No messages found for this conversation' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Load conversation metadata
  const { data: conversation } = await supabase
    .from('chat_conversations')
    .select('status, departamento, criado_em, atualizado_em, contact_id')
    .eq('id', conversation_id)
    .single()

  // Build full conversation text
  const conversationText = messages
    .map(m => {
      let sender = 'Cliente'
      if (m.enviado_por_agente) sender = 'Agente'
      else if (m.enviado_por_ia) sender = 'IA Bot'

      const content = m.tipo === 'texto'
        ? (m.conteudo ?? '[vazio]')
        : `[${m.tipo}${m.conteudo ? ': ' + m.conteudo : ''}]`

      return `${sender}: ${content}`
    })
    .join('\n')

  const metadataContext = conversation
    ? `\nStatus da conversa: ${conversation.status ?? 'desconhecido'}` +
      (conversation.departamento ? `\nDepartamento: ${conversation.departamento}` : '') +
      `\nInício: ${conversation.criado_em}` +
      `\nÚltima atualização: ${conversation.atualizado_em}`
    : ''

  const systemPrompt = `Você é um assistente que resume conversas de atendimento ao cliente via WhatsApp de uma agência de marketing digital.

Resuma a conversa abaixo de forma objetiva e estruturada. Inclua: tema principal, status de resolução, pontos-chave e ações pendentes.

Retorne APENAS um JSON válido (sem markdown, sem explicação) no formato:
{
  "resumo": "<resumo em 2-4 frases>",
  "topico": "<tema principal da conversa>",
  "resolvido": <true se o problema foi resolvido, false caso contrário>,
  "pontos_chave": ["<ponto 1>", "<ponto 2>", ...],
  "acoes_pendentes": ["<ação 1>", "<ação 2>", ...]
}

Regras:
- Se não houver ações pendentes, retorne array vazio em acoes_pendentes
- O resumo deve ser conciso mas informativo
- pontos_chave deve ter no máximo 5 itens
- Escreva tudo em português brasileiro`

  if (!openrouterKey) {
    console.error('OPENROUTER_API_KEY not set')
    return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const openrouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openrouterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4.6',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${metadataContext}\n\nConversa (${messages.length} mensagens):\n${conversationText}` },
      ],
      temperature: 0.3,
    }),
  })

  if (!openrouterRes.ok) {
    const errorText = await openrouterRes.text()
    console.error('OpenRouter error ia-summarize-conversation:', openrouterRes.status, errorText)
    return new Response(JSON.stringify({ error: 'OpenRouter error', detail: errorText }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const completion = await openrouterRes.json()
  const responseText: string = completion.choices?.[0]?.message?.content ?? ''

  // Parse summary
  let summary: {
    resumo: string
    topico: string
    resolvido: boolean
    pontos_chave: string[]
    acoes_pendentes: string[]
  }

  try {
    const cleaned = responseText.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
    summary = JSON.parse(cleaned)
  } catch {
    summary = {
      resumo: responseText,
      topico: 'Não identificado',
      resolvido: false,
      pontos_chave: [],
      acoes_pendentes: [],
    }
  }

  // Try to save summary to chat_conversations.resumo_ia (if column exists)
  const { error: updateError } = await supabase
    .from('chat_conversations')
    .update({ resumo_ia: summary.resumo })
    .eq('id', conversation_id)

  if (updateError) {
    // Column might not exist yet — log but don't fail
    console.warn('Could not save resumo_ia to conversation:', updateError.message)
  }

  const result = {
    ...summary,
    conversation_id,
    messages_count: messages.length,
    saved: !updateError,
    tokens_input: completion.usage?.prompt_tokens ?? 0,
    tokens_output: completion.usage?.completion_tokens ?? 0,
  }

  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
