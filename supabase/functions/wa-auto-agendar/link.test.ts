import { describe, expect, it } from 'vitest'
import { lerLigado as lerLigadoSite } from '../../../src/config/recursos'
import { escolherLinkReuniao, lerLigado, linkSalaInterna, salaDeVideoLigada, validarLink } from './link.ts'

const APP = 'https://desk.exemplo.com.br'
const base = { salvo: null, sala: 'meeting-abc-123', appUrl: APP }

describe('REUNIAO_VIDEO (mesma regra de VITE_REUNIAO_VIDEO)', () => {
  it('ausente ou vazio = ligado (produção sem configuração nova)', () => {
    expect(salaDeVideoLigada(() => undefined)).toBe(true)
    expect(salaDeVideoLigada(() => '  ')).toBe(true)
  })

  it.each(['0', 'false', 'off', 'nao', 'desligado', 'qualquer'])('%s = desligado', (v) => {
    expect(salaDeVideoLigada((n) => (n === 'REUNIAO_VIDEO' ? v : undefined))).toBe(false)
  })

  it.each(['1', 'true', 'ON', 'sim', 'ligado'])('%s = ligado', (v) => {
    expect(salaDeVideoLigada(() => v)).toBe(true)
  })

  it('igual ao lerLigado do site para os mesmos valores', () => {
    for (const v of [undefined, '', '1', 'true', 'on', 'sim', 'ligado', '0', 'off', 'x'])
      for (const padrao of [true, false]) expect(lerLigado(v, padrao)).toBe(lerLigadoSite(v, padrao))
  })
})

describe('escolherLinkReuniao', () => {
  it('ligado: sem link informado nem salvo, usa a sala interna (como hoje)', () => {
    expect(escolherLinkReuniao({ ...base, informado: undefined, videoLigado: true })).toEqual({
      link: `${APP}/meet/meeting-abc-123?role=guest`,
      origem: 'sala_interna',
    })
  })

  it('desligado: nunca manda a sala interna', () => {
    expect(escolherLinkReuniao({ ...base, informado: '', videoLigado: false })).toEqual({ link: null, origem: 'sala_interna' })
  })

  it('desligado: link informado ou salvo continua indo', () => {
    expect(escolherLinkReuniao({ ...base, informado: 'https://meet.google.com/abc-defg-hij', videoLigado: false }))
      .toEqual({ link: 'https://meet.google.com/abc-defg-hij', origem: 'informado' })
    expect(escolherLinkReuniao({ ...base, informado: null, salvo: 'https://zoom.us/j/1', videoLigado: false }))
      .toEqual({ link: 'https://zoom.us/j/1', origem: 'reuniao' })
  })

  it('link inválido continua recusado com a mensagem de antes', () => {
    expect(() => escolherLinkReuniao({ ...base, informado: 'http://x.com', videoLigado: true })).toThrow('https://')
    expect(() => validarLink('https://user:pw@x.com')).toThrow('usuário ou senha')
    expect(() => validarLink('https://10.0.0.1/a')).toThrow('IP')
  })

  it('sala com nome estranho não vira link', () => {
    expect(linkSalaInterna(APP, '../x')).toBeNull()
  })
})
