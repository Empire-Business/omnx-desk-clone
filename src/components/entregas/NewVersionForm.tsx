import { useState, useRef } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { cn } from '@/lib/utils'
import { useCreateVersion } from '@/hooks/useDeliveryContent'
import type { ContentType } from '@/types/database'
import type { ContentItemInput } from '@/hooks/useDeliveryContent'

interface NewVersionFormProps {
  deliveryId: string
  onSuccess?: () => void
}

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: 'imagem',    label: 'Imagem' },
  { value: 'video',     label: 'Vídeo' },
  { value: 'documento', label: 'Documento' },
  { value: 'link',      label: 'Link' },
  { value: 'texto',     label: 'Texto' },
]

const FILE_ACCEPT: Record<ContentType, string | undefined> = {
  imagem:    'image/*',
  video:     'video/*',
  documento: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv',
  link:      undefined,
  texto:     undefined,
}

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors'
const labelClass = 'block text-sm font-medium text-foreground mb-1.5'

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  )
}

function itemLabel(item: ContentItemInput): string {
  if (item.nome) return item.nome
  if (item.file) return item.file.name
  if (item.url) return item.url
  if (item.texto) return item.texto.slice(0, 40) + (item.texto.length > 40 ? '…' : '')
  return CONTENT_TYPE_OPTIONS.find(o => o.value === item.tipo)?.label ?? item.tipo
}

interface ItemEditorProps {
  tipo: ContentType
  onAdd: (item: ContentItemInput) => void
  onCancel: () => void
}

function ItemEditor({ tipo, onAdd, onCancel }: ItemEditorProps) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [texto, setTexto] = useState('')
  const [nome, setNome] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const isFileType = tipo === 'imagem' || tipo === 'video' || tipo === 'documento'

  function handleAdd() {
    if (isFileType && !file) return
    if (tipo === 'link' && !url.trim()) return
    if (tipo === 'texto' && !texto.trim()) return

    onAdd({
      tipo,
      file: file ?? undefined,
      url: url.trim() || undefined,
      texto: texto.trim() || undefined,
      nome: nome.trim() || undefined,
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      {isFileType && (
        <div>
          <label className={labelClass}>Arquivo</label>
          <input
            ref={fileRef}
            type="file"
            accept={FILE_ACCEPT[tipo]}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)}
            className={cn(inputClass, 'cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-primary-muted file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary')}
          />
        </div>
      )}

      {(tipo === 'link' || tipo === 'video') && (
        <div>
          <label className={labelClass}>{tipo === 'video' ? 'URL do vídeo' : 'URL'}</label>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            className={inputClass}
            placeholder={tipo === 'video' ? 'https://youtube.com/watch?v=...' : 'https://...'}
          />
        </div>
      )}

      {tipo === 'texto' && (
        <div>
          <label className={labelClass}>Texto / Copy</label>
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={4}
            className={cn(inputClass, 'resize-y')}
            placeholder="Cole ou escreva o conteúdo aqui..."
          />
        </div>
      )}

      <div>
        <label className={labelClass}>Nome / descrição <span className="text-muted-foreground font-normal">(opcional)</span></label>
        <input
          type="text"
          value={nome}
          onChange={e => setNome(e.target.value)}
          className={inputClass}
          placeholder="Ex: Foto produto principal"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={isFileType ? !file : tipo === 'link' ? !url.trim() : !texto.trim()}
          className="gradient-primary rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          Adicionar
        </button>
      </div>
    </div>
  )
}

export function NewVersionForm({ deliveryId, onSuccess }: NewVersionFormProps) {
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ContentItemInput[]>([])
  const [addingType, setAddingType] = useState<ContentType | null>(null)
  const [selectedType, setSelectedType] = useState<ContentType>('imagem')

  const createVersion = useCreateVersion()

  function handleAddItem(item: ContentItemInput) {
    setItems(prev => [...prev, item])
    setAddingType(null)
  }

  function handleRemoveItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (items.length === 0) return

    await createVersion.mutateAsync({
      delivery_id: deliveryId,
      notas: notas.trim() || undefined,
      items,
    })

    setNotas('')
    setItems([])
    onSuccess?.()
  }

  const isPending = createVersion.isPending

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Notes */}
      <div>
        <label className={labelClass}>
          Notas desta versão <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          rows={3}
          disabled={isPending}
          className={cn(inputClass, 'resize-y disabled:opacity-60')}
          placeholder="Descreva as alterações, contexto ou instruções para aprovação..."
        />
      </div>

      {/* Content items list */}
      <div>
        <p className={labelClass}>Conteúdo</p>

        {items.length > 0 && (
          <ul className="mb-3 space-y-2">
            {items.map((item, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 rounded bg-primary-muted px-1.5 py-0.5 text-2xs font-semibold text-primary uppercase tracking-wide">
                    {CONTENT_TYPE_OPTIONS.find(o => o.value === item.tipo)?.label ?? item.tipo}
                  </span>
                  <span className="truncate text-sm text-foreground">{itemLabel(item)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(i)}
                  disabled={isPending}
                  className="shrink-0 text-muted-foreground hover:text-danger transition-colors disabled:opacity-50"
                  aria-label="Remover item"
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Add content area */}
        {addingType ? (
          <ItemEditor
            tipo={addingType}
            onAdd={handleAddItem}
            onCancel={() => setAddingType(null)}
          />
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value as ContentType)}
              disabled={isPending}
              className={cn(inputClass, 'w-auto flex-1 disabled:opacity-60')}
            >
              {CONTENT_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAddingType(selectedType)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-primary/40 bg-primary-muted px-3 py-2 text-xs font-medium text-primary hover:bg-primary-light transition-colors disabled:opacity-50 shrink-0"
            >
              <PlusIcon />
              Adicionar conteúdo
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {createVersion.error && (
        <p className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
          {createVersion.error instanceof Error
            ? createVersion.error.message
            : 'Erro ao enviar versão. Tente novamente.'}
        </p>
      )}

      {/* Upload progress feedback */}
      {isPending && (
        <div className="flex items-center gap-2 rounded-lg bg-info-light px-3 py-2.5 text-sm text-info">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          Enviando arquivos e salvando versão...
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending || items.length === 0}
          className={cn(
            'inline-flex items-center gap-2 gradient-primary rounded-lg px-5 py-2.5 text-sm font-semibold text-primary-foreground',
            'hover:opacity-90 disabled:opacity-50 transition-opacity'
          )}
        >
          {isPending ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
              Enviando...
            </>
          ) : (
            <>
              <UploadIcon />
              Enviar versão
            </>
          )}
        </button>
      </div>
    </form>
  )
}
