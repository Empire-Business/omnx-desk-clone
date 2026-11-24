import { describe, expect, it } from 'vitest'
import {
  clientesParaCampanha, dataCurta, faixaNps, linkPesquisa, maisRecente, placarNps,
  podeCriarCampanha, situacaoCampanha, validarCampanha, zonaNps,
} from './pesquisasNps'

describe('faixaNps', () => {
  it('usa a régua do relatório NPS: 9–10, 7–8 e 0–6', () => {
    expect([10, 9].map(faixaNps)).toEqual(['promotor', 'promotor'])
    expect([8, 7].map(faixaNps)).toEqual(['neutro', 'neutro'])
    expect([6, 0].map(faixaNps)).toEqual(['detrator', 'detrator'])
  })
})

describe('placarNps', () => {
  it('sem respostas não inventa número', () => {
    expect(placarNps([])).toEqual({ nps: null, media: null, promotores: 0, neutros: 0, detratores: 0, total: 0 })
  })
  it('NPS = (promotores − detratores) ÷ total × 100, arredondado', () => {
    const p = placarNps([10, 9, 8, 6, 3])
    expect(p).toMatchObject({ promotores: 2, neutros: 1, detratores: 2, total: 5, nps: 0, media: 7.2 })
    expect(placarNps([10, 10, 9]).nps).toBe(100)
    expect(placarNps([0, 5]).nps).toBe(-100)
    expect(placarNps([10, 9, 7]).nps).toBe(67)
  })
  it('ignora nota fora de 0–10', () => {
    expect(placarNps([10, 11, -1, Number.NaN]).total).toBe(1)
  })
})

describe('zonaNps', () => {
  it('classifica pelas zonas usuais', () => {
    expect(zonaNps(null)).toBe('Sem respostas ainda')
    expect(zonaNps(80)).toBe('Excelência')
    expect(zonaNps(75)).toBe('Excelência')
    expect(zonaNps(50)).toBe('Qualidade')
    expect(zonaNps(0)).toBe('Aperfeiçoamento')
    expect(zonaNps(-1)).toBe('Crítica')
  })
})

describe('situacaoCampanha', () => {
  it('vem da contagem de respostas, não de respondido_em', () => {
    expect(situacaoCampanha(0)).toBe('aguardando')
    expect(situacaoCampanha(1)).toBe('respondida')
  })
})

describe('podeCriarCampanha', () => {
  it('só admin, como a RLS de nps_surveys', () => {
    expect(podeCriarCampanha('admin')).toBe(true)
    for (const perfil of ['gerente', 'atendimento', 'estrategista', 'cliente', null, undefined]) {
      expect(podeCriarCampanha(perfil)).toBe(false)
    }
  })
})

describe('linkPesquisa', () => {
  it('aponta para a rota do portal, sem barra dobrada', () => {
    expect(linkPesquisa('https://desk.exemplo.com', 'abc')).toBe('https://desk.exemplo.com/portal/nps/abc')
    expect(linkPesquisa('https://desk.exemplo.com/', 'abc')).toBe('https://desk.exemplo.com/portal/nps/abc')
    expect(linkPesquisa('http://x', 'a b')).toBe('http://x/portal/nps/a%20b')
  })
})

describe('clientesParaCampanha', () => {
  const clientes = [
    { id: '1', nome: 'Zeca' },
    { id: '2', nome: 'ângela' },
    { id: '3', nome: 'Bruno' },
  ]
  it('ordena por nome em pt-BR sem mexer na lista original', () => {
    expect(clientesParaCampanha(clientes).map((c) => c.id)).toEqual(['2', '3', '1'])
    expect(clientes.map((c) => c.id)).toEqual(['1', '2', '3'])
  })
  it('busca sem acento e sem caixa', () => {
    expect(clientesParaCampanha(clientes, 'ANG').map((c) => c.id)).toEqual(['2'])
    expect(clientesParaCampanha(clientes, '  ')).toHaveLength(3)
    expect(clientesParaCampanha(clientes, 'xyz')).toEqual([])
  })
})

describe('validarCampanha', () => {
  const clientes = [{ id: '1', nome: 'Ana' }]
  it('pede o cliente e recusa um que saiu da lista', () => {
    expect(validarCampanha('', clientes)).toBe('Escolha o cliente que vai responder.')
    expect(validarCampanha('9', clientes)).toBe('Esse cliente não está mais na lista. Escolha outro.')
    expect(validarCampanha('1', clientes)).toBeUndefined()
  })
})

describe('dataCurta e maisRecente', () => {
  it('data em pt-BR ou travessão', () => {
    expect(dataCurta('2026-11-22T12:00:00Z')).toBe('22/11/2026')
    expect(dataCurta(null)).toBe('—')
    expect(dataCurta('não é data')).toBe('—')
  })
  it('pega a resposta mais nova sem depender da ordem', () => {
    const itens = [{ id: 'a', criado_em: '2026-11-01T00:00:00Z' }, { id: 'b', criado_em: '2026-11-20T00:00:00Z' }, { id: 'c', criado_em: '2026-11-10T00:00:00Z' }]
    expect(maisRecente(itens)?.id).toBe('b')
    expect(maisRecente([])).toBeUndefined()
  })
})
