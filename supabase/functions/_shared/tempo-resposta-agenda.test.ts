import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'
import { atenderAdminTempo, hidratarAgendaPainel } from './tempo-resposta-http.ts'
import { validarSnapshotAgenda, avaliarAgendaEpisodio, type SnapshotAgenda } from './tempo-resposta-agenda.ts'
import { executarPonteTempo, medirEpisodioTempo, enriquecerPainelTempo, type EpisodioTempo, type AcessoTempo } from './tempo-resposta-service.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const now = '2026-11-04T17:00:00Z' // quarta, 14h de Brasília
const from = '2026-11-04T12:00:00Z'
const agenda = (p: Partial<Omit<SnapshotAgenda, 'status'>> = {}): SnapshotAgenda & { status: 'connected' } => ({ status: 'connected', revision: 1, from, to: '2026-11-05T17:00:00Z', synced_at: now, busy: [], ...p })
function episodio(p: Partial<EpisodioTempo> = {}): EpisodioTempo {
  return { id: id(1), tenant_id: id(2), client_id: id(3), cliente: 'Cliente', conversation_id: id(4), instance_id: id(5), inicio: from,
    resposta_em: null, estado: 'aberto', qualidade: 'confiavel', motivo: null, responsavel_id: id(6), responsavel: 'Pessoa', segmento_atual_id: id(7),
    config_revisao: 1, feriados: [], anos_confirmados: [2026], segmentos: [{ id: id(7), user_id: id(6), nome: 'Pessoa', inicio: from, fim: null }], ...p }
}

describe('snapshot mínimo da agenda', () => {
  it('normaliza offsets e não altera a janela consultada', () => {
    const r = validarSnapshotAgenda(agenda({ from: '2026-11-04T09:00:00-03:00', busy: [{ start: '2026-11-04T10:00:00-03:00', end: '2026-11-04T11:00:00-03:00' }] }), now)
    expect(r.from).toBe('2026-11-04T12:00:00.000Z')
    expect(r.busy).toEqual([{ start: '2026-11-04T13:00:00.000Z', end: '2026-11-04T14:00:00.000Z' }])
  })
  it.each([
    { extra: 'texto de reunião' }, { revision: -1 }, { revision: 0 }, { revision: 1.5 }, { status: 'anything' },
    { synced_at: '2026-11-04T16:54:59Z' }, { synced_at: '2026-11-04T17:00:31Z' },
    { from: '2026-09-01T12:00:00Z' }, { to: '2026-11-06T17:00:00Z' },
    { busy: [{ start: '2026-11-04T13:00:00Z', end: '2026-11-04T13:00:00Z' }] },
    { busy: [{ start: '2026-11-04T11:00:00Z', end: '2026-11-04T13:00:00Z' }] },
    { busy: [{ start: '2026-11-04T13:00:00Z', end: '2026-11-04T14:00:00Z', title: 'Dado privado' }] },
    { busy: Array.from({ length: 257 }, () => ({ start: '2026-11-04T13:00:00Z', end: '2026-11-04T14:00:00Z' })) },
  ])('rejeita formato, dados sensíveis ou janela inválida (%j)', (patch) => { expect(() => validarSnapshotAgenda({ ...agenda(), ...patch }, now)).toThrow() })
  it('erro e desconexão não inventam horários sincronizados', () => {
    expect(validarSnapshotAgenda({ status: 'unavailable', revision: 1, from: null, to: null, synced_at: null, busy: [] }, now).synced_at).toBeNull()
    expect(() => validarSnapshotAgenda({ ...agenda(), status: 'unavailable' }, now)).toThrow()
  })
})

describe('tempo da pessoa e espera do cliente', () => {
  it('une reuniões sobrepostas e pausa legada sem descontar o almoço duas vezes', () => {
    const e = episodio({ agenda: agenda({ busy: [
      { start: '2026-11-04T14:30:00Z', end: '2026-11-04T16:30:00Z' }, //11:30–13:30:60 úteis
      { start: '2026-11-04T16:00:00Z', end: '2026-11-04T16:45:00Z' }, //13–13:45;união75 úteis
    ] }) })
    const r = medirEpisodioTempo(e, [{ id: id(20), user_id: id(6), inicio: '2026-11-04T16:30:00Z', fim: '2026-11-04T16:50:00Z', motivo: 'Pausa antiga' }], now)
    expect(r).toMatchObject({ minutos_cliente: 240, minutos_estrategista: 160, minutos_descontados: 80, etapa: '60', pausado: false, agenda_status: 'connected', qualidade_individual: 'confiavel' })
  })
  it('não muda o limite da meta nem esconde a espera do cliente durante reunião', () => {
    const r = medirEpisodioTempo(episodio({ inicio: '2026-11-04T16:00:00Z', segmentos: [{ id: id(7), user_id: id(6), nome: 'Pessoa', inicio: '2026-11-04T16:00:00Z', fim: null }], agenda: agenda({ busy: [{ start: '2026-11-04T16:10:00Z', end: '2026-11-04T17:30:00Z' }] }) }), [], now)
    expect(r).toMatchObject({ minutos_cliente: 60, minutos_estrategista: 10, etapa: '50', pausado: true })
  })
  it('no feriado, reunião e espera valem zero', () => {
    expect(medirEpisodioTempo(episodio({ feriados: ['2026-11-04'], agenda: agenda({ busy: [{ start: from, end: '2026-11-04T17:30:00Z' }] }) }), [], now)).toMatchObject({ minutos_cliente: 0, minutos_estrategista: 0, minutos_descontados: 0, etapa: null })
  })
  it('troca de responsável considera só a reunião do segmento atual', () => {
    const r = medirEpisodioTempo(episodio({ segmentos: [{ id: id(7), user_id: id(6), nome: 'Pessoa atual', inicio: '2026-11-04T16:30:00Z', fim: null }], agenda: agenda({ busy: [{ start: '2026-11-04T14:00:00Z', end: '2026-11-04T16:40:00Z' }] }) }), [], now)
    expect(r).toMatchObject({ minutos_cliente: 240, minutos_estrategista: 20, minutos_descontados: 10 })
  })
  it('cobertura parcial mantém espera, mas não inventa tempo individual', () => {
    const r = medirEpisodioTempo(episodio({ agenda: agenda({ from: '2026-11-04T16:00:00Z' }) }), [], now)
    expect(r).toMatchObject({ minutos_cliente: 240, minutos_estrategista: null, minutos_descontados: null, agenda_status: 'incomplete', qualidade_individual: 'inconclusiva', agenda_alertas_disponiveis: true })
  })
  it('falha, snapshot vencido e múltiplas agendas não equivalem a agenda livre', () => {
    for (const a of [{ status: 'unavailable' as const }, { status: 'incomplete' as const }, agenda({ synced_at: '2026-11-04T16:54:59Z' })]) {
      expect(medirEpisodioTempo(episodio({ agenda: a }), [], now)).toMatchObject({ minutos_cliente: 240, minutos_estrategista: null, qualidade_individual: 'inconclusiva', agenda_alertas_disponiveis: false })
    }
  })
  it('desconectar retoma avisos sem inventar cobertura do período anterior', () => {
    const r = medirEpisodioTempo(episodio({ agenda: { status: 'disconnected', disconnected_at: '2026-11-04T16:00:00Z' } }), [], now)
    expect(r).toMatchObject({ minutos_cliente: 240, minutos_estrategista: null, agenda_status: 'disconnected', qualidade_individual: 'inconclusiva', pausado: false, agenda_alertas_disponiveis: true })
  })
  it('segmento iniciado após desconexão segue regra sem agenda', () => {
    const r = medirEpisodioTempo(episodio({ segmentos: [{ id: id(7), user_id: id(6), nome: 'Pessoa', inicio: '2026-11-04T16:10:00Z', fim: null }], agenda: { status: 'disconnected', disconnected_at: '2026-11-04T16:00:00Z' } }), [], now)
    expect(r).toMatchObject({ minutos_cliente: 240, minutos_estrategista: 50, agenda_status: 'disconnected', qualidade_individual: 'sem_agenda', agenda_alertas_disponiveis: true })
  })
  it('sem agenda preserva medição anterior e informa sua limitação', () => {
    expect(medirEpisodioTempo(episodio(), [], now)).toMatchObject({ minutos_cliente: 240, minutos_estrategista: 240, agenda_status: 'not_connected', qualidade_individual: 'sem_agenda' })
  })
  it('um snapshot congelado no encerramento não vence quando a página é aberta dias depois', () => {
    const snapshot = agenda({ busy: [{ start: '2026-11-04T13:00:00Z', end: '2026-11-04T14:00:00Z' }] })
    const r = medirEpisodioTempo(episodio({ estado: 'respondido', resposta_em: now, agenda: snapshot }), [], '2026-12-04T17:00:00Z')
    expect(r).toMatchObject({ minutos_cliente: 240, minutos_estrategista: 180, minutos_descontados: 60, agenda_status: 'connected', pausado: false })
  })
  it('painel expõe totais e estado, sem retornar os blocos privados da agenda', () => {
    const r = enriquecerPainelTempo({ agora: now, config: { modo: 'observacao', feriados: [], anos_confirmados: [2026], revisao: 1, monitorando_desde: from }, episodios: [episodio({ agenda: agenda() })], pausas: [], proximo_cursor: null })
    expect(r.episodios[0].agenda_status).toBe('connected')
    expect(r.episodios[0]).not.toHaveProperty('agenda')
    expect(JSON.stringify(r)).not.toContain('synced_at')
  })
  it('fim da reunião é inclusivo para retomar, começo é inclusivo para pausar', () => {
    const a = agenda({ busy: [{ start: '2026-11-04T16:00:00Z', end: now }] })
    expect(avaliarAgendaEpisodio(a, from, now, now, true).ocupado).toBe(false)
    expect(avaliarAgendaEpisodio(agenda({ busy: [{ start: now, end: '2026-11-04T17:30:00Z' }] }), from, now, now, true).ocupado).toBe(true)
  })
})

function contexto(testMode = false) {
  const c = { id: id(30), tenant_id: id(2), workspace_id: id(31), ativo: true, revisao: 1, revoked_at: null, expires_at: '2099-01-01T00:00:00Z' }
  const v = { id: id(32), tenant_id: id(2), connection_id: id(30), gt3_user_id: id(33), desk_user_id: id(6), ativo: true, modo_teste: testMode, revisao: 4 }
  const f = criarSupabaseFalso({}, { tempo_resposta_agenda_registrar: () => ({ ok: true }) })
  const acesso = vi.fn(async () => ({ c, v, escopo: { modo: 'normal', politica: 'carteira_gt3', tenantId: id(2), userId: id(6), total: false, clientIds: new Set([id(3)]), instancias: new Set([id(5)]), permissoes: {} }, scope_hash: 'a'.repeat(64) }) as AcessoTempo)
  const reconferir = vi.fn(async () => {})
  return { ctx: { admin: f.client, c, acesso, reconferir }, f, v }
}
const payload = { acao: 'tempo_resposta_agenda', gt3_user_id: id(33), vinculo_revisao: 4, agenda: { status: 'disconnected', revision: 0, from: null, to: null, synced_at: null, busy: [] } }
describe('agenda pela ponte autorizada', () => {
  it('grava apenas o usuário mapeado, após revalidação', async () => {
    const m = contexto(); const rpc = vi.spyOn(m.f.client, 'rpc')
    expect(await executarPonteTempo(m.ctx, payload)).toEqual({ ok: true })
    expect(m.ctx.reconferir).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('tempo_resposta_agenda_registrar', { p_connection: id(30), p_gt3_user: id(33), p_recipient_revisao: 4, p_agenda: payload.agenda })
  })
  it('agenda de Bruno em modo teste nunca vira agenda de Luis', async () => {
    const m = contexto(true); const rpc = vi.spyOn(m.f.client, 'rpc')
    await expect(executarPonteTempo(m.ctx, payload)).rejects.toMatchObject({ codigo: 'agenda_vinculo_invalido' })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('não aceita revisão antiga nem identidade Desk fornecida pelo chamador', async () => {
    const m = contexto(); const rpc = vi.spyOn(m.f.client, 'rpc')
    await expect(executarPonteTempo(m.ctx, { ...payload, vinculo_revisao: 3 })).rejects.toMatchObject({ codigo: 'agenda_vinculo_invalido' })
    await expect(executarPonteTempo(m.ctx, { ...payload, desk_user_id: id(99) })).rejects.toMatchObject({ status: 400 })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('revogação entre consultas impede a gravação', async () => {
    const m = contexto(); const rpc = vi.spyOn(m.f.client, 'rpc')
    m.ctx.reconferir.mockRejectedValueOnce(new Error('revogado'))
    await expect(executarPonteTempo(m.ctx, payload)).rejects.toThrow('revogado')
    expect(rpc).not.toHaveBeenCalled()
  })
})


describe('aviso não interrompe agenda ocupada', () => {
  const cfg = { modo: 'alertas', anos_confirmados: [2026], feriados: [], revisao: 1, monitorando_desde: from }
  it.each([
    agenda({ busy: [{ start: '2026-11-04T16:00:00Z', end: '2026-11-04T17:30:00Z' }] }),
    { status: 'unavailable' as const },
    agenda({ synced_at: '2026-11-04T16:54:59Z' }),
  ])('não cria candidato se ocupado ou sem disponibilidade atual (%j)', async (a) => {
    const m = contexto()
    const f = criarSupabaseFalso({}, { tempo_resposta_lote: () => ({ agora: now, config: cfg, episodios: [episodio({ agenda: a })], pausas: [], proximo_cursor: null }) })
    expect(await executarPonteTempo({ ...m.ctx, admin: f.client }, { acao: 'tempo_resposta_candidatos' })).toEqual({ ok: true, candidatos: [], proximo_cursor: null })
    expect(f.atualizados).toHaveLength(0)
  })
  it('reunião iniciada entre rechecagens adia sem gravar texto nem consumir aviso', async () => {
    const m = contexto(); let leituras = 0
    const a = { id: id(40), tenant_id: id(2), connection_id: id(30), recipient_id: id(32), gt3_user_id: id(33), recipient_revisao: 4,
      episodio_id: id(1), segmento_id: id(7), etapa: '60', config_revisao: 1, status: 'pendente', delivery_id: null, texto: null }
    const f = criarSupabaseFalso({ tempo_resposta_alertas: [a] }, { tempo_resposta_detalhe: () => ({ agora: now, config: cfg, pausas: [], episodio: episodio({ agenda: ++leituras === 1 ? agenda() : agenda({ busy: [{ start: now, end: '2026-11-04T17:30:00Z' }] }) }) }) })
    await expect(executarPonteTempo({ ...m.ctx, admin: f.client }, { acao: 'tempo_resposta_confirmar', alerta_id: id(40), gt3_user_id: id(33), request_id: id(41) })).rejects.toMatchObject({ codigo: 'tempo_resposta_adiado' })
    expect(leituras).toBe(2)
    expect(f.atualizados).toHaveLength(0)
  })
})


function pagina() { return { agora: now, ator_id: id(50), tenant_id: id(2), config: { modo: 'observacao' as const, feriados: [], anos_confirmados: [2026], revisao: 1, monitorando_desde: from }, episodios: [episodio()], pausas: [], proximo_cursor: null } }
function usuarioPainel(permitido: () => boolean = () => true, base = pagina()) {
  const f = criarSupabaseFalso({ users: [{ id: id(50), tenant_id: id(2), ativo: true, perfil: 'admin' }] }, { has_permissao: permitido, tempo_resposta_painel: () => base })
  f.client.auth = { getUser: async () => ({ data: { user: { id: id(50) } }, error: null }) }
  return f.client
}
const reqPainel = (body: Record<string, unknown> = { acao: 'painel' }) => new Request('https://test.invalid', { method: 'POST', headers: { authorization: 'Bearer token_teste' }, body: JSON.stringify(body) })
describe('hidratação privada após autorização do painel', () => {
  it('consulta só tenant e IDs autorizados, retorna métricas sem agenda bruta', async () => {
    const rpc = vi.fn(async () => ({ data: [{ id: id(1), agenda: agenda({ busy: [{ start: '2026-11-04T13:00:00Z', end: '2026-11-04T14:00:00Z' }] }) }], error: null }))
    const criar = vi.fn(() => ({ rpc } as never))
    const res = await atenderAdminTempo(reqPainel(), () => usuarioPainel(), criar)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.episodios[0]).toMatchObject({ minutos_cliente: 240, minutos_estrategista: 180, agenda_status: 'connected' })
    expect(rpc).toHaveBeenCalledWith('tempo_resposta_agendas_episodios', { p_tenant: id(2), p_ids: [id(1)] })
    expect(JSON.stringify(json)).not.toContain('busy')
    expect(JSON.stringify(json)).not.toContain('synced_at')
    expect(json.episodios[0]).not.toHaveProperty('agenda')
  })
  it('usuário sem permissão não constrói cliente privilegiado', async () => {
    const criar = vi.fn()
    expect((await atenderAdminTempo(reqPainel(), () => usuarioPainel(() => false), criar)).status).toBe(403)
    expect(criar).not.toHaveBeenCalled()
  })
  it('dados fora do escopo da página são recusados antes da hidratação', async () => {
    const criar = vi.fn()
    await expect(hidratarAgendaPainel({ ...pagina(), tenant_id: id(99) }, id(50), id(2), criar)).rejects.toThrow(/escopo/)
    await expect(hidratarAgendaPainel({ ...pagina(), episodios: [episodio({ tenant_id: id(99) })] }, id(50), id(2), criar)).rejects.toThrow(/escopo/)
    expect(criar).not.toHaveBeenCalled()
  })
  it('resposta privilegiada com ID extra não entra nos totais', async () => {
    const rpc = vi.fn(async () => ({ data: [{ id: id(99), agenda: agenda() }], error: null }))
    expect((await atenderAdminTempo(reqPainel(), () => usuarioPainel(), () => ({ rpc } as never))).status).toBe(503)
  })
  it('IDs e tenant fornecidos no corpo não ampliam a consulta', async () => {
    const criar = vi.fn()
    expect((await atenderAdminTempo(reqPainel({ acao: 'painel', p_ids: [id(99)], tenant_id: id(99) }), () => usuarioPainel(), criar)).status).toBe(400)
    expect(criar).not.toHaveBeenCalled()
  })
  it('mudança de perfil durante hidratação nega a resposta mesmo com permissão ainda true', async () => {
    const pessoa = { id: id(50), tenant_id: id(2), ativo: true, perfil: 'admin' }
    const f = criarSupabaseFalso({ users: [pessoa] }, { has_permissao: () => true, tempo_resposta_painel: () => pagina() })
    f.client.auth = { getUser: async () => ({ data: { user: { id: id(50) } }, error: null }) }
    const rpc = vi.fn(async () => { pessoa.perfil = 'estrategista'; return { data: [{ id: id(1), agenda: agenda() }], error: null } })
    const res = await atenderAdminTempo(reqPainel(), () => f.client, () => ({ rpc } as never))
    expect(rpc).toHaveBeenCalledOnce()
    expect(res.status).toBe(403)
    expect(await res.text()).not.toContain('Cliente')
  })
  it('revogação durante a hidratação não libera a resposta', async () => {
    let consultas = 0
    const rpc = vi.fn(async () => ({ data: [{ id: id(1), agenda: agenda() }], error: null }))
    const res = await atenderAdminTempo(reqPainel(), () => usuarioPainel(() => ++consultas === 1), () => ({ rpc } as never))
    expect(res.status).toBe(403)
    expect(await res.text()).not.toContain('Cliente')
  })
})

describe('contratos estáticos da migration — não executam SQL', () => {
  const sql = readFileSync(new URL('../../migrations/20261104164519_tempo_resposta_agenda_ocupada.sql', import.meta.url), 'utf8')
  it('painel autenticado remove agenda de cada episódio e leitura detalhada é só servidor', () => {
    const painel = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.tempo_resposta_painel('), sql.indexOf('CREATE FUNCTION public.tempo_resposta_agendas_episodios('))
    expect(painel).toContain("private.tempo_resposta_projetar(t,q.id)-ARRAY['agenda','agenda_no_encerramento']")
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.tempo_resposta_agendas_episodios(uuid,uuid[]) FROM PUBLIC,anon,authenticated;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.tempo_resposta_agendas_episodios(uuid,uuid[]) TO service_role;')
  })
  it('erro N+1 impede sucesso N atrasado antes da escrita, sob lock da identidade', () => {
    const fn = sql.slice(sql.indexOf('CREATE FUNCTION public.tempo_resposta_agenda_registrar('), sql.indexOf('REVOKE ALL ON FUNCTION public.tempo_resposta_agenda_registrar'))
    const lock = fn.indexOf('pg_advisory_xact_lock')
    const guard = fn.indexOf('versao<anterior.agenda_revisao')
    const insert = fn.indexOf('INSERT INTO public.tempo_resposta_agendas')
    expect(lock).toBeGreaterThan(0)
    expect(guard).toBeGreaterThan(lock)
    expect(insert).toBeGreaterThan(guard)
    expect(fn.slice(guard, insert)).toContain("RETURN jsonb_build_object('ok',true,'ignorado',true);")
  })
})
