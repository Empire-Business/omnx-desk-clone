import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { carregarClientesContratos, definirClientesContrato, nomesClientesContrato } from './contratoClientes'

const principal = { id: 'contrato', cliente_id: 'rodrigo', cliente_nome: 'Rodrigo', valor_total: 3000 }
function bancoLeitura(erro = false) {
  return { from: (table: string) => ({ select: () => ({ in: async () => table === 'contrato_clientes'
    ? { data: [{ contrato_id: 'contrato', cliente_id: 'flavia' }], error: erro ? new Error('RLS') : null }
    : { data: [{ id: 'rodrigo', nome: 'Rodrigo' }, { id: 'flavia', nome: 'Flávia' }], error: null } }) }) } as unknown as SupabaseClient<Database>
}
describe('clientes do mesmo contrato', () => {
  it('mostra ambos e preserva uma única linha financeira', async () => {
    const contratos = await carregarClientesContratos(bancoLeitura(), [principal])
    expect(contratos).toHaveLength(1)
    expect(contratos[0].valor_total).toBe(3000)
    expect(nomesClientesContrato(contratos[0])).toBe('Rodrigo · Flávia')
    expect(contratos[0].clientes.map(c => c.principal)).toEqual([true, false])
  })
  it('falha na leitura em vez de tratar erro como ausência de associados', async () => {
    await expect(carregarClientesContratos(bancoLeitura(true), [principal])).rejects.toThrow('RLS')
  })
  it('não escreve quando a conta muda ou principal é removido', async () => {
    const rpc = vi.fn()
    const banco = { auth: { getSession: async () => ({ data: { session: { user: { id: 'outra' } } } }) }, rpc } as unknown as SupabaseClient<Database>
    const input = { contratoId: 'contrato', actorId: 'original', principalId: 'rodrigo', ids: ['rodrigo', 'flavia'], esperados: ['rodrigo'], motivo: 'Atendimento conjunto' }
    await expect(definirClientesContrato(banco, input)).rejects.toThrow('sessão mudou')
    await expect(definirClientesContrato(banco, { ...input, ids: ['flavia'] })).rejects.toThrow('Preserve')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('envia a comparação de conjunto anterior e só confirma recibo completo', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'contrato', cliente_id: 'rodrigo', cliente_ids: ['rodrigo', 'flavia'] }, error: null })
    const banco = { auth: { getSession: async () => ({ data: { session: { user: { id: 'ator' } } } }) }, rpc } as unknown as SupabaseClient<Database>
    const input = { contratoId: 'contrato', actorId: 'ator', principalId: 'rodrigo', ids: ['rodrigo', 'flavia'], esperados: ['rodrigo'], motivo: 'Atendimento conjunto' }
    await expect(definirClientesContrato(banco, input)).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('definir_clientes_contrato', expect.objectContaining({ p_cliente_ids_esperados: ['rodrigo'], p_cliente_principal_esperado: 'rodrigo', p_actor_esperado: 'ator' }))
    rpc.mockResolvedValueOnce({ data: { id: 'contrato', cliente_id: 'rodrigo', cliente_ids: ['rodrigo'] }, error: null })
    await expect(definirClientesContrato(banco, input)).rejects.toThrow('Resposta não confirmada')
    rpc.mockResolvedValueOnce({ data: null, error: { code: '40001' } })
    await expect(definirClientesContrato(banco, input)).rejects.toThrow('fora do seu acesso')
  })

  it('rejeita confirmação quando a conta muda durante o salvamento do rascunho', async () => {
    const getSession = vi.fn()
      .mockResolvedValueOnce({ data: { session: { user: { id: 'ator-do-rascunho' } } } })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'outra-conta' } } } })
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'contrato', cliente_id: 'rodrigo', cliente_ids: ['rodrigo', 'flavia'] }, error: null })
    const banco = { auth: { getSession }, rpc } as unknown as SupabaseClient<Database>
    await expect(definirClientesContrato(banco, {
      contratoId: 'contrato', actorId: 'ator-do-rascunho', principalId: 'rodrigo',
      ids: ['rodrigo', 'flavia'], esperados: ['rodrigo'], motivo: 'Atendimento conjunto',
    })).rejects.toThrow('A sessão mudou')
    expect(rpc).toHaveBeenCalledWith('definir_clientes_contrato', expect.objectContaining({ p_actor_esperado: 'ator-do-rascunho' }))
  })

})
