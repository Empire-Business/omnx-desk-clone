export interface PasswordChangeStatus {
  state: 'ok' | 'password_change_required' | 'invalid_session'
  requirement_active: boolean
  session_id: string | null
}

export function parsePasswordChangeStatus(value: unknown): PasswordChangeStatus {
  if (!value || typeof value !== 'object') throw new Error('Não foi possível confirmar o acesso desta sessão.')
  const v = value as Record<string, unknown>
  if (!['ok', 'password_change_required', 'invalid_session'].includes(String(v.state))
    || typeof v.requirement_active !== 'boolean'
    || !(v.session_id === null || typeof v.session_id === 'string')) {
    throw new Error('Não foi possível confirmar o acesso desta sessão.')
  }
  if (v.state !== 'invalid_session' && !v.session_id) throw new Error('Sessão não confirmada.')
  return { state: v.state as PasswordChangeStatus['state'], requirement_active: v.requirement_active, session_id: v.session_id }
}

/** Apenas chave de invalidação local. A autorização vem exclusivamente da RPC. */
export function sessionIdFromToken(token: string): string | null {
  try {
    const payload: unknown = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (payload && typeof payload === 'object' && 'session_id' in payload && typeof payload.session_id === 'string') return payload.session_id
  } catch { /* Token ilegível não identifica uma sessão. */ }
  return null
}
