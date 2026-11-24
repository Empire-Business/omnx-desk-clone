/** Carimbo do texto recebido do provider autenticado, sem prefixo de autor do Chat. */
export async function sha256EntradaAcaoChat(texto: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('')
}

export async function hashEntradaDiretaAcaoChat(entrada: {
  autenticada: boolean; tipo: string; conteudo: string | null; fromMe: unknown; enviadaPorApi: unknown;
  quotedId: string | null; gatilho: string; encaminhada: boolean | null;
}): Promise<string | null> {
  if (!entrada.autenticada || entrada.tipo !== 'texto' || typeof entrada.conteudo !== 'string'
    || !entrada.conteudo.trim() || entrada.fromMe === true || entrada.enviadaPorApi === true
    || entrada.encaminhada === true) return null
  // Uma resposta pode conter um pedido próprio. O digest cobre somente o corpo
  // atual autenticado; quotedId não fornece texto nem autorização.
  return sha256EntradaAcaoChat(entrada.conteudo)
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
}

/** Só metadados do envelope atual; não percorre quotedMessage nem texto de cliente.
 * Ausência de flag é desconhecida, nunca prova de que não foi encaminhada. */
export function encaminhadaEntradaAcaoChat(msg: Record<string, unknown>, body: Record<string, unknown>): boolean | null {
  const mensagemBody = objeto(body.message)
  const contextos = [objeto(msg.contextInfo), objeto(objeto(msg.content)?.contextInfo),
    objeto(mensagemBody?.contextInfo), objeto(objeto(mensagemBody?.content)?.contextInfo)]
  let falsoExplicito = false
  let invalido = false
  for (const c of contextos) {
    if (!c) continue
    if (c.isForwarded === true) return true
    if (c.isForwarded === false) falsoExplicito = true
    else if (Object.hasOwn(c, 'isForwarded')) invalido = true
    if (typeof c.forwardingScore === 'number' && Number.isInteger(c.forwardingScore) && c.forwardingScore >= 0) {
      if (c.forwardingScore > 0) return true
      falsoExplicito = true
    } else if (Object.hasOwn(c, 'forwardingScore')) invalido = true
  }
  return invalido ? null : falsoExplicito ? false : null
}
