import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser } from '@/types/auth'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { createSessionController, type VerifiedSession } from '@/lib/authSession'
import { RECURSOS } from '@/config/recursos'
import { parsePasswordChangeStatus, sessionIdFromToken, type PasswordChangeStatus } from '@/lib/passwordChange'
import { cadastrarPrimeiraConta, type DadosPrimeiroAcesso } from '@/lib/primeiroAcesso'

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  passwordAccess: PasswordChangeStatus | null
  passwordAccessError: boolean
  sessionIdentity: { userId: string; sessionId: string } | null
  refreshAccess: (expected?: { userId: string; sessionId: string }) => Promise<VerifiedSession>
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithEmpire: (redirectTo?: string) => Promise<void>
  sendOtp: (email: string) => Promise<void>
  verifyOtp: (email: string, token: string) => Promise<void>
  /** Primeiro acesso do app instalado: 'entrou' (sessão aberta) ou 'confirmar-email'. */
  signUpPrimeiroAcesso: (dados: DadosPrimeiroAcesso) => Promise<'entrou' | 'confirmar-email'>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [passwordAccess, setPasswordAccess] = useState<PasswordChangeStatus | null>(null)
  const [passwordAccessError, setPasswordAccessError] = useState(false)
  const [sessionIdentity, setSessionIdentity] = useState<{ userId: string; sessionId: string } | null>(null)
  const queryClient = useQueryClient()
  const controller = useRef<ReturnType<typeof createSessionController> | null>(null)

  async function fetchUserProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, nome, email, perfil, foto_url, acesso_contratos, ativo, tenant_id')
        .eq('id', userId)
        .single()
      if (error || !data) return null
      return { ...data, perfil: data.perfil as AuthUser['perfil'] }
    } catch {
      return null
    }
  }

  useEffect(() => {
    const current = createSessionController({
      loadProfile: fetchUserProfile,
      loadPasswordStatus: async () => {
        const { data, error } = await supabase.rpc('desk_password_change_status')
        if (error) throw new Error('Não foi possível confirmar o acesso desta sessão.')
        return parsePasswordChangeStatus(data)
      },
      clearCache: () => queryClient.clear(),
      publish: state => {
        setUser(state.user); setLoading(state.loading)
        setPasswordAccess(state.access ?? null); setPasswordAccessError(state.accessError === true)
        setSessionIdentity(state.identity ?? null)
      },
    })
    controller.current = current
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void current.transition(session?.user.id ?? null, session ? sessionIdFromToken(session.access_token) : null).then(profile => {
          if (!profile) return
          // Somente após confirmar cadastro ativo. Não bloqueia a entrada.
          void supabase
            .from('users')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', profile.id)
            .then(() => {}, () => {})
        })
      }
    )

    return () => {
      current.dispose()
      controller.current = null
      subscription.unsubscribe()
    }
  }, [queryClient])

  async function confirmEntry(id: string, token: string) {
    const current = controller.current
    const sid = sessionIdFromToken(token)
    const profile = await current?.confirm(id, sid)
    const state = current?.getState()
    const pendingPassword = state?.access?.state === 'password_change_required'
      && state.identity?.userId === id && state.identity.sessionId === sid
    if (!profile && !pendingPassword) {
      throw new Error('Não foi possível confirmar seu acesso. Verifique se sua conta está ativa ou tente novamente.')
    }
  }

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    await confirmEntry(data.user.id, data.session.access_token)
  }

  async function sendOtp(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })
    if (error) throw error
  }

  async function verifyOtp(email: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })
    if (error) throw error
    if (data.user && data.session) await confirmEntry(data.user.id, data.session.access_token)
  }

  async function signUpPrimeiroAcesso(dados: DadosPrimeiroAcesso) {
    const { sessao } = await cadastrarPrimeiraConta(dados, window.location.origin)
    if (!sessao) return 'confirmar-email' as const
    await confirmEntry(sessao.userId, sessao.accessToken)
    return 'entrou' as const
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    if (error) throw error
  }

  async function signInWithEmpire(redirectTo = `${window.location.origin}/`) {
    // Provedor configurável (VITE_HTAI_LOGIN_PROVIDER); sem ele o botão nem aparece.
    if (!RECURSOS.loginHtaiProvider) throw new Error('Login pelo High Ticket AI não está configurado neste app.')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: RECURSOS.loginHtaiProvider as Parameters<typeof supabase.auth.signInWithOAuth>[0]['provider'],
      options: { redirectTo },
    })
    if (error) throw error
  }

  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }

  async function signOut() {
    // Fecha a interface e invalida consultas pendentes antes da chamada remota.
    void controller.current?.transition(null)
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  async function refreshAccess(expected?: { userId: string; sessionId: string }) {
    const { data: { session }, error } = await supabase.auth.getSession()
    const sid = session ? sessionIdFromToken(session.access_token) : null
    if (error || !session || !sid || (expected && (session.user.id !== expected.userId || sid !== expected.sessionId))) {
      throw new Error('Sua sessão mudou. Entre novamente para continuar.')
    }
    const current = controller.current
    if (!current) throw new Error('A sessão ainda está sendo carregada.')
    if (expected && !current.isCurrent(expected.userId, expected.sessionId)) {
      throw new Error('Sua sessão mudou. Entre novamente para continuar.')
    }
    await current.transition(session.user.id, sid)
    const state = current.getState()
    if (expected && (state.identity?.userId !== expected.userId || state.identity.sessionId !== expected.sessionId)) {
      throw new Error('Não foi possível confirmar o acesso desta sessão.')
    }
    return state
  }

  return (
    <AuthContext.Provider value={{ user, loading, passwordAccess, passwordAccessError, sessionIdentity, refreshAccess, signIn, signInWithGoogle, signInWithEmpire, sendOtp, verifyOtp, signUpPrimeiroAcesso, resetPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
