import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { autorizarCronContratos } from './cron-auth'
const requisicao = (secret?: string, method = 'POST') => new Request('https://example.invalid/contratos-alerts', { method, headers: secret ? { 'x-cron-secret': secret } : {} })
describe('guard do cron de contratos (sem rede)', () => {
  it('sem segredo não toca banco, mesmo com Authorization pública', async () => {
    const conferir = vi.fn()
    const req = new Request('https://example.invalid', { method: 'POST', headers: { authorization: 'Bearer public-test-key' } })
    expect(await autorizarCronContratos(req, conferir)).toEqual({ status: 401, code: 'unauthorized' })
    expect(conferir).not.toHaveBeenCalled()
  })
  it('GET não inicia rotina mesmo com segredo', async () => {
    const conferir = vi.fn()
    expect((await autorizarCronContratos(requisicao('mock', 'GET'), conferir))?.status).toBe(405)
    expect(conferir).not.toHaveBeenCalled()
  })
  it('recusa segredo inválido, sem fallback de JWT humano', async () => {
    expect((await autorizarCronContratos(requisicao('mock'), async () => false))?.status).toBe(401)
  })
  it('só confirmação estrita autoriza', async () => {
    expect(await autorizarCronContratos(requisicao('mock'), async () => true)).toBeNull()
  })
  it('falha de verificador fecha acesso sem expor erro/segredo', async () => {
    expect(await autorizarCronContratos(requisicao('mock'), async () => { throw Error('sensitive-detail') })).toEqual({ status: 503, code: 'cron_auth_unavailable' })
  })
  it('limita cabeçalho antes de chamar verificador', async () => {
    const conferir = vi.fn()
    expect((await autorizarCronContratos(requisicao('x'.repeat(1025)), conferir))?.status).toBe(401)
    expect(conferir).not.toHaveBeenCalled()
  })
  it('entrypoint autoriza antes da primeira leitura/escrita de negócio', () => {
    const s = readFileSync(new URL('./index.ts', import.meta.url), 'utf8').split(/Deno\.serve|servirComLicenca\(/)[1]
    expect(s.indexOf('if (negado) return')).toBeLessThan(s.indexOf('processarAlertasContratos(admin)'))
    expect(s).toContain("rpc('wa_auto_cron_secret_confere', { p_segredo: segredo })")
  })
})
