import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resumoContextualCarteiraGt3 } from './iris-gt3-resumo.ts'
import { AJUDA_CARTEIRA_GT3 } from './iris-gt3-politica.ts'
import { TEXTO_BLOQUEADO, TEXTO_FALHA_CONSULTA_GT3, TEXTO_FALHA_IA } from './wa-agente-cerebro.ts'
import type { EscopoAgente } from './wa-agente-escopo.ts'
import { criarSupabaseFalso as criarFalsoBase, comClientesAtendidos } from './teste-supabase-falso.ts'
// Contratos são lidos pela view contrato_clientes_atendidos, que o banco real deriva dos contratos.
const criarSupabaseFalso: typeof criarFalsoBase = (tabelas, rpcs) => criarFalsoBase(comClientesAtendidos(tabelas), rpcs)

const AGORA = new Date('2026-10-27T12:00:00Z')
const TEXTO = 'Bom dia! Cliente Próprio tem contrato não iniciado e precisa de acompanhamento. A satisfação está indeterminada por falta de mensagens suficientes.'
interface CorpoIa { model: string; reasoning: { effort: string }; messages: { role: string; content: string | null }[] }
function ambiente(capacidade = true) {
  const escopo: EscopoAgente = {
    tenantId: 'empresa-ficticia', userId: 'pessoa-ficticia', politica: 'carteira_gt3', modo: 'normal', total: false,
    clientIds: new Set(['meu']), instancias: new Set(['permitida']),
    permissoes: { automacoes: false, alertasCarteiraGt3: capacidade, chat: true, contratos: false, agregadosRestritos: false },
  }
  const f = criarSupabaseFalso({
    clients: [
      { tenant_id: escopo.tenantId, id: 'meu', nome: 'Cliente Próprio', ativo: true },
      { tenant_id: escopo.tenantId, id: 'alheio', nome: 'Cliente Alheio', ativo: true },
    ],
    contratos: [{
      tenant_id: escopo.tenantId, id: 'contrato', cliente_id: 'meu', status: 'Em andamento', status_secundario: 'Não iniciado',
      data_fechamento: '2026-10-01', data_assinatura: '2026-10-01', plano_dias: 90, atualizado_em: '2026-10-01T12:00:00Z',
      valor_total: 987654, valor_parcela: 123456,
    }],
    wa_auto_alertas_ignorados: [], contratos_audit_log: [],
  }, { cliente_timeline: () => [], cliente_canais_resumo: () => [] })
  return {
    f, entrada: { admin: f.client, escopo, nomePessoa: 'Pessoa Fictícia', apiKey: 'chave-exclusivamente-sintetica', agora: AGORA },
  }
}
function ferramenta(nome = 'relatorio_carteira') {
  return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [
    { id: 'consulta-ficticia', type: 'function', function: { name: nome, arguments: '{}' } },
  ] } }] }
}
function resposta(content: string) { return { choices: [{ message: { role: 'assistant', content } }] } }
function iaFalsa(roteiro: unknown[], corpos: CorpoIa[]): typeof fetch {
  let n = 0
  return (async (_url: unknown, init?: { body?: string }) => {
    corpos.push(JSON.parse(String(init?.body)) as CorpoIa)
    if (n >= roteiro.length) throw new Error('IA falsa: chamada não prevista.')
    return new Response(JSON.stringify(roteiro[n++]), { status: 200 })
  }) as typeof fetch
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Rede negada neste teste.') })) })
afterEach(() => { vi.unstubAllGlobals() })

describe('diário contextual GT3 com o mesmo cérebro da conversa', () => {
  it('usa somente a coleta privada e os tipos configurados, sem alterar modelo/esforço do chamador', async () => {
    const { f, entrada } = ambiente()
    const corpos: CorpoIa[] = []
    const r = await resumoContextualCarteiraGt3({
      ...entrada, modelo: 'anthropic/claude-sonnet-5.5', esforco: 'low',
      fetchFn: iaFalsa([ferramenta(), resposta(TEXTO)], corpos),
    }, ['pendencia'])
    expect(r).toEqual({ texto: TEXTO, tem_alertas: true, avaliacao_contextual: true })
    expect(corpos.every((c) => c.model === 'anthropic/claude-sonnet-5.5' && c.reasoning.effort === 'low')).toBe(true)
    const dados = corpos[1].messages.at(-1)?.content ?? ''
    expect(dados).toContain('Cliente Próprio')
    expect(dados).toMatch(/"tipos_consultados"\s*:\s*\[\s*"pendencia"\s*\]/)
    expect(dados).not.toMatch(/Cliente Alheio|987654|123456/)
    expect(f.consultas.every((q) => q.filtros.includes('eq:tenant_id'))).toBe(true)
    expect(f.consultas.some((q) => ['wa_auto_config', 'wa_auto_regras_anomalia', 'cliente_relacionamento', 'wa_auto_satisfacao', 'users', 'meetings'].includes(q.tabela))).toBe(false)
    expect(f.inseridos).toEqual([])
    expect(f.atualizados).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('avaliação solicitada continua entregável mesmo sem itens de alerta', async () => {
    const { entrada, f } = ambiente()
    const corpos: CorpoIa[] = []
    const texto = 'Bom dia! Cliente Próprio está cadastrado. Não há mensagens suficientes para avaliar a satisfação; isso não confirma ausência de risco.'
    const r = await resumoContextualCarteiraGt3({ ...entrada,
      fetchFn: iaFalsa([ferramenta(), resposta(texto)], corpos),
    }, ['sentimento_negativo'])
    expect(r).toEqual({ texto, tem_alertas: true, avaliacao_contextual: true })
    expect(corpos[0].messages.at(-1)?.content).toContain('separando gravidade operacional de humor')
    expect(f.inseridos).toEqual([])
    expect(f.atualizados).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('carteira vazia retorna fato sem IA nem consulta', async () => {
    const { entrada, f } = ambiente()
    const modeloFalso = vi.fn(async () => { throw new Error('Não deve chamar a IA.') })
    const r = await resumoContextualCarteiraGt3({ ...entrada,
      escopo: { ...entrada.escopo, clientIds: new Set() }, fetchFn: modeloFalso,
    }, ['sem_resposta'])
    expect(r).toEqual({ texto: 'Não há clientes na sua carteira autorizada.', tem_alertas: false, avaliacao_contextual: false })
    expect(modeloFalso).not.toHaveBeenCalled()
    expect(f.consultas).toEqual([])
  })

  it('sem capacidade privada nem permissão canônica falha antes de ler dados', async () => {
    const { entrada, f } = ambiente(false)
    await expect(resumoContextualCarteiraGt3(entrada, ['pendencia'])).rejects.toMatchObject({ status: 403, codigo: 'sem_permissao_alertas' })
    expect(f.consultas).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([AJUDA_CARTEIRA_GT3, TEXTO_FALHA_CONSULTA_GT3, TEXTO_FALHA_IA, TEXTO_BLOQUEADO])('resposta de ajuda/falha não vira relatório enviado: %s', async (texto) => {
    const { entrada, f } = ambiente()
    const corpos: CorpoIa[] = []
    await expect(resumoContextualCarteiraGt3({ ...entrada,
      fetchFn: iaFalsa([ferramenta(), resposta(texto)], corpos),
    }, ['pendencia'])).rejects.toMatchObject({ status: 503, codigo: 'resumo_indisponivel' })
    expect(f.inseridos).toEqual([])
    expect(f.atualizados).toEqual([])
  })

  it('falha da IA gera 503 sem texto de relatório falso', async () => {
    const { entrada, f } = ambiente()
    const modeloFalso = (async () => new Response('{}', { status: 503 })) as typeof fetch
    await expect(resumoContextualCarteiraGt3({ ...entrada, fetchFn: modeloFalso }, ['pendencia']))
      .rejects.toMatchObject({ status: 503, codigo: 'resumo_indisponivel' })
    expect(f.consultas).toEqual([])
    expect(f.inseridos).toEqual([])
  })

  it('falha da coleta privada gera 503 em vez de carteira saudável inventada', async () => {
    const { entrada, f } = ambiente()
    const admin = { ...f.client, from: (tabela: string) => {
      if (tabela === 'contratos') throw new Error('Falha sintética de leitura.')
      return f.client.from(tabela)
    } }
    const corpos: CorpoIa[] = []
    await expect(resumoContextualCarteiraGt3({ ...entrada, admin,
      fetchFn: iaFalsa([ferramenta(), resposta('Todos os clientes estão saudáveis.')], corpos),
    }, ['pendencia'])).rejects.toMatchObject({ status: 503, codigo: 'resumo_indisponivel' })
    expect(f.inseridos).toEqual([])
    expect(f.atualizados).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('só listar alertas não comprova relatório contextual da carteira inteira', async () => {
    const { entrada, f } = ambiente()
    const corpos: CorpoIa[] = []
    await expect(resumoContextualCarteiraGt3({ ...entrada,
      fetchFn: iaFalsa([ferramenta('listar_alertas'), resposta(TEXTO)], corpos),
    }, ['pendencia'])).rejects.toMatchObject({ status: 503, codigo: 'resumo_indisponivel' })
    expect(corpos[1].messages.at(-1)?.content).toContain('Cliente Próprio')
    expect(f.inseridos).toEqual([])
    expect(f.atualizados).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('não encaminha perfil, memória ou contexto globais nem aceita texto sem coleta', async () => {
    const { entrada, f } = ambiente()
    const corpos: CorpoIa[] = []
    const comCamposIndevidos = {
      ...entrada, perfil: { personalidade: 'MARCADOR_GLOBAL_PERSONA', contexto: 'MARCADOR_GLOBAL_CONTEXTO' },
      aprendizados: ['MARCADOR_GLOBAL_MEMORIA'], contexto: ['MARCADOR_GLOBAL_AVISO'],
      fetchFn: iaFalsa([resposta('Todos os clientes estão saudáveis.')], corpos),
    }
    await expect(resumoContextualCarteiraGt3(comCamposIndevidos, ['pendencia']))
      .rejects.toMatchObject({ status: 503, codigo: 'resumo_indisponivel' })
    expect(JSON.stringify(corpos)).not.toContain('MARCADOR_GLOBAL_')
    expect(f.consultas).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})
