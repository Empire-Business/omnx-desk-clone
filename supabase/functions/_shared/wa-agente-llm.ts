// Loop de ferramentas do assistente (Claude via OpenRouter, formato chat/completions).
//
//   * modelo: env WA_AGENTE_MODELO, só "anthropic/claude-…" (padrão Claude Opus 5.5);
//   * esforço de raciocínio: env WA_AGENTE_ESFORCO low|medium|high (padrão medium);
//   * SEM temperature (o Claude atual recusa); provider.data_collection 'deny';
//   * tool_choice 'auto' (o Claude atual não aceita forçar ferramenta);
//   * no máximo 6 passos, 40 s por chamada, prazo total 110 s;
//   * as mensagens do assistente voltam INTACTAS no loop (inclusive campos de
//     raciocínio que o provedor devolver) — editar o histórico invalida o raciocínio;
//   * tokens e custo somados (usage.cost do OpenRouter; sem ele, estimativa pela tabela).
//
// PURO quanto a banco: recebe fetch e executor injetados (Vitest: wa-agente-llm.test.ts).

export const MODELO_PADRAO = 'anthropic/claude-opus-5.5'
export const RE_MODELO = /^anthropic\/claude-[a-z0-9.-]{1,40}$/
export const ESFORCOS = ['low', 'medium', 'high'] as const
export type Esforco = typeof ESFORCOS[number]

export const MAX_PASSOS = 6
export const TIMEOUT_CHAMADA_MS = 40_000
export const PRAZO_TOTAL_MS = 110_000
/** Não começa uma chamada com menos tempo que isto. */
const MIN_TEMPO_CHAMADA_MS = 5_000
const MAX_TOKENS_SAIDA = 4_000
/**
 * Se a IA parar por limite de tamanho (finish_reason "length"), pede a continuação
 * até este número de vezes e junta os pedaços: a resposta nunca sai pela metade.
 */
const MAX_CONTINUACOES = 3
const PEDIDO_CONTINUACAO = 'Sua resposta anterior foi interrompida pelo limite de tamanho. Continue exatamente do ponto onde parou, sem repetir nada, sem saudação e sem comentar a interrupção.'
const FOLGA_RACIOCINIO = 6_000

/** US$ por milhão de tokens (entrada, saída, leitura de cache) — só para estimar quando o OpenRouter não devolve o custo. */
const PRECOS: Record<string, { entrada: number; saida: number; cache: number }> = {
  'anthropic/claude-opus-5.5': { entrada: 4, saida: 20, cache: 0.2 },
  'anthropic/claude-sonnet-5.5': { entrada: 2, saida: 10, cache: 0.2 },
}
const PRECO_DESCONHECIDO = { entrada: 5, saida: 25, cache: 0.5 }

export function modeloDaEnv(v: string | null | undefined): string {
  const s = (v ?? '').trim()
  return RE_MODELO.test(s) ? s : MODELO_PADRAO
}

export function esforcoDaEnv(v: string | null | undefined): Esforco {
  const s = (v ?? '').trim().toLowerCase()
  return (ESFORCOS as readonly string[]).includes(s) ? s as Esforco : 'medium'
}

export interface MensagemChat {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
  [extra: string]: unknown
}

export interface Uso { entrada: number; saida: number; cache: number; custoUsd: number }

export type ResultadoLoop = {
  ok: boolean
  /** Texto final do assistente (ok=true). */
  texto: string | null
  motivo?: 'erro_ia' | 'prazo' | 'passos' | 'sem_chave' | 'recusa' | 'incompleta'
  passos: number
  ferramentas: string[]
  uso: Uso
  modelo: string
  duracaoMs: number
}

export interface OpcoesLoop {
  apiKey: string | null | undefined
  sistema: string
  mensagens: MensagemChat[]
  ferramentas: unknown[]
  /** Executa uma ferramenta e devolve o CONTEÚDO (já delimitado) da mensagem 'tool'. */
  executar: (nome: string, argumentos: string) => Promise<string>
  modelo?: string
  esforco?: Esforco
  fetchFn?: typeof fetch
  agora?: () => number
  prazoMs?: number
  maxPassos?: number
  timeoutChamadaMs?: number
  titulo?: string
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** Soma o uso de uma resposta (usage do OpenRouter, formato OpenAI). */
export function usoDaResposta(usage: unknown, modelo: string): Uso {
  const u = (usage && typeof usage === 'object' ? usage : {}) as Record<string, unknown>
  const detalhes = (u.prompt_tokens_details && typeof u.prompt_tokens_details === 'object' ? u.prompt_tokens_details : {}) as Record<string, unknown>
  const entrada = num(u.prompt_tokens)
  const saida = num(u.completion_tokens)
  const cache = num(detalhes.cached_tokens)
  let custo = num(u.cost)
  if (!custo && (entrada || saida)) {
    const p = PRECOS[modelo] ?? PRECO_DESCONHECIDO
    custo = ((entrada - cache) * p.entrada + cache * p.cache + saida * p.saida) / 1_000_000
  }
  return { entrada, saida, cache, custoUsd: custo }
}

function somar(a: Uso, b: Uso): Uso {
  return { entrada: a.entrada + b.entrada, saida: a.saida + b.saida, cache: a.cache + b.cache, custoUsd: a.custoUsd + b.custoUsd }
}

/**
 * Último erro da IA nesta instância (status + início da resposta do OpenRouter,
 * sem segredo — a chave só vai no header). Usado só para diagnóstico no pedido.
 */
export let ultimoErroIa: string | null = null

async function chamar(
  o: OpcoesLoop, modelo: string, esforco: Esforco, mensagens: MensagemChat[], timeoutMs: number,
): Promise<{ msg: MensagemChat; uso: Uso; fim: string | null } | null> {
  const f = o.fetchFn ?? fetch
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(1_000, timeoutMs))
  try {
    const r = await f('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        // trim: a chave salva nos secrets pode ter quebra de linha no fim — header
        // inválido é descartado e o OpenRouter responde 401 'Missing Authentication'.
        Authorization: `Bearer ${(o.apiKey ?? '').trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://omnxdesk.com.br',
        'X-Title': o.titulo ?? 'OMNX Desk Assistente WhatsApp',
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: MAX_TOKENS_SAIDA + FOLGA_RACIOCINIO,
        reasoning: { effort: esforco },
        provider: { data_collection: 'deny' },
        usage: { include: true },
        tools: o.ferramentas,
        tool_choice: 'auto',
        messages: [{ role: 'system', content: o.sistema }, ...mensagens],
      }),
    })
    if (!r.ok) {
      const det = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 240)
      ultimoErroIa = `${r.status} ${det}`
      console.error('wa-agente-llm: IA respondeu', r.status, det)
      return null
    }
    const corpo = await r.json().catch(() => null) as { choices?: { message?: MensagemChat; finish_reason?: string }[]; usage?: unknown } | null
    const msg = corpo?.choices?.[0]?.message
    if (!msg || typeof msg !== 'object') return null
    return { msg: { ...msg, role: 'assistant' }, uso: usoDaResposta(corpo?.usage, modelo), fim: corpo?.choices?.[0]?.finish_reason ?? null }
  } catch (e) {
    ultimoErroIa = `excecao ${(e as Error)?.name ?? ''} ${String((e as Error)?.message ?? '').slice(0, 160)}`
    console.error('wa-agente-llm: falha na IA', (e as Error)?.name)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Roda o loop: chama a IA; se ela pedir ferramentas, executa TODAS as chamadas do
 * passo, devolve os resultados numa sequência de mensagens 'tool' e chama de novo.
 * Termina com o texto final ou com motivo de falha.
 */
export async function rodarLoop(o: OpcoesLoop): Promise<ResultadoLoop> {
  const agora = o.agora ?? Date.now
  const inicio = agora()
  const modelo = modeloDaEnv(o.modelo)
  const esforco = o.esforco ?? 'medium'
  const prazo = o.prazoMs ?? PRAZO_TOTAL_MS
  const maxPassos = o.maxPassos ?? MAX_PASSOS
  const usadas: string[] = []
  let uso: Uso = { entrada: 0, saida: 0, cache: 0, custoUsd: 0 }
  const fim = (r: Omit<ResultadoLoop, 'ferramentas' | 'uso' | 'modelo' | 'duracaoMs'>): ResultadoLoop =>
    ({ ...r, ferramentas: usadas, uso, modelo, duracaoMs: agora() - inicio })

  ultimoErroIa = null
  if (!o.apiKey || !o.apiKey.trim()) return fim({ ok: false, texto: null, motivo: 'sem_chave', passos: 0 })
  const historico: MensagemChat[] = [...o.mensagens]

  for (let passo = 1; passo <= maxPassos; passo++) {
    const restante = prazo - (agora() - inicio)
    if (restante < MIN_TEMPO_CHAMADA_MS) return fim({ ok: false, texto: null, motivo: 'prazo', passos: passo - 1 })
    const r = await chamar(o, modelo, esforco, historico, Math.min(o.timeoutChamadaMs ?? TIMEOUT_CHAMADA_MS, restante))
    if (!r) return fim({ ok: false, texto: null, motivo: 'erro_ia', passos: passo })
    uso = somar(uso, r.uso)
    // Mensagem do assistente volta INTACTA (raciocínio incluído).
    historico.push(r.msg)
    const chamadas = Array.isArray(r.msg.tool_calls) ? r.msg.tool_calls : []
    if (chamadas.length === 0) {
      if (r.fim === 'refusal' || r.fim === 'content_filter') return fim({ ok: false, texto: null, motivo: 'recusa', passos: passo })
      let texto = typeof r.msg.content === 'string' ? r.msg.content : ''
      let ultimoFim = r.fim
      // Cortada por tamanho: pede a continuação e junta, sem ferramentas novas.
      for (let k = 0; k < MAX_CONTINUACOES && ultimoFim === 'length' && texto.trim(); k++) {
        const resta = prazo - (agora() - inicio)
        if (resta < MIN_TEMPO_CHAMADA_MS) break
        historico.push({ role: 'user', content: PEDIDO_CONTINUACAO })
        const c = await chamar(o, modelo, esforco, historico, Math.min(o.timeoutChamadaMs ?? TIMEOUT_CHAMADA_MS, resta))
        if (!c) break
        uso = somar(uso, c.uso)
        historico.push(c.msg)
        if (c.fim === 'refusal' || c.fim === 'content_filter') break
        const mais = typeof c.msg.content === 'string' ? c.msg.content : ''
        if (!mais.trim()) break
        texto += mais
        ultimoFim = c.fim
      }
      // Não conseguiu terminar: melhor avisar a falha do que mandar meia resposta.
      if (ultimoFim === 'length') return fim({ ok: false, texto: null, motivo: 'incompleta', passos: passo })
      texto = texto.trim()
      return texto ? fim({ ok: true, texto, passos: passo }) : fim({ ok: false, texto: null, motivo: 'erro_ia', passos: passo })
    }
    if (passo === maxPassos) return fim({ ok: false, texto: null, motivo: 'passos', passos: passo })
    for (const c of chamadas.slice(0, 8)) {
      const nome = String(c?.function?.name ?? '')
      usadas.push(nome)
      let conteudo: string
      try {
        conteudo = await o.executar(nome, String(c?.function?.arguments ?? '{}'))
      } catch {
        conteudo = '{"erro":"falha ao executar"}'
      }
      historico.push({ role: 'tool', tool_call_id: String(c?.id ?? ''), content: conteudo })
    }
    // Chamadas além de 8 no mesmo passo: respondidas com erro (toda tool_call precisa de resposta).
    for (const c of chamadas.slice(8)) {
      historico.push({ role: 'tool', tool_call_id: String(c?.id ?? ''), content: '{"erro":"muitas ferramentas de uma vez"}' })
    }
  }
  return fim({ ok: false, texto: null, motivo: 'passos', passos: maxPassos })
}
