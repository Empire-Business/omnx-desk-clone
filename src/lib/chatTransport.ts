import type { SupabaseClient } from '@supabase/supabase-js'

export async function obterTokenChat(auth: Pick<SupabaseClient['auth'], 'getSession' | 'refreshSession'>, expectedActorId?: string): Promise<string> {
  const { data, error } = await auth.getSession()
  const session = data.session
  if (error || !session) throw new Error('Sessão expirada. Faça login novamente.')
  if (expectedActorId && session.user.id !== expectedActorId) throw new Error('Sua sessão mudou. Atualize a conversa antes de enviar.')
  if (session.access_token && (session.expires_at ?? 0) * 1000 > Date.now() + 60_000) return session.access_token

  const refreshed = await auth.refreshSession()
  const next = refreshed.data.session
  if (refreshed.error || !next?.access_token || next.user.id !== session.user.id
    || (next.expires_at ?? 0) * 1000 <= Date.now()) {
    throw new Error('Não foi possível renovar sua sessão. Entre novamente antes de enviar.')
  }
  return next.access_token
}

export interface ChatSendResult {
  ok: true
  persisted: boolean
  warning?: string
}

/** HTTP 200 sozinho não prova que o provedor aceitou a mensagem. */
export async function lerRespostaEnvio(response: Response): Promise<ChatSendResult> {
  const raw: unknown = await response.json().catch(() => null)
  const body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null
  if (!response.ok || body?.ok !== true) {
    const detail = typeof body?.error === 'string' ? body.error : null
    throw new Error(detail || `Não foi possível confirmar o envio (${response.status}). Confira o histórico antes de reenviar.`)
  }
  // O provedor já aceitou: falha ao persistir exige aviso, nunca reenvio automático.
  return {
    ok: true,
    persisted: body.persisted !== false,
    ...(typeof body.warning === 'string' ? { warning: body.warning } : {}),
  }
}
