import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useContrato, useApplyExtraction } from './useComissoes'

const banco = vi.hoisted(() => ({ pagamentos: null as unknown, update: vi.fn() }))
vi.mock('@/lib/authTenant', () => ({ tenantDaSessao: async () => 'tenant-a' }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: (tabela: string) => tabela === 'contrato_clientes' ? { select: () => ({ in: async () => ({ data: [], error: null }) }) } : ({
    select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'contrato-a', pagamentos: banco.pagamentos }, error: null }) }) }),
    update: banco.update,
  }),
} }))
beforeEach(() => { banco.pagamentos = null; banco.update.mockClear() })

async function consultar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Probe() { useContrato('contrato-a'); return null }
  try {
    renderToStaticMarkup(<QueryClientProvider client={qc}><Probe /></QueryClientProvider>)
    return await qc.getQueryCache().find({ queryKey: ['comissoes', 'contrato', 'contrato-a'] })!.fetch()
  } finally { qc.clear() }
}

describe('dados financeiros persistidos do contrato', () => {
  it('carrega contrato antigo sem cronograma salvo', async () => {
    await expect(consultar()).resolves.toMatchObject({ pagamentos: [] })
  })
  it('preserva o valor de parcelas e completa textos legados ausentes', async () => {
    banco.pagamentos = [{ valor: 100, sinal: 'Entrada' }]
    await expect(consultar()).resolves.toMatchObject({ pagamentos: [{ valor: 100, sinal: 'Entrada', data: '', forma: '', plataforma: '' }] })
  })
  it('reporta valor inválido em vez de calcular um total incorreto', async () => {
    banco.pagamentos = [{ valor: 'inválido' }]
    await expect(consultar()).rejects.toThrow('valor inválido')
  })
  it('não envia ao banco uma extração com valor de tipo incorreto', async () => {
    const qc = new QueryClient()
    let executar!: () => Promise<unknown>
    function Probe() {
      const mutation = useApplyExtraction()
      executar = () => mutation.mutateAsync({ extractionId: 'extraction-a', contratoId: 'contrato-a', dados: { valor_total: '100' } })
      return null
    }
    try {
      renderToStaticMarkup(<QueryClientProvider client={qc}><Probe /></QueryClientProvider>)
      await expect(executar()).rejects.toThrow('valor numérico inválido')
      expect(banco.update).not.toHaveBeenCalled()
    } finally { qc.clear() }
  })
})
