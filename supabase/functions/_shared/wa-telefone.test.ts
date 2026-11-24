import { describe, expect, it } from 'vitest'
import { chaveTelefoneBR, jidParaNumero, jidServidor, jidUsuario, waNumberVariants } from './wa-telefone.ts'

describe('waNumberVariants (igual ao comportamento antigo do uazapi-webhook)', () => {
  it('celular com 9 gera também a forma sem 9', () => {
    expect(waNumberVariants('5511987654321')).toEqual(['5511987654321', '551187654321'])
  })
  it('celular sem 9 gera também a forma com 9', () => {
    expect(waNumberVariants('551187654321')).toEqual(['551187654321', '5511987654321'])
  })
  it('ignora não-dígitos', () => {
    expect(waNumberVariants('+55 (11) 98765-4321')).toEqual(['5511987654321', '551187654321'])
  })
  it('número estrangeiro e grupo: só ele mesmo', () => {
    expect(waNumberVariants('14155550123')).toEqual(['14155550123'])
    expect(waNumberVariants('120363012345678901')).toEqual(['120363012345678901'])
  })
  it('vazio', () => {
    expect(waNumberVariants('')).toEqual([])
  })
})

describe('chaveTelefoneBR (mesma regra da coluna gerada telefone_chave)', () => {
  it('celular BR sem o 9 ganha o 9', () => {
    expect(chaveTelefoneBR('+551187654321')).toBe('5511987654321')
    expect(chaveTelefoneBR('552199998888')).toBe('5521999998888')
    expect(chaveTelefoneBR('556161234567')).toBe('5561961234567') // começa com 6
  })
  it('celular BR com 9 fica igual', () => {
    expect(chaveTelefoneBR('+5511987654321')).toBe('5511987654321')
  })
  it('com e sem o 9 dão a MESMA chave', () => {
    expect(chaveTelefoneBR('5511987654321')).toBe(chaveTelefoneBR('551187654321'))
  })
  it('fixo BR (começa com 2–5) não ganha 9', () => {
    expect(chaveTelefoneBR('+551151979967')).toBe('551151979967')
    expect(chaveTelefoneBR('+552133334444')).toBe('552133334444')
  })
  it('internacional e vazio', () => {
    expect(chaveTelefoneBR('+14155550123')).toBe('14155550123')
    expect(chaveTelefoneBR('')).toBe('')
    expect(chaveTelefoneBR(null)).toBe('')
  })
  it('DDD com 0 não é celular BR válido: não mexe', () => {
    expect(chaveTelefoneBR('550187654321')).toBe('550187654321')
  })
  it('espelha a expressão SQL (CASE WHEN ~ ^\\+55[1-9][0-9][6-9][0-9]{7}$)', () => {
    const sql = (e164: string) =>
      /^\+55[1-9][0-9][6-9][0-9]{7}$/.test(e164) ? `55${e164.slice(3, 5)}9${e164.slice(5)}` : e164.slice(1)
    for (const t of ['+551187654321', '+5511987654321', '+551151979967', '+14155550123', '+559976543210']) {
      expect(chaveTelefoneBR(t)).toBe(sql(t))
    }
  })
})

describe('JIDs', () => {
  it('jidParaNumero: pessoa, com aparelho, sem sufixo', () => {
    expect(jidParaNumero('5511987654321@s.whatsapp.net')).toBe('5511987654321')
    expect(jidParaNumero('5511987654321:12@s.whatsapp.net')).toBe('5511987654321')
    expect(jidParaNumero('5511987654321@c.us')).toBe('5511987654321')
    expect(jidParaNumero('5511987654321')).toBe('5511987654321')
  })
  it('jidParaNumero: LID e grupo não são telefone', () => {
    expect(jidParaNumero('123456789012345@lid')).toBeNull()
    expect(jidParaNumero('120363012345678901@g.us')).toBeNull()
    expect(jidParaNumero('')).toBeNull()
    expect(jidParaNumero(undefined)).toBeNull()
    expect(jidParaNumero('abc@s.whatsapp.net')).toBeNull()
  })
  it('jidUsuario / jidServidor', () => {
    expect(jidUsuario('123:4@lid')).toBe('123')
    expect(jidUsuario('ABC@LID')).toBe('abc')
    expect(jidServidor('123:4@lid')).toBe('lid')
    expect(jidServidor('5511')).toBe('')
  })
})
