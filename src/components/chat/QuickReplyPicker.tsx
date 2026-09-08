import { useState, useEffect, useRef } from 'react'
import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuickReply } from '@/hooks/useChat'

interface QuickReplyPickerProps {
  replies: QuickReply[]
  search: string
  onSelect: (reply: QuickReply) => void
  onClose: () => void
}

export function QuickReplyPicker({ replies, search, onSelect, onClose }: QuickReplyPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const itemsRef = useRef<HTMLDivElement>(null)

  const filtered = replies.filter((r) => {
    const q = search.toLowerCase()
    if (!q) return true
    return (
      r.titulo.toLowerCase().includes(q) ||
      r.conteudo.toLowerCase().includes(q) ||
      (r.atalho?.toLowerCase().includes(q) ?? false)
    )
  })

  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  // Scroll selected item into view
  useEffect(() => {
    const container = itemsRef.current
    if (!container) return
    const item = container.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-border bg-card shadow-lg p-3 z-50">
        <p className="text-sm text-muted-foreground">Nenhuma resposta rápida encontrada</p>
      </div>
    )
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-border bg-card shadow-lg z-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Zap className="h-3 w-3" />
          Respostas rápidas · ↑↓ navegar · Enter selecionar · Esc fechar
        </p>
      </div>
      <div ref={itemsRef} className="max-h-56 overflow-y-auto">
        {filtered.map((reply, i) => (
          <button
            key={reply.id}
            onClick={() => onSelect(reply)}
            className={cn(
              'w-full text-left px-3 py-2.5 transition-colors border-b border-border/30 last:border-0',
              i === selectedIndex ? 'bg-primary-muted' : 'hover:bg-muted/50',
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{reply.titulo}</span>
              {reply.atalho && (
                <span className="text-2xs text-primary font-mono bg-primary-muted px-1.5 py-0.5 rounded">
                  {reply.atalho}
                </span>
              )}
              <span className="text-2xs text-muted-foreground rounded-full bg-muted px-1.5 py-0.5">
                {reply.categoria}
              </span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{reply.conteudo}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
