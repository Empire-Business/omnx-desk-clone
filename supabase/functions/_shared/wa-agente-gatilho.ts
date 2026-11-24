// Quando o assistente da equipe deve responder uma mensagem do WhatsApp.
//
// Módulo PURO (sem banco, sem Deno): roda no uazapi-webhook e no Vitest.
// Quem chama já garantiu: remetente é MEMBRO da equipe, conversa é privado
// permitido ou grupo interno liberado, mensagem não é da própria instância.
// Aqui só se decide o GATILHO (plano §Comportamento):
//   * privado → sempre ('privado');
//   * grupo   → só quando chamado:
//       - 'mencao': @menção a um número do assistente (telefone OU LID — em grupo
//                   o WhatsApp manda as menções como "<n>@lid");
//       - 'quote' : resposta (citação) a uma mensagem do assistente (id conhecido
//                   OU autor citado = número/LID do assistente);
//       - 'nome'  : o nome do assistente no início ("Ana, …", "oi Ana …", "@Ana …"),
//                   como vocativo no fim ("…, Ana?") ou em qualquer posição se a
//                   mensagem for pergunta ("quantos alertas hoje Ana?");
//       - 'audio' : ÁUDIO de membro da equipe no grupo que não menciona nem cita
//                   (pode estar chamando pela voz: "Íris, quantos alertas…"). Só
//                   o wa-agente-responder decide: transcreve e segue apenas se
//                   chamouPeloNome achar o nome na transcrição; senão ignora em
//                   silêncio (gatilhoComAudio).
//
// Formato real do payload da UAZAPI (conferido em _webhook_debug, 26/10/2026,
// instância Suporte4, só estrutura — sem conteúdo):
//   body.owner                         → telefone da instância (só dígitos)
//   body.message.sender_pn             → "<telefone>@s.whatsapp.net" (remetente no grupo)
//   body.message.sender_lid / sender   → "<n>@lid" / "<n>:<aparelho>@lid"
//   body.message.quoted                → id da mensagem citada ('' quando não há)
//   body.message.content.contextInfo   → (quando content é objeto)
//       .mentionedJID: string[]        → "<n>@lid"
//       .stanzaID                      → = message.quoted
//       .participant                   → autor da citada, "<n>@lid"

import { chaveNomeAgente, validarNomeAgente } from './wa-agente-como-chamar.ts'
import { jidParaNumero, jidServidor, jidUsuario, waNumberVariants } from './wa-telefone.ts'

export { validarNomeAgente }

export type GatilhoAgente = 'privado' | 'mencao' | 'quote' | 'nome' | 'audio'

export interface EntradaGatilho {
  texto: string | null | undefined
  /** JIDs mencionados (contextInfo.mentionedJID): "<n>@lid" ou "<telefone>@s.whatsapp.net". */
  mencionados?: readonly string[] | null
  /** Id da mensagem citada (message.quoted / contextInfo.stanzaID). */
  quotedId?: string | null
  /** Autor da mensagem citada (contextInfo.participant). */
  quotedParticipante?: string | null
  ehGrupo: boolean
  nomeAgente: string | null | undefined
  /** Telefones (dígitos/JID) e LIDs ("<n>@lid") de TODOS os números do assistente neste chat. */
  numerosInstancia: readonly string[]
  /** Ids (WhatsApp) de mensagens enviadas pelo assistente neste chat. */
  idsRespostasAgente?: readonly string[] | ReadonlySet<string> | null
}

/** Limite de texto analisado (mensagem gigante não vira regex caro). */
const MAX_TEXTO = 4000

/** Saudações aceitas antes do nome ("oi Ana", "bom dia, Ana"). Já sem acento e minúsculas. */
const SAUDACOES = [
  'oi', 'oie', 'ola', 'ei', 'ey', 'hey', 'opa', 'fala', 'e ai', 'eai', 'alo', 'salve',
  'bom dia', 'boa tarde', 'boa noite', 'ola tudo bem', 'oi tudo bem',
]

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Sem acento, sem invisíveis, sem formatação do WhatsApp; mantém caixa e pontuação. */
function normalizarTexto(s: string): string {
  return s
    .slice(0, MAX_TEXTO)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[​-‏⁠-⁯﻿]/g, '')
    .replace(/[*_~`]/g, '') // formatação do WhatsApp (*Ana*, _Ana_)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Identidades comparáveis de um número/JID: variantes de telefone e o usuário do LID. */
function identidades(valor: string): string[] {
  const servidor = jidServidor(valor)
  const usuario = jidUsuario(valor)
  if (!usuario) return []
  if (servidor === 'lid') return [`lid:${usuario}`]
  if (servidor === 'g.us') return []
  const tel = jidParaNumero(valor)
  return tel ? waNumberVariants(tel).map((v) => `tel:${v}`) : []
}

function conjuntoIdentidades(valores: readonly string[]): Set<string> {
  const set = new Set<string>()
  for (const v of valores) for (const id of identidades(v)) set.add(id)
  return set
}

/** true se o JID/numero corresponde a algum número/LID do assistente. */
export function ehNumeroDoAgente(valor: string | null | undefined, numerosInstancia: readonly string[]): boolean {
  if (!valor) return false
  const meus = conjuntoIdentidades(numerosInstancia)
  return identidades(valor).some((id) => meus.has(id))
}

/** "@5511999998888" digitado no texto (sem escolher o contato) também conta como menção. */
function mencaoTextualDeTelefone(texto: string, meus: Set<string>): boolean {
  for (const m of texto.matchAll(/@\+?([0-9]{10,15})(?![0-9])/g)) {
    for (const v of waNumberVariants(m[1])) if (meus.has(`tel:${v}`)) return true
    if (meus.has(`lid:${m[1]}`)) return true
  }
  return false
}

/** O nome aparece como chamado no texto? (regras do plano: início, vocativo, pergunta). */
export function chamouPeloNome(textoBruto: string | null | undefined, nomeAgente: string | null | undefined): boolean {
  const nome = chaveNomeAgente(nomeAgente)
  // Nome curto demais acionaria por qualquer coisa ("Al", "Bo").
  if (!nome || nome.replace(/[^a-z]/g, '').length < 2) return false
  const base = normalizarTexto(String(textoBruto ?? ''))
  const texto = base.toLowerCase()
  if (!texto) return false

  const n = escaparRegex(nome).replace(/ /g, '\\s+')
  const fim = '(?![\\p{L}\\p{N}])'
  const inicio = '(?<![\\p{L}\\p{N}])'
  const saud = SAUDACOES.map((s) => escaparRegex(s).replace(/ /g, '\\s+')).join('|')

  // "@Ana" digitado (sem escolher o contato) em qualquer lugar.
  if (new RegExp(`@${n}${fim}`, 'u').test(texto)) return true

  // Saudação + nome no começo: "oi Ana", "bom dia, Ana!", "e aí Ana me ajuda".
  if (new RegExp(`^[^\\p{L}\\p{N}]*(?:${saud})[\\s,!.]+${n}${fim}`, 'u').test(texto)) return true

  // Nome no começo seguido de pontuação ou fim: "Ana, quais…", "Ana: …", "Ana?".
  if (new RegExp(`^[^\\p{L}\\p{N}]*${n}\\s*(?:[,:;!?.…-]|$)`, 'u').test(texto)) return true

  // Nome no começo seguido de palavra em minúscula ("Ana me passa…"). Palavra com
  // inicial MAIÚSCULA ("Ana Maria ligou") parece nome composto de pessoa → não aciona.
  const mInicio = new RegExp(`^[^\\p{L}\\p{N}]*${n}\\s+(\\p{L})`, 'iu').exec(base)
  if (mInicio) {
    const prox = mInicio[1]
    const ehMaiuscula = prox !== prox.toLowerCase()
    if (!ehMaiuscula) return true
  }

  // Vocativo no fim: "…, Ana?", "…, Ana!", "… obrigado, Ana 🙂".
  if (new RegExp(`,\\s*${n}${fim}[^\\p{L}\\p{N}]*$`, 'u').test(texto)) return true

  // Pergunta: o nome em qualquer posição de uma mensagem com "?".
  if (texto.includes('?') && new RegExp(`${inicio}${n}${fim}`, 'u').test(texto)) return true

  return false
}

/** Decide o gatilho. null = não responder. */
export function detectarGatilho(e: EntradaGatilho): GatilhoAgente | null {
  if (!e.ehGrupo) return 'privado'

  const meus = conjuntoIdentidades(e.numerosInstancia ?? [])
  const texto = String(e.texto ?? '')

  // 1) @menção (lista oficial do WhatsApp, por telefone ou LID).
  if (meus.size > 0) {
    for (const j of e.mencionados ?? []) {
      if (identidades(j).some((id) => meus.has(id))) return 'mencao'
    }
    if (mencaoTextualDeTelefone(texto, meus)) return 'mencao'
  }

  // 2) Resposta a uma mensagem do assistente.
  const qid = String(e.quotedId ?? '').trim()
  if (qid) {
    const ids = e.idsRespostasAgente
    const conhecido = ids
      ? (ids instanceof Set ? ids.has(qid) : (ids as readonly string[]).includes(qid))
      : false
    if (conhecido) return 'quote'
    if (e.quotedParticipante && identidades(e.quotedParticipante).some((id) => meus.has(id))) return 'quote'
  }

  // 3) Nome.
  if (chamouPeloNome(texto, e.nomeAgente)) return 'nome'

  return null
}

/** Mensagem de voz/áudio (como o Chat grava: 'audio'; 'ptt' por garantia). */
export function ehTipoAudio(tipo: string | null | undefined): boolean {
  const t = String(tipo ?? '').toLowerCase()
  return t === 'audio' || t === 'ptt'
}

/** Pode acionar o assistente? Texto com conteúdo; no GRUPO, também áudio (sem texto). */
export function tipoAcionaAgente(tipo: string | null | undefined, conteudo: string | null | undefined, ehGrupo: boolean): boolean {
  if (String(tipo ?? '') === 'texto') return !!conteudo
  return ehGrupo && ehTipoAudio(tipo)
}

/**
 * Gatilho final: o detectado (menção/citação/nome — um áudio que CITA mensagem do
 * assistente vira 'quote' normalmente) ou, para áudio no grupo de MEMBRO da equipe
 * sem menção/citação, 'audio' (o responder confere o nome na transcrição). Áudio de
 * quem não é membro (grupo "todos veem tudo") sem menção/citação → null.
 */
export function gatilhoComAudio(
  detectado: GatilhoAgente | null,
  e: { tipo: string | null | undefined; ehGrupo: boolean; remetenteMembro: boolean },
): GatilhoAgente | null {
  if (detectado) return detectado
  return e.ehGrupo && e.remetenteMembro && ehTipoAudio(e.tipo) ? 'audio' : null
}

// ---------------------------------------------------------------------------
// Extração do payload da UAZAPI (formato documentado no topo do arquivo)
// ---------------------------------------------------------------------------

export interface DadosMensagemAgente {
  /** Telefone (dígitos) de quem mandou no GRUPO (sender_pn). null fora de grupo ou sem telefone. */
  remetenteGrupo: string | null
  /** JIDs mencionados (máx. 50). */
  mencionados: string[]
  /** Id da mensagem citada, se houver. */
  quotedId: string | null
  /** Autor da mensagem citada (JID), se houver. */
  quotedParticipante: string | null
  /** Telefone (dígitos) da instância que recebeu (body.owner / message.owner). */
  owner: string | null
}

function str(v: unknown, max = 200): string | null {
  return typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Lê do payload só o que o gatilho precisa. Tolerante a campos ausentes/tipos errados. */
export function extrairDadosMensagem(body: unknown, msg: unknown): DadosMensagemAgente {
  const b = objeto(body) ?? {}
  const m = objeto(msg) ?? {}
  const content = objeto(m.content)
  const ctx = objeto(content?.contextInfo) ?? objeto(m.contextInfo)

  const mencionados: string[] = []
  const lista = ctx?.mentionedJID ?? ctx?.mentionedJid
  if (Array.isArray(lista)) {
    for (const j of lista.slice(0, 50)) {
      const s = str(j, 100)
      if (s) mencionados.push(s)
    }
  }

  const quotedId = str(m.quoted, 128) ?? str(ctx?.stanzaID, 128) ?? str(ctx?.stanzaId, 128)
  const quotedParticipante = quotedId ? (str(ctx?.participant, 100)) : null

  const ownerBruto = str(b.owner, 40) ?? str(m.owner, 40)
  const owner = ownerBruto ? jidParaNumero(ownerBruto) : null

  return {
    remetenteGrupo: jidParaNumero(str(m.sender_pn, 100)),
    mencionados,
    quotedId,
    quotedParticipante,
    owner,
  }
}

/**
 * LIDs dos números do assistente a partir da lista de participantes do grupo
 * (resposta de /group/info da UAZAPI). Tolerante ao formato: para cada
 * participante, junta todos os textos "…@lid" e "…@s.whatsapp.net" que ele tiver
 * (JID, LID, PhoneNumber…); se algum telefone for de um número do assistente,
 * os LIDs dele entram na lista.
 */
export function lidsDosNumeros(grupoInfo: unknown, telefones: readonly string[]): string[] {
  const g = objeto(grupoInfo)
  const lista = g?.Participants ?? g?.participants
  if (!Array.isArray(lista) || telefones.length === 0) return []
  const meus = new Set<string>()
  for (const t of telefones) for (const v of waNumberVariants(t)) meus.add(v)
  const saida = new Set<string>()
  for (const p of lista.slice(0, 1100)) {
    const o = objeto(p)
    if (!o) continue
    const lids: string[] = []
    let ehMeu = false
    for (const v of Object.values(o)) {
      if (typeof v !== 'string' || v.length > 100) continue
      const servidor = jidServidor(v)
      if (servidor === 'lid') {
        const u = jidUsuario(v)
        if (u) lids.push(`${u}@lid`)
      } else if (servidor === 's.whatsapp.net' || servidor === 'c.us') {
        const tel = jidParaNumero(v)
        if (tel && waNumberVariants(tel).some((x) => meus.has(x))) ehMeu = true
      }
    }
    if (ehMeu) for (const l of lids) saida.add(l)
  }
  return [...saida]
}
