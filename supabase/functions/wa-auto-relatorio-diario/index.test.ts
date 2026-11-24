import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ handler: null as ((req: Request) => Promise<Response>) | null, client: null as unknown,
  rpc: vi.fn(), from: vi.fn(), manual: vi.fn(), config: [] as { tenant_id: string; relatorio_hora: string }[] }))
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => state.client }))
vi.mock('./manual.ts', async original => ({ ...await original<object>(), executarManual: (...args: unknown[]) => state.manual(...args) }))
beforeAll(async () => {
  // HTAI_* ausentes = produção (licença off); o resto com valor de teste.
  vi.stubGlobal('Deno', { env: { get: (n: string) => (n.startsWith('HTAI_') ? undefined : 'test-only-value') }, serve: (handler: (req: Request) => Promise<Response>) => { state.handler = handler } })
  await import('./index.ts')
})
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T11:00:00Z'))
  state.rpc.mockReset().mockResolvedValue({ data: true, error: null })
  state.manual.mockReset().mockResolvedValue(Response.json({ mode: 'manual' }))
  state.config = []
  state.from.mockReset().mockImplementation((table: string) => {
    const q = { select: () => q, eq: () => q, limit: async () => ({ data: state.config, error: null }),
      maybeSingle: async () => ({ data: table === 'app_modules' ? { enabled: false } : null, error: null }) }
    return q
  })
  state.client = { rpc: state.rpc, from: state.from }
})
afterEach(() => { vi.useRealTimers() })
const request = (headers: Record<string,string> = {}, method = 'POST') => new Request('https://fixture.invalid', { method, headers })
describe('entrypoint diário preserva cron e isola chamada manual', () => {
  it('OPTIONS permite invoke autenticado sem executar nenhum caminho', async () => {
    const r = await state.handler!(request({}, 'OPTIONS'))
    expect(r.headers.get('access-control-allow-headers')).toContain('x-relatorio-instancia')
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.manual).not.toHaveBeenCalled(); expect(state.from).not.toHaveBeenCalled()
  })
  it('ausência de cron secret despacha exclusivamente para manual', async () => {
    const r = await state.handler!(request({ authorization: 'Bearer user-test' }))
    expect(await r.json()).toEqual({ mode: 'manual' }); expect(state.manual).toHaveBeenCalledTimes(1)
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.from).not.toHaveBeenCalled()
  })
  it.each(['', 'short', 'a'.repeat(32)])('cron inválido nunca usa fallback JWT (%s)', async secret => {
    state.rpc.mockResolvedValue({ data: false, error: null })
    const r = await state.handler!(request({ 'x-cron-secret': secret, authorization: 'Bearer user-test' }))
    expect(r.status).toBe(401); expect(state.manual).not.toHaveBeenCalled(); expect(state.from).not.toHaveBeenCalled()
  })
  it('cron válido mantém descoberta e janela diária, sem body manual', async () => {
    state.config = [{ tenant_id: 'tenant-due', relatorio_hora: '08:00:00' }, { tenant_id: 'tenant-later', relatorio_hora: '10:00:00' }]
    const r = await state.handler!(request({ 'x-cron-secret': 'a'.repeat(32) }))
    expect(await r.json()).toMatchObject({ ok: true, empresas_ligadas: 2, empresas_na_hora: 1, resultados: { app_desligado: 1 } })
    expect(state.from.mock.calls.map(([table]) => table)).toEqual(['wa_auto_config', 'app_modules'])
    expect(state.manual).not.toHaveBeenCalled()
  })
})
