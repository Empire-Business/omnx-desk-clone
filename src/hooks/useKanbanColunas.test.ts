import { describe, expect, it, vi } from 'vitest'
import { statusPrimarioDaChave } from './useKanbanColunas'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

describe('status primário enviado ao arrastar contratos no Kanban', () => {
  it.each(['PAUSADO', 'pausado', '  Pausado  '])('grava pausa ao mover para %s', chave => {
    expect(statusPrimarioDaChave(chave)).toBe('pausado')
  })

  it.each(['Não iniciado', 'NÃO INICIADO', 'NAO INICIADO', '  não   iniciado  '])('grava rascunho ao mover para %s', chave => {
    expect(statusPrimarioDaChave(chave)).toBe('rascunho')
  })

  it.each([
    ['CANCELADO', 'cancelado'],
    ['CONCLUÍDO', 'concluido'],
    ['Cancelamento solicitado', 'cancelado'],
    ['Concluído — histórico', 'concluido'],
    ['ATIVO', 'ativo'],
    ['INADIMPLENTE', 'ativo'],
  ])('preserva o mapeamento de %s para %s', (chave, esperado) => {
    expect(statusPrimarioDaChave(chave)).toBe(esperado)
  })

  it.each(['Aguardando retorno', 'Pausa para revisão', 'Contrato iniciado', ''])('preserva o estado ativo das demais colunas: %j', chave => {
    expect(statusPrimarioDaChave(chave)).toBe('ativo')
  })
})
