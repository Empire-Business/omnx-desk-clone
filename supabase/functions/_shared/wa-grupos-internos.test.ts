import { describe, expect, it } from 'vitest'
import {
  ERRO_GRUPO, chavesDeClientesAtivos, formasDoGrupo, gruposComNomeDeCliente, gruposDeCliente, gruposInternos,
  motivoGrupoBloqueado, nomeGrupoSeguro, type ContatoDeGrupo,
} from './wa-grupos-internos.ts'
import {
  montarListasRelatorio, montarTextoRelatorioGrupo, pedidoHumanizacaoRelatorio, pedidoHumanizacaoRelatorioGrupo,
  type DadosRelatorio,
} from './wa-relatorio.ts'
import { mascarar, montarFallback, montarPrompt, validarTexto } from './wa-humanizar.ts'
import { chaveIdempotencia, destinoUazapi } from './wa-mensagem.ts'

const G1 = '120363012345678901@g.us'
const G2 = '120363098765432109@g.us'
const G3 = '120363011111111111@g.us'

const c = (id: string, numero: string, nome: string | null, client_id: string | null = null): ContatoDeGrupo =>
  ({ id, numero_whatsapp: numero, nome, client_id })

describe('gruposInternos (nunca grupo de cliente)', () => {
  it('lista só grupos sem vínculo, por nome, aceitando o número com ou sem @g.us', () => {
    const candidatos = [
      c('a', '120363012345678901', 'Equipe Entrega'),
      c('b', G2, 'Comercial interno'),
      c('x', G3, 'Grupo do Cliente X', 'cli-1'),
    ]
    expect(gruposInternos(candidatos, [], new Set())).toEqual([
      { grupo_jid: G2, nome: 'Comercial interno' },
      { grupo_jid: G1, nome: 'Equipe Entrega' },
    ])
  })

  it('vínculo por chat_contact_clients tira o grupo', () => {
    const candidatos = [c('a', G1, 'Equipe'), c('b', G2, 'Projeto')]
    expect(gruposInternos(candidatos, [], new Set(['b'])).map((g) => g.grupo_jid)).toEqual([G1])
  })

  it('vínculo feito em OUTRO contato do mesmo grupo (outro número) também tira', () => {
    const candidatos = [c('a', G1, 'Equipe')]
    const mesmoGrupo = [c('a', G1, 'Equipe'), c('z', '120363012345678901', 'Equipe (outro número)', 'cli-9')]
    expect(gruposInternos(candidatos, mesmoGrupo, new Set())).toEqual([])
    const vinc = [c('y', G1, null)]
    expect(gruposInternos(candidatos, vinc, new Set(['y']))).toEqual([])
  })

  it('ignora o que não é JID real de grupo (telefone com @g.us, privado, lixo)', () => {
    const candidatos = [
      c('a', '5511999998888@g.us', 'Telefone disfarçado'),
      c('b', '5511999998888', 'Pessoa'),
      c('d', '5511999998888@s.whatsapp.net', 'Privado'),
      c('e', 'abc', 'Lixo'),
    ]
    expect(gruposInternos(candidatos, [], new Set())).toEqual([])
  })

  it('duplicados viram um só e o nome vazio cai em "Grupo sem nome"', () => {
    const r = gruposInternos([c('a', G1, null), c('b', G1, '  Equipe  ')], [], new Set())
    expect(r).toEqual([{ grupo_jid: G1, nome: 'Equipe' }])
    expect(gruposInternos([c('a', G1, '   ')], [], new Set())).toEqual([{ grupo_jid: G1, nome: 'Grupo sem nome' }])
  })

  it('nome do grupo: uma linha, sem invisíveis, até 120', () => {
    expect(nomeGrupoSeguro('Equipe\n‮Interna​')).toBe('Equipe Interna')
    expect(nomeGrupoSeguro('x'.repeat(200))).toHaveLength(120)
    expect(nomeGrupoSeguro('   ')).toBeNull()
  })

  it('formasDoGrupo: as duas formas guardadas pelo Chat; inválido → vazio', () => {
    expect(formasDoGrupo('120363012345678901@G.US')).toEqual(['120363012345678901', G1])
    expect(formasDoGrupo('5511999998888@g.us')).toEqual([])
  })
})

describe('grupo com nome de cliente ativo (sem vínculo no Chat)', () => {
  const chaves = chavesDeClientesAtivos([
    { nome: 'Padaria São João', ativo: true },
    { nome: 'Cliente Antigo', ativo: false },
    { nome: null, ativo: true },
  ])
  it('só clientes ativos entram nas chaves', () => {
    expect([...chaves]).toEqual(['padaria sao joao'])
  })
  it('tira o grupo com o mesmo nome (sem acento/caixa/espaços extras); inativo não tira', () => {
    const candidatos = [c('a', G1, '  PADARIA   sao joão '), c('b', G2, 'Cliente Antigo'), c('d', G3, 'Equipe')]
    expect(gruposInternos(candidatos, [], new Set(), chaves).map((g) => g.grupo_jid)).toEqual([G2, G3])
    expect(gruposComNomeDeCliente(candidatos, chaves)).toEqual(new Set([G1]))
    // Nome de cliente em OUTRO contato do mesmo grupo também tira.
    expect(gruposInternos([c('d', G3, 'Equipe')], [c('z', G3, 'Padaria Sao Joao')], new Set(), chaves)).toEqual([])
  })
  it('no envio vira o motivo grupo_nome_de_cliente', () => {
    expect(motivoGrupoBloqueado(G1, new Set([G1]), new Set(), new Set([G1]))).toBe('grupo_nome_de_cliente')
    expect(motivoGrupoBloqueado(G1, new Set([G1]), new Set(), new Set())).toBeNull()
  })
})

describe('motivoGrupoBloqueado (conferência no envio)', () => {
  const permitidos = new Set([G1])
  const deCliente = gruposDeCliente([c('x', G2, 'Cliente', 'cli-1')], new Set())
  it('libera só grupo interno do número que envia', () => {
    expect(motivoGrupoBloqueado(G1, permitidos, deCliente)).toBeNull()
    expect(motivoGrupoBloqueado(G2, permitidos, deCliente)).toBe('grupo_de_cliente')
    expect(motivoGrupoBloqueado(G3, permitidos, deCliente)).toBe('grupo_fora_da_instancia')
    expect(motivoGrupoBloqueado('5511999998888@g.us', permitidos, deCliente)).toBe('grupo_invalido')
    expect(motivoGrupoBloqueado(null, permitidos, deCliente)).toBe('grupo_invalido')
  })
  it('todo motivo tem mensagem em pt-BR para o histórico', () => {
    for (const k of ['grupo_invalido', 'grupo_de_cliente', 'grupo_nome_de_cliente', 'grupo_fora_da_instancia', 'oficial_sem_grupo', 'sem_numero_grupo'] as const) {
      expect(ERRO_GRUPO[k].length).toBeGreaterThan(10)
    }
  })
  it('idempotência por grupo + dia e destino da UAZAPI = chatid do grupo', () => {
    expect(chaveIdempotencia('relatorio_diario', G1, '2026-10-26')).toBe(`relatorio_diario:${G1}:2026-10-26`)
    expect(destinoUazapi(G1)).toBe(G1)
  })
})

// ---------------------------------------------------------------------------
// Mensagem no grupo interno
// ---------------------------------------------------------------------------

/** Gerador com semente (mulberry32): testes repetíveis. */
function semente(n: number): () => number {
  let a = n >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const dados: DadosRelatorio = {
  data: '26/10/2026',
  alertas: {
    sem_resposta: [{ cliente: 'Maria Souza', detalhe: 'esperando há 5h' }],
    pendencia: [{ cliente: 'Loja Azul', detalhe: 'contrato pausado' }],
  },
  reunioes: [{ hora: '14:30', cliente: 'Padaria Sol' }],
  linkPainel: 'https://app.exemplo.com/automacoes-wa/alertas',
}

describe('relatório no grupo interno', () => {
  it('prévia: mesmas listas, saudação para o grupo', () => {
    const t = montarTextoRelatorioGrupo(dados)
    expect(t).toContain('Bom dia, pessoal!')
    for (const n of ['Maria Souza', 'Loja Azul', 'https://app.exemplo.com/automacoes-wa/alertas']) {
      expect(t).toContain(n)
    }
    expect(t).not.toMatch(/reuni|agenda|Padaria Sol|14:30/i)
  })

  it('pedido de humanização: canal grupo, sem marcador de pessoa, mesmas listas do privado', () => {
    const g = pedidoHumanizacaoRelatorioGrupo(dados, 'tarde', semente(3))
    const p = pedidoHumanizacaoRelatorio('Ana', dados, 'tarde', semente(3))
    expect(g.canal).toBe('grupo')
    expect(g.tom).toBe('gestor-interno')
    expect(g.fatos.some((f) => f.marcador === 'GESTOR')).toBe(false)
    expect(g.textoBase).toContain('Boa tarde, pessoal!')
    expect(g.textoBase).not.toContain('Ana')
    // Mesmo sorteio → mesmas listas (o conteúdo é o mesmo para todos os destinos).
    const blocos = (x: typeof g) => x.fatos.filter((f) => f.bloco).map((f) => f.valor)
    expect(blocos(g)).toEqual(blocos(p))
    expect(g.fatos.some((f) => f.marcador === 'ITENS_REUNIOES')).toBe(false)
    expect(g.textoBase).not.toMatch(/reuni|agenda|Padaria Sol|14:30/i)
    expect(g.variantes.saudacoes.every((s) => !s.includes('Ana'))).toBe(true)
  })

  it('prompt diz que é grupo INTERNO (sem cliente) e pede para não citar ninguém', () => {
    const g = pedidoHumanizacaoRelatorioGrupo(dados, 'manha', semente(1))
    const { sistema } = montarPrompt(g, mascarar(g)!)
    expect(sistema).toContain('GRUPO INTERNO')
    expect(sistema).not.toContain('com o cliente: fale com o grupo')
    expect(sistema).toMatch(/sem citar o nome de ningu/)
  })

  it('fallback do grupo: sempre válido, fala com o grupo e mantém listas e link', () => {
    const g = pedidoHumanizacaoRelatorioGrupo(dados, 'noite', semente(9))
    const r = semente(11)
    for (let i = 0; i < 25; i++) {
      const f = montarFallback(g, { aleatorio: r })
      expect(validarTexto(f.texto, g, { modo: 'fallback' })).toEqual({ ok: true })
      expect(f.texto).toMatch(/pessoal|equipe|time/i)
      for (const n of ['Maria Souza', 'Loja Azul', 'https://app.exemplo.com/automacoes-wa/alertas']) {
        expect(f.texto).toContain(n)
      }
      expect(f.texto).not.toMatch(/reuni|agenda|Padaria Sol|14:30/i)
    }
  })

  it('listas sorteadas com a mesma semente são idênticas (moldura é a única diferença)', () => {
    expect(montarListasRelatorio(dados, semente(5))).toEqual(montarListasRelatorio(dados, semente(5)))
    expect(montarListasRelatorio(dados, semente(5)).reunioes).toBe('')
  })
})
