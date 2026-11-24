import { OmnxMonograma } from './OmnxMonograma'

interface OmnxLogoProps {
  className?: string
  size?: number
}

/**
 * Logo OMNX (monograma 2×2 oficial) em vetor, seguindo o tema.
 * Antes renderizava `public/omnx-logo.png`; o PNG continua no `public/`
 * para ícones e materiais externos.
 */
export function OmnxLogo({ className, size = 32 }: OmnxLogoProps) {
  return <OmnxMonograma height={size} className={className} />
}
