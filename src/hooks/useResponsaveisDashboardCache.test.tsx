import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCreateAssignment, useDeleteAssignment } from './useUsers'
import { atualizarCarteiras } from '@/components/clientes/ResponsaveisCliente'

const estado = vi.hoisted(() => ({ falha: false }))
vi.mock('@/lib/responsaveisCliente', () => ({
  carregarResponsaveis: async () => ({ revisao: 'r1' }),
  decidirResponsavel: async () => {
    if (estado.falha) throw new Error('Conflito de revisão')
    return { ok: true }
  },
  podeRepetirPedidoResponsavel: () => false,
}))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({
  maybeSingle: async () => ({ data: { client_id: 'c1', tipo: 'estrategista' }, error: null }),
}) }) }) } }))

afterEach(() => { estado.falha = false })

describe('dashboard após alterar responsáveis', () => {
  it.each(['adicionar', 'encerrar', 'trocar'] as const)('%s invalida carteira e ranking', async (acao) => {
    const qc = new QueryClient()
    let executar!: () => Promise<unknown>
    function Probe() {
      const criar = useCreateAssignment()
      const encerrar = useDeleteAssignment()
      executar = () => acao === 'trocar' ? atualizarCarteiras(qc)
        : acao === 'adicionar' ? criar.mutateAsync({ client_id: 'c1', user_id: 'u1', tipo: 'estrategista' })
          : encerrar.mutateAsync('vinculo1')
      return null
    }
    try {
      qc.setQueryData(['dashboard-data'], { estrategistas: ['anterior'] })
      qc.setQueryData(['independente'], 'preservado')
      renderToStaticMarkup(<QueryClientProvider client={qc}><Probe /></QueryClientProvider>)
      await executar()
      expect(qc.getQueryState(['dashboard-data'])?.isInvalidated).toBe(true)
      expect(qc.getQueryState(['independente'])?.isInvalidated).toBe(false)
    } finally { qc.clear() }
  })

  it('não anuncia atualização de carteira quando a alteração é recusada', async () => {
    estado.falha = true
    const qc = new QueryClient()
    let executar!: () => Promise<unknown>
    function Probe() {
      const criar = useCreateAssignment()
      executar = () => criar.mutateAsync({ client_id: 'c1', user_id: 'u1', tipo: 'estrategista' })
      return null
    }
    try {
      qc.setQueryData(['dashboard-data'], { estrategistas: ['anterior'] })
      renderToStaticMarkup(<QueryClientProvider client={qc}><Probe /></QueryClientProvider>)
      await expect(executar()).rejects.toThrow('Conflito de revisão')
      expect(qc.getQueryState(['dashboard-data'])?.isInvalidated).toBe(false)
    } finally { qc.clear() }
  })
})
