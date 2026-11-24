import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { QueryClient } from '@tanstack/react-query'
import { buscarClientesParaVinculoContrato, comClienteVinculado, patchContratoSemVinculo, vincularClienteAoContrato } from './contratoClienteVinculo'

interface Consulta {
  tabela: string
  patch?: unknown
  colunas?: string
  filtros: [string, string, unknown][]
}

function bancoFalso(opcoes: {
  autenticado?: boolean
  tenant?: string | null
  permissao?: boolean
  erroPermissao?: Error
  cliente?: { id: string; nome: string } | null
  atualizado?: { id: string; cliente_id: string } | null
  erroUpdate?: Error
} = {}) {
  const consultas: Consulta[] = []
  const banco = {
    auth: { getUser: async () => ({ data: { user: opcoes.autenticado === false ? null : { id: 'usuario-a' } }, error: null }) },
    rpc: async (nome: string) => nome === 'get_user_tenant_id'
      ? { data: opcoes.tenant === undefined ? 'tenant-a' : opcoes.tenant, error: null }
      : { data: opcoes.permissao !== false, error: opcoes.erroPermissao ?? null },
    from: (tabela: string) => {
      const consulta: Consulta = { tabela, filtros: [] }
      consultas.push(consulta)
      const builder = {
        select: (colunas: string) => { consulta.colunas = colunas; return builder },
        update: (patch: unknown) => { consulta.patch = patch; return builder },
        eq: (campo: string, valor: unknown) => { consulta.filtros.push(['eq', campo, valor]); return builder },
        is: (campo: string, valor: unknown) => { consulta.filtros.push(['is', campo, valor]); return builder },
        order: async () => ({ data: [{ id: 'cliente-a', nome: 'Cliente A', empresa: null, ativo: true }], error: null }),
        maybeSingle: async () => tabela === 'clients'
          ? { data: opcoes.cliente === undefined ? { id: 'cliente-a', nome: 'Cliente A' } : opcoes.cliente, error: null }
          : { data: opcoes.atualizado === undefined ? { id: 'contrato-a', cliente_id: 'cliente-a' } : opcoes.atualizado, error: opcoes.erroUpdate ?? null },
      }
      return builder
    },
  }
  return { banco: banco as unknown as SupabaseClient<Database>, consultas }
}

const input = { contratoId: 'contrato-a', clienteId: 'cliente-a', tenantId: 'tenant-a' }

describe('vínculo isolado do contrato ao cadastro', () => {
  it('lista somente campos de escolha dos clientes no tenant resolvido pelo banco', async () => {
    const { banco, consultas } = bancoFalso()
    const resultado = await buscarClientesParaVinculoContrato(banco)
    expect(resultado.tenantId).toBe('tenant-a')
    expect(consultas).toEqual([{
      tabela: 'clients', colunas: 'id, nome, empresa, ativo', filtros: [['eq', 'tenant_id', 'tenant-a']],
    }])
  })

  it.each([
    { autenticado: false },
    { permissao: false },
    { erroPermissao: new Error('indisponível') },
    { tenant: null },
  ])('nega a escrita sem sessão, tenant ou permissão confirmada: %j', async (opcoes) => {
    const { banco, consultas } = bancoFalso(opcoes)
    await expect(vincularClienteAoContrato(banco, input)).rejects.toBeTruthy()
    expect(consultas).toEqual([])
  })

  it('recusa escolha feita antes de uma mudança de tenant na sessão', async () => {
    const { banco, consultas } = bancoFalso({ tenant: 'tenant-b' })
    await expect(vincularClienteAoContrato(banco, input)).rejects.toThrow('empresa da sessão mudou')
    expect(consultas).toEqual([])
  })

  it('não escreve quando o cliente não pode ser relido na empresa atual', async () => {
    const { banco, consultas } = bancoFalso({ cliente: null })
    await expect(vincularClienteAoContrato(banco, input)).rejects.toThrow('Cliente não encontrado nesta empresa')
    expect(consultas).toEqual([{
      tabela: 'clients', colunas: 'id, nome', filtros: [['eq', 'id', 'cliente-a'], ['eq', 'tenant_id', 'tenant-a']],
    }])
  })

  it('revalida o cliente e faz PATCH só da FK com id, tenant e condição NULL', async () => {
    const { banco, consultas } = bancoFalso()
    await expect(vincularClienteAoContrato(banco, input)).resolves.toEqual({
      contratoId: 'contrato-a', clienteId: 'cliente-a', clienteNome: 'Cliente A',
    })
    expect(consultas[0].filtros).toEqual([['eq', 'id', 'cliente-a'], ['eq', 'tenant_id', 'tenant-a']])
    expect(consultas[1]).toEqual({
      tabela: 'contratos', patch: { cliente_id: 'cliente-a' }, colunas: 'id, cliente_id',
      filtros: [['eq', 'id', 'contrato-a'], ['eq', 'tenant_id', 'tenant-a'], ['is', 'cliente_id', null]],
    })
  })

  it('trata zero linhas como conflito e não tenta substituir nem repetir a escrita', async () => {
    const { banco, consultas } = bancoFalso({ atualizado: null })
    await expect(vincularClienteAoContrato(banco, input)).rejects.toThrow('já foi vinculado ou não está mais disponível')
    expect(consultas.filter((c) => c.patch)).toHaveLength(1)
    expect(consultas[1].filtros).toContainEqual(['is', 'cliente_id', null])
  })

  it('propaga a recusa do banco, sem fallback privilegiado', async () => {
    const { banco, consultas } = bancoFalso({ erroUpdate: new Error('permissão negada') })
    await expect(vincularClienteAoContrato(banco, input)).rejects.toThrow('permissão negada')
    expect(consultas.filter((c) => c.patch)).toHaveLength(1)
  })

  it('preserva FK confirmada no cache e no próximo salvamento mesmo se o refetch falhar', async () => {
    const { banco } = bancoFalso()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const chave = ['comissoes', 'contrato', input.contratoId]
    const pagamentos = [{ sinal: 'Parcela', valor: 100 }]
    const original = { id: input.contratoId, cliente_id: null as string | null, observacoes: 'Rascunho preservado', pagamentos }
    let formulario = original
    qc.setQueryData(chave, original)

    const confirmado = await vincularClienteAoContrato(banco, input)
    formulario = comClienteVinculado(formulario, confirmado.clienteId)
    qc.setQueryData<typeof original>(chave, (atual) => atual ? comClienteVinculado(atual, confirmado.clienteId) : atual)
    await expect(qc.fetchQuery({ queryKey: chave, queryFn: async () => { throw new Error('rede indisponível') } })).rejects.toThrow('rede indisponível')

    expect(qc.getQueryData(chave)).toMatchObject({ cliente_id: 'cliente-a' })
    expect(formulario).toMatchObject({ cliente_id: 'cliente-a', observacoes: 'Rascunho preservado' })
    expect(formulario.pagamentos).toBe(pagamentos)
    formulario = { ...formulario, observacoes: 'Edição após o vínculo' }
    // Mesmo um snapshot antigo não pode reenviar NULL pelo salvamento geral.
    const patch = patchContratoSemVinculo({ ...formulario, cliente_id: null })
    const salvo = { ...comClienteVinculado(original, confirmado.clienteId), ...patch }
    expect(patch).not.toHaveProperty('cliente_id')
    expect(salvo).toMatchObject({ cliente_id: 'cliente-a', observacoes: 'Edição após o vínculo' })
    expect(original.cliente_id).toBeNull()
    qc.clear()
  })
})
