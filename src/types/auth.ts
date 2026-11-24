import type { UserProfile } from './database'

export interface AuthUser {
  id: string
  /** Empresa confirmada no cadastro, nunca obtida de user_metadata. */
  tenant_id: string
  email: string
  nome: string
  perfil: UserProfile
  foto_url: string | null
  acesso_contratos?: boolean
}

export interface AuthState {
  user: AuthUser | null
  loading: boolean
  initialized: boolean
}
