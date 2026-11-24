import { useCallback, useEffect, useReducer } from 'react'
import type { SetStateAction } from 'react'

interface DraftState {
  identity: string
  drafts: Record<string, string>
}

type DraftAction =
  | { type: 'identity'; identity: string }
  | { type: 'change'; identity: string; conversationId: string; value: SetStateAction<string> }

export function conversationDraftReducer(state: DraftState, action: DraftAction): DraftState {
  if (action.type === 'identity') {
    return action.identity === state.identity ? state : { identity: action.identity, drafts: {} }
  }
  // A request from a previous account may finish after logout.
  if (action.identity !== state.identity) return state
  const previous = state.drafts[action.conversationId] ?? ''
  const next = typeof action.value === 'function' ? action.value(previous) : action.value
  if (previous === next) return state
  const drafts = { ...state.drafts }
  if (next) drafts[action.conversationId] = next
  else delete drafts[action.conversationId]
  return { ...state, drafts }
}

/** Keeps unsent text in memory for each conversation, scoped to the signed-in account. */
export function useConversationDraft(identity: string, conversationId: string | null) {
  const [state, dispatch] = useReducer(conversationDraftReducer, { identity, drafts: {} })
  useEffect(() => { dispatch({ type: 'identity', identity }) }, [identity])
  const setValue = useCallback((value: SetStateAction<string>) => {
    if (conversationId) dispatch({ type: 'change', identity, conversationId, value })
  }, [identity, conversationId])
  const value = state.identity === identity && conversationId ? state.drafts[conversationId] ?? '' : ''
  return [value, setValue] as const
}
