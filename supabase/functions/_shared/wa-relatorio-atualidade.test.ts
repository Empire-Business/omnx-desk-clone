import { describe, expect, it } from 'vitest'
import { coletarAlertas } from './wa-relatorio-dados.ts'
import { criarSupabaseFalso as criarFalsoBase, comClientesAtendidos } from './teste-supabase-falso.ts'
const criarSupabaseFalso: typeof criarFalsoBase = (tabelas, rpcs) => criarFalsoBase(comClientesAtendidos(tabelas), rpcs)

const T = 'empresa-1'
const AGORA = new Date('2026-10-28T15:00:00Z')
const antes = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString()
const regras = [{ tipo: 'sentimento_negativo' as const, ativo: true, limiar: 0 }]
const cliente = { id: 'c1', tenant_id: T, nome: 'Cliente', ativo: true }
const contrato = { id: 'k1', cliente_id: 'c1', tenant_id: T, status: 'ativo', status_secundario: 'ATIVO' }
const relacionamento = {
  client_id: 'c1', tenant_id: T, satisfacao: 'neutro', confianca: 0.8, motivo: null,
  risco: 'medio', risco_motivos: ['silencio'], metricas: { dias_desde_msg_cliente: 38 }, pendencias: [],
  analisado_ate: antes(38 * 24), processado_em: antes(3),
}

function banco(opcoes: {
  rel?: Record<string, unknown>; ultima?: { criado_em: string; autor_tipo: string } | null;
  mensagens?: { criado_em: string; autor_tipo: string }[];
  ignorado?: boolean; falhaTimeline?: boolean; respostaTimelineInesperada?: boolean; contratos?: Record<string, unknown>[];
} = {}) {
  const chamadas: Record<string, unknown>[] = []
  const selecoes: string[] = []
  const f = criarSupabaseFalso({
    clients: [cliente], contratos: opcoes.contratos ?? [contrato],
    cliente_relacionamento: [{ ...relacionamento, ...opcoes.rel }],
    // O vínculo canônico pode existir sem chat_contacts.client_id preenchido.
    chat_contacts: [{ id: 'k1', tenant_id: T, client_id: null, nome: 'Canal do cliente', numero_whatsapp: '5521999998888' }],
    chat_conversations: [{ id: 'v1', tenant_id: T, contact_id: 'k1', ultima_msg_cliente_em: antes(1) }],
    wa_auto_alertas_ignorados: opcoes.ignorado ? [{
      id: 'i1', tenant_id: T, client_id: 'c1', contact_id: 'k1', tipo: 'sentimento_negativo', modo: 'resolvido',
      created_at: antes(10), ate: null,
    }] : [],
  }, {
    wa_auto_grupos_sem_cliente: () => [],
    cliente_timeline: (args) => {
      chamadas.push(args)
      if (opcoes.falhaTimeline) throw new Error('indisponível')
      if (opcoes.respostaTimelineInesperada) return { criado_em: antes(1), autor_tipo: 'cliente' }
      return (opcoes.mensagens ?? [opcoes.ultima ?? { criado_em: antes(38 * 24), autor_tipo: 'cliente' }])
        .map((m) => ({ ...m, conteudo: 'Texto que o coletor não deve receber' }))
    },
  })
  const rpc = f.client.rpc
  f.client.rpc = (nome: string, args: Record<string, unknown>) => {
    const consulta = rpc(nome, args)
    if (nome === 'cliente_timeline') {
      const select = consulta.select
      consulta.select = (colunas: string) => { selecoes.push(colunas); return select(colunas) }
    }
    return consulta
  }
  return { ...f, chamadas, selecoes }
}

describe('atualidade do relatório compartilhado, sem gravar estado', () => {
  it('mensagem atual do cliente no canal canônico retira silêncio antigo de 38 dias', async () => {
    const f = banco({ ultima: { criado_em: antes(1), autor_tipo: 'cliente' } })
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo).toEqual([])
    expect(f.chamadas).toEqual([{
      p_tenant: T, p_client: 'c1', p_desde: antes(90 * 24), p_ate: AGORA.toISOString(), p_limite: 400,
    }])
    expect(f.selecoes).toEqual(['message_id, criado_em, autor_tipo, autor_nome, canal_rotulo, canal_tipo, tipo, conteudo, midia_texto'])
    expect(r.dados.analises_pendentes).toBe(1)
    expect(f.inseridos).toEqual([])
    expect(f.atualizados).toEqual([])
    expect(JSON.stringify(relacionamento)).toContain('38')
  })

  it('fala do cliente seguida de resposta da equipe também invalida silêncio antigo', async () => {
    const f = banco({ mensagens: [
      { criado_em: antes(2), autor_tipo: 'cliente' },
      { criado_em: antes(1), autor_tipo: 'equipe' },
    ] })
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo).toEqual([])
    expect(r.dados.analises_pendentes).toBe(1)
  })

  it('amostra saturada sem fala do cliente não confirma número antigo de silêncio nem carteira saudável', async () => {
    const f = banco({ mensagens: Array.from({ length: 400 }, (_, n) => ({ criado_em: antes(1 + n / 400), autor_tipo: 'equipe' })) })
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo).toEqual([])
    expect(r.dados.analises_pendentes).toBe(1)
    expect(f.atualizados).toEqual([])
  })

  it('novidade posterior ao diagnóstico não recicla insatisfação nem pendência antiga como problema atual', async () => {
    const f = banco({
      rel: { satisfacao: 'insatisfeito', risco: 'alto', risco_motivos: ['insatisfeito', 'pendencia_velha'], motivo: 'Cobrou entrega antiga',
        pendencias: [{ desde: '2026-09-01', tema_curto: 'entrega pendente', status: 'aberta' }] },
      ultima: { criado_em: antes(1), autor_tipo: 'equipe' },
    })
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo).toEqual([])
    expect(f.atualizados).toEqual([])
  })

  it('mensagem da equipe não é prova de que o cliente voltou a falar: preserva risco de silêncio sustentado', async () => {
    const f = banco({ mensagens: [{ criado_em: antes(38 * 24), autor_tipo: 'cliente' }, { criado_em: antes(1), autor_tipo: 'equipe' }] })
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo?.[0]).toMatchObject({ nivel: 'risco', detalhe: 'sem falar há 38 dias' })
  })

  it('amostra completa sem fala do cliente não mantém silêncio antigo contra a fonte atual', async () => {
    const f = banco({ mensagens: [{ criado_em: antes(1), autor_tipo: 'equipe' }] })
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo).toEqual([])
    expect(r.dados.analises_pendentes).toBe(1)
  })

  it('resolução seguida de novidade mantém diagnóstico anterior oculto; análise posterior pode reabrir', async () => {
    for (const posterior of [false, true]) {
      const f = banco({
        ignorado: true,
        rel: { satisfacao: 'insatisfeito', risco: 'alto', risco_motivos: ['insatisfeito'], motivo: 'Cliente voltou a cobrar a entrega',
          analisado_ate: posterior ? antes(1) : antes(20), processado_em: antes(0.5) },
        ultima: { criado_em: antes(1), autor_tipo: 'cliente' },
      })
      const r = await coletarAlertas(f.client, T, regras, AGORA)
      expect(r.dados.alertas.sentimento_negativo).toHaveLength(posterior ? 1 : 0)
      if (posterior) expect(r.dados.alertas.sentimento_negativo?.[0].detalhe).toContain('voltou a cobrar')
    }
  })

  it('falha real da fonte atual impede apresentar resultado completo sem alertas', async () => {
    const f = banco({ falhaTimeline: true })
    await expect(coletarAlertas(f.client, T, regras, AGORA)).rejects.toThrow('relacionamento_novidade')
  })

  it('resposta da timeline fora do formato de lista falha fechada', async () => {
    const f = banco({ respostaTimelineInesperada: true })
    await expect(coletarAlertas(f.client, T, regras, AGORA)).rejects.toThrow('relacionamento_novidade')
  })

  it('uma novidade sem reanálise não libera o diagnóstico anterior resolvido, mesmo quando a timeline não traz mensagens', async () => {
    const f = banco({ ignorado: true, mensagens: [], rel: { satisfacao: 'insatisfeito', risco: 'alto', risco_motivos: ['insatisfeito'],
      motivo: 'Diagnóstico antigo', analisado_ate: antes(20) } })
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo).toEqual([])
    expect(r.ocultos.ignorados_pelo_gestor).toBe(1)
    expect(r.ignorados.map((i) => i.id)).toEqual(['i1'])
  })

  it('eventos de sistema não são prova de resolução', async () => {
    const f = banco({ rel: { satisfacao: 'insatisfeito', risco: 'alto', risco_motivos: ['insatisfeito'], motivo: 'Aguarda entrega' },
      ultima: { criado_em: antes(1), autor_tipo: 'sistema' } })
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo?.[0].nivel).toBe('insatisfeito')
  })

  it('limita a quatro as consultas simultâneas e não consulta relacionamentos sem alerta', async () => {
    const ids = Array.from({ length: 11 }, (_, n) => `c${n}`)
    const f = criarSupabaseFalso({
      clients: ids.map((id) => ({ ...cliente, id })),
      contratos: ids.map((id) => ({ ...contrato, id: `k-${id}`, cliente_id: id })),
      cliente_relacionamento: ids.map((id, n) => ({ ...relacionamento, client_id: id, ...(n === 10 ? { risco: 'baixo', risco_motivos: [] } : {}) })),
    }, { cliente_timeline: () => [], wa_auto_grupos_sem_cliente: () => [] })
    let emVoo = 0
    let maximo = 0
    let chamadas = 0
    const rpc = f.client.rpc
    f.client.rpc = (nome: string, args: Record<string, unknown>) => {
      const consulta = rpc(nome, args)
      if (nome === 'cliente_timeline') {
        const select = consulta.select
        consulta.select = async (colunas: string) => {
          chamadas++
          maximo = Math.max(maximo, ++emVoo)
          await new Promise((resolve) => setTimeout(resolve, 0))
          try { return await select(colunas) } finally { emVoo-- }
        }
      }
      return consulta
    }
    await coletarAlertas(f.client, T, regras, AGORA)
    expect(chamadas).toBe(10)
    expect(maximo).toBe(4)
  })
})

describe('só clientes ativos considera os contratos atuais do cliente', () => {
  it('cliente somente pausado sai também do aviso de espera; contrato ativo do mesmo cliente preserva a espera', async () => {
    for (const misto of [false, true]) {
      const f = criarSupabaseFalso({
        clients: [cliente], contratos: [{ ...contrato, status_secundario: 'PAUSADO' }, ...(misto ? [{ ...contrato, id: 'k2' }] : [])],
        chat_contacts: [{ id: 'k1', tenant_id: T, client_id: 'c1', nome: 'Cliente', numero_whatsapp: '5521999998888' }],
        chat_conversations: [{ id: 'v1', tenant_id: T, contact_id: 'k1', ultima_msg_cliente_em: antes(6),
          aguardando_resposta: true, arquivada: false, status: 'aberta' }],
      }, { wa_auto_grupos_sem_cliente: () => [] })
      const r = await coletarAlertas(f.client, T, [{ tipo: 'sem_resposta', ativo: true, limiar: 4 }], AGORA,
        'America/Sao_Paulo', { soClientesAtivos: true, agruparPorEstrategista: false })
      expect(r.dados.alertas.sem_resposta).toHaveLength(misto ? 1 : 0)
    }
  })
  for (const misto of [false, true]) {
    for (const soClientesAtivos of [false, true]) {
      it(`${misto ? 'pausado e ativo' : 'somente pausado'} com opção ${soClientesAtivos ? 'ligada' : 'desligada'}`, async () => {
        const f = banco({ contratos: [
          { ...contrato, status_secundario: 'PAUSADO' },
          { ...contrato, id: 'k2', status: misto ? 'ativo' : 'concluido' },
          { ...contrato, id: 'k3', tenant_id: 'outra-empresa', status_secundario: 'ATIVO' },
        ] })
        const r = await coletarAlertas(f.client, T, regras, AGORA, 'America/Sao_Paulo', { soClientesAtivos, agruparPorEstrategista: false })
        expect(r.dados.alertas.sentimento_negativo).toHaveLength(soClientesAtivos && !misto ? 0 : 1)
        expect(r.ocultos.contrato_pausado).toBe(soClientesAtivos && !misto ? 1 : 0)
        expect(f.inseridos).toEqual([])
        expect(f.atualizados).toEqual([])
        for (const q of f.consultas) expect(q.filtros).toContain('eq:tenant_id')
      })
    }
  }
})
