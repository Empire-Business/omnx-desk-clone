import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export type IdentidadeAjuda = {
  disponivel: boolean
  usuarioId: string | null
  tenantId: string | null
  sessao: number
}

/**
 * Confere se a pessoa pode usar a ajuda com a Íris: só equipe ativa, nunca
 * cliente (manual/portal/login não montam isto). A identidade é relida a cada
 * troca de sessão, para a conversa nunca vazar de uma conta para outra.
 */
export function useAjudaIrisDisponivel(): IdentidadeAjuda {
  const { user } = useAuth()
  const [sessao, setSessao] = useState(0)
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => setSessao(s => s + 1))
    return () => data.subscription.unsubscribe()
  }, [])
  const { data: perfil } = useQuery({
    queryKey: ['ajuda-identidade', user?.id, sessao],
    enabled: Boolean(user && user.perfil !== 'cliente'),
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('id, tenant_id, ativo, perfil').eq('id', user!.id).maybeSingle()
      if (error) throw error
      return data
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  const disponivel = Boolean(user && user.perfil !== 'cliente' && perfil?.ativo && perfil.perfil !== 'cliente' && perfil.tenant_id)
  return { disponivel, usuarioId: user?.id ?? null, tenantId: perfil?.tenant_id ?? null, sessao }
}
