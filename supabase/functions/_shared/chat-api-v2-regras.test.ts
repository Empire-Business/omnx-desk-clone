import { describe, expect, it } from 'vitest'
import {
  caminhoDaRota, COLUNAS_CONTATO, COLUNAS_CONVERSA, COLUNAS_MENSAGEM, corsHeaders, ENVIO_PELA_API, extrairChave, hashChave,
  lerResultadoLimite, limiteDeConfig, limiteMensagens, origensPermitidas, rotaNormalizada, temPermissao,
} from './chat-api-v2-regras.ts'

const CHAVE = `edk_${'a1'.repeat(32)}`
const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null })

describe('extrairChave', () => {
  it('aceita X-API-Key e Bearer edk_', () => {
    expect(extrairChave(h({ 'x-api-key': CHAVE }))).toBe(CHAVE)
    expect(extrairChave(h({ authorization: `Bearer ${CHAVE}` }))).toBe(CHAVE)
    expect(extrairChave(h({ authorization: `bearer ${CHAVE}` }))).toBe(CHAVE)
  })
  it('recusa formato errado, JWT e vazio', () => {
    expect(extrairChave(h({}))).toBeNull()
    expect(extrairChave(h({ 'x-api-key': 'edk_curta' }))).toBeNull()
    expect(extrairChave(h({ authorization: 'Bearer eyJhbGciOi.x.y' }))).toBeNull()
    expect(extrairChave(h({ 'x-api-key': `${CHAVE}x` }))).toBeNull()
  })
  it('hash é SHA-256 hex estável', async () => {
    const a = await hashChave(CHAVE)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).toBe(await hashChave(CHAVE))
  })
})

describe('CORS restrito', () => {
  const ok = origensPermitidas('https://desk.exemplo.com/, http://inseguro.com, lixo, https://b.com')
  it('só aceita origens https exatas', () => expect(ok).toEqual(['https://desk.exemplo.com', 'https://b.com']))
  it('origem liberada recebe Allow-Origin específico (nunca *)', () => {
    const c = corsHeaders('https://b.com', ok)
    expect(c['Access-Control-Allow-Origin']).toBe('https://b.com')
  })
  it('origem desconhecida ou ausente não recebe CORS', () => {
    expect(corsHeaders('https://evil.com', ok)['Access-Control-Allow-Origin']).toBeUndefined()
    expect(corsHeaders(null, ok)['Access-Control-Allow-Origin']).toBeUndefined()
    expect(corsHeaders('https://b.com', [])['Access-Control-Allow-Origin']).toBeUndefined()
  })
})

describe('limite por chave', () => {
  it('config e padrão', () => {
    expect(limiteDeConfig(undefined)).toEqual({ requisicoes: 60, janelaSeg: 60 })
    expect(limiteDeConfig('120')).toEqual({ requisicoes: 120, janelaSeg: 60 })
    expect(limiteDeConfig('10/30')).toEqual({ requisicoes: 10, janelaSeg: 30 })
    expect(limiteDeConfig('0')).toEqual({ requisicoes: 60, janelaSeg: 60 })
    expect(limiteDeConfig('abc')).toEqual({ requisicoes: 60, janelaSeg: 60 })
  })
  it('resposta estranha da RPC nega (falha fechada)', () => {
    expect(lerResultadoLimite(null).permitido).toBe(false)
    expect(lerResultadoLimite({ permitido: 'sim' }).permitido).toBe(false)
    expect(lerResultadoLimite({ permitido: true, restante: 3, reset_seg: 9 })).toEqual({ permitido: true, restante: 3, resetSeg: 9 })
  })
})

describe('caminhoDaRota', () => {
  it('aceita o pathname do Edge Runtime (sem /functions/v1)', () => {
    expect(caminhoDaRota('/chat-api-v2/conversations')).toBe('conversations')
    expect(caminhoDaRota('/chat-api-v2/instances/')).toBe('instances')
    expect(caminhoDaRota('/chat-api-v2/conversations/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f/close')).toBe('conversations/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f/close')
    expect(caminhoDaRota('/chat-api-v2')).toBe('')
  })
  it('aceita o pathname completo (/functions/v1/chat-api-v2)', () => {
    expect(caminhoDaRota('/functions/v1/chat-api-v2/contacts')).toBe('contacts')
    expect(caminhoDaRota('/functions/v1/chat-api-v2/')).toBe('')
  })
  it('não confunde com outra função de nome parecido', () => {
    expect(caminhoDaRota('/chat-api-v2x/contacts')).toBe('chat-api-v2x/contacts')
    expect(caminhoDaRota('/chat-api/contacts')).toBe('chat-api/contacts')
  })
})

describe('auditoria e colunas', () => {
  it('rota normalizada sem ids nem query', () => {
    expect(rotaNormalizada('get', 'conversations/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f?x=1')).toBe('GET /conversations/:id')
    expect(rotaNormalizada('PATCH', '/conversations/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f/close')).toBe('PATCH /conversations/:id/close')
  })
  it('colunas expostas não vazam notas, tags, ids internos', () => {
    const todas = `${COLUNAS_CONVERSA} ${COLUNAS_CONTATO} ${COLUNAS_MENSAGEM}`
    for (const proibida of ['notas', 'tags', 'restrito_admin', 'tenant_id', 'message_id_wpp', 'autor_user_id', 'autor_chave', 'resumo_ia', '*']) {
      expect(todas).not.toContain(proibida)
    }
  })
  it('limiteMensagens', () => {
    expect([limiteMensagens(null), limiteMensagens('999'), limiteMensagens('0'), limiteMensagens('7')]).toEqual([50, 200, 50, 7])
  })
})

describe('regra do dono: envio', () => {
  it('envio pela API externa segue desligado (texto cru em número não oficial)', () => {
    expect(ENVIO_PELA_API).toBe(false)
  })
  it('permissões', () => {
    expect(temPermissao(['*'], 'x')).toBe(true)
    expect(temPermissao(['a'], 'b')).toBe(false)
  })
})
