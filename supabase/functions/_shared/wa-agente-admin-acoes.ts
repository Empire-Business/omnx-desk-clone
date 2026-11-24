// Ações de ADMIN do assistente da equipe, plugadas na edge function wa-agente-admin:
//
//   if (ACOES_AGENTE_ADMIN.includes(acao)) {
//     const r = await executarAcaoAgenteAdmin(acao, corpo, { admin, tenantId, userId, podeAdministrar })
//     return json(r.corpo, r.status)
//   }
//
// Quem chama já autenticou o JWT e resolveu o tenant NO SERVIDOR (get_tenant_do_usuario);
// `podeAdministrar` = has_permissao('automacoes-wa','admin'). Nada de tenant/ids
// confiáveis vem do corpo: todo id do corpo é conferido contra o tenant.
//
//   * simular     { pergunta, user_id } → roda o cérebro como se `user_id` perguntasse no
//                 privado. NÃO envia e NÃO grava no Chat. Log em wa_agente_execucoes
//                 (canal 'simulacao', resultado 'simulado', sem texto). Respeita o teto diário.
//                 Usa as preferências aprendidas; ferramentas que gravam (aprendizado,
//                 ajuste do aviso) só validam — NADA é gravado na simulação.
//   * boas_vindas { membro_id } | { grupo_id } → mensagem de boas-vindas (o que faz, 3
//                 exemplos, como chamar), humanizada, UMA ÚNICA VEZ por destino
//                 (wa_auto_envios tipo 'agente_boas_vindas', chave sem data — UNIQUE).
//   * candidatos  → usuários ativos não-cliente da empresa, com perfil e o que cada um
//                 enxerga ("toda a carteira" / "N clientes") e se já é membro.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { carregarEscopo } from './wa-agente-escopo.ts'
import { pensar } from './wa-agente-cerebro.ts'
import { carregarAprendizados, linhasParaPrompt } from './wa-agente-ferr-aprendizado.ts'
import { carregarPerfilRuntime } from './wa-agente-perfil.ts'
import { esforcoDaEnv, modeloDaEnv } from './wa-agente-llm.ts'
import { EXEMPLOS_PERGUNTA, rodapesGrupo } from './wa-agente-como-chamar.ts'
import { WaProviderError, resolveUazapiDaInstancia, resolveUazapiParaGrupos, type WaProvider } from './wa-provider.ts'
import { E164 } from './wa-mensagem.ts'
import { destinoGrupo, motivoGrupoBloqueado } from './wa-grupos-internos.ts'
import { carregarGruposInternos } from './wa-grupos-internos-dados.ts'
import { humanizarTexto, criarChamadaOpenRouter, periodoDoDia, saudacoesPara, type PedidoHumanizacao, type PeriodoDia } from './wa-humanizar.ts'
import { FUSO_PADRAO, limitesDoDia, saudacoesGrupo } from './wa-relatorio.ts'

export const ACOES_AGENTE_ADMIN = ['simular', 'boas_vindas', 'candidatos'] as const
export type AcaoAgenteAdmin = typeof ACOES_AGENTE_ADMIN[number]

export interface ContextoAdminAgente {
  admin: SupabaseClient
  tenantId: string
  userId: string
  podeAdministrar: boolean
}

export interface RespostaAcao { status: number; corpo: Record<string, unknown> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_PERGUNTA_SIMULADA = 1_000
const LIMITE_SIMULACOES_MINUTO = 6
const simulacoes = new Map<string, number[]>()

function ok(corpo: Record<string, unknown>): RespostaAcao { return { status: 200, corpo: { ok: true, ...corpo } } }
function falha(status: number, error: string, extra: Record<string, unknown> = {}): RespostaAcao {
  return { status, corpo: { ok: false, error, ...extra } }
}

export function ehAcaoAgenteAdmin(acao: unknown): acao is AcaoAgenteAdmin {
  return typeof acao === 'string' && (ACOES_AGENTE_ADMIN as readonly string[]).includes(acao)
}

export async function executarAcaoAgenteAdmin(
  acao: AcaoAgenteAdmin, corpo: Record<string, unknown>, ctx: ContextoAdminAgente,
): Promise<RespostaAcao> {
  if (!ctx.podeAdministrar) return falha(403, 'forbidden')
  if (!ctx.tenantId) return falha(403, 'forbidden')
  try {
    if (acao === 'simular') return await simular(corpo, ctx)
    if (acao === 'boas_vindas') return await boasVindas(corpo, ctx)
    return await candidatos(ctx)
  } catch (e) {
    console.error('wa-agente-admin-acoes: erro', acao, (e as Error)?.name)
    return falha(500, 'Não foi possível concluir agora. Tente de novo.')
  }
}

// ---------------------------------------------------------------------------
// simular
// ---------------------------------------------------------------------------

function dentroDoLimite(tenantId: string, agora = Date.now()): boolean {
  const recentes = (simulacoes.get(tenantId) ?? []).filter((t) => agora - t < 60_000)
  if (recentes.length >= LIMITE_SIMULACOES_MINUTO) { simulacoes.set(tenantId, recentes); return false }
  recentes.push(agora)
  simulacoes.set(tenantId, recentes)
  return true
}

async function usuarioDaEmpresa(ctx: ContextoAdminAgente, userId: unknown): Promise<{ id: string; nome: string | null } | null> {
  if (typeof userId !== 'string' || !UUID.test(userId)) return null
  const { data, error } = await ctx.admin.from('users').select('id, nome, ativo, perfil')
    .eq('tenant_id', ctx.tenantId).eq('id', userId).maybeSingle()
  if (error || !data) return null
  const u = data as { id: string; nome: string | null; ativo: boolean | null; perfil: string | null }
  return u.ativo === false || u.perfil === 'cliente' ? null : { id: u.id, nome: u.nome }
}

async function simular(corpo: Record<string, unknown>, ctx: ContextoAdminAgente): Promise<RespostaAcao> {
  const pergunta = typeof corpo.pergunta === 'string' ? corpo.pergunta.trim() : ''
  if (!pergunta) return falha(400, 'Escreva a pergunta.')
  if (pergunta.length > MAX_PERGUNTA_SIMULADA) return falha(400, `A pergunta pode ter até ${MAX_PERGUNTA_SIMULADA} caracteres.`)
  const usuario = await usuarioDaEmpresa(ctx, corpo.user_id)
  if (!usuario) return falha(400, 'Escolha uma pessoa ativa da equipe.')
  if (!dentroDoLimite(ctx.tenantId)) return falha(429, 'Muitas simulações seguidas. Espere um minuto.')

  const teto = Number(String(Deno.env.get('WA_AGENTE_TETO_DIA_USD') ?? '15').replace(',', '.')) || 15
  const inicioDia = limitesDoDia(new Date(), FUSO_PADRAO).inicio
  const { data: custos } = await ctx.admin.from('wa_agente_execucoes').select('custo_usd')
    .eq('tenant_id', ctx.tenantId).gte('created_at', inicioDia.toISOString()).limit(5000)
  const gasto = ((custos ?? []) as { custo_usd: number | string | null }[]).reduce((s, r) => s + (Number(r.custo_usd) || 0), 0)
  if (gasto >= teto) return falha(429, 'O limite de gasto de hoje com o assistente foi atingido.')

  const { data: cfg } = await ctx.admin.from('wa_auto_config').select('*').eq('tenant_id', ctx.tenantId).maybeSingle()
  const c = (cfg ?? {}) as Record<string, unknown>
  const nomeAgente = typeof c.agente_nome === 'string' && c.agente_nome.trim() ? c.agente_nome.trim() : 'Ana'
  const escopo = await carregarEscopo(ctx.admin, ctx.tenantId, usuario.id)
  const aprendizados = escopo.modo === 'normal' ? linhasParaPrompt(await carregarAprendizados(ctx.admin, ctx.tenantId)) : []
  const perfil = await carregarPerfilRuntime(ctx.admin, ctx.tenantId, escopo.modo)
  const r = await pensar({
    admin: ctx.admin, escopo, nomeAgente, canal: 'privado', quemPergunta: (usuario.nome ?? '').split(' ')[0] || null,
    pergunta, aprendizados, perfil, remetenteNome: usuario.nome, simulacao: true, apiKey: Deno.env.get('OPENROUTER_API_KEY'),
    modelo: modeloDaEnv(Deno.env.get('WA_AGENTE_MODELO')), esforco: esforcoDaEnv(Deno.env.get('WA_AGENTE_ESFORCO')),
  })
  await ctx.admin.from('wa_agente_execucoes').insert({
    tenant_id: ctx.tenantId, pedido_id: null, user_id: usuario.id, canal: 'simulacao', gatilho: 'simulacao',
    modelo: r.modelo, passos: r.passos, ferramentas: r.ferramentas.slice(0, 20),
    tokens_entrada: r.uso.entrada, tokens_saida: r.uso.saida, tokens_cache: r.uso.cache,
    custo_usd: Math.round(r.uso.custoUsd * 10_000) / 10_000, duracao_ms: r.duracaoMs, resultado: 'simulado', mensagens: 0,
  })
  return ok({
    resposta: r.ok ? r.partes.join('\n\n') : null,
    partes: r.ok ? r.partes.length : 0,
    falha: r.ok ? null : r.falha === 'bloqueado' ? 'A resposta foi bloqueada pela checagem de segurança.' : 'A IA não conseguiu responder agora.',
    ferramentas: r.ferramentas,
    passos: r.passos,
    tokens: { entrada: r.uso.entrada, saida: r.uso.saida, cache: r.uso.cache },
    custo_usd: Math.round(r.uso.custoUsd * 10_000) / 10_000,
    duracao_ms: r.duracaoMs,
    escopo: { total: escopo.total, clientes: escopo.clientIds.size, restrito: escopo.modo !== 'normal' },
  })
}

// ---------------------------------------------------------------------------
// boas_vindas
// ---------------------------------------------------------------------------

/**
 * Pedido de humanização das boas-vindas. Exemplos e "como chamar" vão como BLOCOS
 * literais; a IA só escreve saudação e apresentação. PURA (testada no Vitest).
 */
export function pedidoBoasVindas(
  canal: 'privado' | 'grupo', dados: { nome: string; nomeContato?: string | null; telefoneNumero?: string | null },
  periodo: PeriodoDia,
): PedidoHumanizacao {
  const nome = dados.nome
  const exemplos = EXEMPLOS_PERGUNTA.map((e) => `• "${e}"`).join('\n')
  const como = canal === 'grupo' ? rodapesGrupo(dados)[0] : 'É só me mandar a pergunta aqui no privado.'
  const saud = canal === 'grupo' ? 'Oi, pessoal!' : 'Oi!'
  const apresentacao = `Eu sou a ${nome}, a assistente da equipe no WhatsApp. Respondo sobre os clientes da carteira de cada um: alertas, satisfação e contratos.`
  const textoBase = `${saud} ${apresentacao}\nAlguns exemplos:\n${exemplos}\n\n${como}`
  return {
    tipo: canal === 'grupo' ? 'agente_boas_vindas_grupo' : 'agente_boas_vindas',
    textoBase,
    fatos: [
      { valor: nome, marcador: 'ASSISTENTE' },
      { valor: exemplos, marcador: 'EXEMPLOS', bloco: true },
      { valor: como, marcador: 'COMO_FALAR', bloco: true },
    ],
    tom: 'gestor-interno',
    canal,
    periodo,
    contexto: 'mensagem de boas-vindas do assistente da equipe (interno): diz o que ele faz, dá exemplos de perguntas e ensina como chamá-lo',
    instrucoesExtras: [
      'Mantenha [EXEMPLOS] sozinho nas próprias linhas, logo depois de uma frase curta como "Alguns exemplos:".',
      'A última linha é [COMO_FALAR], sozinho, depois de uma linha em branco.',
      ...(canal === 'grupo' ? ['Fale com o grupo todo, sem citar o nome de ninguém além de [ASSISTENTE].'] : []),
    ],
    variantes: {
      saudacoes: canal === 'grupo' ? saudacoesGrupo(periodo) : saudacoesPara(null, periodo),
      aberturas: [apresentacao, `Aqui é a ${nome}, a assistente da equipe no WhatsApp. Respondo sobre os clientes da carteira de cada um: alertas, satisfação e contratos.`],
      blocos: [[`Alguns exemplos:\n${exemplos}`, `Por exemplo:\n${exemplos}`]],
      fechos: [como],
    },
  }
}

async function enviarPorNumeros(
  ctx: ContextoAdminAgente, numeros: string[], destino: string, texto: string, humanizado: 'ia' | 'fallback',
): Promise<{ ok: boolean; incerto: boolean; messageId: string | null; erro: string | null }> {
  let ultimoErro: string | null = 'Nenhum número disponível para enviar.'
  for (const n of numeros) {
    let provider: WaProvider
    try { provider = (await resolveUazapiDaInstancia(ctx.admin, ctx.tenantId, n)).provider } catch (e) {
      ultimoErro = e instanceof WaProviderError ? e.message : 'Número indisponível.'
      continue
    }
    try {
      const r = await provider.sendText(destino, texto, { humanizado })
      return { ok: true, incerto: false, messageId: r.messageId, erro: null }
    } catch (e) {
      const incerto = e instanceof WaProviderError ? e.incerto : true
      ultimoErro = e instanceof WaProviderError ? e.message : 'Falha no envio.'
      if (incerto) return { ok: false, incerto: true, messageId: null, erro: ultimoErro }
    }
  }
  return { ok: false, incerto: false, messageId: null, erro: ultimoErro }
}

async function boasVindas(corpo: Record<string, unknown>, ctx: ContextoAdminAgente): Promise<RespostaAcao> {
  const { data: cfgBruta } = await ctx.admin.from('wa_auto_config').select('*').eq('tenant_id', ctx.tenantId).maybeSingle()
  const cfg = (cfgBruta ?? {}) as Record<string, unknown>
  if (cfg.agente_ativo !== true) return falha(400, 'Ligue o assistente antes de mandar as boas-vindas.')
  const nome = typeof cfg.agente_nome === 'string' && cfg.agente_nome.trim() ? cfg.agente_nome.trim() : 'Ana'
  const nomeContato = typeof cfg.agente_nome_contato === 'string' ? cfg.agente_nome_contato : null

  let canal: 'privado' | 'grupo'
  let destino: string
  let destinoNome: string
  let numeros: string[] = []
  let marcar: { tabela: string; id: string }
  let provedorPrivado: WaProvider | null = null
  let telefoneNumero: string | null = null

  if (typeof corpo.membro_id === 'string' && UUID.test(corpo.membro_id)) {
    const { data } = await ctx.admin.from('wa_agente_membros').select('id, user_id, telefone, ativo')
      .eq('tenant_id', ctx.tenantId).eq('id', corpo.membro_id).maybeSingle()
    const m = data as { id: string; user_id: string; telefone: string; ativo: boolean } | null
    if (!m || !m.ativo || !E164.test(m.telefone)) return falha(400, 'Pessoa não encontrada ou desativada.')
    const { data: u } = await ctx.admin.from('users').select('nome').eq('tenant_id', ctx.tenantId).eq('id', m.user_id).maybeSingle()
    canal = 'privado'
    destino = m.telefone
    destinoNome = String((u as { nome?: string } | null)?.nome ?? 'Pessoa da equipe').slice(0, 80)
    marcar = { tabela: 'wa_agente_membros', id: m.id }
    try { provedorPrivado = (await resolveUazapiParaGrupos(ctx.admin, ctx.tenantId)).provider } catch (e) {
      return falha(400, e instanceof WaProviderError ? e.message : 'Conexão não oficial indisponível.')
    }
  } else if (typeof corpo.grupo_id === 'string' && UUID.test(corpo.grupo_id)) {
    if (cfg.agente_grupos !== true) return falha(400, 'Ligue as respostas em grupos antes de mandar as boas-vindas no grupo.')
    const { data } = await ctx.admin.from('wa_agente_grupos').select('id, grupo_jid, nome, ativo')
      .eq('tenant_id', ctx.tenantId).eq('id', corpo.grupo_id).maybeSingle()
    const g = data as { id: string; grupo_jid: string; nome: string | null; ativo: boolean } | null
    const jid = g ? destinoGrupo(g.grupo_jid) : null
    if (!g || !g.ativo || !jid) return falha(400, 'Grupo não encontrado ou desativado.')
    const { data: ns } = await ctx.admin.from('wa_agente_grupo_numeros').select('instance_uuid, ordem')
      .eq('tenant_id', ctx.tenantId).eq('grupo_id', g.id).order('ordem', { ascending: true })
    numeros = ((ns ?? []) as { instance_uuid: string }[]).map((n) => n.instance_uuid)
    if (numeros.length === 0) return falha(400, 'Escolha o número principal do grupo antes.')
    const { data: wi } = await ctx.admin.from('whatsapp_instances').select('instance_id, numero_whatsapp')
      .eq('tenant_id', ctx.tenantId).eq('id', numeros[0]).maybeSingle()
    const inst = wi as { instance_id: string; numero_whatsapp: string | null } | null
    if (!inst) return falha(400, 'Número principal não encontrado.')
    telefoneNumero = inst.numero_whatsapp
    // Confere de novo: grupo do número e sem vínculo com cliente.
    const leitura = await carregarGruposInternos(ctx.admin, ctx.tenantId, inst.instance_id, [jid])
    const motivo = motivoGrupoBloqueado(jid, new Set(leitura.grupos.map((x) => x.grupo_jid)), leitura.deCliente, leitura.nomeDeCliente)
    if (motivo) return falha(400, 'Este grupo não está liberado como grupo interno (pode ter vínculo com cliente).', { motivo })
    canal = 'grupo'
    destino = jid
    destinoNome = String(g.nome ?? 'Grupo interno').slice(0, 80)
    marcar = { tabela: 'wa_agente_grupos', id: g.id }
  } else {
    return falha(400, 'Informe a pessoa ou o grupo.')
  }

  // Idempotência: uma vez por destino, para sempre (UNIQUE tenant + chave).
  const chave = `agente_boas_vindas:${destino}`
  const { data: linha, error: errIns } = await ctx.admin.from('wa_auto_envios').insert({
    tenant_id: ctx.tenantId, tipo: 'agente_boas_vindas', provider: 'uazapi', destino, destino_nome: destinoNome,
    status: 'pendente', chave_idempotencia: chave, payload: { destino_tipo: canal === 'grupo' ? 'grupo' : 'pessoa' },
  }).select('id').single()
  if (errIns) {
    const code = (errIns as { code?: string }).code
    if (code === '23505') return ok({ status: 'ja_enviado' })
    if (code === '23514') return falha(503, 'Falta aplicar a atualização do banco das boas-vindas (migration 20261027091000).')
    return falha(500, 'Não foi possível registrar o envio.')
  }

  const agora = new Date()
  const pedido = pedidoBoasVindas(canal, { nome, nomeContato, telefoneNumero }, periodoDoDia(agora, FUSO_PADRAO))
  const h = await humanizarTexto(pedido, {
    chamarIa: criarChamadaOpenRouter(Deno.env.get('OPENROUTER_API_KEY'), { titulo: 'OMNX Desk Assistente Boas-vindas' }),
    prazoMs: 20_000,
  })
  let r: { ok: boolean; incerto: boolean; messageId: string | null; erro: string | null }
  if (provedorPrivado) {
    try {
      const s = await provedorPrivado.sendText(destino, h.texto, { humanizado: h.origem })
      r = { ok: true, incerto: false, messageId: s.messageId, erro: null }
    } catch (e) {
      r = { ok: false, incerto: e instanceof WaProviderError ? e.incerto : true, messageId: null, erro: e instanceof WaProviderError ? e.message : 'Falha no envio.' }
    }
  } else {
    r = await enviarPorNumeros(ctx, numeros, destino, h.texto, h.origem)
  }
  await ctx.admin.from('wa_auto_envios').update({
    status: r.ok ? 'enviado' : 'falhou', erro: r.erro,
    payload: { destino_tipo: canal === 'grupo' ? 'grupo' : 'pessoa', message_id: r.messageId, humanizado: h.origem, ...(r.incerto ? { incerto: true } : {}) },
  }).eq('id', (linha as { id: string }).id).eq('tenant_id', ctx.tenantId)
  if (r.ok) await ctx.admin.from(marcar.tabela).update({ boas_vindas_em: agora.toISOString() }).eq('id', marcar.id).eq('tenant_id', ctx.tenantId)
  return r.ok ? ok({ status: 'enviado' }) : falha(502, r.erro ?? 'Falha no envio.', { status: r.incerto ? 'incerto' : 'falhou' })
}

// ---------------------------------------------------------------------------
// candidatos
// ---------------------------------------------------------------------------

async function candidatos(ctx: ContextoAdminAgente): Promise<RespostaAcao> {
  const { data, error } = await ctx.admin.from('users').select('id, nome, perfil, ativo')
    .eq('tenant_id', ctx.tenantId).neq('perfil', 'cliente').order('nome', { ascending: true }).limit(200)
  if (error) return falha(500, 'Não foi possível listar a equipe.')
  const ativos = ((data ?? []) as { id: string; nome: string | null; perfil: string; ativo: boolean | null }[])
    .filter((u) => u.ativo !== false)
  const { data: ms } = await ctx.admin.from('wa_agente_membros').select('user_id').eq('tenant_id', ctx.tenantId).limit(500)
  const membros = new Set(((ms ?? []) as { user_id: string }[]).map((m) => m.user_id))
  const lista = []
  for (const u of ativos.slice(0, 80)) {
    const e = await carregarEscopo(ctx.admin, ctx.tenantId, u.id)
    lista.push({
      user_id: u.id, nome: u.nome ?? 'Sem nome', perfil: u.perfil, ja_membro: membros.has(u.id),
      ve_tudo: e.modo === 'normal' && e.total, clientes: e.modo === 'normal' && !e.total ? e.clientIds.size : 0,
      escopo_ok: e.modo === 'normal',
      permissoes: e.permissoes,
    })
  }
  return ok({ candidatos: lista, mais: Math.max(0, ativos.length - 80) })
}
