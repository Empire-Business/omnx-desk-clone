// Resumo semanal das conversas no WhatsApp (etapa 9.4 — docs/prd.md §0.6, P1).
//
// PARA QUEM: o resumo semanal é para o CLIENTE. O gestor NÃO recebe resumo
// semanal (ele recebe só o relatório diário, wa-auto-relatorio-diario).
//
// Quem chama: SÓ o agendador (pg_cron + pg_net, a cada 15 min), autenticado por um
// segredo guardado no Vault (header `x-cron-secret`), conferido pela RPC
// `wa_auto_cron_secret_confere` (service_role-only; criada na migration da 9.3,
// 20261026160000 — um segredo só para todos os jobs wa-auto-*). Nunca JWT anon (F1).
// ⇒ No gateway esta função precisa de verify_jwt = false (config.toml ou
//   `supabase functions deploy wa-auto-resumo-semanal --no-verify-jwt`): o cron não
//   tem JWT, e a proteção real é o segredo conferido aqui dentro.
//
// O que faz, por empresa com `wa_auto_config.resumo_ativo = true`, no dia/hora
// configurados (fuso America/Sao_Paulo):
//   * resumo_destino = 'privado' → para cada cliente ativo com contato
//     (chat_contacts do tenant vinculado ao client_id, direto ou por
//     chat_contact_clients), a IA resume SÓ a conversa DIRETA (não-grupo) daquele
//     contato na semana e o resumo vai para o número desse contato.
//     Fica de fora: contato bloqueado, sem mensagem do cliente na semana, ligado a
//     mais de um cliente (ambíguo), telefone inválido, cliente inativo/sem nome.
//   * resumo_destino = 'grupo'   → para cada GRUPO de WhatsApp vinculado a um cliente
//     ativo, um resumo enviado no próprio grupo, feito pela IA SÓ com as mensagens
//     daquele grupo (F4).
//   Nos dois casos: linguagem para o cliente, sem risco/sentimento/clima/avaliação
//   interna, e o nome do cliente sempre na mensagem (conferido antes do envio).
//
// API oficial (Zernio): fora da janela de 24h só sai modelo aprovado. O modo
// privado usa `template_resumo` com 4 variáveis, cada uma numa linha só:
//   {{1}} = nome do cliente · {{2}} = período ("19/10 a 26/10")
//   {{3}} = assuntos tratados ("a; b; c") · {{4}} = próximos passos ("a; b" ou,
//   sem nenhum, o texto fixo SEM_PROXIMOS = "Seguimos acompanhando por aqui.").
// Texto aprovado na Meta (omnx_resumo_semanal_cliente_v1 em _shared/wa-modelos-oficiais.ts):
//   "Olá, {{1}}! Segue o resumo da semana ({{2}}).
//    Assuntos tratados: {{3}}
//    Próximos passos: {{4}}
//    Resumo automático das nossas conversas no WhatsApp. Se algo não estiver certo, é só nos avisar."
// Pela UAZAPI (texto livre), sem próximos passos a linha some do texto.
// Próximos passos: só ações confirmadas pela EQUIPE; item com promessa comercial
// (reembolso, desconto, pagamento, R$, %…) é descartado (regras.ts, pareceComercial).
// Grupo pela oficial ainda não é suportado (não há como abrir a conversa do grupo
// do nosso lado) — o tenant é ignorado com motivo 'oficial_sem_grupo'.
//
// Segurança:
//   * F2: client service_role; toda consulta por empresa leva `.eq('tenant_id', T)`.
//     A única leitura entre empresas é a lista de configurações (é o agendador).
//   * F4: a conversa vai à IA como DADO não confiável, delimitado; a resposta é JSON
//     validado, com itens curtos higienizados (sem links, telefones, valores), sem
//     cópia literal da conversa e sem palavras de golpe/injeção. O destino vem do
//     banco (telefone do contato ou id do grupo), nunca do texto da IA. Limites por
//     execução e por empresa: conversas na IA, mensagens, caracteres, tokens e tempo.
//   * F5: wa_auto_envios guarda só destino, nome do cliente e ids — sem texto da
//     conversa nem token. Logs só com contagens e códigos.
//   * F6: idempotência por (tenant, tipo, destino, SEMANA ISO) — UNIQUE (tenant_id,
//     chave_idempotencia), reservada ANTES do envio; disjuntor do provedor; intervalo
//     aleatório entre envios pela UAZAPI (pausaEntreEnviosMs, 3–6 s).
//   * UAZAPI (não oficial): a moldura do resumo (saudação, abertura, conectivos,
//     fecho) é reescrita pela IA a cada envio (_shared/wa-humanizar.ts); nome do
//     cliente e período vão como marcadores, assuntos/próximos passos precisam sair
//     iguais, o aviso "automático" é obrigatório e a saída é validada; reprovou 2x
//     ou IA fora → fallback variado. Histórico guarda só humanizado: 'ia'|'fallback'.
//     Zernio: nada muda (modelo aprovado).
//
// Corpo opcional (só quem tem o segredo): { "dry_run": true, "tenant_id": "<uuid>" }.
// dry_run exige tenant_id (400 sem ele), respeita resumo_ativo e o app ligado, ignora
// só dia/hora, NÃO envia e NÃO grava (chama a IA, dentro dos limites); devolve as
// prévias (nome do cliente + texto/variáveis, sem telefone).
//   * Destino sem resumo útil (poucas mensagens / sem assunto / IA fora) é gravado
//     com a mesma chave (status 'falhou', erro 'sem_assunto' | 'falha_ia'; IA até 3
//     tentativas na semana) e não volta à fila. Rodízio de empresas a cada execução.
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  resolveWaProvider, disjuntorAberto, WaProviderError, type ResultadoEnvio, type WaConfigResolvida,
} from '../_shared/wa-provider.ts'
import {
  criarChamadaOpenRouter, humanizarTexto, pausaEntreEnviosMs, periodoDoDia,
  type ChamadaIa, type OrigemHumanizacao, type PeriodoDia,
} from '../_shared/wa-humanizar.ts'
import {
  chaveIdempotencia, converterMensagem,
  type MensagemConvertida, type ProvedorWa,
} from '../_shared/wa-mensagem.ts'
import {
  destinoGrupo, formatarPeriodo, janelaSemana, linhaTranscricao, listaSegura, lotes, mensagemCitaCliente,
  montarAlvosPrivados, montarResumo, nomeClienteSeguro, normalizarComparacao, pedidoHumanizacaoResumo, promptSistema,
  resumoDevidoAgora, temMensagemDoCliente, type ContatoPrivado, type OrigemResumo,
} from './regras.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ---- Limites por execução (F4/F6) ----
const ORCAMENTO_MS = 110_000          // para de começar trabalho novo depois disso
const FOLGA_IA_MS = 30_000            // tempo mínimo restante para chamar a IA
// Tempo mínimo restante para enviar: pior caso UAZAPI = (12 s + até 7 s de "digitando…")
// + 1 repetição só em 429 (~1,2 s + 19 s) ≈ 39 s. Rede/5xx não repetem (incerto).
const FOLGA_ENVIO_MS = 40_000
const PRAZO_HUMANIZACAO_MS = 20_000   // tempo máximo da IA reescrevendo a moldura (UAZAPI); depois, fallback
const MAX_TENANTS = 1_000             // o orçamento de tempo é o limite real
const MAX_CONVERSAS_IA = 20           // destinos resumidos pela IA por execução (todas as empresas)
const MAX_IA_POR_TENANT = 5           // por empresa e execução: uma empresa não esgota o limite das outras
const MAX_TENTATIVAS_IA = 3           // falhas da IA por destino/semana antes de desistir
const MAX_ALVOS_POR_TENANT = 40       // destinos examinados (consulta de mensagens) por empresa e execução
const ERRO_IA = 'falha_ia'            // ver ERROS_SEM_ENVIO em _shared/wa-provider.ts
const ERRO_SEM_ASSUNTO = 'sem_assunto'
const CICLO_CRON_MS = 15 * 60_000     // rodízio da ordem das empresas a cada execução
const MAX_MSGS_POR_CONVERSA = 300
const MIN_MSGS: Record<OrigemResumo, number> = { grupo: 5, privado: 3 }
const MAX_CHARS_TRANSCRICAO = 12_000
const MAX_TOKENS_IA = 400
/** Folga para o raciocínio do modelo (conta dentro de max_tokens). */
const FOLGA_RACIOCINIO_TOKENS = 4_000
const TIMEOUT_IA_MS = 30_000
const JANELA_DIAS = 7
const MAX_PREVIAS = 20
const MAX_CONVERSAS_LIDAS = 2_000     // conversas da semana lidas por empresa (privado)
const MAX_INSTANCIAS = 50
const TAMANHO_LOTE = 150              // ids por consulta `.in(...)` (URL de tamanho seguro)

// Claude Opus 5.5 via OpenRouter: o resumo vai para o cliente, então fidelidade
// pesa mais que custo/latência (roda no cron, sem ninguém esperando).
// Trocável pela env WA_IA_MODELO_RESUMO.
const MODELO_IA = ((m) => (m && /^anthropic\/claude-[a-z0-9.-]{1,40}$/.test(m) ? m : 'anthropic/claude-opus-5.5'))(
  Deno.env.get('WA_IA_MODELO_RESUMO')?.trim(),
)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function espera(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Autenticação do agendador (F1)
// ---------------------------------------------------------------------------
async function cronAutorizado(admin: SupabaseClient, req: Request): Promise<boolean> {
  const segredo = req.headers.get('x-cron-secret') ?? ''
  if (segredo.length < 32 || segredo.length > 256) return false
  const { data, error } = await admin.rpc('wa_auto_cron_secret_confere', { p_segredo: segredo })
  return !error && data === true
}

// ---------------------------------------------------------------------------
// Contexto da execução
// ---------------------------------------------------------------------------
interface Execucao {
  admin: SupabaseClient
  agora: Date
  desde: Date
  periodo: string
  janela: string
  dryRun: boolean
  prazo: number
  iaRestantes: number
  openrouterKey: string
  /** Reescrita humana do texto na UAZAPI (null sem chave → fallback variado). */
  chamarIa: ChamadaIa | null
  periodoDia: PeriodoDia
}

interface ConfigTenant {
  tenant_id: string
  provider: ProvedorWa
  resumo_ativo: boolean
  resumo_dia: number
  resumo_hora: string
  resumo_destino: OrigemResumo
  uazapi_instance_id: string | null
  template_resumo: string | null
}

interface Previa {
  destino_nome: string
  formato: 'texto' | 'template'
  texto?: string
  variaveis?: string[]
  humanizado?: OrigemHumanizacao
}

interface ResultadoTenant {
  tenant_id: string
  destino: OrigemResumo
  provider: ProvedorWa
  enviados: number
  falhas: number
  duplicados: number
  ignorados: number
  pendentes_proxima: number
  motivo?: string
  descartes?: Record<string, number>
  previas?: Previa[]
}

/** Um destino do resumo: SEMPRE do banco (telefone do contato ou id do grupo). */
interface Alvo {
  destino: string
  /** O que entra na chave de idempotência: a chave da PESSOA (privado) ou o id do grupo. */
  chaveDestino: string
  cliente: string
  clientId: string
  conversas: string[]
  extra: Record<string, unknown>
}

function novoResultado(cfg: ConfigTenant, provider: ProvedorWa): ResultadoTenant {
  return {
    tenant_id: cfg.tenant_id, destino: cfg.resumo_destino, provider,
    enviados: 0, falhas: 0, duplicados: 0, ignorados: 0, pendentes_proxima: 0,
  }
}

const restante = (ex: Execucao) => ex.prazo - Date.now()

/** Lê em lotes de ids (uma consulta por lote). Qualquer erro → null. */
async function lerEmLotes<R>(
  ids: string[],
  consulta: (lote: string[]) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<R[] | null> {
  const out: R[] = []
  for (const lote of lotes(ids, TAMANHO_LOTE)) {
    const { data, error } = await consulta(lote)
    if (error) return null
    out.push(...((data ?? []) as R[]))
  }
  return out
}

// ---------------------------------------------------------------------------
// Envio (reserva idempotente → provedor → atualiza histórico)
// ---------------------------------------------------------------------------
type Desfecho = 'enviado' | 'falhou' | 'duplicado' | 'pausado' | 'erro_registro'

async function reservarEEnviar(
  ex: Execucao,
  tenantId: string,
  resolvido: WaConfigResolvida,
  destino: string,
  destinoNome: string,
  chave: string,
  msg: MensagemConvertida,
  extra: Record<string, unknown>,
  reabrirId?: string,
  humanizado?: OrigemHumanizacao,
): Promise<Desfecho> {
  const { provider, config } = resolvido
  if (await disjuntorAberto(ex.admin, tenantId, provider.nome)) return 'pausado'

  let linha: { id: string }
  if (reabrirId) {
    // Linha de falha da IA da mesma semana: troca falhou → pendente de forma
    // condicional (só uma execução concorrente consegue).
    const { data: upd, error: errUpd } = await ex.admin
      .from('wa_auto_envios')
      .update({ status: 'pendente', erro: null, payload: { janela: ex.janela, ...extra } })
      .eq('id', reabrirId)
      .eq('tenant_id', tenantId)
      .eq('status', 'falhou')
      .eq('erro', ERRO_IA)
      .select('id')
    if (errUpd || !upd || upd.length !== 1) return 'duplicado'
    linha = upd[0] as { id: string }
  } else {
    const { data: nova, error: errIns } = await ex.admin
      .from('wa_auto_envios')
      .insert({
        tenant_id: tenantId, // explícito: service_role não tem sessão para o carimbo (F2)
        tipo: 'resumo_semanal',
        provider: provider.nome,
        destino,
        destino_nome: destinoNome,
        status: 'pendente',
        chave_idempotencia: chave,
        payload: { janela: ex.janela, ...extra }, // sem texto da conversa, sem token (F5)
      })
      .select('id')
      .single()
    if (errIns || !nova) {
      if ((errIns as { code?: string } | null)?.code === '23505') return 'duplicado'
      console.error('wa-auto-resumo-semanal: falha ao registrar envio', errIns?.code)
      return 'erro_registro'
    }
    linha = nova as { id: string }
  }

  let status: 'enviado' | 'falhou' = 'falhou'
  let erro: string | null = null
  let messageId: string | null = null
  let incerto = false
  const opcoes = { chaveIdempotencia: `${tenantId}:${chave}`, idioma: config.template_idioma }
  try {
    let r: ResultadoEnvio
    if (provider.nome === 'zernio') {
      // API oficial: sempre por modelo aprovado, nunca texto livre (fora da janela de 24h).
      if (msg.tipo !== 'template' || !config.template_resumo) {
        throw new WaProviderError('oficial_exige_template', 'A API oficial só envia o resumo com o modelo aprovado.')
      }
      r = await provider.sendTemplate(destino, config.template_resumo, msg.variaveis, opcoes)
    } else {
      if (msg.tipo !== 'texto') throw new WaProviderError('nao_suportado', 'Formato de mensagem inválido para a UAZAPI.')
      r = await provider.sendText(destino, msg.texto, { ...opcoes, humanizado })
    }
    status = 'enviado'
    messageId = r.messageId
  } catch (e) {
    erro = e instanceof WaProviderError ? e.message : 'Falha inesperada no envio.'
    // Pode ter saído (rede/timeout/5xx): fica 'falhou' com a chave da semana (não repete) e marcada.
    incerto = e instanceof WaProviderError ? e.incerto : true
    if (!(e instanceof WaProviderError)) console.error('wa-auto-resumo-semanal: erro inesperado no envio', (e as Error)?.name)
  }

  await ex.admin
    .from('wa_auto_envios')
    .update({
      status,
      erro,
      payload: {
        janela: ex.janela, ...extra, message_id: messageId, fonte_segredo: resolvido.fonteSegredo,
        ...(incerto ? { incerto: true } : {}),
      },
    })
    .eq('id', linha.id)
    .eq('tenant_id', tenantId)

  // UAZAPI: intervalo aleatório entre envios para não parecer disparo em massa.
  if (provider.nome === 'uazapi') {
    const pausa = pausaEntreEnviosMs()
    if (restante(ex) > pausa + FOLGA_ENVIO_MS) await espera(pausa)
  }
  return status
}

function contabilizar(res: ResultadoTenant, d: Desfecho): boolean {
  if (d === 'enviado') res.enviados++
  else if (d === 'falhou' || d === 'erro_registro') res.falhas++
  else if (d === 'duplicado') res.duplicados++
  else if (d === 'pausado') { res.motivo = 'disjuntor_aberto'; return false }
  return true
}

function adicionarPrevia(res: ResultadoTenant, p: Previa): void {
  const lista = res.previas ?? []
  if (lista.length < MAX_PREVIAS) lista.push(p)
  res.previas = lista
}

function previaDe(destinoNome: string, msg: MensagemConvertida, humanizado?: OrigemHumanizacao): Previa {
  return msg.tipo === 'texto'
    ? { destino_nome: destinoNome, formato: 'texto', texto: msg.texto, ...(humanizado ? { humanizado } : {}) }
    : { destino_nome: destinoNome, formato: 'template', variaveis: msg.variaveis }
}

// ---------------------------------------------------------------------------
// IA: resume UMA conversa (grupo ou direta), conteúdo como dado não confiável
// ---------------------------------------------------------------------------
interface ResumoIa { temas: string[]; proximos: string[] }

async function resumirConversaIa(
  ex: Execucao,
  origem: OrigemResumo,
  msgs: Array<{ conteudo: string | null; enviado_por_agente: boolean | null }>,
): Promise<ResumoIa | null> {
  const linhas = msgs
    .map((m) => {
      const t = linhaTranscricao(m.conteudo)
      return t ? `${m.enviado_por_agente ? 'EQUIPE' : 'CLIENTE'}: ${t}` : ''
    })
    .filter(Boolean)
  // Pouco texto de verdade: "sem assunto" (não é falha da IA, nem chega a chamá-la).
  if (linhas.length < MIN_MSGS[origem]) return { temas: [], proximos: [] }
  let transcricao = linhas.join('\n')
  // Fica o final da semana (mais recente) quando passa do limite.
  if (transcricao.length > MAX_CHARS_TRANSCRICAO) transcricao = transcricao.slice(-MAX_CHARS_TRANSCRICAO)
  const transcricaoNormalizada = ` ${normalizarComparacao(transcricao)} `

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
        'X-Title': 'OMNX Desk Resumo Semanal WhatsApp',
      },
      body: JSON.stringify({
        model: MODELO_IA,
        // Claude atual recusa temperature; o esforço controla a profundidade.
        max_tokens: MAX_TOKENS_IA + FOLGA_RACIOCINIO_TOKENS,
        reasoning: { effort: 'medium' },
        response_format: { type: 'json_object' },
        // Só provedores que não guardam/treinam com o pedido (a conversa é dado do cliente).
        provider: { data_collection: 'deny' },
        messages: [
          { role: 'system', content: promptSistema(origem) },
          { role: 'user', content: `<conversa>\n${transcricao}\n</conversa>` },
        ],
      }),
    })
    if (!r.ok) {
      console.error('wa-auto-resumo-semanal: IA respondeu', r.status)
      return null
    }
    const corpo = await r.json().catch(() => null)
    const conteudo: string = corpo?.choices?.[0]?.message?.content ?? ''
    let parsed: Record<string, unknown> | null = null
    try { parsed = JSON.parse(conteudo.trim()) } catch {
      const m = conteudo.match(/\{[\s\S]*\}/)
      if (m) { try { parsed = JSON.parse(m[0]) } catch { /* inválido */ } }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return {
      temas: listaSegura(parsed.temas, transcricaoNormalizada),
      proximos: listaSegura(parsed.proximos_passos, transcricaoNormalizada),
    }
  } catch (e) {
    console.error('wa-auto-resumo-semanal: falha na IA', (e as Error)?.name)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Histórico da semana (idempotência e tentativas)
// ---------------------------------------------------------------------------
interface RegistroSemana { id: string; status: string; erro: string | null; payload: unknown }

/** Registros de resumo DESTA semana desta empresa, por chave (1 consulta em vez de 1 por destino). */
async function registrosDaSemana(ex: Execucao, tenantId: string): Promise<Map<string, RegistroSemana> | null> {
  const { data, error } = await ex.admin
    .from('wa_auto_envios')
    .select('id, status, erro, payload, chave_idempotencia')
    .eq('tenant_id', tenantId)
    .eq('tipo', 'resumo_semanal')
    .like('chave_idempotencia', `resumo_semanal:%:${ex.janela}`)
    .limit(5_000)
  if (error) return null
  const mapa = new Map<string, RegistroSemana>()
  for (const r of (data ?? []) as Array<RegistroSemana & { chave_idempotencia: string }>) mapa.set(r.chave_idempotencia, r)
  return mapa
}

function tentativasIa(reg: RegistroSemana | undefined): number {
  const p = reg?.payload
  const n = p && typeof p === 'object' ? Number((p as Record<string, unknown>).tentativas_ia) : 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Falha da IA com tentativas sobrando: a linha da semana pode ser reaberta. */
function reabrivel(reg: RegistroSemana | undefined): boolean {
  return Boolean(reg && reg.status === 'falhou' && reg.erro === ERRO_IA && tentativasIa(reg) < MAX_TENTATIVAS_IA)
}

/**
 * Grava a tentativa SEM envio (mesma chave de idempotência do envio), para o destino
 * não voltar à fila a cada 15 min. 'sem_assunto' encerra a semana; 'falha_ia' soma
 * 1 tentativa (até MAX_TENTATIVAS_IA). Não conta para o disjuntor do provedor.
 */
async function registrarSemEnvio(
  ex: Execucao, tenantId: string, provedor: ProvedorWa, destino: string, destinoNome: string,
  chave: string, reg: RegistroSemana | undefined, erro: typeof ERRO_IA | typeof ERRO_SEM_ASSUNTO,
  extra: Record<string, unknown>,
): Promise<void> {
  const tentativas = tentativasIa(reg) + (erro === ERRO_IA ? 1 : 0)
  const payload = { janela: ex.janela, ...extra, tentativas_ia: tentativas } // sem texto (F5)
  if (reg) {
    await ex.admin
      .from('wa_auto_envios')
      .update({ erro, payload })
      .eq('id', reg.id)
      .eq('tenant_id', tenantId)
      .eq('status', 'falhou')
      .eq('erro', ERRO_IA)
    return
  }
  const { error } = await ex.admin.from('wa_auto_envios').insert({
    tenant_id: tenantId, // explícito (F2)
    tipo: 'resumo_semanal',
    provider: provedor,
    destino,
    destino_nome: destinoNome,
    status: 'falhou',
    erro,
    chave_idempotencia: chave,
    payload,
  })
  if (error && (error as { code?: string }).code !== '23505') {
    console.error('wa-auto-resumo-semanal: falha ao registrar tentativa', error.code)
  }
}

// ---------------------------------------------------------------------------
// Pipeline comum (grupo e privado): mensagens da semana → IA → filtros → envio
// ---------------------------------------------------------------------------
async function processarAlvos(
  ex: Execucao, cfg: ConfigTenant, resolvido: WaConfigResolvida | null, res: ResultadoTenant,
  origem: OrigemResumo, alvos: Alvo[],
): Promise<void> {
  const T = cfg.tenant_id
  const provedor = resolvido?.provider.nome ?? cfg.provider

  // Prévia não lê nem grava histórico.
  const registros = ex.dryRun ? new Map<string, RegistroSemana>() : await registrosDaSemana(ex, T)
  if (!registros) { res.motivo = 'erro_leitura_historico'; return }

  let examinados = 0
  let iaTenant = 0
  for (const alvo of alvos) {
    const chave = chaveIdempotencia('resumo_semanal', alvo.chaveDestino, ex.janela)

    // Já resolvido nesta semana (enviado, sem assunto, ou IA esgotou as tentativas):
    // pula sem gastar consulta nem IA — assim a fila anda até os destinos seguintes.
    const reg = registros.get(chave)
    if (reg && !reabrivel(reg)) { res.duplicados++; continue }
    if (
      examinados >= MAX_ALVOS_POR_TENANT || iaTenant >= MAX_IA_POR_TENANT ||
      ex.iaRestantes <= 0 || restante(ex) < FOLGA_IA_MS
    ) { res.pendentes_proxima++; continue }
    examinados++

    const semEnvio = async (erro: typeof ERRO_IA | typeof ERRO_SEM_ASSUNTO, extra: Record<string, unknown>) => {
      if (ex.dryRun) return
      await registrarSemEnvio(ex, T, provedor, alvo.destino, alvo.cliente, chave, reg, erro, { ...alvo.extra, ...extra })
    }

    // Só mensagens DESTA conversa (grupo ou direta), desta empresa, desta semana (F4).
    const { data: msgs, error: errMsg } = await ex.admin
      .from('chat_messages')
      .select('conteudo, enviado_por_agente, criado_em')
      .eq('tenant_id', T)
      .in('conversation_id', alvo.conversas)
      .eq('tipo', 'texto')
      .gte('criado_em', ex.desde.toISOString())
      .lt('criado_em', ex.agora.toISOString())
      .order('criado_em', { ascending: false })
      .limit(MAX_MSGS_POR_CONVERSA)
    if (errMsg) { res.falhas++; continue }
    const lista = ((msgs ?? []) as Array<{ conteudo: string | null; enviado_por_agente: boolean | null }>)
      .slice()
      .reverse()
    if (lista.length < MIN_MSGS[origem]) {
      res.ignorados++
      await semEnvio(ERRO_SEM_ASSUNTO, { motivo: 'poucas_mensagens' })
      continue
    }
    // Só quem conversou na semana: se só a equipe escreveu, não há o que resumir.
    if (!temMensagemDoCliente(lista)) {
      res.ignorados++
      await semEnvio(ERRO_SEM_ASSUNTO, { motivo: 'cliente_sem_mensagens' })
      continue
    }

    ex.iaRestantes--
    iaTenant++
    const resumo = await resumirConversaIa(ex, origem, lista)
    // Sem resumo útil: grava a tentativa com a MESMA chave do envio. IA fora → até
    // MAX_TENTATIVAS_IA na semana; sem assunto → encerra a semana. Prévia não grava.
    if (!resumo || resumo.temas.length === 0) {
      if (!resumo) res.falhas++
      else res.ignorados++
      await semEnvio(resumo ? ERRO_SEM_ASSUNTO : ERRO_IA, { mensagens_lidas: lista.length })
      continue
    }

    let msg: MensagemConvertida
    try {
      // Sem próximos passos: na UAZAPI a seção sai do texto; na oficial {{4}} = SEM_PROXIMOS.
      const { modelo, valores } = montarResumo(provedor, origem, {
        cliente: alvo.cliente, periodo: ex.periodo, temas: resumo.temas, proximos: resumo.proximos,
      })
      msg = converterMensagem(provedor, modelo, valores)
    } catch {
      res.ignorados++
      await semEnvio(ERRO_SEM_ASSUNTO, { motivo: 'mensagem_incompleta' })
      continue
    }
    // Regra do dono: a mensagem sempre cita o nome do cliente.
    if (!mensagemCitaCliente(msg, alvo.cliente)) {
      res.ignorados++
      await semEnvio(ERRO_SEM_ASSUNTO, { motivo: 'sem_nome_cliente' })
      continue
    }

    // UAZAPI: texto reescrito a cada envio (nunca a moldura fixa colada). Nunca bloqueia:
    // sem IA, sem tempo ou saída reprovada → fallback variado.
    let humanizado: OrigemHumanizacao | undefined
    if (provedor === 'uazapi' && msg.tipo === 'texto') {
      const prazo = Math.max(0, Math.min(PRAZO_HUMANIZACAO_MS, restante(ex) - FOLGA_ENVIO_MS))
      const h = await humanizarTexto(
        pedidoHumanizacaoResumo(origem, msg.texto, {
          cliente: alvo.cliente, periodo: ex.periodo, temas: resumo.temas, proximos: resumo.proximos,
        }, ex.periodoDia),
        { chamarIa: ex.chamarIa, prazoMs: prazo },
      )
      if (h.origem === 'fallback') console.log('wa-auto-resumo-semanal: fallback da humanização', h.motivos.join(','))
      msg = { tipo: 'texto', texto: h.texto }
      humanizado = h.origem
      if (!mensagemCitaCliente(msg, alvo.cliente)) { // conferido de novo no texto final
        res.ignorados++
        await semEnvio(ERRO_SEM_ASSUNTO, { motivo: 'sem_nome_cliente' })
        continue
      }
    }

    if (ex.dryRun) {
      adicionarPrevia(res, previaDe(alvo.cliente, msg, humanizado))
      continue
    }
    if (!resolvido) return
    if (restante(ex) < FOLGA_ENVIO_MS) { res.pendentes_proxima++; continue }
    const d = await reservarEEnviar(ex, T, resolvido, alvo.destino, alvo.cliente, chave, msg, {
      ...alvo.extra, mensagens_lidas: lista.length, ...(humanizado ? { humanizado } : {}), // só a origem (F5)
    }, reg?.id, humanizado)
    if (!contabilizar(res, d)) return
  }
}

/** Nome do cliente por id: só ativos, desta empresa, com nome apresentável. */
async function nomesDosClientes(ex: Execucao, tenantId: string, ids: string[]): Promise<Map<string, string> | null> {
  const clientes = await lerEmLotes<{ id: string; nome: string | null }>(ids, (lote) =>
    ex.admin.from('clients').select('id, nome').eq('tenant_id', tenantId).eq('ativo', true).in('id', lote))
  if (!clientes) return null
  const mapa = new Map<string, string>()
  for (const c of clientes) {
    const n = nomeClienteSeguro(c.nome)
    if (n) mapa.set(c.id, n)
  }
  return mapa
}

// ---------------------------------------------------------------------------
// Modo 'privado': conversa DIRETA de cada contato de cliente → número do contato
// ---------------------------------------------------------------------------
async function processarPrivado(
  ex: Execucao, cfg: ConfigTenant, resolvido: WaConfigResolvida | null, res: ResultadoTenant,
): Promise<void> {
  const T = cfg.tenant_id
  const provedor = resolvido?.provider.nome ?? cfg.provider

  if (provedor === 'zernio' && !(resolvido?.config.template_resumo ?? cfg.template_resumo)) {
    res.motivo = 'sem_modelo_oficial'
    return
  }
  if (!ex.openrouterKey) { res.motivo = 'ia_nao_configurada'; return }

  // De quais números (instâncias) vêm as conversas:
  //   * UAZAPI: só da instância que ENVIA (o cliente recebe do mesmo número com que conversa);
  //   * Zernio: da instância configurada, se houver; senão de todas as instâncias da empresa
  //     (o envio sai do número oficial, por modelo aprovado).
  const inst = (resolvido?.config.uazapi_instance_id ?? cfg.uazapi_instance_id ?? '').trim()
  let instancias: string[] = []
  if (inst) {
    const { data: wi } = await ex.admin
      .from('whatsapp_instances').select('id').eq('tenant_id', T).eq('instance_id', inst).maybeSingle()
    if (wi) instancias = [(wi as { id: string }).id]
  } else if (provedor === 'zernio') {
    const { data } = await ex.admin
      .from('whatsapp_instances').select('id').eq('tenant_id', T).order('id', { ascending: true }).limit(MAX_INSTANCIAS)
    instancias = ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
  }
  if (instancias.length === 0) { res.motivo = 'sem_instancia'; return }

  // Conversas DIRETAS (is_group = false explícito) com movimento na semana.
  const { data: convs, error: errConv } = await ex.admin
    .from('chat_conversations')
    .select('id, contact_id')
    .eq('tenant_id', T)
    .in('instance_id', instancias)
    .eq('is_group', false)
    .gte('atualizado_em', ex.desde.toISOString())
    .order('id', { ascending: true })
    .limit(MAX_CONVERSAS_LIDAS)
  if (errConv) { res.motivo = 'erro_leitura_conversas'; return }
  const convsPorContato = new Map<string, string[]>()
  for (const c of (convs ?? []) as Array<{ id: string; contact_id: string | null }>) {
    if (!c.contact_id) continue
    const lista = convsPorContato.get(c.contact_id) ?? []
    lista.push(c.id)
    convsPorContato.set(c.contact_id, lista)
  }
  if (convsPorContato.size === 0) { res.motivo = 'sem_conversas_na_semana'; return }
  const idsContatos = [...convsPorContato.keys()]

  const contatos = await lerEmLotes<ContatoPrivado>(idsContatos, (lote) =>
    ex.admin.from('chat_contacts')
      .select('id, numero_whatsapp, client_id, bloqueado, group_size')
      .eq('tenant_id', T)
      .in('instance_id', instancias)
      .in('id', lote))
  const vinculos = await lerEmLotes<{ contact_id: string; client_id: string }>(idsContatos, (lote) =>
    ex.admin.from('chat_contact_clients').select('contact_id, client_id').eq('tenant_id', T).in('contact_id', lote))
  if (!contatos || !vinculos) { res.motivo = 'erro_leitura_contatos'; return }

  const idsClientes = new Set<string>()
  for (const c of contatos) if (c.client_id) idsClientes.add(c.client_id)
  for (const v of vinculos) idsClientes.add(v.client_id)
  if (idsClientes.size === 0) { res.motivo = 'sem_contato_de_cliente'; return }
  const nomes = await nomesDosClientes(ex, T, [...idsClientes])
  if (!nomes) { res.motivo = 'erro_leitura_clientes'; return }

  const { alvos, descartes } = montarAlvosPrivados(contatos, vinculos, nomes, convsPorContato)
  res.descartes = descartes
  res.ignorados += Object.values(descartes).reduce((a, b) => a + b, 0)
  if (alvos.length === 0) { res.motivo = 'sem_contato_de_cliente'; return }

  await processarAlvos(ex, cfg, resolvido, res, 'privado', alvos.map((a) => ({
    destino: a.destino,
    chaveDestino: a.chave, // pessoa, não o número do 1º contato (com/sem nono dígito = mesma chave)
    cliente: a.cliente,
    clientId: a.clientId,
    conversas: a.conversas,
    extra: { destino_tipo: 'cliente_privado', client_id: a.clientId },
  })))
}

// ---------------------------------------------------------------------------
// Modo 'grupo': resumo de cada grupo de cliente, só com as mensagens do grupo
// ---------------------------------------------------------------------------
async function processarGrupo(
  ex: Execucao, cfg: ConfigTenant, resolvido: WaConfigResolvida | null, res: ResultadoTenant,
): Promise<void> {
  const T = cfg.tenant_id
  const provedor = resolvido?.provider.nome ?? cfg.provider

  // A oficial não abre conversa de grupo do nosso lado (docs.zernio.com) e ainda não
  // guardamos o conversationId do grupo. Até lá, resumo em grupo só pela UAZAPI.
  if (provedor === 'zernio') { res.motivo = 'oficial_sem_grupo'; return }
  if (!ex.openrouterKey) { res.motivo = 'ia_nao_configurada'; return }

  // Só grupos em que o número que ENVIA participa: os da instância configurada.
  const inst = (resolvido?.config.uazapi_instance_id ?? cfg.uazapi_instance_id ?? '').trim()
  if (!inst) { res.motivo = 'sem_instancia'; return }
  const { data: wi } = await ex.admin
    .from('whatsapp_instances')
    .select('id')
    .eq('tenant_id', T)
    .eq('instance_id', inst)
    .maybeSingle()
  if (!wi) { res.motivo = 'sem_instancia'; return }

  const { data: convs, error: errConv } = await ex.admin
    .from('chat_conversations')
    .select('id, contact_id, is_group')
    .eq('tenant_id', T)
    .eq('instance_id', wi.id)
    .eq('is_group', true)
    .gte('atualizado_em', ex.desde.toISOString())
    .limit(500)
  if (errConv) { res.motivo = 'erro_leitura_conversas'; return }
  const convsPorContato = new Map<string, string[]>()
  for (const c of (convs ?? []) as Array<{ id: string; contact_id: string | null; is_group: boolean | null }>) {
    // Só conversa marcada como grupo (true explícito; null/false nunca vira destino de grupo).
    if (!c.contact_id || c.is_group !== true) continue
    const lista = convsPorContato.get(c.contact_id) ?? []
    lista.push(c.id)
    convsPorContato.set(c.contact_id, lista)
  }
  if (convsPorContato.size === 0) { res.motivo = 'sem_grupos_na_semana'; return }

  const contatos = await lerEmLotes<{ id: string; numero_whatsapp: string | null; client_id: string | null; bloqueado: boolean | null }>(
    [...convsPorContato.keys()],
    (lote) => ex.admin.from('chat_contacts')
      .select('id, numero_whatsapp, client_id, bloqueado')
      .eq('tenant_id', T)
      .eq('instance_id', wi.id)
      .in('id', lote),
  )
  if (!contatos) { res.motivo = 'erro_leitura_contatos'; return }
  // Ordem estável: os já resolvidos na semana são pulados e a fila anda.
  contatos.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  // Só grupos vinculados a um cliente e não bloqueados: grupo interno, de
  // aquecimento ou sem cliente nunca recebe resumo (e a mensagem cita o cliente).
  const comCliente = contatos.filter((c) => c.client_id && c.bloqueado !== true)
  res.ignorados += contatos.length - comCliente.length
  if (comCliente.length === 0) { res.motivo = 'sem_grupo_de_cliente'; return }

  const nomes = await nomesDosClientes(ex, T, [...new Set(comCliente.map((c) => c.client_id as string))])
  if (!nomes) { res.motivo = 'erro_leitura_clientes'; return }

  const alvos: Alvo[] = []
  for (const contato of comCliente) {
    const cliente = nomes.get(contato.client_id as string)
    if (!cliente) { res.ignorados++; continue } // cliente inativo ou sem nome
    // Destino SEMPRE do cadastro do grupo (nunca do texto da IA). O webhook grava o
    // id do grupo sem o sufixo; aqui volta a ser "<id>@g.us" e só passa no formato
    // REAL de grupo (120363… ou telefone-carimbo): um telefone com "@g.us" é recusado.
    const destino = destinoGrupo(contato.numero_whatsapp)
    if (!destino) { res.ignorados++; continue }
    alvos.push({
      destino,
      chaveDestino: destino,
      cliente,
      clientId: contato.client_id as string,
      conversas: convsPorContato.get(contato.id) ?? [],
      extra: { destino_tipo: 'grupo', client_id: contato.client_id },
    })
  }
  if (alvos.length === 0) { res.motivo = 'sem_grupo_de_cliente'; return }

  await processarAlvos(ex, cfg, resolvido, res, 'grupo', alvos)
}

// ---------------------------------------------------------------------------
// Por empresa
// ---------------------------------------------------------------------------
async function processarTenant(ex: Execucao, cfg: ConfigTenant): Promise<ResultadoTenant> {
  const T = cfg.tenant_id

  // Só segue com o app LIGADO de forma explícita (enabled === true). Erro de leitura,
  // linha ausente ou enabled nulo/false = nada sai nesta execução.
  const { data: app, error: errApp } = await ex.admin
    .from('app_modules')
    .select('enabled')
    .eq('tenant_id', T)
    .eq('slug', 'automacoes-wa')
    .maybeSingle()
  if (errApp) return { ...novoResultado(cfg, cfg.provider), motivo: 'erro_leitura_app' }
  if ((app as { enabled?: boolean | null } | null)?.enabled !== true) {
    return { ...novoResultado(cfg, cfg.provider), motivo: 'app_desligado' }
  }

  // Prévia não precisa (nem deve) decifrar segredo do Vault.
  let resolvido: WaConfigResolvida | null = null
  if (!ex.dryRun) {
    try {
      resolvido = await resolveWaProvider(ex.admin, T)
    } catch (e) {
      const codigo = e instanceof WaProviderError ? e.codigo : 'erro_inesperado'
      return { ...novoResultado(cfg, cfg.provider), motivo: `provedor_${codigo}` }
    }
  }
  const res = novoResultado(cfg, resolvido?.provider.nome ?? cfg.provider)

  if (cfg.resumo_destino === 'grupo') await processarGrupo(ex, cfg, resolvido, res)
  else if (cfg.resumo_destino === 'privado') await processarPrivado(ex, cfg, resolvido, res)
  else res.motivo = 'destino_invalido'
  return res
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------
servirComLicenca(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  if (!(await cronAutorizado(admin, req))) return json({ ok: false, error: 'unauthorized' }, 401)

  let dryRun = false
  let tenantFiltro: string | null = null
  try {
    const bruto = await req.text()
    if (bruto.length > 1024) return json({ ok: false, error: 'Pedido grande demais.' }, 413)
    const body = bruto ? JSON.parse(bruto) : {}
    dryRun = body?.dry_run === true
    if (typeof body?.tenant_id === 'string') {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.tenant_id)) {
        return json({ ok: false, error: 'tenant_id inválido.' }, 400)
      }
      tenantFiltro = body.tenant_id
    }
  } catch {
    return json({ ok: false, error: 'Pedido inválido.' }, 400)
  }
  // Prévia é sempre de UMA empresa (nunca varre todas).
  if (dryRun && !tenantFiltro) return json({ ok: false, error: 'tenant_id é obrigatório na prévia.' }, 400)

  const agora = new Date()
  const desde = new Date(agora.getTime() - JANELA_DIAS * 86_400_000)
  const ex: Execucao = {
    admin,
    agora,
    desde,
    periodo: formatarPeriodo(desde, agora),
    janela: janelaSemana(agora),
    dryRun,
    prazo: Date.now() + ORCAMENTO_MS,
    iaRestantes: MAX_CONVERSAS_IA,
    openrouterKey: (Deno.env.get('OPENROUTER_API_KEY') ?? '').trim(),
    chamarIa: criarChamadaOpenRouter(Deno.env.get('OPENROUTER_API_KEY'), { titulo: 'OMNX Desk Resumo Semanal WhatsApp' }),
    periodoDia: periodoDoDia(agora),
  }

  // Única leitura entre empresas: a lista de quem tem o resumo configurado.
  let q = admin
    .from('wa_auto_config')
    .select('tenant_id, provider, resumo_ativo, resumo_dia, resumo_hora, resumo_destino, uazapi_instance_id, template_resumo')
    .eq('resumo_ativo', true) // também na prévia: resumo desligado não gera nada
    .order('tenant_id', { ascending: true })
    .limit(MAX_TENANTS)
  if (tenantFiltro) q = q.eq('tenant_id', tenantFiltro)
  const { data: configs, error } = await q
  if (error) {
    console.error('wa-auto-resumo-semanal: falha ao ler configurações', error.code)
    return json({ ok: false, error: 'Não foi possível ler as configurações.' }, 500)
  }
  if (dryRun && (configs ?? []).length === 0) {
    return json({ ok: true, dry_run: true, janela: ex.janela, periodo: ex.periodo, resultados: [], motivo: 'resumo_desligado' })
  }

  // Empresas devidas agora, em rodízio: a cada execução a fila começa em outra
  // empresa, para as primeiras por tenant_id não ficarem sempre com o limite de IA.
  const devidas = ((configs ?? []) as ConfigTenant[])
    .map((bruto) => ({ ...bruto, provider: (bruto.provider === 'zernio' ? 'zernio' : 'uazapi') as ProvedorWa }))
    .filter((cfg) => dryRun || resumoDevidoAgora(cfg, agora))
  const inicio = devidas.length > 0 ? Math.floor(agora.getTime() / CICLO_CRON_MS) % devidas.length : 0
  const fila = [...devidas.slice(inicio), ...devidas.slice(0, inicio)]

  const resultados: ResultadoTenant[] = []
  for (const cfg of fila) {
    if (restante(ex) < FOLGA_ENVIO_MS) {
      resultados.push({ ...novoResultado(cfg, cfg.provider), motivo: 'tempo_esgotado' })
      continue
    }
    try {
      resultados.push(await processarTenant(ex, cfg))
    } catch (e) {
      console.error('wa-auto-resumo-semanal: erro no tenant', (e as Error)?.name)
      resultados.push({ ...novoResultado(cfg, cfg.provider), motivo: 'erro_inesperado' })
    }
  }

  const total = resultados.reduce(
    (acc, r) => ({ enviados: acc.enviados + r.enviados, falhas: acc.falhas + r.falhas }),
    { enviados: 0, falhas: 0 },
  )
  console.log(`wa-auto-resumo-semanal: ${resultados.length} empresa(s), ${total.enviados} enviado(s), ${total.falhas} falha(s)${dryRun ? ' [prévia]' : ''}`)

  return json({ ok: true, dry_run: dryRun, janela: ex.janela, periodo: ex.periodo, resultados })
})
