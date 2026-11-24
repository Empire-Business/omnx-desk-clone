import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../migrations/20261105135312_active_account_authorization.sql', import.meta.url), 'utf8')
function corpo(nome: string) {
  return sql.match(new RegExp(`FUNCTION public\\.${nome}\\([^]*?AS \\$\\$([^]*?)\\$\\$;`))?.[1] ?? ''
}
// Contrato estático do arquivo; não executa SQL e não comprova RLS em runtime.
describe('migration de atividade — contrato estático', () => {
  it('tenant depende da sessão, atividade e vínculo coerente entre users/profiles', () => {
    const f = corpo('get_user_tenant_id')
    expect(f).toContain('p.user_id = auth.uid()')
    expect(f).toContain('u.ativo IS DISTINCT FROM false')
    expect(f).toContain('u.tenant_id = p.tenant_id')
    expect(f).not.toContain('COALESCE')
  })
  it.each(['is_admin', 'pode_gerir_contratos', 'is_master_admin', 'has_permissao'])('%s não ignora o gate canônico', (nome) => {
    expect(corpo(nome)).toContain('public.get_user_tenant_id()')
  })
  it('roles legadas também negam atividade false sem mudar jobs com alvo explícito', () => {
    expect(corpo('has_role')).toContain('u.ativo IS DISTINCT FROM false')
    expect(corpo('has_role')).toContain('r.user_id = _user_id')
    expect(corpo('has_role')).not.toContain('auth.uid()')
  })
  it('escada SQL concede apenas a ação ou uma superior', () => {
    expect(corpo('has_permissao')).toContain("WHEN 'ver' THEN ARRAY['ver','editar','admin']")
    expect(corpo('has_permissao')).toContain("WHEN 'editar' THEN ARRAY['editar','admin']")
    expect(corpo('has_permissao')).toContain("WHEN 'admin' THEN ARRAY['admin']")
  })
  it('não modifica dados, policies, grants ou funções operacionais', () => {
    const semComentarios = sql.replace(/--[^\n]*/g, '')
    expect(semComentarios).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|GRANT|REVOKE|CREATE POLICY)\b/i)
    expect(semComentarios).not.toMatch(/calcular_comissoes|aprovar_extrato|storage\./)
  })
})
