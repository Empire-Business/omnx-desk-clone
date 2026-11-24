// Satisfação do cliente (análise diária das conversas pela IA) — regras PURAS
// compartilhadas entre a análise e o relatório diário (wa-relatorio-dados →
// alerta 'sentimento_negativo').
//
// Fonte principal (F5): cliente_relacionamento (por CLIENTE, com memória —
// wa-relacionamento-analisar) → candidatoDeRelacionamento. Fallback, enquanto a
// tabela nova não tem dados: wa_auto_satisfacao (por conversa — wa-auto-satisfacao,
// já desagendada) → candidatoDeSatisfacao.
//
// Sem banco, sem rede, sem Deno: roda igual na edge function e no Vitest.
//
// A tabela wa_auto_satisfacao (migration 20261026240000) guarda, por conversa,
// o resultado de cada análise: nível, confiança, um MOTIVO curto parafraseado
// (nunca trecho da conversa), sinais de uma lista fixa e a tendência.
//
// Segurança (exceção consciente à regra "nada de texto de IA no relatório"):
// o motivo entra na lista literal do aviso diário ao GESTOR (uso interno). Ele
// já foi validado na gravação (sem link/telefone/e-mail/@, sem cópia literal de
// 6+ palavras da conversa, sem palavras de golpe/injeção) e, na hora de montar o
// relatório, passa de novo por nomeSeguro() (uma linha, sem formatação do
// WhatsApp, sem link clicável) com tamanho máximo MAX_MOTIVO_RELATORIO.
import { nomeSeguro, plural } from './wa-relatorio.ts'
import type { AlertaCandidato, SituacaoContratual } from './wa-alertas.ts'
import { corpoDaMensagem, type LinhaTimeline } from './cliente-timeline.ts'
import {
  CONFIANCA_ATENCAO, CONFIANCA_INSATISFEITO, MAX_JUSTIFICATIVA_PENDENCIA, MAX_TEMA, MOTIVOS_RISCO, type MotivoRisco,
  criticidadeDaPendencia, lerPendencias, responsabilidadeDaPendencia, type Pendencia,
} from './wa-relacionamento.ts'

export const NIVEIS_SATISFACAO = ['satisfeito', 'neutro', 'atencao', 'insatisfeito'] as const
export type NivelSatisfacao = typeof NIVEIS_SATISFACAO[number]

export const SINAIS_SATISFACAO = [
  'cancelamento', 'reclamacao', 'atraso', 'cobranca', 'demora_resposta',
  'insatisfacao_resultado', 'comparacao_concorrente', 'elogio', 'outro',
] as const
export type SinalSatisfacao = typeof SINAIS_SATISFACAO[number]

export const TENDENCIAS_SATISFACAO = ['piorando', 'estavel', 'melhorando'] as const
export type TendenciaSatisfacao = typeof TENDENCIAS_SATISFACAO[number]

/** Mesmo limite do CHECK da coluna wa_auto_satisfacao.motivo. */
export const MAX_MOTIVO = 240
/**
 * Teto do motivo dentro da linha do relatório. Fica ACIMA do limite gravado
 * (MAX_MOTIVO) com folga para o nomeSeguro (que pode acrescentar espaços): o
 * motivo sai sempre inteiro, nunca cortado com "…".
 */
export const MAX_MOTIVO_RELATORIO = MAX_MOTIVO + 60

/** Só entra no relatório análise feita nos últimos N dias. */
export const DIAS_VALIDADE_ANALISE = 3
/** Confiança mínima por nível para virar alerta. */
export const CONFIANCA_MINIMA: Readonly<Record<'insatisfeito' | 'atencao', number>> = {
  insatisfeito: 0.6,
  atencao: 0.7,
}

export function ehNivel(v: unknown): v is NivelSatisfacao {
  return typeof v === 'string' && (NIVEIS_SATISFACAO as readonly string[]).includes(v)
}

export function ehSinal(v: unknown): v is SinalSatisfacao {
  return typeof v === 'string' && (SINAIS_SATISFACAO as readonly string[]).includes(v)
}

export function ehTendencia(v: unknown): v is TendenciaSatisfacao {
  return typeof v === 'string' && (TENDENCIAS_SATISFACAO as readonly string[]).includes(v)
}

/** Uma linha de wa_auto_satisfacao como a coleta do relatório lê. */
export interface AnaliseLida {
  conversation_id: string
  client_id: string | null
  contact_id: string | null
  nivel: string
  confianca: number | string | null
  motivo: string | null
  analisado_ate: string | null
  created_at: string
}

function tempo(iso: string | null | undefined): number {
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(t) ? NaN : t
}

/** A análise mais recente (created_at) de cada conversa. */
export function ultimaPorConversa<T extends Pick<AnaliseLida, 'conversation_id' | 'created_at'>>(linhas: readonly T[]): Map<string, T> {
  const mapa = new Map<string, T>()
  for (const l of linhas) {
    if (!l.conversation_id) continue
    const atual = mapa.get(l.conversation_id)
    if (!atual || tempo(l.created_at) > tempo(atual.created_at)) mapa.set(l.conversation_id, l)
  }
  return mapa
}

/** Frase do relatório: "insatisfeito: <motivo>" / "atenção: <motivo>" (uma linha, segura, curta). */
export function detalheSatisfacao(nivel: 'insatisfeito' | 'atencao', motivo: string | null | undefined): string {
  const rotulo = nivel === 'insatisfeito' ? 'insatisfeito' : 'atenção'
  const m = nomeSeguro(motivo, MAX_MOTIVO_RELATORIO)
  return m ? `${rotulo}: ${m}` : `${rotulo} (análise das conversas)`
}

export interface AlertaSatisfacao {
  nivel: 'insatisfeito' | 'atencao'
  confianca: number
  /** 3 = alta (insatisfeito), 2 = média (atenção). */
  prioridade: 2 | 3
  detalhe: string
  /** Motivo já seguro (nomeSeguro), para o painel. */
  motivo: string | null
}

/**
 * A análise vira alerta? Só se for recente (DIAS_VALIDADE_ANALISE) e:
 *   insatisfeito com confiança ≥ 0,6 → prioridade alta;
 *   atenção com confiança ≥ 0,7      → prioridade média.
 * Qualquer outra coisa (satisfeito, neutro, confiança baixa, dado estranho) → null.
 */
export function analiseViraAlerta(a: Pick<AnaliseLida, 'nivel' | 'confianca' | 'motivo' | 'created_at'>, agora: Date): AlertaSatisfacao | null {
  const criado = tempo(a.created_at)
  if (!Number.isFinite(criado) || criado < agora.getTime() - DIAS_VALIDADE_ANALISE * 86_400_000) return null
  const confianca = typeof a.confianca === 'number' ? a.confianca : Number(a.confianca)
  if (!Number.isFinite(confianca) || confianca < 0 || confianca > 1) return null
  if (a.nivel !== 'insatisfeito' && a.nivel !== 'atencao') return null
  if (confianca < CONFIANCA_MINIMA[a.nivel]) return null
  return {
    nivel: a.nivel,
    confianca,
    prioridade: a.nivel === 'insatisfeito' ? 3 : 2,
    detalhe: detalheSatisfacao(a.nivel, a.motivo),
    motivo: nomeSeguro(a.motivo, MAX_MOTIVO_RELATORIO),
  }
}

/** Sinais da conversa/contato/cliente para as regras automáticas de wa-alertas.ts. */
export interface SinaisConversa {
  cliente: string
  client_id: string | null
  contact_id: string | null
  contatoBloqueado: boolean
  grupo: boolean
  silenciada: boolean
  clienteAtivo: boolean | null
  situacao: SituacaoContratual | null
}

/**
 * Análise recente → candidato do alerta 'sentimento_negativo' (o filtro de
 * wa-alertas decide depois: bloqueado, grupo sem cliente, inativo, contrato
 * encerrado, ignorados do gestor, mesmo cliente uma vez só). `desde` = até onde a
 * IA leu a conversa. Não vira alerta → null.
 * Contato SEM cliente vinculado nunca vira "insatisfeito"/"atenção" (F0: os 4
 * "insatisfeitos" do relatório de 27/10/2026 eram leads) — inclusive análise
 * antiga, gravada antes dessa regra.
 */
export function candidatoDeSatisfacao(
  a: AnaliseLida, s: SinaisConversa, agora: Date,
): AlertaCandidato | null {
  if (!s.client_id) return null
  const al = analiseViraAlerta(a, agora)
  if (!al) return null
  return {
    tipo: 'sentimento_negativo',
    cliente: s.cliente,
    detalhe: al.detalhe,
    client_id: s.client_id,
    contact_id: s.contact_id,
    conversation_id: a.conversation_id,
    contract_id: null,
    desde: a.analisado_ate ?? a.created_at,
    evidencia_em: a.analisado_ate,
    prioridade: al.prioridade,
    contatoBloqueado: s.contatoBloqueado,
    grupo: s.grupo,
    silenciada: s.silenciada,
    clienteAtivo: s.clienteAtivo,
    situacao: s.situacao,
    nivel: al.nivel,
    confianca: al.confianca,
    motivo: al.motivo,
  }
}

/** Seção "insatisfeitos ou em risco": só alerta de contato COM cliente vinculado. */
export function soComCliente<T extends Pick<AlertaCandidato, 'client_id'>>(candidatos: readonly T[]): T[] {
  return candidatos.filter((c) => Boolean(c.client_id))
}

/**
 * Fallback das fontes antigas (chat_conversations.sentimento e chat_weekly_reports):
 * só ficam os candidatos de conversa/cliente que NÃO têm análise recente — quem
 * foi analisado (mesmo que "satisfeito") segue a análise nova.
 */
export function semAnaliseRecente(
  antigos: readonly AlertaCandidato[],
  analisadas: { conversas: ReadonlySet<string>; clientes: ReadonlySet<string> },
): AlertaCandidato[] {
  return antigos.filter((c) =>
    !(c.conversation_id && analisadas.conversas.has(c.conversation_id)) &&
    !(c.client_id && analisadas.clientes.has(c.client_id)))
}

// ---------------------------------------------------------------------------
// Fonte principal (F5): cliente_relacionamento (uma linha por cliente)
// ---------------------------------------------------------------------------

/** Uma linha de cliente_relacionamento como a coleta do relatório lê (sem resumo). */
export interface RelacionamentoLido {
  client_id: string
  satisfacao: string
  confianca: number | string | null
  motivo: string | null
  risco: string
  risco_motivos: string[] | null
  metricas: Record<string, unknown> | null
  pendencias: unknown
  analisado_ate: string | null
  /** Quando métricas e risco foram recalculados (todo dia). */
  processado_em: string | null
  /** Fontes relidas da timeline do mesmo cliente/tenant, nunca da saída da IA. */
  fontes?: readonly LinhaTimeline[]
}

export interface SinaisCliente {
  cliente: string
  client_id: string
  clienteAtivo: boolean | null
  situacao: SituacaoContratual | null
}

const DIA = 86_400_000

function inteiro(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null
}

/**
 * Pendência operacional: justificativa contextual revalidada, priorizada sobre
 * métricas genéricas. Demais riscos: até 2 frases fixas, na ordem silêncio >
 * pendência antiga > queda. Os dias de silêncio andam com o tempo
 * desde o processamento (o relatório pode sair mais tarde que a análise).
 */
/** Conteúdo literal curto, sem contatos/URLs/menções/segredos; a fonte permanece consultável pelo ID. */
export function trechoDaFonte(fonte: LinhaTimeline): string | null {
  const corpo = corpoDaMensagem(fonte)
  if (/senha|password|token|segredo|c[oó]digo de verifica/i.test(corpo)) return null
  return nomeSeguro(corpo.replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|@\d+|\d[\d\s()./-]{6,}\d/gi, '[omitido]'), 100)
}
export function detalheDoPedido(p: Pendencia, fontes: readonly LinhaTimeline[] = []): string {
  const fonte = p.fonte_message_id ? fontes.find((f) => f.message_id === p.fonte_message_id) : undefined
  const autor = fonte ? nomeSeguro(fonte.autor_nome) ?? 'autor não identificado' : 'autor não confirmado'
  const data = fonte && Number.isFinite(Date.parse(fonte.criado_em))
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(fonte.criado_em))
    : `${p.desde.split('-').reverse().join('/')} (data registrada; fonte não confirmada)`
  const responsabilidade = responsabilidadeDaPendencia(p)
  return `${nomeSeguro(p.tema_curto, MAX_TEMA + 40)}; ${autor}, ${data}; falta: ${nomeSeguro(p.resposta_faltante, MAX_TEMA + 40) ?? 'confirmar o retorno ou a entrega esperada'}; ${responsabilidade === 'indeterminada' ? 'responsável a confirmar' : responsabilidade === 'terceiro' ? 'responsabilidade de terceiro confirmada' : responsabilidade === 'cliente' ? 'ação assumida pelo cliente' : 'responsabilidade interna confirmada'}`
}

export function detalheRisco(r: Pick<RelacionamentoLido, 'risco_motivos' | 'metricas' | 'pendencias' | 'processado_em' | 'fontes'>, agora: Date): string | null {
  const pendencias = lerPendencias(r.pendencias, null, agora)
  for (const p of pendencias) {
    const c = criticidadeDaPendencia(p)
    if (!c) continue
    const justificativa = nomeSeguro(c.justificativa, MAX_JUSTIFICATIVA_PENDENCIA + 40)
    if (justificativa) return `${c.nivel === 'alta' ? 'pendência crítica' : 'pendência de contrato'}: ${detalheDoPedido(p, r.fontes)}; ${justificativa}`
  }
  const motivos = new Set((r.risco_motivos ?? []).filter((m): m is MotivoRisco => (MOTIVOS_RISCO as readonly string[]).includes(m)))
  const m = r.metricas ?? {}
  const partes: string[] = []
  if (motivos.has('silencio')) {
    const base = inteiro(m.dias_desde_msg_cliente)
    const proc = r.processado_em ? new Date(r.processado_em).getTime() : NaN
    const desdeProc = Number.isFinite(proc) ? Math.max(0, Math.floor((agora.getTime() - proc) / DIA)) : 0
    const janela = inteiro(m.janela_dias) ?? 90
    partes.push(base === null
      ? `sem mensagem do cliente há mais de ${janela} dias`
      : `sem falar há ${plural(base + desdeProc, 'dia', 'dias')}`)
  }
  if (motivos.has('pendencia_velha')) {
    const abertas = pendencias.filter((p) => p.status !== 'resolvida' && !['terceiro', 'cliente'].includes(responsabilidadeDaPendencia(p)))
    if (abertas.length > 0) partes.push(abertas.map((p) => detalheDoPedido(p, r.fontes)).join(' | '))
  }
  if (motivos.has('queda_volume')) {
    const q = typeof m.queda_volume_pct === 'number' ? m.queda_volume_pct : Number(m.queda_volume_pct)
    partes.push(Number.isFinite(q) && q > 0 && q <= 1
      ? `conversas do cliente caíram ${Math.round(q * 100)}% no mês`
      : 'conversas do cliente caíram no mês')
  }
  return partes.length ? partes.join('; ') : null
}

/**
 * Linha de cliente_relacionamento → candidato do alerta 'sentimento_negativo', ou
 * null. Só vale linha processada nos últimos DIAS_VALIDADE_ANALISE dias.
 *   "Clientes insatisfeitos" (IA):
 *     insatisfeito com confiança ≥ 0,6, ou cancelamento → nivel
 *       'insatisfeito', prioridade alta;
 *     atenção com confiança ≥ 0,7 → nivel 'atencao', prioridade média;
 *   "Clientes em risco" (regras): risco médio por silêncio, pendência antiga ou
 *     queda de conversas → nivel 'risco', prioridade média, detalhe por frase fixa.
 *     Pendência operacional com contexto → nivel 'risco', prioridade alta ou
 *     média pela criticidade; risco alto sozinho nunca prova insatisfação.
 * Demora da equipe nunca entra aqui (é a seção "sem resposta").
 */
export function candidatoDeRelacionamento(r: RelacionamentoLido, s: SinaisCliente, agora: Date): AlertaCandidato | null {
  if (!s.client_id || r.client_id !== s.client_id) return null
  const proc = tempo(r.processado_em)
  if (!Number.isFinite(proc) || proc < agora.getTime() - DIAS_VALIDADE_ANALISE * DIA) return null
  const c = typeof r.confianca === 'number' ? r.confianca : Number(r.confianca)
  const confianca = Number.isFinite(c) && c >= 0 && c <= 1 ? c : 0
  const motivos = (r.risco_motivos ?? []).filter((m): m is MotivoRisco => (MOTIVOS_RISCO as readonly string[]).includes(m))
  const fontesPedidos = lerPendencias(r.pendencias, null, agora).flatMap((p) => {
    const fonte = p.fonte_message_id ? r.fontes?.find((f) => f.message_id === p.fonte_message_id) : undefined
    if (!fonte) return []
    return [{ message_id: fonte.message_id, criado_em: fonte.criado_em,
      autor: nomeSeguro(fonte.autor_nome) ?? 'Autor não identificado', trecho: trechoDaFonte(fonte),
      responsabilidade: responsabilidadeDaPendencia(p) }]
  })
  const base = {
    ...(fontesPedidos.length ? { fontes_pedidos: fontesPedidos } : {}),
    tipo: 'sentimento_negativo' as const,
    cliente: s.cliente,
    client_id: s.client_id,
    contact_id: null,
    conversation_id: null,
    contract_id: null,
    desde: r.analisado_ate ?? r.processado_em,
    evidencia_em: r.analisado_ate,
    clienteAtivo: s.clienteAtivo,
    situacao: s.situacao,
  }
  const insatisfeito = (r.satisfacao === 'insatisfeito' && confianca >= CONFIANCA_INSATISFEITO) || motivos.includes('cancelamento')
  if (insatisfeito) {
    const motivo = nomeSeguro(r.motivo, MAX_MOTIVO_RELATORIO)
    return {
      ...base, prioridade: 3,
      detalhe: detalheSatisfacao('insatisfeito', motivo ?? (motivos.includes('cancelamento') ? 'fala em cancelar ou pausar' : null)),
      nivel: 'insatisfeito', confianca, motivo,
    }
  }
  const operacional = lerPendencias(r.pendencias, null, agora)
    .map(criticidadeDaPendencia).find((c) => c !== null)
  if (operacional) {
    const detalhe = detalheRisco(r, agora)
    if (detalhe) return { ...base, prioridade: operacional.nivel === 'alta' ? 3 : 2, detalhe, nivel: 'risco', motivo: null }
  }
  if (r.satisfacao === 'atencao' && confianca >= CONFIANCA_ATENCAO) {
    const motivo = nomeSeguro(r.motivo, MAX_MOTIVO_RELATORIO)
    return { ...base, prioridade: 2, detalhe: detalheSatisfacao('atencao', motivo), nivel: 'atencao', confianca, motivo }
  }
  if (r.risco === 'medio' || r.risco === 'alto') {
    const detalhe = detalheRisco(r, agora)
    if (!detalhe) return null
    return { ...base, prioridade: r.risco === 'alto' ? 3 : 2, detalhe, nivel: 'risco', motivo: null }
  }
  return null
}
