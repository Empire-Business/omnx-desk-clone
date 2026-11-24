import { describe, expect, it } from 'vitest'
import {
  avaliarTempoResposta, episodiosTempoResposta, estaEmExpedienteTempoResposta,
  etapaTempoResposta, formatarAlertaTempoResposta, minutosUteisTempoResposta,
  prazoTempoResposta, type MensagemTempoResposta,
} from './tempo-resposta-core.ts'

const br = (data: string) => `${data}-03:00`
const iso = (data: string) => new Date(br(data)).toISOString()

describe('expediente do monitor de resposta', () => {
  it('conta 35 minutos, 60 exatos e o excesso de 20 minutos', () => {
    const inicio = br('2026-11-03T10:00:00')
    expect(minutosUteisTempoResposta(inicio, br('2026-11-03T10:35:00'))).toBe(35)
    expect(minutosUteisTempoResposta(inicio, br('2026-11-03T11:00:00'))).toBe(60)
    expect(minutosUteisTempoResposta(inicio, br('2026-11-03T11:20:00'))).toBe(80)
  })

  it('exclui almoço e inicia às13h quando a mensagem chega durante o intervalo', () => {
    expect(minutosUteisTempoResposta(br('2026-11-03T11:40:00'), br('2026-11-03T13:20:00'))).toBe(40)
    expect(minutosUteisTempoResposta(br('2026-11-03T12:15:00'), br('2026-11-03T13:30:00'))).toBe(30)
    expect(minutosUteisTempoResposta(br('2026-11-03T12:00:00'), br('2026-11-03T13:00:00'))).toBe(0)
  })

  it('continua na segunda e pula um feriado informado no calendário', () => {
    const sexta = br('2026-10-30T17:40:00')
    expect(minutosUteisTempoResposta(sexta, br('2026-11-02T09:40:00'))).toBe(60)
    expect(minutosUteisTempoResposta(sexta, br('2026-11-03T09:40:00'), ['2026-11-02'])).toBe(60)
    expect(minutosUteisTempoResposta(sexta, br('2026-11-02T18:00:00'), ['2026-11-02', '2026-11-02'])).toBe(20)
  })

  it('noites e fins de semana não contam', () => {
    expect(minutosUteisTempoResposta(br('2026-11-03T18:00:00'), br('2026-11-04T09:00:00'))).toBe(0)
    expect(minutosUteisTempoResposta(br('2026-11-07T09:00:00'), br('2026-11-08T18:00:00'))).toBe(0)
  })

  it('um dia útil completo tem480min e preserva segundos', () => {
    expect(minutosUteisTempoResposta(br('2026-11-03T00:00:00'), br('2026-11-04T00:00:00'))).toBe(480)
    expect(minutosUteisTempoResposta(br('2026-11-03T10:00:30'), br('2026-11-03T10:01:00'))).toBe(0.5)
  })

  it('aceita diferentes representações do mesmo instante e usa São Paulo', () => {
    const inicio = '2026-11-03T12:00:00Z'
    const fim = '2026-11-03T08:30:00-04:00'
    expect(minutosUteisTempoResposta(inicio, fim)).toBe(30)
    expect(minutosUteisTempoResposta(new Date(inicio), Date.parse(fim))).toBe(30)
  })

  it('consulta IANA também nas datas históricas com horário de verão', () => {
    // Em dezembro/2018, São Paulo estava em UTC−2;09h local=11hZ.
    expect(minutosUteisTempoResposta('2018-12-03T11:00:00Z', '2018-12-03T11:30:00Z')).toBe(30)
    expect(estaEmExpedienteTempoResposta('2018-12-03T10:59:59Z')).toBe(false)
  })

  it('fronteiras do expediente são início inclusivo e fim exclusivo', () => {
    for (const [hora, esperado] of [
      ['08:59:59', false], ['09:00:00', true], ['11:59:59', true],
      ['12:00:00', false], ['12:59:59', false], ['13:00:00', true],
      ['17:59:59', true], ['18:00:00', false],
    ] as const) expect(estaEmExpedienteTempoResposta(br(`2026-11-03T${hora}`))).toBe(esperado)
    expect(estaEmExpedienteTempoResposta(br('2026-11-03T10:00:00'), ['2026-11-03'])).toBe(false)
  })

  it('rejeita datas inválidas, instantes sem fuso e ordem invertida', () => {
    const fim = br('2026-11-03T11:00:00')
    for (const invalido of ['2026-11-03T10:00:00', '2026-02-30T10:00:00Z', '2026-11-03T24:00:00Z', '2026-11-03T10:00:00+15:00', 'amanhã']) {
      expect(() => minutosUteisTempoResposta(invalido, fim)).toThrow()
    }
    expect(() => minutosUteisTempoResposta(NaN, fim)).toThrow()
    expect(() => minutosUteisTempoResposta(Infinity, fim)).toThrow()
    expect(() => minutosUteisTempoResposta(new Date('invalid'), fim)).toThrow()
    expect(() => minutosUteisTempoResposta(fim, br('2026-11-03T10:00:00'))).toThrow(/anterior/)
  })

  it('rejeita calendário inválido e não devolve resultado parcial além do limite', () => {
    const inicio = br('2026-11-03T10:00:00')
    for (const data of ['2026-02-29', '2026-11-31', '03/11/2026', '2026-1-01']) {
      expect(() => minutosUteisTempoResposta(inicio, inicio, [data])).toThrow(/feriado/)
    }
    expect(() => minutosUteisTempoResposta(inicio, br('2028-11-03T10:00:00'))).toThrow(/400 dias/)
    expect(() => minutosUteisTempoResposta(inicio, inicio, Array(4001).fill('2026-11-03'))).toThrow(/limite/)
  })
})

describe('prazo e faixas', () => {
  it('calcula os marcos30,50,60 atravessando o almoço', () => {
    const inicio = br('2026-11-03T11:40:00')
    expect(prazoTempoResposta(inicio, 30)).toBe(iso('2026-11-03T13:10:00'))
    expect(prazoTempoResposta(inicio, 50)).toBe(iso('2026-11-03T13:30:00'))
    expect(prazoTempoResposta(inicio, 60)).toBe(iso('2026-11-03T13:40:00'))
  })

  it('calcula limite no fim do período e continua depois dele', () => {
    const inicio = br('2026-11-03T11:30:00')
    expect(prazoTempoResposta(inicio, 30)).toBe(iso('2026-11-03T12:00:00'))
    expect(prazoTempoResposta(inicio, 30.5)).toBe(iso('2026-11-03T13:00:30'))
    expect(prazoTempoResposta(br('2026-11-03T12:15:00'), 30)).toBe(iso('2026-11-03T13:30:00'))
  })

  it('pula fim de semana e feriado', () => {
    expect(prazoTempoResposta(br('2026-10-30T17:40:00'), 60, ['2026-11-02']))
      .toBe(iso('2026-11-03T09:40:00'))
  })

  it('mantém60 exatos dentro da meta, sem arredondamento antecipado', () => {
    expect([0, 29.99, 30, 49.99, 50, 60, 60.001].map(etapaTempoResposta))
      .toEqual([null, null, '30', '30', '50', '50', '60'])
    for (const n of [NaN, Infinity, -1]) expect(() => etapaTempoResposta(n)).toThrow()
  })

  it('não inventa prazo quando os dados ou horizonte não permitem calcular', () => {
    const inicio = br('2026-11-03T10:00:00')
    expect(prazoTempoResposta(inicio, 0)).toBe(iso('2026-11-03T10:00:00'))
    for (const n of [NaN, Infinity, -1, 200_000]) expect(() => prazoTempoResposta(inicio, n)).toThrow()
    //400 dias corridos não contêm400 dias comerciais.
    expect(() => prazoTempoResposta(inicio, 400 * 480)).toThrow(/expediente suficiente/)
  })
})

describe('pausas individuais auditáveis', () => {
  it('desconta reunião só do indivíduo, mantendo80 minutos de espera do cliente', () => {
    expect(avaliarTempoResposta({
      inicio: br('2026-11-03T10:00:00'), fim: br('2026-11-03T11:20:00'),
      pausas: [{ inicio: br('2026-11-03T10:15:00'), fim: br('2026-11-03T10:45:00') }],
    })).toEqual({ minutosCliente: 80, minutosEstrategista: 50, minutosDescontados: 30, etapa: '60', dentroDaMeta: false, emExpediente: true })
  })

  it('sobreposições e pausas duplicadas são descontadas uma vez', () => {
    const r = avaliarTempoResposta({
      inicio: br('2026-11-03T10:00:00'), fim: br('2026-11-03T11:00:00'),
      pausas: [
        { inicio: br('2026-11-03T10:15:00'), fim: br('2026-11-03T10:45:00') },
        { inicio: br('2026-11-03T10:30:00'), fim: br('2026-11-03T11:20:00') },
        { inicio: br('2026-11-03T10:15:00'), fim: br('2026-11-03T10:45:00') },
      ],
    })
    expect(r).toMatchObject({ minutosCliente: 60, minutosEstrategista: 15, minutosDescontados: 45, etapa: '50', dentroDaMeta: true })
  })

  it('almoço e tempo fora da espera não são descontados duas vezes', () => {
    const r = avaliarTempoResposta({
      inicio: br('2026-11-03T11:40:00'), fim: br('2026-11-03T13:20:00'),
      pausas: [
        { inicio: br('2026-11-03T11:50:00'), fim: br('2026-11-03T13:10:00') },
        { inicio: br('2026-11-03T15:00:00'), fim: br('2026-11-03T16:00:00') },
      ],
    })
    expect(r).toMatchObject({ minutosCliente: 40, minutosEstrategista: 20, minutosDescontados: 20 })
  })

  it('feriado não consome meta nem desconto individual', () => {
    expect(avaliarTempoResposta({
      inicio: br('2026-11-02T09:00:00'), fim: br('2026-11-02T18:00:00'), feriados: ['2026-11-02'],
      pausas: [{ inicio: br('2026-11-02T10:00:00'), fim: br('2026-11-02T11:00:00') }],
    })).toMatchObject({ minutosCliente: 0, minutosEstrategista: 0, minutosDescontados: 0, etapa: null, emExpediente: false })
  })

  it('rejeita pausa inválida mesmo fora da janela, em vez de ocultar erro', () => {
    const base = { inicio: br('2026-11-03T10:00:00'), fim: br('2026-11-03T11:00:00') }
    for (const pausa of [
      { inicio: br('2026-11-04T10:00:00'), fim: br('2026-11-04T09:00:00') },
      { inicio: base.inicio, fim: base.inicio },
      { inicio: 'inválido', fim: base.fim },
    ]) expect(() => avaliarTempoResposta({ ...base, pausas: [pausa] })).toThrow()
    expect(() => avaliarTempoResposta({ ...base, pausas: Array(1001).fill(base) })).toThrow(/limite/)
  })
})

const mensagem = (id: string, hora: string, autor: MensagemTempoResposta['autor'], extra: Partial<MensagemTempoResposta> = {}): MensagemTempoResposta => ({
  id, conversationId: 'grupo-a', criadoEm: br(`2026-11-03T${hora}`), autor,
  autoriaConfiavel: true, ...(autor === 'equipe' ? { autorId: 'estrategista-1' } : {}), ...extra,
})

describe('episódios de espera por conversa', () => {
  it('novas cobranças não reiniciam a espera; áudio também inicia um episódio', () => {
    const r = episodiosTempoResposta([
      mensagem('m3', '10:35:00', 'equipe'), mensagem('m1', '10:00:00', 'cliente', { tipo: 'audio' }),
      mensagem('m2', '10:20:00', 'cliente'), mensagem('m4', '11:00:00', 'cliente'),
    ])
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ inicio: iso('2026-11-03T10:00:00'), primeiraMensagemId: 'm1', respostaMensagemId: 'm3', respostaAutorId: 'estrategista-1', medicaoConfiavel: true })
    expect(r[1]).toMatchObject({ primeiraMensagemId: 'm4', respostaEm: null })
  })

  it('resposta em outro grupo não encerra a espera e preserva o autor real da cobertura', () => {
    const r = episodiosTempoResposta([
      mensagem('m1', '10:00:00', 'cliente'),
      mensagem('m2', '10:10:00', 'equipe', { conversationId: 'grupo-b' }),
      mensagem('m3', '10:20:00', 'equipe', { autorId: 'apoio-2' }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ respostaEm: iso('2026-11-03T10:20:00'), respostaAutorId: 'apoio-2' })
  })

  it('IA, sistema, reação e falha de envio não encerram espera humana', () => {
    const r = episodiosTempoResposta([
      mensagem('m1', '10:00:00', 'cliente'), mensagem('m2', '10:05:00', 'ia'),
      mensagem('m3', '10:10:00', 'sistema'), mensagem('m4', '10:15:00', 'equipe', { tipo: 'reaction' }),
      mensagem('m5', '10:20:00', 'equipe', { statusEnvio: 'falha' }),
      mensagem('m6', '10:25:00', 'equipe', { statusEnvio: 'enviando' }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ respostaEm: null, medicaoConfiavel: true })
  })

  it('autoria fraca não credita nem fecha resposta; sinaliza medição inconclusiva', () => {
    const r = episodiosTempoResposta([
      mensagem('m1', '10:00:00', 'cliente'),
      mensagem('m2', '10:10:00', 'equipe', { autoriaConfiavel: false }),
      mensagem('m3', '10:20:00', 'equipe', { autorId: null }),
    ])
    expect(r[0]).toMatchObject({ respostaEm: null, respostaAutorId: null, medicaoConfiavel: false, motivos: ['autoria_nao_confirmada', 'humano_nao_identificado'] })
  })

  it('entrada desconhecida permanece inconclusiva mesmo após resposta identificada', () => {
    const r = episodiosTempoResposta([
      mensagem('m1', '10:00:00', 'desconhecido', { autoriaConfiavel: false }),
      mensagem('m2', '10:20:00', 'equipe'),
    ])
    expect(r[0]).toMatchObject({ respostaAutorId: 'estrategista-1', medicaoConfiavel: false })
  })

  it('deduplica reentrega e recusa eventos conflitantes com o mesmo identificador', () => {
    const m = mensagem('m1', '10:00:00', 'cliente')
    expect(episodiosTempoResposta([m, m])).toHaveLength(1)
    expect(() => episodiosTempoResposta([m, { ...m, autor: 'equipe' }])).toThrow(/conflitantes/)
  })

  it('não transforma ordem ambígua no mesmo instante em medição confiável', () => {
    const r = episodiosTempoResposta([
      mensagem('a', '10:00:00', 'cliente'), mensagem('b', '10:00:00', 'equipe'),
    ])
    expect(r[0]).toMatchObject({ medicaoConfiavel: false, motivos: ['ordem_ambigua'] })
  })

  it('rejeita lote acima do limite e identidades de mensagem ausentes', () => {
    const m = mensagem('m1', '10:00:00', 'cliente')
    expect(() => episodiosTempoResposta(Array(20_001).fill(m))).toThrow(/limite/)
    expect(() => episodiosTempoResposta([{ ...m, id: '' }])).toThrow(/identificador/)
  })
})

describe('mensagem determinística da Íris', () => {
  it('explica espera, restante e pausa sem ocultar meta do cliente', () => {
    expect(formatarAlertaTempoResposta({ cliente: 'Empresa Exemplo', etapa: '50', minutosCliente: 50 }))
      .toBe('Empresa Exemplo está aguardando resposta humana há 50 minutos úteis. Faltam 10 minutos úteis para a meta de 60 minutos. Confira a conversa.')
    expect(formatarAlertaTempoResposta({ cliente: 'Empresa Exemplo', etapa: '60', minutosCliente: 80, minutosEstrategista: 50 }))
      .toContain('Tempo individual descontando pausas registradas: 50 minutos úteis.')
  })

  it('evita anunciar60 exatos como atraso após arredondamento', () => {
    expect(formatarAlertaTempoResposta({ cliente: 'Empresa', etapa: '60', minutosCliente: 60.001 })).toContain('há mais de 60 minutos úteis')
    expect(() => formatarAlertaTempoResposta({ cliente: 'Empresa', etapa: '60', minutosCliente: 60 })).toThrow(/incompatível/)
  })

  it('rejeita alerta obsoleto e tempo individual incoerente', () => {
    expect(() => formatarAlertaTempoResposta({ cliente: 'Empresa', etapa: '30', minutosCliente: 55 })).toThrow(/reavalie/)
    expect(() => formatarAlertaTempoResposta({ cliente: 'Empresa', etapa: '50', minutosCliente: 50, minutosEstrategista: 80 })).toThrow(/individual/)
    expect(() => formatarAlertaTempoResposta({ cliente: 'Empresa', etapa: '50', minutosCliente: 50, minutosEstrategista: NaN })).toThrow(/individual/)
  })

  it('nome externo não injeta quebra, Markdown ou link', () => {
    const r = formatarAlertaTempoResposta({ cliente: '**Empresa**\n[clique](https://exemplo.invalid)\u202E', etapa: '30', minutosCliente: 30 })
    expect(r).not.toMatch(/[\n\r\u202E*\[\]]/)
    expect(r).not.toContain('https://')
    expect(formatarAlertaTempoResposta({ cliente: '   ', etapa: '30', minutosCliente: 30 })).toMatch(/^Cliente está/)
  })
})
