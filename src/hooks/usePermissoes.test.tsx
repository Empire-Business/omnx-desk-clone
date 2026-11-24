import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDefinirPermissao, type AcaoPermissao } from './usePermissoes'

const state = vi.hoisted(() => ({ tenant: 'tenant-confirmado', deny: false, deleteError: false,
  deletes: [] as Record<string, unknown>[], inserts: [] as Record<string, unknown>[] }))
vi.mock('@/lib/authTenant', () => ({ tenantDaSessao: async () => {
  if (state.deny) throw new Error('Sessão inválida')
  return state.tenant
} }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({
  delete: () => {
    const filters: Record<string, unknown> = {}
    state.deletes.push(filters)
    const query = {
      eq: (key: string, value: unknown) => { filters[key] = value; return query },
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ error: state.deleteError ? new Error('negado') : null }).then(resolve),
    }
    return query
  },
  insert: async (value: Record<string, unknown>) => { state.inserts.push(value); return { error: null } },
}) } }))
afterEach(() => Object.assign(state, { deny: false, deleteError: false, deletes: [], inserts: [] }))

type Input = { perfil: string; recurso: string; acao: AcaoPermissao | null }
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  let execute!: (input: Input) => Promise<unknown>
  function Probe() { execute = useDefinirPermissao().mutateAsync; return null }
  renderToStaticMarkup(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)
  return { execute, client }
}

describe('mutação da matriz usa tenant confirmado', () => {
  it('filtra remoção e insere no tenant da sessão sem aceitar tenant de entrada', async () => {
    const c = setup()
    try {
      const input = { perfil: 'agente_chat', recurso: 'chat', acao: 'editar' as const, tenant_id: 'forjado' }
      await c.execute(input)
      expect(state.deletes).toEqual([{ tenant_id: 'tenant-confirmado', perfil: 'agente_chat', recurso: 'chat' }])
      expect(state.inserts).toEqual([{ tenant_id: 'tenant-confirmado', perfil: 'agente_chat', recurso: 'chat', acao: 'editar' }])
    } finally { c.client.clear() }
  })
  it('revogação remove somente regras do próprio tenant', async () => {
    const c = setup()
    try {
      await c.execute({ perfil: 'agente_chat', recurso: 'chat', acao: null })
      expect(state.deletes[0]).toEqual({ tenant_id: 'tenant-confirmado', perfil: 'agente_chat', recurso: 'chat' })
      expect(state.inserts).toEqual([])
    } finally { c.client.clear() }
  })
  it('sessão não confirmada não inicia escrita', async () => {
    state.deny = true
    const c = setup()
    try {
      await expect(c.execute({ perfil: 'agente_chat', recurso: 'chat', acao: 'ver' })).rejects.toThrow('Sessão inválida')
      expect(state.deletes).toEqual([])
      expect(state.inserts).toEqual([])
    } finally { c.client.clear() }
  })
  it('falha na remoção impede inserir substituição', async () => {
    state.deleteError = true
    const c = setup()
    try {
      await expect(c.execute({ perfil: 'agente_chat', recurso: 'chat', acao: 'ver' })).rejects.toThrow('negado')
      expect(state.inserts).toEqual([])
    } finally { c.client.clear() }
  })
})
