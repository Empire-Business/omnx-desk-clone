import { useEffect, useState } from 'react'

interface OmnxLockupProps {
  /**
   * Variante de contraste da wordmark:
   * - 'dark'  => texto PRETO (para FUNDO CLARO)  -> /omnx-logo-dark.png
   * - 'light' => texto BRANCO (para FUNDO ESCURO) -> /omnx-logo-light.png
   * Se omitido, alterna AUTOMATICAMENTE conforme o tema (classe `.dark` no <html>).
   */
  variant?: 'dark' | 'light'
  /** Altura da logo em px (a wordmark se dimensiona a partir dela). */
  height?: number
  /** Palavra do produto exibida após o separador. */
  word?: string
  /** Mostra ou não a palavra do produto (e o separador). */
  showWord?: boolean
  /**
   * Tamanho da palavra do produto relativo à altura da logo. Default 0.5.
   * Aumente (ex.: 0.95) para deixar o nome maior sem crescer a logo.
   */
  wordRatio?: number
  className?: string
}

/**
 * Lockup de marca OMNX: [logo OMNX] + [separador sutil] + [palavra do produto].
 * Harmonizados como uma marca só — idêntico em todos os apps OMNX.
 *
 * `variant` define a versão da wordmark conforme o FUNDO do local:
 * - 'dark'  => texto PRETO  (usar em FUNDO CLARO)  -> /omnx-logo-dark.png
 * - 'light' => texto BRANCO (usar em FUNDO ESCURO) -> /omnx-logo-light.png
 * Se omitido, observa a classe `.dark` no <html> e escolhe sozinho.
 */
export function OmnxLockup({
  variant,
  height = 22,
  word = 'DESK',
  showWord = true,
  wordRatio = 0.5,
  className,
}: OmnxLockupProps) {
  // Modo automático (variant undefined): segue o tema via classe `.dark`.
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )
  useEffect(() => {
    if (variant !== undefined) return
    const el = document.documentElement
    const update = () => setIsDark(el.classList.contains('dark'))
    update()
    const obs = new MutationObserver(update)
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [variant])

  const effective = variant ?? (isDark ? 'light' : 'dark')
  const gap = height * 0.45
  const sepHeight = height * 0.55
  const wordSize = height * wordRatio

  const src = effective === 'light' ? '/omnx-logo-light.png' : '/omnx-logo-dark.png'
  const sepColor = effective === 'light' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)'

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap }}
    >
      {/* Logo OMNX (uma única imagem, conforme o fundo) */}
      <img
        src={src}
        alt="OMNX"
        draggable={false}
        className="select-none"
        style={{ height, width: 'auto', display: 'block', flexShrink: 0 }}
      />

      {showWord && (
        <>
          {/* Separador vertical sutil */}
          <span
            aria-hidden="true"
            style={{
              width: 1,
              height: sepHeight,
              borderRadius: 1,
              flexShrink: 0,
              background: sepColor,
            }}
          />
          {/* Palavra do produto — usa a cor primária do app */}
          <span
            className="text-primary"
            style={{
              // Fonte próxima da wordmark OMNX (geométrica/técnica, cantos chanfrados).
              fontFamily:
                "'Chakra Petch','Space Grotesk','Segoe UI',system-ui,sans-serif",
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              fontSize: wordSize,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            {word}
          </span>
        </>
      )}
    </span>
  )
}
