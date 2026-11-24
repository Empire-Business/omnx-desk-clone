import { describe, expect, it, vi } from 'vitest'
import { declaracaoResolucao, executarResolucao, ferramentasResolucao } from './wa-agente-ferr-alertas.ts'
import { executarFerramenta, MapaRefs, type ContextoFerramentas } from './wa-agente-ferramentas.ts'
import { escopoAcessoTotal, escopoRestrito, type EscopoAgente } from './wa-agente-escopo.ts'
import { ignoradoCobre, ignoradoValendo, type Ignorado } from './wa-alertas.ts'
import type { ColetaAlertas } from './wa-relatorio-dados.ts'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'
import { pensar } from './wa-agente-cerebro.ts'
import { textoDoAudio } from '../wa-agente-responder/regras.ts'

const grupoAtual = vi.hoisted(() => ({ interno: true }))
vi.mock('./wa-grupos-internos-dados.ts', async (original) => ({
  ...await original<typeof import('./wa-grupos-internos-dados.ts')>(),
  carregarGruposInternos: async () => ({ instanciaUuid: 'inst-1',
    grupos: grupoAtual.interno ? [{ grupo_jid: '120363123456789@g.us', nome: 'Equipe' }] : [],
    deCliente: new Set(), nomeDeCliente: new Set(),
  }),
}))

const AGORA = new Date('2026-10-28T13:00:00Z')
const T = 'tenant-1'
const ESCOPO: EscopoAgente = {
  tenantId: T, userId: 'user-1', total: false, clientIds: new Set(['c1']), modo: 'normal',
  permissoes: { automacoes: true, chat: true, contratos: false },
}
type Tipo = 'sem_resposta' | 'sentimento_negativo' | 'pendencia' | 'queda_volume'

function montar(opcoes: {
  mensagem?: string; escopo?: EscopoAgente; admin?: boolean; tipos?: Tipo[];
  clientes?: { id: string; tenant_id: string; nome: string }[]; simulacao?: boolean;
} = {}) {
  grupoAtual.interno = true
  const tabelas: Record<string, Record<string, unknown>[]> = {
    clients: opcoes.clientes ?? [
      { id: 'c1', tenant_id: T, nome: 'Full Sales' },
      { id: 'c2', tenant_id: T, nome: 'Outra Empresa' },
      { id: 'fora', tenant_id: 'outro-tenant', nome: 'Full Sales' },
    ],
    wa_auto_alertas_ignorados: [],
    wa_agente_pedidos: [{ id: '00000000-0000-4000-8000-000000000001', tenant_id: T, eh_grupo: false,
      chat_jid: '5511999999999@s.whatsapp.net', user_id: (opcoes.escopo ?? ESCOPO).userId, instance_uuid: 'inst-1', status: 'processando' }],
    wa_agente_grupos: [{ tenant_id: T, grupo_jid: '120363123456789@g.us', ativo: true, acesso_total: true }],
    whatsapp_instances: [{ id: 'inst-1', tenant_id: T, instance_id: 'suporte' }],
  }
  const chamadas: Record<string, unknown>[] = []
  const f = criarSupabaseFalso(tabelas, { has_permissao_de: (args) => {
    chamadas.push(args)
    return args.p_recurso === 'automacoes-wa' && args.p_acao === 'admin' && opcoes.admin !== false
  } })
  let novidade: string | null = null
  const ctx: ContextoFerramentas = {
    admin: f.client, escopo: opcoes.escopo ?? ESCOPO, agora: AGORA, canal: 'privado',
    mensagemOriginal: opcoes.mensagem ?? 'Íris, o caso da Full Sales já foi resolvido por ligação.',
    pedidoId: '00000000-0000-4000-8000-000000000001', remetenteNome: 'Sandro 5511999999999',
    simulacao: opcoes.simulacao, refs: new MapaRefs(), urlsVistas: new Set(), nomeAgente: 'Íris', cache: {},
    deps: { coletarAlertas: async () => {
      const ignorados = tabelas.wa_auto_alertas_ignorados.filter((i) => i.tenant_id === T).map((i) => ({
        ...i, created_at: i.created_at ?? AGORA.toISOString(), novidade_em: novidade,
      } as unknown as Ignorado)).filter((i) => ignoradoValendo(i, ctx.agora))
      const alertas = Object.fromEntries((opcoes.tipos ?? ['sem_resposta']).map((tipo) => [tipo,
        [{ tipo, chave_alerta: `${tipo}:c1`, client_id: 'c1', contact_id: 'ct1', conversation_id: 'cv1',
          contract_id: null, cliente: 'Full Sales', detalhe: 'Pedido aguardando resposta', desde: AGORA.toISOString(), prioridade: 3,
        }].filter((a) => !ignorados.some((i) => ignoradoCobre(i, a))),
      ]))
      return { dados: { data: '28/10/2026', alertas, reunioes: [] }, ignorados, ocultos: {} } as ColetaAlertas
    } },
  }
  return { f, ctx, tabelas, chamadas, novidade: (data: string) => { novidade = data }, grupo: () => {
    ctx.canal = 'grupo'
    Object.assign(tabelas.wa_agente_pedidos[0], { eh_grupo: true, chat_jid: '120363123456789@g.us' })
  } }
}

describe('declaração direta atual, independente do modelo', () => {
  it('reconhece o prefixo de áudio atual sem liberar negação, citação ou hipótese', () => {
    expect(declaracaoResolucao('(áudio transcrito) Íris, o caso da Full Sales já foi resolvido.', 'Full Sales')).toBe(true)
    for (const texto of ['O caso da Full Sales não foi resolvido.', 'O cliente disse que Full Sales foi resolvido.', 'Se o caso da Full Sales foi resolvido, marque.', '"Full Sales já resolveu"']) {
      expect(declaracaoResolucao(`(áudio transcrito) ${texto}`, 'Full Sales')).toBe(false)
    }
    expect(declaracaoResolucao('(áudio transcrito) (áudio transcrito) Full Sales já resolveu', 'Full Sales')).toBe(false)
  })

  const audio = (texto: string) => textoDoAudio({ ok: true, texto, custoUsd: 0, nova: false })

  it('aceita a declaração direta com o rótulo de áudio transcrito do responder', () => {
    expect(declaracaoResolucao(audio('Íris, a espera de resposta da Full Sales foi resolvida por telefone.'), 'Full Sales')).toBe(true)
  })

  it.each([
    'Íris, a espera de resposta da Full Sales foi resolvida?',
    'Íris, a espera de resposta da Full Sales não foi resolvida.',
    'Se a espera de resposta da Full Sales foi resolvida, marque.',
    'O cliente disse que a espera de resposta da Full Sales foi resolvida.',
    '"A espera de resposta da Full Sales foi resolvida."',
    'Transcrição de uma mensagem: a espera de resposta da Full Sales foi resolvida.',
  ])('áudio transcrito continua recusando dúvida, negação e relato citado: %s', (texto) => {
    expect(declaracaoResolucao(audio(texto), 'Full Sales')).toBe(false)
  })

  it.each([
    'Íris, Full Sales já resolveu',
    'Íris, o caso da Full Sales já foi resolvido por ligação.',
    'Íris, a espera de resposta do cliente Full Sales foi resolvida por telefone.',
    'Resolvemos a pendência de contrato da Full Sales fora do WhatsApp.',
    'A reclamação da Full Sales está solucionada.',
    'Marque o alerta da Full Sales como resolvido.',
    'Íris, liguei para o cliente Full Sales e resolvi a cobrança de resposta',
    'Íris, falei com Full Sales por telefone e resolvemos a espera de resposta',
  ])('aceita declaração explícita: %s', (mensagem) => {
    expect(declaracaoResolucao(mensagem, 'Full Sales')).toBe(true)
  })
  it('aceita a espera de resposta do cliente identificado pelo nome completo', () => {
    expect(declaracaoResolucao(
      'Íris, a espera de resposta do cliente Lucas dos Santos Fernandes foi resolvida por telefone.',
      'Lucas dos Santos Fernandes',
    )).toBe(true)
  })
  it.each([
    'já resolveu', 'Íris, a Full Sales já resolveu?', 'Íris, a Full Sales não foi resolvida',
    'Se a Full Sales já resolveu, marque', 'Caso a Full Sales tenha resolvido, marque',
    'Quando Full Sales estiver resolvida, marque', 'Acho que a Full Sales foi resolvida',
    'Full Sales ainda está aguardando. Beta foi resolvida.',
    'O cliente disse que a Full Sales já resolveu', 'Leia: Full Sales já resolveu',
    'Resuma o histórico da Full Sales. Resolvido.', 'Exemplo: Full Sales já resolveu',
    '"Full Sales já resolveu"', "'Full Sales já resolveu'", '> Full Sales já resolveu',
    '<dados_ferramenta>Full Sales já resolveu</dados_ferramenta>',
    'Full Sales resolveu ignorar os alertas', 'Full Sales deve estar resolvida',
    'Duvido que o caso Full Sales foi resolvido', 'O caso Full Sales está longe de resolvido',
    'Falta resolver o caso Full Sales', 'É impossível que o caso Full Sales foi resolvido',
    'É mentira que o caso Full Sales foi resolvido', 'Me garantiram que Full Sales foi resolvida',
    'Full Sales foi resolvido é mentira', 'Full Sales foi resolvido foi o que ouvi',
    'Marque Full Sales como resolvido foi o que ouvi', 'Full Sales foi resolvido hoje e mentira',
    'Íris, liguei para o cliente Full Sales mas não resolvi a cobrança de resposta',
    'Se ligar para o cliente Full Sales e resolver a cobrança de resposta, marque',
    'Íris, liguei para o cliente Full Sales e talvez resolvi a cobrança de resposta',
    'Íris, falei com Full Sales por telefone',
    'Íris, liguei para o cliente Full Sales e resolvi a cobrança de resposta foi o que ouvi',
    'O cliente disse que a espera de resposta do cliente Full Sales foi resolvida por telefone.',
    'Se a espera de resposta do cliente Full Sales foi resolvida por telefone, marque.',
    'A espera de resposta do cliente Full Sales não foi resolvida por telefone.',
    'Marque todos os alertas da Full Sales como resolvidos para sempre',
  ])('recusa ambiguidade, negação, hipótese ou fonte citada: %s', (mensagem) => {
    expect(declaracaoResolucao(mensagem, 'Full Sales')).toBe(false)
  })
  it.each(['Full Sales', 'Beta'])('não aceita resolução em lote para o alvo %s', (cliente) => {
    expect(declaracaoResolucao('Os clientes Full Sales e Beta foram resolvidos', cliente)).toBe(false)
  })
})

describe('resolver_alerta', () => {
  it('áudio transcrito resolve no grupo somente o tipo declarado, mantendo autorização do servidor', async () => {
    const mensagem = textoDoAudio({ ok: true, texto: 'Íris, a espera de resposta da Full Sales foi resolvida por telefone.', custoUsd: 0, nova: false })
    const { f, ctx, grupo } = montar({ mensagem, tipos: ['sem_resposta', 'pendencia'] })
    grupo()
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toMatchObject({ ok: true, tipo: 'sem_resposta' })
    expect(f.inseridos).toHaveLength(1)
    expect(f.inseridos[0].linhas[0]).toMatchObject({ tenant_id: T, client_id: 'c1', tipo: 'sem_resposta', modo: 'resolvido' })
    const proibido = montar({ mensagem, admin: false })
    proibido.grupo()
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, proibido.ctx)).toHaveProperty('erro')
    expect(proibido.f.inseridos).toEqual([])
  })

  it('resolve apenas o tipo e cliente atuais; motivo usa autor e pedido do servidor', async () => {
    const { f, ctx, chamadas } = montar()
    expect(await executarFerramenta('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toMatchObject({ ok: true, tipo: 'sem_resposta' })
    expect(chamadas).toHaveLength(2)
    expect(chamadas.every((p) => p.p_user_id === 'user-1' && p.p_recurso === 'automacoes-wa' && p.p_acao === 'admin')).toBe(true)
    expect(f.inseridos).toHaveLength(1)
    expect(f.inseridos[0]).toMatchObject({ tabela: 'wa_auto_alertas_ignorados', linhas: [{
      tenant_id: T, client_id: 'c1', contact_id: null, tipo: 'sem_resposta', modo: 'resolvido', ate: null,
    }] })
    const linha = f.inseridos[0].linhas[0]
    expect(linha).not.toHaveProperty('criado_por')
    expect(linha).not.toHaveProperty('created_at')
    expect(linha.motivo).toContain('pedido=00000000-0000-4000-8000-000000000001')
    expect(linha.motivo).toContain('user=user-1; autor=Sandro')
    expect(linha.motivo).not.toContain('5511999999999')
    expect(String(linha.motivo).length).toBeLessThanOrEqual(200)
    expect(f.atualizados).toEqual([])
    for (const c of f.consultas.filter((c) => c.operacao !== 'insert')) expect(c.filtros).toContain('eq:tenant_id')
  })

  it('grupo de acesso total aceita remetente sem cadastro; privado não herda essa exceção', async () => {
    const { f, ctx, chamadas, grupo } = montar({ escopo: escopoAcessoTotal(T, null), admin: false })
    grupo()
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toMatchObject({ ok: true })
    expect(chamadas).toEqual([])
    expect(f.inseridos[0].linhas[0].motivo).toContain('user=sem cadastro')
    const privado = montar({ escopo: escopoAcessoTotal(T, null), admin: false })
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, privado.ctx)).toHaveProperty('erro')
    expect(privado.f.inseridos).toEqual([])
  })

  it.each([
    { escopo: escopoRestrito(T, 'user-1', 'participante_externo') },
    { escopo: { ...ESCOPO, politica: 'carteira_gt3' as const } },
    { escopo: { ...ESCOPO, permissoes: { automacoes: false, chat: true, contratos: false } } },
    { admin: false },
  ])('não grava quando o canal ou privilégio não autoriza: %j', async (opcoes) => {
    const { f, ctx } = montar(opcoes)
    expect(await executarFerramenta('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toHaveProperty('erro')
    expect(f.inseridos).toEqual([])
  })

  it('fora da carteira, outra empresa e cliente inexistente recebem o mesmo resultado', async () => {
    for (const cliente of ['Outra Empresa', 'Cliente Ausente']) {
      const { f, ctx } = montar({ mensagem: `${cliente} já está resolvido` })
      expect(await executarResolucao('resolver_alerta', { cliente }, ctx)).toEqual({ erro: 'Não encontrei esse cliente na carteira autorizada.' })
      expect(f.inseridos).toEqual([])
    }
    const { f, ctx } = montar({ clientes: [{ id: 'fora', tenant_id: 'outro-tenant', nome: 'Full Sales' }] })
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toEqual({ erro: 'Não encontrei esse cliente na carteira autorizada.' })
    expect(f.inseridos).toEqual([])
  })

  it('homônimos exigem nome mais preciso; não escolhe o primeiro', async () => {
    const { f, ctx } = montar({ escopo: escopoAcessoTotal(T, 'user-1'), clientes: [
      { id: 'c1', tenant_id: T, nome: 'Full Sales' }, { id: 'c2', tenant_id: T, nome: 'Full Sales Brasil' },
    ] })
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toMatchObject({ erro: expect.stringContaining('Mais de um cliente') })
    expect(f.inseridos).toEqual([])
  })

  it('vários tipos exigem tipo explícito na própria declaração', async () => {
    const { f, ctx } = montar({ tipos: ['sem_resposta', 'pendencia'] })
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toHaveProperty('erro')
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales', tipo: 'pendencia' }, ctx)).toHaveProperty('erro')
    expect(f.inseridos).toEqual([])
    ctx.mensagemOriginal = 'O contrato da Full Sales foi resolvido'
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales', tipo: 'pendencia' }, ctx)).toMatchObject({ ok: true, tipo: 'pendencia' })
    expect(f.inseridos[0].linhas[0].tipo).toBe('pendencia')
  })

  it('sem alerta atual não cria supressão preventiva', async () => {
    const { f, ctx } = montar({ tipos: [] })
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toHaveProperty('erro')
    expect(f.inseridos).toEqual([])
  })

  it('tipo explicitamente resolvido não dá baixa em um alerta de outro assunto', async () => {
    const { f, ctx } = montar({ mensagem: 'O contrato da Full Sales foi resolvido', tipos: ['sem_resposta'] })
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toHaveProperty('erro')
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales', tipo: 'sem_resposta' }, ctx)).toHaveProperty('erro')
    expect(f.inseridos).toEqual([])
    const espera = montar({ mensagem: 'A espera de resposta da Full Sales foi resolvida', tipos: ['pendencia'] })
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales', tipo: 'pendencia' }, espera.ctx)).toHaveProperty('erro')
    expect(espera.f.inseridos).toEqual([])
  })

  it.each([
    'Íris, liguei para o cliente Full Sales e resolvi a cobrança de resposta',
    'Íris, falei com Full Sales por telefone e resolvemos a espera de resposta',
    'Íris, a espera de resposta do cliente Full Sales foi resolvida por telefone.',
  ])('relato de solução por telefone resolve somente a espera de resposta: %s', async (mensagem) => {
    const { f, ctx } = montar({ mensagem, tipos: ['sem_resposta', 'pendencia'] })
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toMatchObject({ ok: true, tipo: 'sem_resposta' })
    expect(f.inseridos[0].linhas[0].tipo).toBe('sem_resposta')
    const errado = montar({ mensagem, tipos: ['pendencia'] })
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales', tipo: 'pendencia' }, errado.ctx)).toHaveProperty('erro')
    expect(errado.f.inseridos).toEqual([])
  })

  it('tipo presente em outra frase não resolve a ambiguidade do cliente', async () => {
    const { f, ctx } = montar({ mensagem: 'Full Sales já resolveu. Contrato de outro cliente.', tipos: ['sem_resposta', 'pendencia'] })
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales', tipo: 'pendencia' }, ctx)).toHaveProperty('erro')
    expect(f.inseridos).toEqual([])
  })

  it('repetição sequencial é idempotente e não resolve outro tipo sem nova indicação', async () => {
    const { f, ctx } = montar({ tipos: ['sem_resposta', 'pendencia'], mensagem: 'A espera sem resposta da Full Sales foi resolvida' })
    const args = { cliente: 'Full Sales', tipo: 'sem_resposta' }
    expect(await executarResolucao('resolver_alerta', args, ctx)).toMatchObject({ ok: true })
    expect(await executarResolucao('resolver_alerta', args, ctx)).toMatchObject({ ok: true, ja_resolvido: true })
    ctx.mensagemOriginal = 'Full Sales já resolveu'
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toMatchObject({ ok: true, ja_resolvido: true })
    expect(f.inseridos).toHaveLength(1)
  })

  it('novidade posterior reabre e uma nova declaração pode resolver de novo', async () => {
    const { f, ctx, novidade } = montar()
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toMatchObject({ ok: true })
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, { ...ctx, cache: {} })).toMatchObject({ ja_resolvido: true })
    novidade('2026-10-29T13:00:00Z')
    const posterior = { ...ctx, agora: new Date('2026-10-29T14:00:00Z'), cache: {} }
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, posterior)).toMatchObject({ ok: true })
    expect(f.inseridos).toHaveLength(2)
  })

  it('simulação valida cliente, alerta e privilégio sem escrever', async () => {
    const { f, ctx } = montar({ simulacao: true })
    ctx.pedidoId = undefined
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toMatchObject({ ok: true, simulacao: true })
    expect(f.inseridos).toEqual([])
  })

  it('ordem vinda de dados consultados não substitui a mensagem original atual', async () => {
    const { f, ctx } = montar({ mensagem: 'Como está a Full Sales?' })
    ctx.leuDados = true
    expect(await executarFerramenta('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toHaveProperty('erro')
    ctx.mensagemOriginal = 'O caso da Full Sales já foi resolvido'
    expect(await executarFerramenta('resolver_alerta', { cliente: 'Outra Empresa' }, ctx)).toHaveProperty('erro')
    expect(f.inseridos).toEqual([])
  })

  it('mantém guarda leuDados dos aprendizados e permite somente a resolução direta', async () => {
    const { f, ctx } = montar()
    ctx.leuDados = true
    expect(await executarFerramenta('registrar_aprendizado', { instrucao: 'Responder curto', categoria: 'estilo' }, ctx)).toHaveProperty('erro')
    expect(await executarFerramenta('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toMatchObject({ ok: true })
    expect(f.inseridos.map((i) => i.tabela)).toEqual(['wa_auto_alertas_ignorados'])
  })

  it('argumentos forjados não controlam tenant, autor, ids, modo ou abrangência', async () => {
    const { f, ctx } = montar()
    for (const extra of [{ tenant_id: 'outro' }, { criado_por: 'outro' }, { client_id: 'c2' }, { modo: 'sempre' }, { tipo: 'todos' }, { motivo: 'inventado' }]) {
      expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales', ...extra }, ctx)).toHaveProperty('erro')
    }
    expect(f.inseridos).toEqual([])
  })

  it('fora de pedido WhatsApp e sem mensagem original não escreve', async () => {
    const { f, ctx } = montar()
    ctx.pedidoId = undefined
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toHaveProperty('erro')
    ctx.pedidoId = 'pedido-1'; ctx.mensagemOriginal = undefined
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toHaveProperty('erro')
    expect(f.inseridos).toEqual([])
  })

  it('falha de leitura ou escrita nunca confirma uma resolução', async () => {
    const leitura = montar()
    leitura.ctx.deps = { coletarAlertas: async () => { throw new Error('indisponível') } }
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, leitura.ctx)).toHaveProperty('erro')
    expect(leitura.f.inseridos).toEqual([])
    const escrita = montar()
    const original = escrita.ctx.admin.from
    escrita.ctx.admin.from = (tabela: string) => tabela === 'wa_auto_alertas_ignorados'
      ? { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: 'XX' } }) }) }) }
      : original(tabela)
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, escrita.ctx)).toMatchObject({ erro: expect.stringContaining('Não consegui confirmar o registro') })
  })

  it('grupo revogado durante a coleta não usa o snapshot de acesso total para gravar', async () => {
    const { f, ctx, tabelas, grupo } = montar({ escopo: escopoAcessoTotal(T, null), admin: false })
    grupo()
    const coletar = ctx.deps!.coletarAlertas!
    ctx.deps = { coletarAlertas: async (...args) => {
      const c = await coletar(...args)
      tabelas.wa_agente_grupos[0].acesso_total = false
      return c
    } }
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toMatchObject({ erro: expect.stringContaining('autorização mudou') })
    expect(f.inseridos).toEqual([])
  })

  it('admin revogado durante a coleta não grava com a permissão anterior', async () => {
    const { f, ctx } = montar()
    const coletar = ctx.deps!.coletarAlertas!
    ctx.deps = { coletarAlertas: async (...args) => {
      const c = await coletar(...args)
      ctx.admin.rpc = async () => ({ data: false, error: null })
      return c
    } }
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toMatchObject({ erro: expect.stringContaining('autorização mudou') })
    expect(f.inseridos).toEqual([])
  })

  it('grupo que deixou de ser interno também recusa a escrita', async () => {
    const { f, ctx, grupo } = montar({ escopo: escopoAcessoTotal(T, null), admin: false })
    grupo()
    grupoAtual.interno = false
    expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toHaveProperty('erro')
    expect(f.inseridos).toEqual([])
  })

  it('pedido precisa continuar no tenant, canal e usuário atuais', async () => {
    for (const alteracao of [{ tenant_id: 'outro' }, { eh_grupo: true }, { user_id: 'outro' }, { status: 'respondido' }]) {
      const { f, ctx, tabelas } = montar()
      Object.assign(tabelas.wa_agente_pedidos[0], alteracao)
      expect(await executarResolucao('resolver_alerta', { cliente: 'Full Sales' }, ctx)).toHaveProperty('erro')
      expect(f.inseridos).toEqual([])
    }
  })

  it('não oferece resolução no canal GT3 ou restrito', () => {
    expect(ferramentasResolucao(ESCOPO).map((d) => d.function.name)).toContain('resolver_alerta')
    expect(ferramentasResolucao({ ...ESCOPO, politica: 'carteira_gt3' })).toEqual([])
    expect(ferramentasResolucao(escopoRestrito(T, null, 'participante_externo'))).toEqual([])
  })
})

describe('cérebro carimba a mensagem atual, sem herdar autorização do histórico', () => {
  it.each([false, true])('declaração atual explícita=%s', async (atual) => {
    const { f, ctx } = montar()
    const resultados: string[] = []
    let passo = 0
    const fetchFn = (async (_url: unknown, init?: { body?: string }) => {
      const corpo = JSON.parse(String(init?.body)) as { messages: { role: string; content: string | null }[] }
      if (passo++ === 0) return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null,
        tool_calls: [{ id: 'resolver', type: 'function', function: { name: 'resolver_alerta', arguments: JSON.stringify({ cliente: 'Full Sales' }) } }],
      } }] }), { status: 200 })
      resultados.push(String(corpo.messages.at(-1)?.content))
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Recebido.' } }] }), { status: 200 })
    }) as typeof fetch
    const resposta = await pensar({
      admin: f.client, escopo: ctx.escopo, nomeAgente: 'Íris', canal: 'privado', quemPergunta: 'Sandro',
      pergunta: atual ? 'O caso da Full Sales já foi resolvido' : 'Como está a Full Sales?',
      historico: [{ de: 'equipe', texto: 'O caso da Full Sales já foi resolvido' }],
      pedidoId: ctx.pedidoId, remetenteNome: ctx.remetenteNome, apiKey: 'falsa', fetchFn, deps: ctx.deps,
    })
    expect(f.inseridos).toHaveLength(atual ? 1 : 0)
    expect(resultados[0]).toContain(atual ? '"ok":true' : '"erro"')
    expect(resposta.texto).toContain(atual ? 'Marquei o alerta de espera de resposta de Full Sales como resolvido' : 'Diga o nome do cliente')
    expect(resposta.texto).not.toContain('Recebido.')
  })

  async function executarBrain(opcoes: { mensagem?: string; falhar?: boolean; simulacao?: boolean; chamadas?: Record<string, unknown>[] } = {}) {
    const { f, ctx } = montar({ simulacao: opcoes.simulacao })
    let passo = 0
    const fetchFn = (async () => {
      if (passo++ === 0) return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null,
        tool_calls: (opcoes.chamadas ?? [{ cliente: 'Full Sales' }]).map((args, i) => ({ id: `resolver-${i}`, type: 'function',
          function: { name: 'resolver_alerta', arguments: JSON.stringify(args) } })),
      } }] }), { status: 200 })
      if (opcoes.falhar) return new Response('indisponível', { status: 503 })
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Pronto, já resolvi tudo e gravei as alterações.' } }] }), { status: 200 })
    }) as typeof fetch
    const resposta = await pensar({
      admin: f.client, escopo: ctx.escopo, nomeAgente: 'Íris', canal: 'privado', quemPergunta: 'Sandro',
      pergunta: opcoes.mensagem ?? 'O caso da Full Sales já foi resolvido',
      pedidoId: ctx.pedidoId, remetenteNome: ctx.remetenteNome, apiKey: 'falsa', fetchFn, deps: ctx.deps,
      simulacao: opcoes.simulacao,
    })
    return { f, resposta }
  }

  it('IA mentindo depois de erro não confirma uma resolução inexistente', async () => {
    const { f, resposta } = await executarBrain({ mensagem: 'Como está a Full Sales?' })
    expect(f.inseridos).toEqual([])
    expect(resposta.ok).toBe(true)
    expect(resposta.texto).toContain('Diga o nome do cliente e confirme diretamente')
    expect(resposta.texto).not.toContain('já resolvi tudo')
    expect(resposta.texto).not.toContain('Marquei')
  })

  it('falha da IA após escrita não esconde a alteração já confirmada pelo executor', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { f, resposta } = await executarBrain({ falhar: true })
      expect(f.inseridos).toHaveLength(1)
      expect(resposta.ok).toBe(true)
      expect(resposta.falha).toBeUndefined()
      expect(resposta.texto).toContain('Marquei o alerta de espera de resposta de Full Sales como resolvido')
      expect(resposta.texto).toContain('pode voltar se houver novidade')
    } finally { consoleError.mockRestore() }
  })

  it('simulação confirma explicitamente ausência de gravação apesar da afirmação da IA', async () => {
    const { f, resposta } = await executarBrain({ simulacao: true })
    expect(f.inseridos).toEqual([])
    expect(resposta.texto).toContain('Simulação: resolveria')
    expect(resposta.texto).toContain('Nada foi gravado.')
    expect(resposta.texto).not.toContain('gravei as alterações')
  })

  it('múltiplas chamadas preservam sucesso, erro e repetição sem esconder a escrita', async () => {
    const { f, resposta } = await executarBrain({ chamadas: [
      { cliente: 'Full Sales' }, { cliente: 'Full Sales', tipo: 'todos' }, { cliente: 'Full Sales' },
    ], falhar: true })
    expect(f.inseridos).toHaveLength(1)
    expect(resposta.ok).toBe(true)
    expect(resposta.texto).toContain('Marquei o alerta de espera de resposta de Full Sales como resolvido')
    expect(resposta.texto).toContain('Informe somente o nome do cliente')
    expect(resposta.texto).toContain('Esse alerta já está marcado como resolvido')
  })
})


describe('resolução junto com consulta legítima', () => {
  it('preserva o recibo e a continuação fundamentada por outra ferramenta de leitura', async () => {
    const { f, ctx } = montar()
    let passo = 0
    const fetchFn = (async () => {
      if (passo++ === 0) return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null,
        tool_calls: [
          { id: 'resolver', type: 'function', function: { name: 'resolver_alerta', arguments: JSON.stringify({ cliente: 'Full Sales' }) } },
          { id: 'buscar', type: 'function', function: { name: 'buscar_cliente', arguments: JSON.stringify({ nome: 'Full Sales' }) } },
        ],
      } }] }), { status: 200 })
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Full Sales está na sua carteira autorizada.' } }] }), { status: 200 })
    }) as typeof fetch
    const resposta = await pensar({
      admin: f.client, escopo: ctx.escopo, nomeAgente: 'Íris', canal: 'privado', quemPergunta: 'Sandro',
      pergunta: 'O caso da Full Sales já foi resolvido', pedidoId: ctx.pedidoId, apiKey: 'falsa', fetchFn, deps: ctx.deps,
    })
    expect(f.inseridos).toHaveLength(1)
    expect(resposta.texto).toContain('Marquei o alerta de espera de resposta de Full Sales como resolvido')
    expect(resposta.texto).toContain('Full Sales está na sua carteira autorizada.')
  })
})
