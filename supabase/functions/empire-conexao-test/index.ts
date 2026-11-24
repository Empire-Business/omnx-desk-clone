import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { sessaoDeskLiberada } from '../_shared/desk-session.ts'
// "Testar conexão" da integração omnx-desk → Empire (CRM).
// Admin autenticado dispara; o servidor resolve o secret do tenant (cofre) e faz um ping
// no crm-buscar-lead do Empire. Nunca expõe o secret ao browser.
//   - 200 { ok:true }  → secret aceito pelo Empire (mesmo que a busca retorne 0 candidatos).
//   - 200 { ok:false, error } → secret errado/ausente (401 do Empire) ou ponte não configurada.
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

/** Autoriza (só admin) e devolve o tenant dele — o teste precisa testar a ponte DELE. */
async function autorizarAdmin(authHeader: string | null): Promise<{ ok: boolean; tenantId: string | null }> {
  if (!authHeader) return { ok: false, tenantId: null }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user || !await sessaoDeskLiberada(userClient)) return { ok: false, tenantId: null }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data } = await admin.from('users').select('perfil').eq('id', user.id).single()
  if (data?.perfil !== 'admin') return { ok: false, tenantId: null }
  const { data: tenantId } = await admin.rpc('get_tenant_do_usuario', { p_user_id: user.id })
  return { ok: true, tenantId: (tenantId as string | null) ?? null }
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = await autorizarAdmin(req.headers.get('Authorization'))
  if (!auth.ok) return json({ ok: false, error: 'forbidden' }, 403)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const bridge = await resolveEmpireBridge(admin, auth.tenantId)
  if (!bridge) {
    return json({ ok: false, error: 'Nenhum secret cadastrado. Cole o secret do Empire e salve antes de testar.' })
  }

  // Ping benigno: telefone improvável. Secret válido → 200 (candidatos vazios). Inválido → 401.
  try {
    const res = await fetch(`${bridge.baseUrl}/crm-buscar-lead`, {
      method: 'POST',
      headers: empireHeaders(bridge.secret),
      body: JSON.stringify({ telefone: '0000000000' }),
    })
    if (res.status === 401) {
      return json({ ok: false, error: 'Secret recusado pelo Empire (401). Confira o valor com o admin da conta Empire.' })
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return json({ ok: false, error: `Empire respondeu ${res.status}.`, detail: detail.slice(0, 300) })
    }
    return json({ ok: true, source: bridge.source, base_url: bridge.baseUrl })
  } catch (e) {
    return json({ ok: false, error: 'Falha de rede ao contatar o Empire.', detail: (e as Error).message })
  }
})
