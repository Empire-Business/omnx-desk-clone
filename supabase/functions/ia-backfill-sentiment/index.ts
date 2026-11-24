import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALERT_WORDS = [
  'cancelar', 'cancelamento', 'cancela',
  'absurdo', 'absurda', 'nunca mais',
  'advogado', 'advogada', 'procon',
  'processo', 'processar',
  'denuncia', 'denunciar',
  'reclame aqui', 'tribunal',
]

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const openrouterKey = (Deno.env.get('OPENROUTER_API_KEY') ?? '').trim()
    if (!openrouterKey) {
      return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body: any = {}
    try { body = await req.json() } catch { /* no body */ }

    const limit = body.limit ?? 50 // process N conversations per call

    // Get conversations without sentiment (non-group only)
    const { data: conversations, error: convErr } = await supabase
      .from('chat_conversations')
      .select('id, contact_id')
      .is('sentimento', null)
      .eq('is_group', false)
      .limit(limit)

    if (convErr) throw convErr

    console.log(`Backfill: found ${conversations?.length ?? 0} conversations without sentiment`)

    let processed = 0, skipped = 0, errors = 0
    const errorDetails: string[] = []

    for (const conv of conversations ?? []) {
      // Get last 20 client messages (not from agent)
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('conteudo, enviado_por_agente, criado_em')
        .eq('conversation_id', conv.id)
        .eq('tipo', 'texto')
        .eq('enviado_por_agente', false)
        .not('conteudo', 'is', null)
        .order('criado_em', { ascending: false })
        .limit(20)

      if (!messages || messages.length === 0) {
        skipped++
        continue
      }

      // Combine messages into single text for analysis
      const combined = messages
        .reverse()
        .map(m => m.conteudo as string)
        .filter(Boolean)
        .join(' ')
        .trim()

      if (!combined) {
        skipped++
        continue
      }

      // Check alert words locally
      const lowerCombined = combined.toLowerCase()
      const hasAlert = ALERT_WORDS.some(w => lowerCombined.includes(w))

      try {
        const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openrouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://omnxdesk.com.br',
            'X-Title': 'OMNX Desk Sentiment Backfill',
          },
          body: JSON.stringify({
            model: 'openai/gpt-4o-mini',
            max_tokens: 100,
            temperature: 0.1,
            messages: [
              {
                role: 'user',
                content: `Analise o sentimento geral das mensagens abaixo de um cliente em atendimento via WhatsApp. Retorne SOMENTE um JSON: {"sentiment":"positivo"|"neutro"|"negativo"}

Mensagens:
${combined.slice(0, 2000)}`,
              },
            ],
          }),
        })

        if (!aiRes.ok) {
          const errText = await aiRes.text()
          errorDetails.push(`Conv ${conv.id}: ${aiRes.status} ${errText.slice(0, 100)}`)
          errors++
          continue
        }

        const aiData = await aiRes.json()
        const content = (aiData.choices?.[0]?.message?.content ?? '').trim()

        let sentiment: string = 'neutro'
        try {
          const cleaned = content.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
          const parsed = JSON.parse(cleaned)
          if (['positivo', 'neutro', 'negativo'].includes(parsed.sentiment)) {
            sentiment = parsed.sentiment
          }
        } catch {
          const match = content.match(/(positivo|neutro|negativo)/i)
          if (match) sentiment = match[1].toLowerCase()
        }

        // Update conversation sentimento
        const updatePayload: Record<string, unknown> = { sentimento: sentiment }

        const { error: updateErr } = await supabase
          .from('chat_conversations')
          .update(updatePayload)
          .eq('id', conv.id)

        if (updateErr) {
          errorDetails.push(`Update ${conv.id}: ${updateErr.message}`)
          errors++
        } else {
          processed++
          console.log(`✓ Conv ${conv.id}: ${sentiment}${hasAlert ? ' [ALERTA]' : ''}`)
        }

        // Rate limit: 500ms between calls
        await new Promise(r => setTimeout(r, 500))
      } catch (e) {
        errorDetails.push(`Exception ${conv.id}: ${String(e)}`)
        errors++
      }
    }

    const remaining = (conversations?.length ?? 0) === limit ? 'possivelmente mais' : '0'

    return new Response(
      JSON.stringify({ ok: true, processed, skipped, errors, remaining, errorDetails }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('Fatal:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
