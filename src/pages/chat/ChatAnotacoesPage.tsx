import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  StickyNote, Search, Pin, PinOff, Trash2, Copy, Bold, Italic, Code,
  List, Hash, Paperclip, X, ChevronDown, ChevronRight,
  Download, Loader2, Send, Pencil, Check, User, Contact, AtSign,
  Maximize2, Minimize2, Bell, BellOff, ArrowUpDown, Files,
  Palette,
} from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useUsers } from '@/hooks/useUsers'
import { useContacts } from '@/hooks/useChat'
import {
  usePersonalNotes,
  useAddNote,
  useUpdateNote,
  useDeleteNote,
  useRealtimeNotes,
  uploadNoteMedia,
  type PersonalNote,
} from '@/hooks/usePersonalNotes'

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTE_COLORS: { key: string; label: string; card: string; header: string }[] = [
  { key: 'default', label: 'Padrão',  card: 'bg-card',                                    header: '' },
  { key: 'yellow',  label: 'Amarelo', card: 'bg-amber-50 dark:bg-amber-950/40',            header: 'border-amber-200 dark:border-amber-800' },
  { key: 'blue',    label: 'Azul',    card: 'bg-blue-50 dark:bg-blue-950/40',              header: 'border-blue-200 dark:border-blue-800' },
  { key: 'green',   label: 'Verde',   card: 'bg-emerald-50 dark:bg-emerald-950/40',        header: 'border-emerald-200 dark:border-emerald-800' },
  { key: 'pink',    label: 'Rosa',    card: 'bg-pink-50 dark:bg-pink-950/40',              header: 'border-pink-200 dark:border-pink-800' },
  { key: 'purple',  label: 'Roxo',    card: 'bg-violet-50 dark:bg-violet-950/40',          header: 'border-violet-200 dark:border-violet-800' },
  { key: 'orange',  label: 'Laranja', card: 'bg-orange-50 dark:bg-orange-950/40',          header: 'border-orange-200 dark:border-orange-800' },
]

const COLOR_DOT: Record<string, string> = {
  default: 'bg-zinc-300 dark:bg-zinc-600',
  yellow:  'bg-amber-400',
  blue:    'bg-blue-400',
  green:   'bg-emerald-400',
  pink:    'bg-pink-400',
  purple:  'bg-violet-400',
  orange:  'bg-orange-400',
}

const TAG_COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
]

type SortOption = 'newest' | 'oldest' | 'title' | 'reminder'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_COLORS[hash % TAG_COLORS.length]
}

function noteCardColor(color: string) {
  return NOTE_COLORS.find(c => c.key === color) ?? NOTE_COLORS[0]
}

function extractTagsFromContent(content: string): string[] {
  const matches = content.match(/#([a-zA-ZÀ-ÿ0-9_-]+)/g)
  if (!matches) return []
  return [...new Set(matches.map(m => m.slice(1).toLowerCase()))]
}

function formatNoteTime(iso: string): string {
  const now = Date.now()
  const date = new Date(iso)
  const diff = now - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  if (diff < 24 * 3600000) return `${h}:${m}`
  const yesterday = new Date(now - 86400000)
  if (date.toDateString() === yesterday.toDateString()) return `Ontem ${h}:${m}`
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

function formatReminderLabel(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const isPast = date < now
  const label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return (isPast ? '⚠ ' : '🔔 ') + label
}

function groupLabel(iso: string): string {
  const now = new Date()
  const date = new Date(iso)
  const diff = now.getTime() - date.getTime()
  if (date.toDateString() === now.toDateString()) return 'Hoje'
  const yesterday = new Date(now.getTime() - 86400000)
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem'
  if (diff < 7 * 86400000) return date.toLocaleDateString('pt-BR', { weekday: 'long' })
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function groupNotesByDate(notes: PersonalNote[]): { label: string; notes: PersonalNote[] }[] {
  const groups: Map<string, PersonalNote[]> = new Map()
  for (const note of notes) {
    const label = groupLabel(note.created_at)
    const existing = groups.get(label) ?? []
    groups.set(label, [...existing, note])
  }
  return Array.from(groups.entries()).map(([label, notes]) => ({ label, notes }))
}

// ─── Markdown + checklist + mention renderer ──────────────────────────────────

function renderMarkdown(
  content: string,
  noteTags: string[],
  onMentionClick: (type: 'user' | 'contact', name: string) => void,
  onCheckToggle?: (lineIdx: number, checked: boolean) => void,
): React.ReactNode {
  const lines = content.split('\n')
  const result: React.ReactNode[] = []
  let listItems: React.ReactNode[] = []
  let listStartIdx = 0

  const flushList = () => {
    if (listItems.length > 0) {
      result.push(
        <ul key={`ul-${result.length}`} className="space-y-0.5 my-1 pl-1">
          {listItems}
        </ul>
      )
      listItems = []
    }
  }

  const parseInline = (text: string, keyPrefix: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = []
    let remaining = text
    let partIdx = 0

    while (remaining.length > 0) {
      const mentionMatch = remaining.match(/@\[([^\]]+)\]\((user|contact):([^)]+)\)/)
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/)
      const codeMatch = remaining.match(/`(.+?)`/)
      const tagMatch = remaining.match(/#([a-zA-ZÀ-ÿ0-9_-]+)/)
      const urlMatch = remaining.match(/https?:\/\/[^\s]+/)

      const candidates = [
        mentionMatch && { idx: mentionMatch.index!, len: mentionMatch[0].length, type: 'mention', inner: mentionMatch[1], extra: mentionMatch[2] },
        boldMatch && { idx: boldMatch.index!, len: boldMatch[0].length, type: 'bold', inner: boldMatch[1], extra: '' },
        italicMatch && { idx: italicMatch.index!, len: italicMatch[0].length, type: 'italic', inner: italicMatch[1], extra: '' },
        codeMatch && { idx: codeMatch.index!, len: codeMatch[0].length, type: 'code', inner: codeMatch[1], extra: '' },
        tagMatch && { idx: tagMatch.index!, len: tagMatch[0].length, type: 'tag', inner: tagMatch[1], extra: '' },
        urlMatch && { idx: urlMatch.index!, len: urlMatch[0].length, type: 'url', inner: urlMatch[0], extra: '' },
      ].filter(Boolean) as { idx: number; len: number; type: string; inner: string; extra: string }[]

      if (candidates.length === 0) {
        parts.push(<span key={`${keyPrefix}-t-${partIdx++}`}>{remaining}</span>)
        break
      }

      const first = candidates.reduce((a, b) => (a.idx <= b.idx ? a : b))

      if (first.idx > 0) {
        parts.push(<span key={`${keyPrefix}-t-${partIdx++}`}>{remaining.slice(0, first.idx)}</span>)
      }

      const k = `${keyPrefix}-${first.type}-${partIdx++}`
      if (first.type === 'mention') {
        const isUser = first.extra === 'user'
        parts.push(
          <button key={k} onClick={() => onMentionClick(first.extra as 'user' | 'contact', first.inner)}
            className={cn('inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[12px] font-semibold transition-colors',
              isUser
                ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 hover:bg-violet-200'
                : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200',
            )}>
            {isUser ? <User className="h-3 w-3" /> : <Contact className="h-3 w-3" />}
            @{first.inner}
          </button>
        )
      } else if (first.type === 'bold') {
        parts.push(<strong key={k} className="font-semibold">{first.inner}</strong>)
      } else if (first.type === 'italic') {
        parts.push(<em key={k}>{first.inner}</em>)
      } else if (first.type === 'code') {
        parts.push(<code key={k} className="px-1 py-0.5 rounded text-xs bg-muted font-mono">{first.inner}</code>)
      } else if (first.type === 'tag') {
        const tagName = first.inner.toLowerCase()
        parts.push(
          <span key={k} className={cn('inline-flex items-center rounded px-1 text-xs font-medium',
            noteTags.includes(tagName) ? tagColor(tagName) : 'text-primary font-medium')}>
            #{first.inner}
          </span>
        )
      } else if (first.type === 'url') {
        parts.push(
          <a key={k} href={first.inner} target="_blank" rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-80 break-all">
            {first.inner}
          </a>
        )
      }

      remaining = remaining.slice(first.idx + first.len)
    }

    return parts
  }

  lines.forEach((line, lineIdx) => {
    // Checklist item
    const checkMatch = line.match(/^- \[([ x])\] (.*)/)
    if (checkMatch) {
      const checked = checkMatch[1] === 'x'
      flushList()
      result.push(
        <div key={`check-${lineIdx}`} className="flex items-start gap-2 py-0.5">
          <button
            onClick={() => onCheckToggle?.(lineIdx, !checked)}
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0 rounded border transition-colors',
              checked
                ? 'bg-primary border-primary flex items-center justify-center'
                : 'border-border hover:border-primary',
            )}
          >
            {checked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
          </button>
          <span className={cn('text-sm leading-snug', checked && 'line-through text-muted-foreground')}>
            {parseInline(checkMatch[2], `check-${lineIdx}`)}
          </span>
        </div>
      )
    } else if (line.startsWith('- ')) {
      listStartIdx = lineIdx
      listItems.push(
        <li key={`li-${lineIdx}`} className="flex items-start gap-1.5 text-sm">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>{parseInline(line.slice(2), `li-${lineIdx}`)}</span>
        </li>
      )
    } else {
      flushList()
      if (line === '') {
        result.push(<div key={`br-${lineIdx}`} className="h-2" />)
      } else {
        result.push(
          <span key={`line-${lineIdx}`} className="block text-sm leading-relaxed">
            {parseInline(line, `line-${lineIdx}`)}
          </span>
        )
      }
    }
  })

  flushList()
  return <>{result}</>
}

// ─── Mention Picker ────────────────────────────────────────────────────────────

function MentionPicker({
  query,
  onSelect,
}: {
  query: string
  onSelect: (name: string, type: 'user' | 'contact', id: string) => void
}) {
  const { data: users = [] } = useUsers()
  const { data: contacts = [] } = useContacts(query.length >= 1 ? { search: query } : undefined)

  const lq = query.toLowerCase()
  const filteredUsers = lq ? users.filter(u => u.nome?.toLowerCase().includes(lq)).slice(0, 5) : users.slice(0, 5)
  const filteredContacts = query.length >= 1 ? contacts.filter(c => c.nome?.toLowerCase().includes(lq)).slice(0, 5) : []

  const allItems = [
    ...filteredUsers.map(u => ({ name: u.nome ?? '', type: 'user' as const, id: u.id })),
    ...filteredContacts.map(c => ({ name: c.nome ?? '', type: 'contact' as const, id: c.id })),
  ]

  const [activeIndex, setActiveIndex] = useState(0)
  useEffect(() => { setActiveIndex(0) }, [query])

  useEffect(() => {
    function onKey(e: Event) {
      const ke = e as KeyboardEvent
      if (ke.key === 'ArrowDown') setActiveIndex(i => Math.min(i + 1, allItems.length - 1))
      else if (ke.key === 'ArrowUp') setActiveIndex(i => Math.max(i - 1, 0))
      else if (ke.key === 'Enter' && allItems[activeIndex]) {
        const item = allItems[activeIndex]
        onSelect(item.name, item.type, item.id)
      }
    }
    window.addEventListener('mention-key', onKey)
    return () => window.removeEventListener('mention-key', onKey)
  }, [allItems, activeIndex, onSelect])

  if (allItems.length === 0) return null

  return (
    <div className="absolute bottom-full mb-2 left-0 right-0 z-50 rounded-xl border border-border bg-card shadow-xl overflow-hidden max-h-64 overflow-y-auto">
      {filteredUsers.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/40">
            <User className="h-3 w-3" /> Usuários
          </div>
          {filteredUsers.map((u) => {
            const idx = allItems.findIndex(it => it.id === u.id && it.type === 'user')
            return (
              <button key={u.id} onClick={() => onSelect(u.nome ?? '', 'user', u.id)}
                className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                  idx === activeIndex ? 'bg-violet-50 dark:bg-violet-900/30' : 'hover:bg-muted')}>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/50 shrink-0">
                  <User className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                </span>
                <span className="font-medium">{u.nome}</span>
                <span className="ml-auto text-[11px] text-muted-foreground capitalize">{u.perfil}</span>
              </button>
            )
          })}
        </div>
      )}
      {filteredContacts.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/40">
            <Contact className="h-3 w-3" /> Contatos
          </div>
          {filteredContacts.map((c) => {
            const idx = allItems.findIndex(it => it.id === c.id && it.type === 'contact')
            return (
              <button key={c.id} onClick={() => onSelect(c.nome ?? '', 'contact', c.id)}
                className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                  idx === activeIndex ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'hover:bg-muted')}>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 shrink-0">
                  <Contact className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </span>
                <span className="font-medium">{c.nome}</span>
                {c.numero_whatsapp && <span className="ml-auto text-[11px] text-muted-foreground">{formatPhone(c.numero_whatsapp)}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Fullscreen Editor ────────────────────────────────────────────────────────

function FullscreenEditor({
  note,
  onSave,
  onClose,
  onMentionClick,
}: {
  note: PersonalNote
  onSave: (title: string | null, content: string) => void
  onClose: () => void
  onMentionClick: (type: 'user' | 'contact', name: string) => void
}) {
  const [title, setTitle] = useState(note.title ?? '')
  const [content, setContent] = useState(note.content)
  const [mentionPicker, setMentionPicker] = useState<{ query: string; atPos: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const colorInfo = noteCardColor(note.color)

  const handleContentChange = (value: string, cursorPos?: number) => {
    setContent(value)
    const pos = cursorPos ?? value.length
    const textUpToCursor = value.slice(0, pos)
    const mentionMatch = textUpToCursor.match(/@(\w*)$/)
    if (mentionMatch) setMentionPicker({ query: mentionMatch[1], atPos: pos - mentionMatch[0].length })
    else setMentionPicker(null)
  }

  const handleSelectMention = (name: string, type: 'user' | 'contact', id: string) => {
    if (!mentionPicker) return
    const { atPos } = mentionPicker
    const cursorPos = textareaRef.current?.selectionStart ?? content.length
    const before = content.slice(0, atPos)
    const after = content.slice(cursorPos)
    const mention = `@[${name}](${type}:${id})`
    setContent(before + mention + ' ' + after)
    setMentionPicker(null)
    setTimeout(() => {
      textareaRef.current?.focus()
      const newPos = before.length + mention.length + 1
      textareaRef.current?.setSelectionRange(newPos, newPos)
    }, 0)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={cn('w-full max-w-2xl h-[80vh] rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden', colorInfo.card)}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Título (opcional)"
            className="flex-1 bg-transparent text-base font-semibold text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors">
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
        {/* Editor */}
        <div className="relative flex-1 overflow-hidden">
          {mentionPicker && (
            <div className="absolute bottom-0 left-0 right-0 z-10">
              <MentionPicker query={mentionPicker.query} onSelect={handleSelectMention} />
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={content}
            autoFocus
            onChange={e => handleContentChange(e.target.value, e.target.selectionStart ?? undefined)}
            onKeyDown={e => {
              if (mentionPicker) {
                if (e.key === 'Escape') { e.preventDefault(); setMentionPicker(null); return }
                if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
                  e.preventDefault()
                  window.dispatchEvent(new KeyboardEvent('mention-key', { key: e.key }))
                  return
                }
              }
            }}
            className="w-full h-full resize-none bg-transparent px-5 py-4 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder="Escreva aqui... (@ para mencionar, **negrito**, *itálico*, `código`, - lista, - [ ] checklist)"
          />
        </div>
        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => { onSave(title.trim() || null, content.trim()); onClose() }}
            className="flex items-center gap-1.5 text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-1.5 rounded-lg transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── NoteCard ────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  onPin,
  onDelete,
  onCopy,
  onDuplicate,
  onSave,
  onColorChange,
  onReminderChange,
  onMentionClick,
  onCheckToggle,
  onFullscreen,
}: {
  note: PersonalNote
  onPin: () => void
  onDelete: () => void
  onCopy: () => void
  onDuplicate: () => void
  onSave: (title: string | null, content: string) => void
  onColorChange: (color: string) => void
  onReminderChange: (iso: string | null) => void
  onMentionClick: (type: 'user' | 'contact', name: string) => void
  onCheckToggle: (lineIdx: number, checked: boolean) => void
  onFullscreen: () => void
}) {
  const [showActions, setShowActions] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showReminderInput, setShowReminderInput] = useState(false)
  const colorInfo = noteCardColor(note.color ?? 'default')
  const reminderPast = note.reminder_at ? new Date(note.reminder_at) < new Date() : false

  return (
    <div
      className={cn(
        'group relative rounded-xl border border-border shadow-sm transition-shadow hover:shadow-md',
        colorInfo.card,
        note.pinned && 'ring-1 ring-amber-300 dark:ring-amber-700',
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowColorPicker(false); setShowReminderInput(false) }}
    >
      {/* Pin badge */}
      {note.pinned && (
        <div className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50 z-10">
          <Pin className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />
        </div>
      )}

      {/* Title */}
      {note.title && (
        <div className={cn('px-4 pt-3 pb-1 border-b border-border/50', colorInfo.header)}>
          <p className="text-sm font-semibold text-foreground truncate">{note.title}</p>
        </div>
      )}

      {/* Content */}
      <div className={cn('px-4 py-3', note.title ? 'pt-2' : 'pt-3')}>
        <div className="text-sm text-foreground leading-relaxed pr-2">
          {renderMarkdown(note.content, note.tags, onMentionClick, onCheckToggle)}
        </div>

        {/* Media */}
        {note.tipo === 'imagem' && note.media_url && (
          <img src={note.media_url} alt="" className="mt-3 max-h-48 rounded-lg object-contain border border-border" />
        )}
        {note.tipo === 'documento' && note.media_url && (
          <a href={note.media_url} download target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-muted/60 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors">
            <Download className="h-3.5 w-3.5 text-muted-foreground" />
            Baixar documento
          </a>
        )}

        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {note.tags.map(tag => (
              <span key={tag} className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tagColor(tag))}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Reminder badge */}
        {note.reminder_at && (
          <div className={cn('mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
            reminderPast
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
          )}>
            <Bell className="h-3 w-3" />
            {formatReminderLabel(note.reminder_at)}
          </div>
        )}

        {/* Timestamp */}
        <p className="mt-2 text-[11px] text-muted-foreground">{formatNoteTime(note.created_at)}</p>
      </div>

      {/* Actions toolbar */}
      <div className={cn(
        'absolute right-2 top-2 flex items-center gap-0.5 rounded-lg bg-card/90 border border-border backdrop-blur-sm p-1 shadow-md transition-all duration-150',
        showActions ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none',
      )}>
        {/* Fullscreen */}
        <button onClick={onFullscreen} title="Editar em tela cheia"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>

        {/* Color picker */}
        <div className="relative">
          <button onClick={() => { setShowColorPicker(v => !v); setShowReminderInput(false) }} title="Cor"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <Palette className="h-3.5 w-3.5" />
          </button>
          {showColorPicker && (
            <div className="absolute top-full right-0 mt-1 z-20 flex gap-1 rounded-lg border border-border bg-card p-1.5 shadow-lg">
              {NOTE_COLORS.map(c => (
                <button key={c.key} onClick={() => { onColorChange(c.key); setShowColorPicker(false) }}
                  title={c.label}
                  className={cn('h-5 w-5 rounded-full transition-transform hover:scale-110', COLOR_DOT[c.key],
                    note.color === c.key && 'ring-2 ring-offset-1 ring-primary')}>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reminder */}
        <div className="relative">
          <button onClick={() => { setShowReminderInput(v => !v); setShowColorPicker(false) }} title="Lembrete"
            className={cn('rounded p-1 transition-colors',
              note.reminder_at
                ? 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <Bell className="h-3.5 w-3.5" />
          </button>
          {showReminderInput && (
            <div className="absolute top-full right-0 mt-1 z-20 rounded-lg border border-border bg-card p-2 shadow-lg min-w-[200px]">
              <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Definir lembrete</p>
              <input
                type="datetime-local"
                defaultValue={note.reminder_at ? note.reminder_at.slice(0, 16) : ''}
                onChange={e => onReminderChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="w-full rounded-md border border-border bg-muted px-2 py-1 text-xs outline-none focus:border-primary/50"
              />
              {note.reminder_at && (
                <button onClick={() => { onReminderChange(null); setShowReminderInput(false) }}
                  className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-500 hover:text-rose-600 transition-colors">
                  <BellOff className="h-3 w-3" /> Remover lembrete
                </button>
              )}
            </div>
          )}
        </div>

        {/* Duplicate */}
        <button onClick={onDuplicate} title="Duplicar"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Files className="h-3.5 w-3.5" />
        </button>

        {/* Pin */}
        <button onClick={onPin} title={note.pinned ? 'Desafixar' : 'Fixar'}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          {note.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>

        {/* Copy text */}
        <button onClick={onCopy} title="Copiar texto"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Copy className="h-3.5 w-3.5" />
        </button>

        {/* Delete */}
        <button onClick={onDelete} title="Deletar"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-rose-600 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ChatAnotacoesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  // List state
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [activeTag, setActiveTag] = useState<string | undefined>(undefined)
  const [pinnedOpen, setPinnedOpen] = useState(true)
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [showSortMenu, setShowSortMenu] = useState(false)

  // Compose state
  const [draftTitle, setDraftTitle] = useState('')
  const [draft, setDraft] = useState('')
  const [draftTags, setDraftTags] = useState<string[]>([])
  const [draftColor, setDraftColor] = useState('default')
  const [draftReminder, setDraftReminder] = useState('')
  const [uploading, setUploading] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [showColorBar, setShowColorBar] = useState(false)
  const [showReminderInput, setShowReminderInput] = useState(false)
  const [mentionPicker, setMentionPicker] = useState<{ query: string; atPos: number } | null>(null)

  // Card state
  const [fullscreenNote, setFullscreenNote] = useState<PersonalNote | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const { data: notes = [], isLoading } = usePersonalNotes(search || undefined, activeTag)
  useRealtimeNotes()
  const addNote = useAddNote()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()

  // Reminder notifications
  useEffect(() => {
    if (notes.length === 0) return
    const now = new Date()
    notes.forEach(note => {
      if (!note.reminder_at) return
      const reminderDate = new Date(note.reminder_at)
      const diff = reminderDate.getTime() - now.getTime()
      if (diff > 0 && diff < 60000) {
        const timeout = setTimeout(() => {
          if (Notification.permission === 'granted') {
            new Notification('🔔 Lembrete — OMNX Desk', {
              body: note.title ?? note.content.slice(0, 80),
            })
          }
        }, diff)
        return () => clearTimeout(timeout)
      }
    })
  }, [notes])

  // Request notification permission
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    notes.forEach(n => n.tags.forEach(t => set.add(t)))
    return Array.from(set).sort()
  }, [notes])

  const sortedNotes = useMemo(() => {
    const sorted = [...notes]
    if (sortBy === 'oldest') sorted.sort((a, b) => a.created_at.localeCompare(b.created_at))
    else if (sortBy === 'title') sorted.sort((a, b) => (a.title ?? a.content).localeCompare(b.title ?? b.content))
    else if (sortBy === 'reminder') sorted.sort((a, b) => {
      if (!a.reminder_at && !b.reminder_at) return 0
      if (!a.reminder_at) return 1
      if (!b.reminder_at) return -1
      return a.reminder_at.localeCompare(b.reminder_at)
    })
    // newest is default (already ordered by created_at desc from query)
    return sorted
  }, [notes, sortBy])

  const pinned = sortedNotes.filter(n => n.pinned)
  const unpinned = sortedNotes.filter(n => !n.pinned)
  const groups = useMemo(() => groupNotesByDate(unpinned), [unpinned])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(Math.max(ta.scrollHeight, 48), 192) + 'px'
  }, [draft])

  useEffect(() => {
    if (showTagInput) tagInputRef.current?.focus()
  }, [showTagInput])

  const handleMentionClick = useCallback((type: 'user' | 'contact', name: string) => {
    if (type === 'user') navigate('/chat/equipe')
    else navigate(`/chat?cliente=${encodeURIComponent(name)}`)
  }, [navigate])

  const handleDraftChange = useCallback((value: string, cursorPos?: number) => {
    setDraft(value)
    const pos = cursorPos ?? value.length
    const textUpToCursor = value.slice(0, pos)
    const mentionMatch = textUpToCursor.match(/@(\w*)$/)
    if (mentionMatch) setMentionPicker({ query: mentionMatch[1], atPos: pos - mentionMatch[0].length })
    else setMentionPicker(null)
  }, [])

  const handleSelectMention = useCallback((name: string, type: 'user' | 'contact', id: string) => {
    if (!mentionPicker) return
    const { atPos } = mentionPicker
    const cursorPos = textareaRef.current?.selectionStart ?? draft.length
    const before = draft.slice(0, atPos)
    const after = draft.slice(cursorPos)
    const mention = `@[${name}](${type}:${id})`
    const newDraft = before + mention + ' ' + after
    setDraft(newDraft)
    setMentionPicker(null)
    setTimeout(() => {
      textareaRef.current?.focus()
      const newPos = before.length + mention.length + 1
      textareaRef.current?.setSelectionRange(newPos, newPos)
    }, 0)
  }, [mentionPicker, draft])

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim()
    if (!trimmed && draftTags.length === 0) return
    const contentTags = extractTagsFromContent(trimmed)
    const allDraftTags = [...new Set([...draftTags, ...contentTags])]
    await addNote.mutateAsync({
      title: draftTitle.trim() || null,
      content: trimmed,
      tipo: 'texto',
      tags: allDraftTags,
      color: draftColor,
      reminder_at: draftReminder ? new Date(draftReminder).toISOString() : null,
    })
    setDraft('')
    setDraftTitle('')
    setDraftTags([])
    setDraftColor('default')
    setDraftReminder('')
    setShowTagInput(false)
    setTagInput('')
    setShowColorBar(false)
    setShowReminderInput(false)
    setMentionPicker(null)
  }, [draft, draftTitle, draftTags, draftColor, draftReminder, addNote])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionPicker) {
      if (e.key === 'Escape') { e.preventDefault(); setMentionPicker(null); return }
      if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
        e.preventDefault()
        window.dispatchEvent(new KeyboardEvent('mention-key', { key: e.key }))
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    try {
      const url = await uploadNoteMedia(file, user.id)
      const isImage = file.type.startsWith('image/')
      const tipo: PersonalNote['tipo'] = isImage ? 'imagem' : 'documento'
      const contentTags = extractTagsFromContent(draft.trim())
      const allDraftTags = [...new Set([...draftTags, ...contentTags])]
      await addNote.mutateAsync({
        title: draftTitle.trim() || null,
        content: draft.trim() || file.name,
        tipo,
        media_url: url,
        tags: allDraftTags,
        color: draftColor,
      })
      setDraft('')
      setDraftTitle('')
      setDraftTags([])
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const applyFormat = useCallback((marker: string, wrap = true) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = draft.slice(start, end)
    let newDraft: string, newCursorStart: number, newCursorEnd: number
    if (wrap) {
      if (selected) {
        newDraft = draft.slice(0, start) + marker + selected + marker + draft.slice(end)
        newCursorStart = start + marker.length
        newCursorEnd = end + marker.length
      } else {
        newDraft = draft.slice(0, start) + marker + marker + draft.slice(end)
        newCursorStart = newCursorEnd = start + marker.length
      }
    } else {
      const lineStart = draft.lastIndexOf('\n', start - 1) + 1
      newDraft = draft.slice(0, lineStart) + marker + draft.slice(lineStart)
      newCursorStart = start + marker.length
      newCursorEnd = end + marker.length
    }
    setDraft(newDraft)
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(newCursorStart, newCursorEnd) })
  }, [draft])

  const addTag = (tag: string) => {
    const clean = tag.trim().toLowerCase().replace(/[^a-zA-ZÀ-ÿ0-9_-]/g, '')
    if (!clean || draftTags.includes(clean)) return
    setDraftTags(prev => [...prev, clean])
    setTagInput('')
    setShowTagInput(false)
  }

  const handleCheckToggle = useCallback((noteId: string, content: string, lineIdx: number, checked: boolean) => {
    const lines = content.split('\n')
    if (lines[lineIdx]) {
      lines[lineIdx] = lines[lineIdx].replace(/^- \[[ x]\]/, `- [${checked ? 'x' : ' '}]`)
    }
    updateNote.mutate({ id: noteId, content: lines.join('\n') })
  }, [updateNote])

  const SORT_LABELS: Record<SortOption, string> = {
    newest: 'Mais recentes',
    oldest: 'Mais antigas',
    title: 'Título A-Z',
    reminder: 'Com lembrete',
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <StickyNote className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            {showSearch ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por título ou conteúdo..."
                  className="flex-1 bg-muted rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none border border-border focus:border-primary/50" />
                <button onClick={() => { setShowSearch(false); setSearch('') }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <h1 className="text-base font-semibold text-foreground">Minhas Anotações</h1>
                  {notes.length > 0 && <p className="text-xs text-muted-foreground">{notes.length} anotaç{notes.length === 1 ? 'ão' : 'ões'}</p>}
                </div>
                {/* Sort */}
                <div className="relative">
                  <button onClick={() => setShowSortMenu(v => !v)}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{SORT_LABELS[sortBy]}</span>
                  </button>
                  {showSortMenu && (
                    <div className="absolute right-0 top-full mt-1 z-20 rounded-lg border border-border bg-card shadow-lg overflow-hidden min-w-[150px]">
                      {(Object.keys(SORT_LABELS) as SortOption[]).map(opt => (
                        <button key={opt} onClick={() => { setSortBy(opt); setShowSortMenu(false) }}
                          className={cn('w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-muted',
                            sortBy === opt && 'text-primary font-medium')}>
                          {sortBy === opt && <Check className="h-3.5 w-3.5" />}
                          <span className={sortBy === opt ? '' : 'ml-5'}>{SORT_LABELS[opt]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setShowSearch(true)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <Search className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button onClick={() => setActiveTag(undefined)}
              className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                !activeTag ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
              Todas
            </button>
            {allTags.map(tag => (
              <button key={tag} onClick={() => setActiveTag(activeTag === tag ? undefined : tag)}
                className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  activeTag === tag ? tagColor(tag) + ' ring-2 ring-offset-1 ring-current/30' : tagColor(tag) + ' opacity-70 hover:opacity-100')}>
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notes feed */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted mb-4">
              <StickyNote className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-base font-medium text-foreground mb-1">
              {search || activeTag ? 'Nenhuma anotação encontrada' : 'Nenhuma anotação ainda'}
            </p>
            <p className="text-sm text-muted-foreground max-w-xs">
              {search || activeTag ? 'Tente ajustar sua busca ou filtro.' : 'Suas anotações aparecem aqui. Escreva algo abaixo para começar.'}
            </p>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-4 pb-4">
            {pinned.length > 0 && (
              <div>
                <button onClick={() => setPinnedOpen(v => !v)}
                  className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-3 hover:opacity-80 transition-opacity">
                  {pinnedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <Pin className="h-3 w-3" />
                  Fixadas ({pinned.length})
                </button>
                {pinnedOpen && (
                  <div className={cn('space-y-3', !isMobile && 'grid grid-cols-2 gap-3 space-y-0')}>
                    {pinned.map(note => (
                      <NoteCard key={note.id} note={note}
                        onPin={() => updateNote.mutate({ id: note.id, pinned: !note.pinned })}
                        onDelete={() => deleteNote.mutate(note.id)}
                        onCopy={() => navigator.clipboard.writeText([note.title, note.content].filter(Boolean).join('\n'))}
                        onDuplicate={() => addNote.mutate({ title: note.title ? note.title + ' (cópia)' : null, content: note.content, tipo: note.tipo, media_url: note.media_url ?? undefined, tags: note.tags, color: note.color })}
                        onSave={(title, content) => { const tags = extractTagsFromContent(content); updateNote.mutate({ id: note.id, title, content, tags }) }}
                        onColorChange={(color) => updateNote.mutate({ id: note.id, color })}
                        onReminderChange={(reminder_at) => updateNote.mutate({ id: note.id, reminder_at })}
                                                onMentionClick={handleMentionClick}
                        onCheckToggle={(lineIdx, checked) => handleCheckToggle(note.id, note.content, lineIdx, checked)}
                        onFullscreen={() => setFullscreenNote(note)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {groups.map(group => (
              <div key={group.label}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{group.label}</p>
                <div className={cn('space-y-3', !isMobile && 'grid grid-cols-2 gap-3 space-y-0')}>
                  {group.notes.map(note => (
                    <NoteCard key={note.id} note={note}
                      onPin={() => updateNote.mutate({ id: note.id, pinned: !note.pinned })}
                      onDelete={() => deleteNote.mutate(note.id)}
                      onCopy={() => navigator.clipboard.writeText([note.title, note.content].filter(Boolean).join('\n'))}
                      onDuplicate={() => addNote.mutate({ title: note.title ? note.title + ' (cópia)' : null, content: note.content, tipo: note.tipo, media_url: note.media_url ?? undefined, tags: note.tags, color: note.color })}
                      onSave={(title, content) => { const tags = extractTagsFromContent(content); updateNote.mutate({ id: note.id, title, content, tags }) }}
                      onColorChange={(color) => updateNote.mutate({ id: note.id, color })}
                      onReminderChange={(reminder_at) => updateNote.mutate({ id: note.id, reminder_at })}
                                            onMentionClick={handleMentionClick}
                      onCheckToggle={(lineIdx, checked) => handleCheckToggle(note.id, note.content, lineIdx, checked)}
                      onFullscreen={() => setFullscreenNote(note)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compose area */}
      <div className="shrink-0 border-t border-border bg-card px-4 pt-3 pb-4">
        {/* Color bar */}
        {showColorBar && (
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
            <span className="text-[11px] text-muted-foreground font-medium">Cor:</span>
            {NOTE_COLORS.map(c => (
              <button key={c.key} onClick={() => setDraftColor(c.key)} title={c.label}
                className={cn('h-5 w-5 rounded-full transition-transform hover:scale-110', COLOR_DOT[c.key],
                  draftColor === c.key && 'ring-2 ring-offset-1 ring-primary')} />
            ))}
          </div>
        )}

        {/* Reminder bar */}
        {showReminderInput && (
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
            <Bell className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <input type="datetime-local" value={draftReminder}
              onChange={e => setDraftReminder(e.target.value)}
              className="flex-1 rounded-md border border-border bg-muted px-2 py-1 text-xs outline-none focus:border-primary/50" />
            {draftReminder && (
              <button onClick={() => setDraftReminder('')} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Title input */}
        <input
          value={draftTitle}
          onChange={e => setDraftTitle(e.target.value)}
          placeholder="Título (opcional)"
          className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground outline-none mb-1.5 border-b border-transparent focus:border-border transition-colors pb-1"
        />

        {/* Toolbar */}
        <div className="flex items-center gap-1 mb-2">
          <button onClick={() => applyFormat('**')} title="Negrito" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><Bold className="h-3.5 w-3.5" /></button>
          <button onClick={() => applyFormat('*')} title="Itálico" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><Italic className="h-3.5 w-3.5" /></button>
          <button onClick={() => applyFormat('`')} title="Código" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><Code className="h-3.5 w-3.5" /></button>
          <button onClick={() => applyFormat('- ', false)} title="Lista" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><List className="h-3.5 w-3.5" /></button>
          <button onClick={() => applyFormat('- [ ] ', false)} title="Checklist"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <Check className="h-3.5 w-3.5" />
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          {/* Tag */}
          <div className="relative">
            <button onClick={() => setShowTagInput(v => !v)} title="Tag" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><Hash className="h-3.5 w-3.5" /></button>
            {showTagInput && (
              <div className="absolute bottom-full left-0 mb-2 z-10 bg-card border border-border rounded-lg shadow-md p-2 min-w-[180px]">
                <input ref={tagInputRef} value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput) } if (e.key === 'Escape') setShowTagInput(false) }}
                  placeholder="nome da tag..." className="w-full rounded-md bg-muted px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none" />
                {allTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {allTags.filter(t => !draftTags.includes(t)).slice(0, 8).map(tag => (
                      <button key={tag} onClick={() => addTag(tag)} className={cn('rounded-full px-2 py-0.5 text-xs font-medium', tagColor(tag))}>#{tag}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Color */}
          <button onClick={() => { setShowColorBar(v => !v); setShowReminderInput(false) }} title="Cor"
            className={cn('rounded p-1.5 transition-colors', showColorBar || draftColor !== 'default' ? 'text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <Palette className="h-3.5 w-3.5" />
          </button>

          {/* Reminder */}
          <button onClick={() => { setShowReminderInput(v => !v); setShowColorBar(false) }} title="Lembrete"
            className={cn('rounded p-1.5 transition-colors', showReminderInput || draftReminder ? 'text-blue-500' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <Bell className="h-3.5 w-3.5" />
          </button>

          {/* Attach */}
          <button onClick={() => fileInputRef.current?.click()} title="Anexar" disabled={uploading}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,.docx,.xlsx,.zip" className="hidden" onChange={handleFileUpload} />

          <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
            <AtSign className="h-3 w-3" />
            <span className="hidden sm:inline">mencionar</span>
          </div>
        </div>

        {/* Draft tags */}
        {draftTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {draftTags.map(tag => (
              <span key={tag} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tagColor(tag))}>
                #{tag}
                <button onClick={() => setDraftTags(prev => prev.filter(t => t !== tag))} className="hover:opacity-70"><X className="h-2.5 w-2.5" /></button>
              </span>
            ))}
          </div>
        )}

        {/* Textarea + send */}
        <div className="relative flex items-end gap-2">
          {mentionPicker && (
            <MentionPicker query={mentionPicker.query} onSelect={handleSelectMention} />
          )}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => handleDraftChange(e.target.value, e.target.selectionStart ?? undefined)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva uma anotação... (@ mencionar, - [ ] checklist, Enter para enviar)"
            rows={2}
            className={cn(
              'flex-1 resize-none rounded-lg border border-border px-3 py-2.5',
              'text-sm text-foreground placeholder:text-muted-foreground',
              'outline-none focus:border-primary/50 transition-colors scrollbar-hide overflow-hidden',
              noteCardColor(draftColor).card,
            )}
            style={{ minHeight: '48px', maxHeight: '192px' }}
          />
          <button onClick={handleSend}
            disabled={(!draft.trim() && draftTags.length === 0) || addNote.isPending}
            className={cn('shrink-0 flex items-center justify-center h-10 w-10 rounded-lg transition-colors',
              draft.trim() || draftTags.length > 0 ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
            {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Share dialog */}

      {/* Fullscreen editor */}
      {fullscreenNote && (
        <FullscreenEditor
          note={fullscreenNote}
          onSave={(title, content) => {
            const tags = extractTagsFromContent(content)
            updateNote.mutate({ id: fullscreenNote.id, title, content, tags })
          }}
          onClose={() => setFullscreenNote(null)}
          onMentionClick={handleMentionClick}
        />
      )}
    </div>
  )
}
