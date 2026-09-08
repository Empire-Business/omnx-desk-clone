// Disparo — leva um recorte da base para o CRM externo marcado com uma tag.
//
// Esta função NÃO manda mensagem. Ela entrega público etiquetado; quem dispara é
// a automação do CRM, que escuta a tag.
//
// Dois modos:
//   analisar → só conta (nada é escrito no CRM). Alimenta a tela de confirmação.
//   aplicar  → efetiva: aplica a tag e, se autorizado, cria quem não existe.
//
// Regra de match (a parte que importa): a comparação é pela chave canônica
// DDD + últimos 8 dígitos, nunca pela string cheia — senão os contatos que o CRM
// guarda sem o nono dígito virariam duplicatas novas. Telefone com mais de um
// cadastro no CRM é AMBÍGUO e não é tocado: escolher um deles seria chute.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveEmpireBridge, empireHeaders } from '../_shared/empire-bridge.ts'
import { chaveTelefone, paraE164 } from '../_shared/telefone.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Teto por chamada. Disparo é irreversível; um lote gigante por engano é o pior cenário. */
const MAX_CONTATOS = 2000
/** Tamanho do lote enviado ao CRM por requisição — evita payload e timeout grandes. */
const TAMANHO_LOTE = 200

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

interface ContatoEntrada {
  contrato_id?: unknown
  nome?: unknown
  telefone?: unknown
  email?: unknown
}

interface ContatoNormalizado {
  chave: string
  telefone: string
  nome: string
  email: string | null
}

/** Autoriza (só admin) e devolve o tenant dele — a ponte usada é a DELE. */
async function autorizarAdmin(authHeader: string | null): Promise<{ ok: boolean; tenantId: string | null; userId: string | null }> {
  if (!authHeader) return { ok: false, tenantId: null, userId: null }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { ok: false, tenantId: null, userId: null }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data } = await admin.from('users').select('perfil').eq('id', user.id).single()
  if (data?.perfil !== 'admin') return { ok: false, tenantId: null, userId: null }
  const { data: tenantId } = await admin.rpc('get_tenant_do_usuario', { p_user_id: user.id })
  return { ok: true, tenantId: (tenantId as string | null) ?? null, userId: user.id }
}

/**
 * A tag viaja para o CRM, então segue formato previsível: minúsculas, sem acento,
 * com hífen. Evita `Campanha Julho` e `campanha-julho` virarem duas tags lá.
 */
function normalizaTag(bruto: string): string {
  return bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Normaliza e deduplica o lote. O que não tem telefone brasileiro plausível cai fora. */
function prepararContatos(entrada: ContatoEntrada[]): { contatos: ContatoNormalizado[]; descartados: number } {
  const porChave = new Map<string, ContatoNormalizado>()
  let descartados = 0
  for (const c of entrada) {
    const bruto = typeof c?.telefone === 'string' ? c.telefone : ''
    const chave = chaveTelefone(bruto)
    const telefone = paraE164(bruto)
    if (!chave || !telefone) { descartados++; continue }
    // Primeiro vence: se o mesmo telefone vier duas vezes, é a mesma pessoa.
    if (porChave.has(chave)) continue
    const email = typeof c?.email === 'string' ? c.email.trim().toLowerCase() : ''
    porChave.set(chave, {
      chave,
      telefone,
      nome: typeof c?.nome === 'string' ? c.nome.trim().slice(0, 120) : '',
      email: email || null,
    })
  }
  return { contatos: [...porChave.values()], descartados }
}

interface RespostaCrm {
  existentes?: number
  novos?: number
  criados?: number
  marcados?: number
  falhas?: number
  ambiguos?: Array<{ telefone?: string; nome?: string }>
  error?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = await autorizarAdmin(req.headers.get('Authorization'))
  if (!auth.ok) return json({ error: 'forbidden' }, 403)

  let body: { modo?: unknown; tag?: unknown; contatos?: unknown; criar_novos?: unknown }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  const modo = body?.modo === 'aplicar' ? 'aplicar' : 'analisar'
  const tag = normalizaTag(typeof body?.tag === 'string' ? body.tag : '')
  if (!tag) return json({ error: 'tag_obrigatoria' }, 400)

  const entrada = Array.isArray(body?.contatos) ? (body.contatos as ContatoEntrada[]) : []
  if (entrada.length === 0) return json({ error: 'sem_contatos' }, 400)
  if (entrada.length > MAX_CONTATOS) return json({ error: 'lote_grande_demais', max: MAX_CONTATOS }, 400)

  const { contatos, descartados } = prepararContatos(entrada)
  if (contatos.length === 0) return json({ error: 'nenhum_telefone_valido', descartados }, 400)

  // Criar contato só acontece se o modo for 'aplicar' E a pessoa tiver confirmado
  // na tela. Na análise nunca cria — é o que torna o preview seguro.
  const criarNovos = modo === 'aplicar' && body?.criar_novos === true

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const bridge = await resolveEmpireBridge(admin, auth.tenantId)
  if (!bridge) return json({ error: 'bridge_nao_configurada' }, 500)

  const total = { existentes: 0, novos: 0, criados: 0, marcados: 0, falhas: 0 }
  const ambiguos: Array<{ telefone: string; nome: string }> = []

  for (let i = 0; i < contatos.length; i += TAMANHO_LOTE) {
    const lote = contatos.slice(i, i + TAMANHO_LOTE)
    let res: Response
    try {
      res = await fetch(`${bridge.baseUrl}/crm-aplicar-tag`, {
        method: 'POST',
        headers: empireHeaders(bridge.secret),
        body: JSON.stringify({
          tag,
          // dry_run diz ao CRM para só diagnosticar, sem escrever nada.
          dry_run: modo === 'analisar',
          criar_novos: criarNovos,
          contatos: lote,
        }),
      })
    } catch (e) {
      // Rede caiu no meio: para aqui em vez de seguir marcando pela metade em silêncio.
      return json({ error: 'falha_de_rede', detail: (e as Error).message, parcial: total }, 502)
    }

    if (res.status === 401) return json({ error: 'secret_recusado_pelo_crm' }, 502)
    const data = (await res.json().catch(() => ({}))) as RespostaCrm
    if (!res.ok) {
      return json({ error: 'crm_error', status: res.status, detail: data, parcial: total }, 502)
    }

    total.existentes += data.existentes ?? 0
    total.novos += data.novos ?? 0
    total.criados += data.criados ?? 0
    total.marcados += data.marcados ?? 0
    total.falhas += data.falhas ?? 0
    for (const a of data.ambiguos ?? []) {
      ambiguos.push({ telefone: String(a?.telefone ?? ''), nome: String(a?.nome ?? '') })
    }
  }

  if (modo === 'analisar') {
    return json({
      tag,
      // `total` volta com a contagem que a TELA mandou (não a normalizada): é assim
      // que ela sabe se a análise ainda corresponde ao recorte na tela.
      total: entrada.length,
      analisados: contatos.length,
      descartados,
      existentes: total.existentes,
      novos: total.novos,
      ambiguos,
    })
  }

  // Rastro de quem disparou o quê — disparo é ação com consequência externa.
  // Falha aqui não derruba a resposta: a tag JÁ foi aplicada no CRM, e devolver
  // erro faria a pessoa repetir o disparo achando que não saiu.
  if (auth.tenantId) {
    try {
      await admin.from('audit_logs').insert({
        user_id: auth.userId,
        acao: 'disparo.aplicar_tag',
        entidade: 'crm_contato',
        entidade_id: tag,
        detalhes: {
          tag,
          enviados: contatos.length,
          marcados: total.marcados,
          criados: total.criados,
          falhas: total.falhas,
          ambiguos: ambiguos.length,
        },
      })
    } catch {
      // segue: o disparo já aconteceu
    }
  }

  return json({
    tag,
    marcados: total.marcados,
    criados: total.criados,
    falhas: total.falhas,
    ambiguos: ambiguos.length,
  })
})
