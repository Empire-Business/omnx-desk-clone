import { describe, it, expect } from 'vitest'
import { ehRecorrentePorParcelas, MIN_PARCELAS_RECORRENTE } from './recorrencia'

describe('ehRecorrentePorParcelas', () => {
  it('considera recorrente a partir de 6 parcelas', () => {
    expect(MIN_PARCELAS_RECORRENTE).toBe(6)
    expect(ehRecorrentePorParcelas(6)).toBe(true)
    expect(ehRecorrentePorParcelas(7)).toBe(true)
    expect(ehRecorrentePorParcelas(12)).toBe(true)
  })

  it('NÃO considera recorrente abaixo de 6 parcelas', () => {
    expect(ehRecorrentePorParcelas(5)).toBe(false)
    expect(ehRecorrentePorParcelas(2)).toBe(false)
    expect(ehRecorrentePorParcelas(1)).toBe(false)
    expect(ehRecorrentePorParcelas(0)).toBe(false)
  })

  it('trata null/undefined como 1 parcela (não recorrente)', () => {
    expect(ehRecorrentePorParcelas(null)).toBe(false)
    expect(ehRecorrentePorParcelas(undefined)).toBe(false)
  })
})
