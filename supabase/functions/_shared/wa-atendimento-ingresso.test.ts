import { describe, expect, it, vi } from 'vitest'
import { registrarEntradaTicket, type EntradaTicket } from './wa-atendimento-ingresso.ts'

const entrada = (campos: Partial<EntradaTicket> = {}): EntradaTicket => ({
  tenantId: 'tenant', mensagemId: 'mensagem', conversationId: 'conversa', autenticada: true,
  recuperada: false, ocorridoEm: '2026-11-06T12:00:00Z', tipo: 'texto',
  conteudoOriginal: '[Equipe] Resolvido DEM-00001', autorOrigem: 'webhook', autorTipo: 'equipe',
  autorUserId: 'usuario', body: {}, msg: {}, ...campos,
})

describe('atestação de ingresso WhatsApp dos tickets', () => {
  it('envia hash do corpo original, tenant e conversa, sem expor conteúdo à RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    expect(await registrarEntradaTicket({ rpc }, entrada())).toBe(true)
    expect(rpc).toHaveBeenCalledWith('atendimento_atestar_entrada_whatsapp', {
      p_tenant: 'tenant', p_mensagem: 'mensagem', p_conversa: 'conversa',
      p_texto_sha256: expect.stringMatching(/^[0-9a-f]{64}$/), p_ocorrido_em: '2026-11-06T12:00:00Z',
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('Resolvido')
  })

  it('resposta com "Responder" (citação) do WhatsApp é registrada: só o texto próprio vira prova', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    expect(await registrarEntradaTicket({ rpc }, entrada({ autorTipo: 'cliente', autorUserId: null, msg: { quoted: 'mensagem-citada' } }))).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('mensagem de cliente não precisa ter usuário interno', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    expect(await registrarEntradaTicket({ rpc }, entrada({ autorTipo: 'cliente', autorUserId: null }))).toBe(true)
  })

  it.each<Partial<EntradaTicket>>([
    { autenticada: false }, { recuperada: true }, { ocorridoEm: null }, { ocorridoEm: 'inválido' },
    { autorOrigem: 'heuristica_nome' }, { autorOrigem: 'heuristica_backfill' }, { autorOrigem: 'backfill' },
    { autorOrigem: null }, { autorTipo: 'ia' }, { autorTipo: 'equipe', autorUserId: null },
    { tipo: 'audio' }, { conteudoOriginal: null }, { msg: { fromMe: true } }, { msg: { wasSentByApi: true } },
    { msg: { contextInfo: { isForwarded: true } } },
  ])('entrada não comprovada não chama RPC: %j', async (campos) => {
    const rpc = vi.fn()
    expect(await registrarEntradaTicket({ rpc }, entrada(campos))).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['PGRST202', '42883'])('migration ausente (%s) mantém Chat funcionando sem sucesso falso', async (code) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } })
    expect(await registrarEntradaTicket({ rpc }, entrada())).toBe(false)
  })

  it('falha de transporte não escapa para o processamento de mensagem', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const rpc = vi.fn().mockRejectedValue(new Error('rede'))
    expect(await registrarEntradaTicket({ rpc }, entrada())).toBe(false)
    log.mockRestore()
  })

  it('resposta sem confirmação explícita não é prova registrada', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    expect(await registrarEntradaTicket({ rpc }, entrada())).toBe(false)
  })

  it('falha transitória é repetida uma vez com evidência idêntica', async () => {
    const rpc = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce({ data: true, error: null })
    expect(await registrarEntradaTicket({ rpc }, entrada())).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
  })

  it('reentrega sem novo INSERT recupera o ID existente pelo escopo do handler e reatesta o envelope original', async () => {
    const buscar = vi.fn().mockResolvedValue('mensagem-original')
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    expect(await registrarEntradaTicket({ rpc }, entrada({ mensagemId: null, messageIdWpp: 'provider-id' }), buscar)).toBe(true)
    expect(buscar).toHaveBeenCalledWith('provider-id')
    expect(rpc.mock.calls[0][1].p_mensagem).toBe('mensagem-original')
  })

  it('reentrega sem mensagem correspondente não inventa novo vínculo', async () => {
    const rpc = vi.fn()
    expect(await registrarEntradaTicket({ rpc }, entrada({ mensagemId: null, messageIdWpp: 'provider-id' }), async () => null)).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})
