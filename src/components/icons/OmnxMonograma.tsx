import { useId } from 'react'

interface OmnxMonogramaProps {
  /** Altura em px (a largura acompanha a proporção do logo). */
  height?: number
  /**
   * Cores do logo:
   * - 'auto' (padrão): segue o tema pelas variáveis --logo-ink / --logo-x;
   * - 'dark': azul OMNX (para fundo claro);
   * - 'light': quase branco (para fundo escuro).
   */
  variant?: 'auto' | 'dark' | 'light'
  className?: string
  /** Texto alternativo. Use `''` quando houver o nome ao lado (decorativo). */
  title?: string
}

const CORES = {
  dark: { ink: '#0B57D0', x: '#6A98E2' },
  light: { ink: '#F2F5FA', x: '#8AB4F8' },
} as const

/**
 * Logo oficial OMNX: monograma 2×2 (OM em cima, NX embaixo), com o corte do X
 * em degradê a 215°. Vetor medido de `public/omnx-logo.png` (design system,
 * seção 01). Fica nítido em qualquer tamanho e troca de cor com o tema.
 */
export function OmnxMonograma({ height = 28, variant = 'auto', className, title = 'OMNX' }: OmnxMonogramaProps) {
  const id = `omnx-x-${useId().replace(/:/g, '')}`
  const ink = variant === 'auto' ? 'var(--logo-ink)' : CORES[variant].ink
  const x = variant === 'auto' ? 'var(--logo-x)' : CORES[variant].x
  const decorativo = title === ''
  return (
    <svg
      viewBox="16 36 568 524"
      height={height}
      width={(height * 568) / 524}
      className={className}
      role={decorativo ? undefined : 'img'}
      aria-label={decorativo ? undefined : title}
      aria-hidden={decorativo || undefined}
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="540" y1="322" x2="322" y2="556">
          <stop offset="0" style={{ stopColor: ink }} />
          <stop offset=".22" style={{ stopColor: ink }} />
          <stop offset="1" style={{ stopColor: x }} />
        </linearGradient>
      </defs>
      <g style={{ fill: ink }}>
        <path fillRule="evenodd" d="M20.5 160a126 122 0 1 0 252 0a126 122 0 1 0-252 0ZM84 161a62.5 60 0 1 1 125 0a62.5 60 0 1 1-125 0Z" />
        <polygon points="295,42 357,42 437,131 517,42 579,42 579,281 514,281 514,147 437,233 360,147 360,281 295,281" />
        <polygon points="45,322 106,322 211,453 211,322 276,322 276,556 216,556 110,424 110,556 45,556" />
        <polygon points="310,322 388,322 425,372 386,427" />
        <polygon points="478,449 555,556 477,556 439,504" />
      </g>
      <polygon fill={`url(#${id})`} points="476,322 554,322 387,556 309,556" />
    </svg>
  )
}
