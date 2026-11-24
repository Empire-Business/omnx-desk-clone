import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { VinculosTab } from '@/components/automacoes-wa/VinculosTab'

/**
 * "Grupos e clientes" (antes a aba "Vínculos" das Automações WhatsApp).
 *
 * Mora em Clientes porque responde "esta conversa/grupo é de qual cliente?".
 * As travas são as MESMAS de antes (R7): a rota fica dentro de
 * `RequireApp slug="automacoes-wa"`, a página exige `automacoes-wa.admin`, e o
 * próprio `VinculosTab` só mostra o conteúdo para admin/gerente (o banco
 * confere de novo com `vinculos_pode_gerir()`).
 *
 * Links já enviados no WhatsApp (`/automacoes-wa/vinculos?contato=&nome=`)
 * chegam aqui com a busca preservada — o filtro pelo grupo continua valendo.
 */
export function GruposClientesPage() {
  const { can, carregando } = usePermissoes()
  const { user } = useAuth()

  if (!carregando && !can('automacoes-wa', 'admin')) return <Navigate to="/" replace />

  return (
    <PageContainer>
      <PageHeader
        title="Grupos e clientes"
        description="Diga a qual cliente pertence cada grupo ou conversa de WhatsApp. É assim que a Íris sabe de quem é cada mensagem."
        action={
          <Link
            to="/clientes"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted md:min-h-9"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Clientes
          </Link>
        }
      />
      {carregando || !user ? <div className="h-32 animate-pulse rounded-lg bg-muted" aria-busy="true" /> : <VinculosTab />}
    </PageContainer>
  )
}
