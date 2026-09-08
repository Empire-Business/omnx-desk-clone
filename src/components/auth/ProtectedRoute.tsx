import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import type { UserProfile } from '@/types/database'
import { useAuth } from '@/contexts/AuthContext'
import { useTenantByDomain } from '@/hooks/useTenantByDomain'
import { supabase } from '@/lib/supabase'

interface ProtectedRouteProps {
  allowedProfiles?: UserProfile[]
}

export function ProtectedRoute({ allowedProfiles }: ProtectedRouteProps) {
  const { user, loading, signOut } = useAuth()
  const { data: domainTenant } = useTenantByDomain()
  const [wrongTenant, setWrongTenant] = useState(false)

  // Trava de domínio: user só pode acessar pelo domínio do tenant dele.
  // Se houver custom_domain configurado e o profile do user pertence a
  // outro tenant, derruba a sessão e manda pro /login.
  useEffect(() => {
    if (!user || !domainTenant) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (data?.tenant_id && data.tenant_id !== domainTenant.id) {
        setWrongTenant(true)
        await signOut()
      }
    })()
    return () => { cancelled = true }
  }, [user, domainTenant, signOut])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    )
  }

  if (!user || wrongTenant) {
    return <Navigate to="/login" replace />
  }

  if (allowedProfiles && !allowedProfiles.includes(user.perfil)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background text-foreground">
        <h1 className="text-2xl font-bold">Acesso negado</h1>
        <p className="text-muted-foreground">
          Você não tem permissão para acessar esta página.
        </p>
      </div>
    )
  }

  return <Outlet />
}
