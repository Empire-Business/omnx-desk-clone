import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const sql = read('../../migrations/20261105145559_chat_messages_materializa_permissoes.sql')
const old = JSON.parse(read('./fixtures/chat-messages-policy-production-base.json'))
const body = sql.replace(/--[^\n]*/g, '').trim()
const cte = body.match(/WITH permitidas AS MATERIALIZED \(([\s\S]*?)\)\s*SELECT permitidas.id FROM permitidas/)?.[1] ?? ''

// Revisão estrutural do contrato SQL. Não executa policy ou JWT no banco.
describe('materialização preserva a autorização da policy de mensagens', () => {
  it('baseline é ALL/permissive/public com WITH CHECK implicitamente herdado', () => {
    expect(old.policyname).toBe('chat_messages_access')
    expect(old.cmd).toBe('ALL')
    expect(old.permissive).toBe('PERMISSIVE')
    expect(old.roles).toBe('{public}')
    expect(old.with_check).toBeNull()
  })
  it('mantém todos os helpers do predicado original e a fonte cv', () => {
    const predicates = 'user_can_access_instance(cv.instance_id) AND user_can_access_client(get_contact_client_id(cv.contact_id))'
    const compact = (text: string) => text.replace(/\s+/g, ' ').trim().replace(/public\./g, '')
    expect(compact(old.qual)).toContain(predicates)
    expect(compact(cte)).toBe('SELECT cv.id FROM chat_conversations cv WHERE ' + predicates)
  })
  it('materializa conjunto não correlacionado e deixa comparação só fora', () => {
    expect(cte).not.toMatch(/chat_messages|conversation_id|auth\.|SECURITY/i)
    expect(body).toContain('conversation_id IN (')
    expect(body.match(/AS MATERIALIZED/g)).toHaveLength(1)
    expect(body).toContain('SELECT permitidas.id FROM permitidas')
  })
  it('altera somente USING, preservando papel, ALL, WITH CHECK herdado e outras policies', () => {
    expect(body.match(/ALTER POLICY/g)).toHaveLength(1)
    expect(body).toMatch(/^BEGIN;\s*ALTER POLICY chat_messages_access ON public.chat_messages\s*USING \(/)
    expect(body).not.toMatch(/WITH CHECK|\bTO\b|CREATE|DROP|GRANT|REVOKE|SECURITY|FUNCTION|\bOR\b/i)
    expect(body).not.toContain('tenant_isolation')
    expect(body).not.toContain('restrito_admin')
  })
  it('não modifica dados nem adiciona outra operação', () => {
    expect(body.match(/;/g)).toHaveLength(3)
    expect(body).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i)
    expect(body).toMatch(/\);\s*COMMIT;$/)
  })
})
