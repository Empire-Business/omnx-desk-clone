import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

// No servidor/testes (sem `window`) o efeito de layout vira efeito comum.
const useEfeitoLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export interface AbaItem {
  /** Identificador estável (chave da lista). */
  id: string
  rotulo: ReactNode
  /** Rota interna: a aba vira link. Sem `para`, a aba é um botão (use `onClick`). */
  para?: string
  /** Para links: só fica ativa na rota exata (igual ao `end` do NavLink). */
  fim?: boolean
  /** Força o estado ativo. Sem isso, links seguem a rota e botões ficam inativos. */
  ativo?: boolean
  icone?: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  /** Número ao lado do rótulo (ex.: não lidas). Zero ou vazio esconde. */
  contador?: number
  /** Texto do `title` (dica ao passar o mouse). */
  dica?: string
  onClick?: () => void
  desabilitado?: boolean
  /** Desenha um divisor antes desta aba (ex.: separar abas de configuração). */
  separadorAntes?: boolean
}

interface AbasRolaveisProps {
  itens: AbaItem[]
  /** Nome acessível da faixa (ex.: "Seções de Contratos"). */
  rotulo: string
  /**
   * `linha` (padrão): abas com traço azul embaixo da ativa (DS `.tabs`).
   * `segmentado`: trilho cinza com a opção ativa em cartão (DS `.seg`).
   */
  variante?: 'linha' | 'segmentado'
  className?: string
}

/**
 * Faixa de abas que rola de lado quando não cabe (celular), com esmaecimento
 * nas bordas só do lado em que ainda há abas escondidas e rolagem automática
 * até a aba ativa. Mesmo visual em todo o app (design system, seção 08).
 *
 * Links usam `aria-current="page"`; botões usam `role="tab"` + `aria-selected`.
 */
export function AbasRolaveis({ itens, rotulo, variante = 'linha', className }: AbasRolaveisProps) {
  const { pathname } = useLocation()
  const faixa = useRef<HTMLElement | null>(null)
  const [bordas, setBordas] = useState({ inicio: false, fim: false })

  const medir = useCallback(() => {
    const el = faixa.current
    if (!el) return
    const inicio = el.scrollLeft > 2
    const fim = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setBordas((b) => (b.inicio === inicio && b.fim === fim ? b : { inicio, fim }))
  }, [])

  // Mede ao montar e sempre que o tamanho muda.
  useEffect(() => {
    const el = faixa.current
    if (!el) return
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [medir, itens.length])

  // Mantém a aba ativa à vista (sem rolar a página na vertical).
  useEfeitoLayout(() => {
    const el = faixa.current
    const ativa = el?.querySelector<HTMLElement>('[aria-current="page"],[aria-selected="true"]')
    if (!el || !ativa) return
    // A faixa é `position: relative`, então o offset da aba já é relativo a ela.
    const esquerda = ativa.offsetParent === el ? ativa.offsetLeft : ativa.offsetLeft - el.offsetLeft
    const direita = esquerda + ativa.offsetWidth
    if (esquerda < el.scrollLeft) el.scrollLeft = Math.max(0, esquerda - 24)
    else if (direita > el.scrollLeft + el.clientWidth) el.scrollLeft = direita - el.clientWidth + 24
    medir()
  }, [pathname, itens, medir])

  const soLinks = itens.every((i) => i.para)
  const linha = variante === 'linha'
  const classeItem = linha ? 'tab' : undefined

  const conteudo = (item: AbaItem, ativo: boolean) => (
    <>
      {item.icone && <item.icone className="h-4 w-4 shrink-0" aria-hidden />}
      <span>{item.rotulo}</span>
      {!!item.contador && item.contador > 0 && (
        <span className={cn('count', ativo && 'is-primary')}>
          {item.contador > 99 ? '99+' : item.contador}
        </span>
      )}
    </>
  )

  const propsFaixa = {
    onScroll: medir,
    'aria-label': rotulo,
    'data-fade-start': bordas.inicio,
    'data-fade-end': bordas.fim,
    className: cn('fade-x', linha ? 'tabs' : 'seg'),
  }

  return (
    <div className={cn('min-w-0 max-w-full', className)}>
      {soLinks ? (
        <nav ref={faixa} {...propsFaixa}>
          {itens.map((item) => (
            <ItemLink key={item.id} item={item} classe={classeItem} conteudo={conteudo} />
          ))}
        </nav>
      ) : (
        <div ref={(el) => { faixa.current = el }} role="tablist" {...propsFaixa}>
          {itens.map((item) => (
            <ItemBotao key={item.id} item={item} classe={classeItem} conteudo={conteudo} />
          ))}
        </div>
      )}
    </div>
  )
}

function Separador() {
  return <span className="mx-1 h-4 w-px shrink-0 self-center bg-border" aria-hidden />
}

function ItemLink({
  item,
  classe,
  conteudo,
}: {
  item: AbaItem
  classe?: string
  conteudo: (item: AbaItem, ativo: boolean) => ReactNode
}) {
  const para = item.para as string
  return (
    <>
      {item.separadorAntes && <Separador />}
      {item.ativo !== undefined ? (
        <Link
          to={para}
          aria-current={item.ativo ? 'page' : undefined}
          title={item.dica}
          onClick={item.onClick}
          className={classe}
        >
          {conteudo(item, item.ativo)}
        </Link>
      ) : (
        <NavLink to={para} end={item.fim} title={item.dica} onClick={item.onClick} className={classe}>
          {({ isActive }) => conteudo(item, isActive)}
        </NavLink>
      )}
    </>
  )
}

function ItemBotao({
  item,
  classe,
  conteudo,
}: {
  item: AbaItem
  classe?: string
  conteudo: (item: AbaItem, ativo: boolean) => ReactNode
}) {
  const ativo = !!item.ativo
  return (
    <>
      {item.separadorAntes && <Separador />}
      <button
        type="button"
        role="tab"
        aria-selected={ativo}
        disabled={item.desabilitado}
        title={item.dica}
        onClick={item.onClick}
        className={classe}
      >
        {conteudo(item, ativo)}
      </button>
    </>
  )
}
