// Identidade centralizada da plataforma — o ÚNICO lugar com o nome do app.
// Valores aqui são o FALLBACK do design system — quando o tenant define
// nome/cor/logo próprios no banco, o hook useTenantBranding sobrescreve em runtime.
//
// Para trocar sem mexer em código: VITE_APP_NAME (nome), VITE_APP_EMPRESA
// (quem assina o rodapé das páginas públicas). Dentro do app, Configurações >
// Marca troca nome, cor e logo da empresa.

const NOME_PADRAO = 'OMNX Desk'
const nomeEnv = String(import.meta.env.VITE_APP_NAME ?? '').trim()
const appName = nomeEnv || NOME_PADRAO

/** Família de marca OMNX (monograma 2×2) só quando o nome do app é OMNX. */
const familiaOmnx = /^omnx\b/i.test(appName)

/** Nome curto do produto ao lado do logo ("OMNX Desk" → "Desk"). */
const produto = appName.replace(/^omnx\s+/i, '') || appName

export const BRAND = {
  appName,
  produto,
  familiaOmnx,
  /** Nome do app de cobrança ("OMNX Cobrança" na empresa; "<app> Cobrança" fora). */
  cobranca: familiaOmnx ? 'OMNX Cobrança' : `${appName} Cobrança`,
  /** Quem assina o rodapé das páginas públicas (vazio = só o nome do app). */
  empresa: String(import.meta.env.VITE_APP_EMPRESA ?? (familiaOmnx ? 'Aliança de Alto Valor' : '')).trim(),
  tagline: 'Atendimento por WhatsApp para a sua equipe',
  logo: '/logo.png',
  // Favicon (ícone da aba) — chip OMNX com wordmark empilhada OM/NX (arte real).
  favicon: '/favicon.png?v=2',
  colors: {
    // Hex porque o index.css do omnx-desk usa CSS vars em hex (não HSL).
    // #0B57D0 = Google Blue 700 (var --empire).
    primary: '#0B57D0',
  },
} as const

export function applyBrand() {
  document.title = BRAND.appName
  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (favicon) favicon.href = BRAND.favicon
}
