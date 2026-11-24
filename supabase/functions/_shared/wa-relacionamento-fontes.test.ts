import { describe, expect, it } from 'vitest'
import { montarTranscricaoCliente, type LinhaTimeline } from './cliente-timeline.ts'
import { ESTADO_VAZIO, calcularRisco, lerEstado, lerPendencias, responsabilidadeDaPendencia, validarRelacionamento, type Pendencia } from './wa-relacionamento.ts'
import { detalheDoPedido, detalheRisco, trechoDaFonte } from './wa-satisfacao.ts'
import { montarTemplateRelatorio } from './wa-relatorio.ts'
import { coletarAlertas } from './wa-relatorio-dados.ts'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'
import { calcularMetricas } from './cliente-metricas.ts'

const AGORA = new Date('2026-11-06T15:00:00Z')
const ID = '11111111-1111-4111-8111-111111111111'
const OUTRO = '22222222-2222-4222-8222-222222222222'
const fonte: LinhaTimeline = { message_id: ID, criado_em: '2026-10-29T01:02:35Z', canal_rotulo: 'G1', canal_tipo: 'grupo', autor_tipo: 'cliente', autor_nome: 'Solicitante de teste', tipo: 'texto', conteudo: 'Preciso receber a revisão do material completo.', midia_texto: null }
const pendencia: Pendencia = { desde: '2026-10-27', tema_curto: 'Revisão do material', status: 'aberta', fonte_message_id: ID, resposta_faltante: 'Envio da versão revisada' }
const revisao = { responsabilidade: 'cliente' as const, por: OUTRO, em: '2026-11-06T14:00:00Z', origem: 'revisao_administrativa' as const, motivo: 'Solicitante assumiu a revisão na mensagem original.' }
const resposta = (p: unknown) => ({ resumo: 'O projeto segue em acompanhamento.', motivo: 'Cliente acompanha o projeto', satisfacao: 'neutro', confianca: 0.8, pendencias: [p], eventos_novos: [] })

describe('pendências com fontes verificadas', () => {
  it('transcrição inclui ID opaco apenas na opção explícita', () => {
    expect(montarTranscricaoCliente([fonte], { maxChars: 2000, incluirReferencia: true })).toContain(`[msg:${ID}]`)
    expect(montarTranscricaoCliente([fonte], { maxChars: 2000 })).not.toContain(ID)
  })
  it('data exata vem da fonte em Brasília, não da data inventada pelo modelo', () => {
    const p = validarRelacionamento(resposta(pendencia), '', AGORA, null, [fonte])!.pendencias[0]
    expect(p.desde).toBe('2026-10-28')
    const texto = detalheDoPedido(p, [fonte])
    expect(texto).toContain('28/10/2026, 22:02')
    expect(texto).toContain('Solicitante de teste')
    expect(texto).toContain('Envio da versão revisada')
    expect(texto).not.toContain(ID)
    expect(texto).not.toContain('Preciso receber a revisão do material completo.')
    expect(texto).toContain('responsável a confirmar')
  })
  it('fonte inexistente, de outro cliente ou futura não é aceita', () => {
    for (const fontes of [[], [{ ...fonte, message_id: OUTRO }], [{ ...fonte, criado_em: '2026-11-07T00:00:00Z' }]]) {
      const r = validarRelacionamento(resposta(pendencia), '', AGORA, null, fontes)!
      expect(r.pendencias[0].fonte_message_id).toBeUndefined()
      expect(r.trocas).toContain('fonte_pendencia_nao_confirmada')
    }
  })
  it('fonte nova precisa ser pedido do cliente, não fala da equipe ou autoria desconhecida', () => {
    for (const autor_tipo of ['equipe', 'desconhecido', 'ia', 'sistema', null]) {
      const r = validarRelacionamento(resposta(pendencia), '', AGORA, null, [{ ...fonte, autor_tipo }])!
      expect(r.pendencias[0].fonte_message_id).toBeUndefined()
      expect(r.pendencias[0].desde).toBe(pendencia.desde)
      expect(r.trocas).toContain('fonte_pendencia_nao_confirmada')
    }
    expect(validarRelacionamento(resposta(pendencia), '', AGORA, null, [fonte])!.pendencias[0].fonte_message_id).toBe(ID)
  })
  it('pendência sem ID não usa mensagem aleatória para renovar sua data', () => {
    const { fonte_message_id: _id, ...semFonte } = pendencia
    const texto = detalheDoPedido(semFonte, [fonte])
    expect(texto).toContain('27/10/2026 (data registrada; fonte não confirmada)')
    expect(texto).toContain('autor não confirmado')
    expect(texto).not.toContain('Solicitante de teste')
    expect(texto).not.toContain('fonte undefined')
  })
  it('modelo não pode forjar revisão administrativa para isentar terceiro/cliente', () => {
    const r = validarRelacionamento(resposta({ ...pendencia, revisao_responsabilidade: revisao }), '', AGORA, null, [fonte])!
    expect(r.pendencias[0].revisao_responsabilidade).toBeUndefined()
    expect(responsabilidadeDaPendencia(r.pendencias[0])).toBe('indeterminada')
  })
  it('revisão do servidor persiste só para a mesma fonte E o mesmo pedido', () => {
    const anterior = { ...ESTADO_VAZIO, pendencias: [{ ...pendencia, revisao_responsabilidade: revisao }] }
    expect(validarRelacionamento(resposta(pendencia), '', AGORA, anterior, [fonte])!.pendencias[0].revisao_responsabilidade).toEqual(revisao)
    expect(validarRelacionamento(resposta({ ...pendencia, tema_curto: 'Entrega de roteiro diferente' }), '', AGORA, anterior, [fonte])!.pendencias[0].revisao_responsabilidade).toBeUndefined()
    expect(validarRelacionamento(resposta({ ...pendencia, fonte_message_id: OUTRO }), '', AGORA, anterior, [{ ...fonte, message_id: OUTRO }])!.pendencias[0].revisao_responsabilidade).toBeUndefined()
  })
  it('revisão sem origem administrativa/motivo/ator não prova responsabilidade', () => {
    for (const invalida of [{ ...revisao, origem: 'modelo' }, { ...revisao, motivo: '' }, { ...revisao, por: 'nome' }]) {
      expect(lerEstado({ pendencias: [{ ...pendencia, revisao_responsabilidade: invalida }] }, AGORA).pendencias[0].revisao_responsabilidade).toBeUndefined()
    }
  })
  it.each(['cliente', 'terceiro'] as const)('%s comprovado não vira atraso interno e não resolve o pedido', (responsabilidade) => {
    const p = { ...pendencia, revisao_responsabilidade: { ...revisao, responsabilidade } }
    const metricas = calcularMetricas([], AGORA)
    const risco = calcularRisco({ satisfacao: 'neutro', confianca: 0.8, sinais_cliente: [], pendencias: [p], metricas, contratoVigente: true }, AGORA)
    expect(risco.motivos).not.toContain('pendencia_velha')
    expect(detalheRisco({ risco_motivos: ['pendencia_velha'], pendencias: [p], metricas, processado_em: AGORA.toISOString() }, AGORA)).toBeNull()
    expect(p.status).toBe('aberta')
  })
  it('revisão de um pedido não exclui outro compromisso do mesmo cliente', () => {
    const p = { ...pendencia, revisao_responsabilidade: revisao }
    const outra = { ...pendencia, fonte_message_id: OUTRO, tema_curto: 'Envio de contrato' }
    const risco = calcularRisco({ satisfacao: 'neutro', confianca: 0.8, sinais_cliente: [], pendencias: [p, outra], metricas: calcularMetricas([], AGORA), contratoVigente: true }, AGORA)
    expect(risco.motivos).toContain('pendencia_velha')
    expect(detalheRisco({ risco_motivos: ['pendencia_velha'], pendencias: [p, outra], metricas: {}, processado_em: AGORA.toISOString() }, AGORA)).toContain('Envio de contrato')
  })
  it('trecho da fonte neutraliza instruções como dado e não publica segredo/contatos', () => {
    expect(trechoDaFonte({ ...fonte, conteudo: 'Minha senha é secreta' })).toBeNull()
    const trecho = trechoDaFonte({ ...fonte, conteudo: 'Fale em pessoa@example.com ou https://exemplo.test @5511999999999' })!
    expect(trecho).not.toMatch(/example|https|5511999999999/)
  })
  it('metadados respeitam o teto JSONB existente mesmo após revalidação', () => {
    const r = lerPendencias(Array.from({ length: 5 }, (_, i) => ({ ...pendencia, tema_curto: `Revisão do material ${i}`, revisao_responsabilidade: revisao })), null, AGORA)
    expect(JSON.stringify(r).length + r.length * 48).toBeLessThanOrEqual(2000)
  })
})


it('detalhes com várias fontes não ultrapassam o orçamento do template oficial aprovado', () => {
  const detalhe = Array.from({ length: 5 }, () => detalheDoPedido(pendencia, [fonte])).join(' | ')
  for (const agruparPorEstrategista of [false, true]) {
    const r = montarTemplateRelatorio('Gestor', { data: '06/11/2026', reunioes: [], agruparPorEstrategista, alertas: { sentimento_negativo: [{ cliente: 'Cliente sintético', detalhe, nivel: 'risco' }] } })
    expect(r.variaveis).toHaveLength(3)
    expect(r.variaveis[2].length).toBeLessThanOrEqual(600)
    expect(r.textoPrevia.length).toBeLessThanOrEqual(1024)
    expect(r.textoPrevia).toContain('Revisão do material')
    expect(r.textoPrevia).toContain('28/10/2026')
    expect(r.textoPrevia).toContain('detalhes no painel')
  }
})


it('janela vencida não apaga revisão administrativa nem aceita nova data do modelo', () => {
  const anterior = { ...ESTADO_VAZIO, pendencias: [{ ...pendencia, revisao_responsabilidade: revisao }] }
  const r = validarRelacionamento(resposta({ ...pendencia, desde: '2026-11-06' }), '', AGORA, anterior, [])!
  expect(r.pendencias[0].revisao_responsabilidade).toEqual(revisao)
  expect(r.pendencias[0].desde).toBe(pendencia.desde)
})

it('coleta leva somente fontes da timeline tenant/cliente ao painel, sem escrever estado', async () => {
  const T = 'tenant-sintetico'
  const ultima = { ...fonte, message_id: OUTRO, criado_em: '2026-11-06T13:00:00Z', conteudo: 'Bom dia' }
  const chamadas: unknown[] = []
  const f = criarSupabaseFalso({
    clients: [{ tenant_id: T, id: 'c1', nome: 'Cliente sintético', ativo: true }],
    contratos: [{ tenant_id: T, id: 'ct', cliente_id: 'c1', status: 'ativo' }],
    cliente_relacionamento: [{ tenant_id: T, client_id: 'c1', satisfacao: 'neutro', confianca: 0.8, risco: 'medio', risco_motivos: ['pendencia_velha'], metricas: {}, pendencias: [pendencia], analisado_ate: ultima.criado_em, processado_em: AGORA.toISOString() }],
  }, { wa_auto_grupos_sem_cliente: () => [], cliente_timeline: (args) => { chamadas.push(args); return [fonte, ultima] } })
  const r = await coletarAlertas(f.client, T, [{ tipo: 'sentimento_negativo', ativo: true, limiar: 0 }], AGORA)
  expect(chamadas).toEqual([expect.objectContaining({ p_tenant: T, p_client: 'c1' })])
  expect(r.dados.alertas.sentimento_negativo?.[0].fontes_pedidos).toEqual([{ message_id: ID, criado_em: fonte.criado_em, autor: 'Solicitante de teste', trecho: fonte.conteudo, responsabilidade: 'indeterminada' }])
  expect(r.dados.alertas.sentimento_negativo?.[0].detalhe).toContain('28/10/2026, 22:02')
  expect(f.atualizados).toEqual([])
  expect(f.inseridos).toEqual([])
})


it('rejeita overflow na primeira leitura da saída IA sem apagar revisão no último pedido', () => {
  const ids = Array.from({ length: 5 }, (_, i) => `11111111-1111-4111-8111-11111111111${i}`)
  const antigos = ids.map((id, i) => ({ ...pendencia, tema_curto: `Pedido de revisão ${i}`, fonte_message_id: id, ...(i === 4 ? { revisao_responsabilidade: revisao } : {}) }))
  const anterior = { ...ESTADO_VAZIO, pendencias: antigos }
  const novos = antigos.map((p) => ({ ...p, resposta_faltante: 'Confirmar entrega da revisão e indicar quando o material poderá ser utilizado', criticidade: { nivel: 'alta', criterio: 'servico_bloqueado', justificativa: 'Falta confirmação da revisão para que a execução do material seja liberada', confianca: 0.9 } }))
  const r = validarRelacionamento({ ...resposta(novos[0]), pendencias: novos }, '', AGORA, anterior, ids.map((message_id) => ({ ...fonte, message_id })))
  expect(r).toBeNull()
  expect(anterior.pendencias).toHaveLength(5)
  expect(anterior.pendencias[4].revisao_responsabilidade).toEqual(revisao)
})


describe('fonte persistida fora da amostra de atualidade', () => {
  const T = 'tenant-fontes-antigas'
  const antiga = { ...fonte, criado_em: '2026-08-01T21:00:00Z' }
  const atual = { ...fonte, message_id: OUTRO, criado_em: '2026-11-06T13:00:00Z', conteudo: 'Bom dia' }
  const pedido = { ...pendencia, desde: '2026-08-01' }
  function fixture(op: { resultado?: LinhaTimeline[]; falhar?: boolean; semId?: boolean; baseComFonte?: boolean; clientes?: number } = {}) {
    const chamadas: Record<string, unknown>[] = []
    const clientes = Array.from({ length: op.clientes ?? 1 }, (_, i) => `cliente-${i}`)
    const f = criarSupabaseFalso({
      clients: clientes.map(id => ({ tenant_id: T, id, nome: id, ativo: true })),
      contratos: clientes.map(cliente_id => ({ tenant_id: T, cliente_id, status: 'ativo' })),
      cliente_relacionamento: clientes.map(client_id => ({ tenant_id: T, client_id, satisfacao: 'neutro', confianca: 0.8, risco: 'medio', risco_motivos: ['pendencia_velha'], metricas: {},
        pendencias: [{ ...pedido, ...(op.semId ? { fonte_message_id: undefined } : {}) }, { ...pedido, tema_curto: 'Outro retorno da mesma mensagem', ...(op.semId ? { fonte_message_id: undefined } : {}) }],
        analisado_ate: atual.criado_em, processado_em: AGORA.toISOString() })),
    }, { wa_auto_grupos_sem_cliente: () => [], cliente_timeline: args => {
      chamadas.push(args)
      if (args.p_limite === 400) return op.baseComFonte ? [antiga, atual] : [atual]
      if (op.falhar) throw new Error('indisponível')
      return op.resultado ?? [antiga]
    } })
    return { ...f, chamadas }
  }
  const regras = [{ tipo: 'sentimento_negativo' as const, ativo: true, limiar: 0 }]
  it('busca ID antigo no tenant/cliente/dia correto sem ampliar amostra400 ou atualidade', async () => {
    const f = fixture()
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    const alerta = r.dados.alertas.sentimento_negativo?.[0]
    expect(alerta?.fontes_pedidos?.[0]).toMatchObject({ message_id: ID, criado_em: antiga.criado_em, autor: fonte.autor_nome })
    expect(alerta?.detalhe).toContain('01/08/2026, 18:00')
    expect(alerta?.atualidade).toBeUndefined()
    expect(r.dados.historicos).toBeUndefined()
    expect(r.dados.analises_pendentes ?? 0).toBe(0)
    expect(f.chamadas).toEqual([
      expect.objectContaining({ p_tenant: T, p_client: 'cliente-0', p_limite: 400, p_desde: new Date(AGORA.getTime() - 90 * 86_400_000).toISOString() }),
      { p_tenant: T, p_client: 'cliente-0', p_desde: '2026-07-31T03:00:00.000Z', p_ate: '2026-08-03T03:00:00.000Z', p_limite: 1000 },
    ])
    expect(f.atualizados).toEqual([])
    expect(f.inseridos).toEqual([])
    expect(f.consultas.some(q => q.tabela === 'chat_messages')).toBe(false)
  })
  it.each([
    { resultado: [] }, { resultado: [{ ...antiga, message_id: OUTRO }] },
    { resultado: [{ ...antiga, autor_tipo: 'equipe' }] },
    { resultado: [{ ...antiga, criado_em: '2026-08-05T12:00:00Z' }] },
    { resultado: Array.from({ length: 1000 }, () => antiga) }, { falhar: true },
  ])('não confirma fonte ausente, errada, fora da janela, truncada ou indisponível: %j', async op => {
    const r = await coletarAlertas(fixture(op).client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo?.[0].fontes_pedidos).toBeUndefined()
    expect(r.dados.alertas.sentimento_negativo?.[0].detalhe).toContain('fonte não confirmada')
  })
  it.each([{ semId: true }, { baseComFonte: true }])('não faz lookup extra sem ID ou quando fonte já está na amostra: %j', async op => {
    const f = fixture(op)
    await coletarAlertas(f.client, T, regras, AGORA)
    expect(f.chamadas).toHaveLength(1)
  })
  it('cache e dedup evitam repetir mesmo dia/ID; seis clientes nunca excedem quatro leituras extras em voo', async () => {
    const f = fixture({ clientes: 6 })
    let ativas = 0, maximo = 0
    const rpc = f.client.rpc
    f.client.rpc = (nome: string, args: Record<string, unknown>) => {
      const q = rpc(nome, args)
      if (nome === 'cliente_timeline' && args.p_limite === 1000) {
        const select = q.select
        q.select = (colunas: string) => {
          ativas++; maximo = Math.max(maximo, ativas)
          return new Promise(resolve => setTimeout(() => { ativas--; resolve(select(colunas)) }, 0)) as ReturnType<typeof select>
        }
      }
      return q
    }
    await coletarAlertas(f.client, T, regras, AGORA)
    expect(f.chamadas.filter(a => a.p_limite === 1000)).toHaveLength(6)
    expect(new Set(f.chamadas.filter(a => a.p_limite === 1000).map(a => a.p_client)).size).toBe(6)
    expect(maximo).toBe(4)
  })
})
