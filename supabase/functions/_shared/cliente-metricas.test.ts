import { describe, expect, it } from 'vitest'
import {
  type MensagemMetrica, calcularMetricas, descreverMinutosUteis, diasUteisDesde, ladoDaMensagem, minutosUteis,
  turnosDoCliente,
} from './cliente-metricas.ts'

// Terça, 27/10/2026, 07:00 de Brasília.
const AGORA = new Date('2026-10-27T10:00:00Z')
const DIA = 86_400_000
/** Instante em Brasília (UTC−3) → ISO. */
const brt = (s: string) => new Date(`${s}-03:00`).toISOString()
const diasAtras = (d: number, h = 0) => new Date(AGORA.getTime() - d * DIA - h * 3_600_000).toISOString()
const msg = (criado_em: string, autor_tipo: string | null, p: Partial<MensagemMetrica> = {}): MensagemMetrica =>
  ({ criado_em, autor_tipo, tipo: 'texto', midia_texto: null, ...p })

describe('ladoDaMensagem', () => {
  it('equipe e IA respondem; sistema não conta; o resto é do lado do cliente', () => {
    expect(ladoDaMensagem('equipe')).toBe('equipe')
    expect(ladoDaMensagem('ia')).toBe('equipe')
    expect(ladoDaMensagem('sistema')).toBe('ignorar')
    expect(ladoDaMensagem('cliente')).toBe('cliente')
    expect(ladoDaMensagem('desconhecido')).toBe('cliente')
    expect(ladoDaMensagem(null)).toBe('cliente')
  })
})

describe('minutosUteis (seg–sex, 08–19h BRT)', () => {
  it('sexta 18:30 → segunda 08:30 = 60 minutos úteis', () => {
    expect(minutosUteis(Date.parse(brt('2026-10-23T18:30:00')), Date.parse(brt('2026-10-26T08:30:00')))).toBe(60)
  })
  it('fim de semana e madrugada não contam', () => {
    expect(minutosUteis(Date.parse(brt('2026-10-24T09:00:00')), Date.parse(brt('2026-10-25T18:00:00')))).toBe(0)
    expect(minutosUteis(Date.parse(brt('2026-10-26T20:00:00')), Date.parse(brt('2026-10-27T07:59:00')))).toBe(0)
  })
  it('dentro do expediente é a diferença simples; fim antes do início = 0', () => {
    expect(minutosUteis(Date.parse(brt('2026-10-26T10:00:00')), Date.parse(brt('2026-10-26T11:15:00')))).toBe(75)
    expect(minutosUteis(Date.parse(brt('2026-10-26T11:00:00')), Date.parse(brt('2026-10-26T10:00:00')))).toBe(0)
  })
})

describe('diasUteisDesde', () => {
  it('conta seg–sex depois do dia de início até hoje (Brasília)', () => {
    expect(diasUteisDesde('2026-10-19', AGORA)).toBe(6) // 20,21,22,23,26,27
    expect(diasUteisDesde('2026-10-27', AGORA)).toBe(0)
    expect(diasUteisDesde('2026-10-24T10:00:00Z', AGORA)).toBe(2)
  })
  it('data inválida → 0', () => {
    expect(diasUteisDesde('ontem', AGORA)).toBe(0)
    expect(diasUteisDesde(null, AGORA)).toBe(0)
  })
})

describe('turnosDoCliente', () => {
  it('agrupa mensagens seguidas do cliente e fecha na 1ª resposta da equipe/IA', () => {
    const t = turnosDoCliente([
      msg(brt('2026-10-26T10:00:00'), 'cliente'),
      msg(brt('2026-10-26T10:05:00'), 'desconhecido'),
      msg(brt('2026-10-26T10:06:00'), 'sistema'),
      msg(brt('2026-10-26T10:30:00'), 'equipe'),
      msg(brt('2026-10-26T10:31:00'), 'equipe'),
      msg(brt('2026-10-26T15:00:00'), 'cliente'),
    ])
    expect(t).toHaveLength(2)
    expect(t[0].resposta! - t[0].inicio).toBe(30 * 60_000)
    expect(t[1].resposta).toBeNull()
  })
})

describe('calcularMetricas', () => {
  it('tempos de resposta em minutos úteis (mediana e p90) e pedidos sem resposta em 24h', () => {
    const msgs = [
      // respondido em 30 min úteis
      msg(brt('2026-10-20T10:00:00'), 'cliente'), msg(brt('2026-10-20T10:30:00'), 'equipe'),
      // respondido em 60 min úteis (sexta à noite → segunda 08:30), mas > 24h corridas
      msg(brt('2026-10-23T18:30:00'), 'cliente'), msg(brt('2026-10-26T08:30:00'), 'ia'),
      // sem resposta, há 22h (ainda não conta como "mais de 24h")
      msg(brt('2026-10-26T09:00:00'), 'cliente'),
    ]
    const m = calcularMetricas(msgs, AGORA)
    expect(m.resp_equipe_mediana_min).toBe(45)
    expect(m.resp_equipe_p90_min).toBe(60)
    expect(m.pedidos_sem_resposta_24h).toBe(1)
    expect(m.aguardando_desde).toBe(brt('2026-10-26T09:00:00'))
    expect(m.dias_desde_msg_cliente).toBe(0)
    // Pedido sem resposta há mais de 24h também conta.
    expect(calcularMetricas([msg(diasAtras(2), 'cliente')], AGORA).pedidos_sem_resposta_24h).toBe(1)
  })

  it('volume, silêncio e áudios sem transcrição', () => {
    const msgs = [
      msg(diasAtras(40), 'cliente', { tipo: 'audio' }),
      msg(diasAtras(39), 'cliente', { tipo: 'ptt', midia_texto: 'transcrito' }),
      msg(diasAtras(25), 'equipe'),
      msg(diasAtras(22), 'cliente'),
      msg(diasAtras(10), 'equipe'),
      msg(diasAtras(5), 'sistema'),
      msg(diasAtras(100), 'cliente'), // fora da janela de 90 dias
    ]
    const m = calcularMetricas(msgs, AGORA)
    expect(m.dias_desde_msg_cliente).toBe(22)
    expect(m.msgs_30d).toBe(3)
    expect(m.msgs_cliente_30d).toBe(1)
    expect(m.msgs_90d_media_mensal).toBe(1.7) // 5 / 3
    expect(m.audios_sem_transcricao).toBe(1)
    expect(m.janela_dias).toBe(90)
  })

  it('sem mensagem do cliente na janela → dias_desde_msg_cliente null', () => {
    const m = calcularMetricas([msg(diasAtras(3), 'equipe')], AGORA)
    expect(m.dias_desde_msg_cliente).toBeNull()
    expect(m.resp_equipe_mediana_min).toBeNull()
    expect(m.pedidos_sem_resposta_24h).toBe(0)
    expect(m.aguardando_desde).toBeNull()
  })

  it('queda de volume do cliente contra a média dos 2 meses anteriores (só com base suficiente)', () => {
    const anteriores = Array.from({ length: 40 }, (_, i) => msg(diasAtras(35 + i), 'cliente'))
    const recentes = Array.from({ length: 4 }, (_, i) => msg(diasAtras(2 + i), 'cliente'))
    expect(calcularMetricas([...anteriores, ...recentes], AGORA).queda_volume_pct).toBe(0.8) // 4 contra 20/mês
    const poucas = Array.from({ length: 10 }, (_, i) => msg(diasAtras(35 + i), 'cliente'))
    expect(calcularMetricas(poucas, AGORA).queda_volume_pct).toBeNull() // média 5/mês: sem base
    const subiu = Array.from({ length: 30 }, (_, i) => msg(diasAtras(1 + (i % 20)), 'cliente'))
    expect(calcularMetricas([...anteriores, ...subiu], AGORA).queda_volume_pct).toBe(0)
  })

  it('demora da equipe aparece só como métrica (nada de "insatisfação" aqui)', () => {
    const m = calcularMetricas([msg(diasAtras(10), 'cliente')], AGORA)
    expect(Object.keys(m).sort()).toEqual([
      'aguardando_desde', 'audios_sem_transcricao', 'dias_desde_msg_cliente', 'janela_dias', 'msgs_30d',
      'msgs_90d_media_mensal', 'msgs_cliente_30d', 'pedidos_sem_resposta_24h', 'queda_volume_pct',
      'resp_equipe_mediana_min', 'resp_equipe_p90_min',
    ])
  })
})

describe('descreverMinutosUteis', () => {
  it('texto curto para o prompt', () => {
    expect(descreverMinutosUteis(null)).toBe('sem dados')
    expect(descreverMinutosUteis(45)).toBe('45 min')
    expect(descreverMinutosUteis(150)).toBe('2.5h úteis')
    expect(descreverMinutosUteis(11 * 60 * 2)).toBe('2 dias úteis')
  })
})
