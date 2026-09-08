import { describe, it, expect } from 'vitest'
import { extrairIdentificador } from './ocrComprovante'

/**
 * Cada caso abaixo é o texto que o OCR devolve pra um comprovante real, com o
 * layout de um banco diferente. O que muda de banco pra banco é onde fica o nome
 * de quem pagou — e é exatamente isso que a heurística precisa acertar.
 *
 * A empresa (Aliança de Alto Valor) aparece como recebedora em todos: se algum
 * teste devolver ela, a leitura pegou o lado errado do comprovante.
 */

describe('extrairIdentificador', () => {
  it('Nubank: blocos "Destino" e "Origem", nome na linha abaixo do rótulo', () => {
    const r = extrairIdentificador(`
Comprovante de transferência
14 JAN 2026 - 10:32:11
Valor
R$ 1.500,00
Tipo de transferência
Pix
Destino
Nome
Alianca de Alto Valor LTDA
CPF/CNPJ
12.345.678/0001-90
Instituição
NU PAGAMENTOS S.A.
Origem
Nome
Maria Souza Lima
CPF
123.456.789-00
Instituição
NUBANK
ID da transação
E18236120202601141032
`)
    expect(r.identificador).toBe('Maria Souza Lima')
    expect(r.confianca).toBe('alta')
  })

  it('Itaú: "Dados de quem pagou" com nome na mesma linha do rótulo', () => {
    const r = extrairIdentificador(`
Comprovante de Pix
Valor: R$ 500,00
Data: 03/02/2026
Dados de quem pagou
Nome: João Pedro Alves
CPF/CNPJ: ***.456.789-**
Instituição: ITAU UNIBANCO S.A.
Dados de quem recebeu
Nome: ALIANCA DE ALTO VALOR LTDA
CNPJ: 12.345.678/0001-90
`)
    expect(r.identificador).toBe('João Pedro Alves')
    expect(r.confianca).toBe('alta')
  })

  it('Banco do Brasil: "CLIENTE PAGADOR" em caixa alta, sem rótulo de nome', () => {
    const r = extrairIdentificador(`
COMPROVANTE DE TRANSFERENCIA PIX
CLIENTE PAGADOR
CARLOS EDUARDO MENDES
CPF 012.345.678-90
BANCO DO BRASIL S.A.
FAVORECIDO
ALIANCA DE ALTO VALOR LTDA
CNPJ 12.345.678/0001-90
VALOR R$ 3.000,00
`)
    // Não pode devolver "Cliente Pagador" (a própria linha do rótulo).
    expect(r.identificador).toBe('Carlos Eduardo Mendes')
    expect(r.confianca).toBe('alta')
  })

  it('Inter: "Quem recebeu" vem antes de "Quem pagou"', () => {
    const r = extrairIdentificador(`
Comprovante de pagamento
Pix enviado
R$ 2.000,00
Quem recebeu
Nome ALIANCA DE ALTO VALOR
CNPJ 12.345.678/0001-90
Quem pagou
Nome Fernanda Ribeiro Costa
CPF 987.654.321-00
Instituicao BANCO INTER
`)
    expect(r.identificador).toBe('Fernanda Ribeiro Costa')
  })

  it('Mercado Pago: "Para" e "De" isolados, sem dois-pontos', () => {
    const r = extrairIdentificador(`
Você transferiu
R$ 300,00
Para
ALIANCA DE ALTO VALOR
CNPJ 12.345.678/0001-90
De
Ana Paula Martins
CPF 123.456.789-00
`)
    expect(r.identificador).toBe('Ana Paula Martins')
  })

  it('normaliza caixa alta e mantém as preposições em minúscula', () => {
    const r = extrairIdentificador('Pagador\nJOSE DA SILVA DOS SANTOS\nCPF 111.222.333-44')
    expect(r.identificador).toBe('Jose da Silva dos Santos')
  })

  it('recorte que só tem o recebedor não devolve a empresa', () => {
    const r = extrairIdentificador(`
Comprovante
Favorecido
ALIANCA DE ALTO VALOR LTDA
CNPJ 12.345.678/0001-90
Valor R$ 900,00
`)
    expect(r.identificador).toBeNull()
  })

  it('ignora banco, instituição e outras linhas que não são nome de gente', () => {
    const r = extrairIdentificador(`
Comprovante de transferencia
Instituicao BANCO INTER S.A.
Chave Pix aliancadealtovalor@gmail.com
Data e horario 04/03/2026 as 14h22
`)
    expect(r.identificador).toBeNull()
  })

  it('sem rótulo de pagador não inventa: devolve vazio', () => {
    // Antes isto devolvia "Roberto Nunes Ferreira" com confiança baixa. O problema é
    // que a mesma regra, num print de checkout, devolvia cidade e nome de banco.
    const r = extrairIdentificador('Transferencia realizada\nRoberto Nunes Ferreira\nR$ 1.200,00')
    expect(r.identificador).toBeNull()
  })

  /**
   * Casos colhidos da primeira leitura em massa dos comprovantes reais do sistema.
   * Cada um destes virou um identificador errado gravado no banco — e nenhum deles
   * é comprovante de PIX: são prints de checkout, e-mail e tela de plataforma.
   */
  describe('lixo que a leitura em massa produziu — nenhum pode voltar', () => {
    const casos: Array<[string, string]> = [
      ['endereço da empresa', 'Comprovante\nAv. Atlantica 500\nRio de Janeiro - RJ\nValor R$ 10.200,00'],
      ['e-mail de boas-vindas', 'Bem-vindo ao Acelerador de Marca\nSeu acesso já está liberado\nAproveite'],
      ['central do banco', 'Comprovante de pagamento\nCentral de Atendimento Santander\n4004 3535'],
      ['adquirente', 'Pagamento aprovado\nStone Psa\nTransacao 88213'],
      ['instituição de pagamento', 'Rocket Servicos Financeiros\nPagamento confirmado'],
      ['página de produto em espanhol', 'Ya Puedes Acceder A Tu Producto\nGracias por tu compra'],
      ['título em inglês', 'Proof Of Payment\nAmount 21.000,00'],
      ['frase solta de tela', 'Mudanca Radical Business\nTo Vendo Aqui'],
    ]
    for (const [nome, texto] of casos) {
      it(nome, () => {
        expect(extrairIdentificador(texto).identificador).toBeNull()
      })
    }
  })

  it('ainda acerta quando o comprovante realmente identifica o pagador', () => {
    // Os poucos acertos da leitura em massa eram todos assim — com rótulo de verdade.
    const r = extrairIdentificador('Comprovante Pix\nPagador\nVictor Claudio V Lacorte\nCPF 123.456.789-00')
    expect(r.identificador).toBe('Victor Claudio V Lacorte')
    expect(r.confianca).toBe('alta')
  })

  it('texto vazio ou ilegível não quebra', () => {
    expect(extrairIdentificador('').identificador).toBeNull()
    expect(extrairIdentificador('|||  ###  @@@').identificador).toBeNull()
  })
})
