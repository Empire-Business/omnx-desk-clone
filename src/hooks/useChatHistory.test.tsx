import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMessages } from './useChat'

const state = vi.hoisted(() => ({ pages: [] as { data: Record<string, unknown>[] | null; error: Error | null }[], calls: [] as unknown[][] }))
vi.mock('@/hooks/useUsers', () => ({ useMyInstanceIds: () => ({ data: null }) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/integrations/supabase/client', () => ({ SUPABASE_URL: 'https://fixture.example.invalid' }))
vi.mock('@/lib/authTenant', () => ({ tenantDaSessao: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: (table: string) => {
    state.calls.push(['from', table])
    const query = {
      select: (value: string) => { state.calls.push(['select', value]); return query },
      eq: (column: string, value: string) => { state.calls.push(['eq', column, value]); return query },
      in: (column: string, value: string[]) => { state.calls.push(['in', column, value]); return query },
      order: () => query,
      range: async (start: number, end: number) => { state.calls.push(['range', start, end]); return state.pages.shift() ?? { data: [], error: null } },
    }
    return query
  },
} }))
function mount(ids?: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let result!: ReturnType<typeof useMessages>
  function Probe() { result = useMessages('a', ids); return null }
  renderToStaticMarkup(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)
  return { client, read: () => result.refetch({ throwOnError: true }) }
}
const message = (id: string, source = 'a') => ({ id, conversation_id: source, message_id_wpp: `provider-${id}`, criado_em: '2026-11-06T12:00:00Z', conteudo: id, reactions: null, reply_to_id: null })
beforeEach(() => { state.calls = []; state.pages = [] })

describe('histórico real agregado pelo hook', () => {
  it('restringe consulta aos IDs fornecidos, preserva origem/ID/data e hidrata resposta entre origens', async () => {
    state.pages = [{ data: [message('original'), { ...message('resposta', 'b'), reply_to_id: 'original' }], error: null }]
    const { client, read } = mount(['b', 'a', 'b'])
    const result = await read()
    expect(state.calls).toContainEqual(['in', 'conversation_id', ['a', 'b']])
    expect(result.data?.map(m => [m.id, m.conversation_id, m.message_id_wpp, m.criado_em])).toEqual([
      ['original', 'a', 'provider-original', '2026-11-06T12:00:00Z'], ['resposta', 'b', 'provider-resposta', '2026-11-06T12:00:00Z'],
    ])
    expect(result.data?.[1].replied_message?.id).toBe('original')
    client.clear()
  })
  it('busca a página seguinte em vez de cortar o histórico em500 mensagens', async () => {
    state.pages = [{ data: Array.from({ length: 500 }, (_, i) => message(String(i))), error: null }, { data: [message('ultima')], error: null }]
    const { client, read } = mount()
    expect((await read()).data).toHaveLength(501)
    expect(state.calls).toContainEqual(['eq', 'conversation_id', 'a'])
    expect(state.calls).toContainEqual(['range', 500, 999])
    client.clear()
  })
  it('falha em qualquer página não apresenta histórico parcial como completo', async () => {
    state.pages = [{ data: Array.from({ length: 500 }, (_, i) => message(String(i))), error: null }, { data: null, error: new Error('falha ao consultar origem') }]
    const { client, read } = mount(['b'])
    await expect(read()).rejects.toThrow('falha ao consultar origem')
    expect(client.getQueryData(['chat', 'messages', 'a', 'origens', ['a', 'b']])).toBeUndefined()
    client.clear()
  })
})
