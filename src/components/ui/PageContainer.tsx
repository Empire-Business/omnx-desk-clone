import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Larguras máximas do design system (seção 09 · Layout). */
const LARGURAS = {
  /** Conteúdo de página: 1280 px. */
  padrao: 'max-w-[1280px]',
  /** Texto de leitura: 720 px (≈ 68 caracteres). */
  leitura: 'max-w-[720px]',
  /** Formulário: 640 px. */
  formulario: 'max-w-[640px]',
  /** Telas largas (quadros, tabelas grandes): nada estica além de 1600 px. */
  larga: 'max-w-[1600px]',
  /** Sem limite (ex.: quadro kanban que rola de lado). */
  total: 'max-w-none',
} as const

interface PageContainerProps {
  children: ReactNode
  /** Largura máxima do conteúdo. Padrão: 1280 px. */
  largura?: keyof typeof LARGURAS
  /**
   * Margens laterais e verticais do DS (16 · 24 · 32 · 40 px por faixa de tela).
   * Use `true` em cascas sem respiro próprio (ex.: Conversas). Na casca
   * principal o `main` já aplica essas margens.
   */
  respiro?: boolean
  /** Rolagem própria (página dentro de uma casca que não rola, como Conversas). */
  rolagem?: boolean
  className?: string
  as?: 'div' | 'section' | 'article'
}

/**
 * Contêiner padrão de página: centraliza, limita a largura e espaça os blocos
 * (24 px entre grupos, 32 px a partir do tablet).
 */
export function PageContainer({
  children,
  largura = 'padrao',
  respiro = false,
  rolagem = false,
  className,
  as: Tag = 'div',
}: PageContainerProps) {
  const conteudo = (
    <Tag
      className={cn(
        'mx-auto flex w-full min-w-0 flex-col gap-6 md:gap-8',
        LARGURAS[largura],
        respiro && 'px-4 py-4 sm:px-6 sm:py-6 md:px-8 2xl:px-10',
        className,
      )}
    >
      {children}
    </Tag>
  )
  if (!rolagem) return conteudo
  return <div className="h-full min-h-0 overflow-y-auto">{conteudo}</div>
}
