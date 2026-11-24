import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { contratosDosClientesAtendidos } from '../_shared/contratos-clientes-atendidos.ts'
// Análise diária de satisfação dos clientes (app Automações WhatsApp).
//
// APOSENTADA (F5, migration 20261027150000): o agendador 'wa-auto-satisfacao-diaria'
// foi desagendado e a análise passou a ser por CLIENTE, com memória
// (wa-relacionamento-analisar → cliente_relacionamento). Esta função fica publicada
// só para reversão (o comando para reagendar está no cabeçalho da migration) e
// wa_auto_satisfacao continua como leitura/fallback do relatório.
//
// PARA QUÊ: o relatório diário ao gestor lista "Clientes insatisfeitos ou em
// risco". Antes isso dependia de chat_conversations.sentimento (quase sempre
// vazio) e de chat_weekly_reports (parado). Agora, toda manhã, a IA lê as
// conversas com movimento e grava em wa_auto_satisfacao o nível (satisfeito /
// neutro / atenção / insatisfeito), a confiança, um motivo curto parafraseado,
// sinais de uma lista fixa e a tendência. A coleta do relatório
// (_shared/wa-relatorio-dados.ts) lê a última análise de cada conversa.
//
// Quem chama: SÓ o agendador (pg_cron 'wa-auto-satisfacao-diaria', a cada 15 min
// das 07:00 às 08:45 de Brasília), autenticado pelo segredo do Vault
// `wa_auto_cron_secret` (header `x-cron-secret`, conferido pela RPC
// `wa_auto_cron_secret_confere`). Precisa de verify_jwt = false (config.toml).
// Cada execução só pega o que falta (incremental) — o que não coube no tempo
// fica para a execução seguinte da mesma manhã.
//
// Quem é analisado (só gasta com quem usa):
//   * empresa com o app ligado (app_modules.enabled), relatório diário ligado
//     (wa_auto_config.relatorio_ativo) e a regra 'sentimento_negativo' ativa;
//   * conversa não arquivada, com mensagem do CLIENTE nos últimos 14 dias e
//     mensagem nova desde a última análise (no máximo uma análise por dia);
//   * SÓ conversa de cliente: contato privado sem cliente vinculado não entra
//     (antes, 93 de 97 análises eram de leads); grupo entra quando está vinculado
//     a cliente (vínculo por canal — cliente_canais, migration 20261027110000);
//   * fora: grupo interno da equipe (restrito), contato bloqueado, grupo sem
//     cliente, conversa silenciada, cliente inativo, contrato encerrado (mesmas
//     regras do relatório, _shared/wa-alertas.ts).
//
// Segurança:
//   * F2: client service_role; toda consulta por empresa leva `.eq('tenant_id', T)`
//     (inclusive por id). A única leitura entre empresas é a lista de configurações.
//   * F4: a conversa vai à IA como DADO não confiável, delimitado; a resposta é JSON
//     validado de forma determinística (regras.ts: nível/sinais de lista fixa,
//     confiança 0–1, motivo sem link/telefone/e-mail/@, sem cópia literal de 6+
//     palavras e sem palavras de golpe/injeção). OpenRouter com
//     data_collection 'deny' (provedor não guarda/treina com o pedido).
//   * F5: logs só com contagens e códigos — nunca conteúdo, nome ou motivo.
//   * Limites: conversas por empresa e por execução, mensagens, caracteres, tokens,
//     concorrência e tempo (a função tem 150 s).
//
// Corpo opcional (só quem tem o segredo): { "dry_run": true, "tenant_id": "<uuid>" }.
// dry_run exige tenant_id, chama a IA em até MAX_PREVIAS conversas e NÃO grava;
// devolve nível/confiança/sinais/tendência/motivo de cada uma (sem conversa).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { contatoEhGrupo, situacaoContratual, type SituacaoContratual } from '../_shared/wa-alertas.ts'
import { ultimaPorConversa } from '../_shared/wa-satisfacao.ts'
import { comTextosMidia } from '../_shared/wa-midia-texto.ts'
import {
  type AnaliseValidada, type ConversaCandidata, type MensagemLida, type UltimaAnalise,
  JANELA_DIAS, MAX_MSGS, extrairJson, montarTranscricao, mensagemUsuario, promptSatisfacao,
  selecionarConversas, temNovidade, validarAnalise,
} from './regras.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ---- Limites por execução ----
const ORCAMENTO_MS = 115_000          // não começa conversa nova depois disso
const TIMEOUT_IA_MS = 40_000
const FOLGA_IA_MS = 45_000            // tempo mínimo restante para começar uma análise
const CONCORRENCIA = 4                // chamadas à IA em paralelo (por empresa)
const MAX_IA_EXECUCAO = 40            // análises por execução (todas as empresas)
const MAX_IA_POR_TENANT = 25          // por empresa e execução (uma empresa não esgota as outras)
const MAX_TENANTS = 1_000
const MAX_CONVERSAS_LIDAS = 1_000     // candidatas lidas por empresa
const MAX_PREVIAS = 5
const TAMANHO_LOTE = 150              // ids por `.in(...)`
const CICLO_CRON_MS = 15 * 60_000     // rodízio da ordem das empresas
const MAX_TOKENS_SAIDA = 600
/** Folga para o raciocínio do modelo (conta dentro de max_tokens). */
const FOLGA_RACIOCINIO_TOKENS = 4_000

// Claude Opus 5.5 via OpenRouter (decisão do dono). Trocável pela env
// WA_IA_MODELO_SATISFACAO (só modelos Claude, formato validado).
const MODELO_IA = ((m) => (m && /^anthropic\/claude-[a-z0-9.-]{1,40}$/.test(m) ? m : 'anthropic/claude-opus-5.5'))(
  Deno.env.get('WA_IA_MODELO_SATISFACAO')?.trim(),
)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function cronAutorizado(admin: SupabaseClient, req: Request): Promise<boolean> {
  const segredo = req.headers.get('x-cron-secret') ?? ''
  if (segredo.length < 32 || segredo.length > 256) return false
  const { data, error } = await admin.rpc('wa_auto_cron_secret_confere', { p_segredo: segredo })
  return !error && data === true
}

interface Execucao {
  admin: SupabaseClient
  agora: Date
  dryRun: boolean
  prazo: number
  iaRestantes: number
  openrouterKey: string
}

interface Previa {
  conversa: string
  nivel: string
  confianca: number
  sinais: string[]
  tendencia: string | null
  motivo: string
}

interface ResultadoTenant {
  tenant_id: string
  analisadas: number
  insatisfeitos: number
  atencao: number
  falhas_ia: number
  motivos_trocados: number
  sem_novidade: number
  pendentes_proxima: number
  fora?: Record<string, number>
  motivo?: string
  previas?: Previa[]
}

const restante = (ex: Execucao) => ex.prazo - Date.now()

function novoResultado(tenantId: string): ResultadoTenant {
  return {
    tenant_id: tenantId, analisadas: 0, insatisfeitos: 0, atencao: 0, falhas_ia: 0,
    motivos_trocados: 0, sem_novidade: 0, pendentes_proxima: 0,
  }
}

/** Lê em lotes de ids. Qualquer erro → null. */
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

// ---------------------------------------------------------------------------
// IA
// ---------------------------------------------------------------------------
async function analisarIa(ex: Execucao, usuario: string, normalizada: string): Promise<AnaliseValidada | null> {
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
        'X-Title': 'OMNX Desk Satisfacao WhatsApp',
      },
      body: JSON.stringify({
        model: MODELO_IA,
        // Claude atual recusa temperature/top_p; o esforço controla a profundidade.
        max_tokens: MAX_TOKENS_SAIDA + FOLGA_RACIOCINIO_TOKENS,
        reasoning: { effort: 'medium' },
        response_format: { type: 'json_object' },
        // Só provedores que não guardam/treinam com o pedido (a conversa é dado do cliente).
        provider: { data_collection: 'deny' },
        messages: [
          { role: 'system', content: promptSatisfacao() },
          { role: 'user', content: usuario },
        ],
      }),
    })
    if (!r.ok) {
      console.error('wa-auto-satisfacao: IA respondeu', r.status)
      return null
    }
    const corpo = await r.json().catch(() => null)
    const conteudo: string = corpo?.choices?.[0]?.message?.content ?? ''
    return validarAnalise(extrairJson(conteudo), normalizada)
  } catch (e) {
    console.error('wa-auto-satisfacao: falha na IA', (e as Error)?.name)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Por empresa
// ---------------------------------------------------------------------------
interface ConvRow {
  id: string
  contact_id: string | null
  is_group: boolean | null
  silenciado: boolean | null
  atualizado_em: string | null
  ultima_msg_cliente_em: string | null
}
interface ContatoRow {
  id: string
  numero_whatsapp: string | null
  client_id: string | null
  bloqueado: boolean | null
  group_size: number | null
  restrito_admin: boolean | null
}

async function processarTenant(ex: Execucao, T: string): Promise<ResultadoTenant> {
  const res = novoResultado(T)
  const desde = new Date(ex.agora.getTime() - JANELA_DIAS * 86_400_000).toISOString()

  // App LIGADO de forma explícita e regra de insatisfeitos ativa (senão ninguém lê o resultado).
  const { data: app, error: errApp } = await ex.admin
    .from('app_modules').select('enabled').eq('tenant_id', T).eq('slug', 'automacoes-wa').maybeSingle()
  if (errApp) return { ...res, motivo: 'erro_leitura_app' }
  if ((app as { enabled?: boolean | null } | null)?.enabled !== true) return { ...res, motivo: 'app_desligado' }
  const { data: regra, error: errRegra } = await ex.admin
    .from('wa_auto_regras_anomalia').select('ativo').eq('tenant_id', T).eq('tipo', 'sentimento_negativo').maybeSingle()
  if (errRegra) return { ...res, motivo: 'erro_leitura_regra' }
  if ((regra as { ativo?: boolean | null } | null)?.ativo !== true) return { ...res, motivo: 'regra_desligada' }

  // Conversas com mensagem do cliente na janela (mais recentes primeiro).
  const { data: convsData, error: errConv } = await ex.admin
    .from('chat_conversations')
    .select('id, contact_id, is_group, silenciado, atualizado_em, ultima_msg_cliente_em')
    .eq('tenant_id', T)
    .eq('arquivada', false)
    .gte('ultima_msg_cliente_em', desde)
    .order('ultima_msg_cliente_em', { ascending: false })
    .limit(MAX_CONVERSAS_LIDAS)
  if (errConv) return { ...res, motivo: 'erro_leitura_conversas' }
  const convs = (convsData ?? []) as ConvRow[]
  if (convs.length === 0) return { ...res, motivo: 'sem_conversas' }

  // Contatos → clientes → situação dos contratos (sempre no tenant).
  const idsContatos = [...new Set(convs.map((c) => c.contact_id).filter((x): x is string => Boolean(x)))]
  const contatos = await lerEmLotes<ContatoRow>(idsContatos, (lote) => ex.admin
    .from('chat_contacts').select('id, numero_whatsapp, client_id, bloqueado, group_size, restrito_admin').eq('tenant_id', T).in('id', lote))
  if (!contatos) return { ...res, motivo: 'erro_leitura_contatos' }
  const contatoPorId = new Map(contatos.map((c) => [c.id, c]))
  // Vínculo com cliente também pela tabela de vínculos (contato ↔ vários clientes):
  // vale o client_id do contato; sem ele, o vínculo mais antigo.
  const vinculos = await lerEmLotes<{ contact_id: string; client_id: string }>(idsContatos, (lote) => ex.admin
    .from('chat_contact_clients').select('contact_id, client_id').eq('tenant_id', T).in('contact_id', lote)
    .order('criado_em', { ascending: true }))
  if (!vinculos) return { ...res, motivo: 'erro_leitura_contatos' }
  const vinculoPorContato = new Map<string, string>()
  for (const v of vinculos) if (!vinculoPorContato.has(v.contact_id)) vinculoPorContato.set(v.contact_id, v.client_id)
  const clienteDoContato = (ct: ContatoRow | undefined): string | null =>
    ct ? (ct.client_id ?? vinculoPorContato.get(ct.id) ?? null) : null
  const idsClientes = [...new Set(contatos.map(clienteDoContato).filter((x): x is string => Boolean(x)))]
  const clientes = await lerEmLotes<{ id: string; ativo: boolean | null }>(idsClientes, (lote) => ex.admin
    .from('clients').select('id, ativo').eq('tenant_id', T).in('id', lote))
  const contratos = await contratosDosClientesAtendidos(ex.admin, T, idsClientes).catch(() => null)
  if (!clientes || !contratos) return { ...res, motivo: 'erro_leitura_clientes' }
  const ativoPorCliente = new Map(clientes.map((c) => [c.id, c.ativo !== false]))
  const statusPorCliente = new Map<string, (string | null)[]>()
  for (const c of contratos) statusPorCliente.set(c.cliente_id, [...(statusPorCliente.get(c.cliente_id) ?? []), c.status])

  // Última análise de cada conversa (para o incremental).
  const { data: analData, error: errAnal } = await ex.admin
    .from('wa_auto_satisfacao')
    .select('conversation_id, analisado_ate, created_at')
    .eq('tenant_id', T)
    .gte('created_at', new Date(ex.agora.getTime() - (JANELA_DIAS + 1) * 86_400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(5_000)
  if (errAnal) return { ...res, motivo: 'erro_leitura_analises' }
  const ultimas = ultimaPorConversa((analData ?? []) as UltimaAnalise[])

  const candidatas: ConversaCandidata[] = convs.map((c) => {
    const ct = c.contact_id ? contatoPorId.get(c.contact_id) : undefined
    const cid = clienteDoContato(ct)
    const situacao: SituacaoContratual | null = cid ? situacaoContratual(statusPorCliente.get(cid) ?? []) : null
    return {
      id: c.id,
      contact_id: c.contact_id,
      client_id: cid,
      ultima_msg_cliente_em: c.ultima_msg_cliente_em,
      atualizado_em: c.atualizado_em,
      contatoBloqueado: ct?.bloqueado === true,
      interno: ct?.restrito_admin === true,
      grupo: c.is_group === true || (ct ? contatoEhGrupo(ct.numero_whatsapp, ct.group_size) : false),
      silenciada: c.silenciado === true,
      clienteAtivo: cid ? (ativoPorCliente.get(cid) ?? true) : null,
      situacao,
    }
  })
  const { fila, fora } = selecionarConversas(candidatas, ultimas, ex.agora)
  res.fora = fora as Record<string, number>
  if (fila.length === 0) return res

  // Fila com concorrência limitada; respeita os limites de IA e o tempo.
  let proxima = 0
  let iaTenant = 0
  const limite = ex.dryRun ? Math.min(MAX_PREVIAS, MAX_IA_POR_TENANT) : MAX_IA_POR_TENANT
  const trabalhador = async () => {
    while (true) {
      const i = proxima++
      if (i >= fila.length) return
      if (iaTenant >= limite || ex.iaRestantes <= 0 || restante(ex) < FOLGA_IA_MS) { res.pendentes_proxima++; continue }
      iaTenant++
      ex.iaRestantes--
      const ok = await analisarConversa(ex, T, fila[i], ultimas.get(fila[i].id)?.analisado_ate ?? null, res)
      if (!ok) { iaTenant--; ex.iaRestantes++ } // não chamou a IA: devolve a vaga
    }
  }
  await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador))
  return res
}

/** Lê as mensagens, chama a IA e grava. Devolve false se NÃO chegou a chamar a IA. */
async function analisarConversa(
  ex: Execucao, T: string, conv: ConversaCandidata, analisadoAte: string | null, res: ResultadoTenant,
): Promise<boolean> {
  const desde = new Date(ex.agora.getTime() - JANELA_DIAS * 86_400_000).toISOString()
  // Só mensagens DESTA conversa, desta empresa, da janela (as mais recentes).
  const { data, error } = await ex.admin
    .from('chat_messages')
    .select('id, conteudo, tipo, enviado_por_agente, enviado_por_ia, criado_em')
    .eq('tenant_id', T)
    .eq('conversation_id', conv.id)
    .gte('criado_em', desde)
    .lte('criado_em', ex.agora.toISOString())
    .order('criado_em', { ascending: false })
    .limit(MAX_MSGS)
  if (error) { res.falhas_ia++; return false }
  // Áudio transcrito / imagem descrita (chat_midia_texto) no lugar de "(enviou um áudio)".
  const msgs = (await comTextosMidia(ex.admin, T, (data ?? []) as (MensagemLida & { id: string })[])).slice().reverse()
  const nov = temNovidade(msgs, analisadoAte)
  if (nov !== 'ok') { res.sem_novidade++; return false }
  const t = montarTranscricao(msgs, ex.agora)
  if (t.linhas === 0 || !t.ultimaEm) { res.sem_novidade++; return false }

  const analise = await analisarIa(ex, mensagemUsuario(t, ex.agora, conv.grupo), t.normalizada)
  if (!analise) { res.falhas_ia++; return true } // sem gravação: tenta de novo na próxima execução
  if (analise.motivoTrocado) {
    res.motivos_trocados++
    console.log('wa-auto-satisfacao: motivo da IA trocado pelo padrão', analise.motivoTrocado)
  }

  if (ex.dryRun) {
    const lista = res.previas ?? []
    lista.push({
      conversa: conv.id, nivel: analise.nivel, confianca: analise.confianca,
      sinais: analise.sinais, tendencia: analise.tendencia, motivo: analise.motivo,
    })
    res.previas = lista
  } else {
    const { error: errIns } = await ex.admin.from('wa_auto_satisfacao').insert({
      tenant_id: T, // explícito (F2): service_role não tem sessão
      client_id: conv.client_id,
      contact_id: conv.contact_id,
      conversation_id: conv.id,
      nivel: analise.nivel,
      confianca: analise.confianca,
      motivo: analise.motivo,
      sinais: analise.sinais,
      tendencia: analise.tendencia,
      analisado_ate: t.ultimaEm,
      modelo: MODELO_IA,
    })
    if (errIns) {
      console.error('wa-auto-satisfacao: falha ao gravar análise', errIns.code)
      res.falhas_ia++
      return true
    }
  }
  res.analisadas++
  if (analise.nivel === 'insatisfeito') res.insatisfeitos++
  else if (analise.nivel === 'atencao') res.atencao++
  return true
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
  if (dryRun && !tenantFiltro) return json({ ok: false, error: 'tenant_id é obrigatório na prévia.' }, 400)

  const openrouterKey = (Deno.env.get('OPENROUTER_API_KEY') ?? '').trim()
  if (!openrouterKey) {
    console.error('wa-auto-satisfacao: OPENROUTER_API_KEY não configurada')
    return json({ ok: false, error: 'IA não configurada.' }, 500)
  }

  const agora = new Date()
  const ex: Execucao = {
    admin, agora, dryRun, prazo: Date.now() + ORCAMENTO_MS, iaRestantes: MAX_IA_EXECUCAO, openrouterKey,
  }

  // Única leitura entre empresas: quem tem o relatório diário ligado.
  let q = admin
    .from('wa_auto_config')
    .select('tenant_id')
    .eq('relatorio_ativo', true)
    .order('tenant_id', { ascending: true })
    .limit(MAX_TENANTS)
  if (tenantFiltro) q = q.eq('tenant_id', tenantFiltro)
  const { data: configs, error } = await q
  if (error) {
    console.error('wa-auto-satisfacao: falha ao ler configurações', error.code)
    return json({ ok: false, error: 'Não foi possível ler as configurações.' }, 500)
  }
  const tenants = ((configs ?? []) as { tenant_id: string }[]).map((c) => c.tenant_id)
  // Rodízio: a cada execução a fila começa em outra empresa.
  const inicio = tenants.length > 0 ? Math.floor(agora.getTime() / CICLO_CRON_MS) % tenants.length : 0
  const fila = [...tenants.slice(inicio), ...tenants.slice(0, inicio)]

  const resultados: ResultadoTenant[] = []
  for (const T of fila) {
    if (restante(ex) < FOLGA_IA_MS || ex.iaRestantes <= 0) {
      resultados.push({ ...novoResultado(T), motivo: 'tempo_esgotado' })
      continue
    }
    try {
      resultados.push(await processarTenant(ex, T))
    } catch (e) {
      console.error('wa-auto-satisfacao: erro no tenant', (e as Error)?.name)
      resultados.push({ ...novoResultado(T), motivo: 'erro_inesperado' })
    }
  }

  const tot = resultados.reduce((a, r) => ({
    analisadas: a.analisadas + r.analisadas, falhas: a.falhas + r.falhas_ia, pendentes: a.pendentes + r.pendentes_proxima,
  }), { analisadas: 0, falhas: 0, pendentes: 0 })
  console.log(`wa-auto-satisfacao: ${resultados.length} empresa(s), ${tot.analisadas} analisada(s), ${tot.falhas} falha(s), ${tot.pendentes} pendente(s)${dryRun ? ' [prévia]' : ''}`)

  return json({ ok: true, dry_run: dryRun, modelo: MODELO_IA, resultados })
})
