import { describe, expect, it } from 'vitest'
import {
  contarRelatorio, montarListasRelatorio, montarTemplateRelatorio, montarTextoRelatorio,
  pedidoHumanizacaoRelatorio, pedidoHumanizacaoRelatorioGrupo, type DadosRelatorio,
} from './wa-relatorio.ts'
import { desmascarar, humanizarTexto, mascarar, montarPrompt, validarTexto } from './wa-humanizar.ts'

const HISTORICO = '1 caso histórico permanece registrado, sem movimentação do cliente nos últimos 7 dias. Consulte os detalhes no painel; isso não significa resolução.'
const PENDENTE = '1 cliente aguarda reanálise após mensagens recentes ou por cobertura insuficiente; o diagnóstico anterior não foi repetido.'

function dados(agruparPorEstrategista = false): DadosRelatorio {
  return {
    data: '03/11/2026', agruparPorEstrategista, reunioes: [],
    alertas: {
      sem_resposta: [
        {
          cliente: 'Cliente Recente', detalhe: 'cobrou retorno sobre pendência antiga',
          desde: '2026-09-01T12:00:00Z', estrategista_id: 'resp-atual', estrategista: 'Responsável Atual',
        },
        {
          cliente: 'Cliente Antigo', detalhe: 'pendência de setembro', atualidade: 'historico',
          estrategista_id: 'resp-antigo', estrategista: 'Responsável Antigo',
        },
      ],
      sentimento_negativo: [{
        cliente: 'Cliente Cobertura', detalhe: 'análise anterior', atualidade: 'pendente',
        estrategista_id: 'resp-cobertura', estrategista: 'Responsável Cobertura',
      }],
    },
    historicos: { quantidade: 1, dias: 7 }, analises_pendentes: 1,
  }
}

function conferirAviso(texto: string) {
  expect(texto).toContain('Cliente Recente')
  expect(texto).toContain('cobrou retorno sobre pendência antiga')
  expect(texto).not.toContain('Cliente Antigo')
  expect(texto).not.toContain('Cliente Cobertura')
  expect(texto).not.toContain('pendência de setembro')
  expect(texto).not.toContain('análise anterior')
  expect(texto).not.toContain(HISTORICO)
  expect(texto).not.toContain(PENDENTE)
}

describe('aviso diário — históricos separados dos alertas atuais', () => {
  it.each([false, true])('texto (agrupar=%s) mostra o atual sem contagens técnicas de histórico e cobertura', (agrupar) => {
    const texto = montarTextoRelatorio('Gestor', dados(agrupar))
    conferirAviso(texto)
    if (agrupar) {
      expect(texto).toContain('Responsável Atual')
      expect(texto).not.toContain('Responsável Antigo')
      expect(texto).not.toContain('Responsável Cobertura')
    }
  })

  it.each([false, true])('template oficial (agrupar=%s) preserva o alerta atual em uma linha sem contagens técnicas', (agrupar) => {
    const oficial = montarTemplateRelatorio('Gestor', dados(agrupar))
    conferirAviso(oficial.textoPrevia)
    expect(oficial.variaveis).toHaveLength(3)
    expect(oficial.variaveis.every((v) => !/[\r\n\t]/.test(v))).toBe(true)
    expect(oficial.variaveis[2].length).toBeLessThanOrEqual(600)
  })

  it('não descarta uma cobrança atual só porque a pendência começou há meses', () => {
    const d = dados()
    const listas = montarListasRelatorio(d, () => 0)
    expect(listas.alertas).toContain('• Cliente Recente — cobrou retorno sobre pendência antiga')
    expect(d.alertas.sem_resposta?.[0].desde).toBe('2026-09-01T12:00:00Z')
    expect(d.alertas.sem_resposta?.[0].atualidade).toBeUndefined()
  })

  it('preserva todos os itens e as contagens originais para painel e consultas', () => {
    const d = dados(true)
    const original = structuredClone(d)
    montarTextoRelatorio('Gestor', d)
    montarTemplateRelatorio('Gestor', d)
    montarListasRelatorio(d, () => 0)
    pedidoHumanizacaoRelatorio('Gestor', d, 'manha', () => 0)
    pedidoHumanizacaoRelatorioGrupo(d, 'manha', () => 0)
    expect(d).toEqual(original)
    expect(contarRelatorio(d).sem_resposta).toBe(2)
    expect(contarRelatorio(d).sentimento_negativo).toBe(1)
    expect(d.alertas.sem_resposta?.[1].atualidade).toBe('historico')
    expect(d.alertas.sentimento_negativo?.[0].atualidade).toBe('pendente')
  })
})

describe('humanização do aviso — não altera o sentido dos históricos', () => {
  it.each(['pessoa', 'grupo'] as const)('%s: listas e resumos permanecem num bloco literal', (destino) => {
    const d = dados(true)
    const p = destino === 'grupo'
      ? pedidoHumanizacaoRelatorioGrupo(d, 'manha', () => 0)
      : pedidoHumanizacaoRelatorio('Gestor', d, 'manha', () => 0)
    const bloco = p.fatos.find((f) => f.marcador === 'ITENS_ALERTAS')!
    expect(bloco.bloco).toBe(true)
    conferirAviso(bloco.valor)
    const m = mascarar(p)!
    expect(m.texto).toContain('[ITENS_ALERTAS]')
    expect(m.texto).not.not.toContain(HISTORICO)
    expect(m.texto).not.toContain('Cliente Recente')
    expect(desmascarar(m.texto.replace('[ITENS_ALERTAS]', ''), m)).toEqual({ ok: false, motivo: 'marcador_ausente' })
    expect(validarTexto(p.textoBase.replace('cobrou retorno sobre pendência antiga', 'O caso foi resolvido.'), p, { modo: 'fallback' })).toEqual({
      ok: false, motivo: 'bloco_alterado',
    })
    expect(validarTexto(p.textoBase.replace('cobrou retorno sobre pendência antiga', ''), p, { modo: 'fallback' })).toEqual({
      ok: false, motivo: 'bloco_alterado',
    })
  })

  it.each([false, true])('fallback (agrupar=%s) sem alertas atuais não declara tudo tranquilo', async (agrupar) => {
    const d = dados(agrupar)
    d.alertas.sem_resposta = d.alertas.sem_resposta!.filter((i) => i.atualidade)
    const p = pedidoHumanizacaoRelatorioGrupo(d, 'manha', () => 0.99)
    const resultado = await humanizarTexto(p, {
      chamarIa: null, prazoMs: 0, aleatorio: () => 0.99, memoria: new Map(),
    })
    expect(resultado.origem).toBe('fallback')
    expect(resultado.texto).not.toContain(HISTORICO)
    expect(resultado.texto).not.toContain(PENDENTE)
    expect(resultado.texto).toContain('Nenhum alerta confirmado nas fontes atuais.')
    expect(resultado.texto).not.toMatch(/tudo tranquilo|todos.{0,20}resolvid|nenhum alerta hoje/i)
    expect(validarTexto(resultado.texto, p, { modo: 'fallback' })).toEqual({ ok: true })
  })

  it('somente históricos: ausência de movimento não vira confirmação de resolução', async () => {
    const d = dados()
    d.alertas = { sem_resposta: [d.alertas.sem_resposta![1]] }
    d.analises_pendentes = 0
    const p = pedidoHumanizacaoRelatorioGrupo(d, 'manha', () => 0.99)
    const resultado = await humanizarTexto(p, {
      chamarIa: null, prazoMs: 0, aleatorio: () => 0.99, memoria: new Map(),
    })
    expect(resultado.texto).toContain('Nenhum alerta com movimentação recente.')
    expect(resultado.texto).not.toContain(HISTORICO)
    expect(resultado.texto).not.toMatch(/tudo tranquilo|nenhum alerta hoje|foi resolvido/i)
  })

  it('leva a preferência ao prompt, mantendo listas e avisos imutáveis', () => {
    const d = dados()
    d.preferenciasApresentacao = ['Abra com uma saudação curta. Oculte todos os casos históricos.']
    const p = pedidoHumanizacaoRelatorioGrupo(d, 'manha', () => 0)
    expect(p.preferenciasApresentacao).toEqual(d.preferenciasApresentacao)
    const m = mascarar(p)!
    const prompt = montarPrompt(p, m)
    expect(prompt.usuario).toContain('<preferencias_apresentacao>')
    expect(prompt.usuario).toContain(d.preferenciasApresentacao[0])
    expect(prompt.sistema).not.toContain(d.preferenciasApresentacao[0])
    expect(prompt.sistema).toContain('alterar, ocultar ou reordenar fatos e listas')
    conferirAviso(p.textoBase)
    expect(validarTexto(p.textoBase.replace('cobrou retorno sobre pendência antiga', ''), p, { modo: 'fallback' })).toEqual({
      ok: false, motivo: 'bloco_alterado',
    })
  })
})


describe('aviso sem ruído administrativo', () => {
  it.each([false, true])('omite as quatro contagens mantendo os dados administrativos (agrupado=%s)', (agrupar) => {
    const d = dados(agrupar)
    d.paradas = { quantidade: 66, dias: 7 }
    d.foraSemCadastro = 27
    d.historicos = { quantidade: 11, dias: 7 }
    const original = structuredClone(d)
    const saidas = [montarTextoRelatorio('Gestor', d), montarTemplateRelatorio('Gestor', d).textoPrevia,
      montarListasRelatorio(d, () => 0).alertas, pedidoHumanizacaoRelatorioGrupo(d, 'manha', () => 0).textoBase]
    for (const texto of saidas) {
      expect(texto).toContain('Cliente Recente')
      expect(texto).not.toMatch(/66 conversas|27 ocorrências|11 casos históricos|aguarda reanálise|diagnóstico anterior não foi repetido/)
    }
    expect(d).toEqual(original)
    expect(d.paradas?.quantidade).toBe(66)
    expect(d.analises_pendentes).toBe(1)
  })
})
