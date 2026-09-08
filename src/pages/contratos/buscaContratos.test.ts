import { describe, it, expect } from 'vitest'

/**
 * Espelha a normalização usada na busca da lista de contratos.
 * Mantido aqui para travar o comportamento: sem tirar acento, procurar por "jose"
 * não encontrava "José" e a busca por nome parecia quebrada.
 */
function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function casa(nomeNoBanco: string, oQueFoiDigitado: string): boolean {
  return semAcento(nomeNoBanco).includes(semAcento(oQueFoiDigitado.trim()))
}

describe('busca de contratos por nome', () => {
  it('acha nome acentuado quando a pessoa digita sem acento', () => {
    expect(casa('José Antônio Gonçalves', 'jose')).toBe(true)
    expect(casa('José Antônio Gonçalves', 'goncalves')).toBe(true)
    expect(casa('José Antônio Gonçalves', 'antonio')).toBe(true)
  })

  it('acha também quando digita COM acento', () => {
    expect(casa('José Antônio Gonçalves', 'josé')).toBe(true)
    expect(casa('Camila Prieto', 'Camila')).toBe(true)
  })

  it('ignora caixa e espaço em volta', () => {
    expect(casa('DANIEL TIAGO RIBEIRO', '  daniel ')).toBe(true)
  })

  it('não casa quem não deve', () => {
    expect(casa('José Antônio', 'maria')).toBe(false)
  })

  it('cobre ç e til, que são os que mais aparecem em nome brasileiro', () => {
    expect(casa('Assunção', 'assuncao')).toBe(true)
    expect(casa('João Simões', 'joao simoes')).toBe(true)
  })
})
