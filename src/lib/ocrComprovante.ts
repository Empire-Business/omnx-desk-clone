/**
 * Leitura do comprovante de pagamento direto no navegador (tesseract.js).
 *
 * Objetivo: descobrir o "identificador de pagamento" — o nome do titular como ele
 * aparece no extrato bancário da empresa, que é quem PAGOU (o pagador/origem), não
 * quem recebeu.
 *
 * Nada disso sai da máquina do usuário: o OCR roda no próprio navegador, sem chave
 * de API e sem serviço externo. Em compensação é um palpite — cada banco monta o
 * comprovante do seu jeito. Por isso o resultado sempre volta com um nível de
 * confiança e o campo continua editável na tela.
 */

import { createWorker, type Worker } from 'tesseract.js'

export interface LeituraComprovante {
  /** Nome encontrado, já normalizado. null quando nada plausível apareceu. */
  identificador: string | null
  /** alta = achou depois de um rótulo de pagador; media = rótulo genérico; baixa = chute. */
  confianca: 'alta' | 'media' | 'baixa'
  /** Texto completo lido — útil pra depurar quando o palpite sai errado. */
  texto: string
}

const VAZIO: LeituraComprovante = { identificador: null, confianca: 'baixa', texto: '' }

// Um worker só, reaproveitado: o tesseract baixa ~15 MB de modelo na primeira vez
// e guarda em cache. Recriar a cada arquivo jogaria esse custo fora.
let workerPromise: Promise<Worker> | null = null

/**
 * Todos os arquivos vêm do nosso próprio domínio (`public/tesseract/`, preparado
 * por `scripts/prepare-tesseract-assets.mjs`). O padrão do tesseract.js seria
 * baixá-los de um CDN de terceiros durante a execução — isto é, rodar código de
 * fora dentro da página que manipula comprovante bancário e CPF. Não fazemos isso.
 */
const OPCOES_OCR = {
  workerPath: '/tesseract/worker.min.js',
  corePath: '/tesseract',
  langPath: '/tesseract/lang',
} as const

// oem 1 = LSTM only, que é o motor moderno e o único cujas variantes servimos.
const OEM_LSTM = 1

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('por', OEM_LSTM, OPCOES_OCR).catch((e) => {
      workerPromise = null // deixa a próxima tentativa começar do zero
      throw e
    })
  }
  return workerPromise
}

/** Libera o worker (e os ~15 MB de modelo) quando a tela que usa OCR sai de cena. */
export async function encerrarOcr(): Promise<void> {
  const p = workerPromise
  workerPromise = null
  if (!p) return
  try { await (await p).terminate() } catch { /* já morreu, tudo bem */ }
}

/** O tesseract lê imagem; PDF e HEIC ele não abre. */
export function comprovanteEhLegivel(file: File): boolean {
  return arquivoEhLegivel(file.name, file.type)
}

/** Mesma checagem, para comprovantes já salvos (onde só temos nome e mime). */
export function arquivoEhLegivel(nome: string, mime?: string | null): boolean {
  const tipo = (mime || '').toLowerCase()
  if (tipo.startsWith('image/')) return !/heic|heif/.test(tipo)
  // Alguns prints chegam com type vazio — cai pra extensão do nome.
  return /\.(jpe?g|png|webp|bmp|gif)$/i.test(nome ?? '')
}

/**
 * Tempo máximo por comprovante. Sem este limite, um print muito grande podia
 * segurar o lote **para sempre**: a leitura em massa mostrava "lendo X de Y" e
 * nunca passava do X. Era o "travamento" relatado em 06/08/2026 — o processo não
 * tinha caído, estava preso num arquivo só.
 */
const LIMITE_MS = 25_000

/**
 * Largura máxima antes do OCR.
 *
 * Quase todo comprovante aqui é print de celular ou de tela cheia: 2.000 a 4.000
 * pixels de largura. O tesseract trabalha sobre cada pixel, então o custo cresce
 * com a área — reduzir para 1.600 px corta o tempo em várias vezes **e costuma
 * melhorar o acerto**, porque texto gigante e antisserrilhado confunde mais que
 * ajuda. Abaixo disso a imagem não é tocada.
 */
const LARGURA_MAX = 1600

/**
 * Reduz a imagem antes do OCR. Se qualquer coisa der errado (canvas indisponível,
 * imagem que não carrega), devolve a fonte original — preferimos uma leitura
 * lenta a nenhuma leitura.
 */
async function reduzir(fonte: File | Blob | string): Promise<File | Blob | string> {
  try {
    if (typeof document === 'undefined') return fonte
    const url = typeof fonte === 'string' ? fonte : URL.createObjectURL(fonte)
    try {
      const img = await new Promise<HTMLImageElement>((ok, falha) => {
        const el = new Image()
        el.crossOrigin = 'anonymous'
        el.onload = () => ok(el)
        el.onerror = () => falha(new Error('imagem não carregou'))
        el.src = url
      })
      if (img.naturalWidth <= LARGURA_MAX) return fonte

      const escala = LARGURA_MAX / img.naturalWidth
      const canvas = document.createElement('canvas')
      canvas.width = LARGURA_MAX
      canvas.height = Math.round(img.naturalHeight * escala)
      const ctx = canvas.getContext('2d')
      if (!ctx) return fonte
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'))
      return blob ?? fonte
    } finally {
      if (typeof fonte !== 'string') URL.revokeObjectURL(url)
    }
  } catch {
    return fonte
  }
}

/**
 * Roda o OCR e devolve o palpite do identificador. Nunca lança: erro vira leitura
 * vazia — quem chama trata "não achei" e "deu erro" da mesma forma, porque para o
 * usuário o efeito é o mesmo (campo continua vazio e editável).
 *
 * Em caso de estouro do tempo, o worker é **encerrado**: um worker que ficou
 * preso num arquivo não volta ao normal sozinho, e reaproveitá-lo contaminaria
 * todos os comprovantes seguintes do lote.
 */
export async function lerComprovante(fonte: File | Blob | string): Promise<LeituraComprovante> {
  try {
    const worker = await getWorker()
    const entrada = await reduzir(fonte)

    let estourou = false
    const relogio = new Promise<never>((_, falha) => {
      setTimeout(() => { estourou = true; falha(new Error('tempo esgotado')) }, LIMITE_MS)
    })

    try {
      const { data } = await Promise.race([worker.recognize(entrada), relogio])
      const texto = data?.text ?? ''
      return { ...extrairIdentificador(texto), texto }
    } catch (e) {
      if (estourou) await encerrarOcr()
      throw e
    }
  } catch {
    return { ...VAZIO }
  }
}

// ─── Heurística de extração ────────────────────────────────────────────────────
//
// A ideia é simples: o comprovante é dividido em blocos ("quem pagou" / "quem
// recebeu"). Percorremos linha a linha guardando em que bloco estamos e só
// aceitamos um nome quando ele está no bloco de quem pagou.

/**
 * Marca o início do bloco de quem pagou — é daqui que sai o nome do extrato.
 * O `(.*)` no fim captura o que vier depois do rótulo na mesma linha, porque em
 * alguns bancos o nome está colado nele ("De: Maria Souza").
 */
const SECAO_PAGADOR =
  /^(?:dados d[eo] )?(?:cliente )?(?:pagador|quem pagou|pagamento de|origem|remetente|debitado (?:de|em)|conta de d[ée]bito|de)\b\s*[:\-]?\s*(.*)$/i

/** Marca o início do bloco de quem recebeu — nomes daqui são a nossa empresa, não servem. */
const SECAO_RECEBEDOR =
  /^(?:dados d[eo] )?(?:favorecid\w*|benefici[áa]ri\w*|recebedor|quem recebeu|destinat[áa]ri\w*|destino|cr[ée]dito em|para)\b\s*[:\-]?\s*(.*)$/i

/** Linha do tipo "Nome: Fulano" ou só "Nome" com o valor na linha de baixo. */
const ROTULO_NOME = /^(nome( completo)?|titular|nome do titular|raz[ãa]o social)\s*[:\-]?\s*(.*)$/i

/**
 * Palavras que denunciam que a linha é rótulo/banco/valor, e não o nome de alguém.
 * Sem isso o OCR entrega coisas como "Banco Inter S.A." ou "Instituição".
 *
 * A lista cresceu depois da primeira leitura em massa dos comprovantes reais: boa
 * parte deles não é print de PIX, e sim print de checkout, e-mail de boas-vindas ou
 * tela de plataforma. De lá saíram "Central de Atendimento Santander", "Stone Psa",
 * "Rocket Serviços Financeiros" e "Bem-vindo Ao Acelerador de" como se fossem nomes.
 */
const NAO_E_NOME = new RegExp(
  [
    // Rótulos e vocabulário de comprovante
    'banco', 'institui', 'ag[êe]ncia', 'conta', 'cpf', 'cnpj', 'valor', 'data', 'hor[áa]rio',
    'comprovante', 'transfer[êe]ncia', 'transacao', 'transa[çc][ãa]o', 'pix', 'ted', 'doc',
    'autentica', 'protocolo', 'identificador', 'chave', 'tipo', 'descri[çc][ãa]o',
    'pagamento', 'recibo', 'boleto', 'saldo', 'extrato', 'r\\$', 'ltda', 'compartilhe',
    'proof of payment', 'payment', 'receipt',
    // Bancos, adquirentes e plataformas de pagamento/curso
    'santander', 'ita[úu]', 'bradesco', 'caixa', 'nubank', 'inter', 'sicoob', 'sicredi',
    'picpay', 'stone', 'pagseguro', 'pagbank', 'mercado ?pago', 'cielo', 'getnet', 'rede',
    'safra', 'btg', 'c6', 'original', 'neon', 'will bank', 'asaas', 'iugu', 'pagar\\.?me',
    'hotmart', 'kiwify', 'eduzz', 'monetizze', 'braip', 'ticto', 'perfect ?pay', 'stripe',
    'servi[çc]os financeiros', 'central de atendimento', 'atendimento',
    // Frases de página/e-mail que aparecem em print de checkout
    'bem-?vindo', 'bienvenid', 'welcome', 'acess[ao]', 'acceder', 'puedes', 'produto',
    'obrigad', 'parab[ée]ns', 'aprovad', 'confirmad', 'sucesso', 'clique', 'acesse',
  ].join('|'),
  'i',
)

/**
 * "Rio de Janeiro - RJ", "São Paulo/SP": endereço, não titular. Aparecia porque o
 * comprovante trazia o endereço da empresa e a linha passava como nome.
 */
const PARECE_CIDADE_UF = /[-–/]\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s*$/i

/** Só letras (com acento), espaços, apóstrofo, ponto e hífen — 2 palavras ou mais. */
const PARECE_NOME = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.\-]*(?:\s+[A-Za-zÀ-ÿ'.\-]+)+$/

function limpar(linha: string): string {
  return linha.replace(/\s+/g, ' ').trim()
}

/** Título-caso simples: "JOÃO DA SILVA" e "joão da silva" viram "João da Silva". */
function normalizarNome(bruto: string): string {
  const minusculas = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])
  return limpar(bruto)
    .replace(/[.,;:]+$/, '')
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1)))
    .join(' ')
}

function ehNomePlausivel(valor: string): boolean {
  const v = limpar(valor)
  if (v.length < 5 || v.length > 60) return false
  if (NAO_E_NOME.test(v)) return false
  if (PARECE_CIDADE_UF.test(v)) return false
  if (/\d/.test(v)) return false
  // Sobra de OCR no fim da linha ("Anuel Costa Teles Aua É"). Uma letra solta no
  // meio é inicial legítima ("Victor Claudio V Lacorte") e continua valendo.
  if (/\s[A-Za-zÀ-ÿ]$/.test(v)) return false
  return PARECE_NOME.test(v)
}

/**
 * Varre o texto do comprovante e devolve o melhor palpite de nome do pagador.
 * Exportada separadamente pra poder ser testada sem rodar o OCR.
 */
export function extrairIdentificador(texto: string): Omit<LeituraComprovante, 'texto'> {
  const linhas = (texto ?? '').split(/\r?\n/).map(limpar).filter(Boolean)

  // Melhor candidato de cada categoria, em ordem de preferência.
  //
  // Não existe mais a categoria "primeiro nome plausível do texto". Na primeira
  // leitura em massa ela respondeu pela maioria dos erros: em print de checkout ou
  // e-mail de boas-vindas, o primeiro trecho parecido com nome é a cidade, o banco
  // ou uma frase de marketing. Sem rótulo, agora devolvemos nada — campo vazio é
  // honesto, campo errado engana quem confere o extrato.
  let comRotuloNoPagador: string | null = null // "Pagador" → ... → "Nome: X"   (alta)
  let soNoPagador: string | null = null        // "Pagador" → ... → "X"          (alta)
  let comRotuloSolto: string | null = null     // "Nome: X" sem seção definida   (media)

  type Secao = 'pagador' | 'recebedor' | 'nenhuma'
  let secao: Secao = 'nenhuma'

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]

    // Troca de seção. O recebedor é testado primeiro porque "crédito em conta de
    // origem" e afins podem casar nos dois — e errar pro lado do recebedor só
    // descarta um candidato, enquanto errar pro lado do pagador grava o nome errado.
    const recebedor = linha.match(SECAO_RECEBEDOR)
    const pagador = recebedor ? null : linha.match(SECAO_PAGADOR)
    if (recebedor || pagador) {
      secao = recebedor ? 'recebedor' : 'pagador'
      // Bancos que põem o nome na mesma linha do rótulo ("De: Maria Souza").
      const inline = (recebedor ?? pagador)![1] ?? ''
      if (secao === 'pagador' && ehNomePlausivel(inline)) soNoPagador ??= inline
      // A linha do rótulo em si nunca é candidata a nome — sem esse `continue`,
      // "CLIENTE PAGADOR" do Banco do Brasil seria lido como o nome do pagador.
      continue
    }

    const rotulo = linha.match(ROTULO_NOME)
    if (rotulo) {
      // Valor na mesma linha ("Nome: Fulano") ou na linha seguinte.
      const candidato = ehNomePlausivel(rotulo[3]) ? rotulo[3] : (linhas[i + 1] ?? '')
      if (ehNomePlausivel(candidato)) {
        if (secao === 'pagador') comRotuloNoPagador ??= candidato
        else if (secao === 'nenhuma') comRotuloSolto ??= candidato
      }
      continue
    }

    // Linha que é só um nome: só vale se estivermos dentro do bloco de quem pagou.
    if (secao === 'pagador' && ehNomePlausivel(linha)) soNoPagador ??= linha
  }

  const escolhido = comRotuloNoPagador ?? soNoPagador ?? comRotuloSolto
  if (!escolhido) return { identificador: null, confianca: 'baixa' }

  const confianca: LeituraComprovante['confianca'] =
    comRotuloNoPagador || soNoPagador ? 'alta' : 'media'

  return { identificador: normalizarNome(escolhido), confianca }
}
