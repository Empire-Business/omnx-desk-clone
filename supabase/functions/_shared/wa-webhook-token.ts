// Token por instância no webhook da UAZAPI (uazapi-webhook).
//
// A UAZAPI não manda cabeçalho próprio, então o segredo vai na URL configurada no
// webhook do número. Formato gravado por wa-agente-admin (ação proteger_webhook):
//
//   https://<projeto>.supabase.co/functions/v1/uazapi-webhook/k/<token>
//
// Caminho (e não ?k=) porque, com addUrlEvents/addUrlTypesMessages ligados, a
// UAZAPI ACRESCENTA "/<evento>/<tipo>" ao fim da URL — numa query string isso
// grudaria no valor do token. Com o token no caminho, os sufixos vêm depois e não
// atrapalham. Mesmo assim, ?k= também é aceito (cortado no primeiro "/").
//
// O token é 32 bytes aleatórios em base64url (43 caracteres). O banco guarda só o
// sha256 (wa_webhook_tokens.token_hash). NUNCA logar url.pathname/url.search
// crus: use caminhoSemToken().
//
// Módulo PURO (só Web APIs): roda na edge function e no Vitest.

/** Caracteres de base64url; tamanho aceito igual ao da RPC (32..256). */
const TOKEN_VALIDO = /^[A-Za-z0-9_-]{32,256}$/

export type TokenDaUrl =
  | { tipo: 'ausente' }
  | { tipo: 'invalido' }
  | { tipo: 'presente'; token: string }

/** Lê o token do caminho (/uazapi-webhook/k/<token>/…) ou da query (?k=<token>). */
export function tokenDaUrl(url: URL): TokenDaUrl {
  const partes = url.pathname.split('/').filter(Boolean)
  const base = partes.indexOf('uazapi-webhook')
  let bruto: string | null = null
  let veio = false
  if (base >= 0 && partes[base + 1] === 'k') {
    veio = true
    bruto = partes[base + 2] ?? ''
  } else if (url.searchParams.has('k')) {
    veio = true
    bruto = (url.searchParams.get('k') ?? '').split('/')[0]
  }
  if (!veio) return { tipo: 'ausente' }
  try {
    bruto = decodeURIComponent(bruto ?? '')
  } catch {
    return { tipo: 'invalido' }
  }
  return TOKEN_VALIDO.test(bruto) ? { tipo: 'presente', token: bruto } : { tipo: 'invalido' }
}

/** Segmentos do caminho depois de "uazapi-webhook" (e depois de "k/<token>", se houver). */
export function segmentosDoEvento(url: URL): string[] {
  const partes = url.pathname.split('/').filter(Boolean)
  const base = partes.indexOf('uazapi-webhook')
  if (base < 0) return []
  const resto = partes.slice(base + 1)
  return resto[0] === 'k' ? resto.slice(2) : resto
}

/** Caminho seguro para log: o token vira "***". Nunca inclui a query string. */
export function caminhoSemToken(url: URL): string {
  const partes = url.pathname.split('/')
  const i = partes.indexOf('uazapi-webhook')
  if (i >= 0 && partes[i + 1] === 'k' && partes.length > i + 2) partes[i + 2] = '***'
  return partes.join('/')
}

/** Novo token: 32 bytes do gerador forte em base64url (43 caracteres, sem "="). */
export function gerarTokenWebhook(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** sha256 do token (UTF-8) em hex — gravado como bytea ('\x' || hex) pelo servidor. */
export async function hashTokenHex(token: string): Promise<string> {
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * URL do webhook com o token, preservando a query que já existia (ex.: ?instance=…).
 * `atual` é a URL hoje configurada na UAZAPI; precisa ser do próprio projeto e da
 * função uazapi-webhook — senão null (não "protege" um destino desconhecido).
 */
export function urlComToken(atual: string, supabaseUrl: string, token: string): string | null {
  let a: URL
  let base: URL
  try {
    a = new URL(atual)
    base = new URL(supabaseUrl)
  } catch {
    return null
  }
  if (a.protocol !== 'https:' || a.host !== base.host || a.username || a.password) return null
  const partes = a.pathname.split('/').filter(Boolean)
  // Aceita …/functions/v1/uazapi-webhook, já com /k/<token antigo> ou não, e
  // eventuais sufixos (que a UAZAPI acrescenta sozinha e não devem ser gravados).
  if (partes[0] !== 'functions' || partes[1] !== 'v1' || partes[2] !== 'uazapi-webhook') return null
  // Tira o k=<token> antigo da query, se alguém configurou assim.
  const q = new URLSearchParams(a.search)
  q.delete('k')
  const query = q.toString()
  return `${base.origin}/functions/v1/uazapi-webhook/k/${token}${query ? `?${query}` : ''}`
}

/** A URL configurada já é a protegida com ESTE token? (comparação sem logar nada) */
export function urlTemToken(url: unknown, token: string): boolean {
  if (typeof url !== 'string') return false
  try {
    const r = tokenDaUrl(new URL(url))
    return r.tipo === 'presente' && r.token === token
  } catch {
    return false
  }
}

/** Esconde o token de uma URL de webhook (para devolver config ao front). */
export function mascararUrlWebhook(url: unknown): unknown {
  if (typeof url !== 'string') return url
  try {
    const u = new URL(url)
    const temK = u.searchParams.has('k')
    if (temK) u.searchParams.set('k', '***')
    const p = caminhoSemToken(u)
    return `${u.origin}${p}${u.search}`
  } catch {
    return url.replace(/\/k\/[^/?#]+/g, '/k/***').replace(/([?&])k=[^&#]*/g, '$1k=***')
  }
}
