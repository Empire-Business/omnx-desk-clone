// Disparo one-shot: envia mensagens específicas de cada instância ao grupo,
// com pequeno delay entre uma e outra pra parecer natural.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UAZAPI_URL = 'https://empirebusiness.uazapi.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const body = await req.json().catch(() => ({}))
  const groupName: string = body.group_name ?? 'Teste'
  const items: { instance_id: string; mensagem: string }[] = body.items ?? []

  const { data: group } = await supabase
    .from('wa_warmup_groups')
    .select('id, wa_chatid')
    .eq('nome', groupName)
    .single()

  if (!group) {
    return new Response(JSON.stringify({ error: 'group_not_found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const results: Record<string, unknown>[] = []
  for (const item of items) {
    const token = Deno.env.get(`UAZAPI_TOKEN_${item.instance_id}`)
    if (!token) {
      results.push({ instance: item.instance_id, error: 'token_missing' })
      continue
    }

    fetch(`${UAZAPI_URL}/message/presence`, {
      method: 'POST',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: group.wa_chatid, presence: 'composing' }),
    }).catch(() => {})

    // 3-7s entre mensagens pra cadência humana
    await new Promise((r) => setTimeout(r, 3000 + Math.random() * 4000))

    const res = await fetch(`${UAZAPI_URL}/send/text`, {
      method: 'POST',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: group.wa_chatid, text: item.mensagem, readchat: true }),
    })
    const data = await res.json().catch(() => ({}))

    await supabase.from('wa_warmup_logs').insert({
      group_id: group.id,
      instance_id: item.instance_id,
      mensagem: item.mensagem,
      uazapi_response: data,
      sucesso: res.ok,
    })

    results.push({ instance: item.instance_id, ok: res.ok, mensagem: item.mensagem })
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
