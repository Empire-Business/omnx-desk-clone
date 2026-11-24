// Aquecimento de chip: a cada minuto o cron chama esta função.
// Para cada grupo ATIVO, decide (com base em horário + intervalo aleatório)
// se uma instância sorteada envia uma frase sorteada do pool ao grupo.
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { tokenUazapi, urlUazapi } from '../_shared/uazapi-credenciais.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}


interface WarmupGroup {
  id: string
  nome: string
  wa_chatid: string
  instance_ids: string[]
  frases: string[]
  intervalo_min_seg: number
  intervalo_max_seg: number
  horario_inicio: string
  horario_fim: string
  ativo: boolean
  proxima_mensagem_em: string | null
  usar_ia: boolean
  tema: string
  personalidades: Record<string, string>
  pesos: Record<string, number>
}

function pickWeighted(ids: string[], pesos: Record<string, number>): string {
  const weighted = ids.map((id) => ({ id, w: Math.max(1, pesos?.[id] ?? 1) }))
  const total = weighted.reduce((s, x) => s + x.w, 0)
  let r = Math.random() * total
  for (const x of weighted) {
    r -= x.w
    if (r <= 0) return x.id
  }
  return weighted[weighted.length - 1].id
}

async function gerarMensagemIA(
  supabase: ReturnType<typeof createClient>,
  group: WarmupGroup,
  instanceId: string,
): Promise<string | null> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) return null

  const { data: lastLogs } = await supabase
    .from('wa_warmup_logs')
    .select('instance_id, mensagem, enviado_em')
    .eq('group_id', group.id)
    .eq('sucesso', true)
    .order('enviado_em', { ascending: false })
    .limit(15)

  const contexto = (lastLogs ?? [])
    .reverse()
    .map((l) => `[${l.instance_id}]: ${l.mensagem}`)
    .join('\n')

  const personality =
    group.personalidades?.[instanceId] ??
    'Pessoa comum conversando casualmente'

  const systemPrompt = `Você é "${instanceId}" — ${personality}.
Está conversando num grupo de WhatsApp sobre: ${group.tema}.
Regras:
- Responda APENAS com a mensagem que você mandaria, sem aspas, sem prefixo, sem explicação
- Curta: 1 a 2 linhas, estilo WhatsApp brasileiro
- Português do Brasil informal
- Pode usar emoji moderadamente
- Não repita literalmente o que outros já disseram
- IMPORTANTÍSSIMO: traga ASSUNTO NOVO. Olhe o contexto e identifique do que JÁ se falou (jogadores, jogos, cantos, piadas) — fale de algo DIFERENTE. Varie entre: jogador específico, jogo recente/clássico, escalação, técnico, lance polêmico, conquista histórica, rival, canto, time da base, reforço, contratação, treino, contundido, narrador, etc.
- Não use "@" mencionando ninguém
- Se o contexto estiver vazio, comece um assunto natural sobre o tema
- NUNCA, JAMAIS use 🦅 (águia/gavião) — esse é símbolo do CORINTHIANS, não do Vasco. O símbolo do Vasco é a Cruz de Malta. Pode usar ⚓ (Vasco é clube náutico), ⚫⚪ (cores), ✝️ ou só sem emoji`

  const userPrompt = contexto
    ? `Últimas mensagens do grupo:\n${contexto}\n\nAgora envie sua próxima mensagem.`
    : `O grupo está em silêncio. Inicie uma conversa natural sobre o tema.`

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-flash-1.5',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 1.1,
        max_tokens: 120,
        frequency_penalty: 0.7,
        presence_penalty: 0.7,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text: string | undefined = data?.choices?.[0]?.message?.content
    if (!text) return null
    return text.trim().replace(/^["']|["']$/g, '').substring(0, 280)
  } catch {
    return null
  }
}

function brtTimeHHMM(): string {
  const now = new Date()
  const brt = new Date(now.getTime() - 3 * 3600 * 1000)
  return brt.toISOString().substring(11, 16)
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: groups, error } = await supabase
    .from('wa_warmup_groups')
    .select('*')
    .eq('ativo', true)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const now = new Date()
  const currentBrt = brtTimeHHMM()
  const results: Record<string, unknown>[] = []

  for (const g of (groups ?? []) as WarmupGroup[]) {
    if (currentBrt < g.horario_inicio || currentBrt > g.horario_fim) {
      results.push({ group: g.nome, skipped: 'fora_do_horario', brt: currentBrt })
      continue
    }
    if (g.proxima_mensagem_em && new Date(g.proxima_mensagem_em) > now) {
      results.push({ group: g.nome, skipped: 'aguardando_intervalo' })
      continue
    }
    const instanceIds = g.instance_ids ?? []
    const frases = Array.isArray(g.frases) ? g.frases : []
    if (instanceIds.length === 0 || frases.length === 0) {
      results.push({ group: g.nome, skipped: 'config_incompleta' })
      continue
    }

    const instanceId = pickWeighted(instanceIds, g.pesos ?? {})
    let mensagem: string | null = null
    if (g.usar_ia) {
      mensagem = await gerarMensagemIA(supabase, g, instanceId)
    }
    if (!mensagem) {
      mensagem = pickRandom(frases)
    }
    const tenantDoGrupo = (g as { tenant_id?: string | null }).tenant_id ?? null
    const token = await tokenUazapi(supabase, instanceId, tenantDoGrupo)
    const UAZAPI_URL = await urlUazapi(supabase, tenantDoGrupo)
    if (!token) {
      results.push({ group: g.nome, error: `token_missing_${instanceId}` })
      continue
    }

    // Presença "digitando" antes de enviar
    fetch(`${UAZAPI_URL}/message/presence`, {
      method: 'POST',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: g.wa_chatid, presence: 'composing' }),
    }).catch(() => {})

    // Pequeno delay 2-5s pra parecer humano
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000))

    const res = await fetch(`${UAZAPI_URL}/send/text`, {
      method: 'POST',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: g.wa_chatid, text: mensagem, readchat: true }),
    })
    const data = await res.json().catch(() => ({}))

    await supabase.from('wa_warmup_logs').insert({
      group_id: g.id,
      instance_id: instanceId,
      mensagem,
      uazapi_response: data,
      sucesso: res.ok,
    })

    const min = g.intervalo_min_seg ?? 480
    const max = g.intervalo_max_seg ?? 1500
    const span = Math.max(1, max - min)
    const nextSeg = min + Math.floor(Math.random() * span)
    const proxima = new Date(now.getTime() + nextSeg * 1000)

    await supabase
      .from('wa_warmup_groups')
      .update({
        ultima_mensagem_em: now.toISOString(),
        proxima_mensagem_em: proxima.toISOString(),
        atualizado_em: now.toISOString(),
      })
      .eq('id', g.id)

    results.push({
      group: g.nome,
      sent: true,
      instance: instanceId,
      mensagem,
      proxima: proxima.toISOString(),
    })
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
