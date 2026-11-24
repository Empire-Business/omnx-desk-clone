// Opções do relatório diário (27/10/2026): "Separar por estrategista" e
// "Só clientes ativos" — agrupamento, filtro e montagem (texto, humanização, oficial).
import { describe, expect, it } from 'vitest'
import { type AlertaCandidato, estrategistaPrincipal, filtrarAlertas } from './wa-alertas.ts'
import {
  type DadosRelatorio, type ItemAlerta, SEM_ESTRATEGISTA, agruparPorEstrategista, linhaForaSemCadastro,
  montarListasRelatorio, montarTemplateRelatorio, montarTextoRelatorio, normalizarOpcoesRelatorio,
  pedidoHumanizacaoRelatorio, pedidoHumanizacaoRelatorioGrupo,
} from './wa-relatorio.ts'
import { montarFallback, validarTexto } from './wa-humanizar.ts'
import { coletarAlertas } from './wa-relatorio-dados.ts'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'

const AGORA = new Date('2026-10-27T12:00:00Z')

/** Gerador com semente (mulberry32): testes repetíveis. */
function semente(n: number): () => number {
  let a = n >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function cand(p: Partial<AlertaCandidato> & Pick<AlertaCandidato, 'tipo' | 'cliente'>): AlertaCandidato {
  return {
    detalhe: 'x', client_id: null, contact_id: null, conversation_id: null, contract_id: null,
    desde: null, prioridade: 1, ...p,
  }
}

const it_ = (cliente: string, detalhe: string, estrategista_id?: string, estrategista?: string): ItemAlerta =>
  ({ cliente, detalhe, ...(estrategista_id ? { estrategista_id, estrategista } : {}) })

const agrupado: DadosRelatorio = {
  data: '27/10/2026',
  agruparPorEstrategista: true,
  alertas: {
    sem_resposta: [it_('Betânia', 'esperando há 6h', 'u-oct', 'Octavio'), it_('Contato sem nome (final 8888)', 'esperando há 5h')],
    sentimento_negativo: [it_('Loja Azul', 'reclamou do prazo', 'u-luis', 'Luis')],
    pendencia: [it_('Marina', 'contrato pausado', 'u-oct', 'Octavio')],
    queda_volume: [],
  },
  reunioes: [{ hora: '14:30', cliente: 'Padaria Sol' }],
  foraSemCadastro: 39,
}

describe('normalizarOpcoesRelatorio', () => {
  it('só true liga; linha ausente ou valor estranho → desligada', () => {
    expect(normalizarOpcoesRelatorio(null)).toEqual({ agruparPorEstrategista: false, soClientesAtivos: false })
    expect(normalizarOpcoesRelatorio({ relatorio_agrupar_estrategista: 'true', relatorio_so_clientes_ativos: 1 }))
      .toEqual({ agruparPorEstrategista: false, soClientesAtivos: false })
    expect(normalizarOpcoesRelatorio({ relatorio_agrupar_estrategista: true, relatorio_so_clientes_ativos: true }))
      .toEqual({ agruparPorEstrategista: true, soClientesAtivos: true })
  })
})

describe('estrategistaPrincipal', () => {
  it('só vínculo ativo do tipo estrategista; com mais de um, o mais recente', () => {
    const m = estrategistaPrincipal([
      { client_id: 'c1', user_id: 'u-velho', tipo: 'estrategista', ativo: true, criado_em: '2026-01-01T00:00:00Z' },
      { client_id: 'c1', user_id: 'u-novo', tipo: 'estrategista', ativo: true, criado_em: '2026-09-01T00:00:00Z' },
      { client_id: 'c1', user_id: 'u-inativo', tipo: 'estrategista', ativo: false, criado_em: '2026-10-01T00:00:00Z' },
      { client_id: 'c1', user_id: 'u-atend', tipo: 'atendimento', ativo: true, criado_em: '2026-10-02T00:00:00Z' },
      { client_id: 'c2', user_id: 'u-atend', tipo: 'atendimento', ativo: true },
    ])
    expect(m.get('c1')).toBe('u-novo')
    expect(m.has('c2')).toBe(false)
  })
  it('empate ou sem data: o menor id (estável)', () => {
    const m = estrategistaPrincipal([
      { client_id: 'c1', user_id: 'u-b', criado_em: null },
      { client_id: 'c1', user_id: 'u-a', criado_em: null },
    ])
    expect(m.get('c1')).toBe('u-a')
  })
})

describe('filtrarAlertas com "só clientes ativos"', () => {
  const candidatos = {
    sem_resposta: [
      cand({ tipo: 'sem_resposta', cliente: 'Ativo', client_id: 'c1', clienteAtivo: true, situacao: 'vigente' }),
      cand({ tipo: 'sem_resposta', cliente: 'Sem cadastro A', contact_id: 'k1' }),
      cand({ tipo: 'sem_resposta', cliente: 'Sem cadastro B', contact_id: 'k2' }),
      cand({ tipo: 'sem_resposta', cliente: 'Parado sem cadastro', contact_id: 'k3', foraDaJanela: true }),
      cand({ tipo: 'sem_resposta', cliente: 'Parado ativo', client_id: 'c3', clienteAtivo: true, foraDaJanela: true }),
      cand({ tipo: 'sem_resposta', cliente: 'Inativo', client_id: 'c2', clienteAtivo: false }),
    ],
    queda_volume: [
      cand({ tipo: 'queda_volume', cliente: 'Sem cadastro A', contact_id: 'k1' }), // mesmo contato: conta uma vez
      cand({ tipo: 'queda_volume', cliente: 'Cliente não encontrado', client_id: 'c9', clienteAtivo: null }),
    ],
  }

  it('desligada: tudo como antes', () => {
    const r = filtrarAlertas(candidatos, [], AGORA)
    expect(r.alertas.sem_resposta?.map((i) => i.cliente)).toEqual(['Ativo', 'Sem cadastro A', 'Sem cadastro B'])
    expect(r.foraSemCadastro).toBe(0)
    expect(r.ocultos.sem_cadastro).toBe(0)
    expect(r.paradas).toBe(2)
  })

  it('ligada: só cliente cadastrado e ativo; o resto vira contagem de contatos diferentes', () => {
    const r = filtrarAlertas(candidatos, [], AGORA, { soClientesAtivos: true })
    expect(r.alertas.sem_resposta?.map((i) => i.cliente)).toEqual(['Ativo'])
    expect(r.alertas.queda_volume).toEqual([])
    // k1, k2 e o cliente c9 (sem cadastro encontrado); k3 já passou da janela.
    expect(r.foraSemCadastro).toBe(3)
    expect(r.ocultos.sem_cadastro).toBe(5)
    // Inativo continua com o motivo de sempre.
    expect(r.ocultos.cliente_inativo).toBe(1)
    // Paradas: só a do cliente ativo.
    expect(r.paradas).toBe(1)
  })

  it('ligada: tira só a pendência do contrato pausado, sem esconder outra pendência do mesmo cliente', () => {
    const pausado = cand({
      tipo: 'pendencia', cliente: 'Cliente com dois contratos', detalhe: 'contrato pausado',
      client_id: 'c1', contract_id: 'pausado', clienteAtivo: true, situacao: 'vigente',
      contratoPausado: true, desde: '2026-10-01T12:00:00Z',
    })
    const emAndamento = cand({
      tipo: 'pendencia', cliente: 'Cliente com dois contratos', detalhe: 'contrato não iniciado',
      client_id: 'c1', clienteAtivo: true, situacao: 'vigente', desde: '2026-10-27T08:00:00Z',
    })
    const r = filtrarAlertas({ pendencia: [pausado, emAndamento] }, [], AGORA, { soClientesAtivos: true })
    expect(r.alertas.pendencia?.map((i) => i.detalhe)).toEqual(['contrato não iniciado'])
    expect(r.ocultos.contrato_pausado).toBe(1)
    expect(r.ocultos.cliente_repetido).toBe(0)
    expect(r.foraSemCadastro).toBe(0)
  })

  it('desligada: mantém a pendência pausada; o sinal não depende do texto exibido', () => {
    const pausado = cand({
      tipo: 'pendencia', cliente: 'Cliente ativo', detalhe: 'plano temporariamente suspenso',
      client_id: 'c1', contract_id: 'pausado', clienteAtivo: true, situacao: 'vigente', contratoPausado: true,
    })
    const r = filtrarAlertas({ pendencia: [pausado] }, [], AGORA, { soClientesAtivos: false })
    expect(r.alertas.pendencia?.map((i) => i.contract_id)).toEqual(['pausado'])
    expect(r.ocultos.contrato_pausado).toBe(0)
    const ligado = filtrarAlertas({ pendencia: [pausado] }, [], AGORA, { soClientesAtivos: true })
    expect(ligado.alertas.pendencia).toEqual([])
    expect(ligado.ocultos.contrato_pausado).toBe(1)
  })
})

describe('coleta com contratos pausados e "só clientes ativos"', () => {
  function banco() {
    const tenant = 'empresa-1'
    const clientes = ['pausado', 'misto', 'inadimplente', 'nao-iniciado'].map((id) => ({
      id, tenant_id: tenant, nome: id, ativo: true,
    }))
    const contrato = (id: string, cliente_id: string, status_secundario: string | null) => ({
      id, tenant_id: tenant, cliente_id, cliente_nome: cliente_id, status: 'ativo', status_secundario,
      atualizado_em: '2026-10-26T12:00:00Z', data_fechamento: '2026-10-01', data_assinatura: null, plano_dias: 90,
    })
    return criarSupabaseFalso({
      clients: [...clientes, { id: 'fora', tenant_id: 'outra-empresa', nome: 'Fora da empresa', ativo: true }],
      contratos: [
        contrato('ct-pausado', 'pausado', 'PAUSADO'),
        contrato('ct-misto-pausado', 'misto', 'PAUSADO'),
        contrato('ct-misto-ativo', 'misto', 'ATIVO'),
        contrato('ct-inadimplente', 'inadimplente', 'INADIMPLENTE'),
        contrato('ct-nao-iniciado', 'nao-iniciado', 'Não iniciado'),
        { ...contrato('ct-fora', 'fora', 'INADIMPLENTE'), tenant_id: 'outra-empresa' },
      ],
      chat_contacts: [{
        id: 'contato-misto', tenant_id: tenant, client_id: 'misto', nome: 'misto', numero_whatsapp: '5521999998888',
        bloqueado: false, group_size: null,
      }],
      chat_conversations: [{
        id: 'conversa-misto', tenant_id: tenant, contact_id: 'contato-misto', aguardando_resposta: true,
        arquivada: false, status: 'aberta', ultima_msg_cliente_em: '2026-10-27T06:00:00Z', is_group: false, silenciado: false,
      }],
    }, { wa_auto_grupos_sem_cliente: () => [] })
  }

  for (const soClientesAtivos of [true, false]) {
    it(`opção ${soClientesAtivos ? 'ligada' : 'desligada'}: coleta status interno sem perder outros alertas nem cruzar empresas`, async () => {
      const f = banco()
      const r = await coletarAlertas(f.client, 'empresa-1', [
        { tipo: 'sem_resposta', ativo: true, limiar: 4 },
        { tipo: 'pendencia', ativo: true, limiar: 0 },
      ], AGORA, 'America/Sao_Paulo', { agruparPorEstrategista: false, soClientesAtivos })
      expect(r.dados.alertas.sem_resposta?.map((a) => a.client_id)).toEqual(['misto'])
      expect(r.dados.alertas.pendencia?.map((a) => a.contract_id)).toEqual([
        'ct-inadimplente', 'ct-nao-iniciado', ...(!soClientesAtivos ? ['ct-pausado'] : []),
      ])
      expect(r.ocultos.contrato_pausado).toBe(soClientesAtivos ? 2 : 0)
      expect(r.dados.foraSemCadastro).toBeUndefined()
      expect(f.inseridos).toEqual([])
      expect(f.atualizados).toEqual([])
      expect(f.consultas.length).toBeGreaterThan(0)
      for (const consulta of f.consultas) expect(consulta.filtros).toContain('eq:tenant_id')
    })
  }
})

describe('agruparPorEstrategista', () => {
  it('grupos em ordem alfabética, "Sem estrategista" por último, itens na ordem das seções', () => {
    const g = agruparPorEstrategista(agrupado)
    expect(g.map((x) => x.nome)).toEqual(['Luis', 'Octavio', SEM_ESTRATEGISTA])
    expect(g[1].itens.map((i) => [i.tipo, i.cliente])).toEqual([['sem_resposta', 'Betânia'], ['pendencia', 'Marina']])
    expect(g[2].semEstrategista).toBe(true)
  })
  it('nome do estrategista passa por nomeSeguro; mesmo id = mesmo grupo', () => {
    const g = agruparPorEstrategista({
      alertas: { pendencia: [it_('A', 'contrato pausado', 'u1', '*Octavio*\nhttps://x.com'), it_('B', 'contrato pausado', 'u1', 'Octavio')] },
    })
    expect(g).toHaveLength(1)
    expect(g[0].nome).not.toMatch(/[*\n]/)
    expect(g[0].itens).toHaveLength(2)
  })
})

describe('montagem agrupada por estrategista', () => {
  it('texto: cabeçalho, um grupo por estrategista com tipo e motivo, linha discreta dos que ficaram fora', () => {
    const t = montarTextoRelatorio('Bruno', agrupado)
    expect(t).toContain('*Pontos de atenção por estrategista (4)*')
    expect(t).toContain('Octavio (2):\n• Betânia — sem resposta: esperando há 6h\n• Marina — pendência: contrato pausado')
    expect(t).toContain('Luis (1):\n• Loja Azul — insatisfeito: reclamou do prazo')
    expect(t).toContain(`${SEM_ESTRATEGISTA} (1):`)
    expect(t).not.toContain('+ 39 ocorrências de contatos sem cadastro ficaram fora')
    expect(t).not.toMatch(/reuni|agenda|14:30|Padaria Sol/i)
    expect(t).not.toContain('Clientes sem resposta')
  })

  it('por estrategista, todos os itens aparecem (sem "e mais N")', () => {
    const muitos = Array.from({ length: 13 }, (_, i) => it_(`Cliente ${i}`, 'contrato pausado', 'u1', 'Octavio'))
    const t = montarTextoRelatorio('Bruno', { data: '27/10/2026', agruparPorEstrategista: true, alertas: { pendencia: muitos }, reunioes: [] })
    expect(t).toContain('Octavio (13):')
    expect(t).toContain('Cliente 12')
    expect(t).not.toMatch(/e mais \d/)
  })

  it('humanização: a lista agrupada é o bloco literal [ITENS_ALERTAS] e cliente + motivo ficam na mesma linha', () => {
    const p = pedidoHumanizacaoRelatorio('Bruno', agrupado, 'manha', semente(4))
    const bloco = p.fatos.find((f) => f.marcador === 'ITENS_ALERTAS')
    expect(bloco?.bloco).toBe(true)
    expect(bloco?.valor).toContain('Octavio (2):')
    expect(bloco?.valor).not.toContain('+ 39 ocorrências de contatos sem cadastro ficaram fora')
    expect(p.fatosNaMesmaLinha).toEqual(expect.arrayContaining([
      ['Betânia', 'esperando há 6h'], ['Marina', 'contrato pausado'], ['Loja Azul', 'reclamou do prazo'],
    ]))
    // Nenhum nome de estrategista/cliente vai como fato solto (só dentro do bloco).
    expect(p.fatos.filter((f) => !f.bloco).map((f) => f.valor)).not.toContain('Octavio')
    expect(p.fatos.some((f) => f.marcador === 'ITENS_REUNIOES')).toBe(false)
    expect(p.textoBase).not.toMatch(/reuni|agenda|14:30|Padaria Sol/i)
  })

  it('fallback agrupado sempre válido (privado e grupo)', () => {
    const r = semente(21)
    for (let i = 0; i < 20; i++) {
      const p = i % 2 ? pedidoHumanizacaoRelatorio('Bruno', agrupado, 'tarde', semente(i)) : pedidoHumanizacaoRelatorioGrupo(agrupado, 'tarde', semente(i))
      const f = montarFallback(p, { aleatorio: r })
      expect(validarTexto(f.texto, p, { modo: 'fallback' })).toEqual({ ok: true })
      for (const n of ['Octavio', 'Luis', SEM_ESTRATEGISTA, 'Marina', 'reclamou do prazo']) expect(f.texto).toContain(n)
      expect(f.texto).not.toMatch(/reuni|agenda|14:30|Padaria Sol/i)
    }
  })

  it('variação determinística: mesma semente → mesmas listas', () => {
    expect(montarListasRelatorio(agrupado, semente(5))).toEqual(montarListasRelatorio(agrupado, semente(5)))
    expect(montarListasRelatorio(agrupado, semente(5)).reunioes).toBe('')
  })

  it('oficial: tudo numa linha, agrupado por estrategista', () => {
    const t = montarTemplateRelatorio('Bruno', agrupado)
    const alertas = t.variaveis[2]
    expect(alertas).not.toContain('\n')
    expect(alertas).toBe(
      'Luis: Loja Azul (insatisfeito, reclamou do prazo); Octavio: Betânia (sem resposta, esperando há 6h), Marina (pendência, contrato pausado); '
      + `${SEM_ESTRATEGISTA}: Contato sem nome (final 8888) (sem resposta, esperando há 5h)`,
    )
    expect(t.variaveis).toHaveLength(3)
    expect(t.textoPrevia).not.toMatch(/reuni|agenda|14:30|Padaria Sol/i)
  })

  it('oficial: respeita o limite de tamanho com "e mais N"', () => {
    const muitos = Array.from({ length: 60 }, (_, i) => it_(`Cliente número ${i}`, 'contrato pausado', `u${i % 3}`, `Estrategista ${i % 3}`))
    const t = montarTemplateRelatorio('Bruno', { data: '27/10/2026', agruparPorEstrategista: true, alertas: { pendencia: muitos }, reunioes: [] })
    expect(t.variaveis[2].length).toBeLessThanOrEqual(600)
    expect(t.variaveis[2]).toMatch(/ e mais \d+$/)
  })

  it('sem nenhum item: frase de "nenhum alerta" + linha dos que ficaram fora (sem "tranquilo")', () => {
    const vazio: DadosRelatorio = { data: '27/10/2026', agruparPorEstrategista: true, alertas: { sem_resposta: [] }, reunioes: [], foraSemCadastro: 2 }
    for (let i = 0; i < 10; i++) {
      const l = montarListasRelatorio(vazio, semente(i))
      expect(l.alertas).toMatch(/^(Nenhum alerta novo hoje\.|Sem alertas novos hoje\.)$/)
    }
    expect(montarTemplateRelatorio('Bruno', vazio).variaveis[2]).toBe('nenhum')
  })
})

describe('só clientes ativos sem agrupar', () => {
  it('linha discreta no fim da lista normal; singular', () => {
    expect(linhaForaSemCadastro({ foraSemCadastro: 1 })).toBe('+ 1 ocorrência de contato sem cadastro ficou fora')
    expect(linhaForaSemCadastro({ foraSemCadastro: 0 })).toBeNull()
    const t = montarTextoRelatorio('Bruno', {
      data: '27/10/2026', alertas: { pendencia: [it_('Marina', 'contrato pausado')] }, reunioes: [], foraSemCadastro: 4,
    })
    expect(t).toContain('• Marina — contrato pausado')
    expect(t).not.toContain('ocorrências de contatos sem cadastro')
  })
  it('opção desligada não muda nada (mesma lista de antes)', () => {
    const d: DadosRelatorio = { data: '27/10/2026', alertas: { pendencia: [it_('Marina', 'contrato pausado')] }, reunioes: [] }
    expect(montarListasRelatorio({ ...d, foraSemCadastro: 0 }, semente(3))).toEqual(montarListasRelatorio(d, semente(3)))
  })
})
