import { describe, expect, it } from 'vitest'
import { avaliarChave, ehUuid, listaUuidsFiltro, paginacao, sanitizarBusca, tipoDaMensagem } from './chat-api-regras.ts'

const T1 = '00000000-0000-0000-0000-000000000001'
const chave = (over: Record<string, unknown> = {}) => ({
  id: 'k1', permissoes: ['list_conversations'], ativo: true, expira_em: null, tenant_id: T1, ...over,
})

describe('avaliarChave (chat-api)', () => {
  it('chave ativa da empresa vale e carrega o tenant', () => {
    expect(avaliarChave(chave())).toEqual({ valid: true, keyId: 'k1', tenantId: T1, permissions: ['list_conversations'] })
  })
  it('chave SEM empresa é recusada', () => {
    expect(avaliarChave(chave({ tenant_id: null }))).toEqual({ valid: false })
  })
  it('inativa, expirada ou inexistente é recusada', () => {
    expect(avaliarChave(chave({ ativo: false }))).toEqual({ valid: false })
    expect(avaliarChave(chave({ ativo: null }))).toEqual({ valid: false })
    expect(avaliarChave(chave({ expira_em: '2020-01-01T00:00:00Z' }), new Date('2026-10-26'))).toEqual({ valid: false })
    expect(avaliarChave(null)).toEqual({ valid: false })
  })
  it('permissões que não são texto são ignoradas', () => {
    const r = avaliarChave(chave({ permissoes: ['a', 1, null, '*'] }))
    expect(r.valid && r.permissions).toEqual(['a', '*'])
    const r2 = avaliarChave(chave({ permissoes: { '*': true } }))
    expect(r2.valid && r2.permissions).toEqual([])
  })
})

describe('paginacao / sanitizarBusca / filtros', () => {
  it('limites seguros', () => {
    expect(paginacao(null, null)).toEqual({ limit: 50, offset: 0 })
    expect(paginacao('500', '-3')).toEqual({ limit: 100, offset: 0 })
    expect(paginacao('abc', '20')).toEqual({ limit: 50, offset: 20 })
  })
  it('busca não muda a sintaxe do filtro .or()', () => {
    expect(sanitizarBusca('joão,tenant_id.neq.x)')).toBe('joão tenant_id.neq.x')
    expect(sanitizarBusca('a%b*c"d\'e\\f:g(h')).toBe('a b c d e f g h')
    expect(sanitizarBusca(null)).toBe('')
  })
  it('lista "in" só com UUIDs, sem repetir', () => {
    expect(listaUuidsFiltro([T1, T1, 'x) or (1=1'])).toBe(`(${T1})`)
    expect(ehUuid('nope')).toBe(false)
  })
  it('tipo da mensagem', () => {
    expect(tipoDaMensagem(undefined, undefined)).toBe('texto')
    expect(tipoDaMensagem('imagem', 'https://x/y.jpg')).toBe('imagem')
    expect(tipoDaMensagem('qualquer', 'https://x/y.pdf')).toBe('documento')
  })
})
