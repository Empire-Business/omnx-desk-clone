import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIMITE_RESPOSTA_BYTES, lerTextoLimitado, novoProvedorUazapi, WaProviderError, ZernioProvider } from './wa-provider.ts'

function fluxo(...pedacos: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const p of pedacos) c.enqueue(enc.encode(p))
      c.close()
    },
  })
}

describe('lerTextoLimitado', () => {
  it('lê corpo dentro do limite (inclusive acentos em vários pedaços)', async () => {
    expect(await lerTextoLimitado(fluxo('{"acao":', '"catálogo"}'), 1024)).toBe('{"acao":"catálogo"}')
    expect(await lerTextoLimitado(null, 10)).toBe('')
  })

  it('para e devolve null quando passa do limite (em bytes)', async () => {
    expect(await lerTextoLimitado(fluxo('a'.repeat(600), 'b'.repeat(600)), 1024)).toBeNull()
    expect(await lerTextoLimitado(fluxo('ç'.repeat(513)), 1024)).toBeNull() // 1026 bytes
  })

  it('limite da resposta do provedor é 256 KB', () => {
    expect(LIMITE_RESPOSTA_BYTES).toBe(256 * 1024)
  })
})

describe('ZernioProvider — valida no construtor (SSRF)', () => {
  it('aceita a base da Zernio', () => {
    expect(() => new ZernioProvider('https://zernio.com/api/v1', 'k', 'acc_1')).not.toThrow()
  })

  it.each([
    'https://evil.example.com/api/v1',
    'http://zernio.com/api/v1',
    'https://zernio.com.evil.com/api',
    'https://user:pw@zernio.com/api/v1',
    'https://zernio.com:8443/api/v1',
    'https://169.254.169.254/latest',
  ])('recusa %s', (url) => {
    expect(() => new ZernioProvider(url, 'k', 'acc_1')).toThrow(WaProviderError)
  })

  it('recusa accountId fora do formato', () => {
    expect(() => new ZernioProvider('https://zernio.com/api/v1', 'k', '../x')).toThrow(WaProviderError)
  })
})

describe('UAZAPI — humanização obrigatória e "digitando…"', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('recusa base_url fora da allowlist', () => {
    expect(() => novoProvedorUazapi('https://evil.example.com', 't')).toThrow(WaProviderError)
    expect(() => novoProvedorUazapi('https://x.uazapi.com', '')).toThrow(WaProviderError)
  })

  it('texto sem humanização não sai (falha fechada, nem chega a chamar a rede)', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const p = novoProvedorUazapi('https://empirebusiness.uazapi.com', 'tok')
    await expect(p.sendText('+5511999998888', 'Olá')).rejects.toMatchObject({ codigo: 'nao_suportado' })
    expect(f).not.toHaveBeenCalled()
  })

  it('texto humanizado sai com delay de digitação proporcional', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ messageid: 'm1' }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    const p = novoProvedorUazapi('https://empirebusiness.uazapi.com', 'tok')
    const r = await p.sendText('+5511999998888', 'Oi, tudo bem? Mensagem de teste.', { humanizado: 'ia' })
    expect(r.messageId).toBe('m1')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://empirebusiness.uazapi.com/send/text')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({ number: '5511999998888', text: 'Oi, tudo bem? Mensagem de teste.' })
    expect(body.delay).toBeGreaterThanOrEqual(1_500)
    expect(body.delay).toBeLessThanOrEqual(7_000)
    expect(body.readchat).toBeUndefined()
  })
})

describe('UAZAPI /send/text — sem chave de idempotência: repete só em 429 (auditoria A4)', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  const enviar = () => novoProvedorUazapi('https://empirebusiness.uazapi.com', 'tok')
    .sendText('+5511999998888', 'Oi, tudo bem? Mensagem de teste.', { humanizado: 'fallback' })

  it('erro de rede (pode ter saído) → NÃO repete e marca incerto', async () => {
    const f = vi.fn(async () => { throw new TypeError('connection reset') })
    vi.stubGlobal('fetch', f)
    await expect(enviar()).rejects.toMatchObject({ codigo: 'rede', incerto: true })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it.each([503, 500, 502])('%s → NÃO repete e marca incerto', async (status) => {
    const f = vi.fn(async () => new Response('{}', { status }))
    vi.stubGlobal('fetch', f)
    await expect(enviar()).rejects.toMatchObject({ incerto: true, httpStatus: status })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('429 (nada processado) → repete uma vez', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messageid: 'm2' }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    await expect(enviar()).resolves.toMatchObject({ messageId: 'm2' })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('recusa clara (400/401) não é incerta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })))
    await expect(enviar()).rejects.toMatchObject({ codigo: 'recusado', incerto: false })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    await expect(enviar()).rejects.toMatchObject({ codigo: 'recusado', incerto: false })
  })
})
