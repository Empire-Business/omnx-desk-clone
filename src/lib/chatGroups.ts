/** Somente linhas já autorizadas pelo servidor. Nome nunca identifica um grupo. */
export interface ConversaAgrupavel {
  id: string
  tenant_id?: string
  is_group: boolean
  chat_contacts: { numero_whatsapp: string } | null
}

export function chaveGrupo(conversa: ConversaAgrupavel): string {
  const numero = conversa.chat_contacts?.numero_whatsapp?.trim().replace(/@g\.us$/, '')
  if (!conversa.is_group || !conversa.tenant_id || !numero || !/^\d+(?:-\d+)?$/.test(numero)) return `conversa:${conversa.id}`
  return `grupo:${conversa.tenant_id}:${numero}@g.us`
}

/** A primeira linha já vem ordenada/filtrada pela tela; nenhuma origem é descartada do banco. */
export function agruparConversas<T extends ConversaAgrupavel>(conversas: readonly T[]): T[][] {
  const grupos = new Map<string, T[]>()
  for (const conversa of conversas) {
    const chave = chaveGrupo(conversa)
    const grupo = grupos.get(chave)
    if (grupo) grupo.push(conversa)
    else grupos.set(chave, [conversa])
  }
  return [...grupos.values()]
}

export function origensDoGrupo<T extends ConversaAgrupavel>(selecionada: T | undefined, autorizadas: readonly T[]): T[] {
  if (!selecionada) return []
  const chave = chaveGrupo(selecionada)
  return autorizadas.filter(c => chaveGrupo(c) === chave)
}
