import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, Clock, Hourglass, MessageCircle, UserRound } from 'lucide-react'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsAppEnabled } from '@/hooks/useAppModules'
import { useAtendimentoEtapas, type Demanda } from '@/hooks/useAtendimento'
import { statusDaDemanda, useWhatsAppDosTickets, type WhatsAppDoTicket } from '@/hooks/useAtendimentoTickets'
import { SeloStatus } from '@/components/ui/StatusBadge'
import { ROTULO_PRIORIDADE } from '@/lib/atendimento'
import { inicioDaEspera, ROTULO_STATUS_TICKET, textoPrazoTicket, type StatusTicket } from '@/lib/ticketStatus'
import {
  faixaDeEspera, iniciais, minutosDesde, prazoVencido, textoDuracao, ticketAtrasado, ticketPedeAcao,
  tomDoAvatar, tomDoSelo, type FaixaEspera,
} from '@/lib/ticketEspera'
import { aguardaConfirmacao } from '@/lib/sugestaoIris'
import { cn } from '@/lib/utils'

/**
 * Peças da tickeria no visual do DS (seção 02 · hero de demonstração):
 * selo de status com forma própria, selo do WhatsApp, avatar do cliente,
 * "Sem responsável" explícito, cronômetro de espera que esquenta e a linha /
 * cartão de ticket usados na lista e no painel.
 */

/** Selo de status do ticket. `grande` é o do topo da ficha. */
export function StatusTicketBadge({
  status,
  grande = false,
  pelaIris = false,
  atrasado = false,
  animar,
  className,
}: {
  status: StatusTicket
  grande?: boolean
  /** Resolvido pela Íris (mostra "Resolvido pela Íris", tom verde-água). */
  pelaIris?: boolean
  /** Atrasado com a vez da equipe: o selo vira "Atrasado". */
  atrasado?: boolean
  animar?: boolean
  className?: string
}) {
  const tom = tomDoSelo(status, { pelaIris, atrasado })
  const rotulo = tom === 'ia' ? 'Resolvido pela Íris' : tom === 'atrasado' ? 'Atrasado' : ROTULO_STATUS_TICKET[status]
  return (
    <SeloStatus
      tom={tom}
      size={grande ? 'md' : 'sm'}
      animar={animar}
      title={tom === 'atrasado' ? `${ROTULO_STATUS_TICKET[status]} · atrasado` : undefined}
      className={cn('max-w-full', className)}
    >
      {rotulo}
    </SeloStatus>
  )
}

/**
 * Selo "WhatsApp": o ticket nasceu de uma mensagem do cliente.
 * `tag` (padrão) é a etiqueta com fundo; `linha` é o texto com ícone das
 * linhas de ticket.
 */
export function SeloWhatsApp({ className, variante = 'tag' }: { className?: string; variante?: 'tag' | 'linha' }) {
  return (
    <span
      className={cn(
        variante === 'tag'
          ? 'tag'
          : 'inline-flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground',
        className,
      )}
      title="Este ticket nasceu de uma mensagem do cliente no WhatsApp"
    >
      <MessageCircle className="h-[13px] w-[13px] text-success" aria-hidden />
      WhatsApp
    </span>
  )
}

/**
 * Selo "Íris sugere resolver": a Íris acha que o pedido foi resolvido, mas
 * não teve certeza e pede que alguém confirme na ficha do ticket.
 */
export function SeloSugestaoIris({ className }: { className?: string }) {
  return (
    <span
      className={cn('tag tag-iris', className)}
      title="A Íris acha que este pedido foi resolvido. Abra o ticket para confirmar ou manter aberto."
    >
      Íris sugere resolver
    </span>
  )
}

/** Avatar quadrado do cliente (iniciais, tom estável pelo id). */
export function AvatarCliente({
  nome,
  chave,
  tamanho = 'md',
  esmaecido = false,
}: {
  nome: string | null | undefined
  chave?: string | null
  tamanho?: 'sm' | 'md' | 'lg'
  esmaecido?: boolean
}) {
  return (
    <span
      aria-hidden
      data-h={tomDoAvatar(chave ?? nome)}
      className={cn('av sq', tamanho === 'sm' && 'av-sm', tamanho === 'lg' && 'av-lg', esmaecido && 'opacity-50')}
    >
      {iniciais(nome)}
    </span>
  )
}

/**
 * Responsável do ticket. Sem ninguém, diz "Sem responsável" em âmbar com o
 * avatar tracejado — nunca fica em branco.
 */
export function ResponsavelTicket({
  id,
  nome,
  mostrarNome = true,
  className,
}: {
  id: string | null | undefined
  nome: string | null | undefined
  mostrarNome?: boolean
  className?: string
}) {
  if (!id) {
    return (
      <span className={cn('inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap font-semibold text-warning', className)}>
        <span className="av av-sm none" aria-hidden><UserRound className="h-3 w-3" /></span>
        Sem responsável
      </span>
    )
  }
  const rotulo = nome?.trim() || 'Pessoa da equipe'
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-fg-2', className)} title={rotulo}>
      <span className="av av-sm" data-h={tomDoAvatar(id)} aria-hidden>{iniciais(rotulo)}</span>
      {mostrarNome ? <span className="truncate">{rotulo}</span> : <span className="sr-only">{rotulo}</span>}
    </span>
  )
}

/** Seleção do DS (`.select` + seta), com 16 px no celular para o iPhone não dar zoom. */
export function SelectDs({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <span className="relative block min-w-0">
      <select {...props} className={cn('select text-base sm:text-sm', className)}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  )
}

/** Relógio que anda sozinho: devolve a hora atual, atualizada a cada `intervaloMs`. */
export function useAgora(intervaloMs = 30_000): Date {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), intervaloMs)
    return () => window.clearInterval(id)
  }, [intervaloMs])
  return agora
}

/** A pessoa pode ver o Chat? (app ligado + permissão). Sem isso, não lemos conversas. */
export function useAcessoAoChat(): boolean {
  const { can } = usePermissoes()
  const { isAppEnabled } = useIsAppEnabled()
  return isAppEnabled('chat') && can('chat', 'ver')
}

export interface TicketComStatus {
  demanda: Demanda
  status: StatusTicket
  wa: WhatsAppDoTicket | undefined
}

/**
 * Junta tickets, dados do WhatsApp e etapas. Se a consulta do WhatsApp falhar,
 * os tickets continuam aparecendo com o status pela etapa.
 */
export function useTicketsComStatus(demandas: Demanda[] | undefined) {
  const acessoChat = useAcessoAoChat()
  const { data: etapas = [] } = useAtendimentoEtapas()
  const whatsapp = useWhatsAppDosTickets({ incluirConversa: acessoChat })
  const mapa = whatsapp.data

  const tickets = useMemo<TicketComStatus[]>(
    () => (demandas ?? []).map((d) => {
      const wa = mapa?.get(d.id)
      return { demanda: d, wa, status: statusDaDemanda(d, wa, etapas) }
    }),
    [demandas, mapa, etapas],
  )

  return { tickets, etapas, acessoChat, whatsappIndisponivel: whatsapp.isError }
}

/** Texto curto de quem resolveu, para listas. */
export function quemResolveu(wa: WhatsAppDoTicket | undefined): string | null {
  if (!wa) return null
  if (wa.resolucaoMetodo === 'ia' && !wa.resolvidaManualmente) return 'pela Íris'
  if (wa.resolvidaManualmente) return 'pela equipe'
  return null
}

/** A Íris resolveu sozinha (e ninguém resolveu à mão por cima)? */
export function resolvidoPelaIris(status: StatusTicket, wa: WhatsAppDoTicket | undefined): boolean {
  return status === 'resolvido' && wa?.resolucaoMetodo === 'ia' && !wa.resolvidaManualmente
}

/** Momento em que a espera atual começou (depende do status). */
export function inicioDaEsperaDoTicket(t: TicketComStatus): string {
  return inicioDaEspera(t.status, {
    criadoEm: t.demanda.created_at,
    concluidaEm: t.demanda.concluida_em,
    reabertaEm: t.wa?.reabertaEm,
    ultimaMsgClienteEm: t.wa?.ultimaMsgClienteEm,
    conversaAtualizadaEm: t.wa?.conversaAtualizadaEm,
  })
}

export interface LeituraDoTicket {
  inicioEspera: string
  minutos: number | null
  faixa: FaixaEspera | null
  atrasado: boolean
  pedeAcao: boolean
  pelaIris: boolean
  /** A Íris sugeriu resolver e o ticket espera alguém confirmar. */
  paraConfirmar: boolean
}

/** Tudo o que a linha do ticket precisa saber, calculado de uma vez. */
export function lerTicket(t: TicketComStatus, agora: Date): LeituraDoTicket {
  const inicioEspera = inicioDaEsperaDoTicket(t)
  const minutos = minutosDesde(inicioEspera, agora)
  const atrasado = ticketAtrasado({ status: t.status, prazo: t.demanda.prazo, minutos }, agora)
  return {
    inicioEspera,
    minutos,
    faixa: faixaDeEspera(t.status, minutos),
    atrasado,
    pedeAcao: ticketPedeAcao({ status: t.status, atrasado }),
    pelaIris: resolvidoPelaIris(t.status, t.wa),
    paraConfirmar: aguardaConfirmacao(t),
  }
}

/**
 * Tempo de espera com a cor da faixa (neutro → âmbar 15 min → vermelho 60 min).
 * Aguardando cliente mostra a ampulheta; resolvido mostra o visto.
 */
export function EsperaTicket({
  status,
  minutos,
  faixa,
  pelaIris,
  className,
}: {
  status: StatusTicket
  minutos: number | null
  faixa: FaixaEspera | null
  pelaIris?: boolean
  className?: string
}) {
  if (status === 'resolvido') {
    return (
      <span className={cn('wait', className)}>
        <Check aria-hidden />
        {pelaIris ? 'pela Íris' : 'resolvido'}
      </span>
    )
  }
  if (minutos === null) return null
  const doCliente = status === 'aguardando_cliente'
  const Icone = doCliente ? Hourglass : Clock
  return (
    <span
      className={cn('wait', className)}
      data-l={faixa ?? 1}
      title={doCliente ? 'Tempo esperando o cliente responder' : 'Tempo esperando a equipe'}
    >
      <Icone aria-hidden />
      <span>{doCliente ? `há ${textoDuracao(minutos)}` : textoDuracao(minutos)}</span>
    </span>
  )
}

const pontinho = <i aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-full bg-stroke-strong" />

/**
 * Linha de ticket (computador) e cartão (celular), como no hero do DS:
 * cliente em destaque com o status no canto, o pedido logo abaixo e, no
 * rodapé, origem, espera, número e responsável. Atraso marca a borda esquerda.
 */
export interface SelecaoDaLinha {
  marcado: boolean
  onMarcar: (marcado: boolean) => void
  /** `true` quando o ticket não pode entrar no lote (ex.: já resolvido). */
  desabilitado?: boolean
}

export function LinhaTicket({ ticket, agora, selecao }: {
  ticket: TicketComStatus
  agora: Date
  /** Quando existe, a linha vira item de seleção em vez de link. */
  selecao?: SelecaoDaLinha
}) {
  const { demanda: d, status, wa } = ticket
  const leitura = lerTicket(ticket, agora)
  const resolvido = status === 'resolvido'
  const cliente = d.cliente?.nome ?? 'Sem cliente'
  const resumo = wa?.textoOrigem?.trim() || d.descricao?.trim() || null
  const prioridadeAlta = d.prioridade === 'alta' || d.prioridade === 'urgente'
  const prazo = d.prazo && !resolvido ? textoPrazoTicket(d.prazo, agora) : null
  const prazoAtrasado = !resolvido && prazoVencido(d.prazo, agora)

  const selo = (
    <StatusTicketBadge status={status} pelaIris={leitura.pelaIris} atrasado={leitura.atrasado} grande={false} />
  )
  const espera = <EsperaTicket status={status} minutos={leitura.minutos} faixa={leitura.faixa} pelaIris={leitura.pelaIris} />
  const extras = (
    <>
      {leitura.paraConfirmar && <SeloSugestaoIris />}
      {prazo && (
        <span className={cn('whitespace-nowrap text-[12px]', prazoAtrasado ? 'font-semibold text-danger' : 'text-muted-foreground')}>
          {prazo}
        </span>
      )}
      {prioridadeAlta && (
        <span className={cn('tag', d.prioridade === 'urgente' ? 'tag-danger' : 'tag-warning')}>
          {ROTULO_PRIORIDADE[d.prioridade]}
        </span>
      )}
    </>
  )

  const classe = cn(
          'group relative block text-left text-foreground no-underline focus-ds',
          // Celular: cartão.
          'rounded-xl border bg-card p-3.5 transition-[transform,border-color,background-color] duration-fast ease-std active:scale-[.985]',
          leitura.atrasado ? 'border-[color-mix(in_srgb,var(--st-late-fg)_35%,var(--card-border))]' : 'border-card-border',
          resolvido && 'bg-bg-0',
          // Computador: linha densa dentro do cartão da lista.
          'md:rounded-none md:border-0 md:border-b md:border-stroke-weak md:bg-transparent md:px-5 md:py-4 md:active:scale-100 md:hover:bg-bg-0',
  )

  const conteudo = (
    <>
        {leitura.atrasado && (
          <span aria-hidden className="absolute -left-px bottom-3.5 top-3.5 w-[3px] rounded-r-[3px] bg-st-late-fg md:hidden" />
        )}

        {/* Celular */}
        <span className="grid gap-2 md:hidden">
          <span className="flex min-w-0 items-center gap-2.5">
            <AvatarCliente nome={cliente} chave={d.cliente_id} esmaecido={resolvido} />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[15px] font-[650]">{cliente}</b>
              <span className="block truncate text-[12.5px] text-muted-foreground">
                <span className="mono">{d.codigo}</span>
                {wa ? ' · WhatsApp' : ''}
              </span>
            </span>
            {selo}
          </span>
          <span className="line-clamp-2 text-[15px] leading-[1.4] text-fg-2">{d.titulo}</span>
          <span className="flex flex-wrap items-center gap-2">
            {espera}
            {extras}
            <ResponsavelTicket id={d.responsavel_id} nome={d.responsavel?.nome} className="ml-auto text-[13px]" />
          </span>
        </span>

        {/* Computador */}
        <span className="hidden grid-cols-[auto_minmax(0,1fr)] gap-2.5 md:grid">
          <AvatarCliente nome={cliente} chave={d.cliente_id} esmaecido={resolvido} />
          <span className="grid min-w-0 gap-[3px]">
            <span className="flex min-w-0 items-center gap-2">
              <span className={cn('min-w-0 truncate text-[14px] font-semibold', resolvido ? 'text-fg-2' : 'text-foreground')}>{cliente}</span>
              <span className="ml-auto flex-none">{selo}</span>
            </span>
            <span className="truncate text-[13px] leading-[1.45] text-muted-foreground">
              {d.titulo}
              {resumo && <span className="text-fg-4"> — {wa?.textoOrigem ? `“${resumo}”` : resumo}</span>}
            </span>
            <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {wa && <><SeloWhatsApp variante="linha" />{pontinho}</>}
              {espera}
              {pontinho}
              <span className="mono text-[11.5px] text-fg-4">{d.codigo}</span>
              {extras}
              <ResponsavelTicket
                id={d.responsavel_id}
                nome={d.responsavel?.nome}
                className="ml-auto text-[12px]"
              />
            </span>
          </span>
        </span>
    </>
  )

  if (selecao) {
    return (
      <li className="animate-row-in">
        {/* A linha que a ação atual não alcança (resolvido em "Resolver", aberto
            em "Reabrir") fica desligada, e o leitor de tela diz isso. */}
        <div
          role="checkbox"
          aria-checked={selecao.marcado}
          aria-disabled={selecao.desabilitado ? true : undefined}
          aria-label={`Selecionar ${cliente} (${d.codigo})`}
          tabIndex={selecao.desabilitado ? -1 : 0}
          onClick={() => !selecao.desabilitado && selecao.onMarcar(!selecao.marcado)}
          onKeyDown={(e) => {
            if (selecao.desabilitado) return
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault()
              selecao.onMarcar(!selecao.marcado)
            }
          }}
          className={cn(
            classe,
            'flex cursor-pointer items-start gap-2.5 focus-ds',
            selecao.marcado && 'bg-bg-0 md:bg-bg-0',
            selecao.desabilitado && 'cursor-not-allowed opacity-60',
          )}
        >
          <span className="flex h-11 w-11 flex-none items-center justify-center md:h-8 md:w-8">
            <input
              type="checkbox"
              checked={selecao.marcado}
              disabled={selecao.desabilitado}
              onChange={(e) => selecao.onMarcar(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              aria-hidden
              tabIndex={-1}
              className="h-5 w-5 accent-[var(--fg-1)] md:h-[18px] md:w-[18px]"
            />
          </span>
          <span className="min-w-0 flex-1">{conteudo}</span>
        </div>
      </li>
    )
  }

  return (
    <li className="animate-row-in">
      <Link
        to={`/tickets/${d.id}`}
        aria-label={`${cliente}: ${d.titulo}`}
        className={classe}
      >
        {conteudo}
      </Link>
    </li>
  )
}

/** Lista de tickets: cartões no celular, linhas num cartão no computador. */
export function ListaTickets({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul
      className={cn(
        'grid grid-cols-[minmax(0,1fr)] gap-2.5',
        'md:gap-0 md:overflow-hidden md:rounded-lg md:border md:border-card-border md:bg-card md:[&>li:last-child>a]:border-b-0',
        className,
      )}
    >
      {children}
    </ul>
  )
}

/** Esqueleto de carregamento (DS `.sk`): linhas com o brilho na inclinação do X. */
export function EsqueletoLista({ linhas = 4 }: { linhas?: number }) {
  return (
    <ul aria-hidden className="grid gap-2.5 md:gap-0 md:overflow-hidden md:rounded-lg md:border md:border-card-border md:bg-card">
      {Array.from({ length: linhas }, (_, i) => (
        <li
          key={i}
          className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 rounded-xl border border-card-border bg-card p-3.5 md:rounded-none md:border-0 md:border-b md:border-stroke-weak md:px-4 md:py-3"
        >
          <span className="sk h-7 w-7 rounded-md" />
          <span className="grid gap-2">
            <span className="sk h-3" style={{ width: `${50 + ((i * 17) % 35)}%` }} />
            <span className="sk h-3" style={{ width: `${70 + ((i * 11) % 25)}%` }} />
            <span className="sk mt-1 h-3.5 w-2/5 rounded-full" />
          </span>
        </li>
      ))}
    </ul>
  )
}
