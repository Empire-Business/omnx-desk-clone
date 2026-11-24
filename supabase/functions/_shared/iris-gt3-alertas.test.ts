import { describe, expect, it } from 'vitest'
import { coletarAlertasCarteiraGt3 } from './iris-gt3-alertas.ts'
import type { EscopoAgente } from './wa-agente-escopo.ts'
import type { RegraAnomalia } from './wa-relatorio.ts'
import { criarSupabaseFalso as criarFalsoBase, comClientesAtendidos } from './teste-supabase-falso.ts'
const criarSupabaseFalso: typeof criarFalsoBase = (tabelas, rpcs) => criarFalsoBase(comClientesAtendidos(tabelas), rpcs)

const agora = new Date('2026-10-27T12:00:00Z')
const escopo: EscopoAgente = {
  tenantId: 't', userId: 'u', politica: 'carteira_gt3', modo: 'normal', total: false,
  clientIds: new Set(['meu']), instancias: new Set(['permitida']),
  permissoes: { contratos: false, chat: true, automacoes: true },
}
const regras: RegraAnomalia[] = [
  { tipo: 'sem_resposta', ativo: true, limiar: 4, janelaDias: 7 },
  { tipo: 'sentimento_negativo', ativo: true, limiar: 0 },
  { tipo: 'pendencia', ativo: true, limiar: 0 },
  { tipo: 'queda_volume', ativo: true, limiar: 50 },
]
const msg = { tenant_id: 't', id: 'm', conversation_id: 'visivel' }
const conversa = {
  tenant_id: 't', id: 'visivel', contact_id: 'contato', ultima_msg_cliente_em: '2026-10-27T06:00:00Z',
  aguardando_resposta: true, silenciado: false, sentimento: 'neutro', arquivada: false, status: 'aberta',
}
const contato = { tenant_id: 't', id: 'contato', instance_id: 'permitida', restrito_admin: false, bloqueado: false }
const contrato = {
  tenant_id: 't', id: 'ct', cliente_id: 'meu', status: 'Em andamento', status_secundario: null,
  atualizado_em: '2026-10-26T00:00:00Z', data_fechamento: '2026-10-01', data_assinatura: '2026-10-01', plano_dias: 90,
}
function falso(extra: Record<string, Record<string, unknown>[]> = {}, timeline?: (args: Record<string, unknown>) => unknown) {
  return criarSupabaseFalso({
    clients: [{ tenant_id: 't', id: 'meu', nome: 'Cliente Próprio', ativo: true }, { tenant_id: 't', id: 'alheio', nome: 'Cliente Alheio', ativo: true }],
    contratos: [contrato], chat_messages: [msg], chat_conversations: [conversa], chat_contacts: [contato],
    wa_auto_alertas_ignorados: [], contratos_audit_log: [], ...extra,
  }, { cliente_timeline: timeline ?? (() => [{ message_id: 'm' }]) })
}

describe('coleta privada GT3 por proveniência de conversa', () => {
  it('filtra tenant e carteira antes das leituras; não lê agregados nem RPC global', async () => {
    const calls: Record<string, unknown>[] = []
    const f = falso({
      chat_messages: [msg, { tenant_id: 't', id: 'nao-demonstrada', conversation_id: 'outra' }],
      chat_conversations: [conversa, { ...conversa, id: 'outra', contact_id: 'secreto', sentimento: 'negativo' }],
      chat_contacts: [contato, { ...contato, id: 'secreto', instance_id: 'proibida' }],
    }, (args) => { calls.push(args); return [{ message_id: 'm', conteudo: 'Texto descartado; não deve aparecer' }] })
    const r = await coletarAlertasCarteiraGt3(f.client, escopo, regras, agora)
    expect(calls).toEqual([expect.objectContaining({ p_tenant: 't', p_client: 'meu', p_instancias: ['permitida'] })])
    expect(r.dados.alertas.sem_resposta?.map((x) => x.conversation_id)).toEqual(['visivel'])
    expect(r.dados.alertas.sentimento_negativo).toEqual([])
    expect(r.dados.alertas.grupo_sem_cliente).toBeUndefined()
    expect(r.avisos.join(' ')).toMatch(/Queda de volume não consultada/)
    expect(JSON.stringify(r)).not.toMatch(/Alheio|secreto|Texto descartado/)
    expect(f.consultas.every((q) => q.filtros.includes('eq:tenant_id'))).toBe(true)
    expect(f.consultas.some((q) => ['cliente_relacionamento', 'wa_auto_satisfacao', 'chat_weekly_reports', 'cliente_canais'].includes(q.tabela))).toBe(false)
    expect(f.consultas.filter((q) => q.tabela === 'contratos').every((q) => q.filtros.includes('in:id'))).toBe(true)
    expect(f.consultas.find((q) => q.tabela === 'chat_messages')?.filtros).toContain('in:id')
  })
  it('categoria negativa só da conversa demonstrada e visível precede sem resposta', async () => {
    const f = falso({ chat_conversations: [{ ...conversa, sentimento: 'negativo' }] })
    const r = await coletarAlertasCarteiraGt3(f.client, escopo, regras, agora)
    expect(r.dados.alertas.sentimento_negativo?.[0]?.detalhe).toBe('conversa com tom negativo')
    expect(r.dados.alertas.sem_resposta).toEqual([])
    expect(r.avisos.join(' ')).toMatch(/análises administrativas agregadas não foram usadas/)
  })
  it.each([
    { ...contato, instance_id: 'proibida' },
    { ...contato, restrito_admin: true },
  ])('nega contato fora da instância ou restrito mesmo se a RPC retornasse ID antigo: %j', async (ct) => {
    const f = falso({ chat_contacts: [ct] })
    const r = await coletarAlertasCarteiraGt3(f.client, escopo, regras, agora)
    expect(r.dados.alertas.sem_resposta).toEqual([])
    expect(r.dados.alertas.sentimento_negativo).toEqual([])
  })
  it.each([
    { ...escopo, instancias: new Set<string>() },
    { ...escopo, permissoes: { ...escopo.permissoes, chat: false } },
  ])('sem acesso ao Chat não consulta timeline nem estados de conversas', async (e) => {
    const f = falso({}, () => { throw new Error('Não deveria executar') })
    const r = await coletarAlertasCarteiraGt3(f.client, e, regras, agora)
    expect(f.consultas.some((q) => q.tabela.startsWith('chat_'))).toBe(false)
    expect(r.avisos.join(' ')).toMatch(/Alertas de conversa não consultados/)
  })
  it('RPC ausente informa falta de cobertura sem substituir por consultas amplas', async () => {
    const f = criarSupabaseFalso({ clients: [{ tenant_id: 't', id: 'meu', nome: 'Cliente', ativo: true }], contratos: [] })
    const r = await coletarAlertasCarteiraGt3(f.client, escopo, regras, agora)
    expect(r.avisos.join(' ')).toMatch(/fonte de canais autorizados está indisponível/)
    expect(f.consultas.some((q) => q.tabela === 'chat_conversations')).toBe(false)
  })
  it('falha real de leitura não vira relatório vazio', async () => {
    const f = falso({}, () => { throw new Error('falha') })
    await expect(coletarAlertasCarteiraGt3(f.client, escopo, regras, agora)).rejects.toThrow()
  })
  it('teto da timeline produz aviso explícito de cobertura parcial', async () => {
    const f = falso({}, () => Array.from({ length: 1000 }, () => ({ message_id: 'm' })))
    const r = await coletarAlertasCarteiraGt3(f.client, escopo, regras, agora)
    expect(r.avisos.join(' ')).toMatch(/limite de mensagens visíveis foi atingido/)
  })
  it('carteira vazia nunca consulta tabelas nem timeline', async () => {
    const f = falso({}, () => { throw new Error('não autorizado') })
    const r = await coletarAlertasCarteiraGt3(f.client, { ...escopo, total: true, clientIds: new Set() }, regras, agora)
    expect(f.consultas).toEqual([])
    expect(Object.values(r.dados.alertas).flat()).toEqual([])
    expect(r.avisos).toEqual([])
  })
  it('restrito, permissão ausente ou política genérica falham antes da coleta', async () => {
    for (const e of [
      { ...escopo, modo: 'restrito' as const },
      { ...escopo, politica: undefined },
      { ...escopo, permissoes: { ...escopo.permissoes, automacoes: false } },
    ]) {
      const f = falso()
      await expect(coletarAlertasCarteiraGt3(f.client, e, regras, agora)).rejects.toThrow()
      expect(f.consultas).toEqual([])
    }
  })
})

describe('regras operacionais e decisões de ignorar', () => {
  it('contratos sem FK ou fora da carteira não entram por nome; pausado é removido com opção ativa', async () => {
    const f = falso({ contratos: [
      { ...contrato, id: 'pausado', status_secundario: 'PAUSADO' },
      { ...contrato, id: 'alheio', cliente_id: 'alheio', status_secundario: 'INADIMPLENTE' },
      { ...contrato, id: 'solto', cliente_id: null, cliente_nome: 'Cliente Próprio', status_secundario: 'INADIMPLENTE' },
      { ...contrato, id: 'nao-iniciado', status_secundario: 'Não iniciado' },
    ] })
    const r = await coletarAlertasCarteiraGt3(f.client, escopo, [regras[2]], agora, undefined, { soClientesAtivos: true, agruparPorEstrategista: false })
    expect(r.dados.alertas.pendencia?.map((x) => x.contract_id)).toEqual(['nao-iniciado'])
    expect(r.ocultos.contrato_pausado).toBe(1)
  })
  it('cliente inativo, bloqueado ou silenciado é removido pelo mesmo filtro puro', async () => {
    const fs = [
      falso({ clients: [{ tenant_id: 't', id: 'meu', nome: 'Cliente', ativo: false }] }),
      falso({ chat_contacts: [{ ...contato, bloqueado: true }] }),
      falso({ chat_conversations: [{ ...conversa, silenciado: true }] }),
    ]
    for (const f of fs) {
      const r = await coletarAlertasCarteiraGt3(f.client, escopo, [regras[0]], agora)
      expect(r.dados.alertas.sem_resposta).toEqual([])
    }
  })
  it('preserva janela configurada até 90 dias, sem encurtá-la silenciosamente', async () => {
    const f = falso({ chat_conversations: [{ ...conversa, ultima_msg_cliente_em: '2026-09-12T06:00:00Z' }] })
    const r = await coletarAlertasCarteiraGt3(f.client, escopo, [{ ...regras[0], janelaDias: 90 }], agora)
    expect(r.dados.alertas.sem_resposta).toHaveLength(1)
  })
  it('regras desligadas não executam conversas nem criam avisos de indisponibilidade', async () => {
    const f = falso({}, () => { throw new Error('desligada') })
    const r = await coletarAlertasCarteiraGt3(f.client, escopo, regras.map((r) => ({ ...r, ativo: false })), agora)
    expect(r.dados.alertas).toEqual({})
    expect(r.avisos).toEqual([])
    expect(f.consultas.some((q) => q.tabela.startsWith('chat_'))).toBe(false)
  })
  it('ignorado permanente próprio suprime; ignorados alheios não afetam nem aparecem', async () => {
    const f = falso({ wa_auto_alertas_ignorados: [
      { tenant_id: 't', id: 'i', tipo: 'sem_resposta', client_id: 'meu', contact_id: null, modo: 'sempre', ate: null, created_at: '2026-10-01T00:00:00Z' },
      { tenant_id: 't', id: 'secreto', tipo: 'todos', client_id: 'alheio', contact_id: null, modo: 'sempre', ate: null, created_at: '2026-10-01T00:00:00Z' },
    ] })
    const r = await coletarAlertasCarteiraGt3(f.client, escopo, [regras[0]], agora)
    expect(r.dados.alertas.sem_resposta).toEqual([])
    expect(r.ocultos.ignorados_pelo_gestor).toBe(1)
    expect(r.ignorados.map((x) => x.id)).toEqual(['i'])
  })
  it('mensagem recente visível reabre ignorado até novidade; conversa não demonstrada não reabre', async () => {
    const ignorado = { tenant_id: 't', id: 'i', tipo: 'sem_resposta', client_id: 'meu', contact_id: null, modo: 'ate_novidade', ate: null, created_at: '2026-10-26T00:00:00Z' }
    const f = falso({ wa_auto_alertas_ignorados: [ignorado], chat_conversations: [
      conversa, { ...conversa, id: 'oculta', contact_id: 'oculto', ultima_msg_cliente_em: '2026-10-27T11:00:00Z' },
    ] })
    const r = await coletarAlertasCarteiraGt3(f.client, escopo, [regras[0]], agora)
    expect(r.dados.alertas.sem_resposta).toHaveLength(1)
    expect(r.ignorados).toEqual([])
    const g = falso({ wa_auto_alertas_ignorados: [{ ...ignorado, created_at: '2026-10-27T08:00:00Z' }], chat_conversations: [
      conversa, { ...conversa, id: 'oculta', contact_id: 'oculto', ultima_msg_cliente_em: '2026-10-27T11:00:00Z' },
    ] })
    const s = await coletarAlertasCarteiraGt3(g.client, escopo, [regras[0]], agora)
    expect(s.dados.alertas.sem_resposta).toEqual([])
    expect(s.ignorados).toHaveLength(1)
  })
  it('só pendência ligada ainda verifica novidade em conversa arquivada desde a criação do ignorado', async () => {
    const chamadas: Record<string, unknown>[] = []
    const f = falso({
      contratos: [{ ...contrato, status_secundario: 'Não iniciado' }],
      chat_conversations: [{ ...conversa, arquivada: true, status: 'encerrada' }],
      wa_auto_alertas_ignorados: [{
        tenant_id: 't', id: 'i', tipo: 'pendencia', client_id: 'meu', contact_id: null,
        modo: 'ate_novidade', ate: null, created_at: '2026-09-01T00:00:00Z',
      }],
    }, (args) => { chamadas.push(args); return [{ message_id: 'm' }] })
    const r = await coletarAlertasCarteiraGt3(f.client, escopo, [regras[2]], agora)
    expect(chamadas[0]?.p_desde).toBe('2026-09-01T00:00:00.000Z')
    expect(r.dados.alertas.pendencia).toHaveLength(1)
    expect(r.ignorados).toEqual([])
  })
})
