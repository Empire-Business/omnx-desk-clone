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
}

export function EmojiReactionPicker({ onSelect, onRemove, onClose, currentReaction }: EmojiReactionPickerProps) {
  const [activeCategory, setActiveCategory] = useState(0)

  return (
    <div className="absolute bottom-full mb-2 z-20 rounded-xl border border-border bg-card shadow-xl backdrop-blur-sm animate-fade-in">
      {/* Quick reaction bar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => { onSelect(emoji); onClose() }}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-all hover:scale-125 hover:bg-muted',
              currentReaction === emoji && 'bg-primary/10 ring-1 ring-primary',
            )}
          >
            {emoji}
          </button>
        ))}
        {currentReaction && onRemove && (
          <button
            onClick={() => { onRemove(); onClose() }}
            className="flex h-8 items-center justify-center rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-destructive transition-colors ml-1"
          >
            ✕
          </button>
        )}
      </div>

      {/* Extended picker */}
      <div className="p-2">
        {/* Category tabs */}
        <div className="flex gap-1 mb-2">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(i)}
              className={cn(
                'rounded-md px-2 py-0.5 text-2xs font-medium transition-colors',
                i === activeCategory ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Emoji grid */}
        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-0.5 max-h-[150px] overflow-y-auto scrollbar-thin">
          {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => { onSelect(emoji); onClose() }}
              className="flex h-7 w-7 items-center justify-center rounded text-base hover:scale-110 hover:bg-muted transition-all"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
