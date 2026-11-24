import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, CheckCircle2, Hourglass, Inbox, MessageCircle, Plus, type LucideIcon,
} from 'lucide-react'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { AtendimentoTabs } from '@/components/atendimento/AtendimentoTabs'
import { DemandaForm } from '@/components/atendimento/DemandaForm'
import {
  EsqueletoLista, LinhaTicket, ListaTickets, lerTicket, useAgora, useTicketsComStatus, type TicketComStatus,
} from '@/components/atendimento/TicketUi'
import { useMetricasAtendimento } from '@/hooks/useAtendimento'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useAuth } from '@/contexts/AuthContext'
import { useAcessoNavegacao } from '@/hooks/useAcessoNavegacao'
import { ITENS_PRINCIPAIS } from '@/config/navegacao'
import { classeEtapa, situacaoPrazo } from '@/lib/atendimento'
import { filaDoStatus, rotuloNomeEtapa } from '@/lib/ticketStatus'
import { resumoDaFila } from '@/lib/ticketEspera'
import { cn } from '@/lib/utils'
import {
  DESCRICAO_VISAO, ROTULO_VISAO, lerVisaoSalva, salvarVisao, visaoEfetiva, visoesDoPerfil, type VisaoInicio,
} from '@/lib/visaoInicio'

const LIMITE_ATENCAO = 8
const SETE_DIAS = 7 * 86_400_000

/**
 * O ticket precisa de alguém agora?
 * - do WhatsApp esperando a equipe (mesmo sem prazo) ou reaberto;
 * - prazo vencido ou vencendo hoje;
 * - cliente pediu ajuste.
 */
function precisaDeAtencao(t: TicketComStatus): boolean {
  if (t.status === 'resolvido') return false
  if (t.status === 'reaberto') return true
  if (t.wa && t.status === 'aguardando_equipe') return true
  if (['atrasada', 'hoje'].includes(situacaoPrazo(t.demanda))) return true
  return t.demanda.aprovacao === 'ajustes'
}

/**
 * Painel (tela inicial) — responde "o que precisa da minha atenção agora?".
 * Os números do topo levam direto à fila correspondente; a lista usa a mesma
 * linha de ticket da fila, com o cronômetro de espera que esquenta.
 */
export function AtendimentoPainelPage() {
  const { metricas, demandas, isLoading, isError } = useMetricasAtendimento()
  const { tickets, etapas } = useTicketsComStatus(demandas)
  const { can } = usePermissoes()
  const { user } = useAuth()
  const { pode } = useAcessoNavegacao()
  const atalhos = ITENS_PRINCIPAIS.filter((i) => i.id !== 'inicio' && pode(i.acesso))
  const [novaAberta, setNovaAberta] = useState(false)
  const podeEditar = can('atendimento', 'editar')
  const agora = useAgora(30_000)

  // Visão por papel (Gestão / CS / Técnico, como no Clients): só muda o recorte
  // e a ordem do que já foi carregado. Técnico vê apenas os tickets dele.
  const [visaoEscolhida, setVisaoEscolhida] = useState<string | null>(lerVisaoSalva)
  const visoes = visoesDoPerfil(user?.perfil)
  const visao = visaoEfetiva(user?.perfil, visaoEscolhida)
  const escolherVisao = (v: VisaoInicio) => {
    setVisaoEscolhida(v)
    salvarVisao(v)
  }
  const soMeus = visao === 'tecnico'
  const sufixo = soMeus ? '&meus=1' : ''

  const todos = useMemo(() => tickets.map((t) => ({ t, l: lerTicket(t, agora) })), [tickets, agora])
  const lidos = useMemo(
    () => (soMeus ? todos.filter(({ t }) => Boolean(user?.id) && t.demanda.responsavel_id === user?.id) : todos),
    [todos, soMeus, user?.id],
  )

  const contagem = useMemo(() => {
    const limite = agora.getTime() - SETE_DIAS
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime()
    let equipe = 0
    let cliente = 0
    let atrasados = 0
    let pelaIris = 0
    let resolvidosMes = 0
    lidos.forEach(({ t, l }) => {
      const fila = filaDoStatus(t.status)
      if (fila === 'equipe') equipe += 1
      if (fila === 'cliente') cliente += 1
      if (l.atrasado) atrasados += 1
      const concluida = t.demanda.concluida_em ? new Date(t.demanda.concluida_em).getTime() : null
      if (l.pelaIris && concluida !== null && concluida >= limite) pelaIris += 1
      if (concluida !== null && concluida >= inicioMes) resolvidosMes += 1
    })
    return { equipe, cliente, atrasados, pelaIris, resolvidosMes }
  }, [lidos, agora])

  const atencao = useMemo(
    () => lidos
      .filter(({ t }) => precisaDeAtencao(t))
      .sort((a, b) => {
        // Reabertos primeiro; depois quem espera há mais tempo.
        if ((a.t.status === 'reaberto') !== (b.t.status === 'reaberto')) return a.t.status === 'reaberto' ? -1 : 1
        return new Date(a.l.inicioEspera).getTime() - new Date(b.l.inicioEspera).getTime()
      }),
    [lidos],
  )
  const resumo = resumoDaFila(atencao.map(({ l }) => l))

  const maiorEtapa = Math.max(1, ...metricas.porEtapa.map((e) => e.total))
  const maiorResp = Math.max(1, ...metricas.porResponsavel.map((r) => r.total))

  const botaoNovo = podeEditar && (
    <button type="button" onClick={() => setNovaAberta(true)} className="btn btn-primary">
      <Plus aria-hidden /> Novo ticket
    </button>
  )

  // Hero "Cume" (visual do OMNX Clients): saudação, data e um resumo curto com
  // os mesmos números que o painel já calcula. Nada novo é buscado.
  const hora = agora.getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const primeiroNome = (user?.nome ?? user?.email?.split('@')[0] ?? '').split(' ')[0]
  const dataExtensa = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const resumoHero = isLoading || isError
    ? 'O que precisa da sua atenção agora: tickets esperando a equipe, atrasados ou reabertos.'
    : soMeus
      ? `Com você: ${contagem.equipe} ${contagem.equipe === 1 ? 'ticket aguardando' : 'tickets aguardando'} resposta · ${contagem.atrasados} ${contagem.atrasados === 1 ? 'atrasado' : 'atrasados'} · ${contagem.cliente} aguardando cliente.`
      : `${contagem.equipe} ${contagem.equipe === 1 ? 'ticket aguardando' : 'tickets aguardando'} a equipe · ${contagem.atrasados} ${contagem.atrasados === 1 ? 'atrasado' : 'atrasados'} · ${contagem.cliente} aguardando cliente.`

  return (
    <PageContainer className="gap-5 md:gap-6">
      <section className="cume-hero" aria-label="Resumo do dia">
        <div className="cume-hero-top">
          <p className="cume-hero-date">{dataExtensa}</p>
          <h1>
            {saudacao}{primeiroNome ? `, ${primeiroNome}` : ''}!
            <span className="sr-only"> Painel de atendimento</span>
          </h1>
          <p className="cume-hero-sum">{resumoHero}</p>
          {visoes.length > 1 && (
            <div role="group" aria-label="Alternar visão do painel" className="mt-3 inline-flex flex-wrap gap-1 rounded-full bg-white/10 p-1">
              {visoes.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={visao === v}
                  title={DESCRICAO_VISAO[v]}
                  onClick={() => escolherVisao(v)}
                  className={cn(
                    'rounded-full px-3 py-1 text-[12.5px] font-semibold transition-[background-color,color] duration-fast ease-std focus-ds',
                    visao === v ? 'bg-white text-[#0b1b33]' : 'text-white/80 hover:bg-white/15 hover:text-white',
                  )}
                >
                  {ROTULO_VISAO[v]}
                </button>
              ))}
            </div>
          )}
          <div className="cume-hero-actions">
            {botaoNovo}
            <Link to={`/tickets?status=equipe${sufixo}`} className="cume-hero-ghost">{soMeus ? 'Meus tickets' : 'Fila da equipe'}</Link>
          </div>
        </div>
        {!isLoading && !isError && (
      <div className="cume-band grid grid-cols-2 lg:grid-cols-5">
        <Indicador titulo={soMeus ? 'Com você, aguardando resposta' : 'Aguardando equipe'} valor={contagem.equipe} icone={MessageCircle} destaque={contagem.equipe > 0 ? 'atencao' : undefined} para={`/tickets?status=equipe${sufixo}`} />
        <Indicador titulo={soMeus ? 'Seus atrasados' : 'Atrasados'} valor={contagem.atrasados} icone={AlertTriangle} destaque={contagem.atrasados > 0 ? 'alerta' : undefined} para={`/tickets?status=atrasados${sufixo}`} />
        <Indicador titulo="Aguardando cliente" valor={contagem.cliente} icone={Hourglass} para={`/tickets?status=cliente${sufixo}`} />
        <Indicador titulo={soMeus ? 'Você resolveu no mês' : 'Resolvidos no mês'} valor={soMeus ? contagem.resolvidosMes : metricas.concluidasNoMes} icone={CheckCircle2} para={`/tickets?status=resolvidos${sufixo}`} />
        <Indicador titulo="Resolvidos pela Íris (7 dias)" valor={contagem.pelaIris} iris para={`/tickets?status=resolvidos${sufixo}`} className="col-span-2 lg:col-span-1" />
      </div>
        )}
      </section>

      <AtendimentoTabs />

      {isLoading && (
        <>
          <div aria-hidden className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={cn('grid gap-3 rounded-lg border border-card-border bg-card p-4', i === 4 && 'col-span-2 lg:col-span-1')}>
                <span className="sk h-3 w-2/3" />
                <span className="sk h-6 w-10" />
              </div>
            ))}
          </div>
          <EsqueletoLista linhas={3} />
        </>
      )}

      {isError && (
        <div role="alert" className="rounded-lg border border-card-border bg-card p-4 text-sm text-muted-foreground">
          Não foi possível carregar os tickets. Se isso persistir, use o botão
          "Reportar problema" — ele já envia o contexto técnico junto.
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {demandas.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Nenhum ticket ainda"
              description="Os pedidos que os clientes fazem no WhatsApp viram tickets automaticamente. Você também pode criar um à mão."
              action={botaoNovo}
            />
          ) : (
            <div className={cn('grid gap-4', !soMeus && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
              <section aria-labelledby="painel-atencao" className="cume-panel grid content-start">
                <div className="cume-panel-head flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <h2 id="painel-atencao" className="m-0 text-[15px] font-bold text-foreground">Precisa de atenção</h2>
                    <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">
                      {atencao.length > 0 ? (
                        <>
                          <b className="font-[650] text-fg-1">{resumo.total}</b> {resumo.total === 1 ? 'ticket' : 'tickets'} ·{' '}
                          <b className={cn('font-[650]', resumo.temAtraso ? 'text-danger' : 'text-fg-1')}>{resumo.textoAcao}</b>
                        </>
                      ) : (
                        'Cliente esperando resposta, ticket reaberto, prazo vencendo ou ajuste pedido.'
                      )}
                    </p>
                  </div>
                  {atencao.length > LIMITE_ATENCAO && (
                    <Link to={`/tickets?status=equipe${sufixo}`} className="btn btn-ghost btn-sm text-link">
                      Ver todos ({atencao.length}) <ArrowRight className="i-nudge" aria-hidden />
                    </Link>
                  )}
                </div>

                {atencao.length === 0 ? (
                  <EmptyState
                    compact
                    icon={CheckCircle2}
                    title={soMeus ? 'Nada esperando por você agora' : 'Ninguém esperando a equipe agora'}
                    description={soMeus
                      ? 'Quando um ticket seu precisar de resposta, ele aparece aqui.'
                      : 'Bom trabalho. Quando um cliente pedir algo no WhatsApp, o ticket aparece aqui.'}
                    action={<Link to={`/tickets?status=todos${sufixo}`} className="btn btn-secondary">{soMeus ? 'Ver meus tickets' : 'Ver todos os tickets'}</Link>}
                  />
                ) : (
                  <ListaTickets>
                    {atencao.slice(0, LIMITE_ATENCAO).map(({ t }) => (
                      <LinhaTicket key={t.demanda.id} ticket={t} agora={agora} />
                    ))}
                  </ListaTickets>
                )}
              </section>

              {!soMeus && (
              <div className="grid content-start gap-4">
                <Distribuicao
                  titulo="Abertos por etapa"
                  vazio="Nenhum ticket em aberto."
                  maior={maiorEtapa}
                  itens={metricas.porEtapa.map((e) => ({
                    rotulo: e.etapa === 'Sem etapa' ? e.etapa : rotuloNomeEtapa(e.etapa, etapas),
                    total: e.total,
                    classe: classeEtapa(e.cor),
                  }))}
                />
                {visao === 'gestao' && (
                <Distribuicao
                  titulo="Abertos por responsável"
                  vazio="Nenhum ticket em aberto."
                  maior={maiorResp}
                  itens={metricas.porResponsavel.map((r) => ({
                    rotulo: r.nome,
                    total: r.total,
                    classe: r.nome === 'Sem responsável' ? 'text-warning font-semibold' : 'text-fg-2',
                  }))}
                />
                )}
              </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Atalhos em pílulas, como no Início do clients: mesmas rotas e regras de acesso do menu. */}
      {atalhos.length > 0 && (
        <nav aria-label="Atalhos" className="cume-shortcuts">
          {atalhos.map((a) => (
            <Link key={a.id} to={a.rota}>
              {a.rotulo} <ArrowRight aria-hidden />
            </Link>
          ))}
        </nav>
      )}

      <DemandaForm open={novaAberta} onClose={() => setNovaAberta(false)} />
    </PageContainer>
  )
}

function Indicador({
  titulo, valor, icone: Icone, iris = false, destaque, para, className,
}: {
  titulo: string
  valor: number
  icone?: LucideIcon
  /** Usa a marca da Íris no lugar do ícone (resoluções automáticas). */
  iris?: boolean
  destaque?: 'alerta' | 'atencao'
  para: string
  className?: string
}) {
  return (
    <Link
      to={para}
      className={cn(
        'group relative grid content-between gap-1 overflow-hidden px-4 py-3.5 text-foreground no-underline focus-ds sm:px-5 sm:py-4',
        'transition-[background-color] duration-fast ease-std hover:bg-accent',
        className,
      )}
    >
      {destaque === 'alerta' && <span aria-hidden className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-[3px] bg-st-late-fg" />}
      {/* O nome quebra linha em vez de cortar ("Aguardando equ…" no celular); o número fica embaixo, alinhado entre as células. */}
      <span className="flex min-w-0 items-start gap-2 text-[12.5px] font-medium leading-[1.35] text-muted-foreground">
        {iris ? (
          <span className="iris-mark shrink-0 [--av:16px]" aria-hidden />
        ) : Icone && (
          <Icone
            aria-hidden
            className={cn('mt-px h-3.5 w-3.5 shrink-0', destaque === 'alerta' ? 'text-danger' : destaque === 'atencao' ? 'text-warning' : 'text-fg-4')}
          />
        )}
        <span className="min-w-0">{titulo}</span>
      </span>
      <span
        className={cn(
          'font-[family-name:var(--font-display)] text-[clamp(26px,2.4vw,34px)] font-bold leading-tight tracking-[-0.02em] [font-stretch:92%]',
          destaque === 'alerta' ? 'text-danger' : destaque === 'atencao' ? 'text-warning' : iris ? 'text-iris-fg' : 'text-foreground',
        )}
      >
        {valor}
      </span>
    </Link>
  )
}

function Distribuicao({
  titulo, itens, vazio, maior,
}: {
  titulo: string
  itens: Array<{ rotulo: string; total: number; classe: string }>
  vazio: string
  maior: number
}) {
  return (
    <section className="rounded-lg border border-card-border bg-card p-4">
      <h2 className="m-0 text-[15px] font-bold text-foreground">{titulo}</h2>
      {itens.length === 0 ? (
        <p className="m-0 mt-2 text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="mt-3 grid gap-2.5">
          {itens.map((i) => (
            <li key={i.rotulo} className="grid gap-1">
              <span className="flex items-center justify-between gap-2 text-[13px]">
                <span className={cn('truncate rounded-sm px-1.5 py-px font-medium', i.classe)}>{i.rotulo}</span>
                <span className="mono text-[12.5px] font-semibold text-foreground">{i.total}</span>
              </span>
              <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-bg-3">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((i.total / maior) * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
