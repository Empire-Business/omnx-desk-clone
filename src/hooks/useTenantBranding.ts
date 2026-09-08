import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTenantByDomain, type DomainTenant } from './useTenantByDomain'
import { BRAND } from '@/config/brand'

interface UserTenant {
  id: string
  name: string
  slug: string
  logo_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  primary_color: string | null
}

/**
 * Branding em runtime: tenta o tenant do hostname primeiro
 * (`useTenantByDomain`); se não houver (localhost, preview, sem custom_domain),
 * cai pro tenant do user logado via `profiles`.
 *
 * Aplica em runtime: `--primary` (hex), favicon e título da aba.
 * Quando o campo é null, faz `removeProperty` pro design system padrão
 * voltar a controlar.
 */
export function useTenantBranding() {
  const { user } = useAuth()
  const { data: domainTenant } = useTenantByDomain()

  const { data: userTenant } = useQuery({
    queryKey: ['user-tenant', user?.id],
    queryFn: async (): Promise<UserTenant | null> => {
      if (!user) return null
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (profileErr || !profile?.tenant_id) return null
      const { data: tenant, error: tenantErr } = await supabase
        .from('tenants')
        .select('id, name, slug, logo_url, logo_dark_url, favicon_url, primary_color')
        .eq('id', profile.tenant_id)
        .maybeSingle()
      if (tenantErr) return null
      return tenant as UserTenant | null
    },
    enabled: Boolean(user) && !domainTenant,
    staleTime: 5 * 60 * 1000,
  })

  const tenant: DomainTenant | UserTenant | null = domainTenant ?? userTenant ?? null

  useEffect(() => {
    const root = document.documentElement

    if (tenant?.primary_color) {
      root.style.setProperty('--primary', tenant.primary_color)
    } else {
      root.style.removeProperty('--primary')
    }

    // O título da aba é controlado pelo TitleUpdater (App.tsx), no formato
    // "<rota> | OMNX Desk". Aqui só aplicamos favicon + cor da marca.
    const favEl = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (favEl) favEl.href = tenant?.favicon_url || BRAND.favicon
  }, [tenant?.primary_color, tenant?.name, tenant?.favicon_url])

  return { tenant, domainTenant: domainTenant ?? null, userTenant: userTenant ?? null }
}
