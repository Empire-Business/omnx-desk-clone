// Mesmo módulo no runtime das Edge Functions (Deno). Rodar com:
//   deno test --deny-net supabase/functions/_shared/htai-licenca-core_test.ts
// A bateria completa (matriz de estados, pull, replay) está em htai-licenca-core.test.ts (Vitest).
import assert from 'node:assert/strict'
import { avaliarLicenca, modoDoAmbiente, parseMode, signHtai, verifyHtaiSignature } from './htai-licenca-core.ts'

const SEGREDO = 'signing-secret-'.padEnd(40, 'y')
const base = { direction: 'htai-response' as const, method: 'POST', app: 'omnx-desk', idempotencyKey: 'pull:x', query: '', body: '{"a":1}' }

Deno.test('assinatura: válida, segredo errado e fora da janela', async () => {
  const agora = Date.now()
  const s = await signHtai(SEGREDO, { ...base, nowMs: agora })
  assert.equal((await verifyHtaiSignature(SEGREDO, { ...base, timestamp: s.timestamp, signature: s.signature, nowMs: agora })).ok, true)
  assert.deepEqual(await verifyHtaiSignature('z'.repeat(40), { ...base, timestamp: s.timestamp, signature: s.signature, nowMs: agora }), { ok: false, code: 'invalid_signature' })
  assert.deepEqual(await verifyHtaiSignature(SEGREDO, { ...base, timestamp: s.timestamp, signature: s.signature, nowMs: agora + 301_000 }), { ok: false, code: 'stale_timestamp' })
})

Deno.test('modo off libera; enforce sem credencial nega (falha fechada)', () => {
  assert.equal(parseMode(undefined), 'off')
  assert.equal(modoDoAmbiente(() => undefined), 'off')
  assert.equal(modoDoAmbiente((n) => (n === 'HTAI_ESCOPO' ? 'instalacao' : undefined)), 'enforce')
  assert.equal(avaliarLicenca({ modo: 'off', temCredenciais: false, estado: null, nowMs: Date.now() }).nega, false)
  const s = avaliarLicenca({ modo: 'enforce', temCredenciais: false, estado: null, nowMs: Date.now() })
  assert.equal(s.nega, true)
  assert.equal(s.motivo, 'nao_ativado')
})
