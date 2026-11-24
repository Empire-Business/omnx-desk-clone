import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellOff, Check, ChevronDown, Link2, Loader2, MessageCircle, RefreshCw, Ticket, Undo2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsAppEnabled } from '@/hooks/useAppModules'
import { useTicketsAbertosPorCliente } from '@/hooks/useAtendimentoTickets'
import {
  mensagemErroWa, useAlertasHoje, useDesfazerIgnorar, useIgnorarAlerta,
} from '@/hooks/useAutomacoesWa'
import {
  LIMITE_MOTIVO_IGNORAR, agruparAlertas, formataDataCurta, formataDesde, linkVincularGrupo, montarIgnorado, rotuloModoIgnorado,
  rotuloTipoAlerta, textoOcultos, type AlertaHoje, type EscolhaIgnorar, type IgnoradoWa,
} from '@/lib/automacoesWa'
import { cn } from '@/lib/utils'
import { Dica, EsqueletoAba, MensagemErro, Secao } from './comum'
import { botaoPrimario, botaoSecundario, campo, foco } from './estilos'

/** Botão pequeno das linhas de alerta. */
const botaoLinha = cn(botaoSecundario, 'px-2.5 py-1.5 text-xs')
/** Quanto tempo o "Desfazer" fica na tela. */
const TEMPO_DESFAZER_MS = 8000

interface ItemDesfazer {
  chave: string
  /** Nome do cliente, para o aviso depois de desfazer. */
  quem: string
  texto: string
  /** id da linha gravada; null enquanto ainda está salvando. */
  id: string | null
}

/** Para quem não tem cliente com nome (ex.: contato solto). */
const nomeDe = (a: { cliente: string | null }) => a.cliente?.trim() || 'Contato sem nome'

/** Frase do "Desfazer": o que acabou de acontecer com o alerta. */
function fraseFeito(escolha: EscolhaIgnorar, ate: string | null): string {
  switch (escolha.acao) {
    case 'resolvido': return 'marcado como resolvido'
    case 'silenciar': return `silenciado ${rotuloModoIgnorado('ate_data', ate)}`
    case 'ate_novidade': return 'silenciado até o cliente escrever de novo'
    case 'nunca': return escolha.escopo === 'cliente' ? 'nenhum alerta deste cliente daqui para a frente' : 'não vai mais alertar este tipo'
  }
}

/**
 * Aba "Pontos de atenção": os alertas que entrariam no relatório de hoje.
 * O gestor marca o que já foi resolvido ou não precisa mais aparecer
 * (ex.: "a Full Sales cancelou o contrato").
 */
export function AlertasTab() {
  const { can } = usePermissoes()
  // Mesmo critério do app: só quem administra o Automações WhatsApp mexe.
  const podeEditar = can('automacoes-wa', 'admin')
  const consulta = useAlertasHoje()
  // Tickets abertos por cliente: só leitura, só para quem vê Tickets.
  const { isAppEnabled } = useIsAppEnabled()
  const veTickets = isAppEnabled('atendimento') && can('atendimento', 'ver')
  const idsClientes = (consulta.data?.alertas ?? []).map((a) => a.client_id).filter((x): x is string => Boolean(x))
  const ticketsAbertos = useTicketsAbertosPorCliente(idsClientes, veTickets).data
  const ignorar = useIgnorarAlerta()
  const desfazer = useDesfazerIgnorar()
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [desfazeres, setDesfazeres] = useState<ItemDesfazer[]>([])
  const [naoAlertar, setNaoAlertar] = useState<AlertaHoje | null>(null)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const sequencia = useRef(0)

  useEffect(() => {
    const t = timers.current
    return () => t.forEach(clearTimeout)
  }, [])

  const tirarDesfazer = (chave: string) => {
    clearTimeout(timers.current.get(chave))
    timers.current.delete(chave)
    setDesfazeres((l) => l.filter((x) => x.chave !== chave))
  }

  const agir = (alerta: AlertaHoje, escolha: EscolhaIgnorar) => {
    const novo = montarIgnorado(alerta, escolha)
    if (!novo) return
    setErro(null)
    setAviso(null)
    sequencia.current += 1
    const chave = `${alerta.chave_alerta}:${sequencia.current}`
    const texto = `${nomeDe(alerta)}: ${fraseFeito(escolha, novo.ate)}.`
    setDesfazeres((l) => [...l.slice(-2), { chave, quem: nomeDe(alerta), texto, id: null }])
    timers.current.set(chave, setTimeout(() => tirarDesfazer(chave), TEMPO_DESFAZER_MS))
    ignorar.mutate({ novo, chave: alerta.chave_alerta }, {
      onSuccess: (id) => setDesfazeres((l) => l.map((x) => (x.chave === chave ? { ...x, id } : x))),
      onError: (e) => {
        tirarDesfazer(chave)
        setErro(`${mensagemErroWa(e, 'Não foi possível salvar.')} O alerta de ${nomeDe(alerta)} voltou para a lista.`)
      },
    })
  }

  const voltar = (id: string, quem: string, chaveDesfazer?: string) => {
    if (chaveDesfazer) tirarDesfazer(chaveDesfazer)
    setErro(null)
    desfazer.mutate(id, {
      onSuccess: () => setAviso(`${quem} volta a aparecer nos alertas.`),
      onError: (e) => setErro(mensagemErroWa(e, 'Não foi possível desfazer.')),
    })
  }

  if (consulta.isLoading) return <EsqueletoAba />

  if (!consulta.data) {
    return (
      <Secao titulo="Pontos de atenção de hoje">
        <MensagemErro texto={mensagemErroWa(consulta.error, 'Não foi possível carregar os pontos de atenção.')} />
        <button type="button" onClick={() => consulta.refetch()} className={botaoSecundario}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Tentar de novo
        </button>
      </Secao>
    )
  }

  const { alertas, ocultos_por_regra, ignorados } = consulta.data
  // "Esperando resposta" de quem já tem ticket aberto é a mesma espera que a fila de Tickets
  // mostra. Não some: vai para um bloco recolhido abaixo, com as mesmas ações.
  const coberto = (a: AlertaHoje) =>
    a.tipo === 'sem_resposta' && Boolean(a.client_id) && (ticketsAbertos?.get(a.client_id as string) ?? 0) > 0
  const cobertos = alertas.filter(coberto)
  const grupos = agruparAlertas(alertas.filter((a) => !coberto(a)))
  const renderLinha = (a: AlertaHoje) => (
    <LinhaAlerta key={a.chave_alerta} alerta={a} podeEditar={podeEditar}
      ticketsAbertos={a.client_id ? (ticketsAbertos?.get(a.client_id) ?? 0) : 0}
      onAgir={(escolha) => agir(a, escolha)} onNaoAlertar={() => setNaoAlertar(a)} />
  )
  const ocultos = textoOcultos(ocultos_por_regra)

  return (
    <div className="space-y-4">
      <Secao
        titulo={alertas.length === 0 ? 'Pontos de atenção de hoje' : `Pontos de atenção de hoje (${alertas.length})`}
        descricao={podeEditar
          ? 'O que entraria no relatório se ele saísse agora. Marque o que já foi resolvido ou não precisa mais aparecer.'
          : 'O que entraria no relatório se ele saísse agora.'}
        acao={
          <button type="button" onClick={() => consulta.refetch()} disabled={consulta.isFetching} className={botaoLinha}>
            <RefreshCw className={cn('h-3.5 w-3.5', consulta.isFetching && 'animate-spin')} aria-hidden />
            {consulta.isFetching ? 'Atualizando…' : 'Atualizar'}
          </button>
        }>
        <MensagemErro texto={erro ?? (consulta.isError ? 'Não foi possível atualizar a lista. Mostrando a última que carregou.' : null)} />
        <p role="status" className={cn('text-sm text-success', !aviso && 'sr-only')}>{aviso}</p>

        {grupos.length === 0 && cobertos.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-success" aria-hidden />
            Nenhum ponto de atenção agora. Tudo em dia.
          </p>
        ) : (
          <div className="space-y-5">
            {grupos.map((g) => (
              <section key={g.tipo} aria-labelledby={`grupo-${g.tipo}`} className="space-y-1">
                <h3 id={`grupo-${g.tipo}`} className="text-sm font-semibold text-foreground">
                  {g.titulo} <span className="font-normal text-muted-foreground">({g.alertas.length})</span>
                </h3>
                <ul className="divide-y divide-border">
                  {g.alertas.map(renderLinha)}
                </ul>
              </section>
            ))}
            {cobertos.length > 0 && (
              <details className="rounded-lg border border-border bg-card">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
                  Esperando resposta, já com ticket aberto ({cobertos.length})
                </summary>
                <p className="px-3 text-xs text-muted-foreground">
                  Estes clientes também aparecem na fila de Tickets. Estão aqui só para você não perder nenhum.
                </p>
                <ul className="divide-y divide-border px-3">{cobertos.map(renderLinha)}</ul>
              </details>
            )}
          </div>
        )}

        {!podeEditar && (
          <Dica>Só o administrador do app pode marcar um alerta como resolvido ou silenciar.</Dica>
        )}
        {(ocultos.automaticos || ocultos.pelo_gestor > 0) && (
          <div className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            {ocultos.automaticos && <p>O sistema já tirou automaticamente: {ocultos.automaticos}.</p>}
            {ocultos.pelo_gestor > 0 && (
              <p>
                {ocultos.pelo_gestor === 1 ? '1 alerta ficou' : `${ocultos.pelo_gestor} alertas ficaram`} de fora porque a equipe silenciou (veja em Silenciados, abaixo).
              </p>
            )}
          </div>
        )}
      </Secao>

      <Silenciados ignorados={ignorados} podeEditar={podeEditar} ocupado={desfazer.isPending}
        onVoltar={(i) => voltar(i.id, nomeDe(i))} />

      <BarraDesfazer itens={desfazeres} onDesfazer={(item) => item.id && voltar(item.id, item.quem, item.chave)}
        onFechar={tirarDesfazer} />

      <DialogoNaoAlertar alerta={naoAlertar} onFechar={() => setNaoAlertar(null)}
        onConfirmar={(escolha) => { if (naoAlertar) agir(naoAlertar, escolha); setNaoAlertar(null) }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Uma linha da lista
// ---------------------------------------------------------------------------

function LinhaAlerta({ alerta, podeEditar, ticketsAbertos = 0, onAgir, onNaoAlertar }: {
  alerta: AlertaHoje
  podeEditar: boolean
  /** Tickets abertos do cliente (0 quando não vê Tickets ou não há cliente). */
  ticketsAbertos?: number
  onAgir: (e: EscolhaIgnorar) => void
  onNaoAlertar: () => void
}) {
  const nome = nomeDe(alerta)
  const desde = formataDesde(alerta.desde)
  // Sem tipo conhecido só dá para "nenhum alerta deste cliente"; sem cliente nem contato, nada.
  const podeTipo = montarIgnorado(alerta, { acao: 'resolvido' }) !== null
  const podeCliente = montarIgnorado(alerta, { acao: 'nunca', escopo: 'cliente' }) !== null
  const linkConversa = alerta.conversation_id
    ? alerta.contact_id
      ? `/conversas?contato=${encodeURIComponent(alerta.contact_id)}`
      : alerta.cliente ? `/conversas?cliente=${encodeURIComponent(alerta.cliente)}` : null
    : null
  // Grupo ativo sem cliente: abre a aba Vínculos já no grupo. Some sozinho quando vinculado.
  const linkVincular = linkVincularGrupo(alerta)

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{nome}</span>
          {alerta.nivel && <SeloSatisfacao nivel={alerta.nivel} />}
        </p>
        {alerta.nivel && alerta.motivo
          ? <p className="text-sm text-muted-foreground">{alerta.motivo}</p>
          : alerta.detalhe && <p className="text-sm text-muted-foreground">{alerta.detalhe}</p>}
        {alerta.fontes_pedidos && alerta.fontes_pedidos.length > 0 && <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium">Fontes dos pedidos</summary>
          <ul className="mt-2 space-y-2">{alerta.fontes_pedidos.map((fonte, i) => <li key={`${fonte.message_id}:${i}`}>
            <p>{fonte.autor} · {new Date(fonte.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília)</p>
            {fonte.trecho && <blockquote className="border-l-2 pl-2">{fonte.trecho}</blockquote>}
            <p className="break-all">Mensagem: {fonte.message_id}</p>
          </li>)}</ul>
        </details>}
        {(desde || linkConversa || ticketsAbertos > 0) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {desde && <span>{desde}</span>}
            {ticketsAbertos > 0 && alerta.client_id && (
              <Link to={`/tickets?status=todos&cliente=${encodeURIComponent(alerta.client_id)}`}
                className={cn('inline-flex items-center gap-1 rounded font-medium text-primary underline-offset-4 hover:underline', foco)}>
                <Ticket className="h-3.5 w-3.5" aria-hidden />
                {ticketsAbertos === 1 ? 'Ver o ticket aberto' : `Ver os ${ticketsAbertos} tickets abertos`}<span className="sr-only"> de {nome}</span>
              </Link>
            )}
            {linkConversa && (
              <Link to={linkConversa} className={cn('inline-flex items-center gap-1 rounded font-medium text-primary underline-offset-4 hover:underline', foco)}>
                <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Abrir conversa<span className="sr-only"> com {nome}</span>
              </Link>
            )}
          </p>
        )}
      </div>
      {((podeEditar && (podeTipo || podeCliente)) || linkVincular) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {linkVincular && (
            <Link to={linkVincular} className={cn(botaoLinha, 'no-underline')}>
              <Link2 className="h-3.5 w-3.5" aria-hidden /> Vincular a um cliente<span className="sr-only">: {nome}</span>
            </Link>
          )}
          {podeEditar && podeTipo && (
            <>
              <button type="button" className={botaoLinha} onClick={() => onAgir({ acao: 'resolvido' })}>
                <Check className="h-3.5 w-3.5" aria-hidden /> Resolvido<span className="sr-only">: {nome}</span>
              </button>
              <MenuSilenciar nome={nome} onEscolher={onAgir} />
            </>
          )}
          {podeEditar && (podeTipo || podeCliente) && (
            <button type="button" className={botaoLinha} onClick={onNaoAlertar}>
              <BellOff className="h-3.5 w-3.5" aria-hidden /> Não alertar mais<span className="sr-only">: {nome}</span>
            </button>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Selo do alerta de satisfação: "Insatisfeito" (vermelho) e "Atenção" (âmbar) vêm
 * da análise diária da IA; "Em risco" (cinza) vem de regra — cliente em silêncio,
 * pedido antigo em aberto ou queda de conversas.
 */
function SeloSatisfacao({ nivel }: { nivel: 'insatisfeito' | 'atencao' | 'risco' }) {
  const visual = {
    insatisfeito: {
      rotulo: 'Insatisfeito', titulo: 'Analisado de manhã pela IA lendo as conversas do cliente',
      cor: 'bg-red-100 text-red-800',
    },
    atencao: {
      rotulo: 'Atenção', titulo: 'Analisado de manhã pela IA lendo as conversas do cliente',
      cor: 'bg-note text-note-fg',
    },
    risco: {
      rotulo: 'Em risco', titulo: 'Calculado por regra: silêncio do cliente, pedido antigo em aberto ou queda de conversas',
      cor: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
    },
  }[nivel]
  return (
    <span title={visual.titulo} className={cn('shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium', visual.cor)}>
      {visual.rotulo}
    </span>
  )
}

/** [Silenciar ▾] → 7 dias | 30 dias | até o cliente escrever de novo. */
function MenuSilenciar({ nome, onEscolher }: { nome: string; onEscolher: (e: EscolhaIgnorar) => void }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const gatilho = useRef<HTMLButtonElement>(null)
  const idLista = useId()

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const escolher = (e: EscolhaIgnorar) => { setAberto(false); onEscolher(e) }
  const opcoes: { rotulo: string; escolha: EscolhaIgnorar }[] = [
    { rotulo: 'Por 7 dias', escolha: { acao: 'silenciar', dias: 7 } },
    { rotulo: 'Por 30 dias', escolha: { acao: 'silenciar', dias: 30 } },
    { rotulo: 'Até o cliente escrever de novo', escolha: { acao: 'ate_novidade' } },
  ]

  return (
    <div ref={caixa} className="relative"
      onKeyDown={(e) => { if (e.key === 'Escape' && aberto) { e.stopPropagation(); setAberto(false); gatilho.current?.focus() } }}
      onBlur={(e) => { if (!caixa.current?.contains(e.relatedTarget as Node)) setAberto(false) }}>
      <button ref={gatilho} type="button" className={botaoLinha} aria-expanded={aberto} aria-controls={idLista}
        onClick={() => setAberto((v) => !v)}>
        Silenciar<span className="sr-only">: {nome}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', aberto && 'rotate-180')} aria-hidden />
      </button>
      {aberto && (
        <ul id={idLista} aria-label={`Silenciar ${nome} por quanto tempo`}
          className="absolute right-0 top-full z-20 mt-1 w-60 rounded-lg border border-border bg-card p-1 shadow-pop">
          {opcoes.map((o, i) => (
            <li key={o.rotulo}>
              <button type="button" autoFocus={i === 0} onClick={() => escolher(o.escolha)}
                className={cn('w-full rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted', foco)}>
                {o.rotulo}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// "Não alertar mais": só este tipo ou o cliente inteiro, com motivo opcional
// ---------------------------------------------------------------------------

function DialogoNaoAlertar({ alerta, onFechar, onConfirmar }: {
  alerta: AlertaHoje | null
  onFechar: () => void
  onConfirmar: (e: EscolhaIgnorar) => void
}) {
  return (
    <Modal open={alerta !== null} onClose={onFechar} size="sm"
      title={`Não alertar mais sobre ${alerta ? nomeDe(alerta) : ''}?`}
      description="Dá para voltar atrás depois, em Silenciados, no fim desta página.">
      {/* key: cada vez que abre, o formulário começa do zero. */}
      {alerta && <FormNaoAlertar key={alerta.chave_alerta} alerta={alerta} onFechar={onFechar} onConfirmar={onConfirmar} />}
    </Modal>
  )
}

function FormNaoAlertar({ alerta, onFechar, onConfirmar }: {
  alerta: AlertaHoje
  onFechar: () => void
  onConfirmar: (e: EscolhaIgnorar) => void
}) {
  const nome = nomeDe(alerta)
  const podeTipo = montarIgnorado(alerta, { acao: 'resolvido' }) !== null
  const [escopo, setEscopo] = useState<'tipo' | 'cliente'>(podeTipo ? 'tipo' : 'cliente')
  const [motivo, setMotivo] = useState('')
  const idMotivo = useId()

  const opcoes: { valor: 'tipo' | 'cliente'; titulo: string; descricao: string; desabilitado?: boolean }[] = [
    {
      valor: 'tipo',
      titulo: 'Só este tipo de alerta',
      descricao: `Para de avisar "${rotuloTipoAlerta(alerta.tipo).toLowerCase()}" sobre ${nome}. Os outros avisos continuam.`,
      desabilitado: !podeTipo,
    },
    {
      valor: 'cliente',
      titulo: 'Nenhum alerta deste cliente',
      descricao: `${nome} sai do relatório de vez (ex.: cancelou o contrato).`,
    },
  ]

  return (
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault()
        onConfirmar({ acao: 'nunca', escopo, motivo })
      }}>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-foreground">O que parar de alertar</legend>
          {opcoes.map((o, i) => (
            <label key={o.valor}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
                escopo === o.valor ? 'border-primary bg-primary-muted' : 'border-border hover:bg-muted/50',
                o.desabilitado && 'cursor-not-allowed opacity-60',
              )}>
              <input type="radio" name="escopo-nao-alertar" value={o.valor} checked={escopo === o.valor}
                disabled={o.desabilitado} autoFocus={i === (podeTipo ? 0 : 1)}
                onChange={() => setEscopo(o.valor)} className="mt-1 accent-primary" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{o.titulo}</span>
                <span className="block text-xs text-muted-foreground">{o.descricao}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="space-y-1">
          <label htmlFor={idMotivo} className="text-sm text-foreground">Motivo <span className="text-muted-foreground">(opcional)</span></label>
          <input id={idMotivo} className={cn(campo, 'w-full')} value={motivo} maxLength={LIMITE_MOTIVO_IGNORAR}
            autoComplete="off" placeholder="ex.: cancelou o contrato" onChange={(e) => setMotivo(e.target.value)} />
          <p className="text-xs text-muted-foreground">Ajuda a equipe a lembrar por que este cliente saiu dos alertas.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className={botaoSecundario}>Cancelar</button>
          <button type="submit" className={botaoPrimario}><BellOff className="h-4 w-4" aria-hidden /> Não alertar mais</button>
        </div>
      </form>
  )
}

// ---------------------------------------------------------------------------
// Silenciados (recolhido)
// ---------------------------------------------------------------------------

function Silenciados({ ignorados, podeEditar, ocupado, onVoltar }: {
  ignorados: IgnoradoWa[]
  podeEditar: boolean
  ocupado: boolean
  onVoltar: (i: IgnoradoWa) => void
}) {
  const ordenados = [...ignorados].sort((a, b) => b.created_at.localeCompare(a.created_at))
  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className={cn('flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg p-4 [&::-webkit-details-marker]:hidden', foco)}>
        <span>
          <span className="font-display text-base font-semibold text-foreground">Silenciados ({ignorados.length})</span>
          <span className="block text-sm text-muted-foreground">Clientes e alertas que a equipe pediu para não aparecer.</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-4 pb-4">
        {ordenados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada silenciado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {ordenados.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">{nomeDe(i)}</span>
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                      {rotuloModoIgnorado(i.modo, i.ate)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{rotuloTipoAlerta(i.tipo)}</p>
                  {i.motivo && <p className="text-sm text-foreground">“{i.motivo}”</p>}
                  <p className="text-xs text-muted-foreground">
                    {i.criado_por_nome ? `Por ${i.criado_por_nome}, ` : ''}{formataDataCurta(i.created_at)}
                  </p>
                </div>
                {podeEditar && (
                  <button type="button" className={cn(botaoLinha, 'shrink-0 self-start')} disabled={ocupado} onClick={() => onVoltar(i)}>
                    <Undo2 className="h-3.5 w-3.5" aria-hidden /> Voltar a alertar<span className="sr-only">: {nomeDe(i)}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}

// ---------------------------------------------------------------------------
// "Desfazer" por alguns segundos, no rodapé da tela
// ---------------------------------------------------------------------------

function BarraDesfazer({ itens, onDesfazer, onFechar }: {
  itens: ItemDesfazer[]
  onDesfazer: (i: ItemDesfazer) => void
  onFechar: (chave: string) => void
}) {
  return (
    <div role="status" aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-4">
      {itens.map((i) => (
        <div key={i.chave}
          className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-foreground px-4 py-2.5 text-sm text-background shadow-pop">
          <span className="min-w-0 flex-1">{i.texto}</span>
          {i.id ? (
            <button type="button" onClick={() => onDesfazer(i)}
              className={cn('rounded px-2 py-1 font-semibold underline-offset-4 hover:underline', foco)}>
              Desfazer
            </button>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Salvando" />
          )}
          <button type="button" onClick={() => onFechar(i.chave)} aria-label="Fechar aviso"
            className={cn('rounded px-1 text-background/70 hover:text-background', foco)}>×</button>
        </div>
      ))}
    </div>
  )
}
