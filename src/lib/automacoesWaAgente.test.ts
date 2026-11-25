import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as front from './automacoesWaAgente'
import * as servidor from '../../supabase/functions/_shared/wa-agente-como-chamar'

const MARCA = '// ===== INÍCIO DO ESPELHO ====='

function corpo(caminho: string): string {
  const t = readFileSync(resolve(__dirname, caminho), 'utf8')
  const i = t.indexOf(MARCA)
  expect(i).toBeGreaterThanOrEqual(0)
  return t.slice(i)
}

describe('espelho de wa-agente-como-chamar', () => {
  it('código idêntico ao do servidor (abaixo da marca)', () => {
    expect(corpo('./automacoesWaAgente.ts')).toBe(corpo('../../supabase/functions/_shared/wa-agente-como-chamar.ts'))
  })
  it('mesmas saídas', () => {
    const d = { nome: 'Ana', nomeContato: 'Ana Suporte', telefoneNumero: '+55 11 95197-9967' }
    expect(front.rodapesGrupo(d)).toEqual(servidor.rodapesGrupo(d))
    expect(front.rodapesPrivado()).toEqual(servidor.rodapesPrivado())
    expect(front.textosAjuda('grupo', d)).toEqual(servidor.textosAjuda('grupo', d))
    expect(front.textoBoasVindas('privado', d)).toEqual(servidor.textoBoasVindas('privado', d))
    expect(front.validarNomeAgente('Bia', ['Bianca'], [])).toEqual(servidor.validarNomeAgente('Bia', ['Bianca'], []))
  })
})

describe('textos literais pedidos pelo dono', () => {
  it('rodapé do privado', () => {
    expect(front.rodapesPrivado()[0]).toBe('Dúvidas? É só me responder aqui.')
    expect(front.rodapesPrivado()).toHaveLength(3)
  })
  it('rodapé do grupo com @contato, final de 4 dígitos e "Nome,"', () => {
    expect(front.rodapesGrupo({ nome: 'Ana', nomeContato: 'Ana Suporte', telefoneNumero: '+5511900009967' })[0]).toBe(
      'Para falar comigo aqui, marque @Ana Suporte (digite @ e escolha o contato final 9967) ou responda a esta mensagem. Também funciona começar com "Ana,"',
    )
    expect(front.rodapesGrupo({ nome: 'Ana' })).toHaveLength(3)
  })
  it('sem número: orienta pelo nome do contato; sem nome do contato: usa o nome', () => {
    expect(front.rodapesGrupo({ nome: 'Ana' })[0]).toContain('marque @Ana (digite @ e escolha o contato Ana)')
  })
  it('nome com formatação/@/aspas é limpo', () => {
    expect(front.rodapesGrupo({ nome: '*@Ana"' })[0]).toContain('"Ana,"')
  })
  it('sorteio escolhe uma das variações', () => {
    expect(front.rodapeComoChamar('privado', { nome: 'Ana' }, () => 0.99)).toBe(front.rodapesPrivado()[2])
  })
  it('ajuda lista o que faz e como chamar; boas-vindas tem 3 exemplos', () => {
    const a = front.textosAjuda('privado', { nome: 'Ana' })
    expect(a).toHaveLength(3)
    for (const t of a) for (const item of front.O_QUE_FACO) expect(t).toContain(item)
    const b = front.textoBoasVindas('grupo', { nome: 'Ana', telefoneNumero: '+5511900009967' })
    expect(front.EXEMPLOS_PERGUNTA).toHaveLength(3)
    for (const e of front.EXEMPLOS_PERGUNTA) expect(b).toContain(e)
    expect(b).toContain('final 9967')
    expect(JSON.stringify([a, b, front.O_QUE_FACO])).not.toMatch(/reuni[ãõ]|agend/i)
  })
})

describe('validarNomeAgente (igual ao CHECK do banco)', () => {
  it.each(['Ana', 'Bia Maria', 'Íris', 'Conceição'])('aceita "%s"', (n) => expect(front.validarNomeAgente(n).ok).toBe(true))
  it.each([
    ['Al', /3 letras/], ['Ana-Bia', /só letras/], ["D'Ávila", /só letras/], ['Ana2', /só letras/], [' 1Ana', /só letras/],
    ['A'.repeat(25), /24/],
  ])('recusa "%s"', (n, erro) => {
    const r = front.validarNomeAgente(n as string)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(erro as RegExp)
  })
  it('não colide com equipe (nome ou 1º nome) nem com cliente, sem acento/caixa', () => {
    expect(front.validarNomeAgente('ana', ['Ana Paula'], []).ok).toBe(false)
    expect(front.validarNomeAgente('Luís', [], ['luis']).ok).toBe(false)
    expect(front.validarNomeAgente('Ana', ['Mariana'], ['Ana Lima']).ok).toBe(true)
  })
  it('espaços extras são normalizados', () => {
    expect(front.validarNomeAgente('  Ana   Bia ')).toEqual({ ok: true, nome: 'Ana Bia' })
  })
})
