import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { createSessionController, type SessionProfile, type VerifiedSession } from './authSession'

const profile = (id: string, extra: Partial<SessionProfile> = {}): SessionProfile => ({
  id, nome: id, email: `${id}@example.invalid`, perfil: 'cliente', foto_url: null,
  ativo: true, tenant_id: 'tenant-a', ...extra,
})
const nextTurn = () => new Promise(resolve => setTimeout(resolve, 0))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
function setup(loadProfile = async (id: string): Promise<SessionProfile | null> => profile(id)) {
  const cache = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000 } } })
  const states: VerifiedSession[] = []
  const clearCache = vi.fn(() => cache.clear())
  const session = createSessionController({ loadProfile, clearCache, publish: s => states.push(s) })
  return { session, cache, states, clearCache }
}

describe('fronteira de sessão e cache privado', () => {
  it('espera o perfil verificado, sem presumir papel a partir do login', async () => {
    const { session, states } = setup()
    const request = session.transition('alice')
    expect(states.at(-1)).toEqual({ user: null, loading: true })
    expect(await request).toMatchObject({ id: 'alice', perfil: 'cliente' })
    expect(states.at(-1)?.loading).toBe(false)
  })

  it('não reutiliza carteira do administrador após sair e entrar em outra conta', async () => {
    const { session, cache } = setup()
    await session.transition('admin')
    cache.setQueryData(['clients', 'list'], ['cliente-privado'])
    await session.transition(null)
    expect(cache.getQueryData(['clients', 'list'])).toBeUndefined()
    await session.transition('alice')
    const load = vi.fn(async () => ['cliente-alice'])
    expect(await cache.fetchQuery({ queryKey: ['clients', 'list'], queryFn: load })).toEqual(['cliente-alice'])
    expect(load).toHaveBeenCalledOnce()
    cache.clear()
  })

  it('limpa cache imediatamente na troca direta de identidade', async () => {
    const { session, cache, states } = setup()
    await session.transition('admin')
    cache.setQueryData(['clients'], 'privado')
    const pending = session.transition('alice')
    expect(cache.getQueryData(['clients'])).toBeUndefined()
    expect(states.at(-1)).toEqual({ user: null, loading: true })
    await pending
  })

  it('consulta de dados iniciada na conta anterior não repovoa cache após a troca', async () => {
    const { session, cache } = setup()
    await session.transition('admin')
    const old = deferred<string[]>()
    const request = cache.fetchQuery({ queryKey: ['clients'], queryFn: () => old.promise }).catch(() => null)
    await session.transition('alice')
    old.resolve(['cliente-privado-admin'])
    await request
    expect(cache.getQueryData(['clients'])).toBeUndefined()
  })

  it('descarta perfil que termina após logout', async () => {
    const old = deferred<SessionProfile>()
    const { session, states } = setup(() => old.promise)
    const pending = session.transition('admin')
    await nextTurn()
    await session.transition(null)
    old.resolve(profile('admin', { perfil: 'admin' }))
    expect(await pending).toBeNull()
    expect(states.at(-1)).toEqual({ user: null, loading: false })
  })

  it('descarta resposta da conta anterior que termina depois do novo login', async () => {
    const old = deferred<SessionProfile>()
    const { session, states } = setup(id => id === 'admin' ? old.promise : Promise.resolve(profile(id)))
    const pending = session.transition('admin')
    await nextTurn()
    await session.transition('alice')
    old.resolve(profile('admin', { perfil: 'admin' }))
    await pending
    expect(states.at(-1)?.user?.id).toBe('alice')
  })

  it.each([null, profile('alice', { ativo: false }), profile('outra-conta'), profile('alice', { tenant_id: null })])('nega perfil inexistente, inativo ou incompatível: %j', async result => {
    const { session, states } = setup(async () => result)
    expect(await session.transition('alice')).toBeNull()
    expect(states.at(-1)).toEqual({ user: null, loading: false })
  })

  it('falha de leitura não concede acesso e limpa dados anteriores', async () => {
    let fail = false
    const { session, cache, states } = setup(async id => {
      if (fail) throw new Error('offline')
      return profile(id)
    })
    await session.transition('alice')
    cache.setQueryData(['privado'], 'segredo')
    fail = true
    await session.transition('alice')
    expect(cache.getQueryData(['privado'])).toBeUndefined()
    expect(states.at(-1)?.user).toBeNull()
  })

  it('preserva ativo nulo legado, mas revogação na mesma conta limpa o perfil', async () => {
    let current = profile('alice', { ativo: null })
    const { session, states } = setup(async () => current)
    expect(await session.transition('alice')).toMatchObject({ id: 'alice' })
    current = profile('alice', { ativo: false })
    expect(await session.transition('alice')).toBeNull()
    expect(states.at(-1)?.user).toBeNull()
  })

  it('refresh da mesma identidade mantém tela e cache, mas mudança de tenant/perfil limpa', async () => {
    let current = profile('alice')
    const { session, cache, states } = setup(async () => current)
    await session.transition('alice')
    cache.setQueryData(['privado'], 'segredo')
    const refresh = session.transition('alice')
    expect(states.at(-1)?.loading).toBe(false)
    await refresh
    expect(cache.getQueryData(['privado'])).toBe('segredo')
    current = profile('alice', { tenant_id: 'tenant-b' })
    await session.transition('alice')
    expect(cache.getQueryData(['privado'])).toBeUndefined()
    cache.setQueryData(['permissoes'], 'antigas')
    current = profile('alice', { tenant_id: 'tenant-b', perfil: 'admin' })
    await session.transition('alice')
    expect(cache.getQueryData(['permissoes'])).toBeUndefined()
  })

  it('não publica após desmontar e reutiliza confirmação em andamento no login', async () => {
    const old = deferred<SessionProfile>()
    const { session, states } = setup(() => old.promise)
    const pending = session.transition('alice')
    expect(session.confirm('alice')).toBe(pending)
    await nextTurn()
    session.dispose()
    old.resolve(profile('alice'))
    expect(await pending).toBeNull()
    expect(states).toHaveLength(1)
  })
})
