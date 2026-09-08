// Intermediária EmpireDesk → GHL: busca candidatos de lead no CRM para vincular a uma venda.
// Chamada pelo frontend autenticado (atendimento/admin/gerente); guarda o secret da ponte
// no servidor e repassa a consulta para a edge function crm-buscar-lead do GHL.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveEmpireBridge, empireHeaders } from '../_shared/empire-bridge.ts'

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

/**
 * Autoriza o chamador e devolve o tenant dele. O tenant é o que decide qual
 * credencial da ponte usar — sem isso, a função dependeria de existir uma única
 * integração ativa no banco inteiro, e cairia quando entrasse a 2ª empresa.
 */
async function autorizar(authHeader: string | null): Promise<{ ok: boolean; tenantId: string | null }> {
  if (!authHeader) return { ok: false, tenantId: null }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { ok: false, tenantId: null }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data } = await admin.from('users').select('perfil').eq('id', user.id).single()
  if (!['admin', 'gerente', 'atendimento'].includes(data?.perfil ?? '')) {
    return { ok: false, tenantId: null }
  }

  const { data: tenantId } = await admin.rpc('get_tenant_do_usuario', { p_user_id: user.id })
  return { ok: true, tenantId: (tenantId as string | null) ?? null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = await autorizar(req.headers.get('Authorization'))
  if (!auth.ok) return json({ error: 'forbidden' }, 403)

  let body: { telefone?: unknown; email?: unknown }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const telefone = typeof body?.telefone === 'string' ? body.telefone : null
  const email = typeof body?.email === 'string' ? body.email : null
  if (!telefone && !email) return json({ error: 'telefone_ou_email' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const bridge = await resolveEmpireBridge(admin, auth.tenantId)
  if (!bridge) return json({ error: 'bridge_nao_configurada' }, 500)

  const res = await fetch(`${bridge.baseUrl}/crm-buscar-lead`, {
    method: 'POST',
    headers: empireHeaders(bridge.secret),
    body: JSON.stringify({ telefone, email }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return json({ error: 'ghl_error', detail: data }, 502)
  return json(data)
})
