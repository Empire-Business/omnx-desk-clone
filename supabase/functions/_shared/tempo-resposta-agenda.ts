/** Agenda é disponibilidade declarada, não prova de presença em reunião. */
import { avaliarTempoResposta } from './tempo-resposta-core.ts'

export const MAX_INTERVALOS_AGENDA = 256
const MINUTO = 60_000, DIA = 86_400_000
export interface IntervaloAgenda { start: string; end: string }
export interface SnapshotAgenda {
  status: 'connected' | 'unavailable' | 'disconnected'
  revision: number
  from: string | null
  to: string | null
  synced_at: string | null
  busy: IntervaloAgenda[]
}
export interface AgendaProjetada {
  status: 'connected' | 'not_connected' | 'unavailable' | 'incomplete' | 'disconnected'
  disconnected_at?: string | null
  from?: string | null
  to?: string | null
  synced_at?: string | null
  busy?: IntervaloAgenda[]
}
function registro(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function falha(): never { throw new Error('agenda_snapshot_invalido') }
function iso(value: unknown): number {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) falha()
  // O núcleo também rejeita datas impossíveis e offsets que Date normalizaria.
  avaliarTempoResposta({ inicio: value, fim: value })
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) falha()
  return ms
}
function intervalos(raw: unknown, from: number, to: number): IntervaloAgenda[] {
  if (!Array.isArray(raw) || raw.length > MAX_INTERVALOS_AGENDA) falha()
  return raw.map((x) => {
    if (!registro(x) || Object.keys(x).length !== 2 || !('start' in x) || !('end' in x)) falha()
    const a = iso(x.start), b = iso(x.end)
    if (a < from || b > to || b <= a) falha()
    return { start: new Date(a).toISOString(), end: new Date(b).toISOString() }
  })
}
/** Não aceita títulos, participantes, contas externas nem identidades no snapshot. */
export function validarSnapshotAgenda(raw: unknown, agora: string): SnapshotAgenda {
  if (!registro(raw) || Object.keys(raw).length !== 6 || Object.keys(raw).some((k) => !['status', 'revision', 'from', 'to', 'synced_at', 'busy'].includes(k))) falha()
  if (!['connected', 'unavailable', 'disconnected'].includes(String(raw.status)) || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0) falha()
  if (raw.status !== 'connected') {
    if (raw.from !== null || raw.to !== null || raw.synced_at !== null || !Array.isArray(raw.busy) || raw.busy.length !== 0) falha()
    return { status: raw.status as SnapshotAgenda['status'], revision: Number(raw.revision), from: null, to: null, synced_at: null, busy: [] }
  }
  const from = iso(raw.from), to = iso(raw.to), sync = iso(raw.synced_at), now = iso(agora)
  if (Number(raw.revision) < 1 || to <= from || to - from > 31 * DIA || from > sync || to < sync || from < sync - 31 * DIA || to > sync + DIA || sync > now + 30_000 || sync < now - 5 * MINUTO) falha()
  return { status: 'connected', revision: Number(raw.revision), from: new Date(from).toISOString(), to: new Date(to).toISOString(), synced_at: new Date(sync).toISOString(), busy: intervalos(raw.busy, from, to) }
}

/** Falta de cobertura não é interpretada como zero minutos de reunião. */
export function avaliarAgendaEpisodio(agenda: AgendaProjetada | undefined, inicio: string, fim: string, agora: string, aberto: boolean) {
  const base = { agenda_status: 'not_connected' as AgendaProjetada['status'], qualidade_individual: 'sem_agenda' as 'confiavel' | 'sem_agenda' | 'inconclusiva', pausas: [] as { inicio: string; fim: string }[], ocupado: false, alertas_disponiveis: true, coberto: true }
  if (!agenda || agenda.status === 'not_connected') return base
  if (agenda.status === 'disconnected') {
    // Desconectar é uma escolha explícita, não uma falha: os avisos voltam a
    // seguir a espera do cliente. Não reescrever o trecho em que havia agenda.
    let posterior = false
    try { posterior = iso(inicio) >= iso(agenda.disconnected_at) } catch { /* cobertura anterior desconhecida */ }
    return { ...base, agenda_status: 'disconnected' as const, qualidade_individual: posterior ? 'sem_agenda' as const : 'inconclusiva' as const, coberto: posterior }
  }
  const indisponivel = { ...base, agenda_status: 'unavailable' as const, qualidade_individual: 'inconclusiva' as const, coberto: false, alertas_disponiveis: false }
  if (agenda.status !== 'connected') return { ...indisponivel, agenda_status: agenda.status === 'incomplete' ? 'incomplete' as const : 'unavailable' as const }
  try {
    const from = iso(agenda.from), to = iso(agenda.to), sync = iso(agenda.synced_at), now = iso(agora)
    const start = iso(inicio), end = iso(fim)
    if (to <= from || to - from > 31 * DIA || sync > now + 30_000 || (aberto && (sync < now - 5 * MINUTO || from > now || to <= now))) return indisponivel
    const busy = intervalos(agenda.busy, from, to)
    const coberto = start >= from && end <= to
    return { ...base, agenda_status: coberto ? 'connected' as const : 'incomplete' as const, qualidade_individual: coberto ? 'confiavel' as const : 'inconclusiva' as const,
      coberto, pausas: busy.map((b) => ({ inicio: b.start, fim: b.end })),
      ocupado: aberto && busy.some((b) => Date.parse(b.start) <= now && Date.parse(b.end) > now),
    }
  } catch { return indisponivel }
}
