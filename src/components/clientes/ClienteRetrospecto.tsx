import { useState } from 'react'
import { StickyNote, Plus, Pencil, Trash2, Save, X, Star } from 'lucide-react'
import { useClientNotes, useCreateClientNote, useUpdateClientNote, useDeleteClientNote } from '@/hooks/useClientNotes'
import { useUpdateCliente } from '@/hooks/useClientes'
import { cn } from '@/lib/utils'

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function notaColor(nota: number | null | undefined): { bg: string; text: string; ring: string } {
  if (nota == null) return { bg: 'bg-muted', text: 'text-muted-foreground', ring: 'ring-border' }
  if (nota >= 9) return { bg: 'bg-success/15', text: 'text-success', ring: 'ring-success/40' }
  if (nota >= 7) return { bg: 'bg-primary-muted', text: 'text-link', ring: 'ring-primary/40' }
  if (nota >= 5) return { bg: 'bg-warning/15', text: 'text-warning', ring: 'ring-warning/40' }
  return { bg: 'bg-danger/15', text: 'text-danger', ring: 'ring-danger/40' }
}

export function NotaBadge({
  clientId, nota, canEdit,
}: { clientId: string; nota: number | null; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(nota?.toString() ?? '')
  const update = useUpdateCliente()
  const c = notaColor(nota)

  async function handleSave() {
    const n = value === '' ? null : Number(value)
    if (n != null && (isNaN(n) || n < 1 || n > 10)) return
    await update.mutateAsync({ id: clientId, nota: n })
    setEditing(false)
  }

  if (!canEdit && nota == null) return null

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1 rounded-full bg-card border border-border px-2 py-1">
        <Star className="h-3.5 w-3.5 text-warning" />
        <input
          type="number" min={1} max={10} step={1}
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
          className="w-12 bg-transparent text-xs font-bold text-foreground tabular-nums focus:outline-none"
          placeholder="1-10"
        />
        <button onClick={handleSave} disabled={update.isPending}
          className="rounded-full p-0.5 text-success hover:bg-success/10 disabled:opacity-50">
          <Save className="h-3 w-3" />
        </button>
        <button onClick={() => { setEditing(false); setValue(nota?.toString() ?? '') }}
          className="rounded-full p-0.5 text-muted-foreground hover:bg-muted">
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => canEdit && setEditing(true)}
      disabled={!canEdit}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-2 transition-all',
        c.bg, c.text, c.ring,
        canEdit ? 'hover:scale-105 cursor-pointer' : 'cursor-default',
      )}
      title={canEdit ? 'Clique para editar a nota' : 'Nota do cliente'}
    >
      <Star className={cn('h-3.5 w-3.5', nota != null && nota >= 7 ? 'fill-current' : '')} />
      {nota != null ? `${nota}/10` : 'Sem nota'}
    </button>
  )
}

// O status também muda sozinho quando os contratos do cliente mudam
// (trigger trg_sync_cliente_ativo_from_contratos); o clique é o ajuste manual.
export function AtivoBadge({
  clientId, ativo, canEdit,
}: { clientId: string; ativo: boolean; canEdit: boolean }) {
  const update = useUpdateCliente()

  return (
    <button
      onClick={() => canEdit && update.mutate({ id: clientId, ativo: !ativo })}
      disabled={!canEdit || update.isPending}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider transition-all disabled:opacity-100',
        ativo ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
        canEdit ? 'hover:scale-105 cursor-pointer' : 'cursor-default',
        update.isPending && 'opacity-60',
      )}
      title={canEdit ? `Clique para marcar como ${ativo ? 'inativo' : 'ativo'}` : 'Status do cliente'}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', ativo ? 'bg-success animate-pulse' : 'bg-muted-foreground/40')} />
      {ativo ? 'Ativo' : 'Inativo'}
    </button>
  )
}

interface RetrospectoProps {
  clientId: string
  canWrite: boolean
}

export function ClienteRetrospecto({ clientId, canWrite }: RetrospectoProps) {
  const { data: notes = [], isLoading } = useClientNotes(clientId)
  const create = useCreateClientNote()
  const update = useUpdateClientNote()
  const remove = useDeleteClientNote()

  const [newContent, setNewContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  async function handleCreate() {
    const text = newContent.trim()
    if (!text) return
    await create.mutateAsync({ client_id: clientId, conteudo: text })
    setNewContent('')
  }

  async function handleUpdate(id: string) {
    const text = editContent.trim()
    if (!text) return
    await update.mutateAsync({ id, conteudo: text })
    setEditingId(null)
  }

  return (
    <div className="group rounded-2xl border border-border bg-card p-4 space-y-2 transition-all hover:border-accent/30 hover:shadow-md">
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-muted text-link">
            <StickyNote className="h-3.5 w-3.5" />
          </span>
          Retrospecto
          {notes.length > 0 && (
            <span className="rounded-full bg-primary-muted px-2 py-0.5 text-[11px] font-bold text-link tabular-nums">
              {notes.length}
            </span>
          )}
        </h3>
      </div>

      {/* Form de nova anotação */}
      {canWrite && (
        <div className="space-y-2">
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="Anotar evolução, reuniões, decisões, contexto..."
            rows={3}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
          />
          <div className="flex items-center justify-between">
            <p className="text-2xs text-muted-foreground">
              {newContent.length > 0 && `${newContent.length} caracteres`}
            </p>
            <button
              onClick={handleCreate}
              disabled={!newContent.trim() || create.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Plus className="h-3 w-3" />
              {create.isPending ? 'Salvando...' : 'Adicionar anotação'}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted/40 shimmer" />)}
        </div>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">
          {canWrite ? 'Nenhuma anotação ainda — comece a escrever acima.' : 'Sem anotações neste cliente.'}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {notes.map(n => {
            const isEditing = editingId === n.id
            return (
              <li key={n.id} className="rounded-lg border border-border bg-card/60 p-3 group">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-2xs font-bold text-primary shrink-0">
                      {n.author_nome?.charAt(0).toUpperCase() ?? '?'}
                    </div>
                    <p className="text-xs font-semibold text-foreground truncate">{n.author_nome ?? 'Anônimo'}</p>
                    <span className="text-2xs text-muted-foreground shrink-0">{formatDateTime(n.created_at)}</span>
                    {n.updated_at !== n.created_at && (
                      <span className="text-2xs text-muted-foreground/60 italic shrink-0">(editado)</span>
                    )}
                  </div>
                  {canWrite && !isEditing && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => { setEditingId(n.id); setEditContent(n.conteudo) }}
                        className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => { if (confirm('Remover esta anotação?')) remove.mutate({ id: n.id, client_id: clientId }) }}
                        className="rounded-md p-1 text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                        title="Remover"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingId(null)}
                        className="rounded-md px-2.5 py-1 text-2xs font-medium text-muted-foreground hover:text-foreground">
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleUpdate(n.id)}
                        disabled={!editContent.trim() || update.isPending}
                        className="rounded-md gradient-primary px-2.5 py-1 text-2xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{n.conteudo}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
