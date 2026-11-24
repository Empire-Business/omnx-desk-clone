import { describe, expect, it } from 'vitest'
import {
  type AlertaCandidato, type Ignorado, chaveAlerta, clientePorNome, compararAlertas, contatoEhGrupo, contratoNoPrazo,
  filtrarAlertas, ignoradoCobre, ignoradoOculta, ignoradoValendo, motivoAutomatico, prioridadePorVinculo, situacaoContratual,
  statusEncerrado,
} from './wa-alertas.ts'
import {
  type DadosRelatorio, linhaParadas, linkPainelSeguro, montarTemplateRelatorio, montarTextoRelatorio,
  normalizarRegras, pedidoHumanizacaoRelatorio,
} from './wa-relatorio.ts'
import { desmascarar, humanizarTexto, mascarar, montarFallback, validarTexto } from './wa-humanizar.ts'

const AGORA = new Date('2026-10-26T12:00:00Z')
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString()

function cand(p: Partial<AlertaCandidato> & Pick<AlertaCandidato, 'tipo' | 'cliente'>): AlertaCandidato {
  return {
    detalhe: 'x', client_id: null, contact_id: null, conversation_id: null, contract_id: null,
    desde: null, prioridade: 1, ...p,
  }
}

describe('situação contratual e prazo', () => {
  it('encerrado só quando TODOS os contratos estão cancelados/concluídos', () => {
    expect(situacaoContratual([])).toBe('sem_contrato')
    expect(situacaoContratual(['cancelado', 'concluido'])).toBe('encerrado')
    expect(situacaoContratual(['Concluído', 'CANCELADO'])).toBe('encerrado')
    expect(situacaoContratual(['cancelado', 'ativo'])).toBe('vigente')
    expect(situacaoContratual(['rascunho'])).toBe('vigente')
    expect(situacaoContratual([null])).toBe('vigente') // na dúvida, alerta
    expect(statusEncerrado('pausado')).toBe(false)
  })
  it('prazo do plano: início + plano_dias; sem dado ou data lixo → vale', () => {
    expect(contratoNoPrazo({ data_assinatura: '2026-09-01', plano_dias: 90 }, AGORA)).toBe(true)
    expect(contratoNoPrazo({ data_assinatura: '2025-01-01', plano_dias: 365 }, AGORA)).toBe(false)
    expect(contratoNoPrazo({ data_fechamento: '2026-07-28', plano_dias: 90 }, AGORA)).toBe(true) // último dia = 26/10
    expect(contratoNoPrazo({ data_fechamento: '2026-07-27', plano_dias: 90 }, AGORA)).toBe(false)
    expect(contratoNoPrazo({ data_assinatura: null, data_fechamento: null, plano_dias: 90 }, AGORA)).toBe(true)
    expect(contratoNoPrazo({ data_fechamento: '1900-01-01', plano_dias: 90 }, AGORA)).toBe(true)
    expect(contratoNoPrazo({ data_fechamento: '2025-01-01', plano_dias: null }, AGORA)).toBe(true)
  })
  it('grupo pelo número/tamanho e cliente pelo nome (só se único)', () => {
    expect(contatoEhGrupo('120363000000000000@g.us')).toBe(true)
    expect(contatoEhGrupo('120363025552222333444')).toBe(true)
    expect(contatoEhGrupo('5511999998888')).toBe(false)
    expect(contatoEhGrupo('5511999998888', 12)).toBe(true)
    const lista = [{ id: 'a', nome: 'Padaria Sol' }, { id: 'b', nome: 'Loja  Azul' }, { id: 'c', nome: 'loja azul' }]
    expect(clientePorNome('PADARIA SÓL', lista)).toBe('a')
    expect(clientePorNome('Loja Azul', lista)).toBeNull() // ambíguo
    expect(clientePorNome('Outra', lista)).toBeNull()
  })
})

describe('regras automáticas', () => {
  it('motivo na ordem: bloqueado > grupo sem cliente > silenciada > inativo > encerrado > fora do prazo', () => {
    expect(motivoAutomatico(cand({ tipo: 'sem_resposta', cliente: 'A', contatoBloqueado: true, grupo: true }))).toBe('contato_bloqueado')
    expect(motivoAutomatico(cand({ tipo: 'sem_resposta', cliente: 'A', grupo: true }))).toBe('grupo_sem_cliente')
    expect(motivoAutomatico(cand({ tipo: 'sem_resposta', cliente: 'A', grupo: true, client_id: 'c1', situacao: 'vigente' }))).toBeNull()
    expect(motivoAutomatico(cand({ tipo: 'sem_resposta', cliente: 'A', silenciada: true }))).toBe('conversa_silenciada')
    expect(motivoAutomatico(cand({ tipo: 'pendencia', cliente: 'A', client_id: 'c1', clienteAtivo: false, situacao: 'encerrado' }))).toBe('cliente_inativo')
    expect(motivoAutomatico(cand({ tipo: 'sem_resposta', cliente: 'Full Sales', client_id: 'c1', clienteAtivo: true, situacao: 'encerrado' }))).toBe('contrato_encerrado')
    expect(motivoAutomatico(cand({ tipo: 'pendencia', cliente: 'A', client_id: 'c1', clienteAtivo: true, situacao: 'vigente', contratoForaDoPrazo: true }))).toBe('contrato_fora_do_prazo')
    // Contato sem cadastro e sem contrato não some (pode ser cliente novo).
    expect(motivoAutomatico(cand({ tipo: 'sem_resposta', cliente: 'Lead' }))).toBeNull()
    expect(motivoAutomatico(cand({ tipo: 'sem_resposta', cliente: 'A', client_id: 'c1', clienteAtivo: true, situacao: 'sem_contrato' }))).toBeNull()
  })

  it('prioridade: contrato vigente > cliente > contato sem cadastro', () => {
    expect(prioridadePorVinculo('c1', 'vigente')).toBe(3)
    expect(prioridadePorVinculo('c1', 'sem_contrato')).toBe(2)
    expect(prioridadePorVinculo(null, null)).toBe(1)
  })

  it('ordem: prioridade, depois quem espera há MAIS tempo; sem data no fim', () => {
    const l = [
      cand({ tipo: 'sem_resposta', cliente: 'Lead 6h', prioridade: 1, desde: horasAtras(6) }),
      cand({ tipo: 'sem_resposta', cliente: 'Vigente 5h', prioridade: 3, desde: horasAtras(5) }),
      cand({ tipo: 'sem_resposta', cliente: 'Vigente 3 dias', prioridade: 3, desde: horasAtras(72) }),
      cand({ tipo: 'sem_resposta', cliente: 'Vigente sem data', prioridade: 3, desde: null }),
    ].sort(compararAlertas)
    expect(l.map((x) => x.cliente)).toEqual(['Vigente 3 dias', 'Vigente 5h', 'Vigente sem data', 'Lead 6h'])
  })

  it('chave estável: tipo + client_id || contact_id || conversation_id', () => {
    expect(chaveAlerta(cand({ tipo: 'sem_resposta', cliente: 'A', client_id: 'c1', contact_id: 'k1', conversation_id: 'v1' }))).toBe('sem_resposta:c1')
    expect(chaveAlerta(cand({ tipo: 'sem_resposta', cliente: 'A', contact_id: 'k1', conversation_id: 'v1' }))).toBe('sem_resposta:k1')
    expect(chaveAlerta(cand({ tipo: 'sem_resposta', cliente: 'A', conversation_id: 'v1' }))).toBe('sem_resposta:v1')
    expect(chaveAlerta(cand({ tipo: 'pendencia', cliente: 'A', contract_id: 'ct1' }))).toBe('pendencia:ct1')
  })
})

describe('ignorados pelo gestor', () => {
  const base: Ignorado = { id: 'i1', tipo: 'sem_resposta', client_id: 'c1', contact_id: null, modo: 'sempre', ate: null, created_at: horasAtras(48) }

  it('sempre: vale para sempre', () => {
    expect(ignoradoValendo(base, AGORA)).toBe(true)
  })
  it('ate_data: até `ate`; sem data válida não vale', () => {
    expect(ignoradoValendo({ ...base, modo: 'ate_data', ate: '2026-10-27T02:59:59.999Z' }, AGORA)).toBe(true)
    expect(ignoradoValendo({ ...base, modo: 'ate_data', ate: horasAtras(1) }, AGORA)).toBe(false)
    expect(ignoradoValendo({ ...base, modo: 'ate_data', ate: null }, AGORA)).toBe(false)
  })
  it('resolvido e ate_novidade: até haver novidade DEPOIS do pedido', () => {
    for (const modo of ['resolvido', 'ate_novidade'] as const) {
      expect(ignoradoValendo({ ...base, modo }, AGORA)).toBe(true)
      expect(ignoradoValendo({ ...base, modo, novidade_em: horasAtras(72) }, AGORA)).toBe(true) // antes do pedido
      expect(ignoradoValendo({ ...base, modo, novidade_em: horasAtras(1) }, AGORA)).toBe(false) // cliente escreveu
    }
  })
  it('modo desconhecido não vale (na dúvida, o alerta aparece)', () => {
    expect(ignoradoValendo({ ...base, modo: 'xyz' }, AGORA)).toBe(false)
  })
  it('novidade não reabre diagnóstico contextual anterior à resolução; análise posterior pode reabrir', () => {
    const antigo = cand({ tipo: 'sentimento_negativo', cliente: 'A', client_id: 'c1', desde: horasAtras(72), evidencia_em: horasAtras(72) })
    for (const modo of ['resolvido', 'ate_novidade'] as const) {
      const i = { ...base, tipo: 'sentimento_negativo', modo, novidade_em: horasAtras(1) }
      expect(ignoradoOculta(i, antigo, AGORA)).toBe(true)
      expect(ignoradoOculta(i, { ...antigo, evidencia_em: null, desde: horasAtras(1) }, AGORA)).toBe(true)
      expect(ignoradoOculta(i, { ...antigo, evidencia_em: horasAtras(2) }, AGORA)).toBe(false)
      expect(ignoradoOculta({ ...i, tipo: 'todos' }, cand({ tipo: 'sem_resposta', cliente: 'A', client_id: 'c1', desde: horasAtras(1) }), AGORA)).toBe(false)
    }
  })
  it('client_id cobre todos os alertas do cliente (qualquer contato); contact_id só o contato', () => {
    const a = cand({ tipo: 'sem_resposta', cliente: 'A', client_id: 'c1', contact_id: 'k2' })
    expect(ignoradoCobre(base, a)).toBe(true)
    expect(ignoradoCobre(base, { ...a, tipo: 'pendencia' })).toBe(false)
    expect(ignoradoCobre({ ...base, tipo: 'todos' }, { ...a, tipo: 'pendencia' })).toBe(true)
    expect(ignoradoCobre({ ...base, client_id: null, contact_id: 'k1' }, a)).toBe(false)
    expect(ignoradoCobre({ ...base, client_id: null, contact_id: 'k2' }, a)).toBe(true)
    expect(ignoradoCobre({ ...base, client_id: 'c9' }, a)).toBe(false)
  })
})

describe('filtrarAlertas', () => {
  const porTipo = {
    sem_resposta: [
      cand({ tipo: 'sem_resposta', cliente: 'Grupo solto', grupo: true, conversation_id: 'v0', desde: horasAtras(10) }),
      cand({ tipo: 'sem_resposta', cliente: 'Lead', contact_id: 'k1', conversation_id: 'v1', desde: horasAtras(6) }),
      cand({ tipo: 'sem_resposta', cliente: 'Ana', client_id: 'c1', contact_id: 'k2', conversation_id: 'v2', desde: horasAtras(30), prioridade: 3, clienteAtivo: true, situacao: 'vigente' }),
      cand({ tipo: 'sem_resposta', cliente: 'Ana', client_id: 'c1', contact_id: 'k3', conversation_id: 'v3', desde: horasAtras(8), prioridade: 3, clienteAtivo: true, situacao: 'vigente' }),
      cand({ tipo: 'sem_resposta', cliente: 'Antigo', client_id: 'c2', conversation_id: 'v4', desde: horasAtras(24 * 228), prioridade: 3, clienteAtivo: true, situacao: 'vigente', foraDaJanela: true }),
      cand({ tipo: 'sem_resposta', cliente: 'Full Sales', client_id: 'c3', conversation_id: 'v5', desde: horasAtras(12), prioridade: 2, clienteAtivo: true, situacao: 'encerrado' }),
      cand({ tipo: 'sem_resposta', cliente: 'Silenciado', client_id: 'c4', conversation_id: 'v6', desde: horasAtras(12), prioridade: 3, clienteAtivo: true, situacao: 'vigente' }),
    ],
    pendencia: [
      cand({ tipo: 'pendencia', cliente: 'Ana', client_id: 'c1', contract_id: 'ct1', detalhe: 'contrato inadimplente', prioridade: 3, clienteAtivo: true, situacao: 'vigente' }),
      cand({ tipo: 'pendencia', cliente: 'Inativo', client_id: 'c5', contract_id: 'ct2', detalhe: 'contrato inadimplente', prioridade: 3, clienteAtivo: false }),
      cand({ tipo: 'pendencia', cliente: 'Vencido', client_id: 'c6', contract_id: 'ct3', detalhe: 'contrato inadimplente', prioridade: 3, clienteAtivo: true, situacao: 'vigente', contratoForaDoPrazo: true }),
      cand({ tipo: 'pendencia', cliente: 'Bia', client_id: 'c7', contract_id: 'ct4', detalhe: 'contrato pausado', prioridade: 1, clienteAtivo: true, situacao: 'vigente' }),
    ],
  }
  const ignorados: Ignorado[] = [
    { id: 'i1', tipo: 'sem_resposta', client_id: 'c4', contact_id: null, modo: 'ate_novidade', ate: null, created_at: horasAtras(2) },
    { id: 'i2', tipo: 'todos', client_id: 'c7', contact_id: null, modo: 'ate_data', ate: horasAtras(1), created_at: horasAtras(200) }, // vencido
  ]

  it('tira o ruído, conta por motivo e não repete cliente', () => {
    const r = filtrarAlertas(porTipo, ignorados, AGORA)
    expect(r.alertas.sem_resposta?.map((a) => a.cliente)).toEqual(['Ana', 'Lead'])
    expect(r.alertas.sem_resposta?.[0]).toMatchObject({ conversation_id: 'v2', chave_alerta: 'sem_resposta:c1', prioridade: 3 })
    // Ana já saiu no "sem resposta": a pendência dela não repete. O pedido vencido não vale.
    expect(r.alertas.pendencia?.map((a) => a.cliente)).toEqual(['Bia'])
    expect(r.alertas.sentimento_negativo).toBeUndefined() // regra desligada continua fora
    expect(r.paradas).toBe(1)
    expect(r.ocultos).toMatchObject({
      grupo_sem_cliente: 1, contrato_encerrado: 1, ignorados_pelo_gestor: 1, fora_da_janela: 1,
      cliente_inativo: 1, contrato_fora_do_prazo: 1, cliente_repetido: 2,
    })
  })

  it('pedido do gestor tira também da contagem de paradas', () => {
    const r = filtrarAlertas(porTipo, [{ id: 'x', tipo: 'todos', client_id: 'c2', contact_id: null, modo: 'sempre', ate: null, created_at: horasAtras(1) }], AGORA)
    expect(r.paradas).toBe(0)
  })

  it('preserva o motivo contextual em vez de só mostrar horas sem resposta', () => {
    const espera = cand({ tipo: 'sem_resposta', cliente: 'Cliente A', client_id: 'c1', detalhe: 'esperando há 18h', prioridade: 3, clienteAtivo: true })
    const risco = cand({ tipo: 'sentimento_negativo', cliente: 'Cliente A', client_id: 'c1', detalhe: 'risco alto: pedido contratual reiterado sem solução', nivel: 'risco', prioridade: 3, clienteAtivo: true })
    const r = filtrarAlertas({ sem_resposta: [espera], sentimento_negativo: [risco] }, [], AGORA)
    expect(r.alertas.sentimento_negativo).toHaveLength(1)
    expect(r.alertas.sentimento_negativo?.[0].detalhe).toBe(risco.detalhe)
    expect(r.alertas.sem_resposta).toEqual([])
    expect(r.ocultos.cliente_repetido).toBe(1)
  })

  it('análise ignorada ou silenciada não esconde um alerta de outra conversa', () => {
    const espera = cand({ tipo: 'sem_resposta', cliente: 'Cliente A', client_id: 'c1', conversation_id: 'v1', clienteAtivo: true })
    const risco = cand({ tipo: 'sentimento_negativo', cliente: 'Cliente A', client_id: 'c1', conversation_id: 'v2', nivel: 'atencao', clienteAtivo: true })
    const ignorado: Ignorado = { id: 'i', tipo: 'sentimento_negativo', client_id: 'c1', contact_id: null, modo: 'sempre', ate: null, created_at: horasAtras(1) }
    for (const [contexto, ignorados] of [[risco, [ignorado]], [{ ...risco, silenciada: true }, []]] as const) {
      const r = filtrarAlertas({ sem_resposta: [espera], sentimento_negativo: [contexto] }, ignorados, AGORA)
      expect(r.alertas.sentimento_negativo).toEqual([])
      expect(r.alertas.sem_resposta).toHaveLength(1)
    }
  })
})

describe('mensagem: linha das paradas e link do painel', () => {
  const LINK = 'https://desk.omnx.pro/automacoes-wa/alertas'
  const dados: DadosRelatorio = {
    data: '26/10/2026',
    alertas: { sem_resposta: [{ cliente: 'Ana', detalhe: 'esperando há 1 dia' }], pendencia: [] },
    reunioes: [],
    paradas: { quantidade: 12, dias: 7 },
    linkPainel: LINK,
  }

  it('linha literal das paradas; link só https', () => {
    expect(linhaParadas(dados)).toBe('+ 12 conversas paradas há mais de 7 dias')
    expect(linhaParadas({ paradas: { quantidade: 1, dias: 7 } })).toBe('+ 1 conversa parada há mais de 7 dias')
    expect(linhaParadas({})).toBeNull()
    expect(linkPainelSeguro('http://x.com/a')).toBeNull()
    expect(linkPainelSeguro('https://user:pw@x.com/a')).toBeNull()
    expect(linkPainelSeguro('')).toBeNull()
    expect(linkPainelSeguro(LINK)).toBe(LINK)
  })

  it('texto (prévia) e oficial levam a linha; o link só no texto', () => {
    const t = montarTextoRelatorio('Bruno', dados)
    expect(t).toContain('• Ana — esperando há 1 dia')
    expect(t.endsWith(`\n${LINK}`)).toBe(true)
    expect(montarTextoRelatorio('Bruno', { ...dados, linkPainel: null })).not.toContain('https://')
    const o = montarTemplateRelatorio('Bruno', dados)
    expect(o.textoPrevia).not.toContain('+ 12 conversas paradas há mais de 7 dias')
    expect(o.textoPrevia).not.toContain(LINK)
    // Sem nenhuma seção, a linha sai sozinha depois do "nenhum alerta".
    const vazio = montarTextoRelatorio('Bruno', { ...dados, alertas: { sem_resposta: [] } })
    expect(vazio).toContain('Nenhum alerta hoje.')
  })

  it('humanização: link vai como [LINK], paradas dentro do bloco literal; fallback válido', async () => {
    const p = pedidoHumanizacaoRelatorio('Bruno', dados, 'manha', () => 0.3)
    const m = mascarar(p)!
    expect(m).not.toBeNull()
    expect(m.texto).toContain('[LINK]')
    expect(m.texto).not.toContain('https://')
    expect(m.texto).not.toContain('paradas') // está dentro de [ITENS_ALERTAS]
    const fb = montarFallback(p, { aleatorio: () => 0.42 }).texto
    expect(validarTexto(fb, p, { modo: 'fallback' })).toEqual({ ok: true })
    expect(fb).toContain(LINK)
    expect(fb).not.toContain('+ 12 conversas paradas há mais de 7 dias')

    // IA que troca o link → recusa; que some com ele → recusa.
    const valida = (ia: string) => {
      const d = desmascarar(ia, m)
      return d.ok ? validarTexto(d.texto, p, { modo: 'ia' }) : d
    }
    const ok = 'Bom dia, [GESTOR]! Pontos de [DATA]:\n[ITENS_ALERTAS]\nPelo link dá para silenciar ou ajustar:\n[LINK]'
    expect(valida(ok)).toEqual({ ok: true })
    expect(valida(ok.replace('[LINK]', 'https://golpe.com/alertas'))).toMatchObject({ ok: false })
    expect(valida(ok.replace('\n[LINK]', ''))).toEqual({ ok: false, motivo: 'marcador_ausente' })
    expect(valida(`${ok}\n[LINK]`)).toEqual({ ok: false, motivo: 'marcador_repetido' })

    // Orquestração sem IA: sai o fallback, com link e linha das paradas.
    const r = await humanizarTexto(p, { chamarIa: null, prazoMs: 0, memoria: new Map() })
    expect(r.origem).toBe('fallback')
    expect(r.texto).toContain(LINK)
  })
})

describe('normalizarRegras: janela do sem resposta', () => {
  it('lê janela_dias válida (1..90) só do sem_resposta; inválida → ausente (padrão 7)', () => {
    expect(normalizarRegras([{ tipo: 'sem_resposta', ativo: true, limiar: 4, janela_dias: 10 }])[0].janelaDias).toBe(10)
    expect(normalizarRegras([{ tipo: 'sem_resposta', ativo: true, limiar: 4, janela_dias: 0 }])[0].janelaDias).toBeUndefined()
    expect(normalizarRegras([{ tipo: 'sem_resposta', ativo: true, limiar: 4, janela_dias: 3.5 }])[0].janelaDias).toBeUndefined()
    expect(normalizarRegras([{ tipo: 'queda_volume', ativo: true, limiar: 4, janela_dias: 10 }])[3].janelaDias).toBeUndefined()
  })
})
