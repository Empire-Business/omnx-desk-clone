import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SaudePage } from './SaudePage'

const state = vi.hoisted(() => ({ failed: false }))
vi.mock('@/hooks/usePermissoes', () => ({ usePermissoes: () => ({ can: () => true, carregando: false }) }))
vi.mock('@/hooks/useSaude', () => ({ useSaude: () => ({
  resumo: { data: [], isLoading: false, isError: state.failed },
  ultimos: { data: [], isLoading: false, isError: state.failed },
}) }))
beforeEach(() => { state.failed = false })

describe('estado de erro do painel de saúde', () => {
  it('zero real continua sendo mostrado como nenhum registro no período', () => {
    expect(renderToStaticMarkup(<StaticRouter location="/saude"><SaudePage /></StaticRouter>)).toContain('Nenhum erro registrado no período')
  })
  it('consulta que falhou não anuncia ausência de erros', () => {
    state.failed = true
    const html = renderToStaticMarkup(<StaticRouter location="/saude"><SaudePage /></StaticRouter>)
    expect(html).toContain('Não foi possível carregar o resumo')
    expect(html).toContain('Não foi possível carregar os últimos erros')
    expect(html).not.toContain('Nenhum erro registrado no período')
  })
})
