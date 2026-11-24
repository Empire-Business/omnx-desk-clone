import { describe, expect, it } from 'vitest'
import { regraPermiteAcao, type AcaoPermissao } from './permissoes'

describe('escada de permissões', () => {
  const casos: [AcaoPermissao, AcaoPermissao, boolean][] = [
    ['ver', 'ver', true], ['ver', 'editar', false], ['ver', 'admin', false],
    ['editar', 'ver', true], ['editar', 'editar', true], ['editar', 'admin', false],
    ['admin', 'ver', true], ['admin', 'editar', true], ['admin', 'admin', true],
  ]
  it.each(casos)('regra %s permite %s = %s', (regra, acao, permitido) => {
    expect(regraPermiteAcao(regra, acao)).toBe(permitido)
  })
})
