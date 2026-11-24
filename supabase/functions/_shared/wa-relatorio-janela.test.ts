import { describe, expect, it } from 'vitest'
import { coletarAlertas } from './wa-relatorio-dados.ts'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'

const T = 'empresa-janela'
const AGORA = new Date('2026-11-03T15:00:00Z')
const antes = (dias: number) => new Date(AGORA.getTime() - dias * 86_400_000).toISOString()
const regras = [{ tipo: 'sentimento_negativo' as const, ativo: true, limiar: 0 }]
type Mensagem = { criado_em: string; autor_tipo: string }

function banco(opcoes: {
  mensagens?: Mensagem[]; relacionamento?: Record<string, unknown>; clienteAtivo?: boolean;
  semTimeline?: boolean; ignorado?: boolean; inadimplente?: boolean; semanal?: boolean;
} = {}) {
  let leiturasTimeline = 0
  const rel = {
    tenant_id: T, client_id: 'c1', satisfacao: 'neutro', confianca: 0.8, motivo: null,
    risco: 'medio', risco_motivos: ['silencio'], metricas: { dias_desde_msg_cliente: 60 }, pendencias: [],
    analisado_ate: antes(60), processado_em: antes(0.1), ...opcoes.relacionamento,
  }
  const f = criarSupabaseFalso({
    clients: [{ tenant_id: T, id: 'c1', nome: 'Cliente da janela', ativo: opcoes.clienteAtivo ?? true }],
    contratos: [{ tenant_id: T, id: 'contrato-1', cliente_id: 'c1', cliente_nome: 'Cliente da janela', status: 'ativo',
      status_secundario: opcoes.inadimplente ? 'INADIMPLENTE' : 'ATIVO', atualizado_em: antes(0.1) }],
    cliente_relacionamento: opcoes.semanal ? [] : [rel],
    chat_weekly_reports: opcoes.semanal ? [{ tenant_id: T, client_id: 'c1', client_nome: 'Cliente da janela', contact_id: null,
      risco_abandono: 'alto', semana_inicio: antes(1).slice(0, 10) }] : [],
    wa_auto_alertas_ignorados: opcoes.ignorado ? [{ tenant_id: T, id: 'ignorado-1', client_id: 'c1', contact_id: null,
      tipo: 'sentimento_negativo', modo: 'sempre', created_at: antes(1), ate: null }] : [],
  }, {
    wa_auto_grupos_sem_cliente: () => [],
    ...(opcoes.semTimeline ? {} : { cliente_timeline: () => {
      leiturasTimeline++
      return opcoes.mensagens ?? [{ criado_em: antes(60), autor_tipo: 'cliente' }]
    } }),
  })
  return { ...f, rel, leiturasTimeline: () => leiturasTimeline }
}

describe('janela de movimentação real no relatório', () => {
  it('cron de hoje não transforma silêncio antigo em novidade; mantém item histórico consultável', async () => {
    const f = banco()
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo).toMatchObject([{ atualidade: 'historico', detalhe: 'sem falar há 60 dias' }])
    expect(r.dados.historicos).toEqual({ quantidade: 1, dias: 7 })
    expect(r.dados.analises_pendentes).toBeUndefined()
    expect(f.leiturasTimeline()).toBe(1)
    expect(f.rel.metricas).toEqual({ dias_desde_msg_cliente: 60 })
    expect(f.inseridos).toEqual([])
    expect(f.atualizados).toEqual([])
    for (const q of f.consultas) expect(q.filtros).toContain('eq:tenant_id')
  })

  it.each([0, 0.5, 2])('renovar processado_em há %s dias não muda a atualidade da evidência', async (dias) => {
    const f = banco({ relacionamento: { processado_em: antes(dias) } })
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo?.[0].atualidade).toBe('historico')
    expect(r.dados.historicos?.quantidade).toBe(1)
  })

  it('cobrança recente já analisada mantém atual um pedido aberto antigo', async () => {
    const f = banco({ mensagens: [{ criado_em: antes(0.2), autor_tipo: 'cliente' }], relacionamento: {
      analisado_ate: antes(0.2), risco_motivos: ['pendencia_velha'],
      pendencias: [{ desde: '2026-09-01', tema_curto: 'entrega pendente', status: 'aberta' }],
    } })
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo?.[0].detalhe).toContain('entrega pendente; autor não confirmado, 01/09/2026')
    expect(r.dados.alertas.sentimento_negativo?.[0].atualidade).toBeUndefined()
    expect(r.dados.historicos).toBeUndefined()
  })

  it('uma nova fala da equipe não é movimentação nova do cliente', async () => {
    const f = banco({ mensagens: [
      { criado_em: antes(60), autor_tipo: 'cliente' }, { criado_em: antes(0.1), autor_tipo: 'equipe' },
    ] })
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo?.[0].atualidade).toBe('historico')
    expect(r.dados.historicos).toEqual({ quantidade: 1, dias: 7 })
    expect(r.dados.analises_pendentes).toBe(1)
  })

  it.each([7, 20, 30, 90])('respeita janela configurada de %s dias e inclui o limite exato', async (janelaDias) => {
    const f = banco({ mensagens: [{ criado_em: antes(20), autor_tipo: 'cliente' }], relacionamento: {
      analisado_ate: antes(20), satisfacao: 'insatisfeito', motivo: 'Cliente cobrou o retorno',
    } })
    const r = await coletarAlertas(f.client, T, [{ ...regras[0], janelaDias }], AGORA)
    expect(r.dados.alertas.sentimento_negativo?.[0].atualidade).toBe(janelaDias < 20 ? 'historico' : undefined)
    expect(r.dados.historicos).toEqual(janelaDias < 20 ? { quantidade: 1, dias: janelaDias } : undefined)
  })

  it.each(['vazia', 'ausente', 'saturada', 'futura', 'sistema', 'autoria desconhecida'])('evidência %s sinaliza atualidade pendente, sem inventar histórico confirmado', async (caso) => {
    const f = banco({ semTimeline: caso === 'ausente', relacionamento: {
      satisfacao: 'insatisfeito', motivo: 'Aguarda confirmação', risco_motivos: [], analisado_ate: antes(0.1),
    }, mensagens: caso === 'saturada'
      ? Array.from({ length: 400 }, () => ({ criado_em: antes(0.1), autor_tipo: 'equipe' }))
      : caso === 'futura' ? [{ criado_em: antes(-1), autor_tipo: 'cliente' }]
      : caso === 'sistema' ? [{ criado_em: antes(0.1), autor_tipo: 'sistema' }]
      : caso === 'autoria desconhecida' ? [{ criado_em: antes(0.1), autor_tipo: 'desconhecido' }] : [],
    })
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo?.[0].atualidade).toBe('pendente')
    expect(r.dados.historicos).toBeUndefined()
    expect(r.dados.analises_pendentes).toBe(1)
  })

  it('silêncio sem nenhuma mensagem verificável não vira carteira saudável', async () => {
    const f = banco({ mensagens: [] })
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo).toEqual([])
    expect(r.dados.historicos).toBeUndefined()
    expect(r.dados.analises_pendentes).toBe(1)
  })

  it('cliente inativo e caso ignorado não entram na contagem de históricos', async () => {
    for (const opcoes of [{ clienteAtivo: false }, { ignorado: true }]) {
      const f = banco(opcoes)
      const r = await coletarAlertas(f.client, T, regras, AGORA)
      expect(r.dados.alertas.sentimento_negativo).toEqual([])
      expect(r.dados.historicos).toBeUndefined()
      if ('clienteAtivo' in opcoes) expect(f.leiturasTimeline()).toBe(0)
    }
  })

  it('histórico contextual não esconde uma pendência contratual atual do mesmo cliente', async () => {
    const f = banco({ inadimplente: true })
    const r = await coletarAlertas(f.client, T, [...regras, { tipo: 'pendencia', ativo: true, limiar: 0 }], AGORA)
    expect(r.dados.alertas.sentimento_negativo?.[0].atualidade).toBe('historico')
    expect(r.dados.alertas.pendencia).toMatchObject([{ detalhe: 'contrato inadimplente' }])
    expect(r.dados.historicos?.quantidade).toBe(1)
  })

  it('relatório semanal recém-gerado também usa movimentação do cliente, não data de processamento', async () => {
    const f = banco({ semanal: true })
    const r = await coletarAlertas(f.client, T, regras, AGORA)
    expect(r.dados.alertas.sentimento_negativo?.[0]).toMatchObject({ atualidade: 'historico', detalhe: 'risco alto de sair (análise semanal)' })
    expect(r.dados.historicos).toEqual({ quantidade: 1, dias: 7 })
  })
})
