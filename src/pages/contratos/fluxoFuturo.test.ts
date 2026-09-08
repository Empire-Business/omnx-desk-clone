import { describe, it, expect } from 'vitest'
import { parcelasFuturasDoContrato, parcelasDoContrato, agruparPorMes, somaDias, rotuloDia } from './fluxoFuturo'

const HOJE = '2026-08-01'

describe('parcelasFuturasDoContrato', () => {
  it('usa a lista de pagamentos, ignora passadas e exclui entrada/sinal', () => {
    const c = {
      id: 'a',
      pagamentos: [
        { data: '2026-09-01', valor: 30000, sinal: 'Entrada' }, // futura MAS é entrada → excluída
        { data: '2026-07-20', valor: 10000, sinal: 'Parcela 1' }, // passada
        { data: '2026-08-19', valor: 10000, sinal: 'Parcela 2' },
        { data: '2026-09-19', valor: 10000, sinal: 'Parcela 3' },
      ],
    }
    const r = parcelasFuturasDoContrato(c, HOJE)
    expect(r).toHaveLength(2)
    expect(r.map((p) => p.mes)).toEqual(['2026-08', '2026-09'])
    expect(r.reduce((s, p) => s + p.valor, 0)).toBe(20000)
  })

  it('deriva da data de assinatura + parcelas quando não há lista de pagamentos', () => {
    const c = {
      id: 'b',
      pagamentos: [],
      data_assinatura: '2026-07-10',
      num_parcelas: 3,
      valor_parcela: 500,
    }
    const r = parcelasFuturasDoContrato(c, HOJE)
    // 1ª parcela cai 1 mês após a assinatura: 08/10, 09/10, 10/10 → as 3 são futuras.
    // NÃO ancora em `vencimento`: no import do Notion ele veio como assinatura + 12
    // meses (renovação), o que jogava tudo ~1 ano pra frente.
    expect(r.map((p) => p.mes)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(r.every((p) => p.valor === 500)).toBe(true)
  })

  it('usa data_fechamento quando não há data_assinatura', () => {
    const c = {
      id: 'b2',
      pagamentos: [],
      data_fechamento: '2026-07-10',
      num_parcelas: 3,
      valor_parcela: 500,
    }
    const r = parcelasFuturasDoContrato(c, HOJE)
    expect(r.map((p) => p.mes)).toEqual(['2026-08', '2026-09', '2026-10'])
  })

  it('retorna vazio sem base para derivar', () => {
    expect(parcelasFuturasDoContrato({ id: 'c', pagamentos: [], num_parcelas: 1 }, HOJE)).toEqual([])
  })
})

describe('agruparPorMes', () => {
  it('preenche meses sem parcela com zero (intervalo contínuo)', () => {
    const parcelas = [
      { contratoId: 'a', mes: '2026-08', data: '2026-08-19', valor: 10000 },
      { contratoId: 'a', mes: '2026-10', data: '2026-10-19', valor: 10000 },
      { contratoId: 'b', mes: '2026-08', data: '2026-08-05', valor: 5000 },
    ]
    const r = agruparPorMes(parcelas)
    expect(r.map((m) => m.mes)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(r[0]).toMatchObject({ valor: 15000, parcelas: 2, contratos: 2 })
    expect(r[1]).toMatchObject({ valor: 0, parcelas: 0, contratos: 0 })
    expect(r[2]).toMatchObject({ valor: 10000, parcelas: 1, contratos: 1 })
  })
})

describe('parcelasDoContrato (agenda do dia)', () => {
  it('inclui parcelas já vencidas, mas continua ignorando entrada/sinal', () => {
    const c = {
      id: 'a',
      pagamentos: [
        { data: '2026-07-08', valor: 5000, sinal: 'Parcela 1' }, // passada → entra
        { data: '2026-08-08', valor: 5000, sinal: 'Parcela 2' },
        { data: '2026-08-08', valor: 30000, sinal: 'Entrada' }, // entrada → fora
      ],
    }
    const r = parcelasDoContrato(c)
    expect(r.map((p) => p.data)).toEqual(['2026-07-08', '2026-08-08'])
    expect(r.filter((p) => p.data === '2026-08-08').reduce((s, p) => s + p.valor, 0)).toBe(5000)
  })

  it('não conta contrato fora do status ativo', () => {
    const c = { id: 'a', status: 'cancelado', pagamentos: [{ data: '2026-08-08', valor: 5000 }] }
    expect(parcelasDoContrato(c)).toEqual([])
  })
})

describe('somaDias / rotuloDia', () => {
  it('anda para frente e para trás atravessando a virada do mês', () => {
    expect(somaDias('2026-08-31', 1)).toBe('2026-09-01')
    expect(somaDias('2026-08-01', -1)).toBe('2026-07-31')
  })

  it('rotula o dia com o dia da semana', () => {
    expect(rotuloDia('2026-08-08')).toMatch(/^\p{L}+, 08\/08$/u)
  })
})
