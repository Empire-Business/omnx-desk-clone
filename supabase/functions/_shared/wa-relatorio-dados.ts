import { contratosDosClientesAtendidos } from './contratos-clientes-atendidos.ts'
// Coleta dos dados do relatório diário (etapa 9.3). Usado pelo envio
// (wa-auto-relatorio-diario), pela prévia e pelo painel de alertas
// (wa-auto-backtest) — os três enxergam exatamente os mesmos alertas.
//
// Segurança (F2): o client é service_role (ignora RLS), então TODA consulta
// filtra `tenant_id` explicitamente — inclusive as buscas por id, para um id
// "estranho" nunca puxar dado de outra empresa.
//
// Conteúdo (F4/F5): só lemos nomes, datas, contagens e campos de categoria
// (sentimento = 'negativo', risco_abandono = 'alto', status do contrato). Nenhum
// texto de mensagem ou resumo é lido aqui. Única exceção: o MOTIVO curto da
// análise diária (cliente_relacionamento.motivo; no fallback,
// wa_auto_satisfacao.motivo), já parafraseado e validado na gravação, que passa
// de novo por nomeSeguro() (./wa-satisfacao.ts). O resumo do relacionamento NÃO
// é lido; das pendências só a data (para "pedido em aberto há N dias úteis").
//
// Ruído (26/10/2026): a coleta lê os candidatos com os SINAIS de cada um (contato
// bloqueado, grupo, cliente ativo, situação dos contratos, prazo do plano…) e as
// regras de ./wa-alertas.ts decidem o que entra (filtrarAlertas). O que o gestor
// mandou ignorar no painel vem de wa_auto_alertas_ignorados.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type DadosRelatorio, type ItemAlerta, type OpcoesRelatorio, type RegraAnomalia, type ReuniaoDoDia, type TipoAlerta,
  dataBR, descreverHoras, diaMesBR, horaBR, nomeDoCliente, nomeGrupoSeguro, nomeSeguro, normalizarOpcoesRelatorio,
  normalizarRegras, plural, FUSO_PADRAO, OPCOES_RELATORIO_PADRAO, TIPOS_ALERTA,
} from './wa-relatorio.ts'
import {
  type AlertaCandidato, type AtribuicaoCliente, type Ignorado, type MotivoOculto, type SituacaoContratual,
  JANELA_SEM_RESPOSTA_DIAS, chaveAlerta, chaveNome, clientePorNome, contatoEhGrupo, contratoNoPrazo, estrategistaPrincipal, filtrarAlertas,
  ignoradoOculta, ignoradoValendo, motivoAutomatico, prioridadePorVinculo, situacaoContratual, statusEncerrado,
} from './wa-alertas.ts'
import { confirmacaoAposResposta, confirmacaoSimples, type UltimaMensagem as MensagemConfirmacao } from './wa-recuperacao.ts'
import type { LinhaTimeline } from './cliente-timeline.ts'
import { ladoDaMensagem } from './cliente-metricas.ts'
import { DIAS_SILENCIO, lerPendencias } from './wa-relacionamento.ts'
import {
  type AnaliseLida, type RelacionamentoLido, DIAS_VALIDADE_ANALISE, candidatoDeRelacionamento, candidatoDeSatisfacao,
  semAnaliseRecente, soComCliente, ultimaPorConversa,
} from './wa-satisfacao.ts'

const STATUS_ABERTOS = ['aberta', 'em_atendimento', 'aguardando']
const LIMITE_LINHAS = 200
/** Sem resposta: lê até isto (as mais recentes primeiro) para contar também as paradas. */
const LIMITE_SEM_RESPOSTA = 2000
const LIMITE_AMOSTRA_ATUALIDADE = 400
const HORA = 3_600_000
const DIA = 24 * HORA

/** Contrato "Não iniciado" há mais que isto vira pendência. */
const DIAS_CONTRATO_PARADO = 7

export class ColetaError extends Error {
  constructor(public etapa: string) {
    super(`Falha ao ler dados (${etapa}).`)
    this.name = 'ColetaError'
  }
}

function checar<T>(etapa: string, r: { data: T | null; error: unknown }): T {
  if (r.error) throw new ColetaError(etapa)
  return (r.data ?? []) as T
}

/**
 * Tabela/coluna/função ainda não criada (migration não aplicada): PostgREST
 * PGRST205/PGRST204/PGRST202 ou Postgres 42P01/42703/42883.
 */
function faltaNoBanco(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST205' || code === 'PGRST204' || code === 'PGRST202' || code === '42P01' || code === '42703' || code === '42883'
}

export async function carregarRegras(admin: SupabaseClient, tenantId: string): Promise<RegraAnomalia[]> {
  // '*' para funcionar antes e depois da coluna janela_dias (migration 20261026230000).
  const r = await admin
    .from('wa_auto_regras_anomalia')
    .select('*')
    .eq('tenant_id', tenantId)
  return normalizarRegras(checar<unknown[]>('regras', r))
}

/**
 * Opções do relatório (wa_auto_config: relatorio_agrupar_estrategista,
 * relatorio_so_clientes_ativos). Colunas ainda não criadas (migration
 * 20261027100000 não aplicada) ou empresa sem linha → as duas desligadas.
 */
export async function carregarOpcoesRelatorio(admin: SupabaseClient, tenantId: string): Promise<OpcoesRelatorio> {
  if (!tenantId) throw new ColetaError('tenant')
  const r = await admin
    .from('wa_auto_config')
    .select('relatorio_agrupar_estrategista, relatorio_so_clientes_ativos')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (r.error && faltaNoBanco(r.error)) {
    console.warn('wa-relatorio-dados: opções do relatório ainda não existem')
    return { ...OPCOES_RELATORIO_PADRAO }
  }
  if (r.error) throw new ColetaError('opcoes')
  return normalizarOpcoesRelatorio(r.data)
}

// ---------------------------------------------------------------------------
// Contexto (contato → cliente → contratos), sempre no tenant
// ---------------------------------------------------------------------------

interface Contato {
  id: string
  nome: string | null
  numero_whatsapp: string | null
  client_id: string | null
  bloqueado: boolean | null
  group_size: number | null
}
interface Cliente { id: string; nome: string | null; ativo: boolean | null }
interface UltimaMensagem { criado_em: string; autor_tipo: string | null }
interface AmostraMensagens { ultima: UltimaMensagem | null; ultimaCliente: UltimaMensagem | null; completa: boolean; fontes: LinhaTimeline[] }

function unicos(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))]
}

async function emLotes<T>(ids: string[], buscar: (lote: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 150) out.push(...await buscar(ids.slice(i, i + 150)))
  return out
}

interface Sinais {
  client_id: string | null
  contatoBloqueado: boolean
  grupo: boolean
  clienteAtivo: boolean | null
  situacao: SituacaoContratual | null
}

class Contexto {
  private contatos = new Map<string, Contato>()
  private clientes = new Map<string, Cliente>()
  private situacoes = new Map<string, SituacaoContratual>()
  private somentePausados = new Set<string>()
  private novidadesCliente = new Map<string, string>()
  private analisesPendentes = new Set<string>()
  private amostrasMensagens = new Map<string, AmostraMensagens | null>()
  private fontesPendenciasPorDia = new Map<string, Promise<LinhaTimeline[]>>()
  private todosClientes: Cliente[] | null = null

  constructor(private admin: SupabaseClient, private tenantId: string) {}

  async carregar(contactIds: (string | null)[], clientIds: (string | null)[]) {
    const novosContatos = unicos(contactIds).filter((id) => !this.contatos.has(id))
    const contatos = await emLotes(novosContatos, async (lote) => checar<Contato[]>('contatos', await this.admin
      .from('chat_contacts')
      .select('id, nome, numero_whatsapp, client_id, bloqueado, group_size')
      .eq('tenant_id', this.tenantId)
      .in('id', lote)))
    for (const c of contatos) this.contatos.set(c.id, c)

    const ids = unicos([...clientIds, ...contatos.map((c) => c.client_id)])
    const novosClientes = ids.filter((id) => !this.clientes.has(id))
    const clientes = await emLotes(novosClientes, async (lote) => checar<Cliente[]>('clientes', await this.admin
      .from('clients')
      .select('id, nome, ativo')
      .eq('tenant_id', this.tenantId)
      .in('id', lote)))
    for (const c of clientes) this.clientes.set(c.id, c)

    // Situação contratual e pausa: somente os campos de status de cada contrato.
    const semSituacao = ids.filter((id) => !this.situacoes.has(id))
    const contratos = await contratosDosClientesAtendidos(this.admin, this.tenantId, semSituacao)
    const porCliente = new Map<string, (string | null)[]>()
    for (const c of contratos) porCliente.set(c.cliente_id, [...(porCliente.get(c.cliente_id) ?? []), c.status])
    for (const id of semSituacao) this.situacoes.set(id, situacaoContratual(porCliente.get(id) ?? []))
    for (const id of semSituacao) {
      const vigentes = contratos.filter((c) => c.cliente_id === id && !statusEncerrado(c.status))
      if (vigentes.length > 0 && vigentes.every((c) => chaveNome(c.status) === 'pausado' || chaveNome(c.status_secundario) === 'pausado')) {
        this.somentePausados.add(id)
      }
    }
  }

  clienteSoContratosPausados(clientId: string | null): boolean {
    return Boolean(clientId && this.somentePausados.has(clientId))
  }

  /** Usa a mesma proveniência da análise: canais confirmados, sem grupos internos. Só usa data/autoria. */
  async mensagensAtuais(clientId: string, agora: Date): Promise<AmostraMensagens | null> {
    if (this.amostrasMensagens.has(clientId)) return this.amostrasMensagens.get(clientId) ?? null
    const r = await this.admin.rpc('cliente_timeline', {
      p_tenant: this.tenantId, p_client: clientId,
      p_desde: new Date(agora.getTime() - 90 * DIA).toISOString(), p_ate: agora.toISOString(), p_limite: LIMITE_AMOSTRA_ATUALIDADE,
    }).select('message_id, criado_em, autor_tipo, autor_nome, canal_rotulo, canal_tipo, tipo, conteudo, midia_texto')
    if (r.error && faltaNoBanco(r.error)) {
      this.amostrasMensagens.set(clientId, null)
      return null
    }
    if (r.error || !Array.isArray(r.data)) throw new ColetaError('relacionamento_novidade')
    const linhas = r.data
    const validas = linhas.filter((m) => {
      const t = new Date(m.criado_em).getTime()
      return Number.isFinite(t) && t <= agora.getTime() && ladoDaMensagem(m.autor_tipo) !== 'ignorar'
    }).sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime())
    // Métricas legadas tratam autoria desconhecida como cliente. Para afirmar
    // movimentação recente, exigimos a autoria classificada na fonte canônica.
    const ultimaCliente = validas.filter((m) => m.autor_tipo === 'cliente').at(-1) ?? null
    if (ultimaCliente) this.novidadesCliente.set(clientId, ultimaCliente.criado_em)
    const amostra = { ultima: validas.at(-1) ?? null, ultimaCliente, completa: linhas.length < LIMITE_AMOSTRA_ATUALIDADE, fontes: linhas as LinhaTimeline[] }
    this.amostrasMensagens.set(clientId, amostra)
    return amostra
  }

  /** Fonte persistida fora da amostra atual: só metadados, nunca amplia métricas/atualidade. */
  async fontesDosPedidos(clientId: string, bruto: unknown, agora: Date, amostra: readonly LinhaTimeline[] = []): Promise<LinhaTimeline[]> {
    const pedidos = lerPendencias(bruto, null, agora).filter(p => p.fonte_message_id)
    const ids = new Set(pedidos.map(p => p.fonte_message_id!))
    const fontes = new Map(amostra.filter(m => ids.has(m.message_id) && m.autor_tipo === 'cliente'
      && Number.isFinite(Date.parse(m.criado_em)) && Date.parse(m.criado_em) <= agora.getTime()).map(m => [m.message_id, m]))
    const porDia = new Map<string, Set<string>>()
    for (const p of pedidos) {
      if (fontes.has(p.fonte_message_id!)) continue
      const dia = porDia.get(p.desde) ?? new Set<string>()
      dia.add(p.fonte_message_id!)
      porDia.set(p.desde, dia)
    }
    // No máximo cinco dias por cliente; sequencial aqui + lote externo de quatro clientes.
    for (const [dia, idsDoDia] of porDia) {
      const procurados = new Set([...idsDoDia].filter(id => !fontes.has(id)))
      if (!procurados.size) continue
      const centro = Date.parse(`${dia}T03:00:00.000Z`) // início do dia em Brasília
      const desde = centro - DIA
      const ate = Math.min(centro + 2 * DIA, agora.getTime())
      const chave = `${clientId}:${dia}` // Contexto pertence a um único tenant.
      let leitura = this.fontesPendenciasPorDia.get(chave)
      if (!leitura) {
        leitura = (async () => {
          const r = await this.admin.rpc('cliente_timeline', {
            p_tenant: this.tenantId, p_client: clientId,
            p_desde: new Date(desde).toISOString(), p_ate: new Date(ate).toISOString(), p_limite: 1000,
          }).select('message_id, criado_em, autor_tipo, autor_nome, canal_rotulo, canal_tipo, tipo, conteudo, midia_texto')
          // Fonte indisponível ou corte cheio mantém indicação de não confirmada.
          if (r.error || !Array.isArray(r.data) || r.data.length >= 1000) return []
          return (r.data as LinhaTimeline[]).filter(m => m.autor_tipo === 'cliente'
            && Date.parse(m.criado_em) >= desde && Date.parse(m.criado_em) <= ate)
        })()
        this.fontesPendenciasPorDia.set(chave, leitura)
      }
      for (const m of await leitura) if (procurados.has(m.message_id)) fontes.set(m.message_id, m)
    }
    return [...fontes.values()]
  }

  novidadeDoCliente(clientId: string | null): string | null {
    return clientId ? this.novidadesCliente.get(clientId) ?? null : null
  }

  marcarAnalisePendente(clientId: string): void { this.analisesPendentes.add(clientId) }
  get quantidadeAnalisesPendentes(): number { return this.analisesPendentes.size }

  /** Todos os clientes do tenant (id, nome, ativo) — só para casar contrato sem cliente_id pelo nome. */
  async listaClientes(): Promise<Cliente[]> {
    if (!this.todosClientes) {
      this.todosClientes = checar<Cliente[]>('clientes_nomes', await this.admin
        .from('clients')
        .select('id, nome, ativo')
        .eq('tenant_id', this.tenantId)
        .limit(10000))
    }
    return this.todosClientes
  }

  contato(id: string | null): Contato | undefined {
    return id ? this.contatos.get(id) : undefined
  }

  clienteDoContato(contactId: string | null): string | null {
    return this.contato(contactId)?.client_id ?? null
  }

  nomeContato(contactId: string | null): string {
    const c = this.contato(contactId)
    const cadastro = c?.client_id ? this.clientes.get(c.client_id)?.nome : null
    return nomeDoCliente(cadastro, c?.nome, c?.numero_whatsapp)
  }

  nomeCliente(clientId: string | null, ...alternativas: (string | null | undefined)[]): string {
    const cadastro = clientId ? this.clientes.get(clientId)?.nome : null
    return nomeDoCliente(cadastro ?? alternativas.find((a) => a && a.trim()) ?? null)
  }

  /** Sinais para as regras automáticas. Cliente explícito > cliente do contato. */
  sinais(clientId: string | null, contactId: string | null): Sinais {
    const c = this.contato(contactId)
    const cid = clientId ?? c?.client_id ?? null
    const cli = cid ? this.clientes.get(cid) : undefined
    return {
      client_id: cid,
      contatoBloqueado: c?.bloqueado === true,
      grupo: c ? contatoEhGrupo(c.numero_whatsapp, c.group_size) : false,
      clienteAtivo: cli ? cli.ativo !== false : null,
      situacao: cid ? this.situacoes.get(cid) ?? null : null,
    }
  }
}

// ---------------------------------------------------------------------------
// Cada anomalia → candidatos com sinais (o filtro decide depois)
// ---------------------------------------------------------------------------

interface ConversaRow {
  id: string
  contact_id: string | null
  ultima_msg_cliente_em: string | null
  is_group: boolean | null
  silenciado: boolean | null
}

/** Confere o estado atual do grupo; em privados mantém apenas a exceção de ACK. */
async function confirmacoesSemPedido(
  admin: SupabaseClient, tenantId: string, convs: ConversaRow[], agora: Date, ctx: Contexto,
): Promise<Set<string>> {
  const grupoDe = (c: ConversaRow): string | null => {
    const numero = ctx.contato(c.contact_id)?.numero_whatsapp?.replace(/@g\.us$/, '')
    return c.is_group === true && numero && /^\d+(?:-\d+)?$/.test(numero) ? numero : null
  }
  const candidatas = convs.filter(c => grupoDe(c) !== null)
  const privadas = convs.filter(c => grupoDe(c) === null)
  // A leitura inicial é em lotes: não consulta todo histórico de milhares de candidatos.
  for (let i = 0; i < privadas.length; i += 150) {
    const lote = privadas.slice(i, i + 150)
    const ultimas = checar<(MensagemConfirmacao & { conversation_id: string })[]>('sem_resposta_confirmacoes', await admin
      .from('chat_messages').select('conversation_id, criado_em, autor_tipo, autor_origem, conteudo, tipo')
      .eq('tenant_id', tenantId).in('conversation_id', lote.map(c => c.id))
      .in('criado_em', lote.map(c => c.ultima_msg_cliente_em)).limit(1000))
    if (ultimas.length >= 1000) continue // amostra incompleta não retira alerta
    for (const c of lote) {
      if (ultimas.some(m => m.conversation_id === c.id && Date.parse(m.criado_em) === Date.parse(c.ultima_msg_cliente_em ?? '') && confirmacaoSimples(m))) candidatas.push(c)
    }
  }
  const confirmadas = new Set<string>()
  const cache = new Map<string, Promise<MensagemConfirmacao[]>>()
  async function recentes(c: ConversaRow): Promise<MensagemConfirmacao[]> {
    const grupo = grupoDe(c)
    const chave = grupo ? `grupo:${grupo}` : `conversa:${c.id}`
    let leitura = cache.get(chave)
    if (!leitura) {
      leitura = (async () => {
        let ids = [c.id]
        if (grupo) {
          const contatos = checar<{ id: string }[]>('sem_resposta_contatos_grupo', await admin.from('chat_contacts')
            .select('id').eq('tenant_id', tenantId).in('numero_whatsapp', [grupo, `${grupo}@g.us`]).limit(100))
          if (contatos.length >= 100) return []
          const outras = checar<{ id: string }[]>('sem_resposta_conversas_grupo', await admin.from('chat_conversations')
            .select('id').eq('tenant_id', tenantId).eq('is_group', true).in('contact_id', contatos.map(ct => ct.id)).limit(500))
          if (outras.length >= 500) return []
          ids = [...new Set([c.id, ...outras.map(o => o.id)])]
        }
        return checar<MensagemConfirmacao[]>('sem_resposta_contexto', await admin.from('chat_messages')
          .select('criado_em, autor_tipo, autor_origem, conteudo, tipo').eq('tenant_id', tenantId)
          .in('conversation_id', ids).lte('criado_em', agora.toISOString())
          .order('criado_em', { ascending: false }).limit(40))
      })()
      cache.set(chave, leitura)
    }
    return leitura
  }
  for (let i = 0; i < candidatas.length; i += 4) {
    await Promise.all(candidatas.slice(i, i + 4).map(async c => {
      const contexto = await recentes(c)
      const relevantes = contexto.filter(m => m.tipo !== 'sistema' && m.tipo !== 'nota_interna')
      const ultima = relevantes[0]
      const clienteEm = Date.parse(c.ultima_msg_cliente_em ?? '')
      const ultimaEm = Date.parse(ultima?.criado_em ?? '')
      // Um estado local posterior à amostra nunca é apagado por contexto antigo.
      if (!Number.isFinite(clienteEm) || !Number.isFinite(ultimaEm) || ultimaEm < clienteEm) return
      const equipeConfiavel = (m: MensagemConfirmacao) => m.autor_tipo === 'equipe'
        && ['webhook', 'plataforma', 'backfill'].includes(m.autor_origem ?? '')
      // Corte cheio só é conclusivo se já alcançou um instante anterior ao último.
      const empateCompleto = contexto.length < 40 || Date.parse(contexto[contexto.length - 1].criado_em) < ultimaEm
      const respondidoNoGrupo = empateCompleto && grupoDe(c) !== null && ultimaEm > clienteEm && equipeConfiavel(ultima)
        // Empate com cliente/desconhecido é ambíguo, independentemente da ordem do banco.
        && relevantes.filter(m => Date.parse(m.criado_em) === ultimaEm).every(equipeConfiavel)
      if (respondidoNoGrupo || confirmacaoAposResposta(relevantes)) confirmadas.add(c.id)
    }))
  }
  return confirmadas
}

async function semResposta(
  admin: SupabaseClient, tenantId: string, horas: number, janelaDias: number, agora: Date, ctx: Contexto,
): Promise<AlertaCandidato[]> {
  const limite = new Date(agora.getTime() - Math.max(horas, 0) * HORA).toISOString()
  // Mais recentes primeiro: se passar do limite de linhas, cortamos as mais velhas
  // (que já seriam só contagem). Arquivadas/encerradas nem entram.
  const convs = checar<ConversaRow[]>('sem_resposta', await admin
    .from('chat_conversations')
    .select('id, contact_id, ultima_msg_cliente_em, is_group, silenciado')
    .eq('tenant_id', tenantId)
    .eq('aguardando_resposta', true)
    .eq('arquivada', false)
    .in('status', STATUS_ABERTOS)
    .not('ultima_msg_cliente_em', 'is', null)
    .lte('ultima_msg_cliente_em', limite)
    .order('ultima_msg_cliente_em', { ascending: false })
    .limit(LIMITE_SEM_RESPOSTA))
  await ctx.carregar(convs.map((c) => c.contact_id), [])
  const janelaMs = Math.max(janelaDias, 1) * DIA
  // Históricos permanecem somente na contagem; não ampliam leituras por grupo.
  const atuais = convs.filter(c => agora.getTime() - Date.parse(c.ultima_msg_cliente_em ?? '') <= janelaMs)
  const confirmadas = await confirmacoesSemPedido(admin, tenantId, atuais, agora, ctx)
  return convs.filter(c => !confirmadas.has(c.id)).map((c) => {
    const s = ctx.sinais(null, c.contact_id)
    const espera = agora.getTime() - new Date(c.ultima_msg_cliente_em as string).getTime()
    return {
      tipo: 'sem_resposta' as const,
      cliente: ctx.nomeContato(c.contact_id),
      detalhe: `esperando há ${descreverHoras(espera / HORA)}`,
      client_id: s.client_id,
      contact_id: c.contact_id,
      conversation_id: c.id,
      contract_id: null,
      desde: c.ultima_msg_cliente_em,
      prioridade: prioridadePorVinculo(s.client_id, s.situacao),
      contatoBloqueado: s.contatoBloqueado,
      grupo: c.is_group === true || s.grupo,
      silenciada: c.silenciado === true,
      clienteAtivo: s.clienteAtivo,
      situacao: s.situacao,
      foraDaJanela: espera > janelaMs,
    }
  })
}

/**
 * Últimas análises de satisfação (wa_auto_satisfacao, dos últimos 3 dias). Tabela
 * ainda não criada (migration 20261026240000 não aplicada) → null: só as fontes antigas.
 */
async function analisesRecentes(admin: SupabaseClient, tenantId: string, agora: Date): Promise<AnaliseLida[] | null> {
  const r = await admin
    .from('wa_auto_satisfacao')
    .select('conversation_id, client_id, contact_id, nivel, confianca, motivo, analisado_ate, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', new Date(agora.getTime() - DIAS_VALIDADE_ANALISE * DIA).toISOString())
    .order('created_at', { ascending: false })
    .limit(LIMITE_SEM_RESPOSTA)
  if (r.error && faltaNoBanco(r.error)) {
    console.warn('wa-relatorio-dados: tabela de satisfação ainda não existe')
    return null
  }
  return checar<AnaliseLida[]>('satisfacao', r)
}

/**
 * Relacionamento por cliente (cliente_relacionamento, wa-relacionamento-analisar)
 * processado nos últimos 3 dias. Tabela ainda não criada (migration 20261027150000
 * não aplicada) → null.
 */
async function relacionamentosRecentes(admin: SupabaseClient, tenantId: string, agora: Date): Promise<RelacionamentoLido[] | null> {
  const r = await admin
    .from('cliente_relacionamento')
    .select('client_id, satisfacao, confianca, motivo, risco, risco_motivos, metricas, pendencias, analisado_ate, processado_em')
    .eq('tenant_id', tenantId)
    .gte('processado_em', new Date(agora.getTime() - DIAS_VALIDADE_ANALISE * DIA).toISOString())
    .limit(LIMITE_SEM_RESPOSTA)
  if (r.error && faltaNoBanco(r.error)) {
    console.warn('wa-relatorio-dados: tabela de relacionamento ainda não existe')
    return null
  }
  return checar<RelacionamentoLido[]>('relacionamento', r)
}

/**
 * "Clientes insatisfeitos" + "Clientes em risco" (seção sentimento_negativo):
 *   1) fonte principal: cliente_relacionamento (por CLIENTE, com memória):
 *      insatisfeito/risco alto (prioridade alta) e atenção ≥ 0,7 (média) com o
 *      motivo parafraseado; risco médio POR REGRA (silêncio, pendência antiga,
 *      queda de conversas) com frase fixa (nivel 'risco' → subseção "em risco").
 *      Demora da equipe não entra (é a seção "sem resposta"; o mesmo cliente
 *      aparece uma vez só no relatório);
 *   2) sem nenhuma linha recente na tabela nova (F5 ainda não rodou): a análise
 *      antiga por conversa (wa_auto_satisfacao, últimos 3 dias);
 *   3) nos dois casos, as fontes antigas (tom negativo, análise semanal) só para
 *      cliente/conversa SEM análise recente.
 * Só contato/cliente COM cadastro entra (lead não é "cliente insatisfeito").
 */
async function sentimentoNegativo(admin: SupabaseClient, tenantId: string, agora: Date, ctx: Contexto, soClientesAtivos = false): Promise<AlertaCandidato[]> {
  const relacionamentos = await relacionamentosRecentes(admin, tenantId, agora)
  if (relacionamentos && relacionamentos.length > 0) {
    await ctx.carregar([], relacionamentos.map((r) => r.client_id))
    const analisados = { conversas: new Set<string>(), clientes: new Set(relacionamentos.map((r) => r.client_id)) }
    const daAnalise: AlertaCandidato[] = []
    // Só candidatos a alerta precisam da checagem. No máximo quatro leituras em voo.
    for (let inicio = 0; inicio < relacionamentos.length; inicio += 4) {
      await Promise.all(relacionamentos.slice(inicio, inicio + 4).map(async (r) => {
        const s = ctx.sinais(r.client_id, null)
        const sinais = {
          cliente: ctx.nomeCliente(r.client_id), client_id: r.client_id, clienteAtivo: s.clienteAtivo, situacao: s.situacao,
        }
        const anterior = candidatoDeRelacionamento(r, sinais, agora)
        if (!anterior) return
        if (s.clienteAtivo === false || s.situacao === 'encerrado' || (soClientesAtivos && ctx.clienteSoContratosPausados(r.client_id))) {
          daAnalise.push(anterior) // O filtro preserva a contagem do motivo automático.
          return
        }
        const amostra = await ctx.mensagensAtuais(r.client_id, agora)
        const atual = atualizarRelacionamento(r, amostra, agora)
        if (atual.analisePendente) ctx.marcarAnalisePendente(r.client_id)
        const fontes = await ctx.fontesDosPedidos(r.client_id, atual.relacionamento.pendencias, agora, amostra?.fontes)
        const c = candidatoDeRelacionamento({ ...atual.relacionamento, fontes }, sinais, agora)
        if (c) daAnalise.push(c)
      }))
    }
    return soComCliente([...daAnalise, ...semAnaliseRecente(await sentimentoNegativoAntigo(admin, tenantId, agora, ctx), analisados)])
  }

  const analises = await analisesRecentes(admin, tenantId, agora)
  const ultimas = [...ultimaPorConversa(analises ?? []).values()]
  // Estado ATUAL da conversa (contato, grupo, silenciada, arquivada), sempre no tenant.
  const convsAnalisadas = await emLotes(ultimas.map((a) => a.conversation_id), async (lote) => checar<(ConversaRow & { arquivada: boolean | null })[]>('satisfacao_conversas', await admin
    .from('chat_conversations')
    .select('id, contact_id, ultima_msg_cliente_em, is_group, silenciado, arquivada')
    .eq('tenant_id', tenantId)
    .in('id', lote)))
  const convPorId = new Map(convsAnalisadas.map((c) => [c.id, c]))
  await ctx.carregar([...convsAnalisadas.map((c) => c.contact_id), ...ultimas.map((a) => a.contact_id)], [])

  const analisadas = { conversas: new Set<string>(), clientes: new Set<string>() }
  const daAnalise: AlertaCandidato[] = []
  for (const a of ultimas) {
    const conv = convPorId.get(a.conversation_id)
    if (!conv || conv.arquivada === true) continue
    const contactId = conv.contact_id ?? a.contact_id
    const s = ctx.sinais(null, contactId)
    analisadas.conversas.add(a.conversation_id)
    if (s.client_id) analisadas.clientes.add(s.client_id)
    const c = candidatoDeSatisfacao(a, {
      cliente: ctx.nomeContato(contactId), client_id: s.client_id, contact_id: contactId,
      contatoBloqueado: s.contatoBloqueado, grupo: conv.is_group === true || s.grupo, silenciada: conv.silenciado === true,
      clienteAtivo: s.clienteAtivo, situacao: s.situacao,
    }, agora)
    if (c) daAnalise.push(c)
  }

  // Só cliente (F0): lead / contato sem cadastro não vira "insatisfeito" — nem
  // pelas fontes antigas (tom negativo da conversa).
  return soComCliente([...daAnalise, ...semAnaliseRecente(await sentimentoNegativoAntigo(admin, tenantId, agora, ctx), analisadas)])
}

/** Novidade pede reanálise; não confirma por si só resolução ou nova insatisfação. Nada é gravado. */
function atualizarRelacionamento(r: RelacionamentoLido, amostra: AmostraMensagens | null, agora: Date): { relacionamento: RelacionamentoLido; analisePendente: boolean } {
  const ultima = amostra?.ultima
  if (!amostra) return { relacionamento: r, analisePendente: true }
  const t = ultima ? new Date(ultima.criado_em).getTime() : NaN
  const tCliente = amostra?.ultimaCliente ? new Date(amostra.ultimaCliente.criado_em).getTime() : NaN
  const analisado = new Date(r.analisado_ate ?? r.processado_em ?? '').getTime()
  const contextoDesatualizado = Number.isFinite(analisado) && Number.isFinite(t) && t > analisado
  const silencioAtualizavel = Number.isFinite(tCliente)
  const silencioSemCliente = !amostra.ultimaCliente && (r.risco_motivos ?? []).includes('silencio')
  if (!contextoDesatualizado && !silencioAtualizavel && !silencioSemCliente) return { relacionamento: r, analisePendente: true }

  let motivos = [...(r.risco_motivos ?? [])]
  const dias = Math.floor((agora.getTime() - tCliente) / DIA)
  if (contextoDesatualizado) motivos = motivos.filter((m) => m === 'silencio' || m === 'queda_volume')
  if (silencioSemCliente || (silencioAtualizavel && dias < DIAS_SILENCIO)) motivos = motivos.filter((m) => m !== 'silencio')
  const relacionamento: RelacionamentoLido = {
    ...r,
    ...(contextoDesatualizado ? {
      satisfacao: 'sem_dados', confianca: 0, motivo: null, pendencias: [],
      risco: motivos.length ? 'medio' : 'baixo',
    } : {}),
    ...(silencioAtualizavel || (silencioSemCliente && amostra.completa) ? {
      metricas: { ...r.metricas, dias_desde_msg_cliente: silencioAtualizavel ? dias : null }, processado_em: agora.toISOString(),
    } : {}),
    risco_motivos: motivos,
  }
  return { relacionamento, analisePendente: contextoDesatualizado || !silencioAtualizavel }
}

type AtualidadeContextual = 'historico' | 'pendente'

/**
 * O cron renovar processado_em não é uma nova manifestação do cliente. A
 * janela usa só a última fala real nos canais confirmados; uma cobrança atual
 * mantém atual uma pendência antiga. Sem essa evidência, a atualidade fica
 * pendente, nunca presumida a partir da data da análise ou da fala da equipe.
 * Os candidatos continuam disponíveis no painel: o aviso resumirá os marcados.
 */
async function classificarAtualidadeContextual(
  candidatos: readonly AlertaCandidato[], ctx: Contexto, agora: Date, janelaDias: number, soClientesAtivos: boolean,
): Promise<Map<string, AtualidadeContextual>> {
  const elegiveis = candidatos.filter((a) => !motivoAutomatico(a)
    && !(soClientesAtivos && a.clienteSoContratosPausados))
  const ids = unicos(elegiveis.map((a) => a.client_id))
  const porCliente = new Map<string, AtualidadeContextual>()
  const corte = agora.getTime() - janelaDias * DIA
  for (let inicio = 0; inicio < ids.length; inicio += 4) {
    await Promise.all(ids.slice(inicio, inicio + 4).map(async (id) => {
      const amostra = await ctx.mensagensAtuais(id, agora)
      const ultima = amostra?.ultimaCliente?.criado_em
      const t = ultima ? new Date(ultima).getTime() : NaN
      // Amostra vazia, saturada sem cliente ou função ausente não datam um caso.
      if (!Number.isFinite(t)) porCliente.set(id, 'pendente')
      else if (t < corte) porCliente.set(id, 'historico')
    }))
  }
  const resultado = new Map<string, AtualidadeContextual>()
  for (const a of elegiveis) {
    const estado = a.client_id ? porCliente.get(a.client_id) : 'pendente'
    if (estado) resultado.set(chaveAlerta(a), estado)
  }
  return resultado
}

/** Fontes antigas (antes da análise diária): sentimento da conversa e análise semanal. */
async function sentimentoNegativoAntigo(admin: SupabaseClient, tenantId: string, agora: Date, ctx: Contexto): Promise<AlertaCandidato[]> {
  // (a) conversa marcada como negativa pela análise automática, com o cliente
  //     falando nas últimas 24h (senão o mesmo nome se repetiria todo dia);
  const convs = checar<ConversaRow[]>('sentimento', await admin
    .from('chat_conversations')
    .select('id, contact_id, ultima_msg_cliente_em, is_group, silenciado')
    .eq('tenant_id', tenantId)
    .eq('sentimento', 'negativo')
    .eq('arquivada', false)
    .in('status', STATUS_ABERTOS)
    .gte('ultima_msg_cliente_em', new Date(agora.getTime() - DIA).toISOString())
    .order('ultima_msg_cliente_em', { ascending: false })
    .limit(LIMITE_LINHAS))

  // (b) análise semanal com risco ALTO de sair (só o campo de categoria; o texto
  //     dos alertas da IA não é lido).
  const desde = new Date(agora.getTime() - 8 * DIA).toISOString().slice(0, 10)
  const semanais = checar<{ client_id: string | null; client_nome: string | null; contact_id: string | null; semana_inicio: string | null }[]>('risco', await admin
    .from('chat_weekly_reports')
    .select('client_id, client_nome, contact_id, semana_inicio')
    .eq('tenant_id', tenantId)
    .eq('risco_abandono', 'alto')
    .gte('semana_inicio', desde)
    .limit(LIMITE_LINHAS))

  await ctx.carregar(
    [...convs.map((c) => c.contact_id), ...semanais.map((s) => s.contact_id)],
    semanais.map((s) => s.client_id),
  )
  const doTom: AlertaCandidato[] = convs.map((c) => {
    const s = ctx.sinais(null, c.contact_id)
    return {
      tipo: 'sentimento_negativo', cliente: ctx.nomeContato(c.contact_id), detalhe: 'conversa com tom negativo',
      client_id: s.client_id, contact_id: c.contact_id, conversation_id: c.id, contract_id: null,
      desde: c.ultima_msg_cliente_em, prioridade: s.client_id && s.situacao === 'vigente' ? 3 : 2,
      evidencia_em: null, // O tom antigo não tem marco de análise; atividade nova não o revalida.
      contatoBloqueado: s.contatoBloqueado, grupo: c.is_group === true || s.grupo, silenciada: c.silenciado === true,
      clienteAtivo: s.clienteAtivo, situacao: s.situacao,
    }
  })
  const doRisco: AlertaCandidato[] = semanais.map((r) => {
    const s = ctx.sinais(r.client_id, r.contact_id)
    return {
      tipo: 'sentimento_negativo',
      cliente: r.client_id || r.client_nome ? ctx.nomeCliente(r.client_id, r.client_nome) : ctx.nomeContato(r.contact_id),
      detalhe: 'risco alto de sair (análise semanal)',
      client_id: s.client_id, contact_id: r.contact_id, conversation_id: null, contract_id: null,
      desde: r.semana_inicio, prioridade: 3,
      contatoBloqueado: s.contatoBloqueado, grupo: s.grupo, clienteAtivo: s.clienteAtivo, situacao: s.situacao,
    }
  })
  return [...doTom, ...doRisco]
}

interface GrupoSemClienteRow {
  chave: string
  nome: string | null
  contato_id: string
  contato_ids: string[] | null
  msgs: number
  ultima_msg: string | null
  sugestao_client_id: string | null
}

/**
 * "Grupos ativos sem cliente vinculado": grupos de WhatsApp com mensagem nos
 * últimos `dias` que não têm cliente confirmado (cliente_canais) nem vínculo no
 * Chat e não são internos (decisão interno / não é cliente, restrito, grupos do
 * assistente e destinos do relatório) — RPC wa_auto_grupos_sem_cliente, um item
 * por grupo (o mesmo grupo em vários números conta uma vez). Detalhe = frase fixa
 * com a contagem e, se houver sugestão pendente, "parece ser de <cliente>".
 * Função ainda não criada (migration 20261027150000 não aplicada) → nenhum.
 */
async function gruposSemCliente(
  admin: SupabaseClient, tenantId: string, dias: number, agora: Date, ctx: Contexto,
): Promise<AlertaCandidato[]> {
  const r = await admin.rpc('wa_auto_grupos_sem_cliente', {
    p_tenant: tenantId, p_dias: Math.max(1, Math.min(Math.floor(dias), 90)), p_agora: agora.toISOString(), p_limite: LIMITE_LINHAS,
  })
  if (r.error && faltaNoBanco(r.error)) {
    console.warn('wa-relatorio-dados: função de grupos sem cliente ainda não existe')
    return []
  }
  const linhas = checar<GrupoSemClienteRow[]>('grupos_sem_cliente', r)
  await ctx.carregar([], linhas.map((l) => l.sugestao_client_id))
  const periodo = plural(dias, 'dia', 'dias')
  return linhas.map((l) => {
    const msgs = Math.max(0, Math.floor(Number(l.msgs) || 0))
    const sugestao = l.sugestao_client_id ? ctx.nomeCliente(l.sugestao_client_id) : null
    const contatos = [...new Set([l.contato_id, ...(l.contato_ids ?? [])].filter(Boolean))]
    return {
      tipo: 'grupo_sem_cliente' as const,
      cliente: nomeGrupoSeguro(l.nome) ?? 'Grupo sem nome',
      detalhe: `${plural(msgs, 'mensagem', 'mensagens')} em ${periodo}${sugestao ? `; parece ser de ${sugestao}` : ''}`,
      client_id: null,
      contact_id: l.contato_id,
      conversation_id: null,
      contract_id: null,
      desde: l.ultima_msg,
      prioridade: 1 as const,
      // grupo: false de propósito — a regra automática "grupo sem cliente" (wa-alertas)
      // tiraria justamente estes.
      contatosDoGrupo: contatos,
    }
  })
}

/**
 * O mesmo grupo tem um contato por número da empresa. O pedido do painel
 * (silenciar / não alertar) é gravado num deles: se algum contato do grupo tem
 * pedido valendo, o alerta passa a usar ESSE contato — assim o filtro reconhece o
 * pedido mesmo que o contato "principal" do grupo tenha mudado.
 */
function ajustarContatoDosGrupos(candidatos: AlertaCandidato[] | undefined, ignorados: readonly Ignorado[], agora: Date): void {
  if (!candidatos?.length) return
  const comPedido = new Set(ignorados
    .filter((i) => i.contact_id && !i.client_id && (i.tipo === 'grupo_sem_cliente' || i.tipo === 'todos') && ignoradoValendo(i, agora))
    .map((i) => i.contact_id as string))
  if (comPedido.size === 0) return
  for (const c of candidatos) {
    const achado = (c.contatosDoGrupo ?? []).find((id) => comPedido.has(id))
    if (achado) c.contact_id = achado
  }
}

interface ReuniaoRow {
  id: string
  client_id: string | null
  contact_id: string | null
  guest_name: string | null
  scheduled_at: string | null
}

function nomeDaReuniao(r: ReuniaoRow, ctx: Contexto): string {
  if (r.client_id) return ctx.nomeCliente(r.client_id, r.guest_name)
  if (r.guest_name && r.guest_name.trim()) return ctx.nomeCliente(null, r.guest_name)
  return ctx.nomeContato(r.contact_id)
}

interface ContratoRow {
  id: string
  cliente_id: string | null
  cliente_nome: string | null
  status: string | null
  status_secundario: string | null
  atualizado_em: string | null
  data_fechamento: string | null
  data_assinatura: string | null
  plano_dias: number | null
}

const COLUNAS_CONTRATO = 'id, cliente_id, cliente_nome, status, status_secundario, atualizado_em, data_fechamento, data_assinatura, plano_dias'

/** cliente_id do contrato ou, sem ele, o cliente com exatamente o mesmo nome (único). */
async function vincularClientes(contratos: ContratoRow[], ctx: Contexto): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>()
  const semVinculo = contratos.filter((c) => !c.cliente_id)
  const lista = semVinculo.length > 0 ? await ctx.listaClientes() : []
  for (const c of contratos) mapa.set(c.id, c.cliente_id ?? clientePorNome(c.cliente_nome, lista))
  await ctx.carregar([], [...mapa.values()])
  return mapa
}

async function pendencias(admin: SupabaseClient, tenantId: string, agora: Date, ctx: Contexto): Promise<AlertaCandidato[]> {
  const itens: AlertaCandidato[] = []

  // Contratos inadimplentes ou pausados (status interno = contratos.status_secundario).
  const parados = checar<ContratoRow[]>('contratos', await admin
    .from('contratos')
    .select(COLUNAS_CONTRATO)
    .eq('tenant_id', tenantId)
    .in('status_secundario', ['INADIMPLENTE', 'PAUSADO'])
    .order('atualizado_em', { ascending: true })
    .limit(LIMITE_LINHAS))
  // Contratos fechados há mais de 7 dias que nem começaram.
  const limiteFechamento = new Date(agora.getTime() - DIAS_CONTRATO_PARADO * DIA).toISOString().slice(0, 10)
  const naoIniciados = checar<ContratoRow[]>('contratos_nao_iniciados', await admin
    .from('contratos')
    .select(COLUNAS_CONTRATO)
    .eq('tenant_id', tenantId)
    .eq('status_secundario', 'Não iniciado')
    .lte('data_fechamento', limiteFechamento)
    .order('data_fechamento', { ascending: true })
    .limit(LIMITE_LINHAS))
  const vinculo = await vincularClientes([...parados, ...naoIniciados], ctx)

  for (const c of parados) {
    const cid = vinculo.get(c.id) ?? null
    const s = ctx.sinais(cid, null)
    const inadimplente = c.status_secundario === 'INADIMPLENTE'
    itens.push({
      tipo: 'pendencia',
      cliente: ctx.nomeCliente(cid, c.cliente_nome),
      detalhe: inadimplente ? 'contrato inadimplente' : 'contrato pausado',
      client_id: cid, contact_id: null, conversation_id: null, contract_id: c.id,
      desde: c.atualizado_em,
      prioridade: inadimplente ? 3 : 1,
      clienteAtivo: s.clienteAtivo, situacao: s.situacao,
      contratoPausado: c.status_secundario === 'PAUSADO',
      // Inadimplência só de contrato que ainda vale: status não encerrado E dentro
      // do prazo do plano. Pausado congela o prazo: só o status conta.
      contratoForaDoPrazo: statusEncerrado(c.status) || (inadimplente && !contratoNoPrazo(c, agora)),
    })
  }

  for (const c of naoIniciados) {
    const cid = vinculo.get(c.id) ?? null
    const s = ctx.sinais(cid, null)
    const fech = (c.data_fechamento ?? '').slice(0, 10)
    const dias = Math.floor((agora.getTime() - new Date(`${fech}T12:00:00Z`).getTime()) / DIA)
    itens.push({
      tipo: 'pendencia',
      cliente: ctx.nomeCliente(cid, c.cliente_nome),
      detalhe: `contrato não iniciado há ${plural(dias, 'dia', 'dias')}`,
      client_id: cid, contact_id: null, conversation_id: null, contract_id: c.id,
      desde: fech ? `${fech}T12:00:00Z` : null,
      prioridade: 2,
      clienteAtivo: s.clienteAtivo, situacao: s.situacao,
      contratoForaDoPrazo: statusEncerrado(c.status),
    })
  }

  // Pendências de reuniões aguardam integração de agenda; não lemos meetings aqui.
  return itens
}

async function quedaVolume(admin: SupabaseClient, tenantId: string, limiar: number, agora: Date, ctx: Contexto): Promise<AlertaCandidato[]> {
  // Agregação no banco (migration 20261026160000): mensagens do cliente nos
  // últimos 7 dias × média semanal das 4 semanas anteriores, por contato.
  const linhas = checar<{ contact_id: string | null; msgs_semana: number; media_semanal: number }[]>('queda_volume', await admin
    .rpc('wa_auto_queda_volume', { p_tenant_id: tenantId, p_limiar: limiar, p_agora: agora.toISOString() }))
  await ctx.carregar(linhas.map((l) => l.contact_id), [])
  return linhas.map((l) => {
    const s = ctx.sinais(null, l.contact_id)
    return {
      tipo: 'queda_volume' as const,
      cliente: ctx.nomeContato(l.contact_id),
      detalhe: `${plural(Number(l.msgs_semana), 'mensagem', 'mensagens')} em 7 dias (costuma ${Math.round(Number(l.media_semanal))})`,
      client_id: s.client_id, contact_id: l.contact_id, conversation_id: null, contract_id: null,
      desde: null, prioridade: prioridadePorVinculo(s.client_id, s.situacao),
      contatoBloqueado: s.contatoBloqueado, grupo: s.grupo, clienteAtivo: s.clienteAtivo, situacao: s.situacao,
    }
  })
}

/** Reunião de um período, com o cliente (id) para quem precisa filtrar por carteira. */
export interface ReuniaoNoPeriodo extends ReuniaoDoDia {
  /** "26/10" no fuso. */
  dia: string
  client_id: string | null
}

/**
 * Reuniões marcadas/em andamento entre `inicio` (incluso) e `fim` (excluso), sempre
 * no tenant. Helper preservado para uso futuro; a coleta operacional aguarda
 * integração de agenda e não o chama.
 */
export async function reunioesNoPeriodo(
  admin: SupabaseClient, tenantId: string, inicio: Date, fim: Date, fuso = FUSO_PADRAO, ctx?: Contexto, limite = 50,
): Promise<ReuniaoNoPeriodo[]> {
  if (!tenantId) throw new ColetaError('tenant')
  const c = ctx ?? new Contexto(admin, tenantId)
  const linhas = checar<ReuniaoRow[]>('reunioes_periodo', await admin
    .from('meetings')
    .select('id, client_id, contact_id, guest_name, scheduled_at')
    .eq('tenant_id', tenantId)
    .in('status', ['scheduled', 'active'])
    .gte('scheduled_at', inicio.toISOString())
    .lt('scheduled_at', fim.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(limite))
  await c.carregar(linhas.map((r) => r.contact_id), linhas.map((r) => r.client_id))
  return linhas.map((r) => {
    const quando = new Date(r.scheduled_at as string)
    return {
      hora: horaBR(quando, fuso), dia: diaMesBR(quando, fuso), cliente: nomeDaReuniao(r, c),
      client_id: c.sinais(r.client_id, r.contact_id).client_id,
    }
  })
}

// ---------------------------------------------------------------------------
// Ignorados pelo gestor (painel) + a "novidade" de cada um
// ---------------------------------------------------------------------------

export interface IgnoradoLido extends Ignorado {
  motivo: string | null
  criado_por: string | null
  /** Nome do cliente/contato (seguro), para o painel. */
  cliente: string
}

function maisRecente(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null
  if (!b) return a
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b
}

/**
 * Lê os pedidos do tenant e calcula, para resolvido/ate_novidade, a última
 * novidade do alvo: mensagem do cliente (qualquer contato dele, ou o próprio
 * contato) ou mudança de status / contrato novo (contratos_audit_log) depois do
 * pedido. Tabela ainda não criada → nenhum pedido (ninguém pôde gravar nela).
 */
async function carregarIgnorados(admin: SupabaseClient, tenantId: string, ctx: Contexto): Promise<IgnoradoLido[]> {
  const r = await admin
    .from('wa_auto_alertas_ignorados')
    .select('id, tipo, client_id, contact_id, modo, ate, motivo, criado_por, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (r.error && faltaNoBanco(r.error)) {
    console.warn('wa-relatorio-dados: tabela de alertas ignorados ainda não existe')
    return []
  }
  const linhas = checar<Omit<IgnoradoLido, 'cliente' | 'novidade_em'>[]>('ignorados', r)
  await ctx.carregar(linhas.map((l) => l.contact_id), linhas.map((l) => l.client_id))

  const porNovidade = linhas.filter((l) => l.modo === 'resolvido' || l.modo === 'ate_novidade')
  const novidadePorCliente = new Map<string, string>()
  const novidadePorContato = new Map<string, string>()
  if (porNovidade.length > 0) {
    const desde = porNovidade.map((l) => l.created_at).sort()[0]
    // Clientes envolvidos: o do pedido ou o do contato do pedido.
    const clientes = unicos(porNovidade.map((l) => l.client_id ?? ctx.clienteDoContato(l.contact_id)))
    const contatosDosClientes = await emLotes(clientes, async (lote) => checar<{ id: string; client_id: string }[]>('ignorados_contatos', await admin
      .from('chat_contacts')
      .select('id, client_id')
      .eq('tenant_id', tenantId)
      .in('client_id', lote)
      .limit(5000)))
    const clienteDe = new Map(contatosDosClientes.map((c) => [c.id, c.client_id]))
    const contatos = unicos([...porNovidade.map((l) => l.contact_id), ...contatosDosClientes.map((c) => c.id)])

    const msgs = await emLotes(contatos, async (lote) => checar<{ contact_id: string; ultima_msg_cliente_em: string }[]>('ignorados_msgs', await admin
      .from('chat_conversations')
      .select('contact_id, ultima_msg_cliente_em')
      .eq('tenant_id', tenantId)
      .in('contact_id', lote)
      .gt('ultima_msg_cliente_em', desde)
      .limit(5000)))
    for (const m of msgs) {
      novidadePorContato.set(m.contact_id, maisRecente(novidadePorContato.get(m.contact_id), m.ultima_msg_cliente_em) as string)
      const cid = clienteDe.get(m.contact_id) ?? ctx.clienteDoContato(m.contact_id)
      if (cid) novidadePorCliente.set(cid, maisRecente(novidadePorCliente.get(cid), m.ultima_msg_cliente_em) as string)
    }

    const contratos = await emLotes(clientes, async (lote) => checar<{ id: string; cliente_id: string }[]>('ignorados_contratos', await admin
      .from('contratos')
      .select('id, cliente_id')
      .eq('tenant_id', tenantId)
      .in('cliente_id', lote)
      .limit(5000)))
    const clienteDoContrato = new Map(contratos.map((c) => [c.id, c.cliente_id]))
    const mudancas = await emLotes(contratos.map((c) => c.id), async (lote) => checar<{ contrato_id: string; alterado_em: string }[]>('ignorados_auditoria', await admin
      .from('contratos_audit_log')
      .select('contrato_id, alterado_em')
      .eq('tenant_id', tenantId)
      .in('contrato_id', lote)
      .gt('alterado_em', desde)
      .or('operacao.eq.INSERT,campo.in.(status,status_secundario)')
      .limit(5000)))
    for (const m of mudancas) {
      const cid = clienteDoContrato.get(m.contrato_id)
      if (cid) novidadePorCliente.set(cid, maisRecente(novidadePorCliente.get(cid), m.alterado_em) as string)
    }
  }

  return linhas.map((l) => {
    const cid = l.client_id ?? ctx.clienteDoContato(l.contact_id)
    const novidade = (l.modo === 'resolvido' || l.modo === 'ate_novidade')
      ? maisRecente(l.contact_id ? novidadePorContato.get(l.contact_id) : null, cid ? novidadePorCliente.get(cid) : null)
      : null
    return {
      ...l,
      novidade_em: maisRecente(novidade, ctx.novidadeDoCliente(cid)),
      cliente: l.client_id ? ctx.nomeCliente(l.client_id) : ctx.nomeContato(l.contact_id),
    }
  })
}

// ---------------------------------------------------------------------------
// Estrategista de cada item (opção "Separar por estrategista")
// ---------------------------------------------------------------------------

/**
 * Preenche estrategista_id / estrategista (nome seguro) nos itens que têm cliente:
 * o estrategista principal (estrategistaPrincipal) entre os vínculos ATIVOS do
 * tipo 'estrategista', e o nome dele em users — tudo filtrado pelo tenant. Sem
 * vínculo (ou usuário fora da empresa) → fica sem (vai para "Sem estrategista").
 */
async function atribuirEstrategistas(
  admin: SupabaseClient, tenantId: string, alertas: Partial<Record<TipoAlerta, ItemAlerta[]>>,
): Promise<void> {
  const itens = TIPOS_ALERTA.flatMap((t) => alertas[t] ?? [])
  const clientes = unicos(itens.map((i) => i.client_id))
  if (clientes.length === 0) return
  const atribs = await emLotes(clientes, async (lote) => checar<AtribuicaoCliente[]>('estrategistas', await admin
    .from('client_assignments')
    .select('client_id, user_id, tipo, ativo, criado_em')
    .eq('tenant_id', tenantId)
    .eq('tipo', 'estrategista')
    .eq('ativo', true)
    .in('client_id', lote)
    .limit(5000)))
  const principal = estrategistaPrincipal(atribs)
  const usuarios = await emLotes(unicos([...principal.values()]), async (lote) => checar<{ id: string; nome: string | null }[]>('estrategistas_nomes', await admin
    .from('users')
    .select('id, nome')
    .eq('tenant_id', tenantId)
    .in('id', lote)))
  const nomes = new Map(usuarios.map((u) => [u.id, nomeSeguro(u.nome)]))
  for (const i of itens) {
    const uid = i.client_id ? principal.get(i.client_id) : undefined
    if (!uid || !nomes.has(uid)) continue
    i.estrategista_id = uid
    i.estrategista = nomes.get(uid) ?? null
  }
}

// ---------------------------------------------------------------------------
// Tudo junto
// ---------------------------------------------------------------------------

export interface ColetaAlertas {
  dados: DadosRelatorio
  ocultos: Record<MotivoOculto, number>
  /** Pedidos do painel que ainda valem agora (os vencidos não aparecem). */
  ignorados: IgnoradoLido[]
}

/**
 * Lê as anomalias das regras LIGADAS, todas do tenant, e
 * aplica as regras automáticas e o que o gestor mandou ignorar.
 * Reuniões do dia e pendências de reuniões aguardam integração de agenda.
 * `opcoes` (wa_auto_config, ver carregarOpcoesRelatorio): "só clientes ativos"
 * filtra aqui; "separar por estrategista" busca o estrategista de cada item e
 * marca os dados para a montagem agrupar. Padrão: as duas desligadas.
 * Lança ColetaError se alguma leitura falhar (melhor não enviar do que enviar
 * um aviso incompleto dizendo "nenhum alerta").
 */
export async function coletarAlertas(
  admin: SupabaseClient,
  tenantId: string,
  regras: RegraAnomalia[],
  agora = new Date(),
  fuso = FUSO_PADRAO,
  opcoes: OpcoesRelatorio = OPCOES_RELATORIO_PADRAO,
): Promise<ColetaAlertas> {
  if (!tenantId) throw new ColetaError('tenant')
  const ctx = new Contexto(admin, tenantId)
  const candidatos: Partial<Record<TipoAlerta, AlertaCandidato[]>> = {}
  let janelaDias = JANELA_SEM_RESPOSTA_DIAS
  const janelaConfigurada = regras.find((r) => r.tipo === 'sentimento_negativo')?.janelaDias
  const janelaMovimentacao = Number.isInteger(janelaConfigurada) && Number(janelaConfigurada) >= 1 && Number(janelaConfigurada) <= 90
    ? Number(janelaConfigurada) : JANELA_SEM_RESPOSTA_DIAS

  for (const regra of regras) {
    if (!regra.ativo) continue
    switch (regra.tipo) {
      case 'sem_resposta':
        janelaDias = regra.janelaDias ?? JANELA_SEM_RESPOSTA_DIAS
        candidatos.sem_resposta = await semResposta(admin, tenantId, regra.limiar, janelaDias, agora, ctx)
        break
      case 'sentimento_negativo': candidatos.sentimento_negativo = await sentimentoNegativo(admin, tenantId, agora, ctx, opcoes.soClientesAtivos); break
      case 'pendencia': candidatos.pendencia = await pendencias(admin, tenantId, agora, ctx); break
      case 'queda_volume': candidatos.queda_volume = await quedaVolume(admin, tenantId, regra.limiar, agora, ctx); break
    }
  }

  // Grupos ativos sem cliente vinculado: sempre (não é regra configurável), na
  // mesma janela do "sem resposta" (padrão 7 dias).
  const janelaGrupos = regras.find((x) => x.tipo === 'sem_resposta')?.janelaDias ?? JANELA_SEM_RESPOSTA_DIAS
  candidatos.grupo_sem_cliente = await gruposSemCliente(admin, tenantId, janelaGrupos, agora, ctx)

  for (const lista of Object.values(candidatos)) {
    for (const a of lista ?? []) a.clienteSoContratosPausados = ctx.clienteSoContratosPausados(a.client_id)
  }

  const atualidades = await classificarAtualidadeContextual(
    candidatos.sentimento_negativo ?? [], ctx, agora, janelaMovimentacao, opcoes.soClientesAtivos,
  )
  const ignorados = await carregarIgnorados(admin, tenantId, ctx)
  ajustarContatoDosGrupos(candidatos.grupo_sem_cliente, ignorados, agora)
  // Um risco histórico não pode ocupar a vaga de uma cobrança ou pendência
  // contratual atual do mesmo cliente. Filtramos os dois conjuntos com as
  // mesmas regras e reunimos os itens; só a montagem do aviso os resume.
  const contextoAtual = (candidatos.sentimento_negativo ?? []).filter((a) => !atualidades.has(chaveAlerta(a)))
  const contextoSeparado = (candidatos.sentimento_negativo ?? []).filter((a) => atualidades.has(chaveAlerta(a)))
  const r = filtrarAlertas({ ...candidatos, ...(candidatos.sentimento_negativo ? { sentimento_negativo: contextoAtual } : {}) },
    ignorados, agora, { soClientesAtivos: opcoes.soClientesAtivos })
  const separados = filtrarAlertas({ sentimento_negativo: contextoSeparado }, ignorados, agora, { soClientesAtivos: opcoes.soClientesAtivos })
  let historicos = 0
  for (const item of separados.alertas.sentimento_negativo ?? []) {
    item.atualidade = atualidades.get(item.chave_alerta)
    if (item.atualidade === 'historico') historicos++
    else if (item.atualidade === 'pendente' && item.client_id) ctx.marcarAnalisePendente(item.client_id)
    const itens = r.alertas.sentimento_negativo ??= []
    itens.push(item)
  }
  for (const motivo of Object.keys(separados.ocultos) as MotivoOculto[]) r.ocultos[motivo] += separados.ocultos[motivo]
  r.foraSemCadastro += separados.foraSemCadastro
  if (opcoes.agruparPorEstrategista) await atribuirEstrategistas(admin, tenantId, r.alertas)

  return {
    dados: {
      data: dataBR(agora, fuso),
      alertas: r.alertas,
      reunioes: [], // Aguarda integração de agenda; registros antigos não viram fatos operacionais.
      ...(r.paradas > 0 ? { paradas: { quantidade: r.paradas, dias: janelaDias } } : {}),
      ...(historicos > 0 ? { historicos: { quantidade: historicos, dias: janelaMovimentacao } } : {}),
      ...(opcoes.agruparPorEstrategista ? { agruparPorEstrategista: true } : {}),
      ...(r.foraSemCadastro > 0 ? { foraSemCadastro: r.foraSemCadastro } : {}),
      ...(ctx.quantidadeAnalisesPendentes > 0 ? { analises_pendentes: ctx.quantidadeAnalisesPendentes } : {}),
    },
    ocultos: r.ocultos,
    ignorados: ignorados.filter((i) => ignoradoValendo(i, agora) || Object.values(candidatos).some((lista) => lista?.some((a) => ignoradoOculta(i, a, agora)))),
  }
}

/** Só os dados da mensagem (envio e prévia). */
export async function coletarDadosRelatorio(
  admin: SupabaseClient,
  tenantId: string,
  regras: RegraAnomalia[],
  agora = new Date(),
  fuso = FUSO_PADRAO,
  opcoes: OpcoesRelatorio = OPCOES_RELATORIO_PADRAO,
): Promise<DadosRelatorio> {
  return (await coletarAlertas(admin, tenantId, regras, agora, fuso, opcoes)).dados
}
