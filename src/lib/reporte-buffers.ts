/**
 * Ring buffers de console e de rede para o Reporte de Erros.
 *
 * POR QUE ISSO EXISTE: o JavaScript não tem acesso retroativo ao que já foi
 * impresso no console. Se a captura só começar quando o usuário clica em
 * "Reportar problema", o campo de logs chega **sempre vazio** — o erro já
 * aconteceu e passou. Por isso a instalação acontece no boot do app, antes de
 * qualquer tela renderizar (ver `main.tsx`).
 *
 * PRIVACIDADE: aqui passa conteúdo real do app, então há duas defesas:
 *  1. `redigir()` mascara valores que parecem senha, token, chave ou Authorization.
 *  2. Cada entrada é truncada — log gigante não vira dump de dados do cliente.
 *
 * Os buffers são circulares e pequenos de propósito: o que interessa é o que
 * aconteceu **imediatamente antes** do problema, não a sessão inteira.
 */

const LIMITE_CONSOLE = 120
const LIMITE_REDE = 40
const TAMANHO_MAX_ENTRADA = 800

export interface EntradaConsole {
  nivel: 'log' | 'info' | 'warn' | 'error'
  mensagem: string
  em: string
}

export interface EntradaRede {
  metodo: string
  url: string
  status: number | null
  duracao_ms: number
  erro?: string
  em: string
}

const consoleBuffer: EntradaConsole[] = []
const redeBuffer: EntradaRede[] = []

/**
 * Mascara segredos antes de guardar. Não é perfeito — é a diferença entre um
 * token vazar num ticket e não vazar.
 */
function redigir(texto: string): string {
  return texto
    // Bearer / Authorization
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[oculto]')
    // JWT solto (três blocos base64 separados por ponto)
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, '[jwt oculto]')
    // pares chave=valor / "chave": "valor" com nome sensível
    .replace(
      /("?\b(?:senha|password|pwd|token|secret|api[_-]?key|apikey|authorization|access[_-]?token|refresh[_-]?token)\b"?\s*[:=]\s*"?)([^",;&\s}]+)/gi,
      '$1[oculto]',
    )
}

function truncar(texto: string): string {
  return texto.length > TAMANHO_MAX_ENTRADA
    ? `${texto.slice(0, TAMANHO_MAX_ENTRADA)}… [+${texto.length - TAMANHO_MAX_ENTRADA} caracteres]`
    : texto
}

function serializar(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return `${a.name}: ${a.message}`
      try {
        return JSON.stringify(a)
      } catch {
        // Referência circular, Proxy, etc. — não vale quebrar o log por isso.
        return String(a)
      }
    })
    .join(' ')
}

function empurrar<T>(buffer: T[], item: T, limite: number) {
  buffer.push(item)
  if (buffer.length > limite) buffer.shift()
}

let instalado = false

/**
 * Instala os interceptores. Idempotente — chamar duas vezes não duplica entradas
 * nem encadeia wrappers (o que faria cada log aparecer N vezes).
 */
export function instalarCapturaDeContexto() {
  if (instalado) return
  instalado = true

  // ─── Console ──────────────────────────────────────────────────────────────
  // O console original é preservado e continua sendo chamado: o DevTools do
  // usuário não pode parar de funcionar porque instalamos um interceptor.
  ;(['log', 'info', 'warn', 'error'] as const).forEach((nivel) => {
    const original = console[nivel].bind(console)
    console[nivel] = (...args: unknown[]) => {
      try {
        empurrar(
          consoleBuffer,
          {
            nivel,
            mensagem: truncar(redigir(serializar(args))),
            em: new Date().toISOString(),
          },
          LIMITE_CONSOLE,
        )
      } catch {
        // Falha ao registrar nunca pode impedir o log de verdade de sair.
      }
      original(...args)
    }
  })

  // ─── fetch ────────────────────────────────────────────────────────────────
  // Guarda método, URL, status e duração. NUNCA corpo de requisição ou resposta:
  // é aí que trafegam dados de cliente, e o ticket não é lugar para eles.
  // globalThis e não window: assim o interceptor também vale fora do navegador
  // (teste, worker) e o comportamento testado é o mesmo que roda em produção.
  const fetchOriginal = globalThis.fetch?.bind(globalThis)
  if (fetchOriginal) {
    globalThis.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const inicio = performance.now()
      const metodo = (init?.method ?? (entrada instanceof Request ? entrada.method : 'GET')).toUpperCase()
      const url =
        typeof entrada === 'string'
          ? entrada
          : entrada instanceof URL
            ? entrada.toString()
            : entrada.url

      try {
        const resposta = await fetchOriginal(entrada as RequestInfo, init)
        empurrar(
          redeBuffer,
          {
            metodo,
            url: truncar(redigir(url)),
            status: resposta.status,
            duracao_ms: Math.round(performance.now() - inicio),
            em: new Date().toISOString(),
          },
          LIMITE_REDE,
        )
        return resposta
      } catch (err) {
        empurrar(
          redeBuffer,
          {
            metodo,
            url: truncar(redigir(url)),
            status: null,
            duracao_ms: Math.round(performance.now() - inicio),
            erro: err instanceof Error ? err.message : 'falha de rede',
            em: new Date().toISOString(),
          },
          LIMITE_REDE,
        )
        throw err
      }
    }
  }

  // ─── Erros não tratados ───────────────────────────────────────────────────
  // Entram no buffer de console para aparecerem no ticket mesmo quando o
  // usuário só percebe "a tela ficou branca". Só existem no navegador.
  if (typeof window === 'undefined') return

  window.addEventListener('error', (e) => {
    empurrar(
      consoleBuffer,
      {
        nivel: 'error',
        mensagem: truncar(
          redigir(`[erro não tratado] ${e.message} — ${e.filename}:${e.lineno}:${e.colno}`),
        ),
        em: new Date().toISOString(),
      },
      LIMITE_CONSOLE,
    )
  })

  window.addEventListener('unhandledrejection', (e) => {
    const motivo = e.reason instanceof Error ? `${e.reason.name}: ${e.reason.message}` : String(e.reason)
    empurrar(
      consoleBuffer,
      {
        nivel: 'error',
        mensagem: truncar(redigir(`[promise rejeitada] ${motivo}`)),
        em: new Date().toISOString(),
      },
      LIMITE_CONSOLE,
    )
  })
}

/** Cópia do buffer de console — o mais recente por último. */
export function lerBufferConsole(): EntradaConsole[] {
  return [...consoleBuffer]
}

/** Cópia do buffer de rede — o mais recente por último. */
export function lerBufferRede(): EntradaRede[] {
  return [...redeBuffer]
}
