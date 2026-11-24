import { contratosDosClientesAtendidos } from './contratos-clientes-atendidos.ts'
// Ferramentas de NEGÓCIO (só LEITURA) do assistente da equipe no WhatsApp: a visão de
// gestão da plataforma — contratos, clientes, recebíveis, comissões, reuniões,
// onboarding de vendas e demandas do Atendimento.
//
// Mesmo contrato de segurança de wa-agente-ferramentas.ts:
//   * a IA só escolhe ferramenta e argumentos; EMPRESA, CARTEIRA e PERMISSÕES vêm do
//     servidor (ctx.escopo). Nenhum argumento aceita tenant, user ou id;
//   * service_role: TODA consulta filtra tenant_id (F2);
//   * carteira parcial (escopo.total = false): só contratos/clientes/reuniões/demandas
//     de clientes da carteira; item sem cliente vinculado só para quem vê tudo;
//   * clientes saem com refs curtas (C1…) do MapaRefs da execução — a IA usa a ref
//     nas ferramentas por cliente (situacao_cliente etc.);
//   * nunca telefone, e-mail, CPF/CNPJ, PIX ou observações livres;
//   * VALORES (R$) só com permissão 'contratos'; comissões só para gestor de comissões
//     (ou as PRÓPRIAS aprovadas/pagas, e só no privado); onboarding só com
//     'contratos.onboarding'; demandas só com 'atendimento';
//   * grupo com "Todos no grupo veem tudo" (escopo.acessoTotalGrupo) → tudo liberado;
//   * modo restrito → nenhuma ferramenta deste módulo.
// Os executores nunca lançam: devolvem { erro } (texto curto em pt-BR).
import { FUSO_PADRAO, limitesDoDia, nomeSeguro, partesNoFuso } from './wa-relatorio.ts'
import { chaveNome, statusEncerrado } from './wa-alertas.ts'
import { type EscopoAgente, type PermissoesAgente, podeVerCliente, podeVerSemCliente } from './wa-agente-escopo.ts'
import { type ContextoFerramentas, termoBusca } from './wa-agente-ferramentas.ts'

// ---------------------------------------------------------------------------
// Permissões extras (preenchidas por carregarEscopo — ver o fim do arquivo)
// ---------------------------------------------------------------------------

export interface PermissoesNegocio extends PermissoesAgente {
  /** has_permissao_de(user, 'contratos.onboarding', 'ver'): fila de vendas a cadastrar. */
  onboarding?: boolean
  /** has_permissao_de(user, 'atendimento', 'ver'): demandas do app Atendimento. */
  atendimento?: boolean
  /**
   * Gestor de comissões (espelha a RLS de `comissoes`): users.perfil IN ('admin','gerente')
   * OU comissoes_papeis (user_id, tenant_id) com papel IN ('admin','revisor').
   */
  comissoes?: boolean
}

export type ChavePermissaoNegocio = keyof PermissoesNegocio

/** Tem a permissão? Grupo "veem tudo" libera tudo; restrito nunca. */
export function temPermissao(e: EscopoAgente, chave: ChavePermissaoNegocio): boolean {
  if (e.modo !== 'normal') return false
  if (e.acessoTotalGrupo) return true
  return (e.permissoes as PermissoesNegocio)[chave] === true
}

/** Conversa privada (1:1) com um membro — não é grupo. */
export function ehPrivado(e: EscopoAgente): boolean {
  return e.modo === 'normal' && !e.acessoTotalGrupo && e.participantesMembros === undefined && !!e.userId
}

// ---------------------------------------------------------------------------
// Definições (formato OpenAI / OpenRouter)
// ---------------------------------------------------------------------------

export type NomeNegocio =
  | 'visao_geral' | 'contratos_resumo' | 'listar_contratos' | 'listar_clientes' | 'recebiveis_resumo'
  | 'comissoes_resumo' | 'reunioes_periodo' | 'vendas_pendentes' | 'demandas_resumo'

export interface DefinicaoNegocio {
  type: 'function'
  function: { name: NomeNegocio; description: string; parameters: Record<string, unknown> }
}

function def(name: NomeNegocio, description: string, properties: Record<string, unknown>, required: string[] = []): DefinicaoNegocio {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } }
}

export const PERIODOS = ['mes_atual', 'mes_passado', 'ultimos_7_dias', 'ultimos_30_dias', 'ultimos_90_dias', 'ano_atual'] as const
const PERIODO_SCHEMA = {
  type: 'string',
  pattern: `^(${PERIODOS.join('|')}|[0-9]{4}-[0-9]{2})$`,
  description: `Período: ${PERIODOS.join(', ')} ou um mês AAAA-MM.`,
}
const ESTRATEGISTA_SCHEMA = { type: 'string', minLength: 2, maxLength: 60, description: 'Opcional: nome (ou parte) do estrategista responsável.' }
const LIMITE_SCHEMA = { type: 'integer', minimum: 1, maximum: 40, description: 'Quantos itens listar (padrão 15, máximo 40).' }
const DIA_SCHEMA = { type: 'string', pattern: '^(hoje|amanha|ontem|[0-9]{4}-[0-9]{2}-[0-9]{2})$' }

export const FILTROS_CONTRATO = ['inadimplentes', 'pausados', 'nao_iniciados', 'vencendo', 'novos', 'ativos', 'encerrados'] as const
export const FILTROS_CLIENTE = ['ativos', 'inativos', 'sem_contrato', 'novos', 'sem_estrategista'] as const
const STATUS_VENDA = ['abertas', 'pendente', 'em_atendimento', 'concluida', 'descartada'] as const

export const DEFINICOES_NEGOCIO: Record<NomeNegocio, DefinicaoNegocio> = {
  visao_geral: def('visao_geral', 'Números-chave da empresa numa chamada só: clientes ativos, contratos (ativos, inadimplentes, pausados, vencendo em 30 dias), conversas abertas/aguardando resposta, clientes insatisfeitos, vendas para cadastrar e demandas atrasadas. Use para "como estamos?".', {}),
  contratos_resumo: def('contratos_resumo', 'Panorama dos contratos: quantos por situação (ativo, inadimplente, pausado, não iniciado, cancelado, concluído) e por status interno, novos no período, vencendo nos próximos 30 dias, por estrategista e por produto. Valores (R$) só para quem tem acesso a contratos.', {
    periodo: { ...PERIODO_SCHEMA, description: `${PERIODO_SCHEMA.description} Define os "novos no período" (padrão mes_atual).` },
  }),
  listar_contratos: def('listar_contratos', 'Lista contratos de uma situação (ex.: quem está inadimplente, pausado, vencendo nos próximos 30 dias, novos no período), com o cliente (ref C1…) e o estrategista.', {
    filtro: { type: 'string', enum: FILTROS_CONTRATO, description: 'Qual situação listar.' },
    estrategista: ESTRATEGISTA_SCHEMA,
    periodo: { ...PERIODO_SCHEMA, description: 'Só para filtro "novos" (padrão mes_atual).' },
    limite: LIMITE_SCHEMA,
  }, ['filtro']),
  listar_clientes: def('listar_clientes', 'Totais de clientes (ativos/inativos) e uma lista filtrada: ativos, inativos, sem contrato, novos (cadastrados no período) ou sem estrategista. Pode filtrar por estrategista. Devolve a ref (C1…) de cada cliente.', {
    filtro: { type: 'string', enum: FILTROS_CLIENTE, description: 'Qual grupo listar (padrão ativos).' },
    estrategista: ESTRATEGISTA_SCHEMA,
    periodo: { ...PERIODO_SCHEMA, description: 'Só para filtro "novos" (padrão ultimos_30_dias).' },
    limite: LIMITE_SCHEMA,
  }),
  recebiveis_resumo: def('recebiveis_resumo', 'Previsão de recebimentos (parcelas dos contratos ativos) dos próximos meses, mês a mês, e o que cai nos próximos 7 dias. É previsão pelo cronograma do contrato: não confirma pagamento.', {
    meses: { type: 'integer', minimum: 1, maximum: 12, description: 'Quantos meses à frente, contando o atual (padrão 3).' },
  }),
  comissoes_resumo: def('comissoes_resumo', 'Comissões de um mês de referência: total por situação (prevista, aprovada, paga, postergada…) e por estrategista. Quem não é gestor de comissões vê só as próprias aprovadas/pagas, e só no privado.', {
    mes: { type: 'string', pattern: '^(atual|anterior|proximo|[0-9]{4}-[0-9]{2})$', description: '"atual", "anterior", "proximo" ou AAAA-MM (padrão atual).' },
  }),
  reunioes_periodo: def('reunioes_periodo', 'Reuniões de um período (até 92 dias): quantas agendadas, realizadas, canceladas, sem comparecimento (no-show) e que passaram sem registro; por pessoa que marcou; e a lista com cliente (ref).', {
    de: { ...DIA_SCHEMA, description: 'Início: hoje, amanha, ontem ou AAAA-MM-DD.' },
    ate: { ...DIA_SCHEMA, description: 'Fim (incluso): hoje, amanha, ontem ou AAAA-MM-DD. Padrão = o mesmo dia de "de".' },
    pessoa: { type: 'string', minLength: 2, maxLength: 60, description: 'Opcional: nome (ou parte) de quem marcou a reunião.' },
  }, ['de']),
  vendas_pendentes: def('vendas_pendentes', 'Fila de onboarding: vendas que chegaram pelo formulário dos closers e ainda precisam virar contrato (pendentes / em atendimento), há quanto tempo esperam e quem está atendendo.', {
    status: { type: 'string', enum: STATUS_VENDA, description: 'Padrão "abertas" (pendente + em atendimento).' },
    limite: LIMITE_SCHEMA,
  }),
  demandas_resumo: def('demandas_resumo', 'Demandas abertas do app Atendimento: quantas por etapa, prioridade e responsável, e as atrasadas/urgentes com o cliente (ref).', {
    responsavel: { type: 'string', minLength: 2, maxLength: 60, description: 'Opcional: nome (ou parte) do responsável.' },
  }),
}

/** Ferramentas deste módulo oferecidas à IA conforme o escopo. Restrito → nenhuma. */
export function ferramentasNegocio(e: EscopoAgente): DefinicaoNegocio[] {
  if (e.modo !== 'normal') return []
  return (Object.keys(DEFINICOES_NEGOCIO) as NomeNegocio[])
    // Agenda suspensa até a integração estar configurada; mantém a implementação dormente.
    .filter((n) => n !== 'reunioes_periodo')
    .filter((n) => n !== 'recebiveis_resumo' || temPermissao(e, 'contratos'))
    .filter((n) => n !== 'comissoes_resumo' || temPermissao(e, 'comissoes') || ehPrivado(e))
    .filter((n) => n !== 'vendas_pendentes' || temPermissao(e, 'onboarding'))
    .filter((n) => n !== 'demandas_resumo' || temPermissao(e, 'atendimento'))
    .map((n) => DEFINICOES_NEGOCIO[n])
}

export function ehFerramentaNegocio(nome: string): nome is NomeNegocio {
  return Object.prototype.hasOwnProperty.call(DEFINICOES_NEGOCIO, nome)
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

type Saida = Record<string, unknown>
type Args = Record<string, unknown>

const LIMITE_PADRAO = 15
const LIMITE_MAX = 40
const LOTE_IN = 150
const MAX_LINHAS = 5000

function erro(texto: string): Saida { return { erro: texto } }

function lerArgs(bruto: unknown): Args | null {
  if (bruto === undefined || bruto === null || bruto === '') return {}
  let v: unknown = bruto
  if (typeof bruto === 'string') {
    try { v = JSON.parse(bruto) } catch { return null }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Args : null
}

function checar<T>(r: { data: unknown; error: unknown }): T {
  if (r.error) throw new Error('leitura')
  return (r.data ?? []) as T
}

/** Tabela/coluna ainda não existe (ambiente sem a migration) → null em vez de erro. */
function ausente(r: { error: unknown }): boolean {
  const code = (r.error as { code?: string } | null)?.code
  return code === 'PGRST205' || code === '42P01' || code === 'PGRST204' || code === '42703'
}

function limiteDe(bruto: unknown): number {
  return Number.isInteger(bruto) ? Math.min(LIMITE_MAX, Math.max(1, bruto as number)) : LIMITE_PADRAO
}

const reais = (n: number) => Math.round(n * 100) / 100

/**
 * Executa UMA ferramenta deste módulo. Devolve null quando o nome não é daqui
 * (o chamador tenta executarFerramenta). Nunca lança.
 */
export async function executarNegocio(nome: string, argsBrutos: unknown, ctx: ContextoFerramentas): Promise<Saida | null> {
  if (!ehFerramentaNegocio(nome)) return null
  const disponiveis = new Set(ferramentasNegocio(ctx.escopo).map((d) => d.function.name as string))
  if (!disponiveis.has(nome)) {
    return erro(ctx.escopo.modo !== 'normal'
      ? 'Neste grupo há pessoas de fora da equipe: não posso mostrar dados da empresa aqui.'
      : nome === 'reunioes_periodo' ? 'A integração de agenda ainda não está disponível.' : 'Ferramenta indisponível para quem perguntou.')
  }
  const args = lerArgs(argsBrutos)
  if (!args) return erro('Argumentos inválidos.')
  try {
    switch (nome) {
      case 'visao_geral': return await visaoGeral(ctx)
      case 'contratos_resumo': return await contratosResumo(args, ctx)
      case 'listar_contratos': return await listarContratos(args, ctx)
      case 'listar_clientes': return await listarClientes(args, ctx)
      case 'recebiveis_resumo': return await recebiveisResumo(args, ctx)
      case 'comissoes_resumo': return await comissoesResumo(args, ctx)
      case 'reunioes_periodo': return await reunioesPeriodo(args, ctx)
      case 'vendas_pendentes': return await vendasPendentes(args, ctx)
      case 'demandas_resumo': return await demandasResumo(args, ctx)
    }
  } catch (e) {
    console.error('wa-agente-ferr-negocio: falha', nome, (e as Error)?.name)
    return erro('Não consegui ler esses dados agora. Tente de novo em instantes.')
  }
  return erro('Ferramenta desconhecida.')
}

// ---------------------------------------------------------------------------
// Datas (fuso da empresa). Datas de contrato são "AAAA-MM-DD" (coluna date).
// ---------------------------------------------------------------------------

const dois = (n: number) => String(n).padStart(2, '0')

function isoUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`
}

export function hojeISO(agora: Date, fuso = FUSO_PADRAO): string {
  const p = partesNoFuso(agora, fuso)
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}`
}

export function somaDiasISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return isoUTC(new Date(Date.UTC(y, m - 1, d + n)))
}

/** Soma meses como o Recebíveis do app (dia que não existe transborda: 31/01 + 1 → 03/03). */
function somaMesesISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return isoUTC(new Date(Date.UTC(y, m - 1 + n, d)))
}

function dataValida(bruto: unknown): string | null {
  const s = String(bruto ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number(s.slice(0, 4)) < 2000) return null // 1901 = "sem data" do import antigo
  return s
}

const brData = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null)

/** Período → [de, ate] inclusivos em AAAA-MM-DD. null = inválido. */
export function periodoDe(bruto: unknown, agora: Date, padrao: typeof PERIODOS[number], fuso = FUSO_PADRAO): { de: string; ate: string; rotulo: string } | null {
  const s = bruto === undefined || bruto === null || bruto === '' ? padrao : String(bruto).trim()
  const hoje = hojeISO(agora, fuso)
  const [ano, mes] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))]
  const ultimoDia = (a: number, m: number) => isoUTC(new Date(Date.UTC(a, m, 0)))
  switch (s) {
    case 'mes_atual': return { de: `${ano}-${dois(mes)}-01`, ate: hoje, rotulo: `${dois(mes)}/${ano} (até hoje)` }
    case 'mes_passado': {
      const a = mes === 1 ? ano - 1 : ano
      const m = mes === 1 ? 12 : mes - 1
      return { de: `${a}-${dois(m)}-01`, ate: ultimoDia(a, m), rotulo: `${dois(m)}/${a}` }
    }
    case 'ultimos_7_dias': return { de: somaDiasISO(hoje, -6), ate: hoje, rotulo: 'últimos 7 dias' }
    case 'ultimos_30_dias': return { de: somaDiasISO(hoje, -29), ate: hoje, rotulo: 'últimos 30 dias' }
    case 'ultimos_90_dias': return { de: somaDiasISO(hoje, -89), ate: hoje, rotulo: 'últimos 90 dias' }
    case 'ano_atual': return { de: `${ano}-01-01`, ate: hoje, rotulo: `${ano} (até hoje)` }
  }
  const m = /^(\d{4})-(\d{2})$/.exec(s)
  if (!m) return null
  const [a, me] = [Number(m[1]), Number(m[2])]
  if (me < 1 || me > 12 || a < 2000 || a > 2100) return null
  return { de: `${a}-${dois(me)}-01`, ate: ultimoDia(a, me), rotulo: `${dois(me)}/${a}` }
}

/** "hoje"/"amanha"/"ontem"/"AAAA-MM-DD" → AAAA-MM-DD. */
function diaISO(bruto: unknown, agora: Date, fuso: string): string | null {
  const s = String(bruto ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const hoje = hojeISO(agora, fuso)
  if (s === 'hoje') return hoje
  if (s === 'amanha') return somaDiasISO(hoje, 1)
  if (s === 'ontem') return somaDiasISO(hoje, -1)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return somaDiasISO(s, 0) === s && Number(m[1]) >= 2000 ? s : null
}

/** Meia-noite (início) do dia ISO no fuso, em UTC. */
function inicioDoDia(iso: string, fuso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return limitesDoDia(new Date(Date.UTC(y, m - 1, d, 15)), fuso).inicio
}

// ---------------------------------------------------------------------------
// Leituras compartilhadas (cache por execução)
// ---------------------------------------------------------------------------

interface ContratoRow {
  id: string; cliente_id: string | null; cliente_nome: string | null; produto_nome: string | null
  estrategista_id: string | null; estrategista_nome_raw: string | null; status: string | null; status_secundario: string | null
  data_fechamento: string | null; data_assinatura: string | null; data_pagamento: string | null; vencimento: string | null
  plano_dias: number | null; valor_total: number | string | null; valor_parcela: number | string | null; num_parcelas: number | null
  pagamentos: unknown; criado_em: string | null
}

interface ClienteRow { id: string; nome: string | null; ativo: boolean | null; criado_em: string | null }

interface Cache {
  contratos?: ContratoRow[]
  clientes?: ClienteRow[]
  usuarios: Map<string, string | null>
}

const caches = new WeakMap<ContextoFerramentas, Cache>()
function cache(ctx: ContextoFerramentas): Cache {
  let c = caches.get(ctx)
  if (!c) { c = { usuarios: new Map() }; caches.set(ctx, c) }
  return c
}

const COLS_CONTRATO = 'id, cliente_id, cliente_nome, produto_nome, estrategista_id, estrategista_nome_raw, status, status_secundario, ' +
  'data_fechamento, data_assinatura, data_pagamento, vencimento, plano_dias, valor_total, valor_parcela, num_parcelas, pagamentos, criado_em'

/** Lê `tabela` do tenant inteiro (carteira total) ou só dos ids da carteira, em lotes. */
async function lerDaCarteira<T>(ctx: ContextoFerramentas, tabela: string, colunas: string, colCliente: string): Promise<T[]> {
  const { admin, escopo } = ctx
  if (escopo.total) {
    return checar<T[]>(await admin.from(tabela).select(colunas).eq('tenant_id', escopo.tenantId).limit(MAX_LINHAS))
  }
  const ids = [...escopo.clientIds].slice(0, 3000)
  const out: T[] = []
  for (let i = 0; i < ids.length; i += LOTE_IN) {
    out.push(...checar<T[]>(await admin.from(tabela).select(colunas)
      .eq('tenant_id', escopo.tenantId).in(colCliente, ids.slice(i, i + LOTE_IN)).limit(MAX_LINHAS)))
  }
  return out
}

/** Contratos visíveis: da carteira; sem cliente vinculado só para quem vê tudo. */
async function contratosVisiveis(ctx: ContextoFerramentas): Promise<ContratoRow[]> {
  const c = cache(ctx)
  if (!c.contratos) {
    const linhas = await lerDaCarteira<ContratoRow>(ctx, 'contratos', COLS_CONTRATO, 'cliente_id')
    c.contratos = linhas.filter((l) => (l.cliente_id ? podeVerCliente(ctx.escopo, l.cliente_id) : podeVerSemCliente(ctx.escopo)))
  }
  return c.contratos
}

async function clientesVisiveis(ctx: ContextoFerramentas): Promise<ClienteRow[]> {
  const c = cache(ctx)
  if (!c.clientes) {
    const linhas = await lerDaCarteira<ClienteRow>(ctx, 'clients', 'id, nome, ativo, criado_em', 'id')
    c.clientes = linhas.filter((l) => podeVerCliente(ctx.escopo, l.id))
  }
  return c.clientes
}

/** Nomes de pessoas da equipe (users do tenant). */
async function nomesDeUsuarios(ctx: ContextoFerramentas, ids: (string | null | undefined)[]): Promise<Map<string, string | null>> {
  const c = cache(ctx)
  const faltam = [...new Set(ids.filter((x): x is string => !!x && !c.usuarios.has(x)))]
  for (let i = 0; i < faltam.length; i += LOTE_IN) {
    const lote = faltam.slice(i, i + LOTE_IN)
    const linhas = checar<{ id: string; nome: string | null }[]>(await ctx.admin.from('users').select('id, nome')
      .eq('tenant_id', ctx.escopo.tenantId).in('id', lote))
    for (const id of lote) c.usuarios.set(id, null)
    for (const l of linhas) c.usuarios.set(l.id, nomeSeguro(l.nome, 60))
  }
  return c.usuarios
}

/** Pessoas da equipe cujo nome contém o termo. null = termo inválido. */
async function usuariosPorNome(ctx: ContextoFerramentas, bruto: unknown): Promise<Set<string> | null> {
  const termo = termoBusca(bruto)
  if (!termo) return null
  const alvo = chaveNome(termo)
  const linhas = checar<{ id: string; nome: string | null }[]>(await ctx.admin.from('users').select('id, nome')
    .eq('tenant_id', ctx.escopo.tenantId).limit(1000))
  const c = cache(ctx)
  for (const l of linhas) c.usuarios.set(l.id, nomeSeguro(l.nome, 60))
  return new Set(linhas.filter((l) => chaveNome(l.nome).includes(alvo)).map((l) => l.id))
}

// ---------------------------------------------------------------------------
// Regras de contrato (puras — exportadas para o Vitest)
// ---------------------------------------------------------------------------

export type CategoriaContrato = 'ativo' | 'inadimplente' | 'pausado' | 'nao_iniciado' | 'cancelado' | 'concluido'

function semAcento(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Situação do contrato a partir de status (sistema) + status_secundario (rótulo do time). */
export function categoriaContrato(c: Pick<ContratoRow, 'status' | 'status_secundario'>): CategoriaContrato {
  const st = semAcento(c.status)
  const sec = semAcento(c.status_secundario)
  if (st === 'cancelado' || st === 'distrato' || st === 'rescindido') return 'cancelado'
  if (statusEncerrado(st)) return 'concluido'
  if (st === 'rascunho' || sec === 'nao iniciado') return 'nao_iniciado'
  if (st === 'pausado' || sec === 'pausado') return 'pausado'
  if (sec === 'inadimplente') return 'inadimplente'
  return 'ativo'
}

/** Vigente = ativo, inadimplente ou pausado (ainda tem vínculo). */
export const vigente = (cat: CategoriaContrato) => cat === 'ativo' || cat === 'inadimplente' || cat === 'pausado'

/** Data de referência do contrato: assinatura > pagamento da entrada > fechamento > criação. */
export function dataDoContrato(c: Pick<ContratoRow, 'data_assinatura' | 'data_pagamento' | 'data_fechamento' | 'criado_em'>): string | null {
  return dataValida(c.data_assinatura) ?? dataValida(c.data_pagamento) ?? dataValida(c.data_fechamento) ?? dataValida(c.criado_em)
}

/** Fim do plano: início + plano_dias (como os alertas); sem isso, o campo vencimento/renovação. */
export function fimDoContrato(c: Pick<ContratoRow, 'data_assinatura' | 'data_fechamento' | 'plano_dias' | 'vencimento'>): string | null {
  const inicio = dataValida(c.data_assinatura) ?? dataValida(c.data_fechamento)
  const dias = Number(c.plano_dias)
  if (inicio && Number.isFinite(dias) && dias > 0) return somaDiasISO(inicio, dias)
  return dataValida(c.vencimento)
}

function nomeEstrategista(c: ContratoRow, nomes: Map<string, string | null>): string {
  return (c.estrategista_id ? nomes.get(c.estrategista_id) : null) ?? nomeSeguro(c.estrategista_nome_raw, 60) ?? 'Sem estrategista'
}

function contarPor<T>(itens: readonly T[], chave: (t: T) => string, valor?: (t: T) => number) {
  const m = new Map<string, { n: number; v: number }>()
  for (const i of itens) {
    const k = chave(i)
    const cur = m.get(k) ?? { n: 0, v: 0 }
    cur.n += 1
    cur.v += valor ? valor(i) : 0
    m.set(k, cur)
  }
  return [...m.entries()].sort((a, b) => b[1].n - a[1].n || b[1].v - a[1].v || a[0].localeCompare(b[0]))
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

// ---- contratos_resumo -------------------------------------------------------

async function contratosResumo(args: Args, ctx: ContextoFerramentas): Promise<Saida> {
  const fuso = ctx.fuso ?? FUSO_PADRAO
  const per = periodoDe(args.periodo, ctx.agora, 'mes_atual', fuso)
  if (!per) return erro('Período inválido.')
  const comValores = temPermissao(ctx.escopo, 'contratos')
  const todos = await contratosVisiveis(ctx)
  const nomes = await nomesDeUsuarios(ctx, todos.map((c) => c.estrategista_id))
  const hoje = hojeISO(ctx.agora, fuso)
  const em30 = somaDiasISO(hoje, 30)
  const cat = new Map(todos.map((c) => [c.id, categoriaContrato(c)]))
  const vig = todos.filter((c) => vigente(cat.get(c.id)!))
  const ativosValor = todos.filter((c) => cat.get(c.id) === 'ativo' || cat.get(c.id) === 'inadimplente')
  const novos = todos.filter((c) => { const d = dataDoContrato(c); return !!d && d >= per.de && d <= per.ate })
  const vencendo = vig.filter((c) => { const f = fimDoContrato(c); return !!f && f >= hoje && f <= em30 })
  const porCat: Record<CategoriaContrato, number> = { ativo: 0, inadimplente: 0, pausado: 0, nao_iniciado: 0, cancelado: 0, concluido: 0 }
  for (const c of todos) porCat[cat.get(c.id)!] += 1
  const valor = (c: ContratoRow) => num(c.valor_total)
  const total = ativosValor.reduce((s, c) => s + valor(c), 0)
  return {
    carteira: ctx.escopo.total ? 'empresa toda' : 'carteira de quem perguntou',
    total_contratos: todos.length,
    por_situacao: porCat,
    status_internos: contarPor(todos.filter((c) => c.status_secundario), (c) => nomeSeguro(c.status_secundario, 40) ?? '?')
      .slice(0, 12).map(([k, x]) => ({ status: k, n: x.n })),
    novos: { periodo: per.rotulo, quantidade: novos.length, ...(comValores ? { valor: reais(novos.reduce((s, c) => s + valor(c), 0)) } : {}) },
    vencendo_30_dias: vencendo.length,
    por_estrategista: contarPor(vig, (c) => nomeEstrategista(c, nomes), valor).slice(0, 15)
      .map(([k, x]) => ({ estrategista: k, vigentes: x.n, ...(comValores ? { valor: reais(x.v) } : {}) })),
    por_produto: contarPor(vig, (c) => nomeSeguro(c.produto_nome, 60) ?? 'Sem produto', valor).slice(0, 10)
      .map(([k, x]) => ({ produto: k, vigentes: x.n, ...(comValores ? { valor: reais(x.v) } : {}) })),
    ...(comValores
      ? { valor_ativos: reais(total), ticket_medio: ativosValor.length ? reais(total / ativosValor.length) : 0, obs_valor: 'valor total dos contratos ativos + inadimplentes' }
      : { aviso: 'Valores ocultos: quem perguntou não tem acesso a contratos.' }),
  }
}

// ---- listar_contratos -------------------------------------------------------

async function listarContratos(args: Args, ctx: ContextoFerramentas): Promise<Saida> {
  const filtro = typeof args.filtro === 'string' && (FILTROS_CONTRATO as readonly string[]).includes(args.filtro) ? args.filtro : null
  if (!filtro) return erro(`Filtro inválido: use ${FILTROS_CONTRATO.join(', ')}.`)
  const fuso = ctx.fuso ?? FUSO_PADRAO
  const per = periodoDe(args.periodo, ctx.agora, 'mes_atual', fuso)
  if (!per) return erro('Período inválido.')
  const limite = limiteDe(args.limite)
  let pessoas: Set<string> | null = null
  if (args.estrategista !== undefined) {
    pessoas = await usuariosPorNome(ctx, args.estrategista)
    if (!pessoas) return erro('Informe pelo menos 2 letras do nome do estrategista.')
  }
  const comValores = temPermissao(ctx.escopo, 'contratos')
  const hoje = hojeISO(ctx.agora, fuso)
  const em30 = somaDiasISO(hoje, 30)
  const todos = await contratosVisiveis(ctx)
  const nomes = await nomesDeUsuarios(ctx, todos.map((c) => c.estrategista_id))
  const termoEstr = pessoas ? chaveNome(termoBusca(args.estrategista)) : ''
  const achados = todos.filter((c) => {
    const cat = categoriaContrato(c)
    if (pessoas && !(c.estrategista_id && pessoas.has(c.estrategista_id)) && !chaveNome(c.estrategista_nome_raw).includes(termoEstr)) return false
    switch (filtro) {
      case 'inadimplentes': return cat === 'inadimplente'
      case 'pausados': return cat === 'pausado'
      case 'nao_iniciados': return cat === 'nao_iniciado'
      case 'ativos': return cat === 'ativo'
      case 'encerrados': return cat === 'cancelado' || cat === 'concluido'
      case 'vencendo': { const f = fimDoContrato(c); return vigente(cat) && !!f && f >= hoje && f <= em30 }
      case 'novos': { const d = dataDoContrato(c); return !!d && d >= per.de && d <= per.ate }
    }
    return false
  })
  const ordenados = filtro === 'vencendo'
    ? achados.sort((a, b) => String(fimDoContrato(a)).localeCompare(String(fimDoContrato(b))))
    : achados.sort((a, b) => String(dataDoContrato(b) ?? '').localeCompare(String(dataDoContrato(a) ?? '')))
  return {
    filtro,
    ...(filtro === 'novos' ? { periodo: per.rotulo } : {}),
    quantidade: achados.length,
    contratos: ordenados.slice(0, limite).map((c) => ({
      cliente: nomeSeguro(c.cliente_nome) ?? 'Cliente sem nome',
      ...(c.cliente_id ? { ref: ctx.refs.ref(c.cliente_id) } : { sem_cadastro: true }),
      produto: nomeSeguro(c.produto_nome, 60),
      situacao: categoriaContrato(c),
      status_interno: nomeSeguro(c.status_secundario, 40),
      estrategista: nomeEstrategista(c, nomes),
      desde: brData(dataDoContrato(c)),
      termina: brData(fimDoContrato(c)),
      ...(comValores ? { valor_total: reais(num(c.valor_total)) } : {}),
    })),
    ...(achados.length > limite ? { mais: achados.length - limite } : {}),
  }
}

// ---- listar_clientes --------------------------------------------------------

async function listarClientes(args: Args, ctx: ContextoFerramentas): Promise<Saida> {
  const filtro = args.filtro === undefined ? 'ativos'
    : typeof args.filtro === 'string' && (FILTROS_CLIENTE as readonly string[]).includes(args.filtro) ? args.filtro : null
  if (!filtro) return erro(`Filtro inválido: use ${FILTROS_CLIENTE.join(', ')}.`)
  const fuso = ctx.fuso ?? FUSO_PADRAO
  const per = periodoDe(args.periodo, ctx.agora, 'ultimos_30_dias', fuso)
  if (!per) return erro('Período inválido.')
  const limite = limiteDe(args.limite)
  let pessoas: Set<string> | null = null
  if (args.estrategista !== undefined) {
    pessoas = await usuariosPorNome(ctx, args.estrategista)
    if (!pessoas) return erro('Informe pelo menos 2 letras do nome do estrategista.')
  }
  const clientes = await clientesVisiveis(ctx)
  const atribs = (await lerDaCarteira<{ client_id: string; user_id: string; tipo: string | null; ativo: boolean | null }>(
    ctx, 'client_assignments', 'client_id, user_id, tipo, ativo', 'client_id'))
    .filter((a) => a.ativo !== false && (a.tipo ?? 'estrategista') === 'estrategista')
  const estrDe = new Map<string, string[]>()
  for (const a of atribs) estrDe.set(a.client_id, [...(estrDe.get(a.client_id) ?? []), a.user_id])
  const nomes = await nomesDeUsuarios(ctx, atribs.map((a) => a.user_id))
  let comContrato: Set<string> | null = null
  if (filtro === 'sem_contrato') comContrato = new Set((await contratosDosClientesAtendidos(
    ctx.admin, ctx.escopo.tenantId, clientes.map((c) => c.id),
  )).map((c) => c.cliente_id))
  const base = pessoas ? clientes.filter((c) => (estrDe.get(c.id) ?? []).some((u) => pessoas!.has(u))) : clientes
  const achados = base.filter((c) => {
    switch (filtro) {
      case 'ativos': return c.ativo !== false
      case 'inativos': return c.ativo === false
      case 'sem_contrato': return !comContrato!.has(c.id)
      case 'sem_estrategista': return (estrDe.get(c.id) ?? []).length === 0
      case 'novos': {
        const quando = c.criado_em ? new Date(c.criado_em) : null
        if (!quando || Number.isNaN(quando.getTime())) return false
        const d = hojeISO(quando, fuso)
        return d >= per.de && d <= per.ate
      }
    }
    return false
  }).sort((a, b) => filtro === 'novos'
    ? String(b.criado_em ?? '').localeCompare(String(a.criado_em ?? ''))
    : String(a.nome ?? '').localeCompare(String(b.nome ?? '')))
  return {
    carteira: ctx.escopo.total ? 'empresa toda' : 'carteira de quem perguntou',
    totais: { ativos: base.filter((c) => c.ativo !== false).length, inativos: base.filter((c) => c.ativo === false).length },
    filtro,
    ...(filtro === 'novos' ? { periodo: per.rotulo } : {}),
    quantidade: achados.length,
    clientes: achados.slice(0, limite).map((c) => ({
      ref: ctx.refs.ref(c.id),
      nome: nomeSeguro(c.nome) ?? 'Cliente sem nome',
      ativo: c.ativo !== false,
      estrategista: (estrDe.get(c.id) ?? []).map((u) => nomes.get(u)).filter(Boolean).slice(0, 3),
    })),
    ...(achados.length > limite ? { mais: achados.length - limite } : {}),
  }
}

// ---- recebiveis_resumo ------------------------------------------------------

export interface Parcela { data: string; valor: number; contrato: string }

/** Parcelas do cronograma (mesma regra do Recebíveis do app, src/pages/contratos/fluxoFuturo.ts). */
export function parcelasDoContrato(c: Pick<ContratoRow, 'id' | 'status' | 'pagamentos' | 'data_assinatura' | 'data_fechamento' | 'num_parcelas' | 'valor_parcela'>): Parcela[] {
  if ((c.status ?? 'ativo') !== 'ativo') return []
  const pags = Array.isArray(c.pagamentos) ? c.pagamentos as Record<string, unknown>[] : []
  const out: Parcela[] = []
  if (pags.length > 0) {
    for (const p of pags) {
      const sinal = String(p?.sinal ?? '').toLowerCase()
      if (sinal.includes('entrada') || sinal.includes('sinal')) continue
      const data = String(p?.data ?? '').slice(0, 10)
      const valor = num(p?.valor)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || valor <= 0) continue
      out.push({ data, valor, contrato: c.id })
    }
    return out
  }
  const assin = String(c.data_assinatura || c.data_fechamento || '').slice(0, 10)
  const n = num(c.num_parcelas)
  const vp = num(c.valor_parcela)
  if (/^\d{4}-\d{2}-\d{2}$/.test(assin) && n > 1 && vp > 0) {
    for (let k = 1; k <= Math.min(n, 120); k++) out.push({ data: somaMesesISO(assin, k), valor: vp, contrato: c.id })
  }
  return out
}

async function recebiveisResumo(args: Args, ctx: ContextoFerramentas): Promise<Saida> {
  if (!temPermissao(ctx.escopo, 'contratos')) return erro('Quem perguntou não tem acesso a contratos.')
  const meses = Number.isInteger(args.meses) ? Math.min(12, Math.max(1, args.meses as number)) : 3
  const fuso = ctx.fuso ?? FUSO_PADRAO
  const hoje = hojeISO(ctx.agora, fuso)
  const em7 = somaDiasISO(hoje, 6)
  const [a, m] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))]
  const chaves: string[] = []
  for (let i = 0; i < meses; i++) chaves.push(isoUTC(new Date(Date.UTC(a, m - 1 + i, 1))).slice(0, 7))
  const contratos = await contratosVisiveis(ctx)
  const futuras = contratos.flatMap(parcelasDoContrato).filter((p) => p.data >= hoje && chaves.includes(p.data.slice(0, 7)))
  const porMes = chaves.map((k) => {
    const ps = futuras.filter((p) => p.data.startsWith(k))
    return { mes: `${k.slice(5, 7)}/${k.slice(0, 4)}`, valor: reais(ps.reduce((s, p) => s + p.valor, 0)), parcelas: ps.length, contratos: new Set(ps.map((p) => p.contrato)).size }
  })
  const semana = futuras.filter((p) => p.data <= em7)
  const porContrato = new Map(contratos.map((c) => [c.id, c]))
  return {
    a_partir_de: brData(hoje),
    por_mes: porMes,
    total: reais(futuras.reduce((s, p) => s + p.valor, 0)),
    proximos_7_dias: {
      valor: reais(semana.reduce((s, p) => s + p.valor, 0)),
      parcelas: semana.sort((x, y) => x.data.localeCompare(y.data)).slice(0, 15).map((p) => {
        const c = porContrato.get(p.contrato)
        return {
          dia: brData(p.data), valor: reais(p.valor), cliente: nomeSeguro(c?.cliente_nome) ?? 'Cliente sem nome',
          ...(c?.cliente_id ? { ref: ctx.refs.ref(c.cliente_id) } : {}),
        }
      }),
    },
    aviso: 'Previsão pelo cronograma dos contratos ativos (sem a entrada). Não confirma se foi pago.',
  }
}

// ---- comissoes_resumo -------------------------------------------------------

interface ComissaoRow { estrategista_id: string | null; status: string | null; valor_calculado: number | string | null; valor_final: number | string | null; eh_bonus: boolean | null }

export function mesReferencia(bruto: unknown, agora: Date, fuso = FUSO_PADRAO): string | null {
  const s = bruto === undefined || bruto === null || bruto === '' ? 'atual' : String(bruto).trim().toLowerCase()
  const hoje = hojeISO(agora, fuso)
  const [a, m] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))]
  const desloc = s === 'atual' ? 0 : s === 'anterior' ? -1 : s === 'proximo' ? 1 : null
  if (desloc !== null) return isoUTC(new Date(Date.UTC(a, m - 1 + desloc, 1)))
  const r = /^(\d{4})-(\d{2})$/.exec(s)
  if (!r || Number(r[2]) < 1 || Number(r[2]) > 12 || Number(r[1]) < 2000) return null
  return `${r[1]}-${r[2]}-01`
}

async function comissoesResumo(args: Args, ctx: ContextoFerramentas): Promise<Saida> {
  const gestor = temPermissao(ctx.escopo, 'comissoes')
  const proprias = !gestor && ehPrivado(ctx.escopo)
  if (!gestor && !proprias) return erro('Comissões só para gestor de comissões (ou as suas, no privado).')
  const mes = mesReferencia(args.mes, ctx.agora, ctx.fuso ?? FUSO_PADRAO)
  if (!mes) return erro('Mês inválido: use atual, anterior, proximo ou AAAA-MM.')
  let q = ctx.admin.from('comissoes').select('estrategista_id, status, valor_calculado, valor_final, eh_bonus')
    .eq('tenant_id', ctx.escopo.tenantId).eq('mes_referencia', mes)
  if (proprias) q = q.eq('estrategista_id', ctx.escopo.userId!).in('status', ['aprovada', 'paga'])
  const r = await q.limit(MAX_LINHAS)
  if (r.error && ausente(r)) return { aviso: 'O módulo de comissões não está instalado nesta empresa.' }
  const linhas = checar<ComissaoRow[]>(r)
  const valor = (c: ComissaoRow) => num(c.valor_final ?? c.valor_calculado)
  const rotulo = `${mes.slice(5, 7)}/${mes.slice(0, 4)}`
  if (linhas.length === 0) return { mes: rotulo, quantidade: 0, aviso: proprias ? 'Nenhuma comissão sua aprovada ou paga neste mês.' : 'Nenhuma comissão neste mês.' }
  const porStatus = Object.fromEntries(contarPor(linhas, (c) => c.status ?? 'sem_status', valor).map(([k, x]) => [k, { n: x.n, valor: reais(x.v) }]))
  const base = { mes: rotulo, quantidade: linhas.length, total: reais(linhas.reduce((s, c) => s + valor(c), 0)), por_status: porStatus }
  if (proprias) return { ...base, escopo: 'só as suas (aprovadas e pagas)' }
  const nomes = await nomesDeUsuarios(ctx, linhas.map((c) => c.estrategista_id))
  const porPessoa = new Map<string, { total: number; prevista: number; aprovada: number; paga: number; n: number }>()
  for (const c of linhas) {
    const k = (c.estrategista_id ? nomes.get(c.estrategista_id) : null) ?? 'Sem estrategista'
    const cur = porPessoa.get(k) ?? { total: 0, prevista: 0, aprovada: 0, paga: 0, n: 0 }
    if (c.status !== 'cancelada') cur.total += valor(c)
    if (c.status === 'prevista' || c.status === 'aprovada' || c.status === 'paga') cur[c.status] += valor(c)
    cur.n += 1
    porPessoa.set(k, cur)
  }
  return {
    ...base,
    bonus: linhas.filter((c) => c.eh_bonus === true).length,
    por_estrategista: [...porPessoa.entries()].sort((x, y) => y[1].total - x[1].total).slice(0, 20).map(([k, x]) => ({
      estrategista: k, itens: x.n, total: reais(x.total), prevista: reais(x.prevista), aprovada: reais(x.aprovada), paga: reais(x.paga),
    })),
    obs: 'total por pessoa exclui canceladas; valor = valor final (ou calculado, se não editado).',
  }
}

// ---- reunioes_periodo -------------------------------------------------------

/** Contatos restritos (grupo interno do admin) entre os ids: reunião ligada a eles nunca aparece. */
async function contatosRestritos(ctx: ContextoFerramentas, ids: (string | null)[]): Promise<Set<string>> {
  const contatos = [...new Set(ids.filter((x): x is string => !!x))]
  const restritos = new Set<string>()
  for (let i = 0; i < contatos.length; i += LOTE_IN) {
    const r = checar<{ id: string; restrito_admin: boolean | null }[]>(await ctx.admin.from('chat_contacts').select('id, restrito_admin')
      .eq('tenant_id', ctx.escopo.tenantId).in('id', contatos.slice(i, i + LOTE_IN)))
    for (const c of r) if (c.restrito_admin === true) restritos.add(c.id)
  }
  return restritos
}

interface ReuniaoRow {
  id: string; client_id: string | null; contact_id: string | null; guest_name: string | null; status: string | null
  scheduled_at: string | null; created_by: string | null; duration_seconds: number | null; meeting_type: string | null
}

const STATUS_REUNIAO: Record<string, string> = {
  scheduled: 'agendada', active: 'em_andamento', completed: 'realizada', no_show: 'no_show', cancelled: 'cancelada',
}

async function reunioesPeriodo(args: Args, ctx: ContextoFerramentas): Promise<Saida> {
  const fuso = ctx.fuso ?? FUSO_PADRAO
  const de = diaISO(args.de, ctx.agora, fuso)
  const ate = args.ate === undefined ? de : diaISO(args.ate, ctx.agora, fuso)
  if (!de || !ate) return erro('Datas inválidas: use hoje, amanha, ontem ou AAAA-MM-DD.')
  if (ate < de) return erro('"ate" é antes de "de".')
  if (somaDiasISO(de, 92) < ate) return erro('Período longo demais: no máximo 92 dias.')
  let pessoas: Set<string> | null = null
  if (args.pessoa !== undefined) {
    pessoas = await usuariosPorNome(ctx, args.pessoa)
    if (!pessoas) return erro('Informe pelo menos 2 letras do nome da pessoa.')
  }
  const t = ctx.escopo.tenantId
  const linhas = checar<ReuniaoRow[]>(await ctx.admin.from('meetings')
    .select('id, client_id, contact_id, guest_name, status, scheduled_at, created_by, duration_seconds, meeting_type')
    .eq('tenant_id', t)
    .gte('scheduled_at', inicioDoDia(de, fuso).toISOString())
    .lt('scheduled_at', inicioDoDia(somaDiasISO(ate, 1), fuso).toISOString())
    .order('scheduled_at', { ascending: true }).limit(1000))
  const restritos = await contatosRestritos(ctx, linhas.map((l) => l.contact_id))
  const visiveis = linhas
    .filter((l) => l.meeting_type !== 'test')
    .filter((l) => !(l.contact_id && restritos.has(l.contact_id)))
    .filter((l) => (l.client_id ? podeVerCliente(ctx.escopo, l.client_id) : podeVerSemCliente(ctx.escopo)))
    .filter((l) => !pessoas || (l.created_by !== null && pessoas.has(l.created_by)))
  const ids = [...new Set(visiveis.map((l) => l.client_id).filter((x): x is string => !!x))]
  const nomeCli = new Map<string, string | null>()
  for (let i = 0; i < ids.length; i += LOTE_IN) {
    const r = checar<{ id: string; nome: string | null }[]>(await ctx.admin.from('clients').select('id, nome')
      .eq('tenant_id', t).in('id', ids.slice(i, i + LOTE_IN)))
    for (const c of r) nomeCli.set(c.id, nomeSeguro(c.nome))
  }
  const nomes = await nomesDeUsuarios(ctx, visiveis.map((l) => l.created_by))
  const agoraIso = ctx.agora.toISOString()
  const situacao = (l: ReuniaoRow) => (l.status === 'scheduled' && String(l.scheduled_at) < agoraIso ? 'passou_sem_registro' : STATUS_REUNIAO[l.status ?? ''] ?? 'outra')
  const contagem: Record<string, number> = {}
  for (const l of visiveis) contagem[situacao(l)] = (contagem[situacao(l)] ?? 0) + 1
  const quem = (l: ReuniaoRow) => (l.created_by ? nomes.get(l.created_by) : null) ?? 'Não informado'
  const fmt = (iso: string | null) => {
    if (!iso) return null
    const p = partesNoFuso(new Date(iso), fuso)
    return `${dois(p.dia)}/${dois(p.mes)} ${dois(p.hora)}:${dois(p.minuto)}`
  }
  return {
    de: brData(de), ate: brData(ate),
    quantidade: visiveis.length,
    por_situacao: contagem,
    por_pessoa: contarPor(visiveis, quem).slice(0, 15).map(([k, x]) => ({ pessoa: k, reunioes: x.n })),
    reunioes: visiveis.slice(0, 30).map((l) => ({
      quando: fmt(l.scheduled_at),
      cliente: (l.client_id ? nomeCli.get(l.client_id) : null) ?? nomeSeguro(l.guest_name) ?? 'Sem cliente',
      ...(l.client_id ? { ref: ctx.refs.ref(l.client_id) } : {}),
      situacao: situacao(l),
      marcada_por: quem(l),
      ...(l.duration_seconds ? { duracao_min: Math.round(l.duration_seconds / 60) } : {}),
    })),
    ...(visiveis.length > 30 ? { mais: visiveis.length - 30 } : {}),
  }
}

// ---- vendas_pendentes -------------------------------------------------------

interface VendaRow {
  cliente_nome: string | null; produto_nome: string | null; closer_nome: string | null; status: string | null
  criado_em: string | null; atendido_por: string | null; valor_total_venda: number | string | null; sincronizacao_erro: string | null
}

async function vendasPendentes(args: Args, ctx: ContextoFerramentas): Promise<Saida> {
  if (!temPermissao(ctx.escopo, 'onboarding')) return erro('Quem perguntou não tem acesso ao onboarding de vendas.')
  const status = args.status === undefined ? 'abertas'
    : typeof args.status === 'string' && (STATUS_VENDA as readonly string[]).includes(args.status) ? args.status : null
  if (!status) return erro(`Status inválido: use ${STATUS_VENDA.join(', ')}.`)
  const limite = limiteDe(args.limite)
  const r = await ctx.admin.from('vendas_pendentes')
    .select('cliente_nome, produto_nome, closer_nome, status, criado_em, atendido_por, valor_total_venda, sincronizacao_erro')
    .eq('tenant_id', ctx.escopo.tenantId).order('criado_em', { ascending: true }).limit(MAX_LINHAS)
  if (r.error && ausente(r)) return { aviso: 'O onboarding de vendas não está instalado nesta empresa.' }
  const linhas = checar<VendaRow[]>(r)
  const porStatus: Record<string, number> = {}
  for (const l of linhas) porStatus[l.status ?? '?'] = (porStatus[l.status ?? '?'] ?? 0) + 1
  const alvo = linhas.filter((l) => (status === 'abertas' ? l.status === 'pendente' || l.status === 'em_atendimento' : l.status === status))
  const nomes = await nomesDeUsuarios(ctx, alvo.slice(0, limite).map((l) => l.atendido_por))
  const comValores = temPermissao(ctx.escopo, 'contratos')
  const dias = (iso: string | null) => (iso ? Math.max(0, Math.floor((ctx.agora.getTime() - new Date(iso).getTime()) / 86_400_000)) : null)
  const lista = status === 'concluida' || status === 'descartada' ? [...alvo].reverse() : alvo // abertas: mais antigas primeiro
  return {
    por_status: porStatus,
    filtro: status,
    quantidade: alvo.length,
    ...(status === 'abertas' && alvo[0] ? { mais_antiga_dias: dias(alvo[0].criado_em) } : {}),
    com_erro_de_sincronizacao: alvo.filter((l) => l.sincronizacao_erro).length,
    vendas: lista.slice(0, limite).map((l) => ({
      cliente: nomeSeguro(l.cliente_nome) ?? 'Sem nome',
      produto: nomeSeguro(l.produto_nome, 60),
      closer: nomeSeguro(l.closer_nome, 60),
      status: l.status,
      dias_esperando: dias(l.criado_em),
      atendido_por: l.atendido_por ? nomes.get(l.atendido_por) ?? null : null,
      ...(comValores ? { valor: reais(num(l.valor_total_venda)) } : {}),
    })),
    ...(lista.length > limite ? { mais: lista.length - limite } : {}),
  }
}

// ---- demandas_resumo --------------------------------------------------------

interface DemandaRow {
  codigo: string | null; cliente_id: string | null; etapa_id: string | null; titulo: string | null; prioridade: string | null
  prazo: string | null; responsavel_id: string | null; concluida_em: string | null
}

async function demandasAbertas(ctx: ContextoFerramentas): Promise<{ abertas: DemandaRow[]; etapas: Map<string, string | null> } | null> {
  const t = ctx.escopo.tenantId
  const re = await ctx.admin.from('atendimento_etapas').select('id, nome, is_final').eq('tenant_id', t).limit(200)
  if (re.error && ausente(re)) return null
  const etapas = checar<{ id: string; nome: string | null; is_final: boolean | null }[]>(re)
  const finais = new Set(etapas.filter((e) => e.is_final === true).map((e) => e.id))
  const linhas = checar<DemandaRow[]>(await ctx.admin.from('atendimento_demandas')
    .select('codigo, cliente_id, etapa_id, titulo, prioridade, prazo, responsavel_id, concluida_em')
    .eq('tenant_id', t).is('concluida_em', null).limit(MAX_LINHAS))
  const abertas = linhas
    .filter((d) => !d.concluida_em && !(d.etapa_id && finais.has(d.etapa_id)))
    .filter((d) => (d.cliente_id ? podeVerCliente(ctx.escopo, d.cliente_id) : podeVerSemCliente(ctx.escopo)))
  return { abertas, etapas: new Map(etapas.map((e) => [e.id, nomeSeguro(e.nome, 40)])) }
}

async function demandasResumo(args: Args, ctx: ContextoFerramentas): Promise<Saida> {
  if (!temPermissao(ctx.escopo, 'atendimento')) return erro('Quem perguntou não tem acesso ao Atendimento.')
  let pessoas: Set<string> | null = null
  if (args.responsavel !== undefined) {
    pessoas = await usuariosPorNome(ctx, args.responsavel)
    if (!pessoas) return erro('Informe pelo menos 2 letras do nome do responsável.')
  }
  const d = await demandasAbertas(ctx)
  if (!d) return { aviso: 'O app Atendimento não está instalado nesta empresa.' }
  const abertas = pessoas ? d.abertas.filter((x) => x.responsavel_id && pessoas!.has(x.responsavel_id)) : d.abertas
  const hoje = hojeISO(ctx.agora, ctx.fuso ?? FUSO_PADRAO)
  const atrasada = (x: DemandaRow) => !!dataValida(x.prazo) && String(x.prazo) < hoje
  const nomes = await nomesDeUsuarios(ctx, abertas.map((x) => x.responsavel_id))
  const cliIds = [...new Set(abertas.map((x) => x.cliente_id).filter((x): x is string => !!x))]
  const nomeCli = new Map<string, string | null>()
  for (let i = 0; i < cliIds.length; i += LOTE_IN) {
    const r = checar<{ id: string; nome: string | null }[]>(await ctx.admin.from('clients').select('id, nome')
      .eq('tenant_id', ctx.escopo.tenantId).in('id', cliIds.slice(i, i + LOTE_IN)))
    for (const c of r) nomeCli.set(c.id, nomeSeguro(c.nome))
  }
  const peso = (x: DemandaRow) => (atrasada(x) ? 0 : 2) + (x.prioridade === 'urgente' ? 0 : x.prioridade === 'alta' ? 1 : 3)
  const destaque = abertas.filter((x) => atrasada(x) || x.prioridade === 'urgente' || x.prioridade === 'alta')
    .sort((a, b) => peso(a) - peso(b) || String(a.prazo ?? '9').localeCompare(String(b.prazo ?? '9')))
  return {
    abertas: abertas.length,
    atrasadas: abertas.filter(atrasada).length,
    por_etapa: contarPor(abertas, (x) => (x.etapa_id ? d.etapas.get(x.etapa_id) : null) ?? 'Sem etapa').map(([k, x]) => ({ etapa: k, n: x.n })),
    por_prioridade: Object.fromEntries(contarPor(abertas, (x) => x.prioridade ?? 'sem').map(([k, x]) => [k, x.n])),
    por_responsavel: contarPor(abertas, (x) => (x.responsavel_id ? nomes.get(x.responsavel_id) : null) ?? 'Sem responsável')
      .slice(0, 15).map(([k, x]) => ({ responsavel: k, n: x.n })),
    destaques: destaque.slice(0, 15).map((x) => ({
      codigo: nomeSeguro(x.codigo, 20),
      titulo: nomeSeguro(x.titulo, 80),
      cliente: x.cliente_id ? nomeCli.get(x.cliente_id) ?? 'Cliente' : 'Sem cliente',
      ...(x.cliente_id ? { ref: ctx.refs.ref(x.cliente_id) } : {}),
      prioridade: x.prioridade,
      prazo: brData(dataValida(x.prazo)),
      atrasada: atrasada(x),
      responsavel: (x.responsavel_id ? nomes.get(x.responsavel_id) : null) ?? 'Sem responsável',
    })),
  }
}

// ---- visao_geral ------------------------------------------------------------

/** Conta linhas (head + count exact). */
async function contar(q: PromiseLike<{ count?: number | null; error: unknown }>): Promise<number> {
  const r = await q
  if (r.error) throw new Error('leitura')
  return r.count ?? 0
}

async function visaoGeral(ctx: ContextoFerramentas): Promise<Saida> {
  const e = ctx.escopo
  const t = e.tenantId
  const fuso = ctx.fuso ?? FUSO_PADRAO
  const hoje = hojeISO(ctx.agora, fuso)
  const em30 = somaDiasISO(hoje, 30)
  const comValores = temPermissao(e, 'contratos')

  const [clientes, contratos] = await Promise.all([clientesVisiveis(ctx), contratosVisiveis(ctx)])
  const cat = contratos.map((c) => ({ c, k: categoriaContrato(c) }))
  const ativosValor = cat.filter((x) => x.k === 'ativo' || x.k === 'inadimplente')
  const saida: Saida = {
    carteira: e.total ? 'empresa toda' : `carteira de quem perguntou (${e.clientIds.size} clientes)`,
    clientes: { ativos: clientes.filter((c) => c.ativo !== false).length, inativos: clientes.filter((c) => c.ativo === false).length },
    contratos: {
      ativos: cat.filter((x) => x.k === 'ativo').length,
      inadimplentes: cat.filter((x) => x.k === 'inadimplente').length,
      pausados: cat.filter((x) => x.k === 'pausado').length,
      nao_iniciados: cat.filter((x) => x.k === 'nao_iniciado').length,
      vencendo_30_dias: cat.filter((x) => { const f = fimDoContrato(x.c); return vigente(x.k) && !!f && f >= hoje && f <= em30 }).length,
      ...(comValores ? { valor_ativos: reais(ativosValor.reduce((s, x) => s + num(x.c.valor_total), 0)) } : {}),
    },
  }

  // Chat: só números de quem vê a empresa toda (a carteira parcial usa listar_alertas).
  if (temPermissao(e, 'chat') && podeVerSemCliente(e)) {
    const desde = new Date(ctx.agora.getTime() - 7 * 86_400_000).toISOString()
    const base = () => ctx.admin.from('chat_conversations').select('id', { count: 'exact', head: true })
      .eq('tenant_id', t).eq('is_group', false).eq('arquivada', false).in('status', ['aberta', 'em_atendimento'])
    const [abertas, aguardando] = await Promise.all([
      contar(base()),
      contar(base().eq('aguardando_resposta', true).gte('ultima_msg_cliente_em', desde)),
    ])
    saida.conversas = { abertas_individuais: abertas, aguardando_resposta_7_dias: aguardando }
  }

  // Satisfação: última análise de cada cliente nos últimos 7 dias.
  const r = await ctx.admin.from('wa_auto_satisfacao').select('client_id, contact_id, nivel, created_at')
    .eq('tenant_id', t).gte('created_at', new Date(ctx.agora.getTime() - 7 * 86_400_000).toISOString())
    .order('created_at', { ascending: false }).limit(2000)
  if (!r.error) {
    const ultima = new Map<string, string>()
    for (const a of (r.data ?? []) as { client_id: string | null; contact_id: string | null; nivel: string }[]) {
      if (a.client_id ? !podeVerCliente(e, a.client_id) : !podeVerSemCliente(e)) continue
      const k = a.client_id ?? `k:${a.contact_id}`
      if (!ultima.has(k)) ultima.set(k, a.nivel)
    }
    const niveis = [...ultima.values()]
    saida.satisfacao_7_dias = { insatisfeitos: niveis.filter((n) => n === 'insatisfeito').length, atencao: niveis.filter((n) => n === 'atencao').length }
  } else if (!ausente(r)) throw new Error('leitura')

  if (temPermissao(e, 'onboarding')) {
    const v = await ctx.admin.from('vendas_pendentes').select('status').eq('tenant_id', t).in('status', ['pendente', 'em_atendimento']).limit(MAX_LINHAS)
    if (!v.error) saida.vendas_para_cadastrar = (v.data ?? []).length
  }
  if (temPermissao(e, 'atendimento')) {
    const d = await demandasAbertas(ctx)
    if (d) saida.demandas = { abertas: d.abertas.length, atrasadas: d.abertas.filter((x) => !!dataValida(x.prazo) && String(x.prazo) < hoje).length }
  }
  saida.dica = 'Detalhe com listar_contratos, listar_clientes ou listar_alertas.'
  return saida
}

// ---------------------------------------------------------------------------
// Como plugar (para quem integra — não é usado em tempo de execução)
// ---------------------------------------------------------------------------
//
// 1. wa-agente-cerebro.ts:
//      ferramentas: [...ferramentasDisponiveis(escopo), ...ferramentasNegocio(escopo)],
//      executar: async (nome, args) => blocoFerramenta(nome,
//        (await executarNegocio(nome, args, ctx)) ?? await executarFerramenta(nome, args, ctx)),
// 2. wa-agente-escopo.ts (carregarEscopo / permissoesDe) — preencher PermissoesNegocio:
//      onboarding  = has_permissao_de(u, 'contratos.onboarding', 'ver')
//      atendimento = has_permissao_de(u, 'atendimento', 'ver')
//      comissoes   = users.perfil IN ('admin','gerente')  [users.id = u AND tenant_id = t]
//                    OR EXISTS comissoes_papeis (user_id = u AND tenant_id = t AND papel IN ('admin','revisor'))
//    e permissoesMinimas (grupo) faz AND também destes campos. escopoAcessoTotal não
//    precisa mudar (temPermissao libera tudo com acessoTotalGrupo).
