import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Modularização — estado de "apps" ligáveis por instalação.
 *
 * Fonte de verdade: tabela `public.app_modules` (migration 20260723170000).
 * Multi-tenant: cada TENANT tem seus apps (RLS tenant_isolation filtra por
 * get_user_tenant_id()). O front nunca envia tenant_id — a RLS resolve sozinha.
 *
 * REGRA DE OURO — fail-open: se a leitura falhar ou o app não estiver na tabela,
 * ele é tratado como LIGADO. Um app só some quando um admin o desliga
 * explicitamente. Assim, nada desaparece por acidente (ex.: antes da migration
 * rodar, ou se houver erro de rede).
 *
 * Nota: `app_modules` ainda não está em src/integrations/supabase/types.ts.
 * Regenerar os tipos após aplicar a migration remove os casts `as any` abaixo.
 */

export interface AppModule {
  slug: string
  nome: string
  descricao: string | null
  icone: string | null
  categoria: string
  enabled: boolean
  ordem: number
}

const appModuleKeys = {
  all: ['app-modules'] as const,
}

/** Catálogo de apps desta instalação (ordenado). */
export function useAppModules() {
  return useQuery({
    queryKey: appModuleKeys.all,
    queryFn: async (): Promise<AppModule[]> => {
      const { data, error } = await (supabase as any)
        .from('app_modules')
        .select('slug, nome, descricao, icone, categoria, enabled, ordem')
        .order('ordem', { ascending: true })
      if (error) throw error
      return (data ?? []) as AppModule[]
    },
    // Se a tabela não existir ainda ou der erro, não repetir à toa; o fallback
    // fail-open (abaixo) garante que os apps continuam visíveis.
    retry: false,
    staleTime: 1000 * 60 * 5,
  })
}

/**
 * Hook utilitário: retorna uma função `isAppEnabled(slug)`.
 * Fail-open: enquanto carrega, em erro, ou se o slug não estiver cadastrado,
 * retorna true (app visível). Só retorna false quando existe uma linha com
 * enabled = false.
 */
export function useIsAppEnabled() {
  const { data, isError } = useAppModules()

  const disabled = new Set(
    (data ?? []).filter((m) => m.enabled === false).map((m) => m.slug),
  )

  // Em erro de leitura, não escondemos nada (fail-open total).
  const isAppEnabled = (slug: string | undefined): boolean => {
    if (!slug) return true
    if (isError) return true
    return !disabled.has(slug)
  }

  return { isAppEnabled, data: data ?? [] }
}

/** Liga/desliga um app (só admin — a RLS bloqueia os demais). */
export function useToggleAppModule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ slug, enabled }: { slug: string; enabled: boolean }) => {
      // Registra QUEM ligou/desligou (auditoria — E1.7). A RLS já garante que o
      // update só atinge a linha do próprio tenant.
      const { data: auth } = await supabase.auth.getUser()
      const { error } = await (supabase as any)
        .from('app_modules')
        .update({
          enabled,
          updated_at: new Date().toISOString(),
          updated_by: auth.user?.id ?? null,
        })
        .eq('slug', slug)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appModuleKeys.all })
    },
  })
}
