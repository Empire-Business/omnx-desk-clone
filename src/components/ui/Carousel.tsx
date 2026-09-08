import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CarouselProps<T> {
  items: T[]
  /** Quantos itens mostrar por slide. Default: 1 */
  itemsPerSlide?: number
  /** Tempo entre auto-avanço em ms. 0 desliga. Default: 8000 */
  autoPlayInterval?: number
  /** Pause hover. Default: true */
  pauseOnHover?: boolean
  /** Renderiza um item */
  renderItem: (item: T, index: number) => ReactNode
  /** Layout dos itens dentro do slide. Default: 'stack' (lista vertical) */
  layout?: 'stack' | 'grid'
  /** Classe extra no container do slide */
  slideClassName?: string
  /** key extractor (para react keys) */
  getKey?: (item: T, index: number) => string | number
  /** Mostra controles? Default: true */
  showControls?: boolean
}

export function Carousel<T>({
  items,
  itemsPerSlide = 1,
  autoPlayInterval = 8000,
  pauseOnHover = true,
  renderItem,
  layout = 'stack',
  slideClassName,
  getKey,
  showControls = true,
}: CarouselProps<T>) {
  const slides = useMemo(() => {
    if (items.length === 0) return [] as T[][]
    const out: T[][] = []
    for (let i = 0; i < items.length; i += itemsPerSlide) {
      out.push(items.slice(i, i + itemsPerSlide))
    }
    return out
  }, [items, itemsPerSlide])

  const total = slides.length
  const [page, setPage] = useState(0)
  const [hovering, setHovering] = useState(false)
  const interactedRef = useRef(false)

  // Auto-play
  useEffect(() => {
    if (autoPlayInterval <= 0) return
    if (total <= 1) return
    if (pauseOnHover && hovering) return
    if (interactedRef.current) return

    const id = setInterval(() => {
      setPage(p => (p + 1) % total)
    }, autoPlayInterval)
    return () => clearInterval(id)
  }, [autoPlayInterval, hovering, pauseOnHover, total])

  function go(dir: 1 | -1) {
    interactedRef.current = true
    setPage(p => (p + dir + total) % total)
  }
  function goTo(i: number) {
    interactedRef.current = true
    setPage(i)
  }

  // Reset página se items mudou
  useEffect(() => {
    if (page >= total && total > 0) setPage(0)
  }, [page, total])

  if (total === 0) return null
  if (total === 1) {
    return (
      <div className={cn(layout === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'space-y-2')}>
        {slides[0].map((item, i) => (
          <div key={getKey ? getKey(item, i) : i}>{renderItem(item, i)}</div>
        ))}
      </div>
    )
  }

  const currentSlide = slides[page] ?? []

  return (
    <div
      onMouseEnter={() => pauseOnHover && setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className={cn('min-h-[60px]', slideClassName)}>
        <div
          className={cn(
            'animate-fade-in',
            layout === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'space-y-2',
          )}
          key={page}
        >
          {currentSlide.map((item, i) => (
            <div key={getKey ? getKey(item, page * itemsPerSlide + i) : page * itemsPerSlide + i}>
              {renderItem(item, page * itemsPerSlide + i)}
            </div>
          ))}
        </div>
      </div>

      {showControls && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 border-t border-border/40 mt-2">
          <button
            onClick={() => go(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Dots */}
          <div className="flex items-center gap-1">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={cn(
                  'transition-all rounded-full',
                  i === page
                    ? 'h-1.5 w-4 bg-primary'
                    : 'h-1.5 w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60',
                )}
                aria-label={`Ir para página ${i + 1}`}
                aria-current={i === page}
              />
            ))}
          </div>

          <button
            onClick={() => go(1)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Próximo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <span className="ml-2 text-[10.5px] font-mono text-muted-foreground tabular-nums">
            {page + 1} / {total}
          </span>
        </div>
      )}
    </div>
  )
}
