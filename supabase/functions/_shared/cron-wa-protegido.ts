import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** A credencial do Vault autentica o agendador, nunca um tenant vindo do body. */
export function cronWaProtegido(
  executar: (req: Request, admin: SupabaseClient) => Promise<Response>,
  criarAdmin: () => SupabaseClient,
) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 })
    const segredo = req.headers.get('x-cron-secret') ?? ''
    if (segredo.length < 32 || segredo.length > 256) return new Response('unauthorized', { status: 401 })
    const admin = criarAdmin()
    try {
      const r = await admin.rpc('wa_auto_cron_secret_confere', { p_segredo: segredo })
      if (r.error || r.data !== true) return new Response('unauthorized', { status: 401 })
    } catch { return new Response('unauthorized', { status: 401 }) }
    return executar(req, admin)
  }
}
