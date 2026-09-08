import { describe, it, expect } from 'vitest'
import { normalizaTelefoneBR } from './telefone'

describe('normalizaTelefoneBR', () => {
  it('mantém quem já está em E.164', () => {
    expect(normalizaTelefoneBR('+5511981199465')).toEqual({ telefone: '+5511981199465', aviso: '' })
  })

  it('acrescenta o + em quem já tem o 55 na frente', () => {
    expect(normalizaTelefoneBR('5532984910520')).toEqual({ telefone: '+5532984910520', aviso: '' })
    // Fixo/celular antigo: 55 + DDD + 8 dígitos.
    expect(normalizaTelefoneBR('553492206928')).toEqual({ telefone: '+553492206928', aviso: '' })
  })

  it('acrescenta o 55 em quem tem só DDD + número', () => {
    expect(normalizaTelefoneBR('54981263122')).toEqual({ telefone: '+5554981263122', aviso: '' })
    expect(normalizaTelefoneBR('3492206928')).toEqual({ telefone: '+553492206928', aviso: '' })
  })

  it('ignora espaços, parênteses e traços', () => {
    expect(normalizaTelefoneBR('21 98935-8444').telefone).toBe('+5521989358444')
    expect(normalizaTelefoneBR('(11) 99999-8888').telefone).toBe('+5511999998888')
    expect(normalizaTelefoneBR('19 997588944').telefone).toBe('+5519997588944')
  })

  it('descarta zeros à esquerda de DDD escrito como 021', () => {
    expect(normalizaTelefoneBR('021999998888').telefone).toBe('+5521999998888')
  })

  it('avisa quando não há telefone', () => {
    expect(normalizaTelefoneBR(null)).toEqual({ telefone: '', aviso: 'sem telefone' })
    expect(normalizaTelefoneBR('')).toEqual({ telefone: '', aviso: 'sem telefone' })
    expect(normalizaTelefoneBR('   ')).toEqual({ telefone: '', aviso: 'sem telefone' })
    expect(normalizaTelefoneBR('sem número')).toEqual({ telefone: '', aviso: 'sem telefone' })
  })

  it('marca para conferir quando o tamanho não bate com nenhum formato conhecido', () => {
    const curto = normalizaTelefoneBR('98765')
    expect(curto.telefone).toBe('+98765')
    expect(curto.aviso).not.toBe('')

    const longo = normalizaTelefoneBR('551199999888877')
    expect(longo.aviso).not.toBe('')
  })

  it('lê "55" inicial com 11 dígitos como DDD 55, não como código do país', () => {
    // Ambíguo de propósito: 55 + DDD + 9 dígitos precisaria de 13 dígitos, então
    // com 11 a única leitura válida é DDD 55 (RS) + número de 9 dígitos.
    expect(normalizaTelefoneBR('55591046136')).toEqual({ telefone: '+5555591046136', aviso: '' })
  })
})
