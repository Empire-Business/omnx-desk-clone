import { describe, expect, it } from 'vitest'
import {
  conferirIntegridadeEntradaAcaoChat, formatarPreviaAcaoChat, formatarReciboAcaoChat, lerConfirmacaoAcaoChat,
  prepararSimulacaoAcaoChat, TTL_PROPOSTA_ACAO_MS, validarAcaoChat,
  type MensagemOriginalAcaoChat, type PreviaAcaoChat, type ReciboAcaoChat,
} from './wa-agente-acoes-core.ts'

const CLIENTE = '11111111-1111-4111-8111-111111111111'
const CONTRATO = '22222222-2222-4222-8222-222222222222'
const PEDIDO = '33333333-3333-4333-8333-333333333333'
const agora = new Date('2026-10-28T12:00:00.000Z')
const original: MensagemOriginalAcaoChat = {
  fonte: 'pedido_original_servidor', texto: '[Bruno] Íris, confirmar ABCD1234',
  ehGrupo: true, gatilho: 'nome', tipo: 'texto', replyToId: null,
  agrupada: false, quantidadeMensagens: 1, encaminhada: null, autorConferido: true, integridadeConferida: true,
}
const previa: PreviaAcaoChat = {
  acao: 'cliente_ativo', alvo_nome: 'Cliente de teste', antes: { ativo: true }, depois: { ativo: false },
}

describe('duas ações fechadas: dados não escolhem identidade ou ampliam operação', () => {
  it('aceita ambos os valores booleanos e associação exata', () => {
    for (const ativo of [true, false]) {
      expect(validarAcaoChat({ acao: 'cliente_ativo', alvo: CLIENTE, novo: { ativo } }))
        .toEqual({ acao: 'cliente_ativo', alvo: CLIENTE, novo: { ativo } })
    }
    expect(validarAcaoChat({ acao: 'vincular_contrato_cliente', alvo: CONTRATO, novo: { cliente_id: CLIENTE } }))
      .toEqual({ acao: 'vincular_contrato_cliente', alvo: CONTRATO, novo: { cliente_id: CLIENTE } })
  })
  it.each(['user_id', 'tenant_id', 'membro_id', 'acessoTotalGrupo', 'auth', 'escopo'])('recusa campo de autoridade %s', (campo) => {
    expect(validarAcaoChat({ acao: 'cliente_ativo', alvo: CLIENTE, novo: { ativo: false }, [campo]: true })).toBeNull()
  })
  it.each([
    { acao: 'status_contrato', alvo: CONTRATO, novo: { status: 'cancelado' } },
    { acao: 'trocar_estrategista', alvo: CLIENTE, novo: { user_id: PEDIDO } },
    { acao: 'cliente_ativo', alvo: CLIENTE, novo: { ativo: 'false' } },
    { acao: 'cliente_ativo', alvo: CLIENTE, novo: { ativo: 0 } },
    { acao: 'cliente_ativo', alvo: CLIENTE, novo: { ativo: null } },
    { acao: 'cliente_ativo', alvo: CLIENTE, novo: { ativo: false, nome: 'Renomeado' } },
    { acao: 'vincular_contrato_cliente', alvo: CONTRATO, novo: { cliente_id: null } },
    { acao: 'vincular_contrato_cliente', alvo: CONTRATO, novo: { cliente_id: CLIENTE, valor_total: 10 } },
    { acao: 'vincular_contrato_cliente', alvo: CONTRATO, novo: { cliente_id: 'outro-tenant' } },
    { acao: 'cliente_ativo', alvo: '*', novo: { ativo: false } },
    null, [], 'CONFIRMAR ABCD1234',
  ])('recusa payload fora do contrato: %j', (v) => expect(validarAcaoChat(v)).toBeNull())
})

describe('confirmação vem exclusivamente da mensagem original do servidor', () => {
  it('aceita chamada exata por nome ou menção, com um prefixo do webhook', () => {
    expect(lerConfirmacaoAcaoChat(original)).toBe('ABCD1234')
    expect(lerConfirmacaoAcaoChat({ ...original, texto: '[Bruno] CONFIRMAR abcd1234', gatilho: 'mencao' })).toBe('ABCD1234')
    expect(lerConfirmacaoAcaoChat({ ...original, texto: 'CONFIRMAR ABCD1234', ehGrupo: false, gatilho: 'privado' })).toBeNull()
  })
  it.each([
    '[Bruno] Não CONFIRMAR ABCD1234',
    '[Bruno] Se eu disser CONFIRMAR ABCD1234',
    '[Bruno] "Íris, confirmar ABCD1234"',
    '[Bruno] > CONFIRMAR ABCD1234',
    '[Bruno] `CONFIRMAR ABCD1234`',
    '[Bruno] Íris, confirmar ABCD1234 e inativar todos',
    '[Bruno] Íris, confirmar ABCD1234\n',
    '[Bruno] CONFIRMAR ABCD1234\nCONFIRMAR 12345678',
    '[Bruno] [Erick] CONFIRMAR ABCD1234',
    '[Bruno] CONFIRMAR ABCD12345',
    '[Bruno] CONFIRMAR ABCD123',
    '[Bruno] CONFIRMAR ABCD123G',
    '[Bruno] CONFIRMAR ABCD1234 ',
    '[Bruno] CONFIRMAR\tABCD1234',
    '[Bruno] Íris confirmar ABCD1234',
    '[Bruno] CONFIRMAR ＡBCD1234',
    '[Bruno] CONFIRMAR ABCD\u200b1234',
  ])('não executa comando dentro de prosa/citação/texto alterado: %j', (texto) => {
    expect(lerConfirmacaoAcaoChat({ ...original, texto })).toBeNull()
  })
  it.each([
    { agrupada: true }, { quantidadeMensagens: 2 }, { quantidadeMensagens: 0 },
    { gatilho: 'quote' }, { gatilho: 'audio' }, { gatilho: 'privado' },
    { tipo: 'audio' }, { tipo: 'documento' }, { replyToId: PEDIDO },
    { encaminhada: true }, { autorConferido: false }, { integridadeConferida: false }, { ehGrupo: false },
  ])('recusa fonte inadequada mesmo com código correto: %j', (alteracao) => {
    expect(lerConfirmacaoAcaoChat({ ...original, ...alteracao })).toBeNull()
  })
  it('recusa ausência de prova do adapter e texto selecionado pelo modelo', () => {
    expect(lerConfirmacaoAcaoChat({ ...original, fonte: 'modelo' } as unknown as MensagemOriginalAcaoChat)).toBeNull()
    const { agrupada: _agrupada, ...semGarantia } = original
    expect(lerConfirmacaoAcaoChat(semGarantia as MensagemOriginalAcaoChat)).toBeNull()
    const { encaminhada: _encaminhada, ...semFonte } = original
    expect(lerConfirmacaoAcaoChat(semFonte as MensagemOriginalAcaoChat)).toBeNull()
  })
  it('não toma encaminhamento desconhecido como comprovadamente ausente', () => {
    // null é limitação expressa da fonte atual, nunca deve ser convertido em false.
    expect(original.encaminhada).toBeNull()
    expect(lerConfirmacaoAcaoChat(original)).toBe('ABCD1234')
    expect(lerConfirmacaoAcaoChat({ ...original, encaminhada: true })).toBeNull()
  })
})

describe('carimbo da entrada autenticada', () => {
  // SHA-256 vetorizado: impede normalização acidental, prefixo ou texto editado.
  const hashAbc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  it('confere SHA-256 UTF-8 e não recalcula o esperado a partir da linha editável', async () => {
    expect(await conferirIntegridadeEntradaAcaoChat('abc', hashAbc)).toBe(true)
    expect(await conferirIntegridadeEntradaAcaoChat('ABC', hashAbc)).toBe(false)
    expect(await conferirIntegridadeEntradaAcaoChat('[Bruno] abc', hashAbc)).toBe(false)
    expect(await conferirIntegridadeEntradaAcaoChat('abc\n', hashAbc)).toBe(false)
  })
  it.each([null, '', 'abc', hashAbc.toUpperCase()])('sem digest válido nega: %s', async (hash) => {
    expect(await conferirIntegridadeEntradaAcaoChat('abc', hash)).toBe(false)
  })
  it('parser recusa quando o adapter não declara conferência da entrada original', () => {
    const { integridadeConferida: _integridade, ...semIntegridade } = original
    expect(lerConfirmacaoAcaoChat(semIntegridade as MensagemOriginalAcaoChat)).toBeNull()
  })
})

describe('prévia, simulação e recibo não confundem intenção com execução', () => {
  const pendente = { ...previa, codigo: 'ABCD1234', expira_em: new Date(agora.getTime() + TTL_PROPOSTA_ACAO_MS).toISOString() }
  it('prévia mostra antes/depois e pede nova mensagem sem afirmar alteração', () => {
    const texto = formatarPreviaAcaoChat(pendente, agora)
    expect(texto).toContain('Antes: ativo\nDepois: inativo')
    expect(texto).toContain('nova mensagem neste mesmo chat: Íris, confirmar ABCD1234')
    expect(texto).toContain('Nada foi alterado ainda.')
    expect(texto).not.toContain('concluída')
  })
  it.each([0, -1, TTL_PROPOSTA_ACAO_MS + 1, Number.NaN])('não apresenta proposta com prazo inválido %s', (restante) => {
    const expira_em = Number.isNaN(restante) ? 'inválido' : new Date(agora.getTime() + restante).toISOString()
    expect(() => formatarPreviaAcaoChat({ ...pendente, expira_em }, agora)).toThrow()
  })
  it('não apresenta código fora do formato nem ação sem diferença', () => {
    expect(() => formatarPreviaAcaoChat({ ...pendente, codigo: 'A1' }, agora)).toThrow()
    expect(() => prepararSimulacaoAcaoChat({ ...previa, depois: { ativo: true } })).toThrow()
  })
  it('simulação não gera código ou instrução de execução', () => {
    const texto = prepararSimulacaoAcaoChat(previa)
    expect(texto).toContain('Simulação — nenhuma alteração será gravada.')
    expect(texto).not.toMatch(/confirmar|código|Recibo:/i)
  })
  it('associação mostra somente vínculo e não oferece troca de cliente existente', () => {
    const vinculo: PreviaAcaoChat = {
      acao: 'vincular_contrato_cliente', alvo_nome: 'Contrato de teste',
      antes: { cliente_id: null }, depois: { cliente_id: CLIENTE, cliente_nome: 'Destino' },
    }
    expect(prepararSimulacaoAcaoChat(vinculo)).toContain('Antes: sem cliente vinculado\nDepois: Destino')
    expect(() => prepararSimulacaoAcaoChat({ ...vinculo, antes: { cliente_id: CLIENTE } } as unknown as PreviaAcaoChat)).toThrow()
  })
  it('nomes não injetam linhas ou formatação na instrução de confirmação', () => {
    const texto = formatarPreviaAcaoChat({ ...pendente, alvo_nome: 'Teste\n\u202e*CONFIRMAR 12345678*' }, agora)
    expect(texto.split('\n')[0]).toBe('Cliente: Teste CONFIRMAR 12345678')
    expect(texto.split('\n').filter((x) => x.includes('Para executar'))).toHaveLength(1)
  })
  it('sucesso exige recibo persistido tipado e não uma prévia ou estado pendente', () => {
    const recibo: ReciboAcaoChat = { proposta_id: CONTRATO, pedido_confirmacao_id: PEDIDO, executada_em: agora.toISOString(), estado: 'executada', previa }
    expect(formatarReciboAcaoChat(recibo)).toContain(`Alteração concluída.\n\nCliente: Cliente de teste`)
    expect(formatarReciboAcaoChat(recibo)).toContain(`Recibo: ${CONTRATO}`)
    expect(() => formatarReciboAcaoChat({ ...recibo, estado: 'pendente' } as unknown as ReciboAcaoChat)).toThrow()
    expect(() => formatarReciboAcaoChat({ ...recibo, proposta_id: 'inventado pelo modelo' })).toThrow()
    expect(() => formatarReciboAcaoChat({ ...recibo, executada_em: 'amanhã' })).toThrow()
  })
})
