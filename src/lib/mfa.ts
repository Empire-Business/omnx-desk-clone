// Verificação em duas etapas (TOTP do Supabase Auth). No app instalado, o
// superadmin (administração da empresa principal) só tem os poderes de
// superadmin com a sessão confirmada pelo segundo fator (aal2). Ver migração
// 20261109140000. Na produção da empresa nada é exigido.
import { supabase } from '@/lib/supabase'

export interface SituacaoMfa {
  superadmin: boolean
  exigida: boolean
  aal: string
  pendente: boolean
}

export const MFA_NADA_EXIGIDO: SituacaoMfa = { superadmin: false, exigida: false, aal: 'aal1', pendente: false }

export function normalizarSituacaoMfa(data: unknown): SituacaoMfa {
  if (!data || typeof data !== 'object') return MFA_NADA_EXIGIDO
  const d = data as Record<string, unknown>
  return {
    superadmin: d.superadmin === true,
    exigida: d.exigida === true,
    aal: typeof d.aal === 'string' ? d.aal : 'aal1',
    pendente: d.pendente === true,
  }
}

type RpcSemTipo = { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> }

/** Sem a migração (ou com erro) = nada exigido; a trava real é do banco. */
export async function buscarSituacaoMfa(): Promise<SituacaoMfa> {
  const { data, error } = await (supabase as unknown as RpcSemTipo).rpc('desk_mfa_situacao')
  return error ? MFA_NADA_EXIGIDO : normalizarSituacaoMfa(data)
}

/** Só dígitos, 6 caracteres: o código do aplicativo autenticador. */
export function codigoTotpValido(codigo: string): boolean {
  return /^\d{6}$/.test(codigo.trim())
}
