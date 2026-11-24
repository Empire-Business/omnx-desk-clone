export interface PedidoRelacionamento { dryRun: boolean; tenantId: string | null; clientIds: string[] | null }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A capacidade vem do servidor após autenticar o cron; nunca de um campo do corpo. */
export function lerPedidoRelacionamento(bruto: string, execucaoDirecionadaAutorizada = false): PedidoRelacionamento | { erro: string; status: number } {
  if (bruto.length > 4096) return { erro: 'Pedido grande demais.', status: 413 }
  let body: Record<string, unknown>
  try { body = bruto ? JSON.parse(bruto) : {} } catch { return { erro: 'Pedido inválido.', status: 400 } }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { erro: 'Pedido inválido.', status: 400 }
  let tenantId: string | null = null
  if (body.tenant_id !== undefined) {
    if (typeof body.tenant_id !== 'string' || !UUID.test(body.tenant_id)) return { erro: 'tenant_id inválido.', status: 400 }
    tenantId = body.tenant_id.toLowerCase()
  }
  const dryRun = body.dry_run === true
  let clientIds: string[] | null = null
  if (body.client_ids !== undefined) {
    if (!Array.isArray(body.client_ids) || body.client_ids.length === 0 || body.client_ids.length > 5
      || !body.client_ids.every((x) => typeof x === 'string' && UUID.test(x))) {
      return { erro: 'client_ids: de 1 a 5 ids.', status: 400 }
    }
    clientIds = [...new Set((body.client_ids as string[]).map(id => id.toLowerCase()))]
    if (!dryRun && (!execucaoDirecionadaAutorizada || !tenantId || clientIds.length !== body.client_ids.length)) {
      return { erro: 'Execução direcionada exige operação autenticada, empresa e clientes distintos.', status: 400 }
    }
  }
  return { dryRun, tenantId, clientIds }
}
