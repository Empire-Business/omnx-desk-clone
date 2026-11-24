import { describe, expect, it } from 'vitest'
import { MODELO_PADRAO, esforcoDaEnv, modeloDaEnv, rodarLoop, usoDaResposta, type MensagemChat } from './wa-agente-llm.ts'

interface Chamada { body: Record<string, unknown> }

function fetchFalso(respostas: unknown[], chamadas: Chamada[]): typeof fetch {
  let i = 0
  return (async (_url: unknown, init?: { body?: string }) => {
    chamadas.push({ body: JSON.parse(String(init?.body ?? '{}')) })
    const r = respostas[Math.min(i++, respostas.length - 1)]
    if (r === 'erro') return new Response('x', { status: 500 })
    return new Response(JSON.stringify(r), { status: 200 })
  }) as unknown as typeof fetch
}

const ferramenta = (id: string, nome: string, args = '{}') => ({
  choices: [{
    finish_reason: 'tool_calls',
    message: { role: 'assistant', content: null, reasoning_details: [{ tipo: 'segredo-do-provedor' }], tool_calls: [{ id, type: 'function', function: { name: nome, arguments: args } }] },
  }],
  usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 200 }, cost: 0.01 },
})
const final = (texto: string) => ({
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: texto } }],
  usage: { prompt_tokens: 1500, completion_tokens: 50, cost: 0.02 },
})

describe('env', () => {
  it('modelo só Claude; esforço só low/medium/high', () => {
    expect(modeloDaEnv('anthropic/claude-sonnet-5.5')).toBe('anthropic/claude-sonnet-5.5')
    expect(modeloDaEnv('openai/gpt-x')).toBe(MODELO_PADRAO)
    expect(modeloDaEnv('anthropic/claude-x; rm')).toBe(MODELO_PADRAO)
    expect(modeloDaEnv(undefined)).toBe('anthropic/claude-opus-5.5')
    expect(esforcoDaEnv('HIGH')).toBe('high')
    expect(esforcoDaEnv('max')).toBe('medium')
    expect(esforcoDaEnv(null)).toBe('medium')
  })
})

describe('usoDaResposta', () => {
  it('usa usage.cost; sem ele, estima pela tabela', () => {
    expect(usoDaResposta({ prompt_tokens: 10, completion_tokens: 5, cost: 0.5 }, MODELO_PADRAO).custoUsd).toBe(0.5)
    const est = usoDaResposta({ prompt_tokens: 1_000_000, completion_tokens: 0 }, MODELO_PADRAO)
    expect(est.custoUsd).toBeCloseTo(4)
    expect(usoDaResposta(null, MODELO_PADRAO)).toEqual({ entrada: 0, saida: 0, cache: 0, custoUsd: 0 })
  })
})

describe('rodarLoop', () => {
  it('ferramenta → resposta; corpo sem temperature, com data_collection deny, tool_choice auto e raciocínio', async () => {
    const chamadas: Chamada[] = []
    const executadas: string[] = []
    const r = await rodarLoop({
      apiKey: 'k', sistema: 'SIS', mensagens: [{ role: 'user', content: 'oi' }], ferramentas: [{ type: 'function' }],
      executar: async (n, a) => { executadas.push(`${n}:${a}`); return '<dados_ferramenta>{}</dados_ferramenta>' },
      fetchFn: fetchFalso([ferramenta('t1', 'reunioes', '{"dia":"hoje"}'), final('Você tem 1 reunião.')], chamadas),
    })
    expect(r.ok).toBe(true)
    expect(r.texto).toBe('Você tem 1 reunião.')
    expect(r.passos).toBe(2)
    expect(r.ferramentas).toEqual(['reunioes'])
    expect(executadas).toEqual(['reunioes:{"dia":"hoje"}'])
    expect(r.uso.entrada).toBe(2500)
    expect(r.uso.custoUsd).toBeCloseTo(0.03)
    const b = chamadas[0].body
    expect(b).not.toHaveProperty('temperature')
    expect(b.provider).toEqual({ data_collection: 'deny' })
    expect(b.tool_choice).toBe('auto')
    expect(b.reasoning).toEqual({ effort: 'medium' })
    expect(b.model).toBe(MODELO_PADRAO)
    expect((b.messages as MensagemChat[])[0]).toEqual({ role: 'system', content: 'SIS' })
  })

  it('devolve a mensagem do assistente INTACTA (raciocínio incluído) e a resposta da ferramenta com o id', async () => {
    const chamadas: Chamada[] = []
    await rodarLoop({
      apiKey: 'k', sistema: 'S', mensagens: [{ role: 'user', content: 'oi' }], ferramentas: [],
      executar: async () => 'R',
      fetchFn: fetchFalso([ferramenta('t1', 'ajuda'), final('ok')], chamadas),
    })
    const segunda = chamadas[1].body.messages as MensagemChat[]
    const assistente = segunda.find((m) => m.role === 'assistant') as MensagemChat
    expect(assistente.reasoning_details).toEqual([{ tipo: 'segredo-do-provedor' }])
    expect(assistente.tool_calls?.[0].id).toBe('t1')
    expect(segunda.at(-1)).toEqual({ role: 'tool', tool_call_id: 't1', content: 'R' })
  })

  it('máximo de 6 passos', async () => {
    const r = await rodarLoop({
      apiKey: 'k', sistema: 'S', mensagens: [], ferramentas: [], executar: async () => 'R',
      fetchFn: fetchFalso([ferramenta('t', 'ajuda')], []),
    })
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe('passos')
    expect(r.passos).toBe(6)
  })

  it('prazo total: não começa chamada sem tempo', async () => {
    let t = 0
    const r = await rodarLoop({
      apiKey: 'k', sistema: 'S', mensagens: [], ferramentas: [], executar: async () => { t += 200_000; return 'R' },
      fetchFn: fetchFalso([ferramenta('t', 'ajuda'), final('x')], []), agora: () => t,
    })
    expect(r.motivo).toBe('prazo')
  })

  it('erro HTTP, sem chave e resposta vazia', async () => {
    expect((await rodarLoop({ apiKey: 'k', sistema: 'S', mensagens: [], ferramentas: [], executar: async () => '', fetchFn: fetchFalso(['erro'], []) })).motivo).toBe('erro_ia')
    expect((await rodarLoop({ apiKey: '', sistema: 'S', mensagens: [], ferramentas: [], executar: async () => '' })).motivo).toBe('sem_chave')
    expect((await rodarLoop({ apiKey: 'k', sistema: 'S', mensagens: [], ferramentas: [], executar: async () => '', fetchFn: fetchFalso([final('  ')], []) })).ok).toBe(false)
  })

  it('executor que lança vira erro de ferramenta (não derruba o loop)', async () => {
    const chamadas: Chamada[] = []
    const r = await rodarLoop({
      apiKey: 'k', sistema: 'S', mensagens: [], ferramentas: [], executar: async () => { throw new Error('x') },
      fetchFn: fetchFalso([ferramenta('t1', 'ajuda'), final('ok')], chamadas),
    })
    expect(r.ok).toBe(true)
    expect((chamadas[1].body.messages as MensagemChat[]).at(-1)?.content).toContain('erro')
  })
})
