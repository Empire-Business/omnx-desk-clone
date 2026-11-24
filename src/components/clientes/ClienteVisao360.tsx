import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CheckCircle2, ExternalLink, Headphones, MessageSquare, Wallet } from 'lucide-react'
import { useConversasDoCliente, useDemandasDoCliente } from '@/hooks/useClienteVinculos'
import { useIsAppEnabled } from '@/hooks/useAppModules'
import { parcelasDoContrato, type ContratoFluxo } from '@/pages/contratos/fluxoFuturo'
import { cn } from '@/lib/utils'

/**
 * Visão 360 do cliente — as abas que puxam o que vive em outros apps.
 *
 * Cada aba é um **índice**, não um mini-app: mostra o que existe e leva ao app
 * dono do dado. Reimplementar aqui a operação de cada módulo seria criar uma
 * segunda versão de cada tela, que divergiria na primeira mudança.
 *
 * Estados vazios explicam o que apareceria ali — a regra do §9.9 do brief: uma
 * tela vazia sem explicação faz a pessoa achar que o sistema quebrou.
 */

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function Vazio({ icon: Icon, titulo, explicacao }: {
  icon: React.ElementType
  titulo: string
  explicacao: string
}) {
  return (
    <div className="glass-card flex flex-col items-center justify-center py-8 text-center">
      <Icon className="mb-2 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">{explicacao}</p>
    </div>
  )
}

// ─── Financeiro ──────────────────────────────────────────────────────────────

/**
 * Fluxo financeiro do cliente: o que já caiu e o que ainda vai cair.
 *
 * Deriva das mesmas funções da tela de Recebíveis (`parcelasDoContrato`), de
 * propósito: dois cálculos de parcela no sistema é garantia de dois números
 * diferentes para a mesma pergunta.
 */
export function AbaFinanceiro({ contratos }: { contratos: ContratoFluxo[] }) {
  const hoje = new Date().toISOString().slice(0, 10)

  const { pagas, aReceber, totalPago, totalAReceber } = useMemo(() => {
    const todas = contratos.flatMap((c) => parcelasDoContrato(c))
    const pagas = todas.filter((p) => p.data < hoje).sort((a, b) => b.data.localeCompare(a.data))
    const aReceber = todas.filter((p) => p.data >= hoje).sort((a, b) => a.data.localeCompare(b.data))
    return {
      pagas,
      aReceber,
      totalPago: pagas.reduce((s, p) => s + p.valor, 0),
      totalAReceber: aReceber.reduce((s, p) => s + p.valor, 0),
    }
  }, [contratos, hoje])

  if (pagas.length === 0 && aReceber.length === 0) {
    return (
      <Vazio
        icon={Wallet}
        titulo="Nenhuma parcela no cronograma"
        explicacao="Aqui aparecem as parcelas dos contratos ativos deste cliente — as que já venceram e as que ainda vão vencer. Contrato cancelado, pausado ou concluído não entra no fluxo."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">Já venceu (parcelas passadas)</p>
          <p className="mt-1 font-display text-xl font-bold text-foreground">{fmtBRL(totalPago)}</p>
          <p className="text-xs text-muted-foreground">{pagas.length} parcela(s)</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">A receber</p>
          <p className="mt-1 font-display text-xl font-bold text-success">{fmtBRL(totalAReceber)}</p>
          <p className="text-xs text-muted-foreground">{aReceber.length} parcela(s)</p>
        </div>
      </div>

      {aReceber.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <CalendarClock className="h-3 w-3" /> Próximas parcelas
          </h3>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {aReceber.slice(0, 12).map((p, i) => (
              <li key={`${p.contratoId}-${p.data}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link to={`/contratos/${p.contratoId}`} className="text-sm text-foreground hover:text-primary">
                  {fmtData(p.data)}
                </Link>
                <span className="font-mono text-sm tabular-nums text-foreground">{fmtBRL(p.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Conversas ───────────────────────────────────────────────────────────────

export function AbaConversas({ clientId }: { clientId: string | undefined }) {
  const { isAppEnabled } = useIsAppEnabled()
  const { data: conversas = [], isLoading } = useConversasDoCliente(clientId)

  if (!isAppEnabled('chat')) {
    return (
      <Vazio
        icon={MessageSquare}
        titulo="O módulo Conversas está desligado"
        explicacao="As conversas de WhatsApp deste cliente continuam guardadas. Um administrador pode religar o app em Apps."
      />
    )
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando conversas…</p>

  if (conversas.length === 0) {
    return (
      <Vazio
        icon={MessageSquare}
        titulo="Nenhuma conversa ligada a este cliente"
        explicacao="Aparecem aqui as conversas de WhatsApp dos contatos vinculados ao cliente. Se as conversas existem mas não aparecem, provavelmente o contato ainda não foi vinculado a este cadastro."
      />
    )
  }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {conversas.map((c) => (
        <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{c.contato_nome ?? c.contato_numero ?? 'Contato'}</p>
            <p className="text-xs text-muted-foreground">
              {c.status === 'aberta' ? 'Em aberto' : c.status === 'fechada' ? 'Encerrada' : c.status ?? '—'}
              {' · '}última mensagem em {fmtData(c.atualizado_em?.slice(0, 10))}
            </p>
          </div>
          {/* O inbox resolve a conversa a partir do contato (?contato=) — não
              existe rota por id de conversa. */}
          <Link
            to={c.contato_id ? `/conversas?contato=${c.contato_id}` : '/conversas'}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Abrir em Conversas <ExternalLink className="h-3 w-3" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

// ─── Demandas / atendimentos ─────────────────────────────────────────────────

export function AbaDemandas({ clientId }: { clientId: string | undefined }) {
  const { isAppEnabled } = useIsAppEnabled()
  const { data: demandas = [], isLoading } = useDemandasDoCliente(clientId)

  if (!isAppEnabled('atendimento')) {
    return (
      <Vazio
        icon={Headphones}
        titulo="O app de Atendimento está desligado"
        explicacao="Os tickets registrados continuam guardados. Um administrador pode religar o módulo em Ajustes → Módulos ligados."
      />
    )
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>

  if (demandas.length === 0) {
    return (
      <Vazio
        icon={Headphones}
        titulo="Nenhum ticket registrado"
        explicacao="Toda vez que este cliente pedir alguma coisa, registre no Atendimento: é o que faz o pedido parar de se perder na conversa."
      />
    )
  }

  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {demandas.map((d) => {
        const atrasada = !d.concluida_em && d.prazo != null && d.prazo < hoje
        return (
          <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <Link
                to={`/tickets/${d.id}`}
                className="truncate text-sm font-medium text-foreground hover:text-primary"
              >
                {d.codigo ? `${d.codigo} · ` : ''}{d.titulo}
              </Link>
              <p className="text-xs text-muted-foreground">
                {d.etapa_nome ?? 'Sem etapa'}
                {d.responsavel_nome ? ` · ${d.responsavel_nome}` : ''}
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                d.concluida_em
                  ? 'bg-success/15 text-success'
                  : atrasada
                    ? 'bg-danger/15 text-danger'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {d.concluida_em ? (
                <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Concluída</span>
              ) : d.prazo ? (
                `${atrasada ? 'Atrasada · ' : 'Vence '}${fmtData(d.prazo)}`
              ) : (
                'Sem prazo'
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
