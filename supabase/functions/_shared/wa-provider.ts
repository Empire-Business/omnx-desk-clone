// Adaptador de envio do app Automações WhatsApp (etapa 9.2 — docs/prd.md §0.6).
//
// Uma interface só (WaProvider) com duas implementações:
//   * UAZAPI (não oficial) — mesmo contrato de uazapi-send-message:
//       POST {base}/send/text, header `token: <token da instância>`,
//       body { number, text, delay }. Telefone só dígitos; grupo = chatid "…@g.us".
//       `delay` (ms) = tempo em que o WhatsApp mostra "digitando…" antes de enviar,
//       proporcional ao tamanho (atrasoDigitacaoMs). Todo texto pela UAZAPI PRECISA
//       ter passado por _shared/wa-humanizar.ts (opcoes.humanizado) — regra do dono:
//       texto colado/fixo na não oficial leva a bloqueio do número.
//   * Zernio (oficial) — docs.zernio.com:
//       base https://zernio.com/api/v1, header `Authorization: Bearer <chave>`,
//       `Idempotency-Key` (a Zernio não deduplica sozinha), `accountId` em todo body.
//       Template: POST /inbox/conversations
//         { accountId, participantId, templateName, templateLanguage, templateParams[] }
//       Texto:    POST /inbox/conversations/{conversationId}/messages { accountId, message }
//                 (só dentro da janela de 24h ou em grupo já aberto pelo participante).
//       Modelos:  GET/POST /whatsapp/templates e GET /whatsapp/templates/{nome}
//                 (resolveZernioCliente + listarModelos/consultarModelo/criarModelo —
//                  usados só por wa-auto-templates; nunca apaga modelo).
//
// Segurança:
//   * Segredos vêm do Vault (tenant_integracoes via get_omnx_bridge_credential_tenant,
//     só service_role) — padrão de _shared/empire-bridge.ts (F3).
//   * base_url validada contra allowlist (*.uazapi.com / *.zernio.com) — SSRF (F6).
//   * Timeout + no máximo 1 retry com backoff, e só quando é seguro repetir
//     (UAZAPI /send/text: só em 429; rede/timeout/5xx → erro `incerto`, sem repetir).
//   * Token/chave NUNCA vão para log, mensagem de erro ou resposta.
//
// As regras puras (destino, conversão de modelo, idempotência, allowlist) ficam em
// ./wa-mensagem.ts, cópia idêntica de src/lib/waMensagem.ts (testada no Vitest).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  BASE_URL_PADRAO, conversaZernioValida, destinoUazapi, destinoZernio, idiomaTemplateValido,
  validarBaseUrl, type ProvedorWa,
} from './wa-mensagem.ts'
import { atrasoDigitacaoMs, type OrigemHumanizacao } from './wa-humanizar.ts'
import { tokenDoNumeroOuLegado, urlUazapi } from './uazapi-credenciais.ts'

export type { ProvedorWa }

export type CodigoErroWa =
  | 'nao_configurado'
  | 'base_url_invalida'
  | 'destino_invalido'
  | 'oficial_exige_template'
  | 'template_nao_encontrado'
  | 'template_invalido'
  | 'template_pausado'
  | 'template_ja_existe'
  | 'janela_fechada'
  | 'limite_destinatario'
  | 'nao_suportado'
  | 'recusado'
  | 'rede'

/** Erro com mensagem em pt-BR segura para mostrar ao usuário (nunca contém segredo). */
export class WaProviderError extends Error {
  /**
   * `incerto`: a mensagem PODE ter saído (timeout, conexão caída depois de enviar,
   * 5xx do provedor). Quem chama não deve reenviar sozinho — marca como incerto
   * (wa-auto-agendar pede confirmar_reenvio).
   */
  constructor(public codigo: CodigoErroWa, mensagem: string, public httpStatus?: number, public incerto = false) {
    super(mensagem)
    this.name = 'WaProviderError'
  }
}

export interface ResultadoEnvio {
  ok: true
  messageId: string | null
  /** Zernio devolve o id da conversa aberta; útil para responder depois dentro da janela. */
  conversationId?: string | null
}

export interface OpcoesEnvio {
  /** Vai no header Idempotency-Key (Zernio). Use a mesma chave gravada em wa_auto_envios. */
  chaveIdempotencia?: string
  /** Zernio: conversa já aberta (privada dentro da janela de 24h, ou grupo). */
  conversationId?: string
  /** Zernio: idioma do modelo aprovado (padrão pt_BR). */
  idioma?: string
  /**
   * UAZAPI: OBRIGATÓRIO — de onde veio o texto (humanizarTexto em wa-humanizar.ts).
   * Sem isso a UAZAPI recusa o envio (nada de texto fixo/colado na não oficial).
   */
  humanizado?: OrigemHumanizacao
  /**
   * UAZAPI: id (WhatsApp) da mensagem a citar — vira `replyid` no /send/text (a
   * resposta aparece "respondendo" a ela). Validado; inválido é ignorado.
   */
  responderA?: string
}

export interface WaProvider {
  readonly nome: ProvedorWa
  /**
   * Texto livre. UAZAPI: sempre. Zernio: SÓ com `opcoes.conversationId` (janela de
   * 24h aberta ou grupo já iniciado); sem isso lança 'oficial_exige_template'.
   */
  sendText(destino: string, texto: string, opcoes?: OpcoesEnvio): Promise<ResultadoEnvio>
  /**
   * Modelo aprovado com variáveis na ordem ({{1}}, {{2}}…). Zernio: abre/usa a
   * conversa com o telefone. UAZAPI não tem modelos: lança 'nao_suportado'
   * (use converterMensagem() + sendText).
   */
  sendTemplate(destino: string, template: string, variaveis: string[], opcoes?: OpcoesEnvio): Promise<ResultadoEnvio>
  /**
   * UAZAPI: dados do grupo (/group/info) — participantes com JID/LID/telefone.
   * null em erro. Zernio não tem (undefined).
   */
  infoGrupo?(grupoJid: string): Promise<unknown | null>
}

/** Id de mensagem do WhatsApp aceitável para citar (letras, números, ":" "_" "-"). */
export function idMensagemValido(id: string | null | undefined): boolean {
  return typeof id === 'string' && /^[A-Za-z0-9:_-]{6,128}$/.test(id)
}

// ---------------------------------------------------------------------------
// HTTP com timeout e no máximo 1 retry
// ---------------------------------------------------------------------------
const TIMEOUT_MS = 12_000
const BACKOFF_MS = 800
/** Resposta maior que isso não é lida (a Zernio/UAZAPI não devolvem nada perto disso). */
export const LIMITE_RESPOSTA_BYTES = 256 * 1024

/**
 * Lê um corpo (pedido ou resposta) como texto, parando assim que passar de
 * `limite` bytes — nunca carrega um corpo gigante inteiro na memória.
 * Devolve null quando passou do limite.
 */
export async function lerTextoLimitado(corpo: ReadableStream<Uint8Array> | null, limite: number): Promise<string | null> {
  if (!corpo) return ''
  const leitor = corpo.getReader()
  const partes: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    total += value.byteLength
    if (total > limite) {
      await leitor.cancel().catch(() => {})
      return null
    }
    partes.push(value)
  }
  const junto = new Uint8Array(total)
  let pos = 0
  for (const p of partes) { junto.set(p, pos); pos += p.byteLength }
  return new TextDecoder().decode(junto)
}

interface RespostaHttp { status: number; corpo: unknown }

function espera(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Remove qualquer ocorrência do segredo de um texto antes de logar/devolver. */
function semSegredo(texto: string, segredo: string): string {
  return segredo ? texto.split(segredo).join('***') : texto
}

/**
 * Requisição JSON (GET ou POST). Repete UMA vez, com backoff, apenas quando a
 * repetição não pode duplicar o efeito:
 *   - falha de conexão (o pedido não chegou);
 *   - 429 / 503 (o provedor recusou sem processar);
 *   - timeout, SÓ se `idempotente` (GET, ou Zernio com Idempotency-Key) — sem a
 *     chave, um timeout de POST pode ter enviado/criado e repetir duplicaria.
 * `so429`: repete APENAS em 429 (o único caso em que nada foi processado com
 * certeza). Usado no /send/text da UAZAPI, que não tem chave de idempotência: uma
 * conexão que cai ou um 503 de proxy podem acontecer DEPOIS de a mensagem sair.
 */
async function requisicaoJson(
  metodo: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  body: unknown,
  segredo: string,
  idempotente: boolean,
  timeoutMs = TIMEOUT_MS,
  so429 = false,
): Promise<RespostaHttp> {
  let ultimoErro: WaProviderError | null = null
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    if (tentativa > 0) await espera(BACKOFF_MS + Math.floor(Math.random() * 400))
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method: metodo,
        headers: metodo === 'POST' ? { 'Content-Type': 'application/json', ...headers } : headers,
        body: metodo === 'POST' ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        redirect: 'error', // redirecionamento poderia levar o token para fora da allowlist
      })
      const tamanho = Number(res.headers.get('content-length') ?? '0')
      const texto = tamanho > LIMITE_RESPOSTA_BYTES
        ? null
        : await lerTextoLimitado(res.body, LIMITE_RESPOSTA_BYTES).catch(() => '')
      if (texto === null) {
        await res.body?.cancel().catch(() => {})
        throw new WaProviderError('recusado', 'O provedor devolveu uma resposta grande demais. Nada foi lido.', res.status)
      }
      let corpo: unknown = null
      try { corpo = texto ? JSON.parse(texto) : null } catch { corpo = { bruto: semSegredo(texto.slice(0, 300), segredo) } }
      if ((res.status === 429 || (res.status === 503 && !so429)) && tentativa === 0) {
        ultimoErro = new WaProviderError('recusado', `O provedor pediu para aguardar (${res.status}).`, res.status)
        continue
      }
      return { status: res.status, corpo }
    } catch (e) {
      if (e instanceof WaProviderError) throw e // resposta grande demais: não repete
      const timeout = (e as Error)?.name === 'AbortError'
      ultimoErro = new WaProviderError('rede', timeout
        ? 'O provedor demorou demais para responder.'
        : 'Não foi possível conectar ao provedor de WhatsApp.')
      if (so429 || (timeout && !idempotente)) break
    } finally {
      clearTimeout(timer)
    }
  }
  throw ultimoErro ?? new WaProviderError('rede', 'Falha ao contatar o provedor de WhatsApp.')
}

/** POST JSON (envios). Mesma política de repetição de requisicaoJson. */
function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  segredo: string,
  idempotente: boolean,
  timeoutMs = TIMEOUT_MS,
  so429 = false,
): Promise<RespostaHttp> {
  return requisicaoJson('POST', url, headers, body, segredo, idempotente, timeoutMs, so429)
}

function campo(obj: unknown, ...caminho: string[]): unknown {
  let atual: unknown = obj
  for (const k of caminho) {
    if (!atual || typeof atual !== 'object') return undefined
    atual = (atual as Record<string, unknown>)[k]
  }
  return atual
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : typeof v === 'number' ? String(v) : null
}

/** Um modelo (template) como a Zernio devolve, já reduzido ao que usamos. */
export interface ModeloZernio {
  /** Id numérico da Meta. */
  id: string | null
  nome: string
  idioma: string
  /** Como veio (APPROVED, PENDING, REJECTED…); normalizarStatus() no catálogo. */
  status: string | null
  categoria: string | null
  /** rejected_reason (só quando REJECTED). */
  motivo: string | null
  /** quality_score: GREEN / YELLOW / RED. */
  qualidade: string | null
  /** Texto do corpo (para conferir se é igual ao do catálogo). */
  corpo: string | null
}

/** Lista de modelos em qualquer um dos formatos de envelope que a Zernio usa. */
function listaDe(corpo: unknown): unknown[] {
  if (Array.isArray(corpo)) return corpo
  for (const caminho of [['templates'], ['data'], ['data', 'templates'], ['data', 'data']]) {
    const v = campo(corpo, ...caminho)
    if (Array.isArray(v)) return v
  }
  return []
}

function modeloDe(obj: unknown): ModeloZernio | null {
  if (!obj || typeof obj !== 'object') return null
  const nome = texto(campo(obj, 'name'))
  if (!nome) return null
  const q = campo(obj, 'quality_score')
  const componentes = campo(obj, 'components')
  let corpo: string | null = null
  if (Array.isArray(componentes)) {
    const body = componentes.find((c) => String(campo(c, 'type') ?? '').toLowerCase() === 'body')
    corpo = texto(campo(body, 'text'))
  }
  return {
    id: texto(campo(obj, 'id')),
    nome,
    idioma: texto(campo(obj, 'language')) ?? '',
    status: texto(campo(obj, 'status')),
    categoria: texto(campo(obj, 'category')),
    motivo: texto(campo(obj, 'rejected_reason')) ?? texto(campo(obj, 'reason')),
    qualidade: typeof q === 'string' ? q : texto(campo(q, 'score')),
    corpo,
  }
}

// ---------------------------------------------------------------------------
// UAZAPI (não oficial)
// ---------------------------------------------------------------------------
class UazapiProvider implements WaProvider {
  readonly nome = 'uazapi' as const
  constructor(private baseUrl: string, private token: string) {}

  async sendText(destino: string, mensagem: string, opcoes?: OpcoesEnvio): Promise<ResultadoEnvio> {
    let number: string
    try { number = destinoUazapi(destino) } catch (e) { throw new WaProviderError('destino_invalido', (e as Error).message) }
    if (!mensagem.trim()) throw new WaProviderError('destino_invalido', 'Mensagem vazia.')
    if (opcoes?.humanizado !== 'ia' && opcoes?.humanizado !== 'fallback') {
      // Falha fechada: texto fixo pela não oficial é o que faz o WhatsApp bloquear o número.
      throw new WaProviderError('nao_suportado',
        'Na conexão não oficial toda mensagem precisa ser humanizada antes do envio (wa-humanizar).')
    }
    // "digitando…" proporcional ao tamanho; o pedido espera esse tempo, então o timeout cresce junto.
    const delay = atrasoDigitacaoMs(mensagem)
    // Sem `readchat`: marcar a conversa como lida esconderia mensagens não lidas da equipe no Chat.
    // Sem chave de idempotência na UAZAPI: repete só em 429; rede/timeout/5xx → incerto, sem repetir.
    let r: RespostaHttp
    try {
      r = await postJson(
        `${this.baseUrl}/send/text`, { token: this.token },
        { number, text: mensagem, delay, ...(idMensagemValido(opcoes?.responderA) ? { replyid: opcoes?.responderA } : {}) },
        this.token, false, TIMEOUT_MS + delay, true,
      )
    } catch (e) {
      if (e instanceof WaProviderError) throw new WaProviderError(e.codigo, e.message, e.httpStatus, true)
      throw e
    }
    if (r.status === 401 || r.status === 403) {
      throw new WaProviderError('recusado', 'Token da UAZAPI recusado. Confira o token salvo na aba Conexão.', r.status)
    }
    if (r.status >= 500) {
      throw new WaProviderError('rede',
        `A UAZAPI falhou ao responder (${r.status}). A mensagem pode ter saído: confira antes de reenviar.`, r.status, true)
    }
    if (r.status < 200 || r.status >= 300) {
      throw new WaProviderError('recusado', `A UAZAPI recusou o envio (${r.status}).`, r.status)
    }
    return { ok: true, messageId: texto(campo(r.corpo, 'messageid')) ?? texto(campo(r.corpo, 'key', 'id')) }
  }

  sendTemplate(): Promise<ResultadoEnvio> {
    return Promise.reject(new WaProviderError('nao_suportado',
      'A API não oficial não usa modelos: converta o modelo em texto e use sendText.'))
  }

  /** POST /group/info { groupjid } — só leitura; pode repetir. Erro → null. */
  async infoGrupo(grupoJid: string): Promise<unknown | null> {
    if (!/^[0-9]{10,30}(-[0-9]{6,20})?@g\.us$/.test(grupoJid)) return null
    try {
      const r = await postJson(`${this.baseUrl}/group/info`, { token: this.token }, { groupjid: grupoJid }, this.token, true)
      return r.status >= 200 && r.status < 300 ? r.corpo : null
    } catch {
      return null
    }
  }
}

/**
 * Provedor UAZAPI avulso (base_url validada aqui de novo — allowlist *.uazapi.com).
 * Usado por wa-auto-agendar quando a empresa está na Zernio mas o link vai no grupo
 * pela não oficial: mesmo envio, mesma humanização obrigatória, mesmo "digitando…".
 */
export function novoProvedorUazapi(baseUrl: string, token: string): WaProvider {
  let base: string
  try {
    base = validarBaseUrl('uazapi', baseUrl)
  } catch (e) {
    throw new WaProviderError('base_url_invalida', (e as Error).message)
  }
  if (!token) throw new WaProviderError('nao_configurado', 'Salve o token da UAZAPI na aba Conexão.')
  return new UazapiProvider(base, token)
}

// ---------------------------------------------------------------------------
// Zernio (oficial)
// ---------------------------------------------------------------------------
export class ZernioProvider implements WaProvider {
  readonly nome = 'zernio' as const
  private baseUrl: string

  /** base_url validada de novo aqui (allowlist *.zernio.com) — a classe é exportada (SSRF, F6). */
  constructor(baseUrl: string, private chave: string, private accountId: string) {
    try {
      this.baseUrl = validarBaseUrl('zernio', baseUrl)
    } catch (e) {
      throw new WaProviderError('base_url_invalida', (e as Error).message)
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(accountId)) {
      throw new WaProviderError('nao_configurado', 'Informe o código da conta (account ID) da Zernio na aba Conexão.')
    }
  }

  private headers(opcoes?: OpcoesEnvio): Record<string, string> {
    const h: Record<string, string> = { Authorization: `Bearer ${this.chave}` }
    if (opcoes?.chaveIdempotencia) h['Idempotency-Key'] = opcoes.chaveIdempotencia.slice(0, 255)
    return h
  }

  private erro(r: RespostaHttp): WaProviderError {
    const bruto = JSON.stringify(r.corpo ?? '')
    const codigo = String(campo(r.corpo, 'error', 'code') ?? campo(r.corpo, 'code') ?? '')
    // Código numérico só conta "inteiro" (132000 não casa dentro de 1320001 ou de um id).
    const tem = (s: string) => codigo === s || (/^\d+$/.test(s)
      ? new RegExp(`(^|[^0-9])${s}([^0-9]|$)`).test(bruto)
      : bruto.includes(s))
    if (r.status === 401 || r.status === 403) {
      return new WaProviderError('recusado', 'Chave da Zernio recusada. Confira a chave salva na aba Conexão.', r.status)
    }
    if (tem('TEMPLATE_REQUIRED')) {
      return new WaProviderError('oficial_exige_template', 'A API oficial exige um modelo aprovado para iniciar a conversa.', r.status)
    }
    if (tem('131047')) {
      return new WaProviderError('janela_fechada', 'A janela de 24h está fechada: só dá para enviar com modelo aprovado.', r.status)
    }
    if (tem('131056')) {
      return new WaProviderError('limite_destinatario', 'Muitas mensagens para o mesmo número em pouco tempo. Aguarde alguns minutos.', r.status)
    }
    // Erros da Meta ligados ao modelo (template) — mensagens simples, sem jargão.
    if (tem('132001')) {
      return new WaProviderError('template_nao_encontrado',
        'O modelo não existe na Zernio com esse nome e idioma (ou ainda não foi aprovado). Confira em "Modelos aprovados", na aba Conexão.', r.status)
    }
    if (tem('132000')) {
      return new WaProviderError('template_invalido',
        'A quantidade de informações enviadas não bate com o modelo aprovado. Confira se o modelo é o do catálogo do OMNX Desk.', r.status)
    }
    if (tem('132005')) {
      return new WaProviderError('template_invalido',
        'A mensagem preenchida ficou longa demais para o WhatsApp. Ela não foi enviada.', r.status)
    }
    if (tem('132012')) {
      return new WaProviderError('template_invalido',
        'Uma das informações da mensagem está num formato que o modelo aprovado não aceita.', r.status)
    }
    if (tem('132015')) {
      return new WaProviderError('template_pausado',
        'O WhatsApp pausou este modelo por reclamações de quem recebe. Os envios com ele ficam parados até a Meta liberar.', r.status)
    }
    if (tem('132016')) {
      return new WaProviderError('template_pausado',
        'O WhatsApp desativou este modelo. É preciso criar um modelo novo para voltar a enviar.', r.status)
    }
    if (tem('132018')) {
      return new WaProviderError('template_invalido',
        'Uma das informações tinha quebra de linha ou espaços demais, o que o WhatsApp não aceita em modelos.', r.status)
    }
    return new WaProviderError('recusado', `A Zernio recusou o envio (${r.status}).`, r.status)
  }

  // -------------------------------------------------------------------------
  // Modelos (templates) — docs/integracoes/zernio-templates.md
  // GET pode repetir (não muda nada); a criação NÃO repete em timeout.
  // -------------------------------------------------------------------------

  /** Erro de gestão de modelos → mensagem curta em pt-BR (nunca o corpo cru da Zernio/Meta). */
  private erroModelos(r: RespostaHttp, acao: 'listar' | 'consultar' | 'criar'): WaProviderError {
    const bruto = JSON.stringify(r.corpo ?? '').toLowerCase()
    if (r.status === 401 || r.status === 403) {
      return new WaProviderError('recusado',
        'A Zernio recusou a chave. Confira se a chave salva tem permissão para gerenciar modelos do WhatsApp.', r.status)
    }
    if (r.status === 429) {
      return new WaProviderError('recusado', 'A Zernio pediu para aguardar um pouco. Tente de novo em alguns minutos.', r.status)
    }
    if (acao === 'criar' && (bruto.includes('already exist') || /(^|[^0-9])238802[34]([^0-9]|$)/.test(bruto))) {
      return new WaProviderError('template_ja_existe',
        'Já existe um modelo com esse nome nesta conta. Clique em "Atualizar status" para ver como ele está.', r.status)
    }
    if (r.status === 404) {
      return new WaProviderError('nao_configurado',
        'A Zernio não encontrou a conta WhatsApp informada. Confira o código da conta (account ID) na aba Conexão.', r.status)
    }
    if (r.status === 409) {
      return new WaProviderError('recusado', 'Existe mais de um idioma com esse nome de modelo. Confira o idioma configurado.', r.status)
    }
    if (r.status === 502 || r.status >= 500) {
      return new WaProviderError('recusado',
        'A Meta recusou o pedido ou está fora do ar no momento. Tente de novo mais tarde; se continuar, confira a conta WhatsApp na Zernio.', r.status)
    }
    return new WaProviderError('recusado', acao === 'criar'
      ? `A Zernio recusou a criação do modelo (${r.status}).`
      : `A Zernio recusou a consulta dos modelos (${r.status}).`, r.status)
  }

  /** GET /whatsapp/templates?accountId&language — todos os modelos da conta naquele idioma. */
  async listarModelos(idioma: string): Promise<ModeloZernio[]> {
    if (!idiomaTemplateValido(idioma)) throw new WaProviderError('template_invalido', 'Idioma do modelo inválido (ex.: pt_BR).')
    const qs = new URLSearchParams({ accountId: this.accountId, language: idioma })
    const r = await requisicaoJson('GET', `${this.baseUrl}/whatsapp/templates?${qs}`, this.headers(), undefined, this.chave, true)
    if (r.status < 200 || r.status >= 300 || campo(r.corpo, 'success') === false) throw this.erroModelos(r, 'listar')
    const lista = listaDe(r.corpo)
    return lista.map(modeloDe).filter((m): m is ModeloZernio => m !== null)
  }

  /** GET /whatsapp/templates/{nome}?accountId&language — null quando o modelo não existe. */
  async consultarModelo(nome: string, idioma: string): Promise<ModeloZernio | null> {
    if (!/^[a-z0-9_]{1,512}$/.test(nome)) throw new WaProviderError('template_invalido', 'Nome do modelo inválido.')
    if (!idiomaTemplateValido(idioma)) throw new WaProviderError('template_invalido', 'Idioma do modelo inválido (ex.: pt_BR).')
    const qs = new URLSearchParams({ accountId: this.accountId, language: idioma })
    const r = await requisicaoJson(
      'GET', `${this.baseUrl}/whatsapp/templates/${encodeURIComponent(nome)}?${qs}`, this.headers(), undefined, this.chave, true)
    if (r.status === 404) {
      const bruto = JSON.stringify(r.corpo ?? '').toLowerCase()
      // 404 de conta (e não de modelo) é erro de configuração, não "não criado".
      if (bruto.includes('account') && !bruto.includes('template')) throw this.erroModelos(r, 'consultar')
      return null
    }
    if (r.status < 200 || r.status >= 300 || campo(r.corpo, 'success') === false) throw this.erroModelos(r, 'consultar')
    const obj = campo(r.corpo, 'template') ?? campo(r.corpo, 'data', 'template') ?? campo(r.corpo, 'data') ?? r.corpo
    return modeloDe(obj)
  }

  /**
   * POST /whatsapp/templates. `corpo` vem SEMPRE do catálogo fixo do servidor
   * (_shared/wa-modelos-oficiais.ts); o accountId é completado aqui.
   */
  async criarModelo(corpo: Record<string, unknown>): Promise<ModeloZernio> {
    const r = await requisicaoJson(
      'POST', `${this.baseUrl}/whatsapp/templates`, this.headers(), { ...corpo, accountId: this.accountId }, this.chave, false)
    if (r.status < 200 || r.status >= 300 || campo(r.corpo, 'success') === false) throw this.erroModelos(r, 'criar')
    const obj = campo(r.corpo, 'template') ?? campo(r.corpo, 'data', 'template') ?? campo(r.corpo, 'data') ?? r.corpo
    return modeloDe(obj) ?? {
      id: null, nome: String(corpo.name ?? ''), idioma: String(corpo.language ?? ''), status: 'PENDING',
      categoria: null, motivo: null, qualidade: null, corpo: null,
    }
  }

  async sendText(_destino: string, mensagem: string, opcoes?: OpcoesEnvio): Promise<ResultadoEnvio> {
    const conversa = opcoes?.conversationId?.trim()
    if (!conversa) {
      // Fora de uma conversa aberta (janela de 24h / grupo iniciado), a oficial não aceita texto livre.
      throw new WaProviderError('oficial_exige_template', 'A API oficial exige um modelo aprovado fora da janela de 24h.')
    }
    if (!conversaZernioValida(conversa)) throw new WaProviderError('destino_invalido', 'Código de conversa inválido.')
    if (!mensagem.trim()) throw new WaProviderError('destino_invalido', 'Mensagem vazia.')
    const r = await postJson(
      `${this.baseUrl}/inbox/conversations/${encodeURIComponent(conversa)}/messages`,
      this.headers(opcoes),
      { accountId: this.accountId, message: mensagem },
      this.chave,
      Boolean(opcoes?.chaveIdempotencia),
    )
    if (r.status < 200 || r.status >= 300 || campo(r.corpo, 'success') === false) throw this.erro(r)
    return {
      ok: true,
      messageId: texto(campo(r.corpo, 'data', 'messageId')),
      conversationId: texto(campo(r.corpo, 'data', 'conversationId')) ?? conversa,
    }
  }

  async sendTemplate(destino: string, template: string, variaveis: string[], opcoes?: OpcoesEnvio): Promise<ResultadoEnvio> {
    let participantId: string
    try { participantId = destinoZernio(destino) } catch (e) { throw new WaProviderError('destino_invalido', (e as Error).message) }
    const nome = (template ?? '').trim()
    if (!/^[a-z0-9_]{1,512}$/.test(nome)) {
      throw new WaProviderError('template_nao_encontrado', 'Nome do modelo inválido (use letras minúsculas, números e _).')
    }
    const idioma = (opcoes?.idioma ?? 'pt_BR').trim()
    if (!idiomaTemplateValido(idioma)) throw new WaProviderError('template_nao_encontrado', 'Idioma do modelo inválido (ex.: pt_BR).')
    const r = await postJson(
      `${this.baseUrl}/inbox/conversations`,
      this.headers(opcoes),
      {
        accountId: this.accountId,
        participantId,
        templateName: nome,
        templateLanguage: idioma,
        // Array plano na ordem das variáveis do modelo (cabeçalho, corpo, botões).
        templateParams: variaveis.map((v) => String(v)),
      },
      this.chave,
      Boolean(opcoes?.chaveIdempotencia),
    )
    if (r.status < 200 || r.status >= 300 || campo(r.corpo, 'success') === false) throw this.erro(r)
    return {
      ok: true,
      messageId: texto(campo(r.corpo, 'data', 'messageId')),
      conversationId: texto(campo(r.corpo, 'data', 'conversationId')),
    }
  }
}

// ---------------------------------------------------------------------------
// Resolução por tenant
// ---------------------------------------------------------------------------
export interface WaConfigResolvida {
  provider: WaProvider
  /** 'vault' = segredo do cofre (da empresa ou do número); 'env_instancia' = token legado UAZAPI_TOKEN_<instância> (transição). */
  fonteSegredo: 'vault' | 'env_instancia'
  /** Linha de wa_auto_config usada (sem segredos). */
  config: {
    provider: ProvedorWa
    uazapi_instance_id: string | null
    template_relatorio: string | null
    template_resumo: string | null
    template_link: string | null
    template_idioma: string
  }
}

/**
 * Lê wa_auto_config do tenant e monta o provedor com o segredo do Vault.
 * `admin` precisa ser client service_role (a RPC de decifrar é service_role-only).
 * `tenantId` é obrigatório e vem sempre do servidor, nunca do body (F2).
 */
export async function resolveWaProvider(admin: SupabaseClient, tenantId: string): Promise<WaConfigResolvida> {
  if (!tenantId) throw new WaProviderError('nao_configurado', 'Empresa não identificada.')

  const { data: cfg, error: errCfg } = await admin
    .from('wa_auto_config')
    .select('provider, uazapi_instance_id, template_relatorio, template_resumo, template_link, template_idioma')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (errCfg) throw new WaProviderError('nao_configurado', 'Não foi possível ler a configuração do WhatsApp.')
  if (!cfg) throw new WaProviderError('nao_configurado', 'Configure a aba Conexão antes de enviar.')
  const config = cfg as WaConfigResolvida['config']
  const nome: ProvedorWa = config.provider === 'zernio' ? 'zernio' : 'uazapi'

  const { segredo, baseUrl } = await credencialDoCofre(admin, tenantId, nome)

  if (nome === 'uazapi') {
    if (segredo) return { provider: new UazapiProvider(baseUrl, segredo), fonteSegredo: 'vault', config }
    // Transição: instância já conectada no Chat tem o token em env (como uazapi-send-message).
    // A instância é conferida de novo contra o tenant (o trigger já confere na gravação).
    const inst = config.uazapi_instance_id
    if (inst && /^[A-Za-z0-9_-]{1,128}$/.test(inst)) {
      const { data: wi } = await admin
        .from('whatsapp_instances')
        .select('instance_id')
        .eq('instance_id', inst)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      const doNumero = wi ? await tokenDoNumeroOuLegado(admin, inst, tenantId) : null
      if (doNumero) return { provider: new UazapiProvider(baseUrl, doNumero.token), fonteSegredo: fonteDe(doNumero.fonte), config }
    }
    throw new WaProviderError('nao_configurado', 'Salve o token da UAZAPI na aba Conexão (ou escolha um número já conectado no Chat).')
  }

  // Zernio
  return { provider: await montarZernio(admin, tenantId, segredo, baseUrl), fonteSegredo: 'vault', config }
}

/**
 * Provedor UAZAPI para envio em GRUPO, qualquer que seja o provedor da empresa.
 * A API oficial (Zernio) não abre conversa de grupo pelo nosso lado; então grupo sai
 * sempre pela não oficial — mesma decisão do link de reunião em wa-auto-agendar:
 *   * empresa em 'uazapi': o mesmo resolveWaProvider de sempre;
 *   * empresa em 'zernio': token UAZAPI do Vault ou, na transição, o token em env da
 *     instância configurada (conferida contra o tenant), pelo MESMO adaptador
 *     (allowlist da base_url, timeout, humanização obrigatória, sem segredo em log).
 * `tenantId` vem do servidor (F2).
 */
export async function resolveUazapiParaGrupos(
  admin: SupabaseClient, tenantId: string,
): Promise<{ provider: WaProvider; fonteSegredo: WaConfigResolvida['fonteSegredo']; viaOficial: boolean }> {
  if (!tenantId) throw new WaProviderError('nao_configurado', 'Empresa não identificada.')
  const { data: cfg, error } = await admin
    .from('wa_auto_config')
    .select('provider, uazapi_instance_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw new WaProviderError('nao_configurado', 'Não foi possível ler a configuração do WhatsApp.')
  if (!cfg) throw new WaProviderError('nao_configurado', 'Configure a aba Conexão antes de enviar.')
  const c = cfg as { provider: string | null; uazapi_instance_id: string | null }
  if (c.provider !== 'zernio') {
    const r = await resolveWaProvider(admin, tenantId)
    if (r.provider.nome !== 'uazapi') throw new WaProviderError('nao_configurado', 'Conexão não oficial indisponível.')
    return { provider: r.provider, fonteSegredo: r.fonteSegredo, viaOficial: false }
  }

  const { segredo, baseUrl } = await credencialDoCofre(admin, tenantId, 'uazapi')
  if (segredo) return { provider: new UazapiProvider(baseUrl, segredo), fonteSegredo: 'vault', viaOficial: true }
  const inst = c.uazapi_instance_id
  if (inst && /^[A-Za-z0-9_-]{1,128}$/.test(inst)) {
    const { data: wi } = await admin
      .from('whatsapp_instances')
      .select('instance_id')
      .eq('instance_id', inst)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    const doNumero = wi ? await tokenDoNumeroOuLegado(admin, inst, tenantId) : null
    if (doNumero) return { provider: new UazapiProvider(baseUrl, doNumero.token), fonteSegredo: fonteDe(doNumero.fonte), viaOficial: true }
  }
  throw new WaProviderError('nao_configurado',
    'O grupo recebe pela conexão não oficial (UAZAPI). Salve o token da UAZAPI na aba Conexão ou use um número já conectado no Chat.')
}

/**
 * Provedor UAZAPI de UM número específico (whatsapp_instances.id), conferido contra
 * o tenant. Usado pelo assistente da equipe (número principal e reservas do grupo).
 * Token: o do cofre quando é o número configurado em wa_auto_config; senão o token
 * em env UAZAPI_TOKEN_<instance_id> (cada número tem o seu). `tenantId` vem do servidor.
 * Devolve também o status da instância (para pular número desconectado).
 */
export async function resolveUazapiDaInstancia(
  admin: SupabaseClient, tenantId: string, instanciaUuid: string,
): Promise<{ provider: WaProvider; fonteSegredo: WaConfigResolvida['fonteSegredo']; instanceId: string; status: string | null; numero: string | null }> {
  if (!tenantId || !instanciaUuid) throw new WaProviderError('nao_configurado', 'Número não identificado.')
  const { data: wi, error } = await admin
    .from('whatsapp_instances')
    .select('id, instance_id, status, numero_whatsapp')
    .eq('tenant_id', tenantId)
    .eq('id', instanciaUuid)
    .maybeSingle()
  if (error || !wi) throw new WaProviderError('nao_configurado', 'Número não encontrado nesta empresa.')
  const w = wi as { instance_id: string; status: string | null; numero_whatsapp: string | null }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(w.instance_id ?? '')) throw new WaProviderError('nao_configurado', 'Número inválido.')
  const { data: cfg } = await admin.from('wa_auto_config').select('uazapi_instance_id').eq('tenant_id', tenantId).maybeSingle()
  const { segredo, baseUrl } = await credencialDoCofre(admin, tenantId, 'uazapi')
  const ehPrincipal = (cfg as { uazapi_instance_id?: string | null } | null)?.uazapi_instance_id === w.instance_id
  const base = { instanceId: w.instance_id, status: w.status, numero: w.numero_whatsapp }
  if (ehPrincipal && segredo) return { provider: new UazapiProvider(baseUrl, segredo), fonteSegredo: 'vault', ...base }
  const doNumero = await tokenDoNumeroOuLegado(admin, w.instance_id, tenantId)
  if (doNumero) return { provider: new UazapiProvider(baseUrl, doNumero.token), fonteSegredo: fonteDe(doNumero.fonte), ...base }
  throw new WaProviderError('nao_configurado', 'Este número não tem token configurado.')
}

/** Token do número no cofre conta como 'vault'; o segredo legado, como 'env_instancia'. */
function fonteDe(f: 'cofre_numero' | 'env_instancia'): WaConfigResolvida['fonteSegredo'] {
  return f === 'cofre_numero' ? 'vault' : 'env_instancia'
}

/** Segredo do cofre (mesma RPC da ponte Empire, filtrando por tenant + provider) + base URL validada. */
async function credencialDoCofre(
  admin: SupabaseClient, tenantId: string, nome: ProvedorWa,
): Promise<{ segredo: string | null; baseUrl: string }> {
  let segredo: string | null = null
  let baseUrlSalva: string | null = null
  const { data: cred, error: errCred } = await admin.rpc('get_omnx_bridge_credential_tenant', {
    p_tenant_id: tenantId,
    p_provider: nome,
  })
  if (!errCred && Array.isArray(cred) && cred.length > 0) {
    const row = cred[0] as { secret?: string; base_url?: string | null }
    if (row?.secret) segredo = row.secret
    baseUrlSalva = row?.base_url ?? null
  }
  try {
    const padrao = nome === 'uazapi' ? await urlUazapi(admin, tenantId) : BASE_URL_PADRAO[nome]
    const baseUrl = validarBaseUrl(nome, baseUrlSalva && baseUrlSalva.length > 0 ? baseUrlSalva : padrao)
    return { segredo, baseUrl }
  } catch (e) {
    throw new WaProviderError('base_url_invalida', (e as Error).message)
  }
}

async function montarZernio(
  admin: SupabaseClient, tenantId: string, segredo: string | null, baseUrl: string,
): Promise<ZernioProvider> {
  if (!segredo) throw new WaProviderError('nao_configurado', 'Salve a chave da Zernio na aba Conexão.')
  const { data: meta } = await admin
    .from('tenant_integracoes')
    .select('metadata')
    .eq('tenant_id', tenantId)
    .eq('provider', 'zernio')
    .maybeSingle()
  const accountId = String((meta?.metadata as Record<string, unknown> | null)?.account_id ?? '')
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(accountId)) {
    throw new WaProviderError('nao_configurado', 'Informe o código da conta (account ID) da Zernio na aba Conexão.')
  }
  return new ZernioProvider(baseUrl, segredo, accountId)
}

/**
 * Cliente da Zernio do tenant (chave do Vault + accountId), MESMO que o provedor
 * ativo ainda seja a UAZAPI — o admin prepara os modelos antes de trocar.
 * Usado só pela gestão de modelos (wa-auto-templates). `tenantId` vem do servidor (F2).
 */
export async function resolveZernioCliente(admin: SupabaseClient, tenantId: string): Promise<ZernioProvider> {
  if (!tenantId) throw new WaProviderError('nao_configurado', 'Empresa não identificada.')
  const { segredo, baseUrl } = await credencialDoCofre(admin, tenantId, 'zernio')
  return montarZernio(admin, tenantId, segredo, baseUrl)
}

// ---------------------------------------------------------------------------
// Disjuntor: muitas falhas seguidas → para de tentar por um tempo
// ---------------------------------------------------------------------------
const DISJUNTOR_FALHAS = 5
const DISJUNTOR_JANELA_MIN = 15
/** Códigos gravados em wa_auto_envios.erro quando NADA foi enviado ao provedor. */
export const ERROS_SEM_ENVIO = ['sem_assunto', 'falha_ia'] as const

/**
 * Aberto quando os últimos 5 envios do tenant por este provedor, nos últimos
 * 15 minutos, falharam todos. Protege o número (UAZAPI pode ser bloqueada) e
 * evita martelar um provedor fora do ar.
 */
export async function disjuntorAberto(admin: SupabaseClient, tenantId: string, provedor: ProvedorWa): Promise<boolean> {
  const desde = new Date(Date.now() - DISJUNTOR_JANELA_MIN * 60_000).toISOString()
  const { data, error } = await admin
    .from('wa_auto_envios')
    .select('status')
    .eq('tenant_id', tenantId)
    .eq('provider', provedor)
    .in('status', ['enviado', 'falhou'])
    // Linhas 'falhou' sem tentativa de envio (resumo sem assunto / IA fora) não são
    // falha do provedor e não podem abrir o disjuntor.
    .or(`erro.is.null,erro.not.in.(${ERROS_SEM_ENVIO.join(',')})`)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(DISJUNTOR_FALHAS)
  if (error || !data) return false
  return data.length >= DISJUNTOR_FALHAS && data.every((r) => (r as { status: string }).status === 'falhou')
}
