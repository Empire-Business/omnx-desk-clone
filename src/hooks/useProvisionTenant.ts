import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * True se o usuário logado é admin do tenant MESTRE — quem pode criar empresas.
 * Usa a RPC is_master_admin (guarda no banco); o front só decide o que mostrar.
 */
export function useIsMasterAdmin() {
  const [isMaster, setIsMaster] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('is_master_admin' as never)
        if (!alive) return
        setIsMaster(error ? false : Boolean(data))
      } catch {
        if (alive) setIsMaster(false)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return { isMaster, loading }
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
