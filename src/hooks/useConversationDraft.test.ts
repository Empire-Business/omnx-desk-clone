import { describe, expect, it } from 'vitest'
import { conversationDraftReducer as reduce } from './useConversationDraft'

describe('rascunhos de conversas', () => {
  const start = () => ({ identity: 'tenant:user-a', drafts: {} as Record<string, string> })
  it('mantém A e B separados e conserva texto ao voltar', () => {
    let state = reduce(start(), { type: 'change', identity: 'tenant:user-a', conversationId: 'A', value: 'Só para A' })
    state = reduce(state, { type: 'change', identity: 'tenant:user-a', conversationId: 'B', value: 'Só para B' })
    expect(state.drafts).toEqual({ A: 'Só para A', B: 'Só para B' })
  })
  it('confirmação atrasada de A não limpa B nem texto novo de A', () => {
    let state = reduce(start(), { type: 'change', identity: 'tenant:user-a', conversationId: 'A', value: 'Enviada' })
    state = reduce(state, { type: 'change', identity: 'tenant:user-a', conversationId: 'A', value: 'Nova mensagem' })
    state = reduce(state, { type: 'change', identity: 'tenant:user-a', conversationId: 'B', value: 'Mensagem de B' })
    state = reduce(state, { type: 'change', identity: 'tenant:user-a', conversationId: 'A', value: current => current === 'Enviada' ? '' : current })
    expect(state.drafts).toEqual({ A: 'Nova mensagem', B: 'Mensagem de B' })
  })
  it('apaga somente a mensagem confirmada na conversa original', () => {
    let state = reduce(start(), { type: 'change', identity: 'tenant:user-a', conversationId: 'A', value: 'Enviada' })
    state = reduce(state, { type: 'change', identity: 'tenant:user-a', conversationId: 'B', value: 'Pendente' })
    state = reduce(state, { type: 'change', identity: 'tenant:user-a', conversationId: 'A', value: current => current === 'Enviada' ? '' : current })
    expect(state.drafts).toEqual({ B: 'Pendente' })
  })
  it.each(['tenant:user-b', 'other-tenant:user-a', ''])('limpa dados na troca para %s e ignora respostas da identidade antiga', identity => {
    let state = reduce(start(), { type: 'change', identity: 'tenant:user-a', conversationId: 'A', value: 'Privada' })
    state = reduce(state, { type: 'identity', identity })
    state = reduce(state, { type: 'change', identity: 'tenant:user-a', conversationId: 'B', value: 'Resposta velha' })
    expect(state).toEqual({ identity, drafts: {} })
  })
})
