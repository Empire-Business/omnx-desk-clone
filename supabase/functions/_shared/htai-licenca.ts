/**
 * Licença HTAI nas Edge Functions (lado Deno). A regra fica em htai-licenca-core.ts.
 *
 * Modo (contrato §1):
 *  - escopo instalação (`HTAI_INSTALACAO_ID` preenchido ou `HTAI_ESCOPO=instalacao`):
 *    `HTAI_ENTITLEMENTS_MODE=shadow` só registra; qualquer outro valor, inclusive
 *    ausente, = `enforce`;
 *  - fora do escopo instalação (deploy da empresa): ausente ou 'off' = nada muda
 *    (nenhuma consulta, nenhuma chamada à central).
 * O banco aplica a mesma regra com os segredos do cofre (`htai_escopo`,
 * `htai_instalacao_id`, `htai_entitlements_mode`); ver migrações 20261109130000 e 20261109140000.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  avaliarLicenca,
  lerCredenciais,
  MENSAGEM_LICENCA_NAO_ATIVADA,
  modoDoAmbiente,
  type HtaiMode,
  type Situacao,
} from './htai-licenca-core.ts'

export function modoDaFuncao(): HtaiMode {
  return modoDoAmbiente((n) => Deno.env.get(n))
}

/**
 * Situação atual da licença vista por uma função. Em `off`, devolve "liberada"
 * sem tocar no banco. Em `enforce`, qualquer falha ao ler o estado nega (falha
 * fechada); em `shadow`, só registra.
 */
export async function situacaoDaLicenca(admin: SupabaseClient): Promise<Situacao> {
  const modo = modoDaFuncao()
  if (modo === 'off') return avaliarLicenca({ modo, temCredenciais: false, estado: null, nowMs: Date.now() })
  const temCredenciais = lerCredenciais((n) => Deno.env.get(n)) !== null
  const { data, error } = await admin
    .from('htai_licenca_estado')
    .select('status, valid_until, offline_grace_seconds')
    .eq('id', true)
    .maybeSingle()
  const estado = !error && data?.status && data?.valid_until
    ? { status: data.status, valid_until: data.valid_until, offline_grace_seconds: Number(data.offline_grace_seconds ?? 0) }
    : null
  return avaliarLicenca({ modo, temCredenciais, estado, nowMs: Date.now() })
}

/**
 * Trava de entrada das funções com efeito (enviar, gerar, cadastrar).
 * Devolve uma Response 402 pronta quando a licença nega; null para seguir.
 * Exportação, Configurações e Ajuda não usam esta trava.
 */
export async function exigirLicenca(
  admin: SupabaseClient,
  headers: Record<string, string> = {},
): Promise<Response | null> {
  if (modoDaFuncao() === 'off') return null
  let s: Situacao
  try {
    s = await situacaoDaLicenca(admin)
  } catch {
    s = { modo: modoDaFuncao(), nega: modoDaFuncao() === 'enforce', negaria: modoDaFuncao() === 'shadow', motivo: 'nao_ativado', mensagem: MENSAGEM_LICENCA_NAO_ATIVADA, valido_ate: null, folga_ate: null }
  }
  if (s.negaria) console.warn(`[htai-licenca] shadow: negaria (${s.motivo})`)
  if (!s.nega) return null
  return new Response(
    JSON.stringify({ error: 'licenca_inativa', motivo: s.motivo, mensagem: s.mensagem }),
    { status: 402, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
  )
}

/**
 * Atalho para a entrada das funções: em modo off não cria cliente nem consulta
 * nada; nos outros modos usa a service_role só para ler o estado da licença.
 *   const negado = await travaDeLicenca(corsHeaders); if (negado) return negado
 */
export async function travaDeLicenca(headers: Record<string, string> = {}): Promise<Response | null> {
  if (modoDaFuncao() === 'off') return null
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  return exigirLicenca(admin, headers)
}

/** CORS da resposta 402 do invólucro (o navegador precisa ler a mensagem). */
const CORS_LICENCA = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

/**
 * Invólucro de entrada de TODA função com dado ou efeito: com a licença negada
 * (escopo instalação, enforce), responde 402 antes de qualquer trabalho.
 * Em modo off (produção da empresa) chama o handler direto, sem consulta.
 * Ficam de fora só as funções abertas pelo contrato (licença, exportação, troca
 * de senha, ajuda pelo manual); a lista está em htai-licenca-cobertura.test.ts.
 */
export function comLicenca(handler: (req: Request) => Response | Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'OPTIONS') {
      const negado = await travaDeLicenca(CORS_LICENCA)
      if (negado) return negado
    }
    return handler(req)
  }
}

/** `Deno.serve` com a trava de licença na entrada. */
export function servirComLicenca(handler: (req: Request) => Response | Promise<Response>) {
  return Deno.serve(comLicenca(handler))
}
