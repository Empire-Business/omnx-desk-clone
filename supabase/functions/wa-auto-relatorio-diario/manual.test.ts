import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { executarManual } from './manual.ts'
import { carregarGruposInternos } from '../_shared/wa-grupos-internos-dados.ts'
import { disjuntorAberto, resolveUazapiDaInstancia, WaProviderError } from '../_shared/wa-provider.ts'
import { prepararRelatorio, redigirRelatorio } from './preparar.ts'

vi.mock('../_shared/wa-grupos-internos-dados.ts', () => ({ carregarGruposInternos: vi.fn() }))
vi.mock('../_shared/wa-provider.ts', async importOriginal => ({ ...await importOriginal<object>(), resolveUazapiDaInstancia: vi.fn(), disjuntorAberto: vi.fn() }))
// enviarAvisoCompleto (envio do aviso inteiro, em partes) fica o de verdade; só preparar/redigir são simulados.
vi.mock('./preparar.ts', async importOriginal => ({ ...await importOriginal<object>(), prepararRelatorio: vi.fn(), redigirRelatorio: vi.fn() }))
const tenant = '00000000-0000-4000-8000-000000000001'
const actor = '00000000-0000-4000-8000-000000000002'
const gestor = '00000000-0000-4000-8000-000000000003'
const request = '00000000-0000-4000-8000-000000000004'
const jid = '120363000000000001@g.us'
const send = vi.fn()
type Row = Record<string, any>

function fixture() {
  const tables: Record<string, Row[]> = {
    users: [{ id: actor, perfil: 'admin', ativo: true, tenant_id: tenant }],
    profiles: [{ user_id: actor, tenant_id: tenant }],
    app_modules: [{ slug: 'automacoes-wa', enabled: true, tenant_id: tenant }],
    wa_auto_config: [{ relatorio_ativo: true, uazapi_instance_id: 'Suporte4', tenant_id: tenant }],
    wa_auto_gestores: [{ id: gestor, nome: 'Report Entregas', grupo_nome: 'Report Entregas', grupo_jid: jid, tipo: 'grupo', ativo: true, tenant_id: tenant }],
    wa_auto_envios: [],
  }
  const writes: { table: string; op: string; row: Row }[] = []
  const queries: { table: string; filters: [string, unknown][] }[] = []
  const state = { failReserve: false, failUpdate: false, auth: true, userId: actor }
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: state.auth ? { id: state.userId } : null }, error: null })) },
    from(table: string) {
      const filters: [string, unknown][] = []; let op = 'select'; let value: Row = {}
      const run = () => {
        queries.push({ table, filters: [...filters] })
        const matching = tables[table].filter(r => filters.every(([k, v]) => r[k] === v))
        if (op === 'insert') {
          if (state.failReserve) return { data: null, error: { code: 'other' } }
          if (tables[table].some(r => r.id === value.id)) return { data: null, error: { code: '23505' } }
          writes.push({ table, op, row: structuredClone(value) }); tables[table].push(value)
          return { data: value, error: null }
        }
        if (op === 'update') {
          if (state.failUpdate) return { data: null, error: { code: 'other' } }
          writes.push({ table, op, row: value }); matching.forEach(r => Object.assign(r, value))
        }
        return { data: matching[0] ?? null, error: null }
      }
      const q = { select: () => q, eq: (k: string, v: unknown) => { filters.push([k, v]); return q },
        single: async () => run(), maybeSingle: async () => run(),
        insert: (v: Row) => { op = 'insert'; value = v; return q }, update: (v: Row) => { op = 'update'; value = v; return q },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
      }
      return q
    },
  } as unknown as SupabaseClient
  return { client, state, tables, writes, queries }
}
function req(body: unknown = { destinatario_id: gestor, request_id: request }, headers = { authorization: 'Bearer opaque-test-session', 'x-actor-id': actor, 'x-relatorio-grupo': jid, 'x-relatorio-instancia': 'instance-4' }) {
  return new Request('https://example.invalid/functions/v1/wa-auto-relatorio-diario', { method: 'POST', headers, body: JSON.stringify(body) })
}
const links = { painel: null, vinculos: null }
async function call(f: ReturnType<typeof fixture>, r = req()) {
  const response = await executarManual(r, f.client, f.client, null, links)
  return { http: response.status, body: await response.json() }
}
beforeEach(() => {
  vi.clearAllMocks()
  send.mockReset().mockResolvedValue({ messageId: 'provider-receipt' })
  vi.mocked(carregarGruposInternos).mockResolvedValue({ instanciaUuid: 'instance-4', grupos: [{ grupo_jid: jid, nome: 'Report Entregas', participa: true }], deCliente: new Set(), nomeDeCliente: new Set() })
  vi.mocked(disjuntorAberto).mockResolvedValue(false)
  vi.mocked(resolveUazapiDaInstancia).mockResolvedValue({ provider: { nome: 'uazapi', sendText: send } as any, fonteSegredo: 'vault', instanceId: 'Suporte4', status: 'conectado', numero: null })
  vi.mocked(prepararRelatorio).mockResolvedValue({ contagem: { sem_resposta: 1 } } as any)
  vi.mocked(redigirRelatorio).mockResolvedValue({ texto: 'Diário atual com rodapé', origem: 'fallback', motivos: [] })
})

describe('relatório manual — handler real, I/O simulado', () => {
  it.each(['anonymous', 'wrong-actor', 'non-admin', 'inactive', 'profile-tenant', 'no-tenant'])('nega %s antes de dados/reserva/provedor', async scenario => {
    const f = fixture()
    if (scenario === 'anonymous') f.state.auth = false
    if (scenario === 'wrong-actor') f.state.userId = 'outro'
    if (scenario === 'non-admin') f.tables.users[0].perfil = 'gerente'
    if (scenario === 'inactive') f.tables.users[0].ativo = false
    if (scenario === 'profile-tenant') f.tables.profiles[0].tenant_id = 'outro'
    if (scenario === 'no-tenant') f.tables.users[0].tenant_id = null
    expect((await call(f)).http).toBeGreaterThanOrEqual(400)
    expect(prepararRelatorio).not.toHaveBeenCalled(); expect(f.writes).toEqual([]); expect(send).not.toHaveBeenCalled()
  })
  it.each(['tenant', 'person', 'inactive', 'module', 'config', 'client-group', 'outside-instance', 'breaker'])('bloqueia destino/configuração %s', async scenario => {
    const f = fixture()
    if (scenario === 'tenant') f.tables.wa_auto_gestores[0].tenant_id = 'outro'
    if (scenario === 'person') f.tables.wa_auto_gestores[0].tipo = 'pessoa'
    if (scenario === 'inactive') f.tables.wa_auto_gestores[0].ativo = false
    if (scenario === 'module') f.tables.app_modules[0].enabled = false
    if (scenario === 'config') f.tables.wa_auto_config[0].relatorio_ativo = false
    if (scenario === 'client-group') vi.mocked(carregarGruposInternos).mockResolvedValue({ instanciaUuid: 'instance-4', grupos: [], deCliente: new Set([jid]), nomeDeCliente: new Set() })
    if (scenario === 'outside-instance') vi.mocked(carregarGruposInternos).mockResolvedValue({ instanciaUuid: null, grupos: [], deCliente: new Set(), nomeDeCliente: new Set() })
    if (scenario === 'breaker') vi.mocked(disjuntorAberto).mockResolvedValue(true)
    expect((await call(f)).http).toBeGreaterThanOrEqual(400)
    expect(f.writes).toEqual([]); expect(send).not.toHaveBeenCalled()
  })
  it('prévia tem o mesmo texto preparado e não cria nenhum registro nem resolve provedor', async () => {
    const f = fixture()
    const r = await call(f, req({ acao: 'prever_manual', destinatario_id: gestor }))
    expect(r.body).toMatchObject({ ok: true, status: 'previa', mensagem: 'Diário atual com rodapé', destino_nome: 'Report Entregas', instancia: 'Suporte4' })
    expect(f.writes).toEqual([]); expect(send).not.toHaveBeenCalled(); expect(resolveUazapiDaInstancia).not.toHaveBeenCalled()
    expect(prepararRelatorio).toHaveBeenCalledWith(f.client, tenant, expect.any(Date), links)
  })
  it('aceita NULL ativo legado, reserva PK solicitado e só envia ao grupo cadastrado', async () => {
    const f = fixture(); f.tables.users[0].ativo = null
    // Registro normal de hoje não bloqueia o pedido manual explícito.
    f.tables.wa_auto_envios.push({ id: 'diario-anterior', tenant_id: tenant, status: 'enviado' })
    const r = await call(f)
    expect(r.body).toMatchObject({ status: 'enviado', accepted: true, persisted: true, message_id: 'provider-receipt' })
    expect(f.writes[0]).toMatchObject({ op: 'insert', row: { id: request, tenant_id: tenant, status: 'pendente', chave_idempotencia: `relatorio_diario:manual:${request}` } })
    expect(send).toHaveBeenCalledExactlyOnceWith(jid, 'Diário atual com rodapé', expect.objectContaining({ humanizado: 'fallback' }))
    expect(f.queries.filter(q => !['users', 'profiles'].includes(q.table)).every(q => q.filters.some(([k,v]) => k === 'tenant_id' && v === tenant) || q.table === 'wa_auto_envios')).toBe(true)
  })
  it.each([{ tenant_id: tenant }, { texto: 'injetado' }, { grupo_jid: jid }, { request_id: 'bad' }])('recusa campos livres/UUID inválido %j', async extra => {
    const f = fixture(); expect((await call(f, req({ destinatario_id: gestor, request_id: request, ...extra }))).http).toBe(400)
    expect(f.writes).toEqual([]); expect(send).not.toHaveBeenCalled()
  })
  it.each(['enviado', 'falhou', 'pendente', 'simulado'])('pedido existente %s nunca reenvia', async status => {
    const f = fixture(); f.tables.wa_auto_envios.push({ id: request, tenant_id: tenant, tipo: 'relatorio_diario', status,
      chave_idempotencia: `relatorio_diario:manual:${request}`, payload: { manual: true, destinatario_id: gestor, solicitado_por: actor } })
    expect((await call(f)).body).toMatchObject({ status, duplicado: true })
    expect(send).not.toHaveBeenCalled(); expect(prepararRelatorio).not.toHaveBeenCalled()
  })
  it('concorrência com mesma PK faz um envio; perdedor23505 só lê o recibo', async () => {
    const f = fixture(); const result = await Promise.all([call(f), call(f)])
    expect(send).toHaveBeenCalledTimes(1)
    expect(result.every(r => r.body.ok)).toBe(true)
    expect(result.some(r => r.body.duplicado)).toBe(true)
  })
  it.each(['tenant', 'target', 'actor'])('colisão %s não vaza e não envia', async collision => {
    const f = fixture(); f.tables.wa_auto_envios.push({ id: request, tenant_id: collision === 'tenant' ? 'outro' : tenant, tipo: 'relatorio_diario', status: 'enviado',
      chave_idempotencia: `relatorio_diario:manual:${request}`, payload: { manual: true, destinatario_id: collision === 'target' ? 'outro' : gestor, solicitado_por: collision === 'actor' ? 'outro' : actor } })
    expect((await call(f)).body).toEqual({ ok: false, error: 'pedido_conflitante' }); expect(send).not.toHaveBeenCalled()
  })
  it('nega revogação durante a humanização', async () => {
    const f = fixture(); vi.mocked(redigirRelatorio).mockImplementationOnce(async () => {
      f.tables.users[0].ativo = false; return { texto: 'diário', origem: 'fallback', motivos: [] }
    })
    expect((await call(f)).http).toBe(403); expect(f.writes).toEqual([]); expect(send).not.toHaveBeenCalled()
  })
  it('nega mudança de instância durante a humanização', async () => {
    const f = fixture(); vi.mocked(carregarGruposInternos).mockResolvedValueOnce({ instanciaUuid: 'instance-old', grupos: [{ grupo_jid: jid, nome: 'Report', participa: true }], deCliente: new Set(), nomeDeCliente: new Set() })
    expect((await call(f)).body.error).toBe('destinatario_alterado'); expect(f.writes).toEqual([]); expect(send).not.toHaveBeenCalled()
  })
  it('falha ao reservar interrompe antes de send', async () => {
    const f = fixture(); f.state.failReserve = true
    expect((await call(f)).body.error).toBe('reserva_falhou'); expect(send).not.toHaveBeenCalled()
  })
  it('ACK + falha gravar mantém reserva sem inventar sucesso persistido e repetição não envia', async () => {
    const f = fixture(); f.state.failUpdate = true
    expect((await call(f)).body).toMatchObject({ accepted: true, persisted: false, status: 'pendente', message_id: 'provider-receipt', incerto: true })
    expect(f.tables.wa_auto_envios[0].status).toBe('pendente')
    expect((await call(f)).body).toMatchObject({ status: 'pendente', duplicado: true })
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('timeout incerto é registrado e nunca repetido pelo mesmo pedido', async () => {
    const f = fixture(); send.mockRejectedValue(new WaProviderError('rede', 'erro seguro', undefined, true))
    expect((await call(f)).body).toMatchObject({ status: 'falhou', accepted: false, incerto: true })
    expect((await call(f)).body).toMatchObject({ duplicado: true, incerto: true })
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('ACK sem messageId não inventa recibo', async () => {
    const f = fixture(); send.mockResolvedValue({ messageId: null })
    expect((await call(f)).body).toMatchObject({ status: 'enviado', accepted: true, message_id: null })
  })
  it.each(['x-relatorio-grupo', 'x-relatorio-instancia'])('expectativa divergente %s impede preparar/reservar/enviar', async header => {
    const f = fixture(); const request = req(); request.headers.set(header, 'outro')
    expect((await call(f, request)).body.error).toBe('destinatario_alterado')
    expect(prepararRelatorio).not.toHaveBeenCalled(); expect(f.writes).toEqual([]); expect(send).not.toHaveBeenCalled()
  })
  it('reserva existente continua consultável após desligar o relatório, sem expectativas nem reenvio', async () => {
    const f = fixture(); await call(f); f.tables.wa_auto_config[0].relatorio_ativo = false
    const request = req(); request.headers.delete('x-relatorio-grupo'); request.headers.delete('x-relatorio-instancia')
    expect((await call(f, request)).body).toMatchObject({ status: 'enviado', duplicado: true })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('fixa resolução pelo UUID validado e não por configuração relida', async () => {
    const f = fixture(); await call(f)
    expect(resolveUazapiDaInstancia).toHaveBeenCalledExactlyOnceWith(f.client, tenant, 'instance-4')
  })
  it.each(['outro-numero', 'desconectado'])('resolver %s não pode trocar número ou enviar desconectado', async scenario => {
    const f = fixture()
    vi.mocked(resolveUazapiDaInstancia).mockResolvedValue({ provider: { nome: 'uazapi', sendText: send } as any,
      fonteSegredo: 'vault', instanceId: scenario === 'outro-numero' ? 'Suporte1' : 'Suporte4', status: scenario === 'desconectado' ? 'desconectado' : 'conectado', numero: null })
    expect((await call(f)).body.error).toBe('instancia_indisponivel')
    expect(f.writes).toEqual([]); expect(send).not.toHaveBeenCalled()
  })

})
