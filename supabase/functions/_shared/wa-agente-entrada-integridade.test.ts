import { describe, expect, it } from 'vitest'
import { encaminhadaEntradaAcaoChat, hashEntradaDiretaAcaoChat, sha256EntradaAcaoChat } from './wa-agente-entrada-integridade.ts'
import { avaliarAgente } from '../uazapi-webhook/agente.ts'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'

const elegivel = { autenticada: true, tipo: 'texto', conteudo: 'Íris, confirmar ABCD1234',
  fromMe: false, enviadaPorApi: false, quotedId: null, gatilho: 'nome', encaminhada: null }

describe('integridade da entrada autenticada', () => {
  it('usa SHA-256 UTF-8 sem normalizar conteúdo, caixa ou espaço', async () => {
    expect(await sha256EntradaAcaoChat('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await sha256EntradaAcaoChat('Íris, confirmar ABCD1234')).not.toBe(await sha256EntradaAcaoChat('Íris, confirmar ABCD1234 '))
    expect(await sha256EntradaAcaoChat('original')).not.toBe(await sha256EntradaAcaoChat('editado'))
  })
  it('não transforma ausência, texto ou metadados citados em prova de ausência de encaminhamento', () => {
    expect(encaminhadaEntradaAcaoChat({}, {})).toBeNull()
    expect(encaminhadaEntradaAcaoChat({ content: 'isForwarded=false' }, {})).toBeNull()
    expect(encaminhadaEntradaAcaoChat({ contextInfo: { quotedMessage: { contextInfo: { isForwarded: false } } } }, {})).toBeNull()
    expect(encaminhadaEntradaAcaoChat({ contextInfo: { isForwarded: 'false' } }, {})).toBeNull()
  })
  it('positiva conhecida prevalece; negativa só quando explicitamente conhecida', () => {
    expect(encaminhadaEntradaAcaoChat({ contextInfo: { isForwarded: false, forwardingScore: 1 } }, {})).toBe(true)
    expect(encaminhadaEntradaAcaoChat({ content: { contextInfo: { isForwarded: true } } }, {})).toBe(true)
    expect(encaminhadaEntradaAcaoChat({}, { message: { contextInfo: { isForwarded: false } } })).toBe(false)
    expect(encaminhadaEntradaAcaoChat({ contextInfo: { forwardingScore: 0 } }, {})).toBe(false)
    expect(encaminhadaEntradaAcaoChat({ contextInfo: { isForwarded: false, forwardingScore: -1 } }, {})).toBeNull()
  })
  it.each([
    { autenticada: false }, { tipo: 'audio' }, { conteudo: null }, { fromMe: true }, { enviadaPorApi: true },
    { conteudo: '   ' }, { encaminhada: true },
  ])('não carimba entrada originalmente inelegível: %j', async (alteracao) => {
    expect(await hashEntradaDiretaAcaoChat({ ...elegivel, ...alteracao })).toBeNull()
  })
  it('carimba somente o corpo próprio de uma resposta a aviso, sem texto citado', async () => {
    const conteudo = 'Cliente Alfa está com o estrategista Nora.'
    expect(await hashEntradaDiretaAcaoChat({ ...elegivel, conteudo, quotedId: 'aviso', gatilho: 'quote' })).toBe(await sha256EntradaAcaoChat(conteudo))
    expect(await hashEntradaDiretaAcaoChat({ ...elegivel, conteudo: '', quotedId: 'aviso', gatilho: 'quote' })).toBeNull()
  })
  it('carimba exatamente o texto do envelope e preserva encaminhamento desconhecido', async () => {
    expect(await hashEntradaDiretaAcaoChat(elegivel)).toBe(await sha256EntradaAcaoChat(elegivel.conteudo))
    expect(elegivel.encaminhada).toBeNull()
  })
  it('produtor grava digest do ctx.conteudo original, apesar do Chat já editado', async () => {
    const t = 'tenant-test'
    const f = criarSupabaseFalso({
      wa_agente_membros: [{ id: 'm', tenant_id: t, user_id: 'u', telefone_chave: '5511999999999', ativo: true }],
      users: [{ id: 'u', tenant_id: t, ativo: true, perfil: 'admin' }],
      wa_auto_config: [{ tenant_id: t, agente_ativo: true, agente_privado: true, uazapi_instance_id: 'agente' }],
      whatsapp_instances: [{ id: 'i', tenant_id: t, numero_whatsapp: '5511888888888' }],
      chat_messages: [{ id: 'msg', tenant_id: t, conversation_id: 'cv', message_id_wpp: 'wpp', conteudo: 'EDITADO NO CHAT' }],
    })
    const r = await avaliarAgente({ supabase: f.client, agenteAutorizado: true,
      instance: { id: 'i', instance_id: 'agente', tenant_id: t }, body: {}, msg: { fromMe: false, wasSentByApi: false },
      chatid: '5511999999999@s.whatsapp.net', isGroup: false, numero: '5511999999999', tipo: 'texto',
      conteudo: elegivel.conteudo, messageIdWpp: 'wpp', conversationId: 'cv' })
    expect(r.enfileirado).toBe(true)
    const p = f.inseridos.find((i) => i.tabela === 'wa_agente_pedidos')!.linhas[0]
    expect(p.entrada_texto_sha256).toBe(await sha256EntradaAcaoChat(elegivel.conteudo))
    expect(p.entrada_texto_sha256).not.toBe(await sha256EntradaAcaoChat('EDITADO NO CHAT'))
    expect(p.entrada_encaminhada).toBeNull()
    expect(p).not.toHaveProperty('conteudo')
  })
})
