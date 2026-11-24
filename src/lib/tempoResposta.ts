export type ModoTempoResposta = 'desligado' | 'observacao' | 'alertas'
export type EtapaTempoResposta = '30' | '50' | '60'
export interface ConfigTempoResposta {
  modo: ModoTempoResposta
  feriados: string[]
  anos_confirmados: number[]
  revisao: number
  monitorando_desde: string | null
}
export interface PessoaTempoResposta { id: string; nome: string }
export interface EpisodioTempoResposta {
  id: string; client_id: string | null; cliente: string; conversation_id: string
  inicio: string; resposta_em: string | null; respondente: string | null
  respondente_id?: string | null
  responsavel_id: string | null; responsavel: string | null
  qualidade: 'confiavel' | 'inconclusiva'; motivo: string | null
  estado: 'aberto' | 'respondido' | 'cancelado'
  minutos_cliente: number | null; minutos_estrategista: number | null; minutos_descontados: number | null
  etapa: EtapaTempoResposta | null; pausado: boolean
  agenda_status?: 'not_connected' | 'connected' | 'unavailable' | 'incomplete' | 'disconnected'
  qualidade_individual?: 'confiavel' | 'sem_agenda' | 'inconclusiva'
  agenda_alertas_disponiveis?: boolean
  segmentos: Array<{ user_id: string; nome: string; inicio: string; fim: string | null }>
  historico_alertas: Array<{ id: string; etapa: EtapaTempoResposta; status: string; created_at: string; texto?: string | null }>
}
export interface TitularTempoResposta {
  client_id: string; cliente: string; titular_id: string | null; candidatos: PessoaTempoResposta[]
}
export interface PausaTempoResposta {
  id: string; user_id: string; nome: string; inicio: string; fim: string; motivo: string
}
export interface PainelTempoResposta {
  ok: true; actor_id: string; tenant_id: string; agora: string
  config: ConfigTempoResposta; episodios: EpisodioTempoResposta[]; proximo_cursor: string | null
  estrategistas: PessoaTempoResposta[]; titulares: TitularTempoResposta[]; pausas: PausaTempoResposta[]; avisos: string[]
}
export interface EscopoTempoResposta { actorId: string; tenantId: string }
export type AcaoTempoResposta =
  | { acao: 'salvar_config'; revisao: number; modo: ModoTempoResposta; feriados: string[]; anos_confirmados: number[] }
  | { acao: 'pausa'; user_id: string; duracao_minutos: number; motivo: string }
  | { acao: 'encerrar_pausa'; pausa_id: string }
  | { acao: 'titular'; client_id: string; user_id: string | null }

export const MODOS_TEMPO_RESPOSTA: Record<ModoTempoResposta, { titulo: string; descricao: string }> = {
  desligado: { titulo: 'Desligado', descricao: 'Não acompanha novas esperas nem envia avisos.' },
  observacao: { titulo: 'Observar', descricao: 'Registra os tempos para conferência, sem enviar avisos.' },
  alertas: { titulo: 'Observar e avisar', descricao: 'Envia avisos privados para as pessoas também habilitadas no GT3.' },
}

function dataReal(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  const d = new Date(`${data}T12:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === data
}

/** Um feriado por linha. Sem busca externa nem calendário legal presumido. */
export function lerFeriadosTempoResposta(texto: string): string[] {
  if (texto.length > 20_000) throw new Error('A lista de feriados é muito extensa.')
  const datas = texto.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  if (datas.length > 150) throw new Error('Informe até 150 datas de feriado.')
  for (const data of datas) if (!dataReal(data)) throw new Error(`Confira a data “${data.slice(0, 25)}”. Use AAAA-MM-DD, uma data válida por linha.`)
  return [...new Set(datas)].sort()
}

export function anoTempoResposta(agora: string): number {
  const d = new Date(agora)
  if (!Number.isFinite(d.getTime())) throw new Error('Não foi possível conferir a data do painel.')
  return Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(d))
}

export function validarConfigTempoResposta(config: ConfigTempoResposta, agora: string): string | null {
  if (config.anos_confirmados.length > 5) return 'Mantenha até cinco anos confirmados. Desmarque os anos antigos antes de salvar.'
  if (config.modo !== 'desligado' && !config.anos_confirmados.includes(anoTempoResposta(agora))) {
    return 'Confira os feriados e confirme o calendário deste ano antes de começar a observar ou enviar avisos.'
  }
  return null
}

export function minutosTempoResposta(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor) || valor < 0) return 'Medição pendente'
  if (valor > 60 && valor < 61) return 'Mais de 60 min'
  return `${Math.floor(valor)} min`
}

export function dataTempoResposta(valor: string | null): string {
  if (!valor || !Number.isFinite(Date.parse(valor))) return 'Não informado'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor))
}

export function situacaoTempoResposta(e: EpisodioTempoResposta): { texto: string; tom: 'neutro' | 'atencao' | 'atraso' | 'ok' } {
  if (e.estado === 'cancelado') return { texto: 'Encerrado sem medição', tom: 'neutro' }
  if (e.qualidade !== 'confiavel' || e.minutos_cliente === null) return { texto: 'Medição pendente', tom: 'neutro' }
  if (e.estado === 'respondido') return e.minutos_cliente !== null && e.minutos_cliente > 60
    ? { texto: 'Respondido após a meta', tom: 'atraso' } : { texto: 'Respondido', tom: 'ok' }
  if (e.minutos_cliente !== null && e.minutos_cliente > 60) return { texto: 'Prazo ultrapassado', tom: 'atraso' }
  if (e.etapa === '50') return { texto: 'Perto do prazo', tom: 'atencao' }
  return { texto: 'Aguardando resposta', tom: e.etapa === '30' ? 'atencao' : 'neutro' }
}

export interface FiltroTempoResposta { busca: string; estado: string; estrategista: string }
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
export function filtrarEpisodiosTempoResposta(episodios: readonly EpisodioTempoResposta[], filtro: FiltroTempoResposta): EpisodioTempoResposta[] {
  const busca = normalizar(filtro.busca.trim())
  return episodios.filter((e) => {
    if (busca && !normalizar(`${e.cliente} ${e.responsavel ?? ''}`).includes(busca)) return false
    if (filtro.estrategista && e.responsavel_id !== filtro.estrategista && !e.segmentos.some((s) => s.user_id === filtro.estrategista)) return false
    if (filtro.estado === 'pendente') return e.qualidade === 'inconclusiva' || e.minutos_cliente === null
    if (filtro.estado === 'atrasado') return e.estado === 'aberto' && e.qualidade === 'confiavel' && e.minutos_cliente !== null && e.minutos_cliente > 60
    if (filtro.estado === 'perto') return e.estado === 'aberto' && e.qualidade === 'confiavel' && e.etapa === '50'
    return !filtro.estado || e.estado === filtro.estado
  })
}

export interface ResultadoTitularTempoResposta {
  responsavelId: string | null
  responsavel: string
  respostas: number
  respostasProprias: number
  coberturas: number
  autoriaPendente: number
  percentualNaMeta: number
  medianaCliente: number
  medianaIndividual: number | null
}

/** Agregados só da amostra fornecida. Nomes não são usados para atribuir mérito. */
export function resultadosTitularesTempoResposta(episodios: readonly EpisodioTempoResposta[]): ResultadoTitularTempoResposta[] {
  const grupos = new Map<string | null, EpisodioTempoResposta[]>()
  for (const e of episodios) {
    if (e.estado !== 'respondido' || e.qualidade !== 'confiavel' || e.minutos_cliente === null || !Number.isFinite(e.minutos_cliente) || e.minutos_cliente < 0) continue
    const grupo = grupos.get(e.responsavel_id) ?? []
    grupo.push(e); grupos.set(e.responsavel_id, grupo)
  }
  const mediana = (numeros: number[]) => {
    const a = [...numeros].sort((x, y) => x - y)
    return a.length % 2 === 1 ? a[Math.floor(a.length / 2)] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2
  }
  return [...grupos.entries()].map(([id, itens]): ResultadoTitularTempoResposta => {
    const proprias = itens.filter((e) => !!id && !!e.respondente_id && e.respondente_id === id).length
    const coberturas = itens.filter((e) => !!id && !!e.respondente_id && e.respondente_id !== id).length
    const individuais = itens.flatMap((e) => e.qualidade_individual !== 'inconclusiva' && e.minutos_estrategista !== null && Number.isFinite(e.minutos_estrategista) && e.minutos_estrategista >= 0 ? [e.minutos_estrategista] : [])
    return {
      responsavelId: id, responsavel: id ? itens[0].responsavel || 'Pessoa não identificada' : 'Sem titular confirmado',
      respostas: itens.length, respostasProprias: proprias, coberturas, autoriaPendente: itens.length - proprias - coberturas,
      percentualNaMeta: Math.round(itens.filter((e) => (e.minutos_cliente as number) <= 60).length / itens.length * 100),
      medianaCliente: mediana(itens.map((e) => e.minutos_cliente as number)),
      medianaIndividual: individuais.length > 0 ? mediana(individuais) : null,
    }
  }).sort((a, b) => a.responsavel.localeCompare(b.responsavel, 'pt-BR'))
}

/** Resposta só entra no cache após conferir o mesmo ator e tenant da requisição. */
export function conferirPainelTempoResposta(bruto: unknown, escopo: EscopoTempoResposta): PainelTempoResposta {
  const r = bruto as Partial<PainelTempoResposta> | null
  if (!r || r.ok !== true || r.actor_id !== escopo.actorId || r.tenant_id !== escopo.tenantId) {
    throw new Error('O acesso ao painel mudou. Atualize a página para continuar.')
  }
  if (!r.config || !Object.hasOwn(MODOS_TEMPO_RESPOSTA, r.config.modo) || !Number.isInteger(r.config.revisao)
    || !Array.isArray(r.config.feriados) || r.config.feriados.length > 150 || !r.config.feriados.every((d) => typeof d === 'string' && dataReal(d))
    || !Array.isArray(r.config.anos_confirmados) || r.config.anos_confirmados.length > 5 || !r.config.anos_confirmados.every(Number.isInteger)
    || !r.agora || !Number.isFinite(Date.parse(r.agora)) || !Array.isArray(r.episodios) || r.episodios.length > 100
    || !Array.isArray(r.estrategistas) || !Array.isArray(r.titulares) || !Array.isArray(r.pausas) || !Array.isArray(r.avisos) || !r.avisos.every((a) => typeof a === 'string')
    || !(r.proximo_cursor === null || typeof r.proximo_cursor === 'string')) {
    throw new Error('O painel não retornou os dados esperados. Tente atualizar.')
  }
  for (const e of r.episodios) {
    if (typeof e.id !== 'string' || typeof e.cliente !== 'string' || !(e.client_id === null || typeof e.client_id === 'string')
      || !(e.responsavel_id === null || typeof e.responsavel_id === 'string')
      || !(e.respondente_id === undefined || e.respondente_id === null || typeof e.respondente_id === 'string')
      || !['aberto', 'respondido', 'cancelado'].includes(e.estado)
      || !['confiavel', 'inconclusiva'].includes(e.qualidade) || ![null, '30', '50', '60'].includes(e.etapa)
      || !(e.agenda_status === undefined || ['not_connected', 'connected', 'unavailable', 'incomplete', 'disconnected'].includes(e.agenda_status))
      || !(e.qualidade_individual === undefined || ['confiavel', 'sem_agenda', 'inconclusiva'].includes(e.qualidade_individual))
      || !(e.agenda_alertas_disponiveis === undefined || typeof e.agenda_alertas_disponiveis === 'boolean')
      || !Array.isArray(e.segmentos) || !Array.isArray(e.historico_alertas)
      || ![e.minutos_cliente, e.minutos_estrategista, e.minutos_descontados].every((v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0))) {
      throw new Error('Uma medição não pôde ser conferida. Tente atualizar o painel.')
    }
  }
  return r as PainelTempoResposta
}
