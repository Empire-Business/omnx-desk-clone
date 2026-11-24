import { supabase } from '@/lib/supabase'
import { mensagemErro } from './mensagemErro'

/**
 * Observabilidade — registro estruturado de eventos por app (§19 do brief).
 *
 * A pergunta que isto responde é "o que está quebrando, em qual app, desde
 * quando?". Antes disso, a única fonte era o usuário reclamar — e erro que
 * ninguém reclama (porque a pessoa desistiu e fechou a tela) não existia.
 *
 * Três decisões que valem explicação:
 *
 * 1. **Fire-and-forget.** Nenhum log bloqueia ou atrasa a tela, e falha ao
 *    gravar log é engolida. Observabilidade que derruba o app observado é pior
 *    que não ter observabilidade.
 * 2. **Antiflood por evento.** O mesmo evento repetido só é gravado uma vez a
 *    cada 30s. Sem isso, um erro dentro de um render em loop escreveria
 *    milhares de linhas em segundos — e a conta do banco vira o incidente.
 * 3. **Mascaramento antes de sair.** Mensagem e detalhe passam por `redigir()`,
 *    o mesmo do reporte de erro. Log é onde token vaza sem ninguém perceber.
 */

type Nivel = 'erro' | 'aviso' | 'info'

export interface EventoLog {
  /** Slug do app ('chat', 'contratos', 'atendimento') ou 'nucleo'. */
  app?: string
  nivel?: Nivel
  /** Nome curto e ESTÁVEL — é por ele que o painel agrupa. */
  evento: string
  mensagem?: string
  detalhe?: Record<string, unknown>
  duracaoMs?: number
}

const JANELA_ANTIFLOOD_MS = 30_000
const ultimoEnvio = new Map<string, number>()

/** Mesmo mascarador da captura de reportes — segredo não entra em log. */
function redigir(texto: string): string {
  return texto
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[oculto]')
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, '[jwt oculto]')
    .replace(
      /("?\b(?:senha|password|pwd|token|secret|api[_-]?key|apikey|authorization|access[_-]?token|refresh[_-]?token)\b"?\s*[:=]\s*"?)([^",;&\s}]+)/gi,
      '$1[oculto]',
    )
}

function limpar(detalhe: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(redigir(JSON.stringify(detalhe))) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Deduz o app a partir da rota. Evita ter de passar `app` em cada chamada —
 * quem loga um erro genérico não deveria precisar lembrar disso.
 */
export function appDaRota(caminho: string): string {
  // Compara por segmento (não por "começa com"): "/iaxyz" não é a Íris.
  const em = (...prefixos: string[]) => prefixos.some((p) => caminho === p || caminho.startsWith(`${p}/`))
  // Endereços novos e antigos (os antigos ainda aparecem no instante do redirecionamento).
  if (em('/conversas', '/chat')) return 'chat'
  if (em('/contratos')) return 'contratos'
  if (caminho === '/' || em('/tickets', '/atendimento')) return 'atendimento'
  if (em('/clientes/grupos', '/ia', '/automacoes-wa')) return 'automacoes-wa'
  if (em('/cobranca')) return 'cobranca'
  if (em('/portal')) return 'portal'
  return 'nucleo'
}

/** Grava um evento. Nunca lança — falha de log não pode virar erro de tela. */
export function registrarEvento(e: EventoLog): void {
  try {
    const rota = typeof window !== 'undefined' ? window.location.pathname : null
    const chave = `${e.app ?? ''}|${e.evento}|${e.mensagem ?? ''}`
    const agora = Date.now()
    const anterior = ultimoEnvio.get(chave)
    if (anterior && agora - anterior < JANELA_ANTIFLOOD_MS) return
    ultimoEnvio.set(chave, agora)

    void supabase
      .from('app_logs')
      .insert({
        app: e.app ?? (rota ? appDaRota(rota) : 'nucleo'),
        nivel: e.nivel ?? 'erro',
        evento: e.evento,
        mensagem: e.mensagem ? redigir(e.mensagem).slice(0, 500) : null,
        rota,
        detalhe: limpar(e.detalhe ?? {}),
        duracao_ms: e.duracaoMs ?? null,
      } as never)
      .then(undefined, () => {
        /* silêncio proposital — ver decisão 1 no topo */
      })
  } catch {
    /* idem */
  }
}

/**
 * Liga a captura global de erros do navegador.
 *
 * Chamado uma vez no boot. Pega o que escapou de todo try/catch: exceção não
 * tratada e promessa rejeitada sem `.catch` — as duas formas mais comuns de uma
 * tela quebrar em branco sem deixar rastro.
 */
export function instalarObservabilidade(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (ev) => {
    registrarEvento({
      evento: 'erro_nao_tratado',
      mensagem: ev.message,
      detalhe: { arquivo: ev.filename, linha: ev.lineno, coluna: ev.colno },
    })
  })

  window.addEventListener('unhandledrejection', (ev) => {
    const motivo = ev.reason
    registrarEvento({
      evento: 'promessa_rejeitada',
      mensagem: mensagemErro(motivo),
    })
  })
}
