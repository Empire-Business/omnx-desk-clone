import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pensar, type EntradaCerebro } from './wa-agente-cerebro.ts'
import { formatarPreviaAcaoChat, formatarReciboAcaoChat, type PreviaAcaoChat } from './wa-agente-acoes-core.ts'

const controle = vi.hoisted(() => ({ canario: 'iris-segredo-fixture-lote', texto: '', reciboId: '', codigo: '', confirmacao: true }))
vi.mock('./wa-agente-ferr-acoes-cadastro.ts', async (original) => ({
  ...await original<typeof import('./wa-agente-ferr-acoes-cadastro.ts')>(),
  confirmarAcaoCadastroDoPedido: async () => controle.confirmacao ? { ok: true, texto_deterministico: controle.texto,
    recibo_id: controle.reciboId } : null,
  prepararOfertaAcoesCadastro: async () => true,
}))
vi.mock('./wa-agente-ferr-atribuicoes.ts', async (original) => ({
  ...await original<typeof import('./wa-agente-ferr-atribuicoes.ts')>(),
  atribuicoesDisponiveis: async () => false,
}))
vi.mock('./wa-agente-ferramentas.ts', async (original) => ({
  ...await original<typeof import('./wa-agente-ferramentas.ts')>(),
  executarFerramenta: async () => ({ ok: true, texto_deterministico: controle.texto, codigo_confirmacao: controle.codigo }),
}))
vi.mock('./wa-agente-llm.ts', async (original) => ({
  ...await original<typeof import('./wa-agente-llm.ts')>(),
  rodarLoop: async (opcoes: { executar: (nome: string, args: unknown) => Promise<unknown> }) => {
    await opcoes.executar('propor_alteracao_cadastro', {})
    return { ok: true, texto: 'Texto do modelo não substitui o resultado.', ferramentas: ['propor_alteracao_cadastro'],
      passos: 1, uso: { entrada: 0, saida: 0, cache: 0, custoUsd: 0 }, modelo: 'fixture-local', duracaoMs: 0 }
  },
}))
vi.mock('./wa-agente-prompt.ts', async (original) => ({
  ...await original<typeof import('./wa-agente-prompt.ts')>(),
  gerarCanario: () => controle.canario,
}))

const id = (n: number) => `a1b2c3d4-e5f6-47a8-9b0c-${n.toString(16).padStart(12, 'a')}`
const RECIBO = 'a1b2c3d4-e5f6-47a8-9b0c-d1e2f3a4b5c6'
const AGORA = new Date('2026-11-03T17:00:00Z')
const longo = (prefixo: string) => `${prefixo} ${'a'.repeat(159 - prefixo.length)}`

function fixture(propostaId = RECIBO) {
  const itens = Array.from({ length: 10 }, (_, i) => ({ cliente: longo(`Cliente fictício ${i + 1}`),
    anterior: longo(`Responsável anterior ${i + 1}`), novo: longo(`Responsável novo ${i + 1}`) }))
  const previa: Extract<PreviaAcaoChat, { acao: 'cliente_estrategista' }> = {
    acao: 'cliente_estrategista', alvo_nome: 'Responsáveis operacionais',
    antes: { itens: itens.map((item, i) => ({ cliente_id: id(i), cliente_nome: item.cliente, assignment_id: id(100 + i),
      estrategista_id: id(200 + i), estrategista_nome: item.anterior, revisao: i + 1 })) },
    depois: { itens: itens.map((item, i) => ({ cliente_id: id(i), cliente_nome: item.cliente,
      user_id: id(300 + i), estrategista_nome: item.novo })) },
  }
  const texto = formatarReciboAcaoChat({ proposta_id: propostaId, pedido_confirmacao_id: id(500),
    executada_em: AGORA.toISOString(), estado: 'executada', previa })
  return { itens, texto, previa }
}

function executar() {
  const rede = vi.fn(() => { throw new Error('O caminho de confirmação não deve chamar IA.') })
  const banco = vi.fn(() => { throw new Error('Fixture sem banco.') })
  const promessa = pensar({ admin: { from: banco, rpc: banco } as unknown as EntradaCerebro['admin'],
    escopo: { tenantId: id(600), userId: id(601), total: true, clientIds: new Set(), modo: 'normal',
      permissoes: { automacoes: true, contratos: true, chat: true } },
    nomeAgente: 'Íris', canal: 'grupo', quemPergunta: 'Pessoa da equipe',
    pergunta: 'Íris, confirmar ABCD1234', pedidoId: id(500), agora: AGORA, apiKey: null,
    fetchFn: rede as typeof fetch })
  return { promessa, rede, banco }
}

beforeEach(() => { controle.texto = fixture().texto; controle.reciboId = RECIBO; controle.codigo = ''; controle.confirmacao = true })

describe('confirmação de lote anterior ao modelo', () => {
  it('preserva dez nomes de 160 caracteres e o recibo inteiro acima de 3500 caracteres', async () => {
    const { itens, texto } = fixture()
    expect(itens.every(i => [i.cliente, i.anterior, i.novo].every(n => n.length === 160))).toBe(true)
    expect(texto.length).toBeGreaterThan(3500)
    const { promessa, rede, banco } = executar()
    const r = await promessa
    expect(r.ok).toBe(true)
    expect(r.texto?.length).toBeGreaterThan(3500)
    expect(r.ajustes).not.toContain('cortado')
    expect(r.partes.length).toBeGreaterThan(3)
    expect(r.partes.length).toBeLessThanOrEqual(15)
    expect(r.texto?.match(/^• /gm)).toHaveLength(10)
    for (const item of itens) {
      const linha = `${item.cliente}: ${item.anterior} → ${item.novo}`
      expect(r.texto).toContain(linha)
      expect(r.partes.join('\n')).toContain(linha)
    }
    expect(r.texto).toContain(`Recibo: ${RECIBO}`)
    expect(r.partes.at(-1)).toContain(`Recibo: ${RECIBO}`)
    expect(r.ferramentas).toEqual(['confirmacao_cadastro'])
    expect(r.passos).toBe(0)
    expect(rede).not.toHaveBeenCalled(); expect(banco).not.toHaveBeenCalled()
  })
  it('também preserva UUID válido formado por trechos numéricos', async () => {
    const reciboNumerico = '12345678-1234-4123-8123-123456789012'
    controle.texto = fixture(reciboNumerico).texto
    controle.reciboId = reciboNumerico
    const r = await executar().promessa
    expect(r.ok).toBe(true)
    expect(r.texto).toContain(`Recibo: ${reciboNumerico}`)
    expect(r.partes.at(-1)).toContain(`Recibo: ${reciboNumerico}`)
  })
  it('preserva código de oito dígitos somente com metadado do executor', async () => {
    controle.reciboId = ''; controle.codigo = '12345678'; controle.confirmacao = false
    controle.texto = formatarPreviaAcaoChat({ ...fixture().previa, codigo: controle.codigo,
      expira_em: new Date(AGORA.getTime() + 300_000).toISOString() }, AGORA)
    const r = await executar().promessa
    expect(r.ok).toBe(true)
    expect(r.texto).toContain('Para executar, envie uma nova mensagem neste mesmo chat: Íris, confirmar 12345678')
  })
  it.each([
    ['canario', () => controle.canario],
    ['vazamento_prompt', () => 'REGRAS DO ASSISTENTE'],
  ])('mantém o bloqueio por %s no recibo longo', async (motivo, trecho) => {
    controle.texto += `\n${(trecho as () => string)()}`
    const r = await executar().promessa
    expect(r).toMatchObject({ ok: false, falha: 'bloqueado', motivo, partes: [], texto: null })
  })
  it('mantém máscara de telefone e remoção de link não autorizado', async () => {
    controle.texto += '\nContato: 5511999999999. https://example.invalid/nao-autorizado'
    const r = await executar().promessa
    expect(r.ok).toBe(true)
    expect(r.texto).not.toContain('5511999999999')
    expect(r.texto).not.toContain('https://example.invalid')
    expect(r.ajustes).toContain('telefone')
    expect(r.ajustes).toContain('link_removido')
    expect(r.texto).toContain(`Recibo: ${RECIBO}`)
  })
})
