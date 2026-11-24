/**
 * Sugestão de resolução da Íris.
 *
 * Quando a Íris tem certeza de que um pedido foi resolvido, ela fecha o ticket
 * sozinha. Quando só *acha* que foi resolvido, grava uma sugestão no ticket,
 * sem mudar a etapa, e uma pessoa confirma (Resolver) ou recusa (Manter aberto).
 *
 * Aqui ficam só regras de leitura e textos — nada de consulta ao banco. As
 * colunas `wa_sugestao_*` podem ainda não existir no banco: nesse caso a
 * leitura devolve `undefined` e a tela simplesmente não mostra a sugestão.
 */

export type RazaoSugestao =
  | 'confianca_media'
  | 'vinculo_ambiguo'
  | 'so_equipe'
  | 'generica_ambigua'
  | 'evidencia_compartilhada'
  | 'pedido_cliente'

export interface SugestaoIris {
  em: string
  /** `null` quando o banco gravou uma razão que esta versão da tela não conhece. */
  razao: RazaoSugestao | null
  motivo: string | null
  confianca: number | null
  /** Ids de `chat_messages` que levaram à sugestão (1 a 3). */
  evidencias: string[]
}

/** Colunas da sugestão como vêm do banco (todas opcionais: banco antigo). */
export interface LinhaSugestaoIris {
  wa_sugestao_em?: string | null
  wa_sugestao_razao?: string | null
  wa_sugestao_motivo?: string | null
  /** `numeric` do Postgres pode chegar como texto. */
  wa_sugestao_confianca?: number | string | null
  wa_sugestao_evidencias?: string[] | null
}

/** Colunas lidas pela tela (modelo e versão ficam só no banco, para auditoria). */
export const SELECT_SUGESTAO_IRIS =
  'wa_sugestao_em, wa_sugestao_razao, wa_sugestao_motivo, wa_sugestao_confianca, wa_sugestao_evidencias'

/**
 * Payload de "Manter aberto": a pessoa não cria nem edita a sugestão, só a
 * limpa. As evidências vão como lista vazia (a coluna não aceita nulo).
 */
export const LIMPAR_SUGESTAO_IRIS = {
  wa_sugestao_em: null,
  wa_sugestao_razao: null,
  wa_sugestao_motivo: null,
  wa_sugestao_confianca: null,
  wa_sugestao_modelo: null,
  wa_sugestao_versao: null,
  wa_sugestao_evidencias: [] as string[],
} as const

const RAZOES: readonly RazaoSugestao[] = [
  'confianca_media', 'vinculo_ambiguo', 'so_equipe', 'generica_ambigua', 'evidencia_compartilhada', 'pedido_cliente',
]

/**
 * Converte as colunas do banco numa sugestão.
 * - `undefined`: o banco ainda não tem as colunas (a tela ignora a função);
 * - `null`: não há sugestão neste ticket.
 */
export function lerSugestao(linha: LinhaSugestaoIris | null | undefined): SugestaoIris | null | undefined {
  if (!linha || linha.wa_sugestao_em === undefined) return undefined
  if (!linha.wa_sugestao_em) return null
  const bruta = linha.wa_sugestao_confianca
  const numero = bruta === null || bruta === undefined || bruta === '' ? null : Number(bruta)
  const razao = RAZOES.includes(linha.wa_sugestao_razao as RazaoSugestao) ? (linha.wa_sugestao_razao as RazaoSugestao) : null
  return {
    em: linha.wa_sugestao_em,
    razao,
    motivo: linha.wa_sugestao_motivo?.trim() || null,
    confianca: numero === null || Number.isNaN(numero) ? null : numero,
    evidencias: Array.isArray(linha.wa_sugestao_evidencias) ? linha.wa_sugestao_evidencias.filter(Boolean) : [],
  }
}

/** Por que a Íris ficou em dúvida, em palavras de quem não é técnico. */
export const TEXTO_RAZAO_SUGESTAO: Record<RazaoSugestao, string> = {
  so_equipe: 'Só a equipe disse que resolveu; o cliente ainda não confirmou.',
  generica_ambigua: 'O cliente disse que funcionou, mas há mais de um pedido aberto nesta conversa.',
  vinculo_ambiguo: 'Não ficou claro a qual pedido a confirmação se refere.',
  evidencia_compartilhada: 'A mesma mensagem parece resolver mais de um pedido.',
  pedido_cliente: 'O cliente pediu para encerrar, sem dizer que funcionou.',
  confianca_media: 'A Íris viu sinais de solução, mas não teve certeza.',
}

export function textoRazaoSugestao(razao: RazaoSugestao | string | null | undefined): string {
  return TEXTO_RAZAO_SUGESTAO[razao as RazaoSugestao] ?? TEXTO_RAZAO_SUGESTAO.confianca_media
}

/** O cliente mandou mensagem depois que a Íris fez a sugestão? (pede releitura antes de confirmar) */
export function clienteEscreveuDepois(sugestaoEm: string | null | undefined, ultimaMsgClienteEm: string | null | undefined): boolean {
  if (!sugestaoEm || !ultimaMsgClienteEm) return false
  const sugestao = new Date(sugestaoEm).getTime()
  const cliente = new Date(ultimaMsgClienteEm).getTime()
  if (Number.isNaN(sugestao) || Number.isNaN(cliente)) return false
  return cliente > sugestao
}

/**
 * O ticket está na fila "Para confirmar"? Tem sugestão e ainda não foi
 * resolvido (o banco limpa a sugestão quando a etapa muda, mas a tela não
 * depende disso).
 */
export function aguardaConfirmacao(ticket: { status: string; wa?: { sugestao?: SugestaoIris | null } | null }): boolean {
  return ticket.status !== 'resolvido' && Boolean(ticket.wa?.sugestao)
}

const ROTULO_HISTORICO_SUGESTAO: Record<string, string> = {
  sugerida: 'criada',
  aprovada: 'aprovada',
  recusada: 'recusada (o ticket continuou aberto)',
  substituida: 'trocada por uma mais recente',
  'resolvida pela Íris': 'a Íris resolveu sozinha depois',
  descartada: 'descartada',
}

/** Linha do histórico com `campo = 'sugestao_ia'`: "Sugestão da Íris: aprovada". */
export function textoHistoricoSugestao(valor: string | null | undefined): string {
  const chave = (valor ?? '').trim()
  return `Sugestão da Íris: ${ROTULO_HISTORICO_SUGESTAO[chave] ?? (chave || 'atualizada')}`
}
