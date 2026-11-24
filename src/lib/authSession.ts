import type { AuthUser } from '@/types/auth'
import type { PasswordChangeStatus } from './passwordChange'

export type SessionProfile = Omit<AuthUser, 'tenant_id'> & { ativo: boolean | null; tenant_id: string | null }
export interface VerifiedSession {
  user: AuthUser | null
  loading: boolean
  access?: PasswordChangeStatus | null
  identity?: { userId: string; sessionId: string } | null
  accessError?: boolean
}

/** Coordena identidade, cache e consultas concorrentes sem confiar em metadata. */
export function createSessionController(options: {
  loadProfile: (id: string) => Promise<SessionProfile | null>
  loadPasswordStatus?: () => Promise<PasswordChangeStatus>
  clearCache: () => void
  publish: (state: VerifiedSession) => void
}) {
  let generation = 0
  let actor: string | null | undefined
  let sessionId: string | null = null
  let access: PasswordChangeStatus | null = null
  let accessError = false
  let state: VerifiedSession = { user: null, loading: true }
  let verified: (SessionProfile & AuthUser) | null = null
  let disposed = false
  let pending: Promise<AuthUser | null> = Promise.resolve(null)

  function publish(loading: boolean) {
    state = { user: verified, loading, ...(options.loadPasswordStatus ? {
      access, accessError,
      identity: actor && sessionId && access?.session_id === sessionId ? { userId: actor, sessionId } : null,
    } : {}) }
    options.publish(state)
  }

  function transition(id: string | null, nextSessionId: string | null = null): Promise<AuthUser | null> {
    const revision = ++generation
    if (disposed) return Promise.resolve(null)
    if (actor !== id || sessionId !== nextSessionId || id === null) {
      actor = id
      sessionId = nextSessionId
      verified = null
      access = null
      accessError = false
      options.clearCache()
    }
    publish(Boolean(id) && !verified)
    if (!id) {
      pending = Promise.resolve(null)
      return pending
    }

    pending = (async () => {
      let profile: SessionProfile | null = null
      try {
        // Sai do callback síncrono do Supabase Auth antes de consultar a API.
        await new Promise<void>(resolve => setTimeout(resolve, 0))
        if (disposed || revision !== generation) return null
        if (options.loadPasswordStatus) {
          let checked: PasswordChangeStatus
          try { checked = await options.loadPasswordStatus() }
          catch {
            if (disposed || revision !== generation) return null
            access = null; accessError = true; verified = null
            options.clearCache(); publish(false)
            return null
          }
          if (disposed || revision !== generation) return null
          if (checked.state !== 'invalid_session' && (!nextSessionId || checked.session_id !== nextSessionId)) {
            access = null; accessError = true; verified = null
            options.clearCache(); publish(false)
            return null
          }
          access = checked
          accessError = false
          if (checked.state !== 'ok') {
            verified = null
            options.clearCache(); publish(false)
            return null
          }
        }
        profile = await options.loadProfile(id)
      } catch { /* Falha fechada: nenhum perfil é presumido. */ }
      if (disposed || revision !== generation) return null

      if (!profile || profile.id !== id || profile.ativo === false || !profile.tenant_id) {
        options.clearCache()
        verified = null
      } else {
        // Mudança de empresa/permissão também invalida dados já carregados.
        if (verified && (verified.tenant_id !== profile.tenant_id
          || verified.perfil !== profile.perfil
          || verified.acesso_contratos !== profile.acesso_contratos)) options.clearCache()
        verified = { ...profile, tenant_id: profile.tenant_id }
      }
      publish(false)
      return verified
    })()
    return pending
  }

  return {
    transition,
    confirm: (id: string, expectedSessionId: string | null = null) => actor === id && sessionId === expectedSessionId ? pending : transition(id, expectedSessionId),
    getState: () => state,
    isCurrent: (id: string, expectedSessionId: string) => !disposed && actor === id && sessionId === expectedSessionId,
    dispose: () => { disposed = true; generation++ },
  }
}
