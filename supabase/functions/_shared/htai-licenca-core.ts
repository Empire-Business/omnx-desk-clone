/**
 * Licença HTAI por INSTALAÇÃO — contrato `htai.entitlement.v1`, lado do app (Desk).
 *
 * Módulo PURO (sem Deno.env, sem import remoto): roda no Vitest e nas Edge
 * Functions. Quem usa injeta segredos, relógio, fetch e o banco.
 *
 * Mesma assinatura, cabeçalhos, janela de 300 s e estados do módulo de referência
 * do GT3 (`supabase/functions/_shared/htai-v1.ts` no omnx-gt3). O que muda é o
 * escopo: o direito vale para a instalação inteira (`subject:
 * "installation:<id>"`, `external_tenant_ref: "*"`), com credenciais emitidas
 * na ativação. Regra comum: contrato-licenca-instalacao.md (seções 1, 3, 4, 5).
 */

export const HTAI_CONTRACT = 'htai.entitlement.v1'
export const HTAI_SIGNATURE_SCHEME = 'HTAI-HMAC-SHA256-V1'
export const HTAI_MAX_SKEW_SECONDS = 300
/** Slug do app no contrato (`X-HTAI-App` e campo `app`): sempre `omnx-<id>`. A central aceita também `desk`. */
export const HTAI_APP_SLUG = 'omnx-desk'
/** Folga offline máxima aceita num envelope (7 dias, contrato §3); o padrão da central é 3 dias (259.200 s). */
export const HTAI_MAX_OFFLINE_GRACE_SECONDS = 7 * 24 * 3600

export const HTAI_HEADERS = {
  app: 'X-HTAI-App',
  platformKey: 'X-Platform-Key',
  timestamp: 'X-HTAI-Timestamp',
  signature: 'X-HTAI-Signature',
  idempotencyKey: 'Idempotency-Key',
} as const

export type HtaiStatus = 'active' | 'grace' | 'suspended' | 'revoked' | 'expired'
export type HtaiDirection = 'htai-to-app' | 'app-to-htai' | 'htai-response'
export type HtaiMode = 'off' | 'shadow' | 'enforce'

/**
 * Mensagens mostradas à pessoa (contrato, seção 4), uma por motivo: cada um pede
 * uma ação diferente (renovar não resolve suspensa nem revogada). Os mesmos
 * textos estão em public.htai_licenca_situacao() (20261119180200) e em
 * src/lib/licenca.ts.
 */
const DADOS_GUARDADOS = 'Seus dados estão guardados e você pode exportá-los.'
export const MENSAGEM_LICENCA_VENCIDA =
  'A licença deste app venceu. Renove na sua conta HTAI para voltar a usar. ' + DADOS_GUARDADOS
export const MENSAGEM_LICENCA_NAO_ATIVADA =
  'Ative a licença deste app. ' + DADOS_GUARDADOS
export const MENSAGEM_LICENCA_SUSPENSA =
  'A licença deste app está suspensa: o uso foi pausado pela HTAI. Fale com o suporte da HTAI para voltar a usar. ' + DADOS_GUARDADOS
export const MENSAGEM_LICENCA_REVOGADA =
  'A licença deste app foi desativada pela HTAI. Fale com o suporte da HTAI para saber o motivo. ' + DADOS_GUARDADOS
export const MENSAGEM_LICENCA_SEM_CONFIRMACAO =
  'Não foi possível confirmar a licença deste app: ele ficou mais tempo que o permitido sem falar com a HTAI. ' +
  'Ele volta a funcionar sozinho quando a conexão voltar; se continuar assim, fale com o suporte da HTAI. ' + DADOS_GUARDADOS

export interface HtaiEnvelope {
  contract: typeof HTAI_CONTRACT
  event_id: string
  app: string
  workspace_id?: string
  subject: string
  external_tenant_ref: string
  status: HtaiStatus
  reason: string
  legacy?: boolean
  version: number
  issued_at: string
  valid_until: string
  renew_after: string
  offline_grace_seconds: number
  plan_code?: string | null
  features: Record<string, unknown>
  limits: Record<string, unknown>
}

export interface CredenciaisHtai {
  instalacaoId: string
  platformKey: string
  signingSecret: string
  pullUrl: string
}

const STATUSES: readonly HtaiStatus[] = ['active', 'grace', 'suspended', 'revoked', 'expired']
const INSTALACAO_RE = /^[A-Za-z0-9._:-]{1,160}$/
export const IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{1,160}$/
const TIMESTAMP_RE = /^\d{10}$/
const SIGNATURE_RE = /^v1=([0-9a-f]{64})$/

/* ── Criptografia (idêntica ao GT3) ───────────────────────────────────────── */

const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}

/** Comparação em tempo constante (tamanho diferente também percorre o laço todo). */
export function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  const length = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

export function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .sort(([ka, va], [kb, vb]) => (ka === kb ? (va < vb ? -1 : va > vb ? 1 : 0) : ka < kb ? -1 : 1))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

export interface CanonicalInput {
  direction: HtaiDirection
  timestamp: string
  method: string
  app: string
  idempotencyKey: string
  query: string
  bodyHash: string
}

export function canonicalString(input: CanonicalInput): string {
  return [
    HTAI_SIGNATURE_SCHEME,
    input.direction,
    input.timestamp,
    input.method.toUpperCase(),
    input.app,
    input.idempotencyKey,
    input.query,
    input.bodyHash,
  ].join('\n')
}

export async function signHtai(
  secret: string,
  input: Omit<CanonicalInput, 'bodyHash' | 'timestamp'> & { body: string; nowMs: number },
): Promise<{ timestamp: string; signature: string; bodyHash: string }> {
  const timestamp = String(Math.floor(input.nowMs / 1000))
  const bodyHash = await sha256Hex(input.body)
  const hex = await hmacSha256Hex(secret, canonicalString({ ...input, timestamp, bodyHash }))
  return { timestamp, signature: `v1=${hex}`, bodyHash }
}

export type VerifyResult =
  | { ok: true; bodyHash: string; signatureHash: string }
  | { ok: false; code: 'stale_timestamp' | 'invalid_signature' | 'missing_auth' }

export async function verifyHtaiSignature(
  secret: string,
  input: Omit<CanonicalInput, 'bodyHash'> & { body: string; signature: string | null; nowMs: number },
): Promise<VerifyResult> {
  if (!input.signature || !input.timestamp) return { ok: false, code: 'missing_auth' }
  if (!TIMESTAMP_RE.test(input.timestamp)) return { ok: false, code: 'stale_timestamp' }
  if (Math.abs(Math.floor(input.nowMs / 1000) - Number(input.timestamp)) > HTAI_MAX_SKEW_SECONDS) {
    return { ok: false, code: 'stale_timestamp' }
  }
  const supplied = SIGNATURE_RE.exec(input.signature)?.[1]
  if (!supplied) return { ok: false, code: 'invalid_signature' }
  const bodyHash = await sha256Hex(input.body)
  const expected = await hmacSha256Hex(secret, canonicalString({ ...input, bodyHash }))
  if (!constantTimeEqual(expected, supplied)) return { ok: false, code: 'invalid_signature' }
  return { ok: true, bodyHash, signatureHash: await sha256Hex(supplied) }
}

/* ── Modo e credenciais ───────────────────────────────────────────────────── */

export function parseMode(value: string | undefined | null): HtaiMode {
  const v = (value ?? '').trim().toLowerCase()
  return v === 'shadow' || v === 'enforce' ? v : 'off'
}

/**
 * Escopo instalação (app instalado nas contas do cliente pelo instalador do HTAI):
 * `HTAI_INSTALACAO_ID` preenchido ou `HTAI_ESCOPO=instalacao`. Fora dele (a
 * produção da empresa) nada muda.
 */
export function escopoInstalacao(env: (nome: string) => string | undefined): boolean {
  if ((env('HTAI_INSTALACAO_ID') ?? '').trim() !== '') return true
  return (env('HTAI_ESCOPO') ?? '').trim().toLowerCase() === 'instalacao'
}

/**
 * Modo efetivo (contrato §1). No escopo instalação, só `shadow` afrouxa: ausente,
 * vazio, `off` ou valor inválido = `enforce` (o app instalado não desliga a
 * licença por variável). Fora do escopo instalação vale `parseMode` (ausente = `off`).
 */
export function resolverModo(valor: string | undefined | null, instalacao: boolean): HtaiMode {
  if (!instalacao) return parseMode(valor)
  return parseMode(valor) === 'shadow' ? 'shadow' : 'enforce'
}

/** Modo a partir das variáveis do servidor (mesma regra do banco, `htai_licenca_modo()`). */
export function modoDoAmbiente(env: (nome: string) => string | undefined): HtaiMode {
  return resolverModo(env('HTAI_ENTITLEMENTS_MODE'), escopoInstalacao(env))
}

/** Versão do app enviada no pull: `HTAI_APP_VERSION` (contrato) e, na falta, o nome antigo `HTAI_APP_VERSAO`. */
export function versaoDoApp(env: (nome: string) => string | undefined): string | null {
  for (const nome of ['HTAI_APP_VERSION', 'HTAI_APP_VERSAO']) {
    const v = (env(nome) ?? '').trim()
    if (v) return v.slice(0, 64)
  }
  return null
}

/**
 * Lê as credenciais da instalação (variáveis do servidor). Devolve null quando
 * falta qualquer uma ou o formato é inválido: em `enforce` isso é "não ativado"
 * (falha fechada).
 */
export function lerCredenciais(env: (nome: string) => string | undefined): CredenciaisHtai | null {
  const instalacaoId = (env('HTAI_INSTALACAO_ID') ?? '').trim()
  const platformKey = (env('HTAI_PLATFORM_KEY') ?? '').trim()
  const signingSecret = (env('HTAI_SIGNING_SECRET') ?? '').trim()
  const pullUrl = (env('HTAI_PULL_URL') ?? '').trim()
  if (!INSTALACAO_RE.test(instalacaoId)) return null
  if (platformKey.length < 16 || signingSecret.length < 32) return null
  if (!pullUrl.startsWith('https://')) return null
  return { instalacaoId, platformKey, signingSecret, pullUrl }
}

/* ── Envelope (escopo instalação) ─────────────────────────────────────────── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
function isIso(value: unknown): value is string {
  return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
}

export function parseEnvelopeInstalacao(value: unknown, instalacaoId: string): HtaiEnvelope | null {
  if (!isRecord(value) || value.contract !== HTAI_CONTRACT) return null
  if (value.app !== HTAI_APP_SLUG) return null
  if (value.subject !== `installation:${instalacaoId}`) return null
  if (value.external_tenant_ref !== '*') return null
  if (typeof value.event_id !== 'string' || !IDEMPOTENCY_RE.test(value.event_id)) return null
  if (!STATUSES.includes(value.status as HtaiStatus)) return null
  if (!Number.isSafeInteger(value.version) || Number(value.version) < 1) return null
  if (!isIso(value.issued_at) || !isIso(value.valid_until) || !isIso(value.renew_after)) return null
  if (Date.parse(value.valid_until) <= Date.parse(value.issued_at)) return null
  if (!isRecord(value.features ?? {}) || !isRecord(value.limits ?? {})) return null
  const grace = value.offline_grace_seconds
  if (!Number.isSafeInteger(grace) || Number(grace) < 0 || Number(grace) > HTAI_MAX_OFFLINE_GRACE_SECONDS) return null
  return {
    ...(value as unknown as HtaiEnvelope),
    reason: typeof value.reason === 'string' ? value.reason : '',
    features: (value.features as Record<string, unknown>) ?? {},
    limits: (value.limits as Record<string, unknown>) ?? {},
  }
}

/* ── Decisão (seção 4) ────────────────────────────────────────────────────── */

export type MotivoNegacao = 'nao_ativado' | 'suspended' | 'revoked' | 'expired' | 'vencida'

export interface EstadoGuardado {
  status: HtaiStatus
  valid_until: string
  offline_grace_seconds: number
}

export interface Situacao {
  modo: HtaiMode
  /** true = bloquear agora (só em enforce). */
  nega: boolean
  /** true = em shadow, seria bloqueado (só registra). */
  negaria: boolean
  motivo: MotivoNegacao | null
  mensagem: string | null
  valido_ate: string | null
  folga_ate: string | null
}

/**
 * Texto do aviso pelo motivo da negação. `vencida` é o motivo calculado no app
 * (passou de valid_until + folga sem confirmar na central); `expired` é a
 * licença vencida na central.
 */
export function mensagemDaLicenca(motivo: MotivoNegacao | null): string | null {
  switch (motivo) {
    case null: return null
    case 'nao_ativado': return MENSAGEM_LICENCA_NAO_ATIVADA
    case 'suspended': return MENSAGEM_LICENCA_SUSPENSA
    case 'revoked': return MENSAGEM_LICENCA_REVOGADA
    case 'vencida': return MENSAGEM_LICENCA_SEM_CONFIRMACAO
    default: return MENSAGEM_LICENCA_VENCIDA
  }
}

/**
 * Regra única (o banco aplica a mesma em public.htai_licenca_situacao):
 *  - off: tudo liberado, nada é consultado;
 *  - sem credencial ou sem envelope válido guardado: "não ativado";
 *  - suspended / revoked / expired: nega na hora;
 *  - active / grace: libera até valid_until + offline_grace_seconds (a central
 *    fora do ar não derruba o app antes disso; uma resposta válida da central
 *    sempre substitui o estado guardado).
 */
export function avaliarLicenca(input: {
  modo: HtaiMode
  temCredenciais: boolean
  estado: EstadoGuardado | null
  nowMs: number
}): Situacao {
  const base = { valido_ate: input.estado?.valid_until ?? null, folga_ate: null as string | null }
  if (input.modo === 'off') return { modo: 'off', nega: false, negaria: false, motivo: null, mensagem: null, ...base }

  let motivo: MotivoNegacao | null = null
  if (!input.temCredenciais || !input.estado) motivo = 'nao_ativado'
  else if (input.estado.status !== 'active' && input.estado.status !== 'grace') motivo = input.estado.status
  else {
    const ate = Date.parse(input.estado.valid_until)
    const folga = ate + Math.max(0, input.estado.offline_grace_seconds) * 1000
    base.folga_ate = Number.isFinite(folga) ? new Date(folga).toISOString() : null
    if (!Number.isFinite(ate) || input.nowMs >= folga) motivo = 'vencida'
  }
  const mensagem = mensagemDaLicenca(motivo)
  return {
    modo: input.modo,
    nega: motivo !== null && input.modo === 'enforce',
    negaria: motivo !== null && input.modo === 'shadow',
    motivo,
    mensagem,
    ...base,
  }
}

/* ── Pull assinado (seção 3) ──────────────────────────────────────────────── */

export interface PullDeps {
  credenciais: CredenciaisHtai
  versaoApp: string | null
  fetch: typeof fetch
  nowMs(): number
  uuid(): string
  /** anti-replay da resposta: true = assinatura nova. */
  registerSignature(signatureHash: string): Promise<boolean>
}

/** Aviso de versão nova que a central manda junto do envelope (corpo assinado). */
export interface HtaiAppUpdate {
  latestVersion: string
  notes: string[]
}

/** Lê o bloco `atualizacao` da resposta; qualquer coisa fora do formato vira null (o aviso nunca quebra a licença). */
export function parseHtaiAppUpdate(value: unknown): HtaiAppUpdate | null {
  if (!isRecord(value)) return null
  if (typeof value.versao_mais_nova !== 'string' || !/^[0-9A-Za-z.+-]{1,40}$/.test(value.versao_mais_nova)) return null
  const notes = Array.isArray(value.novidades)
    ? value.novidades
        .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
        .map((n) => Array.from(n.trim()).slice(0, 500).join(''))
        .slice(0, 5)
    : []
  return { latestVersion: value.versao_mais_nova, notes }
}

export type PullResult =
  | { kind: 'ok'; envelope: HtaiEnvelope; bodyHash: string; update: HtaiAppUpdate | null }
  | { kind: 'rejected'; code: string }
  | { kind: 'unreachable'; reason: string }

/**
 * Pull assinado. Respostas da central (contrato §3 e API da central):
 *  - 200 assinado: aplica (revogada também vem assim: 200 com `status: "revoked"`);
 *  - 401/403 (JSON sem assinatura: chave desconhecida, assinatura recusada,
 *    `app_mismatch`...): "rejeitado". Não aplica nada e mantém o último envelope
 *    válido, sem estender a validade. Não existe 404 neste contrato;
 *  - 5xx, rede, resposta sem assinatura válida: central inalcançável (vale a folga offline).
 */
export async function puxarLicenca(deps: PullDeps): Promise<PullResult> {
  const c = deps.credenciais
  const body = JSON.stringify({
    contract: HTAI_CONTRACT,
    instalacao_id: c.instalacaoId,
    app: HTAI_APP_SLUG,
    versao: deps.versaoApp,
  })
  const idem = `pull:${c.instalacaoId}:${deps.uuid()}`.slice(0, 160)
  const signed = await signHtai(c.signingSecret, {
    direction: 'app-to-htai',
    method: 'POST',
    app: HTAI_APP_SLUG,
    idempotencyKey: idem,
    query: '',
    body,
    nowMs: deps.nowMs(),
  })
  let response: Response
  try {
    response = await deps.fetch(c.pullUrl, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
      headers: {
        'Content-Type': 'application/json',
        [HTAI_HEADERS.app]: HTAI_APP_SLUG,
        [HTAI_HEADERS.platformKey]: c.platformKey,
        [HTAI_HEADERS.timestamp]: signed.timestamp,
        [HTAI_HEADERS.signature]: signed.signature,
        [HTAI_HEADERS.idempotencyKey]: idem,
      },
      body,
    })
  } catch {
    return { kind: 'unreachable', reason: 'network' }
  }
  if (response.status >= 500) {
    await response.body?.cancel()
    return { kind: 'unreachable', reason: `http_${response.status}` }
  }
  const raw = await response.text()
  if (response.status === 401 || response.status === 403) return { kind: 'rejected', code: codigoDeErro(raw, response.status) }
  if (response.status !== 200) return { kind: 'unreachable', reason: `http_${response.status}` }
  const verified = await verifyHtaiSignature(c.signingSecret, {
    direction: 'htai-response',
    method: 'POST',
    app: HTAI_APP_SLUG,
    idempotencyKey: idem,
    query: '',
    timestamp: response.headers.get(HTAI_HEADERS.timestamp) ?? '',
    signature: response.headers.get(HTAI_HEADERS.signature),
    body: raw,
    nowMs: deps.nowMs(),
  })
  if (!verified.ok) return { kind: 'unreachable', reason: `response_${verified.code}` }
  if (!(await deps.registerSignature(verified.signatureHash))) return { kind: 'unreachable', reason: 'response_replayed' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'unreachable', reason: 'invalid_json' }
  }
  // Aceita o envelope direto ou embrulhado em {ok: true, entitlement} (formato do GT3).
  const record = isRecord(parsed) ? parsed : {}
  const candidato = isRecord(record.entitlement) ? record.entitlement : record
  const envelope = parseEnvelopeInstalacao(candidato, c.instalacaoId)
  if (!envelope) return { kind: 'unreachable', reason: 'invalid_envelope' }
  return {
    kind: 'ok',
    envelope,
    bodyHash: await sha256Hex(JSON.stringify(candidato)),
    // Aviso de versão nova (opcional, dentro do corpo assinado). Nunca decide licença.
    update: parseHtaiAppUpdate(record.atualizacao),
  }
}

/** Código de erro curto da resposta de recusa (`{"ok":false,"error":{"code":"..."}}`), só para registro. */
function codigoDeErro(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: unknown } | string }
    const code = typeof parsed.error === 'string' ? parsed.error : parsed.error?.code
    if (typeof code === 'string' && /^[a-z0-9_]{1,64}$/.test(code)) return code
  } catch { /* corpo não-JSON */ }
  return `http_${status}`
}
