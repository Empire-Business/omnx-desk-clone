// Edge function: notion-import
//
// Lê uma ou mais databases de contratos do Notion no formato real
// "Contratos - Acelerador de Audiência":
//
//   - 1 página = 1 contrato
//   - Cliente é o título (ou relation → título da página relacionada)
//   - Especialista vem como rollup → people
//   - Comissão é calculada a partir de Valor Parcela × Nº de parcelas
//     com 1ª parcela na data de VENCIMENTO (e demais mensais a partir daí)
//
// Variáveis de ambiente aceitas (em ordem de prioridade):
//   - NOTION_DB_IDS    = lista de IDs separados por vírgula (preferido)
//   - NOTION_DB_2025   + NOTION_DB_2026 (legado — mantidos por compat)
//
// Secrets: NOTION_API_KEY
// Acesso: somente admin/gerente (validado por JWT)

import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const NOTION_VERSION = '2022-06-28'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface NotionRichText { plain_text?: string }
interface NotionRollupValue {
  type: string
  number?: number | null
  date?: { start?: string | null } | null
  string?: string | null
  array?: NotionPropertyValue[]
}
interface NotionFile {
  name?: string
  type?: 'external' | 'file'
  external?: { url?: string }
  file?: { url?: string }
}
interface NotionPropertyValue {
  type: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  number?: number | null
  date?: { start?: string | null } | null
  select?: { name?: string } | null
  multi_select?: Array<{ name: string }>
  people?: Array<{ id: string; name?: string }>
  status?: { name?: string } | null
  checkbox?: boolean
  email?: string | null
  phone_number?: string | null
  url?: string | null
  files?: NotionFile[]
  unique_id?: { prefix?: string | null; number?: number | null }
  formula?: {
    type: string
    number?: number | null
    string?: string | null
    boolean?: boolean | null
    date?: { start?: string | null } | null
  }
  rollup?: NotionRollupValue
  relation?: Array<{ id: string }>
}
interface NotionPage {
  id: string
  properties: Record<string, NotionPropertyValue>
  last_edited_time?: string
}

const corsJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

function plain(prop: NotionPropertyValue | undefined): string {
  if (!prop) return ''
  if (prop.title) return prop.title.map((t) => t.plain_text ?? '').join('').trim()
  if (prop.rich_text) return prop.rich_text.map((t) => t.plain_text ?? '').join('').trim()
  if (prop.select?.name) return prop.select.name
  if (prop.status?.name) return prop.status.name
  if (prop.multi_select && prop.multi_select.length > 0) return prop.multi_select.map((m) => m.name).join(', ')
  if (prop.people && prop.people.length > 0) return (prop.people[0].name ?? '').trim()
  if (typeof prop.email === 'string' && prop.email) return prop.email
  if (typeof prop.phone_number === 'string' && prop.phone_number) return prop.phone_number
  if (typeof prop.url === 'string' && prop.url) return prop.url
  if (prop.files && prop.files.length > 0) {
    const f = prop.files[0]
    return f.external?.url ?? f.file?.url ?? f.name ?? ''
  }
  if (prop.unique_id) {
    const n = prop.unique_id.number
    if (typeof n === 'number') {
      return prop.unique_id.prefix ? `${prop.unique_id.prefix}-${n}` : String(n)
    }
  }
  if (typeof prop.number === 'number') return String(prop.number)
  if (prop.date?.start) return prop.date.start
  if (prop.formula?.string) return prop.formula.string
  if (prop.formula?.type === 'number' && typeof prop.formula.number === 'number') return String(prop.formula.number)
  if (prop.formula?.type === 'date' && prop.formula.date?.start) return prop.formula.date.start
  if (prop.rollup) {
    const r = prop.rollup
    if (r.type === 'string' && r.string) return r.string
    if (r.type === 'array' && r.array) {
      for (const item of r.array) {
        const v = plain(item)
        if (v) return v
      }
    }
  }
  return ''
}

function num(prop: NotionPropertyValue | undefined): number | null {
  if (!prop) return null
  if (typeof prop.number === 'number') return prop.number
  if (prop.formula?.type === 'number' && typeof prop.formula.number === 'number') return prop.formula.number
  if (prop.rollup) {
    const r = prop.rollup
    if (r.type === 'number' && typeof r.number === 'number') return r.number
    if (r.type === 'array' && r.array) {
      for (const item of r.array) {
        const v = num(item)
        if (typeof v === 'number') return v
      }
    }
  }
  // Fallback: string com R$ / vírgula
  const txt = plain(prop)
  if (!txt) return null
  const cleaned = txt.replace(/[R$\s.]/g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function dateOf(prop: NotionPropertyValue | undefined): string | null {
  if (!prop) return null
  if (prop.date?.start) return prop.date.start
  if (prop.formula?.type === 'date' && prop.formula.date?.start) return prop.formula.date.start
  if (prop.rollup?.type === 'array' && prop.rollup.array) {
    for (const item of prop.rollup.array) {
      const v = dateOf(item)
      if (v) return v
    }
  }
  return null
}

function bool(prop: NotionPropertyValue | undefined): boolean | null {
  if (!prop) return null
  if (typeof prop.checkbox === 'boolean') return prop.checkbox
  if (prop.formula?.type === 'boolean' && typeof prop.formula.boolean === 'boolean') return prop.formula.boolean
  const t = plain(prop).toLowerCase()
  if (!t) return null
  if (['yes', 'sim', 'true', 'verdadeiro'].includes(t)) return true
  if (['no', 'não', 'nao', 'false', 'falso'].includes(t)) return false
  return null
}

function intOf(prop: NotionPropertyValue | undefined): number | null {
  const n = num(prop)
  return n === null ? null : Math.round(n)
}

function peopleIds(prop: NotionPropertyValue | undefined): string[] {
  if (!prop) return []
  if (prop.people && prop.people.length > 0) return prop.people.map((p) => p.id)
  if (prop.rollup?.type === 'array' && prop.rollup.array) {
    for (const item of prop.rollup.array) {
      if (item.people && item.people.length > 0) return item.people.map((p) => p.id)
    }
  }
  return []
}

async function notionFetch(apiKey: string, path: string, attempt = 0): Promise<Response> {
  const r = await fetch(`https://api.notion.com${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Notion-Version': NOTION_VERSION },
  })
  if (r.status === 429 && attempt < 3) {
    const retry = Number(r.headers.get('Retry-After') ?? '1')
    await new Promise((res) => setTimeout(res, (retry || 1) * 1000))
    return notionFetch(apiKey, path, attempt + 1)
  }
  return r
}

async function notionRetrievePageTitle(apiKey: string, pageId: string, cache: Map<string, string>): Promise<string> {
  if (cache.has(pageId)) return cache.get(pageId)!
  try {
    const r = await notionFetch(apiKey, `/v1/pages/${pageId}`)
    if (!r.ok) { cache.set(pageId, ''); return '' }
    const j = await r.json() as { properties: Record<string, NotionPropertyValue> }
    let title = ''
    for (const v of Object.values(j.properties ?? {})) {
      if (v.type === 'title' && v.title) {
        title = v.title.map((t) => t.plain_text ?? '').join('').trim()
        if (title) break
      }
    }
    cache.set(pageId, title)
    return title
  } catch {
    cache.set(pageId, '')
    return ''
  }
}

async function notionRetrieveUserName(apiKey: string, userId: string, cache: Map<string, string>): Promise<string> {
  if (cache.has(userId)) return cache.get(userId)!
  try {
    const r = await notionFetch(apiKey, `/v1/users/${userId}`)
    if (!r.ok) { cache.set(userId, ''); return '' }
    const j = await r.json() as { name?: string }
    const name = (j.name ?? '').trim()
    cache.set(userId, name)
    return name
  } catch {
    cache.set(userId, '')
    return ''
  }
}

function getProp(props: Record<string, NotionPropertyValue>, ...names: string[]): NotionPropertyValue | undefined {
  for (const n of names) {
    if (props[n]) return props[n]
    const k = Object.keys(props).find((kk) => kk.toLowerCase() === n.toLowerCase())
    if (k) return props[k]
  }
  return undefined
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim()
}

// Aliases agora vêm da tabela estrategista_aliases (carregada em runtime).

// 01/01/1900 e variações são placeholders do Notion para "sem data"
function nullIfEpoch(d: string | null): string | null {
  if (!d) return null
  if (d.startsWith('1900-')) return null
  return d
}

// Mapeia o STATUS textual do Notion para o enum do banco
function mapStatus(raw: string): 'ativo' | 'cancelado' | 'concluido' {
  const s = raw.toLowerCase()
  if (s.includes('cancel')) return 'cancelado'
  if (s.includes('concl') || s.includes('finaliz') || s.includes('encerr') || s.includes('inativ')) return 'concluido'
  return 'ativo'
}

async function notionQueryDatabase(apiKey: string, dbId: string): Promise<NotionPage[]> {
  const all: NotionPage[] = []
  let cursor: string | undefined
  do {
    const r = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 }),
    })
    if (!r.ok) throw new Error(`Notion query failed: ${r.status} ${await r.text()}`)
    const j = await r.json() as { results: NotionPage[]; next_cursor: string | null; has_more: boolean }
    all.push(...j.results)
    cursor = j.has_more ? (j.next_cursor ?? undefined) : undefined
  } while (cursor)
  return all
}

const MESES_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

interface ContratoRow {
  cliente_nome: string
  produto_nome: string | null
  estrategista_id: string | null
  estrategista_nome_raw: string
  data_fechamento: string | null
  vencimento: string | null
  valor_parcela: number | null
  num_parcelas: number
  valor_total: number
  status: 'ativo' | 'cancelado' | 'concluido'
  status_secundario: string | null
  notion_page_id: string
  notion_numero: string | null
  notion_ultima_edicao: string | null
  whatsapp: string | null
  email: string | null
  cpf_cnpj: string | null
  empresa: string | null
  endereco: string | null
  instagram: string | null
  nicho: string | null
  posicionamento: string | null
  resumo: string | null
  faturamento: string | null
  fat_bruto: number | null
  entrada: number | null
  pg_entrada: string | null
  forma_pagamento: string | null
  link_clicksign: string | null
  plano_dias: number | null
  semanas: number | null
  renovacao: string | null
  vendedor: string | null
  treinador: string | null
  bonus: string | null
  venda_interna: boolean | null
  venda_diretoria: boolean | null
  seguidores_inicio: number | null
  seguidores_fim: number | null
  crescimento_seguidores: number | null
  videos_postados: number | null
  entregas_no_prazo: number | null
  entregas_totais: number | null
  nps_vip: string | null
  notion_raw: Record<string, NotionPropertyValue>
  // Schema A (formato antigo): valor mensal direto
  monthly: Map<number, number>
}

async function pageToRow(
  p: NotionPage,
  apiKey: string,
  titleCache: Map<string, string>,
  userCache: Map<string, string>,
): Promise<ContratoRow | null> {
  const props = p.properties

  // CLIENTE — pode ser title direto, rich_text, ou relation. Tenta também "Nome"/"Name".
  let cliente = plain(getProp(props, 'CLIENTE', 'Cliente'))
  if (!cliente) {
    const rel = getProp(props, 'CLIENTE', 'Cliente')
    if (rel?.relation && rel.relation.length > 0) {
      cliente = await notionRetrievePageTitle(apiKey, rel.relation[0].id, titleCache)
    }
  }
  if (!cliente) cliente = plain(getProp(props, 'Nome', 'Name'))
  // Se o título da própria página for não-vazio, usa
  if (!cliente) {
    for (const v of Object.values(props)) {
      if (v.type === 'title' && v.title && v.title.length > 0) {
        const t = v.title.map((tt) => tt.plain_text ?? '').join('').trim()
        if (t) { cliente = t; break }
      }
    }
  }
  if (!cliente) return null

  // ESPECIALISTA — rollup → people, ou texto direto
  let estrategistaNome = plain(getProp(props, 'Especialista', 'Estrategista', 'Estratégista'))
  if (!estrategistaNome) {
    const ids = peopleIds(getProp(props, 'Especialista', 'Estrategista', 'Estratégista'))
    if (ids.length > 0) estrategistaNome = await notionRetrieveUserName(apiKey, ids[0], userCache)
  }

  const dataAssinatura = nullIfEpoch(dateOf(getProp(props, 'ASSINATURA', 'Assinatura', 'Data Assinatura', 'Data de Assinatura')))
  const vencimento = nullIfEpoch(dateOf(getProp(props, 'VENCIMENTO', 'Vencimento')))

  // Schema A — monthly columns
  const monthly = new Map<number, number>()
  for (let i = 0; i < 12; i++) {
    const v = num(getProp(props, MESES_PT[i]))
    if (v !== null && v > 0) monthly.set(i + 1, v)
  }

  // Schema B — Valor Parcela + Nº parcelas
  let valorParcela = num(getProp(props, 'Valor Parcela', 'VALOR PARCELA'))
  let numParcelas = intOf(getProp(props, 'Nº de parcelas', 'Numero de parcelas', 'N° de parcelas')) ?? 1

  // Se só temos colunas mensais, derivamos um "valor parcela representativo"
  // (média/mediana das comissões mensais) e o número de parcelas.
  if (valorParcela === null && monthly.size > 0) {
    const valores = Array.from(monthly.values())
    valorParcela = Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100
    numParcelas = valores.length
  }

  const valorTotal = monthly.size > 0
    ? Math.round(Array.from(monthly.values()).reduce((a, b) => a + b, 0) * 100) / 100
    : (valorParcela !== null ? Math.round(valorParcela * numParcelas * 100) / 100 : 0)

  const statusRaw = plain(getProp(props, 'STATUS', 'Status'))

  return {
    cliente_nome: cliente,
    produto_nome: plain(getProp(props, 'PRODUTO', 'Produto')) || null,
    estrategista_id: null, // resolvido depois
    estrategista_nome_raw: estrategistaNome,
    data_fechamento: dataAssinatura,
    vencimento,
    valor_parcela: valorParcela,
    num_parcelas: Math.max(numParcelas, 1),
    valor_total: valorTotal,
    status: mapStatus(statusRaw),
    status_secundario: statusRaw || null,
    notion_page_id: p.id,
    notion_numero: plain(getProp(props, 'Número', 'Numero')) || plain(getProp(props, 'ID')) || null,
    notion_ultima_edicao: p.last_edited_time ?? null,

    whatsapp: plain(getProp(props, 'WHATSAPP', 'Whatsapp', 'WhatsApp')) || null,
    email: plain(getProp(props, 'EMAIL', 'E-mail', 'Email')) || null,
    cpf_cnpj: plain(getProp(props, 'CPF/CPNJ', 'CPF/CNPJ', 'CNPJ', 'CPF')) || null,
    empresa: plain(getProp(props, 'EMPRESA', 'Empresa')) || null,
    endereco: plain(getProp(props, 'ENDEREÇO', 'Endereço', 'Endereco')) || null,
    instagram: plain(getProp(props, 'INSTAGRAM', 'Instagram')) || null,
    nicho: plain(getProp(props, 'Nicho', 'NICHO')) || null,
    posicionamento: plain(getProp(props, 'POSICIONAMENTO', 'Posicionamento')) || null,
    resumo: plain(getProp(props, 'RESUMO', 'Resumo')) || null,
    faturamento: plain(getProp(props, 'FATURAMENTO', 'Faturamento')) || null,
    fat_bruto: num(getProp(props, 'Fat. Bruto', 'Faturamento Bruto')),
    entrada: num(getProp(props, 'Entrada')),
    pg_entrada: plain(getProp(props, 'PG ENTRADA', 'Pg Entrada')) || null,
    forma_pagamento: plain(getProp(props, 'Forma de pagamento', 'Forma de Pagamento')) || null,
    link_clicksign: plain(getProp(props, 'LINK CLICKSIGN', 'Link Clicksign')) || null,
    plano_dias: intOf(getProp(props, 'PLANO (DIAS)', 'Plano (Dias)', 'Plano dias')),
    semanas: intOf(getProp(props, 'Semanas')),
    renovacao: plain(getProp(props, 'RENOVAÇÃO', 'Renovação', 'Renovacao')) || null,
    vendedor: plain(getProp(props, 'Vendedor', 'VENDEDOR')) || null,
    treinador: plain(getProp(props, 'Treinador(a)', 'Treinador')) || null,
    bonus: plain(getProp(props, 'BONUS', 'Bônus', 'Bonus')) || null,
    venda_interna: bool(getProp(props, 'Venda interna?', 'Venda Interna')),
    venda_diretoria: bool(getProp(props, 'Venda diretoria?', 'Venda Diretoria')),
    seguidores_inicio: num(getProp(props, '(INÍCIO) Nº DE SEGUIDORES', 'Seguidores Inicio')),
    seguidores_fim: num(getProp(props, '(FIM) Nº DE SEGUIDORES', 'Seguidores Fim')),
    crescimento_seguidores: num(getProp(props, 'Crescimento - Seguidores', 'Crescimento Seguidores')),
    videos_postados: intOf(getProp(props, 'Cliente postou quantos vídeos?', 'Videos postados')),
    entregas_no_prazo: intOf(getProp(props, 'Entregas no prazo')),
    entregas_totais: intOf(getProp(props, 'Entregas totais')),
    nps_vip: plain(getProp(props, 'NPS - VIP', 'NPS VIP')) || null,
    notion_raw: props,
    monthly,
  }
}

// Soma 1 mês a uma data ISO (YYYY-MM-DD), preservando dia 01.
function addMonth(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const auth = req.headers.get('authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } })
    const { data: u } = await userClient.auth.getUser()
    if (!u.user) return corsJson({ error: 'unauthorized' }, 401)
    const { data: profile } = await userClient.from('users').select('perfil').eq('id', u.user.id).single()
    if (!profile || !['admin', 'gerente'].includes(profile.perfil as string)) {
      return corsJson({ error: 'forbidden' }, 403)
    }

    const apiKey = Deno.env.get('NOTION_API_KEY')
    if (!apiKey) return corsJson({ error: 'missing_notion_api_key' }, 500)

    // Coleta IDs das databases
    const idsCsv = Deno.env.get('NOTION_DB_IDS')
    const dbIds = idsCsv
      ? idsCsv.split(',').map((s) => s.trim()).filter(Boolean)
      : [Deno.env.get('NOTION_DB_2025'), Deno.env.get('NOTION_DB_2026')].filter(Boolean) as string[]
    if (dbIds.length === 0) return corsJson({ error: 'missing_db_ids' }, 500)

    const url = new URL(req.url)
    const debug = url.searchParams.get('debug') === '1'
    const limit = Number(url.searchParams.get('limit') ?? '0') || 0
    const offset = Number(url.searchParams.get('offset') ?? '0') || 0

    const admin = createClient(supabaseUrl, serviceKey)

    // Carrega todas as páginas, deduplica por ID (caso a mesma DB esteja listada 2x)
    const seen = new Set<string>()
    const allPages: NotionPage[] = []
    for (const id of dbIds) {
      const pages = await notionQueryDatabase(apiKey, id)
      for (const p of pages) {
        if (!seen.has(p.id)) { seen.add(p.id); allPages.push(p) }
      }
    }
    const totalPages = allPages.length

    if (debug) {
      const sample = allPages[0]
      const allKeys = new Set<string>()
      for (const p of allPages) for (const k of Object.keys(p.properties)) allKeys.add(k)
      return corsJson({
        debug: true,
        total_pages: totalPages,
        all_property_names: Array.from(allKeys).sort(),
        sample_id: sample?.id ?? null,
        sample_props: sample?.properties ?? {},
      })
    }

    // Mapeamento estrategista_nome → user.id (inclui aliases do DB)
    const { data: usersData } = await admin.from('users').select('id, nome').in('perfil', ['estrategista', 'admin', 'gerente'])
    const usersByName = new Map<string, string>()
    for (const u of (usersData ?? [])) {
      const key = normalize((u as { id: string; nome: string }).nome)
      if (key) usersByName.set(key, (u as { id: string; nome: string }).id)
    }
    const { data: aliasData } = await admin.from('estrategista_aliases').select('alias_normalizado, user_id')
    for (const a of (aliasData ?? [])) {
      const r = a as { alias_normalizado: string; user_id: string }
      usersByName.set(r.alias_normalizado, r.user_id)
    }

    const reasons: Record<string, number> = {}
    const unmappedEstrategistas = new Set<string>()
    let contratosUpserted = 0
    let comissoesUpserted = 0
    const titleCache = new Map<string, string>()
    const userCache = new Map<string, string>()

    const sliced = limit > 0 ? allPages.slice(offset, offset + limit) : allPages
    const processedCount = sliced.length

    for (const p of sliced) {
      try {
        const row = await pageToRow(p, apiKey, titleCache, userCache)
        if (!row) { reasons['sem_cliente'] = (reasons['sem_cliente'] ?? 0) + 1; continue }

        // Para o nome do estrategista, lidar com "Nome A, Nome B" pegando o primeiro
        let estratId: string | null = null
        if (row.estrategista_nome_raw) {
          const candidates = row.estrategista_nome_raw.split(',').map((s) => s.trim()).filter(Boolean)
          for (const cand of candidates) {
            const id = usersByName.get(normalize(cand))
            if (id) { estratId = id; break }
          }
          if (!estratId) unmappedEstrategistas.add(row.estrategista_nome_raw)
        }

        // Percentual_aplicado é deduzido (mantemos por retrocompatibilidade): comissão = parcela × 100% (importação assume que Valor Parcela é a própria comissão? não — é o valor que o cliente paga; a empresa repassa um % disso ao estrategista. Sem info, deixamos 0 e o gestor edita depois).
        const pctAplicado = 0

        const upsertPayload = {
          cliente_nome: row.cliente_nome,
          produto_nome: row.produto_nome,
          estrategista_id: estratId,
          estrategista_nome_raw: row.estrategista_nome_raw || null,
          data_fechamento: row.data_fechamento ?? row.vencimento ?? new Date().toISOString().slice(0, 10),
          vencimento: row.vencimento,
          valor_total: row.valor_total,
          valor_parcela: row.valor_parcela,
          num_parcelas: row.num_parcelas,
          percentual_aplicado: pctAplicado,
          status: row.status,
          status_secundario: row.status_secundario,
          notion_page_id: row.notion_page_id,
          notion_numero: row.notion_numero,
          notion_ultima_edicao: row.notion_ultima_edicao,
          whatsapp: row.whatsapp,
          email: row.email,
          cpf_cnpj: row.cpf_cnpj,
          empresa: row.empresa,
          endereco: row.endereco,
          instagram: row.instagram,
          nicho: row.nicho,
          posicionamento: row.posicionamento,
          resumo: row.resumo,
          faturamento: row.faturamento,
          fat_bruto: row.fat_bruto,
          entrada: row.entrada,
          pg_entrada: row.pg_entrada,
          forma_pagamento: row.forma_pagamento,
          link_clicksign: row.link_clicksign,
          plano_dias: row.plano_dias,
          semanas: row.semanas,
          renovacao: row.renovacao,
          vendedor: row.vendedor,
          treinador: row.treinador,
          bonus: row.bonus,
          venda_interna: row.venda_interna,
          venda_diretoria: row.venda_diretoria,
          seguidores_inicio: row.seguidores_inicio,
          seguidores_fim: row.seguidores_fim,
          crescimento_seguidores: row.crescimento_seguidores,
          videos_postados: row.videos_postados,
          entregas_no_prazo: row.entregas_no_prazo,
          entregas_totais: row.entregas_totais,
          nps_vip: row.nps_vip,
          notion_raw: row.notion_raw,
          importado_em: new Date().toISOString(),
        }

        const { data: contratoUp, error: ec } = await admin
          .from('contratos')
          .upsert(upsertPayload, { onConflict: 'notion_page_id' })
          .select('id')
          .single()

        if (ec) {
          reasons[`contrato:${ec.code ?? 'err'}`] = (reasons[`contrato:${ec.code ?? 'err'}`] ?? 0) + 1
          continue
        }
        contratosUpserted++
        const contratoId = contratoUp!.id as string

        // Regenera comissões previstas: deleta e re-insere
        await admin.from('comissoes').delete().eq('contrato_id', contratoId).eq('status', 'prevista')

        if (!estratId) {
          reasons['comissao_sem_estrategista'] = (reasons['comissao_sem_estrategista'] ?? 0) + 1
          continue
        }

        // Caminho A: colunas mensais Janeiro..Dezembro (formato antigo)
        if (row.monthly.size > 0) {
          // Ano de referência: prioriza data_fechamento; senão vencimento; senão ano atual
          const refDate = row.data_fechamento ?? row.vencimento ?? new Date().toISOString().slice(0, 10)
          const ano = Number(refDate.slice(0, 4))
          const meses = Array.from(row.monthly.entries()).sort(([a], [b]) => a - b)
          for (let idx = 0; idx < meses.length; idx++) {
            const [mes, valor] = meses[idx]
            const mesRef = `${ano}-${String(mes).padStart(2, '0')}-01`
            const { error: ek } = await admin.from('comissoes').insert({
              contrato_id: contratoId,
              estrategista_id: estratId,
              cliente_nome: row.cliente_nome,
              parcela_num: idx + 1,
              total_parcelas: meses.length,
              mes_referencia: mesRef,
              valor_calculado: valor,
              valor_final: valor,
              status: 'prevista',
            })
            if (ek) {
              reasons[`comissao:${ek.code ?? 'err'}`] = (reasons[`comissao:${ek.code ?? 'err'}`] ?? 0) + 1
              continue
            }
            comissoesUpserted++
          }
          continue
        }

        // Caminho B: Valor Parcela + Vencimento (formato novo)
        if (row.valor_parcela === null) { reasons['comissao_sem_valor_parcela'] = (reasons['comissao_sem_valor_parcela'] ?? 0) + 1; continue }
        if (!row.vencimento) { reasons['comissao_sem_vencimento'] = (reasons['comissao_sem_vencimento'] ?? 0) + 1; continue }

        const venc = row.vencimento
        const primeiroMesISO = `${venc.slice(0, 7)}-01`
        for (let i = 0; i < row.num_parcelas; i++) {
          const mesRef = addMonth(primeiroMesISO, i)
          const { error: ek } = await admin.from('comissoes').insert({
            contrato_id: contratoId,
            estrategista_id: estratId,
            cliente_nome: row.cliente_nome,
            parcela_num: i + 1,
            total_parcelas: row.num_parcelas,
            mes_referencia: mesRef,
            valor_calculado: row.valor_parcela,
            valor_final: row.valor_parcela,
            status: 'prevista',
          })
          if (ek) {
            reasons[`comissao:${ek.code ?? 'err'}`] = (reasons[`comissao:${ek.code ?? 'err'}`] ?? 0) + 1
            continue
          }
          comissoesUpserted++
        }
      } catch (e) {
        const k = `exception:${(e as Error).message?.slice(0, 40) ?? 'err'}`
        reasons[k] = (reasons[k] ?? 0) + 1
      }
    }

    return corsJson({
      ok: true,
      total_pages: totalPages,
      processed: processedCount,
      offset,
      limit,
      contratos_upserted: contratosUpserted,
      comissoes_inserted: comissoesUpserted,
      unmapped_estrategistas: Array.from(unmappedEstrategistas),
      skip_reasons: reasons,
    })
  } catch (err) {
    return corsJson({ error: String(err) }, 500)
  }
})
