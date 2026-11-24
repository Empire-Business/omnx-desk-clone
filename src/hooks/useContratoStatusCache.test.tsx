import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCreateContrato, useDeleteContrato, useUpdateContrato } from './useComissoes'
import { useCreateContract, useDeleteContract, useUpdateContract } from './useClientes'

const banco = vi.hoisted(() => ({ erro: null as Error | null, insert: vi.fn(), update: vi.fn() }))
vi.mock('@/lib/authTenant', () => ({ tenantDaSessao: async () => 'tenant-a' }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const resultado = () => ({ data: { id: 'contrato-a', cliente_id: 'cliente-a', client_id: 'cliente-a' }, error: banco.erro })
      const select = () => ({ single: async () => resultado() })
      return {
        insert: (payload: unknown) => { banco.insert(payload); return { select } },
        update: (payload: unknown) => { banco.update(payload); return { eq: () => ({ select }) } },
        delete: () => ({ eq: async () => resultado() }),
      }
    },
  },
}))

afterEach(() => { banco.erro = null; banco.insert.mockClear(); banco.update.mockClear() })

const casos = [
  ['criação', function useAcao() {
    const mutation = useCreateContrato()
    return () => mutation.mutateAsync({ cliente_id: 'cliente-a', cliente_nome: 'Cliente', estrategista_id: null,
      data_fechamento: '2026-11-03', valor_total: 100, num_parcelas: 1, percentual_aplicado: 0, status: 'ativo' })
  }],
  ['encerramento', function useAcao() {
    const mutation = useUpdateContrato()
    return () => mutation.mutateAsync({ id: 'contrato-a', status: 'concluido' })
  }],
  ['exclusão', function useAcao() {
    const mutation = useDeleteContrato()
    return () => mutation.mutateAsync('contrato-a')
  }],
  ['criação legada', function useAcao() {
    const mutation = useCreateContract()
    return () => mutation.mutateAsync({ client_id: 'cliente-a', status: 'ATIVO' })
  }],
  ['encerramento legado', function useAcao() {
    const mutation = useUpdateContract()
    return () => mutation.mutateAsync({ id: 'contrato-a', status: 'CANCELADO' })
  }],
  ['exclusão legada', function useAcao() {
    const mutation = useDeleteContract()
    return () => mutation.mutateAsync({ id: 'contrato-a', client_id: 'cliente-a' })
  }],
] as const

const chaves = [
  ['clients', 'list'], ['clients', 'detail', 'cliente-a'], ['clients', 'detail', 'cliente-b'],
  ['clients', 'contracts', 'all'], ['contrato-cliente-vinculo', 'usuario-a', 'contrato-a'],
  ['dashboard-data'],
]

describe('status do cliente após salvar contratos', () => {
  it.each(casos)('%s atualiza ficha, lista e filtros antes de expirar o cache', async (_nome, useAcao) => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity }, mutations: { retry: false } } })
    let executar!: () => Promise<unknown>
    function Probe() { executar = useAcao(); return null }
    try {
      for (const queryKey of chaves) qc.setQueryData(queryKey, { ativo: true })
      qc.setQueryData(['recurso-independente'], 'preservado')
      renderToStaticMarkup(<QueryClientProvider client={qc}><Probe /></QueryClientProvider>)
      await executar()
      for (const queryKey of chaves) expect(qc.getQueryState(queryKey)?.isInvalidated).toBe(true)
      expect(qc.getQueryState(['recurso-independente'])?.isInvalidated).toBe(false)
    } finally { qc.clear() }
  })

  it('não anuncia alteração do cliente quando o banco recusa encerrar o contrato', async () => {
    const qc = new QueryClient()
    let executar!: () => Promise<unknown>
    function Probe() {
      const mutation = useUpdateContrato()
      executar = () => mutation.mutateAsync({ id: 'contrato-a', status: 'concluido' })
      return null
    }
    try {
      banco.erro = new Error('Permissão negada')
      qc.setQueryData(['clients', 'detail', 'cliente-a'], { ativo: true })
      renderToStaticMarkup(<QueryClientProvider client={qc}><Probe /></QueryClientProvider>)
      await expect(executar()).rejects.toThrow('Permissão negada')
      expect(qc.getQueryData(['clients', 'detail', 'cliente-a'])).toEqual({ ativo: true })
      expect(qc.getQueryState(['clients', 'detail', 'cliente-a'])?.isInvalidated).toBe(false)
    } finally { qc.clear() }
  })
})


describe('payload de contrato compatível com o banco', () => {
  it('confirma tenant na criação e não envia a relação de tags como coluna', async () => {
    const qc = new QueryClient()
    let executar!: () => Promise<unknown>
    function Probe() {
      const mutation = useCreateContrato()
      executar = () => mutation.mutateAsync({ cliente_nome: 'Cliente', estrategista_id: null,
        data_fechamento: '2026-11-05', valor_total: 100, num_parcelas: 1, percentual_aplicado: 0, status: 'ativo',
        tags: [{ id: 'tag-a', nome: 'VIP', cor: '#fff', descricao: null }] })
      return null
    }
    try {
      renderToStaticMarkup(<QueryClientProvider client={qc}><Probe /></QueryClientProvider>)
      await executar()
      expect(banco.insert).toHaveBeenCalledWith(expect.objectContaining({ cliente_nome: 'Cliente', tenant_id: 'tenant-a' }))
      expect(banco.insert.mock.calls[0][0]).not.toHaveProperty('tags')
    } finally { qc.clear() }
  })
  it('preserva limpeza explícita sem enviar a relação de tags no update', async () => {
    const qc = new QueryClient()
    let executar!: () => Promise<unknown>
    function Probe() {
      const mutation = useUpdateContrato()
      executar = () => mutation.mutateAsync({ id: 'contrato-a', email: null, tags: [] })
      return null
    }
    try {
      renderToStaticMarkup(<QueryClientProvider client={qc}><Probe /></QueryClientProvider>)
      await executar()
      expect(banco.update).toHaveBeenCalledWith({ email: null })
    } finally { qc.clear() }
  })
})
