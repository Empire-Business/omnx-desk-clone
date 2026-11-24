import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { tokenUazapi, urlUazapi } from '../_shared/uazapi-credenciais.ts'
import { autorizarAgendador } from '../_shared/agendador-auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}
const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' }


function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

// Check if current time (UTC-3 São Paulo) is within business hours
function isWithinSchedule(horarioInicio: string, horarioFim: string): boolean {
  const now = new Date()
  const spHour = (now.getUTCHours() - 3 + 24) % 24
  const spMin = now.getUTCMinutes()
  const currentMinutes = spHour * 60 + spMin

  const [startH, startM] = horarioInicio.split(':').map(Number)
  const [endH, endM] = horarioFim.split(':').map(Number)
  const startMinutes = startH * 60 + (startM || 0)
  const endMinutes = endH * 60 + (endM || 0)

  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}

// Random delay between min and max seconds
function randomDelay(minSec: number, maxSec: number): number {
  return Math.floor(Math.random() * (maxSec - minSec + 1) + minSec) * 1000
}

// Generate IA variation of a message using OpenRouter
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
            content: 'Você é um assistente que reescreve mensagens de cobrança mantendo o mesmo sentido, tom profissional e todas as informações (valores, datas, nomes). Apenas varie a estrutura e palavras. Responda APENAS com a mensagem reescrita, sem explicações.',
          },
          {
            role: 'user',
            content: `Reescreva esta mensagem de cobrança de forma levemente diferente:\n\n${originalMessage}`,
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
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: JSON_HEADERS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Só o agendador do banco (x-cron-secret) ou uma pessoa com permissão de
  // cobrança, e nesse caso só para um devedor da empresa dela.
  const autorizacao = await autorizarAgendador(req, supabase, {
    criarUsuario: (jwt) => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    }),
    recurso: 'cobranca',
    acao: 'editar',
  })
  if (!autorizacao) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: JSON_HEADERS })

  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY') ?? ''

  // Support manual trigger for a specific devedor
  let manualDevedorId: string | null = null
  try {
    const body = await req.json()
    manualDevedorId = typeof body?.devedor_id === 'string' && body.devedor_id ? body.devedor_id : null
  } catch { /* ignore */ }
  if (autorizacao.tipo === 'usuario' && !manualDevedorId) {
    return new Response(JSON.stringify({ error: 'devedor_id é obrigatório' }), { status: 400, headers: JSON_HEADERS })
  }

  const now = new Date().toISOString()

  let processed = 0
  let sent = 0
  let failed = 0
  let skippedSchedule = 0

  try {
    // Get devedores ready to send
    let devedorQuery = supabase
      .from('cobranca_devedores')
      .select('*, cobranca_reguas(id, nome, cobranca_regua_passos(*))')
      .eq('status', 'ativa')

    if (autorizacao.tipo === 'usuario') {
      devedorQuery = devedorQuery.eq('tenant_id', autorizacao.tenantId)
    }
    if (manualDevedorId) {
      devedorQuery = devedorQuery.eq('id', manualDevedorId)
    } else {
      devedorQuery = devedorQuery.lte('proximo_envio_em', now)
    }

    const { data: devedores, error: devedoresError } = await devedorQuery

    if (devedoresError) {
      return new Response(JSON.stringify({ error: devedoresError.message }), {
        status: 500,
        headers: JSON_HEADERS,
      })
    }

    // Get all cobrança instances for token lookup
    const { data: instances } = await supabase
      .from('cobranca_instances')
      .select('*')
      .eq('ativo', true)

    const instanceMap = new Map(
      (instances ?? []).map(i => [i.id, i])
    )

    for (const devedor of devedores ?? []) {
      processed++

      // Get the instance for this devedor
      const instance = instanceMap.get(devedor.instance_id)
      if (!instance) {
        console.error(`Instance not found for devedor ${devedor.id}`)
        failed++
        continue
      }

      // Check schedule (skip if outside business hours, unless manual)
      if (!manualDevedorId && !isWithinSchedule(instance.horario_inicio, instance.horario_fim)) {
        skippedSchedule++
        continue
      }

      // Token e endereço só pelo _shared/uazapi-credenciais.ts: cofre do número
      // (Chat ou Cobrança > Números, migrações 20261109120000 e 20261109121000) →
      // cofre da empresa (número principal da aba Conexão) → segredo legado
      // UAZAPI_TOKEN_<instance_id> (produção sem token no cofre: igual a antes).
      const token = await tokenUazapi(supabase, instance.instance_id, instance.tenant_id)
      const UAZAPI_URL = await urlUazapi(supabase, instance.tenant_id)
      if (!token) {
        console.error(`Token not found for instance ${instance.instance_id}`)
        failed++
        continue
      }

      const passos: Array<{
        id: string
        ordem: number
        dias_apos_anterior: number
        mensagem_template: string
        usar_ia_variacao: boolean
      }> = devedor.cobranca_reguas?.cobranca_regua_passos ?? []

      // Sort passos by ordem
      passos.sort((a, b) => a.ordem - b.ordem)

      const passoAtual = passos.find(p => p.ordem === devedor.passo_atual)

      if (!passoAtual) {
        // No more steps — close the collection
        await supabase
          .from('cobranca_devedores')
          .update({ status: 'encerrada' })
          .eq('id', devedor.id)
        continue
      }

      // Render template with devedor data
      let mensagem = renderTemplate(passoAtual.mensagem_template, {
        nome: devedor.nome ?? '',
        valor: devedor.valor_divida ? Number(devedor.valor_divida).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '',
        data_vencimento: devedor.data_vencimento
          ? new Date(devedor.data_vencimento).toLocaleDateString('pt-BR')
          : '',
        descricao: devedor.descricao_divida ?? '',
      })

      // Apply IA variation if enabled
      if (passoAtual.usar_ia_variacao && openrouterKey) {
        mensagem = await generateIaVariation(mensagem, openrouterKey)
      }

      // Insert send record
      const { data: sendRecord, error: insertError } = await supabase
        .from('cobranca_sends')
        .insert({
          devedor_id: devedor.id,
          passo: devedor.passo_atual,
          mensagem_enviada: mensagem,
          status_envio: 'enviando',
          enviado_em: now,
        })
        .select()
        .single()

      if (insertError) {
        failed++
        continue
      }

      // Send via UAZAPI with presence simulation
      let sendSuccess = false
      try {
        // Simulate typing
        await fetch(`${UAZAPI_URL}/message/presence`, {
          method: 'POST',
          headers: { 'token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: devedor.numero_whatsapp,
            presence: 'composing',
            delay: randomDelay(instance.intervalo_min_segundos, instance.intervalo_max_segundos),
          }),
        }).catch(() => {})

        const res = await fetch(`${UAZAPI_URL}/send/text`, {
          method: 'POST',
          headers: { 'token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: devedor.numero_whatsapp,
            text: mensagem,
            delay: 2000,
            readchat: true,
          }),
        })
        sendSuccess = res.ok
      } catch {
        sendSuccess = false
      }

      // Update send status
      await supabase
        .from('cobranca_sends')
        .update({ status_envio: sendSuccess ? 'enviado' : 'falha' })
        .eq('id', sendRecord.id)

      if (sendSuccess) {
        sent++
      } else {
        failed++
      }

      // Advance to next step
      const proximoPasso = passos.find(p => p.ordem === devedor.passo_atual + 1)

      if (!proximoPasso) {
        await supabase
          .from('cobranca_devedores')
          .update({ status: 'encerrada', passo_atual: devedor.passo_atual })
          .eq('id', devedor.id)
      } else {
        const proximoEnvio = new Date()
        proximoEnvio.setDate(proximoEnvio.getDate() + (proximoPasso.dias_apos_anterior ?? 1))

        await supabase
          .from('cobranca_devedores')
          .update({
            passo_atual: devedor.passo_atual + 1,
            proximo_envio_em: proximoEnvio.toISOString(),
          })
          .eq('id', devedor.id)
      }
    }

    console.log(`Cobrança scheduler: processed=${processed}, sent=${sent}, failed=${failed}, skipped=${skippedSchedule}`)

    return new Response(
      JSON.stringify({ processed, sent, failed, skipped_schedule: skippedSchedule }),
      { headers: JSON_HEADERS }
    )
  } catch (err) {
    console.error('Cobrança scheduler error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: JSON_HEADERS }
    )
  }
})
