import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { GRUPOS_AJUSTES } from '@/config/navegacao'
import { useAcessoNavegacao } from '@/hooks/useAcessoNavegacao'
import { useIsMasterAdmin } from '@/hooks/useProvisionTenant'

/**
 * Hub "Ajustes" (auditoria 01, §3.3): tudo o que é configuração sai do
 * caminho do atendimento e fica aqui, em cartões agrupados.
 *
 * Cada cartão só aparece para quem tem a permissão — e a tela de destino
 * confere de novo por conta própria (R8). Um grupo sem nenhum cartão visível
 * não aparece.
 */
export function AjustesPage() {
  const { isMaster, mfaPendente } = useIsMasterAdmin()
  // Superadmin com a verificação em duas etapas pendente vê o cartão; a tela pede o código.
  const { pode, carregando } = useAcessoNavegacao({ master: isMaster || mfaPendente })

  const grupos = GRUPOS_AJUSTES
    .map((g) => ({ ...g, cartoes: g.cartoes.filter((c) => pode(c.acesso)) }))
    .filter((g) => g.cartoes.length > 0)

  return (
    <PageContainer>
      <PageHeader title="Ajustes" description="Sua conta, a equipe, o WhatsApp e as permissões. Você só vê o que pode mudar." />

      {carregando ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="sk h-20 rounded-lg" />
          ))}
        </div>
      ) : (
        grupos.map((grupo) => (
          <section key={grupo.id} aria-labelledby={`ajustes-${grupo.id}`} className="space-y-2">
            <div>
              <h2 id={`ajustes-${grupo.id}`} className="t-h4 text-foreground">{grupo.titulo}</h2>
              <p className="text-[13px] text-muted-foreground">{grupo.descricao}</p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {grupo.cartoes.map((c) => (
                <li key={c.id}>
                  <Link
                    to={c.rota}
                    className="focus-ds group flex min-h-16 items-center gap-3 rounded-lg border border-card-border bg-card p-3 transition-colors duration-fast hover:border-stroke-strong hover:bg-bg-1"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
                      <c.icone className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{c.rotulo}</span>
                      {c.descricao && <span className="block text-[13px] text-muted-foreground">{c.descricao}</span>}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </PageContainer>
  )
}
