import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../migrations/20261105161228_get_contact_client_id_sem_acesso_anonimo.sql', import.meta.url), 'utf8')
const body = sql.replace(/--[^\n]*/g, '')

// Teste estrutural somente: não executa SQL nem demonstra RLS em runtime.
describe('helper contact/client sem acesso anônimo', () => {
  it('revoga apenas PUBLIC e anon da assinatura exata', () => {
    expect(body.trim().split(';').map(s => s.trim()).filter(Boolean)).toEqual([
      'BEGIN',
      'REVOKE EXECUTE ON FUNCTION public.get_contact_client_id(uuid)\n  FROM PUBLIC, anon',
      'COMMIT',
    ])
  })
  it('preserva grants explícitos de authenticated/service_role e owner', () => {
    expect(body).not.toMatch(/authenticated|service_role|postgres|\bGRANT\b|\bOWNER\b/i)
  })
  it('preserva corpo, policies, dados e todos os outros objetos', () => {
    expect(body).not.toMatch(/\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|POLICY)\b/i)
    expect(body.match(/public\.[a-z_]+/g)).toEqual(['public.get_contact_client_id'])
  })
})
