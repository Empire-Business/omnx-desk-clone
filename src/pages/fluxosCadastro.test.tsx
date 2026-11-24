import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClienteForm } from '@/components/clientes/ClienteForm'
import { ClientesListPage } from './clientes/ClientesListPage'
import { ContratoDetailPage } from './contratos/ContratoDetailPage'
import { DashboardOverview } from '@/components/dashboard/DashboardOverview'

const estado = vi.hoisted(() => ({ erro: true, id: 'contrato-inexistente', erroSalvar: false }))
const consulta = () => ({ data: undefined, isLoading: false, isError: estado.erro, isFetching: false, refetch: vi.fn() })
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useParams: () => ({ id: estado.id }) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/usePermissoes', () => ({ usePermissoes: () => ({ can: () => true }) }))
vi.mock('@/hooks/useClientes', () => ({
  useClientes: () => consulta(), useAllContracts: () => ({ data: [] }), useCatalogProducts: () => ({ data: [] }),
  useCreateCliente: () => ({ error: null }), useUpdateCliente: () => ({ error: null }),
}))
vi.mock('@/hooks/useUsers', () => ({ useAssignments: () => ({ data: [] }) }))
vi.mock('@/hooks/useInstagramStats', () => ({ useClientAvatars: () => ({ data: new Map() }) }))
vi.mock('@/hooks/useComissoes', () => ({
  useContrato: () => consulta(), useConsultores: () => ({ data: [] }),
  useProdutosComissao: () => ({ data: [] }), useProdutosList: () => ({ data: [{ id: 'p1', nome: 'Produto A' }] }),
  useCreateContrato: () => ({ isError: estado.erroSalvar }), useUpdateContrato: () => ({ isError: false }), useDeleteContrato: () => ({}),
}))
vi.mock('@/hooks/useDashboardMetrics', () => ({ useDashboardData: () => consulta() }))
vi.mock('@/hooks/useCamiDeliveries', () => ({ useCamiDeliveries: () => ({ data: null }) }))
vi.mock('@/components/contratos/ContratoClienteVinculo', () => ({ ContratoClienteVinculo: () => null }))
vi.mock('@/components/tags/ContratoTagsEditor', () => ({ ContratoTagsEditor: () => null }))
vi.mock('@/components/ui/Modal', () => ({ Modal: () => null }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

afterEach(() => { estado.erro = true; estado.id = 'contrato-inexistente'; estado.erroSalvar = false })

describe('estados recuperáveis dos cadastros', () => {
  it('não oferece produtos sem executor de vínculo', () => {
    expect(renderToStaticMarkup(<ClienteForm onClose={() => {}} />)).not.toContain('Produtos comprados')
    expect(renderToStaticMarkup(<ClienteForm onClose={() => {}} onCreated={() => {}} />)).toContain('Produto A')
  })

  it('distingue erro de clientes de uma carteira realmente vazia', () => {
    const erro = renderToStaticMarkup(<ClientesListPage />)
    expect(erro).toContain('role="alert"')
    expect(erro).toContain('Tentar novamente')
    expect(erro).not.toContain('Nenhum cliente cadastrado')
    estado.erro = false
    expect(renderToStaticMarkup(<ClientesListPage />)).toContain('Nenhum cliente cadastrado')
  })

  it('contrato indisponível permite tentar novamente e voltar à lista', () => {
    const html = renderToStaticMarkup(<ContratoDetailPage />)
    expect(html).toContain('Não foi possível abrir este contrato')
    expect(html).toContain('Tentar novamente')
    expect(html).toContain('Voltar para contratos')
    expect(html).not.toContain('shimmer')
  })

  it('falha na criação mantém formulário e ação de salvar disponíveis', () => {
    estado.id = 'novo'
    estado.erroSalvar = true
    const html = renderToStaticMarkup(<ContratoDetailPage />)
    expect(html).toContain('Suas alterações continuam no formulário')
    expect(html).toContain('Criar contrato')
    expect(html).toContain('Nome do cliente')
  })

  it('falha nos indicadores não vira carregamento infinito', () => {
    const html = renderToStaticMarkup(<DashboardOverview />)
    expect(html).toContain('Não foi possível carregar os indicadores')
    expect(html).toContain('Tentar novamente')
    expect(html).not.toContain('shimmer')
  })
})
