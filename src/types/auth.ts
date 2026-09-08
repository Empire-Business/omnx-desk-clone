import type { UserProfile } from './database'

export interface AuthUser {
  id: string
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
