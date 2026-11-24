import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LIMITE_CORPO, MIN_PALAVRAS_POR_VARIAVEL, MODELOS_OFICIAIS, corpoCriacaoZernio, ehTipoModelo, modeloPorTipo,
  normalizarStatus, numerosDasVariaveis, palavrasFixas, previaModelo, problemasDoModelo, quantidadeVariaveis,
  traduzirMotivoRecusa, conferirTexto, deveGravarNome, respostaDoPedido, type ModeloOficial,
  dataSaoPaulo, valorVariavelValido, variaveisDeTeste,
} from './wa-modelos-oficiais.ts'
import { converterMensagem, paraTemplateOficial, variaveisDoModelo } from './wa-mensagem.ts'
import { MODELO_RELATORIO_OFICIAL, montarTemplateRelatorio } from './wa-relatorio.ts'
import { MODELO_PRIVADO } from '../wa-auto-resumo-semanal/regras.ts'

const relatorio = modeloPorTipo('relatorio') as ModeloOficial
const resumo = modeloPorTipo('resumo') as ModeloOficial
const link = modeloPorTipo('link') as ModeloOficial

describe('catálogo de modelos oficiais — regras da Meta', () => {
  it('tem os 3 modelos, com nomes únicos e versão no fim', () => {
    expect(MODELOS_OFICIAIS.map((m) => m.tipo)).toEqual(['relatorio', 'resumo', 'link'])
    expect(MODELOS_OFICIAIS.map((m) => m.nome)).toEqual([
      'omnx_aviso_diario_v2', 'omnx_resumo_semanal_cliente_v1', 'omnx_link_reuniao_v1',
    ])
    expect(MODELOS_OFICIAIS.map((m) => m.coluna)).toEqual(['template_relatorio', 'template_resumo', 'template_link'])
    for (const m of MODELOS_OFICIAIS) expect(m.nome).toMatch(/^[a-z][a-z0-9_]*_v\d+$/)
  })

  for (const m of MODELOS_OFICIAIS) {
    describe(m.nome, () => {
      it('passa em todas as checagens (problemasDoModelo vazio)', () => {
        expect(problemasDoModelo(m)).toEqual([])
      })
      it(`corpo e prévia com exemplos cabem em ${LIMITE_CORPO} caracteres`, () => {
        expect(m.corpo.length).toBeLessThanOrEqual(LIMITE_CORPO)
        expect(previaModelo(m).length).toBeLessThanOrEqual(LIMITE_CORPO)
      })
      it('não começa nem termina com variável', () => {
        expect(m.corpo.trim()).not.toMatch(/^\{\{/)
        expect(m.corpo.trim().replace(/[\s.,;:!?…—–-]+$/, '')).not.toMatch(/\}\}$/)
      })
      it('variáveis em sequência, sem pular, e um exemplo para cada', () => {
        const distintos = [...new Set(numerosDasVariaveis(m.corpo))]
        expect(distintos).toEqual(distintos.map((_, i) => i + 1))
        expect(m.exemplos).toHaveLength(quantidadeVariaveis(m.corpo))
        expect(m.ordem).toHaveLength(quantidadeVariaveis(m.corpo))
        for (const e of m.exemplos) expect(e).not.toMatch(/[\r\n\t]| {4,}/)
      })
      it(`pelo menos ${MIN_PALAVRAS_POR_VARIAVEL} palavras fixas por variável`, () => {
        expect(palavrasFixas(m.corpo)).toBeGreaterThanOrEqual(quantidadeVariaveis(m.corpo) * MIN_PALAVRAS_POR_VARIAVEL)
      })
      it('UTILITY, pt_BR, POSITIONAL e prazo de entrega válido', () => {
        expect(m.categoria).toBe('UTILITY')
        expect(m.idioma).toBe('pt_BR')
        expect(m.formato).toBe('POSITIONAL')
        expect(m.ttlSegundos).toBeGreaterThanOrEqual(30)
        expect(m.ttlSegundos).toBeLessThanOrEqual(43_200)
      })
    })
  }
})

describe('catálogo bate com o que o código envia', () => {
  it('aviso diário: texto == paraTemplateOficial(MODELO_RELATORIO_OFICIAL).modeloNumerado', () => {
    const t = paraTemplateOficial(MODELO_RELATORIO_OFICIAL, { gestor: 'a', data: 'b', alertas: 'c' })
    expect(relatorio.corpo).toBe(t.modeloNumerado)
    expect([...relatorio.ordem]).toEqual(t.ordem)
  })

  it('aviso diário: pior caso preenchido cabe em 1024', () => {
    const nome = 'N'.repeat(60)
    const muitos = Array.from({ length: 200 }, (_, i) => ({ cliente: `${nome}${i}`, detalhe: 'esperando há 12h' }))
    const reunioes = Array.from({ length: 40 }, (_, i) => ({ hora: '10:00', cliente: `${nome}${i}` }))
    const o = montarTemplateRelatorio(nome, {
      data: '26/10/2026',
      alertas: { sem_resposta: muitos, sentimento_negativo: muitos, pendencia: muitos, queda_volume: muitos },
      reunioes,
    })
    expect(o.variaveis).toHaveLength(3)
    expect(o.textoPrevia).not.toMatch(/reuni|agenda|10:00/i)
    expect(previaModelo(relatorio, o.variaveis).length).toBeLessThanOrEqual(LIMITE_CORPO)
  })

  it('resumo semanal ao cliente: mesma ordem de variáveis que wa-auto-resumo-semanal envia', () => {
    const valores = { cliente: 'Padaria', periodo: '19/10 a 26/10', temas: 'a; b', proximos: 'c' }
    const msg = converterMensagem('zernio', MODELO_PRIVADO, valores)
    expect(msg.tipo).toBe('template')
    if (msg.tipo !== 'template') return
    expect(msg.ordem).toEqual([...resumo.ordem])
    expect(msg.ordem[0]).toBe('cliente') // o nome do cliente é sempre o {{1}}
    expect(previaModelo(resumo, msg.variaveis)).toContain('Olá, Padaria!')
  })

  it('resumo semanal: pior caso (nome 60, 3 temas e 3 próximos de 91) cabe em 1024', () => {
    const item = 'x'.repeat(90) + '…'
    const lista = [item, item, item].join('; ')
    const valores = ['C'.repeat(60), '19/10 a 26/10', lista, lista]
    expect(previaModelo(resumo, valores).length).toBeLessThanOrEqual(LIMITE_CORPO)
  })

  it('link da reunião: mesmas variáveis (e na mesma ordem) do modelo de texto de wa-auto-agendar', () => {
    const fonte = readFileSync('supabase/functions/wa-auto-agendar/index.ts', 'utf8')
    const m = /const MODELO_LINK = '([^']*)'/.exec(fonte)
    expect(m).not.toBeNull()
    const texto = (m?.[1] ?? '').replace(/\\n/g, '\n')
    expect(variaveisDoModelo(texto)).toEqual([...link.ordem])
  })

  it('link da reunião: pior caso (nome 80, link 500) cabe em 1024', () => {
    const valores = ['C'.repeat(80), '28/10/2026', '14:30', `https://${'a'.repeat(492)}`]
    expect(previaModelo(link, valores).length).toBeLessThanOrEqual(LIMITE_CORPO)
  })
})

describe('problemasDoModelo — pega o que a Meta recusa', () => {
  const base: ModeloOficial = { ...link }
  const com = (corpo: string, exemplos: string[], ordem = exemplos.map((_, i) => `v${i}`)) =>
    problemasDoModelo({ ...base, corpo, exemplos, ordem })

  it('variável no início', () => {
    expect(com('{{1}}, sua reunião com a nossa equipe está confirmada para amanhã cedo.', ['Ana']).join(' '))
      .toMatch(/começar com variável/)
  })
  it('variável no fim (mesmo com ponto final)', () => {
    expect(com('Olá! Sua reunião com a nossa equipe está confirmada, entre pelo link {{1}}.', ['https://x.com/a']).join(' '))
      .toMatch(/terminar com variável/)
  })
  it('variáveis fora de sequência', () => {
    expect(com('Olá, {{1}}! Sua reunião com a nossa equipe será em {{3}}, até lá e obrigado.', ['Ana', 'b']).join(' '))
      .toMatch(/sequência/)
  })
  it('pouco texto para muitas variáveis', () => {
    expect(com('Oi {{1}} e {{2}} e {{3}} fim.', ['a', 'b', 'c']).join(' ')).toMatch(/Pouco texto/)
  })
  it('variáveis coladas', () => {
    expect(com('Olá, sua reunião com a equipe é {{1}}{{2}} e depois a gente conversa mais.', ['a', 'b']).join(' '))
      .toMatch(/coladas/)
  })
  it('exemplo faltando ou com quebra de linha', () => {
    expect(com('Olá, {{1}}! Sua reunião com a nossa equipe está confirmada para amanhã.', []).join(' ')).toMatch(/exemplos/)
    expect(com('Olá, {{1}}! Sua reunião com a nossa equipe está confirmada para amanhã.', ['a\nb']).join(' '))
      .toMatch(/quebra de linha/)
  })
  it('texto acima de 1024', () => {
    expect(com(`Olá, {{1}}! ${'palavra '.repeat(200)}fim.`, ['Ana']).join(' ')).toMatch(/1024/)
  })
  it('placeholder com nome (não numérico) e chave solta', () => {
    expect(com('Olá, {{nome}}! Sua reunião com a nossa equipe está confirmada para amanhã.', ['Ana']).join(' '))
      .toMatch(/formato/)
    expect(com('Olá, {{1}}! Sua reunião {com a nossa equipe está confirmada para amanhã.', ['Ana']).join(' '))
      .toMatch(/Chaves/)
  })
  it('link encurtado', () => {
    expect(com('Olá, {{1}}! Sua reunião com a nossa equipe está confirmada para amanhã.', ['bit.ly/abc']).join(' '))
      .toMatch(/encurtado/)
  })
})

describe('corpoCriacaoZernio', () => {
  it('monta o POST com corpo, exemplos e sem accountId (o servidor completa)', () => {
    const c = corpoCriacaoZernio(relatorio)
    expect(c).toEqual({
      name: 'omnx_aviso_diario_v2',
      category: 'UTILITY',
      language: 'pt_BR',
      parameter_format: 'POSITIONAL',
      message_send_ttl_seconds: 10_800,
      components: [{ type: 'body', text: relatorio.corpo, example: { body_text: [[...relatorio.exemplos]] } }],
    })
    expect(c).not.toHaveProperty('accountId')
  })
})

describe('status e motivo', () => {
  it('normaliza status conhecidos e cai em DESCONHECIDO no resto', () => {
    expect(normalizarStatus('approved')).toBe('APPROVED')
    expect(normalizarStatus('PENDING')).toBe('PENDING')
    expect(normalizarStatus('???')).toBe('DESCONHECIDO')
    expect(normalizarStatus(null)).toBe('DESCONHECIDO')
  })
  it('traduz motivos conhecidos, ignora NONE e limpa o desconhecido', () => {
    expect(traduzirMotivoRecusa('PROMOTIONAL')).toMatch(/propaganda/)
    expect(traduzirMotivoRecusa('NONE')).toBeNull()
    expect(traduzirMotivoRecusa(undefined)).toBeNull()
    const longo = traduzirMotivoRecusa(`<b>x</b>\n${'y'.repeat(500)}`) as string
    expect(longo).not.toMatch(/[<>\n]/)
    expect(longo.length).toBeLessThanOrEqual(330)
  })
  it('ehTipoModelo aceita só as chaves do catálogo', () => {
    expect(ehTipoModelo('resumo')).toBe(true)
    expect(ehTipoModelo('qualquer')).toBe(false)
    expect(modeloPorTipo('qualquer')).toBeNull()
  })
})

describe('ligar aos envios — só com texto conferido', () => {
  it('conferirTexto: sem texto NÃO é verificado; espaços não contam', () => {
    expect(conferirTexto(null, resumo.corpo)).toBe('sem_texto')
    expect(conferirTexto(undefined, resumo.corpo)).toBe('sem_texto')
    expect(conferirTexto('', resumo.corpo)).toBe('sem_texto')
    expect(conferirTexto(resumo.corpo.replace(/\n/g, '  \n '), resumo.corpo)).toBe('igual')
    expect(conferirTexto('Olá, {{1}}! Outro texto {{2}}', resumo.corpo)).toBe('diferente')
  })

  it('respostaDoPedido: nome igual; idioma igual quando vier', () => {
    expect(respostaDoPedido(null, resumo.nome, 'pt_BR')).toBe(true)
    expect(respostaDoPedido({ nome: resumo.nome, idioma: 'pt_BR' }, resumo.nome, 'pt_BR')).toBe(true)
    expect(respostaDoPedido({ nome: resumo.nome, idioma: '' }, resumo.nome, 'pt_BR')).toBe(true)
    expect(respostaDoPedido({ nome: 'outro_modelo', idioma: 'pt_BR' }, resumo.nome, 'pt_BR')).toBe(false)
    expect(respostaDoPedido({ nome: resumo.nome, idioma: 'en_US' }, resumo.nome, 'pt_BR')).toBe(false)
  })

  it('deveGravarNome: APROVADO só com texto idêntico (mesmo sobre nome à mão)', () => {
    expect(deveGravarNome('APPROVED', 'igual', null, resumo.nome)).toBe(true)
    expect(deveGravarNome('APPROVED', 'igual', 'nome_a_mao', resumo.nome)).toBe(true)
    expect(deveGravarNome('APPROVED', 'sem_texto', null, resumo.nome)).toBe(false)
    expect(deveGravarNome('APPROVED', 'sem_texto', 'nome_a_mao', resumo.nome)).toBe(false)
    expect(deveGravarNome('APPROVED', 'diferente', null, resumo.nome)).toBe(false)
  })

  it('deveGravarNome: em análise/recurso só em campo vazio; demais status nunca', () => {
    expect(deveGravarNome('PENDING', 'sem_texto', null, resumo.nome)).toBe(true)
    expect(deveGravarNome('IN_APPEAL', 'sem_texto', '', resumo.nome)).toBe(true)
    expect(deveGravarNome('PENDING', 'sem_texto', 'nome_a_mao', resumo.nome)).toBe(false)
    expect(deveGravarNome('PENDING', 'diferente', null, resumo.nome)).toBe(false)
    for (const st of ['REJECTED', 'PAUSED', 'DISABLED', 'PENDING_DELETION', 'NAO_CRIADO', 'DESCONHECIDO'] as const) {
      expect(deveGravarNome(st, 'igual', null, resumo.nome)).toBe(false)
    }
    expect(deveGravarNome('APPROVED', 'igual', resumo.nome, resumo.nome)).toBe(false) // já gravado
  })

  it('exemplo dos próximos passos do resumo não fala de preço, prazo ou pagamento', () => {
    expect(resumo.exemplos[3]).not.toMatch(/or[çc]amento|pagamento|pre[çc]o|R\$|at[ée] (segunda|ter[çc]a|quarta|quinta|sexta)/i)
    expect(resumo.corpo).toBe(
      'Olá, {{1}}! Segue o resumo da semana ({{2}}).\nAssuntos tratados: {{3}}\nPróximos passos: {{4}}\n' +
      'Resumo automático das nossas conversas no WhatsApp. Se algo não estiver certo, é só nos avisar.',
    )
  })
})

describe('variaveisDeTeste — envio de teste pela oficial', () => {
  it('preenche o aviso diário na ordem do catálogo, data no fuso de São Paulo', () => {
    // 26/10/2026 01:30 UTC = 25/10/2026 22:30 em São Paulo
    const v = variaveisDeTeste(new Date('2026-10-26T01:30:00Z'))
    expect(relatorio.ordem).toEqual(['gestor', 'data', 'alertas'])
    expect(v).toEqual(['Teste', '25/10/2026', 'Mensagem de teste, sem alertas reais'])
  })

  it('tem uma variável por {{n}} e todas passam na regra da Meta (uma linha)', () => {
    const v = variaveisDeTeste(new Date('2026-03-05T15:00:00Z'))
    expect(v).toHaveLength(quantidadeVariaveis(relatorio.corpo))
    for (const x of v) expect(valorVariavelValido(x)).toBe(true)
    expect(previaModelo(relatorio, v)).not.toMatch(/\{\{/)
  })

  it('dataSaoPaulo usa dd/mm/aaaa com zeros', () => {
    expect(dataSaoPaulo(new Date('2026-03-05T15:00:00Z'))).toBe('05/03/2026')
  })
})
