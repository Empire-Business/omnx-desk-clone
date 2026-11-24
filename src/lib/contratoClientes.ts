import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

export interface ClienteContrato { id: string; nome: string; principal: boolean }
export interface ContratoComClientes { id: string; cliente_id: string | null; cliente_nome: string; clientes?: ClienteContrato[] }

/** Mantém uma linha financeira por contrato, mesmo com vários atendidos. */
export function nomesClientesContrato(contrato: ContratoComClientes): string {
  return contrato.clientes?.length ? contrato.clientes.map(c => c.nome).join(' · ') : contrato.cliente_nome
}

export async function carregarClientesContratos<T extends ContratoComClientes>(banco: SupabaseClient<Database>, contratos: T[]): Promise<(T & { clientes: ClienteContrato[] })[]> {
  if (!contratos.length) return []
  const { data: vinculos, error } = await banco.from('contrato_clientes').select('contrato_id, cliente_id').in('contrato_id', contratos.map(c => c.id))
  if (error) throw error
  const ids = [...new Set([...contratos.flatMap(c => c.cliente_id ? [c.cliente_id] : []), ...(vinculos ?? []).map(v => v.cliente_id)])]
  const resultado = ids.length ? await banco.from('clients').select('id,nome').in('id', ids) : { data: [], error: null }
  if (resultado.error) throw resultado.error
  const nomes = new Map(resultado.data?.map(c => [c.id, c.nome]))
  return contratos.map(c => ({ ...c, clientes: [
    ...(c.cliente_id ? [{ id: c.cliente_id, nome: nomes.get(c.cliente_id) ?? c.cliente_nome, principal: true }] : []),
    ...(vinculos ?? []).filter(v => v.contrato_id === c.id && v.cliente_id !== c.cliente_id).map(v => ({ id: v.cliente_id, nome: nomes.get(v.cliente_id) ?? 'Cliente associado', principal: false })),
  ] }))
}

export async function definirClientesContrato(banco: SupabaseClient<Database>, input: {
  contratoId: string; actorId: string; principalId: string; ids: string[]; esperados: string[]; motivo: string
}) {
  if (!input.ids.includes(input.principalId) || new Set(input.ids).size !== input.ids.length) throw new Error('Preserve o cliente principal e selecione cada cliente apenas uma vez.')
  if (input.motivo.trim().length < 8 || input.motivo.trim().length > 2000) throw new Error('Informe o motivo em 8 a 2000 caracteres.')
  const sessao = await banco.auth.getSession()
  if (sessao.error || sessao.data.session?.user.id !== input.actorId) throw new Error('A sessão mudou. Reabra o contrato.')
  const { data, error } = await banco.rpc('definir_clientes_contrato', {
    p_contrato_id: input.contratoId, p_actor_esperado: input.actorId, p_cliente_ids: input.ids,
    p_cliente_ids_esperados: input.esperados, p_cliente_principal_esperado: input.principalId, p_motivo: input.motivo.trim(),
  })
  if (error) throw new Error(error.code === '40001' ? 'Os vínculos mudaram ou incluem clientes fora do seu acesso. Reabra a ficha ou peça ao gestor responsável para revisar.' : 'Não foi possível salvar os clientes deste contrato.')
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.id !== input.contratoId || data.cliente_id !== input.principalId || !Array.isArray(data.cliente_ids) || data.cliente_ids.length !== input.ids.length || !input.ids.every(id => Array.isArray(data.cliente_ids) && data.cliente_ids.includes(id))) throw new Error('Resposta não confirmada. Reabra a ficha para conferir o resultado.')
  const atual = await banco.auth.getSession()
  if (atual.error || atual.data.session?.user.id !== input.actorId) throw new Error('A sessão mudou. Reabra a ficha para conferir o resultado.')
}
