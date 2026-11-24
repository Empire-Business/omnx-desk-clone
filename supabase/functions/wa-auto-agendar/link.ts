// Escolha do link de reunião que o wa-auto-agendar manda no grupo do cliente.
// Puro (sem Deno.*, sem import remoto): testado no Vitest (link.test.ts).
//
// Ordem: link informado agora > link já salvo na reunião > sala interna (LiveKit).
// A sala interna só entra quando a sala de vídeo está ligada (segredo das funções
// REUNIAO_VIDEO, mesma regra de VITE_REUNIAO_VIDEO no site, src/config/recursos.ts).
// Desligada (instalação do zero), sem link informado nem salvo, pede o link.

/** Mesma regra de lerLigado (src/config/recursos.ts): vazio ou ausente = `padrao`. */
export function lerLigado(valor: string | undefined | null, padrao: boolean): boolean {
  const v = (valor ?? '').trim().toLowerCase()
  if (!v) return padrao
  return ['1', 'true', 'on', 'sim', 'ligado'].includes(v)
}

/** Sala de vídeo interna ligada? Padrão ligado (comportamento atual da empresa). */
export function salaDeVideoLigada(lerEnv: (nome: string) => string | undefined): boolean {
  return lerLigado(lerEnv('REUNIAO_VIDEO'), true)
}

/**
 * Link de reunião aceito no grupo: https, sem usuário/senha, sem IP literal,
 * sem espaços, até 500 caracteres.
 */
export function validarLink(bruto: unknown): string {
  const s = String(bruto ?? '').trim()
  if (!s || s.length > 500 || /\s/.test(s)) throw new Error('Link inválido.')
  let url: URL
  try { url = new URL(s) } catch { throw new Error('Link inválido.') }
  if (url.protocol !== 'https:') throw new Error('O link precisa começar com https://')
  if (url.username || url.password) throw new Error('O link não pode conter usuário ou senha.')
  const host = url.hostname.toLowerCase()
  if (!host.includes('.') || /^[0-9.]+$/.test(host) || host.startsWith('[')) {
    throw new Error('Use um link com endereço de site (não um IP).')
  }
  return url.toString()
}

/** Link da sala interna (LiveKit) da própria plataforma, como convidado. */
export function linkSalaInterna(appUrl: string, roomName: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(roomName ?? '')) return null
  try {
    return validarLink(`${appUrl}/meet/${roomName}?role=guest`)
  } catch {
    return null
  }
}

export type OrigemLink = 'informado' | 'reuniao' | 'sala_interna'

/**
 * Escolhe o link. Lança Error com mensagem para a pessoa quando o link informado
 * ou salvo é inválido; devolve link null quando não há nenhum para mandar.
 */
export function escolherLinkReuniao(entrada: {
  informado: unknown
  salvo: string | null
  sala: string | null | undefined
  appUrl: string
  videoLigado: boolean
}): { link: string | null; origem: OrigemLink } {
  if (typeof entrada.informado === 'string' && entrada.informado.trim()) {
    return { link: validarLink(entrada.informado), origem: 'informado' }
  }
  if (entrada.salvo) return { link: validarLink(entrada.salvo), origem: 'reuniao' }
  if (!entrada.videoLigado) return { link: null, origem: 'sala_interna' }
  return { link: linkSalaInterna(entrada.appUrl, entrada.sala ?? ''), origem: 'sala_interna' }
}
