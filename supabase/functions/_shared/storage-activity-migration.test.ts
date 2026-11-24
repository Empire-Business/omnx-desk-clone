import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../migrations/20261105143907_storage_conta_ativa_buckets_auditados.sql', import.meta.url), 'utf8')
const body = sql.replace(/--[^\n]*/g, '')
const predicates = body.match(/USING \(([\s\S]*?)\)\s*WITH CHECK \(([\s\S]*?)\);/)

// Inspeção estrutural da migration; não simula nem executa RLS/Postgres.
describe('atividade Storage limitada aos buckets auditados', () => {
  it('adiciona apenas uma policy restritiva para authenticated', () => {
    expect(body.match(/CREATE POLICY/g)).toHaveLength(1)
    expect(body).toContain('CREATE POLICY desk_conta_ativa_buckets_auditados\nON storage.objects AS RESTRICTIVE\nFOR ALL TO authenticated')
    expect(body).not.toMatch(/TO (anon|PUBLIC|service_role)/i)
  })
  it('USING e WITH CHECK possuem o mesmo predicado', () => {
    expect(predicates).not.toBeNull()
    expect(predicates![1]).toBe(predicates![2])
  })
  it('limita o gate exatamente aos cinco buckets auditados', () => {
    expect(predicates![1].match(/'[^']+'/g)).toEqual([
      "'avatars'", "'chat-media'", "'deliveries'", "'reportes-anexos'", "'pj-notas'",
    ])
    expect(predicates![1]).toContain('bucket_id NOT IN')
  })
  it('nega ausência do tenant canônico sem inventar regra de perfil ou ownership', () => {
    expect(predicates![1].trim()).toBe(
      "bucket_id NOT IN ('avatars', 'chat-media', 'deliveries', 'reportes-anexos', 'pj-notas')\n  OR (SELECT public.get_user_tenant_id()) IS NOT NULL",
    )
    expect(body).not.toMatch(/auth.uid|owner|perfil|UPDATE|DELETE|INSERT/i)
  })
  it('não modifica buckets, grants, policies antigas, funções ou URLs', () => {
    expect(body).not.toMatch(/DROP|ALTER|GRANT|REVOKE|FUNCTION|storage.buckets|https?:/i)
    const outside = body.replace(/CREATE POLICY[\s\S]*?;/, '').trim()
    expect(outside.split(';').map(s => s.trim()).filter(Boolean)).toEqual(['BEGIN', 'COMMIT'])
  })
})
