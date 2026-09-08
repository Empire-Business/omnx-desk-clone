// Intermediária omnx-desk → CRM: sincroniza uma venda validada com a vendas_fechamento do GHL.
// Porta MANUAL — acionada por um usuário na tela de Vendas Pendentes (concluir+vincular,
// vincular depois ou reenviar). A porta AUTOMÁTICA, disparada por trigger quando a venda
// é editada, é a vendas-ressincronizar-crm; as duas usam o mesmo helper de envio.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sincronizarVendaComCrm } from '../_shared/sincronizar-venda.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function perfilAutorizado(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return false
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data } = await admin.from('users').select('perfil').eq('id', user.id).single()
  return ['admin', 'gerente', 'atendimento'].includes(data?.perfil ?? '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  if (!(await perfilAutorizado(req.headers.get('Authorization')))) {
    return json({ error: 'forbidden' }, 403)
  }

  let body: { venda_id?: unknown; oportunidade_id?: unknown; pipeline_name?: unknown }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const vendaId = typeof body?.venda_id === 'string' ? body.venda_id : null
  const oportunidadeId = typeof body?.oportunidade_id === 'string' ? body.oportunidade_id : null
  const pipelineName = typeof body?.pipeline_name === 'string' ? body.pipeline_name : null
  if (!vendaId || !oportunidadeId) return json({ error: 'venda_id_e_oportunidade_id_obrigatorios' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  const r = await sincronizarVendaComCrm(admin, { vendaId, oportunidadeId, pipelineName })

  if (!r.ok) {
    if (r.erro === 'venda_nao_encontrada') return json({ error: r.erro }, 404)
    if (r.erro === 'bridge_nao_configurada') return json({ error: r.erro }, 500)
    return json({ error: 'ghl_error', detail: r.detalhe }, 502)
  }

  return json({
    ok: true,
    ghl_venda_id: r.ghlVendaId ?? null,
    valor_faturado: r.valorFaturado ?? null,
    comprovantes_salvos: r.comprovantesSalvos ?? 0,
  })
})
