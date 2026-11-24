import { RECURSOS } from '@/config/recursos'

/** Vazio quando a central do High Ticket AI não está configurada (troca desligada). */
const SAAS_SWITCH_INTENT_ENDPOINT = RECURSOS.centralHtaiUrl
  ? `${RECURSOS.centralHtaiUrl}/saas-switch-intent`
  : ''

export function isSaasSwitchIntent(value: string | null): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{40,96}$/.test(value)
}

/** Confirma no servidor que a sessao que voltou do OIDC e a que abriu o seletor. */
export async function completeSaasSwitch(intent: string, accessToken: string): Promise<string | null> {
  if (!SAAS_SWITCH_INTENT_ENDPOINT) return null
  const response = await fetch(SAAS_SWITCH_INTENT_ENDPOINT, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action: 'complete', intent, target_skill_slug: 'omnx-desk-saas' }),
    credentials: 'omit',
    cache: 'no-store',
  })
  if (!response.ok) return null
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object') return null
  const result = payload as { ok?: unknown; tenant_id?: unknown }
  return result.ok === true && isTenantId(result.tenant_id) ? result.tenant_id : null
}

function isTenantId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 160 && value.trim() === value
}
