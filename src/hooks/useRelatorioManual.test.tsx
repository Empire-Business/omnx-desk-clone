import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRelatorioManual, type PedidoRelatorioManual, type ResultadoRelatorioManual } from './useRelatorioManual'

const state = vi.hoisted(() => ({ tenant: 'tenant-a', sessionActor: 'actor-a', role: 'admin', invoke: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'actor-a', tenant_id: 'tenant-a', perfil: state.role } }) }))
vi.mock('@/lib/authTenant', () => ({ tenantDaSessao: async () => state.tenant }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: state.sessionActor } } }, error: null }) },
  functions: { invoke: (...args: unknown[]) => state.invoke(...args) },
} }))
function mount() {
  // Mesmo com retry global, uma ação externa manual nunca repete automaticamente.
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 3, retryDelay: 0 } } })
  let execute!: (body: PedidoRelatorioManual) => Promise<ResultadoRelatorioManual>
  function Probe() { execute = useRelatorioManual().mutateAsync; return null }
  renderToStaticMarkup(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)
  return { client, execute }
}
beforeEach(() => {
  state.tenant = 'tenant-a'; state.sessionActor = 'actor-a'; state.role = 'admin'
  state.invoke.mockReset().mockResolvedValue({ data: { ok: true, status: 'enviado', accepted: true, persisted: true }, error: null })
})
describe('relatório manual pelo cliente autenticado', () => {
  it.each(['tenant', 'session', 'role'])('troca/negação %s impede invoke', async scenario => {
    const { client, execute } = mount()
    if (scenario === 'tenant') state.tenant = 'tenant-b'
    if (scenario === 'session') state.sessionActor = 'actor-b'
    // Perfil capturado ao montar, como no clique na tela.
    if (scenario === 'role') { client.clear(); state.role = 'gerente' }
    const target = scenario === 'role' ? mount() : { client, execute }
    await expect(target.execute({ destinatario_id: 'grupo', request_id: 'request', confirmacao: { grupo: 'jid', instancia: 'instance' } })).rejects.toThrow()
    expect(state.invoke).not.toHaveBeenCalled(); target.client.clear(); client.clear()
  })
  it('envia somente body autorizado e header de ator; não extrai JWT', async () => {
    const { client, execute } = mount()
    const body = { destinatario_id: 'grupo', request_id: 'request', confirmacao: { grupo: 'jid', instancia: 'instance' } }
    await execute(body)
    expect(state.invoke).toHaveBeenCalledExactlyOnceWith('wa-auto-relatorio-diario', { body: { destinatario_id: 'grupo', request_id: 'request' }, headers: { 'x-actor-id': 'actor-a', 'x-relatorio-grupo': 'jid', 'x-relatorio-instancia': 'instance' } })
    client.clear()
  })
  it('falha de rede não repete automaticamente, mesmo com retry global habilitado', async () => {
    const { client, execute } = mount()
    state.invoke.mockResolvedValue({ data: null, error: new Error('network') })
    await expect(execute({ destinatario_id: 'grupo', request_id: 'request', confirmacao: { grupo: 'jid', instancia: 'instance' } })).rejects.toThrow('mesmo pedido')
    expect(state.invoke).toHaveBeenCalledTimes(1); client.clear()
  })
  it('decodifica erro seguro de HTTP sem mostrar detalhe arbitrário do servidor', async () => {
    const { client, execute } = mount()
    state.invoke.mockResolvedValue({ data: null, error: { context: Response.json({ error: 'grupo_bloqueado', detail: 'segredo-do-provedor' }, { status: 403 }) } })
    await expect(execute({ destinatario_id: 'grupo', request_id: 'request', confirmacao: { grupo: 'jid', instancia: 'instance' } })).rejects.toThrow('grupo não está liberado')
    client.clear()
  })
  it('prévia não invalida histórico; resultado incerto preserva informação real', async () => {
    const { client, execute } = mount(); client.setQueryData(['wa-auto', 'envios'], [])
    state.invoke.mockResolvedValueOnce({ data: { ok: true, status: 'previa', mensagem: 'prévia' }, error: null })
    await execute({ acao: 'prever_manual', destinatario_id: 'grupo' })
    expect(client.getQueryState(['wa-auto', 'envios'])?.isInvalidated).toBe(false)
    state.invoke.mockResolvedValueOnce({ data: { ok: true, status: 'pendente', accepted: true, persisted: false, message_id: 'real', incerto: true }, error: null })
    expect(await execute({ destinatario_id: 'grupo', request_id: 'request', confirmacao: { grupo: 'jid', instancia: 'instance' } })).toMatchObject({ accepted: true, persisted: false, message_id: 'real', incerto: true })
    expect(client.getQueryState(['wa-auto', 'envios'])?.isInvalidated).toBe(true); client.clear()
  })
})
