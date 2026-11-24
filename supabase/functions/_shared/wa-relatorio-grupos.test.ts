// Seção "Grupos ativos sem cliente vinculado" do aviso diário e do painel.
import { describe, expect, it } from 'vitest'
import { type AlertaCandidato, filtrarAlertas } from './wa-alertas.ts'
import {
  type DadosRelatorio, contarRelatorio, montarListasRelatorio, montarTemplateRelatorio, montarTextoRelatorio,
  nomeGrupoSeguro, pedidoHumanizacaoRelatorio, secoesDosAlertas,
} from './wa-relatorio.ts'
import { type ChamadaIa, humanizarTexto, mascarar, montarFallback, validarTexto } from './wa-humanizar.ts'

const AGORA = new Date('2026-10-27T10:00:00Z')
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString()
const LINK_VINCULOS = 'https://desk.exemplo.com.br/automacoes-wa/vinculos'
const LINK_PAINEL = 'https://desk.exemplo.com.br/automacoes-wa/alertas'
const zero = () => 0

const grupo = (contact_id: string, cliente: string, detalhe: string, extra: Partial<AlertaCandidato> = {}): AlertaCandidato => ({
  tipo: 'grupo_sem_cliente', cliente, detalhe, client_id: null, contact_id, conversation_id: null, contract_id: null,
  desde: horasAtras(2), prioridade: 1, ...extra,
})
const semResposta: AlertaCandidato = {
  tipo: 'sem_resposta', cliente: 'Padaria Pão Quente', detalhe: 'esperando há 6h', client_id: 'cl1', contact_id: 'k1',
  conversation_id: 'c1', contract_id: null, desde: horasAtras(6), prioridade: 3, clienteAtivo: true, situacao: 'vigente',
}

describe('filtro', () => {
  it('não some pela regra automática de grupo sem cliente nem pela opção "só clientes ativos"', () => {
    const r = filtrarAlertas({
      sem_resposta: [semResposta],
      grupo_sem_cliente: [grupo('g1', 'Equipe Sorriso', '42 mensagens em 7 dias; parece ser de Clínica Sorriso')],
    }, [], AGORA, { soClientesAtivos: true })
    expect(r.alertas.grupo_sem_cliente).toHaveLength(1)
    expect(r.alertas.grupo_sem_cliente![0]).toMatchObject({ tipo: 'grupo_sem_cliente', contact_id: 'g1', chave_alerta: 'grupo_sem_cliente:g1' })
    expect(r.ocultos.sem_cadastro).toBe(0)
  })

  it('silenciado / ignorado pelo contato sai da lista', () => {
    const r = filtrarAlertas({ grupo_sem_cliente: [grupo('g1', 'A', '3 mensagens em 7 dias'), grupo('g2', 'B', '5 mensagens em 7 dias')] }, [
      { id: 'i1', tipo: 'grupo_sem_cliente', client_id: null, contact_id: 'g1', modo: 'ate_data', ate: horasAtras(-48), created_at: horasAtras(1) },
      { id: 'i2', tipo: 'todos', client_id: null, contact_id: 'g2', modo: 'sempre', ate: null, created_at: horasAtras(1) },
    ], AGORA)
    expect(r.alertas.grupo_sem_cliente).toEqual([])
    expect(r.ocultos.ignorados_pelo_gestor).toBe(2)
  })
})

describe('texto do aviso', () => {
  const itens = filtrarAlertas({
    sem_resposta: [semResposta],
    grupo_sem_cliente: [
      grupo('g1', 'Equipe Sorriso', '42 mensagens em 7 dias; parece ser de Clínica Sorriso'),
      grupo('g2', 'Projeto X', '3 mensagens em 7 dias'),
    ],
  }, [], AGORA).alertas
  const dados: DadosRelatorio = { data: '27/10/2026', alertas: itens, reunioes: [], linkPainel: LINK_PAINEL, linkVinculos: LINK_VINCULOS }

  it('seção no fim, com a chamada e o link da aba Vínculos', () => {
    const t = montarTextoRelatorio('Ana', dados)
    expect(secoesDosAlertas(dados).map((s) => s.tipo)).toEqual(['sem_resposta', 'grupo_sem_cliente'])
    expect(t).toContain([
      '*Grupos ativos sem cliente vinculado (2)*',
      '• Equipe Sorriso — 42 mensagens em 7 dias; parece ser de Clínica Sorriso',
      '• Projeto X — 3 mensagens em 7 dias',
      'Ligue cada grupo ao cliente certo (ou marque como interno / não é cliente) em:',
      LINK_VINCULOS,
    ].join('\n'))
    expect(t.indexOf('Clientes sem resposta')).toBeLessThan(t.indexOf('Grupos ativos sem cliente'))
    expect(t).toContain(LINK_PAINEL)
    expect(contarRelatorio(dados).grupo_sem_cliente).toBe(2)
  })

  it('sem APP_URL: a frase sai sem link', () => {
    const t = montarTextoRelatorio('Ana', { ...dados, linkVinculos: null })
    expect(t).toContain('na aba Vínculos do OMNX Desk.')
    expect(t).not.toContain('/vinculos')
  })

  it('agrupado por estrategista: grupos depois das seções por estrategista', () => {
    const t = montarTextoRelatorio('Ana', { ...dados, agruparPorEstrategista: true })
    const iEstr = t.indexOf('Pontos de atenção por estrategista')
    const iGrupos = t.indexOf('Grupos ativos sem cliente vinculado (2)')
    expect(iEstr).toBeGreaterThanOrEqual(0)
    expect(iGrupos).toBeGreaterThan(iEstr)
    expect(t).not.toContain('— grupo sem cliente:') // não entra no agrupamento
    // Só grupos (nenhum item com estrategista): nada de "Nenhum alerta hoje".
    const so = montarListasRelatorio({ ...dados, alertas: { grupo_sem_cliente: itens.grupo_sem_cliente }, agruparPorEstrategista: true }, zero)
    expect(so.alertas).not.toMatch(/nenhum alerta/i)
    expect(so.alertas).toContain(LINK_VINCULOS)
  })

  it('modelo oficial (uma linha, sem link)', () => {
    const v = montarTemplateRelatorio('Ana', dados).textoPrevia
    expect(v).toContain('Grupos sem cliente: Equipe Sorriso (42 mensagens em 7 dias; parece ser de Clínica Sorriso); Projeto X (3 mensagens em 7 dias)')
    expect(v).not.toContain('/vinculos')
  })

  it('humanização: o link dos vínculos vai dentro da lista literal e sobrevive', async () => {
    const pedido = pedidoHumanizacaoRelatorio('Bruno', dados, 'manha', zero)
    const m = mascarar(pedido)!
    expect(m.texto).not.toContain(LINK_VINCULOS) // a IA não vê o endereço
    expect(pedido.fatosNaMesmaLinha).toEqual(expect.arrayContaining([['Equipe Sorriso', '42 mensagens em 7 dias; parece ser de Clínica Sorriso']]))
    const chamarIa: ChamadaIa = async () => JSON.stringify({ texto: m.texto.replace(/Bom dia, \[GESTOR\]!/, 'Oi, [GESTOR], bom dia!') })
    const r = await humanizarTexto(pedido, { chamarIa, prazoMs: 10_000, memoria: new Map() })
    expect(r.origem).toBe('ia')
    expect(r.texto).toContain(`Ligue cada grupo ao cliente certo (ou marque como interno / não é cliente) em:\n${LINK_VINCULOS}`)
    expect(r.texto).toContain(LINK_PAINEL)
    for (let i = 0; i < 10; i++) {
      const fb = montarFallback(pedido)
      expect(validarTexto(fb.texto, pedido, { modo: 'fallback' }).ok).toBe(true)
      expect(fb.texto).toContain(LINK_VINCULOS)
    }
  })

  it('IA que inventa outro endereço é recusada', async () => {
    const pedido = pedidoHumanizacaoRelatorio('Bruno', dados, 'manha', zero)
    const m = mascarar(pedido)!
    const r = await humanizarTexto(pedido, {
      chamarIa: async () => JSON.stringify({ texto: `${m.texto}\nVeja também https://golpe.exemplo.com` }), prazoMs: 10_000, memoria: new Map(),
    })
    expect(r.origem).toBe('fallback')
    expect(r.texto).toContain(LINK_VINCULOS)
    expect(r.texto).not.toContain('golpe')
  })
})

describe('nomeGrupoSeguro', () => {
  it('mascara sequências de 6+ dígitos (telefone, documento) e mantém números curtos', () => {
    expect(nomeGrupoSeguro('Loja 51 99999-8888 vendas')).toBe('Loja ••• vendas')
    expect(nomeGrupoSeguro('CNPJ 12.345.678/0001-90')).toBe('CNPJ •••')
    expect(nomeGrupoSeguro('Turma 2026 *VIP*')).toBe('Turma 2026 VIP')
    expect(nomeGrupoSeguro('+5511987654321')).toBe('•••')
    expect(nomeGrupoSeguro('')).toBeNull()
  })
})
