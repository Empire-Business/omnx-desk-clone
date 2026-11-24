import { useState } from 'react'
import { cn } from '@/lib/utils'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏', '🎉', '💯']

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  { label: 'Populares', emojis: QUICK_EMOJIS },
  { label: 'Rostos', emojis: ['😀', '😃', '😄', '😁', '😅', '🤣', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '😵', '🤯', '🥳', '😎', '🤓', '🧐'] },
  { label: 'Gestos', emojis: ['👋', '🤚', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪'] },
  { label: 'Objetos', emojis: ['⭐', '🌟', '✨', '💫', '🔥', '💥', '💯', '💢', '💬', '💭', '🗯️', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💝', '✅', '❌', '⚠️', '🚀'] },
]

interface EmojiReactionPickerProps {
  onSelect: (emoji: string) => void
  onRemove?: () => void
  onClose: () => void
  currentReaction?: string | null
  /** Lado em que o seletor se ancora no balão (direita para mensagens da equipe). */
  align?: 'left' | 'right'
}

export function EmojiReactionPicker({ onSelect, onRemove, onClose, currentReaction, align = 'left' }: EmojiReactionPickerProps) {
  const [activeCategory, setActiveCategory] = useState(0)

  return (
    <div
      className={cn(
        'absolute bottom-full mb-2 z-20 w-max max-w-[calc(100vw-1.5rem)] rounded-xl bg-popover shadow-pop ring-hairline animate-fade-in-up',
        align === 'right' ? 'right-0' : 'left-0',
      )}
    >
      {/* Quick reaction bar */}
      <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none px-2 py-1.5 border-b border-border">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            type="button"
            key={emoji}
            onClick={() => { onSelect(emoji); onClose() }}
            aria-label={`Reagir com ${emoji}`}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg transition-[transform,background-color] duration-fast hover:scale-110 hover:bg-accent focus-ds',
              currentReaction === emoji && 'bg-primary-light ring-1 ring-primary',
            )}
          >
            {emoji}
          </button>
        ))}
        {currentReaction && onRemove && (
          <button
            type="button"
            onClick={() => { onRemove(); onClose() }}
            aria-label="Remover reação"
            className="flex h-9 shrink-0 items-center justify-center rounded-lg px-2 text-xs text-muted-foreground hover:bg-danger-light hover:text-danger transition-colors duration-fast ml-1 focus-ds"
          >
            ✕
          </button>
        )}
      </div>

      {/* Extended picker */}
      <div className="p-2">
        {/* Category tabs */}
        <div className="seg mb-2">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              type="button"
              key={cat.label}
              onClick={() => setActiveCategory(i)}
              aria-pressed={i === activeCategory}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Emoji grid */}
        <div className="grid grid-cols-7 sm:grid-cols-8 md:grid-cols-10 gap-0.5 max-h-[150px] overflow-y-auto scrollbar-thin">
          {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
            <button
              type="button"
              key={emoji}
              onClick={() => { onSelect(emoji); onClose() }}
              className="flex h-8 w-8 items-center justify-center rounded text-base hover:scale-110 hover:bg-accent transition-[transform,background-color] duration-fast"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
