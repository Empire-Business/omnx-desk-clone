// Identidade centralizada da plataforma.
// Valores aqui são o FALLBACK do design system — quando o tenant define
// nome/cor/logo próprios no banco, o hook useTenantBranding sobrescreve em runtime.

export const BRAND = {
  appName: import.meta.env.VITE_APP_NAME || 'OMNX Desk',
  tagline: 'Gestão completa pra agências de marketing digital',
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
