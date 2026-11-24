import { describe, expect, it } from 'vitest'
import { SECOES_MANUAL } from '../lib/manualPlataforma'
import { TUTORIAIS, linkVimeo, tutoriaisDaSecao } from './tutoriais'

describe('tutoriais em vídeo', () => {
  it('são 7, numerados de 01 a 07, cada um com versão horizontal e vertical do Vimeo', () => {
    expect(TUTORIAIS.map((t) => t.numero)).toEqual(['01', '02', '03', '04', '05', '06', '07'])
    for (const t of TUTORIAIS) {
      for (const v of [t.horizontal, t.vertical]) {
        expect(v.id).toMatch(/^\d{6,12}$/)
        expect(v.hash).toMatch(/^[0-9a-f]{6,20}$/)
      }
      expect(t.horizontal.id).not.toBe(t.vertical.id)
    }
  })

  it('cada vídeo aponta para um assunto que existe no manual', () => {
    const ids = new Set(SECOES_MANUAL.map((s) => s.id))
    for (const t of TUTORIAIS) expect(ids.has(t.secao), t.secao).toBe(true)
  })

  it('Tickets reúne a fila e o resolver/reabrir; link não listado leva o hash', () => {
    expect(tutoriaisDaSecao('atendimento').map((t) => t.numero)).toEqual(['03', '04'])
    expect(linkVimeo({ id: '123456', hash: 'abc123' })).toBe('https://vimeo.com/123456/abc123')
  })
})
