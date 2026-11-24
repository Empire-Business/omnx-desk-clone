import { describe, expect, it } from 'vitest'
import {
  DEFINICOES_NEGOCIO, categoriaContrato, executarNegocio, ferramentasNegocio, fimDoContrato, mesReferencia,
  parcelasDoContrato, periodoDe, type PermissoesNegocio,
} from './wa-agente-ferr-negocio.ts'
import { type ContextoFerramentas, MapaRefs } from './wa-agente-ferramentas.ts'
import { type EscopoAgente, escopoAcessoTotal, escopoRestrito } from './wa-agente-escopo.ts'
import { criarSupabaseFalso as criarFalsoBase, comClientesAtendidos } from './teste-supabase-falso.ts'
const criarSupabaseFalso: typeof criarFalsoBase = (tabelas, rpcs) => criarFalsoBase(comClientesAtendidos(tabelas), rpcs)

const T = 'tenant-1'
const AGORA = new Date('2026-10-26T15:00:00Z') // 12:00 em Brasília, segunda

function escopo(p: Partial<EscopoAgente> = {}, perm: Partial<PermissoesNegocio> = {}): EscopoAgente {
  return {
    tenantId: T, userId: 'u1', modo: 'normal', total: false, clientIds: new Set(['c1', 'c2']),
    permissoes: { contratos: false, chat: false, automacoes: false, ...perm } as PermissoesNegocio, ...p,
  }
}

function dados() {
  return {
    clients: [
      { id: 'c1', tenant_id: T, nome: 'Maria Souza', ativo: true, criado_em: '2026-10-20T12:00:00Z' },
      { id: 'c2', tenant_id: T, nome: 'João Prado', ativo: false, criado_em: '2025-01-01T12:00:00Z' },
      { id: 'c3', tenant_id: T, nome: 'Carla Fora', ativo: true, criado_em: '2026-10-21T12:00:00Z' },
      { id: 'x1', tenant_id: 'outro', nome: 'Outra Empresa', ativo: true, criado_em: '2026-10-21T12:00:00Z' },
    ],
    users: [
      { id: 'u1', tenant_id: T, nome: 'Ana Estrategista' },
      { id: 'u2', tenant_id: T, nome: 'Bruno Gestor' },
      { id: 'ux', tenant_id: 'outro', nome: 'Ana Outra' },
    ],
    client_assignments: [
      { tenant_id: T, client_id: 'c1', user_id: 'u1', tipo: 'estrategista', ativo: true },
      { tenant_id: T, client_id: 'c3', user_id: 'u2', tipo: 'estrategista', ativo: true },
    ],
    contratos: [
      { id: 'k1', tenant_id: T, cliente_id: 'c1', cliente_nome: 'Maria Souza', produto_nome: 'Plano A', estrategista_id: 'u1', status: 'ativo', status_secundario: 'INADIMPLENTE', data_fechamento: '2026-05-01', data_assinatura: '2026-05-01', data_pagamento: null, vencimento: null, plano_dias: 180, valor_total: 12000, valor_parcela: 1000, num_parcelas: 12, pagamentos: [], criado_em: '2026-05-01T00:00:00Z' },
      { id: 'k2', tenant_id: T, cliente_id: 'c2', cliente_nome: 'João Prado', produto_nome: 'Plano B', estrategista_id: 'u1', status: 'ativo', status_secundario: 'ATIVO', data_fechamento: '2026-10-05', data_assinatura: '2026-10-05', data_pagamento: null, vencimento: null, plano_dias: 365, valor_total: 6000, valor_parcela: 500, num_parcelas: 12, pagamentos: [{ data: '2026-10-05', valor: 1000, sinal: 'Entrada' }, { data: '2026-10-28', valor: 500 }, { data: '2026-11-28', valor: 500 }], criado_em: '2026-10-05T00:00:00Z' },
      { id: 'k3', tenant_id: T, cliente_id: 'c3', cliente_nome: 'Carla Fora', produto_nome: 'Plano A', estrategista_id: 'u2', status: 'pausado', status_secundario: 'PAUSADO', data_fechamento: '2026-01-01', data_assinatura: null, data_pagamento: null, vencimento: null, plano_dias: 90, valor_total: 3000, valor_parcela: null, num_parcelas: 1, pagamentos: [], criado_em: '2026-01-01T00:00:00Z' },
      { id: 'k4', tenant_id: T, cliente_id: null, cliente_nome: 'Sem Cadastro', produto_nome: 'Plano C', estrategista_id: null, status: 'rascunho', status_secundario: 'Não iniciado', data_fechamento: '1901-01-01', data_assinatura: null, data_pagamento: null, vencimento: null, plano_dias: null, valor_total: 0, valor_parcela: null, num_parcelas: 1, pagamentos: [], criado_em: '2026-10-25T00:00:00Z' },
      { id: 'kx', tenant_id: 'outro', cliente_id: 'x1', cliente_nome: 'Outra', produto_nome: 'X', estrategista_id: 'ux', status: 'ativo', status_secundario: 'INADIMPLENTE', data_fechamento: '2026-10-01', data_assinatura: null, data_pagamento: null, vencimento: null, plano_dias: 30, valor_total: 999, valor_parcela: null, num_parcelas: 1, pagamentos: [], criado_em: '2026-10-01T00:00:00Z' },
    ],
    meetings: [
      { id: 'm1', tenant_id: T, client_id: 'c1', contact_id: null, guest_name: null, status: 'completed', scheduled_at: '2026-10-26T13:00:00Z', created_by: 'u1', duration_seconds: 1800, meeting_type: 'sales_call' },
      { id: 'm2', tenant_id: T, client_id: 'c3', contact_id: null, guest_name: null, status: 'scheduled', scheduled_at: '2026-10-27T13:00:00Z', created_by: 'u2', duration_seconds: null, meeting_type: 'sales_call' },
      { id: 'm3', tenant_id: T, client_id: null, contact_id: 'ct-restrito', guest_name: 'Grupo Interno', status: 'scheduled', scheduled_at: '2026-10-26T18:00:00Z', created_by: 'u2', duration_seconds: null, meeting_type: 'sales_call' },
      { id: 'm4', tenant_id: T, client_id: 'c2', contact_id: null, guest_name: null, status: 'scheduled', scheduled_at: '2026-10-26T12:00:00Z', created_by: 'u1', duration_seconds: null, meeting_type: 'sales_call' },
      { id: 'mx', tenant_id: 'outro', client_id: 'x1', contact_id: null, guest_name: null, status: 'scheduled', scheduled_at: '2026-10-26T13:00:00Z', created_by: 'ux', duration_seconds: null, meeting_type: 'sales_call' },
    ],
    chat_contacts: [{ id: 'ct-restrito', tenant_id: T, restrito_admin: true }],
    comissoes: [
      { tenant_id: T, estrategista_id: 'u1', status: 'prevista', valor_calculado: 100, valor_final: null, eh_bonus: false, mes_referencia: '2026-10-01' },
      { tenant_id: T, estrategista_id: 'u1', status: 'paga', valor_calculado: 200, valor_final: 250, eh_bonus: false, mes_referencia: '2026-10-01' },
      { tenant_id: T, estrategista_id: 'u2', status: 'aprovada', valor_calculado: 300, valor_final: null, eh_bonus: true, mes_referencia: '2026-10-01' },
      { tenant_id: T, estrategista_id: 'u2', status: 'paga', valor_calculado: 50, valor_final: null, eh_bonus: false, mes_referencia: '2026-09-01' },
      { tenant_id: 'outro', estrategista_id: 'ux', status: 'paga', valor_calculado: 9999, valor_final: null, eh_bonus: false, mes_referencia: '2026-10-01' },
    ],
    vendas_pendentes: [
      { tenant_id: T, cliente_nome: 'Lead Um', produto_nome: 'Plano A', closer_nome: 'Closer X', status: 'pendente', criado_em: '2026-10-20T12:00:00Z', atendido_por: null, valor_total_venda: 5000, sincronizacao_erro: null, cliente_cpf_cnpj: '00011122233', cliente_whatsapp: '5511999998888' },
      { tenant_id: T, cliente_nome: 'Lead Dois', produto_nome: 'Plano B', closer_nome: 'Closer Y', status: 'em_atendimento', criado_em: '2026-10-24T12:00:00Z', atendido_por: 'u2', valor_total_venda: 3000, sincronizacao_erro: 'falhou', cliente_cpf_cnpj: '1', cliente_whatsapp: '2' },
      { tenant_id: T, cliente_nome: 'Lead Três', produto_nome: 'Plano B', closer_nome: 'Closer Y', status: 'concluida', criado_em: '2026-10-01T12:00:00Z', atendido_por: 'u2', valor_total_venda: 3000, sincronizacao_erro: null },
      { tenant_id: 'outro', cliente_nome: 'Lead Outro', produto_nome: 'X', closer_nome: 'Z', status: 'pendente', criado_em: '2026-10-20T12:00:00Z', atendido_por: null, valor_total_venda: 1, sincronizacao_erro: null },
    ],
    atendimento_etapas: [
      { id: 'e1', tenant_id: T, nome: 'A fazer', is_final: false },
      { id: 'e2', tenant_id: T, nome: 'Concluído', is_final: true },
    ],
    atendimento_demandas: [
      { tenant_id: T, codigo: 'D-1', cliente_id: 'c1', etapa_id: 'e1', titulo: 'Arte do post', prioridade: 'alta', prazo: '2026-10-20', responsavel_id: 'u1', concluida_em: null },
      { tenant_id: T, codigo: 'D-2', cliente_id: 'c3', etapa_id: 'e1', titulo: 'Fora da carteira', prioridade: 'urgente', prazo: '2026-10-30', responsavel_id: 'u2', concluida_em: null },
      { tenant_id: T, codigo: 'D-3', cliente_id: 'c1', etapa_id: 'e2', titulo: 'Já feita', prioridade: 'baixa', prazo: '2026-10-01', responsavel_id: 'u1', concluida_em: null },
    ],
    chat_conversations: [
      { id: 'v1', tenant_id: T, is_group: false, arquivada: false, status: 'aberta', aguardando_resposta: true, ultima_msg_cliente_em: '2026-10-26T10:00:00Z' },
      { id: 'v2', tenant_id: T, is_group: false, arquivada: false, status: 'em_atendimento', aguardando_resposta: true, ultima_msg_cliente_em: '2026-09-01T10:00:00Z' },
      { id: 'v3', tenant_id: T, is_group: true, arquivada: false, status: 'aberta', aguardando_resposta: true, ultima_msg_cliente_em: '2026-10-26T10:00:00Z' },
      { id: 'vx', tenant_id: 'outro', is_group: false, arquivada: false, status: 'aberta', aguardando_resposta: true, ultima_msg_cliente_em: '2026-10-26T10:00:00Z' },
    ],
    wa_auto_satisfacao: [
      { tenant_id: T, client_id: 'c1', contact_id: null, nivel: 'insatisfeito', created_at: '2026-10-26T10:00:00Z' },
      { tenant_id: T, client_id: 'c1', contact_id: null, nivel: 'satisfeito', created_at: '2026-10-25T10:00:00Z' },
      { tenant_id: T, client_id: 'c3', contact_id: null, nivel: 'insatisfeito', created_at: '2026-10-26T10:00:00Z' },
    ],
  }
}

function ctx(e: EscopoAgente = escopo()) {
  const f = criarSupabaseFalso(dados())
  const c: ContextoFerramentas = { admin: f.client, escopo: e, agora: AGORA, refs: new MapaRefs(), urlsVistas: new Set(), nomeAgente: 'Anah' }
  return { c, f }
}

function semVazamento(f: ReturnType<typeof criarSupabaseFalso>) {
  expect(f.consultas.length).toBeGreaterThan(0)
  for (const q of f.consultas) expect(q.filtros, q.tabela).toContain('eq:tenant_id')
  for (const q of f.consultas) expect(q.operacao).toBe('select')
}

describe('regras puras', () => {
  it('categoria do contrato', () => {
    expect(categoriaContrato({ status: 'ativo', status_secundario: 'INADIMPLENTE' })).toBe('inadimplente')
    expect(categoriaContrato({ status: 'ativo', status_secundario: 'Não iniciado' })).toBe('nao_iniciado')
    expect(categoriaContrato({ status: 'rascunho', status_secundario: null })).toBe('nao_iniciado')
    expect(categoriaContrato({ status: 'pausado', status_secundario: 'ATIVO' })).toBe('pausado')
    expect(categoriaContrato({ status: 'cancelado', status_secundario: 'INADIMPLENTE' })).toBe('cancelado')
    expect(categoriaContrato({ status: 'concluido', status_secundario: null })).toBe('concluido')
    expect(categoriaContrato({ status: 'ativo', status_secundario: 'FASE DE RENOVAÇÃO' })).toBe('ativo')
  })

  it('fim do contrato: início + plano; sem plano usa vencimento; ignora 1901', () => {
    expect(fimDoContrato({ data_assinatura: '2026-05-01', data_fechamento: null, plano_dias: 180, vencimento: null })).toBe('2026-10-28')
    expect(fimDoContrato({ data_assinatura: null, data_fechamento: '1901-01-01', plano_dias: 30, vencimento: '2026-12-01' })).toBe('2026-12-01')
    expect(fimDoContrato({ data_assinatura: null, data_fechamento: null, plano_dias: null, vencimento: null })).toBeNull()
  })

  it('períodos e mês de referência no fuso', () => {
    expect(periodoDe('mes_atual', AGORA, 'mes_atual')).toMatchObject({ de: '2026-10-01', ate: '2026-10-26' })
    expect(periodoDe(undefined, AGORA, 'ultimos_7_dias')).toMatchObject({ de: '2026-10-20', ate: '2026-10-26' })
    expect(periodoDe('mes_passado', new Date('2026-01-10T12:00:00Z'), 'mes_atual')).toMatchObject({ de: '2025-12-01', ate: '2025-12-31' })
    expect(periodoDe('2026-02', AGORA, 'mes_atual')).toMatchObject({ de: '2026-02-01', ate: '2026-02-28' })
    expect(periodoDe('2026-13', AGORA, 'mes_atual')).toBeNull()
    // 01/11 02:00 UTC ainda é 31/10 em Brasília
    expect(mesReferencia('atual', new Date('2026-11-01T02:00:00Z'))).toBe('2026-10-01')
    expect(mesReferencia('anterior', AGORA)).toBe('2026-09-01')
    expect(mesReferencia('2026-1', AGORA)).toBeNull()
  })

  it('parcelas: pula entrada; deriva do cronograma; só ativo', () => {
    const base = { id: 'k', status: 'ativo', data_assinatura: '2026-01-31', data_fechamento: null, num_parcelas: 3, valor_parcela: 100 }
    expect(parcelasDoContrato({ ...base, pagamentos: [{ data: '2026-02-01', valor: 50, sinal: 'Entrada' }, { data: '2026-03-01', valor: 70 }] }))
      .toEqual([{ data: '2026-03-01', valor: 70, contrato: 'k' }])
    expect(parcelasDoContrato({ ...base, pagamentos: [] }).map((p) => p.data)).toEqual(['2026-03-03', '2026-03-31', '2026-05-01'])
    expect(parcelasDoContrato({ ...base, status: 'pausado', pagamentos: [] })).toEqual([])
  })
})

describe('disponibilidade', () => {
  it('restrito → nenhuma; execução recusa', async () => {
    const e = escopoRestrito(T, 'u1', 'participante_externo')
    expect(ferramentasNegocio(e)).toEqual([])
    const { c } = ctx(e)
    expect(await executarNegocio('visao_geral', {}, c)).toMatchObject({ erro: expect.stringContaining('fora da equipe') })
  })

  it('nome que não é deste módulo → null', async () => {
    const { c } = ctx()
    expect(await executarNegocio('buscar_cliente', { nome: 'x' }, c)).toBeNull()
  })

  it('gates por permissão', () => {
    const nomes = (e: EscopoAgente) => ferramentasNegocio(e).map((d) => d.function.name)
    const sem = nomes(escopo({ participantesMembros: 2 }))
    expect(sem).not.toContain('recebiveis_resumo')
    expect(sem).not.toContain('vendas_pendentes')
    expect(sem).not.toContain('demandas_resumo')
    expect(sem).not.toContain('comissoes_resumo') // grupo, não gestor
    expect(nomes(escopo())).toContain('comissoes_resumo') // privado: as próprias
    expect(nomes(escopo({}, { contratos: true, onboarding: true, atendimento: true }))).toEqual(
      expect.arrayContaining(['recebiveis_resumo', 'vendas_pendentes', 'demandas_resumo']))
    const acessoTotal = nomes(escopoAcessoTotal(T, null))
    expect(DEFINICOES_NEGOCIO).toHaveProperty('reunioes_periodo') // implementação preservada dormente
    expect(acessoTotal).not.toContain('reunioes_periodo')
    expect(acessoTotal.sort()).toEqual(Object.keys(DEFINICOES_NEGOCIO).filter((n) => n !== 'reunioes_periodo').sort())
  })

  it('schemas fechados', () => {
    for (const d of Object.values(DEFINICOES_NEGOCIO)) expect(d.function.parameters.additionalProperties).toBe(false)
  })
})

describe('contratos', () => {
  it('resumo da carteira parcial: sem outro tenant, sem fora da carteira, sem valores', async () => {
    const { c, f } = ctx()
    const r = await executarNegocio('contratos_resumo', {}, c) as Record<string, any>
    expect(r.total_contratos).toBe(2)
    expect(r.por_situacao).toMatchObject({ inadimplente: 1, ativo: 1, pausado: 0, nao_iniciado: 0 })
    expect(r.novos).toEqual({ periodo: '10/2026 (até hoje)', quantidade: 1 })
    expect(r.vencendo_30_dias).toBe(1) // k1 termina 28/10
    expect(r.valor_ativos).toBeUndefined()
    expect(r.aviso).toMatch(/Valores ocultos/)
    expect(JSON.stringify(r)).not.toContain('Outra')
    semVazamento(f)
  })

  it('resumo com carteira total e valores', async () => {
    const { c } = ctx(escopo({ total: true }, { contratos: true }))
    const r = await executarNegocio('contratos_resumo', { periodo: 'ano_atual' }, c) as Record<string, any>
    expect(r.total_contratos).toBe(4)
    expect(r.por_situacao).toMatchObject({ ativo: 1, inadimplente: 1, pausado: 1, nao_iniciado: 1 })
    expect(r.valor_ativos).toBe(18000)
    expect(r.ticket_medio).toBe(9000)
    expect(r.por_estrategista[0]).toMatchObject({ estrategista: 'Ana Estrategista', vigentes: 2, valor: 18000 })
  })

  it('listar inadimplentes devolve ref e respeita estrategista', async () => {
    const { c, f } = ctx(escopo({ total: true }))
    const r = await executarNegocio('listar_contratos', { filtro: 'inadimplentes' }, c) as Record<string, any>
    expect(r.quantidade).toBe(1)
    expect(r.contratos[0]).toMatchObject({ cliente: 'Maria Souza', ref: 'C1', estrategista: 'Ana Estrategista', termina: '28/10/2026' })
    expect(c.refs.resolver('C1')).toBe('c1')
    const r2 = await executarNegocio('listar_contratos', { filtro: 'pausados', estrategista: 'ana' }, c) as Record<string, any>
    expect(r2.quantidade).toBe(0)
    const r3 = await executarNegocio('listar_contratos', { filtro: 'nao_iniciados' }, c) as Record<string, any>
    expect(r3.contratos[0]).toMatchObject({ sem_cadastro: true })
    semVazamento(f)
  })

  it('filtro inválido → erro', async () => {
    const { c } = ctx()
    expect(await executarNegocio('listar_contratos', { filtro: 'todos' }, c)).toMatchObject({ erro: expect.any(String) })
    expect(await executarNegocio('listar_contratos', '{quebrado', c)).toEqual({ erro: 'Argumentos inválidos.' })
  })
})

describe('clientes', () => {
  it('totais e filtros na carteira', async () => {
    const { c, f } = ctx()
    const r = await executarNegocio('listar_clientes', {}, c) as Record<string, any>
    expect(r.totais).toEqual({ ativos: 1, inativos: 1 })
    expect(r.clientes).toEqual([{ ref: 'C1', nome: 'Maria Souza', ativo: true, estrategista: ['Ana Estrategista'] }])
    const novos = await executarNegocio('listar_clientes', { filtro: 'novos' }, c) as Record<string, any>
    expect(novos.clientes.map((x: { nome: string }) => x.nome)).toEqual(['Maria Souza'])
    const semE = await executarNegocio('listar_clientes', { filtro: 'sem_estrategista' }, c) as Record<string, any>
    expect(semE.clientes.map((x: { nome: string }) => x.nome)).toEqual(['João Prado'])
    semVazamento(f)
  })

  it('por estrategista (carteira total)', async () => {
    const { c } = ctx(escopo({ total: true }))
    const r = await executarNegocio('listar_clientes', { estrategista: 'Bruno' }, c) as Record<string, any>
    expect(r.clientes.map((x: { nome: string }) => x.nome)).toEqual(['Carla Fora'])
  })
})

describe('recebíveis', () => {
  it('sem permissão de contratos → erro', async () => {
    const { c } = ctx(escopo())
    expect(await executarNegocio('recebiveis_resumo', {}, c)).toMatchObject({ erro: expect.any(String) })
  })

  it('por mês e próximos 7 dias, sem a entrada', async () => {
    const { c, f } = ctx(escopo({ total: true }, { contratos: true }))
    const r = await executarNegocio('recebiveis_resumo', { meses: 2 }, c) as Record<string, any>
    // k2: 28/10 e 28/11 (500 cada). k1: cronograma derivado — 01/11 (1000). k3 pausado, k4 rascunho.
    expect(r.por_mes).toEqual([
      { mes: '10/2026', valor: 500, parcelas: 1, contratos: 1 },
      { mes: '11/2026', valor: 1500, parcelas: 2, contratos: 2 },
    ])
    expect(r.proximos_7_dias.valor).toBe(1500)
    expect(r.proximos_7_dias.parcelas[0]).toMatchObject({ dia: '28/10/2026', cliente: 'João Prado' })
    semVazamento(f)
  })
})

describe('comissões', () => {
  it('gestor vê o mês inteiro por estrategista, só do tenant', async () => {
    const { c, f } = ctx(escopo({ participantesMembros: 2 }, { comissoes: true }))
    const r = await executarNegocio('comissoes_resumo', { mes: '2026-10' }, c) as Record<string, any>
    expect(r.quantidade).toBe(3)
    expect(r.total).toBe(650)
    expect(r.bonus).toBe(1)
    expect(r.por_estrategista[0]).toMatchObject({ estrategista: 'Ana Estrategista', total: 350, prevista: 100, paga: 250 })
    expect(r.por_estrategista[1]).toMatchObject({ estrategista: 'Bruno Gestor', total: 300, aprovada: 300 })
    semVazamento(f)
  })

  it('não gestor no privado: só as próprias aprovadas/pagas', async () => {
    const { c } = ctx(escopo())
    const r = await executarNegocio('comissoes_resumo', {}, c) as Record<string, any>
    expect(r).toMatchObject({ quantidade: 1, total: 250, escopo: expect.stringContaining('suas') })
    expect(r.por_estrategista).toBeUndefined()
  })

  it('não gestor em grupo → recusa', async () => {
    const { c } = ctx(escopo({ participantesMembros: 3 }))
    expect(await executarNegocio('comissoes_resumo', {}, c)).toMatchObject({ erro: expect.any(String) })
  })
})

describe('agenda indisponível até configurar a integração', () => {
  for (const total of [false, true]) {
    it(`não oferece nem executa consulta por período (carteira ${total ? 'total' : 'parcial'})`, async () => {
      const { c, f } = ctx(escopo({ total }))
      const disponiveis = ferramentasNegocio(c.escopo)
      expect(disponiveis.map((d) => d.function.name)).not.toContain('reunioes_periodo')
      expect(JSON.stringify(disponiveis)).not.toMatch(/reuni[ãõ]|reunioes|agend/i)
      for (const args of [
        { de: 'hoje', ate: 'amanha' },
        { de: 'hoje', ate: 'amanha', pessoa: 'bruno' },
        { de: '2026-01-01', ate: '2026-10-26' },
      ]) {
        expect(await executarNegocio('reunioes_periodo', args, c)).toEqual({ erro: 'A integração de agenda ainda não está disponível.' })
      }
      expect(f.consultas).toEqual([])
      expect(f.inseridos).toEqual([])
      expect(f.atualizados).toEqual([])
    })
  }
})

describe('onboarding de vendas', () => {
  it('fila aberta sem dados pessoais; valores só com contratos', async () => {
    const { c, f } = ctx(escopo({}, { onboarding: true }))
    const r = await executarNegocio('vendas_pendentes', {}, c) as Record<string, any>
    expect(r.quantidade).toBe(2)
    expect(r.mais_antiga_dias).toBe(6)
    expect(r.com_erro_de_sincronizacao).toBe(1)
    expect(r.vendas[1]).toMatchObject({ cliente: 'Lead Dois', atendido_por: 'Bruno Gestor' })
    expect(r.vendas[0].valor).toBeUndefined()
    const txt = JSON.stringify(r)
    expect(txt).not.toContain('00011122233')
    expect(txt).not.toContain('5511999998888')
    expect(txt).not.toContain('Lead Outro')
    semVazamento(f)
  })
})

describe('demandas', () => {
  it('abertas da carteira, atrasadas e etapa final fora', async () => {
    const { c, f } = ctx(escopo({}, { atendimento: true }))
    const r = await executarNegocio('demandas_resumo', {}, c) as Record<string, any>
    expect(r.abertas).toBe(1)
    expect(r.atrasadas).toBe(1)
    expect(r.destaques[0]).toMatchObject({ codigo: 'D-1', cliente: 'Maria Souza', ref: 'C1', atrasada: true, responsavel: 'Ana Estrategista' })
    semVazamento(f)
  })
})

describe('visão geral', () => {
  it('carteira total com tudo liberado (grupo veem tudo)', async () => {
    const { c, f } = ctx(escopoAcessoTotal(T, null))
    const r = await executarNegocio('visao_geral', {}, c) as Record<string, any>
    expect(r.clientes).toEqual({ ativos: 2, inativos: 1 })
    expect(r.contratos).toMatchObject({ ativos: 1, inadimplentes: 1, pausados: 1, nao_iniciados: 1, vencendo_30_dias: 1, valor_ativos: 18000 })
    expect(r).not.toHaveProperty('reunioes_7_dias')
    expect(f.consultas.some((q) => q.tabela === 'meetings')).toBe(false)
    expect(r.dica).not.toMatch(/reuni|agend/i)
    expect(r.conversas).toEqual({ abertas_individuais: 2, aguardando_resposta_7_dias: 1 })
    expect(r.satisfacao_7_dias).toEqual({ insatisfeitos: 2, atencao: 0 })
    expect(r.vendas_para_cadastrar).toBe(2)
    expect(r.demandas).toEqual({ abertas: 2, atrasadas: 1 })
    semVazamento(f)
  })

  it('carteira parcial sem permissões: sem chat, sem valores, sem vendas/demandas', async () => {
    const { c } = ctx()
    const r = await executarNegocio('visao_geral', {}, c) as Record<string, any>
    expect(r.clientes).toEqual({ ativos: 1, inativos: 1 })
    expect(r.contratos.valor_ativos).toBeUndefined()
    expect(r.conversas).toBeUndefined()
    expect(r.satisfacao_7_dias).toEqual({ insatisfeitos: 1, atencao: 0 })
    expect(r.vendas_para_cadastrar).toBeUndefined()
    expect(r.demandas).toBeUndefined()
  })
})

it('sem_contrato exclui beneficiário adicional sem consultar financeiro', async () => {
  const d = comClientesAtendidos(dados())
  d.contratos = d.contratos.filter(c => c.id !== 'k2')
  d.contrato_clientes_atendidos = [
    { tenant_id:T, contrato_id:'k1', cliente_id:'c1', principal:true },
    { tenant_id:T, contrato_id:'k1', cliente_id:'c2', principal:false },
  ]
  const f = criarFalsoBase(d)
  const c = { ...ctx().c, admin:f.client }
  const colunas: string[] = []
  const from = f.client.from.bind(f.client)
  f.client.from = (tabela: string) => {
    const q = from(tabela), select = q.select.bind(q)
    q.select = (cols: string, opts?: unknown) => { if(tabela === 'contratos') colunas.push(cols); return select(cols,opts) }
    return q
  }
  const r = await executarNegocio('listar_clientes',{filtro:'sem_contrato'},c) as Record<string,unknown>
  expect(r.quantidade).toBe(0)
  expect(r.clientes).toEqual([])
  expect(colunas.join(',')).not.toMatch(/valor|pagamento|cpf|cliente_nome|num_parcelas/)
})
