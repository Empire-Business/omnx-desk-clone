import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDashboardData } from './useDashboardMetrics'

const banco = vi.hoisted(() => ({ falha: '', admin: false, consultas: [] as string[] }))
vi.mock('@/lib/permissaoRemota', () => ({ podeNoBanco: async () => banco.admin }))
vi.mock('@/hooks/useInstagramStats', () => ({ startOfWeek: () => new Date('2026-11-02') }))
vi.mock('@/hooks/useCamiDeliveries', () => ({ isCamiIntegrationReady: () => false, ratingToScore: (n: number) => n }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  from: (tabela: string) => {
    const consulta = {
      select() { return this }, eq() { return this }, in() { return this },
      order() { return this }, limit() { return this }, gte() { return this }, single() { return this },
      then(resolve: (r: unknown) => unknown) {
        banco.consultas.push(tabela)
        return Promise.resolve(resolve({
          data: banco.falha === tabela ? null : tabela === 'users' ? { id: 'u1', nome: 'Pessoa', perfil: 'estrategista' } : [],
          error: banco.falha === tabela ? new Error(`Falha em ${tabela}`) : null,
        }))
      },
    }
    return consulta
  },
} }))

afterEach(() => { banco.falha = ''; banco.admin = false; banco.consultas = [] })

async function consultar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Probe() { useDashboardData(); return null }
  try {
    renderToStaticMarkup(<QueryClientProvider client={qc}><Probe /></QueryClientProvider>)
    return await qc.getQueryCache().find({ queryKey: ['dashboard-data'] })!.fetch()
  } finally { qc.clear() }
}

describe('dados obrigatórios do dashboard', () => {
  it.each(['users', 'client_assignments', 'clients', 'nps_responses', 'chat_weekly_reports'])('não transforma falha de %s em indicadores zerados', async (tabela) => {
    banco.falha = tabela
    banco.admin = !['users', 'client_assignments'].includes(tabela)
    await expect(consultar()).rejects.toThrow(`Falha em ${tabela}`)
  })

  it('mantém carteira realmente vazia como resultado válido', async () => {
    await expect(consultar()).resolves.toMatchObject({ kpis: { clientesAtivos: 0 }, estrategistas: [] })
    expect(banco.consultas).toEqual(['users', 'client_assignments'])
  })
})
