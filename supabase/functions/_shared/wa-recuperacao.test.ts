import { describe, expect, it } from 'vitest'
import {
  JANELA_MAX_MS, chatIgnorado, chatsDoPeriodo, contarPorTipo, corpoParaWebhook, estadoAguardando, faltantes,
  mensagensDoPeriodo, ordemDeReenvio, tsEmMs, validarPeriodo,
} from './wa-recuperacao'

const AGORA = Date.parse('2026-10-27T13:30:00Z')
const H = 3_600_000

describe('tsEmMs', () => {
  it('aceita ms, segundos e texto', () => {
    expect(tsEmMs(1761571200000)).toBe(1761571200000)
    expect(tsEmMs(1761571200)).toBe(1761571200000)
    expect(tsEmMs('1761571200000')).toBe(1761571200000)
  })
  it('inválido vira NaN', () => {
    expect(tsEmMs(null)).toBeNaN()
    expect(tsEmMs('abc')).toBeNaN()
    expect(tsEmMs(0)).toBeNaN()
  })
})

describe('validarPeriodo', () => {
  it('período normal; ate omitido = agora', () => {
    expect(validarPeriodo('2026-10-26T02:00:00Z', undefined, AGORA)).toEqual({ desde: Date.parse('2026-10-26T02:00:00Z'), ate: AGORA })
  })
  it('recusa invertido, futuro, além de 7 dias e lixo', () => {
    expect(validarPeriodo('2026-10-27T13:00:00Z', '2026-10-27T12:00:00Z', AGORA)).toEqual({ erro: 'periodo_invertido' })
    expect(validarPeriodo('2026-10-27T13:00:00Z', '2026-10-28T12:00:00Z', AGORA)).toEqual({ erro: 'periodo_no_futuro' })
    expect(validarPeriodo(new Date(AGORA - JANELA_MAX_MS - H).toISOString(), undefined, AGORA)).toEqual({ erro: 'alem_de_7_dias' })
    expect(validarPeriodo('ontem', undefined, AGORA)).toEqual({ erro: 'periodo_invalido' })
    expect(validarPeriodo(123, undefined, AGORA)).toEqual({ erro: 'periodo_invalido' })
  })
})

describe('chatIgnorado / chatsDoPeriodo', () => {
  it('ignora Status, canais e vazio', () => {
    expect(chatIgnorado('status@broadcast')).toBe(true)
    expect(chatIgnorado('123@newsletter')).toBe(true)
    expect(chatIgnorado('')).toBe(true)
    expect(chatIgnorado('120363@g.us')).toBe(false)
  })
  it('para quando a página passa de desde', () => {
    const desde = AGORA - 10 * H
    const r = chatsDoPeriodo([
      { wa_chatid: 'a@g.us', wa_lastMsgTimestamp: AGORA - H },
      { wa_chatid: 'status@broadcast', wa_lastMsgTimestamp: AGORA - H },
      { wa_chatid: 'b@s.whatsapp.net', wa_lastMsgTimestamp: AGORA - 20 * H },
    ], desde)
    expect(r.chats.map((c) => c.wa_chatid)).toEqual(['a@g.us'])
    expect(r.fim).toBe(true)
  })
  it('sem timestamp continua (não decide o fim)', () => {
    const r = chatsDoPeriodo([{ wa_chatid: 'a@g.us' }], AGORA - H)
    expect(r.chats).toHaveLength(1)
    expect(r.fim).toBe(false)
  })
})

describe('mensagensDoPeriodo', () => {
  const p = { desde: AGORA - 10 * H, ate: AGORA - H }
  it('filtra pelo período, sem id e enviadas pela API', () => {
    const r = mensagensDoPeriodo([
      { messageid: 'novo', messageTimestamp: AGORA - 0.5 * H },
      { messageid: 'ok1', messageTimestamp: AGORA - 2 * H },
      { messageid: 'api', messageTimestamp: AGORA - 3 * H, wasSentByApi: true },
      { messageTimestamp: AGORA - 3 * H },
      { messageid: 'velho', messageTimestamp: AGORA - 11 * H },
    ], p)
    expect(r.msgs.map((m) => m.messageid)).toEqual(['ok1'])
    expect(r.fim).toBe(true)
  })
})

describe('faltantes', () => {
  it('tira as que já estão no Chat e duplicadas; ordena da mais antiga', () => {
    const r = faltantes([
      { messageid: 'c', messageTimestamp: 3 },
      { messageid: 'a', messageTimestamp: 1 },
      { messageid: 'b', messageTimestamp: 2 },
      { messageid: 'a', messageTimestamp: 1 },
    ].map((m) => ({ ...m, messageTimestamp: AGORA - m.messageTimestamp * -H })), new Set(['b']))
    expect(r.map((m) => m.messageid)).toEqual(['a', 'c'])
  })
})

describe('corpoParaWebhook', () => {
  it('monta o id completo a partir do dono quando vem só o interno', () => {
    const c = corpoParaWebhook({ messageid: 'ABC', id: 'r1234567', owner: '5521999' }, { wa_chatid: 'x@g.us' }, 'Suporte1', null)
    expect(c).toMatchObject({ EventType: 'messages', instanceName: 'Suporte1', owner: '5521999', message: { id: '5521999:ABC' }, chat: { wa_chatid: 'x@g.us' } })
  })
  it('mantém o id que já tem dono e usa o dono padrão', () => {
    const c = corpoParaWebhook({ messageid: 'ABC', id: '5521:ABC' }, null, 'Suporte1', '5521')
    expect(c.owner).toBe('5521')
    expect((c.message as { id: string }).id).toBe('5521:ABC')
    expect('chat' in c).toBe(false)
  })
})

describe('contarPorTipo', () => {
  it('conta por messageType', () => {
    expect(contarPorTipo([{ messageType: 'Conversation' }, { messageType: 'AudioMessage' }, { messageType: 'Conversation' }, {}]))
      .toEqual({ Conversation: 2, AudioMessage: 1, desconhecido: 1 })
  })
})

describe('estadoAguardando', () => {
  const m = (autor_tipo: string | null, autor_origem: string | null = 'webhook') => ({ autor_tipo, autor_origem, criado_em: '' })
  it('mais nova do cliente → aguardando', () => {
    expect(estadoAguardando([m('cliente'), m('equipe')])).toEqual({ aguardando: true })
  })
  it('mais nova da equipe/IA → respondido', () => {
    expect(estadoAguardando([m('ia'), m('cliente')])).toEqual({ aguardando: false })
  })
  it('pula sistema e equipe por heurística de nome', () => {
    expect(estadoAguardando([m('sistema'), m('equipe', 'heuristica_nome'), m('cliente')])).toEqual({ aguardando: true })
  })
  it('nada decide → null', () => {
    expect(estadoAguardando([m('sistema'), m(null)])).toBeNull()
  })
})

describe('ordemDeReenvio', () => {
  it('textos primeiro, depois mídia; cada grupo por horário', () => {
    const r = ordemDeReenvio([
      { messageid: 'doc1', messageType: 'DocumentMessage', messageTimestamp: AGORA - 5 * H },
      { messageid: 't2', messageType: 'Conversation', messageTimestamp: AGORA - 2 * H },
      { messageid: 'img', messageType: 'ImageMessage', messageTimestamp: AGORA - 3 * H },
      { messageid: 't1', messageType: 'ExtendedTextMessage', messageTimestamp: AGORA - 4 * H },
      { messageid: 'x', messageTimestamp: AGORA - 6 * H },
    ])
    expect(r.map((m) => m.messageid)).toEqual(['t1', 't2', 'x', 'doc1', 'img'])
  })
})
