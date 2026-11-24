import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { sessaoDeskLiberada } from '../_shared/desk-session.ts'
// Prévia ("backtest") do relatório diário (etapa 9.3 — docs/prd.md §0.6).
//
// Monta a MESMA mensagem que wa-auto-relatorio-diario mandaria agora, com os
// dados reais da empresa, e devolve o texto para a tela. NÃO envia nada e NÃO
// lê token/chave de provedor (não precisa: nada sai daqui).
//
// O admin pode testar limiares antes de salvar: o corpo aceita `regras`
// (opcional) — [{ tipo, ativo, limiar }] — que substituem as salvas só nesta prévia.
//
// Proteções:
//   * JWT do usuário validado aqui (client anon + auth.getUser) e verify_jwt
//     padrão (true) no gateway, como wa-auto-testar-envio.
//   * Só users.perfil = 'admin' e app 'automacoes-wa' ligado. O tenant vem do
//     servidor (get_tenant_do_usuario), nunca do corpo (F2); toda consulta
//     filtra tenant_id.
//   * Limite: 20 prévias por hora por empresa (cada uma faz várias consultas).
//   * Registro no histórico com status 'simulado' e só contagens (F5).
//
// Ação { acao: 'listar_alertas' } (painel /automacoes-wa/alertas): devolve os
// alertas que entrariam no relatório de hoje (com ids estáveis e chave_alerta),
// as contagens do que as regras automáticas tiraram e os pedidos "não alertar"
// que ainda valem. Sem telefone, sem texto de conversa. Pode: admin OU
// has_permissao('automacoes-wa','editar') (quem pode gravar em
// wa_auto_alertas_ignorados). Não grava histórico. Limite em memória por empresa.
//
// Ação { acao: 'listar_grupos_internos' } (só admin): grupos do número que envia
// (wa_auto_config.uazapi_instance_id) que NÃO estão vinculados a cliente — os únicos
// que podem receber o relatório diário. Devolve [{ grupo_jid, nome, participa }],
// sem telefone. `participa` = o número tem conversa de grupo registrada ali (o envio
// e o banco conferem de novo). Mesmo limite em memória do painel.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  FUSO_PADRAO, TIPOS_ALERTA, TIPOS_ANOMALIA, contarRelatorio, linkPainelSeguro, montarTemplateRelatorio, montarTextoRelatorio,
  montarTextoRelatorioGrupo, normalizarRegras,
} from '../_shared/wa-relatorio.ts'
import { ColetaError, carregarOpcoesRelatorio, carregarRegras, coletarAlertas } from '../_shared/wa-relatorio-dados.ts'
import { GruposError, carregarGruposInternos } from '../_shared/wa-grupos-internos-dados.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const LIMITE_PREVIAS_HORA = 20
/** Painel de alertas: leituras por minuto por empresa (em memória, por instância). */
const LIMITE_LISTAGENS_MINUTO = 60
/** Link do painel na mensagem; sem APP_URL configurado, a linha não sai. */
const APP_URL = (Deno.env.get('APP_URL') ?? '').trim().replace(/\/+$/, '')
const LINK_PAINEL = linkPainelSeguro(APP_URL ? `${APP_URL}/ia/alertas` : null)
/** Aba Vínculos (seção "Grupos ativos sem cliente vinculado"); sem APP_URL, a frase sai sem link. */
const LINK_VINCULOS = linkPainelSeguro(APP_URL ? `${APP_URL}/clientes/grupos` : null)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface Autorizado { userId: string; tenantId: string; admin: boolean; podeEditar: boolean }

/** Autentica e devolve o usuário, o tenant DELE e o que ele pode (admin / editar o app). */
async function autorizar(authHeader: string | null): Promise<Autorizado | null> {
  if (!authHeader) return null
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user || !await sessaoDeskLiberada(userClient)) return null
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data } = await admin.from('users').select('perfil').eq('id', user.id).single()
  const { data: tenantId } = await admin.rpc('get_tenant_do_usuario', { p_user_id: user.id })
  if (!tenantId) return null
  const ehAdmin = data?.perfil === 'admin'
  let podeEditar = ehAdmin
  if (!podeEditar) {
    // Mesma regra da RLS de wa_auto_alertas_ignorados (avaliada como o próprio usuário).
    const { data: pode } = await userClient.rpc('has_permissao', { p_recurso: 'automacoes-wa', p_acao: 'admin' })
    podeEditar = pode === true
  }
  return { userId: user.id, tenantId: tenantId as string, admin: ehAdmin, podeEditar }
}

/**
 * Painel de alertas. Resposta:
 *   alertas: [{ chave_alerta, tipo, cliente, client_id, contact_id, conversation_id,
 *               contract_id, detalhe, desde, prioridade (3 alta · 2 média · 1 baixa),
 *               e, só em sentimento_negativo da análise diária: nivel
 *               ('insatisfeito' | 'atencao'), confianca (0–1), motivo }]
 *            — na ordem do relatório (seção, depois prioridade e espera);
 *   ocultos_por_regra: { contato_bloqueado, grupo_sem_cliente, conversa_silenciada,
 *               cliente_inativo, contrato_encerrado, contrato_fora_do_prazo,
 *               ignorados_pelo_gestor, fora_da_janela, cliente_repetido };
 *   ignorados: [{ id, tipo, cliente, client_id, contact_id, modo, ate, motivo,
 *               created_at, criado_por_nome }] — só os que ainda valem.
 */
async function listarAlertas(admin: SupabaseClient, tenantId: string): Promise<Response> {
  if (!dentroDoLimite(tenantId)) {
    return json({ ok: false, status: 'limite', error: 'Muitas consultas seguidas. Espere um minuto.' }, 429)
  }
  const agora = new Date()
  let coleta
  try {
    const regras = await carregarRegras(admin, tenantId)
    // Mesmas opções do relatório: o painel mostra o que entraria no aviso de hoje.
    coleta = await coletarAlertas(admin, tenantId, regras, agora, FUSO_PADRAO, await carregarOpcoesRelatorio(admin, tenantId))
  } catch (e) {
    console.error('wa-auto-backtest: falha ao listar alertas', e instanceof ColetaError ? e.message : (e as Error)?.name)
    return json({ ok: false, error: 'Não foi possível ler os alertas. Tente de novo.' }, 500)
  }

  const alertas = TIPOS_ALERTA.flatMap((tipo) => (coleta.dados.alertas[tipo] ?? []).map((i) => ({
    chave_alerta: i.chave_alerta ?? `${tipo}:${i.cliente}`,
    tipo,
    cliente: i.cliente,
    client_id: i.client_id ?? null,
    contact_id: i.contact_id ?? null,
    conversation_id: i.conversation_id ?? null,
    contract_id: i.contract_id ?? null,
    detalhe: i.detalhe,
    ...(i.fontes_pedidos?.length ? { fontes_pedidos: i.fontes_pedidos } : {}),
    desde: i.desde ?? null,
    // Só com "Separar por estrategista" ligado (nome seguro; null = sem estrategista).
    ...(coleta.dados.agruparPorEstrategista ? { estrategista: i.estrategista ?? null } : {}),
    prioridade: i.prioridade ?? 1,
    // Só nos alertas de satisfação: 'insatisfeito'/'atencao' (IA — cliente_relacionamento ou,
    // no fallback, wa_auto_satisfacao) e 'risco' (regra: silêncio, pedido antigo, queda).
    ...(i.nivel ? { nivel: i.nivel, confianca: i.confianca ?? null, motivo: i.motivo ?? null } : {}),
  })))

  // Nome de quem pediu (só nome; nada de e-mail), sempre no tenant.
  const autores = [...new Set(coleta.ignorados.map((i) => i.criado_por).filter((x): x is string => Boolean(x)))]
  const nomes = new Map<string, string>()
  if (autores.length > 0) {
    const { data } = await admin.from('users').select('id, nome').eq('tenant_id', tenantId).in('id', autores.slice(0, 500))
    for (const u of (data ?? []) as { id: string; nome: string | null }[]) if (u.nome) nomes.set(u.id, u.nome)
  }

  return json({
    ok: true,
    gerado_em: agora.toISOString(),
    alertas,
    ocultos_por_regra: coleta.ocultos,
    conversas_paradas: coleta.dados.paradas ?? { quantidade: 0, dias: null },
    fora_sem_cadastro: coleta.dados.foraSemCadastro ?? 0,
    ignorados: coleta.ignorados.map((i) => ({
      id: i.id,
      tipo: i.tipo,
      cliente: i.cliente,
      client_id: i.client_id,
      contact_id: i.contact_id,
      modo: i.modo,
      ate: i.ate,
      motivo: i.motivo,
      created_at: i.created_at,
      criado_por_nome: i.criado_por ? nomes.get(i.criado_por) ?? null : null,
    })),
  })
}

/**
 * Grupos internos elegíveis (só admin). Resposta:
 *   { ok, provider, numero_configurado, grupos: [{ grupo_jid, nome, participa: true }], aviso? }
 * Grupo sai sempre pela UAZAPI do número configurado — inclusive na oficial (Zernio),
 * igual ao link de reunião.
 */
async function listarGruposInternos(admin: SupabaseClient, tenantId: string): Promise<Response> {
  if (!dentroDoLimite(tenantId)) {
    return json({ ok: false, status: 'limite', error: 'Muitas consultas seguidas. Espere um minuto.' }, 429)
  }
  const { data: cfg, error: errCfg } = await admin
    .from('wa_auto_config')
    .select('provider, uazapi_instance_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (errCfg) return json({ ok: false, error: 'Não foi possível ler a configuração.' }, 500)
  const provider: 'uazapi' | 'zernio' = cfg?.provider === 'zernio' ? 'zernio' : 'uazapi'
  let leitura
  try {
    leitura = await carregarGruposInternos(admin, tenantId, cfg?.uazapi_instance_id ?? null)
  } catch (e) {
    console.error('wa-auto-backtest: falha ao listar grupos', e instanceof GruposError ? e.message : (e as Error)?.name)
    return json({ ok: false, error: 'Não foi possível ler os grupos. Tente de novo.' }, 500)
  }
  if (!leitura.instanciaUuid) {
    return json({
      ok: true, provider, numero_configurado: false, grupos: [],
      aviso: provider === 'zernio'
        ? 'No WhatsApp Oficial o grupo sai pelo número do Chat (não oficial). Escolha esse número na aba Conexão para liberar os grupos.'
        : 'Escolha o número que envia na aba Conexão para ver os grupos.',
    })
  }
  return json({
    ok: true,
    provider,
    numero_configurado: true,
    grupos: leitura.grupos.slice(0, 500).map((g) => ({ grupo_jid: g.grupo_jid, nome: g.nome, participa: true })),
  })
}

const listagens = new Map<string, number[]>()
/** true = pode listar agora (janela deslizante de 1 minuto por empresa). */
function dentroDoLimite(tenantId: string, agora = Date.now()): boolean {
  const recentes = (listagens.get(tenantId) ?? []).filter((t) => agora - t < 60_000)
  if (recentes.length >= LIMITE_LISTAGENS_MINUTO) { listagens.set(tenantId, recentes); return false }
  recentes.push(agora)
  listagens.set(tenantId, recentes)
  return true
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const auth = await autorizar(req.headers.get('Authorization'))
  if (!auth) return json({ ok: false, error: 'forbidden' }, 403)
  const { tenantId, userId } = auth

  // ---- Entrada: ação + regras opcionais (validadas; nada de destino nem texto) ----
  let regrasDoCorpo: unknown[] | null = null
  let acao: 'previa' | 'listar_alertas' | 'listar_grupos_internos' = 'previa'
  try {
    const bruto = await req.text()
    if (bruto.length > 4096) return json({ ok: false, error: 'Pedido grande demais.' }, 413)
    const body = bruto ? JSON.parse(bruto) : {}
    if (body?.acao === 'listar_alertas') acao = 'listar_alertas'
    else if (body?.acao === 'listar_grupos_internos') acao = 'listar_grupos_internos'
    else if (body?.acao !== undefined && body?.acao !== 'previa') return json({ ok: false, error: 'Ação desconhecida.' }, 400)
    if (Array.isArray(body?.regras)) regrasDoCorpo = body.regras.slice(0, TIPOS_ANOMALIA.length)
  } catch {
    return json({ ok: false, error: 'Pedido inválido.' }, 400)
  }
  // Prévia e grupos: só admin (como antes). Painel: admin ou quem pode editar o app.
  if (acao === 'listar_alertas' ? !auth.podeEditar : !auth.admin) return json({ ok: false, error: 'forbidden' }, 403)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // ---- App ligado neste tenant ----
  const { data: app } = await admin
    .from('app_modules')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('slug', 'automacoes-wa')
    .maybeSingle()
  if (app && app.enabled === false) {
    return json({ ok: false, error: 'O app Automações WhatsApp está desligado nesta empresa.' }, 403)
  }

  if (acao === 'listar_alertas') return await listarAlertas(admin, tenantId)
  if (acao === 'listar_grupos_internos') return await listarGruposInternos(admin, tenantId)

  // ---- Configuração (sem segredos) ----
  const { data: cfg, error: errCfg } = await admin
    .from('wa_auto_config')
    .select('provider, uazapi_instance_id, relatorio_ativo, relatorio_hora, template_relatorio, template_idioma')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (errCfg) return json({ ok: false, error: 'Não foi possível ler a configuração.' }, 500)
  const provider: 'uazapi' | 'zernio' = cfg?.provider === 'zernio' ? 'zernio' : 'uazapi'

  // ---- Limite de prévias por hora ----
  const umaHoraAtras = new Date(Date.now() - 60 * 60_000).toISOString()
  const { count, error: errCount } = await admin
    .from('wa_auto_envios')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('tipo', 'relatorio_diario')
    .eq('status', 'simulado')
    .gte('created_at', umaHoraAtras)
  if (errCount) return json({ ok: false, error: 'Não foi possível conferir o limite de prévias.' }, 500)
  if ((count ?? 0) >= LIMITE_PREVIAS_HORA) {
    return json({ ok: false, status: 'limite', error: `Limite de ${LIMITE_PREVIAS_HORA} prévias por hora atingido. Tente mais tarde.` }, 429)
  }

  // ---- Destinos (só nomes; telefone e id de grupo não voltam para a tela) ----
  const { data: gs } = await admin
    .from('wa_auto_gestores')
    .select('nome, tipo, grupo_nome')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .order('created_at', { ascending: true })
    .limit(10)
  const linhas = (gs ?? []) as { nome: string; tipo: string | null; grupo_nome: string | null }[]
  const nomesGestores = linhas.filter((g) => g.tipo !== 'grupo').map((g) => String(g.nome))
  const nomesGrupos = linhas.filter((g) => g.tipo === 'grupo').map((g) => String(g.grupo_nome || g.nome))

  // ---- Dados reais, mesmas regras do envio ----
  const agora = new Date()
  let regras
  let dados
  let opcoes
  try {
    regras = regrasDoCorpo ? normalizarRegras(regrasDoCorpo) : await carregarRegras(admin, tenantId)
    // Opções salvas (separar por estrategista / só clientes ativos): mesma mensagem do envio.
    opcoes = await carregarOpcoesRelatorio(admin, tenantId)
    dados = (await coletarAlertas(admin, tenantId, regras, agora, FUSO_PADRAO, opcoes)).dados
    dados.linkPainel = LINK_PAINEL
    dados.linkVinculos = LINK_VINCULOS
  } catch (e) {
    console.error('wa-auto-backtest: falha na coleta', e instanceof ColetaError ? e.message : (e as Error)?.name)
    return json({ ok: false, error: 'Não foi possível ler os dados para a prévia. Tente de novo.' }, 500)
  }
  const contagem = contarRelatorio(dados)

  // A prévia usa o nome do 1º gestor ativo (cada gestor recebe a mensagem com o próprio nome).
  const gestorExemplo = nomesGestores[0] ?? 'Gestor'
  const texto = montarTextoRelatorio(gestorExemplo, dados)
  const oficial = montarTemplateRelatorio(gestorExemplo, dados)
  // No grupo interno: mesmo conteúdo, saudação para o grupo. Sempre pela não oficial.
  const textoGrupo = montarTextoRelatorioGrupo(dados)

  // ---- Avisos para a tela (o que impediria o envio de verdade) ----
  const avisos: string[] = []
  if (!cfg?.relatorio_ativo) avisos.push('O aviso diário está desligado: nada será enviado até você ligar.')
  if (nomesGestores.length === 0 && nomesGrupos.length === 0) {
    avisos.push('Ninguém ativo na lista (pessoa ou grupo): ninguém receberia esta mensagem.')
  }
  if (nomesGrupos.length > 0 && !cfg?.uazapi_instance_id) {
    avisos.push('Os grupos recebem pelo número do Chat (não oficial), que não está escolhido na aba Conexão.')
  }
  if (!regras.some((r) => r.ativo)) avisos.push('Nenhuma regra de alerta está ligada. A prévia ainda pode mostrar grupos sem cliente vinculado.')
  if (provider === 'zernio' && cfg?.template_relatorio !== 'omnx_aviso_diario_v2') {
    avisos.push('O modelo oficial do aviso diário precisa da versão sem agenda (omnx_aviso_diario_v2), aprovada pela Meta. Veja em Conexão → Textos aprovados pela Meta.')
  }

  // ---- Registro (sem texto, sem nomes de cliente — F5) ----
  await admin.from('wa_auto_envios').insert({
    tenant_id: tenantId, // explícito (F2)
    tipo: 'relatorio_diario',
    provider,
    destino: 'previa',
    destino_nome: 'Prévia (não enviada)',
    status: 'simulado',
    chave_idempotencia: null,
    payload: {
      solicitado_por: userId, contagem, regras_da_tela: Boolean(regrasDoCorpo),
      agrupar_estrategista: opcoes.agruparPorEstrategista, so_clientes_ativos: opcoes.soClientesAtivos,
    },
  })

  return json({
    ok: true,
    simulado: true,
    provider,
    gerado_em: agora.toISOString(),
    data_referencia: dados.data,
    relatorio_ativo: Boolean(cfg?.relatorio_ativo),
    relatorio_hora: cfg?.relatorio_hora ? String(cfg.relatorio_hora).slice(0, 5) : null,
    gestores: nomesGestores,
    grupos: nomesGrupos,
    contagem,
    opcoes: { agrupar_estrategista: opcoes.agruparPorEstrategista, so_clientes_ativos: opcoes.soClientesAtivos },
    fora_sem_cadastro: dados.foraSemCadastro ?? 0,
    // O que o gestor leria no WhatsApp com o provedor escolhido.
    mensagem: provider === 'zernio' ? oficial.textoPrevia : texto,
    // O que o grupo interno leria (grupo sai sempre pela não oficial). Na hora do
    // envio a saudação e a moldura variam (humanização); as listas são as mesmas.
    mensagem_grupo: textoGrupo,
    // Sempre devolvido: ajuda a cadastrar o modelo na Meta/Zernio.
    oficial: {
      template: cfg?.template_relatorio ?? null,
      idioma: cfg?.template_idioma ?? 'pt_BR',
      modelo_para_cadastrar: oficial.modeloNumerado,
      variaveis: oficial.variaveis,
      texto: oficial.textoPrevia,
    },
    texto_nao_oficial: texto,
    avisos,
  })
})
