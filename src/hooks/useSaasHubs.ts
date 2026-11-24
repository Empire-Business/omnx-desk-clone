import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { mapSaasHubs, SAAS_HUBS_ENDPOINT } from '@/lib/saasHubs'
import type { SaasHub } from '@/lib/saasHubs'

interface SaasHubsState {
  hubs: SaasHub[]
  loading: boolean
}

/**
 * Lê o catálogo central com o access token temporário da sessão local.
 * Falhas são fail-closed para os destinos extras: o Desk continua sendo o
 * único item exibido até que o backend confirme as demais plataformas.
 */
export function useSaasHubs(): SaasHubsState {
  const [state, setState] = useState<SaasHubsState>(() => ({
    hubs: mapSaasHubs(null),
    loading: Boolean(SAAS_HUBS_ENDPOINT),
  }))

  useEffect(() => {
    let mounted = true
    let requestId = 0
    let controller: AbortController | null = null

    async function load(session: Session | null) {
      const currentRequestId = ++requestId
      controller?.abort()
      controller = null

      // Central não configurada: nada sai daqui (nem o token de sessão).
      if (!session?.access_token || !SAAS_HUBS_ENDPOINT) {
        if (mounted && currentRequestId === requestId) setState({ hubs: mapSaasHubs(null), loading: false })
        return
      }

      controller = new AbortController()
      if (mounted) setState({ hubs: mapSaasHubs(null), loading: true })

      try {
        const response = await fetch(SAAS_HUBS_ENDPOINT, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          credentials: 'omit',
          cache: 'no-store',
          signal: controller.signal,
        })

        if (!response.ok) throw new Error(`list-saas-hubs returned ${response.status}`)

        const payload: unknown = await response.json()
        if (mounted && currentRequestId === requestId && !controller.signal.aborted) {
          setState({ hubs: mapSaasHubs(payload), loading: false })
        }
      } catch {
        if (mounted && currentRequestId === requestId && !controller.signal.aborted) {
          setState({ hubs: mapSaasHubs(null), loading: false })
        }
      }
    }

    void supabase.auth.getSession().then(({ data }) => load(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session)
    })

    return () => {
      mounted = false
      requestId += 1
      controller?.abort()
      subscription.unsubscribe()
    }
  }, [])

  return state
}
