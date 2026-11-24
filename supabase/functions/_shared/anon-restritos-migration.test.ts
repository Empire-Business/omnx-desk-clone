import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Contrato estático da migração que fecha os dois vazamentos para anon
// (20261120150000). Não executa SQL: o comportamento é provado no banco do ensaio
// (supabase/tests/banco-do-zero/verificar-anon-restritos.sql).
const ler = (nome: string) =>
  readFileSync(new URL(`../../migrations/${nome}`, import.meta.url), 'utf8')

const MIGRACAO = '20261120150000_desk_anon_sem_ids_de_outros_tenants.sql'
const sql = ler(MIGRACAO)
const semComentarios = sql.replace(/--[^\n]*/g, '')

function funcao(assinatura: string) {
  const i = sql.indexOf(assinatura)
  expect(i, assinatura).toBeGreaterThanOrEqual(0)
  const j = sql.indexOf('$fn$;', i)
  expect(j, '$fn$;').toBeGreaterThan(i)
  return sql.slice(i, j + '$fn$;'.length)
}

describe('ids de contatos e conversas restritas (private)', () => {
  const contatos = funcao('CREATE OR REPLACE FUNCTION private.chat_contatos_restritos_ids()')
  const conversas = funcao('CREATE OR REPLACE FUNCTION private.chat_conversas_restritas_ids()')

  it('as duas continuam SECURITY DEFINER, STABLE, com search_path fixo', () => {
    for (const f of [contatos, conversas]) {
      expect(f).toContain('RETURNS uuid[]')
      expect(f).toContain('SECURITY DEFINER')
      expect(f).toContain('STABLE')
      expect(f).toContain('SET search_path = public, pg_temp')
    }
  })

  it('sem empresa na sessão devolvem vazio: o "t.tid IS NULL OR" virou "IS NOT NULL"', () => {
    for (const f of [contatos, conversas]) {
      expect(f).toContain('t.tid IS NOT NULL')
      expect(f).not.toContain('t.tid IS NULL OR')
    }
  })

  it('com sessão a regra é a mesma de antes: só a empresa da sessão', () => {
    // A condição que sobra é a que já existia; é ela que as políticas usam.
    expect(contatos).toContain('c.tenant_id = t.tid')
    expect(conversas).toContain('c.tenant_id = t.tid')
    expect(contatos).toContain('c.restrito_admin')
    expect(conversas).toContain('c.restrito_admin')
  })

  it('não revoga o EXECUTE (o grant de anon depende do ok do Bruno)', () => {
    expect(semComentarios).not.toMatch(/REVOKE[^;]*chat_contatos_restritos_ids/i)
    expect(semComentarios).not.toMatch(/REVOKE[^;]*chat_conversas_restritas_ids/i)
  })
})

describe('department_instance_assignments', () => {
  it('o SELECT deixa de ser TO public USING (true) e passa a exigir sessão', () => {
    const bloco = sql.slice(sql.indexOf('department_instance_assignments_select'))
    expect(bloco).toContain('TO authenticated')
    expect(bloco).toContain('tenant_id = (SELECT public.get_user_tenant_id())')
    expect(semComentarios).not.toMatch(
      /department_instance_assignments_select[^;]*TO\s+public\s+USING\s*\(\s*true\s*\)/i,
    )
  })

  it('é idempotente: DROP IF EXISTS antes do CREATE', () => {
    const i = sql.indexOf('DROP POLICY IF EXISTS "department_instance_assignments_select"')
    const j = sql.indexOf('CREATE POLICY "department_instance_assignments_select"')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(j).toBeGreaterThan(i)
  })
})

describe('lock curto no DROP/CREATE POLICY', () => {
  it('abre transação, põe SET LOCAL lock_timeout = 5s antes do DROP e fecha com COMMIT', () => {
    // O DROP/CREATE POLICY pega AccessExclusiveLock na tabela; sem o limite, uma
    // consulta longa enfileira as leituras atrás do lock (mesmo padrão da 20261026255000).
    const iBegin = semComentarios.indexOf('BEGIN;')
    const iLock = semComentarios.indexOf("SET LOCAL lock_timeout = '5s'")
    const iDrop = semComentarios.indexOf('DROP POLICY IF EXISTS "department_instance_assignments_select"')
    const iCommit = semComentarios.lastIndexOf('COMMIT;')
    expect(iBegin).toBeGreaterThanOrEqual(0)
    expect(iLock).toBeGreaterThan(iBegin)
    expect(iDrop).toBeGreaterThan(iLock)
    expect(iCommit).toBeGreaterThan(iDrop)
  })
})
