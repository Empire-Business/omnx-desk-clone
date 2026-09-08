interface OmnxLogoProps {
  className?: string
  size?: number
}

/**
 * Logo OMNX. Renderiza `public/omnx-logo.png`.
 * Pra trocar a logo, basta substituir esse arquivo.
 */
export function OmnxLogo({ className, size = 32 }: OmnxLogoProps) {
  return (
    <img
      src="/omnx-logo.png"
      width={size}
      height={size}
      alt="OMNX"
      className={className}
      draggable={false}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}
