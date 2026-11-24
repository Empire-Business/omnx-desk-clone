// A IA sugere pedidos; identidade/origem e baixa são decisões do servidor.
import type { LinhaTimeline } from './cliente-timeline.ts'
import { MAX_JSON_PENDENCIAS, type Pendencia } from './wa-relacionamento.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TEXTO = new Set(['texto', 'text', 'chat', ''])

export function referenciasTickets(linhas: readonly LinhaTimeline[]): LinhaTimeline[] {
  return linhas.map((l, i) => ({ ...l,
    conteudo: l.conteudo ? `[M${i + 1}] ${l.conteudo}` : l.conteudo,
    midia_texto: l.midia_texto ? `[M${i + 1}] ${l.midia_texto}` : l.midia_texto,
  }))
}

/** Refs que sobreviveram ao formatter/corte; aceita também a fonte opaca de main. */
export function referenciasTicketsVisiveis(transcricao: string): Set<string> {
  return new Set([...transcricao.matchAll(/^(?:\[msg:[0-9a-f-]{36}\] )?\[[^\]\n]+\] \[[GP]\d+\] [^\n]*?: (?:\([^\n]*?\) )?\[(M\d+)\]/gm)].map((m) => m[1]))
}

/** A chave é o UUID da mensagem real, nunca um UUID inventado pelo modelo.
 * Uma mensagem de solicitação cria no máximo um ticket; reprocessar não duplica.
 * Primeira análise estabelece a memória e não importa o histórico como tickets.
 */
export class LimitePendenciasExcedido extends Error {
  constructor() { super('limite_pendencias_apos_vinculo'); this.name = 'LimitePendenciasExcedido' }
}

export function vincularPendencias(
  pendencias: readonly Pendencia[], anteriores: readonly Pendencia[],
  linhas: readonly LinhaTimeline[], novas: readonly LinhaTimeline[], primeira: boolean,
): Pendencia[] {
  const antigas = new Set(anteriores.map((p) => p.ticket_origem).filter(Boolean))
  const novasIds = new Set(novas.filter((l) => l.autor_tipo === 'cliente').map((l) => l.message_id))
  const usadas = new Set<string>()
  const vinculadas = pendencias.map(({ ticket_origem, origem_ref, ...p }) => {
    const ref = /^M([1-9]\d*)$/.exec(origem_ref ?? '')
    const mensagem = ref ? linhas[Number(ref[1]) - 1] : undefined
    const origem = ticket_origem && antigas.has(ticket_origem) ? ticket_origem
      : !primeira && mensagem && novasIds.has(mensagem.message_id) && UUID.test(mensagem.message_id)
        ? mensagem.message_id : undefined
    if (!origem || usadas.has(origem)) return p
    usadas.add(origem)
    return { ...p, ticket_origem: origem }
  })
  // O vínculo acrescenta metadados depois da validação de main. Rejeitar a
  // rodada inteira, preservando todos os pedidos e revisões administrativas.
  // Mesma folga de JSONB usada por lerPendencias; nunca truncar silenciosamente.
  if (JSON.stringify(vinculadas).length + vinculadas.length * 48 > MAX_JSON_PENDENCIAS)
    throw new LimitePendenciasExcedido()
  return vinculadas
}

/** Só mensagem textual completa da equipe: nem eco/IA, quote, pergunta ou mídia.
 * A RPC confere novamente autor, tenant, canal confirmado e cliente no banco.
 */
export function mensagensResolucao(novas: readonly LinhaTimeline[]): string[] {
  return novas.filter((l) => l.autor_tipo === 'equipe'
    && TEXTO.has((l.tipo ?? '').toLowerCase()) && UUID.test(l.message_id)
    && /^resolvido\s+DEM-\d{5,}[.!]?$/i.test((l.conteudo ?? '').trim()))
    .map((l) => l.message_id)
}
