import { useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import {
  useKanbanColunas,
  useCreateColuna,
  useUpdateColuna,
  useDeleteColuna,
  useReorderColunas,
  CORES_COLUNA,
  type KanbanColuna,
} from '@/hooks/useKanbanColunas'
import { cn } from '@/lib/utils'

const inp = 'rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'

export function GerenciarColunasModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: colunas } = useKanbanColunas()
  const createMut = useCreateColuna()
  const updateMut = useUpdateColuna()
  const deleteMut = useDeleteColuna()
  const reorderMut = useReorderColunas()

  const [novoTitulo, setNovoTitulo] = useState('')
  const [novaChave, setNovaChave] = useState('')
  const [novaCor, setNovaCor] = useState<string>(CORES_COLUNA[0].valor)

  const lista = colunas ?? []

  async function adicionar() {
    const titulo = novoTitulo.trim()
    const chave = novaChave.trim().toUpperCase()
    if (!titulo || !chave) return
    const ordem = Math.max(0, ...lista.map((c) => c.ordem)) + 1
    await createMut.mutateAsync({ titulo, status_chave: chave, cor: novaCor, ordem })
    setNovoTitulo(''); setNovaChave(''); setNovaCor(CORES_COLUNA[0].valor)
  }

  async function mover(idx: number, dir: -1 | 1) {
    const destino = idx + dir
    if (destino < 0 || destino >= lista.length) return
    const a = lista[idx]
    const b = lista[destino]
    // troca as ordens das duas colunas adjacentes
    await reorderMut.mutateAsync([
      { id: a.id, ordem: b.ordem },
      { id: b.id, ordem: a.ordem },
    ])
  }

  async function excluir(c: KanbanColuna) {
    if (!confirm(`Excluir a coluna "${c.titulo}"? Os contratos com status "${c.status_chave}" deixam de aparecer no kanban (mas não são apagados).`)) return
    await deleteMut.mutateAsync(c.id)
  }

  return (
    <Modal open={open} onClose={onClose} title="Gerenciar colunas do kanban" description="Adicione, edite, reordene ou remova as colunas. Cada coluna corresponde a um status de contrato." size="lg">
      <div className="space-y-4">
        {/* Lista de colunas existentes */}
        <div className="space-y-2">
          {lista.map((c, idx) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border bg-background/60 p-2">
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
              <span className={cn('h-3 w-3 shrink-0 rounded-full', c.cor)} />
              <input
                defaultValue={c.titulo}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.titulo) updateMut.mutate({ id: c.id, titulo: v }) }}
                className={cn(inp, 'w-36')}
                title="Título exibido"
              />
              <input
                defaultValue={c.status_chave}
                onBlur={(e) => { const v = e.target.value.trim().toUpperCase(); if (v && v !== c.status_chave) updateMut.mutate({ id: c.id, status_chave: v }) }}
                className={cn(inp, 'flex-1 font-mono text-xs')}
                title="Status gravado no contrato (status_secundario)"
              />
              <select
                value={c.cor}
                onChange={(e) => updateMut.mutate({ id: c.id, cor: e.target.value })}
                className={cn(inp, 'w-28')}
                title="Cor"
              >
                {CORES_COLUNA.map((cor) => <option key={cor.valor} value={cor.valor}>{cor.label}</option>)}
              </select>
              <div className="flex shrink-0 items-center">
                <button onClick={() => mover(idx, -1)} disabled={idx === 0} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" title="Subir">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button onClick={() => mover(idx, 1)} disabled={idx === lista.length - 1} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" title="Descer">
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button onClick={() => excluir(c)} className="rounded p-1 text-muted-foreground/60 hover:bg-danger/10 hover:text-danger" title="Excluir">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {lista.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma coluna. Adicione a primeira abaixo.</p>
          )}
        </div>

        {/* Nova coluna */}
        <div className="rounded-lg border border-dashed border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Nova coluna</p>
          <div className="flex flex-wrap items-center gap-2">
            <input value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="Título (ex: Onboarding)" className={cn(inp, 'w-40')} />
            <input value={novaChave} onChange={(e) => setNovaChave(e.target.value)} placeholder="STATUS (ex: NÃO INICIADO)" className={cn(inp, 'flex-1 font-mono text-xs')} />
            <select value={novaCor} onChange={(e) => setNovaCor(e.target.value)} className={cn(inp, 'w-28')}>
              {CORES_COLUNA.map((cor) => <option key={cor.valor} value={cor.valor}>{cor.label}</option>)}
            </select>
            <button
              onClick={adicionar}
              disabled={!novoTitulo.trim() || !novaChave.trim() || createMut.isPending}
              className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Adicionar
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Dica: o campo <span className="font-mono">STATUS</span> é o valor gravado em cada contrato quando um cartão é movido para a coluna. Use MAIÚSCULAS.
        </p>
      </div>
    </Modal>
  )
}
