import { describe, expect, it } from 'vitest'
import { executarSituacaoLote, ferramentasSituacaoLote } from './wa-agente-ferr-situacao-lote.ts'
import { MapaRefs, type ContextoFerramentas } from './wa-agente-ferramentas.ts'
import { criarSupabaseFalso as criarFalsoBase, comClientesAtendidos } from './teste-supabase-falso.ts'
const criarSupabaseFalso: typeof criarFalsoBase = (tabelas, rpcs) => criarFalsoBase(comClientesAtendidos(tabelas), rpcs)

type Linha = Record<string, unknown>
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const T = id(1), OUTRO_T = id(2)
const NOMES = ['Cliente Árvore', 'Cliente Cedro', 'Cliente Dália', 'Cliente Ipê', 'Cliente Lírio', 'Cliente Oliva', 'Cliente Rosa']
const TOOL = 'consultar_situacao_clientes'

function montar() {
  const tabelas: Record<string, Linha[]> = {
    clients: NOMES.map((nome, i) => ({ id: id(100 + i), tenant_id: T, nome, ativo: i !== 5,
      cpf: 'CPF-NUNCA-SAI', email: 'email-privado@exemplo.test' })),
    contratos: NOMES.map((nome, i) => ({ id: id(200 + i), tenant_id: T, cliente_id: id(100 + i), cliente_nome: nome,
      produto_nome: 'Plano de Conteúdo', status: i === 5 ? 'rascunho' : 'ativo', status_secundario: i === 5 ? 'Não iniciado' : 'ATIVO',
      data_assinatura: '2020-01-01', data_fechamento: '2019-12-20', vencimento: '2020-04-01', plano_dias: 90,
      estrategista_id: id(300 + i), estrategista_nome_raw: null,
      valor_total: 987654, valor_parcela: 12345, num_parcelas: 12, pagamentos: ['PAGAMENTO-PRIVADO'], pix: 'PIX-NUNCA-SAI' })),
    users: NOMES.map((_, i) => ({ id: id(300 + i), tenant_id: T, nome: `Responsável ${i + 1}`, ativo: true, email: 'equipe-privado@exemplo.test' })),
    client_assignments: NOMES.map((_, i) => ({ id: id(400 + i), tenant_id: T, client_id: id(100 + i), user_id: id(300 + i), tipo: 'estrategista', ativo: true })),
  }
  const f = criarSupabaseFalso(tabelas)
  const colunas: string[] = []
  const from = f.client.from.bind(f.client)
  f.client.from = (tabela: string) => {
    const q = from(tabela), select = q.select.bind(q)
    q.select = (c: string, opts?: { head?: boolean; count?: 'exact' }) => { colunas.push(c); return select(c, opts) }
    return q
  }
  const ctx: ContextoFerramentas = { admin: f.client, escopo: { tenantId: T, userId: null, total: true,
    clientIds: new Set(), modo: 'normal', acessoTotalGrupo: true, permissoes: { automacoes: false, contratos: false, chat: false } },
    agora: new Date('2026-11-03T20:00:00Z'), canal: 'grupo', nomeAgente: 'Íris', refs: new MapaRefs(), urlsVistas: new Set() }
  const executar = (clientes: string[] = NOMES) => executarSituacaoLote(TOOL, { clientes }, ctx)
  return { tabelas, f, ctx, colunas, executar }
}

function resultados(v: Linha | null): Linha[] {
  expect(v).not.toHaveProperty('erro')
  return v?.resultados as Linha[]
}

describe('consulta de situação em lote', () => {
  it('consulta sete nomes exatos em uma chamada sem identidade administrativa', async () => {
    const r = montar()
    expect(ferramentasSituacaoLote(r.ctx.escopo).map(x => x.function.name)).toEqual([TOOL])
    const saida = resultados(await r.executar())
    expect(saida).toHaveLength(7)
    expect(saida.every(s => s.resultado === 'encontrado')).toBe(true)
    expect(saida[5]).toMatchObject({ cliente: { ativo: false }, contratos: [{ status: 'rascunho', status_secundario: 'Não iniciado' }] })
    expect(new Set(r.f.consultas.map(c => c.tabela))).toEqual(new Set(['clients', 'contratos', 'users', 'client_assignments', 'contrato_clientes_atendidos']))
    expect(r.f.consultas.every(c => c.operacao === 'select' && c.filtros.includes('eq:tenant_id'))).toBe(true)
    expect(r.f.inseridos).toEqual([])
    expect(r.f.atualizados).toEqual([])
  })

  it('normaliza caixa/acentos/espaços sem aceitar nome parcial ou remover pontuação', async () => {
    const r = montar()
    const saida = resultados(await r.executar(['  cliente   arvore  ', 'Cliente', 'Cliente-Arvore']))
    expect(saida.map(s => s.resultado)).toEqual(['encontrado', 'nao_encontrado', 'nao_encontrado'])
  })

  it('mantém status ativo apesar de assinatura e prazo antigos, sem inferir encerramento', async () => {
    const r = montar()
    const res = await r.executar([NOMES[0]])
    expect(resultados(res)[0]).toMatchObject({ cliente: { ativo: true }, contratos: [{ status: 'ativo', status_secundario: 'ATIVO',
      data_assinatura: '2020-01-01', data_fechamento: '2019-12-20', plano_dias: 90, cadastros_divergentes: false }] })
    expect(res?.aviso).toContain('data antiga ou prazo do plano não prova encerramento')
    expect(res?.aviso).toContain('não comprovação de contrato vigente')
  })

  it.each([false, true])('omite dados financeiros e pessoais mesmo com contratos=%s', async permissao => {
    const r = montar(); r.ctx.escopo.permissoes.contratos = permissao
    const saida = JSON.stringify(await r.executar())
    for (const proibido of ['valor_total', 'valor_parcela', 'num_parcelas', 'vencimento', 'pagamentos', 'pix', 'cpf', 'email', '987654', 'PRIVADO', 'NUNCA-SAI']) {
      expect(saida).not.toContain(proibido)
      expect(r.colunas.join(',')).not.toContain(proibido)
    }
    expect(saida).not.toContain(id(100))
  })

  it('filtra tenant e carteira antes de projetar clientes, contratos e responsáveis', async () => {
    const r = montar()
    r.ctx.escopo.total = false; r.ctx.escopo.clientIds = new Set([id(100)]); r.ctx.escopo.acessoTotalGrupo = false
    r.tabelas.clients[1].nome = 'SEGREDO-FORA-CARTEIRA'
    r.tabelas.clients.push({ id: id(800), tenant_id: OUTRO_T, nome: NOMES[0], ativo: true })
    r.tabelas.contratos.push({ ...r.tabelas.contratos[0], id: id(801), tenant_id: OUTRO_T, produto_nome: 'SEGREDO-OUTRO-TENANT' })
    r.tabelas.users.push({ id: id(802), tenant_id: OUTRO_T, nome: 'SEGREDO-USUARIO', ativo: true })
    r.tabelas.client_assignments.push({ ...r.tabelas.client_assignments[0], id: id(803), tenant_id: OUTRO_T, user_id: id(802) })
    const res = await r.executar([NOMES[0], 'SEGREDO-FORA-CARTEIRA'])
    expect(resultados(res).map(s => s.resultado)).toEqual(['encontrado', 'nao_encontrado'])
    expect(resultados(res)[0]).toMatchObject({ contratos_encontrados: 1, responsaveis_encontrados: 1 })
    const projetado = JSON.stringify(resultados(res)[0])
    expect(projetado).not.toContain('SEGREDO')
    expect(r.ctx.refs.tamanho).toBe(1)
    expect(r.f.consultas.every(c => c.filtros.includes('eq:tenant_id'))).toBe(true)
  })

  it('não revela duplicado fora da carteira nem associa seu contrato sem FK', async () => {
    const r = montar(); r.ctx.escopo.total = false; r.ctx.escopo.clientIds = new Set([id(100)])
    r.tabelas.clients.push({ ...r.tabelas.clients[0], id: id(800) })
    r.tabelas.contratos.push({ ...r.tabelas.contratos[0], id: id(801), cliente_id: null, produto_nome: 'LEGADO-NAO-AUTORIZADO' })
    const res = await r.executar([NOMES[0]])
    expect(resultados(res)[0]).toMatchObject({ resultado: 'encontrado', contratos_encontrados: 1 })
    expect(JSON.stringify(res)).not.toContain('LEGADO-NAO-AUTORIZADO')
    expect(res?.contratos_legados_por_nome).toContain('não são exibidos para carteira parcial')
  })

  it('retorna ambiguidade individual sem escolher cadastro ou contrato por nome', async () => {
    const r = montar()
    r.tabelas.clients.push({ ...r.tabelas.clients[0], id: id(800), nome: 'Cliente Arvore' })
    const saida = resultados(await r.executar([NOMES[0], NOMES[1]]))
    expect(saida[0]).toMatchObject({ resultado: 'ambiguo', quantidade_cadastros: 2, candidatos_exibidos_completos: true })
    expect(saida[0]).not.toHaveProperty('contratos')
    expect(saida[1]).toMatchObject({ resultado: 'encontrado', contratos_encontrados: 1 })
  })

  it('distingue FK de legado por nome e ignora contrato já vinculado a outro cliente', async () => {
    const r = montar()
    r.tabelas.contratos.push({ ...r.tabelas.contratos[0], id: id(800), cliente_id: null, produto_nome: 'Legado possível' },
      { ...r.tabelas.contratos[0], id: id(801), cliente_id: id(101), produto_nome: 'PERTENCE-A-OUTRO' })
    const res = resultados(await r.executar([NOMES[0]]))[0]
    expect(res).toMatchObject({ contratos_encontrados: 2, contratos: [
      { fonte: 'vinculo_cliente', vinculo_confirmado: true },
      { fonte: 'nome_legado_sem_vinculo', vinculo_confirmado: false, cadastros_divergentes: true,
        motivos_divergencia: ['contrato_sem_vinculo_confirmado'] },
    ] })
    expect(JSON.stringify(res)).not.toContain('PERTENCE-A-OUTRO')
  })

  it('sinaliza cadastro inativo/status ativo e responsabilidade operacional distinta, sem corrigir', async () => {
    const r = montar()
    r.tabelas.clients[0].ativo = false
    r.tabelas.contratos[0].cliente_nome = 'Nome anterior'
    r.tabelas.client_assignments[0].user_id = id(301)
    const saida = resultados(await r.executar([NOMES[0]]))[0]
    expect(saida).toMatchObject({ responsaveis_operacionais: [{ nome: 'Responsável 2' }], contratos: [{
      estrategista_nome: 'Responsável 1', cadastros_divergentes: true, motivos_divergencia: [
        'nome_do_contrato_difere_do_cadastro', 'cliente_inativo_com_status_contratual_ativo', 'responsavel_contratual_sem_vinculo_operacional_ativo',
      ],
    }] })
    expect(r.f.inseridos).toEqual([]); expect(r.f.atualizados).toEqual([])
  })

  it.each(['clients', 'contratos', 'users', 'client_assignments'])('completa páginas em %s ou recusa projeção associativa truncada', async tabela => {
    const r = montar(), from = r.f.client.from.bind(r.f.client)
    r.f.client.from = (nome: string) => {
      const q = from(nome), limit = q.limit.bind(q)
      if (nome === tabela) q.limit = (n: number) => limit(Math.min(n, 6))
      return q
    }
    const res = await r.executar()
    if (tabela === 'contratos') {
      // A projeção por associação exige contagem exata; nunca retornar lista parcial.
      expect(res).toHaveProperty('erro')
      expect(r.f.inseridos).toEqual([])
      return
    }
    expect(resultados(res)).toHaveLength(7)
    expect(resultados(res).every(x => x.resultado === 'encontrado')).toBe(true)
    expect(r.f.consultas.some(c => c.tabela === tabela && c.filtros.includes('gt:id'))).toBe(true)
  })

  it.each(['restrito', 'carteira_gt3'])('bloqueia oferta e execução forjada no modo %s', async modo => {
    const r = montar()
    if (modo === 'restrito') r.ctx.escopo.modo = 'restrito'
    else r.ctx.escopo.politica = 'carteira_gt3'
    expect(ferramentasSituacaoLote(r.ctx.escopo)).toEqual([])
    expect(await r.executar()).toHaveProperty('erro')
    expect(r.f.consultas).toEqual([])
  })

  it.each([{}, { clientes: [] }, { clientes: Array(21).fill('Nome') }, { clientes: ['Nome', 'Nôme'] },
    { clientes: [id(100)] }, { clientes: ['Nome'], tenant_id: OUTRO_T }, { clientes: ['Nome\nOutro'] }])('recusa argumentos inválidos antes de ler: %j', async args => {
    const r = montar()
    expect(await executarSituacaoLote(TOOL, args, r.ctx)).toHaveProperty('erro')
    expect(r.f.consultas).toEqual([])
  })

  it('não intercepta outra ferramenta e aceita JSON do tool call', async () => {
    const r = montar()
    expect(await executarSituacaoLote('outra', {}, r.ctx)).toBeNull()
    expect(resultados(await executarSituacaoLote(TOOL, JSON.stringify({ clientes: [NOMES[0]] }), r.ctx))).toHaveLength(1)
  })
})


it('não trata paginação interrompida como resultado completo ou cliente ausente', async () => {
  const r = montar(), from = r.f.client.from.bind(r.f.client)
  r.f.client.from = (tabela: string) => {
    const q = from(tabela), limit = q.limit.bind(q), gt = q.gt.bind(q)
    if (tabela === 'clients') {
      q.limit = (n: number) => limit(Math.min(n, 6))
      q.gt = (campo: string, valor: unknown) => { gt(campo, valor); limit(0); return q }
    }
    return q
  }
  const res = await r.executar()
  expect(res).toHaveProperty('erro')
  expect(res).not.toHaveProperty('resultados')
  expect(r.ctx.refs.tamanho).toBe(0)
})

it('beneficiário tem contrato confirmado sem herdar nome, financeiro ou divergência do titular', async () => {
  const r = montar()
  r.tabelas.contratos = [r.tabelas.contratos[0]]
  r.tabelas.contrato_clientes_atendidos = [
    { tenant_id:T, contrato_id:id(200), cliente_id:id(100), principal:true },
    { tenant_id:T, contrato_id:id(200), cliente_id:id(101), principal:false },
  ]
  const saida = resultados(await r.executar([NOMES[1]]))[0]
  expect(saida.contratos_encontrados).toBe(1)
  expect(saida.contratos).toMatchObject([{ fonte:'cliente_adicional', vinculo_confirmado:true,
    cliente_nome_registrado:null, status:'ativo', cadastros_divergentes:false, motivos_divergencia:[] }])
  expect(JSON.stringify(saida)).not.toMatch(/Cliente Árvore|987654|12345|PIX-NUNCA-SAI|PAGAMENTO-PRIVADO/)
})
