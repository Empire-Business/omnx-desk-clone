import { useState, useMemo, useRef } from 'react'
import {
  Users, Search, Tag, Plus, Edit, MessageSquare, Phone, X,
  Upload, Download, Trash2, CheckSquare, Square, MinusSquare, Building,
} from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'
import { useMyInstanceIds } from '@/hooks/useUsers'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { TabelaResponsiva } from '@/components/ui/TabelaResponsiva'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import {
  useContacts,
  useUpdateContact,
  useCreateContact,
  useInstances,
  useBulkDeleteContacts,
  useBulkUpdateContactTags,
  useBulkUpdateContactClient,
} from '@/hooks/useChat'
import type { ChatContact } from '@/hooks/useChat'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useClientes } from '@/hooks/useClientes'

type ContactWithExtras = ChatContact & {
  tags?: string[]
  notas?: string
  criado_em?: string
  clients?: { id: string; nome: string } | null
}

/** Campo no padrão do DS (borda fina, foco azul com halo), sem altura fixa para servir a textarea. */
const INPUT_CLASS = cn(
  'w-full rounded-md border border-input bg-card px-3 py-2 text-base sm:text-sm text-foreground max-sm:min-h-11',
  'placeholder:text-fg-placeholder transition-[border-color,box-shadow] duration-fast hover:border-stroke-strong',
  'focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_var(--primary-glow)]',
)

// ─── Create / Edit Contact Form ──────────────────────────────────────────────

interface ContactFormData {
  nome: string
  numero_whatsapp: string
  instance_id: string
  notas: string
  tags: string[]
}

const EMPTY_FORM: ContactFormData = {
  nome: '',
  numero_whatsapp: '',
  instance_id: '',
  notas: '',
  tags: [],
}

interface ContactFormProps {
  initial?: ContactFormData
  onSubmit: (data: ContactFormData) => void
  loading: boolean
  submitLabel: string
  showInstanceField?: boolean
}

function ContactForm({
  initial = EMPTY_FORM,
  onSubmit,
  loading,
  submitLabel,
  showInstanceField = true,
}: ContactFormProps) {
  const [form, setForm] = useState<ContactFormData>(initial)
  const [tagInput, setTagInput] = useState('')
  const { data: myInstanceIds } = useMyInstanceIds()
  const { data: instances = [] } = useInstances(myInstanceIds)

  function set<K extends keyof ContactFormData>(field: K, value: ContactFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function addTag() {
    const tag = tagInput.trim()
    if (tag && !form.tags.includes(tag)) {
      set('tags', [...form.tags, tag])
    }
    setTagInput('')
  }

  function removeTag(tag: string) {
    set('tags', form.tags.filter((t) => t !== tag))
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Nome</label>
        <input
          value={form.nome}
          onChange={(e) => set('nome', e.target.value)}
          placeholder="Nome do contato"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Número WhatsApp
        </label>
        <input
          required
          value={form.numero_whatsapp}
          onChange={(e) => set('numero_whatsapp', e.target.value)}
          placeholder="Ex: 5511999998888"
          className={INPUT_CLASS}
        />
      </div>

      {showInstanceField && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Número de WhatsApp</label>
          <select
            required
            value={form.instance_id}
            onChange={(e) => set('instance_id', e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Selecione um número</option>
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Notas</label>
        <textarea
          value={form.notas}
          onChange={(e) => set('notas', e.target.value)}
          placeholder="Notas internas sobre o contato..."
          rows={3}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Etiquetas</label>
        <div className="flex gap-2">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="Digitar tag e pressionar Enter"
            className={INPUT_CLASS}
          />
          <button
            type="button"
            onClick={addTag}
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium gradient-primary text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {form.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {form.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                <Tag className="h-3 w-3" />
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </form>
  )
}

// ─── Detail Modal ────────────────────────────────────────────────────────────

interface DetailModalProps {
  contact: ContactWithExtras
  onClose: () => void
  onSaved: () => void
}

function ContactDetailModal({ contact, onClose, onSaved }: DetailModalProps) {
  const updateMutation = useUpdateContact()
  const navigate = useNavigate()

  const [nome, setNome] = useState(contact.nome ?? '')
  const [notas, setNotas] = useState(contact.notas ?? '')
  const [tags, setTags] = useState<string[]>(contact.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [editing, setEditing] = useState(false)

  function addTag() {
    const tag = tagInput.trim()
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
    }
    setTagInput('')
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag))
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  function handleSave() {
    updateMutation.mutate(
      { id: contact.id, nome: nome || null, notas: notas || null, tags },
      {
        onSuccess: () => {
          setEditing(false)
          onSaved()
        },
      },
    )
  }

  return (
    <div className="space-y-5">
      {/* Avatar + basic info */}
      <div className="flex items-center gap-4">
        {contact.foto_url ? (
          <img
            src={contact.foto_url}
            alt={contact.nome ?? 'Contato'}
            className="h-14 w-14 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do contato"
              className={INPUT_CLASS}
            />
          ) : (
            <p className="text-lg font-semibold text-foreground truncate">
              {contact.nome || 'Sem nome'}
            </p>
          )}
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            {formatPhone(contact.numero_whatsapp)}
          </p>
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Edit className="h-4 w-4" />
        </button>
      </div>

      {/* Tags */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Etiquetas</label>
        {editing ? (
          <>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Digitar tag e pressionar Enter"
                className={INPUT_CLASS}
              />
              <button
                type="button"
                onClick={addTag}
                className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium gradient-primary text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                  >
                    <Tag className="h-3 w-3" />
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </>
        ) : tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                <Tag className="h-3 w-3" />
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma tag</p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Notas</label>
        {editing ? (
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas internas sobre o contato..."
            rows={3}
            className={INPUT_CLASS}
          />
        ) : (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {contact.notas || 'Sem notas'}
          </p>
        )}
      </div>

      {/* Created at */}
      {contact.criado_em && (
        <p className="text-xs text-muted-foreground">
          Criado em {new Date(contact.criado_em).toLocaleDateString('pt-BR')}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        {editing ? (
          <>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground disabled:opacity-50 transition-opacity"
            >
              {updateMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setNome(contact.nome ?? '')
                setNotas(contact.notas ?? '')
                setTags(contact.tags ?? [])
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              onClose()
              navigate(`/conversas?cliente=${encodeURIComponent(contact.nome || contact.numero_whatsapp)}`)
            }}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground transition-opacity hover:opacity-90"
          >
            <MessageSquare className="h-4 w-4" />
            Ver conversas
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Import CSV Modal ─────────────────────────────────────────────────────────

interface ImportModalProps {
  open: boolean
  onClose: () => void
}

function ImportCsvModal({ open, onClose }: ImportModalProps) {
  const createMutation = useCreateContact()
  const { data: myInstanceIds } = useMyInstanceIds()
  const { data: instances = [] } = useInstances(myInstanceIds)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [instanceId, setInstanceId] = useState('')
  const [preview, setPreview] = useState<{ nome: string; numero: string }[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null)

  function parseCSV(text: string) {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []

    const header = lines[0].toLowerCase().split(/[,;]/).map(h => h.trim())
    const nomeIdx = header.findIndex(h => h === 'nome' || h === 'name')
    const numIdx = header.findIndex(h =>
      h === 'numero' || h === 'numero_whatsapp' || h === 'whatsapp' ||
      h === 'telefone' || h === 'phone' || h === 'number',
    )

    if (numIdx === -1) return []

    return lines.slice(1)
      .map(line => {
        const cols = line.split(/[,;]/).map(c => c.trim().replace(/^["']|["']$/g, ''))
        return {
          nome: nomeIdx >= 0 ? cols[nomeIdx] ?? '' : '',
          numero: cols[numIdx] ?? '',
        }
      })
      .filter(r => r.numero.length >= 8)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseCSV(text)
      setPreview(parsed)
      setResult(null)
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleImport() {
    if (!instanceId || preview.length === 0) return
    setImporting(true)
    let success = 0
    let errors = 0

    for (const row of preview) {
      try {
        await createMutation.mutateAsync({
          instance_id: instanceId,
          numero_whatsapp: row.numero,
          nome: row.nome || null,
        })
        success++
      } catch {
        errors++
      }
    }

    setResult({ success, errors })
    setImporting(false)
    setPreview([])
  }

  function handleClose() {
    setPreview([])
    setResult(null)
    setInstanceId('')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Importar contatos via CSV" size="lg">
      <div className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">
            O arquivo CSV deve ter uma coluna de número (numero, whatsapp, telefone ou phone).
            A coluna de nome é opcional. Separador: vírgula ou ponto-e-vírgula.
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            Exemplo: nome,numero_whatsapp<br />
            João Silva,5511999998888
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Número de WhatsApp</label>
          <select
            required
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Selecione um número</option>
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>{inst.nome}</option>
            ))}
          </select>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 w-full text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Upload className="h-4 w-4" />
            {preview.length > 0 ? `${preview.length} contatos carregados` : 'Selecionar arquivo CSV'}
          </button>
        </div>

        {preview.length > 0 && (
          <div className="max-h-[min(12rem,35dvh)] overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nome</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Número</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5 text-foreground">{r.nome || '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.numero}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 50 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                ... e mais {preview.length - 50} contatos
              </p>
            )}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-border p-3 space-y-1">
            <p className="text-sm font-medium text-foreground">Importação concluída</p>
            <p className="text-xs text-success">{result.success} contatos importados com sucesso</p>
            {result.errors > 0 && (
              <p className="text-xs text-danger">{result.errors} erros (duplicados ou inválidos)</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={handleClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            {result ? 'Fechar' : 'Cancelar'}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={importing || !instanceId || preview.length === 0}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground disabled:opacity-50 transition-opacity"
            >
              <Upload className="h-4 w-4" />
              {importing ? `Importando... (${preview.length})` : `Importar ${preview.length} contatos`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Bulk Actions Bar ─────────────────────────────────────────────────────────

interface BulkActionsBarProps {
  selectedCount: number
  onClearSelection: () => void
  onBulkDelete: () => void
  onBulkAddTag: (tag: string) => void
  onBulkRemoveTag: (tag: string) => void
  onBulkLinkClient: (clientId: string | null) => void
  allTags: string[]
  clientsList: { id: string; nome: string }[]
  deleting: boolean
  linking: boolean
}

function BulkActionsBar({
  selectedCount,
  onClearSelection,
  onBulkDelete,
  onBulkAddTag,
  onBulkRemoveTag,
  onBulkLinkClient,
  allTags,
  clientsList,
  deleting,
  linking,
}: BulkActionsBarProps) {
  const [tagAction, setTagAction] = useState<'add' | 'remove' | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [showClientLink, setShowClientLink] = useState(false)

  function handleTagSubmit() {
    const tag = tagInput.trim()
    if (!tag) return
    if (tagAction === 'add') onBulkAddTag(tag)
    else if (tagAction === 'remove') onBulkRemoveTag(tag)
    setTagInput('')
    setTagAction(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary-light px-3 py-2 shadow-[inset_0_0_0_1px_var(--primary-muted)] animate-band-in" role="region" aria-label="Ações para os contatos selecionados">
      <span className="text-sm font-semibold text-link" aria-live="polite">
        {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
      </span>

      <div className="hidden h-4 w-px bg-stroke-default sm:block" aria-hidden />

      {tagAction ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <select
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            aria-label="Etiqueta existente"
            className="select !h-8 !w-auto max-w-full !text-[12.5px] max-sm:!h-10 max-sm:!text-base"
          >
            <option value="">Escolha ou digite…</option>
            {allTags.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTagSubmit()}
            placeholder="Nova etiqueta…"
            aria-label="Nova etiqueta"
            className="input !h-8 !w-36 !text-[12.5px] max-sm:!h-10 max-sm:!text-base"
          />
          <button
            type="button"
            onClick={handleTagSubmit}
            disabled={!tagInput.trim()}
            className="btn btn-primary btn-sm"
          >
            {tagAction === 'add' ? 'Adicionar' : 'Remover'}
          </button>
          <button
            type="button"
            onClick={() => setTagAction(null)}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Cancelar"
          >
            <X aria-hidden />
          </button>
        </div>
      ) : showClientLink ? (
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <select
            defaultValue=""
            onChange={(e) => {
              onBulkLinkClient(e.target.value || null)
              setShowClientLink(false)
            }}
            disabled={linking}
            aria-label="Cliente para vincular"
            className="select !h-8 min-w-0 flex-1 !text-[12.5px] sm:!w-56 max-sm:!h-10 max-sm:!text-base"
          >
            <option value="">Sem cliente (desvincular)</option>
            {clientsList.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowClientLink(false)}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Cancelar"
          >
            <X aria-hidden />
          </button>
        </div>
      ) : (
        <>
          <button type="button" onClick={() => setShowClientLink(true)} className="btn btn-ghost btn-sm">
            <Building aria-hidden />
            Vincular cliente
          </button>
          <button type="button" onClick={() => setTagAction('add')} className="btn btn-ghost btn-sm">
            <Tag aria-hidden />
            Adicionar etiqueta
          </button>
          <button type="button" onClick={() => setTagAction('remove')} className="btn btn-ghost btn-sm">
            <Tag aria-hidden />
            Remover etiqueta
          </button>
          <button
            type="button"
            onClick={onBulkDelete}
            disabled={deleting}
            className="btn btn-ghost btn-sm !text-danger hover:!bg-danger-light"
          >
            <Trash2 aria-hidden />
            {deleting ? 'Excluindo…' : 'Excluir'}
          </button>
        </>
      )}

      <div className="flex-1" />

      <button
        type="button"
        onClick={onClearSelection}
        className="btn btn-ghost btn-sm"
      >
        Limpar seleção
      </button>
    </div>
  )
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportContactsCSV(contacts: ContactWithExtras[]) {
  const header = 'nome,numero_whatsapp,cliente,tags,notas,criado_em'
  const rows = contacts.map(c => {
    const nome = (c.nome ?? '').replace(/"/g, '""')
    const cliente = (c.clients?.nome ?? '').replace(/"/g, '""')
    const notas = (c.notas ?? '').replace(/"/g, '""').replace(/\n/g, ' ')
    const tags = (c.tags ?? []).join('; ')
    const data = c.criado_em ? new Date(c.criado_em).toLocaleDateString('pt-BR') : ''
    return `"${nome}","${c.numero_whatsapp}","${cliente}","${tags}","${notas}","${data}"`
  })
  const csv = [header, ...rows].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `contatos_omnxchat_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ChatContatosPage() {
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [clientFilter, setClientFilter] = useState<'todos' | 'sem_cliente'>('todos')
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [detailTarget, setDetailTarget] = useState<ContactWithExtras | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { user } = useAuth()
  const canManageContacts = user?.perfil === 'admin' || user?.perfil === 'gerente' || user?.perfil === 'estrategista'

  // RLS handles filtering for estrategista — no client_ids needed
  const { data: contacts = [], isLoading } = useContacts({
    search: search || undefined,
    tag: tagFilter || undefined,
  })
  const createMutation = useCreateContact()
  const updateMutation = useUpdateContact()
  const bulkDeleteMutation = useBulkDeleteContacts()
  const bulkTagMutation = useBulkUpdateContactTags()

  // Clients list for inline linking (admin/gerente only)
  const { data: clientsList = [] } = useClientes()

  // Collect all unique tags across contacts for the filter dropdown
  const allTags = useMemo(() => {
    const set = new Set<string>()
    contacts.forEach((c) => {
      c.tags?.forEach((t) => set.add(t))
    })
    return Array.from(set).sort()
  }, [contacts])

  // Client-side filter for "sem cliente"
  const filteredContacts = useMemo(() => {
    if (clientFilter === 'sem_cliente') {
      return contacts.filter(c => !c.clients && !c.numero_whatsapp.startsWith('120363'))
    }
    return contacts
  }, [contacts, clientFilter])

  function handleCreate(form: ContactFormData) {
    createMutation.mutate(
      {
        instance_id: form.instance_id,
        numero_whatsapp: form.numero_whatsapp,
        nome: form.nome || null,
        notas: form.notas || null,
        tags: form.tags.length > 0 ? form.tags : undefined,
      },
      { onSuccess: () => setCreateOpen(false) },
    )
  }

  // ── Selection helpers ──
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)))
    }
  }

  const selectionState: 'none' | 'some' | 'all' =
    selectedIds.size === 0 ? 'none' :
    selectedIds.size === filteredContacts.length ? 'all' : 'some'

  function handleBulkDelete() {
    if (!confirm(`Excluir ${selectedIds.size} contato(s)? Esta ação não pode ser desfeita.`)) return
    bulkDeleteMutation.mutate([...selectedIds], {
      onSuccess: () => setSelectedIds(new Set()),
    })
  }

  function handleBulkAddTag(tag: string) {
    bulkTagMutation.mutate(
      { ids: [...selectedIds], tags: [tag], action: 'add' },
      { onSuccess: () => setSelectedIds(new Set()) },
    )
  }

  function handleBulkRemoveTag(tag: string) {
    bulkTagMutation.mutate(
      { ids: [...selectedIds], tags: [tag], action: 'remove' },
      { onSuccess: () => setSelectedIds(new Set()) },
    )
  }

  const bulkLinkClientMutation = useBulkUpdateContactClient()

  function handleBulkLinkClient(clientId: string | null) {
    bulkLinkClientMutation.mutate(
      { ids: [...selectedIds], client_id: clientId },
      { onSuccess: () => setSelectedIds(new Set()) },
    )
  }

  return (
    <PageContainer respiro largura="larga">
      <PageHeader
        title="Contatos"
        count={filteredContacts.length}
        description={clientFilter === 'sem_cliente' ? 'Contatos do WhatsApp sem cliente vinculado.' : 'Todas as pessoas e grupos que falaram com a empresa pelo WhatsApp.'}
        action={
          <>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="btn btn-primary"
            >
              <Plus aria-hidden />
              Novo contato
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="btn btn-secondary"
              title="Importar contatos de uma planilha (CSV)"
            >
              <Upload aria-hidden />
              Importar
            </button>
            <button
              type="button"
              onClick={() => exportContactsCSV(filteredContacts)}
              disabled={filteredContacts.length === 0}
              className="btn btn-secondary"
              title="Baixar os contatos numa planilha (CSV)"
            >
              <Download aria-hidden />
              Exportar
            </button>
          </>
        }
      />

      <div className="grid gap-4">
      {/* Filters */}
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou número…"
            aria-label="Buscar contatos"
            className="input !pl-9"
          />
        </div>
        <div className="min-w-0 sm:w-52">
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            aria-label="Filtrar por etiqueta"
            className="select"
          >
            <option value="">Todas as etiquetas</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
        {canManageContacts && (
          <div className="min-w-0 sm:w-52">
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value as 'todos' | 'sem_cliente')}
              aria-label="Filtrar por cliente vinculado"
              className="select"
            >
              <option value="todos">Todos os contatos</option>
              <option value="sem_cliente">Sem cliente vinculado</option>
            </select>
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          onClearSelection={() => setSelectedIds(new Set())}
          onBulkDelete={handleBulkDelete}
          onBulkAddTag={handleBulkAddTag}
          onBulkRemoveTag={handleBulkRemoveTag}
          onBulkLinkClient={handleBulkLinkClient}
          allTags={allTags}
          clientsList={clientsList}
          deleting={bulkDeleteMutation.isPending}
          linking={bulkLinkClientMutation.isPending}
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-2" aria-busy="true" aria-label="Carregando contatos">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg bg-card ring-hairline px-4 py-3">
              <div className="sk h-8 w-8 rounded-full" />
              <div className="sk h-3.5 w-40 max-w-[40%]" />
              <div className="sk ml-auto h-3 w-28 max-w-[30%]" />
            </div>
          ))}
        </div>
      ) : filteredContacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum contato encontrado"
          description={
            search || tagFilter || clientFilter !== 'todos'
              ? 'Tente alterar os filtros de busca.'
              : 'Adicione contatos manualmente, importe via CSV ou eles serão criados automaticamente ao receber mensagens.'
          }
          action={
            !search && !tagFilter ? (
              <button type="button" onClick={() => setCreateOpen(true)} className="btn btn-primary">
                <Plus aria-hidden />
                Novo contato
              </button>
            ) : undefined
          }
          secondaryAction={
            !search && !tagFilter ? (
              <button type="button" onClick={() => setImportOpen(true)} className="btn btn-secondary">
                <Upload aria-hidden />
                Importar planilha
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-2">
          {/* Selecionar todos (fica fora da tabela para funcionar também nos cartões do celular) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              aria-pressed={selectionState === 'all'}
              className="btn btn-ghost btn-sm"
            >
              {selectionState === 'all' ? (
                <CheckSquare className="text-link" aria-hidden />
              ) : selectionState === 'some' ? (
                <MinusSquare className="text-link" aria-hidden />
              ) : (
                <Square aria-hidden />
              )}
              {selectionState === 'all' ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
          </div>
          <TabelaResponsiva
            rotulo="Contatos do WhatsApp"
            linhas={filteredContacts}
            chave={(c) => c.id}
            linhaAtiva={(c) => selectedIds.has(c.id)}
            colunas={[
              {
                id: 'nome',
                titulo: 'Nome',
                principal: true,
                celula: (contact) => (
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(contact.id) }}
                      aria-pressed={selectedIds.has(contact.id)}
                      aria-label={selectedIds.has(contact.id) ? `Desmarcar ${contact.nome || 'contato'}` : `Marcar ${contact.nome || 'contato'}`}
                      className="btn btn-ghost btn-icon btn-sm shrink-0"
                    >
                      {selectedIds.has(contact.id)
                        ? <CheckSquare className="text-link" aria-hidden />
                        : <Square aria-hidden />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTarget(contact)}
                      className="flex min-w-0 items-center gap-2.5 rounded-md text-left focus-ds"
                    >
                      {contact.foto_url ? (
                        <img src={contact.foto_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="av none !h-8 !w-8 shrink-0" aria-hidden><Users className="h-4 w-4" /></span>
                      )}
                      <span className="truncate font-[650] text-foreground hover:underline underline-offset-2">
                        {contact.nome || 'Sem nome'}
                      </span>
                    </button>
                  </div>
                ),
              },
              {
                id: 'numero',
                titulo: 'Número',
                celula: (contact) => <span className="mono text-[12.5px] text-fg-2">{formatPhone(contact.numero_whatsapp)}</span>,
              },
              {
                id: 'cliente',
                titulo: 'Cliente',
                celula: (contact) => contact.clients ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground">
                    <Building className="h-3.5 w-3.5 shrink-0 text-link" aria-hidden />
                    <span className="truncate">{contact.clients.nome}</span>
                    {canManageContacts && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); updateMutation.mutate({ id: contact.id, client_id: null }) }}
                        className="btn btn-ghost btn-icon btn-sm -my-1 shrink-0 hover:!text-danger"
                        title="Desvincular cliente"
                        aria-label={`Desvincular ${contact.clients.nome}`}
                      >
                        <X aria-hidden />
                      </button>
                    )}
                  </span>
                ) : canManageContacts && !contact.numero_whatsapp.startsWith('120363') ? (
                  <select
                    defaultValue=""
                    aria-label="Vincular cliente"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      if (e.target.value) {
                        updateMutation.mutate({ id: contact.id, client_id: e.target.value })
                        e.target.value = ''
                      }
                    }}
                    className="select !h-8 !w-auto max-w-[220px] border-dashed !text-[12.5px] text-muted-foreground max-sm:!h-10 max-sm:!text-base"
                  >
                    <option value="">Vincular cliente…</option>
                    {clientsList.map((cl) => (
                      <option key={cl.id} value={cl.id}>{cl.nome}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[12.5px] text-muted-foreground">
                    {contact.numero_whatsapp.startsWith('120363') ? 'Grupo' : '—'}
                  </span>
                ),
              },
              {
                id: 'tags',
                titulo: 'Etiquetas',
                celula: (contact) => contact.tags && contact.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {contact.tags.map((tag) => (
                      <span key={tag} className="tag tag-info">
                        <Tag aria-hidden />
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[12.5px] text-muted-foreground">—</span>
                ),
              },
              {
                id: 'criado',
                titulo: 'Criado em',
                numerica: true,
                esconderNoCartao: true,
                celula: (contact) => (
                  <span className="text-[12.5px] text-muted-foreground">
                    {contact.criado_em ? new Date(contact.criado_em).toLocaleDateString('pt-BR') : '—'}
                  </span>
                ),
              },
            ]}
          />
        </div>
      )}
      </div>

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Novo contato" size="md">
        <ContactForm
          onSubmit={handleCreate}
          loading={createMutation.isPending}
          submitLabel="Criar contato"
        />
      </Modal>

      {/* Import CSV Modal */}
      <ImportCsvModal open={importOpen} onClose={() => setImportOpen(false)} />

      {/* Detail Modal */}
      <Modal
        open={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        title="Detalhes do contato"
        size="md"
      >
        {detailTarget && (
          <ContactDetailModal
            contact={detailTarget}
            onClose={() => setDetailTarget(null)}
            onSaved={() => setDetailTarget(null)}
          />
        )}
      </Modal>
    </PageContainer>
  )
}
