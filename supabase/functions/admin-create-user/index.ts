import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_PERFIS = ['admin', 'gerente', 'atendimento', 'estrategista', 'cliente']

// URL pública do app — destino do link de definição de senha.
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://desk.omnx.pro').replace(/\/+$/, '')

/**
 * Senha aleatória forte e DESCARTÁVEL: existe só pra o usuário nascer válido no
 * auth. Ninguém a vê — nem o admin, nem o log, nem a resposta. O primeiro acesso
 * acontece pelo link de definição de senha devolvido em `definir_senha_url`.
 */
function senhaAleatoria(len = 32): string {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*-_=+'
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += alfabeto[b % alfabeto.length]
  return out
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

  try {
    const auth = req.headers.get('authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    })
    const { data: u } = await userClient.auth.getUser()
    if (!u.user) return json({ error: 'unauthorized' }, 401)

    const { data: profile } = await userClient
      .from('users')
      .select('perfil')
      .eq('id', u.user.id)
      .single()
    if (!profile || !['admin', 'gerente'].includes(profile.perfil as string)) {
      return json({ error: 'forbidden' }, 403)
    }

    // Tenant do admin chamador — o novo usuário nasce NO MESMO tenant (multi-tenant).
    // Sem isto, o trigger cairia no fallback e jogaria a pessoa no tenant mestre.
    const { data: callerProfile } = await userClient
      .from('profiles')
      .select('tenant_id')
      .eq('user_id', u.user.id)
      .single()
    const callerTenantId = callerProfile?.tenant_id ?? null

    const body = await req.json() as {
      nome?: string
      email?: string
      perfil?: string
      department_id?: string | null
    }
    const nome = (body.nome ?? '').trim()
    const email = (body.email ?? '').trim().toLowerCase()
    const perfil = (body.perfil ?? '').trim()
    const departmentId = body.department_id ?? null

    if (!nome) return json({ error: 'nome_required' }, 400)
    if (!email || !email.includes('@')) return json({ error: 'email_invalid' }, 400)
    if (!ALLOWED_PERFIS.includes(perfil)) return json({ error: 'perfil_invalid' }, 400)

    const admin = createClient(supabaseUrl, serviceKey)

    // Cria o usuário com e-mail já confirmado e senha aleatória que nunca sai
    // daqui — o acesso é entregue via link de definição de senha.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: senhaAleatoria(32),
      email_confirm: true,
      user_metadata: { nome, perfil, ...(callerTenantId ? { tenant_id: callerTenantId } : {}) },
    })

    if (createErr || !created.user) {
      const msg = createErr?.message ?? 'unknown'
      // E-mail já cadastrado → erro claro para a UI
      const jaExiste = /already been registered|already exists|duplicate/i.test(msg)
      return json(
        { error: jaExiste ? 'email_ja_cadastrado' : 'create_failed', detail: msg },
        jaExiste ? 409 : 400,
      )
    }

    // Trigger handle_new_user popula public.users, mas garante consistência
    // (inclui tenant_id do chamador, determinístico).
    await admin
      .from('users')
      .update({ nome, perfil, department_id: departmentId, ...(callerTenantId ? { tenant_id: callerTenantId } : {}) })
      .eq('id', created.user.id)

    // Link de definição de senha (recovery): o colaborador clica, cai no app e
    // escolhe a própria senha. Substitui a antiga senha padrão compartilhada.
    let definirSenhaUrl: string | null = null
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: APP_URL },
    })
    if (linkErr || !linkData?.properties?.action_link) {
      console.warn(`generateLink(recovery) falhou: ${linkErr?.message ?? 'sem action_link'}`)
    } else {
      definirSenhaUrl = linkData.properties.action_link
    }

    return json({
      id: created.user.id,
      email: created.user.email,
      nome,
      perfil,
      definir_senha_url: definirSenhaUrl,
    })
  } catch (e) {
    return json({ error: 'internal_error', detail: (e as Error).message }, 500)
  }
})
