import { useState, useMemo, useRef } from 'react'
import {
  Users, Search, Tag, Plus, Edit, MessageSquare, Phone, X,
  Upload, Download, Trash2, CheckSquare, Square, MinusSquare, Building, Link,
} from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'
import { useMyInstanceIds } from '@/hooks/useUsers'
import { PageHeader } from '@/components/ui/PageHeader'
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

const INPUT_CLASS = cn(
  'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground',
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40',
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
          <label className="mb-1.5 block text-sm font-medium text-foreground">Instância</label>
          <select
            required
            value={form.instance_id}
            onChange={(e) => set('instance_id', e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Selecione uma instância</option>
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
        <label className="mb-1.5 block text-sm font-medium text-foreground">Tags</label>
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
        <label className="mb-1.5 block text-sm font-medium text-foreground">Tags</label>
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
              navigate(`/chat?cliente=${encodeURIComponent(contact.nome || contact.numero_whatsapp)}`)
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
          <label className="mb-1.5 block text-sm font-medium text-foreground">Instância</label>
          <select
            required
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Selecione uma instância</option>
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
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
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
    <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary-muted px-4 py-2.5 animate-fade-in">
      <span className="text-sm font-medium text-primary">
        {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
      </span>

      <div className="h-4 w-px bg-border" />

      {tagAction ? (
        <div className="flex items-center gap-2">
          <select
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            className="rounded-md border border-border bg-input px-2 py-1 text-xs"
          >
            <option value="">Selecione ou digite...</option>
            {allTags.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTagSubmit()}
            placeholder="Nova tag..."
            className="rounded-md border border-border bg-input px-2 py-1 text-xs w-28"
          />
          <button
            onClick={handleTagSubmit}
            disabled={!tagInput.trim()}
            className="rounded-md px-2 py-1 text-xs font-medium gradient-primary text-primary-foreground disabled:opacity-50"
          >
            {tagAction === 'add' ? 'Adicionar' : 'Remover'}
          </button>
          <button
            onClick={() => setTagAction(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : showClientLink ? (
        <div className="flex items-center gap-2">
          <select
            defaultValue=""
            onChange={(e) => {
              onBulkLinkClient(e.target.value || null)
              setShowClientLink(false)
            }}
            disabled={linking}
            className="rounded-md border border-border bg-input px-2 py-1 text-xs"
          >
            <option value="">Sem cliente (desvincular)</option>
            {clientsList.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          <button
            onClick={() => setShowClientLink(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => setShowClientLink(true)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Building className="h-3.5 w-3.5" />
            Vincular cliente
          </button>
          <button
            onClick={() => setTagAction('add')}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Tag className="h-3.5 w-3.5" />
            Adicionar tag
          </button>
          <button
            onClick={() => setTagAction('remove')}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Tag className="h-3.5 w-3.5" />
            Remover tag
          </button>
          <button
            onClick={onBulkDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? 'Excluindo...' : 'Excluir'}
          </button>
        </>
      )}

      <div className="flex-1" />

      <button
        onClick={onClearSelection}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
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
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 p-3 sm:p-4 lg:p-6 animate-fade-in">
      <PageHeader
        title="Contatos"
        description={`${filteredContacts.length} contatos${clientFilter === 'sem_cliente' ? ' sem cliente' : ''}`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Importar CSV</span>
            </button>
            <button
              onClick={() => exportContactsCSV(filteredContacts)}
              disabled={filteredContacts.length === 0}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo contato</span>
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou número..."
            className={cn(INPUT_CLASS, 'pl-9')}
          />
        </div>
        <div className="w-full sm:w-56">
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Todas as tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
        {canManageContacts && (
          <div className="w-full sm:w-56">
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value as 'todos' | 'sem_cliente')}
              className={INPUT_CLASS}
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
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
              <div className="flex gap-2">
                <button
                  onClick={() => setImportOpen(true)}
                  className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  <Upload className="h-4 w-4" />
                  Importar CSV
                </button>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground"
                >
                  <Plus className="h-4 w-4" />
                  Novo contato
                </button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-10 px-3 py-3">
                    <button
                      onClick={toggleSelectAll}
                      className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {selectionState === 'all' ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : selectionState === 'some' ? (
                        <MinusSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nome</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Número</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-muted-foreground">Cliente</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-muted-foreground">Tags</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-muted-foreground">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredContacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className={cn(
                      'transition-colors hover:bg-muted/50',
                      selectedIds.has(contact.id) && 'bg-primary-muted/30',
                    )}
                  >
                    <td className="w-10 px-3 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleSelect(contact.id)
                        }}
                        className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {selectedIds.has(contact.id) ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td
                      className="px-4 py-3 cursor-pointer"
                      onClick={() => setDetailTarget(contact)}
                    >
                      <div className="flex items-center gap-3">
                        {contact.foto_url ? (
                          <img
                            src={contact.foto_url}
                            alt={contact.nome ?? ''}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                            <Users className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="font-medium text-foreground">
                          {contact.nome || 'Sem nome'}
                        </span>
                      </div>
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-xs text-muted-foreground cursor-pointer"
                      onClick={() => setDetailTarget(contact)}
                    >
                      {formatPhone(contact.numero_whatsapp)}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3">
                      {contact.clients ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                          <Building className="h-3 w-3 text-primary" />
                          {contact.clients.nome}
                          {canManageContacts && (
                            <button
                              onClick={() => updateMutation.mutate({ id: contact.id, client_id: null })}
                              className="ml-1 text-muted-foreground hover:text-danger transition-colors"
                              title="Desvincular cliente"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ) : canManageContacts && !contact.numero_whatsapp.startsWith('120363') ? (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              updateMutation.mutate({ id: contact.id, client_id: e.target.value })
                              e.target.value = ''
                            }
                          }}
                          className="rounded-md border border-dashed border-border bg-transparent px-2 py-1 text-xs text-muted-foreground hover:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        >
                          <option value="">Vincular cliente...</option>
                          {clientsList.map((cl) => (
                            <option key={cl.id} value={cl.id}>{cl.nome}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {contact.numero_whatsapp.startsWith('120363') ? 'Grupo' : '—'}
                        </span>
                      )}
                    </td>
                    <td
                      className="hidden lg:table-cell px-4 py-3 cursor-pointer"
                      onClick={() => setDetailTarget(contact)}
                    >
                      {contact.tags && contact.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                            >
                              <Tag className="h-3 w-3" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td
                      className="hidden lg:table-cell px-4 py-3 text-xs text-muted-foreground cursor-pointer"
                      onClick={() => setDetailTarget(contact)}
                    >
                      {contact.criado_em
                        ? new Date(contact.criado_em).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
    </div>
  )
}
