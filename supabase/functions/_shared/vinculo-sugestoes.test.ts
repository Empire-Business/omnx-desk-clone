import { describe, expect, it } from 'vitest'
import {
  type ClienteEntrada, type ContatoEntrada, type ContratoEntrada, type EntradaSugestoes,
  MAX_SUGESTOES, PONTOS, calcularSugestoes, canalDoContato, formasDoCanal, handleInstagram, indexarClientes,
  indexarTelefones, normalizarNome, sugerirParaGrupo, sugerirParaPrivado, telCmpCadastro, telCmpContato, tipoCanal,
} from './vinculo-sugestoes.ts'

const GRUPO = '120363401234567890'

// ---------------------------------------------------------------------------
// Chave do canal (mesma regra das funções SQL private.canal_*)
// ---------------------------------------------------------------------------
describe('canal do contato', () => {
  it('grupo: id sem @g.us, com ou sem o sufixo e pelo tamanho do grupo', () => {
    expect(canalDoContato(GRUPO)).toEqual({ tipo: 'grupo', chave: GRUPO })
    expect(canalDoContato(`${GRUPO}@g.us`)).toEqual({ tipo: 'grupo', chave: GRUPO })
    expect(canalDoContato(' 5511987654321-1600000000 ')).toEqual({ tipo: 'grupo', chave: '5511987654321-1600000000' })
    expect(tipoCanal('5511987654321', 12)).toBe('grupo')
    // id longo sem formato conhecido: é grupo, mas sem chave confiável
    expect(tipoCanal('99999999999999999999')).toBe('grupo')
    expect(canalDoContato('99999999999999999999')).toBeNull()
  })

  it('privado: celular BR sempre com o 9º dígito; fixo e internacional como vieram', () => {
    expect(canalDoContato('551187654321')).toEqual({ tipo: 'privado', chave: '5511987654321' })
    expect(canalDoContato('5511987654321')).toEqual({ tipo: 'privado', chave: '5511987654321' })
    expect(canalDoContato('551133334444')).toEqual({ tipo: 'privado', chave: '551133334444' }) // fixo (começa em 3)
    expect(canalDoContato('12125551234')).toEqual({ tipo: 'privado', chave: '12125551234' })
    expect(canalDoContato('5511987654321:12@s.whatsapp.net')).toEqual({ tipo: 'privado', chave: '5511987654321' })
  })

  it('LID, vazio e número curto não têm canal', () => {
    expect(canalDoContato('123456789012345@lid')).toBeNull()
    expect(canalDoContato('')).toBeNull()
    expect(canalDoContato(null)).toBeNull()
    expect(canalDoContato('1234567')).toBeNull()
  })

  it('formas: as duas grafias do grupo e do celular (com e sem o 9)', () => {
    expect(formasDoCanal({ tipo: 'grupo', chave: GRUPO })).toEqual([GRUPO, `${GRUPO}@g.us`])
    expect(formasDoCanal({ tipo: 'privado', chave: '5511987654321' })).toEqual(['5511987654321', '551187654321'])
    expect(formasDoCanal({ tipo: 'privado', chave: '551133334444' })).toEqual(['551133334444'])
  })
})

describe('comparação de telefone', () => {
  it('contato: DDD + 8 últimos dígitos, com ou sem o 9', () => {
    expect(telCmpContato('5511987654321')).toBe('br1187654321')
    expect(telCmpContato('551187654321')).toBe('br1187654321')
    expect(telCmpContato('12125551234')).toBe('x12125551234')
    expect(telCmpContato('123')).toBeNull()
  })

  it('cadastro: aceita máscara, sem o 55, com zero na frente; sem DDD não compara', () => {
    expect(telCmpCadastro('(11) 98765-4321')).toBe('br1187654321')
    expect(telCmpCadastro('+55 11 8765-4321')).toBe('br1187654321')
    expect(telCmpCadastro('011 98765-4321')).toBe('br1187654321')
    expect(telCmpCadastro('98765-4321')).toBeNull()
    expect(telCmpCadastro('')).toBeNull()
    // DDD 55 (RS) sem o código do país continua sendo DDD
    expect(telCmpCadastro('55 99123-4567')).toBe('br5591234567')
    expect(telCmpContato('5555991234567')).toBe('br5591234567')
  })
})

describe('normalização de nomes', () => {
  it('sem acento, minúsculo, só letras/números e espaços simples', () => {
    expect(normalizarNome('  Clínica  São-João & Cia. ')).toBe('clinica sao joao cia')
    expect(normalizarNome('🚀 Grupo | Dra. Ana')).toBe('grupo dra ana')
    expect(normalizarNome(null)).toBe('')
  })

  it('@ do Instagram de vários jeitos', () => {
    expect(handleInstagram('@dra.ana_paula')).toBe('draanapaula')
    expect(handleInstagram('https://www.instagram.com/dra.ana_paula/?hl=pt')).toBe('draanapaula')
    expect(handleInstagram('@ana')).toBeNull() // curto demais
    expect(handleInstagram('')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Pontuação
// ---------------------------------------------------------------------------
const cli = (p: Partial<ClienteEntrada> & Pick<ClienteEntrada, 'id'>): ClienteEntrada => ({ nome: null, ativo: true, ...p })
const contrato = (p: Partial<ContratoEntrada> & Pick<ContratoEntrada, 'cliente_id'>): ContratoEntrada => ({ status: 'ativo', ...p })

describe('sugerirParaGrupo', () => {
  const clientes = indexarClientes([
    cli({ id: 'ana', nome: 'Ana Paula Souza', empresa: 'Doce Sabor Ltda', instagram: '@docesabor.oficial' }),
    cli({ id: 'bruno', nome: 'Bruno Lima', razao_social: 'BL Comércio de Alimentos ME' }),
    cli({ id: 'carla', nome: 'Carla', empresa: 'Marketing' }),
    cli({ id: 'inativo', nome: 'Diego Ramos', ativo: false }),
    cli({ id: 'eva', nome: 'Eva Mendes' }),
  ], [
    contrato({ cliente_id: 'eva', cliente_nome: 'Eva Mendes', empresa: 'Studio Eva Fit' }),
    contrato({ cliente_id: 'bruno', status: 'cancelado' }),
  ])

  it('nome completo do cliente no nome do grupo', () => {
    const r = sugerirParaGrupo(['Ana Paula Souza x Agência'], [], clientes)
    expect(r).toEqual([{ client_id: 'ana', score: PONTOS.completo, origem: 'nome_grupo', evidencias: { nome_grupo: 'completo', fonte: 'cadastro' } }])
  })

  it('1º + último nome, empresa, razão social e Instagram', () => {
    expect(sugerirParaGrupo(['Souza, Ana — mentoria'], [], clientes)[0]).toMatchObject({ client_id: 'ana', evidencias: { nome_grupo: 'primeiro_ultimo' } })
    expect(sugerirParaGrupo(['[Equipe] Doce Sabor'], [], clientes)[0]).toMatchObject({ client_id: 'ana', score: PONTOS.empresa, evidencias: { nome_grupo: 'empresa' } })
    expect(sugerirParaGrupo(['BL Comércio de Alimentos | suporte'], [], clientes)[0]).toMatchObject({ client_id: 'bruno', evidencias: { nome_grupo: 'razao_social' } })
    expect(sugerirParaGrupo(['docesabor oficial 2026'], [], clientes)[0]).toMatchObject({ client_id: 'ana', evidencias: { nome_grupo: 'instagram' } })
  })

  it('nome do contrato vale e contrato vigente soma um pouco', () => {
    const r = sugerirParaGrupo(['Studio Eva Fit'], [], clientes)
    expect(r[0]).toMatchObject({ client_id: 'eva', evidencias: { nome_grupo: 'empresa', fonte: 'contrato', contrato_vigente: true } })
    expect(r[0].score).toBe(PONTOS.empresa + PONTOS.bonusVigente)
  })

  it('palavra genérica, nome de uma palavra só e cliente inativo não sugerem', () => {
    expect(sugerirParaGrupo(['Marketing Carla'], [], clientes)).toEqual([])
    expect(sugerirParaGrupo(['Diego Ramos'], [], clientes)).toEqual([])
    expect(sugerirParaGrupo(['Grupo da equipe'], [], clientes)).toEqual([])
    expect(sugerirParaGrupo([null, ''], [], clientes)).toEqual([])
  })

  it('palavra no meio de outra não conta (Ana ≠ Mariana)', () => {
    const idx = indexarClientes([cli({ id: 'x', nome: 'Ana Lima' })], [])
    expect(sugerirParaGrupo(['Mariana Limaverde'], [], idx)).toEqual([])
  })

  it('participante com o nome do cliente: sozinho 0,5; com o nome do grupo, soma', () => {
    const so = sugerirParaGrupo(['Projeto X'], ['Bruno Lima', 'Fulano'], clientes)
    expect(so).toEqual([{ client_id: 'bruno', score: PONTOS.soMembro, origem: 'nome_membro', evidencias: { membro_com_nome_do_cliente: 1 } }])
    const junto = sugerirParaGrupo(['Ana Paula Souza'], ['Ana Souza', 'ANA PAULA SOUZA'], clientes)
    expect(junto[0]).toMatchObject({ client_id: 'ana', origem: 'nome_grupo', evidencias: { membro_com_nome_do_cliente: 2 } })
    expect(junto[0].score).toBe(0.95) // 0,8 + 0,15
  })

  it('nunca chega a 1 e rejeitado não volta', () => {
    const r = sugerirParaGrupo(['Ana Paula Souza'], ['Ana Paula Souza'], indexarClientes([cli({ id: 'ana', nome: 'Ana Paula Souza' })], [contrato({ cliente_id: 'ana' })]))
    expect(r[0].score).toBeLessThanOrEqual(PONTOS.teto)
    expect(sugerirParaGrupo(['Ana Paula Souza'], [], clientes, new Set(['ana']))).toEqual([])
  })

  it('dois clientes parecidos: os dois, marcados como ambíguos, no máximo 3', () => {
    const idx = indexarClientes([
      cli({ id: 'a1', nome: 'João Silva' }), cli({ id: 'a2', nome: 'João Pedro Silva' }),
      cli({ id: 'a3', nome: 'Joao Carlos Silva' }), cli({ id: 'a4', nome: 'João Paulo Silva' }),
    ], [])
    const r = sugerirParaGrupo(['João Silva & João Pedro Silva & Joao Carlos Silva & João Paulo Silva'], [], idx)
    expect(r.length).toBe(MAX_SUGESTOES)
    expect(r.every((s) => s.evidencias.ambiguo === true)).toBe(true)
    // nome completo (0,8) vem antes de 1º + último (0,6)
    const r2 = sugerirParaGrupo(['João Silva'], [], indexarClientes([cli({ id: 'a1', nome: 'João Silva' }), cli({ id: 'a2', nome: 'João Pedro Silva' })], []))
    expect(r2.map((s) => s.client_id)).toEqual(['a1'])
  })
})

describe('sugerirParaPrivado', () => {
  const tel = indexarTelefones([
    cli({ id: 'um', telefone: '(11) 98765-4321' }),
    cli({ id: 'dois', whatsapp: '11 3333-4444' }),
    cli({ id: 'tres', telefone: '1133334444' }),
  ], [contrato({ cliente_id: 'um', whatsapp: '21 99999-0000' }), contrato({ cliente_id: 'fora-da-empresa', whatsapp: '31 98888-7777' })])

  it('telefone de um cliente só → confirmado (com ou sem o 9, cadastro ou contrato)', () => {
    expect(sugerirParaPrivado('5511987654321', tel)).toEqual([{ client_id: 'um', status: 'confirmado', score: 1, evidencias: { telefone: 'unico' } }])
    expect(sugerirParaPrivado('552199990000', tel)[0]).toMatchObject({ client_id: 'um', status: 'confirmado' })
  })

  it('mesmo telefone em 2 clientes → só sugestão; rejeitado sai da conta', () => {
    const r = sugerirParaPrivado('551133334444', tel)
    expect(r.map((s) => [s.client_id, s.status])).toEqual([['dois', 'sugerido'], ['tres', 'sugerido']])
    expect(sugerirParaPrivado('551133334444', tel, new Set(['tres']))[0]).toMatchObject({ client_id: 'dois', status: 'confirmado' })
  })

  it('contrato de cliente que não é da lista (outra empresa) não entra; sem cadastro → nada', () => {
    expect(sugerirParaPrivado('5531988887777', tel)).toEqual([])
    expect(sugerirParaPrivado('5548999990000', tel)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Tudo junto
// ---------------------------------------------------------------------------
const contato = (p: Partial<ContatoEntrada> & Pick<ContatoEntrada, 'id' | 'numero_whatsapp'>): ContatoEntrada => ({
  instance_id: 'i1', nome: null, client_id: null, restrito_admin: false, ...p,
})

function entrada(p: Partial<EntradaSugestoes>): EntradaSugestoes {
  return { contatos: [], vinculosExtra: [], canais: [], clientes: [], contratos: [], membros: [], ...p }
}

describe('calcularSugestoes', () => {
  const clientes = [cli({ id: 'ana', nome: 'Ana Paula Souza', telefone: '11 98765-4321' }), cli({ id: 'bia', nome: 'Beatriz Costa' })]

  it('vínculo do Chat sem registro vira confirmado: legado (todas as cópias) ou mesmo_jid (só uma)', () => {
    const r = calcularSugestoes(entrada({
      clientes,
      contatos: [
        contato({ id: 'g1', numero_whatsapp: GRUPO, client_id: 'ana', instance_id: 'i1' }),
        contato({ id: 'g2', numero_whatsapp: GRUPO, instance_id: 'i2' }),
        contato({ id: 'p1', numero_whatsapp: '5511912345678', instance_id: 'i1' }),
      ],
      vinculosExtra: [{ contact_id: 'p1', client_id: 'bia' }],
    }))
    expect(r.itens).toEqual([
      { tipo: 'grupo', chave: GRUPO, client_id: 'ana', status: 'confirmado', origem: 'mesmo_jid', score: 1, evidencias: { contatos: 1, instancias: 2 } },
      { tipo: 'privado', chave: '5511912345678', client_id: 'bia', status: 'confirmado', origem: 'legado', score: 1, evidencias: { contatos: 1, instancias: 1 } },
    ])
    expect(r.contagem).toMatchObject({ canais: 2, legado: 2, ja_vinculados: 2, pendentes: 0 })
  })

  it('canal interno, restrito ou "não é cliente" fica de fora (nem é analisado)', () => {
    const r = calcularSugestoes(entrada({
      clientes,
      contatos: [
        contato({ id: 'g1', numero_whatsapp: GRUPO, nome: 'Ana Paula Souza', restrito_admin: true }),
        contato({ id: 'p1', numero_whatsapp: '5511987654321' }),
      ],
      canais: [{ tipo: 'privado', chave: '5511987654321', client_id: null, status: 'nao_cliente' }],
    }))
    expect(r.itens).toEqual([])
    expect(r.chavesAnalisadas).toEqual([])
    expect(r.contagem.internos_ou_decididos).toBe(2)
  })

  it('canal já confirmado: sem sugestão, mas entra em chavesAnalisadas (limpa sugestão velha)', () => {
    const r = calcularSugestoes(entrada({
      clientes,
      contatos: [contato({ id: 'g1', numero_whatsapp: GRUPO, nome: 'Beatriz Costa' })],
      canais: [{ tipo: 'grupo', chave: GRUPO, client_id: 'ana', status: 'confirmado' }],
    }))
    expect(r.itens).toEqual([])
    expect(r.chavesAnalisadas).toEqual([`grupo:${GRUPO}`])
  })

  it('pendentes: grupo pelo nome (todas as instâncias) e privado pelo telefone', () => {
    const r = calcularSugestoes(entrada({
      clientes,
      contatos: [
        contato({ id: 'g1', numero_whatsapp: GRUPO, nome: null, instance_id: 'i1' }),
        contato({ id: 'g2', numero_whatsapp: `${GRUPO}@g.us`, nome: 'Beatriz Costa | Equipe', instance_id: 'i2' }),
        contato({ id: 'p1', numero_whatsapp: '551187654321' }),
        contato({ id: 'p2', numero_whatsapp: '5548999990000' }),
      ],
      membros: [{ contact_id: 'g1', nome: 'Beatriz Costa' }],
      canais: [{ tipo: 'grupo', chave: GRUPO, client_id: 'ana', status: 'rejeitado' }],
    }))
    expect(r.itens).toEqual([
      { tipo: 'grupo', chave: GRUPO, client_id: 'bia', status: 'sugerido', origem: 'nome_grupo', score: 0.95, evidencias: { nome_grupo: 'completo', fonte: 'cadastro', membro_com_nome_do_cliente: 1 } },
      { tipo: 'privado', chave: '5511987654321', client_id: 'ana', status: 'confirmado', origem: 'telefone', score: 1, evidencias: { telefone: 'unico' } },
    ])
    expect(r.contagem).toMatchObject({ canais: 3, pendentes: 3, telefone_unico: 1, grupos_com_sugestao: 1 })
    expect(r.chavesAnalisadas.sort()).toEqual([`grupo:${GRUPO}`, 'privado:5511987654321', 'privado:5548999990000'])
  })

  it('evidências nunca levam nome, telefone ou texto', () => {
    const r = calcularSugestoes(entrada({
      clientes,
      contatos: [contato({ id: 'g1', numero_whatsapp: GRUPO, nome: 'Ana Paula Souza' }), contato({ id: 'p1', numero_whatsapp: '5511987654321' })],
    }))
    const texto = JSON.stringify(r.itens.map((i) => i.evidencias))
    expect(texto).not.toMatch(/ana|souza|9876/i)
    for (const i of r.itens) {
      for (const v of Object.values(i.evidencias)) expect(['number', 'boolean', 'string']).toContain(typeof v)
    }
  })
})
