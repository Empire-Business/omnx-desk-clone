import { describe, expect, it } from 'vitest'
import { formatoAposentado, tiposSelecionaveisAtendimento } from './formatosAtendimento'

describe('formatos aposentados nas novas escolhas de atendimento', () => {
  it.each([
    'Reels', ' reel ', 'CARROSSEL', 'Carrosséis', 'carousel', 'Story', 'stories',
    'Post', 'Posts', 'Post único', 'Post Feed', 'post_feed', 'Feed', 'Campanha', 'campanhas',
  ])(
    'reconhece o nome completo %s',
    (nome) => expect(formatoAposentado(nome)).toBe(true),
  )

  it.each([
    'Reunião', 'Outro', 'Vídeo', 'Stories High Ticket', 'Workshop carrosséis milionários',
    'Campanha de disparo de WhatsApp', 'Post-venda', 'Postagem agendada', 'Feedback',
  ])(
    'preserva outros tipos e títulos históricos: %s',
    (nome) => expect(formatoAposentado(nome)).toBe(false),
  )

  const tipos = [
    { id: 'legado', nome: 'Reels', ativo: true },
    { id: 'inativo', nome: 'Story', ativo: false },
    { id: 'atual', nome: 'Solicitação', ativo: true },
    { id: 'post', nome: 'Post único', ativo: true },
    { id: 'campanha', nome: 'Campanha', ativo: true },
    { id: 'outro-inativo', nome: 'Retorno', ativo: false },
  ]

  it('oferece somente tipos ativos permitidos ao criar, sem mudar a origem', () => {
    const selecionaveis = tiposSelecionaveisAtendimento(tipos)
    expect(selecionaveis.map((tipo) => tipo.id)).toEqual(['atual'])
    expect(tipos.map((tipo) => tipo.id)).toEqual(['legado', 'inativo', 'atual', 'post', 'campanha', 'outro-inativo'])
  })

  it.each(['legado', 'inativo', 'post', 'outro-inativo'])(
    'mantém o tipo atual %s na edição sem oferecer os demais aposentados',
    (id) => {
      const selecionaveis = tiposSelecionaveisAtendimento(tipos, id)
      expect(selecionaveis.find((tipo) => tipo.id === id)).toBe(tipos.find((tipo) => tipo.id === id))
      expect(selecionaveis.map((tipo) => tipo.id)).toEqual(tipos.filter((tipo) => tipo.id === id || tipo.id === 'atual').map((tipo) => tipo.id))
    },
  )
})
