import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useIsAppEnabled } from '@/hooks/useAppModules'

/**
 * Guard de modularização: bloqueia o acesso a rotas de um app que está
 * DESLIGADO nesta instalação (mesmo via URL direta).
 *
 * Fail-open: enquanto o estado carrega (ou em erro de leitura), o app é tratado
 * como ligado e o conteúdo renderiza normalmente — nada some por acidente.
 *
 * Uso como wrapper de elemento:
 *   <Route element={<RequireApp slug="chat"><ChatLayout /></RequireApp>} />
 * Uso como layout de um grupo de rotas (renderiza <Outlet/>):
 *   <Route element={<RequireApp slug="contratos" />}> ...rotas... </Route>
 */

// Rota "casa" de cada app, usada para redirecionar quando o app pedido está off.
// Endereços novos (navegação de 11/2026); os slugs do banco não mudam (R7).
const ROUTE_BY_SLUG: Record<string, string> = {
  dashboard: '/',
  atendimento: '/tickets',
  chat: '/conversas',
  contratos: '/contratos',
  cobranca: '/cobranca',
  'automacoes-wa': '/ia',
  portal: '/portal',
}

// Ordem de preferência ao escolher para onde mandar o usuário quando o app pedido
// está desligado. Só apps do núcleo interno entram aqui — o Portal é área do
// cliente final e não serve de destino para quem estava noutro app.
const FALLBACK_ORDER = ['dashboard', 'chat', 'contratos', 'cobranca']

interface RequireAppProps {
  slug: string
  children?: ReactNode
}

export function RequireApp({ slug, children }: RequireAppProps) {
  const { isAppEnabled } = useIsAppEnabled()

  if (isAppEnabled(slug)) {
    return <>{children ?? <Outlet />}</>
  }

  // App desligado: manda para o primeiro app LIGADO diferente deste (evita loop).
  const destinoSlug = FALLBACK_ORDER.find((s) => s !== slug && isAppEnabled(s))
  const destino = destinoSlug ? ROUTE_BY_SLUG[destinoSlug] : '/configuracoes'
  return <Navigate to={destino} replace />
}
