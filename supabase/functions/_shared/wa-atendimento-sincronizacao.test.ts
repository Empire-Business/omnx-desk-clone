import { describe, expect, it, vi } from 'vitest'
import { sincronizarTickets, type EntradaSincronizacaoTickets } from './wa-atendimento-sincronizacao.ts'

const entrada: EntradaSincronizacaoTickets = {
  p_tenant: 'empresa', p_cliente: 'cliente', p_pendencias: [], p_resolucoes: ['mensagem'],
  p_anterior_ate: '2026-11-05T12:00:00Z', p_analisado_ate: '2026-11-06T12:00:00Z',
}

describe('falha e replay da sincronização de tickets', () => {
  it('falha transitória pede adiamento, e a repetição usa os mesmos IDs e cursores', async () => {
    const rpc = vi.fn().mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce({ data: { pendencias: [] }, error: null })
    expect(await sincronizarTickets({ rpc }, entrada)).toEqual({ tipo: 'adiar', codigo: 'falha_transporte' })
    expect(await sincronizarTickets({ rpc }, entrada)).toEqual({ tipo: 'sincronizado', pendencias: [] })
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
    expect(entrada.p_anterior_ate).toBe('2026-11-05T12:00:00Z')
  })

  it('entrada ainda sem atestação preserva o cursor e pode sincronizar após a prova chegar', async () => {
    // Contrato da RPC: SQL devolve 55P03 apenas para fonte elegível cujo
    // snapshot ainda está na janela de atestação. Não simula execução SQL.
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { code: '55P03' } })
      .mockResolvedValueOnce({ data: { pendencias: [] }, error: null })
    const pendente = await sincronizarTickets({ rpc }, entrada)
    expect(pendente).toEqual({ tipo: 'adiar', codigo: '55P03' })
    expect(pendente.tipo).not.toBe('indisponivel')
    expect(await sincronizarTickets({ rpc }, entrada)).toEqual({ tipo: 'sincronizado', pendencias: [] })
    expect(rpc.mock.calls[0][1]).toEqual(rpc.mock.calls[1][1])
    expect(rpc.mock.calls[1][1].p_anterior_ate).toBe('2026-11-05T12:00:00Z')
  })

  it.each(['42501', '23514', '57014', 'XX000'])('erro %s nunca permite avançar como legado', async (code) => {
    const rpc = vi.fn().mockResolvedValue({ error: { code }, data: null })
    expect(await sincronizarTickets({ rpc }, entrada)).toEqual({ tipo: 'adiar', codigo: code })
  })

  it.each(['PGRST202', '42883'])('somente migration ausente (%s) libera caminho legado sem sucesso falso', async (code) => {
    const rpc = vi.fn().mockResolvedValue({ error: { code }, data: null })
    expect(await sincronizarTickets({ rpc }, entrada)).toEqual({ tipo: 'indisponivel' })
  })

  it('app explicitamente desligado não bloqueia a análise antiga nem conta ticket sincronizado', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null, data: { desativado: true } })
    expect(await sincronizarTickets({ rpc }, entrada)).toEqual({ tipo: 'desativado' })
  })

  it.each([null, true, {}, { pendencias: 'inválido' }])('resposta incompleta (%j) adia em vez de perder mensagem', async (data) => {
    const rpc = vi.fn().mockResolvedValue({ error: null, data })
    expect(await sincronizarTickets({ rpc }, entrada)).toEqual({ tipo: 'adiar', codigo: 'resposta_invalida' })
  })

  it('RPC natural ausente mantém ponte anterior e não inventa baixa IA',async()=>{
    const rpc=vi.fn().mockResolvedValueOnce({data:null,error:{code:'PGRST202'}})
      .mockResolvedValueOnce({data:{pendencias:[]},error:null})
    expect(await sincronizarTickets({rpc},{...entrada,p_resolucoes_ia:[]})).toEqual({tipo:'sincronizado',pendencias:[]})
    expect(rpc.mock.calls[0][0]).toBe('atendimento_sincronizar_whatsapp_ia')
    expect(rpc.mock.calls[1]).toEqual(['atendimento_sincronizar_whatsapp',entrada])
  })
  it('falha da RPC natural não cai no legado nem avança cursor',async()=>{
    const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'55P03'}})
    expect(await sincronizarTickets({rpc},{...entrada,p_resolucoes_ia:[]})).toEqual({tipo:'adiar',codigo:'55P03'})
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
