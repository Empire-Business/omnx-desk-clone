import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Client deve carregar o Bearer do chamador, nunca o token de serviço.
 * A RPC verifica a sessão real no banco. Falha/estado desconhecido não libera
 * caminhos humanos que depois consultam dados com credencial de serviço.
 */
export async function sessaoDeskLiberada(client: Pick<SupabaseClient, 'rpc'>): Promise<boolean> {
  try {
    const { data, error } = await client.rpc('desk_password_change_status')
    return !error && data?.state === 'ok' && typeof data?.requirement_active === 'boolean'
      && typeof data?.session_id === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.session_id)
  } catch {
    return false
  }
}
