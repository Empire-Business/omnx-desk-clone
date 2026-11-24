import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ColunaTabela<T> {
  id: string
  /** Cabeçalho da coluna (e rótulo no cartão, se `rotuloCartao` não for dado). */
  titulo: string
  celula: (linha: T) => ReactNode
  /** Rótulo à esquerda do valor quando a linha vira cartão. */
  rotuloCartao?: string
  /** A coluna principal abre o cartão no celular, sem rótulo (ex.: nome do cliente). */
  principal?: boolean
  /** Números, valores e datas: alinhados à direita, em fonte mono tabular. */
  numerica?: boolean
  /** Some no cartão (ex.: dado redundante que só ajuda na tabela larga). */
  esconderNoCartao?: boolean
  /** Classes extras na célula e no cabeçalho (ex.: largura). */
  className?: string
}

interface TabelaResponsivaProps<T> {
  colunas: ColunaTabela<T>[]
  linhas: T[]
  /** Chave estável de cada linha. */
  chave: (linha: T) => string
  /** Descrição da tabela para leitores de tela. */
  rotulo: string
  /** Ações por linha (botões). Ficam na última coluna e no rodapé do cartão. */
  acoes?: (linha: T) => ReactNode
  /** Mostrado no lugar da tabela quando não há linhas (use `EmptyState`). */
  vazio?: ReactNode
  /** Linha clicável. A célula principal deve conter um link/botão para teclado. */
  aoClicarLinha?: (linha: T) => void
  /** Destaca uma linha (ex.: selecionada). */
  linhaAtiva?: (linha: T) => boolean
  className?: string
}

/**
 * Tabela que vira cartões (design system, seção 08 · "Tabela que vira cartões").
 *
 * É o MESMO HTML nos dois casos: quando a largura disponível fica abaixo de
 * 560 px (container query, não a largura da tela), o cabeçalho some e cada
 * linha vira um cartão com o rótulo à esquerda e o valor à direita. Assim
 * funciona também dentro de painéis estreitos no computador.
 *
 * Exemplo:
 * ```tsx
 * <TabelaResponsiva
 *   rotulo="Contratos a vencer"
 *   linhas={contratos}
 *   chave={(c) => c.id}
 *   colunas={[
 *     { id: 'cliente', titulo: 'Cliente', principal: true, celula: (c) => <Link to={`/contratos/${c.id}`}>{c.cliente}</Link> },
 *     { id: 'plano', titulo: 'Plano', celula: (c) => c.plano },
 *     { id: 'valor', titulo: 'Valor', numerica: true, celula: (c) => formatarMoeda(c.valor) },
 *   ]}
 *   acoes={(c) => <button className="btn btn-ghost btn-sm">Abrir</button>}
 *   vazio={<EmptyState title="Nenhum contrato vencendo" />}
 * />
 * ```
 */
export function TabelaResponsiva<T>({
  colunas,
  linhas,
  chave,
  rotulo,
  acoes,
  vazio,
  aoClicarLinha,
  linhaAtiva,
  className,
}: TabelaResponsivaProps<T>) {
  if (linhas.length === 0 && vazio) return <>{vazio}</>

  return (
    <div className={cn('rt w-full min-w-0', className)}>
      {/* Moldura só na forma de tabela; em cartões, cada linha tem a sua. */}
      <div className="overflow-x-auto rounded-lg border border-card-border bg-card @max-[560px]:overflow-visible @max-[560px]:rounded-none @max-[560px]:border-0 @max-[560px]:bg-transparent">
      <table aria-label={rotulo}>
        <thead>
          <tr>
            {colunas.map((col) => (
              <th key={col.id} scope="col" className={cn(col.numerica && 'text-right', col.className)}>
                {col.titulo}
              </th>
            ))}
            {acoes && (
              <th scope="col" className="w-px text-right">
                <span className="sr-only">Ações</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const ativa = linhaAtiva?.(linha) ?? false
            return (
              <tr
                key={chave(linha)}
                onClick={aoClicarLinha ? () => aoClicarLinha(linha) : undefined}
                data-ativa={ativa || undefined}
                className={cn(aoClicarLinha && 'cursor-pointer', ativa && 'bg-primary-light')}
              >
                {colunas.map((col) => (
                  <td
                    key={col.id}
                    data-l={col.rotuloCartao ?? col.titulo}
                    className={cn(
                      col.principal && 'c-first font-semibold',
                      col.numerica && 'rt-num',
                      col.esconderNoCartao && '@max-[560px]:hidden',
                      col.className,
                    )}
                  >
                    {col.celula(linha)}
                  </td>
                ))}
                {acoes && (
                  <td className="c-acoes whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center justify-end gap-1">{acoes(linha)}</div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}
