import { useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useIsAppEnabled } from '@/hooks/useAppModules'
import { usePermissoes } from '@/hooks/usePermissoes'
import { podeAcessar, type RegraAcesso } from '@/config/navegacao'

/**
 * Liga as regras de `config/navegacao.ts` às fontes reais (perfil, matriz de
 * permissões, apps ligados). Todo menu usa este mesmo filtro.
 *
 * `master`: a checagem de "empresa-mãe" é uma chamada ao banco
 * (`useIsMasterAdmin`); só quem mostra o cartão "Empresas" precisa dela e a
 * informa aqui. Sem ela, itens `somenteMaster` ficam escondidos.
 */
export function useAcessoNavegacao({ master = false }: { master?: boolean } = {}) {
  const { user } = useAuth()
  const { can, carregando } = usePermissoes()
  const { isAppEnabled } = useIsAppEnabled()
  const perfil = user?.perfil

  const pode = useCallback(
    (regra: RegraAcesso | undefined) =>
      podeAcessar(regra, { can, appLigado: isAppEnabled, perfil, master }),
    [can, isAppEnabled, perfil, master],
  )

  return { pode, carregando }
}
