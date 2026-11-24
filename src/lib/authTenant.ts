import { supabase } from '@/lib/supabase'

/** Tenant do perfil confirmado no servidor; nunca de um formulário ou metadado editável. */
export async function tenantDaSessao(): Promise<string> {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('Sua sessão não foi confirmada. Entre novamente.')
  const { data: profile, error: profileError } = await supabase.from('users')
    .select('id, tenant_id, ativo').eq('id', user.id).single()
  if (profileError || !profile || profile.id !== user.id || profile.ativo === false || !profile.tenant_id) {
    throw new Error('Não foi possível confirmar sua empresa e seu acesso.')
  }
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || session?.user.id !== user.id) {
    throw new Error('Sua sessão mudou. Atualize a página antes de salvar.')
  }
  return profile.tenant_id
}
