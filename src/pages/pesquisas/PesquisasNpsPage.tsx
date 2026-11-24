import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Star } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCampanhasNps, type CampanhaNps } from '@/hooks/useNps'
import { useIsAppEnabled } from '@/hooks/useAppModules'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { SeloStatus } from '@/components/ui/StatusBadge'
import { TabelaResponsiva } from '@/components/ui/TabelaResponsiva'
import { NovaCampanhaModal } from '@/components/pesquisas/NovaCampanhaModal'
import { BotaoCopiarLink, NotaNps, PlacarNpsCartoes } from '@/components/pesquisas/PartesPesquisas'
import { dataCurta, maisRecente, placarNps, podeCriarCampanha, situacaoCampanha } from '@/lib/pesquisasNps'

/**
 * Pesquisas NPS da equipe (/relatorios/pesquisas): campanhas (`nps_surveys`)
 * com o placar de todas as respostas, Criar campanha para admin e o link do
 * portal (/portal/nps/:surveyId) para copiar. Não envia nada pelo WhatsApp.
 * O relatório NPS de /relatorios continua como está.
 */
export function PesquisasNpsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { isAppEnabled } = useIsAppEnabled()
  const admin = podeCriarCampanha(user?.perfil)
  const portalLigado = isAppEnabled('portal')
  const { data: campanhas = [], isLoading, isError, refetch } = useCampanhasNps()
  const [criando, setCriando] = useState(false)

  const placar = useMemo(
    () => placarNps(campanhas.flatMap((c) => (c.nps_responses ?? []).map((r) => r.nota))),
    [campanhas],
  )
  const aguardando = campanhas.filter((c) => situacaoCampanha(c.nps_responses?.length ?? 0) === 'aguardando').length

  const botaoCriar = admin ? (
    <button type="button" className="btn btn-primary" onClick={() => setCriando(true)}>
      <Plus aria-hidden />Criar campanha
    </button>
  ) : null

  return (
    <PageContainer>
      <PageHeader
        title="Pesquisas NPS"
        count={isLoading ? undefined : campanhas.length}
        breadcrumb={[{ label: 'Relatórios', href: '/relatorios' }, { label: 'Pesquisas NPS' }]}
        description={
          isLoading || !campanhas.length
            ? 'Campanhas de satisfação dos clientes, com as respostas e o placar NPS.'
            : <><b>{campanhas.length === 1 ? '1 campanha' : `${campanhas.length} campanhas`}</b> · <b>{aguardando}</b> aguardando resposta</>
        }
        action={botaoCriar}
      />

      {!portalLigado && (
        <p className="mb-4 rounded-md bg-warning-light px-3 py-2 text-[13px] text-warning" role="note">
          O portal do cliente está desligado nesta instalação. Dá para criar campanhas e ver as respostas, mas o
          link da pesquisa só abre para o cliente quando o portal for ligado.
        </p>
      )}

      {isLoading && (
        <div className="space-y-3" aria-busy="true">
          <span className="sr-only">Carregando campanhas…</span>
          <div className="h-24 animate-pulse rounded-[14px] bg-muted" />
          <div className="h-48 animate-pulse rounded-[14px] bg-muted" />
        </div>
      )}

      {isError && (
        <EmptyState
          title="Não deu para carregar as campanhas"
          description="Confira a conexão e tente de novo."
          action={<button type="button" className="btn btn-secondary" onClick={() => refetch()}>Tentar de novo</button>}
        />
      )}

      {!isLoading && !isError && (
        <div className="space-y-5">
          <PlacarNpsCartoes placar={placar} />
          <TabelaResponsiva<CampanhaNps>
            rotulo="Campanhas de NPS"
            linhas={campanhas}
            chave={(c) => c.id}
            aoClicarLinha={(c) => navigate(`/relatorios/pesquisas/${c.id}`)}
            colunas={[
              {
                id: 'cliente', titulo: 'Cliente', principal: true,
                celula: (c) => (
                  <Link to={`/relatorios/pesquisas/${c.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                    {c.clients?.nome ?? 'Cliente removido'}
                  </Link>
                ),
              },
              { id: 'criada', titulo: 'Criada em', numerica: true, celula: (c) => dataCurta(c.criado_em) },
              {
                id: 'situacao', titulo: 'Situação',
                celula: (c) => situacaoCampanha(c.nps_responses?.length ?? 0) === 'respondida'
                  ? <SeloStatus tom="resolvido" size="sm">Respondida</SeloStatus>
                  : <SeloStatus tom="aguardando" size="sm">Aguardando</SeloStatus>,
              },
              {
                id: 'nota', titulo: 'Nota', numerica: true,
                celula: (c) => {
                  const ultima = maisRecente(c.nps_responses ?? [])
                  return ultima ? <NotaNps nota={ultima.nota} /> : <span className="text-muted-foreground">—</span>
                },
              },
            ]}
            acoes={(c) => <BotaoCopiarLink surveyId={c.id} portalLigado={portalLigado} compacto />}
            vazio={
              <EmptyState
                icon={Star}
                title="Nenhuma campanha de NPS ainda"
                description={admin
                  ? 'Crie a primeira campanha escolhendo o cliente que vai responder.'
                  : 'Quando a administração criar uma campanha, ela aparece aqui.'}
                action={botaoCriar}
              />
            }
          />
        </div>
      )}

      {admin && (
        <NovaCampanhaModal
          open={criando}
          onClose={() => setCriando(false)}
          onCriada={(id) => navigate(`/relatorios/pesquisas/${id}`)}
        />
      )}
    </PageContainer>
  )
}

export default PesquisasNpsPage
