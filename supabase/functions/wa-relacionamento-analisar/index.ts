import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { contratosDosClientesAtendidos } from '../_shared/contratos-clientes-atendidos.ts'
// Análise periódica do RELACIONAMENTO por cliente, com memória (fase F5 do plano
// "Íris e satisfação dos clientes: histórico de conversas"). Substitui
// wa-auto-satisfacao (por conversa, 14 dias, sem memória).
//
// PARA QUÊ: para cada cliente ATIVO com contrato VIGENTE e pelo menos
// um canal de WhatsApp CONFIRMADO (cliente_canais), grava em
// cliente_relacionamento o estado do relacionamento: memória (resumo,
// pendências, eventos), satisfação (só pelo que o cliente demonstra), métricas
// determinísticas e o RISCO calculado por regra. A cada mudança de satisfação,
// risco ou pendências, uma foto vai para cliente_relacionamento_hist. O relatório
// diário (_shared/wa-relatorio-dados.ts) e a Íris leem daqui.
//
// Como (por cliente):
//   1) linha do tempo dos últimos 90 dias (RPC cliente_timeline: todas as conversas
//      do cliente, de todas as instâncias, com autor e transcrição; nunca grupo interno);
//   2) métricas (_shared/cliente-metricas.ts) — sempre, sem IA;
//   3) IA SÓ se houve mensagem nova desde analisado_ate (na 1ª vez, 90 dias):
//      memória anterior + mensagens novas + 20 anteriores de contexto
//      (_shared/wa-relacionamento.ts: prompt e validação). Sem novidade → só
//      métricas e risco (o silêncio também é risco);
//   4) risco por regra (calcularRisco) e gravação (estado + histórico).
//
// Quem chama:
//   * o agendador existente (nova migration prepara cadência de 15 min durante
//     o dia), com o segredo do Vault `wa_auto_cron_secret` no header
//     `x-cron-secret` (RPC wa_auto_cron_secret_confere). verify_jwt = false.
//     Corpo opcional: { "dry_run": true, "tenant_id": "<uuid>", "client_ids": [...] }.
//     Operação com segredo validado também aceita dry_run:false + tenant_id +
//     até cinco client_ids distintos, conferidos na empresa antes da execução.
//   * admin/gerente do app (JWT + vinculos_pode_gerir), SÓ prévia:
//     { "dry_run": true, "client_ids": ["<uuid>", ...] } (até 5). A empresa é a dele.
//     A prévia chama a IA e devolve o resultado SEM gravar a análise. Ela é
//     reservada no banco (cliente_relacionamento_previa_reservar: 1 por minuto e
//     até WA_RELACIONAMENTO_MAX_PREVIAS_DIA por empresa/dia) e o custo dela entra
//     no teto diário (cliente_relacionamento_uso). Sem client_ids, olha no máximo
//     10 clientes.
//
// Idempotência e custo:
//   * claim/lease de 10 min com SKIP LOCKED; reentrada no dia exige mensagem
//     atestada nova. Sem migration, preserva claim diário anterior;
//   * limites: IA por execução, IA por empresa/dia, teto de custo por empresa/dia
//     (env), tempo (150 s por chamada). Quem não coube na execução fica para a
//     próxima execução; quem passou do teto do dia só atualiza métricas e
//     risco (a IA lê amanhã — analisado_ate não anda);
//   * reserva por tentativa antes da IA, com ajuste idempotente de custo;
//     timeout conserva a estimativa. Modelo/preços/limites não são alterados.
//
// Segurança:
//   * client service_role; toda consulta por empresa leva `.eq('tenant_id', T)`;
//   * a conversa vai à IA como DADO não confiável (pseudonimizada: "Pessoa 1"),
//     a saída é validada de forma determinística; OpenRouter com
//     data_collection 'deny'; só modelos Claude;
//   * logs só com contagens e códigos — nunca conteúdo, nome ou resumo.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { situacaoContratual } from '../_shared/wa-alertas.ts'
import { type LinhaTimeline, montarTranscricaoCliente } from '../_shared/cliente-timeline.ts'
import { DIA_MS, JANELA_METRICAS_DIAS, type MetricasCliente, calcularMetricas } from '../_shared/cliente-metricas.ts'
import {
  type DecisaoIa, type EstadoRelacionamento, type Evento, type MotivoRisco, type Pendencia, type Risco,
  type Satisfacao, type SinalCliente, type Tendencia, VERSAO_PROMPT,
  calcularRisco, extrairJson, hojeBR, lerEstado, mensagemUsuarioRelacionamento, mesclarEventos,
  mudouEstado, planejarAnaliseRelacionamento, promptRelacionamento, validarRelacionamento,
} from '../_shared/wa-relacionamento.ts'
import { normalizarComparacao } from '../wa-auto-resumo-semanal/regras.ts'
import { lerPedidoRelacionamento as lerPedido, type PedidoRelacionamento as Pedido } from '../_shared/wa-relacionamento-pedido.ts'
import { LimitePendenciasExcedido, mensagensResolucao, referenciasTickets, referenciasTicketsVisiveis, vincularPendencias } from '../_shared/wa-atendimento-pendencias.ts'
import { registrarSugestoesTickets, sincronizarTickets } from '../_shared/wa-atendimento-sincronizacao.ts'
import { avaliarResolucoesTicketsIa, carregarContextoTicketsIa, contextoTicketsNoPrompt, precisaClassificarTickets,
  type ContextoTicketsIa, type ResolucaoTicketIa, type SugestaoResolucaoIa } from '../_shared/wa-atendimento-resolucao-ia.ts'
import { confirmarUsoIa, reservarUsoIa } from '../_shared/wa-relacionamento-uso.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function envNumero(nome: string, padrao: number, min: number, max: number): number {
  const n = Number((Deno.env.get(nome) ?? '').trim())
  return Number.isFinite(n) && n >= min && n <= max ? n : padrao
}

// ---- Limites ----
const ORCAMENTO_MS = 115_000          // não começa cliente novo depois disso
const TIMEOUT_IA_MS = 55_000
const FOLGA_IA_MS = 60_000            // tempo mínimo restante para começar uma análise com IA
const FOLGA_CLIENTE_MS = 8_000        // idem, só métricas
const CONCORRENCIA = 4
const MAX_TENANTS = 1_000
const MAX_CLIENTES_LIDOS = 10_000
const TAMANHO_LOTE = 150
const CICLO_CRON_MS = 15 * 60_000
/** Reivindicados por empresa e execução. */
const MAX_REIVINDICAR = 40
const MAX_PREVIAS = 5
/** Prévia sem client_ids: no máximo tantas linhas do tempo lidas procurando quem tem novidade. */
const MAX_TIMELINES_PREVIA = 10
/** Linha do tempo: tamanho da página pedida (máximo da RPC) e máximo de páginas. */
const PAGINA_TIMELINE = 2_000
const MAX_PAGINAS_TIMELINE = 2
const MAX_CHARS_TRANSCRICAO = 36_000
const MAX_TOKENS_SAIDA = 1_800
/** Folga para o raciocínio do modelo (conta dentro de max_tokens). */
const FOLGA_RACIOCINIO_TOKENS = 4_000
/** Prévias (dry_run): intervalo mínimo e teto por empresa/dia — conferidos no banco (atômico). */
const INTERVALO_PREVIA_S = 60
const MAX_PREVIAS_DIA = envNumero('WA_RELACIONAMENTO_MAX_PREVIAS_DIA', 20, 1, 200)

/** Análises com IA por execução (todas as empresas). */
const MAX_IA_EXECUCAO = envNumero('WA_RELACIONAMENTO_MAX_IA_EXECUCAO', 30, 1, 200)
/** Análises com IA por empresa e dia. */
const MAX_IA_TENANT_DIA = envNumero('WA_RELACIONAMENTO_MAX_IA_DIA', 150, 1, 2_000)
/** Teto de custo (US$) por empresa e dia. */
const TETO_CUSTO_DIA_USD = envNumero('WA_RELACIONAMENTO_TETO_USD_DIA', 10, 0.1, 500)
/** Preço por milhão de tokens, se a OpenRouter não devolver o custo (Opus 5.5: 4 / 20). */
const PRECO_ENTRADA_USD_M = envNumero('WA_IA_PRECO_ENTRADA_USD_M', 4, 0, 200)
const PRECO_SAIDA_USD_M = envNumero('WA_IA_PRECO_SAIDA_USD_M', 20, 0, 400)

// Claude Opus 5.5 via OpenRouter (decisão do dono). Trocável pela env
// WA_IA_MODELO_RELACIONAMENTO (só modelos Claude, formato validado).
const MODELO_IA = ((m) => (m && /^anthropic\/claude-[a-z0-9.-]{1,40}$/.test(m) ? m : 'anthropic/claude-opus-5.5'))(
  Deno.env.get('WA_IA_MODELO_RELACIONAMENTO')?.trim(),
)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function cronAutorizado(admin: SupabaseClient, segredo: string): Promise<boolean> {
  if (segredo.length < 32 || segredo.length > 256) return false
  const { data, error } = await admin.rpc('wa_auto_cron_secret_confere', { p_segredo: segredo })
  return !error && data === true
}

/** JWT válido + vinculos_pode_gerir (admin/gerente do app) + usuário ativo. Devolve a empresa DELE. */
async function usuarioAutorizado(admin: SupabaseClient, authHeader: string | null): Promise<{ userId: string; tenantId: string } | null> {
  if (!authHeader || !/^Bearer\s+\S+$/i.test(authHeader)) return null
  const usuario = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await usuario.auth.getUser()
  if (!user) return null
  const { data: pode, error } = await usuario.rpc('vinculos_pode_gerir')
  if (error || pode !== true) return null
  const { data: u } = await admin.from('users').select('ativo, tenant_id').eq('id', user.id).maybeSingle()
  if (!u || u.ativo !== true || !u.tenant_id) return null
  return { userId: user.id, tenantId: u.tenant_id as string }
}


// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

interface Execucao {
  admin: SupabaseClient
  agora: Date
  hoje: string
  dryRun: boolean
  prazo: number
  iaRestantes: number
  openrouterKey: string
}

interface Previa {
  client_id: string
  decisao: DecisaoIa | 'falha_ia' | 'limite'
  mensagens_lidas: number
  mensagens_novas: number
  satisfacao: Satisfacao
  confianca: number
  sinais_cliente: SinalCliente[]
  tendencia: Tendencia | null
  motivo: string | null
  resumo: string
  pendencias: Pendencia[]
  eventos: Evento[]
  risco: Risco
  risco_motivos: MotivoRisco[]
  metricas: MetricasCliente
  tokens_entrada?: number
  tokens_saida?: number
  custo_usd?: number
  trocas?: string[]
}

interface ResultadoTenant {
  tenant_id: string
  elegiveis: number
  reivindicados: number
  analisados_ia: number
  so_metricas: number
  sem_mensagens: number
  falhas: number
  tickets_sincronizados: number
  tickets_falhas: number
  tickets_resolvidos_ia: number
  tickets_ia_contexto_limitado: number
  tickets_ia_indisponivel: number
  /** Propostas da IA barradas: a mesma mensagem-prova apontada para mais de um ticket. */
  tickets_ia_evidencia_compartilhada: number
  /** Propostas da IA barradas: nenhuma prova escrita pelo cliente (só a equipe). */
  tickets_ia_sem_confirmacao_cliente: number
  /** Propostas da IA barradas: confirmação genérica com mais de um pedido aberto no canal, sem antecedente. */
  tickets_ia_generica_ambigua: number
  /** Sugestões gravadas na fila "Para confirmar" (sinal de solução sem certeza). */
  tickets_sugeridos_ia: number
  custo_reservado_sem_confirmacao: number
  /** Precisavam de IA mas ficaram para depois (limite/tempo). */
  adiados: number
  risco: Record<Risco, number>
  historico: number
  tokens_entrada: number
  tokens_saida: number
  custo_usd: number
  fora?: Record<string, number>
  motivo?: string
  previas?: Previa[]
}

const restante = (ex: Execucao) => ex.prazo - Date.now()

function novoResultado(T: string): ResultadoTenant {
  return {
    tenant_id: T, elegiveis: 0, reivindicados: 0, analisados_ia: 0, so_metricas: 0, sem_mensagens: 0, falhas: 0,
    tickets_sincronizados: 0, tickets_falhas: 0,
    tickets_resolvidos_ia: 0, tickets_ia_contexto_limitado: 0, tickets_ia_indisponivel: 0,
    tickets_ia_evidencia_compartilhada: 0, tickets_ia_sem_confirmacao_cliente: 0, tickets_ia_generica_ambigua: 0, tickets_sugeridos_ia: 0,
    custo_reservado_sem_confirmacao: 0,
    adiados: 0, risco: { alto: 0, medio: 0, baixo: 0 }, historico: 0, tokens_entrada: 0, tokens_saida: 0, custo_usd: 0,
  }
}

async function lerEmLotes<R>(
  ids: string[],
  consulta: (lote: string[]) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<R[] | null> {
  const out: R[] = []
  for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
    const { data, error } = await consulta(ids.slice(i, i + TAMANHO_LOTE))
    if (error) return null
    out.push(...((data ?? []) as R[]))
  }
  return out
}

/** Meia-noite de hoje em Brasília (UTC−3, sem horário de verão), em ISO. */
function inicioDoDiaBR(agora: Date): string {
  const local = agora.getTime() - 3 * 3_600_000
  return new Date(Math.floor(local / DIA_MS) * DIA_MS + 3 * 3_600_000).toISOString()
}

// ---------------------------------------------------------------------------
// Linha do tempo (RPC cliente_timeline, F3) com paginação defensiva
// ---------------------------------------------------------------------------
// cliente_timeline devolve as ÚLTIMAS p_limite (até 2000) do intervalo, em ordem
// cronológica. Página cheia → pede de novo ATÉ a mensagem mais antiga recebida
// (a repetida é descartada), voltando no tempo, até MAX_PAGINAS_TIMELINE.
async function lerTimeline(ex: Execucao, T: string, C: string): Promise<{ linhas: LinhaTimeline[]; paginas: number } | null> {
  const vistos = new Set<string>()
  const linhas: LinhaTimeline[] = []
  const desde = new Date(ex.agora.getTime() - JANELA_METRICAS_DIAS * DIA_MS).toISOString()
  let ate = ex.agora.toISOString()
  let paginas = 0
  while (paginas < MAX_PAGINAS_TIMELINE) {
    const { data, error } = await ex.admin.rpc('cliente_timeline', {
      p_tenant: T, p_client: C, p_desde: desde, p_ate: ate, p_limite: PAGINA_TIMELINE,
    })
    paginas++
    if (error) return null
    const pagina = (Array.isArray(data) ? data : []) as LinhaTimeline[]
    let novas = 0
    for (const l of pagina) {
      if (!l || typeof l.message_id !== 'string' || typeof l.criado_em !== 'string' || vistos.has(l.message_id)) continue
      vistos.add(l.message_id)
      linhas.push(l)
      novas++
    }
    if (novas === 0 || pagina.length < PAGINA_TIMELINE) break
    ate = pagina[0].criado_em
  }
  linhas.sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime())
  return { linhas, paginas }
}

// ---------------------------------------------------------------------------
// IA
// ---------------------------------------------------------------------------
interface RespostaIa { conteudo: string; tokensEntrada: number; tokensSaida: number; custoUsd: number; custoConhecido: boolean }

async function chamarIa(ex: Execucao, usuario: string): Promise<RespostaIa | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_IA_MS)
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${ex.openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://omnxdesk.com.br',
        'X-Title': 'OMNX Desk Relacionamento',
      },
      body: JSON.stringify({
        model: MODELO_IA,
        // Claude atual recusa temperature/top_p; o esforço controla a profundidade.
        max_tokens: MAX_TOKENS_SAIDA + FOLGA_RACIOCINIO_TOKENS,
        reasoning: { effort: 'medium' },
        response_format: { type: 'json_object' },
        // Só provedores que não guardam/treinam com o pedido (a conversa é dado do cliente).
        provider: { data_collection: 'deny' },
        usage: { include: true },
        messages: [
          // Prompt de sistema fixo: elegível ao cache do provedor.
          { role: 'system', content: promptRelacionamento() },
          { role: 'user', content: usuario },
        ],
      }),
    })
    if (!r.ok) {
      console.error('wa-relacionamento-analisar: IA respondeu', r.status)
      return null
    }
    const corpo = await r.json().catch(() => null)
    const conteudo: string = corpo?.choices?.[0]?.message?.content ?? ''
    const u = corpo?.usage ?? {}
    const tokensEntrada = Number.isFinite(Number(u.prompt_tokens)) ? Math.max(0, Math.round(Number(u.prompt_tokens))) : 0
    const tokensSaida = Number.isFinite(Number(u.completion_tokens)) ? Math.max(0, Math.round(Number(u.completion_tokens))) : 0
    const custoInformado = Number(u.cost)
    const custoExplicito = u.cost !== null && u.cost !== undefined && u.cost !== '' && Number.isFinite(custoInformado) && custoInformado >= 0
    const tokensConhecidos = u.prompt_tokens !== null && u.prompt_tokens !== undefined && u.completion_tokens !== null && u.completion_tokens !== undefined
      && Number.isFinite(Number(u.prompt_tokens)) && Number.isFinite(Number(u.completion_tokens))
    const custoUsd = custoExplicito
      ? custoInformado
      : (tokensEntrada * PRECO_ENTRADA_USD_M + tokensSaida * PRECO_SAIDA_USD_M) / 1_000_000
    return { conteudo, tokensEntrada, tokensSaida, custoUsd: Math.round(custoUsd * 1_000_000) / 1_000_000, custoConhecido: custoExplicito || tokensConhecidos }
  } catch (e) {
    console.error('wa-relacionamento-analisar: falha na IA', (e as Error)?.name)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Por empresa
// ---------------------------------------------------------------------------

interface CanaisDoCliente { grupos: number; privados: number; sugeridos: number }

interface ContextoTenant {
  T: string
  canais: Map<string, CanaisDoCliente>
  /** IA usada hoje (antes desta execução + nesta) e custo do dia. */
  iaHoje: number
  custoHoje: number
}

type LinhaRel = Record<string, unknown> & { client_id: string }

async function processarTenant(
  ex: Execucao, T: string, opcoes: { clientIds: string[] | null; exigirRegra: boolean },
): Promise<ResultadoTenant> {
  const res = novoResultado(T)

  const { data: app, error: errApp } = await ex.admin
    .from('app_modules').select('enabled').eq('tenant_id', T).eq('slug', 'automacoes-wa').maybeSingle()
  if (errApp) return { ...res, motivo: 'erro_leitura_app' }
  if ((app as { enabled?: boolean | null } | null)?.enabled !== true) return { ...res, motivo: 'app_desligado' }
  const { data: atendimentoApp, error: errAtendimentoApp } = await ex.admin.from('app_modules').select('enabled')
    .eq('tenant_id', T).eq('slug', 'atendimento').maybeSingle()
  if (errAtendimentoApp) return { ...res, motivo: 'erro_leitura_app' }
  if (opcoes.exigirRegra && atendimentoApp?.enabled === false) {
    const { data: regra, error: errRegra } = await ex.admin
      .from('wa_auto_regras_anomalia').select('ativo').eq('tenant_id', T).eq('tipo', 'sentimento_negativo').maybeSingle()
    if (errRegra) return { ...res, motivo: 'erro_leitura_regra' }
    if ((regra as { ativo?: boolean | null } | null)?.ativo !== true) return { ...res, motivo: 'regra_desligada' }
  }

  // Quem entra: cliente ATIVO (clients.ativo = true, como "só clientes ativos" do
  // relatório), com contrato VIGENTE (situacaoContratual, wa-alertas) e ao menos
  // um canal CONFIRMADO (cliente_canais).
  const { data: canaisData, error: errCanais } = await ex.admin
    .from('cliente_canais').select('client_id, tipo, status')
    .eq('tenant_id', T).in('status', ['confirmado', 'sugerido']).not('client_id', 'is', null)
    .limit(MAX_CLIENTES_LIDOS * 3)
  if (errCanais) return { ...res, motivo: 'erro_leitura_canais' }
  const canais = new Map<string, CanaisDoCliente>()
  for (const c of (canaisData ?? []) as { client_id: string; tipo: string; status: string }[]) {
    const atual = canais.get(c.client_id) ?? { grupos: 0, privados: 0, sugeridos: 0 }
    if (c.status === 'sugerido') atual.sugeridos++
    else if (c.tipo === 'grupo') atual.grupos++
    else atual.privados++
    canais.set(c.client_id, atual)
  }
  const comCanal = [...canais.entries()].filter(([, v]) => v.grupos + v.privados > 0).map(([id]) => id)
  if (comCanal.length === 0) return { ...res, motivo: 'sem_canal_confirmado' }

  const clientes = await lerEmLotes<{ id: string; ativo: boolean | null }>(comCanal, (lote) => ex.admin
    .from('clients').select('id, ativo').eq('tenant_id', T).in('id', lote))
  const contratos = await contratosDosClientesAtendidos(ex.admin, T, comCanal).catch(() => null)
  if (!clientes || !contratos) return { ...res, motivo: 'erro_leitura_clientes' }
  const statusPorCliente = new Map<string, (string | null)[]>()
  for (const c of contratos) statusPorCliente.set(c.cliente_id, [...(statusPorCliente.get(c.cliente_id) ?? []), c.status])
  const fora: Record<string, number> = {}
  const conta = (m: string) => { fora[m] = (fora[m] ?? 0) + 1 }
  const ativos = new Set(clientes.filter((c) => c.ativo === true).map((c) => c.id))
  let elegiveis: string[] = []
  for (const id of comCanal) {
    if (!ativos.has(id)) { conta('cliente_inativo_ou_outra_empresa'); continue }
    if (situacaoContratual(statusPorCliente.get(id) ?? []) !== 'vigente') { conta('sem_contrato_vigente'); continue }
    elegiveis.push(id)
  }
  if (opcoes.clientIds) {
    const pedidos = new Set(opcoes.clientIds)
    const ok = new Set(elegiveis)
    for (const id of pedidos) if (!ok.has(id)) conta('pedido_fora_da_analise')
    elegiveis = elegiveis.filter((id) => pedidos.has(id))
  }
  res.elegiveis = elegiveis.length
  res.fora = fora
  if (elegiveis.length === 0) return res

  // Fallback legado enquanto a migration está ausente. Após publicação, o total
  // combina acumulador de tentativas e análises antigas ainda não contabilizadas.
  const { data: usoData, error: errUso } = await ex.admin
    .from('cliente_relacionamento').select('custo_usd')
    .eq('tenant_id', T).gte('analisado_em', inicioDoDiaBR(ex.agora)).limit(MAX_CLIENTES_LIDOS)
  if (errUso) return { ...res, motivo: 'erro_leitura_uso' }
  const { data: previasData, error: errPrevias } = await ex.admin
    .from('cliente_relacionamento_uso').select('chamadas_ia, custo_usd')
    .eq('tenant_id', T).eq('dia', ex.hoje).maybeSingle()
  if (errPrevias) return { ...res, motivo: 'erro_leitura_uso' }
  const uso = (usoData ?? []) as { custo_usd: number | string | null }[]
  const previas = (previasData ?? null) as { chamadas_ia: number | null; custo_usd: number | string | null } | null
  const { data: totalUso, error: errTotalUso } = await ex.admin.rpc('cliente_relacionamento_uso_total', { p_tenant: T, p_dia: ex.hoje })
  if (errTotalUso && !['PGRST202', '42883'].includes(errTotalUso.code)) return { ...res, motivo: 'erro_leitura_uso' }
  if (!errTotalUso && (!totalUso || !Number.isFinite(Number(totalUso.chamadas)) || !Number.isFinite(Number(totalUso.custo))))
    return { ...res, motivo: 'erro_leitura_uso' }
  const ctx: ContextoTenant = {
    T, canais,
    iaHoje: !errTotalUso ? Number(totalUso.chamadas) : uso.length + (Number(previas?.chamadas_ia) || 0),
    custoHoje: !errTotalUso ? Number(totalUso.custo) : uso.reduce((s, u) => s + (Number(u.custo_usd) || 0), 0) + (Number(previas?.custo_usd) || 0),
  }

  // Quem processar nesta execução.
  let fila: LinhaRel[]
  if (ex.dryRun) {
    const linhas = await lerEmLotes<LinhaRel>(elegiveis, (lote) => ex.admin
      .from('cliente_relacionamento').select('*').eq('tenant_id', T).in('client_id', lote))
    if (!linhas) return { ...res, motivo: 'erro_leitura_estado' }
    const porId = new Map(linhas.map((l) => [l.client_id, l]))
    fila = elegiveis
      .map((id) => porId.get(id) ?? { client_id: id })
      .sort((a, b) => String(a.analisado_em ?? '') < String(b.analisado_em ?? '') ? -1 : 1)
      .slice(0, opcoes.clientIds ? MAX_PREVIAS : MAX_TIMELINES_PREVIA)
  } else {
    const argsClaim = {
      p_tenant: T, p_client_ids: elegiveis, p_dia: ex.hoje, p_limite: MAX_REIVINDICAR,
    }
    let claim = await ex.admin.rpc('cliente_relacionamento_reivindicar_ia', argsClaim)
    if (claim.error && ['PGRST202', '42883'].includes(claim.error.code))
      claim = await ex.admin.rpc('cliente_relacionamento_reivindicar', argsClaim)
    const { data, error } = claim
    if (error) {
      console.error('wa-relacionamento-analisar: falha ao reivindicar', error.code)
      return { ...res, motivo: 'erro_reivindicar' }
    }
    fila = (Array.isArray(data) ? data : []) as LinhaRel[]
    res.reivindicados = fila.length
  }
  if (fila.length === 0) return res

  let proxima = 0
  const trabalhador = async () => {
    while (true) {
      const i = proxima++
      if (i >= fila.length) return
      const linha = fila[i]
      if (ex.dryRun && (res.previas?.filter((p) => p.decisao === 'ia').length ?? 0) >= MAX_PREVIAS) return
      if (restante(ex) < FOLGA_CLIENTE_MS) {
        res.adiados++
        await liberar(ex, T, linha.client_id, linha.reivindicado_em)
        continue
      }
      try {
        await processarCliente(ex, ctx, linha, res)
      } catch (e) {
        console.error('wa-relacionamento-analisar: erro no cliente', (e as Error)?.name)
        res.falhas++
        await liberar(ex, T, linha.client_id, linha.reivindicado_em)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador))
  res.custo_usd = Math.round(res.custo_usd * 1_000_000) / 1_000_000
  return res
}

/** Devolve a reivindicação (o cliente volta para a próxima execução do dia). */
async function liberar(ex: Execucao, T: string, C: string, reivindicadoEm: unknown): Promise<void> {
  if (ex.dryRun) return
  if (typeof reivindicadoEm !== 'string') return
  const { error } = await ex.admin.from('cliente_relacionamento')
    .update({ reivindicado_em: null }).eq('tenant_id', T).eq('client_id', C).eq('reivindicado_em', reivindicadoEm)
  if (error) console.error('wa-relacionamento-analisar: falha ao liberar', error.code)
}

function iaPermitida(ex: Execucao, ctx: ContextoTenant): 'ok' | 'tempo' | 'execucao' | 'dia' {
  if (restante(ex) < FOLGA_IA_MS) return 'tempo'
  if (ex.iaRestantes <= 0) return 'execucao'
  if (ctx.iaHoje >= MAX_IA_TENANT_DIA || ctx.custoHoje >= TETO_CUSTO_DIA_USD) return 'dia'
  return 'ok'
}

async function processarCliente(ex: Execucao, ctx: ContextoTenant, linha: LinhaRel, res: ResultadoTenant): Promise<void> {
  const T = ctx.T
  const C = linha.client_id
  const tl = await lerTimeline(ex, T, C)
  if (!tl) {
    res.falhas++
    await liberar(ex, T, C, linha.reivindicado_em)
    return
  }
  const metricas = calcularMetricas(tl.linhas, ex.agora)
  const anterior: EstadoRelacionamento = lerEstado(linha, ex.agora)
  const primeira = !anterior.analisado_ate
  const plano = planejarAnaliseRelacionamento(tl.linhas, anterior, linha.versao_prompt)
  const { novas, entrada, revalidarFontes } = plano
  let decisao: DecisaoIa | 'falha_ia' | 'limite' = plano.decisao
  const linhasPrompt = entrada
  const contextoTickets: ContextoTicketsIa = !primeira && novas.length
    ? await carregarContextoTicketsIa(ex.admin, T, C) : { estado: 'completo', tickets: [] }
  if (contextoTickets.estado === 'adiar') {
    res.tickets_falhas++; res.adiados++
    await liberar(ex, T, C, linha.reivindicado_em)
    return // preservar cursor se o catálogo temporariamente falhou
  }
  if (contextoTickets.estado === 'limitado') res.tickets_ia_contexto_limitado++
  if (contextoTickets.estado === 'indisponivel') res.tickets_ia_indisponivel++
  if (precisaClassificarTickets(contextoTickets, novas)) decisao = 'ia'

  // Estado novo começa igual ao anterior.
  let estado: EstadoRelacionamento = { ...anterior }
  let ia: { modelo: string; tokens_entrada: number; tokens_saida: number; custo_usd: number } | null = null
  let trocas: string[] | undefined
  let resolucoesIa: ResolucaoTicketIa[] = []
  let sugestoesIa: SugestaoResolucaoIa[] = []
  let usoReservado = false

  if (decisao === 'ia') {
    const pode = iaPermitida(ex, ctx)
    if (pode === 'tempo' || pode === 'execucao') {
      // Cabe numa próxima execução da mesma manhã.
      res.adiados++
      await liberar(ex, T, C, linha.reivindicado_em)
      return
    }
    if (pode === 'dia') {
      decisao = 'limite'
      res.adiados++
    } else {
      ex.iaRestantes--
      ctx.iaHoje++
      const canais = ctx.canais.get(C) ?? { grupos: 0, privados: 0, sugeridos: 0 }
      const transcricao = montarTranscricaoCliente(referenciasTickets(linhasPrompt), { maxChars: MAX_CHARS_TRANSCRICAO, pseudonimizar: true, incluirReferencia: true })
      const normalizada = ` ${normalizarComparacao(transcricao)} `
      const usuario = mensagemUsuarioRelacionamento({
        agora: ex.agora, novasDesde: anterior.analisado_ate, estado: primeira ? null : anterior, metricas,
        contratoVigente: true, canais: { grupos: canais.grupos, privados: canais.privados }, transcricao,
        totalNovas: novas.length, revalidarFontes,
      }) + contextoTicketsNoPrompt(contextoTickets)
      const estimativaReserva = Math.ceil(((new TextEncoder().encode(promptRelacionamento() + usuario).length + 1024) * PRECO_ENTRADA_USD_M
        + (MAX_TOKENS_SAIDA + FOLGA_RACIOCINIO_TOKENS) * PRECO_SAIDA_USD_M)) / 1_000_000
      const reserva = await reservarUsoIa(ex.admin, { id: crypto.randomUUID(), tenant: T, cliente: C, dia: ex.hoje,
        limite: MAX_IA_TENANT_DIA, teto: TETO_CUSTO_DIA_USD, reserva: estimativaReserva })
      if (reserva.modo === 'bloqueado' || reserva.modo === 'erro') {
        res.adiados++
        if (reserva.modo === 'erro') res.falhas++
        await liberar(ex, T, C, linha.reivindicado_em)
        return
      }
      usoReservado = reserva.modo === 'reservado'
      const resposta = await chamarIa(ex, usuario)
      const custoDaChamada = resposta?.custoConhecido ? resposta.custoUsd : reserva.modo === 'reservado' ? reserva.custoReserva : resposta?.custoUsd ?? 0
      if (usoReservado) {
        const confirmado = await confirmarUsoIa(ex.admin, reserva, resposta?.custoConhecido ? resposta.custoUsd : null)
        if (!confirmado) res.custo_reservado_sem_confirmacao += reserva.modo === 'reservado' ? reserva.custoReserva : 0
      }
      ctx.custoHoje += custoDaChamada
      if (ex.dryRun && !usoReservado) {
        // Prévia não grava análise: o custo vai para o uso do dia (entra no teto).
        const { error: errReg } = await ex.admin.rpc('cliente_relacionamento_uso_registrar', {
          p_tenant: T, p_dia: ex.hoje, p_chamadas: 1, p_custo: resposta?.custoUsd ?? 0,
        })
        if (errReg) console.error('wa-relacionamento-analisar: falha ao registrar uso da prévia', errReg.code)
      }
      if (resposta) {
        res.tokens_entrada += resposta.tokensEntrada
        res.tokens_saida += resposta.tokensSaida
        if (resposta.custoConhecido) res.custo_usd += resposta.custoUsd
      }
      const brutoIa = resposta ? extrairJson(resposta.conteudo) : null
      const v = resposta ? validarRelacionamento(brutoIa, normalizada, ex.agora, anterior, tl.linhas) : null
      if (!v) {
        decisao = 'falha_ia'
        res.falhas++
      } else {
        if (v.trocas.length) {
          trocas = v.trocas
          console.log('wa-relacionamento-analisar: validação trocou', v.trocas.length, 'campo(s)')
        }
        let pendencias: Pendencia[]
        try {
          pendencias = vincularPendencias(v.pendencias, anterior.pendencias, linhasPrompt, novas, primeira)
        } catch (erro) {
          if (!(erro instanceof LimitePendenciasExcedido)) throw erro
          res.falhas++; res.adiados++
          console.error('wa-relacionamento-analisar: limite de pendências após vínculo')
          // A chamada já ocorreu. Reserva/prévia já contabilizaram o custo;
          // no fallback legado, registrar antes de adiar sem salvar análise.
          if (!ex.dryRun && !usoReservado) {
            const { error: erroUso } = await ex.admin.rpc('cliente_relacionamento_uso_registrar', {
              p_tenant: T, p_dia: ex.hoje, p_chamadas: 1, p_custo: custoDaChamada,
            })
            if (erroUso) console.error('wa-relacionamento-analisar: uso da análise adiada não registrado', erroUso.code)
          }
          await liberar(ex, T, C, linha.reivindicado_em)
          return // sem ponte, estado/histórico ou avanço do cursor
        }
        const ultima = novas.at(-1)?.criado_em ?? anterior.analisado_ate
        estado = {
          resumo: v.resumo, motivo: v.motivo, satisfacao: v.satisfacao, confianca: v.confianca,
          sinais_cliente: v.sinais_cliente, tendencia: v.tendencia,
          pendencias,
          eventos: mesclarEventos(anterior.eventos, v.eventos_novos), analisado_ate: ultima,
        }
        const refsVisiveis = referenciasTicketsVisiveis(transcricao)
        const avaliacao = avaliarResolucoesTicketsIa(
          brutoIa && typeof brutoIa === 'object' ? (brutoIa as Record<string, unknown>).resolucoes_tickets : null,
          contextoTickets, estado.pendencias, linhasPrompt, novas, refsVisiveis,
        )
        res.tickets_ia_evidencia_compartilhada += avaliacao.evidencia_compartilhada
        res.tickets_ia_sem_confirmacao_cliente += avaliacao.sem_confirmacao_cliente
        res.tickets_ia_generica_ambigua += avaliacao.generica_ambigua
        resolucoesIa = avaliacao.aprovadas
          .map((r) => ({ ...r, modelo: MODELO_IA, versao: `${VERSAO_PROMPT}/tickets-naturais-v4` }))
        sugestoesIa = avaliacao.sugeridas
          .map((r) => ({ ...r, modelo: MODELO_IA, versao: `${VERSAO_PROMPT}/tickets-naturais-v4` }))
        ia = {
          modelo: MODELO_IA, tokens_entrada: resposta!.tokensEntrada, tokens_saida: resposta!.tokensSaida,
          custo_usd: custoDaChamada,
        }
        res.analisados_ia++
      }
    }
  } else if (decisao === 'sem_mensagens') {
    res.sem_mensagens++
    estado = { ...anterior, satisfacao: 'sem_dados', confianca: 0, motivo: null, analisado_ate: tl.linhas.at(-1)?.criado_em ?? null }
  } else if (decisao === 'sem_novidade' && novas.length) {
    // Mensagens sem trabalho a classificar já foram consideradas. Não deixar
    // a reentrada periódica reivindicar para sempre a mesma fala da equipe.
    estado = { ...anterior, analisado_ate: novas.at(-1)!.criado_em }
  }
  if (decisao !== 'ia') res.so_metricas++

  // Ponte opcional enquanto a migration aguarda publicação. Ausência conhecida
  // continua legado; falha transitória adia SEM avançar o cursor (permite replay).
  // A RPC serializa alterações por cliente, confere as mensagens reais e nunca
  // reabre ticket. A baixa manual vence a memória antiga; ela é lida novamente
  // neste processamento, sem prometer atualização instantânea da memória.
  if (!ex.dryRun && !primeira) {
    const ponte = await sincronizarTickets(ex.admin, {
      p_tenant: T, p_cliente: C, p_pendencias: estado.pendencias, p_resolucoes: mensagensResolucao(novas),
      p_anterior_ate: anterior.analisado_ate!, p_analisado_ate: novas.at(-1)?.criado_em ?? anterior.analisado_ate!,
      p_resolucoes_ia: resolucoesIa,
    })
    if (ponte.tipo === 'adiar') {
      res.tickets_falhas++
      res.adiados++
      console.error('wa-relacionamento-analisar: tickets adiados sem avançar cursor', ponte.codigo)
      if (ia && !usoReservado) {
        // A análise não será persistida: preservar a cobrança no teto diário.
        const { error: erroUso } = await ex.admin.rpc('cliente_relacionamento_uso_registrar', {
          p_tenant: T, p_dia: ex.hoje, p_chamadas: 1, p_custo: ia.custo_usd,
        })
        if (erroUso) console.error('wa-relacionamento-analisar: uso da análise adiada não registrado', erroUso.code)
      }
      await liberar(ex, T, C, linha.reivindicado_em)
      return
    }
    if (ponte.tipo === 'sincronizado') {
      estado.pendencias = ponte.pendencias
      res.tickets_sincronizados++
      res.tickets_resolvidos_ia += ponte.resolvidas_ia ?? 0
      const sug = await registrarSugestoesTickets(ex.admin, T, C, sugestoesIa)
      if (sug.tipo === 'ok') res.tickets_sugeridos_ia += sug.total
      else if (sug.tipo === 'falha') console.error('wa-relacionamento-analisar: sugestões não gravadas', sug.codigo)
    } else if (ponte.tipo === 'indisponivel') {
      res.tickets_falhas++
    }
  }

  const risco = calcularRisco({
    satisfacao: estado.satisfacao, confianca: estado.confianca, sinais_cliente: estado.sinais_cliente,
    pendencias: estado.pendencias, metricas, contratoVigente: true,
  }, ex.agora)
  res.risco[risco.risco]++

  const midias = tl.linhas.filter((l) => ['audio', 'ptt', 'imagem', 'image'].includes(String(l.tipo ?? '').toLowerCase()))
  const canais = ctx.canais.get(C) ?? { grupos: 0, privados: 0, sugeridos: 0 }
  const cobertura = {
    canais_confirmados: canais.grupos + canais.privados,
    grupos: canais.grupos,
    privados: canais.privados,
    canais_sugeridos: canais.sugeridos,
    msgs_lidas: tl.linhas.length,
    msgs_novas: novas.length,
    paginas_timeline: tl.paginas,
    midia_transcrita_pct: midias.length
      ? Math.round((midias.filter((l) => String(l.midia_texto ?? '').trim()).length / midias.length) * 100) / 100
      : null,
  }

  if (ex.dryRun) {
    const lista = res.previas ?? []
    lista.push({
      client_id: C, decisao, mensagens_lidas: tl.linhas.length, mensagens_novas: novas.length,
      satisfacao: estado.satisfacao, confianca: estado.confianca, sinais_cliente: estado.sinais_cliente,
      tendencia: estado.tendencia, motivo: estado.motivo, resumo: estado.resumo, pendencias: estado.pendencias,
      eventos: estado.eventos, risco: risco.risco, risco_motivos: risco.motivos, metricas,
      ...(ia ? { tokens_entrada: ia.tokens_entrada, tokens_saida: ia.tokens_saida, custo_usd: ia.custo_usd } : {}),
      ...(trocas ? { trocas } : {}),
    })
    res.previas = lista
    return
  }

  const agoraIso = new Date().toISOString()
  const { data: estadoSalvo, error: errUpd } = await ex.admin.from('cliente_relacionamento').update({
    resumo: estado.resumo,
    motivo: estado.motivo,
    satisfacao: estado.satisfacao,
    confianca: estado.confianca,
    sinais_cliente: estado.sinais_cliente,
    tendencia: estado.tendencia,
    pendencias: estado.pendencias,
    eventos: estado.eventos,
    metricas,
    risco: risco.risco,
    risco_motivos: risco.motivos,
    cobertura,
    analisado_ate: estado.analisado_ate,
    processado_em: agoraIso,
    dia_processado: ex.hoje,
    reivindicado_em: null,
    ...(ia ? {
      analisado_em: agoraIso, modelo: ia.modelo, versao_prompt: VERSAO_PROMPT,
      tokens_entrada: ia.tokens_entrada, tokens_saida: ia.tokens_saida, custo_usd: ia.custo_usd,
      ...(usoReservado ? { ia_uso_contabilizado_ate: agoraIso } : {}),
    } : {}),
  }).eq('tenant_id', T).eq('client_id', C).eq('reivindicado_em', linha.reivindicado_em).select('client_id').maybeSingle()
  if (errUpd || !estadoSalvo) {
    console.error('wa-relacionamento-analisar: falha ao gravar estado', errUpd?.code ?? 'reivindicacao_alterada')
    res.falhas++
    await liberar(ex, T, C, linha.reivindicado_em)
    return
  }

  const riscoAnterior = typeof linha.risco === 'string' ? linha.risco : 'baixo'
  const nuncaProcessado = !linha.processado_em
  if (nuncaProcessado || mudouEstado(
    { satisfacao: anterior.satisfacao, risco: riscoAnterior, pendencias: anterior.pendencias },
    { satisfacao: estado.satisfacao, risco: risco.risco, pendencias: estado.pendencias },
  )) {
    const { error: errHist } = await ex.admin.from('cliente_relacionamento_hist').insert({
      tenant_id: T, // explícito: service_role não tem sessão
      client_id: C,
      satisfacao: estado.satisfacao,
      confianca: estado.confianca,
      risco: risco.risco,
      risco_motivos: risco.motivos,
      tendencia: estado.tendencia,
      sinais_cliente: estado.sinais_cliente,
      pendencias: estado.pendencias,
      motivo: estado.motivo,
      resumo: estado.resumo,
      metricas,
      analisado_ate: estado.analisado_ate,
      modelo: ia?.modelo ?? (typeof linha.modelo === 'string' ? linha.modelo : null),
      versao_prompt: ia ? VERSAO_PROMPT : (typeof linha.versao_prompt === 'string' ? linha.versao_prompt : null),
    })
    if (errHist) console.error('wa-relacionamento-analisar: falha ao gravar histórico', errHist.code)
    else res.historico++
  }
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------
function resumoLog(resultados: ResultadoTenant[], dryRun: boolean): void {
  const t = resultados.reduce((a, r) => ({
    ia: a.ia + r.analisados_ia, so: a.so + r.so_metricas, f: a.f + r.falhas, ad: a.ad + r.adiados, c: a.c + r.custo_usd,
  }), { ia: 0, so: 0, f: 0, ad: 0, c: 0 })
  console.log(`wa-relacionamento-analisar: ${resultados.length} empresa(s), ${t.ia} com IA, ${t.so} só métricas, ${t.f} falha(s), ${t.ad} adiado(s), US$ ${t.c.toFixed(4)}${dryRun ? ' [prévia]' : ''}`)
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const segredo = req.headers.get('x-cron-secret')
  let pedido: Pedido
  let tenantsFixos: string[] | null = null
  let exigirRegra = true

  if (segredo !== null) {
    // --- Agendador (ou operação manual com o segredo) ---
    if (!(await cronAutorizado(admin, segredo))) return json({ ok: false, error: 'unauthorized' }, 401)
    const p = lerPedido(await req.text(), true)
    if ('erro' in p) return json({ ok: false, error: p.erro }, p.status)
    if (p.dryRun && !p.tenantId) return json({ ok: false, error: 'tenant_id é obrigatório na prévia.' }, 400)
    // Operação direcionada: todos os clientes precisam pertencer à empresa informada.
    // Erro/ausência nunca cai na execução geral do tenant.
    if (!p.dryRun && p.clientIds) {
      const clientes = await admin.from('clients').select('id').eq('tenant_id', p.tenantId!)
        .in('id', p.clientIds).limit(6)
      if (clientes.error || !Array.isArray(clientes.data)) return json({ ok: false, error: 'Não foi possível conferir os clientes.' }, 500)
      const ids = new Set(clientes.data.map((c: { id: string }) => c.id))
      if (ids.size !== p.clientIds.length || p.clientIds.some(id => !ids.has(id))) return json({ ok: false, error: 'Cliente indisponível nesta empresa.' }, 404)
    }
    pedido = p
    if (p.tenantId) tenantsFixos = [p.tenantId]
  } else {
    // --- Prévia do admin/gerente do app (JWT) ---
    const quem = await usuarioAutorizado(admin, req.headers.get('Authorization'))
    if (!quem) return json({ ok: false, error: 'Sem permissão.' }, 403)
    const p = lerPedido(await req.text())
    if ('erro' in p) return json({ ok: false, error: p.erro }, p.status)
    if (!p.dryRun) return json({ ok: false, error: 'Pelo painel, só a prévia (dry_run).' }, 403)
    pedido = { ...p, tenantId: quem.tenantId }
    tenantsFixos = [quem.tenantId]
    exigirRegra = false
  }

  const openrouterKey = (Deno.env.get('OPENROUTER_API_KEY') ?? '').trim()
  if (!openrouterKey) {
    console.error('wa-relacionamento-analisar: OPENROUTER_API_KEY não configurada')
    return json({ ok: false, error: 'IA não configurada.' }, 500)
  }

  const agora = new Date()
  // Prévia (painel ou segredo): reserva atômica no banco — 1 por minuto e no
  // máximo MAX_PREVIAS_DIA por empresa/dia; o custo entra no teto do dia.
  if (pedido.dryRun && pedido.tenantId) {
    const { data: pode, error: errRes } = await admin.rpc('cliente_relacionamento_previa_reservar', {
      p_tenant: pedido.tenantId, p_dia: hojeBR(agora), p_intervalo_s: INTERVALO_PREVIA_S, p_max_dia: MAX_PREVIAS_DIA,
    })
    if (errRes) {
      console.error('wa-relacionamento-analisar: falha ao reservar prévia', errRes.code)
      return json({ ok: false, error: 'Não foi possível iniciar a prévia agora.' }, 500)
    }
    if (pode !== true) {
      return json({ ok: false, error: 'Aguarde um minuto entre prévias (ou o limite de prévias de hoje acabou).' }, 429)
    }
  }
  const ex: Execucao = {
    admin, agora, hoje: hojeBR(agora), dryRun: pedido.dryRun, prazo: Date.now() + ORCAMENTO_MS,
    iaRestantes: pedido.dryRun ? MAX_PREVIAS : MAX_IA_EXECUCAO, openrouterKey,
  }

  let tenants: string[]
  if (tenantsFixos) {
    tenants = tenantsFixos
  } else {
    // Mesmas empresas com Automações habilitado. Atendimento não depende de
    // enviar relatório de gestores nem de ligar alerta de sentimento.
    const { data: configs, error } = await admin
      .from('app_modules').select('tenant_id').eq('slug', 'automacoes-wa').eq('enabled', true)
      .order('tenant_id', { ascending: true }).limit(MAX_TENANTS)
    if (error) {
      console.error('wa-relacionamento-analisar: falha ao ler configurações', error.code)
      return json({ ok: false, error: 'Não foi possível ler as configurações.' }, 500)
    }
    tenants = ((configs ?? []) as { tenant_id: string }[]).map((c) => c.tenant_id)
  }
  // Rodízio: a cada execução a fila começa em outra empresa.
  const inicio = tenants.length > 0 ? Math.floor(agora.getTime() / CICLO_CRON_MS) % tenants.length : 0
  const fila = [...tenants.slice(inicio), ...tenants.slice(0, inicio)]

  const resultados: ResultadoTenant[] = []
  for (const T of fila) {
    if (restante(ex) < FOLGA_CLIENTE_MS) {
      resultados.push({ ...novoResultado(T), motivo: 'tempo_esgotado' })
      continue
    }
    try {
      resultados.push(await processarTenant(ex, T, { clientIds: pedido.clientIds, exigirRegra }))
    } catch (e) {
      console.error('wa-relacionamento-analisar: erro no tenant', (e as Error)?.name)
      resultados.push({ ...novoResultado(T), motivo: 'erro_inesperado' })
    }
  }
  resumoLog(resultados, pedido.dryRun)

  // Prévia pelo painel: sem o id da empresa na resposta (é a dele).
  const saida = segredo === null ? resultados.map(({ tenant_id: _t, ...r }) => r) : resultados
  return json({ ok: true, dry_run: pedido.dryRun, modelo: MODELO_IA, versao_prompt: VERSAO_PROMPT, resultados: saida })
})
