import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../migrations/20261105140814_chat_contacts_tags_notas.sql', import.meta.url), 'utf8')
const body = sql.replace(/--[^\n]*/g, '')
// Contrato de compatibilidade estática; não representa migration aplicada/RLS testada.
describe('campos existentes na UI de contatos — migration aditiva', () => {
  it('oferece tags array vazio por padrão e notas opcionais', () => {
    expect(body).toContain("ADD COLUMN tags text[] NOT NULL DEFAULT '{}'::text[]")
    expect(body).toContain('ADD COLUMN notas text;')
    expect(body).toContain("NOTIFY pgrst, 'reload schema'")
  })
  it('altera somente chat_contacts sem reescrever dados ou regras de acesso', () => {
    expect(body.match(/ALTER TABLE/g)).toHaveLength(1)
    expect(body).toContain('ALTER TABLE public.chat_contacts')
    expect(body).not.toMatch(/\b(UPDATE|DELETE|INSERT|DROP|GRANT|REVOKE|POLICY|OWNER|DISABLE|RESET)\b/i)
    expect(body.trim().startsWith('BEGIN;')).toBe(true)
    expect(body.trim().endsWith('COMMIT;')).toBe(true)
  })
})
