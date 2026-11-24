import { describe, expect, it, vi } from 'vitest'
import { chatDestination, createSendMessageHandler } from './handler'

function setup(options: {
  authenticated?: boolean; active?: boolean | null; visible?: boolean; stored?: boolean;
  group?: boolean; address?: string; providerStatus?: number; providerBody?: unknown;
  networkFailure?: boolean; canEdit?: boolean; replyAvailable?: boolean; postUpdateFailure?: boolean;
} = {}) {
  const inserts: Record<string, unknown>[] = []
  const lookups: { table: string; filters: Record<string, unknown> }[] = []
  const createClient = vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: options.authenticated === false ? null : { id: 'actor' } } })) },
    rpc: vi.fn(async () => ({ error: null, data: options.canEdit !== false })),
    from(table: string) {
      let write = false
      const filters: Record<string, unknown> = {}
      lookups.push({ table, filters })
      const result = () => {
        if (table === 'users') return { data: { id: 'actor', nome: 'Agente', ativo: options.active ?? true, tenant_id: 'tenant-a' }, error: null }
        if (table === 'app_settings') return { data: { valor: 'true' }, error: null }
        if (table === 'chat_messages' && filters.id && options.replyAvailable === false) return { data: null, error: null }
        if (table === 'chat_messages') return options.stored === false
          ? { data: null, error: { code: 'DB_FAIL', message: 'private db detail' } }
          : { data: { id: 'message-a', criado_em: '2026-11-05T12:00:00Z' }, error: null }
        if (table === 'chat_conversations') return {
          data: options.visible === false ? null : { id: 'conversation-a', tenant_id: 'tenant-a', is_group: options.group ?? false,
            chat_contacts: { numero_whatsapp: options.address ?? '5511999999999' },
            whatsapp_instances: { instance_id: 'Suporte4' }, chat_departments: { nome: 'Equipe' } }, error: null,
        }
        return { data: null, error: null }
      }
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => { filters[field] = value; return query },
        insert: (body: Record<string, unknown>) => { inserts.push(body); write = true; return query },
        update: () => { write = true; return query },
        maybeSingle: async () => result(), single: async () => result(),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          if (write && table === 'chat_conversations' && options.postUpdateFailure) return Promise.reject(new Error('update failed')).then(resolve, reject)
          return Promise.resolve(write ? { error: null } : result()).then(resolve, reject)
        },
      }
      return query
    },
  }))
  const fetcher = vi.fn(async (url: RequestInfo | URL) => {
    if (String(url).includes('/message/presence')) return new Response('{}')
    if (options.networkFailure) throw new Error('network secret detail')
    return new Response(JSON.stringify(options.providerBody ?? { messageid: 'wpp-a' }), { status: options.providerStatus ?? 200 })
  })
  const handler = createSendMessageHandler({
    createClient: createClient as unknown as Parameters<typeof createSendMessageHandler>[0]['createClient'],
    env: key => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', UAZAPI_TOKEN_Suporte4: 'token' })[key],
    fetch: fetcher,
  })
  const request = (body: Record<string, unknown> = {}, authorization = 'Bearer user') => new Request('https://example.test/send', {
    method: 'POST', headers: authorization ? { Authorization: authorization } : {},
    body: JSON.stringify({ conversation_id: 'conversation-a', conteudo: 'Mensagem', ...body }),
  })
  const sends = () => fetcher.mock.calls.filter(([url]) => String(url).includes('/send/'))
  return { handler, request, inserts, sends, lookups, fetcher }
}

describe('confirmação real de envio WhatsApp', () => {
  it.each([
    ['sem header', {}, '', 401],
    ['JWT inválido', { authenticated: false }, 'Bearer user', 401],
    ['conta inativa', { active: false }, 'Bearer user', 403],
    ['conversa invisível por RLS', { visible: false }, 'Bearer user', 404],
    ['permissão somente leitura', { canEdit: false }, 'Bearer user', 403],
  ] as const)('nega %s sem enviar', async (_label, options, header, status) => {
    const c = setup(options)
    expect((await c.handler(c.request({}, header))).status).toBe(status)
    expect(c.sends()).toHaveLength(0)
    expect(c.inserts).toHaveLength(0)
  })
  it('nega referência de outra conversa antes do envio', async () => {
    const c = setup({ replyAvailable: false })
    expect((await c.handler(c.request({ reply_to_id: 'foreign-message' }))).status).toBe(400)
    expect(c.sends()).toHaveLength(0)
    expect(c.inserts).toHaveLength(0)
  })
  it('preserva serviço interno sem permissões de usuário', async () => {
    const c = setup({ authenticated: false, canEdit: false })
    expect((await c.handler(c.request({ enviado_por_ia: true }, 'Bearer service'))).status).toBe(200)
    expect(c.sends()).toHaveLength(1)
  })
  it('rejeita texto vazio e mídia ausente antes do provedor', async () => {
    const c = setup()
    expect((await c.handler(c.request({ conteudo: '  ' }))).status).toBe(400)
    expect((await c.handler(c.request({ tipo: 'audio' }))).status).toBe(400)
    expect(c.sends()).toHaveLength(0)
  })
  it.each([400, 401, 429, 500])('HTTP %s do provedor nunca vira sucesso nem registro de enviada', async providerStatus => {
    const c = setup({ providerStatus })
    const response = await c.handler(c.request())
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ delivery: 'rejected' })
    expect(c.inserts).toHaveLength(0)
  })
  it.each([{ error: 'erro' }, { success: false }, { ok: false }])('rejeição explícita em HTTP 200 é falha: %j', async providerBody => {
    const c = setup({ providerBody })
    expect((await c.handler(c.request())).status).toBe(502)
    expect(c.inserts).toHaveLength(0)
  })
  it('envia uma vez, persiste tenant da conversa e usa configuração do mesmo tenant', async () => {
    const c = setup()
    const response = await c.handler(c.request())
    expect(await response.json()).toEqual({ ok: true, persisted: true, uazapi: { messageid: 'wpp-a' } })
    expect(c.sends()).toHaveLength(1)
    expect(c.inserts).toMatchObject([{ tenant_id: 'tenant-a', status_envio: 'enviada', agente_id: 'actor' }])
    expect(c.lookups.find(x => x.table === 'app_settings')?.filters).toMatchObject({ tenant_id: 'tenant-a' })
  })
  it('mantém os caminhos legados de ID sem devolver campos arbitrários do provedor', async () => {
    const c = setup({ providerBody: { messageid: 'id-a', key: { id: 'id-b', private: 'secret' }, token: 'not-for-client' } })
    const body = await (await c.handler(c.request())).json()
    expect(body.uazapi).toEqual({ messageid: 'id-a', key: { id: 'id-b' } })
    expect(JSON.stringify(body)).not.toContain('secret')
    expect(JSON.stringify(body)).not.toContain('not-for-client')
  })
  it('aviso após insert mantém persisted verdadeiro e o recibo de envio', async () => {
    const c = setup({ postUpdateFailure: true })
    const response = await c.handler(c.request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, persisted: true, uazapi: { messageid: 'wpp-a' }, warning: expect.any(String) })
    expect(c.sends()).toHaveLength(1)
  })
  it('falha após envio aceito é aviso, para não induzir reenvio duplicado', async () => {
    const c = setup({ stored: false })
    const response = await c.handler(c.request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, persisted: false, uazapi: { messageid: 'wpp-a' }, warning: expect.stringContaining('Evite reenviar') })
    expect(c.sends()).toHaveLength(1)
  })
  it('falha de rede após tentar enviar informa incerteza e nunca repete automaticamente', async () => {
    const c = setup({ networkFailure: true })
    const response = await c.handler(c.request())
    expect(response.status).toBe(504)
    expect(await response.json()).toMatchObject({ delivery: 'unknown', error: expect.stringContaining('antes de tentar novamente') })
    expect(c.sends()).toHaveLength(1)
    expect(c.inserts).toHaveLength(0)
  })
  it('envia ao JID do grupo sem convertê-lo em telefone', async () => {
    const c = setup({ group: true, address: '120363000000000000' })
    expect((await c.handler(c.request())).status).toBe(200)
    const call = c.fetcher.mock.calls.find(([url]) => String(url).endsWith('/send/text'))
    expect(JSON.parse(String((call as unknown as [string, RequestInit])[1].body)).number).toBe('120363000000000000@g.us')
  })
})

describe('destinos WhatsApp', () => {
  it.each([
    ['(11) 99999-9999', false, '5511999999999'],
    ['+351912345678', false, '351912345678'],
    ['120363000000000000@g.us', true, '120363000000000000@g.us'],
    ['12345-67890', true, '12345-67890@g.us'],
    ['123456789@lid', false, '123456789@lid'],
  ] as const)('preserva %s', (address, group, expected) => expect(chatDestination(address, group)).toBe(expected))
  it.each(['', 'javascript:123', '123@g.us@evil.test'])('nega endereço inválido %s', address => expect(() => chatDestination(address, false)).toThrow())
  it('não troca um grupo por um telefone individual', () => expect(() => chatDestination('5511999999999@s.whatsapp.net', true)).toThrow())
})
