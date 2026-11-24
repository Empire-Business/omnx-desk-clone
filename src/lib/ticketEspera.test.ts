import { describe, expect, it } from 'vitest'
import {
  esperaCronometrada, faixaDeEspera, iniciais, minutosDesde, prazoVencido, resumoDaFila, rotuloDoDia,
  pontosDoResumo, textoCronometro, textoDuracao, ticketAtrasado, ticketPedeAcao, tomDoAvatar, tomDoSelo,
} from './ticketEspera'

const agora = new Date('2026-11-07T12:00:00')

describe('pontosDoResumo', () => {
  const base = {
    status: 'aguardando_equipe' as const, responsavel: null, temResponsavel: false,
    prazoVencido: false, venceHoje: false, envioFalhou: false, atrasado: false,
  }
  it('diz de quem é a vez e quem cuida', () => {
    expect(pontosDoResumo(base)).toEqual([
      { tom: 'alerta', texto: 'Cliente esperando a equipe' },
      { tom: 'alerta', texto: 'Sem responsável' },
    ])
    expect(pontosDoResumo({ ...base, status: 'aguardando_cliente', temResponsavel: true, responsavel: 'Ana' })).toEqual([
      { tom: 'ok', texto: 'A equipe já respondeu' },
      { tom: 'ok', texto: 'Responsável: Ana' },
    ])
  })
  it('falha de envio, atraso e prazo aparecem como alerta', () => {
    const p = pontosDoResumo({ ...base, envioFalhou: true, atrasado: true, prazoVencido: true })
    expect(p.map((x) => x.texto)).toEqual([
      'Mensagem da equipe não enviada', 'Cliente esperando há 1 h ou mais', 'Prazo vencido', 'Sem responsável',
    ])
    expect(p.every((x) => x.tom === 'alerta')).toBe(true)
  })
  it('resolvido não cobra prazo nem responsável', () => {
    expect(pontosDoResumo({ ...base, status: 'resolvido', prazoVencido: true })).toEqual([{ tom: 'ok', texto: 'Pedido resolvido' }])
  })
})

describe('minutosDesde', () => {
  it('conta minutos inteiros e nunca devolve negativo', () => {
    expect(minutosDesde('2026-11-07T11:45:30', agora)).toBe(14)
    expect(minutosDesde('2026-11-07T12:05:00', agora)).toBe(0)
  })
  it('sem data válida, não chuta', () => {
    expect(minutosDesde(null, agora)).toBeNull()
    expect(minutosDesde('não é data', agora)).toBeNull()
  })
})

describe('faixa de calor da espera', () => {
  it('neutro → âmbar aos 15 min → vermelho aos 60 min', () => {
    expect(faixaDeEspera('aguardando_equipe', 0)).toBe(1)
    expect(faixaDeEspera('aguardando_equipe', 14)).toBe(1)
    expect(faixaDeEspera('aguardando_equipe', 15)).toBe(2)
    expect(faixaDeEspera('aguardando_equipe', 59)).toBe(2)
    expect(faixaDeEspera('aguardando_equipe', 60)).toBe(3)
    expect(faixaDeEspera('reaberto', 200)).toBe(3)
  })
  it('só esquenta quando a vez é da equipe numa conversa', () => {
    expect(esperaCronometrada('aguardando_equipe')).toBe(true)
    expect(esperaCronometrada('reaberto')).toBe(true)
    expect(esperaCronometrada('aguardando_cliente')).toBe(false)
    expect(faixaDeEspera('aguardando_cliente', 5000)).toBe(1)
    // Ticket criado à mão: a idade não é espera de resposta.
    expect(faixaDeEspera('aberto', 5000)).toBe(1)
    expect(faixaDeEspera('em_andamento', 5000)).toBe(1)
  })
  it('resolvido não tem relógio; sem data, fica neutro', () => {
    expect(faixaDeEspera('resolvido', 90)).toBeNull()
    expect(faixaDeEspera('aguardando_equipe', null)).toBe(1)
  })
})

describe('textos de tempo', () => {
  it('duração curta em linguagem simples', () => {
    expect(textoDuracao(0)).toBe('agora')
    expect(textoDuracao(9)).toBe('9 min')
    expect(textoDuracao(60)).toBe('1 h')
    expect(textoDuracao(134)).toBe('2 h 14 min')
    expect(textoDuracao(1440)).toBe('1 d')
    expect(textoDuracao(1440 * 3 + 250)).toBe('3 d 4 h')
  })
  it('separador de dia da conversa', () => {
    expect(rotuloDoDia('2026-11-07T08:00:00', agora)).toBe('Hoje')
    expect(rotuloDoDia('2026-11-06T23:59:00', agora)).toBe('Ontem')
    expect(rotuloDoDia('2026-11-02T10:00:00', agora)).toBe('02/11')
  })
  it('cronômetro com horas, minutos e segundos', () => {
    expect(textoCronometro(0)).toBe('00:00:00')
    expect(textoCronometro(761)).toBe('00:12:41')
    expect(textoCronometro(26 * 3600 + 5)).toBe('26:00:05')
  })
})

describe('atraso e "pede ação"', () => {
  it('prazo vencido é atraso; vencer hoje não é', () => {
    expect(prazoVencido('2026-11-06', agora)).toBe(true)
    expect(prazoVencido('2026-11-07', agora)).toBe(false)
    expect(prazoVencido(null, agora)).toBe(false)
  })
  it('atrasado = não resolvido e (prazo vencido ou relógio vermelho)', () => {
    expect(ticketAtrasado({ status: 'aguardando_equipe', minutos: 61 }, agora)).toBe(true)
    expect(ticketAtrasado({ status: 'aguardando_equipe', minutos: 30 }, agora)).toBe(false)
    expect(ticketAtrasado({ status: 'aguardando_cliente', prazo: '2026-11-01', minutos: 5 }, agora)).toBe(true)
    expect(ticketAtrasado({ status: 'resolvido', prazo: '2026-11-01', minutos: 500 }, agora)).toBe(false)
  })
  it('pede ação quando a vez é da equipe ou está atrasado', () => {
    expect(ticketPedeAcao({ status: 'aguardando_equipe', atrasado: false })).toBe(true)
    expect(ticketPedeAcao({ status: 'reaberto', atrasado: false })).toBe(true)
    expect(ticketPedeAcao({ status: 'aberto', atrasado: false })).toBe(true)
    expect(ticketPedeAcao({ status: 'aguardando_cliente', atrasado: false })).toBe(false)
    expect(ticketPedeAcao({ status: 'aguardando_cliente', atrasado: true })).toBe(true)
    expect(ticketPedeAcao({ status: 'resolvido', atrasado: true })).toBe(false)
  })
  it('resume a fila em uma frase', () => {
    expect(resumoDaFila([]).texto).toBe('0 tickets · nenhum pede ação')
    expect(resumoDaFila([{ pedeAcao: true, atrasado: false }]).texto).toBe('1 ticket · 1 pede ação')
    const r = resumoDaFila([
      { pedeAcao: true, atrasado: true }, { pedeAcao: true, atrasado: false }, { pedeAcao: false, atrasado: false },
    ])
    expect(r).toMatchObject({ total: 3, pedemAcao: 2, temAtraso: true, texto: '3 tickets · 2 pedem ação' })
  })
})

describe('selo e avatar', () => {
  it('tom do selo segue o status, a Íris e o atraso', () => {
    expect(tomDoSelo('aguardando_equipe')).toBe('aberto')
    expect(tomDoSelo('aguardando_cliente')).toBe('aguardando')
    expect(tomDoSelo('em_andamento')).toBe('andamento')
    expect(tomDoSelo('resolvido')).toBe('resolvido')
    expect(tomDoSelo('resolvido', { pelaIris: true })).toBe('ia')
    expect(tomDoSelo('aguardando_equipe', { atrasado: true })).toBe('atrasado')
    // A vez é do cliente: o selo continua dizendo isso.
    expect(tomDoSelo('aguardando_cliente', { atrasado: true })).toBe('aguardando')
  })
  it('iniciais do nome', () => {
    expect(iniciais('Studio Bem-Estar')).toBe('SB')
    expect(iniciais('Clínica Sol')).toBe('CS')
    expect(iniciais('Ana')).toBe('AN')
    expect(iniciais('  ')).toBe('?')
    expect(iniciais(null)).toBe('?')
  })
  it('tom do avatar é estável e fica entre 0 e 5', () => {
    expect(tomDoAvatar('abc')).toBe(tomDoAvatar('abc'))
    for (const k of ['a', 'b', 'cliente-1', '', null]) {
      const t = tomDoAvatar(k)
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThanOrEqual(5)
    }
  })
})
