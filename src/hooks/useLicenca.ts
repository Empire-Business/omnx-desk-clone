import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { buscarSituacaoLicenca, LICENCA_DESLIGADA, type SituacaoLicenca } from '@/lib/licenca'

/** Situação da licença HTAI (só com alguém logado). Falha de leitura = desligada: a trava real é do servidor. */
export function useLicenca(): SituacaoLicenca {
  const { user } = useAuth()
  const { data } = useQuery({
    queryKey: ['htai-licenca', user?.id ?? null],
    enabled: Boolean(user),
    queryFn: buscarSituacaoLicenca,
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
  return user ? data ?? LICENCA_DESLIGADA : LICENCA_DESLIGADA
}
