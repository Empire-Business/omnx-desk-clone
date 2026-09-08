import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package } from 'lucide-react'
import { useProdutos } from '@/hooks/useProdutos'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'

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
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <PageHeader title="Produtos" description="Todos os produtos por cliente" />
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produtos..."
        className="max-w-sm w-full rounded-lg border border-input bg-card px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />

      {isLoading ? (
        <div className="glass-card divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 shimmer" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Package} title="Nenhum produto encontrado" description="Adicione produtos a partir da página de clientes." />
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Produto</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Cliente</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground sm:table-cell">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(p => (
                <tr key={p.id} onClick={() => navigate(`/produtos/${p.id}`)} className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{p.nome}</p>
                    {p.descricao && <p className="text-xs text-muted-foreground truncate max-w-xs">{p.descricao}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{p.clients?.nome ?? '—'}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${p.ativo ? 'bg-success-light text-success' : 'bg-muted text-muted-foreground'}`}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
