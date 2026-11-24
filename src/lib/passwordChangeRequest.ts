import { supabase } from '@/lib/supabase'
import { sessionIdFromToken } from './passwordChange'

export interface PasswordIdentity { userId: string; sessionId: string }
export type PasswordChangeBody = { password: string; current_password?: string; nonce?: string } | { completion_proof: string } | { reauthenticate: true }
export interface PasswordChangeResult {
  ok: boolean
  passwordUpdated: boolean
  proof?: string
  error?: string
  reauthenticationSent?: boolean
}
interface Snapshot { userId: string; sessionId: string | null; token: string }
interface Dependencies {
  session: () => Promise<Snapshot | null>
  verify: (token: string) => Promise<string | null>
  invoke: (body: PasswordChangeBody, headers: Record<string, string>) => Promise<unknown>
}

export function createPasswordChanger(deps: Dependencies) {
  return async (expected: PasswordIdentity, body: PasswordChangeBody): Promise<PasswordChangeResult> => {
    const matches = (s: Snapshot | null) => s?.userId === expected.userId && s.sessionId === expected.sessionId
    const session = await deps.session()
    if (!session || !matches(session) || await deps.verify(session.token) !== expected.userId
      || !matches(await deps.session())) throw new Error('Sua sessão mudou. Entre novamente antes de alterar a senha.')
    let value: unknown
    try {
      value = await deps.invoke(body, {
        Authorization: `Bearer ${session.token}`,
        'x-actor-id': expected.userId,
        'x-session-id': expected.sessionId,
      })
    } catch {
      return { ok: false, passwordUpdated: false, error: 'password_update_uncertain' }
    }
    if (!value || typeof value !== 'object') return { ok: false, passwordUpdated: false, error: 'password_update_uncertain' }
    const result = value as Record<string, unknown>
    return {
      ok: result.ok === true && result.state === 'ok',
      passwordUpdated: result.password_updated === true,
      ...(result.ok === true && result.reauthentication_sent === true ? { reauthenticationSent: true } : {}),
      ...(result.password_updated === true && typeof result.completion_proof === 'string' ? { proof: result.completion_proof } : {}),
      ...(typeof result.error === 'string' ? { error: result.error } : {}),
    }
  }
}

export const changeOwnPassword = createPasswordChanger({
  session: async () => {
    const { data: { session }, error } = await supabase.auth.getSession()
    return !error && session ? { userId: session.user.id, sessionId: sessionIdFromToken(session.access_token), token: session.access_token } : null
  },
  verify: async token => {
    const { data, error } = await supabase.auth.getUser(token)
    return error ? null : data.user?.id ?? null
  },
  invoke: async (body, headers) => {
    const { data, error } = await supabase.functions.invoke<unknown>('desk-change-password', { body, headers })
    if (!error) return data
    const response: unknown = (error as { context?: unknown }).context
    if (response instanceof Response) return response.clone().json()
    throw error
  },
})

export function passwordChangeMessage(code?: string): string {
  const messages: Record<string, string> = {
    same_password: 'Escolha uma senha diferente da anterior.',
    weak_password: 'A senha não atende aos requisitos de segurança. Escolha uma senha mais forte.',
    reauthentication_needed: 'Confirme sua identidade com um código antes de escolher a nova senha.',
    current_password_required: 'Informe sua senha atual e escolha novamente a nova senha.',
    current_password_mismatch: 'A senha atual não foi aceita. Confira e preencha novamente os campos.',
    reauthentication_failed: 'Não foi possível enviar o código de confirmação. Tente novamente em instantes.',
    reauthentication_uncertain: 'Não foi possível confirmar o envio do código. Confira seu e-mail antes de solicitar outro.',
    sessao_invalida: 'Sua sessão mudou ou expirou. Entre novamente para continuar.',
    confirmation_expired: 'A confirmação expirou. Confira o acesso; se a troca ainda for exigida, escolha uma nova senha.',
    confirmation_invalid: 'Não foi possível validar a confirmação. Confira o acesso antes de tentar novamente.',
    completion_pending: 'A senha foi alterada. Falta confirmar a liberação do acesso.',
    requirement_unavailable: 'Não foi possível conferir a exigência de troca. Tente novamente em instantes.',
    requirement_changed: 'A senha foi alterada, mas há uma nova verificação pendente. Confira o acesso antes de continuar.',
    password_update_failed: 'Não foi possível alterar a senha. Tente novamente quando a conexão estiver disponível.',
    password_update_uncertain: 'Não foi possível confirmar a alteração. Confira o acesso antes de escolher uma nova senha.',
  }
  return code && Object.hasOwn(messages, code) ? messages[code] : 'Não foi possível concluir a troca. Confira o acesso antes de tentar novamente.'
}
