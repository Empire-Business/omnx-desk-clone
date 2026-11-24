import { describe, expect, it } from 'vitest'
import { visaoEfetiva, visaoSugerida, visoesDoPerfil } from './visaoInicio'

describe('visão do Início por papel', () => {
  it('sugere a visão parecida com a do Clients para cada perfil', () => {
    expect(visaoSugerida('admin')).toBe('gestao')
    expect(visaoSugerida('gerente')).toBe('gestao')
    expect(visaoSugerida('estrategista')).toBe('cs')
    expect(visaoSugerida('atendimento')).toBe('tecnico')
    expect(visaoSugerida('agente_chat')).toBe('tecnico')
    expect(visaoSugerida(undefined)).toBe('tecnico')
  })

  it('só oferece Gestão a quem gere a operação', () => {
    expect(visoesDoPerfil('gerente')).toEqual(['gestao', 'cs', 'tecnico'])
    expect(visoesDoPerfil('atendimento')).toEqual(['cs', 'tecnico'])
    expect(visoesDoPerfil('estrategista')).not.toContain('gestao')
  })

  it('ignora escolha salva que o perfil não pode usar', () => {
    expect(visaoEfetiva('atendimento', 'gestao')).toBe('tecnico')
    expect(visaoEfetiva('estrategista', 'lixo')).toBe('cs')
    expect(visaoEfetiva('gerente', 'tecnico')).toBe('tecnico')
    expect(visaoEfetiva('atendimento', 'cs')).toBe('cs')
  })
})
