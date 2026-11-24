import { describe, expect, it } from 'vitest'
import {
  type ContextoNomes, type IdentidadeEquipe, type PessoaEquipe,
  acharIdentidade, casarNomeEquipe, chaveAutor, chaveNome, ehDaEquipe, extrairRemetente, lidParaAprender,
  limparNomeAutor, precisaDeExternos, resolverAutor, rotuloAutor, semPrefixoAutor,
} from './wa-autoria.ts'

const EQUIPE: PessoaEquipe[] = [
  { user_id: 'u-ana', nome: 'Ana Paula Souza', ativo: true },
  { user_id: 'u-bruno', nome: 'Bruno Lima', ativo: true },
  { user_id: 'u-carla', nome: 'Carla', ativo: true },
  { user_id: 'u-davi', nome: 'Davi Rocha', ativo: true },
  { user_id: 'u-davi2', nome: 'Davi Martins', ativo: true },
  { user_id: 'u-eva', nome: 'Eva Nunes', ativo: false },
]

const ctx = (over: Partial<ContextoNomes> = {}): ContextoNomes => ({
  equipe: EQUIPE,
  externos: [],
  telefonesClientes: new Set<string>(),
  ...over,
})

/** chaveTelefone (DDD + 8) de um remetente qualquer, que não é de cliente. */
const TEL = '3177776666'

const IDS: IdentidadeEquipe[] = [
  { user_id: null, telefone_norm: '5511999992222', lid: '99887766554433' }, // número da empresa
  { user_id: 'u-bruno', telefone_norm: '5521988887777', lid: null }, // cadastro
]

describe('chaveNome (espelho de private.autoria_chave_nome)', () => {
  it('sem acento, minúsculas, só letras/números e espaços únicos', () => {
    expect(chaveNome('  Ána  PAULA-Souza 🚀 ')).toBe('ana paula souza')
    expect(chaveNome('João | Empresa')).toBe('joao empresa')
  })
  it('vazio/nulo', () => {
    expect(chaveNome(null)).toBe('')
    expect(chaveNome('🙂')).toBe('')
  })
})

describe('limparNomeAutor', () => {
  it('tira controles e invisíveis, corta em 80', () => {
    expect(limparNomeAutor('Ana​\nSouza')).toBe('Ana Souza')
    expect(limparNomeAutor('x'.repeat(200))?.length).toBe(80)
    expect(limparNomeAutor('   ')).toBeNull()
    expect(limparNomeAutor(42)).toBeNull()
  })
})

describe('casarNomeEquipe — forte (2+ palavras)', () => {
  it('nome completo igual', () => {
    expect(casarNomeEquipe('Bruno Lima', ctx(), TEL)).toEqual({ user_id: 'u-bruno', forca: 'forte' })
    expect(casarNomeEquipe('ANA PAULA SOUZA', ctx(), TEL)).toEqual({ user_id: 'u-ana', forca: 'forte' })
  })
  it('1º + último nome iguais', () => {
    expect(casarNomeEquipe('Ana Souza', ctx(), TEL)).toEqual({ user_id: 'u-ana', forca: 'forte' })
    expect(casarNomeEquipe('Bruno Costa Lima', ctx(), TEL)).toEqual({ user_id: 'u-bruno', forca: 'forte' })
  })
  it('sobrenome diferente não casa', () => {
    expect(casarNomeEquipe('Bruno Alves', ctx(), TEL)).toBeNull()
    expect(casarNomeEquipe('Ana Paula', ctx(), TEL)).toBeNull()
  })
  it('pessoa inativa não casa', () => {
    expect(casarNomeEquipe('Eva Nunes', ctx(), TEL)).toBeNull()
  })
  it('telefone de cliente nunca vira equipe por nome', () => {
    expect(casarNomeEquipe('Bruno Lima', ctx({ telefonesClientes: new Set(['2188887777']) }), '2188887777')).toBeNull()
  })
})

describe('casarNomeEquipe — fraco (só o primeiro nome)', () => {
  it('primeiro nome único na equipe e ausente em clientes/contatos ⇒ equipe', () => {
    expect(casarNomeEquipe('Bruno', ctx(), TEL)).toEqual({ user_id: 'u-bruno', forca: 'fraco' })
    expect(casarNomeEquipe('carla', ctx(), TEL)).toEqual({ user_id: 'u-carla', forca: 'fraco' })
  })
  it('primeiro nome repetido na equipe ⇒ não decide', () => {
    expect(casarNomeEquipe('Davi', ctx(), TEL)).toBeNull()
  })
  it('cliente com o mesmo primeiro nome ⇒ não casa', () => {
    expect(casarNomeEquipe('Bruno', ctx({ externos: [{ primeiro: 'bruno', chaveTel: null }] }), TEL)).toBeNull()
  })
  it('contato privado com outro telefone e mesmo primeiro nome ⇒ não casa', () => {
    const externos = [{ primeiro: 'bruno', chaveTel: '1199990000' }]
    expect(casarNomeEquipe('Bruno', ctx({ externos }), '2188887777')).toBeNull()
  })
  it('o próprio contato privado da pessoa (mesmo telefone) não bloqueia', () => {
    const externos = [{ primeiro: 'bruno', chaveTel: '2188887777' }]
    expect(casarNomeEquipe('Bruno', ctx({ externos }), '2188887777')).toEqual({ user_id: 'u-bruno', forca: 'fraco' })
  })
  it('sem a lista de externos carregada ⇒ não arrisca', () => {
    expect(casarNomeEquipe('Bruno', ctx({ externos: null }), TEL)).toBeNull()
  })
  it('primeiro nome de pessoa inativa único ⇒ não casa', () => {
    expect(casarNomeEquipe('Eva', ctx(), TEL)).toBeNull()
  })
})

describe('casarNomeEquipe — travas da auditoria (F4)', () => {
  it('sem telefone do remetente (só LID) não casa nem com nome completo', () => {
    expect(casarNomeEquipe('Bruno Lima', ctx(), null)).toBeNull()
  })
  it('sem a lista de telefones de cliente carregada não casa', () => {
    expect(casarNomeEquipe('Bruno Lima', ctx({ telefonesClientes: null }), TEL)).toBeNull()
  })
})

describe('precisaDeExternos', () => {
  it('só para uma palavra que é primeiro nome da equipe', () => {
    expect(precisaDeExternos('Bruno', EQUIPE)).toBe(true)
    expect(precisaDeExternos('Bruno Lima', EQUIPE)).toBe(true) // nome completo também precisa (trava de cliente)
    expect(precisaDeExternos('Bruno Alves', EQUIPE)).toBe(false)
    expect(precisaDeExternos('Zeca', EQUIPE)).toBe(false)
    expect(precisaDeExternos('', EQUIPE)).toBe(false)
  })
})

describe('extrairRemetente', () => {
  it('grupo: telefone do sender_pn (com 9º dígito) e LID', () => {
    const r = extrairRemetente({
      ehGrupo: true, fromMe: false, numeroChat: '120363000000000000',
      senderPn: '552188887777@s.whatsapp.net', senderLid: '123456789012:3@lid', senderName: 'Bruno',
    })
    expect(r).toEqual({ telefone: '5521988887777', lid: '123456789012', nome: 'Bruno' })
  })
  it('grupo sem sender_pn: só LID', () => {
    const r = extrairRemetente({ ehGrupo: true, fromMe: false, numeroChat: 'x', senderLid: '123456789012@lid' })
    expect(r.telefone).toBeNull()
    expect(chaveAutor(r)).toBe('lid:123456789012')
  })
  it('privado: o telefone é o do chat', () => {
    const r = extrairRemetente({ ehGrupo: false, fromMe: false, numeroChat: '5511987654321' })
    expect(r.telefone).toBe('5511987654321')
  })
  it('fromMe: telefone da instância (owner)', () => {
    const r = extrairRemetente({ ehGrupo: true, fromMe: true, numeroChat: 'x', owner: '551199992222', senderPn: '5599@s.whatsapp.net' })
    expect(r.telefone).toBe('5511999992222')
  })
  it('lixo no payload não quebra', () => {
    const r = extrairRemetente({ ehGrupo: true, fromMe: false, numeroChat: null, senderPn: 42, senderLid: {}, senderName: [] })
    expect(r).toEqual({ telefone: null, lid: null, nome: null })
  })
})

describe('acharIdentidade', () => {
  it('por telefone com ou sem o 9º dígito', () => {
    expect(acharIdentidade({ telefone: '5521988887777', lid: null }, IDS)).toEqual({ achou: true, user_id: 'u-bruno' })
    expect(acharIdentidade({ telefone: '552188887777', lid: null },
      [{ user_id: 'u-x', telefone_norm: '552188887777', lid: null }])).toEqual({ achou: false, user_id: null })
    expect(acharIdentidade({ telefone: '5521988887777', lid: null },
      [{ user_id: 'u-x', telefone_norm: '552188887777', lid: null }])).toEqual({ achou: true, user_id: 'u-x' })
  })
  it('por LID; número da empresa não tem pessoa', () => {
    expect(acharIdentidade({ telefone: null, lid: '99887766554433' }, IDS)).toEqual({ achou: true, user_id: null })
  })
})

describe('resolverAutor', () => {
  const base = { ehGrupo: true, fromMe: false, numeroChat: '120363000000000000' }
  it('fromMe ⇒ equipe (webhook)', () => {
    expect(resolverAutor({ ...base, fromMe: true }, IDS, null, true).tipo).toBe('equipe')
  })
  it('telefone da equipe no grupo ⇒ equipe com a pessoa', () => {
    const a = resolverAutor({ ...base, senderPn: '5521988887777@s.whatsapp.net', senderName: 'Bru' }, IDS, null, true)
    expect(a).toEqual({ tipo: 'equipe', user_id: 'u-bruno', chave: '5521988887777', nome: 'Bru', origem: 'webhook' })
  })
  it('outro número da empresa no mesmo grupo ⇒ equipe sem pessoa', () => {
    const a = resolverAutor({ ...base, senderPn: '551199992222@s.whatsapp.net' }, IDS, null, true)
    expect(a.tipo).toBe('equipe')
    expect(a.user_id).toBeNull()
  })
  it('nome da equipe sem telefone cadastrado ⇒ heuristica_nome', () => {
    const a = resolverAutor({ ...base, senderPn: '5531977776666@s.whatsapp.net', senderName: 'Ana Souza' }, IDS, ctx(), true)
    expect(a).toMatchObject({ tipo: 'equipe', user_id: 'u-ana', origem: 'heuristica_nome' })
  })
  it('sem contexto de nomes não há heurística', () => {
    expect(resolverAutor({ ...base, senderPn: '5531977776666@s.whatsapp.net', senderName: 'Ana Souza' }, IDS, null, true).tipo).toBe('cliente')
  })
  it('no privado o nome nunca decide', () => {
    expect(resolverAutor({ ehGrupo: false, fromMe: false, numeroChat: '5531977776666', senderName: 'Ana Souza' }, IDS, ctx(), true).tipo)
      .toBe('cliente')
  })
  it('telefone de cliente com nome igual ao da equipe ⇒ cliente', () => {
    const a = resolverAutor({ ...base, senderPn: '5531977776666@s.whatsapp.net', senderName: 'Ana Souza' }, IDS,
      ctx({ telefonesClientes: new Set(['3177776666']) }), true)
    expect(a.tipo).toBe('cliente')
  })
  it('cliente comum ⇒ cliente com chave e nome', () => {
    const a = resolverAutor({ ...base, senderPn: '5531977776666@s.whatsapp.net', senderName: 'Fulano' }, IDS, ctx(), true)
    expect(a).toEqual({ tipo: 'cliente', user_id: null, chave: '5531977776666', nome: 'Fulano', origem: 'webhook' })
  })
  it('sem token (não confiável): telefone e nome da equipe NÃO viram equipe (F3)', () => {
    const forjado = { ...base, senderPn: '5521988887777@s.whatsapp.net', senderName: 'Bruno Lima' }
    expect(resolverAutor(forjado, IDS, ctx(), false)).toMatchObject({ tipo: 'cliente', user_id: null, origem: 'webhook' })
    expect(resolverAutor(forjado, IDS).tipo).toBe('cliente') // padrão = não confiável
  })
  it('sem token, fromMe continua equipe', () => {
    expect(resolverAutor({ ...base, fromMe: true }, IDS, null, false).tipo).toBe('equipe')
  })
  it('só LID + nome completo da equipe ⇒ cliente (F4)', () => {
    const a = resolverAutor({ ...base, senderLid: '555566667777@lid', senderName: 'Bruno Lima' }, IDS, ctx(), true)
    expect(a).toMatchObject({ tipo: 'cliente', chave: 'lid:555566667777' })
  })
  it('grupo sem telefone, LID nem nome ⇒ desconhecido', () => {
    expect(resolverAutor(base, IDS, null, true).tipo).toBe('desconhecido')
  })
  it('privado de alguém da equipe (telefone cadastrado) ⇒ equipe', () => {
    expect(resolverAutor({ ehGrupo: false, fromMe: false, numeroChat: '552188887777' }, IDS, null, true).tipo).toBe('equipe')
  })
})

describe('lidParaAprender', () => {
  const base = { ehGrupo: true, fromMe: false, numeroChat: 'x' }
  it('telefone da equipe + LID novo ⇒ aprende', () => {
    expect(lidParaAprender({ ...base, senderPn: '5521988887777@s.whatsapp.net', senderLid: '111122223333@lid' }, IDS))
      .toEqual({ telefone_norm: '5521988887777', lid: '111122223333' })
  })
  it('LID já gravado ⇒ nada', () => {
    const ids = [{ user_id: 'u-bruno', telefone_norm: '5521988887777', lid: '111122223333' }]
    expect(lidParaAprender({ ...base, senderPn: '5521988887777@s.whatsapp.net', senderLid: '111122223333@lid' }, ids)).toBeNull()
  })
  it('LID que já é de outro telefone ⇒ não sobrescreve', () => {
    expect(lidParaAprender({ ...base, senderPn: '5521988887777@s.whatsapp.net', senderLid: '99887766554433@lid' }, IDS)).toBeNull()
  })
  it('telefone que não é da equipe, privado ou fromMe ⇒ nada', () => {
    expect(lidParaAprender({ ...base, senderPn: '5531977776666@s.whatsapp.net', senderLid: '111122223333@lid' }, IDS)).toBeNull()
    expect(lidParaAprender({ ...base, ehGrupo: false, senderPn: '5521988887777@s.whatsapp.net', senderLid: '1111222@lid' }, IDS)).toBeNull()
    expect(lidParaAprender({ ...base, fromMe: true, senderPn: '5521988887777@s.whatsapp.net', senderLid: '1111222@lid' }, IDS)).toBeNull()
  })
})

describe('leitura: ehDaEquipe / rotuloAutor / semPrefixoAutor', () => {
  it('autor_tipo manda; sem ele, flags antigas', () => {
    expect(ehDaEquipe({ autor_tipo: 'equipe', enviado_por_agente: false })).toBe(true)
    expect(ehDaEquipe({ autor_tipo: 'cliente', enviado_por_agente: true })).toBe(false)
    expect(ehDaEquipe({ autor_tipo: null, enviado_por_agente: true })).toBe(true)
    expect(ehDaEquipe({})).toBe(false)
  })
  it('rótulos', () => {
    expect(rotuloAutor({ autor_tipo: 'equipe', autor_nome: 'Ana Paula' })).toBe('Equipe (Ana)')
    expect(rotuloAutor({ autor_tipo: 'equipe', autor_nome: '<b>Ana</b>' })).toBe('Equipe (bAnab)')
    expect(rotuloAutor({ autor_tipo: 'equipe' })).toBe('Equipe')
    expect(rotuloAutor({ autor_tipo: 'ia' })).toBe('Equipe (assistente)')
    expect(rotuloAutor({ enviado_por_ia: true })).toBe('Equipe (assistente)')
    expect(rotuloAutor({ autor_tipo: 'cliente', autor_nome: 'Fulano' })).toBe('Cliente')
  })
  it('tira só o prefixo [Nome] do começo', () => {
    expect(semPrefixoAutor('[Ana] oi [x] tudo')).toBe('oi [x] tudo')
    expect(semPrefixoAutor('oi [Ana] tudo')).toBe('oi [Ana] tudo')
    expect(semPrefixoAutor(null)).toBe('')
  })
})
