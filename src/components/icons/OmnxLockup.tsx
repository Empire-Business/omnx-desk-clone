import { OmnxMonograma } from './OmnxMonograma'
import { BRAND } from '@/config/brand'

interface OmnxLockupProps {
  /**
   * Contraste conforme o FUNDO do local:
   * - omitido ou 'dark' => segue o tema (azul + nome escuro no claro; claro no
   *   escuro). 'dark' era "para fundo claro", mas quem usa (ex.: login) fica
   *   sobre superfícies que mudam com o tema, então seguir o tema é o correto;
   * - 'light' => sempre claro, para fundos que são escuros nos dois temas.
   */
  variant?: 'dark' | 'light'
  /** Altura do monograma em px (o nome do produto se dimensiona a partir dela). */
  height?: number
  /** Nome do produto ao lado do logo. */
  word?: string
  /** Mostra ou não o nome do produto. */
  showWord?: boolean
  /** Tamanho do nome relativo à altura do logo. Padrão 0,54 (28 px → 15 px, como no DS). */
  wordRatio?: number
  className?: string
}

/** "DESK" → "Desk": o DS escreve o nome do produto em caixa alta e baixa. */
function nomeDoProduto(word: string) {
  return word === word.toUpperCase() ? word.charAt(0) + word.slice(1).toLowerCase() : word
}

/**
 * Assinatura de marca do DS (seção 01): monograma 2×2 oficial + nome do
 * produto em Archivo 750, alargada a 112%. Idêntica em todos os apps OMNX.
 */
export function OmnxLockup({
  variant,
  height = 28,
  word = BRAND.produto,
  showWord = true,
  wordRatio = 0.54,
  className,
}: OmnxLockupProps) {
  const fixoClaro = variant === 'light'
  const corNome = fixoClaro ? '#F2F5FA' : 'var(--foreground)'
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.36) }}>
      {BRAND.familiaOmnx ? (
        <OmnxMonograma height={height} variant={fixoClaro ? 'light' : 'auto'} title={showWord ? '' : 'OMNX'} />
      ) : (
        // Fora da marca OMNX: selo neutro com a inicial do app, na cor da marca.
        <span
          aria-hidden={showWord ? true : undefined}
          title={showWord ? undefined : BRAND.appName}
          style={{
            width: height, height, borderRadius: Math.round(height * 0.28), display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', background: 'var(--primary, #0B57D0)', color: '#fff',
            fontFamily: 'var(--font-display)', fontWeight: 750, fontSize: Math.round(height * 0.55), lineHeight: 1,
          }}
        >
          {BRAND.appName.charAt(0).toUpperCase()}
        </span>
      )}
      {showWord && (
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 750,
            fontStretch: '112%',
            letterSpacing: '-0.02em',
            fontSize: Math.max(12, Math.round(height * wordRatio)),
            lineHeight: 1,
            whiteSpace: 'nowrap',
            color: corNome,
          }}
        >
          {BRAND.familiaOmnx && <span className="sr-only">OMNX </span>}
          {nomeDoProduto(word)}
        </span>
      )}
    </span>
  )
}
