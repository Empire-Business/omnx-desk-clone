// Real handlers; no network, database, provider, JWT minting, or listeners.
const names = ['cami-deliveries', 'disparo-enviar-ghl', 'empire-conexao-test', 'ia-analyze-message', 'ia-bot-respond', 'ia-suggest-reply', 'ia-summarize-conversation', 'instagram-stats', 'instagram-stats-batch', 'vendas-buscar-lead-crm', 'vendas-sincronizar-crm', 'wa-auto-backtest', 'wa-auto-templates', 'wa-auto-testar-envio']
const root = new URL('../', import.meta.url)
const handlers: ((req: Request) => Promise<Response>)[] = []
Object.defineProperty(Deno, 'serve', { value: (handler: any) => { handlers.push(handler); return {} } })
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY', 'CAMI_SUPABASE_URL', 'CAMI_SERVICE_ROLE_KEY', 'CRON_SECRET', 'SCRAPECREATORS_API_KEY']) Deno.env.set(name, `test-${name}`)
let reads = 0; let checks = 0; let state = 'password_change_required'
const session = '11111111-1111-4111-8111-111111111111'
globalThis.fetch = () => { throw new Error('Real fetch is forbidden') }
;(globalThis as any).__deskCreateClient = (_url: string, _key: string, options: any) => ({
  auth: { getUser: async () => ({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } }, error: null }) },
  rpc: (name: string) => {
    if (name !== 'desk_password_change_status') { reads++; throw new Error('Unexpected privileged RPC') }
    if (options?.global?.headers?.Authorization !== 'Bearer unit-test-opaque-user') throw new Error('Wrong Bearer')
    checks++
    return Promise.resolve({ data: { state, requirement_active: true, session_id: session }, error: null })
  },
  from: () => { reads++; throw new Error('Unexpected privileged data read') },
})
function assert(ok: boolean, message: string) { if (!ok) throw new Error(message) }
for (const name of names) {
  const previous = handlers.length
  await import(new URL(name + '/index.ts', root).href)
  assert(handlers.length === previous + 1, 'Handler not captured: ' + name)
  const handler = handlers[previous]
  Deno.test(name + ' denies pending next-login session before data/provider', async () => {
    reads = 0; checks = 0; state = 'password_change_required'
    const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: { Authorization: 'Bearer unit-test-opaque-user', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: '33333333-3333-4333-8333-333333333333' }) }))
    assert([401, 403].includes(response.status), `Unexpected HTTP ${response.status}`)
    assert(checks === 1, 'Session RPC not checked exactly once')
    assert(reads === 0, 'Privileged work started before session gate')
  })
  if (['ia-analyze-message', 'ia-bot-respond', 'ia-suggest-reply', 'ia-summarize-conversation'].includes(name)) {
    Deno.test(name + ' keeps internal service branch independent of human session', async () => {
      reads = 0; checks = 0
      const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: { Authorization: 'Bearer test-SUPABASE_SERVICE_ROLE_KEY', 'Content-Type': 'application/json' }, body: '{}' }))
      assert(response.status === 400, `Service path did not reach input validation: ${response.status}`)
      assert(checks === 0, 'Service path entered human gate')
      assert(reads === 0, 'Unexpected service effect for invalid input')
    })
  }
  if (name === 'instagram-stats-batch') {
    Deno.test('Instagram cron does not enter human session gate', async () => {
      reads = 0; checks = 0
      // A forbidden mocked data read proves that cron reached its original path;
      // it is caught here and never performs real data/network work.
      await handler(new Request('https://example.invalid', { method: 'POST', headers: { 'x-cron-secret': 'test-CRON_SECRET', 'Content-Type': 'application/json' }, body: '{}' })).catch(() => {})
      assert(checks === 0, 'Cron entered human gate')
      assert(reads === 1, 'Cron did not reach its original data path')
    })
  }
}
