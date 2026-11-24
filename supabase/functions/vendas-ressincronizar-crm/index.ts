// Ressincronização automática: venda editada no Desk → atualiza a venda no CRM.
//
// Acionada EXCLUSIVAMENTE pelo trigger trg_venda_ressincronizar_crm (x-notify-secret
// do Vault), quando uma venda JÁ vinculada tem algum campo que vai para o CRM alterado.
// Sem isso, corrigir um valor no Desk deixava o dashboard com o número velho para sempre
// (caso real: Thiago Muniz, R$ 84.000 no CRM contra R$ 24.000 no Desk desde 03/07/2026).
//
// Não recebe oportunidade: usa o ghl_oportunidade_id que já está gravado na venda —
// reenvio nunca escolhe um card diferente do que foi vinculado por uma pessoa.
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sincronizarVendaComCrm } from '../_shared/sincronizar-venda.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notify-secret',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Auth: só o trigger de banco. Mesmo esquema da empire-contrato-assinado-ghl —
  // sem fallback de usuário logado, porque nenhum front chama esta função.
  const notifySecret = req.headers.get('x-notify-secret')
  let autorizado = false
  if (notifySecret) {
    const { data: ok } = await admin.rpc('notify_secret_matches', { candidate: notifySecret })
    autorizado = ok === true
  }
  if (!autorizado) return json({ error: 'unauthorized' }, 401)

  let body: { venda_id?: unknown }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const vendaId = typeof body?.venda_id === 'string' ? body.venda_id : null
  if (!vendaId) return json({ error: 'venda_id_obrigatorio' }, 400)

  const { data: venda, error: vErr } = await admin
    .from('vendas_pendentes')
    .select('id, ghl_oportunidade_id, sincronizado_em')
    .eq('id', vendaId)
    .single()
  if (vErr || !venda) return json({ error: 'venda_nao_encontrada' }, 404)

  // Guarda de sanidade — o trigger já filtra, mas a função não confia nele.
  // Venda nunca vinculada não tem para onde ser reenviada: é caso de vínculo manual.
  if (!venda.ghl_oportunidade_id || !venda.sincronizado_em) {
    return json({ ok: true, skipped: 'venda_sem_vinculo' })
  }

  const r = await sincronizarVendaComCrm(admin, {
    vendaId,
    oportunidadeId: venda.ghl_oportunidade_id as string,
    pipelineName: null,
  })

  // Fire-and-forget: o erro já foi gravado em sincronizacao_erro pelo helper e
  // aparece na tela. Devolver 502 aqui só serviria para poluir o log do pg_net.
  if (!r.ok) return json({ ok: false, motivo: r.erro, detalhe: r.detalhe })

  return json({ ok: true, ghl_venda_id: r.ghlVendaId ?? null })
})
