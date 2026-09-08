import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface DomainTenant {
  id: string
  name: string
  slug: string
  logo_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  primary_color: string | null
}

function shouldSkipHostname(hostname: string): boolean {
  if (!hostname) return true
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  if (hostname.endsWith('.vercel.app')) return true
  return false
}

/**
 * Descobre o tenant atual pelo `window.location.hostname` via RPC
 * `get_tenant_by_domain` (SECURITY DEFINER, granted a anon).
 *
 * Usado pra aplicar branding ANTES do login. Em localhost / preview
 * Vercel a query é pulada — branding fallback do `brand.ts` segue ativo.
 */
export function useTenantByDomain() {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
  const skip = shouldSkipHostname(hostname)

  return useQuery({
    queryKey: ['tenant-by-domain', hostname],
    queryFn: async (): Promise<DomainTenant | null> => {
      const { data, error } = await supabase.rpc('get_tenant_by_domain' as never, {
        p_domain: hostname,
      } as never)
      if (error) throw error
      const row = Array.isArray(data) ? (data[0] as DomainTenant | undefined) : null
      return row ?? null
    },
    enabled: !skip,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
