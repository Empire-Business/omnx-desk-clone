import { describe, expect, it, vi } from 'vitest'
import { HTAI_APP_SLUG, signHtai, type CredenciaisHtai } from '../_shared/htai-licenca-core'
import { sincronizarLicenca, type EstadoLinha, type SincronizarDeps } from './sincronizar'

const INST = 'inst_0001'
const CRED: CredenciaisHtai = {
  instalacaoId: INST,
  platformKey: 'platform-key-'.padEnd(40, 'x'),
  signingSecret: 'signing-secret-'.padEnd(40, 'y'),
  pullUrl: 'https://central.test/pull',
}

function envelope(version: number, status = 'active') {
  const now = Date.now()
  return {
    contract: 'htai.entitlement.v1', event_id: `e${version}`, app: HTAI_APP_SLUG, subject: `installation:${INST}`,
    external_tenant_ref: '*', status, reason: '', version,
    issued_at: new Date(now).toISOString(), valid_until: new Date(now + 600_000).toISOString(),
    renew_after: new Date(now + 300_000).toISOString(), offline_grace_seconds: 3600, features: {}, limits: {},
  }
}

function centralAssinada(corpo: unknown, status = 200) {
  return vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
    const raw = JSON.stringify(corpo)
    const idem = new Headers(init?.headers).get('Idempotency-Key') ?? ''
    const s = await signHtai(CRED.signingSecret, { direction: 'htai-response', method: 'POST', app: HTAI_APP_SLUG, idempotencyKey: idem, query: '', body: raw, nowMs: Date.now() })
    return new Response(raw, { status, headers: { 'X-HTAI-Timestamp': s.timestamp, 'X-HTAI-Signature': s.signature } })
  })
}

function montar(over: Partial<SincronizarDeps> & { estado?: EstadoLinha | null } = {}) {
  const gravados: Record<string, unknown>[] = []
  const deps: SincronizarDeps = {
    modo: 'enforce',
    credenciais: CRED,
    versaoApp: null,
    fetch: centralAssinada({ ok: true, entitlement: envelope(2) }) as unknown as typeof fetch,
    nowMs: () => Date.now(),
    uuid: () => crypto.randomUUID(),
    lerEstado: async () => over.estado ?? null,
    gravar: async (c) => { gravados.push(c) },
    registerSignature: async () => true,
    ...over,
  }
  return { deps, gravados }
}

describe('sincronizarLicenca', () => {
  it('modo off: não chama a central nem grava nada', async () => {
    const f = vi.fn()
    const { deps, gravados } = montar({ modo: 'off', fetch: f as unknown as typeof fetch })
    expect(await sincronizarLicenca(deps)).toEqual({ feito: 'desligado' })
    expect(f).not.toHaveBeenCalled()
    expect(gravados).toHaveLength(0)
  })

  it('sem credenciais: registra "nao_ativado" sem chamar a central', async () => {
    const f = vi.fn()
    const { deps, gravados } = montar({ credenciais: null, fetch: f as unknown as typeof fetch })
    expect(await sincronizarLicenca(deps)).toEqual({ feito: 'nao_ativado' })
    expect(f).not.toHaveBeenCalled()
    expect(gravados[0]).toMatchObject({ ultimo_erro: 'nao_ativado' })
  })

  it('antes de renew_after não puxa', async () => {
    const f = vi.fn()
    const { deps } = montar({ fetch: f as unknown as typeof fetch, estado: { versao: 2, renew_after: new Date(Date.now() + 60_000).toISOString(), ultima_tentativa_em: null } })
    expect(await sincronizarLicenca(deps)).toEqual({ feito: 'em_dia' })
    expect(f).not.toHaveBeenCalled()
  })

  it('aplica envelope válido e guarda status, validade e folga', async () => {
    const { deps, gravados } = montar()
    expect(await sincronizarLicenca(deps)).toEqual({ feito: 'aplicado', status: 'active', versao: 2, atualizacao: null })
    expect(gravados.at(-1)).toMatchObject({ status: 'active', versao: 2, offline_grace_seconds: 3600, ultimo_erro: null })
  })

  it('não regride para versão mais antiga', async () => {
    const { deps, gravados } = montar({ estado: { versao: 5, renew_after: new Date(0).toISOString(), ultima_tentativa_em: null } })
    expect(await sincronizarLicenca(deps)).toEqual({ feito: 'ignorado_versao_antiga', versao: 2 })
    expect(gravados.some((g) => 'status' in g)).toBe(false)
  })

  it('central fora: mantém o último envelope e só registra o erro', async () => {
    const { deps, gravados } = montar({ fetch: vi.fn(async () => { throw new Error('x') }) as unknown as typeof fetch })
    expect(await sincronizarLicenca(deps)).toEqual({ feito: 'central_fora', motivo: 'network' })
    expect(gravados.some((g) => 'status' in g)).toBe(false)
  })

  it('401 sem assinatura (chave desconhecida): rejeitado, não aplica e não estende a validade', async () => {
    const recusa = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: 'invalid_platform_key', retryable: false } }), { status: 401 }))
    const { deps, gravados } = montar({ fetch: recusa as unknown as typeof fetch })
    expect(await sincronizarLicenca(deps)).toEqual({ feito: 'rejeitado', codigo: 'invalid_platform_key' })
    expect(gravados.some((g) => 'status' in g || 'valid_until' in g)).toBe(false)
    expect(gravados.at(-1)).toEqual({ ultimo_erro: 'rejeitado:invalid_platform_key' })
  })

  it('403 app_mismatch: rejeitado do mesmo jeito', async () => {
    const recusa = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: 'app_mismatch' } }), { status: 403 }))
    const { deps } = montar({ fetch: recusa as unknown as typeof fetch })
    expect(await sincronizarLicenca(deps)).toEqual({ feito: 'rejeitado', codigo: 'app_mismatch' })
  })

  it('instalação revogada chega como 200 assinado com status revoked e é aplicada', async () => {
    const { deps, gravados } = montar({ fetch: centralAssinada({ ok: true, entitlement: envelope(3, 'revoked') }) as unknown as typeof fetch })
    expect(await sincronizarLicenca(deps)).toEqual({ feito: 'aplicado', status: 'revoked', versao: 3, atualizacao: null })
    expect(gravados.at(-1)).toMatchObject({ status: 'revoked', versao: 3 })
  })

  it('pedido da tela (forçar) respeita 1 tentativa por minuto', async () => {
    const f = vi.fn()
    const { deps } = montar({ fetch: f as unknown as typeof fetch, estado: { versao: 2, renew_after: null, ultima_tentativa_em: new Date().toISOString() } })
    expect(await sincronizarLicenca(deps, { forcar: true })).toEqual({ feito: 'aguardando' })
    expect(f).not.toHaveBeenCalled()
  })

  it('aviso de versão nova que veio no corpo assinado sai no resultado, sem mudar o que é gravado da licença', async () => {
    const corpo = { ok: true, entitlement: envelope(2), atualizacao: { versao_mais_nova: '0.3.0', novidades: ['Novo.'] } }
    const { deps, gravados } = montar({ fetch: centralAssinada(corpo) as unknown as typeof fetch })
    expect(await sincronizarLicenca(deps)).toEqual({ feito: 'aplicado', status: 'active', versao: 2, atualizacao: { latestVersion: '0.3.0', notes: ['Novo.'] } })
    expect(Object.keys(gravados.at(-1) ?? {})).not.toContain('atualizacao')
  })
})
