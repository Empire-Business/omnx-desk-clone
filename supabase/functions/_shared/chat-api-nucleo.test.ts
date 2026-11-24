import { describe, expect, it } from 'vitest'
import {
  auditar, conversaDoTenant, consumirLimite, listarContatos, listarConversas, listarInstancias, obterConversa, verificarChave,
} from './chat-api-nucleo.ts'
import { hashChave } from './chat-api-v2-regras.ts'

const T1 = '00000000-0000-0000-0000-000000000001'
const CONV = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f'
const CONTATO_INTERNO = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a'

interface Chamada { tabela: string; filtros: Array<[string, unknown, unknown?]> }
/** Cliente falso: grava os filtros de cada consulta e devolve linhas por tabela. */
function fake(linhas: Record<string, unknown>, rpc?: { data?: unknown; error?: { code: string } }) {
  const chamadas: Chamada[] = []
  const inserts: Array<{ tabela: string; row: unknown }> = []
  const db = {
    from(tabela: string) {
      const c: Chamada = { tabela, filtros: [] }
      chamadas.push(c)
      const q: Record<string, unknown> = {}
      const chain = (nome: string) => (...a: unknown[]) => { c.filtros.push([nome, a[0], a[1]]); return q }
      for (const m of ['select', 'eq', 'neq', 'in', 'not', 'or', 'order', 'range', 'limit']) q[m] = chain(m)
      const valor = () => linhas[tabela] ?? []
      q.maybeSingle = () => Promise.resolve({ data: Array.isArray(valor()) ? (valor() as unknown[])[0] ?? null : valor(), error: null })
      q.insert = (row: unknown) => { inserts.push({ tabela, row }); return Promise.resolve({ error: null }) }
      q.update = chain('update')
      q.then = (res: (v: unknown) => unknown) => res({ data: valor(), count: 1, error: null })
      return q
    },
    rpc: () => Promise.resolve(rpc ?? { data: { permitido: true, restante: 5, reset_seg: 10 }, error: null }),
  }
  return { db: db as never, chamadas, inserts }
}
const tenantFiltrado = (c: Chamada) => c.filtros.some(([n, col, v]) => n === 'eq' && col === 'tenant_id' && v === T1)

describe('isolamento por empresa (todo handler filtra tenant_id)', () => {
  it('listar conversas, contatos e instâncias', async () => {
    const f = fake({ chat_conversations: [], chat_contacts: [] })
    await listarConversas(f.db, T1, {})
    await listarContatos(f.db, T1, { search: 'ana' })
    await listarInstancias(f.db, T1)
    expect(f.chamadas.length).toBeGreaterThan(3)
    for (const c of f.chamadas) expect(tenantFiltrado(c), c.tabela).toBe(true)
  })
  it('obter conversa filtra conversa e mensagens por empresa', async () => {
    const f = fake({ chat_conversations: { id: CONV, contact_id: null, instance_id: null }, chat_messages: [] })
    const r = await obterConversa(f.db, T1, CONV)
    expect(r.ok).toBe(true)
    for (const c of f.chamadas) expect(tenantFiltrado(c), c.tabela).toBe(true)
  })
  it('mensagens excluem notas internas', async () => {
    const f = fake({ chat_conversations: { id: CONV, contact_id: null, instance_id: null }, chat_messages: [] })
    await obterConversa(f.db, T1, CONV)
    const msgs = f.chamadas.find((c) => c.tabela === 'chat_messages')!
    expect(msgs.filtros).toContainEqual(['or', 'tipo.is.null,tipo.neq.nota_interna', undefined])
  })
  it('id que não é UUID nunca consulta o banco', async () => {
    const f = fake({})
    expect(await conversaDoTenant(f.db, T1, "x' or 1=1")).toBeNull()
    expect(f.chamadas).toHaveLength(0)
  })
  it('filtros malformados viram 400, não consulta', async () => {
    const f = fake({})
    const r = await listarConversas(f.db, T1, { instance_id: 'abc' })
    expect(r).toMatchObject({ ok: false, status: 400 })
  })
})

describe('grupos restritos ficam ocultos', () => {
  it('conversa de contato interno some (404)', async () => {
    const f = fake({
      chat_conversations: { id: CONV, contact_id: CONTATO_INTERNO, instance_id: null },
      chat_contacts: [{ id: CONTATO_INTERNO }],
      chat_grupos_restritos: [],
    })
    expect(await obterConversa(f.db, T1, CONV)).toMatchObject({ ok: false, status: 404 })
  })
  it('lista aplica .not(contact_id in restritos)', async () => {
    const f = fake({ chat_contacts: [{ id: CONTATO_INTERNO }], chat_grupos_restritos: [], chat_conversations: [] })
    await listarConversas(f.db, T1, {})
    const conv = f.chamadas.find((c) => c.tabela === 'chat_conversations')!
    expect(conv.filtros).toContainEqual(['not', 'contact_id', `in`])
  })
})

describe('chave, limite e auditoria', () => {
  it('chave ativa devolve tenant e hash é o consultado', async () => {
    const f = fake({ api_keys: { id: 'k', permissoes: ['*'], ativo: true, expira_em: null, tenant_id: T1 } })
    const r = await verificarChave(f.db, `edk_${'b2'.repeat(32)}`)
    expect(r).toMatchObject({ valid: true, tenantId: T1 })
    const consulta = f.chamadas[0].filtros.find(([n, col]) => n === 'eq' && col === 'key_hash')
    expect(consulta?.[2]).toBe(await hashChave(`edk_${'b2'.repeat(32)}`))
  })
  it('chave expirada ou inexistente é recusada', async () => {
    expect(await verificarChave(fake({}).db, 'x')).toEqual({ valid: false })
    const f = fake({ api_keys: { id: 'k', permissoes: [], ativo: true, expira_em: '2020-01-01T00:00:00Z', tenant_id: T1 } })
    expect(await verificarChave(f.db, 'x')).toEqual({ valid: false })
  })
  it('limite: negado, função ausente libera, outro erro nega', async () => {
    expect((await consumirLimite(fake({}, { data: { permitido: false, restante: 0, reset_seg: 7 } }).db, 'k', '5')).permitido).toBe(false)
    expect((await consumirLimite(fake({}, { error: { code: '42883' } }).db, 'k', '5')).permitido).toBe(true)
    expect((await consumirLimite(fake({}, { error: { code: 'XX000' } }).db, 'k', '5')).permitido).toBe(false)
  })
  it('auditoria grava só metadados (sem corpo)', async () => {
    const f = fake({})
    await auditar(f.db, { tenantId: T1, keyId: 'k', canal: 'rest', metodo: 'GET', rota: 'GET /instances', status: 200, inicio: Date.now() })
    const row = f.inserts[0].row as Record<string, unknown>
    expect(Object.keys(row).sort()).toEqual(['canal', 'duracao_ms', 'key_id', 'metodo', 'rota', 'status', 'tenant_id'])
  })
})
