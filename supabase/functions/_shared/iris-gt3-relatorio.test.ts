import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { relatorioCarteiraGt3, type RelatorioPessoalGt3 } from './iris-gt3-relatorio.ts'
import type { EscopoAgente } from './wa-agente-escopo.ts'
import type { ColetaAlertas } from './wa-relatorio-dados.ts'
import { criarSupabaseFalso as criarFalsoBase, comClientesAtendidos } from './teste-supabase-falso.ts'
const criarSupabaseFalso: typeof criarFalsoBase = (tabelas, rpcs) => criarFalsoBase(comClientesAtendidos(tabelas), rpcs)

beforeAll(() => vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Rede proibida neste teste.')))))
afterAll(() => vi.unstubAllGlobals())

const T = 'tenant-autorizado'
const cliente = (id: string, nome: string, ativo = true) => ({ id, nome, ativo, tenant_id: T })
const contrato = (clienteId: string, status: string | null) => ({
  tenant_id: T, cliente_id: clienteId, status,
  valor_total: 987654321, valor_parcela: 123456789, cliente_nome: 'MARCADOR_FINANCEIRO',
})
function escopo(ids: string[], overrides: Partial<EscopoAgente> = {}): EscopoAgente {
  return {
    tenantId: T, userId: 'estrategista-servidor', politica: 'carteira_gt3', modo: 'normal',
    total: false, clientIds: new Set(ids), instancias: new Set(['instancia-permitida']),
    permissoes: { contratos: false, chat: true, automacoes: true }, ...overrides,
  }
}
function referencias() {
  const ids = new Map<string, string>()
  const ref = vi.fn((id: string) => {
    if (!ids.has(id)) ids.set(id, `C${ids.size + 1}`)
    return ids.get(id)!
  })
  return { ref, ids }
}
function coleta(alertas: ColetaAlertas['dados']['alertas'] = {}, avisos?: string[]): ColetaAlertas & { avisos?: string[] } {
  return { dados: { data: '27/10/2026', alertas, reunioes: [] }, ignorados: [], ocultos: {} as ColetaAlertas['ocultos'], ...(avisos ? { avisos } : {}) }
}
function relatorio(r: Awaited<ReturnType<typeof relatorioCarteiraGt3>>): RelatorioPessoalGt3 {
  if ('erro' in r) throw new Error(r.erro)
  return r
}

describe('relatório pessoal GT3', () => {
  it('lista os 30 clientes sem busca por nome, ordenados, com referências somente deles', async () => {
    const clientes = Array.from({ length: 30 }, (_, n) => cliente(`c${n}`, `Cliente ${String(n).padStart(2, '0')}`)).reverse()
    const f = criarSupabaseFalso({ clients: clientes, contratos: [] })
    const refs = referencias()
    const r = relatorio(await relatorioCarteiraGt3(f.client, escopo(clientes.map((c) => c.id)), refs, coleta()))
    expect(r).toMatchObject({ total_clientes: 30, pagina: 1, por_pagina: 50, tem_mais: false })
    expect(r.clientes.map((c) => c.nome)).toEqual([...clientes].reverse().map((c) => c.nome))
    expect(refs.ids.size).toBe(30)
    expect(r.clientes.every((c) => c.situacao === 'sem_contrato')).toBe(true)
    expect(new Set(f.consultas.map((q) => q.tabela))).toEqual(new Set(['clients', 'contrato_clientes_atendidos']))
    expect(f.consultas.every((q) => q.operacao === 'select' && q.filtros.includes('eq:tenant_id'))).toBe(true)
    expect(f.inseridos).toEqual([])
    expect(f.atualizados).toEqual([])
  })

  it('tenant e carteira delimitam cadastro, contratos e alertas mesmo com total=true', async () => {
    const f = criarSupabaseFalso({
      clients: [cliente('meu', 'Cliente próprio'), cliente('fora', 'MARCADOR_FORA'), { ...cliente('outro-tenant', 'MARCADOR_OUTRO_TENANT'), tenant_id: 'outra-empresa' }],
      contratos: [contrato('meu', 'Cancelado'), contrato('fora', 'Em andamento'), { ...contrato('meu', 'Em andamento'), tenant_id: 'outra-empresa' }],
    })
    const refs = referencias()
    const r = relatorio(await relatorioCarteiraGt3(f.client, escopo(['meu', 'outro-tenant'], { total: true }), refs, coleta({ sem_resposta: [
      { client_id: 'meu', cliente: 'Nome antigo que não deve ser usado', detalhe: 'Aguarda há 6h', desde: '2026-10-27T06:00:00Z' },
      { client_id: 'fora', cliente: 'MARCADOR_FORA', detalhe: 'SEGREDO_OUTRA_CARTEIRA' },
      { client_id: null, cliente: 'Grupo interno', detalhe: 'SEGREDO_SEM_CLIENTE' },
    ] })))
    expect(r.total_clientes).toBe(1)
    expect(r.clientes).toEqual([{ ref: 'C1', nome: 'Cliente próprio', ativo: true, situacao: 'encerrado', alertas: [{ tipo: 'sem_resposta', detalhe: 'Aguarda há 6h', desde: '2026-10-27T06:00:00Z' }] }])
    expect([...refs.ids.keys()]).toEqual(['meu'])
    expect(JSON.stringify(r)).not.toMatch(/MARCADOR_|SEGREDO_|Nome antigo|Grupo interno|987654321|123456789/)
    expect(f.consultas.filter((q) => q.tabela === 'clients').every((q) => q.filtros.includes('in:id'))).toBe(true)
    expect(f.consultas.filter((q) => q.tabela === 'contratos').every((q) => q.filtros.includes('in:id'))).toBe(true)
  })

  it('reutiliza a situação contratual: um vigente prevalece, todos encerrados encerram, ausência é sem contrato', async () => {
    const f = criarSupabaseFalso({
      clients: [cliente('a', 'Ana'), cliente('b', 'Bia', false), cliente('c', 'Caio')],
      contratos: [contrato('a', 'cancelado'), contrato('a', 'Em andamento'), contrato('b', 'concluído'), contrato('b', 'distrato')],
    })
    const r = relatorio(await relatorioCarteiraGt3(f.client, escopo(['a', 'b', 'c']), referencias(), coleta()))
    expect(r.clientes.map((c) => [c.nome, c.ativo, c.situacao])).toEqual([
      ['Ana', true, 'vigente'], ['Bia', false, 'encerrado'], ['Caio', true, 'sem_contrato'],
    ])
    expect(JSON.stringify(r)).not.toMatch(/valor_total|valor_parcela|MARCADOR_FINANCEIRO/)
  })

  it('pagina depois de ordenar e só aloca refs e lê contratos da página', async () => {
    const clientes = Array.from({ length: 125 }, (_, n) => cliente(`c${n}`, `Cliente ${String(n).padStart(3, '0')}`)).reverse()
    const f = criarSupabaseFalso({ clients: clientes, contratos: [contrato('c50', 'Em andamento'), contrato('c0', 'cancelado')] })
    const refs = referencias()
    const r = relatorio(await relatorioCarteiraGt3(f.client, escopo(clientes.map((c) => c.id)), refs, coleta(), { pagina: 2, por_pagina: 50 }))
    expect(r).toMatchObject({ total_clientes: 125, pagina: 2, por_pagina: 50, tem_mais: true })
    expect(r.clientes).toHaveLength(50)
    expect(r.clientes[0]).toMatchObject({ nome: 'Cliente 050', ref: 'C1', situacao: 'vigente' })
    expect(r.clientes.at(-1)?.nome).toBe('Cliente 099')
    expect([...refs.ids.keys()]).toEqual(Array.from({ length: 50 }, (_, n) => `c${n + 50}`))
  })

  it('aceita 100 por página e página além do fim não consulta contratos nem cria refs', async () => {
    const f = criarSupabaseFalso({ clients: [cliente('a', 'Ana')], contratos: [] })
    const refs = referencias()
    const r = relatorio(await relatorioCarteiraGt3(f.client, escopo(['a']), refs, null, { pagina: 2, por_pagina: 100 }))
    expect(r).toMatchObject({ total_clientes: 1, pagina: 2, por_pagina: 100, tem_mais: false, clientes: [] })
    expect(refs.ref).not.toHaveBeenCalled()
    expect(f.consultas.map((q) => q.tabela)).toEqual(['clients'])
  })

  it('sem permissão de automações entrega o básico e ignora até uma coleta passada indevidamente', async () => {
    const f = criarSupabaseFalso({ clients: [cliente('a', 'Ana')], contratos: [contrato('a', 'Em andamento')] })
    const e = escopo(['a'], { permissoes: { contratos: false, chat: false, automacoes: false } })
    for (const fonte of [null, coleta({ pendencia: [{ client_id: 'a', cliente: 'Ana', detalhe: 'MARCADOR_ALERTA_SEM_PERMISSAO' }] }, ['MARCADOR_COBERTURA_SEM_PERMISSAO'])]) {
      const r = relatorio(await relatorioCarteiraGt3(f.client, e, referencias(), fonte))
      expect(r.clientes[0]).toMatchObject({ nome: 'Ana', situacao: 'vigente', alertas: [] })
      expect(r.cobertura.tipos_consultados).toEqual([])
      expect(r.cobertura.avisos.join(' ')).toContain('não possui permissão')
      expect(JSON.stringify(r)).not.toContain('MARCADOR_')
    }
    expect(f.consultas.every((q) => ['clients', 'contratos', 'contrato_clientes_atendidos'].includes(q.tabela))).toBe(true)
  })

  it('preserva avisos parciais e nunca apresenta zero alertas como ausência de risco', async () => {
    const f = criarSupabaseFalso({ clients: [cliente('a', 'Ana')], contratos: [] })
    const r = relatorio(await relatorioCarteiraGt3(f.client, escopo(['a']), referencias(), coleta({ sem_resposta: [], sentimento_negativo: [] }, ['Queda de volume não consultada.'])))
    expect(r.clientes[0].alertas).toEqual([])
    expect(r.cobertura).toEqual({ tipos_consultados: ['sem_resposta', 'sentimento_negativo'], avisos: ['Queda de volume não consultada.'] })
    expect(r.aviso).toContain('Não confirmam ausência de risco')
    const semColeta = relatorio(await relatorioCarteiraGt3(f.client, escopo(['a']), referencias(), null))
    expect(semColeta.cobertura.avisos.join(' ')).toContain('a coleta não foi fornecida')
  })

  it('mascara valores e dados pessoais em textos sem alterar a fonte recebida', async () => {
    const fonte = coleta({ pendencia: [{ client_id: 'a', cliente: 'Ana', detalhe: 'R$ 500 para pessoa@example.invalid; telefone +55 21 98888-1122' }] })
    const antes = JSON.stringify(fonte)
    const f = criarSupabaseFalso({ clients: [cliente('a', 'Ana')], contratos: [] })
    const r = relatorio(await relatorioCarteiraGt3(f.client, escopo(['a']), referencias(), fonte))
    const detalhe = r.clientes[0].alertas[0].detalhe
    expect(detalhe).not.toMatch(/R\$|500|pessoa@|98888/)
    expect(detalhe).toContain('valor omitido')
    expect(JSON.stringify(fonte)).toBe(antes)
  })

  it('carteira vazia não usa total=true para buscar a empresa e não aloca referências', async () => {
    const f = criarSupabaseFalso({ clients: [cliente('fora', 'MARCADOR_FORA')] })
    const refs = referencias()
    const r = relatorio(await relatorioCarteiraGt3(f.client, escopo([], { total: true }), refs, null))
    expect(r).toMatchObject({ total_clientes: 0, clientes: [], tem_mais: false })
    expect(r.aviso).toContain('Nenhum cliente autorizado disponível')
    expect(f.consultas).toEqual([])
    expect(refs.ref).not.toHaveBeenCalled()
  })

  it.each([
    { pagina: 0 }, { pagina: -1 }, { pagina: 1.5 }, { pagina: '2' },
    { por_pagina: 0 }, { por_pagina: 101 }, { por_pagina: 1.5 },
    { tenant_id: 'outra-empresa' }, { client_id: 'fora' }, { pessoa: 'Outro estrategista' }, null, [],
  ])('rejeita paginação inválida ou seletores de identidade antes de consultar: %j', async (args) => {
    const f = criarSupabaseFalso({})
    expect(await relatorioCarteiraGt3(f.client, escopo(['a']), referencias(), null, args)).toHaveProperty('erro')
    expect(f.consultas).toEqual([])
  })

  it.each([
    { politica: undefined }, { modo: 'restrito' as const }, { tenantId: '' },
  ])('nega escopo fora do canal autorizado antes da leitura: %j', async (override) => {
    const f = criarSupabaseFalso({})
    expect(await relatorioCarteiraGt3(f.client, escopo(['a'], override), referencias(), null)).toHaveProperty('erro')
    expect(f.consultas).toEqual([])
  })

  it('falha técnica de leitura não se transforma em relatório vazio', async () => {
    const admin = { from: () => ({ select: () => ({ eq: () => ({ in: () => ({ limit: () => Promise.resolve({ data: null, error: { code: 'XX' } }) }) }) }) }) }
    await expect(relatorioCarteiraGt3(admin as never, escopo(['a']), referencias(), null)).rejects.toThrow('Não foi possível conferir')
  })

  it('não afirma situação contratual completa se a consulta atingir o teto do lote', async () => {
    const f = criarSupabaseFalso({ clients: [cliente('a', 'Ana')], contratos: Array.from({ length: 1000 }, () => contrato('a', 'Cancelado')) })
    await expect(relatorioCarteiraGt3(f.client, escopo(['a']), referencias(), null)).rejects.toThrow('integralmente')
  })
})


it('beneficiário da carteira é vigente sem revelar principal ou financeiro de fora dela', async () => {
  const f = criarSupabaseFalso({ clients: [cliente('b', 'Beneficiária')],
    contratos: [{ ...contrato('pagador-fora', 'ativo'), id: 'k' }],
    contrato_clientes_atendidos: [{ tenant_id: T, contrato_id: 'k', cliente_id: 'b', principal: false }],
  })
  const r = relatorio(await relatorioCarteiraGt3(f.client, escopo(['b']), referencias(), coleta()))
  expect(r.clientes[0].situacao).toBe('vigente')
  expect(JSON.stringify(r)).not.toMatch(/pagador-fora|MARCADOR_FINANCEIRO|987654321/)
})
