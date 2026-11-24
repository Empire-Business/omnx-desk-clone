// Administração do ASSISTENTE DA EQUIPE no WhatsApp (app Automações WhatsApp).
//
// POST { acao: '<nome>', ...parâmetros } com o JWT do usuário.
//
// Ações:
//   status            → números de WhatsApp da empresa e se o webhook está protegido.
//   ferramentas       → catálogo habilitado, só nomes/descrições; não executa nada.
//   perfil            → perfil salvo ou padrão efetivo, com revisão do editor.
//   salvar_perfil     → personalidade + contexto + revisão; mesma permissão admin.
//   proteger_webhook  → { instance_uuid } gera um token novo (32 bytes), troca SÓ a
//                       url do webhook da UAZAPI do número para
//                       …/functions/v1/uazapi-webhook/k/<token> (mesma config:
//                       eventos, filtros, addUrlEvents…), confere com um GET e grava
//                       só o sha256. Rodar de novo = rotacionar (o token anterior
//                       vale mais 10 min para nenhuma mensagem se perder).
//   simular / boas_vindas / candidatos → _shared/wa-agente-admin-acoes.ts.
//
// Proteções:
//   * verify_jwt padrão (true) no gateway + auth.getUser aqui; exige
//     has_permissao('automacoes-wa','admin') avaliada COM O JWT do usuário.
//   * Empresa = a do usuário (nunca do body). Instância conferida contra ela.
//   * O token nunca vai para log nem para a resposta; a url da UAZAPI só é
//     comparada em memória.
//   * Webhook só é trocado se HOJE aponta para uazapi-webhook deste projeto.
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { gerarTokenWebhook, hashTokenHex, urlComToken, urlTemToken } from '../_shared/wa-webhook-token.ts'
import { type AcaoAgenteAdmin, executarAcaoAgenteAdmin } from '../_shared/wa-agente-admin-acoes.ts'
import { ferramentasDisponiveis } from '../_shared/wa-agente-ferramentas.ts'
import { escopoAcessoTotal } from '../_shared/wa-agente-escopo.ts'
import { tokenUazapi as tokenUazapiResolvido, urlUazapi } from '../_shared/uazapi-credenciais.ts'
import { carregarPerfilAgente, salvarPerfilAgente, ErroPerfil, LIMITE_CORPO_PERFIL_BYTES } from '../_shared/wa-agente-perfil.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Quanto tempo o token anterior continua valendo depois de rotacionar. */
const GRACA_ROTACAO_MS = 10 * 60_000

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

export interface Contexto {
  /** Client service_role (ignora RLS — sempre filtrar por tenantId). */
  admin: SupabaseClient
  /** Client com o JWT do usuário (RLS dele). */
  usuario: SupabaseClient
  userId: string
  userNome?: string | null
  tenantId: string
}

type Acao = (ctx: Contexto, params: Record<string, unknown>) => Promise<Response>

/** JWT válido + automacoes-wa · admin. Devolve usuário e empresa DELE. */
async function autorizar(authHeader: string | null): Promise<Contexto | null> {
  if (!authHeader) return null
  const usuario = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await usuario.auth.getUser()
  if (!user) return null
  const { data: pode, error: errPode } = await usuario.rpc('has_permissao', { p_recurso: 'automacoes-wa', p_acao: 'admin' })
  if (errPode || pode !== true) return null
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: u } = await admin.from('users').select('ativo, tenant_id, nome').eq('id', user.id).maybeSingle()
  if (!u || u.ativo !== true || !u.tenant_id) return null
  return { admin, usuario, userId: user.id, userNome: u.nome as string | null, tenantId: u.tenant_id as string }
}

// ---------------------------------------------------------------------------
// UAZAPI: webhook
// ---------------------------------------------------------------------------
interface WebhookUazapi {
  id?: string
  enabled?: boolean
  url?: string
  events?: unknown
  excludeMessages?: unknown
  addUrlEvents?: unknown
  addUrlTypesMessages?: unknown
}

async function chamarUazapi(baseUrl: string, token: string, metodo: 'GET' | 'POST', corpo?: unknown): Promise<{ ok: boolean; status: number; dados: unknown }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch(`${baseUrl}/webhook`, {
      method: metodo,
      headers: metodo === 'POST' ? { token, 'Content-Type': 'application/json' } : { token },
      body: metodo === 'POST' ? JSON.stringify(corpo) : undefined,
      signal: ctrl.signal,
      redirect: 'error',
    })
    const texto = await res.text().catch(() => '')
    let dados: unknown = null
    try { dados = texto ? JSON.parse(texto) : null } catch { dados = null }
    return { ok: res.ok, status: res.status, dados }
  } catch {
    return { ok: false, status: 0, dados: null }
  } finally {
    clearTimeout(timer)
  }
}

/** GET /webhook pode devolver lista ou objeto. */
function listaWebhooks(dados: unknown): WebhookUazapi[] {
  if (Array.isArray(dados)) return dados.filter((w) => w && typeof w === 'object') as WebhookUazapi[]
  if (dados && typeof dados === 'object') {
    const o = dados as Record<string, unknown>
    if (Array.isArray(o.webhooks)) return listaWebhooks(o.webhooks)
    if (typeof o.url === 'string') return [o as WebhookUazapi]
  }
  return []
}

/** Webhooks que apontam para o uazapi-webhook deste projeto. */
function webhooksDoProjeto(lista: WebhookUazapi[]): WebhookUazapi[] {
  return lista.filter((w) => typeof w.url === 'string' && urlComToken(w.url, SUPABASE_URL, 'x'.repeat(43)) !== null)
}

/** Token do número: cofre (por número ou da empresa) e, por último, o segredo legado. */
function tokenUazapi(admin: SupabaseClient, instanceIdTxt: string, tenantId: string): Promise<string | null> {
  return tokenUazapiResolvido(admin, instanceIdTxt, tenantId)
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------
const status: Acao = async (ctx) => {
  const { data: insts, error } = await ctx.admin
    .from('whatsapp_instances')
    .select('id, instance_id, nome')
    .eq('tenant_id', ctx.tenantId)
    .order('nome')
  if (error) return json({ ok: false, error: 'Não foi possível ler os números.' }, 500)
  const ids = (insts ?? []).map((i) => i.id as string)
  const { data: toks } = ids.length
    ? await ctx.admin
      .from('wa_webhook_tokens')
      .select('instance_id, rotacionado_em, ultimo_uso_em, instancia_lid')
      .eq('tenant_id', ctx.tenantId)
      .in('instance_id', ids)
    : { data: [] }
  const porInst = new Map((toks ?? []).map((t) => [t.instance_id as string, t]))
  const comToken = new Set<string>()
  for (const i of insts ?? []) {
    if (await tokenUazapi(ctx.admin, String(i.instance_id ?? ''), ctx.tenantId)) comToken.add(i.id as string)
  }
  return json({
    ok: true,
    instancias: (insts ?? []).map((i) => {
      const t = porInst.get(i.id as string)
      return {
        instance_uuid: i.id,
        instance_id: i.instance_id,
        nome: i.nome,
        protegida: !!t,
        rotacionado_em: t?.rotacionado_em ?? null,
        ultimo_uso_em: t?.ultimo_uso_em ?? null,
        lid_conhecido: !!t?.instancia_lid,
        token_configurado: comToken.has(i.id as string),
      }
    }),
  })
}

const protegerWebhook: Acao = async (ctx, params) => {
  const instanceUuid = typeof params.instance_uuid === 'string' ? params.instance_uuid : ''
  if (!UUID.test(instanceUuid)) return json({ ok: false, error: 'Número inválido.' }, 400)

  const { data: inst } = await ctx.admin
    .from('whatsapp_instances')
    .select('id, instance_id')
    .eq('id', instanceUuid)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  if (!inst) return json({ ok: false, error: 'Número não encontrado nesta empresa.' }, 404)
  const tokUaz = await tokenUazapi(ctx.admin, String(inst.instance_id ?? ''), ctx.tenantId)
  if (!tokUaz) return json({ ok: false, error: 'Este número não tem a conexão da UAZAPI configurada no servidor.' }, 400)

  // 1) Config atual.
  const baseUazapi = await urlUazapi(ctx.admin, ctx.tenantId)
  const atual = await chamarUazapi(baseUazapi, tokUaz, 'GET')
  if (!atual.ok) return json({ ok: false, error: 'Não foi possível ler o webhook na UAZAPI.' }, 502)
  const nossos = webhooksDoProjeto(listaWebhooks(atual.dados))
  if (nossos.length === 0) {
    return json({ ok: false, error: 'O webhook deste número não aponta para o sistema. Conecte o número no Chat primeiro.' }, 409)
  }
  if (nossos.length > 1) {
    return json({ ok: false, error: 'Este número tem mais de um webhook para o sistema. Remova os duplicados na UAZAPI.' }, 409)
  }
  const wh = nossos[0]

  // 2) Token novo; grava o hash ANTES de trocar a url (o anterior vale 10 min).
  const token = gerarTokenWebhook()
  const novaUrl = urlComToken(String(wh.url), SUPABASE_URL, token)
  if (!novaUrl) return json({ ok: false, error: 'Webhook com endereço inesperado.' }, 409)
  const hashHex = await hashTokenHex(token)

  const { data: anterior } = await ctx.admin
    .from('wa_webhook_tokens')
    .select('token_hash, token_hash_anterior, anterior_ate, rotacionado_em')
    .eq('instance_id', instanceUuid)
    .maybeSingle()

  const agora = new Date()
  const { error: errGrava } = await ctx.admin.from('wa_webhook_tokens').upsert({
    instance_id: instanceUuid,
    tenant_id: ctx.tenantId,
    token_hash: `\\x${hashHex}`,
    token_hash_anterior: anterior?.token_hash ?? null,
    anterior_ate: anterior ? new Date(agora.getTime() + GRACA_ROTACAO_MS).toISOString() : null,
    rotacionado_em: agora.toISOString(),
  }, { onConflict: 'instance_id' })
  if (errGrava) return json({ ok: false, error: 'Não foi possível gravar a proteção.' }, 500)

  const desfazer = async () => {
    if (anterior) {
      await ctx.admin.from('wa_webhook_tokens').update({
        token_hash: anterior.token_hash,
        token_hash_anterior: anterior.token_hash_anterior,
        anterior_ate: anterior.anterior_ate,
        rotacionado_em: anterior.rotacionado_em,
      }).eq('instance_id', instanceUuid)
    } else {
      await ctx.admin.from('wa_webhook_tokens').delete().eq('instance_id', instanceUuid)
    }
  }

  // 3) Troca SÓ a url (mesma config).
  const corpo: Record<string, unknown> = {
    enabled: wh.enabled ?? true,
    url: novaUrl,
  }
  for (const k of ['events', 'excludeMessages', 'addUrlEvents', 'addUrlTypesMessages'] as const) {
    if (wh[k] !== undefined) corpo[k] = wh[k]
  }
  if (typeof wh.id === 'string' && wh.id) {
    corpo.id = wh.id
    corpo.action = 'update'
  }
  const troca = await chamarUazapi(baseUazapi, tokUaz, 'POST', corpo)
  if (!troca.ok) {
    await desfazer()
    return json({ ok: false, error: 'A UAZAPI recusou a troca do webhook. Nada mudou.' }, 502)
  }

  // 4) Confere.
  const conf = await chamarUazapi(baseUazapi, tokUaz, 'GET')
  const conferido = conf.ok && webhooksDoProjeto(listaWebhooks(conf.dados)).some((w) => urlTemToken(w.url, token))
  if (!conferido) {
    // A UAZAPI aceitou a troca, mas a leitura não confirmou. NÃO desfaz: se a url
    // nova estiver valendo e o hash fosse apagado, as mensagens seriam recusadas
    // (token desconhecido = não grava). O hash anterior segue válido por 10 min.
    console.warn('[wa-agente-admin] troca aceita mas não confirmada:', inst.instance_id)
    return json({ ok: false, error: 'A UAZAPI aceitou a troca, mas não confirmou. Clique em "Proteger" de novo para garantir.' }, 502)
  }

  console.log('[wa-agente-admin] webhook protegido:', inst.instance_id, anterior ? '(rotação)' : '(primeira vez)')
  return json({ ok: true, protegida: true, rotacao: !!anterior })
}

/**
 * simular / boas_vindas / candidatos (_shared/wa-agente-admin-acoes.ts). `autorizar`
 * já exigiu automacoes-wa · admin com o JWT; empresa = a do usuário.
 */
function acaoDoAgente(nome: AcaoAgenteAdmin): Acao {
  return async (ctx, params) => {
    const r = await executarAcaoAgenteAdmin(nome, params, {
      admin: ctx.admin, tenantId: ctx.tenantId, userId: ctx.userId, podeAdministrar: true,
    })
    return json(r.corpo, r.status)
  }
}

/** Mapa de ações. */
export const ACOES: Record<string, Acao> = {
  status,
  perfil: async (ctx) => json({ ok: true, ...await carregarPerfilAgente(ctx.admin, ctx.tenantId) }),
  salvar_perfil: async (ctx, params) => json({ ok: true, ...await salvarPerfilAgente(ctx.admin, ctx.tenantId, ctx.userId, ctx.userNome ?? null, params) }),
  // O escopo completo serve só para enumerar capacidades; permissões reais são
  // resolvidas novamente no WhatsApp. Nunca executa ferramentas ou lê clientes.
  ferramentas: async (ctx) => json({
    ok: true,
    ferramentas: ferramentasDisponiveis(escopoAcessoTotal(ctx.tenantId, ctx.userId)).map((d) => ({
      nome: d.function.name,
      descricao: d.function.description,
      altera_dados: ['registrar_aprendizado', 'esquecer_aprendizado', 'ajustar_relatorio'].includes(d.function.name),
    })),
  }),
  proteger_webhook: protegerWebhook,
  simular: acaoDoAgente('simular'),
  boas_vindas: acaoDoAgente('boas_vindas'),
  candidatos: acaoDoAgente('candidatos'),
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const ctx = await autorizar(req.headers.get('Authorization'))
  if (!ctx) return json({ ok: false, error: 'forbidden' }, 403)

  let params: Record<string, unknown> = {}
  try {
    // Limite em bytes antes de juntar o corpo; permite os dois campos longos sem
    // aumentar o limite das demais ações administrativas.
    const reader = req.body?.getReader()
    const partes: Uint8Array[] = []
    let tamanho = 0
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          tamanho += value.byteLength
          if (tamanho > LIMITE_CORPO_PERFIL_BYTES) {
            await reader.cancel()
            return json({ ok: false, error: 'Pedido grande demais.' }, 413)
          }
          partes.push(value)
        }
      } finally { reader.releaseLock() }
    }
    const bytes = new Uint8Array(tamanho)
    let pos = 0
    for (const parte of partes) { bytes.set(parte, pos); pos += parte.byteLength }
    const bruto = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const b = bruto ? JSON.parse(bruto) : {}
    if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ ok: false, error: 'Pedido inválido.' }, 400)
    params = b as Record<string, unknown>
    if (params.acao !== 'salvar_perfil' && tamanho > 16_384) return json({ ok: false, error: 'Pedido grande demais.' }, 413)
  } catch {
    return json({ ok: false, error: 'Pedido inválido.' }, 400)
  }

  const nome = typeof params.acao === 'string' ? params.acao : ''
  const acao = Object.prototype.hasOwnProperty.call(ACOES, nome) ? ACOES[nome] : undefined
  if (!acao) return json({ ok: false, error: 'Ação desconhecida.' }, 400)
  try {
    return await acao(ctx, params)
  } catch (e) {
    if (e instanceof ErroPerfil) return json({ ok: false, error: e.message, codigo: e.codigo }, e.status)
    console.error('[wa-agente-admin]', nome, e instanceof Error ? e.name : 'erro')
    return json({ ok: false, error: 'Erro interno.' }, 500)
  }
})
