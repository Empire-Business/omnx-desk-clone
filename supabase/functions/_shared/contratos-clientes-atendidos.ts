import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Projeção operacional; nunca selecionar valores, documentos, contatos ou nomes do pagador. */
export const COLUNAS_CONTRATOS_OPERACIONAIS = 'id,tenant_id,cliente_id,produto_nome,status,status_secundario,atualizado_em,data_fechamento,data_assinatura,plano_dias,vigencia_fim'
export interface ContratoAtendido {
  id: string; tenant_id: string
  /** Cliente atendido solicitado, não necessariamente o responsável financeiro. */
  cliente_id: string
  cliente_principal_id: string | null
  principal: boolean
  produto_nome: string | null; status: string | null; status_secundario: string | null
  atualizado_em: string | null; data_fechamento: string | null; data_assinatura: string | null
  plano_dias: number | null; vigencia_fim: string | null
}
type Contrato = Omit<ContratoAtendido, 'cliente_principal_id' | 'principal' | 'cliente_id'> & { cliente_id: string | null }
type Vinculo = { tenant_id: string; contrato_id: string; cliente_id: string; principal: boolean }
const LOTE = 100
const LIMITE = 1000
function linhas<T>(r: { data: T[] | null; error: unknown; count?: number | null }): T[] {
  if (r.error || !Array.isArray(r.data) || r.data.length >= LIMITE || r.count !== r.data.length) {
    throw new Error('Não foi possível confirmar integralmente os contratos atendidos.')
  }
  return r.data
}

/** Duas leituras escopadas, sem fallback para FK única quando a associação não puder ser lida. */
export async function contratosDosClientesAtendidos(admin: SupabaseClient, tenantId: string, clienteIds: readonly string[]): Promise<ContratoAtendido[]> {
  if (!tenantId || clienteIds.some((id) => !id)) throw new Error('Escopo contratual inválido.')
  const ids = [...new Set(clienteIds)]
  const vinculos = new Map<string, Vinculo>()
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE)
    const permitidos = new Set(lote)
    const encontrados = linhas<Vinculo>(await admin.from('contrato_clientes_atendidos')
      .select('tenant_id,contrato_id,cliente_id,principal', { count: 'exact' }).eq('tenant_id', tenantId).in('cliente_id', lote).limit(LIMITE))
    for (const v of encontrados) {
      if (v.tenant_id !== tenantId || !permitidos.has(v.cliente_id) || !v.contrato_id || typeof v.principal !== 'boolean') {
        throw new Error('Associação fora do escopo contratual.')
      }
      vinculos.set(`${v.cliente_id}:${v.contrato_id}`, v)
    }
  }
  const contratoIds = [...new Set([...vinculos.values()].map((v) => v.contrato_id))]
  const contratos = new Map<string, Contrato>()
  for (let i = 0; i < contratoIds.length; i += LOTE) {
    const lote = contratoIds.slice(i, i + LOTE)
    const permitidos = new Set(lote)
    const encontrados = linhas<Contrato>(await admin.from('contratos').select(COLUNAS_CONTRATOS_OPERACIONAIS, { count: 'exact' })
      .eq('tenant_id', tenantId).in('id', lote).limit(LIMITE))
    for (const c of encontrados) {
      if (c.tenant_id !== tenantId || !permitidos.has(c.id)) throw new Error('Contrato fora do escopo solicitado.')
      contratos.set(c.id, c)
    }
    if (lote.some((id) => !contratos.has(id))) throw new Error('Contrato associado indisponível; atualize a consulta.')
  }
  return [...vinculos.values()].map((v) => {
    const c = contratos.get(v.contrato_id)!
    if (v.principal !== (c.cliente_id === v.cliente_id)) throw new Error('O cliente principal mudou; atualize a consulta.')
    // Projeção explícita impede que campos extras de um transporte sejam propagados.
    return { id: c.id, tenant_id: tenantId, cliente_id: v.cliente_id, cliente_principal_id: c.cliente_id, principal: v.principal,
      produto_nome: c.produto_nome, status: c.status, status_secundario: c.status_secundario,
      atualizado_em: c.atualizado_em, data_fechamento: c.data_fechamento, data_assinatura: c.data_assinatura,
      plano_dias: c.plano_dias, vigencia_fim: c.vigencia_fim }
  })
}
