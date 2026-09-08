import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, Clock,
  Headphones, Loader2, MessageSquareWarning, Plus,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { AtendimentoTabs } from '@/components/atendimento/AtendimentoTabs'
import { DemandaForm } from '@/components/atendimento/DemandaForm'
import { useMetricasAtendimento, useSegmentoAtendimento, type Demanda } from '@/hooks/useAtendimento'
import { usePermissoes } from '@/hooks/usePermissoes'
import { classeEtapa, CLASSE_PRAZO, situacaoPrazo, textoPrazo } from '@/lib/atendimento'
import { ROTULO_METRICA, type ChaveMetrica } from '@/lib/atendimentoSegmentos'
import { cn } from '@/lib/utils'

/** Ícone e destaque de cada métrica. O segmento escolhe quais aparecem. */
const VISUAL_METRICA: Record<ChaveMetrica, { icone: typeof AlertTriangle; alerta?: boolean }> = {
  atrasadas: { icone: AlertTriangle, alerta: true },
  venceHoje: { icone: Clock },
  venceEstaSemana: { icone: CalendarClock },
  abertas: { icone: CalendarDays },
  aguardandoAprovacao: { icone: CalendarClock },
  comAjustes: { icone: MessageSquareWarning, alerta: true },
  concluidasNoMes: { icone: CheckCircle2 },
}

/**
 * Painel operacional — responde "o que precisa da minha atenção agora?".
 *
 * Por isso o topo não é "total de demandas" (número que não gera ação), e sim
 * atrasadas, vencendo e travadas esperando o cliente.
 */
export function AtendimentoPainelPage() {
  const { metricas, demandas, isLoading, isError } = useMetricasAtendimento()
  const { segmento } = useSegmentoAtendimento()
  const { can } = usePermissoes()
  const [novaAberta, setNovaAberta] = useState(false)

  const podeEditar = can('atendimento', 'editar')

  const atencao = demandas
    .filter((d) => !d.concluida_em)
    .filter((d) => ['atrasada', 'hoje'].includes(situacaoPrazo(d)) || d.aprovacao === 'ajustes')
    .slice(0, 8)

  return (
    <div className="space-y-6">
      <PageHeader
        title={segmento.rotuloApp}
        description={`O que precisa da sua atenção agora: ${segmento.rotuloItens} atrasadas, vencendo e em andamento.`}
        action={
          podeEditar && (
            <button
              onClick={() => setNovaAberta(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {segmento.acaoNovo}
            </button>
          )
        }
      />

      <AtendimentoTabs />

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando demandas…
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Não foi possível carregar as demandas. Se isso persistir, use o botão
          "Reportar problema" — ele já envia o contexto técnico junto.
        </div>
      )}

      {!isLoading && !isError && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {segmento.metricas.map((chave) => {
              const visual = VISUAL_METRICA[chave]
              const valor = metricas[chave]
              return (
                <Indicador
                  key={chave}
                  titulo={ROTULO_METRICA[chave]}
                  valor={valor}
                  icone={visual.icone}
                  // Só destaca quando há o que destacar: um "0 atrasadas" em
                  // vermelho treina a pessoa a ignorar a cor.
                  destaque={
                    visual.alerta && valor > 0
                      ? chave === 'atrasadas' ? 'alerta' : 'atencao'
                      : undefined
                  }
                />
              )
            })}
          </div>

          {demandas.length === 0 ? (
            <EmptyState
              icon={Headphones}
              title={`Nenhuma ${segmento.rotuloItem} registrada ainda`}
              description={segmento.textoVazio}
              action={
                podeEditar && (
                  <button
                    onClick={() => setNovaAberta(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="h-4 w-4" /> {segmento.acaoNovo}
                  </button>
                )
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <section className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
                <h2 className="font-display text-base font-semibold text-foreground">
                  Precisa de atenção
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Demandas atrasadas, vencendo hoje ou com ajuste pedido pelo cliente.
                </p>

                {atencao.length === 0 ? (
                  <p className="mt-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                    Nada atrasado nem vencendo hoje. Bom trabalho.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-border">
                    {atencao.map((d) => (
                      <LinhaDemanda key={d.id} demanda={d} />
                    ))}
                  </ul>
                )}
              </section>

              <div className="space-y-4">
                <Distribuicao
                  titulo="Por etapa"
                  vazio="Nenhuma demanda em aberto."
                  itens={metricas.porEtapa.map((e) => ({
                    rotulo: e.etapa,
                    total: e.total,
                    classe: classeEtapa(e.cor),
                  }))}
                />
                <Distribuicao
                  titulo="Por responsável"
                  vazio="Nenhuma demanda em aberto."
                  itens={metricas.porResponsavel.map((r) => ({
                    rotulo: r.nome,
                    total: r.total,
                    classe: 'bg-muted text-muted-foreground',
                  }))}
                />
              </div>
            </div>
          )}
        </>
      )}

      <DemandaForm open={novaAberta} onClose={() => setNovaAberta(false)} />
    </div>
  )
}

function Indicador({
  titulo,
  valor,
  icone: Icone,
  destaque,
}: {
  titulo: string
  valor: number
  icone: typeof AlertTriangle
  destaque?: 'alerta' | 'atencao'
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4',
        destaque === 'alerta' ? 'border-destructive/40' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icone
          className={cn(
            'h-3.5 w-3.5',
            destaque === 'alerta' && 'text-destructive',
            destaque === 'atencao' && 'text-amber-500',
          )}
        />
        {titulo}
      </div>
      <p
        className={cn(
          'mt-1 font-display text-2xl font-semibold',
          destaque === 'alerta' ? 'text-destructive' : 'text-foreground',
        )}
      >
        {valor}
      </p>
    </div>
  )
}

function LinhaDemanda({ demanda }: { demanda: Demanda }) {
  const situacao = situacaoPrazo(demanda)
  return (
    <li>
      <Link
        to={`/atendimento/demandas/${demanda.id}`}
        className="flex items-center gap-3 py-2.5 hover:bg-muted/40"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{demanda.titulo}</p>
          <p className="truncate text-xs text-muted-foreground">
            {demanda.cliente?.nome ?? 'Sem cliente'} · {demanda.codigo}
          </p>
        </div>
        {demanda.etapa && (
          <span
            className={cn(
              'hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline',
              classeEtapa(demanda.etapa.cor),
            )}
          >
            {demanda.etapa.nome}
          </span>
        )}
        <span className={cn('shrink-0 text-xs', CLASSE_PRAZO[situacao])}>
          {textoPrazo(demanda)}
        </span>
      </Link>
    </li>
  )
}

function Distribuicao({
  titulo,
  itens,
  vazio,
}: {
  titulo: string
  itens: Array<{ rotulo: string; total: number; classe: string }>
  vazio: string
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-display text-base font-semibold text-foreground">{titulo}</h2>
      {itens.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {itens.map((i) => (
            <li key={i.rotulo} className="flex items-center justify-between gap-2">
              <span className={cn('truncate rounded-full px-2 py-0.5 text-xs font-medium', i.classe)}>
                {i.rotulo}
              </span>
              <span className="text-sm font-semibold text-foreground">{i.total}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
