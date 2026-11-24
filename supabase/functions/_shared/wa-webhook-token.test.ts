import { describe, expect, it } from 'vitest'
import {
  caminhoSemToken, gerarTokenWebhook, hashTokenHex, mascararUrlWebhook, segmentosDoEvento, tokenDaUrl, urlComToken,
  urlTemToken,
} from './wa-webhook-token.ts'

const SB = 'https://abc.supabase.co'
const TOK = 'A'.repeat(20) + 'b_c-d' + '9'.repeat(18) // 43 chars base64url

describe('tokenDaUrl', () => {
  it('sem token', () => {
    expect(tokenDaUrl(new URL(`${SB}/functions/v1/uazapi-webhook`))).toEqual({ tipo: 'ausente' })
    expect(tokenDaUrl(new URL(`${SB}/functions/v1/uazapi-webhook/messages?instance=X`))).toEqual({ tipo: 'ausente' })
  })
  it('token no caminho, com e sem sufixos da UAZAPI (addUrlEvents/addUrlTypesMessages)', () => {
    expect(tokenDaUrl(new URL(`${SB}/functions/v1/uazapi-webhook/k/${TOK}`))).toEqual({ tipo: 'presente', token: TOK })
    expect(tokenDaUrl(new URL(`${SB}/functions/v1/uazapi-webhook/k/${TOK}/messages/text`))).toEqual({ tipo: 'presente', token: TOK })
    expect(tokenDaUrl(new URL(`${SB}/uazapi-webhook/k/${TOK}?instance=Suporte4`))).toEqual({ tipo: 'presente', token: TOK })
  })
  it('token na query, inclusive com sufixo grudado pela UAZAPI', () => {
    expect(tokenDaUrl(new URL(`${SB}/functions/v1/uazapi-webhook?k=${TOK}`))).toEqual({ tipo: 'presente', token: TOK })
    expect(tokenDaUrl(new URL(`${SB}/functions/v1/uazapi-webhook?k=${TOK}/messages`))).toEqual({ tipo: 'presente', token: TOK })
  })
  it('token curto, longo ou com caractere estranho = inválido', () => {
    expect(tokenDaUrl(new URL(`${SB}/functions/v1/uazapi-webhook/k/curto`))).toEqual({ tipo: 'invalido' })
    expect(tokenDaUrl(new URL(`${SB}/functions/v1/uazapi-webhook/k/${'a'.repeat(257)}`))).toEqual({ tipo: 'invalido' })
    expect(tokenDaUrl(new URL(`${SB}/functions/v1/uazapi-webhook/k/${'a'.repeat(40)}%27`))).toEqual({ tipo: 'invalido' })
    expect(tokenDaUrl(new URL(`${SB}/functions/v1/uazapi-webhook/k`))).toEqual({ tipo: 'invalido' })
    expect(tokenDaUrl(new URL(`${SB}/functions/v1/uazapi-webhook?k=`))).toEqual({ tipo: 'invalido' })
  })
})

describe('segmentosDoEvento / caminhoSemToken', () => {
  it('pula k/<token>', () => {
    expect(segmentosDoEvento(new URL(`${SB}/functions/v1/uazapi-webhook/k/${TOK}/messages/text`))).toEqual(['messages', 'text'])
    expect(segmentosDoEvento(new URL(`${SB}/functions/v1/uazapi-webhook/messages`))).toEqual(['messages'])
    expect(segmentosDoEvento(new URL(`${SB}/functions/v1/outra`))).toEqual([])
  })
  it('log nunca mostra o token nem a query', () => {
    const u = new URL(`${SB}/functions/v1/uazapi-webhook/k/${TOK}/messages?k=${TOK}`)
    const c = caminhoSemToken(u)
    expect(c).toBe('/functions/v1/uazapi-webhook/k/***/messages')
    expect(c).not.toContain(TOK)
  })
})

describe('gerarTokenWebhook / hashTokenHex', () => {
  it('43 caracteres base64url, aleatórios, aceitos por tokenDaUrl', () => {
    const a = gerarTokenWebhook()
    const b = gerarTokenWebhook()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
    expect(tokenDaUrl(new URL(`${SB}/functions/v1/uazapi-webhook/k/${a}`))).toEqual({ tipo: 'presente', token: a })
  })
  it('sha256 hex (igual ao sha256(convert_to(t,UTF8)) do Postgres)', async () => {
    expect(await hashTokenHex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('urlComToken / urlTemToken', () => {
  it('troca só o caminho e preserva a query existente', () => {
    expect(urlComToken(`${SB}/functions/v1/uazapi-webhook?instance=Suporte4`, SB, TOK))
      .toBe(`${SB}/functions/v1/uazapi-webhook/k/${TOK}?instance=Suporte4`)
    expect(urlComToken(`${SB}/functions/v1/uazapi-webhook`, SB, TOK)).toBe(`${SB}/functions/v1/uazapi-webhook/k/${TOK}`)
  })
  it('rotação: substitui token antigo (caminho ou query)', () => {
    expect(urlComToken(`${SB}/functions/v1/uazapi-webhook/k/${'z'.repeat(43)}`, SB, TOK))
      .toBe(`${SB}/functions/v1/uazapi-webhook/k/${TOK}`)
    expect(urlComToken(`${SB}/functions/v1/uazapi-webhook?k=${'z'.repeat(43)}&instance=A`, SB, TOK))
      .toBe(`${SB}/functions/v1/uazapi-webhook/k/${TOK}?instance=A`)
  })
  it('recusa destino de outro projeto, outra função ou http', () => {
    expect(urlComToken('https://evil.com/functions/v1/uazapi-webhook', SB, TOK)).toBeNull()
    expect(urlComToken(`${SB}/functions/v1/outra-funcao`, SB, TOK)).toBeNull()
    expect(urlComToken('http://abc.supabase.co/functions/v1/uazapi-webhook', SB, TOK)).toBeNull()
    expect(urlComToken('não é url', SB, TOK)).toBeNull()
  })
  it('urlTemToken', () => {
    expect(urlTemToken(`${SB}/functions/v1/uazapi-webhook/k/${TOK}`, TOK)).toBe(true)
    expect(urlTemToken(`${SB}/functions/v1/uazapi-webhook/k/${TOK}`, 'x'.repeat(43))).toBe(false)
    expect(urlTemToken(undefined, TOK)).toBe(false)
  })
})

describe('mascararUrlWebhook', () => {
  it('esconde token no caminho e na query', () => {
    expect(mascararUrlWebhook(`${SB}/functions/v1/uazapi-webhook/k/${TOK}?instance=A`))
      .toBe(`${SB}/functions/v1/uazapi-webhook/k/***?instance=A`)
    expect(String(mascararUrlWebhook(`${SB}/functions/v1/uazapi-webhook?k=${TOK}`))).not.toContain(TOK)
    expect(mascararUrlWebhook(null)).toBeNull()
  })
})
