import { describe, expect, it } from 'vitest'
import { agruparHistoricoResponsaveis, carregarResponsaveis, decidirResponsavel, lerContextoResponsaveis, parametrosResponsavel, podeRepetirPedidoResponsavel, ErroResponsaveis,
  type EventoResponsavel, type PedidoResponsavel, type TransporteResponsaveis } from './responsaveisCliente'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const pedido: PedidoResponsavel = { clientId: id(1), acao: 'trocar', tipo: 'estrategista', assignmentId: id(2), userId: id(3), revisao: 4, idempotencia: id(4), motivo: 'Redistribuição de carteira' }
const contexto = () => ({ client_id: id(1), revisao: 4, atuais: [], usuarios_elegiveis: [], historico: [], historico_proximo_cursor: null, historico_desde: null })
describe('responsáveis operacionais: contrato de UI', () => {
  it('envia só a intenção e a revisão; identidade/tenant nunca vão como autorização', () => {
    const forjado = { ...pedido, tenant_id: 'outro', ator_id: 'outro' }
    expect(parametrosResponsavel(forjado)).toEqual({ p_client_id: id(1), p_acao: 'trocar', p_tipo: 'estrategista', p_assignment_id: id(2), p_user_id: id(3), p_revisao_esperada: 4, p_idempotencia: id(4), p_motivo: 'Redistribuição de carteira' })
  })
  it.each([
    { acao: 'adicionar', assignmentId: id(2) }, { acao: 'encerrar', userId: id(3) },
    { assignmentId: null }, { motivo: '  ' }, { motivo: 'x'.repeat(501) }, { revisao: -1 },
    { revisao: Number.MAX_SAFE_INTEGER + 1 }, { userId: 'não é uuid' },
  ])('recusa intenção incoerente antes do transporte: %j', (delta) => {
    expect(() => parametrosResponsavel({ ...pedido, ...delta } as PedidoResponsavel)).toThrow()
  })
  it('carteira vazia e revisão zero são válidas sem inventar histórico', () => {
    expect(lerContextoResponsaveis({ ...contexto(), revisao: 0 })).toMatchObject({ revisao: 0, atuais: [], historico: [], historico_desde: null })
    expect(() => lerContextoResponsaveis({ ...contexto(), revisao: undefined })).toThrow()
  })
  it.each([id(9), id(1)])('resposta de outro cliente ou vínculo inativo nunca vira atual: %s', async (cliente) => {
    const banco: TransporteResponsaveis = { rpc: async () => ({ data: { ...contexto(), client_id: cliente, atuais: cliente === id(1) ? [{ id: id(5), client_id: id(1), user_id: id(3), tipo: 'estrategista', ativo: false, usuario_nome: 'Pessoa fictícia', usuario_ativo: true, criado_em: '2026-10-28' }] : [] }, error: null }) }
    await expect(carregarResponsaveis(banco, id(1))).rejects.toThrow()
  })
  it('não confunde falha de leitura/atualização ausente com lista vazia', async () => {
    const banco: TransporteResponsaveis = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Detalhe interno de SQL que não deve aparecer.' } }) }
    await expect(carregarResponsaveis(banco, id(1))).rejects.toMatchObject({ codigo: 'atualizacao' })
  })
  it('retry conserva UUID e revisão do pedido congelado, sem gerar outro efeito no cliente', async () => {
    const chamadas: Record<string, unknown>[] = []
    const banco: TransporteResponsaveis = { rpc: async (_nome, parametros) => {
      chamadas.push(parametros)
      return chamadas.length === 1 ? { data: null, error: { code: 'network' } } : { data: { ok: true, operacao_id: id(6), revisao: 6, repetida: true }, error: null }
    } }
    await expect(decidirResponsavel(banco, pedido)).rejects.toThrow()
    expect(await decidirResponsavel(banco, pedido)).toMatchObject({ repetida: true, revisao: 6 })
    expect(chamadas[0]).toEqual(chamadas[1])
  })
  it('conflito exige recarregar em vez de aparentar confirmação', async () => {
    const banco: TransporteResponsaveis = { rpc: async () => ({ data: null, error: { code: '40001', message: 'atribuicao_estado_alterado' } }) }
    await expect(decidirResponsavel(banco, pedido)).rejects.toMatchObject({ codigo: 'conflito' })
  })
  it('retry só mantém o pedido quando o resultado é incerto', () => {
    expect(podeRepetirPedidoResponsavel(new ErroResponsaveis('Rede indisponível', 'dados'))).toBe(true)
    for (const codigo of ['conflito', 'permissao', 'atualizacao', 'destino'] as const) {
      expect(podeRepetirPedidoResponsavel(new ErroResponsaveis('Atualizar', codigo))).toBe(false)
    }
  })
  it('agrupar uma troca não confunde o destino reativado com o antigo responsável', () => {
    const base: EventoResponsavel = { id: id(7), revisao: 5, operacao_id: id(6), acao: 'trocar', origem: 'desk_rpc', motivo: 'Troca', ator_id: id(8), ator_nome: 'Gestor fictício', ocorrido_em: '2026-10-28T12:00:00Z', antes: { user_id: id(9), usuario_nome: 'Pessoa anterior', tipo: 'estrategista' }, depois: null }
    const novo = { user_id: id(3), usuario_nome: 'Pessoa nova', tipo: 'estrategista' as const }
    const g = agruparHistoricoResponsaveis([{ ...base, id: id(10), revisao: 6, antes: novo, depois: novo }, base])
    expect(g).toHaveLength(1)
    expect(g[0].incompleto).toBe(false)
    expect(agruparHistoricoResponsaveis([base])[0].incompleto).toBe(true)
    expect(g[0].antes?.usuario_nome).toBe('Pessoa anterior')
    expect(g[0].depois?.usuario_nome).toBe('Pessoa nova')
    expect(agruparHistoricoResponsaveis([{ ...base, operacao_id: null }, { ...base, id: id(11), operacao_id: null }])).toHaveLength(2)
  })
})
