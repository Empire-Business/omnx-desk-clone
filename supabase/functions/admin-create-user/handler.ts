export interface PerfilChamador {
  perfil: string
  ativo: boolean | null
  tenant_id: string | null
}
export interface ColaboradorInput {
  nome: string
  email: string
  perfil: string
  department_id: string | null
  tenant_id: string
}
export interface DependenciasCadastro {
  usuarioAutenticado(): Promise<string | null>
  perfilDoUsuario(id: string): Promise<PerfilChamador | null>
  tenantDoProfile(id: string): Promise<string | null>
  departamentoDoTenant(id: string, tenantId: string): Promise<boolean>
  criarAuth(input: ColaboradorInput): Promise<{ id: string }>
  persistirPerfil(id: string, input: ColaboradorInput): Promise<void>
  gerarLink(email: string): Promise<string>
  removerAuth(id: string): Promise<void>
}
export class ErroCadastro extends Error {
  constructor(public codigo: string, public status: number) { super(codigo) }
}
const PERFIS = new Set(['admin', 'gerente', 'atendimento', 'estrategista', 'cliente'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ordem deliberada: nenhum efeito privilegiado antes de identidade, atividade e tenant. */
export async function cadastrarColaborador(deps: DependenciasCadastro, body: unknown) {
  const uid = await deps.usuarioAutenticado()
  if (!uid) throw new ErroCadastro('unauthorized', 401)
  const caller = await deps.perfilDoUsuario(uid)
  if (!caller || caller.ativo === false || !['admin', 'gerente'].includes(caller.perfil)) {
    throw new ErroCadastro('forbidden', 403)
  }
  const tenant = await deps.tenantDoProfile(uid)
  if (!tenant || tenant !== caller.tenant_id) throw new ErroCadastro('tenant_invalid', 403)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ErroCadastro('body_invalid', 400)
  const raw = body as Record<string, unknown>
  const nome = typeof raw.nome === 'string' ? raw.nome.trim() : ''
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : ''
  const perfil = typeof raw.perfil === 'string' ? raw.perfil.trim() : ''
  const departmentId = raw.department_id ?? null
  if (!nome || nome.length > 200) throw new ErroCadastro('nome_invalid', 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new ErroCadastro('email_invalid', 400)
  if (!PERFIS.has(perfil)) throw new ErroCadastro('perfil_invalid', 400)
  if (caller.perfil !== 'admin' && perfil === 'admin') throw new ErroCadastro('perfil_forbidden', 403)
  if (departmentId !== null) {
    if (typeof departmentId !== 'string' || !UUID.test(departmentId)) throw new ErroCadastro('department_invalid', 400)
    if (!await deps.departamentoDoTenant(departmentId, tenant)) throw new ErroCadastro('department_forbidden', 403)
  }
  const input: ColaboradorInput = { nome, email, perfil, department_id: departmentId as string | null, tenant_id: tenant }
  const created = await deps.criarAuth(input)
  try {
    await deps.persistirPerfil(created.id, input)
    const link = await deps.gerarLink(email)
    if (!link) throw new ErroCadastro('recovery_failed', 500)
    return { id: created.id, email, nome, perfil, definir_senha_url: link }
  } catch (error) {
    // Compensa somente a conta criada nesta requisição; nunca uma conta pré-existente.
    try { await deps.removerAuth(created.id) }
    catch { throw new ErroCadastro('create_failed_cleanup_pending', 500) }
    throw error instanceof ErroCadastro ? error : new ErroCadastro('create_failed', 500)
  }
}
