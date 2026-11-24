import { afterEach, describe, expect, it, vi } from 'vitest'
import { resumoSaudeOptions, ultimosErrosOptions } from './useSaude'

const fake = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), gte: vi.fn(), order: vi.fn(), limit: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({ supabase: fake }))
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })

function database() {
  for (const method of ['from', 'select', 'eq', 'gte', 'order'] as const) fake[method].mockReturnValue(fake)
  fake.limit.mockResolvedValue({ data: [], error: null })
}

describe('saúde usa a janela selecionada nas duas consultas', () => {
  it.each([24, 168, 720])('envia %s horas ao resumo e filtra a lista com o mesmo período', async horas => {
    database()
    vi.useFakeTimers().setSystemTime(new Date('2026-11-05T12:00:00Z'))
    fake.rpc.mockResolvedValue({ data: [], error: null })
    await resumoSaudeOptions(horas).queryFn()
    await ultimosErrosOptions(horas).queryFn()
    expect(fake.rpc).toHaveBeenCalledWith('resumo_saude_apps', { p_horas: horas })
    expect(fake.gte).toHaveBeenCalledWith('created_at', new Date(Date.now() - horas * 3_600_000).toISOString())
    expect(fake.eq).toHaveBeenCalledWith('nivel', 'erro')
    expect(fake.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(fake.limit).toHaveBeenCalledWith(30)
  })

  it('não reutiliza uma lista de outra janela no cache', () => {
    expect(ultimosErrosOptions(24).queryKey).not.toEqual(ultimosErrosOptions(168).queryKey)
  })

  it('propaga falhas de leitura em vez de apresentá-las como zero incidentes', async () => {
    database()
    const error = { code: '42501', message: 'permission denied' }
    fake.rpc.mockResolvedValue({ data: null, error })
    fake.limit.mockResolvedValue({ data: null, error })
    await expect(resumoSaudeOptions(24).queryFn()).rejects.toEqual(error)
    await expect(ultimosErrosOptions(24).queryFn()).rejects.toEqual(error)
  })
})
