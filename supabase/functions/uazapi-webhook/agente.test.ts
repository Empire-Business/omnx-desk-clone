import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarSupabaseFalso } from '../_shared/teste-supabase-falso.ts'
import { avaliarAgente, type ContextoAgente } from './agente.ts'

// Dados fictícios. A segunda conexão recebe a mensagem primeiro e o Chat
// deduplica pelo message_id_wpp, mas só a primeira conexão aciona a Íris.
const TENANT = 'empresa-a'
const GRUPO = '120363000000000001@g.us'
const TEL_IRIS = '551100009900'
const TEL_REMETENTE = '5511987654321'
const TEXTO = 'Íris, guarde este feedback: comece pelos casos atuais.'
type Linha = Record<string, unknown>

function cenario() {
  const tabelas: Record<string, Linha[]> = {
    wa_auto_config: [{
      tenant_id: TENANT, uazapi_instance_id: 'suporte-iris', agente_ativo: true,
      agente_nome: 'Íris', agente_privado: true, agente_grupos: true,
    }],
    wa_agente_grupos: [{ id: 'grupo-interno', tenant_id: TENANT, grupo_jid: GRUPO, ativo: true, acesso_total: true }],
    wa_agente_grupo_numeros: [],
    whatsapp_instances: [
      { id: 'instancia-iris', tenant_id: TENANT, instance_id: 'suporte-iris', numero_whatsapp: TEL_IRIS },
      { id: 'instancia-outra', tenant_id: TENANT, instance_id: 'suporte-outra', numero_whatsapp: '551151979901' },
    ],
    chat_contacts: [
      { id: 'contato-iris', tenant_id: TENANT, instance_id: 'instancia-iris', numero_whatsapp: GRUPO.replace('@g.us', '') },
      { id: 'contato-outra', tenant_id: TENANT, instance_id: 'instancia-outra', numero_whatsapp: GRUPO.replace('@g.us', '') },
    ],
    chat_conversations: [
      { id: 'conversa-iris', tenant_id: TENANT, instance_id: 'instancia-iris', contact_id: 'contato-iris', is_group: true },
      { id: 'conversa-outra', tenant_id: TENANT, instance_id: 'instancia-outra', contact_id: 'contato-outra', is_group: true },
    ],
    chat_messages: [{
      id: 'mensagem-canonica', tenant_id: TENANT, conversation_id: 'conversa-outra',
      message_id_wpp: 'FEEDBACK-WPP-1', tipo: 'texto', conteudo: `[Colega] ${TEXTO}`,
      enviado_por_agente: false, enviado_por_ia: false,
    }],
    wa_agente_pedidos: [], wa_agente_membros: [], wa_auto_envios: [], wa_webhook_tokens: [], users: [],
  }
  const falso = criarSupabaseFalso(tabelas)
  const ctx: ContextoAgente = {
    supabase: falso.client, agenteAutorizado: true,
    instance: { id: 'instancia-iris', instance_id: 'suporte-iris', tenant_id: TENANT },
    body: {}, msg: { fromMe: false, wasSentByApi: false, sender_pn: `${TEL_REMETENTE}@s.whatsapp.net` },
    chatid: GRUPO, isGroup: true, numero: GRUPO.replace('@g.us', ''),
    tipo: 'texto', conteudo: TEXTO, messageIdWpp: 'FEEDBACK-WPP-1', conversationId: 'conversa-iris',
  }
  return { tabelas, falso, ctx }
}

function audioCitandoIris(c: ReturnType<typeof cenario>) {
  c.ctx.tipo = 'audio'
  c.ctx.conteudo = null
  c.ctx.msg = {
    ...c.ctx.msg, quoted: 'RELATORIO-IRIS',
    contextInfo: { stanzaID: 'RELATORIO-IRIS', participant: `${TEL_IRIS}@s.whatsapp.net` },
  }
  Object.assign(c.tabelas.chat_messages[0], {
    tipo: 'audio', conteudo: null, media_url: 'https://example.invalid/audio.ogg',
  })
}

beforeEach(() => {
  // Uma regressão no fixture não deve consultar o provedor real.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Rede proibida neste teste'))
})
afterEach(() => vi.restoreAllMocks())

describe('avaliarAgente — feedback recebido por mais de uma conexão', () => {
  it('participante do grupo total pode chamar pela voz sem cadastro individual', async () => {
    const c = cenario()
    c.ctx.tipo = 'audio'
    c.ctx.conteudo = null
    Object.assign(c.tabelas.chat_messages[0], { tipo: 'audio', conteudo: null })
    expect((await avaliarAgente(c.ctx)).enfileirado).toBe(true)
    expect(c.tabelas.wa_agente_pedidos[0]).toMatchObject({ gatilho: 'audio', chat_message_id: 'mensagem-canonica', entrada_texto_sha256: null })
  })

  it('áudio de participante sem cadastro não amplia acesso de grupo restrito', async () => {
    const c = cenario()
    c.tabelas.wa_agente_grupos[0].acesso_total = false
    c.ctx.tipo = 'audio'
    c.ctx.conteudo = null
    expect((await avaliarAgente(c.ctx)).enfileirado).toBe(false)
    expect(c.tabelas.wa_agente_pedidos).toHaveLength(0)
  })
  it('liga o feedback de texto salvo pela outra conexão e preserva o destino autorizado', async () => {
    const c = cenario()
    expect(await avaliarAgente(c.ctx)).toEqual({ pularBotAntigo: true, enfileirado: true })
    expect(c.tabelas.wa_agente_pedidos).toHaveLength(1)
    expect(c.tabelas.wa_agente_pedidos[0]).toMatchObject({
      tenant_id: TENANT, chat_message_id: 'mensagem-canonica',
      instance_uuid: 'instancia-iris', conversation_id: 'conversa-iris', chat_jid: GRUPO, gatilho: 'nome',
    })
    expect(c.tabelas.wa_agente_pedidos[0].entrada_texto_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('liga o áudio que cita a Íris, permitindo ao consumidor encontrar a mídia', async () => {
    const c = cenario()
    audioCitandoIris(c)
    expect((await avaliarAgente(c.ctx)).enfileirado).toBe(true)
    expect(c.tabelas.wa_agente_pedidos[0]).toMatchObject({
      chat_message_id: 'mensagem-canonica', gatilho: 'quote', entrada_texto_sha256: null,
      instance_uuid: 'instancia-iris', conversation_id: 'conversa-iris',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('continua aceitando a mensagem armazenada na própria conversa da Íris', async () => {
    const c = cenario()
    c.tabelas.chat_messages[0].conversation_id = 'conversa-iris'
    expect((await avaliarAgente(c.ctx)).enfileirado).toBe(true)
    expect(c.tabelas.wa_agente_pedidos[0].chat_message_id).toBe('mensagem-canonica')
  })

  it('repetir o webhook cria um único pedido de feedback', async () => {
    const c = cenario()
    await avaliarAgente(c.ctx)
    await avaliarAgente(c.ctx)
    expect(c.tabelas.wa_agente_pedidos).toHaveLength(1)
    expect(c.tabelas.wa_agente_pedidos[0].chat_message_id).toBe('mensagem-canonica')
  })

  it.each([
    ['a mensagem pertence a outra empresa', (c: ReturnType<typeof cenario>) => { c.tabelas.chat_messages[0].tenant_id = 'empresa-b' }],
    ['a conversa pertence a outra empresa', (c: ReturnType<typeof cenario>) => { c.tabelas.chat_conversations[1].tenant_id = 'empresa-b' }],
    ['o contato pertence a outra empresa', (c: ReturnType<typeof cenario>) => { c.tabelas.chat_contacts[1].tenant_id = 'empresa-b' }],
    ['a instância de origem pertence a outra empresa', (c: ReturnType<typeof cenario>) => { c.tabelas.whatsapp_instances[1].tenant_id = 'empresa-b' }],
    ['o contato representa outro grupo', (c: ReturnType<typeof cenario>) => { c.tabelas.chat_contacts[1].numero_whatsapp = '120363000000000002' }],
    ['a mensagem foi salva em conversa privada', (c: ReturnType<typeof cenario>) => { c.tabelas.chat_conversations[1].is_group = false }],
    ['o contato não pertence à instância da conversa', (c: ReturnType<typeof cenario>) => { c.tabelas.chat_contacts[1].instance_id = 'instancia-iris' }],
  ])('não associa a mensagem quando %s', async (_descricao, alterar) => {
    const c = cenario()
    alterar(c)
    await avaliarAgente(c.ctx)
    expect(c.tabelas.wa_agente_pedidos[0]?.chat_message_id ?? null).toBeNull()
  })

  it.each([
    ['webhook não autenticado', (c: ReturnType<typeof cenario>) => { c.ctx.agenteAutorizado = false }],
    ['grupo desativado', (c: ReturnType<typeof cenario>) => { c.tabelas.wa_agente_grupos[0].ativo = false }],
    ['instância receptora não autorizada', (c: ReturnType<typeof cenario>) => {
      c.ctx.instance = { id: 'instancia-outra', instance_id: 'suporte-outra', tenant_id: TENANT }
      c.ctx.conversationId = 'conversa-outra'
    }],
  ])('não enfileira feedback com %s', async (_descricao, alterar) => {
    const c = cenario()
    alterar(c)
    expect((await avaliarAgente(c.ctx)).enfileirado).toBe(false)
    expect(c.tabelas.wa_agente_pedidos).toHaveLength(0)
    expect(fetch).not.toHaveBeenCalled()
  })
})
