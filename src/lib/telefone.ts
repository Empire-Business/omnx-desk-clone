/**
 * Normalização de telefone brasileiro.
 *
 * Os telefones no banco vieram de origens diferentes (Notion, formulários,
 * digitação manual) e estão em todo tipo de formato: "21 99999-0000",
 * "5511999998888", "(11) 99999-8888". Ferramentas de disparo só aceitam o
 * padrão internacional E.164 — daí esta conversão.
 */

export interface TelefoneNormalizado {
  /** Telefone em E.164 (+5511999998888) ou string vazia se não havia número. */
  telefone: string
  /** Motivo para a pessoa conferir a linha manualmente; vazio quando está ok. */
  aviso: string
}

/**
 * Converte um telefone escrito de qualquer jeito para E.164.
 *
 * Quando o número não bate com nenhum tamanho conhecido, devolvemos o que deu
 * junto com um aviso em vez de descartar: é melhor a pessoa ver a linha marcada
 * para conferir do que o contato sumir do arquivo sem explicação.
 */
export function normalizaTelefoneBR(bruto: string | null | undefined): TelefoneNormalizado {
  if (!bruto) return { telefone: '', aviso: 'sem telefone' }
  const digitos = String(bruto).replace(/\D/g, '').replace(/^0+/, '')
  if (!digitos) return { telefone: '', aviso: 'sem telefone' }
  // Já tem código do país: 55 + DDD (2) + número (8 ou 9).
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) {
    return { telefone: `+${digitos}`, aviso: '' }
  }
  // Só DDD + número — falta o código do país.
  if (digitos.length === 10 || digitos.length === 11) {
    return { telefone: `+55${digitos}`, aviso: '' }
  }
  return { telefone: `+${digitos}`, aviso: 'conferir — formato atípico' }
}

/**
 * Chave de comparação entre bases diferentes: DDD + os últimos 8 dígitos.
 *
 * O Brasil acrescentou o nono dígito aos celulares e bases antigas ficaram sem
 * ele — o mesmo telefone aparece como `+5521999990000` aqui e `+552199990000`
 * no CRM. Comparar a string cheia trataria os dois como pessoas diferentes e
 * criaria contato duplicado; cortar o nono dígito faz os dois casarem.
 *
 * Devolve string vazia quando não dá para extrair um telefone brasileiro
 * plausível (número de outro país, ramal, lixo) — nesses casos é melhor não
 * casar do que casar errado.
 */
export function chaveTelefone(bruto: string | null | undefined): string {
  const { telefone } = normalizaTelefoneBR(bruto)
  if (!telefone) return ''
  const digitos = telefone.replace(/\D/g, '')
  // Só telefone brasileiro: +55 seguido de DDD (2) + número (8 ou 9).
  if (!digitos.startsWith('55') || (digitos.length !== 12 && digitos.length !== 13)) return ''
  const nacional = digitos.slice(2)
  return nacional.slice(0, 2) + nacional.slice(-8)
}
