import { describe, expect, it } from 'vitest'
import {
  AVISO_ACESSO_TOTAL, LIMITE_MEMBROS_AGENTE, estadoAssistente, formatarCustoUsd, montarNumerosGrupo,
  rotuloResultadoExecucao, textoEscopo, validarMembroAgente,
} from './automacoesWa'

describe('textoEscopo', () => {
  it('toda a carteira / N clientes / nenhum / falha', () => {
    expect(textoEscopo({ ve_tudo: true, clientes: 0 })).toBe('vê toda a carteira')
    expect(textoEscopo({ ve_tudo: false, clientes: 12 })).toBe('vê 12 clientes')
    expect(textoEscopo({ ve_tudo: false, clientes: 1 })).toBe('vê 1 cliente')
    expect(textoEscopo({ ve_tudo: false, clientes: 0 })).toBe('não vê nenhum cliente')
    expect(textoEscopo({ ve_tudo: true, clientes: 0, escopo_ok: false })).toBe('não foi possível ver a carteira')
  })
})

describe('validarMembroAgente', () => {
  it('exige pessoa e WhatsApp válido', () => {
    expect(validarMembroAgente('', '(11) 99999-8888')).toEqual({ ok: false, erro: 'Escolha a pessoa da equipe.' })
    expect(validarMembroAgente('u1', '123').ok).toBe(false)
    expect(validarMembroAgente('u1', '(11) 99999-8888')).toEqual({ ok: true, telefone: '+5511999998888' })
  })
  it('não repete pessoa nem WhatsApp (com ou sem o 9º dígito)', () => {
    const ex = [{ user_id: 'u1', telefone: '+5511999998888' }]
    expect(validarMembroAgente('u1', '(11) 98888-7777').ok).toBe(true)
    expect(validarMembroAgente('u1', '(11) 98888-7777', ex)).toEqual({ ok: false, erro: 'Essa pessoa já está na lista.' })
    expect(validarMembroAgente('u2', '(11) 9999-8888', ex)).toEqual({ ok: false, erro: 'Esse WhatsApp já está na lista.' })
  })
  it('respeita o limite do banco', () => {
    const cheios = Array.from({ length: LIMITE_MEMBROS_AGENTE }, (_, i) => ({ user_id: `u${i}`, telefone: `+55119${String(i).padStart(8, '0')}` }))
    expect(validarMembroAgente('novo', '(21) 99999-0000', cheios).ok).toBe(false)
  })
})

describe('montarNumerosGrupo', () => {
  it('principal + reservas na ordem 1..n', () => {
    expect(montarNumerosGrupo('a', ['b', 'c'])).toEqual({
      ok: true, linhas: [{ instance_uuid: 'a', ordem: 1 }, { instance_uuid: 'b', ordem: 2 }, { instance_uuid: 'c', ordem: 3 }],
    })
  })
  it('sem principal, repetido ou mais de 5 → erro', () => {
    expect(montarNumerosGrupo(null).ok).toBe(false)
    expect(montarNumerosGrupo('a', ['a']).ok).toBe(false)
    expect(montarNumerosGrupo('a', ['b', 'c', 'd', 'e', 'f']).ok).toBe(false)
  })
})

describe('estadoAssistente', () => {
  const base = { ativo: true, privado: true, grupos: false, membrosAtivos: 2, gruposAtivos: 0 }
  it('desligado', () => expect(estadoAssistente({ ...base, ativo: false })).toEqual({ tipo: 'desligado' }))
  it('ligado com resumo', () => {
    expect(estadoAssistente(base)).toEqual({ tipo: 'ligado', resumo: 'Responde 2 pessoas no privado' })
    expect(estadoAssistente({ ...base, grupos: true, gruposAtivos: 1, membrosAtivos: 1 })).toEqual({ tipo: 'ligado', resumo: 'Responde 1 pessoa no privado e 1 grupo' })
  })
  it('falta configurar', () => {
    expect(estadoAssistente({ ...base, privado: false })).toMatchObject({ tipo: 'falta', motivo: expect.stringMatching(/onde ele responde/) })
    expect(estadoAssistente({ ...base, membrosAtivos: 0 })).toMatchObject({ tipo: 'falta', motivo: expect.stringMatching(/quem pode falar/) })
    expect(estadoAssistente({ ...base, privado: false, grupos: true })).toMatchObject({ tipo: 'falta', motivo: expect.stringMatching(/grupo interno/) })
  })
})

describe('textos', () => {
  it('custo em US$', () => {
    expect(formatarCustoUsd(0.0834)).toBe('US$ 0,08')
    expect(formatarCustoUsd('0.0021')).toBe('US$ 0,0021')
    expect(formatarCustoUsd(null)).toBe('US$ 0,00')
  })
  it('resultado conhecido e desconhecido', () => {
    expect(rotuloResultadoExecucao('humano_assumiu').rotulo).toMatch(/quieto/)
    expect(rotuloResultadoExecucao('novo_tipo')).toEqual({ rotulo: 'novo_tipo', tom: 'neutro' })
  })
  it('aviso do "todos veem tudo" é o pedido pelo dono', () => {
    expect(AVISO_ACESSO_TOTAL).toBe('O assistente vai responder sobre todos os clientes da empresa para qualquer pessoa deste grupo.')
  })
})
