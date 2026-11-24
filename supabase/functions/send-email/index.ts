import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { travaDeLicenca } from '../_shared/htai-licenca.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const resendApiKey = Deno.env.get('RESEND_API_KEY')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

interface EmailAttachment {
  filename: string
  /** Conteúdo do anexo em base64 (sem o prefixo data:). */
  content: string
  content_type?: string
}

interface EmailPayload {
  to: string
  to_name?: string
  subject: string
  html: string
  text?: string
  type?: string
  ref_type?: string
  ref_id?: string
  attachments?: EmailAttachment[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  // Licença HTAI (desligada sem HTAI_ENTITLEMENTS_MODE; ver docs/LICENCA-HTAI.md)
  const licencaNegada = await travaDeLicenca(CORS_HEADERS)
  if (licencaNegada) return licencaNegada

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const body = await req.json()

    // Mode 1: Process pending emails from queue
    if (body.mode === 'process_queue') {
      return await processQueue(supabase)
    }

    // Mode 2: Send a single email (and optionally queue it)
    const { to, to_name, subject, html, text, type, ref_type, ref_id, attachments } = body as EmailPayload

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // Insert into queue
    const { data: queued, error: queueError } = await supabase
      .from('email_queue')
      .insert({
        destinatario_email: to,
        destinatario_nome: to_name ?? null,
        assunto: subject,
        corpo_html: html,
        corpo_texto: text ?? null,
        tipo: type ?? 'transacional',
        referencia_tipo: ref_type ?? null,
        referencia_id: ref_id ?? null,
        status: 'pendente',
      })
      .select('id')
      .single()

    if (queueError) {
      throw new Error(`Queue insert failed: ${queueError.message}`)
    }

    // Try to send immediately
    const sendResult = await sendEmail({ to, to_name, subject, html, text, attachments })

    if (sendResult.success) {
      await supabase
        .from('email_queue')
        .update({ status: 'enviado', enviado_em: new Date().toISOString(), tentativas: 1 })
        .eq('id', queued.id)
    } else {
      await supabase
        .from('email_queue')
        .update({ status: 'erro', erro: sendResult.error, tentativas: 1 })
        .eq('id', queued.id)
    }

    return new Response(
      JSON.stringify({
        success: sendResult.success,
        queued_id: queued.id,
        error: sendResult.error ?? undefined,
      }),
      { status: sendResult.success ? 200 : 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})

// ─── Process queue (batch) ───────────────────────────────────────────────────

async function processQueue(supabase: ReturnType<typeof createClient>) {
  const { data: pending, error } = await supabase
    .from('email_queue')
    .select('*')
    .eq('status', 'pendente')
    .lt('tentativas', 3)
    .order('criado_em', { ascending: true })
    .limit(20)

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  if (!pending || pending.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, message: 'No pending emails' }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  let sent = 0
  let failed = 0

  for (const email of pending) {
    await supabase
      .from('email_queue')
      .update({ status: 'enviando' })
      .eq('id', email.id)

    const result = await sendEmail({
      to: email.destinatario_email,
      to_name: email.destinatario_nome,
      subject: email.assunto,
      html: email.corpo_html,
      text: email.corpo_texto,
    })

    if (result.success) {
      await supabase
        .from('email_queue')
        .update({
          status: 'enviado',
          enviado_em: new Date().toISOString(),
          tentativas: email.tentativas + 1,
        })
        .eq('id', email.id)
      sent++
    } else {
      const newStatus = email.tentativas + 1 >= email.max_tentativas ? 'erro' : 'pendente'
      await supabase
        .from('email_queue')
        .update({
          status: newStatus,
          erro: result.error,
          tentativas: email.tentativas + 1,
        })
        .eq('id', email.id)
      failed++
    }
  }

  return new Response(
    JSON.stringify({ processed: pending.length, sent, failed }),
    { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  )
}

// ─── Send email via Resend (or fallback to Supabase built-in) ────────────────

async function sendEmail(params: {
  to: string
  to_name?: string | null
  subject: string
  html: string
  text?: string | null
  attachments?: EmailAttachment[]
}): Promise<{ success: boolean; error?: string }> {
  // If Resend API key is configured, use it
  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'OMNX Desk <noreply@omnx.pro>',
          to: params.to_name ? `${params.to_name} <${params.to}>` : params.to,
          subject: params.subject,
          html: params.html,
          text: params.text ?? undefined,
          attachments: params.attachments?.length
            ? params.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                content_type: a.content_type ?? undefined,
              }))
            : undefined,
        }),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        return { success: false, error: `Resend API error ${response.status}: ${errorBody}` }
      }

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Resend fetch failed' }
    }
  }

  // Fallback: log that no email provider is configured
  console.warn('No email provider configured (RESEND_API_KEY missing). Email queued but not sent.')
  return { success: false, error: 'No email provider configured. Set RESEND_API_KEY secret.' }
}
