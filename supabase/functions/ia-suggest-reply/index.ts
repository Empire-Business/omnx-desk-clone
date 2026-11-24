import { sessaoDeskLiberada } from '../_shared/desk-session.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { travaDeLicenca } from '../_shared/htai-licenca.ts'

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
  // Licença HTAI (desligada sem HTAI_ENTITLEMENTS_MODE; ver docs/LICENCA-HTAI.md)
  const licencaNegada = await travaDeLicenca({ 'Access-Control-Allow-Origin': '*' })
  if (licencaNegada) return licencaNegada

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
    const deskSession = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    })
    if (!await sessaoDeskLiberada(deskSession)) {
      return new Response(JSON.stringify({ error: 'password_change_required' }), {
        status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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

  // As leituras abaixo usam service_role (sem RLS). Antes, confere COMO o usuário
  // (JWT dele + RLS) que ele enxerga a conversa — inclui empresa, número atribuído
  // e grupo interno (restrito_admin, só admin/gerente).
  if (jwt !== supabaseKey) {
    const usuario = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    })
    const { data: visivel } = await usuario
      .from('chat_conversations')
      .select('id')
      .eq('id', conversation_id)
      .maybeSingle()
    if (!visivel) {
      return new Response(JSON.stringify({ error: 'Conversa não encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // Load last 10 messages from the conversation
  const { data: messages, error: msgError } = await supabase
    .from('chat_messages')
    .select('conteudo, enviado_por_agente, tipo, criado_em')
    .eq('conversation_id', conversation_id)
    .eq('tipo', 'texto')
    .order('criado_em', { ascending: false })
    .limit(10)

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

  // Reverse to chronological order
  const orderedMessages = messages.reverse()

  // Respostas rápidas: a tabela chat_respostas_rapidas não existe em migração
  // nenhuma (nem na produção); a consulta sempre voltava vazia. Decisão do dono
  // (09/11/2026): código que usa tabela inexistente sai do pacote instalável.

  // Build conversation context for the LLM
  const conversationText = orderedMessages
    .map(m => {
      const sender = m.enviado_por_agente ? 'Agente' : 'Cliente'
      return `${sender}: ${m.conteudo ?? '[mídia]'}`
    })
    .join('\n')

  const systemPrompt = `Você é um assistente de atendimento ao cliente via WhatsApp para uma empresa de serviços.
Com base na conversa abaixo, sugira 2 a 3 respostas curtas e profissionais em português brasileiro.

Regras:
- As respostas devem ser adequadas para WhatsApp (curtas, diretas, cordiais)
- Varie o tom entre as sugestões (formal, amigável, direto)
- Considere o contexto completo da conversa
- Se houver uma pergunta do cliente, responda-a
- Se o cliente estiver insatisfeito, priorize empatia
- Retorne APENAS um JSON válido (sem markdown, sem explicação) no formato:
[
  { "text": "<resposta sugerida>", "tone": "formal" | "amigavel" | "direto" }
]`

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
        { role: 'user', content: `Conversa:\n${conversationText}` },
      ],
      temperature: 0.7,
    }),
  })

  if (!openrouterRes.ok) {
    const errorText = await openrouterRes.text()
    console.error('OpenRouter error ia-suggest-reply:', openrouterRes.status, errorText)
    return new Response(JSON.stringify({ error: 'OpenRouter error', detail: errorText }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const completion = await openrouterRes.json()
  const responseText: string = completion.choices?.[0]?.message?.content ?? ''

  // Parse suggestions
  let suggestions: { text: string; tone: 'formal' | 'amigavel' | 'direto' }[]
  try {
    const cleaned = responseText.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
    suggestions = JSON.parse(cleaned)
  } catch {
    suggestions = []
  }

  const result = {
    suggestions,
    conversation_id,
    messages_analyzed: orderedMessages.length,
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
