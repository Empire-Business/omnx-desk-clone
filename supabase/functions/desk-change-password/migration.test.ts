import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'
const sql=readFileSync(new URL('../../migrations/20261105172104_password_change_next_login.sql',import.meta.url),'utf8')
describe('contrato estático migration de próximo login (não executa banco)',()=>{
  it('nasce vazia, não muda senha nem apaga sessões',()=>{
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.desk_password_requirements/i)
    expect(sql).not.toMatch(/(?:UPDATE|DELETE\s+FROM)\s+auth\.(?:users|sessions)/i)
    expect(sql).not.toContain('encrypted_password');expect(sql).not.toContain('CREATE TRIGGER')
  })
  it('marker é server-owned e nenhuma RPC permite limpar',()=>{
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON public.desk_password_requirements FROM PUBLIC, anon, authenticated')
    expect(sql).not.toMatch(/GRANT.*(?:INSERT|UPDATE|DELETE).*TO authenticated/i)
    expect(sql).not.toMatch(/UPDATE\s+public\.desk_password_requirements/i)
  })
  it('status não recebe identidade/sessão do cliente e usa created_at real, não token iat',()=>{
    expect(sql).toContain('FUNCTION public.desk_password_change_status()')
    expect(sql).toContain("auth.jwt()->>'session_id'")
    expect(sql).toContain('s.id=v_sid AND s.user_id=v_user')
    expect(sql).toContain('v_created >= v_required')
    expect(sql).not.toMatch(/auth\.jwt\(\).*->>\s*'iat'/)
    expect(sql).toContain('s.not_after > now()')
    expect(sql).toContain('u.ativo IS DISTINCT FROM false')
  })
  it('guard central, Storage e3RPCs diretas participam sem alterar discovery público',()=>{
    expect(sql).toContain('AND public.desk_password_session_allowed()')
    expect(sql).toContain('ON storage.objects AS RESTRICTIVE')
    for(const name of ['get_agent_tma','get_client_last_contact','get_contact_client_id'])expect(sql).toContain(`FUNCTION public.${name}`)
    expect(sql).not.toContain('FUNCTION public.get_tenant_by_domain')
    expect(sql).toContain("auth.role() IS DISTINCT FROM 'authenticated'")
  })
})
