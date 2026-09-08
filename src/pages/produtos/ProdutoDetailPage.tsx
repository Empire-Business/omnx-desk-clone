import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useProduto, useCreateEntregavel, useDeleteEntregavel } from '@/hooks/useProdutos'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { DeliverableType } from '@/types/database'

const TIPO_LABELS: Record<DeliverableType, string> = {
  post_feed: 'Post Feed', stories: 'Stories', reels: 'Reels', video: 'Vídeo',
  copy: 'Copy', arte: 'Arte', relatorio: 'Relatório', outro: 'Outro'
}

export function ProdutoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: product, isLoading } = useProduto(id ?? '')
  const createEntregavel = useCreateEntregavel()
  const deleteEntregavel = useDeleteEntregavel()

  const [entregavelModal, setEntregavelModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [form, setForm] = useState({ nome: '', tipo: 'outro' as DeliverableType, descricao: '', quantidade: 1 })

  if (isLoading) return <div className="glass-card h-64 shimmer" />
  if (!product) return <div className="text-muted-foreground">Produto não encontrado.</div>

  async function handleCreateEntregavel() {
    if (!form.nome || !id) return
    await createEntregavel.mutateAsync({ product_id: id, nome: form.nome, tipo: form.tipo, descricao: form.descricao || undefined, quantidade: form.quantidade })
    setEntregavelModal(false)
    setForm({ nome: '', tipo: 'outro', descricao: '', quantidade: 1 })
  }

  const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <PageHeader
        title={product.nome}
        breadcrumb={[
          { label: 'Clientes', href: '/clientes' },
          { label: product.clients.nome, href: `/clientes/${product.client_id}` },
          { label: product.nome },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:gap-6 xl:grid-cols-3">
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-foreground mb-2">Detalhes</h3>
          {product.descricao && <p className="text-sm text-muted-foreground">{product.descricao}</p>}
          <p className="text-2xs text-muted-foreground mt-3">Cliente: <span className="text-foreground">{product.clients.nome}</span></p>
        </div>

        <div className="col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Entregáveis ({product.deliverables.length})</h3>
            <button onClick={() => setEntregavelModal(true)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors">
              <Plus className="h-3.5 w-3.5" /> Novo entregável
            </button>
          </div>

          {product.deliverables.length === 0 ? (
            <div className="glass-card flex flex-col items-center justify-center py-10">
              <p className="text-sm text-muted-foreground">Nenhum entregável cadastrado.</p>
            </div>
          ) : (
            <div className="glass-card divide-y divide-border overflow-hidden">
              {product.deliverables.map(d => (
                <div key={d.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{d.nome}</p>
                    <p className="text-xs text-muted-foreground">{TIPO_LABELS[d.tipo]} · {d.quantidade}x</p>
                  </div>
                  <button onClick={() => setDeleteTarget(d.id)} className="rounded-lg p-1.5 text-muted-foreground hover:text-danger hover:bg-danger-light transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={entregavelModal} onClose={() => setEntregavelModal(false)} title="Novo entregável" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nome *</label>
            <input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} className={inputClass} placeholder="Ex: Post para Instagram" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Tipo</label>
            <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as DeliverableType }))} className={inputClass}>
              {(Object.entries(TIPO_LABELS) as [DeliverableType, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Quantidade</label>
            <input type="number" min={1} value={form.quantidade} onChange={e => setForm(p => ({ ...p, quantidade: Number(e.target.value) }))} className={inputClass} />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setEntregavelModal(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">Cancelar</button>
            <button onClick={handleCreateEntregavel} disabled={!form.nome || createEntregavel.isPending}
              className="gradient-primary rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
              {createEntregavel.isPending ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget && id) {
            deleteEntregavel.mutate({ id: deleteTarget, product_id: id }, { onSuccess: () => setDeleteTarget(null) })
          }
        }}
        title="Excluir entregável"
        description="Esta ação não pode ser desfeita. Entregas vinculadas a este entregável serão preservadas."
        confirmLabel="Excluir"
        loading={deleteEntregavel.isPending}
      />
    </div>
  )
}
