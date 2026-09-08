import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASSES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-2xl' }

export function Modal({ open, onClose, title, description, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative w-full bg-card border border-card-border rounded-2xl shadow-xl animate-fade-in-up flex flex-col max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)]', SIZE_CLASSES[size])}>
        <div className="flex items-start justify-between gap-4 p-6 pb-4 shrink-0">
          <div>
            <h2 className="font-display text-xl font-medium text-foreground">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 pt-2 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
