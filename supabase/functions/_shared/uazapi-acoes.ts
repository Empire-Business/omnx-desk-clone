// Regras de quem pode o quê na função uazapi-actions (fala direto com a UAZAPI,
// sem RLS). Lógica pura, sem rede: testada em uazapi-acoes.test.ts.
//
// Princípio: NEGA POR PADRÃO. Ação que não está numa lista abaixo é recusada;
// perfil que não está numa lista abaixo (ex.: 'cliente' do portal) é recusado.
import { baseDoChat } from './chat-restrito.ts'

/** Perfis que usam o Chat (matriz NIVEIS-DE-ACESSO: recurso `chat`). */
export const PERFIS_CHAT: readonly string[] = ['admin', 'gerente', 'estrategista', 'atendimento', 'agente_chat']

/** Ações do dia a dia de uma conversa — qualquer perfil do Chat, na instância a que tem acesso. */
export const ACOES_CONVERSA: readonly string[] = [
  'react', 'edit_message', 'delete_message', 'mark_read',
  'send_menu', 'send_contact', 'send_location',
  'manage_labels', 'archive_chat', 'pin_chat', 'mute_chat',
  'chat_details', 'find_messages', 'check_numbers',
]

/** Listam chats/etiquetas do número inteiro (inclusive grupos internos) — admin e gerente. */
export const ACOES_GESTAO: readonly string[] = ['find_chats', 'list_labels']

/** Mexem no número em si (webhook, foto, bloqueio, status) — só admin. */
export const ACOES_ADMIN: readonly string[] = [
  'block_contact', 'update_profile_image', 'get_status', 'get_webhook', 'set_webhook',
]

export const TODAS_ACOES: readonly string[] = [...ACOES_CONVERSA, ...ACOES_GESTAO, ...ACOES_ADMIN]

/** Ações que agem sobre UM chat (params.number). */
export const ACOES_COM_NUMERO: readonly string[] = [
  'react', 'mark_read', 'send_menu', 'send_contact', 'send_location',
  'manage_labels', 'archive_chat', 'pin_chat', 'mute_chat',
  'chat_details', 'find_messages', 'block_contact',
]

/** Ações que agem sobre UMA mensagem (params.message_id = id da mensagem no WhatsApp). */
export const ACOES_COM_MENSAGEM: readonly string[] = ['react', 'edit_message', 'delete_message']

export function acaoConhecida(acao: unknown): acao is string {
  return typeof acao === 'string' && TODAS_ACOES.includes(acao)
}

/** Deny by default: o perfil pode executar a ação? */
export function perfilPodeAcao(perfil: string | null | undefined, acao: unknown): boolean {
  if (!acaoConhecida(acao) || !perfil) return false
  if (ACOES_ADMIN.includes(acao)) return perfil === 'admin'
  if (ACOES_GESTAO.includes(acao)) return perfil === 'admin' || perfil === 'gerente'
  if (ACOES_CONVERSA.includes(acao)) return PERFIS_CHAT.includes(perfil)
  return false
}

/** Caracteres aceitos num número/id de chat (dígitos, letras do sufixo, @ . - + : _ espaço). */
const NUMERO_VALIDO = /^[0-9A-Za-z@.\-+:_ ]{1,100}$/
const MAX_CHECK_NUMBERS = 50

function textoNaoVazio(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

export type ResultadoValidacao = { ok: true } | { ok: false; status: number; erro: string }

/**
 * Valida os parâmetros da ação. `veRestrito` = admin/gerente (ou service_role).
 * Para quem NÃO vê grupos internos: number é obrigatório nas ações de chat
 * (find_messages sem number listaria mensagens de todos os chats, inclusive
 * internos) e message_id nas ações de mensagem.
 */
export function validarParametrosAcao(
  acao: string,
  params: Record<string, unknown>,
  veRestrito: boolean,
): ResultadoValidacao {
  if (params.number !== undefined && params.number !== null) {
    if (typeof params.number !== 'string' || (params.number.trim() !== '' && !NUMERO_VALIDO.test(params.number.trim()))) {
      return { ok: false, status: 400, erro: 'Número inválido.' }
    }
  }

  if (!veRestrito) {
    if (ACOES_COM_NUMERO.includes(acao) && !textoNaoVazio(params.number)) {
      return { ok: false, status: 400, erro: 'Informe o número da conversa.' }
    }
    if (ACOES_COM_MENSAGEM.includes(acao) && !textoNaoVazio(params.message_id)) {
      return { ok: false, status: 400, erro: 'Informe a mensagem.' }
    }
  }

  if (acao === 'check_numbers') {
    const n = params.numbers
    if (!Array.isArray(n) || n.length === 0 || n.length > MAX_CHECK_NUMBERS
      || !n.every((x) => typeof x === 'string' && NUMERO_VALIDO.test(x.trim()))) {
      return { ok: false, status: 400, erro: `Informe de 1 a ${MAX_CHECK_NUMBERS} números válidos.` }
    }
  }

  if (acao === 'update_profile_image' && !textoNaoVazio(params.image)) {
    return { ok: false, status: 400, erro: 'Informe a imagem.' }
  }

  return { ok: true }
}

/**
 * O webhook do número só pode apontar para as funções do PRÓPRIO projeto
 * (ex.: …/functions/v1/uazapi-webhook). Qualquer outro destino desviaria todas
 * as mensagens do número (sequestro).
 */
export function webhookUrlPermitida(url: unknown, supabaseUrl: string | undefined): boolean {
  if (typeof url !== 'string' || !supabaseUrl) return false
  let alvo: URL
  let base: URL
  try {
    alvo = new URL(url)
    base = new URL(supabaseUrl)
  } catch {
    return false
  }
  return alvo.protocol === 'https:'
    && alvo.username === '' && alvo.password === ''
    && alvo.host === base.host
    && alvo.pathname.startsWith('/functions/v1/')
}

/** Formas em que o mesmo chat pode estar gravado em chat_contacts.numero_whatsapp. */
export function variantesDoNumero(numero: unknown): string[] {
  if (typeof numero !== 'string') return []
  const raw = numero.trim()
  const base = baseDoChat(raw)
  if (!base) return []
  const set = new Set<string>([raw, raw.toLowerCase(), base, `${base}@g.us`])
  if (!base.includes('-')) {
    const dig = base.replace(/\D/g, '')
    if (dig) {
      set.add(dig)
      if (dig.startsWith('55') && (dig.length === 12 || dig.length === 13)) set.add(dig.slice(2))
      else if (dig.length === 10 || dig.length === 11) set.add(`55${dig}`)
    }
  }
  return [...set].filter(Boolean)
}

/** O chatid devolvido pela UAZAPI é do mesmo chat que `numero`? */
export function mesmoChat(chatid: unknown, numero: unknown): boolean {
  const limpa = (v: unknown) => (typeof v === 'string' ? v.replace(/:\d+(?=@|$)/, '') : v)
  const a = baseDoChat(limpa(chatid))
  const b = baseDoChat(limpa(numero))
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes('-') || b.includes('-')) return false
  const da = a.replace(/\D/g, '')
  const db = b.replace(/\D/g, '')
  if (!da || !db) return false
  return da === db || da === `55${db}` || db === `55${da}`
}

function chatidDe(item: unknown): unknown {
  if (!item || typeof item !== 'object') return undefined
  const m = item as Record<string, unknown>
  const key = m.key as Record<string, unknown> | undefined
  return m.chatid ?? m.chatId ?? m.wa_chatid ?? key?.remoteJid
}

/**
 * Mantém só as mensagens do chat pedido (a UAZAPI pode devolver vários chats).
 * Formato desconhecido = lista vazia (falha fechada); erro da UAZAPI passa.
 */
export function filtrarMensagensDoChat(resposta: unknown, numero: unknown): unknown {
  const doChat = (lista: unknown[]) => lista.filter((m) => mesmoChat(chatidDe(m), numero))
  if (Array.isArray(resposta)) return doChat(resposta)
  if (resposta && typeof resposta === 'object') {
    const r = resposta as Record<string, unknown>
    if (Array.isArray(r.messages)) {
      return { ...r, messages: doChat(r.messages) }
    }
    if (typeof r.error === 'string') return { error: r.error }
  }
  return { messages: [] }
}
