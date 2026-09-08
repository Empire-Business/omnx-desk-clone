import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { OmnxLockup } from '@/components/icons/OmnxLockup'

interface OmnxBrandBandProps {
  /** Sidebar recolhida — reduz a logo. */
  collapsed?: boolean
  className?: string
}

/**
 * Faixa de marca OMNX no topo da sidebar.
 *
 * A logo alterna com o tema: o fundo do sidebar é claro (#F6F8FC) no tema
 * claro e escuro (#1A1A1A) no tema escuro, então a wordmark precisa ser
 * preta em um e branca no outro. Observa a classe `.dark` no <html> para
 * funcionar independente de qual componente troca o tema (o hook useTheme
 * não sincroniza entre instâncias).
 */
export function OmnxBrandBand({ collapsed = false, className }: OmnxBrandBandProps) {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )
  useEffect(() => {
    const el = document.documentElement
    const update = () => setIsDark(el.classList.contains('dark'))
    update()
    const obs = new MutationObserver(update)
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  return (
    <div
      className={cn(
        'flex items-center pt-3.5 pb-3',
        // Recolhida: centralizada (a faixa é estreita). Expandida: alinhada à
        // esquerda, acompanhando o alinhamento dos itens do menu.
        collapsed ? 'justify-center px-2' : 'justify-start px-3',
        className,
      )}
    >
      {/* 'light' => logo branca (fundo escuro); 'dark' => logo preta (fundo claro). */}
      <OmnxLockup height={collapsed ? 24 : 32} showWord={false} variant={isDark ? 'light' : 'dark'} />
    </div>
  )
}
