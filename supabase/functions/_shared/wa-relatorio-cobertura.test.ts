import { describe, expect, it } from 'vitest'
import {
  type DadosRelatorio, linhaAnalisesPendentes, montarTemplateRelatorio,
  montarTextoRelatorio, pedidoHumanizacaoRelatorioGrupo,
} from './wa-relatorio.ts'

describe('relatório com análise pendente de atualização', () => {
  for (const agruparPorEstrategista of [false, true]) {
    it(`informa cobertura no vazio sem afirmar tranquilidade; agrupamento=${agruparPorEstrategista}`, () => {
      const dados: DadosRelatorio = { data: '28/10/2026', alertas: {}, reunioes: [], analises_pendentes: 2, agruparPorEstrategista }
      const aviso = linhaAnalisesPendentes(dados)!
      const texto = montarTextoRelatorio('Equipe', dados)
      expect(texto).toContain('Nenhum alerta confirmado nas fontes atuais.')
      expect(texto).not.toContain(aviso)
      const pedido = pedidoHumanizacaoRelatorioGrupo(dados, 'manha', () => 0.99)
      expect(pedido.textoBase).not.toContain(aviso)
      expect(pedido.textoBase).not.toMatch(/Tudo tranquilo/)
      expect(pedido.fatos.find((f) => f.marcador === 'ITENS_ALERTAS')?.valor).not.toContain(aviso)
    })

    it(`omite diagnóstico administrativo no template oficial mesmo com muitos alertas; agrupamento=${agruparPorEstrategista}`, () => {
      const dados: DadosRelatorio = {
        data: '28/10/2026', reunioes: [], analises_pendentes: 1, agruparPorEstrategista,
        alertas: { sem_resposta: Array.from({ length: 30 }, (_, i) => ({
          cliente: `Cliente com nome comprido ${i}`, detalhe: 'esperando há 2 dias', estrategista: 'Luis', estrategista_id: 'luis',
        })) },
      }
      const texto = montarTemplateRelatorio('Equipe', dados).textoPrevia
      expect(texto).not.toContain(linhaAnalisesPendentes(dados))
      expect(texto.length).toBeLessThanOrEqual(1024)
      expect(montarTextoRelatorio('Equipe', dados)).toContain('Cliente com nome comprido 0')
    })
  }

  it.each([undefined, 0, -1, NaN, Infinity])('não inventa aviso para contagem inválida %s', (analises_pendentes) => {
    expect(linhaAnalisesPendentes({ analises_pendentes })).toBeNull()
  })
})
