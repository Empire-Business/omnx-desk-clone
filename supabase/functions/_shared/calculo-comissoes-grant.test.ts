import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../migrations/20261105140344_calculo_comissoes_somente_trigger_service.sql', import.meta.url), 'utf8')
// Contrato estático: não executa SQL e não comprova funcionamento do trigger no banco.
describe('recálculo interno — fechamento de RPC direta', () => {
  it('revoga exatamente os papéis de acesso público à assinatura conhecida', () => {
    const statements = sql.replace(/--[^\n]*/g, '').trim().split(';').map(s => s.trim()).filter(Boolean)
    expect(statements).toEqual([
      'BEGIN',
      'REVOKE EXECUTE ON FUNCTION public.calcular_comissoes_contrato(uuid)\n  FROM PUBLIC, anon, authenticated',
      'COMMIT',
    ])
  })
  it('não modifica corpo, owner, service_role, dados nem triggers', () => {
    const body = sql.replace(/--[^\n]*/g, '')
    expect(body).not.toMatch(/service_role|postgres|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRIGGER|GRANT/i)
  })
})
