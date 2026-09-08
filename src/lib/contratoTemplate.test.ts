import { describe, it, expect } from 'vitest'
import { preencherModelo, type DadosContrato } from './contratoTemplate'

const dados: DadosContrato = {
  cliente_nome: 'João da Silva',
  empresa: 'Silva LTDA',
  cpf_cnpj: '123.456.789-00',
  email: 'joao@exemplo.com',
  whatsapp: '11999998888',
  instagram: '@joaosilva',
  endereco: 'Rua A, 100',
  produto_nome: 'Acelerador Gold',
  valor_total: 24000,
  num_parcelas: 12,
  valor_parcela: 2000,
  entrada: 5000,
  forma_pagamento: 'Cartão',
  data_fechamento: '2026-07-01',
  estrategista: 'Maria',
  vendedor: 'Pedro',
}

describe('preencherModelo', () => {
  it('troca os campos pelos dados reais', () => {
    const out = preencherModelo('Cliente {{cliente_nome}} — produto {{produto_nome}}', dados)
    expect(out).toBe('Cliente João da Silva — produto Acelerador Gold')
  })

  it('formata valores em BRL', () => {
    const out = preencherModelo('Total: {{valor_total}} | Parcela: {{valor_parcela}}', dados)
    expect(out).toContain('R$')
    expect(out).toContain('24.000,00')
    expect(out).toContain('2.000,00')
  })

  it('formata a data de fechamento em pt-BR', () => {
    const out = preencherModelo('Fechado em {{data_fechamento}}', dados)
    expect(out).toBe('Fechado em 01/07/2026')
  })

  it('preenche todos os campos conhecidos (sem sobrar {{...}})', () => {
    const template = [
      '{{cliente_nome}}', '{{empresa}}', '{{cpf_cnpj}}', '{{email}}', '{{whatsapp}}',
      '{{instagram}}', '{{endereco}}', '{{produto_nome}}', '{{valor_total}}',
      '{{num_parcelas}}', '{{valor_parcela}}', '{{entrada}}', '{{forma_pagamento}}',
      '{{data_fechamento}}', '{{data_hoje}}', '{{data_extenso}}', '{{estrategista}}', '{{vendedor}}',
    ].join(' ')
    const out = preencherModelo(template, dados)
    expect(out).not.toMatch(/\{\{[a-z_]+\}\}/)
  })

  it('mantém campos desconhecidos intactos', () => {
    const out = preencherModelo('Olá {{cliente_nome}}, campo {{inexistente}}', dados)
    expect(out).toBe('Olá João da Silva, campo {{inexistente}}')
  })

  it('não quebra com dados nulos (vira string vazia)', () => {
    const out = preencherModelo('[{{cliente_nome}}][{{email}}]', {})
    expect(out).toBe('[][]')
  })
})
