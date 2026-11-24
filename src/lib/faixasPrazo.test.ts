import { describe, expect, it } from 'vitest'
import { agruparPorFaixa, faixaDoPrazo } from './faixasPrazo'

const agora = new Date('2026-11-22T10:30:00')

describe('faixas de prazo', () => {
  it('classifica pelo dia, sem depender da hora', () => {
    expect(faixaDoPrazo('2026-11-21', agora)).toBe('vencida')
    expect(faixaDoPrazo('2026-11-22', agora)).toBe('hoje')
    expect(faixaDoPrazo('2026-11-23', agora)).toBe('em_breve')
    expect(faixaDoPrazo('2026-11-29', agora)).toBe('em_breve')
    expect(faixaDoPrazo('2026-11-30', agora)).toBe('no_prazo')
    expect(faixaDoPrazo(null, agora)).toBe('sem_prazo')
    expect(faixaDoPrazo('lixo', agora)).toBe('sem_prazo')
  })

  it('aceita prazo com hora e ordena do mais urgente', () => {
    const itens = [{ p: '2026-11-25' }, { p: '2026-11-10T12:00:00Z' }, { p: '2026-11-20' }, { p: null }, { p: '2026-11-24' }]
    const g = agruparPorFaixa(itens, (i) => i.p, agora)
    expect(g.vencida.map((i) => i.p)).toEqual(['2026-11-10T12:00:00Z', '2026-11-20'])
    expect(g.em_breve.map((i) => i.p)).toEqual(['2026-11-24', '2026-11-25'])
    expect(g.sem_prazo).toHaveLength(1)
    expect(g.hoje).toHaveLength(0)
  })
})
