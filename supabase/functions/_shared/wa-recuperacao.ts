// Recuperação de mensagens que a UAZAPI recebeu mas NÃO chegaram ao Chat
// (webhook fora do ar / número desconectado do sistema). Usado por
// uazapi-recuperar-mensagens e pelo modo recuperação do uazapi-webhook.
//
// Módulo PURO (sem banco, sem Deno): roda no Vitest.
//
// A recuperação geral usa janela operacional de 7 dias (POST /message/find, mais recentes
// primeiro) e lista os chats por última mensagem (POST /chat/find). A mensagem
// de /message/find tem o MESMO formato da que chega no webhook (body.message),
// então a recuperação reenvia cada uma, faltante, ao uazapi-webhook no modo
// recuperação: grava com o horário original e não dispara nada (push, Íris,
// robô, CSAT).

/** Janela padrão operacional; não afirma retenção universal do provedor. */
export const JANELA_MAX_MS = 7 * 24 * 3_600_000

/** Chats que nunca entram: Status e canais (newsletter). */
export function chatIgnorado(chatid: string): boolean {
  return !chatid || chatid === 'status@broadcast' || chatid.endsWith('@newsletter') || chatid.endsWith('@broadcast')
}

/** Timestamp da UAZAPI em ms (aceita segundos por garantia). NaN se inválido. */
export function tsEmMs(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (typeof v === 'number' ? v : NaN)
  if (!Number.isFinite(n) || n <= 0) return NaN
  return n < 1e12 ? n * 1000 : n
}

export interface Periodo { desde: number; ate: number }

/**
 * Valida o período pedido: desde < ate, ate ≤ agora (+1 min de folga), janela
 * ≤ 7 dias e desde dentro dos últimos 7 dias. Devolve o erro em código.
 */
export function validarPeriodo(desdeTxt: unknown, ateTxt: unknown, agora: number, direcionado = false): Periodo | { erro: string } {
  const desde = typeof desdeTxt === 'string' ? Date.parse(desdeTxt) : NaN
  const ate = ateTxt === undefined || ateTxt === null ? agora : (typeof ateTxt === 'string' ? Date.parse(ateTxt) : NaN)
  if (!Number.isFinite(desde) || !Number.isFinite(ate)) return { erro: 'periodo_invalido' }
  if (desde >= ate) return { erro: 'periodo_invertido' }
  if (ate > agora + 60_000) return { erro: 'periodo_no_futuro' }
  if (agora - desde > (direcionado ? 366 * 24 * 3_600_000 : JANELA_MAX_MS)) return { erro: direcionado ? 'alem_de_366_dias' : 'alem_de_7_dias' }
  return { desde, ate }
}

export interface ChatUazapi { wa_chatid?: unknown; wa_lastMsgTimestamp?: unknown; wa_isGroup?: unknown; [k: string]: unknown }

/**
 * Chats (já ordenados do mais recente para o mais antigo) com última mensagem a
 * partir de `desde`. `fim` = true quando a página já chegou antes de `desde`
 * (não precisa buscar a próxima).
 */
export function chatsDoPeriodo(chats: readonly ChatUazapi[], desde: number): { chats: ChatUazapi[]; fim: boolean } {
  const out: ChatUazapi[] = []
  let fim = false
  for (const c of chats) {
    const ts = tsEmMs(c.wa_lastMsgTimestamp)
    if (Number.isFinite(ts) && ts < desde) { fim = true; continue }
    const id = typeof c.wa_chatid === 'string' ? c.wa_chatid : ''
    if (chatIgnorado(id)) continue
    out.push(c)
  }
  return { chats: out, fim }
}

export interface MensagemUazapi { messageid?: unknown; messageTimestamp?: unknown; wasSentByApi?: unknown; messageType?: unknown; [k: string]: unknown }

/**
 * Mensagens de uma página (mais recentes primeiro) dentro do período. `fim` =
 * true quando a página já passou de `desde` (não precisa da próxima).
 */
export function mensagensDoPeriodo(msgs: readonly MensagemUazapi[], p: Periodo): { msgs: MensagemUazapi[]; fim: boolean } {
  const out: MensagemUazapi[] = []
  let fim = false
  for (const m of msgs) {
    const ts = tsEmMs(m.messageTimestamp)
    if (!Number.isFinite(ts)) continue
    if (ts < p.desde) { fim = true; continue }
    if (ts > p.ate) continue
    if (typeof m.messageid !== 'string' || !m.messageid) continue
    // Enviada pelo próprio sistema: já foi gravada por uazapi-send-message (o webhook também pula).
    if (m.wasSentByApi === true) continue
    out.push(m)
  }
  return { msgs: out, fim }
}

/** Ids que ainda não estão no Chat, em ordem cronológica (mais antiga primeiro). */
export function faltantes(msgs: readonly MensagemUazapi[], jaNoChat: ReadonlySet<string>): MensagemUazapi[] {
  const vistos = new Set<string>()
  const out: MensagemUazapi[] = []
  for (const m of msgs) {
    const id = m.messageid as string
    if (jaNoChat.has(id) || vistos.has(id)) continue
    vistos.add(id)
    out.push(m)
  }
  return out.sort((a, b) => tsEmMs(a.messageTimestamp) - tsEmMs(b.messageTimestamp))
}

/**
 * Corpo igual ao do webhook da UAZAPI. O `id` completo ("<dono>:<messageid>") é
 * o que /message/download espera; se vier só o interno, monta a partir do dono.
 */
export function corpoParaWebhook(
  m: MensagemUazapi, chat: ChatUazapi | null, instanceId: string, ownerPadrao: string | null,
): Record<string, unknown> {
  const owner = typeof m.owner === 'string' && m.owner ? m.owner : ownerPadrao
  const id = typeof m.id === 'string' && m.id.includes(':') ? m.id : (owner ? `${owner}:${m.messageid}` : m.id)
  return {
    EventType: 'messages',
    instanceName: instanceId,
    owner,
    message: { ...m, id },
    ...(chat ? { chat } : {}),
  }
}

/** Tipos só de texto (não baixam arquivo). */
const TIPOS_TEXTO = new Set(['Conversation', 'ExtendedTextMessage', 'ReactionMessage'])

/**
 * Ordem de reenvio: textos primeiro, depois o resto (mídia baixa arquivo e pode
 * demorar/falhar) — cada grupo em ordem cronológica. A ordem fora do horário não
 * atrapalha: o webhook grava o horário original e reconcilia o "aguardando".
 */
export function ordemDeReenvio(msgs: readonly MensagemUazapi[]): MensagemUazapi[] {
  const ehTexto = (m: MensagemUazapi) => typeof m.messageType === 'string' && TIPOS_TEXTO.has(m.messageType)
  const porHora = (a: MensagemUazapi, b: MensagemUazapi) => tsEmMs(a.messageTimestamp) - tsEmMs(b.messageTimestamp)
  return [...msgs.filter(ehTexto).sort(porHora), ...msgs.filter((m) => !ehTexto(m)).sort(porHora)]
}

/** Contagem por tipo (só para o relatório — nunca conteúdo). */
export function contarPorTipo(msgs: readonly MensagemUazapi[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of msgs) {
    const t = typeof m.messageType === 'string' && m.messageType ? m.messageType.slice(0, 40) : 'desconhecido'
    out[t] = (out[t] ?? 0) + 1
  }
  return out
}

export interface UltimaMensagem { autor_tipo: string | null; autor_origem: string | null; criado_em: string; conteudo?: string | null; tipo?: string | null }

/**
 * Estado de "aguardando resposta" a partir das mensagens mais recentes da
 * conversa (mais nova primeiro), com a mesma regra do trigger
 * update_aguardando_resposta. Uma mensagem recuperada é ANTIGA: o trigger a trata
 * como a última e pode acender/apagar errado; o webhook reconcilia com isto.
 * null = nenhuma mensagem decide (não mexe).
 */
export function estadoAguardando(recentes: readonly UltimaMensagem[]): { aguardando: boolean } | null {
  if (confirmacaoAposResposta(recentes)) return { aguardando: false }
  for (const m of recentes) {
    const t = m.autor_tipo
    if (t === 'cliente' || t === 'desconhecido') return { aguardando: true }
    if ((t === 'equipe' || t === 'ia') && !String(m.autor_origem ?? '').startsWith('heuristica')) return { aguardando: false }
  }
  return null
}


/**
 * "ok", "tá ótimo", "ok, pode postar", "perfeito, obrigada": resposta curta que só
 * confirma o que a equipe disse e não deixa nada para responder. Lista fechada:
 * uma única palavra fora dela (pedido, dúvida, "não", "sim", "preciso") ou um "?"
 * e a mensagem continua valendo como pedido.
 */
const PALAVRAS_RECONHECIMENTO = new Set([
  'ok', 'okay', 'oks', 'okk', 'blz', 'beleza', 'certo', 'certinho', 'combinado', 'fechado', 'show', 'top',
  'perfeito', 'perfeita', 'otimo', 'otima', 'excelente', 'entendi', 'entendido', 'ciente', 'obrigado', 'obrigada',
  'obg', 'valeu', 'vlw', 'aprovado', 'aprovada', 'gostei', 'amei', 'adorei', 'joia', 'massa',
])
/** Só completam a frase; sozinhas não são reconhecimento. */
const PALAVRAS_DE_APOIO = new Set(['muito', 'mto', 'ta', 'tudo', 'bem', 'bom', 'demais', 'de', 'bola', 'pode', 'postar', 'publicar', 'subir', 'seguir', 'e'])

function reconhecimentoCurto(texto: string): boolean {
  if (/[?¿]/.test(texto)) return false
  const limpo = texto
    .normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/(?:👍|🙏|👌|👏|✅|❤\uFE0F?)[\u{1F3FB}-\u{1F3FF}]?/gu, ' ')
    .replace(/[^a-z\s]/g, ' ')
  const palavras = limpo.split(/\s+/).filter(Boolean)
  if (palavras.length === 0 || palavras.length > 5) return false
  if (!palavras.every(p => PALAVRAS_RECONHECIMENTO.has(p) || PALAVRAS_DE_APOIO.has(p))) return false
  const aprovacao = palavras.includes('pode') && palavras.some(p => ['postar', 'publicar', 'subir', 'seguir'].includes(p))
  return aprovacao || palavras.some(p => PALAVRAS_RECONHECIMENTO.has(p))
}

/** Reconhecimento exato; texto + emoji, perguntas e pedidos nunca entram. */
export function confirmacaoSimples(mensagem: Pick<UltimaMensagem, 'conteudo' | 'tipo' | 'autor_tipo'>): boolean {
  if (mensagem.autor_tipo !== 'cliente' || mensagem.tipo !== 'texto') return false
  const texto = String(mensagem.conteudo ?? '').replace(/^\[[^\]\n]{1,80}\] /, '').trim()
  if (!texto) return false
  if (/^(?:muito )?obrigad[oa][!.]{0,3}$/iu.test(texto) || /^valeu[!.]{0,3}$/iu.test(texto)) return true
  if (reconhecimentoCurto(texto)) return true
  // Lista positiva de confirmação. Não inclui dúvida, reprovação, "?" ou texto.
  return /^(?:(?:👍|🙏|👌|👏)[🏻🏼🏽🏾🏿]?|✅|❤\uFE0F?)(?:\s*(?:(?:👍|🙏|👌|👏)[🏻🏼🏽🏾🏿]?|✅|❤\uFE0F?)){0,2}$/u.test(texto)
}

/**
 * Recentes em ordem decrescente e do MESMO canal/tenant. Só desarma o alerta
 * quando confirmações puras seguem uma resposta comprovada da equipe em24h.
 * Informação ausente, pedido no meio, autoria incerta ou contexto curto: mantém.
 */
export function confirmacaoAposResposta(recentes: readonly UltimaMensagem[]): boolean {
  const relevantes = recentes.filter(m => m.autor_tipo !== 'sistema' && m.tipo !== 'nota_interna')
  const ultima = relevantes[0]
  if (!ultima || !confirmacaoSimples(ultima)) return false
  const fim = Date.parse(ultima.criado_em)
  if (!Number.isFinite(fim)) return false
  for (let i = 1; i < relevantes.length; i++) {
    const m = relevantes[i]
    const quando = Date.parse(m.criado_em)
    if (!Number.isFinite(quando) || quando >= fim || fim - quando > 24 * 3_600_000) return false
    if (confirmacaoSimples(m)) continue
    return m.autor_tipo === 'equipe' && ['webhook', 'plataforma', 'backfill'].includes(m.autor_origem ?? '')
  }
  return false
}
