import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { confirmarVigencia, erroVigencia, formatarDataCivil, hojeSaoPaulo, type VigenciaInput } from './contratoVigencia'

const input: VigenciaInput = { contratoId: 'contrato-a', actorId: 'ator-a', novaData: '2099-04-30', motivo: 'Pausa acordada por escrito', fimEsperado: '2099-03-31', statusEsperado: 'pausado', reativar: false }
function bancoFalso({ actor = 'ator-a', actorDepois = actor, error = null as null | { code: string }, resposta = undefined as unknown }: { actor?: string; actorDepois?: string; error?: null | { code: string }; resposta?: unknown } = {}) {
  let chamadas = 0
  const rpc = vi.fn(async () => ({ data: resposta === undefined ? { id: 'contrato-a', vigencia_fim: input.novaData, vigencia_motivo: input.motivo, status: 'pausado', status_secundario: 'PAUSADO' } : resposta, error }))
  const banco = { rpc, auth: { getSession: async () => ({ data: { session: { user: { id: chamadas++ ? actorDepois : actor } } }, error: null }) } }
  return { banco: banco as unknown as SupabaseClient<Database>, rpc }
}
describe('vigência independente de financeiro', () => {
  it('preserva data civil sem converter meia-noite UTC para dia anterior', () => {
    expect(formatarDataCivil('2026-09-28')).toBe('28/09/2026')
    expect(formatarDataCivil(null)).toBeNull()
    expect(formatarDataCivil('sem data')).toBe('sem data')
  })
  it('usa o dia do Brasil na virada UTC', () => {
    expect(hojeSaoPaulo(new Date('2026-11-07T01:00:00Z'))).toBe('2026-11-06')
  })
  it.each(['2026-02-30', '2026-11-05', 'invalida', ''])('recusa data inválida ou passada %s', novaData => {
    expect(erroVigencia({ ...input, novaData, fimEsperado: null }, '2026-11-06')).not.toBeNull()
  })
  it('aceita hoje inclusive na confirmação inicial', () => {
    expect(erroVigencia({ ...input, novaData: '2026-11-06', fimEsperado: null }, '2026-11-06')).toBeNull()
  })
  it.each(['2099-03-31', '2099-03-30'])('recusa encurtar ou repetir vigência %s', novaData => {
    expect(erroVigencia({ ...input, novaData }, '2026-11-06')).toContain('depois')
  })
  it.each(['curto', ' '.repeat(8), 'x'.repeat(2001)])('exige motivo auditável', motivo => {
    expect(erroVigencia({ ...input, motivo }, '2026-11-06')).toContain('8 a 2000')
  })
  it('envia apenas vigência/ator/precondições, preserva pausa e nenhum campo financeiro', async () => {
    const b = bancoFalso()
    expect((await confirmarVigencia(b.banco, input)).status).toBe('pausado')
    expect(b.rpc).toHaveBeenCalledWith('prorrogar_vigencia_contrato', { p_contrato_id: 'contrato-a', p_actor_esperado: 'ator-a', p_nova_data: '2099-04-30', p_motivo: input.motivo, p_fim_esperado: '2099-03-31', p_status_esperado: 'pausado', p_reativar: false })
  })
  it('conta trocada antes do envio não chama RPC', async () => {
    const b = bancoFalso({ actor: 'ator-b' })
    await expect(confirmarVigencia(b.banco, input)).rejects.toThrow('sessão mudou')
    expect(b.rpc).not.toHaveBeenCalled()
  })
  it('conta trocada durante resposta não atualiza cache como sucesso', async () => {
    const b = bancoFalso({ actorDepois: 'ator-b' })
    await expect(confirmarVigencia(b.banco, input)).rejects.toThrow('após a solicitação')
  })
  it.each(['40001', '42501', '57014'])('propaga falha %s sem falso sucesso', async code => {
    const b = bancoFalso({ error: { code } })
    await expect(confirmarVigencia(b.banco, input)).rejects.toThrow()
    expect(b.rpc).toHaveBeenCalledTimes(1)
  })
  it('recusa resposta nula sem fingir persistência', async () => {
    const b = bancoFalso({ resposta: null })
    await expect(confirmarVigencia(b.banco, input)).rejects.toThrow('não confirmou')
  })
})
