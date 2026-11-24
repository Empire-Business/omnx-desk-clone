import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pensar, type EntradaCerebro } from './wa-agente-cerebro.ts'
import { sha256EntradaAcaoChat } from './wa-agente-entrada-integridade.ts'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'

vi.mock('./wa-grupos-internos-dados.ts', async (original) => ({
  ...await original<typeof import('./wa-grupos-internos-dados.ts')>(),
  carregarGruposInternos: async (_admin: unknown, _tenant: string, _instancia: string, grupos: string[]) => ({
    instanciaUuid: 'instancia-receptora', grupos: grupos.map(grupo_jid => ({ grupo_jid, nome: 'Equipe interna' })),
    deCliente: new Set(), nomeDeCliente: new Set(),
  }),
}))

type Linha = Record<string, unknown>
type Chamada = { nome: string; args: Linha }
const id = (n: number) => `a1b2c3d4-e5f6-47a8-9b0c-${n.toString(16).padStart(12, 'a')}`
const [T, ADMIN, HERILLY, PEDIDO, MEMBRO, I1, I2, CV1, CV2, CT1, CT2, MSG, GRUPO] = Array.from({ length: 13 }, (_, i) => id(i + 1))
const JID = '120363123456789@g.us'
const OUTRO_JID = '120363987654321@g.us'
const AGORA = new Date('2026-11-05T15:00:00Z')
const TRECHO = 'Herilly prado não é mais estrategista da empresa.'
const FALA = '@111111111111111 Não entendi o que seria “grupos ativos sem cliente vinculado”. Como podemos resolver isso? Natalie Geller e Raimundo de Sousa e Silva Filho estão com o estrategista Matheus Costa; Nahuel Costa Teles, Leandro Gejão Santos e Marcio Tonding Ferreira estão com a estrategista Vivian; Ezequiel está com o estrategista Rodrigo Diez Perez; Daniel Graziane da Silva Ruggio está com o estrategista Matheus Henrique; Rodrigo Santos Cohen e Gilson dos Santos Ramalho estão com o estrategista Octavio; Marcelo Lopez Reinecken está com o estrategista Abel Rodrigues (esse estrategista ainda não foi registrado). ' + TRECHO + ' Não entendi o que seria o pedido aberto da Rocket. GrowthMachine não está mais com o Octavio.'
const ATRIBUICOES = [
  { cliente: 'Natalie Geller', estrategista: 'Matheus Costa' },
  { cliente: 'Raimundo de Sousa e Silva Filho', estrategista: 'Matheus Costa' },
  { cliente: 'Nahuel Costa Teles', estrategista: 'Vivian' },
  { cliente: 'Leandro Gejão Santos', estrategista: 'Vivian' },
  { cliente: 'Marcio Tonding Ferreira', estrategista: 'Vivian' },
  { cliente: 'Ezequiel', estrategista: 'Rodrigo Diez Perez' },
  { cliente: 'Daniel Graziane da Silva Ruggio', estrategista: 'Matheus Henrique' },
  { cliente: 'Rodrigo Santos Cohen', estrategista: 'Octavio' },
  { cliente: 'Gilson dos Santos Ramalho', estrategista: 'Octavio' },
  { cliente: 'Marcelo Lopez Reinecken', estrategista: 'Abel Rodrigues' },
]
const MEMORIA: Chamada = { nome: 'registrar_fato_equipe', args: { trecho: TRECHO, sujeito_tipo: 'pessoa', sujeito: 'Herilly Prado' } }
const CONSULTA: Chamada = { nome: 'carteira_estrategista', args: { pessoa: 'Herilly Prado' } }
const PROPOSTA: Chamada = { nome: 'propor_atribuicoes_estrategistas', args: { atribuicoes: ATRIBUICOES } }
const RESPOSTA_CONSULTA = 'A carteira consultada ainda mostra Natalie Geller ativa com Herilly Prado. A declaração da equipe diverge do cadastro atual; a prévia acima permite conferir as mudanças.'

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AGORA) })
afterEach(() => vi.useRealTimers())

async function montar(texto = FALA) {
  const estado = { admin: true, falharEscrita: false, revogarAposPessoa: false, falharLeitura: false }
  const tabelas: Record<string, Linha[]> = {
    wa_agente_acoes_propostas: [], wa_agente_fatos_equipe: [], wa_agente_aprendizados: [],
    wa_agente_pedidos: [{ id: PEDIDO, tenant_id: T, user_id: ADMIN, membro_id: MEMBRO, instance_uuid: I1,
      chat_jid: JID, remetente_chave: '5511999999999', eh_grupo: true, chat_message_id: MSG, conversation_id: CV1,
      message_id_wpp: 'wpp-equipe', status: 'processando', lock_ate: new Date(AGORA.getTime() + 120_000).toISOString(),
      gatilho: 'mencao', entrada_texto_sha256: await sha256EntradaAcaoChat(texto), entrada_encaminhada: null }],
    // Mensagem atual responde a aviso e foi deduplicada em outra conexão do grupo.
    // Conteúdo/autor da mensagem citada não são consultados nem autorizam ferramentas.
    chat_messages: [{ id: MSG, tenant_id: T, conversation_id: CV2, message_id_wpp: 'wpp-equipe', conteudo: `[Pessoa] ${texto}`,
      tipo: 'texto', reply_to_id: id(90), enviado_por_agente: false, enviado_por_ia: false, autor_tipo: 'cliente',
      autor_origem: 'webhook', autor_user_id: null, autor_chave: '5511999999999' }],
    chat_conversations: [{ id: CV1, tenant_id: T, instance_id: I1, contact_id: CT1, is_group: true },
      { id: CV2, tenant_id: T, instance_id: I2, contact_id: CT2, is_group: true }],
    chat_contacts: [{ id: CT1, tenant_id: T, instance_id: I1, numero_whatsapp: JID, bloqueado: false },
      { id: CT2, tenant_id: T, instance_id: I2, numero_whatsapp: JID.replace('@g.us', ''), bloqueado: false }],
    wa_agente_membros: [{ id: MEMBRO, tenant_id: T, user_id: ADMIN, telefone_chave: '5511999999999', ativo: true }],
    users: [{ id: ADMIN, tenant_id: T, nome: 'Administrador Teste', perfil: 'admin', ativo: true },
      { id: HERILLY, tenant_id: T, nome: 'Herilly Prado', perfil: 'estrategista', ativo: true },
      ...['Matheus Costa', 'Vivian Sombra', 'Rodrigo Diez Perez', 'Matheus Henrique', 'Octavio Vicioli'].map((nome, i) => ({ id: id(200 + i), tenant_id: T, nome, perfil: 'estrategista', ativo: true }))],
    app_modules: [{ id: id(30), tenant_id: T, slug: 'automacoes-wa', enabled: true }],
    wa_auto_config: [{ tenant_id: T, agente_ativo: true, agente_grupos: true, uazapi_instance_id: 'receptora' }],
    wa_agente_grupos: [{ id: GRUPO, tenant_id: T, grupo_jid: JID, ativo: true }],
    whatsapp_instances: [{ id: I1, tenant_id: T, instance_id: 'receptora', ativo: true, status: 'conectado' },
      { id: I2, tenant_id: T, instance_id: 'outra-conexao', ativo: true, status: 'conectado' }],
    clients: ATRIBUICOES.map((a, i) => ({ id: id(100 + i), tenant_id: T, nome: a.cliente, ativo: true })),
    client_assignments: [{ id: id(31), tenant_id: T, user_id: HERILLY, client_id: id(100), tipo: 'estrategista', ativo: true }],
    client_assignment_state: [{ tenant_id: T, client_id: id(100), revisao: 2 }],
    contratos: [{ id: id(32), tenant_id: T, cliente_id: id(100), status: 'ativo', estrategista_id: HERILLY }],
  }
  const propostas: Linha[] = []
  const f = criarSupabaseFalso(tabelas, {
    has_permissao_de: a => a.p_user_id === ADMIN && estado.admin
      && ((a.p_recurso === 'automacoes-wa' && a.p_acao === 'admin') || (a.p_recurso === 'clientes.atribuir' && a.p_acao === 'editar')),
    wa_agente_escopo: () => ({ total: true, client_ids: [] }),
    wa_agente_acoes_capacidades: () => ({ cliente_estrategista: true }),
    wa_agente_acoes_propor: a => {
      propostas.push(a)
      const itens = (a.p_novo as { itens: Linha[] }).itens
      return { ok: true, proposta_id: id(300), codigo: 'ABCD1234', expira_em: new Date(AGORA.getTime() + 300_000).toISOString(),
        previa: { acao: 'cliente_estrategista', alvo_nome: 'Responsáveis operacionais',
          antes: { itens: itens.map(i => ({ cliente_id: i.cliente_id, cliente_nome: tabelas.clients.find(c => c.id === i.cliente_id)!.nome,
            assignment_id: i.assignment_id, estrategista_id: i.assignment_id ? HERILLY : null,
            estrategista_nome: i.assignment_id ? 'Herilly Prado' : null, revisao: i.expected_revision })) },
          depois: { itens: itens.map(i => ({ cliente_id: i.cliente_id, cliente_nome: tabelas.clients.find(c => c.id === i.cliente_id)!.nome,
            user_id: i.user_id, estrategista_nome: tabelas.users.find(u => u.id === i.user_id)!.nome })) } } }
    },
  })
  const from = f.client.from
  f.client.from = (tabela: string) => {
    const q = from(tabela), inserir = q.insert, select = q.select, then = q.then
    let consultaPessoa = false
    q.select = (colunas: string, opts?: { head?: boolean; count?: 'exact' }) => {
      consultaPessoa = tabela === 'users' && colunas === 'id,nome' && !opts?.head
      return select(colunas, opts)
    }
    q.insert = (campos: Linha) => tabela === 'wa_agente_fatos_equipe' && estado.falharEscrita
      ? { select: () => ({ single: async () => ({ data: null, error: { code: 'XX' } }) }) } : inserir(campos)
    q.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) => {
      if (tabela === 'wa_agente_fatos_equipe' && estado.falharLeitura) return Promise.resolve({ data: null, error: { code: 'XX' } }).then(resolve, reject)
      return then((r: unknown) => {
        if (consultaPessoa && estado.revogarAposPessoa) tabelas.wa_agente_pedidos[0].status = 'concluido'
        return resolve(r)
      }, reject)
    }
    return q
  }
  const entrada: EntradaCerebro = { admin: f.client, escopo: { tenantId: T, userId: ADMIN, total: true, clientIds: new Set(), modo: 'normal',
    permissoes: { automacoes: true, contratos: true, chat: false } }, nomeAgente: 'Íris', canal: 'grupo', quemPergunta: 'Administrador Teste',
    remetenteNome: 'Administrador Teste', pergunta: texto, pedidoId: PEDIDO, agora: AGORA, apiKey: 'fixture-sem-rede',
    deps: { coletarAlertas: async () => ({ dados: { data: '05/11/2026', alertas: {}, reunioes: [] }, ocultos: {}, ignorados: [] } as never) } }
  async function executar(chamadas: Chamada[] = [MEMORIA], opcoes: { falhaDepois?: number; resposta?: string } = {}) {
    const corpos: { messages: { role: string; content: string | null }[] }[] = []
    const persistidosAoChamarModelo: number[] = []
    let etapa = 0
    const fetchFn = (async (_url: unknown, init?: { body?: string }) => {
      corpos.push(JSON.parse(String(init?.body)))
      persistidosAoChamarModelo.push(tabelas.wa_agente_fatos_equipe.length)
      if (opcoes.falhaDepois !== undefined && etapa >= opcoes.falhaDepois) return new Response('indisponível', { status: 503 })
      const ferramenta = chamadas[etapa++]
      return new Response(JSON.stringify({ choices: [{ message: ferramenta ? { role: 'assistant', content: null,
        tool_calls: [{ id: `tool-${etapa}`, type: 'function', function: { name: ferramenta.nome, arguments: JSON.stringify(ferramenta.args) } }] }
        : { role: 'assistant', content: opcoes.resposta ?? RESPOSTA_CONSULTA } }] }), { status: 200 })
    }) as typeof fetch
    const resposta = await pensar({ ...entrada, fetchFn })
    return { resposta, corpos, persistidosAoChamarModelo }
  }
  return { f, tabelas, estado, entrada, propostas, executar }
}

describe('pedido misto com memória por ferramenta, consulta e proposta', () => {
  it.each(['antes', 'depois'])('registra fato %s da consulta, preservando recibo, pendência e resultado cadastral', async ordem => {
    const r = await montar()
    const antes = structuredClone({ users: r.tabelas.users, clients: r.tabelas.clients, atribuicoes: r.tabelas.client_assignments, contratos: r.tabelas.contratos })
    const chamadas = ordem === 'antes' ? [MEMORIA, CONSULTA, PROPOSTA] : [CONSULTA, MEMORIA, PROPOSTA]
    const { resposta, corpos, persistidosAoChamarModelo } = await r.executar(chamadas)
    expect(persistidosAoChamarModelo[0]).toBe(0) // sem escrita automática antes da IA
    expect(persistidosAoChamarModelo[ordem === 'antes' ? 1 : 2]).toBe(1)
    expect(r.tabelas.wa_agente_fatos_equipe).toHaveLength(1)
    expect(r.tabelas.wa_agente_fatos_equipe[0]).toMatchObject({ tenant_id: T, grupo_jid: JID, autor_id: ADMIN,
      pedido_id: PEDIDO, sujeito_id: HERILLY, trecho: TRECHO, entrada_sha256: await sha256EntradaAcaoChat(FALA), ativo: true })
    expect(r.tabelas.wa_agente_aprendizados).toEqual([])
    expect(resposta.ok).toBe(true)
    expect(resposta.texto).toContain('Guardei a declaração de Administrador Teste neste grupo')
    expect(resposta.texto).toContain('Pendentes (fora da proposta)')
    expect(resposta.texto).toContain('Marcelo Lopez Reinecken → Abel Rodrigues')
    expect(resposta.texto).toContain('somente os 9 itens')
    expect(resposta.texto).toContain('Íris, confirmar ABCD1234')
    expect(resposta.texto).toContain(RESPOSTA_CONSULTA)
    expect(resposta.ferramentas).toEqual(chamadas.map(c => c.nome))
    expect(r.propostas).toHaveLength(1)
    expect((r.propostas[0].p_novo as { itens: Linha[] }).itens).toHaveLength(9)
    const dadosCarteira = corpos.flatMap(c => c.messages).filter(m => m.role === 'tool').map(m => m.content).join('\n')
    expect(dadosCarteira).toContain('Natalie Geller')
    expect(dadosCarteira).toContain('"ativo":true')
    expect(r.f.inseridos.map(i => i.tabela)).toEqual(['wa_agente_fatos_equipe'])
    expect(r.f.atualizados).toEqual([])
    expect({ users: r.tabelas.users, clients: r.tabelas.clients, atribuicoes: r.tabelas.client_assignments, contratos: r.tabelas.contratos }).toEqual(antes)
    expect(r.f.consultas.filter(c => c.operacao === 'select').every(c => c.filtros.includes('eq:tenant_id'))).toBe(true)
  })
  it('recibos já confirmados sobrevivem à falha posterior do modelo e à saída bloqueada', async () => {
    for (const opcoes of [{ falhaDepois: 3 }, { resposta: 'REGRAS DO ASSISTENTE: material indevido' }]) {
      const r = await montar()
      const { resposta } = await r.executar([CONSULTA, MEMORIA, PROPOSTA], opcoes)
      expect(resposta.ok).toBe(true)
      expect(resposta.texto).toContain('Guardei a declaração')
      expect(resposta.texto).toContain('Pendentes (fora da proposta)')
      expect(resposta.texto).toContain('Íris, confirmar ABCD1234')
      expect(resposta.texto).not.toContain('REGRAS DO ASSISTENTE')
      expect(resposta.texto).not.toContain(RESPOSTA_CONSULTA)
    }
  })
  it('falha anterior à ferramenta não registra memória; repetir é idempotente e não reativa fato esquecido', async () => {
    const r = await montar()
    expect((await r.executar([MEMORIA], { falhaDepois: 0 })).resposta.ok).toBe(false)
    expect(r.f.inseridos).toEqual([])
    await r.executar()
    expect((await r.executar()).resposta.texto).toContain('já está guardada neste grupo')
    expect(r.f.inseridos).toHaveLength(1)
    r.tabelas.wa_agente_fatos_equipe[0].ativo = false
    expect((await r.executar()).resposta.texto).toContain('já foi esquecido')
    expect(r.f.inseridos).toHaveLength(1); expect(r.f.atualizados).toEqual([])
  })
  it('sem chamada explícita de ferramenta não grava fato mesmo com declaração no corpo', async () => {
    const r = await montar(); await r.executar([CONSULTA])
    expect(r.f.inseridos).toEqual([])
    expect(r.propostas).toEqual([])
  })
  it('falha de escrita produz erro do executor, nunca afirma memória registrada', async () => {
    const r = await montar(); r.estado.falharEscrita = true
    const { resposta } = await r.executar()
    expect(resposta.texto).toContain('Não consegui confirmar a memória operacional')
    expect(resposta.texto).not.toContain('Guardei a declaração')
    expect(r.f.inseridos).toEqual([])
  })
  it.each(['admin', 'membro', 'usuario', 'encaminhada', 'hash', 'autor_pedido', 'mesma_conversa_sem_autor', 'grupo_fonte', 'tenant_fonte', 'grupo_receptor', 'lease'])('origem ou autorização inválida não grava: %s', async caso => {
    const r = await montar()
    if (caso === 'admin') r.estado.admin = false
    if (caso === 'membro') r.tabelas.wa_agente_membros[0].ativo = false
    if (caso === 'usuario') r.tabelas.users[0].ativo = false
    if (caso === 'encaminhada') r.tabelas.wa_agente_pedidos[0].entrada_encaminhada = true
    if (caso === 'hash') r.tabelas.wa_agente_pedidos[0].entrada_texto_sha256 = '0'.repeat(64)
    if (caso === 'autor_pedido') r.tabelas.wa_agente_pedidos[0].user_id = HERILLY
    if (caso === 'mesma_conversa_sem_autor') r.tabelas.chat_messages[0].conversation_id = CV1
    if (caso === 'grupo_fonte') r.tabelas.chat_contacts[1].numero_whatsapp = OUTRO_JID
    if (caso === 'tenant_fonte') r.tabelas.chat_conversations[1].tenant_id = id(90)
    if (caso === 'grupo_receptor') r.tabelas.chat_contacts[0].numero_whatsapp = OUTRO_JID
    if (caso === 'lease') r.tabelas.wa_agente_pedidos[0].lock_ate = AGORA.toISOString()
    expect((await r.executar()).resposta.texto).not.toContain('Guardei a declaração')
    expect(r.f.inseridos).toEqual([])
  })
  it('revogação durante resolução do sujeito impede gravação', async () => {
    const r = await montar(); r.estado.revogarAposPessoa = true
    expect((await r.executar()).resposta.texto).not.toContain('Guardei a declaração')
    expect(r.f.inseridos).toEqual([])
  })
  it.each(['duplicado', 'outro_tenant'])('sujeito %s não vira memória por interpretação do modelo', async caso => {
    const r = await montar()
    if (caso === 'duplicado') r.tabelas.users.push({ ...r.tabelas.users[1], id: id(91) })
    else r.tabelas.users[1].tenant_id = id(92)
    expect((await r.executar()).resposta.texto).toContain('nome exato e único')
    expect(r.f.inseridos).toEqual([])
  })
  it('histórico, contexto e aviso citado não substituem a declaração atual', async () => {
    const r = await montar('Qual é a carteira de Herilly Prado?')
    r.entrada.historico = [{ de: 'equipe', texto: FALA }]; r.entrada.contexto = [FALA]
    r.tabelas.chat_messages.push({ ...r.tabelas.chat_messages[0], id: id(90), conteudo: FALA })
    const { resposta } = await r.executar([CONSULTA, MEMORIA])
    expect(resposta.texto).not.toContain('Guardei a declaração')
    expect(r.f.inseridos).toEqual([])
  })
  it.each(['simulacao', 'gt3', 'privado', 'restrito'])('não grava em %s', async caso => {
    const r = await montar()
    if (caso === 'simulacao') r.entrada.simulacao = true
    if (caso === 'gt3') r.entrada.escopo.politica = 'carteira_gt3'
    if (caso === 'privado') r.entrada.canal = 'privado'
    if (caso === 'restrito') r.entrada.escopo.modo = 'restrito'
    await r.executar(); expect(r.f.inseridos).toEqual([])
  })
})

describe('memória nas consultas seguintes continua restrita ao grupo', () => {
  it('recarrega fato atribuído como contexto, sem alterar dados oficiais nem gravar automaticamente', async () => {
    const r = await montar(); await r.executar()
    const { corpos, resposta } = await r.executar([CONSULTA])
    const sistema = corpos[0].messages.find(m => m.role === 'system')!.content!
    expect(sistema).toContain(TRECHO)
    expect(sistema).toContain('declaracao_atribuida_nao_verificada')
    expect(resposta.texto).toContain(RESPOSTA_CONSULTA)
    expect(r.f.inseridos).toHaveLength(1)
    expect(r.tabelas.users[1].ativo).toBe(true)
  })
  it.each(['outro grupo', 'outro tenant', 'inativo', 'leitura falhou'])('não inclui memória de %s no prompt', async caso => {
    const r = await montar(); await r.executar()
    const nota = r.tabelas.wa_agente_fatos_equipe[0]
    if (caso === 'outro grupo') nota.grupo_jid = OUTRO_JID
    if (caso === 'outro tenant') nota.tenant_id = id(99)
    if (caso === 'inativo') nota.ativo = false
    if (caso === 'leitura falhou') r.estado.falharLeitura = true
    const { corpos } = await r.executar([CONSULTA])
    expect(corpos[0].messages.find(m => m.role === 'system')!.content).not.toContain(TRECHO)
    expect(r.f.inseridos).toHaveLength(1)
  })
})
