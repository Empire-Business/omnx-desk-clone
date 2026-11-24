import { describe, expect, it } from 'vitest'
import {
  DIAS_SEMANA, PROVEDORES, REGRAS_ANOMALIA, formataTelefoneExibicao, validarGestor,
} from './automacoesWa'

describe('constantes', () => {
  it('tem as 4 regras com os padrões combinados', () => {
    expect(REGRAS_ANOMALIA.map((r) => r.tipo)).toEqual([
      'sem_resposta', 'sentimento_negativo', 'pendencia', 'queda_volume',
    ])
    const sem = REGRAS_ANOMALIA[0]
    expect([sem.unidade, sem.limiarPadrao]).toEqual(['horas', 4])
    const queda = REGRAS_ANOMALIA[3]
    expect([queda.unidade, queda.limiarPadrao]).toEqual(['%', 50])
  })
  it('rotula os provedores e cobre os 7 dias ISO', () => {
    expect(PROVEDORES.uazapi).toBe('Não oficial (UAZAPI)')
    expect(PROVEDORES.zernio).toBe('Oficial (Zernio)')
    expect(DIAS_SEMANA.map((d) => d.valor)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

describe('validarGestor', () => {
  it('aceita e normaliza para E.164', () => {
    const r = validarGestor('  Ana  ', '(11) 99999-8888')
    expect(r).toEqual({ ok: true, nome: 'Ana', telefone: '+5511999998888', erro: '' })
  })
  it('rejeita nome vazio ou longo demais', () => {
    expect(validarGestor('   ', '11999998888').ok).toBe(false)
    expect(validarGestor('a'.repeat(81), '11999998888').ok).toBe(false)
    expect(validarGestor('a'.repeat(80), '11999998888').ok).toBe(true)
  })
  it('rejeita telefone vazio, curto ou atípico', () => {
    expect(validarGestor('Ana', '').ok).toBe(false)
    expect(validarGestor('Ana', '12345').ok).toBe(false)
    expect(validarGestor('Ana', '1234567890123456789').ok).toBe(false)
  })
})

describe('formataTelefoneExibicao', () => {
  it('formata celular e fixo brasileiros', () => {
    expect(formataTelefoneExibicao('+5511999998888')).toBe('+55 (11) 99999-8888')
    expect(formataTelefoneExibicao('+551133334444')).toBe('+55 (11) 3333-4444')
  })
  it('mantém o que não for brasileiro e trata vazio', () => {
    expect(formataTelefoneExibicao('+14155550100')).toBe('+14155550100')
    expect(formataTelefoneExibicao(null)).toBe('')
  })
})
