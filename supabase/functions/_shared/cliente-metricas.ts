// Métricas DETERMINÍSTICAS do relacionamento com um cliente (sem IA), calculadas
// a partir da linha do tempo do cliente (cliente_timeline / _shared/cliente-timeline.ts),
// que já vem com a autoria de cada mensagem (chat_messages.autor_tipo, migration
// 20261027120000). Usadas pela análise por cliente (wa-relacionamento-analisar):
// vão para cliente_relacionamento.metricas, entram no prompt como FATO e
// alimentam a regra de risco (_shared/wa-relacionamento.ts → calcularRisco).
//
// PURA: sem banco, sem rede, sem Deno — roda igual na edge function e no Vitest
// (cliente-metricas.test.ts). Não lê o conteúdo das mensagens: só data, autor,
// tipo e se a mídia tem transcrição.
//
// Quem é quem (mesma regra do gatilho update_aguardando_resposta):
//   * 'equipe' e 'ia'            → lado da EMPRESA (responde);
//   * 'sistema'                  → ignorado (não conta para nada);
//   * 'cliente', 'desconhecido', nulo (mensagem antiga sem autoria) → lado do CLIENTE.
//
// Horário comercial: segunda a sexta, 08:00–19:00 de Brasília. O Brasil não tem
// horário de verão desde 2019, então o fuso é fixo em UTC−3 (mais simples e
// rápido que Intl para milhares de mensagens).

export const HORA_MS = 3_600_000
export const DIA_MS = 24 * HORA_MS
/** Brasília (UTC−3, sem horário de verão). */
const DESLOCAMENTO_BRT_MS = -3 * HORA_MS
export const INICIO_EXPEDIENTE_H = 8
export const FIM_EXPEDIENTE_H = 19
/** Janela da linha do tempo lida para as métricas (e da 1ª análise). */
export const JANELA_METRICAS_DIAS = 90
/** Pedidos (turnos do cliente) considerados nos tempos de resposta. */
export const JANELA_RESPOSTA_DIAS = 30
/** Média mensal mínima (mensagens do cliente nos 2 meses anteriores) para medir queda. */
export const MIN_MEDIA_MENSAL_QUEDA = 10

/** O que as métricas precisam de cada linha (compatível com LinhaTimeline). */
export interface MensagemMetrica {
  criado_em: string
  autor_tipo: string | null
  tipo: string | null
  midia_texto?: string | null
}

export interface MetricasCliente {
  /** Mediana do tempo até a 1ª resposta da equipe, em minutos ÚTEIS (pedidos dos últimos 30 dias). */
  resp_equipe_mediana_min: number | null
  /** Percentil 90 do mesmo tempo. */
  resp_equipe_p90_min: number | null
  /** Pedidos (30 dias, com mais de 24h) que ficaram mais de 24h sem resposta — respondidos tarde ou nunca. */
  pedidos_sem_resposta_24h: number
  /** Dias desde a última mensagem do lado do cliente; null = nenhuma na janela (90 dias). */
  dias_desde_msg_cliente: number | null
  /** Mensagens (sem as de sistema) nos últimos 30 dias. */
  msgs_30d: number
  /** Média mensal de mensagens (sem as de sistema) nos últimos 90 dias. */
  msgs_90d_media_mensal: number
  /** Áudios na janela sem transcrição. */
  audios_sem_transcricao: number
  // ---- extras (também determinísticos) ----
  /** Mensagens do lado do cliente nos últimos 30 dias. */
  msgs_cliente_30d: number
  /**
   * Queda (0–1) das mensagens do cliente nos últimos 30 dias contra a média
   * mensal dos 60 dias anteriores. null = sem base (média anterior < MIN_MEDIA_MENSAL_QUEDA).
   * 0 quando não caiu.
   */
  queda_volume_pct: number | null
  /** Desde quando o cliente espera resposta agora (último turno dele sem resposta); null = ninguém esperando. */
  aguardando_desde: string | null
  /** Tamanho da janela usada (para quem lê saber o que "null" quer dizer). */
  janela_dias: number
}

export type Lado = 'cliente' | 'equipe' | 'ignorar'

export function ladoDaMensagem(autorTipo: string | null | undefined): Lado {
  const a = String(autorTipo ?? '').toLowerCase()
  if (a === 'equipe' || a === 'ia') return 'equipe'
  if (a === 'sistema') return 'ignorar'
  return 'cliente'
}

function tempo(iso: string | null | undefined): number {
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(t) ? NaN : t
}

/**
 * Minutos de horário comercial (seg–sex, 08–19h BRT) entre dois instantes (ms).
 * fim ≤ início → 0. Limitado a 400 dias de varredura (resposta que levou mais
 * que isso já é "nunca").
 */
export function minutosUteis(inicioMs: number, fimMs: number): number {
  if (!Number.isFinite(inicioMs) || !Number.isFinite(fimMs) || !(fimMs > inicioMs)) return 0
  const li = inicioMs + DESLOCAMENTO_BRT_MS
  const lf = fimMs + DESLOCAMENTO_BRT_MS
  let total = 0
  let dia = Math.floor(li / DIA_MS) * DIA_MS
  for (let n = 0; dia < lf && n < 400; dia += DIA_MS, n++) {
    const semana = new Date(dia).getUTCDay()
    if (semana === 0 || semana === 6) continue
    const a = Math.max(li, dia + INICIO_EXPEDIENTE_H * HORA_MS)
    const b = Math.min(lf, dia + FIM_EXPEDIENTE_H * HORA_MS)
    if (b > a) total += b - a
  }
  return total / 60_000
}

/**
 * Dias ÚTEIS (seg–sex, calendário de Brasília) entre a data `desde`
 * ("AAAA-MM-DD" ou ISO) e `agora`, sem contar o próprio dia de início.
 * Data inválida ou no futuro → 0.
 */
export function diasUteisDesde(desde: string | null | undefined, agora: Date): number {
  const s = String(desde ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 0
  const inicio = Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
  if (!Number.isFinite(inicio)) return 0
  const hojeLocal = Math.floor((agora.getTime() + DESLOCAMENTO_BRT_MS) / DIA_MS) * DIA_MS
  let n = 0
  for (let d = inicio + DIA_MS, i = 0; d <= hojeLocal && i < 800; d += DIA_MS, i++) {
    const semana = new Date(d).getUTCDay()
    if (semana !== 0 && semana !== 6) n++
  }
  return n
}

/** Percentil (0–1) por "nearest-rank" de uma lista JÁ ordenada. */
function percentil(ordenada: readonly number[], p: number): number | null {
  if (ordenada.length === 0) return null
  const idx = Math.min(ordenada.length - 1, Math.max(0, Math.ceil(p * ordenada.length) - 1))
  return ordenada[idx]
}

function mediana(ordenada: readonly number[]): number | null {
  const n = ordenada.length
  if (n === 0) return null
  return n % 2 === 1 ? ordenada[(n - 1) / 2] : (ordenada[n / 2 - 1] + ordenada[n / 2]) / 2
}

const TIPOS_AUDIO = new Set(['audio', 'ptt', 'voice'])

interface Turno { inicio: number; resposta: number | null }

/**
 * Turnos do cliente: começa na 1ª mensagem do cliente depois de uma da equipe
 * (ou do início) e termina na próxima mensagem da equipe/IA (a resposta).
 * Mensagens em ordem cronológica (a função ordena por segurança).
 */
export function turnosDoCliente(msgs: readonly MensagemMetrica[]): Turno[] {
  const ordenadas = msgs
    .map((m) => ({ t: tempo(m.criado_em), lado: ladoDaMensagem(m.autor_tipo) }))
    .filter((m) => Number.isFinite(m.t) && m.lado !== 'ignorar')
    .sort((a, b) => a.t - b.t)
  const turnos: Turno[] = []
  let aberto: number | null = null
  for (const m of ordenadas) {
    if (m.lado === 'cliente') {
      if (aberto === null) aberto = m.t
    } else if (aberto !== null) {
      turnos.push({ inicio: aberto, resposta: m.t })
      aberto = null
    }
  }
  if (aberto !== null) turnos.push({ inicio: aberto, resposta: null })
  return turnos
}

/**
 * Métricas a partir das mensagens da janela (normalmente os últimos 90 dias da
 * linha do tempo do cliente). Mensagens fora da janela (antes de agora − janela,
 * ou no futuro) são ignoradas.
 */
export function calcularMetricas(
  msgs: readonly MensagemMetrica[], agora: Date, janelaDias = JANELA_METRICAS_DIAS,
): MetricasCliente {
  const fim = agora.getTime()
  const iniJanela = fim - janelaDias * DIA_MS
  const ini30 = fim - 30 * DIA_MS
  const ini90 = fim - 90 * DIA_MS
  const naJanela = msgs.filter((m) => {
    const t = tempo(m.criado_em)
    return Number.isFinite(t) && t >= iniJanela && t <= fim
  })

  let msgs30 = 0
  let msgs90 = 0
  let cliente30 = 0
  let clienteAnterior = 0 // dias 31–90
  let ultimaCliente = NaN
  let audiosSem = 0
  for (const m of naJanela) {
    const t = tempo(m.criado_em)
    const lado = ladoDaMensagem(m.autor_tipo)
    if (TIPOS_AUDIO.has(String(m.tipo ?? '').toLowerCase()) && !String(m.midia_texto ?? '').trim()) audiosSem++
    if (lado === 'ignorar') continue
    if (t >= ini90) msgs90++
    if (t >= ini30) msgs30++
    if (lado === 'cliente') {
      if (t >= ini30) cliente30++
      else if (t >= ini90) clienteAnterior++
      if (!(t <= ultimaCliente)) ultimaCliente = t
    }
  }

  // Tempos de resposta: turnos que começaram nos últimos 30 dias.
  const turnos = turnosDoCliente(naJanela).filter((t) => t.inicio >= fim - JANELA_RESPOSTA_DIAS * DIA_MS)
  const tempos = turnos
    .filter((t) => t.resposta !== null)
    .map((t) => minutosUteis(t.inicio, t.resposta as number))
    .sort((a, b) => a - b)
  const semResposta24h = turnos.filter((t) =>
    t.inicio <= fim - DIA_MS && (t.resposta === null || t.resposta - t.inicio > DIA_MS)).length
  const ultimo = turnosDoCliente(naJanela).at(-1)
  const aguardando = ultimo && ultimo.resposta === null ? new Date(ultimo.inicio).toISOString() : null

  const mediaAnterior = clienteAnterior / 2
  const queda = mediaAnterior >= MIN_MEDIA_MENSAL_QUEDA
    ? Math.max(0, Math.round((1 - cliente30 / mediaAnterior) * 100) / 100)
    : null
  const arred = (n: number | null) => (n === null ? null : Math.round(n))

  return {
    resp_equipe_mediana_min: arred(mediana(tempos)),
    resp_equipe_p90_min: arred(percentil(tempos, 0.9)),
    pedidos_sem_resposta_24h: semResposta24h,
    dias_desde_msg_cliente: Number.isFinite(ultimaCliente) ? Math.floor((fim - ultimaCliente) / DIA_MS) : null,
    msgs_30d: msgs30,
    msgs_90d_media_mensal: Math.round((msgs90 / 3) * 10) / 10,
    audios_sem_transcricao: audiosSem,
    msgs_cliente_30d: cliente30,
    queda_volume_pct: queda,
    aguardando_desde: aguardando,
    janela_dias: janelaDias,
  }
}

/** "1h 20min", "3 dias úteis"… (texto curto para o prompt). */
export function descreverMinutosUteis(min: number | null): string {
  if (min === null || !Number.isFinite(min)) return 'sem dados'
  if (min < 60) return `${Math.round(min)} min`
  const h = min / 60
  if (h < (FIM_EXPEDIENTE_H - INICIO_EXPEDIENTE_H)) return `${Math.round(h * 10) / 10}h úteis`
  const d = h / (FIM_EXPEDIENTE_H - INICIO_EXPEDIENTE_H)
  return `${Math.round(d * 10) / 10} dias úteis`
}
