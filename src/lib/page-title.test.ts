import { describe, expect, it } from 'vitest'
import { resolvePageTitle } from './page-title'

describe('títulos da navegação', () => {
  const casos: Array<[string, string | null]> = [
    ['/', 'Início'],
    ['/tickets', 'Tickets'],
    ['/tickets/quadro', 'Quadro de tickets'],
    ['/tickets/prazos', 'Prazos'],
    ['/tickets/analise', 'Análise das conversas'],
    ['/tickets/configurar', 'Configurar tickets'],
    ['/tickets/dem-123', 'Tickets'],
    ['/contratos/lista', 'Lista de contratos'],
    ['/contratos/onboarding', 'Vendas novas'],
    ['/contratos/contrato-123', 'Contratos'],
    ['/conversas', 'Conversas'],
    ['/conversas/configurar', 'Números e acessos'],
    ['/conversas/quadro', 'Quadro de conversas'],
    ['/ia', 'Íris'],
    ['/ia/tempo-resposta', 'Tempo de resposta'],
    ['/ia/alertas', 'Pontos de atenção'],
    ['/clientes/grupos', 'Grupos e clientes'],
    ['/clientes/cli-1', 'Clientes'],
    ['/ajustes', 'Ajustes'],
    ['/dashboard-legado', 'Painel antigo'],
    ['/rota-inexistente', null],
    ['/__proto__', null],
    ['/constructor', null],
  ]

  it.each(casos)('resolve %s', (pathname, titulo) => {
    expect(resolvePageTitle(pathname)).toBe(titulo)
  })

  it('não usa mais os nomes antigos na aba do navegador', () => {
    for (const p of ['/', '/conversas', '/ia', '/tickets']) {
      expect(resolvePageTitle(p)).not.toMatch(/OMNXChat|Automações WhatsApp|Demandas/)
    }
  })
})
