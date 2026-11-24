import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chaveTempoResposta, useAcaoTempoResposta } from './useTempoResposta'

const estado = vi.hoisted(() => ({
  ator: 'ator-a', tenant: '00000000-0000-0000-0000-000000000001',
  erro: null as unknown, invocar: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: estado.ator } } }, error: null }) },
  rpc: async () => ({ data: estado.tenant, error: null }),
  functions: { invoke: async (...args: unknown[]) => { estado.invocar(...args); return { data: { ok: true }, error: estado.erro } } },
} }))
const escopo = { actorId: 'ator-a', tenantId: '00000000-0000-0000-0000-000000000001' }
afterEach(() => { estado.ator = escopo.actorId; estado.tenant = escopo.tenantId; estado.erro = null; estado.invocar.mockReset() })

function preparar() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  let agir!: () => Promise<unknown>
  function Probe() {
    const mutation = useAcaoTempoResposta(escopo)
    agir = () => mutation.mutateAsync({ acao: 'titular', client_id: 'c1', user_id: 'u1' })
    return null
  }
  renderToStaticMarkup(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)
  return { client, agir }
}

describe('ações do monitor escopadas à sessão', () => {
  it('separa caches de atores e tenants', () => {
    expect(chaveTempoResposta(escopo)).not.toEqual(chaveTempoResposta({ ...escopo, actorId: 'outro' }))
    expect(chaveTempoResposta(escopo)).not.toEqual(chaveTempoResposta({ ...escopo, tenantId: 'outro' }))
  })
  it('não envia uma ação capturada antes da troca de usuário', async () => {
    const p = preparar()
    try { estado.ator = 'outro'; await expect(p.agir()).rejects.toThrow(/sessão mudou/); expect(estado.invocar).not.toHaveBeenCalled() }
    finally { p.client.clear() }
  })
  it('não envia uma ação capturada antes da troca de tenant', async () => {
    const p = preparar()
    try { estado.tenant = '00000000-0000-0000-0000-000000000002'; await expect(p.agir()).rejects.toThrow(/workspace mudou/); expect(estado.invocar).not.toHaveBeenCalled() }
    finally { p.client.clear() }
  })
  it('recusa403 sem expor erro interno nem anunciar sucesso', async () => {
    const p = preparar()
    try {
      estado.erro = { context: new Response('SQL interno confidencial', { status: 403 }), message: 'SQL interno confidencial' }
      await expect(p.agir()).rejects.toThrow('Seu acesso ao monitor não foi confirmado')
    } finally { p.client.clear() }
  })
  it('invalida somente o cache do ator e tenant após uma alteração confirmada', async () => {
    const p = preparar()
    try {
      const proprio = [...chaveTempoResposta(escopo), 'painel', null]
      const outro = [...chaveTempoResposta({ ...escopo, actorId: 'outro' }), 'painel', null]
      p.client.setQueryData(proprio, 'antes'); p.client.setQueryData(outro, 'preservado')
      await p.agir()
      expect(p.client.getQueryState(proprio)?.isInvalidated).toBe(true)
      expect(p.client.getQueryState(outro)?.isInvalidated).toBe(false)
      expect(estado.invocar).toHaveBeenCalledWith('tempo-resposta-admin', { body: { acao: 'titular', client_id: 'c1', user_id: 'u1' } })
    } finally { p.client.clear() }
  })
})
