// Filtro "inteligente" dos alertas do relatório diário — regras PURAS.
//
// Sem banco, sem rede, sem Deno: roda igual na edge function e no Vitest
// (wa-alertas.test.ts). A coleta (./wa-relatorio-dados.ts) lê o banco, monta os
// candidatos com os SINAIS de cada um (cliente ativo? contrato vigente? grupo?…)
// e chama filtrarAlertas(). Aqui decidimos o que entra, em que ordem e o que
// vira só contagem.
//
// Por quê (relatório real de 26/10/2026): "195 clientes sem resposta", conversa
// "esperando há 228 dias" no topo, cliente que já cancelou, 70 "contrato
// inadimplente" de clientes inativos. O gestor precisa de uma lista curta do que
// dá para resolver HOJE.
//
// Ordem das regras (a 1ª que bater decide o motivo, para as contagens):
//   1. contato bloqueado                         → contato_bloqueado
//   2. grupo sem cliente vinculado               → grupo_sem_cliente
//   3. conversa silenciada pela equipe           → conversa_silenciada
//   4. cliente inativo (clients.ativo = false)   → cliente_inativo
//   5. cliente sem contrato vigente (todos cancelados/concluídos) → contrato_encerrado
//   6. pendência de contrato que já não vale (status encerrado ou, no
//      inadimplente, prazo do plano vencido)    → contrato_fora_do_prazo
//   7. o gestor mandou ignorar (painel)          → ignorados_pelo_gestor
//   8. opção "só clientes ativos" ligada e sem cliente cadastrado e ativo
//      → sem_cadastro (vira "+ N ocorrências de contatos sem cadastro ficaram fora")
//      Pendência do próprio contrato PAUSADO → contrato_pausado, sem excluir
//      outros alertas do cliente que também tenha contrato em andamento.
//   9. sem resposta há mais que a janela         → fora_da_janela (vira "+ N paradas")
//  10. mesmo cliente já listado antes (nesta ou noutra seção) → cliente_repetido
// Conversas arquivadas/encerradas nem são lidas (filtro na consulta).
import type { FontePedidoAlerta, ItemAlerta, NivelAlertaSatisfacao, TipoAlerta } from './wa-relatorio.ts'
import { TIPOS_ALERTA } from './wa-relatorio.ts'

/** Padrão da janela do "sem resposta" (wa_auto_regras_anomalia.janela_dias). */
export const JANELA_SEM_RESPOSTA_DIAS = 7

/** Status (contratos.status) que encerram o vínculo. Qualquer outro conta como vigente. */
const STATUS_ENCERRADOS = new Set(['cancelado', 'concluido', 'encerrado', 'distrato', 'finalizado', 'rescindido'])

function semAcento(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function statusEncerrado(status: string | null | undefined): boolean {
  return STATUS_ENCERRADOS.has(semAcento(status))
}

export type SituacaoContratual = 'vigente' | 'encerrado' | 'sem_contrato'

/**
 * Situação do cliente pelos status dos contratos dele. "encerrado" só quando TEM
 * contrato e TODOS estão encerrados (cancelado/concluído…); sem contrato nenhum
 * é outra coisa (cliente novo, prospect) e não some do alerta.
 */
export function situacaoContratual(statuses: readonly (string | null | undefined)[]): SituacaoContratual {
  if (statuses.length === 0) return 'sem_contrato'
  return statuses.every((s) => statusEncerrado(s)) ? 'encerrado' : 'vigente'
}

/**
 * O prazo do plano ainda vale? fim = (data de assinatura ou de fechamento) +
 * plano_dias. Sem data, data lixo (antes de 2000) ou sem plano → não dá para
 * saber: considera que vale (na dúvida, o alerta aparece).
 */
export function contratoNoPrazo(
  c: { data_assinatura?: string | null; data_fechamento?: string | null; plano_dias?: number | null },
  agora: Date,
): boolean {
  const inicio = (c.data_assinatura || c.data_fechamento || '').slice(0, 10)
  const dias = Number(c.plano_dias)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !Number.isFinite(dias) || dias <= 0) return true
  if (Number(inicio.slice(0, 4)) < 2000) return true
  const fim = new Date(`${inicio}T00:00:00Z`).getTime() + (dias + 1) * 86_400_000 // inclui o último dia
  return fim > agora.getTime()
}

/** Contato de grupo do WhatsApp (o número de grupo é "…@g.us" ou um id longo). */
export function contatoEhGrupo(numero: string | null | undefined, groupSize?: number | null): boolean {
  if (Number(groupSize) > 0) return true
  const n = String(numero ?? '')
  if (/@g\.us$/i.test(n)) return true
  return n.replace(/\D/g, '').length > 15
}

/** Nome normalizado para casar contrato sem cliente_id com o cadastro. */
export function chaveNome(nome: string | null | undefined): string {
  return semAcento(nome).replace(/\s+/g, ' ')
}

/** Cliente com exatamente este nome (sem acento/caixa). Ambíguo ou nada → null. */
export function clientePorNome(nome: string | null | undefined, clientes: readonly { id: string; nome: string | null }[]): string | null {
  const k = chaveNome(nome)
  if (!k) return null
  const achados = clientes.filter((c) => chaveNome(c.nome) === k)
  return achados.length === 1 ? achados[0].id : null
}

// ---------------------------------------------------------------------------
// Estrategista responsável (opção "Separar por estrategista")
// ---------------------------------------------------------------------------

export interface AtribuicaoCliente {
  client_id: string
  user_id: string
  tipo?: string | null
  ativo?: boolean | null
  criado_em?: string | null
}

/**
 * Estrategista PRINCIPAL de cada cliente (client_id → user_id). Mesmo critério da
 * tela de clientes (client_assignments tipo 'estrategista') + só vínculo ativo.
 * Com mais de um, vale o vínculo MAIS RECENTE — é ele que o gatilho
 * sync_estrategista_to_contratos grava em contratos.estrategista_id. Empate (ou sem
 * data): o menor user_id, para o resultado não mudar de um dia para o outro.
 */
export function estrategistaPrincipal(atribuicoes: readonly AtribuicaoCliente[]): Map<string, string> {
  const melhor = new Map<string, { user_id: string; t: number }>()
  for (const a of atribuicoes) {
    if (!a?.client_id || !a.user_id) continue
    if ((a.tipo ?? 'estrategista') !== 'estrategista' || a.ativo === false) continue
    const t = tempo(a.criado_em)
    const atual = { user_id: a.user_id, t: Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY }
    const antes = melhor.get(a.client_id)
    if (!antes || atual.t > antes.t || (atual.t === antes.t && atual.user_id < antes.user_id)) melhor.set(a.client_id, atual)
  }
  return new Map([...melhor].map(([c, v]) => [c, v.user_id]))
}

// ---------------------------------------------------------------------------
// Candidatos
// ---------------------------------------------------------------------------

/** 3 = alta, 2 = média, 1 = baixa (maior vem antes). */
export type Prioridade = 1 | 2 | 3

export interface AlertaCandidato {
  fontes_pedidos?: FontePedidoAlerta[]
  tipo: TipoAlerta
  /** Nome já seguro (nomeDoCliente). */
  cliente: string
  /** Frase FIXA montada pela coleta. */
  detalhe: string
  client_id: string | null
  contact_id: string | null
  conversation_id: string | null
  contract_id: string | null
  /** Último recurso para a chave (ex.: id da reunião sem cliente nem contato). */
  ref_id?: string | null
  /** ISO: desde quando o problema existe (mensagem do cliente, reunião…). */
  desde: string | null
  prioridade: Prioridade
  // ---- sinais para as regras automáticas ----
  contatoBloqueado?: boolean
  grupo?: boolean
  silenciada?: boolean
  /** null = sem cadastro de cliente. */
  clienteAtivo?: boolean | null
  situacao?: SituacaoContratual | null
  contratoForaDoPrazo?: boolean
  /** Só a pendência deste contrato (não a situação de todos os contratos do cliente). */
  contratoPausado?: boolean
  /** Todos os contratos ainda não encerrados do cliente estão pausados. */
  clienteSoContratosPausados?: boolean
  /** Marco da evidência contextual; null = fonte antiga sem data de análise. */
  evidencia_em?: string | null
  /** Só sem_resposta: espera maior que a janela. */
  foraDaJanela?: boolean
  /** Só grupo_sem_cliente: todos os contatos do grupo (um por número da empresa). */
  contatosDoGrupo?: string[]
  // ---- só sentimento_negativo (cliente_relacionamento; fallback wa_auto_satisfacao) ----
  /** 'risco' = risco médio por regra (silêncio, pendência antiga, queda) — subseção "Clientes em risco". */
  nivel?: NivelAlertaSatisfacao
  confianca?: number
  /** Motivo já seguro (nomeSeguro). */
  motivo?: string | null
}

/** Prioridade pelo vínculo: cliente com contrato vigente > cliente > contato sem cadastro. */
export function prioridadePorVinculo(clientId: string | null, situacao: SituacaoContratual | null | undefined): Prioridade {
  if (!clientId) return 1
  return situacao === 'vigente' ? 3 : 2
}

/** `${tipo}:${client_id||contact_id||conversation_id}` (com contrato/ref como último recurso). */
export function chaveAlerta(a: Pick<AlertaCandidato, 'tipo' | 'client_id' | 'contact_id' | 'conversation_id' | 'contract_id' | 'ref_id' | 'cliente'>): string {
  return `${a.tipo}:${a.client_id || a.contact_id || a.conversation_id || a.contract_id || a.ref_id || chaveNome(a.cliente)}`
}

/** Quem é o "mesmo cliente" entre seções. */
function identidade(a: AlertaCandidato): string | null {
  return a.client_id ? `cl:${a.client_id}` : a.contact_id ? `ct:${a.contact_id}` : a.conversation_id ? `cv:${a.conversation_id}` : a.contract_id ? `co:${a.contract_id}` : a.ref_id ? `r:${a.ref_id}` : null
}

// ---------------------------------------------------------------------------
// Ignorados pelo gestor (wa_auto_alertas_ignorados)
// ---------------------------------------------------------------------------

export type ModoIgnorado = 'resolvido' | 'ate_data' | 'ate_novidade' | 'sempre'
export type TipoIgnorado = TipoAlerta | 'todos'

export interface Ignorado {
  id: string
  tipo: TipoIgnorado | string
  client_id: string | null
  contact_id: string | null
  modo: ModoIgnorado | string
  ate: string | null
  created_at: string
  /**
   * Última NOVIDADE do alvo (calculada pela coleta): mensagem do cliente (qualquer
   * contato dele) ou mudança de status/contrato novo. Só usada em resolvido/ate_novidade.
   */
  novidade_em?: string | null
}

function tempo(iso: string | null | undefined): number {
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(t) ? NaN : t
}

/**
 * O pedido ainda vale agora?
 *   sempre       → sim;
 *   ate_data     → até `ate` (sem `ate` válido: não vale);
 *   resolvido / ate_novidade → até haver novidade DEPOIS de created_at.
 * Modo desconhecido → não vale (na dúvida, o alerta aparece).
 */
export function ignoradoValendo(i: Ignorado, agora: Date): boolean {
  switch (i.modo) {
    case 'sempre': return true
    case 'ate_data': {
      const ate = tempo(i.ate)
      return Number.isFinite(ate) && agora.getTime() < ate
    }
    case 'resolvido':
    case 'ate_novidade': {
      const criado = tempo(i.created_at)
      if (!Number.isFinite(criado)) return false
      const nov = tempo(i.novidade_em)
      return !(Number.isFinite(nov) && nov > criado)
    }
    default: return false
  }
}

/**
 * O pedido cobre este alerta? Tipo igual (ou 'todos') e:
 *   client_id → qualquer alerta daquele cliente (de qualquer contato/conversa dele);
 *   só contact_id → os alertas daquele contato.
 * (Mesma regra de alertaCobertoPor no front.)
 */
export function ignoradoCobre(i: Pick<Ignorado, 'tipo' | 'client_id' | 'contact_id'>, a: Pick<AlertaCandidato, 'tipo' | 'client_id' | 'contact_id'>): boolean {
  if (i.tipo !== 'todos' && i.tipo !== a.tipo) return false
  if (i.client_id) return a.client_id === i.client_id
  if (i.contact_id) return a.contact_id === i.contact_id
  return false
}

/** Uma novidade pode pedir reanálise, mas não transforma o diagnóstico anterior em evidência nova. */
export function ignoradoOculta(i: Ignorado, a: AlertaCandidato, agora: Date): boolean {
  if (!ignoradoCobre(i, a)) return false
  if (ignoradoValendo(i, agora)) return true
  if (a.tipo !== 'sentimento_negativo' || (i.modo !== 'resolvido' && i.modo !== 'ate_novidade')) return false
  const criado = tempo(i.created_at)
  if (!Number.isFinite(criado)) return false
  const evidencia = tempo(a.evidencia_em === undefined ? a.desde : a.evidencia_em)
  return !(Number.isFinite(evidencia) && evidencia > criado)
}

// ---------------------------------------------------------------------------
// Filtro + ordem + "mesmo cliente uma vez só"
// ---------------------------------------------------------------------------

export type MotivoOculto =
  | 'contato_bloqueado' | 'grupo_sem_cliente' | 'conversa_silenciada' | 'cliente_inativo'
  | 'contrato_encerrado' | 'contrato_fora_do_prazo' | 'contrato_pausado' | 'ignorados_pelo_gestor' | 'sem_cadastro' | 'fora_da_janela'
  | 'cliente_repetido'

export const MOTIVOS_OCULTOS: readonly MotivoOculto[] = [
  'contato_bloqueado', 'grupo_sem_cliente', 'conversa_silenciada', 'cliente_inativo', 'contrato_encerrado',
  'contrato_fora_do_prazo', 'contrato_pausado', 'ignorados_pelo_gestor', 'sem_cadastro', 'fora_da_janela', 'cliente_repetido',
]

/** Opção "só clientes ativos": o alerta é de cliente CADASTRADO e ATIVO (clients.ativo = true)? */
export function deClienteAtivo(a: Pick<AlertaCandidato, 'client_id' | 'clienteAtivo'>): boolean {
  return Boolean(a.client_id) && a.clienteAtivo === true
}

export interface OpcoesFiltro {
  /** Só clientes cadastrados e ativos; pendências de contratos pausados ficam fora. */
  soClientesAtivos?: boolean
}

/** Regras 1–6 (automáticas, sem o painel). */
export function motivoAutomatico(a: AlertaCandidato): MotivoOculto | null {
  if (a.contatoBloqueado) return 'contato_bloqueado'
  if (a.grupo && !a.client_id) return 'grupo_sem_cliente'
  if (a.silenciada) return 'conversa_silenciada'
  if (a.client_id && a.clienteAtivo === false) return 'cliente_inativo'
  if (a.client_id && a.situacao === 'encerrado') return 'contrato_encerrado'
  if (a.contratoForaDoPrazo) return 'contrato_fora_do_prazo'
  return null
}

/**
 * Ordem dentro da seção: prioridade (vínculo/gravidade) e, empatado, quem espera
 * há MAIS tempo primeiro. No "sem resposta" a janela já tirou o que está parado há
 * semanas; dentro dela, quem espera há 5 dias é o mais perto de virar cliente
 * perdido (e de sair da lista amanhã), enquanto quem escreveu há 5h ainda tende a
 * ser respondido no fluxo normal da equipe. Sem data → no fim. Depois, nome.
 */
export function compararAlertas(x: AlertaCandidato, y: AlertaCandidato): number {
  const tx = tempo(x.desde)
  const ty = tempo(y.desde)
  const ax = Number.isFinite(tx) ? tx : Number.POSITIVE_INFINITY
  const ay = Number.isFinite(ty) ? ty : Number.POSITIVE_INFINITY
  return (y.prioridade - x.prioridade) || (ax === ay ? 0 : ax < ay ? -1 : 1) || x.cliente.localeCompare(y.cliente, 'pt-BR')
}

export interface ItemAlertaCompleto extends ItemAlerta {
  tipo: TipoAlerta
  chave_alerta: string
  client_id: string | null
  contact_id: string | null
  conversation_id: string | null
  contract_id: string | null
  desde: string | null
  prioridade: Prioridade
}

export interface ResultadoFiltro {
  /** Só as seções que vieram (regras LIGADAS), já filtradas e ordenadas. */
  alertas: Partial<Record<TipoAlerta, ItemAlertaCompleto[]>>
  ocultos: Record<MotivoOculto, number>
  /** Conversas sem resposta além da janela que passaram em todas as outras regras. */
  paradas: number
  /**
   * Opção "só clientes ativos": quantos contatos/clientes DIFERENTES ficaram fora por
   * não ter cadastro de cliente ativo (só os que iriam para a lista — quem já passou
   * da janela do "sem resposta" não conta). 0 com a opção desligada.
   */
  foraSemCadastro: number
}

/**
 * Aplica as regras na ordem das seções: análise contextual > sem resposta >
 * pendências > queda > grupos sem cliente. Assim o motivo concreto de risco não
 * some atrás de uma contagem de horas. Um cliente aparece uma vez, na primeira
 * seção elegível; análise ignorada/inativa não esconde os outros alertas.
 */
export function filtrarAlertas(
  porTipo: Partial<Record<TipoAlerta, readonly AlertaCandidato[]>>,
  ignorados: readonly Ignorado[],
  agora: Date,
  opcoes: OpcoesFiltro = {},
): ResultadoFiltro {
  const ocultos = Object.fromEntries(MOTIVOS_OCULTOS.map((m) => [m, 0])) as Record<MotivoOculto, number>
  const vistos = new Set<string>()
  const semCadastro = new Set<string>()
  let semCadastroSemId = 0
  const alertas: Partial<Record<TipoAlerta, ItemAlertaCompleto[]>> = {}
  let paradas = 0

  for (const tipo of TIPOS_ALERTA) {
    const lista = porTipo[tipo]
    if (!lista) continue
    const saida: ItemAlertaCompleto[] = []
    for (const a of [...lista].sort(compararAlertas)) {
      const auto = motivoAutomatico(a)
      if (auto) { ocultos[auto]++; continue }
      if (ignorados.some((i) => ignoradoOculta(i, a, agora))) { ocultos.ignorados_pelo_gestor++; continue }
      // Grupo sem cliente é justamente o alerta de quem NÃO tem cadastro: a opção não se aplica.
      if (opcoes.soClientesAtivos && a.tipo !== 'grupo_sem_cliente' && !deClienteAtivo(a)) {
        ocultos.sem_cadastro++
        if (!a.foraDaJanela) {
          const id = identidade(a)
          if (id) semCadastro.add(id)
          else semCadastroSemId++
        }
        continue
      }
      if (opcoes.soClientesAtivos && (a.clienteSoContratosPausados || (a.tipo === 'pendencia' && a.contratoPausado))) {
        ocultos.contrato_pausado++
        continue
      }
      if (a.foraDaJanela) { ocultos.fora_da_janela++; paradas++; continue }
      const id = identidade(a)
      if (id && vistos.has(id)) { ocultos.cliente_repetido++; continue }
      if (id) vistos.add(id)
      saida.push({
        tipo,
        cliente: a.cliente,
        detalhe: a.detalhe,
        ...(a.fontes_pedidos?.length ? { fontes_pedidos: a.fontes_pedidos } : {}),
        chave_alerta: chaveAlerta(a),
        client_id: a.client_id,
        contact_id: a.contact_id,
        conversation_id: a.conversation_id,
        contract_id: a.contract_id,
        desde: a.desde,
        prioridade: a.prioridade,
        ...(a.nivel ? { nivel: a.nivel, confianca: a.confianca, motivo: a.motivo ?? null } : {}),
      })
    }
    alertas[tipo] = saida
  }
  return { alertas, ocultos, paradas, foraSemCadastro: semCadastro.size + semCadastroSemId }
}
