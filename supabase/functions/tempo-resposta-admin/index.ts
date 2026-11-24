import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { atenderAdminTempo } from '../_shared/tempo-resposta-http.ts'

export const executarTempoRespostaAdmin = (req: Request) => atenderAdminTempo(req, (authorization) => createClient(
  Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
  { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } },
), () => createClient(
  Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
))
if (import.meta.main) servirComLicenca(executarTempoRespostaAdmin)
