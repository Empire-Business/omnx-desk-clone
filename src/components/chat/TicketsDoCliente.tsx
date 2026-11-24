import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Ticket } from 'lucide-react'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsAppEnabled } from '@/hooks/useAppModules'
import { useAtendimentoEtapas } from '@/hooks/useAtendimento'
import { statusDaDemanda, useTicketsDoCliente, useWhatsAppDosTickets } from '@/hooks/useAtendimentoTickets'
import { SeloWhatsApp, StatusTicketBadge } from '@/components/atendimento/TicketUi'
import type { StatusTicket } from '@/lib/ticketStatus'
import { cn } from '@/lib/utils'

/**
 * Tickets do cliente dentro do Chat: quem está na conversa vê, sem sair dela,
 * o que o cliente já pediu e o que ainda está em aberto.
 *
 * Só aparece para quem tem o app de tickets ligado e permissão de ver. Os
 * tickets abertos vêm primeiro.
 */

interface ItemTicket {
  id: string
  codigo: string
  titulo: string
  status: StatusTicket
  doWhatsApp: boolean
}

function useTicketsComStatusDoCliente(clienteId: string | null | undefined) {
  const { can } = usePermissoes()
  const { isAppEnabled } = useIsAppEnabled()
  const disponivel = isAppEnabled('atendimento') && can('atendimento', 'ver')
  const acessoChat = isAppEnabled('chat') && can('chat', 'ver')

  const tickets = useTicketsDoCliente(clienteId, disponivel)
  const whatsapp = useWhatsAppDosTickets({
    clienteId: clienteId ?? undefined,
    incluirConversa: acessoChat,
    habilitado: disponivel && Boolean(clienteId),
  })
  const { data: etapas = [] } = useAtendimentoEtapas()

  const itens = useMemo<ItemTicket[]>(() => {
    const lista = (tickets.data ?? []).map((t) => {
      const wa = whatsapp.data?.get(t.id)
      return {
        id: t.id,
        codigo: t.codigo,
        titulo: t.titulo,
        status: statusDaDemanda(t, wa, etapas),
        doWhatsApp: Boolean(wa),
      }
    })
    // Abertos primeiro, mantendo a ordem (mais novos antes) dentro de cada grupo.
    return [...lista.filter((t) => t.status !== 'resolvido'), ...lista.filter((t) => t.status === 'resolvido')]
  }, [tickets.data, whatsapp.data, etapas])

  return {
    disponivel: disponivel && Boolean(clienteId),
    itens,
    abertos: itens.filter((t) => t.status !== 'resolvido').length,
    carregando: tickets.isLoading,
    erro: tickets.isError,
  }
}

function ListaItens({ itens, onEscolher }: { itens: ItemTicket[]; onEscolher?: () => void }) {
  return (
    <ul className="divide-y divide-border">
      {itens.map((t) => (
        <li key={t.id}>
          <Link
            to={`/tickets/${t.id}`}
            onClick={onEscolher}
            className="flex min-h-11 flex-col gap-1 px-3 py-2 transition-colors duration-fast hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusTicketBadge status={t.status} />
              {t.doWhatsApp && <SeloWhatsApp />}
              <span className="mono text-[11px] text-muted-foreground">{t.codigo}</span>
            </span>
            <span className="line-clamp-2 text-[13.5px] text-foreground">{t.titulo}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Selo no cabeçalho da conversa: "2 tickets abertos", abre a lista. */
export function SeloTicketsDoCliente({ clienteId }: { clienteId: string | null | undefined }) {
  const { disponivel, itens, abertos } = useTicketsComStatusDoCliente(clienteId)
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  if (!disponivel || itens.length === 0) return null

  const rotulo = abertos === 0
    ? 'Tickets'
    : abertos === 1 ? '1 ticket aberto' : `${abertos} tickets abertos`

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="true"
        title="Tickets deste cliente"
        aria-label={rotulo}
        className={cn(
          'btn btn-sm',
          abertos > 0 ? 'btn-secondary' : 'btn-ghost',
          aberto && '!border-primary',
        )}
      >
        <Ticket aria-hidden />
        <span className="hidden sm:inline">{rotulo}</span>
        {/* Selo de contagem do DS: azul quando há ticket aberto */}
        <span className={cn('count sm:hidden', abertos > 0 && 'is-primary')}>{abertos || itens.length}</span>
        <ChevronDown className={cn('transition-transform duration-fast', aberto && 'rotate-180')} aria-hidden />
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Tickets deste cliente"
          className="absolute right-0 top-full z-50 mt-1 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-pop ring-hairline animate-fade-in-up"
        >
          <p className="t-h6 border-b border-border px-3 py-2">
            Tickets deste cliente
          </p>
          <div className="max-h-[50dvh] overflow-y-auto">
            <ListaItens itens={itens} onEscolher={() => setAberto(false)} />
          </div>
        </div>
      )}
    </div>
  )
}

/** Bloco do painel lateral do contato. */
export function ListaTicketsDoCliente({ clienteId }: { clienteId: string | null | undefined }) {
  const { disponivel, itens, abertos, carregando, erro } = useTicketsComStatusDoCliente(clienteId)
  if (!disponivel) return null

  return (
    <div className="border-t border-stroke-weak px-4 py-4">
      <h4 className="mb-2.5 flex items-center justify-between gap-2 text-[12px] font-[650] tracking-[.02em] text-muted-foreground">
        Tickets deste cliente
        {abertos > 0 && (
          <span className="count is-primary" title={abertos === 1 ? '1 aberto' : `${abertos} abertos`}>
            {abertos}
          </span>
        )}
      </h4>
      {carregando ? (
        <div aria-hidden className="sk h-12 rounded-lg" />
      ) : erro ? (
        <p className="text-[13px] text-muted-foreground">Não foi possível carregar os tickets.</p>
      ) : itens.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nenhum ticket para este cliente.</p>
      ) : (
        <div className="overflow-hidden rounded-lg bg-card ring-hairline">
          <ListaItens itens={itens.slice(0, 10)} />
        </div>
      )}
    </div>
  )
}
