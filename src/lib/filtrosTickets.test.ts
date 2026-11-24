import { describe, expect, it } from 'vitest'
import { FILTROS_VAZIOS, gravarFiltros, lerFiltros, temMaisFiltros } from './filtrosTickets'

describe('filtros de tickets no endereço', () => {
  it('endereço sem filtros dá a lista sem recorte', () => {
    expect(lerFiltros(new URLSearchParams('status=equipe'))).toEqual(FILTROS_VAZIOS)
  })

  it('lê o que o Início e os links mandam', () => {
    const f = lerFiltros(new URLSearchParams('status=todos&meus=1&cliente=c1&prioridade=alta&etapa=e2'))
    expect(f).toMatchObject({ meus: true, clienteId: 'c1', prioridade: 'alta', etapaId: 'e2', soWhatsApp: false })
    expect(temMaisFiltros(f)).toBe(true)
  })

  it('ignora prioridade desconhecida e não liga "meus" junto com "sem responsável"', () => {
    const f = lerFiltros(new URLSearchParams('prioridade=xyz&meus=1&sem_responsavel=1'))
    expect(f.prioridade).toBe('')
    expect(f.meus).toBe(false)
    expect(f.semResponsavel).toBe(true)
  })

  it('grava a mudança sem tocar no status nem na busca', () => {
    const p = new URLSearchParams('status=atrasados&q=senha&meus=1')
    const novo = gravarFiltros(p, { meus: false, semResponsavel: true, clienteId: 'c9' })
    expect(novo.toString()).toBe('status=atrasados&q=senha&sem_responsavel=1&cliente=c9')
    expect(p.get('meus')).toBe('1')
  })

  it('limpar tudo tira só os filtros', () => {
    const p = new URLSearchParams('status=todos&whatsapp=1&responsavel=u1&etapa=e1')
    expect(gravarFiltros(p, FILTROS_VAZIOS).toString()).toBe('status=todos')
  })
})
