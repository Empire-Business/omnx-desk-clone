import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { sessaoDeskLiberada } from '../_shared/desk-session.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')!

const ALERT_WORDS = [
  'cancelar', 'cancelamento', 'cancela',
  'absurdo', 'absurda',
  'nunca mais',
  'advogado', 'advogada',
  'procon',
  'processo', 'processar',
  'denuncia', 'denunciar',
  'reclame aqui',
  'tribunal',
]

servirComLicenca(async (req) => {
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
  let body: { message_text: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { message_text } = body
  if (!message_text || typeof message_text !== 'string') {
    return new Response(JSON.stringify({ error: 'message_text is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Check for alert words locally (fast path)
  const msgLower = message_text.toLowerCase()
  const foundAlertWords = ALERT_WORDS.filter(w => msgLower.includes(w))
  const hasAlert = foundAlertWords.length > 0

  // Call OpenRouter for sentiment analysis
  const systemPrompt = `Você é um analisador de sentimento de mensagens de atendimento ao cliente via WhatsApp.
Analise a mensagem do cliente e retorne APENAS um JSON válido (sem markdown, sem explicação) com a seguinte estrutura:
{
  "sentiment": "positivo" | "neutro" | "negativo",
  "confidence": <número de 0.0 a 1.0>,
  "keywords": [<palavras-chave relevantes extraídas da mensagem>]
}

Regras:
- "sentiment" deve ser exatamente uma das três opções: "positivo", "neutro" ou "negativo"
- "confidence" é um número entre 0 e 1 representando sua confiança na classificação
- "keywords" são as palavras ou expressões mais relevantes da mensagem (máximo 5)
- Responda SOMENTE com o JSON, sem texto adicional`

  const openrouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openrouterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message_text },
      ],
      temperature: 0.2,
    }),
  })

  if (!openrouterRes.ok) {
    const errorText = await openrouterRes.text()
    return new Response(JSON.stringify({ error: 'OpenRouter error', detail: errorText }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const completion = await openrouterRes.json()
  const responseText: string = completion.choices?.[0]?.message?.content ?? ''

  // Parse the LLM response
  let analysis: {
    sentiment: 'positivo' | 'neutro' | 'negativo'
    confidence: number
    keywords: string[]
  }

  try {
    // Strip markdown code fences if present
    const cleaned = responseText.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
    analysis = JSON.parse(cleaned)
  } catch {
    // Fallback if parsing fails
    analysis = {
      sentiment: 'neutro',
      confidence: 0,
      keywords: [],
    }
  }

  const result = {
    sentiment: analysis.sentiment,
    confidence: analysis.confidence,
    keywords: analysis.keywords,
    alerta: hasAlert,
    palavras_alerta: foundAlertWords.length > 0 ? foundAlertWords : undefined,
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
