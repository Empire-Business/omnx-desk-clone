import { describe, expect, it, vi } from 'vitest'
import { cadastrarColaborador, ErroCadastro, type DependenciasCadastro } from './handler'

const tenant = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const departamento = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const input = { nome: ' Pessoa ', email: 'PESSOA@EXAMPLE.COM', perfil: 'estrategista' }
function dependencias(overrides: Partial<DependenciasCadastro> = {}) {
  return {
    usuarioAutenticado: vi.fn(async () => 'caller'),
    perfilDoUsuario: vi.fn(async () => ({ perfil: 'admin', ativo: true, tenant_id: tenant })),
    tenantDoProfile: vi.fn(async () => tenant),
    departamentoDoTenant: vi.fn(async () => true),
    criarAuth: vi.fn(async () => ({ id: 'nova-conta' })),
    persistirPerfil: vi.fn(async () => {}),
    gerarLink: vi.fn(async () => 'https://example.com/recuperacao'),
    removerAuth: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('cadastro administrativo: autorização antes de efeitos', () => {
  it.each([
    ['sem sessão', { usuarioAutenticado: async () => null }, 'unauthorized'],
    ['inativo', { perfilDoUsuario: async () => ({ perfil: 'admin', ativo: false, tenant_id: tenant }) }, 'forbidden'],
    ['sem perfil', { perfilDoUsuario: async () => null }, 'forbidden'],
    ['perfil comum', { perfilDoUsuario: async () => ({ perfil: 'estrategista', ativo: true, tenant_id: tenant }) }, 'forbidden'],
    ['tenant ausente', { tenantDoProfile: async () => null }, 'tenant_invalid'],
    ['tenant divergente', { tenantDoProfile: async () => 'outro-tenant' }, 'tenant_invalid'],
  ] as const)('nega %s sem criar conta', async (_nome, overrides, codigo) => {
    const deps = dependencias(overrides)
    await expect(cadastrarColaborador(deps, input)).rejects.toMatchObject({ codigo })
    expect(deps.criarAuth).not.toHaveBeenCalled()
    expect(deps.removerAuth).not.toHaveBeenCalled()
  })
  it('gerente não cria admin', async () => {
    const deps = dependencias({ perfilDoUsuario: async () => ({ perfil: 'gerente', ativo: true, tenant_id: tenant }) })
    await expect(cadastrarColaborador(deps, { ...input, perfil: 'admin' })).rejects.toMatchObject({ codigo: 'perfil_forbidden' })
    expect(deps.criarAuth).not.toHaveBeenCalled()
  })
  it('gerente pode criar colaborador do próprio tenant', async () => {
    const deps = dependencias({ perfilDoUsuario: async () => ({ perfil: 'gerente', ativo: true, tenant_id: tenant }) })
    await expect(cadastrarColaborador(deps, input)).resolves.toMatchObject({ id: 'nova-conta', email: 'pessoa@example.com' })
    expect(deps.criarAuth).toHaveBeenCalledWith({ ...input, nome: 'Pessoa', email: 'pessoa@example.com', department_id: null, tenant_id: tenant })
  })
  it('preserva admin legado com ativo NULL', async () => {
    const deps = dependencias({ perfilDoUsuario: async () => ({ perfil: 'admin', ativo: null, tenant_id: tenant }) })
    await expect(cadastrarColaborador(deps, { ...input, perfil: 'admin' })).resolves.toMatchObject({ perfil: 'admin' })
  })
  it('nega departamento de outra empresa antes de criar', async () => {
    const deps = dependencias({ departamentoDoTenant: vi.fn(async () => false) })
    await expect(cadastrarColaborador(deps, { ...input, department_id: departamento })).rejects.toMatchObject({ codigo: 'department_forbidden' })
    expect(deps.departamentoDoTenant).toHaveBeenCalledWith(departamento, tenant)
    expect(deps.criarAuth).not.toHaveBeenCalled()
  })
  it.each([null, [], { ...input, perfil: 'desconhecido' }, { ...input, department_id: {} }, { ...input, nome: 123 }])('nega corpo inválido %j', async (body) => {
    const deps = dependencias()
    await expect(cadastrarColaborador(deps, body)).rejects.toBeInstanceOf(ErroCadastro)
    expect(deps.criarAuth).not.toHaveBeenCalled()
  })
})

describe('cadastro administrativo: falhas não viram sucesso', () => {
  it('falha de persistência compensa apenas a conta recém-criada', async () => {
    const deps = dependencias({ persistirPerfil: async () => { throw new Error('db indisponível') } })
    await expect(cadastrarColaborador(deps, input)).rejects.toMatchObject({ codigo: 'create_failed' })
    expect(deps.removerAuth).toHaveBeenCalledExactlyOnceWith('nova-conta')
    expect(deps.gerarLink).not.toHaveBeenCalled()
  })
  it('falha no link também compensa a conta incompleta', async () => {
    const deps = dependencias({ gerarLink: async () => '' })
    await expect(cadastrarColaborador(deps, input)).rejects.toMatchObject({ codigo: 'recovery_failed' })
    expect(deps.removerAuth).toHaveBeenCalledExactlyOnceWith('nova-conta')
  })
  it('sinaliza compensação pendente sem inventar sucesso', async () => {
    const deps = dependencias({ persistirPerfil: async () => { throw new Error('db') }, removerAuth: async () => { throw new Error('auth') } })
    await expect(cadastrarColaborador(deps, input)).rejects.toMatchObject({ codigo: 'create_failed_cleanup_pending', status: 500 })
  })
  it('email pré-existente não é removido', async () => {
    const deps = dependencias({ criarAuth: async () => { throw new ErroCadastro('email_ja_cadastrado', 409) } })
    await expect(cadastrarColaborador(deps, input)).rejects.toMatchObject({ codigo: 'email_ja_cadastrado' })
    expect(deps.removerAuth).not.toHaveBeenCalled()
  })
})
