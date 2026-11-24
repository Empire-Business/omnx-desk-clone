/**
 * Automações WhatsApp — regras PURAS de mensagem e envio (sem React, sem banco, sem rede).
 *
 * ⚠️ ARQUIVO ESPELHADO. Existe uma cópia idêntica em
 *    supabase/functions/_shared/wa-mensagem.ts (as edge functions rodam em Deno e
 *    não importam de src/). Os DOIS arquivos precisam ficar byte a byte iguais:
 *    o teste `waMensagem.test.ts` falha se divergirem. Edite aqui e copie:
 *      cp src/lib/waMensagem.ts supabase/functions/_shared/wa-mensagem.ts
 *    Por isso este arquivo não importa nada.
 *
 * O que vive aqui:
 *  - conversão de um modelo com placeholders ({{cliente}}) para texto pronto
 *    (UAZAPI, não oficial) ou para variáveis numeradas {{1}}, {{2}} (API oficial);
 *  - chave de idempotência (o mesmo aviso não sai duas vezes na mesma janela — F6);
 *  - validação de destino (telefone E.164 ou grupo @g.us) e do endereço da API
 *    contra a lista de domínios permitidos (proteção contra SSRF — F6).
 */

export type ProvedorWa = 'uazapi' | 'zernio'

export type TipoEnvioWa = 'relatorio_diario' | 'resumo_semanal' | 'agendamento_link' | 'teste'

const TIPOS_ENVIO: readonly TipoEnvioWa[] = ['relatorio_diario', 'resumo_semanal', 'agendamento_link', 'teste']

/** {{ nome_da_variavel }} — letras, números e _, começando por letra ou _. */
const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

export const E164 = /^\+[1-9][0-9]{9,14}$/

/** Id de grupo do WhatsApp (ex.: 120363012345678901@g.us). */
export const GRUPO_WA = /^[0-9]{10,30}(-[0-9]{6,20})?@g\.us$/

/** Domínios aceitos como endereço da API de cada provedor (o próprio domínio ou subdomínio). */
export const DOMINIOS_PERMITIDOS: Record<ProvedorWa, readonly string[]> = {
  uazapi: ['uazapi.com'],
  zernio: ['zernio.com'],
}

/** Endereço padrão de cada provedor quando a empresa não informa outro. */
export const BASE_URL_PADRAO: Record<ProvedorWa, string> = {
  // Mesmo host usado hoje por uazapi-send-message.
  uazapi: 'https://empirebusiness.uazapi.com',
  // docs.zernio.com
  zernio: 'https://zernio.com/api/v1',
}

/** Nomes das variáveis usadas no modelo, na ordem em que aparecem pela 1ª vez. */
export function variaveisDoModelo(modelo: string): string[] {
  const vistas: string[] = []
  for (const m of modelo.matchAll(PLACEHOLDER)) {
    const nome = m[1].toLowerCase()
    if (!vistas.includes(nome)) vistas.push(nome)
  }
  return vistas
}

function valorDe(valores: Record<string, string | number | null | undefined>, nome: string): string | null {
  for (const [k, v] of Object.entries(valores)) {
    if (k.toLowerCase() === nome) {
      if (v === null || v === undefined) return null
      const s = String(v).trim()
      return s.length > 0 ? s : null
    }
  }
  return null
}

function exigeValores(modelo: string, valores: Record<string, string | number | null | undefined>): string[] {
  const nomes = variaveisDoModelo(modelo)
  const faltando = nomes.filter((n) => valorDe(valores, n) === null)
  if (faltando.length > 0) {
    // Regra do PRD: toda mensagem cita o cliente. Variável vazia = não envia.
    throw new Error(`Variáveis sem valor: ${faltando.join(', ')}`)
  }
  return nomes
}

/**
 * Modelo → texto pronto (UAZAPI). Substituição em uma passada só: um valor que
 * contenha "{{x}}" (ex.: nome de cliente malicioso) NÃO é reinterpretado.
 * Lança erro se alguma variável do modelo estiver sem valor.
 */
export function renderizarTexto(
  modelo: string,
  valores: Record<string, string | number | null | undefined>,
): string {
  exigeValores(modelo, valores)
  return modelo.replace(PLACEHOLDER, (_m, nome: string) => valorDe(valores, nome.toLowerCase()) as string)
}

/**
 * A API oficial (Meta) rejeita parâmetro de template com quebra de linha, tab ou
 * mais de 4 espaços seguidos. Achata o valor numa linha só.
 */
export function limparParametroOficial(valor: string): string {
  return valor.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
}

export interface TemplateOficial {
  /** O mesmo modelo com {{cliente}} → {{1}}, {{data}} → {{2}} (repetições reusam o número). */
  modeloNumerado: string
  /** Nome de cada posição: ordem[0] é o {{1}}. */
  ordem: string[]
  /** Valores na ordem dos números, já limpos para a API oficial. */
  variaveis: string[]
}

/** Modelo → variáveis numeradas (API oficial). Lança erro se faltar valor. */
export function paraTemplateOficial(
  modelo: string,
  valores: Record<string, string | number | null | undefined>,
): TemplateOficial {
  const ordem = exigeValores(modelo, valores)
  const modeloNumerado = modelo.replace(PLACEHOLDER, (_m, nome: string) => `{{${ordem.indexOf(nome.toLowerCase()) + 1}}}`)
  const variaveis = ordem.map((n) => limparParametroOficial(valorDe(valores, n) as string))
  return { modeloNumerado, ordem, variaveis }
}

export type MensagemConvertida =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'template'; variaveis: string[]; ordem: string[] }

/** Um modelo só, convertido conforme o provedor (PRD §0.6: "convertido pelo adaptador"). */
export function converterMensagem(
  provedor: ProvedorWa,
  modelo: string,
  valores: Record<string, string | number | null | undefined>,
): MensagemConvertida {
  if (provedor === 'uazapi') return { tipo: 'texto', texto: renderizarTexto(modelo, valores) }
  const t = paraTemplateOficial(modelo, valores)
  return { tipo: 'template', variaveis: t.variaveis, ordem: t.ordem }
}

export function ehGrupo(destino: string): boolean {
  return GRUPO_WA.test(destino.trim().toLowerCase())
}

/** Destino válido = telefone E.164 (+5511999998888) ou id de grupo (…@g.us). */
export function destinoValido(destino: string): boolean {
  const d = (destino ?? '').trim()
  return E164.test(d) || ehGrupo(d)
}

/**
 * Forma que a UAZAPI espera no campo `number` de /send/text: só dígitos para
 * telefone (5511999998888) e o chatid completo para grupo (…@g.us).
 */
export function destinoUazapi(destino: string): string {
  const d = (destino ?? '').trim()
  if (ehGrupo(d)) return d.toLowerCase()
  if (!E164.test(d)) throw new Error('Destino inválido: use telefone no formato +5511999998888 ou um grupo.')
  return d.slice(1)
}

/**
 * Forma que a Zernio espera em `participantId`: só dígitos com DDI, sem "+".
 * Grupo não serve aqui: a API oficial não abre conversa de grupo pelo nosso lado
 * (só responde num conversationId já existente).
 */
export function destinoZernio(destino: string): string {
  const d = (destino ?? '').trim()
  if (ehGrupo(d)) throw new Error('A API oficial não inicia conversa com grupo. Use o código da conversa do grupo.')
  if (!E164.test(d)) throw new Error('Destino inválido: use telefone no formato +5511999998888.')
  return d.slice(1)
}

/** Código de conversa da Zernio vai no caminho da URL: aceita só caracteres seguros. */
export function conversaZernioValida(id: string | null | undefined): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test((id ?? '').trim())
}

/** Idioma do modelo aprovado (pt_BR, en, es_ES…). */
export function idiomaTemplateValido(idioma: string | null | undefined): boolean {
  return /^[a-z]{2,3}(_[A-Z]{2})?$/.test((idioma ?? '').trim())
}

/** Janela de 1 minuto em UTC: "2026-10-26T14:05". */
export function janelaMinuto(data: Date): string {
  return data.toISOString().slice(0, 16)
}

/** Janela de 1 dia no fuso da empresa: "2026-10-26". */
export function janelaDia(data: Date, fuso = 'America/Sao_Paulo'): string {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(data)
}

/**
 * Chave única por tipo + destino + janela (o banco tem UNIQUE (tenant_id, chave)).
 * O tenant não entra na chave porque já faz parte do índice.
 */
export function chaveIdempotencia(tipo: TipoEnvioWa, destino: string, janela: string): string {
  if (!TIPOS_ENVIO.includes(tipo)) throw new Error(`Tipo de envio inválido: ${String(tipo)}`)
  const j = (janela ?? '').trim()
  if (!j) throw new Error('Janela de idempotência vazia.')
  const d = (destino ?? '').trim().toLowerCase()
  const destinoNormalizado = ehGrupo(d) ? d : d.replace(/\D/g, '')
  if (!destinoNormalizado) throw new Error('Destino vazio.')
  return `${tipo}:${destinoNormalizado}:${j}`
}

/**
 * Valida o endereço da API contra a lista de domínios do provedor (SSRF).
 * Só https, sem usuário/senha, sem porta, sem query/fragmento. Devolve o endereço
 * normalizado (sem barra no fim) ou lança erro.
 */
export function validarBaseUrl(provedor: ProvedorWa, bruto: string): string {
  let url: URL
  try {
    url = new URL((bruto ?? '').trim())
  } catch {
    throw new Error('Endereço da API inválido.')
  }
  if (url.protocol !== 'https:') throw new Error('O endereço da API precisa começar com https://')
  if (url.username || url.password) throw new Error('O endereço da API não pode conter usuário ou senha.')
  if (url.port) throw new Error('O endereço da API não pode indicar porta.')
  if (url.search || url.hash) throw new Error('O endereço da API não pode ter parâmetros (? ou #).')
  const host = url.hostname.toLowerCase()
  const permitido = DOMINIOS_PERMITIDOS[provedor].some((dom) => host === dom || host.endsWith(`.${dom}`))
  if (!permitido) {
    throw new Error(`Endereço não permitido para este provedor. Use um endereço de ${DOMINIOS_PERMITIDOS[provedor].join(' ou ')}.`)
  }
  const caminho = url.pathname.replace(/\/+$/, '')
  return `https://${host}${caminho}`
}
