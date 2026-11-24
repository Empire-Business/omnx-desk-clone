import { afterEach, describe, expect, it, vi } from 'vitest'

const workbox = vi.hoisted(() => ({ route: vi.fn(), precache: vi.fn(), plugins: vi.fn() }))
vi.mock('workbox-precaching', () => ({ precacheAndRoute: workbox.precache, cleanupOutdatedCaches: vi.fn(), addPlugins: workbox.plugins }))
vi.mock('workbox-routing', () => ({ registerRoute: workbox.route }))
vi.mock('workbox-strategies', () => ({ CacheFirst: class { constructor(_options: unknown) {} } }))
vi.mock('workbox-expiration', () => ({ ExpirationPlugin: class { constructor(_options: unknown) {} } }))

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.resetModules() })

describe('service worker sem persistência de dados privados', () => {
  async function install() {
    const listeners = new Map<string, (event: { waitUntil: (promise: Promise<unknown>) => void }) => void>()
    const claim = vi.fn(async () => {})
    const remove = vi.fn(async (_name: string) => true)
    const manifest = [{ url: '/assets/app.js', revision: '1' }]
    vi.stubGlobal('self', {
      location: { origin: 'https://desk.example' }, clients: { claim }, __WB_MANIFEST: manifest,
      addEventListener: (name: string, listener: typeof listeners extends Map<string, infer V> ? V : never) => listeners.set(name, listener),
    })
    vi.stubGlobal('caches', { delete: remove })
    await import('./sw')
    return { listeners, claim, remove, manifest }
  }

  it('remove caches legados antes de controlar clientes e preserva precache', async () => {
    const { listeners, claim, remove, manifest } = await install()
    let finished!: Promise<unknown>
    listeners.get('activate')!({ waitUntil: promise => { finished = promise } })
    await finished
    expect(remove.mock.calls.map(([name]) => name)).toEqual(['supabase-api-cache', 'images-cache'])
    expect(claim).toHaveBeenCalledOnce()
    expect(workbox.precache).toHaveBeenCalledWith(manifest)
    expect(workbox.plugins).toHaveBeenCalledOnce()
  })

  it('cacheia somente imagens estáticas próprias, sem interceptar API ou Storage privado', async () => {
    await install()
    expect(workbox.route).toHaveBeenCalledTimes(1)
    const matcher = workbox.route.mock.calls[0][0] as (context: { request: { destination: string }; url: URL }) => boolean
    const matches = (url: string, destination = 'image') => matcher({ request: { destination }, url: new URL(url) })
    expect(matches('https://desk.example/icons/logo.png')).toBe(true)
    expect(matches('https://desk.example/assets/logo.png')).toBe(true)
    expect(matches('https://project.supabase.co/rest/v1/clients', '')).toBe(false)
    expect(matches('https://project.supabase.co/storage/v1/object/sign/private/photo.png')).toBe(false)
    expect(matches('https://other.example/icons/private.png')).toBe(false)
    expect(matches('https://desk.example/uploads/private.png')).toBe(false)
  })
})
