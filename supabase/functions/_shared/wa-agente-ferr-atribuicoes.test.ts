import { beforeEach, describe, expect, it, vi } from 'vitest'
import { atribuicoesDisponiveis, executarAtribuicoes, ferramentasAtribuicoes, lerPedidosAtribuicoes } from './wa-agente-ferr-atribuicoes.ts'
import { formatarPreviaAcaoChat, formatarReciboAcaoChat, validarAcaoChat, type PreviaAcaoChat } from './wa-agente-acoes-core.ts'
import { recibosAcoesCadastro } from './wa-agente-ferr-acoes-cadastro.ts'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'
import type { ContextoFerramentas } from './wa-agente-ferramentas.ts'

type Linha = Record<string, unknown>
const gates = vi.hoisted(() => ({ origem: true, autorizado: true, oferta: true, total: true,
  ids: [] as string[], autorizarChamadas: 0, revogarNaChamada: Infinity,
  tabelas: {} as Record<string, Record<string, unknown>[]>, leituras: [] as string[] }))
vi.mock('./wa-agente-ferr-acoes-cadastro.ts', async (original) => ({
  ...await original<typeof import('./wa-agente-ferr-acoes-cadastro.ts')>(),
  origemAtual: async (ctx: ContextoFerramentas) => gates.origem ? { texto: ctx.mensagemOriginal, pedido: { id: ctx.pedidoId, user_id: ctx.escopo.userId, tenant_id: ctx.escopo.tenantId } } : null,
  autorizadoAgora: async () => {
    gates.autorizarChamadas++
    return gates.autorizado && gates.autorizarChamadas < gates.revogarNaChamada ? { total: gates.total, clientIds: new Set(gates.ids) } : null
  },
  prepararOfertaAcoesCadastro: async () => gates.oferta,
  registros: async (ctx: ContextoFerramentas, tabela: string) => {
    gates.leituras.push(tabela)
    return (gates.tabelas[tabela] ?? []).filter(r => r.tenant_id === ctx.escopo.tenantId)
  },
}))

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const [T, ATOR, PEDIDO, CLIENTE, NOVA, ANTIGA, VINCULO, PROPOSTA] = Array.from({ length: 8 }, (_, i) => id(i + 1))
const AGORA = new Date('2026-11-03T16:00:00Z')
const EXPIRA = new Date(AGORA.getTime() + 300_000).toISOString()
const FERRAMENTA = 'propor_atribuicoes_estrategistas'
const TEXTO = 'Íris, trocar estrategistas:\nCliente Alfa | Nora Silva'
const ATRIBUICAO = { cliente: 'Cliente Alfa', estrategista: 'Nora Silva' }

beforeEach(() => Object.assign(gates, { origem: true, autorizado: true, oferta: true, total: true,
  ids: [], autorizarChamadas: 0, revogarNaChamada: Infinity, tabelas: {}, leituras: [] }))

function previaUm(): Extract<PreviaAcaoChat, { acao: 'cliente_estrategista' }> {
  return { acao: 'cliente_estrategista', alvo_nome: 'Responsáveis operacionais',
    antes: { itens: [{ cliente_id: CLIENTE, cliente_nome: 'Cliente Alfa', assignment_id: VINCULO,
      estrategista_id: ANTIGA, estrategista_nome: 'Davi Costa', revisao: 3 }] },
    depois: { itens: [{ cliente_id: CLIENTE, cliente_nome: 'Cliente Alfa', user_id: NOVA, estrategista_nome: 'Nora Silva' }] } }
}

function montar(texto = TEXTO) {
  const estado = { capacidade: true, capacidadeErro: false, permissao: true, nomePersistido: '',
    resposta: null as Linha | null, erroPropor: false, codigo: 'ABCD1234', expira: EXPIRA }
  const tabelas: Record<string, Linha[]> = {
    clients: [{ id: CLIENTE, tenant_id: T, nome: 'Cliente Alfa', ativo: true }],
    users: [{ id: NOVA, tenant_id: T, nome: 'Nora Silva', ativo: true, perfil: 'estrategista' },
      { id: ANTIGA, tenant_id: T, nome: 'Davi Costa', ativo: true, perfil: 'estrategista' }],
    client_assignments: [{ id: VINCULO, tenant_id: T, client_id: CLIENTE, user_id: ANTIGA, tipo: 'estrategista', ativo: true }],
    client_assignment_state: [{ client_id: CLIENTE, tenant_id: T, revisao: 3 }],
    contratos: [{ id: id(30), tenant_id: T, cliente_id: CLIENTE, estrategista_id: ANTIGA, valor: 1000 }],
    comissoes: [{ id: id(31), tenant_id: T, user_id: ANTIGA, valor: 100 }],
  }
  gates.tabelas = tabelas
  const chamadas: { nome: string; args: Linha }[] = []
  const rpcs = {
    wa_agente_acoes_capacidades: () => {
      if (estado.capacidadeErro) throw new Error('RPC ausente')
      return { cliente_estrategista: estado.capacidade }
    },
    has_permissao_de: (a: Linha) => { chamadas.push({ nome: 'has_permissao_de', args: a }); return estado.permissao },
    wa_agente_acoes_propor: (a: Linha) => {
      chamadas.push({ nome: 'wa_agente_acoes_propor', args: a })
      if (estado.erroPropor) throw new Error('transporte')
      if (estado.resposta) return estado.resposta
      const itens = (a.p_novo as { itens: Linha[] }).itens
      const previa: Extract<PreviaAcaoChat, { acao: 'cliente_estrategista' }> = {
        acao: 'cliente_estrategista', alvo_nome: 'Responsáveis operacionais',
        antes: { itens: itens.map((item, i) => ({ cliente_id: String(item.cliente_id),
          cliente_nome: i === 0 && estado.nomePersistido ? estado.nomePersistido : String(tabelas.clients.find(c => c.id === item.cliente_id)?.nome),
          assignment_id: item.assignment_id as string | null, estrategista_id: item.assignment_id ? ANTIGA : null,
          estrategista_nome: item.assignment_id ? 'Davi Costa' : null, revisao: Number(item.expected_revision) })) },
        depois: { itens: itens.map((item, i) => ({ cliente_id: String(item.cliente_id),
          cliente_nome: i === 0 && estado.nomePersistido ? estado.nomePersistido : String(tabelas.clients.find(c => c.id === item.cliente_id)?.nome),
          user_id: String(item.user_id), estrategista_nome: String(tabelas.users.find(u => u.id === item.user_id)?.nome) })) },
      }
      return { ok: true, proposta_id: PROPOSTA, codigo: estado.codigo, expira_em: estado.expira, previa }
    },
  }
  const f = criarSupabaseFalso(tabelas, rpcs)
  const ctx: ContextoFerramentas = { admin: f.client, escopo: { tenantId: T, userId: ATOR, total: true,
    clientIds: new Set(), modo: 'normal', permissoes: { automacoes: true, contratos: true, chat: true } },
    agora: AGORA, pedidoId: PEDIDO, canal: 'grupo', mensagemOriginal: texto, nomeAgente: 'Íris',
    refs: { ref: () => 'C1', resolver: () => CLIENTE } as unknown as ContextoFerramentas['refs'], urlsVistas: new Set(), cache: {} }
  const executar = (atribuicoes: Linha[] = [ATRIBUICAO]) => executarAtribuicoes(FERRAMENTA, { atribuicoes }, ctx, () => AGORA)
  const propostas = () => chamadas.filter(c => c.nome === 'wa_agente_acoes_propor')
  return { ctx, f, tabelas, estado, chamadas, executar, propostas }
}

describe('gramática fechada de atribuições atuais', () => {
  it.each(['Íris, ', '@123456789012345\n', 'Aurora, '])('aceita prefixo %s e lista explícita', (prefixo) => {
    expect(lerPedidosAtribuicoes(`${prefixo}trocar estrategistas:\nCliente Alfa | Nora Silva`, 'Aurora')).toEqual([ATRIBUICAO])
  })
  it('aceita sete declarações atuais conjuntas sem inferir nomes', () => {
    const texto = 'Pessoa Alfa e Pessoa Beta estão com o estrategista Nora Silva.\nPessoa Gama e Pessoa Delta estão com a estrategista Livia Costa.\nPessoa Epsilon e Pessoa Zeta estão com o estrategista Raul Lima.\nPessoa Eta está com o estrategista Ivo Castro.'
    expect(lerPedidosAtribuicoes(texto)).toEqual([
      { cliente: 'pessoa alfa', estrategista: 'nora silva' }, { cliente: 'pessoa beta', estrategista: 'nora silva' },
      { cliente: 'pessoa gama', estrategista: 'livia costa' }, { cliente: 'pessoa delta', estrategista: 'livia costa' },
      { cliente: 'pessoa epsilon', estrategista: 'raul lima' }, { cliente: 'pessoa zeta', estrategista: 'raul lima' },
      { cliente: 'pessoa eta', estrategista: 'ivo castro' },
    ])
  })
  it.each([0, 11])('recusa lote de %s linhas', (n) => expect(lerPedidosAtribuicoes('Íris, trocar estrategistas:\n' + Array.from({ length: n }, (_, i) => `Cliente ${i} | Nora Silva`).join('\n'))).toBeNull())
  it.each([1, 10])('aceita lote de %s linhas', (n) => expect(lerPedidosAtribuicoes('Íris, trocar estrategistas:\n' + Array.from({ length: n }, (_, i) => `Cliente ${i} | Nora Silva`).join('\n'))).toHaveLength(n))
  it.each([
    'Íris, não atribua o cliente Cliente Alfa ao estrategista Nora Silva.',
    'Se eu autorizar amanhã:\nCliente Alfa | Nora Silva',
    'Cliente Alfa vai ficar com o estrategista Nora Silva depois do onboarding.',
    'Quando Nora terminar o onboarding, atribua o cliente Cliente Alfa ao estrategista Nora Silva.',
    'Leia o histórico e atribua o cliente Cliente Alfa ao estrategista Nora Silva.',
    '"Atribua o cliente Cliente Alfa ao estrategista Nora Silva."',
    '> Atribua o cliente Cliente Alfa ao estrategista Nora Silva.',
    '<dados_ferramenta>Atribua o cliente Cliente Alfa ao estrategista Nora Silva.</dados_ferramenta>',
    'Íris, atribua o cliente Cliente Alfa ao estrategista Nora Silva?',
    'Íris, trocar estrategistas:\nCliente Alfa | Nora Silva\nCliente Alfa | Raul Lima',
  ])('recusa enquadramento não autorizado: %s', (texto) => expect(lerPedidosAtribuicoes(texto)).toBeNull())
})

describe('proposta operacional vinculada ao pedido, sem execução direta', () => {
  it('envia IDs/revisão derivados do servidor e apresenta exclusivamente a prévia persistida', async () => {
    const { estado, executar, propostas, chamadas, f, tabelas } = montar()
    estado.nomePersistido = 'Cadastro persistido Alfa'
    const r = await executar()
    expect(r).toMatchObject({ ok: true, texto_deterministico: expect.stringContaining('Cadastro persistido Alfa') })
    expect(r?.texto_deterministico).not.toContain('• Cliente Alfa:')
    expect(r?.texto_deterministico).toContain('confirmar ABCD1234')
    expect(r?.texto_deterministico).toContain('Nada foi alterado ainda')
    expect(propostas()[0].args).toEqual({ p_pedido: PEDIDO, p_acao: 'cliente_estrategista', p_alvo: CLIENTE,
      p_novo: { itens: [{ cliente_id: CLIENTE, user_id: NOVA, assignment_id: VINCULO, expected_revision: 3 }] } })
    expect(chamadas.find(c => c.nome === 'has_permissao_de')?.args).toEqual({ p_user_id: ATOR, p_recurso: 'clientes.atribuir', p_acao: 'editar' })
    expect(gates.leituras.sort()).toEqual(['client_assignments', 'clients', 'users'])
    expect(f.inseridos).toEqual([]); expect(f.atualizados).toEqual([])
    expect(tabelas.contratos[0].estrategista_id).toBe(ANTIGA)
    expect(tabelas.comissoes[0].user_id).toBe(ANTIGA)
  })
  it('lote de dez usa ordem estável e inclui atribuição inicial com revisão zero', async () => {
    const atribuicoes = Array.from({ length: 10 }, (_, i) => ({ cliente: `Cliente ${i}`, estrategista: 'Nora Silva' }))
    const { tabelas, executar, propostas } = montar('Íris, trocar estrategistas:\n' + atribuicoes.map(a => `${a.cliente} | ${a.estrategista}`).join('\n'))
    tabelas.clients = atribuicoes.map((a, i) => ({ id: id(100 - i), tenant_id: T, nome: a.cliente, ativo: true }))
    tabelas.client_assignments = []; tabelas.client_assignment_state = []
    expect(await executar(atribuicoes)).toMatchObject({ ok: true })
    const itens = (propostas()[0].args.p_novo as { itens: Linha[] }).itens
    expect(itens).toHaveLength(10)
    expect(itens.map(i => i.cliente_id)).toEqual([...itens.map(i => i.cliente_id)].sort())
    expect(itens.every(i => i.assignment_id === null && i.expected_revision === 0)).toBe(true)
  })
  it('sete declarações conjuntas viram uma única proposta completa', async () => {
    const nomes = ['Pessoa Alfa', 'Pessoa Beta', 'Pessoa Gama', 'Pessoa Delta', 'Pessoa Epsilon', 'Pessoa Zeta', 'Pessoa Eta']
    const texto = `${nomes[0]} e ${nomes[1]} estão com o estrategista Nora Silva.\n${nomes[2]} e ${nomes[3]} estão com o estrategista Nora Silva.\n${nomes[4]} e ${nomes[5]} estão com o estrategista Nora Silva.\n${nomes[6]} está com o estrategista Nora Silva.`
    const { tabelas, executar, propostas } = montar(texto)
    tabelas.clients = nomes.map((nome, i) => ({ id: id(100 + i), tenant_id: T, nome, ativo: true }))
    tabelas.client_assignments = []; tabelas.client_assignment_state = []
    expect(await executar(nomes.map(cliente => ({ cliente, estrategista: 'Nora Silva' })))).toMatchObject({ ok: true })
    expect(propostas()).toHaveLength(1)
    expect((propostas()[0].args.p_novo as { itens: unknown[] }).itens).toHaveLength(7)
  })
  it('não aceita subconjunto nem nomes acrescentados à lista atual', async () => {
    const { executar, propostas } = montar('Íris, trocar estrategistas:\nCliente Alfa | Nora Silva\nCliente Beta | Raul Lima')
    expect(await executar()).toHaveProperty('erro')
    expect(await executar([ATRIBUICAO, { cliente: 'Cliente Beta', estrategista: 'Raul Lima' }, { cliente: 'Cliente Gama', estrategista: 'Raul Lima' }])).toHaveProperty('erro')
    expect(propostas()).toEqual([])
  })
  it('não aceita tenant, ator, IDs, revisão ou campos financeiros sugeridos pelo modelo', async () => {
    const { ctx, propostas } = montar()
    for (const extra of [{ tenant_id: T }, { actor_id: ATOR }, { p_pedido: PEDIDO }, { revisao: 0 }, { valor: 5 }]) {
      expect(await executarAtribuicoes(FERRAMENTA, { atribuicoes: [ATRIBUICAO], ...extra }, ctx)).toHaveProperty('erro')
      expect(await executarAtribuicoes(FERRAMENTA, { atribuicoes: [{ ...ATRIBUICAO, ...extra }] }, ctx)).toHaveProperty('erro')
    }
    expect(propostas()).toEqual([])
  })
  it.each(['autor', 'gt3', 'restrito', 'privado', 'origem', 'autorizacao', 'oferta', 'capacidade', 'rpc_ausente', 'permissao'])('fecha gate %s', async (gate) => {
    const { ctx, estado, executar, propostas } = montar()
    if (gate === 'autor') ctx.escopo.userId = null
    if (gate === 'gt3') ctx.escopo.politica = 'carteira_gt3'
    if (gate === 'restrito') ctx.escopo.modo = 'restrito'
    if (gate === 'privado') ctx.canal = 'privado'
    if (gate === 'origem') gates.origem = false
    if (gate === 'autorizacao') gates.autorizado = false
    if (gate === 'oferta') gates.oferta = false
    if (gate === 'capacidade') estado.capacidade = false
    if (gate === 'rpc_ausente') estado.capacidadeErro = true
    if (gate === 'permissao') estado.permissao = false
    expect(await executar()).toHaveProperty('erro')
    expect(propostas()).toEqual([])
  })
  it('capacidade ausente não oferece o fluxo e não amplia oferta ao desconhecido', async () => {
    const { ctx, estado } = montar()
    expect(await atribuicoesDisponiveis(ctx)).toBe(true)
    expect(ferramentasAtribuicoes(ctx.escopo, true).map(d => d.function.name)).toEqual([FERRAMENTA])
    estado.capacidadeErro = true
    expect(await atribuicoesDisponiveis(ctx)).toBe(false)
    expect(ferramentasAtribuicoes(ctx.escopo)).toEqual([])
    expect(ferramentasAtribuicoes({ ...ctx.escopo, userId: null }, true)).toEqual([])
    expect(ferramentasAtribuicoes({ ...ctx.escopo, politica: 'carteira_gt3' }, true)).toEqual([])
  })
  it.each(['cliente_duplicado', 'cliente_inativo', 'outro_tenant', 'carteira', 'vinculo_ambiguo', 'usuario_duplicado', 'usuario_inativo', 'usuario_cliente'])('recusa resolução %s', async (caso) => {
    const { tabelas, executar, propostas } = montar()
    if (caso === 'cliente_duplicado') tabelas.clients.push({ ...tabelas.clients[0], id: id(40) })
    if (caso === 'cliente_inativo') tabelas.clients[0].ativo = false
    if (caso === 'outro_tenant') tabelas.clients[0].tenant_id = id(99)
    if (caso === 'carteira') { gates.total = false; gates.ids = [] }
    if (caso === 'vinculo_ambiguo') tabelas.client_assignments.push({ ...tabelas.client_assignments[0], id: id(41), user_id: id(42) })
    if (caso === 'usuario_duplicado') tabelas.users.push({ ...tabelas.users[0], id: id(43) })
    if (caso === 'usuario_inativo') tabelas.users[0].ativo = false
    if (caso === 'usuario_cliente') tabelas.users[0].perfil = 'cliente'
    expect(await executar()).toHaveProperty('erro'); expect(propostas()).toEqual([])
  })
  it('aceita prefixo único de nome elegível e recusa prefixo ambíguo', async () => {
    const { executar, tabelas, propostas } = montar('Cliente Alfa está com o estrategista Nora.')
    expect(await executar([{ cliente: 'Cliente Alfa', estrategista: 'Nora' }])).toMatchObject({ ok: true })
    expect((propostas()[0].args.p_novo as { itens: Linha[] }).itens[0].user_id).toBe(NOVA)
    tabelas.users.push({ id: id(45), tenant_id: T, nome: 'Nora Lima', ativo: true, perfil: 'estrategista' })
    expect(await executar([{ cliente: 'Cliente Alfa', estrategista: 'Nora' }])).toHaveProperty('erro')
    expect(propostas()).toHaveLength(1)
  })
  it('histórico, negação e futuro não são reinterpretados como atribuição atual', async () => {
    for (const texto of ['Segundo o histórico, Cliente Alfa está com o estrategista Nora Silva.',
      'Cliente Alfa não está com o estrategista Nora Silva.', 'Cliente Alfa ficará com Nora Silva após o onboarding.']) {
      const { executar, propostas } = montar(texto)
      expect(await executar()).toHaveProperty('erro'); expect(propostas()).toEqual([])
    }
  })
  it('destino em onboarding sem cadastro elegível não gera proposta', async () => {
    const { executar, propostas } = montar('Íris, trocar estrategistas:\nCliente Alfa | Pessoa Futura')
    expect(await executar([{ cliente: 'Cliente Alfa', estrategista: 'Pessoa Futura' }])).toHaveProperty('erro')
    expect(propostas()).toEqual([])
  })
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '3'])('revisão inválida %s não gera proposta', async (revisao) => {
    const { tabelas, executar, propostas } = montar()
    tabelas.client_assignment_state[0].revisao = revisao
    expect(await executar()).toHaveProperty('erro'); expect(propostas()).toEqual([])
  })
  it('estado obsoleto recusado pela RPC não produz confirmação nem código', async () => {
    const { estado, executar, propostas } = montar()
    estado.resposta = { ok: false, codigo: 'estado_alterado', erro: 'texto arbitrário não confiável' }
    const r = await executar()
    expect(propostas()).toHaveLength(1)
    expect(r).toHaveProperty('erro'); expect(r).not.toHaveProperty('texto_deterministico')
    expect(JSON.stringify(r)).not.toContain('texto arbitrário')
  })
  it('simulação não cria proposta nem código executável', async () => {
    const { ctx, executar, propostas, f } = montar()
    ctx.simulacao = true
    const r = await executar()
    expect(r).toMatchObject({ ok: true, simulacao: true, texto_deterministico: expect.stringContaining('Simulação') })
    expect(r?.texto_deterministico).not.toContain('confirmar ABCD1234')
    expect(propostas()).toEqual([]); expect(f.inseridos).toEqual([]); expect(f.atualizados).toEqual([])
  })
  it('revalida autorização antes da proposta', async () => {
    const { executar, propostas } = montar()
    gates.revogarNaChamada = 2
    expect(await executar()).toMatchObject({ erro: expect.stringContaining('autorização mudou') })
    expect(propostas()).toEqual([])
  })
  it.each(['codigo', 'expirado', 'tipo', 'transporte'])('não confirma retorno inválido: %s', async (caso) => {
    const { estado, executar } = montar()
    if (caso === 'codigo') estado.codigo = 'invalid'
    if (caso === 'expirado') estado.expira = AGORA.toISOString()
    if (caso === 'tipo') estado.resposta = { ok: true, proposta_id: PROPOSTA, previa: { acao: 'cliente_ativo' } }
    if (caso === 'transporte') estado.erroPropor = true
    const r = await executar()
    expect(r).toHaveProperty('erro'); expect(r).not.toHaveProperty('texto_deterministico')
  })
})

describe('núcleo e recibo determinístico de atribuição', () => {
  it('valida ação fechada e rejeita qualquer ator/tenant no payload', () => {
    const acao = { acao: 'cliente_estrategista', alvo: CLIENTE, novo: { itens: [{ cliente_id: CLIENTE, user_id: NOVA, assignment_id: VINCULO, expected_revision: 3 }] } }
    expect(validarAcaoChat(acao)).toEqual(acao)
    expect(validarAcaoChat({ ...acao, ator: ATOR })).toBeNull()
    expect(validarAcaoChat({ ...acao, novo: { ...acao.novo, tenant_id: T } })).toBeNull()
    expect(validarAcaoChat({ ...acao, novo: { itens: [{ ...acao.novo.itens[0], ator_id: ATOR }] } })).toBeNull()
    expect(validarAcaoChat({ ...acao, novo: { itens: [acao.novo.itens[0], acao.novo.itens[0]] } })).toBeNull()
  })
  it('prévia exige código/prazo; recibo só vem de execução e preserva resultado literal', () => {
    const previa = previaUm()
    const texto = formatarPreviaAcaoChat({ ...previa, codigo: 'ABCD1234', expira_em: EXPIRA }, AGORA)
    expect(texto).toContain('Cliente Alfa: Davi Costa → Nora Silva')
    expect(texto).toContain('Contratos e comissões permanecem como estão')
    const recibo = formatarReciboAcaoChat({ proposta_id: PROPOSTA, pedido_confirmacao_id: PEDIDO,
      executada_em: AGORA.toISOString(), estado: 'executada', previa })
    expect(recibosAcoesCadastro([{ ok: true, texto_deterministico: recibo }])).toBe(recibo)
    expect(recibo).toContain('Alteração concluída'); expect(recibo).toContain(PROPOSTA)
    expect(() => formatarReciboAcaoChat({ proposta_id: PROPOSTA, pedido_confirmacao_id: PEDIDO,
      executada_em: AGORA.toISOString(), estado: 'pendente', previa } as never)).toThrow('Recibo inválido')
    expect(recibosAcoesCadastro([{ ok: true }])).not.toContain('Alteração concluída')
  })
})


describe('pedidos mistos e cobertura explícita', () => {
  const misto = '@Íris Não entendi o que seria “grupos ativos sem cliente vinculado”. Como podemos resolver isso? Natalie Geller e Raimundo de Sousa e Silva Filho estão com o estrategista Matheus Costa; Nahuel Costa Teles, Leandro Gejão Santos e Marcio Tonding Ferreira estão com a estrategista Vivian; Ezequiel está com o estrategista Rodrigo Diez Perez; Daniel Graziane da Silva Ruggio está com o estrategista Matheus Henrique; Rodrigo Santos Cohen e Gilson dos Santos Ramalho estão com o estrategista Octavio; Marcelo Lopez Reinecken está com o estrategista Abel Rodrigues (esse estrategista ainda não foi registrado). Herilly prado não é mais estrategista da empresa. Não entendi o que seria o pedido aberto da Rocket. GrowthMachine não está mais com o Octavio.'
  const clientesMisto = ['Natalie Geller', 'Raimundo de Sousa e Silva Filho', 'Nahuel Costa Teles', 'Leandro Gejão Santos', 'Marcio Tonding Ferreira', 'Ezequiel', 'Daniel Graziane da Silva Ruggio', 'Rodrigo Santos Cohen', 'Gilson dos Santos Ramalho', 'Marcelo Lopez Reinecken']
  it('extrai dez associações atuais sem transformar dúvidas, saída de equipe ou ausência de responsável em ação', () => {
    const pedidos = lerPedidosAtribuicoes(misto, 'Íris', clientesMisto)!
    expect(pedidos).toHaveLength(10)
    expect(pedidos[9]).toEqual({ cliente: 'marcelo lopez reinecken', estrategista: 'abel rodrigues' })
    expect(pedidos.some(p => /growthmachine|herilly|rocket/.test(p.cliente))).toBe(false)
  })
  it('propõe nove mudanças e aponta responsável ausente fora da prévia, sem omissão silenciosa', async () => {
    const pedidos = lerPedidosAtribuicoes(misto, 'Íris', clientesMisto)!
    const r = montar(misto)
    r.tabelas.clients = pedidos.map((p, i) => ({ id: id(i + 100), tenant_id: T, nome: p.cliente, ativo: true }))
    r.tabelas.users = [...new Set(pedidos.slice(0, 9).map(p => p.estrategista))].map((nome, i) => ({ id: id(i + 200), tenant_id: T, nome, ativo: true, perfil: 'estrategista' }))
    r.tabelas.client_assignments = []; r.tabelas.client_assignment_state = []
    const resposta = await r.executar(pedidos)
    expect(resposta).toMatchObject({ ok: true, texto_deterministico: expect.stringContaining('Pendentes (fora da proposta)') })
    expect(resposta?.texto_deterministico).toContain('marcelo lopez reinecken → abel rodrigues')
    expect(resposta?.texto_deterministico).toContain('somente os 9 itens')
    expect((r.propostas()[0].args.p_novo as { itens: unknown[] }).itens).toHaveLength(9)
  })
  it('item já correto não aborta mudanças nem cria operação redundante', async () => {
    const r = montar('Cliente Alfa e Cliente Beta estão com a estrategista Nora Silva.')
    r.tabelas.clients.push({ id: id(100), tenant_id: T, nome: 'Cliente Beta', ativo: true })
    r.tabelas.client_assignments[0].user_id = NOVA
    const resposta = await r.executar([ATRIBUICAO, { cliente: 'Cliente Beta', estrategista: 'Nora Silva' }])
    expect(resposta?.texto_deterministico).toContain('Já corretos (sem alteração)')
    expect((r.propostas()[0].args.p_novo as { itens: Linha[] }).itens.map(x => x.cliente_id)).toEqual([id(100)])
  })
  it('todos corretos não criam proposta; citação isolada não propõe ação', async () => {
    const r = montar(); r.tabelas.client_assignments[0].user_id = NOVA
    expect(await r.executar()).toMatchObject({ ok: true, sem_alteracao: true })
    expect(r.propostas()).toEqual([])
    expect(lerPedidosAtribuicoes('“Cliente Alfa está com o estrategista Nora Silva.” Qual a situação?')).toBeNull()
    expect(lerPedidosAtribuicoes('Não execute isto. Cliente Alfa está com o estrategista Nora Silva.')).toBeNull()
  })
})


it('candidatos de nome nunca inserem alvos ausentes nem apagam partes da cláusula', () => {
  const mensagem = 'Natalie Geller e Raimundo de Sousa e Silva Filho estão com o estrategista Nora.'
  expect(lerPedidosAtribuicoes(mensagem, 'Íris', ['Natalie Geller', 'Raimundo de Sousa e Silva Filho'])).toHaveLength(2)
  expect(lerPedidosAtribuicoes(mensagem, 'Íris', ['Natalie Geller', 'Raimundo'])).toBeNull()
  expect(lerPedidosAtribuicoes(mensagem, 'Íris', ['Natalie Geller'])).toBeNull()
})


it('não fabrica ordem juntando bordas de texto citado', () => {
  expect(lerPedidosAtribuicoes("Atribua o cliente Cliente Alfa 'não' ao estrategista Nora Silva.")).toBeNull()
  expect(lerPedidosAtribuicoes('“exemplo.” Cliente Alfa está com o estrategista Nora Silva.')).toBeNull()
})
