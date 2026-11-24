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

export function QuickReplyPicker({ replies, search, onSelect }: QuickReplyPickerProps) {
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
      <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-popover shadow-pop ring-hairline p-3 z-50 animate-fade-in-up">
        <p className="text-sm text-muted-foreground">Nenhuma resposta pronta encontrada</p>
      </div>
    )
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-popover shadow-pop ring-hairline z-50 overflow-hidden animate-fade-in-up">
      <div className="px-3 py-2 border-b border-border">
        <p className="text-[12px] font-semibold text-muted-foreground flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5" aria-hidden />
          Respostas prontas
          <span className="hidden font-normal sm:inline">· ↑↓ navegar · Enter escolher · Esc fechar</span>
        </p>
      </div>
      <div ref={itemsRef} className="max-h-[min(14rem,40dvh)] overflow-y-auto">
        {filtered.map((reply, i) => (
          <button
            type="button"
            key={reply.id}
            onClick={() => onSelect(reply)}
            className={cn(
              'w-full min-h-11 text-left px-3 py-2.5 transition-colors duration-fast border-b border-stroke-weak last:border-0',
              i === selectedIndex ? 'bg-primary-light' : 'hover:bg-accent',
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium text-foreground">{reply.titulo}</span>
              {reply.atalho && (
                <span className="mono rounded-sm bg-primary-light px-1.5 py-0.5 text-[11px] text-link">
                  {reply.atalho}
                </span>
              )}
              <span className="tag !h-5 !text-[11px]">
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
