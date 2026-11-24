import type { Pendencia } from './wa-relacionamento.ts'
import type { ResolucaoTicketIa, SugestaoResolucaoIa } from './wa-atendimento-resolucao-ia.ts'

export interface EntradaSincronizacaoTickets {
  p_tenant: string; p_cliente: string; p_pendencias: Pendencia[]; p_resolucoes: string[]
  p_anterior_ate: string; p_analisado_ate: string
  p_resolucoes_ia?: ResolucaoTicketIa[]
}
interface RpcTickets {
  rpc(nome: string, args: EntradaSincronizacaoTickets): PromiseLike<{ data: unknown; error: { code?: string } | null }>
}
export type ResultadoSincronizacaoTickets =
  | { tipo: 'sincronizado'; pendencias: Pendencia[]; resolvidas_ia?: number }
  | { tipo: 'indisponivel' | 'desativado' }
  | { tipo: 'adiar'; codigo: string }

/** Somente ausência conhecida da migration/desativação explícita permite o
 * caminho legado avançar. Falha de rede/permissão/resposta precisa preservar
 * o cursor para replay idempotente da mesma mensagem e do mesmo ticket.
 */
export async function sincronizarTickets(
  admin: RpcTickets, entrada: EntradaSincronizacaoTickets,
): Promise<ResultadoSincronizacaoTickets> {
  try {
    let resposta = await admin.rpc(entrada.p_resolucoes_ia ? 'atendimento_sincronizar_whatsapp_ia' : 'atendimento_sincronizar_whatsapp', entrada)
    if (entrada.p_resolucoes_ia && ['PGRST202', '42883'].includes(resposta.error?.code ?? '')) {
      // Publicação gradual: ponte anterior continua, sem alegar resolução IA.
      const { p_resolucoes_ia: _automaticas, ...legado } = entrada
      resposta = await admin.rpc('atendimento_sincronizar_whatsapp', legado)
    }
    const { data, error } = resposta
    if (error) return ['PGRST202', '42883'].includes(error.code ?? '')
      ? { tipo: 'indisponivel' } : { tipo: 'adiar', codigo: error.code ?? 'falha_rpc' }
    if (!data || typeof data !== 'object') return { tipo: 'adiar', codigo: 'resposta_invalida' }
    const r = data as { pendencias?: unknown; desativado?: unknown; resolvidas_ia?: unknown }
    if (r.desativado === true) return { tipo: 'desativado' }
    if (!Array.isArray(r.pendencias)) return { tipo: 'adiar', codigo: 'resposta_invalida' }
    return { tipo: 'sincronizado', pendencias: r.pendencias as Pendencia[],
      ...(Number.isInteger(r.resolvidas_ia) ? { resolvidas_ia: Number(r.resolvidas_ia) } : {}) }
  } catch {
    return { tipo: 'adiar', codigo: 'falha_transporte' }
  }
}

interface RpcSugestoes {
  rpc(nome: string, args: { p_tenant: string; p_cliente: string; p_sugestoes: SugestaoResolucaoIa[] }):
    PromiseLike<{ data: unknown; error: { code?: string } | null }>
}
export type ResultadoSugestoesTickets = { tipo: 'ok'; total: number } | { tipo: 'indisponivel' } | { tipo: 'falha'; codigo: string }

/** Fila "Para confirmar": grava as sugestões DEPOIS da baixa/ponte (tickets novos
 * já existem). É consultiva: falha não adia a análise nem muda etapa. A RPC
 * revalida tudo no banco (ticket aberto, provas reais, mesma conversa).
 */
export async function registrarSugestoesTickets(
  admin: RpcSugestoes, p_tenant: string, p_cliente: string, sugestoes: readonly SugestaoResolucaoIa[],
): Promise<ResultadoSugestoesTickets> {
  if (!sugestoes.length) return { tipo: 'ok', total: 0 }
  try {
    const { data, error } = await admin.rpc('atendimento_sugerir_resolucao_ia', { p_tenant, p_cliente, p_sugestoes: sugestoes.slice(0, 20) })
    if (error) return ['PGRST202', '42883'].includes(error.code ?? '') ? { tipo: 'indisponivel' } : { tipo: 'falha', codigo: error.code ?? 'falha_rpc' }
    return Number.isInteger(data) ? { tipo: 'ok', total: Number(data) } : { tipo: 'falha', codigo: 'resposta_invalida' }
  } catch {
    return { tipo: 'falha', codigo: 'falha_transporte' }
  }
}
