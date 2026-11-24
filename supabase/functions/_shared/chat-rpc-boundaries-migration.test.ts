import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8')
const internal = read('../../migrations/20261105142757_fecha_rpc_interna_e_membership.sql')
const unread = read('../../migrations/20261105142758_unread_chat_respeita_rls.sql')
const original = JSON.parse(read('./fixtures/unread-chat-production-base.json')).definition as string
const uncomment = (sql: string) => sql.replace(/--[^\n]*/g, '')
const fn = unread.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$[\s\S]*?\$function\$\s*;/)?.[0] ?? ''
const normalize = (sql: string) => sql.trim().replace(/;$/, '').trim()

// Contrato de fonte SQL. Não executa queries nem comprova RLS em runtime.
describe('fechamento direcionado de RPCs internas', () => {
  it('revoga exatamente 4 assinaturas e preserva service_role/owner/corpos', () => {
    const sql = uncomment(internal)
    expect(sql.match(/REVOKE EXECUTE[\s\S]*?;/g)).toEqual([
      'REVOKE EXECUTE ON FUNCTION public.get_internal_unread_counts(uuid)\n  FROM PUBLIC, anon, authenticated;',
      'REVOKE EXECUTE ON FUNCTION public.get_internal_last_messages(uuid[])\n  FROM PUBLIC, anon, authenticated;',
      'REVOKE EXECUTE ON FUNCTION public.auto_match_contacts_to_clients()\n  FROM PUBLIC, anon, authenticated;',
      'REVOKE EXECUTE ON FUNCTION public.seed_tenant(uuid)\n  FROM PUBLIC, anon, authenticated;',
    ])
    expect(sql).not.toMatch(/service_role|OWNER|CREATE OR REPLACE|GRANT|ALTER|DROP/i)
  })
  it('policies são somente writes RESTRICTIVE para authenticated', () => {
    const sql = uncomment(internal)
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(3)
    expect(sql.match(/ON public.internal_conversation_members AS RESTRICTIVE/g)).toHaveLength(3)
    expect(sql.match(/FOR (INSERT|UPDATE|DELETE) TO authenticated/g)).toHaveLength(3)
    expect(sql).not.toMatch(/FOR SELECT|FOR ALL/)
  })
  it('check de INSERT, using/check de UPDATE e using de DELETE exigem tenant ativo e gestor', () => {
    const sql = uncomment(internal)
    expect(sql.match(/tenant_id = \(SELECT public.get_user_tenant_id\(\)\)/g)).toHaveLength(4)
    expect(sql.match(/AND \(SELECT public.is_admin_or_manager\(\)\)/g)).toHaveLength(4)
    expect(sql.match(/WITH CHECK/g)).toHaveLength(2)
    expect(sql.match(/USING/g)).toHaveLength(2)
  })
})

describe('contagem de chat com identidade e RLS', () => {
  it('mantém exatamente o corpo LIVE retirando apenas INVOKER e igualdade do ator', () => {
    const restored = fn.replace('STABLE SECURITY INVOKER', 'STABLE SECURITY DEFINER').replace(
      '  WHERE (auth.uid() IS NULL OR p_user_id = auth.uid())\n    AND m.enviado_por_agente = false',
      '  WHERE m.enviado_por_agente = false',
    )
    expect(normalize(restored)).toBe(normalize(original))
  })
  it('usa invoker e nega usuário humano diferente sem remover serviço sem sessão', () => {
    expect(fn).toContain('STABLE SECURITY INVOKER')
    expect(fn).not.toContain('SECURITY DEFINER')
    expect(fn).toContain('WHERE (auth.uid() IS NULL OR p_user_id = auth.uid())')
  })
  it('preserva acesso tenant/restrito e cálculo de não lidas', () => {
    expect(fn).toContain("AND (auth.uid() IS NULL OR c.tenant_id = (SELECT public.get_user_tenant_id()))")
    expect(fn).toContain('public.pode_ver_restrito()')
    expect(fn).toContain('private.chat_contatos_restritos_ids()')
    expect(fn).toContain("m.tipo != 'nota_interna'")
    expect(fn).toContain('HAVING count(*) > 0')
  })
  it('não altera políticas, grants, dados ou qualquer outra função', () => {
    const outside = uncomment(unread.replace(fn, ''))
    expect(outside.trim().split(';').map(s => s.trim()).filter(Boolean)).toEqual([
      'BEGIN', "NOTIFY pgrst, 'reload schema'", 'COMMIT',
    ])
  })
})
