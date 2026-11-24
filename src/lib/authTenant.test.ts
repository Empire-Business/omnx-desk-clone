import { afterEach, describe, expect, it, vi } from 'vitest'
import { tenantDaSessao } from './authTenant'

const estado = vi.hoisted(() => ({ userId: 'u1' as string | null, sessionId: 'u1', ativo: true as boolean | null,
  tenant: 'tenant-a' as string | null, profileError: false, userError: false }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: {
    getUser: async () => ({ data: { user: estado.userId ? { id: estado.userId } : null }, error: estado.userError ? new Error('falha') : null }),
    getSession: async () => ({ data: { session: { user: { id: estado.sessionId } } }, error: null }),
  },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({
    data: { id: 'u1', tenant_id: estado.tenant, ativo: estado.ativo }, error: estado.profileError ? new Error('falha') : null,
  }) }) }) }),
} }))
afterEach(() => Object.assign(estado, { userId: 'u1', sessionId: 'u1', ativo: true, tenant: 'tenant-a', profileError: false, userError: false }))

describe('tenant confirmado antes de inserir', () => {
  it.each([true, null])('usa empresa do perfil ativo ou legado (%s)', async ativo => {
    estado.ativo = ativo
    await expect(tenantDaSessao()).resolves.toBe('tenant-a')
  })
  it.each(['sem sessão', 'inativo', 'sem tenant', 'perfil indisponível', 'auth indisponível', 'sessão mudou'])('nega %s', async caso => {
    if (caso === 'sem sessão') estado.userId = null
    if (caso === 'inativo') estado.ativo = false
    if (caso === 'sem tenant') estado.tenant = null
    if (caso === 'perfil indisponível') estado.profileError = true
    if (caso === 'auth indisponível') estado.userError = true
    if (caso === 'sessão mudou') estado.sessionId = 'u2'
    await expect(tenantDaSessao()).rejects.toThrow()
  })
})
