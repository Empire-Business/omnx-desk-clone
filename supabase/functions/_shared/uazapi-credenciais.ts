// Onde cada função acha o token e o endereço da UAZAPI (o serviço que liga o app ao
// WhatsApp). Um lugar só, para nenhuma função ler segredo ou endereço "na mão".
//
// TOKEN de um número (whatsapp_instances.instance_id), nesta ordem:
//   1. cofre, por número  — RPC uazapi_token_do_numero (tela Números de WhatsApp);
//   2. cofre, da empresa  — token da aba Conexão das Automações, só se este número
//                           for o número principal configurado lá (wa_auto_config);
//   3. legado             — segredo das funções UAZAPI_TOKEN_<instance_id>
//                           (como sempre foi; mantém a produção funcionando).
//
// ENDEREÇO (base https://<servidor>.uazapi.com), nesta ordem:
//   1. endereço salvo na aba Conexão da empresa (tenant_integracoes.base_url);
//   2. segredo das funções UAZAPI_URL;
//   3. Admin > Integrações (app_settings 'uazapi_server_url', da empresa);
//   4. BASE_URL_PADRAO.uazapi (_shared/wa-mensagem.ts), o padrão legado.
// Todo candidato passa pela allowlist de domínio (validarBaseUrl); inválido é ignorado.
//
// Nada aqui registra token em log nem devolve o token para o navegador.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { BASE_URL_PADRAO, validarBaseUrl } from './wa-mensagem.ts'

export type FonteTokenUazapi = 'cofre_numero' | 'cofre_empresa' | 'env_instancia'

/** Leitor de variável de ambiente (trocável nos testes). */
export type LerEnv = (nome: string) => string | undefined

const ID_INSTANCIA = /^[A-Za-z0-9_-]{1,128}$/

export const lerEnvDeno: LerEnv = (nome) => {
  const d = (globalThis as { Deno?: { env?: { get(n: string): string | undefined } } }).Deno
  try {
    return d?.env?.get(nome)
  } catch {
    return undefined
  }
}

function textoNaoVazio(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

/** Token legado em segredo das funções: UAZAPI_TOKEN_<instance_id>. */
export function tokenLegadoEnv(instanceId: string, lerEnv: LerEnv = lerEnvDeno): string | null {
  if (!ID_INSTANCIA.test(instanceId ?? '')) return null
  return textoNaoVazio(lerEnv(`UAZAPI_TOKEN_${instanceId}`))
}

/** Token do número salvo no cofre (sem fallback). Erro de RPC = sem token. */
export async function tokenDoNumeroNoCofre(
  admin: SupabaseClient, instanceId: string, tenantId?: string | null,
): Promise<string | null> {
  if (!ID_INSTANCIA.test(instanceId ?? '')) return null
  try {
    const { data, error } = await admin.rpc('uazapi_token_do_numero', {
      p_instance_id: instanceId,
      p_tenant_id: tenantId ?? null,
    })
    if (error) return null
    return textoNaoVazio(data)
  } catch {
    return null
  }
}

/**
 * Número no cofre → segredo legado UAZAPI_TOKEN_<id>. Usado pelo wa-provider depois
 * do token da empresa (que ele já resolve), para não mudar a ordem de lá.
 */
export async function tokenDoNumeroOuLegado(
  admin: SupabaseClient, instanceId: string, tenantId?: string | null, lerEnv: LerEnv = lerEnvDeno,
): Promise<{ token: string; fonte: 'cofre_numero' | 'env_instancia' } | null> {
  const cofre = await tokenDoNumeroNoCofre(admin, instanceId, tenantId)
  if (cofre) return { token: cofre, fonte: 'cofre_numero' }
  const env = tokenLegadoEnv(instanceId, lerEnv)
  return env ? { token: env, fonte: 'env_instancia' } : null
}

async function tenantDoNumero(admin: SupabaseClient, instanceId: string): Promise<string | null> {
  try {
    const { data } = await admin.from('whatsapp_instances').select('tenant_id').eq('instance_id', instanceId).maybeSingle()
    return textoNaoVazio((data as { tenant_id?: unknown } | null)?.tenant_id)
  } catch {
    return null
  }
}

async function tokenDaEmpresaSePrincipal(
  admin: SupabaseClient, instanceId: string, tenantId: string,
): Promise<string | null> {
  try {
    const { data: cfg } = await admin.from('wa_auto_config').select('uazapi_instance_id').eq('tenant_id', tenantId).maybeSingle()
    if ((cfg as { uazapi_instance_id?: string | null } | null)?.uazapi_instance_id !== instanceId) return null
    const { data: cred, error } = await admin.rpc('get_omnx_bridge_credential_tenant', {
      p_tenant_id: tenantId,
      p_provider: 'uazapi',
    })
    if (error || !Array.isArray(cred) || cred.length === 0) return null
    return textoNaoVazio((cred[0] as { secret?: unknown }).secret)
  } catch {
    return null
  }
}

/** Token de um número, com a fonte (para diagnóstico sem expor o valor). */
export async function tokenUazapiComFonte(
  admin: SupabaseClient, instanceId: string, tenantId?: string | null, lerEnv: LerEnv = lerEnvDeno,
): Promise<{ token: string; fonte: FonteTokenUazapi } | null> {
  if (!ID_INSTANCIA.test(instanceId ?? '')) return null
  const doNumero = await tokenDoNumeroNoCofre(admin, instanceId, tenantId)
  if (doNumero) return { token: doNumero, fonte: 'cofre_numero' }
  const tenant = tenantId ?? await tenantDoNumero(admin, instanceId)
  if (tenant) {
    const daEmpresa = await tokenDaEmpresaSePrincipal(admin, instanceId, tenant)
    if (daEmpresa) return { token: daEmpresa, fonte: 'cofre_empresa' }
  }
  const legado = tokenLegadoEnv(instanceId, lerEnv)
  return legado ? { token: legado, fonte: 'env_instancia' } : null
}

/** Token de um número de WhatsApp, ou null quando não há nenhum configurado. */
export async function tokenUazapi(
  admin: SupabaseClient, instanceId: string, tenantId?: string | null, lerEnv: LerEnv = lerEnvDeno,
): Promise<string | null> {
  return (await tokenUazapiComFonte(admin, instanceId, tenantId, lerEnv))?.token ?? null
}

function validaOuNull(bruto: unknown): string | null {
  const v = textoNaoVazio(bruto)
  if (!v) return null
  try {
    return validarBaseUrl('uazapi', v)
  } catch {
    return null
  }
}

const CACHE_MS = 60_000
const cacheUrl = new Map<string, { url: string; ate: number }>()

/** Só para testes. */
export function limparCacheUrlUazapi(): void {
  cacheUrl.clear()
}

/** Endereço base da UAZAPI desta empresa (sem barra no fim). */
export async function urlUazapi(
  admin: SupabaseClient | null, tenantId?: string | null, lerEnv: LerEnv = lerEnvDeno,
): Promise<string> {
  const chave = tenantId ?? '*'
  const memo = cacheUrl.get(chave)
  if (memo && memo.ate > Date.now()) return memo.url

  let url: string | null = null
  if (admin && tenantId) {
    try {
      const { data } = await admin.from('tenant_integracoes').select('base_url')
        .eq('tenant_id', tenantId).eq('provider', 'uazapi').eq('is_active', true).maybeSingle()
      url = validaOuNull((data as { base_url?: unknown } | null)?.base_url)
    } catch { /* segue */ }
  }
  if (!url) url = validaOuNull(lerEnv('UAZAPI_URL'))
  if (!url && admin) {
    try {
      let q = admin.from('app_settings').select('valor').eq('chave', 'uazapi_server_url')
      if (tenantId) q = q.eq('tenant_id', tenantId)
      const { data } = await q.limit(1)
      url = validaOuNull(Array.isArray(data) ? (data[0] as { valor?: unknown } | undefined)?.valor : null)
    } catch { /* segue */ }
  }
  if (!url) url = BASE_URL_PADRAO.uazapi

  cacheUrl.set(chave, { url, ate: Date.now() + CACHE_MS })
  return url
}

/** Host (minúsculo) de um endereço, ou '' se inválido. */
export function hostDe(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}
