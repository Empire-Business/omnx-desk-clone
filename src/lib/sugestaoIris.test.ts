import { describe, expect, it } from 'vitest'
import {
  aguardaConfirmacao, clienteEscreveuDepois, LIMPAR_SUGESTAO_IRIS, lerSugestao, TEXTO_RAZAO_SUGESTAO,
  textoHistoricoSugestao, textoRazaoSugestao, type SugestaoIris,
} from './sugestaoIris'

const sugestao: SugestaoIris = {
  em: '2026-11-07T12:00:00Z', razao: 'so_equipe', motivo: 'A equipe disse que liberou o acesso.', confianca: 0.8, evidencias: ['m1'],
}

describe('lerSugestao', () => {
  it('banco sem as colunas novas: undefined (a tela ignora a função)', () => {
    expect(lerSugestao({})).toBeUndefined()
    expect(lerSugestao(null)).toBeUndefined()
    expect(lerSugestao(undefined)).toBeUndefined()
  })

  it('colunas presentes e vazias: null (sem sugestão)', () => {
    expect(lerSugestao({ wa_sugestao_em: null, wa_sugestao_evidencias: [] })).toBeNull()
  })

  it('converte a certeza que chega como texto e limpa o motivo', () => {
    expect(lerSugestao({
      wa_sugestao_em: '2026-11-07T12:00:00Z', wa_sugestao_razao: 'so_equipe', wa_sugestao_motivo: '  A equipe disse que liberou o acesso. ',
      wa_sugestao_confianca: '0.800', wa_sugestao_evidencias: ['m1'],
    })).toEqual(sugestao)
  })

  it('razão desconhecida vira null e certeza inválida vira null, sem quebrar', () => {
    const lida = lerSugestao({ wa_sugestao_em: '2026-11-07T12:00:00Z', wa_sugestao_razao: 'nova_razao', wa_sugestao_confianca: 'abc' })
    expect(lida).toMatchObject({ razao: null, confianca: null, motivo: null, evidencias: [] })
  })
})

describe('textoRazaoSugestao', () => {
  it.each([
    ['so_equipe', 'Só a equipe disse que resolveu; o cliente ainda não confirmou.'],
    ['generica_ambigua', 'O cliente disse que funcionou, mas há mais de um pedido aberto nesta conversa.'],
    ['vinculo_ambiguo', 'Não ficou claro a qual pedido a confirmação se refere.'],
    ['evidencia_compartilhada', 'A mesma mensagem parece resolver mais de um pedido.'],
    ['pedido_cliente', 'O cliente pediu para encerrar, sem dizer que funcionou.'],
    ['confianca_media', 'A Íris viu sinais de solução, mas não teve certeza.'],
  ])('%s em linguagem simples', (razao, texto) => {
    expect(textoRazaoSugestao(razao)).toBe(texto)
  })

  it('razão ausente ou desconhecida cai no texto genérico', () => {
    expect(textoRazaoSugestao(null)).toBe(TEXTO_RAZAO_SUGESTAO.confianca_media)
    expect(textoRazaoSugestao('outra')).toBe(TEXTO_RAZAO_SUGESTAO.confianca_media)
  })

  it('nenhum texto usa termo técnico', () => {
    for (const texto of Object.values(TEXTO_RAZAO_SUGESTAO)) expect(texto).not.toMatch(/_|confian[cç]a|evid[eê]ncia|v[ií]nculo/i)
  })
})

describe('clienteEscreveuDepois', () => {
  it('avisa só quando o cliente escreveu depois da sugestão', () => {
    expect(clienteEscreveuDepois('2026-11-07T12:00:00Z', '2026-11-07T12:05:00Z')).toBe(true)
    expect(clienteEscreveuDepois('2026-11-07T12:00:00Z', '2026-11-07T11:59:00Z')).toBe(false)
    expect(clienteEscreveuDepois('2026-11-07T12:00:00Z', null)).toBe(false)
    expect(clienteEscreveuDepois(null, '2026-11-07T12:05:00Z')).toBe(false)
    expect(clienteEscreveuDepois('2026-11-07T12:00:00Z', 'data ruim')).toBe(false)
  })
})

describe('filtro "Para confirmar" (aguardaConfirmacao)', () => {
  const tickets = [
    { id: 'a', status: 'aguardando_equipe', wa: { sugestao } },
    { id: 'b', status: 'aguardando_cliente', wa: { sugestao } },
    { id: 'c', status: 'resolvido', wa: { sugestao } },
    { id: 'd', status: 'aguardando_equipe', wa: { sugestao: null } },
    { id: 'e', status: 'aberto', wa: { sugestao: undefined } },
    { id: 'f', status: 'aberto', wa: undefined },
  ]

  it('mostra só os tickets abertos com sugestão', () => {
    expect(tickets.filter(aguardaConfirmacao).map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('Manter aberto', () => {
  it('limpa todas as colunas da sugestão e manda evidências como lista vazia', () => {
    expect(LIMPAR_SUGESTAO_IRIS).toEqual({
      wa_sugestao_em: null, wa_sugestao_razao: null, wa_sugestao_motivo: null, wa_sugestao_confianca: null,
      wa_sugestao_modelo: null, wa_sugestao_versao: null, wa_sugestao_evidencias: [],
    })
  })
})

describe('textoHistoricoSugestao', () => {
  it.each([
    ['sugerida', 'Sugestão da Íris: criada'],
    ['aprovada', 'Sugestão da Íris: aprovada'],
    ['recusada', 'Sugestão da Íris: recusada (o ticket continuou aberto)'],
    ['substituida', 'Sugestão da Íris: trocada por uma mais recente'],
    ['resolvida pela Íris', 'Sugestão da Íris: a Íris resolveu sozinha depois'],
    ['descartada', 'Sugestão da Íris: descartada'],
  ])('%s', (valor, texto) => {
    expect(textoHistoricoSugestao(valor)).toBe(texto)
  })

  it('valor novo aparece como veio; vazio vira "atualizada"', () => {
    expect(textoHistoricoSugestao('outra')).toBe('Sugestão da Íris: outra')
    expect(textoHistoricoSugestao(null)).toBe('Sugestão da Íris: atualizada')
  })
})
