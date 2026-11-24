import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cadastrarColaborador, ErroCadastro } from './handler.ts'
import { travaDeLicenca } from '../_shared/htai-licenca.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  // Licença HTAI (desligada sem HTAI_ENTITLEMENTS_MODE; ver docs/LICENCA-HTAI.md)
  const licencaNegada = await travaDeLicenca(corsHeaders)
  if (licencaNegada) return licencaNegada
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const auth = req.headers.get('authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    })
    const admin = createClient(supabaseUrl, serviceKey)
    let body: unknown
    try { body = await req.json() }
    catch { return json({ error: 'body_invalid' }, 400) }

    const result = await cadastrarColaborador({
      async usuarioAutenticado() {
        const { data, error } = await userClient.auth.getUser()
        return error ? null : data.user?.id ?? null
      },
      async perfilDoUsuario(id) {
        const { data, error } = await userClient.from('users')
          .select('perfil, ativo, tenant_id').eq('id', id).single()
        if (error) throw new ErroCadastro('forbidden', 403)
        return data
      },
      async tenantDoProfile(id) {
        const { data, error } = await userClient.from('profiles')
          .select('tenant_id').eq('user_id', id).single()
        if (error) throw new ErroCadastro('tenant_invalid', 403)
        return data?.tenant_id ?? null
      },
      async departamentoDoTenant(id, tenantId) {
        const { data, error } = await admin.from('chat_departments')
          .select('id').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
        if (error) throw new ErroCadastro('department_check_failed', 500)
        return Boolean(data)
      },
      async criarAuth(input) {
        const { data, error } = await admin.auth.admin.createUser({
          email: input.email,
          password: senhaAleatoria(32),
          email_confirm: true,
          user_metadata: { nome: input.nome, perfil: input.perfil, tenant_id: input.tenant_id },
          // Papel e empresa valem só daqui: app_metadata só o servidor grava
          // (migração 20261119150000). user_metadata fica durante a transição.
          app_metadata: { perfil: input.perfil, tenant_id: input.tenant_id },
        })
        if (error || !data.user) {
          const duplicate = /already been registered|already exists|duplicate/i.test(error?.message ?? '')
          throw new ErroCadastro(duplicate ? 'email_ja_cadastrado' : 'create_failed', duplicate ? 409 : 500)
        }
        return { id: data.user.id }
      },
      async persistirPerfil(id, input) {
        const { data, error } = await admin.from('users')
          .update({ nome: input.nome, perfil: input.perfil, department_id: input.department_id })
          .eq('id', id).eq('tenant_id', input.tenant_id).select('id').single()
        if (error || !data) throw new ErroCadastro('profile_save_failed', 500)
        const profile = await admin.from('profiles').select('tenant_id')
          .eq('user_id', id).eq('tenant_id', input.tenant_id).single()
        if (profile.error || !profile.data) throw new ErroCadastro('profile_save_failed', 500)
      },
      async gerarLink(email) {
        const { data, error } = await admin.auth.admin.generateLink({
          type: 'recovery', email, options: { redirectTo: `${APP_URL}/reset-password` },
        })
        if (error || !data?.properties?.action_link) throw new ErroCadastro('recovery_failed', 500)
        return data.properties.action_link
      },
      async removerAuth(id) {
        const { error } = await admin.auth.admin.deleteUser(id)
        if (error) throw new ErroCadastro('cleanup_failed', 500)
      },
    }, body)
    return json(result)
  } catch (error) {
    // Não devolver mensagens internas do provedor, tokens nem links em respostas de erro.
    if (error instanceof ErroCadastro) return json({ error: error.codigo }, error.status)
    return json({ error: 'internal_error' }, 500)
  }
})
