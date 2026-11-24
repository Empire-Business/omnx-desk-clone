interface RpcUso { rpc(nome: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }> }
export type ReservaUsoIa = { modo: 'reservado'; id: string; custoReserva: number }
  | { modo: 'legado' | 'bloqueado' | 'erro' }

/** Mesma tentativa mantém UUID em qualquer retry; reserva atômica antecede IA.
 * Estimativa usa os preços/limites configurados existentes, não preço garantido.
 */
export async function reservarUsoIa(admin: RpcUso, entrada: {
  id: string; tenant: string; cliente: string; dia: string; limite: number; teto: number; reserva: number
}): Promise<ReservaUsoIa> {
  const args = { p_id: entrada.id, p_tenant: entrada.tenant, p_cliente: entrada.cliente, p_dia: entrada.dia,
    p_limite: entrada.limite, p_teto: entrada.teto, p_reserva: entrada.reserva }
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const { data, error } = await admin.rpc('cliente_relacionamento_ia_reservar', args)
      if (error && ['PGRST202', '42883'].includes(error.code ?? '')) return { modo: 'legado' }
      if (error) continue
      if (data === true) return { modo: 'reservado', id: entrada.id, custoReserva: entrada.reserva }
      if (data === false) return { modo: 'bloqueado' }
    } catch { /* confirmar a mesma reserva, nunca criar outra tentativa */ }
  }
  return { modo: 'erro' }
}

export async function confirmarUsoIa(admin: RpcUso, reserva: ReservaUsoIa, custo: number | null): Promise<boolean> {
  // Timeout/custo desconhecido conserva a reserva; não prova custo zero.
  if (reserva.modo !== 'reservado' || custo === null || !Number.isFinite(custo) || custo < 0) return false
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const { data, error } = await admin.rpc('cliente_relacionamento_ia_confirmar', { p_id: reserva.id, p_custo: custo })
      if (!error && data === true) return true
    } catch { /* ajuste idempotente da mesma tentativa */ }
  }
  return false
}
