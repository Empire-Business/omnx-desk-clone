import { describe, expect, it } from 'vitest'
import { carteiraLimitadaGt3, carregarCarteiraGt3, carregarEstrategistasGt3, formatarResumoCarteiraGt3 } from './iris-gt3-dados.ts'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'
import { PERMISSOES_COMPLETAS, type EscopoAgente } from './wa-agente-escopo.ts'

describe('aviso individual do GT3', () => {
  const dados = {
    data: '27/10/2026', alertas: {
      sem_resposta: [
        { client_id: 'meu', cliente: 'Cliente Próprio', detalhe: 'Pedido em aberto: R$ 500; contato +55 21 98888-1122 e pessoa@example.invalid.' },
        { client_id: 'outro', cliente: 'Cliente Alheio', detalhe: 'Dado de outra carteira' },
        { client_id: null, cliente: 'Grupo interno', detalhe: 'Sem cliente vinculado' },
      ],
      pendencia: [{ client_id: 'meu', cliente: 'Cliente Próprio', detalhe: 'BRL 1000 e 250 reais de contrato' }],
      sentimento_negativo: [], queda_volume: [],
    },
  }
  it('filtra carteira antes de contar e formar texto', () => {
    const r = formatarResumoCarteiraGt3(dados, new Set(['meu']), ['sem_resposta'])
    expect(r.tem_alertas).toBe(true)
    expect(r.texto).toContain('1 ponto(s)')
    expect(r.texto).not.toMatch(/Alheio|outra carteira|Grupo interno|Sem cliente vinculado/)
    expect(r.texto).not.toMatch(/R\$|500|98888|pessoa@/)
    expect(r.texto).toContain('valor omitido')
    expect(r.texto).toContain('final 1122')
  })
  it('omite valores também nos detalhes de contrato do diário sem IA', () => {
    const r = formatarResumoCarteiraGt3(dados, new Set(['meu']), ['pendencia'])
    expect(r.texto).not.toMatch(/BRL|1000|250 reais/)
    expect(r.texto).toContain('valor omitido')
  })
  it('omite quantias mesmo quando a coleta já separou os pontos do valor', () => {
    const r = formatarResumoCarteiraGt3({ data: dados.data, alertas: { ...dados.alertas, pendencia: [{ client_id: 'meu', cliente: 'Cliente Próprio', detalhe: 'Cobrança R$ 1. 234,50 em aberto' }] } }, new Set(['meu']), ['pendencia'])
    expect(r.texto).not.toMatch(/234|R\$/)
    expect(r.texto).toContain('valor omitido')
  })
  it('carteira vazia não revela existência ou quantidade de alertas gerais', () => {
    const r = formatarResumoCarteiraGt3(dados, new Set(), ['sem_resposta', 'pendencia'])
    expect(r.tem_alertas).toBe(false)
    expect(r.texto).not.toMatch(/Cliente|Grupo|ponto\(s\)/)
  })
  it('não dispensa aviso de cobertura parcial nem o apresenta como ausência conclusiva', () => {
    const r = formatarResumoCarteiraGt3(dados, new Set(), ['sem_resposta'], ['Fonte de análise indisponível neste acesso.'])
    expect(r.tem_alertas).toBe(true)
    expect(r.cobertura_parcial).toBe(true)
    expect(r.texto).toContain('nas fontes consultadas')
    expect(r.texto).toContain('Limites da consulta')
    expect(r.texto).toContain('indisponível')
    expect(r.texto).not.toContain('ponto(s) de atenção')
  })
})

describe('candidatos de estrategista Desk no GT3', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
  const usuario = (n: number, nome: string, perfil = 'admin', ativo = true, tenant_id = 't') => ({ id: id(n), tenant_id, nome, perfil, ativo })
  const atribuicao = (n: number, ativo = true, tenant_id = 't', tipo = 'estrategista') => ({ user_id: id(n), tenant_id, ativo, tipo })
  type Resposta = { data: unknown; error: unknown; count?: number | null }
  function alterarResposta(f: ReturnType<typeof criarSupabaseFalso>, tabela: string, alterar: (r: Resposta) => Resposta) {
    const from = f.client.from.bind(f.client)
    f.client.from = (t: string) => {
      const q = from(t)
      if (t === tabela) {
        const then = q.then.bind(q)
        q.then = (resolve: (r: Resposta) => unknown, reject: (e: unknown) => unknown) =>
          then((r: Resposta) => resolve(alterar(r)), reject)
      }
      return q
    }
  }
  it('inclui perfis elegíveis sem atribuições, preserva legado, deduplica e ordena em pt-BR', async () => {
    const f = criarSupabaseFalso({
      users: [usuario(1, 'Pedro Paracampos'), usuario(2, 'Ágata', 'gerente'), usuario(3, 'Bárbara', 'estrategista'),
        usuario(4, 'Ana', 'membro'), usuario(5, 'Cliente', 'cliente'), usuario(6, 'Inativo', 'admin', false),
        usuario(7, 'Outro tenant', 'admin', true, 'outro'), usuario(8, 'Sem atribuição', 'membro'),
        usuario(9, 'Atribuição inativa', 'membro'), usuario(10, 'Atribuição externa', 'membro'),
        usuario(11, 'Outro tipo', 'membro'), usuario(12, 'Legado inativo', 'membro', false)],
      client_assignments: [atribuicao(4), atribuicao(4), atribuicao(3), atribuicao(5), atribuicao(6),
        atribuicao(7), atribuicao(9, false), atribuicao(10, true, 'outro'), atribuicao(11, true, 't', 'comercial'), atribuicao(12)],
    })
    expect(await carregarEstrategistasGt3(f.client, 't')).toEqual([
      { id: id(2), nome: 'Ágata' }, { id: id(4), nome: 'Ana' }, { id: id(3), nome: 'Bárbara' }, { id: id(1), nome: 'Pedro Paracampos' },
    ])
    for (const q of f.consultas) {
      expect(q.operacao).toBe('select')
      expect(q.filtros).toContain('eq:tenant_id')
      expect(q.filtros).toContain('eq:ativo')
      expect(q.filtros).toContain(q.tabela === 'users' ? 'neq:perfil' : 'eq:tipo')
    }
    expect(f.inseridos).toEqual([]); expect(f.atualizados).toEqual([])
  })
  it('resolve legado em lotes de 80 sem truncar a lista e desempata nomes por id', async () => {
    const f = criarSupabaseFalso({
      users: Array.from({ length: 81 }, (_, n) => usuario(n + 1, 'Mesmo Nome', 'membro')).reverse(),
      client_assignments: Array.from({ length: 81 }, (_, n) => atribuicao(n + 1)),
    })
    const r = await carregarEstrategistasGt3(f.client, 't')
    expect(r.map((u) => u.id)).toEqual(Array.from({ length: 81 }, (_, n) => id(n + 1)))
    expect(f.consultas.filter((q) => q.tabela === 'users' && q.filtros.includes('in:id'))).toHaveLength(4)
  })
  it('aceita até 200 candidatos e recusa o excedente antes de devolver uma lista parcial', async () => {
    for (const quantidade of [200, 201]) {
      const f = criarSupabaseFalso({ users: Array.from({ length: quantidade }, (_, n) => usuario(n + 1, `Pessoa ${n}`)) })
      const r = carregarEstrategistasGt3(f.client, 't')
      if (quantidade === 200) expect(await r).toHaveLength(200)
      else await expect(r).rejects.toMatchObject({ status: 422, codigo: 'lista_limite' })
    }
  })
  it('aplica o limite de 200 à união de perfis e legados', async () => {
    const f = criarSupabaseFalso({
      users: [...Array.from({ length: 200 }, (_, n) => usuario(n + 1, `Pessoa ${n}`)), usuario(201, 'Legado', 'membro')],
      client_assignments: [atribuicao(201)],
    })
    await expect(carregarEstrategistasGt3(f.client, 't')).rejects.toMatchObject({ status: 422, codigo: 'lista_limite' })
  })
  it('recusa mais de 5000 atribuições mesmo quando repetem o mesmo estrategista', async () => {
    const f = criarSupabaseFalso({ users: [usuario(1, 'Pessoa')], client_assignments: Array.from({ length: 5001 }, () => atribuicao(1)) })
    await expect(carregarEstrategistasGt3(f.client, 't')).rejects.toMatchObject({ status: 422, codigo: 'lista_limite' })
    expect(f.consultas.some((q) => q.tabela === 'users')).toBe(false)
  })
  it.each(['atribuições', 'perfis', 'legados'])('recusa truncamento silencioso da API em %s', async (origem) => {
    const f = criarSupabaseFalso({ users: [usuario(1, 'Pessoa', origem === 'legados' ? 'membro' : 'admin')], client_assignments: [atribuicao(1)] })
    alterarResposta(f, origem === 'atribuições' ? 'client_assignments' : 'users', (r) =>
      Array.isArray(r.data) && r.data.length ? { ...r, data: [] } : r)
    await expect(carregarEstrategistasGt3(f.client, 't')).rejects.toMatchObject({ status: 503, codigo: 'dados_indisponiveis' })
  })
  it.each([null, -1, 1.5, Number.NaN])('contagem exata ausente/inválida não comprova lista completa: %s', async (count) => {
    const f = criarSupabaseFalso({ users: [usuario(1, 'Pessoa')], client_assignments: [] })
    alterarResposta(f, 'users', (r) => r.data === null ? { ...r, count } : r)
    await expect(carregarEstrategistasGt3(f.client, 't')).rejects.toMatchObject({ status: 503, codigo: 'dados_indisponiveis' })
  })
  it.each(['users', 'client_assignments'])('falha de leitura em %s não devolve lista parcial', async (tabela) => {
    const f = criarSupabaseFalso({ users: [usuario(1, 'Pessoa')], client_assignments: [] })
    alterarResposta(f, tabela, (r) => ({ ...r, error: { code: 'XX' } }))
    await expect(carregarEstrategistasGt3(f.client, 't')).rejects.toMatchObject({ status: 503, codigo: 'dados_indisponiveis' })
  })
  it('admin listado sem atribuições continua com clientes vazios e total false', async () => {
    const f = criarSupabaseFalso({ users: [usuario(1, 'Pedro Paracampos')], profiles: [{ user_id: id(1), tenant_id: 't' }],
      client_assignments: [], clients: [{ id: 'alheio', tenant_id: 't', nome: 'Cliente alheio' }] }, {
      wa_agente_escopo: () => ({ total: true, client_ids: ['alheio'] }), has_permissao_de: () => true,
    })
    expect(await carregarEstrategistasGt3(f.client, 't')).toEqual([{ id: id(1), nome: 'Pedro Paracampos' }])
    const c = { id: 'conexao', tenant_id: 't', workspace_id: 'w', ativo: true, revisao: 1, expires_at: '2099-01-01', revoked_at: null }
    const v = { id: 'v', tenant_id: 't', connection_id: 'conexao', gt3_user_id: 'g', desk_user_id: id(1), ativo: true, modo_teste: true, revisao: 1 }
    const r = await carregarCarteiraGt3(f.client, c, v)
    expect(r.clientes).toEqual([])
    expect([...r.escopo.clientIds]).toEqual([])
    expect(r.escopo.total).toBe(false)
    expect(f.inseridos).toEqual([]); expect(f.atualizados).toEqual([])
  })
})

describe('derivação da carteira GT3', () => {
  const base: EscopoAgente = {
    tenantId: 'empresa', userId: 'estrategista', modo: 'normal', total: false,
    clientIds: new Set(['a', 'b']), permissoes: { ...PERMISSOES_COMPLETAS }, instancias: new Set(['instancia']),
  }
  it('intersecta atribuições com acesso canônico e retira financeiro/empresa', () => {
    const r = carteiraLimitadaGt3(base, ['b', 'fora'])
    expect([...r.clientIds]).toEqual(['b'])
    expect(r.total).toBe(false)
    expect(r.politica).toBe('carteira_gt3')
    expect(r.permissoes).toEqual({ contratos: false, chat: true, automacoes: true, alertasCarteiraGt3: false, agregadosRestritos: false, onboarding: false, atendimento: false, comissoes: false })
    expect(r.instancias).toEqual(new Set(['instancia']))
  })
  it('admin total continua restrito somente às atribuições de estrategista', () => {
    const r = carteiraLimitadaGt3({ ...base, total: true }, ['b'])
    expect([...r.clientIds]).toEqual(['b'])
    expect(r.total).toBe(false)
  })
  it.each([
    ['admin', true, true, true], ['gerente', true, true, true],
    ['admin', false, true, false], ['admin', true, false, false], ['membro', true, true, false],
  ])('análise ampla exige perfil+profiletenant+permissão canônicos: %s/admin=%s/profile=%s', async (perfil, adminAlertas, profileCoerente, esperado) => {
    const f = criarSupabaseFalso({
      users: [{ id: 'u', tenant_id: 't', nome: 'Pessoa', ativo: true, perfil }],
      profiles: [{ user_id: 'u', tenant_id: profileCoerente ? 't' : 'outra' }],
      client_assignments: [{ user_id: 'u', tenant_id: 't', tipo: 'estrategista', ativo: true, client_id: 'c' }],
      clients: [{ id: 'c', tenant_id: 't', nome: 'Cliente' }],
    }, {
      wa_agente_escopo: () => ({ total: true, client_ids: [] }),
      has_permissao_de: (a) => a.p_acao === 'admin' ? adminAlertas : true,
    })
    const c = { id: 'conexao', tenant_id: 't', workspace_id: 'w', ativo: true, revisao: 1, expires_at: '2099-01-01', revoked_at: null }
    const v = { id: 'v', tenant_id: 't', connection_id: 'conexao', gt3_user_id: 'g', desk_user_id: 'u', ativo: true, modo_teste: true, revisao: 1 }
    const r = await carregarCarteiraGt3(f.client, c, v)
    expect(r.escopo.permissoes.agregadosRestritos).toBe(esperado)
    expect([...r.escopo.clientIds]).toEqual(['c'])
    expect(r.escopo.total).toBe(false)
  })
  it.each([
    [true, null, '2099-01-01', true],
    [false, null, '2099-01-01', false],
    [true, '2026-01-01', '2099-01-01', false],
    [true, null, '2020-01-01', false],
  ])('capacidade pessoal deriva do vínculo atual e conexão, sem grant do painel: %s/%s/%s', async (ativo, revoked_at, expires_at, esperado) => {
    const f = criarSupabaseFalso({
      users: [{ id: 'u', tenant_id: 't', nome: 'Pessoa', ativo: true, perfil: 'estrategista' }],
      client_assignments: [{ user_id: 'u', tenant_id: 't', tipo: 'estrategista', ativo: true, client_id: 'c' }],
      user_instance_assignments: [{ user_id: 'u', tenant_id: 't', instance_id: 'permitida' }],
      clients: [{ id: 'c', tenant_id: 't', nome: 'Cliente' }],
    }, {
      wa_agente_escopo: () => ({ total: false, client_ids: ['c'] }),
      has_permissao_de: (a) => a.p_recurso === 'chat' && a.p_acao === 'ver',
    })
    const c = { id: 'conexao', tenant_id: 't', workspace_id: 'w', ativo, revisao: 1, expires_at, revoked_at }
    const v = { id: 'v', tenant_id: 't', connection_id: 'conexao', gt3_user_id: 'g', desk_user_id: 'u', ativo: true, modo_teste: true, revisao: 1 }
    const r = await carregarCarteiraGt3(f.client, c, v)
    expect(r.escopo.permissoes.alertasCarteiraGt3).toBe(esperado)
    expect(r.escopo.permissoes.automacoes).toBe(false)
    expect(r.escopo.permissoes.agregadosRestritos).toBe(false)
    expect(r.escopo.permissoes.chat).toBe(true)
    expect([...r.escopo.clientIds]).toEqual(['c'])
  })
})


describe('revisão persistente da carteira', () => {
  const conexao = { id: 'conexao', tenant_id: 't', workspace_id: 'w', ativo: true, revisao: 1, expires_at: '2099-01-01', revoked_at: null }
  const vinculo = { id: 'v', tenant_id: 't', connection_id: 'conexao', gt3_user_id: 'g', desk_user_id: 'u', ativo: true, modo_teste: true, revisao: 1 }
  function banco(revisoes: Record<string, unknown>[] = []) {
    return criarSupabaseFalso({
      users: [{ id: 'u', tenant_id: 't', nome: 'Pessoa fictícia', ativo: true, perfil: 'estrategista' }],
      client_assignments: [{ user_id: 'u', tenant_id: 't', tipo: 'estrategista', ativo: true, client_id: 'c' }],
      clients: [{ id: 'c', tenant_id: 't', nome: 'Cliente fictício' }], client_assignment_state: revisoes,
    }, { wa_agente_escopo: () => ({ total: false, client_ids: ['c'] }), has_permissao_de: () => true })
  }
  type Resposta = { data: unknown; error: unknown; count?: number | null }
  function alterar(f: ReturnType<typeof banco>, transformar: (r: Resposta) => Resposta) {
    const from = f.client.from.bind(f.client)
    f.client.from = (t: string) => {
      const q = from(t)
      if (t === 'client_assignment_state') {
        const then = q.then.bind(q)
        q.then = (resolve: (r: Resposta) => unknown, reject: (e: unknown) => unknown) => then((r: Resposta) => resolve(transformar(r)), reject)
      }
      return q
    }
  }
  it('legado sem estado confirmado vale zero, e revisão posterior invalida contexto', async () => {
    const legado = banco()
    const zero = banco([{ tenant_id: 't', client_id: 'c', revisao: 0 }])
    const alterado = banco([{ tenant_id: 't', client_id: 'c', revisao: 4 }])
    const a = await carregarCarteiraGt3(legado.client, conexao, vinculo)
    const b = await carregarCarteiraGt3(zero.client, conexao, vinculo)
    const c = await carregarCarteiraGt3(alterado.client, conexao, vinculo)
    expect(a.scope_hash).toBe(b.scope_hash); expect(c.scope_hash).not.toBe(a.scope_hash)
    expect(alterado.consultas.find((q) => q.tabela === 'client_assignment_state')?.filtros).toEqual(['eq:tenant_id', 'in:client_id'])
  })
  it.each([
    { data: null, error: { code: '42P01' }, count: null },
    { data: [], error: null, count: null },
    { data: [], error: null, count: 1 },
    { data: [{ client_id: 'c', revisao: -1 }], error: null, count: 1 },
    { data: [{ client_id: 'c', revisao: 1.5 }], error: null, count: 1 },
    { data: [{ client_id: 'alheio', revisao: 1 }], error: null, count: 1 },
    { data: [{ client_id: 'c', revisao: 1 }, { client_id: 'c', revisao: 1 }], error: null, count: 2 },
  ])('falha, truncamento e estado incoerente não viram revisão zero: %j', async (resposta) => {
    const f = banco(); alterar(f, () => resposta)
    await expect(carregarCarteiraGt3(f.client, conexao, vinculo)).rejects.toMatchObject({ status: 503, codigo: 'dados_indisponiveis' })
  })
})
