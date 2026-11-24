import { BRAND } from '@/config/brand'
import { RECURSOS } from '@/config/recursos'

/**
 * Catálogo de plataformas na central do High Ticket AI. Vazio quando a central
 * não está configurada (VITE_HTAI_CENTRAL_URL): aí o app não chama nada lá fora
 * e o token de sessão do usuário nunca sai do Supabase deste app.
 */
export const SAAS_HUBS_ENDPOINT = RECURSOS.centralHtaiUrl
  ? `${RECURSOS.centralHtaiUrl}/list-saas-hubs`
  : ''

export const SAAS_HUB_CONFIG = {
  'omnx-desk-saas': {
    label: 'Desk',
    platformName: BRAND.appName,
    origin: 'https://desk.omnx.pro',
    badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  },
  'omnx-type': {
    label: 'Type',
    platformName: 'OMNX Type',
    origin: 'https://type.omnx.pro',
    badgeClass: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  },
  'omnx-sell': {
    label: 'Sell',
    platformName: 'OMNX Sell',
    origin: 'https://sell.omnx.pro',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  'omnx-dash': {
    label: 'Dash',
    platformName: 'OMNX Dash',
    origin: 'https://ceo.omnx.pro',
    badgeClass: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
  },
} as const

export type SaasSkillSlug = keyof typeof SAAS_HUB_CONFIG

export interface SaasHubResponseItem {
  skill_slug: unknown
  platform_name: unknown
}

export interface SaasHub {
  skill_slug: SaasSkillSlug
  platform_name: string
  label: string
  origin: string
  badgeClass: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSaasSkillSlug(value: unknown): value is SaasSkillSlug {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SAAS_HUB_CONFIG, value)
}

/**
 * Converte o catálogo remoto em destinos navegáveis, mantendo o destino
 * sempre vindo da allowlist deste bundle. O Desk é a plataforma atual e fica
 * visível mesmo enquanto o catálogo remoto carrega ou está indisponível.
 */
export function mapSaasHubs(payload: unknown): SaasHub[] {
  const current = createSaasHub('omnx-desk-saas')
  if (!isRecord(payload) || !Array.isArray(payload.hubs)) return [current]

  const mapped: SaasHub[] = [current]
  const seen = new Set<SaasSkillSlug>([current.skill_slug])

  for (const item of payload.hubs) {
    if (!isRecord(item) || !isSaasSkillSlug(item.skill_slug) || seen.has(item.skill_slug)) continue

    const config = SAAS_HUB_CONFIG[item.skill_slug]
    const remoteName = typeof item.platform_name === 'string' ? item.platform_name.trim() : ''
    mapped.push({
      ...config,
      platform_name: remoteName || config.platformName,
      skill_slug: item.skill_slug,
    })
    seen.add(item.skill_slug)
  }

  return mapped
}

export function createSaasHub(skillSlug: SaasSkillSlug): SaasHub {
  const config = SAAS_HUB_CONFIG[skillSlug]
  return {
    ...config,
    platform_name: config.platformName,
    skill_slug: skillSlug,
  }
}

/** Constrói somente URLs dos quatro produtos conhecidos no código. */
export function buildSaasHubUrl(skillSlug: SaasSkillSlug, switchIntent?: string): string {
  const { origin } = SAAS_HUB_CONFIG[skillSlug]
  const url = new URL('/login', origin)
  url.searchParams.set('empire_sso', '1')
  if (switchIntent && /^[A-Za-z0-9_-]{40,96}$/.test(switchIntent)) {
    url.searchParams.set('sso_intent', switchIntent)
  }
  return url.href
}

const SAAS_SWITCH_INTENT_ENDPOINT =
  'https://dtmusrvtsnpamgqcmuwa.supabase.co/functions/v1/saas-switch-intent'

/** Cria um contexto de uso unico, validado pela central antes do redirect. */
export async function createSaasSwitchUrl(skillSlug: SaasSkillSlug, accessToken: string): Promise<string | null> {
  const response = await fetch(SAAS_SWITCH_INTENT_ENDPOINT, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action: 'create', target_skill_slug: skillSlug }),
    credentials: 'omit',
    cache: 'no-store',
  })
  if (!response.ok) return null
  const payload: unknown = await response.json()
  const intent = payload && typeof payload === 'object' ? (payload as { intent?: unknown }).intent : null
  return typeof intent === 'string' && /^[A-Za-z0-9_-]{40,96}$/.test(intent)
    ? buildSaasHubUrl(skillSlug, intent)
    : null
}
