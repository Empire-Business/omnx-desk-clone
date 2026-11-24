/**
 * Aceita somente rotas internas absolutas do SPA.
 *
 * Links de notificação vêm do banco e, portanto, são entrada não confiável.
 * Bloqueamos URLs externas, protocol-relative, barras invertidas e separadores
 * codificados que navegadores/proxies poderiam reinterpretar como outro host.
 */
export function safeInternalRoute(value: string | null | undefined): string | null {
  if (!value || value !== value.trim()) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value.includes('\\')) return null
  if (Array.from(value).some((char) => {
    const code = char.charCodeAt(0)
    return code <= 31 || code === 127
  })) return null
  if (/%(?:2f|5c|00|0a|0d|09)/i.test(value)) return null

  try {
    const base = new URL('https://internal.omnx.invalid')
    const parsed = new URL(value, base)
    return parsed.origin === base.origin ? value : null
  } catch {
    return null
  }
}
