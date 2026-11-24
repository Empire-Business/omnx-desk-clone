import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface UsuarioAlerta { id: string; tenant_id: string; perfil: string; ativo: boolean | null }
export interface ContratoAlertaEscopo { id: string; tenant_id: string; estrategista_id: string | null; cliente_nome: string }
interface Alerta { contrato_id: string; ultimo_vencimento: string | null }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Identidade e empresa vêm de contratos, nunca da view legada ou do corpo da requisição. */
export function destinatariosContrato(contrato: ContratoAlertaEscopo, usuarios: readonly UsuarioAlerta[]): string[] {
  if (!UUID.test(contrato.id) || !UUID.test(contrato.tenant_id)) throw new Error('contract_scope_invalid')
  return [...new Set(usuarios.filter(u => u.tenant_id === contrato.tenant_id && u.ativo === true && UUID.test(u.id)
    && (u.perfil === 'admin' || u.perfil === 'gerente' || u.id === contrato.estrategista_id)).map(u => u.id))]
}

/** Após gate cron. Falhas de consulta/insert interrompem; recibo só conta persistências confirmadas. */
export async function processarAlertasContratos(admin: SupabaseClient, agora = new Date()) {
  const hoje = agora.toISOString().slice(0, 10)
  const ontem = new Date(agora.getTime() - 86_400_000).toISOString()
  const em30dias = new Date(agora.getTime() + 30 * 86_400_000).toISOString().slice(0, 10)
  const [inad, ren] = await Promise.all([
    admin.from('v_contratos_alertas').select('contrato_id,ultimo_vencimento').eq('status_secundario', 'INADIMPLENTE').gte('atualizado_em', ontem),
    admin.from('v_contratos_alertas').select('contrato_id,ultimo_vencimento').gte('ultimo_vencimento', hoje).lte('ultimo_vencimento', em30dias).not('status_secundario', 'in', '("CANCELADO","CONCLUÍDO","INATIVO")'),
  ])
  if (inad.error || ren.error || !Array.isArray(inad.data) || !Array.isArray(ren.data)) throw new Error('alerts_query_failed')
  const inadimplentes = inad.data as Alerta[]
  const renovacoes = ren.data as Alerta[]
  const ids = [...new Set([...inadimplentes, ...renovacoes].map(c => c.contrato_id))]
  if (!ids.length) return { ok: true, hoje, alerta_inadimplencia: 0, alerta_renovacao: 0 }
  if (ids.some(id => typeof id !== 'string' || !UUID.test(id))) throw new Error('contract_id_invalid')
  const contratos = await admin.from('contratos').select('id,tenant_id,estrategista_id,cliente_nome').in('id', ids)
  if (contratos.error || !Array.isArray(contratos.data)) throw new Error('contract_scope_query_failed')
  const escopos = new Map((contratos.data as ContratoAlertaEscopo[]).map(c => [c.id, c]))
  // Qualquer contrato sem correspondência real fecha a execução antes da primeira escrita.
  if (ids.some(id => !escopos.has(id) || !UUID.test(escopos.get(id)!.tenant_id))) throw new Error('contract_scope_missing')
  const tenants = [...new Set([...escopos.values()].map(c => c.tenant_id))]
  const estrategistas = [...new Set([...escopos.values()].flatMap(c => c.estrategista_id ? [c.estrategista_id] : []))]
  if (estrategistas.some(id => !UUID.test(id))) throw new Error('strategist_id_invalid')
  const destinatarios = await admin.from('users').select('id,tenant_id,perfil,ativo').in('tenant_id', tenants).eq('ativo', true)
    .or(estrategistas.length ? `perfil.in.(admin,gerente),id.in.(${estrategistas.join(',')})` : 'perfil.in.(admin,gerente)')
  if (destinatarios.error || !Array.isArray(destinatarios.data)) throw new Error('recipient_query_failed')
  const usuarios = destinatarios.data as UsuarioAlerta[]
  let alertaInadimplencia = 0
  let alertaRenovacao = 0
  async function notificar(alerta: Alerta, tipo: 'contrato_inadimplente' | 'contrato_renovacao') {
    const contrato = escopos.get(alerta.contrato_id)!
    let criadas = 0
    for (const userId of destinatariosContrato(contrato, usuarios)) {
      const existente = await admin.from('notifications').select('id', { count: 'exact', head: true })
        .eq('tenant_id', contrato.tenant_id).eq('user_id', userId).eq('tipo', tipo)
        .filter('metadata->>contrato_id', 'eq', contrato.id).gte('criado_em', `${hoje}T00:00:00Z`)
      if (existente.error || typeof existente.count !== 'number') throw new Error('notification_lookup_failed')
      if (existente.count > 0) continue
      const inadimplente = tipo === 'contrato_inadimplente'
      const inserida = await admin.from('notifications').insert({
        tenant_id: contrato.tenant_id, user_id: userId, tipo,
        titulo: `${inadimplente ? 'Inadimplente' : 'Renovação próxima'}: ${contrato.cliente_nome}`,
        mensagem: inadimplente ? 'O contrato passou a INADIMPLENTE. Verifique a régua de cobrança.' : `Última parcela em ${alerta.ultimo_vencimento}. Combine renovação com o cliente.`,
        link: `/contratos/${contrato.id}`, metadata: { contrato_id: contrato.id, dia: hoje },
      }).select('id').single()
      if (inserida.error || !inserida.data?.id) throw new Error('notification_insert_failed')
      criadas += 1
    }
    return criadas
  }
  for (const alerta of inadimplentes) alertaInadimplencia += await notificar(alerta, 'contrato_inadimplente')
  for (const alerta of renovacoes) alertaRenovacao += await notificar(alerta, 'contrato_renovacao')
  return { ok: true, hoje, alerta_inadimplencia: alertaInadimplencia, alerta_renovacao: alertaRenovacao }
}
