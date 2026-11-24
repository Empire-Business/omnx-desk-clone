import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { tokenUazapi, urlUazapi } from '../_shared/uazapi-credenciais.ts'
import { autorizarAgendador } from '../_shared/agendador-auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const HOURLY_LIMIT = 60

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

function randomDelay(minSec: number, maxSec: number): number {
  return Math.floor(Math.random() * (maxSec - minSec + 1) + minSec) * 1000
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function generateIaVariation(
  originalMessage: string,
  openrouterKey: string
): Promise<string> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4-5-20251001',
        messages: [
          {
            role: 'system',
            content:
              'Você é um assistente que reescreve mensagens de marketing mantendo o mesmo sentido, tom profissional e todas as informações. Apenas varie a estrutura e palavras. Responda APENAS com a mensagem reescrita, sem explicações.',
          },
          {
            role: 'user',
            content: `Reescreva esta mensagem de forma levemente diferente:\n\n${originalMessage}`,
          },
        ],
        temperature: 0.8,
        max_tokens: 500,
      }),
    })

    if (!res.ok) return originalMessage

    const data = await res.json()
    const variation = data.choices?.[0]?.message?.content?.trim()
    return variation || originalMessage
  } catch {
    return originalMessage
  }
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Só o agendador do banco (x-cron-secret) ou uma pessoa com permissão de
  // edição no Chat, e nesse caso só para uma campanha da empresa dela.
  const autorizacao = await autorizarAgendador(req, supabase, {
    criarUsuario: (jwt) => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    }),
    recurso: 'chat',
    acao: 'editar',
  })
  if (!autorizacao) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY') ?? ''

  let campaignId: string | null = null
  try {
    const body = await req.json()
    campaignId = body.campaign_id ?? null
  } catch {
    /* ignore */
  }

  if (!campaignId) {
    return new Response(JSON.stringify({ error: 'campaign_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let sent = 0
  let failed = 0

  try {
    // Load campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('chat_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign || (autorizacao.tipo === 'usuario' && campaign.tenant_id !== autorizacao.tenantId)) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get instance info
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', campaign.instance_id)
      .single()

    if (!instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get instance token
    const token = await tokenUazapi(supabase, instance.instance_id, instance.tenant_id)
    const UAZAPI_URL = await urlUazapi(supabase, instance.tenant_id)
    if (!token) {
      return new Response(JSON.stringify({ error: `Token not found for instance ${instance.instance_id}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Set campaign status to 'enviando'
    await supabase
      .from('chat_campaigns')
      .update({ status: 'enviando' })
      .eq('id', campaignId)

    // Load pending contacts
    const { data: contatos, error: contatosError } = await supabase
      .from('chat_campaign_contatos')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status_envio', 'pendente')

    if (contatosError) {
      return new Response(JSON.stringify({ error: contatosError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let sentThisHour = 0
    const hourStart = Date.now()

    for (const contato of contatos ?? []) {
      // Check cancellation
      const { data: currentCampaign } = await supabase
        .from('chat_campaigns')
        .select('status')
        .eq('id', campaignId)
        .single()

      if (currentCampaign?.status === 'cancelada') {
        console.log(`Campaign ${campaignId} was cancelled, stopping.`)
        break
      }

      // Respect hourly limit
      if (sentThisHour >= HOURLY_LIMIT) {
        const elapsed = Date.now() - hourStart
        const remaining = 3600000 - elapsed
        if (remaining > 0) {
          console.log(`Hourly limit reached, waiting ${Math.round(remaining / 1000)}s`)
          await sleep(remaining)
        }
        sentThisHour = 0
      }

      // Render template
      let mensagem = renderTemplate(campaign.mensagem_template, {
        nome: contato.nome ?? '',
      })

      // Apply IA variation if enabled
      if (campaign.usar_ia_variacao && openrouterKey) {
        mensagem = await generateIaVariation(mensagem, openrouterKey)
      }

      // Send via UAZAPI with presence simulation
      let sendSuccess = false
      try {
        // Simulate typing
        await fetch(`${UAZAPI_URL}/message/presence`, {
          method: 'POST',
          headers: { 'token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: contato.numero_whatsapp,
            presence: 'composing',
            delay: 3000,
          }),
        }).catch(() => {})

        const res = await fetch(`${UAZAPI_URL}/send/text`, {
          method: 'POST',
          headers: { 'token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: contato.numero_whatsapp,
            text: mensagem,
            delay: 2000,
            readchat: true,
          }),
        })
        sendSuccess = res.ok
      } catch {
        sendSuccess = false
      }

      const now = new Date().toISOString()

      // Update contact status
      await supabase
        .from('chat_campaign_contatos')
        .update({
          status_envio: sendSuccess ? 'enviado' : 'falha',
          enviado_em: now,
        })
        .eq('id', contato.id)

      // Update campaign counters
      if (sendSuccess) {
        sent++
        await supabase
          .from('chat_campaigns')
          .update({ enviados: sent })
          .eq('id', campaignId)
      } else {
        failed++
        await supabase
          .from('chat_campaigns')
          .update({ falhas: failed })
          .eq('id', campaignId)
      }

      sentThisHour++

      // Random delay between 8-25 seconds
      const delay = randomDelay(8, 25)
      console.log(`Sent to ${contato.numero_whatsapp}: ${sendSuccess ? 'OK' : 'FAIL'}, waiting ${delay}ms`)
      await sleep(delay)
    }

    // Mark campaign as completed
    const { data: finalCampaign } = await supabase
      .from('chat_campaigns')
      .select('status')
      .eq('id', campaignId)
      .single()

    if (finalCampaign?.status !== 'cancelada') {
      await supabase
        .from('chat_campaigns')
        .update({
          status: 'concluida',
          concluida_em: new Date().toISOString(),
          enviados: sent,
          falhas: failed,
        })
        .eq('id', campaignId)
    }

    console.log(`Broadcast campaign ${campaignId}: sent=${sent}, failed=${failed}`)

    return new Response(
      JSON.stringify({ campaign_id: campaignId, sent, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Broadcast scheduler error:', err)

    // Try to mark campaign as failed
    try {
      await supabase
        .from('chat_campaigns')
        .update({ status: 'cancelada', enviados: sent, falhas: failed })
        .eq('id', campaignId)
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
