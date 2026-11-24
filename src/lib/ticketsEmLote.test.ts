import { describe, expect, it } from 'vitest'
import {
  CONFIANCA_ALTA,
  confiancaEntraNoLote,
  descreverConfianca,
  jaNoEstado,
  marcadosDasSugestoesIris,
  marcadosNoCartao,
  marcadosPorPadrao,
  planejarLote,
  resumoDoPlano,
  resumirResultado,
  type CandidatoEmLote,
} from './ticketsEmLote'

const ticket = (over: Partial<CandidatoEmLote> = {}): CandidatoEmLote => ({
  id: 't1',
  codigo: '#1',
  titulo: 'Pedido',
  status: 'aberto',
  etapaId: 'e1',
  ...over,
})

describe('confiança em palavras', () => {
  it.each([
    [0.99, 'muito alta'],
    [0.95, 'muito alta'],
    [0.94, 'alta'],
    [CONFIANCA_ALTA, 'alta'],
    [0.89, 'média'],
    [0.7, 'média'],
    [0.69, 'baixa'],
    [0, 'baixa'],
    [null, 'sem confiança'],
    [undefined, 'sem confiança'],
    [Number.NaN, 'sem confiança'],
  ] as const)('%s vira "%s"', (confianca, esperado) => {
    expect(descreverConfianca(confianca as number | null | undefined)).toBe(esperado)
  })

  it('só alta e muito alta entram no lote da Íris', () => {
    expect(confiancaEntraNoLote(0.9)).toBe(true)
    expect(confiancaEntraNoLote(0.98)).toBe(true)
    expect(confiancaEntraNoLote(0.89)).toBe(false)
    expect(confiancaEntraNoLote(null)).toBe(false)
  })
})

describe('já está no estado pedido', () => {
  it('resolver pula o que está resolvido', () => {
    expect(jaNoEstado({ status: 'resolvido' }, 'resolver')).toBe(true)
    expect(jaNoEstado({ status: 'aguardando_equipe' }, 'resolver')).toBe(false)
  })

  it('reabrir só age no que está resolvido', () => {
    expect(jaNoEstado({ status: 'resolvido' }, 'reabrir')).toBe(false)
    expect(jaNoEstado({ status: 'aberto' }, 'reabrir')).toBe(true)
    expect(jaNoEstado({ status: 'aguardando_cliente' }, 'reabrir')).toBe(true)
  })
})

describe('planejar o lote', () => {
  it('separa o que grava, o que fica de fora e o que aguarda a equipe', () => {
    const plano = planejarLote(
      [
        ticket({ id: 'a', status: 'aberto' }),
        ticket({ id: 'b', status: 'aguardando_equipe' }),
        ticket({ id: 'c', status: 'resolvido' }),
      ],
      'resolver',
    )
    expect(plano.vao.map((c) => c.id)).toEqual(['a', 'b'])
    expect(plano.pulados.map((p) => p.candidato.id)).toEqual(['c'])
    expect(plano.pulados[0].motivo).toBe('Já está resolvido.')
    expect(plano.aguardandoEquipe.map((c) => c.id)).toEqual(['b'])
  })

  it('no reabrir, quem não está resolvido fica de fora e ninguém aguarda a equipe', () => {
    const plano = planejarLote(
      [ticket({ id: 'a', status: 'aberto' }), ticket({ id: 'b', status: 'resolvido' })],
      'reabrir',
    )
    expect(plano.vao.map((c) => c.id)).toEqual(['b'])
    expect(plano.pulados[0].motivo).toBe('Já está aberto — não há o que reabrir.')
    expect(plano.aguardandoEquipe).toEqual([])
  })

  it('lote vazio não inventa nada', () => {
    const plano = planejarLote([], 'resolver')
    expect(plano).toEqual({ vao: [], pulados: [], aguardandoEquipe: [] })
    expect(resumoDoPlano(plano)).toBe('Nenhum ticket para gravar.')
  })
})

describe('quem vem marcado', () => {
  it('resolver deixa de fora o que aguarda a equipe', () => {
    const ids = marcadosPorPadrao(
      [
        ticket({ id: 'a', status: 'aberto' }),
        ticket({ id: 'b', status: 'aguardando_equipe' }),
        ticket({ id: 'c', status: 'resolvido' }),
      ],
      'resolver',
    )
    expect(ids).toEqual(['a'])
  })

  it('reabrir marca só os resolvidos', () => {
    const ids = marcadosPorPadrao(
      [ticket({ id: 'a', status: 'aberto' }), ticket({ id: 'b', status: 'resolvido' })],
      'reabrir',
    )
    expect(ids).toEqual(['b'])
  })

  it('as sugestões da Íris marcam só confiança alta (e nunca um resolvido)', () => {
    const ids = marcadosDasSugestoesIris([
      ticket({ id: 'alta', confianca: 0.92 }),
      ticket({ id: 'muito-alta', confianca: 0.99 }),
      ticket({ id: 'media', confianca: 0.8 }),
      ticket({ id: 'sem', confianca: null }),
      ticket({ id: 'ja-resolvido', confianca: 0.99, status: 'resolvido' }),
    ])
    expect(ids).toEqual(['alta', 'muito-alta'])
  })

  it('as sugestoes da Iris tambem nao marcam quem aguarda a equipe', () => {
    const ids = marcadosDasSugestoesIris([
      ticket({ id: 'aberto', confianca: 0.95 }),
      ticket({ id: 'esperando', confianca: 0.99, status: 'aguardando_equipe' }),
    ])
    expect(ids).toEqual(['aberto'])
  })

  it('prioridade e responsavel marcam todo mundo, resolvido inclusive', () => {
    const ids = marcadosPorPadrao(
      [
        ticket({ id: 'a', status: 'aberto' }),
        ticket({ id: 'b', status: 'aguardando_equipe' }),
        ticket({ id: 'c', status: 'resolvido' }),
      ],
      'atribuir',
    )
    expect(ids).toEqual(['a', 'b', 'c'])
  })
})

describe('plano de prioridade e responsavel', () => {
  it('nao pula ninguem por causa do estado', () => {
    const plano = planejarLote(
      [
        ticket({ id: 'a', status: 'aberto' }),
        ticket({ id: 'b', status: 'resolvido' }),
        ticket({ id: 'c', status: 'aguardando_equipe' }),
      ],
      'atribuir',
    )
    expect(plano.vao.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(plano.pulados).toEqual([])
    expect(plano.aguardandoEquipe).toEqual([])
  })
})

describe('resumo do plano', () => {
  it('conta tickets, aguardando a equipe e quem fica de fora', () => {
    const plano = planejarLote(
      [
        ticket({ id: 'a', status: 'aberto' }),
        ticket({ id: 'b', status: 'aguardando_equipe' }),
        ticket({ id: 'c', status: 'resolvido' }),
      ],
      'resolver',
    )
    expect(resumoDoPlano(plano)).toBe('2 tickets · 1 está aguardando a equipe · 1 fica de fora')
  })

  it('fala no singular com um ticket só', () => {
    expect(resumoDoPlano(planejarLote([ticket()], 'resolver'))).toBe('1 ticket')
  })
})

describe('resumo do resultado', () => {
  it('conta resolvidos, sem permissão e falhas', () => {
    const r = resumirResultado('resolver', [
      { id: '1', codigo: '#1' },
      { id: '2', codigo: '#2' },
      { id: '3', codigo: '#3', erro: 'sem_permissao' },
      { id: '4', codigo: '#4', erro: 'falha' },
    ])
    expect(r).toEqual({ texto: '2 resolvidos, 1 sem permissão, 1 com falha', gravados: 2, semPermissao: 1, falhas: 1 })
  })

  it('fala no singular com um só', () => {
    expect(resumirResultado('resolver', [{ id: '1', codigo: '#1' }]).texto).toBe('1 resolvido')
    expect(resumirResultado('reabrir', [{ id: '1', codigo: '#1' }]).texto).toBe('1 reaberto')
  })

  it('prioridade e responsável contam como "atualizado"', () => {
    expect(resumirResultado('atualizar', [
      { id: '1', codigo: '#1' }, { id: '2', codigo: '#2' },
    ]).texto).toBe('2 atualizados')
    expect(resumirResultado('atualizar', [{ id: '1', codigo: '#1' }]).texto).toBe('1 atualizado')
  })

  it('quando nada passa, diz isso em vez de mostrar zero', () => {
    expect(resumirResultado('resolver', [{ id: '1', codigo: '#1', erro: 'sem_permissao' }]).texto).toBe(
      '1 sem permissão',
    )
    expect(resumirResultado('resolver', []).texto).toBe('Nada foi gravado')
  })
})

describe('quem vem marcado no cartão do lote', () => {
  const candidatos = [
    ticket({ id: 'aberto', status: 'aberto' }),
    ticket({ id: 'equipe', status: 'aguardando_equipe' }),
    ticket({ id: 'resolvido', status: 'resolvido' }),
  ]

  it('tira "aguardando equipe" mesmo quando a pessoa marcou todos pelo filtro', () => {
    const todos = candidatos.map((c) => c.id)
    expect(marcadosNoCartao(todos, candidatos, 'resolver')).toEqual(['aberto'])
  })

  it('mantém a escolha da pessoa no que a regra não tira', () => {
    expect(marcadosNoCartao(['aberto'], candidatos, 'resolver')).toEqual(['aberto'])
  })

  it('reabrir começa só com o que está resolvido', () => {
    expect(marcadosNoCartao(['aberto', 'resolvido'], candidatos, 'reabrir')).toEqual(['resolvido'])
  })

  it('prioridade e responsável não tiram ninguém', () => {
    const todos = candidatos.map((c) => c.id)
    expect(marcadosNoCartao(todos, candidatos, 'atribuir')).toEqual(todos)
  })
})
