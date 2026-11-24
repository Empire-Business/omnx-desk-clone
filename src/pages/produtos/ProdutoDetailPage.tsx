import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useProduto, useCreateEntregavel, useDeleteEntregavel } from '@/hooks/useProdutos'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { DeliverableType } from '@/types/database'
import { formatoAposentado } from '@/lib/formatosAtendimento'

const TIPO_LABELS: Record<DeliverableType, string> = {
  post_feed: 'Formato retirado', stories: 'Formato retirado', reels: 'Formato retirado', video: 'Vídeo',
  copy: 'Copy', arte: 'Arte', relatorio: 'Relatório', outro: 'Outro'
}

// Rótulos completos continuam disponíveis para os entregáveis já cadastrados.
const TIPOS_NOVOS = (Object.entries(TIPO_LABELS) as [DeliverableType, string][])
  .filter(([tipo]) => !formatoAposentado(tipo))

export function ProdutoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: product, isLoading } = useProduto(id ?? '')
  const createEntregavel = useCreateEntregavel()
  const deleteEntregavel = useDeleteEntregavel()

  const [entregavelModal, setEntregavelModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [form, setForm] = useState({ nome: '', tipo: 'outro' as DeliverableType, descricao: '', quantidade: 1 })

  if (isLoading) {
    return (
      <PageContainer>
        <div className="sk h-64" aria-busy="true" aria-label="Carregando produto" />
      </PageContainer>
    )
  }
  if (!product) {
    return (
      <PageContainer>
        <p className="t-body text-muted-foreground">Produto não encontrado.</p>
      </PageContainer>
    )
  }

  async function handleCreateEntregavel() {
    if (!form.nome || !id) return
    await createEntregavel.mutateAsync({ product_id: id, nome: form.nome, tipo: form.tipo, descricao: form.descricao || undefined, quantidade: form.quantidade })
    setEntregavelModal(false)
    setForm({ nome: '', tipo: 'outro', descricao: '', quantidade: 1 })
  }

  return (
    <PageContainer>
      <PageHeader
        title={product.nome}
        breadcrumb={[
          { label: 'Clientes', href: '/clientes' },
          { label: product.clients?.nome ?? 'Sem cliente vinculado', href: `/clientes/${product.client_id}` },
          { label: product.nome },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-3">
        <section className="rounded-lg border border-card-border bg-card p-5">
          <h2 className="mb-2 text-sm font-bold text-foreground">Detalhes</h2>
          {product.descricao && <p className="text-sm text-muted-foreground">{product.descricao}</p>}
          <p className="t-caption mt-3">Cliente: <span className="text-foreground">{product.clients?.nome ?? 'Sem cliente vinculado'}</span></p>
        </section>

        <section className="grid min-w-0 gap-3 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-foreground">Entregáveis ({product.deliverables.length})</h2>
            <button type="button" onClick={() => setEntregavelModal(true)} className="btn btn-secondary">
              <Plus aria-hidden /> Novo entregável
            </button>
          </div>

          {product.deliverables.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-card-border bg-card py-10">
              <p className="text-sm text-muted-foreground">Nenhum entregável cadastrado.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-card-border bg-card">
              {product.deliverables.map(d => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{d.nome}</p>
                    <p className="text-xs text-muted-foreground">{TIPO_LABELS[d.tipo]} · {d.quantidade}x</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(d.id)}
                    className="btn btn-ghost btn-icon shrink-0 text-muted-foreground hover:text-danger"
                    aria-label={`Excluir entregável ${d.nome}`}
                    title="Excluir"
                  >
                    <Trash2 aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal
        open={entregavelModal}
        onClose={() => setEntregavelModal(false)}
        title="Novo entregável"
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setEntregavelModal(false)} className="btn btn-secondary">Cancelar</button>
            <button type="button" onClick={handleCreateEntregavel} disabled={!form.nome || createEntregavel.isPending} className="btn btn-primary">
              {createEntregavel.isPending ? 'Criando...' : 'Criar'}
            </button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="field">
            <label htmlFor="entregavel-nome">Nome *</label>
            <input id="entregavel-nome" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} className="input" placeholder="Ex.: Relatório de acompanhamento" />
          </div>
          <div className="field">
            <label htmlFor="entregavel-tipo">Tipo</label>
            <select id="entregavel-tipo" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as DeliverableType }))} className="select">
              {TIPOS_NOVOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="entregavel-quantidade">Quantidade</label>
            <input id="entregavel-quantidade" type="number" min={1} value={form.quantidade} onChange={e => setForm(p => ({ ...p, quantidade: Number(e.target.value) }))} className="input" />
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
    </PageContainer>
  )
}
