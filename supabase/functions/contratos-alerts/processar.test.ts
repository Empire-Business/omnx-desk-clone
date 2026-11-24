import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { destinatariosContrato, processarAlertasContratos } from './processar'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const contratoA = { id: id(1), tenant_id: id(10), estrategista_id: id(101), cliente_nome: 'Cliente A' }
const contratoB = { id: id(2), tenant_id: id(20), estrategista_id: id(201), cliente_nome: 'Cliente B' }
const usuarios = [
  { id: id(100), tenant_id: id(10), perfil: 'admin', ativo: true },
  { id: id(101), tenant_id: id(10), perfil: 'estrategista', ativo: true },
  { id: id(102), tenant_id: id(10), perfil: 'gerente', ativo: false },
  { id: id(103), tenant_id: id(10), perfil: 'admin', ativo: null },
  { id: id(200), tenant_id: id(20), perfil: 'gerente', ativo: true },
  { id: id(201), tenant_id: id(20), perfil: 'estrategista', ativo: true },
  { id: id(202), tenant_id: id(20), perfil: 'agente', ativo: true },
]
function bancoFalso(op: { error?: string; empty?: boolean; missingScope?: boolean; badId?: boolean; existing?: boolean; missingReceipt?: boolean } = {}) {
  const inserts: Record<string, unknown>[] = []
  const consultas: { table: string; filtros: unknown[][]; colunas?: string }[] = []
  let viewCount = 0
  const banco = { from(table: string) {
    const q = { table, filtros: [] as unknown[][], colunas: '' }; consultas.push(q)
    const currentView = table === 'v_contratos_alertas' ? viewCount++ : -1
    const result = () => {
      if (op.error === table) return { data: null, count: null, error: { message: 'PRIVATE DATABASE DETAIL' } }
      if (table === 'v_contratos_alertas') return { data: op.empty ? [] : [{ contrato_id: op.badId ? undefined : currentView === 0 ? id(1) : id(2), ultimo_vencimento: '2026-11-10' }], error: null }
      if (table === 'contratos') return { data: op.missingScope ? [contratoA] : [contratoA, contratoB], error: null }
      if (table === 'users') return { data: usuarios, error: null }
      return { data: null, count: op.existing ? 1 : 0, error: null }
    }
    const builder = {
      select(colunas: string) { q.colunas = colunas; return builder },
      eq(...args: unknown[]) { q.filtros.push(['eq', ...args]); return builder },
      in(...args: unknown[]) { q.filtros.push(['in', ...args]); return builder },
      gte(...args: unknown[]) { q.filtros.push(['gte', ...args]); return builder },
      lte(...args: unknown[]) { q.filtros.push(['lte', ...args]); return builder },
      not(...args: unknown[]) { q.filtros.push(['not', ...args]); return builder },
      or(...args: unknown[]) { q.filtros.push(['or', ...args]); return builder },
      filter(...args: unknown[]) { q.filtros.push(['filter', ...args]); return builder },
      insert(value: Record<string, unknown>) { inserts.push(value); return builder },
      single: async () => op.error === 'insert' ? { data: null, error: {} } : { data: op.missingReceipt ? null : { id: id(999) }, error: null },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    }; return builder
  } }
  return { banco: banco as unknown as SupabaseClient, inserts, consultas }
}
const hoje = new Date('2026-11-06T12:00:00Z')
describe('alertas de contratos com tenant confirmado e recibo real', () => {
  it('seleciona admin/gerente e estrategista ativos somente do mesmo tenant', () => {
    expect(destinatariosContrato(contratoA, usuarios)).toEqual([id(100), id(101)])
    expect(destinatariosContrato(contratoB, usuarios)).toEqual([id(200), id(201)])
  })
  it('estrategista de outro tenant não ganha acesso por estar vinculado no contrato', () => {
    expect(destinatariosContrato({ ...contratoA, estrategista_id: id(201) }, usuarios)).toEqual([id(100)])
  })
  it('persiste IDs corretos da view, tenant e link da ficha; conta só os4 inserts reais', async () => {
    const b = bancoFalso(); const resultado = await processarAlertasContratos(b.banco, hoje)
    expect(resultado).toEqual({ ok: true, hoje: '2026-11-06', alerta_inadimplencia: 2, alerta_renovacao: 2 })
    expect(b.inserts.map(x => [x.tenant_id, x.user_id])).toEqual([[id(10), id(100)], [id(10), id(101)], [id(20), id(200)], [id(20), id(201)]])
    expect(b.inserts[0]).toMatchObject({ link: `/contratos/${id(1)}`, metadata: { contrato_id: id(1), dia: '2026-11-06' } })
    expect(b.consultas.find(q => q.table === 'notifications')?.filtros).toContainEqual(['eq', 'tenant_id', id(10)])
    expect(b.consultas.find(q => q.table === 'users')?.filtros).toContainEqual(['eq', 'ativo', true])
  })
  it.each(['v_contratos_alertas', 'contratos', 'users', 'notifications', 'insert'])('falha fechada na consulta/escrita %s sem recibo de sucesso', async error => {
    const b = bancoFalso({ error })
    await expect(processarAlertasContratos(b.banco, hoje)).rejects.toThrow(/failed/)
    if (error !== 'insert') expect(b.inserts).toHaveLength(0)
  })
  it('retorno insert vazio não conta como criação', async () => {
    const b = bancoFalso({ missingReceipt: true })
    await expect(processarAlertasContratos(b.banco, hoje)).rejects.toThrow('notification_insert_failed')
  })
  it('todos existentes não são contados novamente', async () => {
    const b = bancoFalso({ existing: true })
    expect(await processarAlertasContratos(b.banco, hoje)).toMatchObject({ alerta_inadimplencia: 0, alerta_renovacao: 0 })
    expect(b.inserts).toHaveLength(0)
  })
  it.each([{ badId: true }, { missingScope: true }])('nenhum write quando contrato não tem identidade/tenant comprovado', async op => {
    const b = bancoFalso(op)
    await expect(processarAlertasContratos(b.banco, hoje)).rejects.toThrow(/contract_/)
    expect(b.inserts).toHaveLength(0)
  })
  it('sem contratos elegíveis não consulta destinatários nem escreve', async () => {
    const b = bancoFalso({ empty: true })
    expect(await processarAlertasContratos(b.banco, hoje)).toMatchObject({ ok: true, alerta_renovacao: 0 })
    expect(b.consultas.map(q => q.table)).toEqual(['v_contratos_alertas', 'v_contratos_alertas'])
  })
})
