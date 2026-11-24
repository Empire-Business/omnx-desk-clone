import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { sessaoDeskLiberada } from '../_shared/desk-session.ts'
// Gestão dos modelos (templates) do WhatsApp oficial — app Automações WhatsApp.
// docs/integracoes/zernio-templates.md
//
// O admin não precisa entrar no painel da Meta/Zernio: esta função cria e consulta
// os 3 modelos do catálogo fixo do servidor (_shared/wa-modelos-oficiais.ts) e grava
// o nome/idioma em wa_auto_config para que os envios usem o nome certo.
//
// Ações (POST { acao, tipo? }):
//   * catalogo — os 3 modelos + último status salvo. NÃO chama a Zernio.
//   * listar   — GET /whatsapp/templates (um pedido só) e atualiza os 3 status.
//   * status   — GET /whatsapp/templates/{nome} de um tipo (ou dos 3): status,
//                motivo da recusa, qualidade e se o texto bate com o catálogo.
//   * criar    — POST /whatsapp/templates de UM item do catálogo (chave 'relatorio' |
//                'resumo' | 'link'). O texto NUNCA vem do navegador.
//   Apagar: fora (irreversível e trava o nome por 30 dias) — só pelo painel da Zernio.
//
// Proteções (mesmo padrão de wa-auto-testar-envio):
//   * JWT do usuário validado aqui (auth.getUser) e verify_jwt padrão (true) no
//     gateway — esta função NÃO entra no config.toml com verify_jwt=false.
//   * Só users.perfil = 'admin' e app 'automacoes-wa' ligado no tenant.
//   * tenant_id vem de get_tenant_do_usuario, nunca do corpo (F2). Chave e accountId
//     da Zernio saem do Vault DESSE tenant (resolveZernioCliente).
//   * Limite por empresa, contado em tabela: criar 3/h; listar + status 30/h.
//   * Resposta e log nunca contêm a chave nem o corpo cru da Zernio/Meta.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  lerTextoLimitado, resolveZernioCliente, WaProviderError, ZernioProvider, type ModeloZernio,
} from '../_shared/wa-provider.ts'
import {
  IDIOMA_MODELOS, MODELOS_OFICIAIS, conferirTexto, corpoCriacaoZernio, deveGravarNome, ehTipoModelo, modeloPorTipo,
  normalizarStatus, previaModelo, problemasDoModelo, respostaDoPedido, traduzirMotivoRecusa,
  type ColunaModelo, type ModeloOficial, type StatusModelo, type TipoModeloOficial,
} from '../_shared/wa-modelos-oficiais.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const LIMITE_CRIAR_HORA = 3
const LIMITE_CONSULTA_HORA = 30
const LIMITE_PEDIDO_BYTES = 1024
const ERRO_RESPOSTA_TROCADA = 'A Zernio devolveu um modelo diferente do pedido. Nada foi gravado; clique em "Atualizar status" de novo.'

type Acao = 'catalogo' | 'listar' | 'status' | 'criar'
const ACOES: readonly Acao[] = ['catalogo', 'listar', 'status', 'criar']

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

/** Autoriza (só admin) e devolve o usuário e o tenant DELE. */
async function autorizarAdmin(authHeader: string | null): Promise<{ userId: string; tenantId: string } | null> {
  if (!authHeader) return null
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user || !await sessaoDeskLiberada(userClient)) return null
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data } = await admin.from('users').select('perfil').eq('id', user.id).single()
  if (data?.perfil !== 'admin') return null
  const { data: tenantId } = await admin.rpc('get_tenant_do_usuario', { p_user_id: user.id })
  if (!tenantId) return null
  return { userId: user.id, tenantId: tenantId as string }
}

// ---------------------------------------------------------------------------
// Estado salvo (cache de status + nomes em wa_auto_config)
// ---------------------------------------------------------------------------
interface ConfigModelos {
  template_relatorio: string | null
  template_resumo: string | null
  template_link: string | null
  template_idioma: string
}

interface LinhaCache {
  tipo: TipoModeloOficial
  status: StatusModelo
  motivo: string | null
  qualidade: string | null
  texto_diferente: boolean
  consultado_em: string
}

/** Linha recém-consultada: sabe se o texto foi conferido (não vai para o banco). */
interface LinhaNova extends LinhaCache {
  texto: 'igual' | 'diferente' | 'sem_texto'
}

interface ModeloResposta {
  tipo: TipoModeloOficial
  nome: string
  titulo: string
  para_quem: string
  idioma: string
  categoria: string
  corpo: string
  previa: string
  observacao: string | null
  /** NAO_CRIADO quando a Zernio diz que não existe; null = nunca consultado. */
  status: StatusModelo | null
  motivo: string | null
  qualidade: string | null
  texto_diferente: boolean
  consultado_em: string | null
  /** Nome que os envios usam hoje (wa_auto_config). */
  nome_configurado: string | null
  /** Os envios já usam este modelo do catálogo. */
  em_uso: boolean
}

async function lerConfig(admin: SupabaseClient, tenantId: string): Promise<ConfigModelos | null> {
  const { data, error } = await admin
    .from('wa_auto_config')
    .select('template_relatorio, template_resumo, template_link, template_idioma')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) return null
  return (data as ConfigModelos | null) ?? null
}

async function lerCache(admin: SupabaseClient, tenantId: string): Promise<Map<TipoModeloOficial, LinhaCache>> {
  const mapa = new Map<TipoModeloOficial, LinhaCache>()
  const { data, error } = await admin
    .from('wa_auto_modelos')
    .select('tipo, status, motivo, qualidade, texto_diferente, consultado_em')
    .eq('tenant_id', tenantId)
  if (error || !Array.isArray(data)) return mapa // tabela ainda não criada: tela mostra "não consultado"
  for (const l of data as LinhaCache[]) if (ehTipoModelo(l.tipo)) mapa.set(l.tipo, l)
  return mapa
}

function montarResposta(cfg: ConfigModelos | null, cache: Map<TipoModeloOficial, LinhaCache>): ModeloResposta[] {
  return MODELOS_OFICIAIS.map((m) => {
    const c = cache.get(m.tipo)
    const nomeConfigurado = cfg?.[m.coluna] ?? null
    return {
      tipo: m.tipo,
      nome: m.nome,
      titulo: m.titulo,
      para_quem: m.paraQuem,
      idioma: m.idioma,
      categoria: m.categoria,
      corpo: m.corpo,
      previa: previaModelo(m),
      observacao: m.observacao ?? null,
      status: c?.status ?? null,
      motivo: c?.motivo ?? null,
      qualidade: c?.qualidade ?? null,
      texto_diferente: c?.texto_diferente ?? false,
      consultado_em: c?.consultado_em ?? null,
      nome_configurado: nomeConfigurado,
      em_uso: nomeConfigurado === m.nome && (cfg?.template_idioma ?? IDIOMA_MODELOS) === m.idioma,
    }
  })
}

/** Resultado da Zernio (ou null = não existe) → linha de cache. */
function linhaDe(m: ModeloOficial, z: ModeloZernio | null): LinhaNova {
  const agora = new Date().toISOString()
  if (!z) {
    return {
      tipo: m.tipo, status: 'NAO_CRIADO', motivo: null, qualidade: null, texto_diferente: false, consultado_em: agora,
      texto: 'sem_texto',
    }
  }
  // Sem texto na resposta = NÃO verificado (nunca conta como igual ao catálogo).
  const texto = conferirTexto(z.corpo, m.corpo)
  const status = normalizarStatus(z.status)
  const qualidade = z.qualidade && ['GREEN', 'YELLOW', 'RED', 'UNKNOWN'].includes(z.qualidade.toUpperCase())
    ? z.qualidade.toUpperCase() : null
  return {
    tipo: m.tipo,
    status,
    motivo: status === 'REJECTED' || status === 'PAUSED' || status === 'DISABLED' ? traduzirMotivoRecusa(z.motivo) : null,
    qualidade,
    // Mesmo nome com texto diferente (criado à mão no painel): não serve para o nosso envio.
    texto_diferente: texto === 'diferente',
    consultado_em: agora,
    texto,
  }
}

async function salvarCache(admin: SupabaseClient, tenantId: string, linhas: LinhaCache[], metaIds: Map<TipoModeloOficial, string | null>) {
  if (linhas.length === 0) return
  const { error } = await admin.from('wa_auto_modelos').upsert(
    linhas.map((l) => {
      const m = modeloPorTipo(l.tipo) as ModeloOficial
      const metaId = metaIds.get(l.tipo) ?? null
      return {
        tenant_id: tenantId, // explícito: service_role não tem sessão (F2)
        tipo: l.tipo,
        nome: m.nome,
        idioma: m.idioma,
        meta_id: metaId && /^[0-9]{1,40}$/.test(metaId) ? metaId : null,
        status: l.status,
        motivo: l.motivo ? l.motivo.slice(0, 400) : null,
        qualidade: l.qualidade,
        texto_diferente: l.texto_diferente,
        consultado_em: l.consultado_em,
      }
    }),
    { onConflict: 'tenant_id,tipo' },
  )
  if (error) console.error('wa-auto-templates: falha ao salvar status', error.code)
}

/**
 * Liga o modelo do catálogo aos envios (wa_auto_config), quando for seguro:
 *   * APROVADO e com o texto do catálogo CONFERIDO → passa a ser o modelo usado
 *     (mesmo que antes houvesse um nome digitado à mão);
 *   * em análise / recurso (PENDING, IN_APPEAL) e o campo está vazio → já deixa o
 *     nome gravado;
 *   * texto diferente, texto não verificado, recusado/pausado etc. → não mexe.
 * Regra pura em deveGravarNome (_shared/wa-modelos-oficiais.ts).
 * O idioma é um só para os 3 modelos: só muda para pt_BR se nenhum outro campo usa
 * um modelo próprio (fora do catálogo), para não quebrar esse outro envio.
 */
async function ligarAosEnvios(
  admin: SupabaseClient, tenantId: string, cfg: ConfigModelos | null, linhas: LinhaNova[], avisos: string[],
): Promise<ConfigModelos | null> {
  if (!cfg) return cfg
  const mudancas: Partial<ConfigModelos> = {}
  for (const l of linhas) {
    const m = modeloPorTipo(l.tipo) as ModeloOficial
    if (deveGravarNome(l.status, l.texto, cfg[m.coluna], m.nome)) mudancas[m.coluna] = m.nome
    else if (l.status === 'APPROVED' && l.texto === 'sem_texto' && cfg[m.coluna] !== m.nome) {
      avisos.push(`A Zernio não mostrou o texto do modelo "${m.titulo}", então ele não foi ligado aos envios. Clique em "Atualizar status" para conferir de novo.`)
    }
  }
  const colunas = Object.keys(mudancas) as ColunaModelo[]
  if (colunas.length === 0) return cfg

  const depois: ConfigModelos = { ...cfg, ...mudancas }
  if (depois.template_idioma !== IDIOMA_MODELOS) {
    const nomesCatalogo = new Set(MODELOS_OFICIAIS.map((m) => m.nome))
    const proprios = (['template_relatorio', 'template_resumo', 'template_link'] as const)
      .filter((c) => depois[c] && !nomesCatalogo.has(depois[c] as string))
    if (proprios.length > 0) {
      avisos.push(`Os modelos do catálogo são em ${IDIOMA_MODELOS}, mas o idioma salvo é ${depois.template_idioma} e há um modelo próprio em uso. Ajuste o idioma em "Configuração avançada" se for o caso.`)
      return cfg
    }
    mudancas.template_idioma = IDIOMA_MODELOS
  }
  const { error } = await admin.from('wa_auto_config').update(mudancas).eq('tenant_id', tenantId)
  if (error) {
    console.error('wa-auto-templates: falha ao gravar nomes dos modelos', error.code)
    avisos.push('Não foi possível gravar o nome do modelo na configuração. Tente "Atualizar status" de novo.')
    return cfg
  }
  return { ...cfg, ...mudancas }
}

// ---------------------------------------------------------------------------
// Limite de chamadas (contado em tabela, não em memória)
// ---------------------------------------------------------------------------
type ResultadoLimite = { ok: true } | { ok: false; erro: string; status: number }

async function reservarChamada(admin: SupabaseClient, tenantId: string, acao: 'listar' | 'status' | 'criar'): Promise<ResultadoLimite> {
  const { data: linha, error: errIns } = await admin
    .from('wa_auto_modelos_chamadas')
    .insert({ tenant_id: tenantId, acao })
    .select('id')
    .single()
  if (errIns || !linha) {
    console.error('wa-auto-templates: falha ao registrar chamada', errIns?.code)
    return { ok: false, status: 503, erro: 'A gestão de modelos ainda não foi ativada no banco desta empresa. Peça ao suporte para aplicar a atualização.' }
  }
  const umaHoraAtras = new Date(Date.now() - 60 * 60_000).toISOString()
  const acoes = acao === 'criar' ? ['criar'] : ['listar', 'status']
  const limite = acao === 'criar' ? LIMITE_CRIAR_HORA : LIMITE_CONSULTA_HORA
  // Conta DEPOIS de inserir: dois pedidos simultâneos se enxergam (não furam o limite).
  const { count, error } = await admin
    .from('wa_auto_modelos_chamadas')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('acao', acoes)
    .gte('created_at', umaHoraAtras)
  if (error) return { ok: false, status: 500, erro: 'Não foi possível conferir o limite de consultas.' }
  if ((count ?? 0) > limite) {
    // Pedido recusado não conta para a próxima hora.
    await admin.from('wa_auto_modelos_chamadas').delete().eq('id', linha.id).eq('tenant_id', tenantId)
    return {
      ok: false,
      status: 429,
      erro: acao === 'criar'
        ? `Limite de ${LIMITE_CRIAR_HORA} criações de modelo por hora atingido. Tente mais tarde.`
        : `Limite de ${LIMITE_CONSULTA_HORA} consultas por hora atingido. Tente mais tarde.`,
    }
  }
  // Limpeza: a contagem só precisa da última hora.
  const umDiaAtras = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  await admin.from('wa_auto_modelos_chamadas').delete().eq('tenant_id', tenantId).lt('created_at', umDiaAtras)
  return { ok: true }
}

function erroZernio(e: unknown, padrao: string) {
  if (e instanceof WaProviderError) return { mensagem: e.message, codigo: e.codigo }
  console.error('wa-auto-templates: erro inesperado', (e as Error)?.name)
  return { mensagem: padrao, codigo: 'erro_inesperado' }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const auth = await autorizarAdmin(req.headers.get('Authorization'))
  if (!auth) return json({ ok: false, error: 'forbidden' }, 403)
  const { tenantId } = auth

  // ---- Entrada: só a ação e, quando preciso, a CHAVE do catálogo ----
  let acao: Acao = 'catalogo'
  let tipo: TipoModeloOficial | null = null
  try {
    // Tamanho conferido ANTES de ler (cabeçalho) e durante a leitura (limite em bytes).
    if (Number(req.headers.get('content-length') ?? '0') > LIMITE_PEDIDO_BYTES) {
      return json({ ok: false, error: 'Pedido grande demais.' }, 413)
    }
    const bruto = await lerTextoLimitado(req.body, LIMITE_PEDIDO_BYTES)
    if (bruto === null) return json({ ok: false, error: 'Pedido grande demais.' }, 413)
    const body = bruto ? JSON.parse(bruto) : {}
    if (!ACOES.includes(body?.acao)) return json({ ok: false, error: 'Ação inválida.' }, 400)
    acao = body.acao as Acao
    if (body?.tipo !== undefined && body?.tipo !== null) {
      if (!ehTipoModelo(body.tipo)) return json({ ok: false, error: 'Modelo desconhecido.' }, 400)
      tipo = body.tipo
    }
  } catch {
    return json({ ok: false, error: 'Pedido inválido.' }, 400)
  }
  if (acao === 'criar' && !tipo) return json({ ok: false, error: 'Escolha qual modelo criar.' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // ---- App ligado neste tenant ----
  // Só segue com o app explicitamente ligado: erro na consulta ou linha ausente = recusa.
  const { data: app, error: errApp } = await admin
    .from('app_modules')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('slug', 'automacoes-wa')
    .maybeSingle()
  if (errApp || app?.enabled !== true) {
    return json({ ok: false, error: 'O app Automações WhatsApp está desligado nesta empresa.' }, 403)
  }

  let cfg = await lerConfig(admin, tenantId)
  const cache = await lerCache(admin, tenantId)
  const avisos: string[] = []

  if (acao === 'catalogo') {
    return json({ ok: true, modelos: montarResposta(cfg, cache) })
  }

  // ---- Cliente Zernio do tenant (chave + accountId do Vault), mesmo com UAZAPI ativa ----
  const zernio = await resolveZernioCliente(admin, tenantId).catch((e: unknown) => e)
  if (!(zernio instanceof ZernioProvider)) {
    const { mensagem } = erroZernio(zernio, 'Não foi possível preparar a conexão com a Zernio.')
    return json({ ok: false, status: 'nao_configurado', error: mensagem, modelos: montarResposta(cfg, cache) })
  }

  const limite = await reservarChamada(admin, tenantId, acao)
  if (!limite.ok) return json({ ok: false, status: 'limite', error: limite.erro, modelos: montarResposta(cfg, cache) }, limite.status)

  const metaIds = new Map<TipoModeloOficial, string | null>()

  // ---- listar: um GET só para a conta toda ----
  if (acao === 'listar') {
    let lista: ModeloZernio[] = []
    try {
      lista = await zernio.listarModelos(IDIOMA_MODELOS)
    } catch (e) {
      const { mensagem } = erroZernio(e, 'Não foi possível consultar os modelos na Zernio.')
      return json({ ok: false, error: mensagem, modelos: montarResposta(cfg, cache) })
    }
    const linhas: LinhaNova[] = []
    for (const m of MODELOS_OFICIAIS) {
      let z = lista.find((x) => respostaDoPedido(x, m.nome, m.idioma)) ?? null
      // Aprovado mas a listagem veio sem o texto: consulta pelo nome antes de ligar.
      if (z && normalizarStatus(z.status) === 'APPROVED' && conferirTexto(z.corpo, m.corpo) === 'sem_texto') {
        try {
          const individual = await zernio.consultarModelo(m.nome, m.idioma)
          if (individual && respostaDoPedido(individual, m.nome, m.idioma)) z = individual
        } catch {
          // Fica como veio da listagem: sem texto = não verificado, não liga.
        }
      }
      metaIds.set(m.tipo, z?.id ?? null)
      linhas.push(linhaDe(m, z))
    }
    await salvarCache(admin, tenantId, linhas, metaIds)
    for (const l of linhas) cache.set(l.tipo, l)
    cfg = await ligarAosEnvios(admin, tenantId, cfg, linhas, avisos)
    // Outros modelos da conta: só os nossos (prefixo omnx_) ou os nomes já configurados — sem texto.
    const configurados = new Set([cfg?.template_relatorio, cfg?.template_resumo, cfg?.template_link].filter(Boolean))
    const encontrados = lista
      .filter((x) => x.nome.startsWith('omnx_') || configurados.has(x.nome))
      .slice(0, 50)
      .map((x) => ({
        nome: x.nome.slice(0, 100),
        idioma: x.idioma.slice(0, 100),
        status: normalizarStatus(x.status),
        categoria: x.categoria ? x.categoria.slice(0, 100) : null,
      }))
    return json({ ok: true, modelos: montarResposta(cfg, cache), encontrados, avisos })
  }

  // ---- status: GET por nome (um tipo ou os 3) ----
  if (acao === 'status') {
    const alvos = tipo ? [modeloPorTipo(tipo) as ModeloOficial] : [...MODELOS_OFICIAIS]
    const linhas: LinhaNova[] = []
    let erro: string | null = null
    for (const m of alvos) {
      try {
        const z = await zernio.consultarModelo(m.nome, m.idioma)
        if (!respostaDoPedido(z, m.nome, m.idioma)) {
          console.error('wa-auto-templates: resposta de outro modelo descartada', m.tipo)
          erro = ERRO_RESPOSTA_TROCADA
          break
        }
        metaIds.set(m.tipo, z?.id ?? null)
        linhas.push(linhaDe(m, z))
      } catch (e) {
        erro = erroZernio(e, 'Não foi possível consultar o modelo na Zernio.').mensagem
        break // mesmo problema (chave/conta) se repetiria nos próximos
      }
    }
    await salvarCache(admin, tenantId, linhas, metaIds)
    for (const l of linhas) cache.set(l.tipo, l)
    cfg = await ligarAosEnvios(admin, tenantId, cfg, linhas, avisos)
    return json({ ok: erro === null, error: erro ?? undefined, modelos: montarResposta(cfg, cache), avisos })
  }

  // ---- criar: só um item do catálogo ----
  const modelo = modeloPorTipo(tipo) as ModeloOficial
  const problemas = problemasDoModelo(modelo)
  if (problemas.length > 0) {
    // Não deveria acontecer (o teste do catálogo trava), mas não gasta análise da Meta.
    console.error('wa-auto-templates: catálogo fora das regras', modelo.tipo, problemas.length)
    return json({ ok: false, error: 'O modelo do catálogo está fora das regras do WhatsApp. Avise o suporte.' }, 500)
  }

  let linha: LinhaNova = linhaDe(modelo, null)
  let jaExistia = false
  try {
    // Já existe? Então não cria de novo: só atualiza o status.
    const existente = await zernio.consultarModelo(modelo.nome, modelo.idioma)
    if (!respostaDoPedido(existente, modelo.nome, modelo.idioma)) {
      console.error('wa-auto-templates: resposta de outro modelo descartada', modelo.tipo)
      return json({ ok: false, status: 'resposta_inesperada', error: ERRO_RESPOSTA_TROCADA, modelos: montarResposta(cfg, cache) })
    }
    if (existente) {
      jaExistia = true
      metaIds.set(modelo.tipo, existente.id)
      linha = linhaDe(modelo, existente)
    } else {
      const criado = await zernio.criarModelo(corpoCriacaoZernio(modelo))
      if (!respostaDoPedido(criado, modelo.nome, modelo.idioma)) {
        // O pedido foi aceito, mas a resposta fala de outro modelo: não grava nada dela.
        console.error('wa-auto-templates: resposta de criação de outro modelo descartada', modelo.tipo)
        return json({
          ok: true,
          status: 'criado',
          modelos: montarResposta(cfg, cache),
          avisos: ['O pedido foi enviado, mas a resposta da Zernio veio estranha e foi ignorada. Clique em "Atualizar status" para conferir.'],
        })
      }
      metaIds.set(modelo.tipo, criado.id)
      // Na criação a Zernio devolve só o resumo (sem o texto): o texto é o nosso.
      linha = linhaDe(modelo, { ...criado, corpo: null, status: criado.status ?? 'PENDING' })
    }
  } catch (e) {
    const { mensagem, codigo } = erroZernio(e, 'Não foi possível criar o modelo na Zernio.')
    return json({ ok: false, status: codigo, error: mensagem, modelos: montarResposta(cfg, cache) })
  }

  await salvarCache(admin, tenantId, [linha], metaIds)
  cache.set(linha.tipo, linha)
  cfg = await ligarAosEnvios(admin, tenantId, cfg, [linha], avisos)
  if (jaExistia && linha.texto_diferente) {
    avisos.push('Já existe um modelo com esse nome, mas com outro texto. Ele não será usado pelos envios automáticos.')
  }
  return json({
    ok: true,
    status: jaExistia ? 'ja_existia' : 'criado',
    modelos: montarResposta(cfg, cache),
    avisos,
  })
})
