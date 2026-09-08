import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface EmpireIntegracaoStatus {
  provider: string
  base_url: string | null
  rotation_version: number
  is_active: boolean
  connected: boolean
  updated_at: string | null
}

export interface TesteConexaoResultado {
  ok: boolean
  error?: string
  detail?: string
  source?: 'tenant' | 'legacy_env'
  base_url?: string
}

const PROVIDER = 'empire'

/**
 * Gerencia a integração omnx-desk → Empire (CRM) por tenant: status, salvar/rotacionar o
 * secret (nunca exposto de volta), testar conexão e revogar. Só admin consegue usar (as RPCs
 * têm guarda interna). O secret vive no Vault; o front só lê status e escreve.
 */
export function useEmpireIntegracao() {
  const [status, setStatus] = useState<EmpireIntegracaoStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      // RPCs novas ainda não estão nos tipos gerados do Supabase — mesmo padrão de useTenantByDomain.
      const { data, error } = await supabase.rpc('get_omnx_integracao_status' as never, { p_provider: PROVIDER } as never)
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      setStatus((row as EmpireIntegracaoStatus) ?? null)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  const salvar = useCallback(async (secret: string, baseUrl?: string): Promise<{ ok: boolean; error?: string }> => {
    setSaving(true)
    try {
      const { error } = await supabase.rpc('save_omnx_integracao_secret' as never, {
        p_provider: PROVIDER,
        p_secret: secret.trim(),
        p_base_url: baseUrl?.trim() || null,
        p_metadata: {},
      } as never)
      if (error) return { ok: false, error: error.message }
      await carregar()
      return { ok: true }
    } finally {
      setSaving(false)
    }
  }, [carregar])

  const testar = useCallback(async (): Promise<TesteConexaoResultado> => {
    setTesting(true)
    try {
      const { data, error } = await supabase.functions.invoke('empire-conexao-test', { body: {} })
      if (error) return { ok: false, error: error.message }
      return data as TesteConexaoResultado
    } finally {
      setTesting(false)
    }
  }, [])

  const revogar = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { error } = await supabase.rpc('revoke_omnx_integracao' as never, { p_provider: PROVIDER } as never)
      if (error) return { ok: false, error: error.message }
      await carregar()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }, [carregar])

  return { status, loading, saving, testing, carregar, salvar, testar, revogar }
}
