import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { MessageSquareText } from 'lucide-react'
import { useNpsResponses, useNpsSurvey, type NpsResponse } from '@/hooks/useNps'
import { useIsAppEnabled } from '@/hooks/useAppModules'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { TabelaResponsiva } from '@/components/ui/TabelaResponsiva'
import { BotaoCopiarLink, NotaNps, PlacarNpsCartoes } from '@/components/pesquisas/PartesPesquisas'
import { ROTULO_FAIXA, dataCurta, faixaNps, placarNps, situacaoCampanha } from '@/lib/pesquisasNps'

/**
 * Uma campanha de NPS (/relatorios/pesquisas/:id): o placar e as respostas
 * (`nps_responses`) com nota, comentário, cliente e data. Só leitura.
 */
export function PesquisaNpsPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { isAppEnabled } = useIsAppEnabled()
  const pesquisa = useNpsSurvey(id)
  const respostas = useNpsResponses(id)
  const lista = useMemo(() => respostas.data ?? [], [respostas.data])
  const placar = useMemo(() => placarNps(lista.map((r) => r.nota)), [lista])

  const carregando = pesquisa.isLoading || respostas.isLoading
  const cliente = pesquisa.data?.clients?.nome ?? 'Cliente removido'
  const situacao = situacaoCampanha(lista.length)

  if (!carregando && (pesquisa.isError || !pesquisa.data)) {
    return (
      <PageContainer>
        <PageHeader title="Campanha de NPS" backTo="/relatorios/pesquisas" />
        <EmptyState
          title="Não encontramos esta campanha"
          description="Ela pode ter sido removida, ou o link está incompleto. Volte para a lista de campanhas."
          action={<button type="button" className="btn btn-secondary" onClick={() => pesquisa.refetch()}>Tentar de novo</button>}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={carregando ? 'Campanha de NPS' : `NPS · ${cliente}`}
        backTo="/relatorios/pesquisas"
        breadcrumb={[{ label: 'Relatórios', href: '/relatorios' }, { label: 'Pesquisas NPS', href: '/relatorios/pesquisas' }, { label: carregando ? 'Campanha' : cliente }]}
        description={carregando ? undefined : (
          <>Criada em <b>{dataCurta(pesquisa.data?.criado_em)}</b> · {situacao === 'respondida' ? 'respondida' : 'aguardando resposta'}</>
        )}
        action={id ? <BotaoCopiarLink surveyId={id} portalLigado={isAppEnabled('portal')} /> : null}
      />

      {carregando && (
        <div className="space-y-3" aria-busy="true">
          <span className="sr-only">Carregando campanha…</span>
          <div className="h-24 animate-pulse rounded-[14px] bg-muted" />
          <div className="h-32 animate-pulse rounded-[14px] bg-muted" />
        </div>
      )}

      {!carregando && respostas.isError && (
        <EmptyState
          title="Não deu para carregar as respostas"
          description="Confira a conexão e tente de novo."
          action={<button type="button" className="btn btn-secondary" onClick={() => respostas.refetch()}>Tentar de novo</button>}
        />
      )}

      {!carregando && !respostas.isError && (
        <div className="space-y-5">
          <PlacarNpsCartoes placar={placar} />
          <TabelaResponsiva<NpsResponse>
            rotulo={`Respostas da campanha de ${cliente}`}
            linhas={lista}
            chave={(r) => r.id}
            colunas={[
              { id: 'cliente', titulo: 'Cliente', principal: true, celula: () => cliente },
              { id: 'nota', titulo: 'Nota', numerica: true, celula: (r) => <NotaNps nota={r.nota} /> },
              { id: 'faixa', titulo: 'Faixa', celula: (r) => <span className="text-muted-foreground">{ROTULO_FAIXA[faixaNps(r.nota)]}</span> },
              {
                id: 'comentario', titulo: 'Comentário',
                celula: (r) => r.comentario?.trim()
                  ? <span className="whitespace-pre-line break-words">{r.comentario}</span>
                  : <span className="text-muted-foreground">Sem comentário</span>,
              },
              { id: 'data', titulo: 'Data', numerica: true, celula: (r) => dataCurta(r.criado_em) },
            ]}
            vazio={
              <EmptyState
                icon={MessageSquareText}
                title="Ainda sem respostas"
                description="Quando o cliente responder pelo link da pesquisa, a nota e o comentário aparecem aqui."
              />
            }
          />
        </div>
      )}
    </PageContainer>
  )
}

export default PesquisaNpsPage
