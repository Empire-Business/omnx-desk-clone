import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Package, Search } from 'lucide-react'
import { useProdutos } from '@/hooks/useProdutos'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { TabelaResponsiva, type ColunaTabela } from '@/components/ui/TabelaResponsiva'

type ProdutoLinha = NonNullable<ReturnType<typeof useProdutos>['data']>[number]

const colunas: ColunaTabela<ProdutoLinha>[] = [
  {
    id: 'produto',
    titulo: 'Produto',
    principal: true,
    celula: (p) => (
      <div className="min-w-0">
        <Link to={`/produtos/${p.id}`} className="rounded-sm font-semibold text-foreground hover:text-link">
          {p.nome}
        </Link>
        {p.descricao && <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.descricao}</p>}
      </div>
    ),
  },
  {
    id: 'cliente',
    titulo: 'Cliente',
    rotuloCartao: 'Cliente',
    celula: (p) => <span className="text-muted-foreground">{p.clients?.nome ?? '—'}</span>,
  },
  {
    id: 'status',
    titulo: 'Status',
    rotuloCartao: 'Situação',
    celula: (p) => (
      <span className={`tag ${p.ativo ? 'text-success' : 'text-muted-foreground'}`}>
        {p.ativo ? 'Ativo' : 'Inativo'}
      </span>
    ),
  },
]

export function ProdutosPage() {
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const { data: products, isLoading } = useProdutos()

  const filtered = useMemo(() => {
    if (!products) return []
    const q = search.toLowerCase()
    return products.filter(p => p.nome.toLowerCase().includes(q) || (p.clients?.nome ?? '').toLowerCase().includes(q))
  }, [products, search])

  return (
    <PageContainer>
      <PageHeader
        title="Produtos"
        description="Todos os produtos por cliente"
        count={products ? filtered.length : undefined}
      />

      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar produtos..."
          aria-label="Buscar produtos"
          className="input pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-2" aria-busy="true" aria-label="Carregando produtos">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="sk h-14" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum produto encontrado"
          description="Adicione produtos a partir da página de clientes."
        />
      ) : (
        <TabelaResponsiva
          rotulo="Lista de produtos"
          linhas={filtered}
          chave={(p) => p.id}
          colunas={colunas}
          aoClicarLinha={(p) => navigate(`/produtos/${p.id}`)}
        />
      )}
    </PageContainer>
  )
}
