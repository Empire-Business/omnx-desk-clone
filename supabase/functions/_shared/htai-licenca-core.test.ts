import { describe, expect, it, vi } from 'vitest'
import {
  avaliarLicenca,
  canonicalQuery,
  canonicalString,
  HTAI_APP_SLUG,
  lerCredenciais,
  MENSAGEM_LICENCA_NAO_ATIVADA,
  MENSAGEM_LICENCA_REVOGADA,
  MENSAGEM_LICENCA_SEM_CONFIRMACAO,
  MENSAGEM_LICENCA_SUSPENSA,
  MENSAGEM_LICENCA_VENCIDA,
  mensagemDaLicenca,
  parseEnvelopeInstalacao,
  escopoInstalacao,
  HTAI_MAX_OFFLINE_GRACE_SECONDS,
  modoDoAmbiente,
  parseMode,
  puxarLicenca,
  resolverModo,
  versaoDoApp,
  sha256Hex,
  signHtai,
  verifyHtaiSignature,
  type CredenciaisHtai,
} from './htai-licenca-core'

const INST = 'inst_0001'
const CRED: CredenciaisHtai = {
  instalacaoId: INST,
  platformKey: 'platform-key-'.padEnd(40, 'x'),
  signingSecret: 'signing-secret-'.padEnd(40, 'y'),
  pullUrl: 'https://central.test/functions/v1/htai-pull',
}

function envelope(over: Record<string, unknown> = {}) {
  const now = Date.now()
  return {
    contract: 'htai.entitlement.v1',
    event_id: `htai:${HTAI_APP_SLUG}:${INST}:v3`,
    app: HTAI_APP_SLUG,
    subject: `installation:${INST}`,
    external_tenant_ref: '*',
    status: 'active',
    reason: 'paid',
    version: 3,
    issued_at: new Date(now).toISOString(),
    valid_until: new Date(now + 300_000).toISOString(),
    renew_after: new Date(now + 150_000).toISOString(),
    offline_grace_seconds: 3600,
    plan_code: null,
    features: { exportar_dados: true },
    limits: {},
    ...over,
  }
}

/** Central de mentira: confere a assinatura do pedido e responde assinado (htai-response). */
function central(opts: { status?: number; corpo?: unknown; segredoResposta?: string; atrasoMs?: number; semAssinatura?: boolean } = {}) {
  return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const h = new Headers(init?.headers)
    const body = String(init?.body ?? '')
    const pedido = await verifyHtaiSignature(CRED.signingSecret, {
      direction: 'app-to-htai', method: 'POST', app: HTAI_APP_SLUG,
      idempotencyKey: h.get('Idempotency-Key') ?? '', query: '',
      timestamp: h.get('X-HTAI-Timestamp') ?? '', signature: h.get('X-HTAI-Signature'), body, nowMs: Date.now(),
    })
    if (!pedido.ok || h.get('X-Platform-Key') !== CRED.platformKey || h.get('X-HTAI-App') !== 'omnx-desk') {
      return new Response('{}', { status: 401 })
    }
    expect(JSON.parse(body)).toMatchObject({ contract: 'htai.entitlement.v1', instalacao_id: INST, app: 'omnx-desk' })
    const raw = JSON.stringify(opts.corpo ?? { ok: true, entitlement: envelope() })
    if (opts.semAssinatura) return new Response(raw, { status: opts.status ?? 200 })
    const assinado = await signHtai(opts.segredoResposta ?? CRED.signingSecret, {
      direction: 'htai-response', method: 'POST', app: HTAI_APP_SLUG,
      idempotencyKey: h.get('Idempotency-Key') ?? '', query: '', body: raw, nowMs: Date.now() - (opts.atrasoMs ?? 0),
    })
    return new Response(raw, {
      status: opts.status ?? 200,
      headers: { 'X-HTAI-Timestamp': assinado.timestamp, 'X-HTAI-Signature': assinado.signature },
    })
  })
}

function pull(fetchFn: typeof fetch, registro = new Set<string>()) {
  return puxarLicenca({
    credenciais: CRED,
    versaoApp: '1.0.0',
    fetch: fetchFn,
    nowMs: () => Date.now(),
    uuid: () => crypto.randomUUID(),
    registerSignature: async (hash) => (registro.has(hash) ? false : (registro.add(hash), true)),
  })
}

describe('assinatura HTAI-HMAC-SHA256-V1 (mesmos vetores do GT3)', () => {
  it('texto canônico: 8 linhas, sem \\n final, query ordenada, hash do corpo vazio', async () => {
    const text = canonicalString({
      direction: 'htai-to-app', timestamp: '1730000000', method: 'post', app: 'omnx-gt3', idempotencyKey: 'k',
      query: canonicalQuery(new URLSearchParams('b=2&a=1')), bodyHash: await sha256Hex(''),
    })
    expect(text.split('\n')).toEqual(['HTAI-HMAC-SHA256-V1', 'htai-to-app', '1730000000', 'POST', 'omnx-gt3', 'k', 'a=1&b=2',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'])
    expect(text.endsWith('\n')).toBe(false)
  })

  const base = { direction: 'htai-response' as const, method: 'POST', app: 'omnx-desk', idempotencyKey: 'pull:x', query: '', body: '{"a":1}' }

  it('válida → ok; segredo errado → invalid_signature; corpo alterado → invalid_signature', async () => {
    const now = Date.now()
    const s = await signHtai(CRED.signingSecret, { ...base, nowMs: now })
    expect((await verifyHtaiSignature(CRED.signingSecret, { ...base, timestamp: s.timestamp, signature: s.signature, nowMs: now })).ok).toBe(true)
    const errada = await verifyHtaiSignature('outro'.padEnd(40, 'z'), { ...base, timestamp: s.timestamp, signature: s.signature, nowMs: now })
    expect(errada).toEqual({ ok: false, code: 'invalid_signature' })
    const alterada = await verifyHtaiSignature(CRED.signingSecret, { ...base, body: '{"a":2}', timestamp: s.timestamp, signature: s.signature, nowMs: now })
    expect(alterada).toEqual({ ok: false, code: 'invalid_signature' })
  })

  it('fora da janela de 300 s → stale_timestamp; sem cabeçalho → missing_auth', async () => {
    const now = Date.now()
    const s = await signHtai(CRED.signingSecret, { ...base, nowMs: now - 301_000 })
    expect(await verifyHtaiSignature(CRED.signingSecret, { ...base, timestamp: s.timestamp, signature: s.signature, nowMs: now }))
      .toEqual({ ok: false, code: 'stale_timestamp' })
    expect(await verifyHtaiSignature(CRED.signingSecret, { ...base, timestamp: '', signature: null, nowMs: now }))
      .toEqual({ ok: false, code: 'missing_auth' })
  })
})

describe('envelope de instalação', () => {
  it('aceita subject installation:<id> e external_tenant_ref "*"', () => {
    expect(parseEnvelopeInstalacao(envelope(), INST)).not.toBeNull()
    expect(parseEnvelopeInstalacao(envelope({ status: 'suspended' }), INST)).not.toBeNull()
  })
  it('recusa outra instalação, outro app, empresa específica, versão 0 e validade antes da emissão', () => {
    expect(parseEnvelopeInstalacao(envelope(), 'outra')).toBeNull()
    expect(parseEnvelopeInstalacao(envelope({ app: 'omnx-gt3' }), INST)).toBeNull()
    expect(parseEnvelopeInstalacao(envelope({ app: 'desk' }), INST)).toBeNull()
    expect(parseEnvelopeInstalacao(envelope({ external_tenant_ref: 'tenant-1' }), INST)).toBeNull()
    expect(parseEnvelopeInstalacao(envelope({ version: 0 }), INST)).toBeNull()
    expect(parseEnvelopeInstalacao(envelope({ valid_until: new Date(0).toISOString() }), INST)).toBeNull()
  })
  it('folga offline: até 7 dias (604.800 s); acima disso o envelope é recusado', () => {
    expect(HTAI_MAX_OFFLINE_GRACE_SECONDS).toBe(604_800)
    expect(parseEnvelopeInstalacao(envelope({ offline_grace_seconds: 259_200 }), INST)).not.toBeNull()
    expect(parseEnvelopeInstalacao(envelope({ offline_grace_seconds: 604_800 }), INST)).not.toBeNull()
    expect(parseEnvelopeInstalacao(envelope({ offline_grace_seconds: 604_801 }), INST)).toBeNull()
  })
})

describe('modo e credenciais', () => {
  it('slug do contrato é omnx-desk', () => {
    expect(HTAI_APP_SLUG).toBe('omnx-desk')
  })

  it('fora do escopo instalação (produção da empresa): só shadow/enforce; ausente ou outro valor = off', () => {
    expect(parseMode('enforce')).toBe('enforce')
    expect(parseMode(' SHADOW ')).toBe('shadow')
    expect(parseMode(undefined)).toBe('off')
    expect(parseMode('ligado')).toBe('off')
    expect(modoDoAmbiente(() => undefined)).toBe('off')
    expect(modoDoAmbiente((n) => (n === 'HTAI_ENTITLEMENTS_MODE' ? 'shadow' : undefined))).toBe('shadow')
  })

  it('escopo instalação: HTAI_INSTALACAO_ID preenchido ou HTAI_ESCOPO=instalacao', () => {
    expect(escopoInstalacao(() => undefined)).toBe(false)
    expect(escopoInstalacao((n) => (n === 'HTAI_INSTALACAO_ID' ? '  ' : undefined))).toBe(false)
    expect(escopoInstalacao((n) => (n === 'HTAI_INSTALACAO_ID' ? INST : undefined))).toBe(true)
    expect(escopoInstalacao((n) => (n === 'HTAI_ESCOPO' ? ' Instalacao ' : undefined))).toBe(true)
    expect(escopoInstalacao((n) => (n === 'HTAI_ESCOPO' ? 'empresa' : undefined))).toBe(false)
  })

  it('no escopo instalação: ausente, vazio, off ou inválido = enforce; shadow continua shadow', () => {
    for (const v of [undefined, '', '  ', 'off', 'ligado', 'enforce']) expect(resolverModo(v, true)).toBe('enforce')
    expect(resolverModo('shadow', true)).toBe('shadow')
    expect(modoDoAmbiente((n) => (n === 'HTAI_ESCOPO' ? 'instalacao' : undefined))).toBe('enforce')
    expect(modoDoAmbiente((n) => ({ HTAI_INSTALACAO_ID: INST, HTAI_ENTITLEMENTS_MODE: 'off' } as Record<string, string>)[n])).toBe('enforce')
  })

  it('versão do app: HTAI_APP_VERSION primeiro, depois HTAI_APP_VERSAO', () => {
    expect(versaoDoApp(() => undefined)).toBeNull()
    expect(versaoDoApp((n) => (n === 'HTAI_APP_VERSAO' ? '0.1.5' : undefined))).toBe('0.1.5')
    expect(versaoDoApp((n) => ({ HTAI_APP_VERSION: '0.2.0', HTAI_APP_VERSAO: '0.1.5' } as Record<string, string>)[n])).toBe('0.2.0')
  })
  it('credenciais: faltando qualquer uma ou endereço sem https → null', () => {
    const env = { HTAI_INSTALACAO_ID: INST, HTAI_PLATFORM_KEY: CRED.platformKey, HTAI_SIGNING_SECRET: CRED.signingSecret, HTAI_PULL_URL: CRED.pullUrl }
    expect(lerCredenciais((n) => env[n as keyof typeof env])).toEqual(CRED)
    for (const k of Object.keys(env)) {
      expect(lerCredenciais((n) => (n === k ? undefined : env[n as keyof typeof env]))).toBeNull()
    }
    expect(lerCredenciais((n) => (n === 'HTAI_PULL_URL' ? 'http://central.test' : env[n as keyof typeof env]))).toBeNull()
    expect(lerCredenciais((n) => (n === 'HTAI_SIGNING_SECRET' ? 'curto' : env[n as keyof typeof env]))).toBeNull()
  })
})

describe('decisão (matriz da seção 4)', () => {
  const agora = Date.now()
  const futuro = new Date(agora + 60_000).toISOString()
  const passado = new Date(agora - 60_000).toISOString()

  it('off: sempre liberado, sem motivo', () => {
    const s = avaliarLicenca({ modo: 'off', temCredenciais: false, estado: null, nowMs: agora })
    expect(s).toMatchObject({ modo: 'off', nega: false, negaria: false, motivo: null })
  })

  it('enforce sem credencial ou sem envelope: nega como "não ativado" (falha fechada)', () => {
    for (const s of [
      avaliarLicenca({ modo: 'enforce', temCredenciais: false, estado: { status: 'active', valid_until: futuro, offline_grace_seconds: 0 }, nowMs: agora }),
      avaliarLicenca({ modo: 'enforce', temCredenciais: true, estado: null, nowMs: agora }),
    ]) {
      expect(s).toMatchObject({ nega: true, motivo: 'nao_ativado', mensagem: MENSAGEM_LICENCA_NAO_ATIVADA })
    }
  })

  it('active e grace dentro da validade liberam; suspended/revoked/expired negam na hora', () => {
    for (const status of ['active', 'grace'] as const) {
      expect(avaliarLicenca({ modo: 'enforce', temCredenciais: true, estado: { status, valid_until: futuro, offline_grace_seconds: 0 }, nowMs: agora }).nega).toBe(false)
    }
    const esperado = { suspended: MENSAGEM_LICENCA_SUSPENSA, revoked: MENSAGEM_LICENCA_REVOGADA, expired: MENSAGEM_LICENCA_VENCIDA }
    for (const status of ['suspended', 'revoked', 'expired'] as const) {
      const s = avaliarLicenca({ modo: 'enforce', temCredenciais: true, estado: { status, valid_until: futuro, offline_grace_seconds: 86400 }, nowMs: agora })
      expect(s).toMatchObject({ nega: true, motivo: status, mensagem: esperado[status] })
    }
  })

  it('aviso pelo motivo real: só a vencida manda renovar (ensaio de 19/11/2026)', () => {
    expect(mensagemDaLicenca(null)).toBeNull()
    expect(mensagemDaLicenca('expired')).toMatch(/venceu\. Renove/)
    for (const motivo of ['nao_ativado', 'suspended', 'revoked', 'vencida'] as const) {
      expect(mensagemDaLicenca(motivo)).not.toMatch(/venceu|Renove/)
      expect(mensagemDaLicenca(motivo)).toContain('Seus dados estão guardados e você pode exportá-los.')
    }
    expect(mensagemDaLicenca('suspended')).toContain('suspensa')
    expect(mensagemDaLicenca('revoked')).toContain('desativada')
    expect(mensagemDaLicenca('vencida')).toContain('Não foi possível confirmar')
    expect(new Set([MENSAGEM_LICENCA_NAO_ATIVADA, MENSAGEM_LICENCA_SUSPENSA, MENSAGEM_LICENCA_REVOGADA, MENSAGEM_LICENCA_SEM_CONFIRMACAO, MENSAGEM_LICENCA_VENCIDA]).size).toBe(5)
  })

  it('central fora do ar: funciona até valid_until + offline_grace_seconds, depois nega como vencida', () => {
    const naFolga = avaliarLicenca({ modo: 'enforce', temCredenciais: true, estado: { status: 'active', valid_until: passado, offline_grace_seconds: 3600 }, nowMs: agora })
    expect(naFolga.nega).toBe(false)
    expect(naFolga.folga_ate).not.toBeNull()
    const semFolga = avaliarLicenca({ modo: 'enforce', temCredenciais: true, estado: { status: 'active', valid_until: passado, offline_grace_seconds: 30 }, nowMs: agora })
    expect(semFolga).toMatchObject({ nega: true, motivo: 'vencida', mensagem: MENSAGEM_LICENCA_SEM_CONFIRMACAO })
  })

  it('shadow: avalia e marca "negaria", sem negar', () => {
    const s = avaliarLicenca({ modo: 'shadow', temCredenciais: false, estado: null, nowMs: agora })
    expect(s).toMatchObject({ nega: false, negaria: true, motivo: 'nao_ativado' })
  })
})

describe('pull assinado — aviso de versão nova', () => {
  it('o bloco atualizacao vem do corpo assinado; sem ele, update é null', async () => {
    const com = await pull(central({ corpo: { ok: true, entitlement: envelope(), atualizacao: { versao_mais_nova: '0.2.0', novidades: ['Novo.'] } } }) as unknown as typeof fetch)
    expect(com).toMatchObject({ kind: 'ok', update: { latestVersion: '0.2.0', notes: ['Novo.'] } })
    const sem = await pull(central() as unknown as typeof fetch)
    expect(sem).toMatchObject({ kind: 'ok', update: null })
  })

  it('aviso forjado sem a assinatura da central é recusado junto com a resposta', async () => {
    const forjado = await pull(central({ corpo: { ok: true, entitlement: envelope(), atualizacao: { versao_mais_nova: '9.9.9' } }, segredoResposta: 'x'.repeat(40) }) as unknown as typeof fetch)
    expect(forjado).toEqual({ kind: 'unreachable', reason: 'response_invalid_signature' })
  })

  it('aviso em formato estranho é ignorado e a licença é aplicada mesmo assim', async () => {
    const r = await pull(central({ corpo: { ok: true, entitlement: envelope(), atualizacao: { versao_mais_nova: '<script>' } } }) as unknown as typeof fetch)
    expect(r).toMatchObject({ kind: 'ok', update: null })
  })
})

describe('pull assinado', () => {
  it('resposta assinada válida → envelope aplicado', async () => {
    const f = central()
    const r = await pull(f as unknown as typeof fetch)
    expect(r.kind).toBe('ok')
    expect(f).toHaveBeenCalledTimes(1)
    if (r.kind === 'ok') expect(r.envelope).toMatchObject({ status: 'active', version: 3, external_tenant_ref: '*' })
  })

  it('aceita o envelope direto (sem {ok, entitlement})', async () => {
    const r = await pull(central({ corpo: envelope({ status: 'grace' }) }) as unknown as typeof fetch)
    expect(r.kind === 'ok' && r.envelope.status).toBe('grace')
  })

  it('resposta sem assinatura, assinada com outro segredo ou velha → central inalcançável (não aplica)', async () => {
    expect(await pull(central({ semAssinatura: true }) as unknown as typeof fetch)).toEqual({ kind: 'unreachable', reason: 'response_missing_auth' })
    expect(await pull(central({ segredoResposta: 'x'.repeat(40) }) as unknown as typeof fetch)).toEqual({ kind: 'unreachable', reason: 'response_invalid_signature' })
    expect(await pull(central({ atrasoMs: 301_000 }) as unknown as typeof fetch)).toEqual({ kind: 'unreachable', reason: 'response_stale_timestamp' })
  })

  it('envelope de outra instalação → não aplica', async () => {
    const outra = await pull(central({ corpo: { ok: true, entitlement: envelope({ subject: 'installation:outra' }) } }) as unknown as typeof fetch)
    expect(outra).toEqual({ kind: 'unreachable', reason: 'invalid_envelope' })
  })

  it('401/403 sem assinatura → rejeitado (com o código da central); 404 não existe no contrato', async () => {
    const r401 = vi.fn(async () => new Response('{"ok":false,"error":{"code":"invalid_platform_key","retryable":false}}', { status: 401 }))
    expect(await pull(r401 as unknown as typeof fetch)).toEqual({ kind: 'rejected', code: 'invalid_platform_key' })
    const r403 = vi.fn(async () => new Response('{"ok":false,"error":{"code":"app_mismatch"}}', { status: 403 }))
    expect(await pull(r403 as unknown as typeof fetch)).toEqual({ kind: 'rejected', code: 'app_mismatch' })
    const semJson = vi.fn(async () => new Response('negado', { status: 401 }))
    expect(await pull(semJson as unknown as typeof fetch)).toEqual({ kind: 'rejected', code: 'http_401' })
    // Um 404 (proxy, endereço errado) não é resposta da central: conta como inalcançável.
    expect(await pull(central({ status: 404, corpo: { ok: false } }) as unknown as typeof fetch)).toEqual({ kind: 'unreachable', reason: 'http_404' })
  })

  it('revogada: 200 assinado com status revoked é aplicado', async () => {
    const r = await pull(central({ corpo: { ok: true, entitlement: envelope({ status: 'revoked', reason: 'installation_revoked' }) } }) as unknown as typeof fetch)
    expect(r.kind === 'ok' && r.envelope.status).toBe('revoked')
  })

  it('replay da mesma resposta assinada é recusado', async () => {
    const registro = new Set<string>()
    const r1 = await pull(central() as unknown as typeof fetch, registro)
    expect(r1.kind).toBe('ok')
    expect(registro.size).toBe(1)
    // O registro (tabela htai_licenca_assinaturas) já conhece a assinatura → recusa.
    const recusa = await puxarLicenca({
      credenciais: CRED, versaoApp: null, fetch: central() as unknown as typeof fetch, nowMs: () => Date.now(),
      uuid: () => 'fixo', registerSignature: async () => false,
    })
    expect(recusa).toEqual({ kind: 'unreachable', reason: 'response_replayed' })
  })

  it('rede fora → unreachable network; 5xx → unreachable', async () => {
    const falha = vi.fn(async () => { throw new TypeError('offline') })
    expect(await pull(falha as unknown as typeof fetch)).toEqual({ kind: 'unreachable', reason: 'network' })
    const cai = vi.fn(async () => new Response('x', { status: 503 }))
    expect(await pull(cai as unknown as typeof fetch)).toEqual({ kind: 'unreachable', reason: 'http_503' })
  })
})
