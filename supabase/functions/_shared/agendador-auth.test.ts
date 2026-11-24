import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { autorizarAgendador } from './agendador-auth.ts'

const SEGREDO = 'a'.repeat(64)

function fakes(o: { cronOk?: boolean; user?: string | null; ativo?: boolean; tenant?: string | null; pode?: boolean } = {}) {
  const rpcAdmin = vi.fn(async (_n: string, args: { p_segredo: string }) => ({ data: o.cronOk !== false && args.p_segredo === SEGREDO, error: null }))
  const rpcUsuario = vi.fn(async () => ({ data: o.pode !== false, error: null }))
  const admin = {
    rpc: rpcAdmin,
    auth: { getUser: vi.fn(async () => ({ data: { user: o.user === null ? null : { id: o.user ?? 'u1' } }, error: null })) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ativo: o.ativo ?? true, tenant_id: o.tenant === undefined ? 't1' : o.tenant } }) }) }),
    }),
  }
  const criarUsuario = vi.fn(() => ({ rpc: rpcUsuario }))
  return { admin: admin as never, criarUsuario: criarUsuario as never, rpcUsuario }
}

const pedido = (headers: Record<string, string>) => new Request('https://x.test/f', { method: 'POST', headers })

describe('autorizarAgendador', () => {
  it('aceita o agendador com o segredo do Vault', async () => {
    const f = fakes()
    expect(await autorizarAgendador(pedido({ 'x-cron-secret': SEGREDO }), f.admin, { criarUsuario: f.criarUsuario, recurso: 'cobranca', acao: 'editar' }))
      .toEqual({ tipo: 'cron' })
  })

  it.each(['curto', 'b'.repeat(64)])('recusa segredo inválido (%s)', async (s) => {
    const f = fakes()
    expect(await autorizarAgendador(pedido({ 'x-cron-secret': s }), f.admin, { criarUsuario: f.criarUsuario, recurso: 'cobranca', acao: 'editar' })).toBeNull()
  })

  it('recusa pedido sem credencial nenhuma', async () => {
    const f = fakes()
    expect(await autorizarAgendador(pedido({}), f.admin, { criarUsuario: f.criarUsuario, recurso: 'cobranca', acao: 'editar' })).toBeNull()
  })

  it('aceita pessoa ativa com permissão e devolve a empresa dela', async () => {
    const f = fakes({ tenant: 't9' })
    expect(await autorizarAgendador(pedido({ Authorization: 'Bearer jwt' }), f.admin, { criarUsuario: f.criarUsuario, recurso: 'cobranca', acao: 'editar' }))
      .toEqual({ tipo: 'usuario', userId: 'u1', tenantId: 't9' })
    expect(f.rpcUsuario).toHaveBeenCalledWith('has_permissao', { p_recurso: 'cobranca', p_acao: 'editar' })
  })

  it.each([
    ['token inválido', { user: null }],
    ['conta desativada', { ativo: false }],
    ['sem empresa', { tenant: null }],
    ['sem permissão', { pode: false }],
  ] as const)('recusa %s', async (_l, o) => {
    const f = fakes(o)
    expect(await autorizarAgendador(pedido({ Authorization: 'Bearer jwt' }), f.admin, { criarUsuario: f.criarUsuario, recurso: 'cobranca', acao: 'editar' })).toBeNull()
  })
})

describe('funções de envio agendado exigem autorização antes de qualquer trabalho', () => {
  it.each(['cobranca-scheduler', 'chat-broadcast-scheduler'])('%s', (nome) => {
    const fonte = readFileSync(new URL(`../${nome}/index.ts`, import.meta.url), 'utf8')
    const auth = fonte.indexOf('await autorizarAgendador(')
    expect(auth).toBeGreaterThan(0)
    expect(fonte.indexOf("status: 401", auth)).toBeGreaterThan(auth)
    // Nenhuma leitura de dados antes da autorização.
    expect(fonte.slice(0, auth).includes(".from('")).toBe(false)
  })

  it('cobrança manual por pessoa fica presa à empresa dela', () => {
    const fonte = readFileSync(new URL('../cobranca-scheduler/index.ts', import.meta.url), 'utf8')
    expect(fonte).toContain("devedorQuery.eq('tenant_id', autorizacao.tenantId)")
  })

  it('campanha de outra empresa não é encontrada por pessoa', () => {
    const fonte = readFileSync(new URL('../chat-broadcast-scheduler/index.ts', import.meta.url), 'utf8')
    expect(fonte).toContain("campaign.tenant_id !== autorizacao.tenantId")
  })
})
