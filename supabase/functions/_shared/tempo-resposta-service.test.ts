import { describe, expect, it, vi } from 'vitest'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'
import { executarPonteTempo, medirEpisodioTempo, type AcessoTempo, type EpisodioTempo, type PausaTempo } from './tempo-resposta-service.ts'
import { atenderAdminTempo, comandoAdminTempo } from './tempo-resposta-http.ts'
import { registrarIngressoTempo } from './tempo-resposta-ingresso.ts'
import { cronWaProtegido } from './cron-wa-protegido.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const T = id(1), C = id(2), E = id(3), U = id(4), G = id(5), R = id(6), S = id(7), A = id(8), CLIENT = id(9), INSTANCE = id(10), DELIVERY = id(11)
const agora = '2026-11-03T13:50:00Z'
const cfg = { modo: 'alertas' as const, revisao: 1, feriados: [], anos_confirmados: [2026], monitorando_desde: '2026-11-03T12:00:00Z' }
function ep(p: Partial<EpisodioTempo> = {}): EpisodioTempo { return { id: E, tenant_id: T, client_id: CLIENT, cliente: 'Cliente Exemplo', conversation_id: id(12), instance_id: INSTANCE, inicio: '2026-11-03T13:00:00Z', resposta_em: null, estado: 'aberto', qualidade: 'confiavel', motivo: null, responsavel_id: U, responsavel: 'Estrategista Exemplo', segmento_atual_id: S, config_revisao: 1, feriados: [], anos_confirmados: [2026], segmentos: [{ id: S, user_id: U, nome: 'Estrategista Exemplo', inicio: '2026-11-03T13:00:00Z', fim: null }], ...p } }
function montar(op: { episodio?: EpisodioTempo; pausas?: PausaTempo[]; modo?: 'alertas' | 'observacao'; detalhe?: () => unknown; alerta?: Record<string, unknown> } = {}) {
  const c = { id: C, tenant_id: T, workspace_id: id(20), ativo: true, revisao: 1, revoked_at: null, expires_at: '2099-01-01T00:00:00Z' }
  const v = { id: R, tenant_id: T, connection_id: C, gt3_user_id: G, desk_user_id: U, ativo: true, modo_teste: false, revisao: 1 }
  const alerta = { id: A, tenant_id: T, connection_id: C, recipient_id: R, gt3_user_id: G, recipient_revisao: 1, episodio_id: E, segmento_id: S, etapa: '50', config_revisao: 1, status: 'pendente', delivery_id: null, texto: null, ...op.alerta }
  const config = { ...cfg, modo: op.modo ?? 'alertas' }
  const episodio = op.episodio ?? ep(); const pausas = op.pausas ?? []
  const f = criarSupabaseFalso({ iris_gt3_recipients: [v], tempo_resposta_alertas: [alerta] }, {
    tempo_resposta_lote: () => ({ agora, config, episodios: [episodio], pausas, proximo_cursor: E }),
    tempo_resposta_detalhe: op.detalhe ?? (() => ({ agora, config, episodio, pausas })),
  })
  // O falso legado não implementa UPDATE RETURNING; este adaptador local
  // preserva o compare-and-set e devolve somente a linha realmente alterada.
  const from = f.client.from.bind(f.client)
  f.client.from = (tabela: string) => {
    const original = from(tabela)
    if (tabela !== 'tempo_resposta_alertas') return original
    original.update = (campos: Record<string, unknown>) => {
      const filtros: ((row: Record<string, unknown>) => boolean)[] = []; const nomes: string[] = []
      const guardar = (nome: string, fn: (row: Record<string, unknown>) => boolean) => { nomes.push(nome); filtros.push(fn); return b }
      const run = () => {
        f.consultas.push({ tabela, filtros: nomes, operacao: 'update' })
        if (!filtros.every((fn) => fn(alerta))) return { data: null, error: null }
        Object.assign(alerta, campos); f.atualizados.push({ tabela, campos }); return { data: alerta, error: null }
      }
      const b = { eq: (k: string, x: unknown) => guardar(`eq:${k}`, (r) => r[k] === x), neq: (k: string, x: unknown) => guardar(`neq:${k}`, (r) => r[k] !== x), is: (k: string, x: unknown) => guardar(`is:${k}`, (r) => (r[k] ?? null) === x), in: (k: string, xs: unknown[]) => guardar(`in:${k}`, (r) => xs.includes(r[k])), select: () => b, maybeSingle: async () => run(), then: (resolve: (r: unknown) => unknown) => Promise.resolve(run()).then(resolve) }
      return b
    }
    return original
  }
  const acesso = vi.fn(async () => ({ c, v, escopo: { modo: 'normal', politica: 'carteira_gt3', tenantId: T, userId: U, total: false, clientIds: new Set([CLIENT]), instancias: new Set([INSTANCE]), permissoes: {} }, scope_hash: 'a'.repeat(64) }) as AcessoTempo)
  const reconferir = vi.fn(async () => {})
  return { ...f, alerta, config, pausas, ctx: { admin: f.client, c, acesso, reconferir } }
}
const confirmar = { acao: 'tempo_resposta_confirmar', alerta_id: A, gt3_user_id: G, request_id: DELIVERY }

describe('mesma medição no painel e na entrega', () => {
  it('mantém espera cliente e conta somente segmento atual com pausa', () => {
    const r = medirEpisodioTempo(ep({ segmentos: [{ id: S, user_id: U, nome: 'Pessoa', inicio: '2026-11-03T13:30:00Z', fim: null }] }), [{ id: id(44), user_id: U, inicio: '2026-11-03T13:35:00Z', fim: '2026-11-03T13:45:00Z', motivo: 'Reunião' }], agora)
    expect(r).toMatchObject({ minutos_cliente: 50, minutos_estrategista: 10, minutos_descontados: 10, etapa: '50', pausado: false })
  })
  it('calendário de outro ano não produz número nem alerta', () => { expect(medirEpisodioTempo(ep({ anos_confirmados: [2025] }), [], agora)).toMatchObject({ qualidade: 'inconclusiva', minutos_cliente: null, etapa: null }) })
  it('caso inconclusivo nunca vira etapa de cobrança', () => { expect(medirEpisodioTempo(ep({ qualidade: 'inconclusiva' }), [], agora).etapa).toBeNull() })
  it('pausa encerrada no mesmo instante não invalida medição', () => { expect(medirEpisodioTempo(ep(), [{ id: id(45), user_id: U, inicio: agora, fim: agora, motivo: 'Encerrada' }], agora).minutos_cliente).toBe(50) })
  it('limite de 400dias falha fechado', () => { expect(medirEpisodioTempo(ep({ inicio: '2024-01-01T13:00:00Z', anos_confirmados: [2024, 2025, 2026] }), [], agora).qualidade).toBe('inconclusiva') })
})
describe('ponte privada e atualidade', () => {
  it('confirma texto fixo somente depois de duas leituras e revalidação', async () => {
    const m = montar(); const r = await executarPonteTempo(m.ctx, confirmar)
    expect(r).toMatchObject({ tem_alertas: true, vinculo_revisao: 1 })
    expect(m.ctx.reconferir).toHaveBeenCalledOnce()
    expect(m.alerta.delivery_id).toBe(DELIVERY)
    expect(m.consultas.every((q) => q.filtros.includes('eq:tenant_id'))).toBe(true)
  })
  it('não divulga id de outro tenant', async () => { const m = montar({ alerta: { tenant_id: id(50) } }); await expect(executarPonteTempo(m.ctx, confirmar)).rejects.toMatchObject({ status: 404 }); expect(m.ctx.acesso).not.toHaveBeenCalled() })
  it('não divulga id de outro destinatário', async () => { const m = montar(); await expect(executarPonteTempo(m.ctx, { ...confirmar, gt3_user_id: id(90) })).rejects.toMatchObject({ status: 404 }) })
  it('bloqueia cliente fora da carteira', async () => { const m = montar({ episodio: ep({ client_id: id(55) }) }); expect(await executarPonteTempo(m.ctx, confirmar)).toMatchObject({ tem_alertas: false }) })
  it('bloqueia instância fora do escopo', async () => { const m = montar({ episodio: ep({ instance_id: id(55) }) }); expect(await executarPonteTempo(m.ctx, confirmar)).toMatchObject({ tem_alertas: false }) })
  it('observação suspende sem consumir aviso e retoma a mesma identidade', async () => {
    const m = montar({ modo: 'observacao' }); await expect(executarPonteTempo(m.ctx, confirmar)).rejects.toMatchObject({ status: 503, codigo: 'tempo_resposta_adiado' })
    expect(await executarPonteTempo(m.ctx, { acao: 'tempo_resposta_candidatos' })).toMatchObject({ candidatos: [] })
    m.config.modo = 'alertas'; m.config.revisao = 2
    expect(await executarPonteTempo(m.ctx, { acao: 'tempo_resposta_candidatos' })).toMatchObject({ candidatos: [{ alerta_id: A }] })
    expect(await executarPonteTempo(m.ctx, confirmar)).toMatchObject({ tem_alertas: true }); expect(m.alerta.id).toBe(A)
  })
  it('pausa ativa adia aviso; encerrada a pausa, retoma sem reiniciar espera', async () => {
    const m = montar({ pausas: [{ id: id(55), user_id: U, inicio: '2026-11-03T13:40:00Z', fim: '2026-11-03T14:10:00Z', motivo: 'Reunião' }] })
    await expect(executarPonteTempo(m.ctx, confirmar)).rejects.toMatchObject({ status: 503 })
    expect(await executarPonteTempo(m.ctx, { acao: 'tempo_resposta_candidatos' })).toMatchObject({ candidatos: [] })
    m.pausas[0].fim = agora
    expect(await executarPonteTempo(m.ctx, confirmar)).toMatchObject({ tem_alertas: true })
  })
  it('salvar calendário preserva idempotência de uma etapa já enviada', async () => {
    const m = montar({ alerta: { status: 'enviado', delivery_id: DELIVERY, texto: 'Aviso já entregue' } }); m.config.revisao = 2
    expect(await executarPonteTempo(m.ctx, { acao: 'tempo_resposta_candidatos' })).toMatchObject({ candidatos: [] })
    expect(await executarPonteTempo(m.ctx, confirmar)).toMatchObject({ tem_alertas: false })
  })
  it('pausa que começa entre rechecagens não grava texto nem consome aviso', async () => {
    let n = 0; const m = montar({ detalhe: () => ({ agora, config: cfg, episodio: ep(), pausas: ++n === 1 ? [] : [{ id: id(55), user_id: U, inicio: agora, fim: '2026-11-03T14:10:00Z', motivo: 'Reunião' }] }) })
    await expect(executarPonteTempo(m.ctx, confirmar)).rejects.toMatchObject({ status: 503 }); expect(m.atualizados).toHaveLength(0)
  })
  it('troca A→B→A não revive segmento anterior', async () => { const m = montar({ episodio: ep({ segmento_atual_id: id(66), segmentos: [{ id: id(66), user_id: U, nome: 'Pessoa', inicio: '2026-11-03T13:30:00Z', fim: null }] }) }); expect(await executarPonteTempo(m.ctx, confirmar)).toMatchObject({ tem_alertas: false }) })
  it('não manda faixa antiga depois de vencer', async () => { const m = montar({ alerta: { etapa: '30' } }); expect(await executarPonteTempo(m.ctx, confirmar)).toMatchObject({ tem_alertas: false }) })
  it('resposta entre as duas consultas cancela antes de gravar texto', async () => {
    let n = 0; const m = montar({ detalhe: () => ({ agora, config: cfg, pausas: [], episodio: ++n === 1 ? ep() : ep({ estado: 'respondido', resposta_em: agora }) }) })
    expect(await executarPonteTempo(m.ctx, confirmar)).toMatchObject({ tem_alertas: false }); expect(m.atualizados).toHaveLength(0)
  })
  it('revogação no callback impede emissão', async () => { const m = montar(); m.ctx.reconferir.mockRejectedValueOnce(new Error('revogado')); await expect(executarPonteTempo(m.ctx, confirmar)).rejects.toThrow('revogado'); expect(m.atualizados).toHaveLength(0) })
  it('paginação vazia mantém cursor para avançar', async () => { const m = montar({ episodio: ep({ qualidade: 'inconclusiva' }) }); expect(await executarPonteTempo(m.ctx, { acao: 'tempo_resposta_candidatos' })).toMatchObject({ candidatos: [], proximo_cursor: E }) })
  it('candidato tem IDs e faixa, sem mensagens/nomes', async () => { const m = montar(); expect(await executarPonteTempo(m.ctx, { acao: 'tempo_resposta_candidatos' })).toMatchObject({ candidatos: [{ alerta_id: A, gt3_user_id: G, episodio_id: E, etapa: '50', vinculo_revisao: 1 }] }) })
  it('recibo sem confirmação não inventa entrega', async () => { const m = montar(); await expect(executarPonteTempo(m.ctx, { acao: 'tempo_resposta_recibo', alerta_id: A, gt3_user_id: G, delivery_id: DELIVERY, status: 'enviado' })).rejects.toMatchObject({ status: 400 }) })
  it('recibo repetido não regride uma entrega confirmada', async () => { const m = montar({ alerta: { status: 'enviado', delivery_id: DELIVERY, texto: 'Mensagem persistida' } }); await executarPonteTempo(m.ctx, { acao: 'tempo_resposta_recibo', alerta_id: A, gt3_user_id: G, delivery_id: DELIVERY, status: 'falhou' }); expect(m.alerta.status).toBe('enviado'); expect(m.atualizados).toHaveLength(0) })
  it('rejeita tenant e conteúdo inventados no payload', async () => { const m = montar(); await expect(executarPonteTempo(m.ctx, { ...confirmar, tenant_id: T, texto: 'inventado' })).rejects.toMatchObject({ status: 400 }) })
})
describe('API administrativa', () => {
  it.each([{ acao: 'pausa', user_id: U, duracao_minutos: 500, motivo: 'Teste' }, { acao: 'titular', client_id: CLIENT, user_id: U, tenant_id: T }, { acao: 'salvar_config', revisao: 0, modo: 'alertas', feriados: ['2026-02-30'], anos_confirmados: [2026] }])('rejeita alteração inválida', (body) => { expect(() => comandoAdminTempo(body)).toThrow() })
  it('constrói parâmetros permitidos sem início retroativo da pausa', () => { expect(comandoAdminTempo({ acao: 'pausa', user_id: U, duracao_minutos: 30, motivo: ' Reunião ' })).toEqual({ rpc: 'tempo_resposta_pausar', args: { p_user: U, p_minutos: 30, p_motivo: 'Reunião' } }) })
  it('sem sessão não cria cliente', async () => { const criar = vi.fn(); expect((await atenderAdminTempo(new Request('https://test.invalid', { method: 'POST', body: '{}' }), criar)).status).toBe(401); expect(criar).not.toHaveBeenCalled() })
  it('estrategista sem admin não chega à mutação', async () => {
    const f = criarSupabaseFalso({ users: [{ id: U, tenant_id: T, ativo: true }] }, { has_permissao: () => false })
    f.client.auth = { getUser: async () => ({ data: { user: { id: U } }, error: null }) }
    const spy = vi.spyOn(f.client, 'rpc'); const r = await atenderAdminTempo(new Request('https://test.invalid', { method: 'POST', headers: { authorization: 'Bearer teste' }, body: JSON.stringify({ acao: 'pausa', user_id: U, duracao_minutos: 30, motivo: 'Reunião' }) }), () => f.client)
    expect(r.status).toBe(403); expect(spy.mock.calls.map(([name]) => name)).toEqual(['has_permissao'])
  })
})
describe('captura e cron legado', () => {
  it('ingresso não confiável não chama RPC', async () => { const rpc = vi.fn(); expect(await registrarIngressoTempo({ rpc } as never, { mensagemId: A, confiavel: false, ocorridoEm: agora })).toBe(false); expect(rpc).not.toHaveBeenCalled() })
  it('migration ainda ausente não impede Chat', async () => { const f = criarSupabaseFalso({}); expect(await registrarIngressoTempo(f.client, { mensagemId: A, confiavel: true, ocorridoEm: agora })).toBe(false) })
  it('sem segredo não cria admin nem executa monitor', async () => { const executar = vi.fn(); const criar = vi.fn(); const handler = cronWaProtegido(executar, criar); expect((await handler(new Request('https://test.invalid', { method: 'POST' }))).status).toBe(401); expect(criar).not.toHaveBeenCalled(); expect(executar).not.toHaveBeenCalled() })
  it('segredo errado só consulta verificação do Vault', async () => { const executar = vi.fn(); const rpc = vi.fn(async () => ({ data: false, error: null })); const r = await cronWaProtegido(executar, () => ({ rpc } as never))(new Request('https://test.invalid', { method: 'POST', headers: { 'x-cron-secret': 'x'.repeat(32) } })); expect(r.status).toBe(401); expect(rpc).toHaveBeenCalledWith('wa_auto_cron_secret_confere', { p_segredo: 'x'.repeat(32) }); expect(executar).not.toHaveBeenCalled() })
  it('segredo válido habilita rotina interna', async () => { const executar = vi.fn(async () => new Response('ok')); const rpc = vi.fn(async () => ({ data: true, error: null })); const r = await cronWaProtegido(executar, () => ({ rpc } as never))(new Request('https://test.invalid', { method: 'POST', headers: { 'x-cron-secret': 'x'.repeat(32) } })); expect(r.status).toBe(200); expect(executar).toHaveBeenCalledOnce() })
})
