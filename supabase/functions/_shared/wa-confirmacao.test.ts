import { describe, expect, it } from 'vitest'
import { confirmacaoAposResposta, confirmacaoSimples, estadoAguardando, type UltimaMensagem } from './wa-recuperacao.ts'
import { coletarAlertas } from './wa-relatorio-dados.ts'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'

const T = 'tenant-confirmacao'
const agora = new Date('2026-11-06T18:00:00Z')
const cliente = (conteudo = '[Cliente] 👍🏻', criado_em = '2026-11-06T12:00:00Z'): UltimaMensagem => ({ autor_tipo: 'cliente', autor_origem: 'webhook', tipo: 'texto', conteudo, criado_em })
const equipe = (over: Partial<UltimaMensagem> = {}): UltimaMensagem => ({ autor_tipo: 'equipe', autor_origem: 'webhook', tipo: 'texto', conteudo: 'Pode enviar como documento, eu organizo os arquivos.', criado_em: '2026-11-06T11:59:00Z', ...over })

describe('confirmação exata após resposta comprovada', () => {
  it.each(['👍🏻', '🙏', '👌🏽', '✅', '👏', '❤️', 'Obrigado!', 'Muito obrigada.', 'Valeu', 'Ok', 'ok!', 'Ok, pode postar', 'Tá ótimo', 'Tudo certo', 'Perfeito, obrigada! 👍', 'Show de bola', 'pode postar', 'Aprovado', 'Blz'])('%s não reabre espera após equipe', texto => {
    expect(confirmacaoAposResposta([cliente(texto), equipe()])).toBe(true)
    expect(estadoAguardando([cliente(texto), equipe()])).toEqual({ aguardando: false })
  })
  it.each(['👍 pode enviar o contrato?', 'Obrigado, mas falta o arquivo', '👍?', '😡', '👀', 'Sim', 'OK, preciso de ajuda', 'Ok, pode postar amanhã?', 'ok mas troca a legenda', 'Não, pode postar não', 'ótimo, e o contrato?', 'Bom dia'])('mantém pedido/ambiguidade %s', texto => {
    expect(confirmacaoSimples(cliente(texto))).toBe(false)
    expect(estadoAguardando([cliente(texto), equipe()])).toEqual({ aguardando: true })
  })
  it('agradecimento isolado, nota interna, autoria desconhecida ou heurística não isentam equipe', () => {
    for (const anteriores of [[], [equipe({ tipo: 'nota_interna' })], [equipe({ autor_tipo: 'desconhecido' })], [equipe({ autor_origem: 'heuristica_nome' })], [equipe({ autor_origem: null })]]) {
      expect(confirmacaoAposResposta([cliente(), ...anteriores])).toBe(false)
    }
  })
  it('pedido intermediário, resposta antiga ou data ambígua preservam espera', () => {
    expect(confirmacaoAposResposta([cliente(), cliente('Pode mandar o contrato?', '2026-11-06T11:59:30Z'), equipe()])).toBe(false)
    expect(confirmacaoAposResposta([cliente(), equipe({ criado_em: '2026-11-05T11:00:00Z' })])).toBe(false)
    expect(confirmacaoAposResposta([cliente(), equipe({ criado_em: cliente().criado_em })])).toBe(false)
  })
})

function banco(opcoes: { equipeTenant?: string; numeroEquipe?: string; mensagemFinal?: string; origem?: string; semEquipe?: boolean; pedidoPosterior?: boolean; clienteEm?: string; equipeEm?: string; privado?: boolean; tipoEquipe?: string; extras?: UltimaMensagem[] } = {}) {
  const tenantEquipe = opcoes.equipeTenant ?? T
  const jid = '120363400000001'
  const ack = cliente(opcoes.mensagemFinal, opcoes.clienteEm)
  const f = criarSupabaseFalso({
    clients: [{ tenant_id: T, id: 'c1', nome: 'Cliente sintético', ativo: true }],
    contratos: [{ tenant_id: T, id: 'ct1', cliente_id: 'c1', status: 'ativo' }],
    chat_contacts: [
      { tenant_id: T, id: 'contact-a', nome: 'Grupo', numero_whatsapp: jid, client_id: 'c1', group_size: 3 },
      { tenant_id: tenantEquipe, id: 'contact-b', nome: 'Grupo', numero_whatsapp: opcoes.numeroEquipe ?? `${jid}@g.us`, client_id: 'c1', group_size: 3 },
    ],
    chat_conversations: [
      { tenant_id: T, id: 'conv-a', contact_id: 'contact-a', is_group: !opcoes.privado, aguardando_resposta: true, arquivada: false, status: 'aberta', ultima_msg_cliente_em: ack.criado_em },
      { tenant_id: tenantEquipe, id: 'conv-b', contact_id: 'contact-b', is_group: !opcoes.privado, aguardando_resposta: false, arquivada: false, status: 'aberta', ultima_msg_cliente_em: null },
    ],
    chat_messages: [
      { ...ack, tenant_id: T, conversation_id: 'conv-a' },
      ...(!opcoes.semEquipe ? [{ ...equipe({ autor_origem: opcoes.origem ?? 'webhook', ...(opcoes.equipeEm ? { criado_em: opcoes.equipeEm } : {}), ...(opcoes.tipoEquipe ? { tipo: opcoes.tipoEquipe } : {}) }), tenant_id: tenantEquipe, conversation_id: 'conv-b' }] : []),
      ...(opcoes.extras ?? []).map(m => ({ ...m, tenant_id: T, conversation_id: 'conv-b' })),
      ...(opcoes.pedidoPosterior ? [{ ...cliente('Preciso também do contrato.', '2026-11-06T12:01:00Z'), tenant_id: T, conversation_id: 'conv-b' }] : []),
    ],
  }, { wa_auto_grupos_sem_cliente: () => [] })
  return f
}
const regras = [{ tipo: 'sem_resposta' as const, ativo: true, limiar: 1, janela_dias: 7 }]

describe('coleta sem resposta mantém escopo de canal e tenant', () => {
  it('reconhece atendimento em outra instância do mesmo grupo sem alterar DB', async () => {
    const f = banco()
    const r = await coletarAlertas(f.client, T, regras, agora)
    expect(r.dados.alertas.sem_resposta ?? []).toHaveLength(0)
    for (const q of f.consultas) expect(q.filtros).toContain('eq:tenant_id')
    expect(f.atualizados).toEqual([])
    expect(f.inseridos).toEqual([])
  })
  it.each([
    { equipeTenant: 'outra-empresa' }, { numeroEquipe: '120363400000002' },
    { origem: 'heuristica_nome' }, { semEquipe: true },
    { mensagemFinal: '👍 Envia a revisão por favor' }, { pedidoPosterior: true },
  ])('mantém alerta sem prova suficiente ou havendo pedido real: %j', async opcoes => {
    const f = banco(opcoes)
    const r = await coletarAlertas(f.client, T, regras, agora)
    expect(r.dados.alertas.sem_resposta).toHaveLength(1)
  })
})


describe('resposta atual em outra instância do mesmo grupo', () => {
  const pedido = { mensagemFinal: 'Pode enviar o contrato?', clienteEm: '2026-11-06T10:00:00Z', equipeEm: '2026-11-06T11:00:00Z' }
  it('cliente10h em A e resposta11h em B eliminam espera antiga de A', async () => {
    const f = banco(pedido)
    const r = await coletarAlertas(f.client, T, regras, agora)
    expect(r.dados.alertas.sem_resposta ?? []).toHaveLength(0)
    expect(f.atualizados).toEqual([])
    expect(f.inseridos).toEqual([])
    for (const q of f.consultas) expect(q.filtros).toContain('eq:tenant_id')
  })
  it.each([
    { clienteEm: '2026-11-06T11:00:00Z', equipeEm: '2026-11-06T10:00:00Z' },
    { equipeEm: '2026-11-06T10:00:00Z' }, { pedidoPosterior: true }, { semEquipe: true },
    { equipeTenant: 'outra-empresa' }, { numeroEquipe: '120363400000002' },
    { origem: 'heuristica_nome' }, { tipoEquipe: 'nota_interna' }, { privado: true },
  ])('preserva pedido sem resposta comprovada: %j', async over => {
    const r = await coletarAlertas(banco({ ...pedido, ...over }).client, T, regras, agora)
    expect(r.dados.alertas.sem_resposta).toHaveLength(1)
  })
  it('não lê contexto por grupo para candidato fora da janela ativa', async () => {
    const f = banco({ ...pedido, clienteEm: '2026-10-01T10:00:00Z' })
    await coletarAlertas(f.client, T, regras, agora)
    expect(f.consultas.filter(q => q.tabela === 'chat_messages')).toHaveLength(0)
  })
})


describe('corte de40 mensagens não esconde empate cliente/equipe', () => {
  const pedido = { mensagemFinal: 'Pode enviar o contrato?', clienteEm: '2026-11-06T10:00:00Z', equipeEm: '2026-11-06T11:00:00Z' }
  it('preserva alerta quando40 respostas ocupam o corte e cliente empatado fica fora', async () => {
    const extras = [
      ...Array.from({ length: 39 }, () => equipe({ criado_em: pedido.equipeEm })),
      cliente('Preciso também do arquivo.', pedido.equipeEm),
    ]
    const r = await coletarAlertas(banco({ ...pedido, extras }).client, T, regras, agora)
    expect(r.dados.alertas.sem_resposta).toHaveLength(1)
  })
  it('aceita resposta quando corte cheio alcança horário anterior, provando empate completo', async () => {
    const extras = Array.from({ length: 40 }, () => equipe({ criado_em: '2026-11-06T10:59:00Z' }))
    const r = await coletarAlertas(banco({ ...pedido, extras }).client, T, regras, agora)
    expect(r.dados.alertas.sem_resposta ?? []).toHaveLength(0)
  })
})
