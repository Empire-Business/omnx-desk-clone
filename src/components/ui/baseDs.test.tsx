import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AbasRolaveis } from './AbasRolaveis'
import { TabelaResponsiva } from './TabelaResponsiva'
import { StatusTicket, StatusBadge } from './StatusBadge'
import { EmptyState } from './EmptyState'

describe('AbasRolaveis', () => {
  const itens = [
    { id: 'a', para: '/contratos', fim: true, rotulo: 'Visão geral' },
    { id: 'b', para: '/contratos/lista', rotulo: 'Contratos', contador: 3 },
    { id: 'c', para: '/contratos/tags', rotulo: 'Etiquetas', separadorAntes: true },
  ]

  it('marca a aba da rota atual com aria-current e usa nav rotulado', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/contratos/lista']}>
        <AbasRolaveis rotulo="Seções de Contratos" itens={itens} />
      </MemoryRouter>,
    )
    expect(html).toContain('<nav')
    expect(html).toContain('aria-label="Seções de Contratos"')
    expect(html).toMatch(/aria-current="page"[^>]*>(?:(?!<\/a>).)*Contratos/)
    expect(html).not.toMatch(/aria-current="page"[^>]*>(?:(?!<\/a>).)*Visão geral/)
    expect(html).toContain('class="count is-primary"')
    expect(html).toContain('aria-hidden="true"') // divisor antes de Etiquetas
  })

  it('respeita o ativo forçado (ex.: Tickets acesa também na ficha)', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/tickets/123']}>
        <AbasRolaveis rotulo="Áreas" itens={[{ id: 't', para: '/tickets', rotulo: 'Tickets', ativo: true }]} />
      </MemoryRouter>,
    )
    expect(html).toContain('aria-current="page"')
  })

  it('vira tablist com aria-selected quando as abas são botões', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AbasRolaveis variante="segmentado" rotulo="Período" itens={[
          { id: 'h', rotulo: 'Hoje', ativo: true, onClick: () => {} },
          { id: 's', rotulo: '7 dias', onClick: () => {} },
        ]} />
      </MemoryRouter>,
    )
    expect(html).toContain('role="tablist"')
    expect(html).toContain('class="fade-x seg"')
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
  })
})

describe('TabelaResponsiva', () => {
  type Linha = { id: string; cliente: string; valor: string }
  const linhas: Linha[] = [{ id: '1', cliente: 'Clínica Sol', valor: 'R$ 2.400,00' }]

  it('rotula cada célula para a forma de cartão e marca a coluna principal', () => {
    const html = renderToStaticMarkup(
      <TabelaResponsiva<Linha>
        rotulo="Contratos"
        linhas={linhas}
        chave={(l) => l.id}
        colunas={[
          { id: 'cliente', titulo: 'Cliente', principal: true, celula: (l) => l.cliente },
          { id: 'valor', titulo: 'Valor', numerica: true, celula: (l) => l.valor },
        ]}
        acoes={() => <button type="button">Abrir</button>}
      />,
    )
    expect(html).toContain('class="rt w-full min-w-0"')
    expect(html).toContain('data-l="Cliente"')
    expect(html).toContain('c-first')
    expect(html).toContain('rt-num')
    expect(html).toContain('Ações')
  })

  it('mostra o estado vazio quando não há linhas', () => {
    const html = renderToStaticMarkup(
      <TabelaResponsiva rotulo="x" linhas={[]} chave={() => ''} colunas={[]} vazio={<EmptyState title="Nada por aqui" />} />,
    )
    expect(html).toContain('Nada por aqui')
    expect(html).not.toContain('<table')
  })
})

describe('Selos de status', () => {
  it('têm marcador de forma + texto, nunca só cor', () => {
    const html = renderToStaticMarkup(<StatusTicket status="aguardando" label="Aguardando cliente" />)
    expect(html).toContain('data-s="aguardando"')
    expect(html).toContain('class="st-g"')
    expect(html).toContain('Aguardando cliente')
  })

  it('mantém os rótulos dos status de entrega', () => {
    expect(renderToStaticMarkup(<StatusBadge status="publicado" />)).toContain('Publicado')
    expect(renderToStaticMarkup(<StatusBadge status="reprovado" />)).toContain('data-s="atrasado"')
  })
})
