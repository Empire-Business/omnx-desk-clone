import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { buscarSituacaoMfa, MFA_NADA_EXIGIDO } from '@/lib/mfa'

/**
 * True se o usuário logado é admin do tenant MESTRE — quem pode criar empresas.
 * Usa a RPC is_master_admin (guarda no banco); o front só decide o que mostrar.
 * `mfaPendente`: no app instalado, é superadmin mas a sessão ainda não passou
 * pela verificação em duas etapas (o banco só libera com aal2).
 */
export function useIsMasterAdmin() {
  const [isMaster, setIsMaster] = useState(false)
  const [mfaPendente, setMfaPendente] = useState(false)
  const [loading, setLoading] = useState(true)
  const [versao, setVersao] = useState(0)
  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [{ data, error }, mfa] = await Promise.all([
          supabase.rpc('is_master_admin' as never),
          buscarSituacaoMfa().catch(() => MFA_NADA_EXIGIDO),
        ])
        if (!alive) return
        setIsMaster(error ? false : Boolean(data))
        setMfaPendente(mfa.pendente)
      } catch {
        if (alive) setIsMaster(false)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [versao])

  return { isMaster, mfaPendente, loading, recarregar }
}

export interface ProvisionInput {
  empresa_nome: string
  admin_nome: string
  admin_email: string
  cor?: string
}

export interface ProvisionData {
  ok: true
  tenant_id: string
  slug: string
  app_url: string
  /** Link mágico de primeiro acesso do admin da empresa (expira em ~1h). */
  login_url: string | null
  expires_at?: string
  /** true quando a empresa já existia (mesmo external_id) e só reemitimos o link. */
  already_provisioned?: boolean
}

const ERROS_PT: Record<string, string> = {
  invalid_platform_key: 'Só um admin da empresa mestre pode criar novas empresas.',
  invalid_payload: 'Dados da empresa incompletos ou inválidos.',
  slug_taken: 'Já existe uma empresa com esse identificador.',
  email_ja_cadastrado: 'Esse e-mail já está cadastrado no sistema.',
  rate_limited: 'Muitas criações seguidas. Espere um minuto e tente de novo.',
  provision_failed: 'Não foi possível criar a empresa.',
}

/**
 * Provisiona uma empresa nova (tenant + 1º admin + seed) via edge function
 * provision-tenant. Só funciona pra admin do mestre (a função tem guarda própria).
 */
export function useProvisionTenant() {
  const [saving, setSaving] = useState(false)

  const provision = useCallback(
    async (input: ProvisionInput): Promise<{ ok: boolean; error?: string; data?: ProvisionData }> => {
      setSaving(true)
      try {
        const { data, error } = await supabase.functions.invoke('provision-tenant', { body: input })
        if (error) {
          let code = error.message
          const ctx = (error as { context?: Response }).context
          if (ctx) {
            const body = (await ctx.json().catch(() => null)) as { error?: string } | null
            if (body?.error) code = body.error
          }
          return { ok: false, error: ERROS_PT[code] ?? code }
        }
        return { ok: true, data: data as ProvisionData }
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  return { provision, saving }
}
