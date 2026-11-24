/**
 * Regras puras do monitor de resposta humana. Sem banco, rede, relógio implícito
 * ou IA. O chamador fornece instantes, feriados conferidos e identidade validada.
 * Uma pausa individual nunca reduz a espera comercial do cliente.
 */
export const FUSO_TEMPO_RESPOSTA = 'America/Sao_Paulo'
export const META_TEMPO_RESPOSTA_MINUTOS = 60
export const MAX_DIAS_TEMPO_RESPOSTA = 400
const MINUTO = 60_000
const DIA = 86_400_000
const INTERVALOS = [[9, 12], [13, 18]] as const

export type InstanteTempoResposta = string | number | Date
export type EtapaTempoResposta = '30' | '50' | '60'
export interface PausaTempoResposta { inicio: InstanteTempoResposta; fim: InstanteTempoResposta }

const formatoLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_TEMPO_RESPOSTA,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

function partes(ms: number): Record<string, number> {
  return Object.fromEntries(formatoLocal.formatToParts(ms)
    .filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]))
}

function dataValida(ano: number, mes: number, dia: number): boolean {
  if (ano < 1970 || ano > 2199 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
}

function instante(valor: InstanteTempoResposta): number {
  if (typeof valor === 'string') {
    // Não aceitar a interpretação do fuso da máquina nem datas que Date corrige.
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/.exec(valor)
    if (!m || !dataValida(Number(m[1]), Number(m[2]), Number(m[3])) || Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6] ?? 0) > 59) {
      throw new Error('Instante inválido: informe data e hora com fuso explícito.')
    }
    if (m[7] !== 'Z') {
      const [h, min] = m[7].slice(1).split(':').map(Number)
      if (h > 14 || min > 59 || (h === 14 && min !== 0)) throw new Error('Fuso do instante inválido.')
    }
  }
  const ms = valor instanceof Date ? valor.getTime() : typeof valor === 'number' ? valor : Date.parse(valor)
  if (!Number.isFinite(ms) || ms < Date.UTC(1970, 0, 1) || ms >= Date.UTC(2200, 0, 1)) throw new Error('Instante inválido.')
  return ms
}

function feriadosValidos(feriados: readonly string[]): ReadonlySet<string> {
  if (feriados.length > 4000) throw new Error('Calendário de feriados excede o limite seguro.')
  const result = new Set<string>()
  for (const data of feriados) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data)
    if (!m || !dataValida(Number(m[1]), Number(m[2]), Number(m[3]))) throw new Error('Data de feriado inválida.')
    result.add(data)
  }
  return result
}

/** Dia civil local representado por meia-noite UTC, somente para iterar datas. */
function diaCivil(ms: number): number {
  const p = partes(ms)
  return Date.UTC(p.year, p.month - 1, p.day)
}

function chaveDia(dia: number): string { return new Date(dia).toISOString().slice(0, 10) }

/** Converte a hora civil pelo fuso IANA, sem presumir UTC−3 para todas as datas. */
function horaLocal(dia: number, hora: number): number {
  const alvo = dia + hora * 60 * MINUTO
  let candidato = alvo
  for (let i = 0; i < 4; i++) {
    const p = partes(candidato)
    const civil = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    const ajuste = alvo - civil
    if (ajuste === 0) return candidato
    candidato += ajuste
  }
  throw new Error('Não foi possível determinar o expediente no fuso configurado.')
}

function janelas(dia: number, feriados: ReadonlySet<string>): Array<readonly [number, number]> {
  const semana = new Date(dia).getUTCDay()
  if (semana === 0 || semana === 6 || feriados.has(chaveDia(dia))) return []
  return INTERVALOS.map(([a, b]) => [horaLocal(dia, a), horaLocal(dia, b)] as const)
}

function validarPeriodo(inicio: number, fim: number): void {
  if (fim < inicio) throw new Error('O fim não pode ser anterior ao início.')
  if (diaCivil(fim) - diaCivil(inicio) >= MAX_DIAS_TEMPO_RESPOSTA * DIA) {
    throw new Error('Período excede o limite seguro de 400 dias; medição não calculada.')
  }
}

function minutosNoPeriodo(inicio: number, fim: number, feriados: ReadonlySet<string>): number {
  validarPeriodo(inicio, fim)
  let total = 0
  const ultimo = diaCivil(fim)
  for (let dia = diaCivil(inicio); dia <= ultimo; dia += DIA) {
    for (const [a, b] of janelas(dia, feriados)) {
      total += Math.max(0, Math.min(fim, b) - Math.max(inicio, a))
    }
  }
  return total / MINUTO
}

/** Seg–sex 09–12/13–18 em São Paulo, exceto as datas do calendário fornecido. */
export function minutosUteisTempoResposta(
  inicio: InstanteTempoResposta, fim: InstanteTempoResposta, feriados: readonly string[] = [],
): number {
  return minutosNoPeriodo(instante(inicio), instante(fim), feriadosValidos(feriados))
}

/** Instante exato em que se completam os minutos úteis; almoço/noite não contam. */
export function prazoTempoResposta(
  inicio: InstanteTempoResposta, minutos: number, feriados: readonly string[] = [],
): string {
  const desde = instante(inicio)
  if (!Number.isFinite(minutos) || minutos < 0 || minutos > MAX_DIAS_TEMPO_RESPOSTA * 480) {
    throw new Error('Prazo em minutos inválido ou acima do limite seguro.')
  }
  const calendario = feriadosValidos(feriados)
  if (minutos === 0) return new Date(desde).toISOString()
  let restante = minutos * MINUTO
  for (let dia = diaCivil(desde), n = 0; n < MAX_DIAS_TEMPO_RESPOSTA; dia += DIA, n++) {
    for (const [a, b] of janelas(dia, calendario)) {
      const comeco = Math.max(a, desde)
      const disponivel = Math.max(0, b - comeco)
      if (disponivel > 0 && restante <= disponivel) return new Date(comeco + restante).toISOString()
      restante -= disponivel
    }
  }
  throw new Error('Não há expediente suficiente no horizonte de 400 dias.')
}

export function estaEmExpedienteTempoResposta(agora: InstanteTempoResposta, feriados: readonly string[] = []): boolean {
  const ms = instante(agora)
  return janelas(diaCivil(ms), feriadosValidos(feriados)).some(([a, b]) => ms >= a && ms < b)
}

/** Não arredonda antes de comparar: 60 minutos exatos ainda estão dentro da meta. */
export function etapaTempoResposta(minutos: number): EtapaTempoResposta | null {
  if (!Number.isFinite(minutos) || minutos < 0) throw new Error('Tempo de resposta inválido.')
  if (minutos > META_TEMPO_RESPOSTA_MINUTOS) return '60'
  if (minutos >= 50) return '50'
  if (minutos >= 30) return '30'
  return null
}

export interface AvaliacaoTempoResposta {
  minutosCliente: number
  minutosEstrategista: number
  minutosDescontados: number
  /** Etapa da ESPERA DO CLIENTE. Pausa individual não esconde atraso do atendimento. */
  etapa: EtapaTempoResposta | null
  dentroDaMeta: boolean
  emExpediente: boolean
}

export function avaliarTempoResposta(pedido: {
  inicio: InstanteTempoResposta
  fim: InstanteTempoResposta
  feriados?: readonly string[]
  pausas?: readonly PausaTempoResposta[]
}): AvaliacaoTempoResposta {
  const inicio = instante(pedido.inicio)
  const fim = instante(pedido.fim)
  const feriados = feriadosValidos(pedido.feriados ?? [])
  const minutosCliente = minutosNoPeriodo(inicio, fim, feriados)
  if ((pedido.pausas?.length ?? 0) > 1000) throw new Error('Quantidade de pausas excede o limite seguro.')
  // Validar ANTES de cortar ao episódio: pausa invertida fora da janela também é erro.
  const pausas = (pedido.pausas ?? []).map((p) => {
    const a = instante(p.inicio); const b = instante(p.fim)
    if (b <= a) throw new Error('Pausa inválida: o término deve ser posterior ao início.')
    return [Math.max(a, inicio), Math.min(b, fim)] as [number, number]
  }).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])
  const unidas: Array<[number, number]> = []
  for (const [a, b] of pausas) {
    const ultima = unidas[unidas.length - 1]
    if (ultima && a <= ultima[1]) ultima[1] = Math.max(b, ultima[1])
    else unidas.push([a, b])
  }
  const minutosDescontados = Math.min(minutosCliente, unidas.reduce((n, [a, b]) => n + minutosNoPeriodo(a, b, feriados), 0))
  return {
    minutosCliente,
    minutosEstrategista: Math.max(0, minutosCliente - minutosDescontados),
    minutosDescontados,
    etapa: etapaTempoResposta(minutosCliente),
    dentroDaMeta: minutosCliente <= META_TEMPO_RESPOSTA_MINUTOS,
    emExpediente: janelas(diaCivil(fim), feriados).some(([a, b]) => fim >= a && fim < b),
  }
}

export interface MensagemTempoResposta {
  id: string
  conversationId: string
  criadoEm: InstanteTempoResposta
  autor: 'cliente' | 'equipe' | 'ia' | 'sistema' | 'desconhecido'
  autorId?: string | null
  /** Só true após comprovação pelo servidor; nomes parecidos não comprovam autoria. */
  autoriaConfiavel: boolean
  tipo?: string | null
  /** Falha/envio pendente não prova resposta humana efetivamente enviada. */
  statusEnvio?: 'enviando' | 'enviada' | 'entregue' | 'lida' | 'falha' | null
}

export interface EpisodioTempoResposta {
  conversationId: string
  primeiraMensagemId: string
  inicio: string
  respostaEm: string | null
  respostaMensagemId: string | null
  respostaAutorId: string | null
  medicaoConfiavel: boolean
  motivos: Array<'autoria_nao_confirmada' | 'humano_nao_identificado' | 'ordem_ambigua'>
}

const TIPOS_IGNORADOS = new Set(['sistema', 'reaction', 'reacao', 'reação'])

/** Reconstrói esperas por conversa; não cruza respostas de grupos/canais distintos. */
export function episodiosTempoResposta(mensagens: readonly MensagemTempoResposta[]): EpisodioTempoResposta[] {
  if (mensagens.length > 20_000) throw new Error('Quantidade de mensagens excede o limite seguro.')
  const vistos = new Map<string, string>()
  const linhas = mensagens.flatMap((m) => {
    if (!m.id.trim() || !m.conversationId.trim()) throw new Error('Mensagem sem identificador ou conversa.')
    const t = instante(m.criadoEm)
    const assinatura = JSON.stringify([m.conversationId, t, m.autor, m.autorId ?? null, m.autoriaConfiavel, m.tipo ?? null, m.statusEnvio ?? null])
    const anterior = vistos.get(m.id)
    if (anterior && anterior !== assinatura) throw new Error('Mensagem repetida com dados conflitantes.')
    if (anterior) return []
    vistos.set(m.id, assinatura)
    if (m.autor === 'sistema' || m.autor === 'ia' || TIPOS_IGNORADOS.has((m.tipo ?? '').toLowerCase()) || m.statusEnvio === 'falha' || m.statusEnvio === 'enviando') return []
    return [{ ...m, t }]
  }).sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
  const porInstante = new Map<string, Set<string>>()
  for (const m of linhas) {
    const chave = `${m.conversationId}\0${m.t}`
    const autores = porInstante.get(chave) ?? new Set<string>()
    autores.add(m.autor); porInstante.set(chave, autores)
  }
  const abertos = new Map<string, EpisodioTempoResposta>()
  const result: EpisodioTempoResposta[] = []
  const marcar = (e: EpisodioTempoResposta, motivo: EpisodioTempoResposta['motivos'][number]) => {
    e.medicaoConfiavel = false
    if (!e.motivos.includes(motivo)) e.motivos.push(motivo)
  }
  for (const m of linhas) {
    const confirmadoCliente = m.autor === 'cliente' && m.autoriaConfiavel
    const confirmadoHumano = m.autor === 'equipe' && m.autoriaConfiavel && !!m.autorId?.trim()
    let aberto = abertos.get(m.conversationId)
    if (!aberto && !confirmadoHumano) {
      aberto = {
        conversationId: m.conversationId, primeiraMensagemId: m.id,
        inicio: new Date(m.t).toISOString(), respostaEm: null,
        respostaMensagemId: null, respostaAutorId: null, medicaoConfiavel: true, motivos: [],
      }
      abertos.set(m.conversationId, aberto); result.push(aberto)
    }
    if (!aberto) continue
    if ((porInstante.get(`${m.conversationId}\0${m.t}`)?.size ?? 0) > 1) marcar(aberto, 'ordem_ambigua')
    if (confirmadoHumano) {
      aberto.respostaEm = new Date(m.t).toISOString()
      aberto.respostaMensagemId = m.id
      aberto.respostaAutorId = m.autorId as string
      abertos.delete(m.conversationId)
    } else if (!confirmadoCliente) {
      marcar(aberto, m.autor === 'equipe' && m.autoriaConfiavel ? 'humano_nao_identificado' : 'autoria_nao_confirmada')
    }
  }
  return result
}

function nomeSeguro(nome: string): string {
  return nome.slice(0, 300)
    // eslint-disable-next-line no-control-regex -- entrada externa não pode criar linhas/instruções de formatação
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ')
    .replace(/[<>\[\]`*_~]/g, '').replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Cliente'
}

/** Mensagem determinística; nome do cliente é dado, não instrução para modelo. */
export function formatarAlertaTempoResposta(pedido: {
  cliente: string; etapa: EtapaTempoResposta; minutosCliente: number; minutosEstrategista?: number
}): string {
  if (etapaTempoResposta(pedido.minutosCliente) !== pedido.etapa) throw new Error('Etapa incompatível com o tempo atual; reavalie o alerta.')
  const individual = pedido.minutosEstrategista
  if (individual !== undefined && (!Number.isFinite(individual) || individual < 0 || individual > pedido.minutosCliente)) throw new Error('Tempo individual inválido.')
  // Não anunciar 60 min como atraso quando o valor é 60,01; indicar "mais de".
  const minutos = Math.floor(pedido.minutosCliente)
  const tempo = pedido.etapa === '60' && minutos === 60 ? 'mais de 60' : String(minutos)
  const frase = pedido.etapa === '60'
    ? 'A meta de 60 minutos úteis foi ultrapassada.'
    : `Faltam ${Math.max(0, Math.ceil(60 - pedido.minutosCliente))} minutos úteis para a meta de 60 minutos.`
  const pausa = individual !== undefined && individual < pedido.minutosCliente
    ? ` Tempo individual descontando pausas registradas: ${Math.floor(individual)} minutos úteis.` : ''
  return `${nomeSeguro(pedido.cliente)} está aguardando resposta humana há ${tempo} minutos úteis. ${frase}${pausa} Confira a conversa.`
}
