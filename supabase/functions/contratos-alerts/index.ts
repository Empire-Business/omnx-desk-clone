// Rotina global agendada. Sem acesso público/humano: x-cron-secret é validado no Vault.
// O job existente precisa enviar o cabeçalho antes da publicação deste gate.
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { autorizarCronContratos } from './cron-auth.ts'
import { processarAlertasContratos } from './processar.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const corsJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  const negado = await autorizarCronContratos(req, async (segredo) => {
    const verificador = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await verificador.rpc('wa_auto_cron_secret_confere', { p_segredo: segredo })
    if (error) throw new Error('cron_auth_unavailable')
    return data === true
  })
  if (negado) return corsJson({ error: negado.code }, negado.status)
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    return corsJson(await processarAlertasContratos(admin))
  } catch {
    // Não retornar nomes, IDs, segredo ou detalhes de consulta. Escrita parcial é
    // possível; uma repetição consulta o histórico antes de inserir cada notificação.
    return corsJson({ ok: false, error: 'alerts_processing_failed' }, 500)
  }
})
