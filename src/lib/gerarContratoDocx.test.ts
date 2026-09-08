import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import PizZip from 'pizzip'
import { gerarContratoDocx } from './gerarContratoDocx'
import type { DadosContrato } from './contratoTemplate'

const dados: DadosContrato = {
  cliente_nome: 'João da Silva',
  cpf_cnpj: '123.456.789-00',
  endereco: 'Rua A, 100 — São Paulo/SP',
  email: 'joao@exemplo.com',
  whatsapp: '11999998888',
  parcelas: [
    { data: '2026-07-10', valor: 16000, forma: 'PIX', plataforma: 'Firepay', sinal: 'Entrada' },
    { data: '2026-08-10', valor: 6000, forma: 'Boleto', plataforma: 'Asaas', sinal: 'Parcela 2' },
    { data: '2026-09-10', valor: 6000, forma: 'Cartão', plataforma: 'Stripe', sinal: 'Parcela 3' },
  ],
}

const dir = 'public/modelos-contrato'
const modelos = readdirSync(dir).filter((f) => f.endsWith('.docx'))

function b64(nome: string): string {
  return readFileSync(`${dir}/${nome}`).toString('base64')
}

describe('gerarContratoDocx — todos os modelos', () => {
  it('encontrou os modelos', () => {
    expect(modelos.length).toBeGreaterThanOrEqual(9)
  })

  for (const nome of modelos) {
    it(`gera .docx válido de ${nome}`, async () => {
      const blob = await gerarContratoDocx({ arquivo_b64: b64(nome), arquivo_nome: null }, dados)
      expect(blob.size).toBeGreaterThan(1000)
      const buf = Buffer.from(await blob.arrayBuffer())
      expect(buf.slice(0, 2).toString()).toBe('PK') // zip válido
      const xml = new PizZip(buf).file('word/document.xml')!.asText()
      // dados do cliente entraram e nenhuma marcação sobrou
      expect(xml).toContain('João da Silva')
      expect(xml).not.toContain('{cliente_nome}')
      expect(xml).not.toContain('{#parcelas}')
      expect(xml).not.toContain('{venc}')
      expect(xml).not.toContain('{data_extenso}') // data de hoje preenchida
    })
  }

  it('BPO Performance: parcelas do loop entram na tabela', async () => {
    const blob = await gerarContratoDocx({ arquivo_b64: b64('bpo-performance-anual.docx'), arquivo_nome: null }, dados)
    const xml = new PizZip(Buffer.from(await blob.arrayBuffer())).file('word/document.xml')!.asText()
    expect(xml).toContain('10/07/2026')
    expect(xml).toContain('16.000,00')
    expect(xml).toContain('Firepay')
    expect(xml).toContain('Boleto')
  })
})
