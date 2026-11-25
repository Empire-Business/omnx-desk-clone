// Normalização de telefone brasileiro no lado servidor.
//
// É a mesma lógica de `src/lib/telefone.ts`. Está duplicada porque as edge
// functions rodam em Deno e não enxergam o bundle do front — e porque o servidor
// não pode confiar no que o browser mandou: quem chama a função direto poderia
// enviar telefone em qualquer formato.

/** Converte um telefone escrito de qualquer jeito para E.164. Vazio quando não há número. */
export function normalizaTelefoneBR(bruto: string | null | undefined): string {
  if (!bruto) return ''
  const digitos = String(bruto).replace(/\D/g, '').replace(/^0+/, '')
  if (!digitos) return ''
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) return `+${digitos}`
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`
  return `+${digitos}`
}

/**
 * Chave de comparação entre bases: DDD + os últimos 8 dígitos.
 *
 * O Brasil acrescentou o nono dígito aos celulares e bases antigas ficaram sem
 * ele — o mesmo telefone é `+5521999990000` aqui e `+552199990000` no CRM.
 * Comparar a string cheia criaria contato duplicado; cortar o nono faz casar.
 *
 * Vazio quando não é um telefone brasileiro plausível: melhor não casar do que
 * casar errado.
 */
export function chaveTelefone(bruto: string | null | undefined): string {
  const telefone = normalizaTelefoneBR(bruto)
  if (!telefone) return ''
  const digitos = telefone.replace(/\D/g, '')
  if (!digitos.startsWith('55') || (digitos.length !== 12 && digitos.length !== 13)) return ''
  const nacional = digitos.slice(2)
  return nacional.slice(0, 2) + nacional.slice(-8)
}

/** Formato em que contatos NOVOS são gravados no CRM: E.164 completo. */
export function paraE164(bruto: string | null | undefined): string {
  const t = normalizaTelefoneBR(bruto)
  const d = t.replace(/\D/g, '')
  if (!d.startsWith('55') || (d.length !== 12 && d.length !== 13)) return ''
  return `+${d}`
}
