import { describe, expect, it } from 'vitest'
import {
  ACOES_ADMIN,
  ACOES_CONVERSA,
  TODAS_ACOES,
  filtrarMensagensDoChat,
  mesmoChat,
  perfilPodeAcao,
  validarParametrosAcao,
  variantesDoNumero,
  webhookUrlPermitida,
} from './uazapi-acoes.ts'

describe('perfilPodeAcao (nega por padrão)', () => {
  it('cliente do portal não executa NENHUMA ação', () => {
    for (const a of TODAS_ACOES) expect(perfilPodeAcao('cliente', a)).toBe(false)
  })

  it('sem perfil, perfil desconhecido ou ação desconhecida = não', () => {
    expect(perfilPodeAcao(null, 'react')).toBe(false)
    expect(perfilPodeAcao(undefined, 'react')).toBe(false)
    expect(perfilPodeAcao('admin_cobranca', 'react')).toBe(false)
    expect(perfilPodeAcao('admin', 'apagar_tudo')).toBe(false)
    expect(perfilPodeAcao('admin', 42)).toBe(false)
  })

  it('ações de conversa: todos os perfis do Chat', () => {
    for (const p of ['admin', 'gerente', 'estrategista', 'atendimento', 'agente_chat']) {
      for (const a of ACOES_CONVERSA) expect(perfilPodeAcao(p, a)).toBe(true)
    }
  })

  it('webhook, foto, bloqueio e status: só admin', () => {
    for (const a of ACOES_ADMIN) {
      expect(perfilPodeAcao('admin', a)).toBe(true)
      for (const p of ['gerente', 'estrategista', 'atendimento', 'agente_chat']) {
        expect(perfilPodeAcao(p, a)).toBe(false)
      }
    }
  })

  it('find_chats / list_labels (veem grupos internos): admin e gerente', () => {
    for (const a of ['find_chats', 'list_labels']) {
      expect(perfilPodeAcao('admin', a)).toBe(true)
      expect(perfilPodeAcao('gerente', a)).toBe(true)
      expect(perfilPodeAcao('atendimento', a)).toBe(false)
      expect(perfilPodeAcao('estrategista', a)).toBe(false)
    }
  })
})

describe('validarParametrosAcao', () => {
  it('não-admin/gerente: number obrigatório nas ações de chat', () => {
    expect(validarParametrosAcao('find_messages', {}, false)).toMatchObject({ ok: false, status: 400 })
    expect(validarParametrosAcao('find_messages', { number: '   ' }, false)).toMatchObject({ ok: false })
    expect(validarParametrosAcao('chat_details', { number: 123 }, false)).toMatchObject({ ok: false })
    expect(validarParametrosAcao('mark_read', { number: '5511999998888' }, false)).toEqual({ ok: true })
  })

  it('admin/gerente: find_messages sem number continua permitido', () => {
    expect(validarParametrosAcao('find_messages', {}, true)).toEqual({ ok: true })
  })

  it('não-admin: message_id obrigatório para editar/apagar/reagir', () => {
    expect(validarParametrosAcao('delete_message', {}, false)).toMatchObject({ ok: false })
    expect(validarParametrosAcao('edit_message', { message_id: 'ABC', text: 'x' }, false)).toEqual({ ok: true })
    expect(validarParametrosAcao('react', { number: '5511999998888' }, false)).toMatchObject({ ok: false })
  })

  it('number com caracteres de injeção é recusado (para todos)', () => {
    expect(validarParametrosAcao('chat_details', { number: '1,2)' }, true)).toMatchObject({ ok: false })
    expect(validarParametrosAcao('chat_details', { number: 'a"b' }, false)).toMatchObject({ ok: false })
    expect(validarParametrosAcao('chat_details', { number: '120363012345678901@g.us' }, false)).toEqual({ ok: true })
  })

  it('check_numbers: lista de 1 a 50 números válidos', () => {
    expect(validarParametrosAcao('check_numbers', { numbers: ['5511999998888'] }, false)).toEqual({ ok: true })
    expect(validarParametrosAcao('check_numbers', { numbers: [] }, false)).toMatchObject({ ok: false })
    expect(validarParametrosAcao('check_numbers', { numbers: 'x' }, false)).toMatchObject({ ok: false })
    expect(validarParametrosAcao('check_numbers', { numbers: Array(51).fill('5511999998888') }, true)).toMatchObject({ ok: false })
  })
})

describe('webhookUrlPermitida (anti-sequestro do número)', () => {
  const base = 'https://abc.supabase.co'
  it('só funções do próprio projeto, em https', () => {
    expect(webhookUrlPermitida('https://abc.supabase.co/functions/v1/uazapi-webhook', base)).toBe(true)
    expect(webhookUrlPermitida('https://evil.com/functions/v1/uazapi-webhook', base)).toBe(false)
    expect(webhookUrlPermitida('http://abc.supabase.co/functions/v1/uazapi-webhook', base)).toBe(false)
    expect(webhookUrlPermitida('https://abc.supabase.co.evil.com/functions/v1/x', base)).toBe(false)
    expect(webhookUrlPermitida('https://user:pw@abc.supabase.co/functions/v1/x', base)).toBe(false)
    expect(webhookUrlPermitida('https://abc.supabase.co/rest/v1/x', base)).toBe(false)
    expect(webhookUrlPermitida(undefined, base)).toBe(false)
    expect(webhookUrlPermitida('lixo', base)).toBe(false)
    expect(webhookUrlPermitida('https://abc.supabase.co/functions/v1/x', undefined)).toBe(false)
  })
})

describe('variantesDoNumero', () => {
  it('grupo: com e sem @g.us', () => {
    expect(variantesDoNumero('120363012345678901@g.us')).toEqual(
      expect.arrayContaining(['120363012345678901', '120363012345678901@g.us']),
    )
  })
  it('telefone BR: com e sem 55', () => {
    expect(variantesDoNumero('5511999998888')).toEqual(expect.arrayContaining(['5511999998888', '11999998888']))
    expect(variantesDoNumero('11999998888')).toEqual(expect.arrayContaining(['5511999998888']))
  })
  it('não texto ou vazio = nenhuma', () => {
    expect(variantesDoNumero(undefined)).toEqual([])
    expect(variantesDoNumero('  ')).toEqual([])
  })
})

describe('mesmoChat / filtrarMensagensDoChat', () => {
  it('compara ignorando sufixo, dispositivo e DDI 55', () => {
    expect(mesmoChat('5511999998888@s.whatsapp.net', '5511999998888')).toBe(true)
    expect(mesmoChat('5511999998888:12@s.whatsapp.net', '11999998888')).toBe(true)
    expect(mesmoChat('120363012345678901@g.us', '120363012345678901')).toBe(true)
    expect(mesmoChat('120363099999999999@g.us', '120363012345678901')).toBe(false)
    expect(mesmoChat(undefined, '5511999998888')).toBe(false)
  })

  const m = (chatid: string, id: string) => ({ chatid, id })

  it('mantém só as mensagens do chat pedido', () => {
    const r = filtrarMensagensDoChat(
      { messages: [m('5511999998888@s.whatsapp.net', '1'), m('120363012345678901@g.us', '2')], total: 2 },
      '5511999998888',
    ) as { messages: { id: string }[]; total: number }
    expect(r.messages.map((x) => x.id)).toEqual(['1'])
  })

  it('lista solta também é filtrada', () => {
    const r = filtrarMensagensDoChat([m('120363012345678901@g.us', '2'), { key: { remoteJid: '5511999998888@s.whatsapp.net' }, id: '3' }], '5511999998888')
    expect((r as { id: string }[]).map((x) => x.id)).toEqual(['3'])
  })

  it('formato desconhecido = lista vazia; erro passa', () => {
    expect(filtrarMensagensDoChat({ foo: 1 }, '5511999998888')).toEqual({ messages: [] })
    expect(filtrarMensagensDoChat(null, '5511999998888')).toEqual({ messages: [] })
    expect(filtrarMensagensDoChat({ error: 'x', segredo: 1 }, '5511999998888')).toEqual({ error: 'x' })
  })
})
