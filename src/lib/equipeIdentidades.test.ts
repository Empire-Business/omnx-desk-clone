import { describe, expect, it } from 'vitest'
import {
  finalTelefone, identidadesPorPessoa, telefoneEquipeCanonico, validarTelefoneEquipe,
  type IdentidadeEquipeTela,
} from './equipeIdentidades'

describe('telefoneEquipeCanonico (mesma regra de chaveTelefoneBR)', () => {
  it('celular com DDD, com ou sem 55, com ou sem o 9', () => {
    expect(telefoneEquipeCanonico('(11) 99999-8888')).toEqual({ ok: true, telefone: '5511999998888' })
    expect(telefoneEquipeCanonico('+55 11 9999-8888')).toEqual({ ok: true, telefone: '5511999998888' })
    expect(telefoneEquipeCanonico('1199998888')).toEqual({ ok: true, telefone: '5511999998888' })
  })
  it('fixo não ganha o 9', () => {
    expect(telefoneEquipeCanonico('(11) 3333-4444')).toEqual({ ok: true, telefone: '551133334444' })
  })
  it('inválidos', () => {
    expect(telefoneEquipeCanonico('123').ok).toBe(false)
    expect(telefoneEquipeCanonico('').ok).toBe(false)
    expect(telefoneEquipeCanonico('+44 20 7946 0958 12').ok).toBe(false)
  })
})

describe('validarTelefoneEquipe', () => {
  it('exige pessoa e respeita o limite de 3 cadastrados', () => {
    expect(validarTelefoneEquipe('', '11999998888', []).ok).toBe(false)
    const tres = [{ origem: 'cadastro' as const }, { origem: 'cadastro' as const }, { origem: 'cadastro' as const }]
    expect(validarTelefoneEquipe('u1', '11999998888', tres).ok).toBe(false)
    expect(validarTelefoneEquipe('u1', '11999998888', [{ origem: 'membro_agente' }]).ok).toBe(true)
  })
})

describe('finalTelefone', () => {
  it('só os 4 últimos dígitos', () => {
    expect(finalTelefone('8888')).toBe('•• 8888')
    expect(finalTelefone('5511999998888')).toBe('•• 8888')
    expect(finalTelefone(null)).toBe('••')
  })
})

describe('identidadesPorPessoa', () => {
  it('agrupa por pessoa e ignora números da empresa', () => {
    const base = { instance_uuid: null, telefone_fim: '1', nome_exibicao: null, ativo: true, lid_aprendido_em: null }
    const lista: IdentidadeEquipeTela[] = [
      { ...base, id: 'a', user_id: 'u1', origem: 'cadastro' },
      { ...base, id: 'b', user_id: 'u1', origem: 'membro_agente' },
      { ...base, id: 'c', user_id: null, origem: 'instancia' },
    ]
    const m = identidadesPorPessoa(lista)
    expect(m.get('u1')?.map((i) => i.id)).toEqual(['a', 'b'])
    expect(m.size).toBe(1)
  })
})
