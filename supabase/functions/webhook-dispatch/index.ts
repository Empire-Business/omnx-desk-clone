import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Content-Type': 'application/json',
}

// ─── HMAC-SHA256 signing ─────────────────────────────────────────────────────

async function signPayload(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const hashArray = Array.from(new Uint8Array(signature))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ─── Dispatch event to all matching webhooks ─────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: CORS_HEADERS,
    })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const { evento, payload } = (await req.json()) as {
      evento: string
      payload: Record<string, unknown>
    }

    if (!evento) {
      return new Response(JSON.stringify({ error: 'Missing evento' }), {
        status: 400,
        headers: CORS_HEADERS,
      })
    }

    // Find all active webhooks subscribed to this event
    const { data: webhooks, error: err } = await supabase
      .from('webhooks')
      .select('id, url, secret, eventos')
      .eq('ativo', true)

    if (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: CORS_HEADERS,
      })
    }

    const matchingWebhooks = (webhooks ?? []).filter((w) =>
      (w.eventos as string[]).includes(evento),
    )

    if (matchingWebhooks.length === 0) {
      return new Response(
        JSON.stringify({ dispatched: 0, message: 'No matching webhooks' }),
        { headers: CORS_HEADERS },
      )
    }

    const results = await Promise.allSettled(
      matchingWebhooks.map(async (webhook) => {
        const body = JSON.stringify({
          evento,
          timestamp: new Date().toISOString(),
          payload,
        })

        const signature = await signPayload(webhook.secret, body)
        const startTime = Date.now()

        let statusCode = 0
        let responseBody = ''
        let sucesso = false

        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Signature': `sha256=${signature}`,
              'X-Webhook-Event': evento,
              'User-Agent': 'ONMXDesk-Webhook/1.0',
            },
            body,
            signal: controller.signal,
          })

          clearTimeout(timeout)
          statusCode = response.status
          responseBody = (await response.text()).slice(0, 1000) // limit response size
          sucesso = response.ok
        } catch (fetchErr) {
          responseBody = fetchErr instanceof Error ? fetchErr.message : 'Fetch failed'
        }

        const duracaoMs = Date.now() - startTime

        // Log the delivery
        await supabase.from('webhook_logs').insert({
          webhook_id: webhook.id,
          evento,
          payload,
          status_code: statusCode || null,
          response_body: responseBody,
          duracao_ms: duracaoMs,
          sucesso,
        })

        // Prune old logs (keep last 100 per webhook)
        const { data: oldLogs } = await supabase
          .from('webhook_logs')
          .select('id')
          .eq('webhook_id', webhook.id)
          .order('criado_em', { ascending: false })
          .range(100, 200)

        if (oldLogs && oldLogs.length > 0) {
          await supabase
            .from('webhook_logs')
            .delete()
            .in('id', oldLogs.map((l) => l.id))
        }

        return { webhook_id: webhook.id, sucesso, statusCode, duracaoMs }
      }),
    )

    const dispatched = results.filter((r) => r.status === 'fulfilled').length

    return new Response(
      JSON.stringify({ dispatched, total: matchingWebhooks.length }),
      { headers: CORS_HEADERS },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: CORS_HEADERS,
    })
  }
})
