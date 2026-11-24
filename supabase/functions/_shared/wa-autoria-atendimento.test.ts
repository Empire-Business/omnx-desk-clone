import { describe, expect, it } from 'vitest'
import { resolverAutor } from './wa-autoria.ts'
import { estadoAguardando } from './wa-recuperacao.ts'

const identidade = { user_id: 'atendente-temporario', telefone_norm: '5511987654321', lid: '123456789012345' }
const entrada = { ehGrupo: true, fromMe: false, numeroChat: '120363400000001', senderName: 'Pessoa da equipe', senderPn: '5511987654321@s.whatsapp.net' }
const aguardando = (tipo: string, origem: string) => estadoAguardando([
  { autor_tipo: tipo, autor_origem: origem, criado_em: '2026-11-06T12:01:00Z' },
  { autor_tipo: 'cliente', autor_origem: 'webhook', criado_em: '2026-11-06T12:00:00Z' },
])

describe('resposta de membro ativo da equipe fora da atribuição oficial', () => {
  it.each([
    entrada,
    { ...entrada, senderPn: undefined, senderLid: '123456789012345@lid' },
  ])('telefone ou LID confiável identifica atendimento e encerra espera sem alterar carteira', mensagem => {
    const autor = resolverAutor(mensagem, [identidade], null, true)
    expect(autor.tipo).toBe('equipe')
    expect(autor.user_id).toBe('atendente-temporario')
    expect(aguardando(autor.tipo, autor.origem)).toEqual({ aguardando: false })
  })
  it('mesmos dados num webhook sem autenticação não autorizam concluir atendimento', () => {
    const autor = resolverAutor(entrada, [identidade], null, false)
    expect(autor.tipo).not.toBe('equipe')
    expect(autor.user_id).toBeNull()
    expect(aguardando(autor.tipo, autor.origem)).toEqual({ aguardando: true })
  })
  it('nome igual à equipe sem telefone/LID correspondente não prova resposta interna', () => {
    const autor = resolverAutor({ ...entrada, senderPn: '5511911112222@s.whatsapp.net' }, [identidade], null, true)
    expect(autor.tipo).not.toBe('equipe')
    expect(aguardando(autor.tipo, autor.origem)).toEqual({ aguardando: true })
  })
})
