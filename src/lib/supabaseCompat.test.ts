import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createSessionController, type SessionProfile } from './authSession'

describe('compatibilidade do SDK Supabase com a sessão da aplicação', () => {
  it('autentica, consulta perfil confiável e encerra sessão usando somente HTTP falso', async () => {
    const events: string[] = []
    const profile: SessionProfile = {
      id: 'user-a', nome: 'Pessoa fictícia', email: 'fixture@example.invalid', perfil: 'cliente',
      foto_url: null, ativo: true, tenant_id: 'tenant-a', acesso_contratos: false,
    }
    const user = { id: profile.id, email: profile.email, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z',
      user_metadata: { perfil: 'admin' }, app_metadata: {} }
    const fetchFake = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.pathname === '/auth/v1/token') return Response.json({
        access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token',
        token_type: 'bearer', expires_in: 3600, user,
      })
      if (url.pathname === '/rest/v1/users') return Response.json(profile)
      if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 })
      throw new Error(`Requisição inesperada no HTTP falso: ${url.pathname}`)
    })
    const sdk = createClient('https://fixture.example.invalid', 'fixture-public-key', {
      global: { fetch: fetchFake },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const clearCache = vi.fn()
    const published: Array<string | null> = []
    const session = createSessionController({
      clearCache,
      publish: state => { published.push(state.user?.perfil ?? null) },
      loadProfile: async id => {
        const { data, error } = await sdk.from('users').select('*').eq('id', id).single()
        if (error) throw error
        return data as SessionProfile
      },
    })
    const { data: { subscription } } = sdk.auth.onAuthStateChange((event, auth) => {
      events.push(event)
      void session.transition(auth?.user.id ?? null)
    })
    try {
      // Aguarda a emissão inicial antes de simular o clique no login.
      await sdk.auth.initialize()
      await new Promise(resolve => setTimeout(resolve, 0))
      const login = await sdk.auth.signInWithPassword({ email: profile.email, password: 'fixture-only' })
      expect(login.error).toBeNull()
      expect(await session.confirm(profile.id)).toMatchObject({ perfil: 'cliente' })
      expect(published).not.toContain('admin')
      expect(events).toContain('SIGNED_IN')
      const logout = await sdk.auth.signOut()
      expect(logout.error).toBeNull()
      expect(events).toContain('SIGNED_OUT')
      expect(published.at(-1)).toBeNull()
      expect(clearCache).toHaveBeenCalled()
      expect(fetchFake).toHaveBeenCalledTimes(3)
    } finally {
      session.dispose()
      subscription.unsubscribe()
      await sdk.auth.stopAutoRefresh()
    }
  })
})
