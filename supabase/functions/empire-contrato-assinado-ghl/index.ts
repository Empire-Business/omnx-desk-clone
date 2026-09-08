// Gatilho de "contrato assinado" → marca a venda como GANHA (Assinada) no GHL.
// Chamada pelo trigger de banco quando um contrato passa a ter link_clicksign.
// Resolve a oportunidade do cliente no CRM Empire e pede para mover o card
// para Vendas SQL / Assinada via a ponte (crm-marcar-assinada).
//
// Regra de segurança: só move com match ÚNICO de oportunidade. Casos ambíguos
// (0 ou >1 candidato) NÃO movem — registram o motivo em contratos.ghl_assinada_erro.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveEmpireBridge, empireHeaders } from '../_shared/empire-bridge.ts'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Auth: acionada EXCLUSIVAMENTE pelo trigger de banco (x-notify-secret do Vault).
  // Sem fallback de usuário autenticado — reduz a superfície (nenhum front chama esta função,
  // e mover card no GHL não deve ser disparável por qualquer usuário logado).
  const notifySecret = req.headers.get('x-notify-secret')
  let autorizado = false
  if (notifySecret) {
    const { data: ok } = await admin.rpc('notify_secret_matches', { candidate: notifySecret })
    autorizado = ok === true
  }
  if (!autorizado) return json({ error: 'unauthorized' }, 401)

  let body: { contrato_id?: unknown }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const contratoId = typeof body?.contrato_id === 'string' ? body.contrato_id : null
  if (!contratoId) return json({ error: 'contrato_id_obrigatorio' }, 400)

  const { data: contrato, error: cErr } = await admin
    .from('contratos')
    .select('id, tenant_id, whatsapp, email, link_clicksign, venda_pendente_id, ghl_assinada_sincronizada_em')
    .eq('id', contratoId)
    .single()
  if (cErr || !contrato) return json({ error: 'contrato_nao_encontrado' }, 404)

  // Só marca ganho quando o contrato foi de fato assinado (Clicksign presente).
  if (!contrato.link_clicksign) return json({ ok: true, skipped: 'sem_clicksign' })
  // Idempotência: já sincronizado antes.
  if (contrato.ghl_assinada_sincronizada_em) return json({ ok: true, skipped: 'ja_sincronizado' })

  // Falha registra o motivo no contrato, sem estourar (o trigger é fire-and-forget).
  const registrarErro = async (motivo: string) => {
    await admin.from('contratos').update({ ghl_assinada_erro: motivo.slice(0, 500) }).eq('id', contratoId)
  }

  // Credencial do tenant DONO DO CONTRATO — não da "única integração ativa".
  const bridge = await resolveEmpireBridge(admin, contrato.tenant_id ?? null)
  if (!bridge) { await registrarErro('bridge_nao_configurada'); return json({ error: 'bridge_nao_configurada' }, 500) }

  // 1. Monta o alvo. Preferência: oportunidade da venda_pendente vinculada (raro).
  //    Caso geral: manda telefone/e-mail e deixa o Empire resolver pela VENDA DO DESK
  //    (vendas_fechamento origem 'omnx_desk') — determinístico, ignora histórico do lead.
  const payload: { oportunidade_id?: string; telefone?: string | null; email?: string | null } = {}
  if (contrato.venda_pendente_id) {
    const { data: vp } = await admin
      .from('vendas_pendentes')
      .select('ghl_oportunidade_id')
      .eq('id', contrato.venda_pendente_id)
      .maybeSingle()
    if (vp?.ghl_oportunidade_id) payload.oportunidade_id = vp.ghl_oportunidade_id as string
  }
  if (!payload.oportunidade_id) {
    if (!contrato.whatsapp && !contrato.email) {
      await registrarErro('sem_telefone_e_email_para_casar')
      return json({ ok: false, motivo: 'sem_dados_para_casar' })
    }
    payload.telefone = contrato.whatsapp ?? null
    payload.email = contrato.email ?? null
  }

  // 2. Pede para o Empire mover o card → Vendas SQL / Assinada / won.
  const res = await fetch(`${bridge.baseUrl}/crm-marcar-assinada`, {
    method: 'POST',
    headers: empireHeaders(bridge.secret),
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean; error?: string; motivo?: string; ghl_opportunity_id?: string
  }

  // 404 sem_venda_desk = cliente sem venda registrada pelo Desk: pendência, não erro fatal.
  if (res.status === 404 && data.error === 'sem_venda_desk') {
    await registrarErro('sem_venda_desk_no_crm')
    return json({ ok: false, motivo: 'sem_venda_desk' })
  }
  if (!res.ok || !data.success) {
    await registrarErro(`empire_marcar_assinada:${JSON.stringify(data).slice(0, 300)}`)
    return json({ error: 'empire_error', detail: data }, 502)
  }

  await admin.from('contratos').update({
    ghl_assinada_sincronizada_em: new Date().toISOString(),
    // Grava o id real do card no GHL (rastro/auditoria); cai pro UUID do Empire se vier vazio.
    ghl_assinada_oportunidade_id: data.ghl_opportunity_id ?? payload.oportunidade_id ?? null,
    ghl_assinada_erro: null,
  }).eq('id', contratoId)

  return json({ ok: true, ghl_opportunity_id: data.ghl_opportunity_id ?? null })
})
