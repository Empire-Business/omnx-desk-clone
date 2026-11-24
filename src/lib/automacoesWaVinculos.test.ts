import { describe, expect, it } from 'vitest'
import {
  type CanalVinculo, forcaSugestao, frasesEvidencia, lerCanais, numerosComGruposOcultos, resumoCanais, rotuloOrigem,
  rotuloTipoCanal, situacaoCanal, textoInstancias, textoMensagens,
} from './automacoesWaVinculos'

const canal = (p: Partial<CanalVinculo> = {}): CanalVinculo => ({
  contato_id: 'ct1', tipo: 'grupo', nome: 'Grupo X', final_telefone: null, msgs_30d: 10, ultima_msg_em: null,
  instancias: 1, instancias_nomes: ['Comercial'], ocultar_grupos: false, instancias_ocultas: [], restrito: false,
  decisao: null, clientes: [], sugestoes: [], rejeitados: 0, ...p,
})

describe('lerCanais', () => {
  it('lê a linha da RPC e põe padrão no que vier estranho', () => {
    const [c] = lerCanais([{
      contato_id: 'a', tipo: 'privado', nome: 'Fulano', final_telefone: '5511987654321', msgs_30d: '7',
      instancias: 2, instancias_nomes: ['A', 3, 'B'], ocultar_grupos: true, instancias_ocultas: ['A'],
      restrito: false, decisao: 'qualquer', clientes: [{ id: 'c1', nome: 'Cli', origem: 'xpto', revisado: true }],
      sugestoes: [{ id: 'c2', nome: null, origem: 'nome_grupo', score: '0.8', evidencias: { nome_grupo: 'completo' } }],
      rejeitados: null,
    }])
    expect(c).toMatchObject({
      contato_id: 'a', tipo: 'privado', final_telefone: '4321', msgs_30d: 7, instancias_nomes: ['A', 'B'],
      decisao: null, rejeitados: 0,
      clientes: [{ id: 'c1', nome: 'Cli', origem: 'manual', revisado: true }],
      sugestoes: [{ id: 'c2', nome: 'Cliente sem nome', origem: 'nome_grupo', score: 0.8, evidencias: { nome_grupo: 'completo' } }],
    })
    expect(lerCanais(null)).toEqual([])
    expect(lerCanais([{ tipo: 'grupo' }])).toEqual([]) // sem contato_id não dá para decidir
  })
})

describe('textos da tela', () => {
  it('nunca mostra o telefone inteiro', () => {
    expect(rotuloTipoCanal({ tipo: 'privado', final_telefone: '987654321' })).toBe('Conversa privada · final 4321')
    expect(rotuloTipoCanal({ tipo: 'privado', final_telefone: null })).toBe('Conversa privada')
    expect(rotuloTipoCanal({ tipo: 'grupo', final_telefone: null })).toBe('Grupo')
  })

  it('mensagens e números em português simples', () => {
    expect(textoMensagens(0)).toBe('Nenhuma mensagem nos últimos 30 dias')
    expect(textoMensagens(1)).toBe('1 mensagem nos últimos 30 dias')
    expect(textoMensagens(1234)).toBe('1.234 mensagens nos últimos 30 dias')
    expect(textoInstancias({ instancias: 1, instancias_nomes: ['A'] })).toBe('')
    expect(textoInstancias({ instancias: 2, instancias_nomes: ['Comercial', 'Suporte'] })).toBe('em 2 números (Comercial e Suporte)')
    expect(textoInstancias({ instancias: 3, instancias_nomes: ['A', 'B', 'C'] })).toBe('em 3 números (A, B e C)')
  })

  it('explica a sugestão sem jargão', () => {
    expect(frasesEvidencia({ nome_grupo: 'completo', fonte: 'cadastro' })).toEqual(['O nome do grupo contém o nome do cliente'])
    expect(frasesEvidencia({ nome_grupo: 'empresa', fonte: 'contrato', contrato_vigente: true })).toEqual([
      'O nome do grupo contém o nome da empresa do cliente (como está no contrato)',
      'Cliente com contrato em andamento',
    ])
    expect(frasesEvidencia({ membro_com_nome_do_cliente: 2, ambiguo: true })).toEqual([
      '2 pessoas do grupo têm o mesmo nome do cliente',
      'Há mais de um cliente parecido: confira antes de aceitar',
    ])
    expect(frasesEvidencia({ telefone: 'ambiguo', ambiguo: true })).toEqual(['O telefone aparece no cadastro de mais de um cliente'])
    expect(frasesEvidencia({}, 'mesmo_jid')).toEqual(['O mesmo grupo já estava ligado a este cliente em outro número'])
    expect(frasesEvidencia({ pedido_chat: true }, 'manual')).toEqual(['Alguém da equipe ligou esta conversa a este cliente no Chat'])
    expect(frasesEvidencia({})).toEqual([])
  })

  it('origem do vínculo e força da sugestão', () => {
    expect(rotuloOrigem('telefone', false)).toBe('mesmo telefone do cadastro')
    expect(rotuloOrigem('nome_grupo', true)).toBe('sugestão aceita por uma pessoa')
    expect(rotuloOrigem('manual', true)).toBe('escolhido por uma pessoa')
    expect(forcaSugestao(0.85)).toBe('forte')
    expect(forcaSugestao(0.6)).toBe('media')
    expect(forcaSugestao(null)).toBe('fraca')
  })
})

describe('situação e resumo', () => {
  it('situação de cada canal', () => {
    expect(situacaoCanal(canal({ restrito: true, decisao: 'interno' }))).toBe('interno_sistema')
    expect(situacaoCanal(canal({ decisao: 'interno' }))).toBe('interno')
    expect(situacaoCanal(canal({ decisao: 'nao_cliente' }))).toBe('nao_cliente')
    expect(situacaoCanal(canal({ decisao: 'confirmado', clientes: [{ id: 'c', nome: 'C', origem: 'legado', revisado: false }] }))).toBe('cliente')
    expect(situacaoCanal(canal({ sugestoes: [{ id: 'c', nome: 'C', origem: 'nome_grupo', score: 0.8, evidencias: {} }] }))).toBe('sugestao')
    expect(situacaoCanal(canal())).toBe('pendente')
  })

  it('contagens do topo e números que escondem grupos', () => {
    const lista = [
      canal(),
      canal({ sugestoes: [{ id: 'c', nome: 'C', origem: 'nome_grupo', score: 0.8, evidencias: {} }], ocultar_grupos: true, instancias_ocultas: ['Suporte'] }),
      canal({ decisao: 'confirmado', clientes: [{ id: 'c', nome: 'C', origem: 'legado', revisado: false }], ocultar_grupos: true, instancias_ocultas: ['Comercial', 'Suporte'] }),
      canal({ tipo: 'privado', ocultar_grupos: false, instancias_ocultas: ['Ignorado'] }),
    ]
    expect(resumoCanais(lista)).toEqual({ total: 4, semDecisao: 3, comSugestao: 1, clientes: 1 })
    expect(numerosComGruposOcultos(lista)).toEqual(['Comercial', 'Suporte'])
  })
})
