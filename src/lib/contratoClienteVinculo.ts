import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

type Banco = SupabaseClient<Database>

export interface ClienteParaVinculoContrato {
  id: string
  nome: string
  empresa: string | null
  ativo: boolean
}

/** Atualiza só a FK confirmada, preservando os demais campos do cache/rascunho. */
export function comClienteVinculado<T extends object>(contrato: T, clienteId: string): T & { cliente_id: string } {
  return { ...contrato, cliente_id: clienteId }
}

/** O formulário geral não é um caminho de edição do vínculo do contrato existente. */
export function patchContratoSemVinculo<T extends { cliente_id?: string | null }>(patch: T): Omit<T, 'cliente_id'> {
  const limpo = { ...patch }
  delete limpo.cliente_id
  return limpo
}

async function tenantAutorizado(banco: Banco): Promise<string> {
  const { data: auth, error: erroAuth } = await banco.auth.getUser()
  if (erroAuth || !auth.user) throw new Error('Sua sessão expirou. Entre novamente para vincular o cliente.')

  const [tenant, permissao] = await Promise.all([
    banco.rpc('get_user_tenant_id'),
    banco.rpc('pode_gerir_contratos'),
  ])
  if (tenant.error || !tenant.data || permissao.error || permissao.data !== true) {
    throw new Error('Não foi possível confirmar sua permissão para vincular este contrato.')
  }
  return tenant.data
}

export async function buscarClientesParaVinculoContrato(banco: Banco) {
  const tenantId = await tenantAutorizado(banco)
  const { data, error } = await banco.from('clients')
    .select('id, nome, empresa, ativo')
    .eq('tenant_id', tenantId)
    .order('nome')
  if (error) throw error
  return { tenantId, clientes: (data ?? []) as ClienteParaVinculoContrato[] }
}

/** A condição NULL decide a concorrência no próprio UPDATE; não substitui um vínculo. */
export async function vincularClienteAoContrato(banco: Banco, input: {
  contratoId: string
  clienteId: string
  tenantId: string
}) {
  if (!input.contratoId || !input.clienteId || !input.tenantId) {
    throw new Error('Escolha um cliente para este contrato.')
  }
  const tenantId = await tenantAutorizado(banco)
  if (tenantId !== input.tenantId) {
    throw new Error('A empresa da sessão mudou. Recarregue a página antes de vincular.')
  }

  // Confere de novo o cadastro selecionado sob a sessão e a RLS atuais.
  const { data: cliente, error: erroCliente } = await banco.from('clients')
    .select('id, nome')
    .eq('id', input.clienteId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (erroCliente) throw erroCliente
  if (!cliente) throw new Error('Cliente não encontrado nesta empresa. Recarregue a lista e escolha novamente.')

  // Não passa pelo salvamento do formulário: nenhum outro campo vai no PATCH.
  const { data, error } = await banco.from('contratos')
    .update({ cliente_id: cliente.id })
    .eq('id', input.contratoId)
    .eq('tenant_id', tenantId)
    .is('cliente_id', null)
    .select('id, cliente_id')
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw new Error('Este contrato já foi vinculado ou não está mais disponível. Recarregue a página.')
  }
  return { contratoId: data.id, clienteId: cliente.id, clienteNome: cliente.nome }
}
