// Resolução multi-tenant do secret da ponte omnx-desk → Empire (CRM).
//
// Modelo "1 empresa por clone": cada instância do omnx-desk tem UMA integração 'empire' ativa,
// guardada no cofre (Vault) via tenant_integracoes. As edge functions resolvem o secret por aqui
// em vez de ler um env global — e enviam o header canônico x-omnx-desk-secret.
//
// Ordem de precedência (fail-open só para o legado, para não quebrar produção antes do cadastro):
//   1. Credencial por tenant (RPC get_omnx_bridge_credential, service_role) — caminho multi-tenant.
//   2. Fallback legado: env EMPIREDESK_BRIDGE_SECRET (+ GHL_FUNCTIONS_URL). Aposentado quando
//      todas as instâncias tiverem cadastrado o secret pela tela de Integrações.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const DEFAULT_EMPIRE_BASE_URL =
  'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1'

export interface EmpireBridge {
  secret: string
  baseUrl: string
  /** 'tenant' quando veio do cofre por tenant; 'legacy_env' quando caiu no fallback global. */
  source: 'tenant' | 'legacy_env'
}

/**
 * Resolve o secret + base_url da ponte Empire.
 * Requer um client com service_role (as RPCs de resolução são service_role-only).
 * Retorna null quando não há nem credencial por tenant nem env legado (fail-closed).
 *
 * `tenantId` é o caminho correto com mais de uma empresa. Sem ele, cai na RPC
 * antiga, que só responde enquanto existir EXATAMENTE UMA integração ativa no
 * banco — passando disso ela retorna vazio e a ponte cairia para todo mundo.
 * Por isso todo chamador novo deve passar o tenant.
 */
export async function resolveEmpireBridge(
  admin: SupabaseClient,
  tenantId?: string | null,
): Promise<EmpireBridge | null> {
  // 0. Caminho multi-tenant: credencial do tenant informado.
  if (tenantId) {
    try {
      const { data, error } = await admin.rpc('get_omnx_bridge_credential_tenant', {
        p_tenant_id: tenantId,
        p_provider: 'empire',
      })
      if (!error && Array.isArray(data) && data.length > 0) {
        const row = data[0] as { secret?: string; base_url?: string | null }
        if (row?.secret && row.secret.length > 0) {
          return {
            secret: row.secret,
            baseUrl: (row.base_url && row.base_url.length > 0) ? row.base_url : DEFAULT_EMPIRE_BASE_URL,
            source: 'tenant',
          }
        }
      }
    } catch {
      // segue para os caminhos abaixo
    }
  }

  // 1. Credencial por tenant (cofre) — resolução "tenant único", legado
  try {
    const { data, error } = await admin.rpc('get_omnx_bridge_credential', {
      p_provider: 'empire',
    })
    if (!error && Array.isArray(data) && data.length > 0) {
      const row = data[0] as { secret?: string; base_url?: string | null }
      if (row?.secret && row.secret.length > 0) {
        return {
          secret: row.secret,
          baseUrl: (row.base_url && row.base_url.length > 0) ? row.base_url : DEFAULT_EMPIRE_BASE_URL,
          source: 'tenant',
        }
      }
    }
  } catch {
    // ignora e tenta o fallback legado
  }

  // 2. Fallback legado (env global) — transição
  const envSecret = Deno.env.get('EMPIREDESK_BRIDGE_SECRET') ?? Deno.env.get('OMNX_DESK_BRIDGE_SECRET') ?? ''
  if (envSecret.length > 0) {
    return {
      secret: envSecret,
      baseUrl: Deno.env.get('GHL_FUNCTIONS_URL') ?? DEFAULT_EMPIRE_BASE_URL,
      source: 'legacy_env',
    }
  }

  return null
}

/** Headers padrão para chamar as funções crm-* do Empire com o secret resolvido. */
export function empireHeaders(secret: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    // Header canônico da spec. Mantemos o antigo por compatibilidade com o lado Empire.
    'x-omnx-desk-secret': secret,
    'x-empiredesk-secret': secret,
  }
}
