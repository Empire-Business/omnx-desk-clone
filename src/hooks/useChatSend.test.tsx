import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSendMessage, useSendCsat, chatKeys, type ChatMessage } from './useChat'

const state = vi.hoisted(() => ({ actor: 'actor-a', tenant: 'tenant-a', sessionReads: 0, swapAtRead: 0, deleted: vi.fn(), inserted: vi.fn() }))
vi.mock('@/hooks/useUsers', () => ({ useMyInstanceIds: () => ({ data: null }) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: {
  id: 'actor-a', tenant_id: 'tenant-a', nome: 'Pessoa', email: 'fixture@example.invalid', perfil: 'admin', foto_url: null,
} }) }))
vi.mock('@/integrations/supabase/client', () => ({ SUPABASE_URL: 'https://fixture.example.invalid' }))
vi.mock('@/lib/authTenant', () => ({ tenantDaSessao: async () => state.tenant }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: {
    getSession: async () => {
      state.sessionReads++
      if (state.sessionReads === state.swapAtRead) state.actor = 'actor-b'
      return { data: { session: { user: { id: state.actor }, access_token: `fixture-${state.actor}`, expires_at: Date.now() / 1000 + 3600 } }, error: null }
    },
    refreshSession: vi.fn(),
  },
  from: (table: string) => ({
    insert: (row: unknown) => {
      state.inserted(table, row)
      return { select: () => ({ single: async () => ({ data: { id: 'new-csat', conversation_id: 'conversation', criado_em: '2026-11-05T12:00:00Z', nota: null, comentario: null, respondido_em: null }, error: null }) }) }
    },
    delete: () => ({ eq: async (column: string, id: string) => { state.deleted(table, column, id); return { error: null } } }),
  }),
} }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
function mount(csat = false) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  let send!: () => Promise<unknown>
  function Probe() {
    const message = useSendMessage()
    const rating = useSendCsat()
    send = () => csat ? rating.mutateAsync({ conversation_id: 'conversation', contact_id: 'contact' })
      : message.mutateAsync({ conversation_id: 'conversation', conteudo: 'Rascunho da conta A' })
    return null
  }
  renderToStaticMarkup(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)
  return { client, send }
}
beforeEach(() => { state.actor = 'actor-a'; state.tenant = 'tenant-a'; state.sessionReads = 0; state.swapAtRead = 0 })
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('envio e cache respeitam o ator que iniciou a ação', () => {
  it('troca durante cancelQueries impede mensagem otimista e envio com token B', async () => {
    const fetchFake = vi.fn()
    vi.stubGlobal('fetch', fetchFake)
    const { client, send } = mount()
    vi.spyOn(client, 'cancelQueries').mockImplementation(async () => { state.actor = 'actor-b' })
    await expect(send()).rejects.toThrow('sessão mudou')
    expect(fetchFake).not.toHaveBeenCalled()
    expect(client.getQueryData(chatKeys.messages('conversation'))).toBeUndefined()
    client.clear()
  })

  it.each([false, true])('falha tardia A não restaura snapshot nem toca cache B (cache B=%s)', async cacheB => {
    const response = deferred<Response>()
    const started = deferred<void>()
    vi.stubGlobal('fetch', vi.fn(() => { started.resolve(); return response.promise }))
    const { client, send } = mount()
    const key = chatKeys.messages('conversation')
    client.setQueryData(key, [{ id: 'private-a' }])
    const request = send().catch(error => error)
    await started.promise
    client.clear()
    state.actor = 'actor-b'
    if (cacheB) client.setQueryData(key, [{ id: 'private-b' }])
    response.resolve(Response.json({ ok: false, error: 'recusado' }, { status: 502 }))
    await request
    expect(client.getQueryData(key)).toEqual(cacheB ? [{ id: 'private-b' }] : undefined)
    client.clear()
  })

  it.each([3, 4])('troca durante obtenção do token/guarda final bloqueia fetch (leitura %s)', async read => {
    state.swapAtRead = read
    const fetchFake = vi.fn()
    vi.stubGlobal('fetch', fetchFake)
    const { client, send } = mount()
    await expect(send()).rejects.toThrow('sessão mudou')
    expect(fetchFake).not.toHaveBeenCalled()
    client.clear()
  })

  it('sucesso tardio de A não invalida os dados de B', async () => {
    const response = deferred<Response>()
    const started = deferred<void>()
    vi.stubGlobal('fetch', vi.fn(() => { started.resolve(); return response.promise }))
    const { client, send } = mount()
    const request = send()
    await started.promise
    client.clear()
    state.actor = 'actor-b'
    const key = chatKeys.messages('conversation')
    client.setQueryData(key, [{ id: 'private-b' }])
    response.resolve(Response.json({ ok: true, persisted: true }))
    await request
    expect(client.getQueryState(key)?.isInvalidated).toBe(false)
    expect(client.getQueryData(key)).toEqual([{ id: 'private-b' }])
    client.clear()
  })

  it('rollback remove só sua mensagem temporária e preserva mensagem nova recebida', async () => {
    const response = deferred<Response>()
    const started = deferred<void>()
    vi.stubGlobal('fetch', vi.fn(() => { started.resolve(); return response.promise }))
    const { client, send } = mount()
    const key = chatKeys.messages('conversation')
    const request = send().catch(error => error)
    await started.promise
    client.setQueryData(key, (current: ChatMessage[] = []) => [...current, { id: 'incoming' }])
    response.resolve(Response.json({ ok: false, error: 'recusado' }))
    await request
    expect(client.getQueryData(key)).toEqual([{ id: 'incoming' }])
    client.clear()
  })

  it('aceite com persisted=false retorna aviso como sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, persisted: false, warning: 'Confira o histórico' })))
    const { client, send } = mount()
    await expect(send()).resolves.toEqual({ ok: true, persisted: false, warning: 'Confira o histórico' })
    client.clear()
  })
})

describe('reserva CSAT sem falso sucesso ou reenvio automático', () => {
  it('recusa confirmada compensa somente o registro criado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Provedor recusou' }, { status: 502 })))
    const { client, send } = mount(true)
    await expect(send()).rejects.toThrow('Provedor recusou')
    expect(state.deleted).toHaveBeenCalledWith('chat_csat', 'id', 'new-csat')
    client.clear()
  })
  it('timeout incerto preserva reserva e não tenta reenviar', async () => {
    const fetchFake = vi.fn(async () => Response.json({ error: 'Não foi possível confirmar; confira histórico' }, { status: 504 }))
    vi.stubGlobal('fetch', fetchFake)
    const { client, send } = mount(true)
    await expect(send()).rejects.toThrow('confira histórico')
    expect(state.deleted).not.toHaveBeenCalled()
    expect(fetchFake).toHaveBeenCalledOnce()
    client.clear()
  })

  it('recusa recebida após trocar conta não compensa com credencial de outra pessoa', async () => {
    const response = deferred<Response>()
    const started = deferred<void>()
    vi.stubGlobal('fetch', vi.fn(() => { started.resolve(); return response.promise }))
    const { client, send } = mount(true)
    const request = send().catch(error => error)
    await started.promise
    state.actor = 'actor-b'
    response.resolve(Response.json({ error: 'Provedor recusou' }, { status: 502 }))
    await request
    expect(state.deleted).not.toHaveBeenCalled()
    client.clear()
  })
})
