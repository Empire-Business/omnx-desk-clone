/**
 * Tempo de espera, atraso e "pedem ação" de um ticket — o que a tela precisa
 * para mostrar o cronômetro que esquenta (DS · hero de demonstração).
 *
 * Regras (só apresentação; nada aqui grava no banco):
 *
 * - O relógio **esquenta** só quando a vez é da equipe numa conversa do
 *   WhatsApp (status "Aguardando equipe" ou "Reaberto"): neutro até 15 min,
 *   âmbar de 15 a 59 min, vermelho a partir de 60 min.
 * - Ticket criado à mão não tem conversa para medir: a idade aparece, mas
 *   sempre neutra (senão quase todo ticket antigo ficaria vermelho).
 * - **Atrasado** = não resolvido e (prazo vencido OU relógio vermelho).
 * - **Pede ação** = não resolvido e (a vez é da equipe OU está atrasado).
 *
 * Tudo é função pura: quem precisa da hora recebe `agora`.
 */
import { filaDoStatus, type StatusTicket } from './ticketStatus'

export const MINUTOS_ATENCAO = 15
export const MINUTOS_CRITICO = 60

/** 1 = neutro · 2 = âmbar · 3 = vermelho (mesmos níveis do DS: `data-l`). */
export type FaixaEspera = 1 | 2 | 3

/** Minutos inteiros desde `iso`; `null` se a data não for válida. Nunca negativo. */
export function minutosDesde(iso: string | null | undefined, agora: Date): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((agora.getTime() - t) / 60_000))
}

/** O relógio corre contra a equipe? Só com conversa do WhatsApp esperando resposta. */
export function esperaCronometrada(status: StatusTicket): boolean {
  return status === 'aguardando_equipe' || status === 'reaberto'
}

/** Faixa de calor do tempo de espera. Resolvido não tem relógio (`null`). */
export function faixaDeEspera(status: StatusTicket, minutos: number | null): FaixaEspera | null {
  if (status === 'resolvido') return null
  if (!esperaCronometrada(status) || minutos === null) return 1
  if (minutos < MINUTOS_ATENCAO) return 1
  if (minutos < MINUTOS_CRITICO) return 2
  return 3
}

/** "agora", "9 min", "2 h 14 min", "3 d 4 h". */
export function textoDuracao(minutos: number): string {
  const m = Math.max(0, Math.floor(minutos))
  if (m < 1) return 'agora'
  if (m < 60) return `${m} min`
  if (m < 1440) {
    const h = Math.floor(m / 60)
    const r = m % 60
    return r ? `${h} h ${r} min` : `${h} h`
  }
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return h ? `${d} d ${h} h` : `${d} d`
}

/** Cronômetro "00:12:41" (as horas passam de 24 sem virar dia). */
export function textoCronometro(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${dois(Math.floor(s / 3600))}:${dois(Math.floor(s / 60) % 60)}:${dois(s % 60)}`
}

/** Separador de dia da conversa: "Hoje", "Ontem" ou "06/11". */
export function rotuloDoDia(iso: string, agora: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((dia(agora) - dia(d)) / 86_400_000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** O prazo (data sem hora, "AAAA-MM-DD") já passou? Vencer hoje não é atraso. */
export function prazoVencido(prazo: string | null | undefined, agora: Date): boolean {
  if (!prazo) return false
  const data = new Date(`${prazo}T00:00:00`)
  if (Number.isNaN(data.getTime())) return false
  const hoje = new Date(agora)
  hoje.setHours(0, 0, 0, 0)
  return data < hoje
}

export function ticketAtrasado(e: { status: StatusTicket; prazo?: string | null; minutos: number | null }, agora: Date): boolean {
  if (e.status === 'resolvido') return false
  return prazoVencido(e.prazo, agora) || faixaDeEspera(e.status, e.minutos) === 3
}

export function ticketPedeAcao(e: { status: StatusTicket; atrasado: boolean }): boolean {
  if (e.status === 'resolvido') return false
  return filaDoStatus(e.status) === 'equipe' || e.atrasado
}

/** "10 tickets · 4 pedem ação", "1 ticket · nenhum pede ação". */
export function resumoDaFila(itens: ReadonlyArray<{ pedeAcao: boolean; atrasado: boolean }>): {
  total: number
  pedemAcao: number
  temAtraso: boolean
  texto: string
  textoAcao: string
} {
  const total = itens.length
  const pedem = itens.filter((i) => i.pedeAcao)
  const textoTotal = `${total} ${total === 1 ? 'ticket' : 'tickets'}`
  const textoAcao = pedem.length === 0
    ? 'nenhum pede ação'
    : `${pedem.length} ${pedem.length === 1 ? 'pede' : 'pedem'} ação`
  return {
    total,
    pedemAcao: pedem.length,
    temAtraso: pedem.some((i) => i.atrasado),
    texto: `${textoTotal} · ${textoAcao}`,
    textoAcao,
  }
}

// ─── Selo de status (tons do DS) ─────────────────────────────────────────────

export type TomSeloTicket = 'aberto' | 'andamento' | 'aguardando' | 'resolvido' | 'ia' | 'reaberto' | 'atrasado'

const TOM_POR_STATUS: Record<StatusTicket, TomSeloTicket> = {
  aguardando_equipe: 'aberto',
  aguardando_cliente: 'aguardando',
  resolvido: 'resolvido',
  reaberto: 'reaberto',
  aberto: 'aberto',
  em_andamento: 'andamento',
}

/**
 * Tom do selo. Atraso só troca o selo quando a vez é da equipe (como no DS:
 * "Aguardando cliente" com prazo vencido continua dizendo de quem é a vez).
 */
export function tomDoSelo(status: StatusTicket, opcoes: { pelaIris?: boolean; atrasado?: boolean } = {}): TomSeloTicket {
  if (status === 'resolvido') return opcoes.pelaIris ? 'ia' : 'resolvido'
  if (opcoes.atrasado && filaDoStatus(status) === 'equipe') return 'atrasado'
  return TOM_POR_STATUS[status]
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

/** "Studio Bem-Estar" → "SB"; "Ana" → "AN"; vazio → "?". */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/[\s\-–—]+/).filter((p) => /[\p{L}\p{N}]/u.test(p))
  if (partes.length === 0) return '?'
  const letra = (p: string) => (p.match(/[\p{L}\p{N}]/u)?.[0] ?? '').toUpperCase()
  if (partes.length === 1) return partes[0].replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?'
  return letra(partes[0]) + letra(partes[1])
}

/** Tom estável do avatar (0–5) a partir de um id ou nome. */
export function tomDoAvatar(chave: string | null | undefined): number {
  const s = chave ?? ''
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 6
}

// ─── Resumo da ficha ─────────────────────────────────────────────────────────

export interface PontoDoResumo {
  tom: 'ok' | 'alerta'
  texto: string
}

/**
 * Os pontos que a faixa "Resumo da Íris" lista na ficha: fatos do ticket, em
 * frases curtas, com o que pede cuidado marcado como alerta.
 */
export function pontosDoResumo(e: {
  status: StatusTicket
  responsavel: string | null | undefined
  temResponsavel: boolean
  prazoVencido: boolean
  venceHoje: boolean
  envioFalhou: boolean
  atrasado: boolean
}): PontoDoResumo[] {
  const pontos: PontoDoResumo[] = []
  if (e.envioFalhou) pontos.push({ tom: 'alerta', texto: 'Mensagem da equipe não enviada' })
  if (e.status === 'aguardando_equipe') {
    pontos.push({ tom: 'alerta', texto: e.atrasado ? 'Cliente esperando há 1 h ou mais' : 'Cliente esperando a equipe' })
  } else if (e.status === 'aguardando_cliente') {
    pontos.push({ tom: 'ok', texto: 'A equipe já respondeu' })
  } else if (e.status === 'reaberto') {
    pontos.push({ tom: 'alerta', texto: 'Reaberto depois de resolvido' })
  } else if (e.status === 'resolvido') {
    pontos.push({ tom: 'ok', texto: 'Pedido resolvido' })
  }
  if (e.status !== 'resolvido') {
    if (e.prazoVencido) pontos.push({ tom: 'alerta', texto: 'Prazo vencido' })
    else if (e.venceHoje) pontos.push({ tom: 'alerta', texto: 'Vence hoje' })
    pontos.push(e.temResponsavel
      ? { tom: 'ok', texto: `Responsável: ${e.responsavel?.trim() || 'pessoa da equipe'}` }
      : { tom: 'alerta', texto: 'Sem responsável' })
  }
  return pontos
}
