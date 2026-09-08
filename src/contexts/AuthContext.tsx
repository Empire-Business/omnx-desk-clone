import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser } from '@/types/auth'
import { supabase } from '@/lib/supabase'

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  sendOtp: (email: string) => Promise<void>
  verifyOtp: (email: string, token: string) => Promise<void>
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
  const initialized = useRef(false)

  async function fetchUserProfile(userId: string): Promise<AuthUser | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, nome, email, perfil, foto_url, acesso_contratos')
        .eq('id', userId)
        .single()
      if (error || !data) return null
      return data as AuthUser
    } catch {
      return null
    }
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          const meta = session.user.user_metadata
          // Seta imediatamente com dados do JWT (sem aguardar banco)
          setUser({
            id: session.user.id,
            email: session.user.email ?? '',
            nome: (meta?.nome as string) ?? session.user.email ?? '',
            perfil: (meta?.perfil as AuthUser['perfil']) ?? 'cliente',
            foto_url: (meta?.foto_url as string) ?? null,
          })
          // Atualiza em background com dados do banco
          fetchUserProfile(session.user.id).then((profile) => {
            if (profile) setUser(profile)
          })
          // Registra última atividade (best-effort, sem bloquear UI)
          supabase
            .from('users')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', session.user.id)
            .then(() => {})
        } else {
          setUser(null)
        }

        if (!initialized.current) {
          initialized.current = true
          setLoading(false)
        }
      }
    )

    return () => { subscription.unsubscribe() }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function sendOtp(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })
    if (error) throw error
  }

  async function verifyOtp(email: string, token: string) {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })
    if (error) throw error
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
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
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signInWithGoogle, sendOtp, verifyOtp, resetPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
