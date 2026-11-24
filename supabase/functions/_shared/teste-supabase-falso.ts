// SÓ PARA TESTES (Vitest): um "Supabase" em memória com o mínimo do query builder
// que as funções do assistente usam (select/eq/in/gte/ilike/or/order/limit/
// maybeSingle/insert/upsert/update e rpc). Registra todas as consultas para os testes
// conferirem, por exemplo, que TODA leitura filtrou tenant_id.
type Linha = Record<string, unknown>
type Filtro = (l: Linha) => boolean

export interface Consulta { tabela: string; filtros: string[]; operacao: 'select' | 'insert' | 'update' }

export interface Falso {
  // deno-lint-ignore no-explicit-any
  client: any
  consultas: Consulta[]
  inseridos: { tabela: string; linhas: Linha[] }[]
  atualizados: { tabela: string; campos: Linha }[]
}

function comparar(a: unknown, b: unknown): number {
  const x = typeof a === 'string' ? a : String(a ?? '')
  const y = typeof b === 'string' ? b : String(b ?? '')
  return x < y ? -1 : x > y ? 1 : 0
}

function ilike(valor: unknown, padrao: string): boolean {
  const re = new RegExp(`^${padrao.split('%').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i')
  return re.test(String(valor ?? ''))
}

/** "client_id.eq.X,contact_id.in.(a,b)" → filtro OU. */
function filtroOr(expr: string): Filtro {
  const partes: Filtro[] = []
  const re = /([a-z_]+)\.(eq|in)\.(\([^)]*\)|[^,]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(expr))) {
    const [, col, op, val] = m
    if (op === 'eq') partes.push((l) => String(l[col]) === val)
    else {
      const lista = val.slice(1, -1).split(',')
      partes.push((l) => lista.includes(String(l[col])))
    }
  }
  return (l) => partes.some((f) => f(l))
}

export function criarSupabaseFalso(
  tabelas: Record<string, Linha[]>,
  rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {},
): Falso {
  const consultas: Consulta[] = []
  const inseridos: Falso['inseridos'] = []
  const atualizados: Falso['atualizados'] = []

  function builder(tabela: string) {
    const filtros: Filtro[] = []
    const nomes: string[] = []
    let ordem: { col: string; asc: boolean } | null = null
    let limite = Infinity
    let operacao: Consulta['operacao'] = 'select'
    let payload: Linha | Linha[] | null = null
    let head = false
    let contar = false
    let unico: 'maybe' | 'single' | null = null
    let conflito: { onConflict?: string; ignoreDuplicates?: boolean } | null = null
    const add = (nome: string, f: Filtro) => { nomes.push(nome); filtros.push(f); return b }

    const executar = () => {
      consultas.push({ tabela, filtros: nomes, operacao })
      const base = tabelas[tabela] ?? []
      if (operacao === 'insert') {
        let linhas = Array.isArray(payload) ? payload : [payload as Linha]
        // upsert: linha com a mesma chave já existe → ignora (ignoreDuplicates) ou mescla.
        const chave = conflito?.onConflict
        if (chave) {
          const novas: Linha[] = []
          for (const l of linhas) {
            const ja = base.find((x) => x[chave] === l[chave])
            if (!ja) novas.push(l)
            else if (!conflito?.ignoreDuplicates) Object.assign(ja, l)
          }
          linhas = novas
        }
        inseridos.push({ tabela, linhas })
        const comId = linhas.map((l, i) => ({ id: `novo-${inseridos.length}-${i}`, ...l }))
        base.push(...comId)
        tabelas[tabela] = base
        return { data: unico ? comId[0] : comId, error: null }
      }
      let linhas = base.filter((l) => filtros.every((f) => f(l)))
      if (operacao === 'update') {
        atualizados.push({ tabela, campos: payload as Linha })
        for (const l of linhas) Object.assign(l, payload)
        return { data: null, error: null }
      }
      if (ordem) {
        const o = ordem
        linhas = [...linhas].sort((a, z) => comparar(a[o.col], z[o.col]) * (o.asc ? 1 : -1))
      }
      const total = linhas.length
      linhas = linhas.slice(0, limite)
      if (head) return { data: null, count: total, error: null }
      if (unico) return { data: linhas[0] ?? null, error: unico === 'single' && !linhas[0] ? { code: 'PGRST116' } : null }
      return { data: linhas, error: null, ...(contar ? { count: total } : {}) }
    }

    const b = {
      select(_c?: string, opts?: { head?: boolean; count?: 'exact' }) { if (opts?.head) head = true; if (opts?.count === 'exact') contar = true; return b },
      insert(p: Linha | Linha[]) { operacao = 'insert'; payload = p; return b },
      upsert(p: Linha | Linha[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) {
        operacao = 'insert'; payload = p; conflito = o ?? { onConflict: 'id' }; return b
      },
      update(p: Linha) { operacao = 'update'; payload = p; return b },
      eq: (c: string, v: unknown) => add(`eq:${c}`, (l) => l[c] === v),
      neq: (c: string, v: unknown) => add(`neq:${c}`, (l) => l[c] !== v),
      is: (c: string, v: unknown) => add(`is:${c}`, (l) => (l[c] ?? null) === v),
      in: (c: string, v: unknown[]) => add(`in:${c}`, (l) => v.includes(l[c])),
      gte: (c: string, v: unknown) => add(`gte:${c}`, (l) => comparar(l[c], v) >= 0),
      gt: (c: string, v: unknown) => add(`gt:${c}`, (l) => comparar(l[c], v) > 0),
      lte: (c: string, v: unknown) => add(`lte:${c}`, (l) => comparar(l[c], v) <= 0),
      lt: (c: string, v: unknown) => add(`lt:${c}`, (l) => comparar(l[c], v) < 0),
      ilike: (c: string, v: string) => add(`ilike:${c}`, (l) => ilike(l[c], v)),
      like: (c: string, v: string) => add(`like:${c}`, (l) => ilike(l[c], v)),
      not: (c: string, _op: string, v: unknown) => add(`not:${c}`, (l) => (l[c] ?? null) !== v),
      or: (expr: string) => add(`or:${expr}`, filtroOr(expr)),
      order(c: string, o?: { ascending?: boolean }) { ordem = { col: c, asc: o?.ascending !== false }; return b },
      limit(n: number) { limite = n; return b },
      maybeSingle() { unico = 'maybe'; return Promise.resolve(executar()) },
      single() { unico = 'single'; return Promise.resolve(executar()) },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(executar()).then(res, rej) },
    }
    return b
  }

  const client = {
    from: (t: string) => builder(t),
    rpc: (nome: string, args: Record<string, unknown>) => {
      const f = rpcs[nome]
      let resultado: { data: unknown; error: { code: string } | null }
      if (!f) resultado = { data: null, error: { code: 'PGRST202' } }
      else {
        try { resultado = { data: f(args), error: null } } catch { resultado = { data: null, error: { code: 'XX' } } }
      }
      const promessa = Promise.resolve(resultado)
      return Object.assign(promessa, {
        select(colunas: string) {
          if (colunas.trim() === '*') return promessa
          const campos = colunas.split(',').map((c) => c.trim())
          const projetar = (linha: unknown) => Object.fromEntries(campos.map((c) => [c, (linha as Linha)[c]]))
          return promessa.then((r) => ({ ...r, data: Array.isArray(r.data) ? r.data.map(projetar) : r.data }))
        },
      })
    },
  }
  return { client, consultas, inseridos, atualizados }
}

/** Fixtures explícitas para a view; não simula RLS nem banco real. Preserva mutações dos cenários. */
export function comClientesAtendidos(tabelas: Record<string, Linha[]>): Record<string, Linha[]> {
  for (const [i, c] of (tabelas.contratos ?? []).entries()) if (!c.id) c.id = `contrato-fixture-${i}`
  if (!('contrato_clientes_atendidos' in tabelas)) {
    let explicitas: Linha[] | undefined
    Object.defineProperty(tabelas, 'contrato_clientes_atendidos', { enumerable: true, configurable: true,
      get: () => explicitas ?? (tabelas.contratos ?? []).filter(c => c.cliente_id)
        .map(c => ({ tenant_id: c.tenant_id, contrato_id: c.id, cliente_id: c.cliente_id, principal: true })),
      set: (rows: Linha[]) => { explicitas = rows },
    })
  }
  return tabelas
}
