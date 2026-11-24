import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { RegraAcesso } from '@/config/navegacao'
import { useAcessoNavegacao } from '@/hooks/useAcessoNavegacao'

/**
 * Trava de página (auditoria 01, R8): "esconder do menu não protege".
 *
 * Telas como /admin, /auditoria e /api-webhooks só tinham a RLS do banco por
 * trás; quem digitasse o endereço via a tela (vazia ou com erro). Agora a
 * própria rota confere a mesma regra do menu. O perfil `admin` continua
 * passando sempre (é o fail-safe do `can()`).
 *
 * Enquanto as permissões carregam, não decide — mostra um esqueleto discreto,
 * para não mandar embora quem tem acesso só porque a resposta ainda não chegou.
 */
export function ExigeAcesso({ regra, children }: { regra: RegraAcesso; children: ReactNode }) {
  const { pode, carregando } = useAcessoNavegacao()

  if (carregando) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <span className="sr-only">Carregando…</span>
        <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (!pode(regra)) return <Navigate to="/" replace />
  return <>{children}</>
}
