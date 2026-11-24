import { SECOES_MANUAL, normalizarBuscaManual, type SecaoManual } from './manual-plataforma.ts'

export const LIMITE_PERGUNTA_AJUDA = 1000

/** Palavras vazias do português e da forma de perguntar ("onde fica", "como
 * faço", "onde está"). Nunca identificam um assunto e são removidas antes da busca.
 */
const PALAVRAS_VAZIAS = new Set((
  'a o os as um uma uns umas de do da dos das d em no na nos nas num numa e ou mas nem que se como para pra pro por pelo pela pelos pelas '
  + 'ao aos com sem sobre entre ate apos ante sob desde contra '
  + 'eu tu ele ela nos vos eles elas me mim te ti lhe lhes voce voces vc vcs seu sua seus suas meu minha meus minhas nosso nossa nossos nossas '
  + 'dele dela deles delas este esta estes estas esse essa esses essas isto isso aquilo aquele aquela nisso nisto disso disto desse dessa deste desta '
  + 'aqui ali la ai ca onde aonde cade qual quais quem quando porque pq quanto quantos quanta quantas '
  + 'fica ficam fico ficar ficaria esta estao estou estar estava encontro encontrar encontra acho achar acha vejo ver veja ve '
  + 'faco faz fazer fazemos faria consigo consegue conseguir consigam posso pode podem poderia possivel '
  + 'quero queria gostaria preciso precisa precisaria devo deve sei saber sabe tem ter tenho temos ha haver '
  + 'ser sou e sao era foi vai vou ir iria seria '
  + 'nao sim ja ainda tambem so muito mais menos bem mal entao agora hoje '
  + 'oi ola bom boa dia tarde noite obrigado obrigada favor alguem algum alguma '
  + 'conta conte contar fala falar diga dizer explica explicar mostra mostrar'
).split(/\s+/))

/** Palavras comuns que, sozinhas, não indicam a seção ("qual a previsão do
 * tempo?" não é sobre Tempo de resposta). Contam pontos, mas só quando outro
 * termo da pergunta também identifica a seção.
 */
const TERMOS_FRACOS = ['tempo', 'tela', 'aba', 'botao', 'menu', 'pagina', 'opcao', 'lugar', 'parte', 'area', 'coisa', 'tudo',
  'sistema', 'desk', 'link', 'informacao', 'dado', 'dados', 'mudar', 'mudo', 'muda', 'alterar', 'altero', 'novo', 'nova', 'usar', 'uso',
  'modelo', 'valor', 'status', 'grupo', 'teste', 'pessoa', 'equipe', 'historico', 'ajuda', 'troca', 'trocar', 'troco']

const SUFIXOS = ['amentos', 'imentos', 'amento', 'imento', 'acoes', 'icoes', 'acao', 'icao', 'adores', 'ador', 'adora', 'ando', 'endo', 'indo',
  'ados', 'adas', 'idos', 'idas', 'ado', 'ada', 'ido', 'ida', 'ar', 'er', 'ir', 'os', 'as', 'es', 'o', 'a', 'e', 's']

/** Radical simples: reduz plural e flexão comum para comparar PALAVRA INTEIRA
 * ("recebíveis" = "recebível", "cadastrar" = "cadastro"). Não há casamento por
 * pedaço de palavra: "fica" nunca encontra "notificação" nem "significa".
 */
export function radicalAjuda(palavra: string): string {
  let p = palavra
  if (p.length > 4 && p.endsWith('oes')) p = p.slice(0, -3) + 'ao'
  else if (p.length > 4 && p.endsWith('aes')) p = p.slice(0, -3) + 'ao'
  else if (p.length > 4 && p.endsWith('eis')) p = p.slice(0, -3) + 'el'
  else if (p.length > 4 && p.endsWith('ais')) p = p.slice(0, -3) + 'al'
  else if (p.length > 3 && p.endsWith('ns')) p = p.slice(0, -2) + 'm'
  for (const s of SUFIXOS) if (p.endsWith(s) && p.length - s.length >= 3) return p.slice(0, -s.length)
  return p
}

/** Palavras inteiras úteis de um texto, sem palavras vazias, já no radical. */
export function termosAjuda(texto: string): string[] {
  const palavras = normalizarBuscaManual(texto).split(/[^a-z0-9]+/).filter((p) => p.length > 1 && !PALAVRAS_VAZIAS.has(p))
  return [...new Set(palavras.map(radicalAjuda).filter((r) => r.length > 1 && !PALAVRAS_VAZIAS.has(r)))]
}

const FRACOS = new Set(TERMOS_FRACOS.map(radicalAjuda))

/** Distância de edição até 1 (troca, falta, sobra ou inversão de duas letras
 * vizinhas): "clint" ≈ "client", "cadast" ≈ "cadastr", "contart" ≈ "contrat".
 */
export function quasePalavraAjuda(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    const dif: number[] = []
    for (let i = 0; i < a.length && dif.length <= 2; i++) if (a[i] !== b[i]) dif.push(i)
    return dif.length === 1 || (dif.length === 2 && dif[1] === dif[0] + 1 && a[dif[0]] === b[dif[1]] && a[dif[1]] === b[dif[0]])
  }
  const [curta, longa] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  while (i < curta.length && curta[i] === longa[i]) i++
  return curta.slice(i) === longa.slice(i + 1)
}

/** Erro de digitação só é tolerado em termo de 5+ letras e só contra título e
 * palavras-chave (nunca contra o texto corrido), para não inventar assunto.
 */
const MIN_TOLERANCIA = 5

interface IndiceSecao { secao: SecaoManual; titulo: Set<string>; fortes: Set<string>; corpo: Set<string> }

/** Índice só do TEXTO visível das seções (nunca das chaves do JSON, como
 * "titulo", "passos" ou "grupo"). Título e palavras-chave pesam mais.
 */
const INDICE: readonly IndiceSecao[] = SECOES_MANUAL.map((secao) => ({
  secao,
  titulo: new Set(termosAjuda(secao.titulo)),
  fortes: new Set(termosAjuda([secao.titulo, ...secao.palavrasChave].join(' '))),
  corpo: new Set(termosAjuda([
    secao.resumo,
    ...secao.blocos.flatMap((b) => [b.titulo, ...(b.textos ?? []), ...(b.passos ?? []), ...(b.itens ?? []), b.exemplo ?? '', b.nota ?? '']),
    ...(secao.perguntas ?? []).flatMap((p) => [p.pergunta, p.resposta]),
    ...(secao.termos ?? []).flatMap((t) => [t.termo, t.definicao]),
  ].join(' '))),
}))

/** Termo que aparece no título de UMA só seção identifica o assunto melhor
 * ("cliente" → Clientes). Termo presente em vários títulos ("carteira") não ganha bônus.
 */
const TITULO_UNICO = new Set([...new Set(INDICE.flatMap((i) => [...i.titulo]))].filter((t) => INDICE.filter((i) => i.titulo.has(t)).length === 1))

/** "Íris, ..." / "Oi Íris" / "..., Íris?": chamar pelo nome não é assunto.
 * "Como uso a Íris?" continua sendo pergunta sobre a Íris.
 */
export function semVocativoAjuda(pergunta: string): string {
  return normalizarBuscaManual(pergunta)
    .replace(/^\s*((oi|ola|ei|e ai|bom dia|boa tarde|boa noite)[\s,!]+)?iris(\s*[,:;!.?-]+|\s*$)/, ' ')
    .replace(/,\s*iris\s*[?!.]*\s*$/, ' ')
}

/** Pergunta que se apoia na anterior: "e onde fica isso?", "e como faço?". */
const CONTINUACAO = /\b(isso|isto|nisso|disso|dele|dela|nele|nela|desse|dessa|deste|desta|aquilo|aquele|aquela|la|ali)\b|^\s*(e|mas|entao|tambem)\b/

/** Une a pergunta à última pergunta da pessoa quando ela não tem assunto próprio
 * (só "e onde fica isso?") ou se refere a algo já dito e tem no máximo dois
 * termos. Pergunta nova com assunto ("me conta uma piada") não herda nada.
 */
export function perguntaComContextoAjuda(pergunta: string, anteriores: readonly string[] = []): string {
  const anterior = [...anteriores].reverse().find((a) => termosAjuda(semVocativoAjuda(a)).length > 0)
  if (!anterior) return pergunta
  const atual = semVocativoAjuda(pergunta)
  const termos = termosAjuda(atual)
  return termos.length === 0 || (termos.length <= 2 && CONTINUACAO.test(atual)) ? `${anterior.slice(0, 300)} ${pergunta}` : pergunta
}

/** Busca editorial local: não consulta cadastros nem atribui respostas à IA.
 * Uma seção só é devolvida com pelo menos um termo identificador no título ou
 * nas palavras-chave, ou com dois termos identificadores no texto. Sem isso,
 * nenhuma seção (e a IA não é chamada). O tema da página só desempata.
 * `anteriores`: perguntas anteriores da pessoa nesta conversa (só para continuação).
 */
export function encontrarAssuntosAjuda(pergunta: string, tema?: string, anteriores: readonly string[] = []): readonly SecaoManual[] {
  const termos = termosAjuda(semVocativoAjuda(perguntaComContextoAjuda(pergunta.slice(0, LIMITE_PERGUNTA_AJUDA), anteriores)))
  if (!termos.length) return []
  return INDICE.map(({ secao, titulo, fortes, corpo }, ordem) => {
    let pontos = 0, identificaForte = false, identificaCorpo = 0
    for (const t of termos) {
      // No título vale mais que só nas palavras-chave: "cadastro de cliente" é Clientes, não Colaboradores.
      if (fortes.has(t)) { pontos += titulo.has(t) && TITULO_UNICO.has(t) && !FRACOS.has(t) ? 5 : 4; if (!FRACOS.has(t)) identificaForte = true }
      // Palavra comum só no texto corrido não pontua ("novo", "tela", "uso").
      else if (corpo.has(t) && !FRACOS.has(t)) { pontos += 1; identificaCorpo++ }
      else if (t.length >= MIN_TOLERANCIA && !FRACOS.has(t)
        && [...fortes].some((f) => f.length >= MIN_TOLERANCIA && !FRACOS.has(f) && quasePalavraAjuda(t, f))) { pontos += 3; identificaForte = true }
    }
    const qualifica = identificaForte || identificaCorpo >= 2
    return { secao, ordem, pontos: qualifica ? pontos + (tema === secao.id ? 2 : 0) : 0 }
  }).filter((s) => s.pontos > 0).sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem).slice(0, 3).map((s) => s.secao)
}

/** Pedido de DADO (telefone, CPF, listas, contagens): a ajuda não consulta
 * cadastros. Responde na hora, sem IA, e mostra onde a pessoa pode procurar.
 */
const PEDIDO_DE_DADO: readonly RegExp[] = [
  /\b(qual|quais|passa|passe|manda|mande|envia|envie|informa|informe|diz|diga|fala|fale)\b.{0,30}\b(telefone|celular|whatsapp|cpf|cnpj|rg|e-?mail|endereco|contato|dados)s?\s+(do|da|dos|das|de)\b/,
  /\b(liste|listar|lista|mostre|mostra|exiba|exibe|traga|traz|passa|manda|envia)\s+(os |as |todos os |todas as |meus |minhas )?(clientes|contratos|tickets|conversas|inadimplentes|parcelas|pagamentos|colaboradores|telefones|contatos)\b/,
  /\bquais (sao )?(os |as )?(clientes|contratos|tickets|inadimplentes|parcelas)\b/,
  /\bquant[oa]s (clientes|contratos|tickets|conversas|parcelas)\b/,
]

/** Tentativa de mudar as regras da ajuda (injeção de prompt). Não vai à IA. */
const PEDIDO_DE_INSTRUCAO: readonly RegExp[] = [
  /\b(ignore|ignora|ignorar|esqueca|esquece|esquecer|desconsidere|desconsidera)\b.{0,40}\b(instruc\w*|regras?|prompt|sistema|tudo (acima|antes|que))/,
  /\b(suas|tuas|seu|teu)\s+(instruc\w*|prompt|regras)\b/,
  /\b(instruc\w*|prompt)\s+(do sistema|de sistema|internas?|originais|iniciais|secret\w*)\b/,
  /\bsystem prompt\b/,
  /\b(finja|finge|fingir|aja como|atue como|voce agora e|a partir de agora voce|modo desenvolvedor|developer mode|jailbreak)\b/,
]

export type MotivoRespostaFixaAjuda = 'dado_de_cliente' | 'instrucao'

export function motivoRespostaFixaAjuda(pergunta: string): MotivoRespostaFixaAjuda | null {
  const s = normalizarBuscaManual(pergunta.slice(0, LIMITE_PERGUNTA_AJUDA))
  if (PEDIDO_DE_INSTRUCAO.some((r) => r.test(s))) return 'instrucao'
  if (PEDIDO_DE_DADO.some((r) => r.test(s))) return 'dado_de_cliente'
  return null
}

const TEXTO_FIXO: Record<MotivoRespostaFixaAjuda, string> = {
  dado_de_cliente: 'A ajuda da Íris ensina a usar o Desk e não consulta cadastros: não traz telefones, CPF, e-mails, valores nem listas de clientes ou contratos. Para ver esse dado, abra a tela correspondente com o seu acesso. Se ela não aparecer para você, peça à administração.',
  instrucao: 'Eu só explico como usar o Desk, com base no manual, e não mudo essas regras. Diga qual tela ou tarefa você procura, por exemplo: cadastrar um cliente, encontrar um contrato ou abrir um ticket.',
}

/** Resposta sem IA. `motivo` presente = a pergunta NUNCA vai à IA (pedido de
 * dado ou de mudar as regras); ausente = consulta local comum (fallback).
 */
export function respostaLocalAjuda(pergunta: string, tema?: string, anteriores: readonly string[] = []) {
  const motivo = motivoRespostaFixaAjuda(pergunta)
  const secoes = motivo === 'instrucao' ? [] : encontrarAssuntosAjuda(pergunta, tema, anteriores)
  return {
    modo: 'manual' as const,
    texto: motivo ? TEXTO_FIXO[motivo] : secoes.length
      ? 'Encontrei estes assuntos no manual. Abra um deles para consultar as instruções completas.'
      : 'Não encontrei uma orientação segura para essa pergunta no manual. Tente indicar o recurso, como clientes, contratos ou atendimento, ou consulte o manual completo.',
    fontes: secoes.map(s => s.id),
    ...(motivo ? { motivo } : {}),
  }
}

export function fontesAjudaValidas(ids: unknown): string[] {
  return Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string' && SECOES_MANUAL.some(s => s.id === id)))].slice(0, 3) : []
}
