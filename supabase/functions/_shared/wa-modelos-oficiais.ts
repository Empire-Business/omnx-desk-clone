// Catálogo FIXO dos modelos (templates) do WhatsApp oficial usados pelo app
// Automações WhatsApp — docs/integracoes/zernio-templates.md.
//
// Regras PURAS: sem banco, sem rede, sem Deno e sem imports. Roda igual na edge
// function `wa-auto-templates` e no Vitest (wa-modelos-oficiais.test.ts).
//
// Por que o catálogo mora no servidor:
//   * o texto do modelo NUNCA vem do navegador — o admin só escolhe QUAL dos 3
//     criar. Assim ninguém usa o nosso app para criar modelos arbitrários no
//     WhatsApp da empresa;
//   * o texto aprovado pela Meta é o mesmo que o código preenche: os testes travam
//     o corpo do aviso diário contra MODELO_RELATORIO_OFICIAL (wa-relatorio.ts) e a
//     ordem das variáveis do resumo contra o que wa-auto-resumo-semanal envia.
//
// Mudar um texto aprovado = criar um modelo NOVO (sufixo _v2): a Meta analisa de
// novo e o nome antigo, se apagado, fica bloqueado por 30 dias.

export type TipoModeloOficial = 'relatorio' | 'resumo' | 'link'

/** Coluna de wa_auto_config onde o envio procura o nome do modelo. */
export type ColunaModelo = 'template_relatorio' | 'template_resumo' | 'template_link'

export interface ModeloOficial {
  tipo: TipoModeloOficial
  /** Nome na Meta: minúsculas, números e _ (começa por letra). */
  nome: string
  /** Rótulo curto para a tela. */
  titulo: string
  /** Quem recebe, em linguagem simples. */
  paraQuem: string
  categoria: 'UTILITY'
  idioma: 'pt_BR'
  formato: 'POSITIONAL'
  /** Por quanto tempo a Meta tenta entregar (UTILITY aceita 30 a 43200). */
  ttlSegundos: number
  coluna: ColunaModelo
  /** Corpo com variáveis numeradas {{1}}, {{2}}… */
  corpo: string
  /** Nome lógico de cada variável, na ordem em que o código manda ({{1}} = ordem[0]). */
  ordem: readonly string[]
  /** Exemplo de cada variável (obrigatório para a análise da Meta). */
  exemplos: readonly string[]
  /** Observação para a tela (opcional). */
  observacao?: string
}

export const LIMITE_CORPO = 1024
/** Regra prática do mercado (a Meta não publica a proporção): ≥ 3 palavras fixas por variável. */
export const MIN_PALAVRAS_POR_VARIAVEL = 3
export const IDIOMA_MODELOS = 'pt_BR'

export const MODELOS_OFICIAIS: readonly ModeloOficial[] = [
  {
    tipo: 'relatorio',
    nome: 'omnx_aviso_diario_v2',
    titulo: 'Aviso diário ao gestor',
    paraQuem: 'Gestores da lista da aba Gestores (também usado no envio de teste).',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    formato: 'POSITIONAL',
    ttlSegundos: 10_800, // 3h: depois disso o aviso do dia perde o sentido
    coluna: 'template_relatorio',
    // Igual a paraTemplateOficial(MODELO_RELATORIO_OFICIAL, …).modeloNumerado (teste trava).
    corpo:
      'Bom dia, {{1}}! Aviso diário de {{2}}. Alertas: {{3}}. Detalhes no OMNX Desk.',
    ordem: ['gestor', 'data', 'alertas'],
    exemplos: [
      'Ana',
      '26/10/2026',
      'Sem resposta: Padaria Pão Quente (esperando há 5h); Insatisfeitos: Clínica Sorriso (conversa com tom negativo)',
    ],
  },
  {
    tipo: 'resumo',
    nome: 'omnx_resumo_semanal_cliente_v1',
    titulo: 'Resumo semanal ao cliente',
    paraQuem: 'O contato de cada cliente, na conversa particular (resumo no grupo não sai pela API oficial).',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    formato: 'POSITIONAL',
    ttlSegundos: 43_200, // 12h
    coluna: 'template_resumo',
    // Variáveis na ordem de converterMensagem('zernio', MODELO_PRIVADO, …) em
    // wa-auto-resumo-semanal: cliente, periodo, temas, proximos (teste trava).
    corpo:
      'Olá, {{1}}! Segue o resumo da semana ({{2}}).\n' +
      'Assuntos tratados: {{3}}\n' +
      'Próximos passos: {{4}}\n' +
      'Resumo automático das nossas conversas no WhatsApp. Se algo não estiver certo, é só nos avisar.',
    ordem: ['cliente', 'periodo', 'temas', 'proximos'],
    exemplos: [
      'Padaria Pão Quente',
      '19/10 a 26/10',
      'cardápio de Natal; aprovação das fotos novas',
      'Equipe vai enviar o material da apresentação; Cliente vai revisar o cronograma de conteúdo',
    ],
  },
  {
    tipo: 'link',
    nome: 'omnx_link_reuniao_v1',
    titulo: 'Link da reunião',
    paraQuem: 'O cliente, quando o link da reunião for enviado pela API oficial.',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    formato: 'POSITIONAL',
    ttlSegundos: 7_200, // 2h
    coluna: 'template_link',
    // A Meta recusa variável no fim do texto: por isso o link não fecha a mensagem
    // (o modelo de texto da UAZAPI em wa-auto-agendar termina com o link).
    corpo:
      'Olá, {{1}}! Sua reunião com a nossa equipe está marcada para {{2}} às {{3}}. ' +
      'Link para entrar: {{4}} — se precisar remarcar, é só responder esta mensagem.',
    ordem: ['cliente', 'data', 'hora', 'link'],
    exemplos: ['Padaria Pão Quente', '28/10/2026', '14:30', 'https://meet.google.com/abc-defg-hij'],
    observacao: 'Hoje o link da reunião sai no grupo pela API não oficial; este modelo já fica aprovado para quando o envio pela oficial for ligado.',
  },
]

export const TIPOS_MODELO: readonly TipoModeloOficial[] = MODELOS_OFICIAIS.map((m) => m.tipo)

export function ehTipoModelo(v: unknown): v is TipoModeloOficial {
  return typeof v === 'string' && (TIPOS_MODELO as readonly string[]).includes(v)
}

export function modeloPorTipo(tipo: unknown): ModeloOficial | null {
  return MODELOS_OFICIAIS.find((m) => m.tipo === tipo) ?? null
}

// ---------------------------------------------------------------------------
// Envio de teste pela oficial: valores seguros para o aviso diário
// ---------------------------------------------------------------------------

/** Data no fuso de São Paulo, dd/mm/aaaa (independe do fuso do servidor). */
export function dataSaoPaulo(d: Date): string {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(d)
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? ''
  return `${p('day')}/${p('month')}/${p('year')}`
}

/** Valor de teste por nome lógico da variável do aviso diário (uma linha, sem dado real). */
const VALORES_TESTE_RELATORIO: Readonly<Record<string, (hoje: Date) => string>> = {
  gestor: () => 'Teste',
  data: (hoje) => dataSaoPaulo(hoje),
  alertas: () => 'Mensagem de teste, sem alertas reais',
}

/**
 * Variáveis do modelo do aviso diário para o "Enviar mensagem de teste" pela API
 * oficial, quando o pedido não traz valores. Segue a `ordem` do catálogo
 * ({{1}} = ordem[0]…); nome sem valor de teste conhecido vira 'Teste'.
 */
export function variaveisDeTeste(hoje: Date): string[] {
  const m = modeloPorTipo('relatorio')
  if (!m) return []
  return m.ordem.map((nome) => (VALORES_TESTE_RELATORIO[nome] ?? (() => 'Teste'))(hoje))
}

// ---------------------------------------------------------------------------
// Regras da Meta (checagem local, antes de mandar para análise)
// ---------------------------------------------------------------------------

const VARIAVEL = /\{\{\s*([^{}]*?)\s*\}\}/g
const NOME_MODELO = /^[a-z][a-z0-9_]{0,511}$/
const ENCURTADORES = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|is\.gd|ow\.ly|rebrand\.ly)\b/i

/** Números das variáveis na ordem em que aparecem (repetições incluídas). */
export function numerosDasVariaveis(corpo: string): number[] {
  return [...corpo.matchAll(VARIAVEL)].map((m) => (/^\d+$/.test(m[1]) ? Number(m[1]) : NaN))
}

/** Quantidade de variáveis distintas ({{1}} repetido conta uma vez). */
export function quantidadeVariaveis(corpo: string): number {
  return new Set(numerosDasVariaveis(corpo)).size
}

/** Palavras fixas (sem as variáveis) — só conta o que tem letra ou número. */
export function palavrasFixas(corpo: string): number {
  return corpo.replace(VARIAVEL, ' ').split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length
}

/** Corpo com {{n}} trocado pelos valores (exemplos, por padrão) — a prévia "é assim que chega". */
export function previaModelo(m: ModeloOficial, valores: readonly string[] = m.exemplos): string {
  return m.corpo.replace(VARIAVEL, (_t, n: string) => {
    const i = Number(n) - 1
    return Number.isInteger(i) && i >= 0 && i < valores.length ? valores[i] : `{{${n}}}`
  })
}

/** Valor de variável aceito no envio: uma linha só, sem tab e sem 4+ espaços (erro 132018). */
export function valorVariavelValido(v: string): boolean {
  return v.trim().length > 0 && !/[\r\n\t]/.test(v) && !/ {4,}/.test(v)
}

/**
 * Confere as regras que a Meta usa para reprovar modelo. Devolve a lista de
 * problemas em pt-BR (vazia = ok). A função de criação recusa o item se houver
 * qualquer problema — é a última barreira antes de gastar uma análise da Meta.
 */
export function problemasDoModelo(m: ModeloOficial): string[] {
  const p: string[] = []
  if (!NOME_MODELO.test(m.nome)) p.push('Nome do modelo fora do formato (minúsculas, números e _).')
  if (m.corpo.length > LIMITE_CORPO) p.push(`Texto com mais de ${LIMITE_CORPO} caracteres.`)
  if (!m.corpo.trim()) p.push('Texto vazio.')

  const numeros = numerosDasVariaveis(m.corpo)
  if (numeros.some((n) => !Number.isInteger(n) || n < 1)) p.push('Variável fora do formato {{1}}, {{2}}…')
  // Sequência: cada número novo é o próximo (1, 2, 3…), sem pular.
  const vistos: number[] = []
  for (const n of numeros) {
    if (vistos.includes(n)) continue
    if (n !== vistos.length + 1) { p.push('Variáveis fora de sequência (devem ser {{1}}, {{2}}, {{3}}… sem pular).'); break }
    vistos.push(n)
  }
  // Chaves soltas ({ ou } fora de uma variável).
  if (/[{}]/.test(m.corpo.replace(VARIAVEL, ''))) p.push('Chaves { } soltas no texto.')

  const qtd = vistos.length
  // Início/fim: ignora espaços e pontuação nas pontas ("…: {{3}}." conta como fim).
  const semPontas = m.corpo.replace(/^[\s.,;:!?…—–-]+|[\s.,;:!?…—–-]+$/g, '')
  if (/^\{\{/.test(semPontas)) p.push('O texto não pode começar com variável.')
  if (/\}\}$/.test(semPontas)) p.push('O texto não pode terminar com variável.')
  if (/\}\}\s*\{\{/.test(m.corpo)) p.push('Duas variáveis coladas, sem texto entre elas.')
  if (qtd > 0 && palavrasFixas(m.corpo) < qtd * MIN_PALAVRAS_POR_VARIAVEL) {
    p.push(`Pouco texto para tantas variáveis (mínimo de ${MIN_PALAVRAS_POR_VARIAVEL} palavras fixas por variável).`)
  }

  if (m.exemplos.length !== qtd) p.push('A quantidade de exemplos é diferente da quantidade de variáveis.')
  if (m.ordem.length !== qtd) p.push('A ordem das variáveis não bate com o texto.')
  if (m.exemplos.some((e) => !valorVariavelValido(e))) p.push('Exemplo vazio ou com quebra de linha/tab/espaços demais.')
  if (m.exemplos.some((e) => ENCURTADORES.test(e)) || ENCURTADORES.test(m.corpo)) p.push('Link encurtado não é aceito.')
  if (previaModelo(m).length > LIMITE_CORPO) p.push(`O texto preenchido com os exemplos passa de ${LIMITE_CORPO} caracteres.`)

  if (m.categoria !== 'UTILITY') p.push('Categoria diferente de UTILITY.')
  if (m.formato !== 'POSITIONAL') p.push('Formato de variável diferente de POSITIONAL.')
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(m.idioma)) p.push('Idioma inválido.')
  if (!Number.isInteger(m.ttlSegundos) || m.ttlSegundos < 30 || m.ttlSegundos > 43_200) {
    p.push('Prazo de entrega fora de 30 s a 12 h.')
  }
  return p
}

/** Corpo do POST /v1/whatsapp/templates (sem o accountId, que o servidor completa). */
export function corpoCriacaoZernio(m: ModeloOficial) {
  return {
    name: m.nome,
    category: m.categoria,
    language: m.idioma,
    parameter_format: m.formato,
    message_send_ttl_seconds: m.ttlSegundos,
    components: [
      { type: 'body', text: m.corpo, example: { body_text: [[...m.exemplos]] } },
    ],
  }
}

// ---------------------------------------------------------------------------
// Status e motivo de recusa (o que a Zernio/Meta devolve → texto simples)
// ---------------------------------------------------------------------------

export type StatusModelo =
  | 'APPROVED' | 'PENDING' | 'REJECTED' | 'IN_APPEAL' | 'PAUSED' | 'DISABLED' | 'PENDING_DELETION'
  | 'NAO_CRIADO' | 'DESCONHECIDO'

const STATUS_CONHECIDOS: readonly StatusModelo[] = [
  'APPROVED', 'PENDING', 'REJECTED', 'IN_APPEAL', 'PAUSED', 'DISABLED', 'PENDING_DELETION',
]

export function normalizarStatus(bruto: unknown): StatusModelo {
  const s = typeof bruto === 'string' ? bruto.trim().toUpperCase() : ''
  return (STATUS_CONHECIDOS as readonly string[]).includes(s) ? (s as StatusModelo) : 'DESCONHECIDO'
}

const MOTIVOS: Record<string, string> = {
  ABUSIVE_CONTENT: 'A Meta considerou o conteúdo impróprio.',
  INCORRECT_CATEGORY: 'A Meta achou que a categoria não combina com o texto.',
  INVALID_FORMAT: 'A Meta encontrou um problema no formato (variáveis, exemplos ou tamanho).',
  PROMOTIONAL: 'A Meta achou que o texto parece propaganda.',
  SCAM: 'A Meta achou que o texto parece golpe.',
  TAG_CONTENT_MISMATCH: 'A Meta achou que o texto não combina com a categoria escolhida.',
}

/**
 * Motivo de recusa → frase curta em pt-BR. Motivo desconhecido vira texto limpo
 * (uma linha, até 300 caracteres) — nunca o corpo cru da resposta.
 */
export function traduzirMotivoRecusa(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null
  const s = bruto.trim()
  if (!s || s.toUpperCase() === 'NONE') return null
  const conhecido = MOTIVOS[s.toUpperCase()]
  if (conhecido) return conhecido
  const limpo = s.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim()
  return limpo ? `Motivo informado pela Meta: ${limpo.slice(0, 300)}` : null
}

// ---------------------------------------------------------------------------
// Ligar o modelo aos envios (wa_auto_config) — só quando é seguro
// ---------------------------------------------------------------------------

/** Status em que o nome pode ir para um campo VAZIO de wa_auto_config. */
export const STATUS_GRAVAVEIS: readonly StatusModelo[] = ['APPROVED', 'PENDING', 'IN_APPEAL']

const normalizarTexto = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Conferência do texto devolvido pela Zernio contra o catálogo:
 *   * 'igual'      — veio e é idêntico (só espaços podem variar);
 *   * 'diferente'  — veio e é outro texto (criado à mão no painel);
 *   * 'sem_texto'  — não veio: NÃO verificado (nunca conta como igual).
 */
export function conferirTexto(corpoZernio: string | null | undefined, corpoCatalogo: string): 'igual' | 'diferente' | 'sem_texto' {
  if (typeof corpoZernio !== 'string' || corpoZernio.length === 0) return 'sem_texto'
  return normalizarTexto(corpoZernio) === normalizarTexto(corpoCatalogo) ? 'igual' : 'diferente'
}

/**
 * A resposta da Zernio é mesmo do modelo pedido? Nome tem que ser igual; idioma,
 * quando vier, também. Resposta de outro modelo é descartada.
 */
export function respostaDoPedido(
  z: { nome: string; idioma: string | null } | null, nome: string, idioma: string,
): boolean {
  if (!z) return true // "não existe" não tem nome para conferir
  if (z.nome !== nome) return false
  return !z.idioma || z.idioma === idioma
}

/**
 * Grava o nome do catálogo em wa_auto_config?
 *   * já está gravado → não;
 *   * texto diferente ou não verificado em modelo APROVADO → não;
 *   * APROVADO com texto idêntico → sim (mesmo sobre um nome digitado à mão);
 *   * em análise / recurso (PENDING, IN_APPEAL) → só se o campo estiver vazio.
 */
export function deveGravarNome(
  status: StatusModelo, texto: 'igual' | 'diferente' | 'sem_texto', atual: string | null | undefined, nomeCatalogo: string,
): boolean {
  if (atual === nomeCatalogo) return false
  if (texto === 'diferente') return false
  if (status === 'APPROVED') return texto === 'igual'
  return !atual && STATUS_GRAVAVEIS.includes(status)
}
