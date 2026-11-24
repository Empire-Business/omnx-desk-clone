import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownWideNarrow, ChevronDown, Download, Inbox, Plus, Search, SearchX, Sparkles, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { AvisoDoLote, BarraDeLote, BotaoSelecionar, CartaoDeLote } from '@/components/atendimento/TicketsEmLoteUi'
import { useDesfazerLote, useGravarLote, type ItemDoLote } from '@/hooks/useTicketsEmLote'
import { marcadosDasSugestoesIris, type CandidatoEmLote, type PlanoDoLote } from '@/lib/ticketsEmLote'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { AtendimentoTabs } from '@/components/atendimento/AtendimentoTabs'
import { DemandaForm } from '@/components/atendimento/DemandaForm'
import {
  EsqueletoLista, LinhaTicket, ListaTickets, lerTicket, SelectDs, useAgora, useTicketsComStatus,
} from '@/components/atendimento/TicketUi'
import { useClientes } from '@/hooks/useClientes'
import { useUsers } from '@/hooks/useUsers'
import { useDemandas, type Prioridade } from '@/hooks/useAtendimento'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useAuth } from '@/contexts/AuthContext'
import { ROTULO_PRIORIDADE } from '@/lib/atendimento'
import { FILTROS_VAZIOS, gravarFiltros, lerFiltros, temMaisFiltros, type FiltrosTickets } from '@/lib/filtrosTickets'
import {
  etapaDestino, filaDoStatus, passaNoFiltro, primeiraEtapaAberta, rotuloEtapa, ROTULO_FILTRO_TICKET,
  type FiltroTicket,
} from '@/lib/ticketStatus'
import { resumoDaFila } from '@/lib/ticketEspera'
import { downloadCSV, toCSV } from '@/lib/csv'
import { linhasParaExportar, nomeArquivoTickets } from '@/lib/exportarTickets'
import { cn } from '@/lib/utils'

/**
 * Filtros da lista: as filas do status + "Atrasados" (prazo vencido ou espera
 * de 1 h ou mais) + "Para confirmar" (a Íris sugeriu resolver e espera alguém
 * confirmar). "Para confirmar" só aparece quando há algum, ou quando já está
 * escolhido (link salvo).
 */
type FiltroLista = FiltroTicket | 'atrasados' | 'confirmar'

const FILTROS: FiltroLista[] = ['equipe', 'atrasados', 'confirmar', 'cliente', 'resolvidos', 'todos']
const ROTULO_FILTRO: Record<FiltroLista, string> = {
  ...ROTULO_FILTRO_TICKET, atrasados: 'Atrasados', confirmar: 'Para confirmar',
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const DESCRICAO_PADRAO_VAZIO =
  'Os pedidos que os clientes fazem no WhatsApp viram tickets automaticamente. Você também pode criar um à mão.'

/** Lista vazia sem filtros extras: o que dizer em cada filtro. */
const VAZIO: Record<FiltroLista, { titulo: string; descricao: string }> = {
  equipe: {
    titulo: 'Nada esperando a equipe',
    descricao: 'Todos os pedidos dos clientes já foram respondidos. Quando chegar um pedido novo pelo WhatsApp, ele aparece aqui.',
  },
  atrasados: {
    titulo: 'Nenhum ticket atrasado',
    descricao: 'Nenhum prazo vencido e ninguém esperando a equipe há 1 hora ou mais.',
  },
  confirmar: {
    titulo: 'Nada para confirmar',
    descricao: 'Quando a Íris achar que um pedido foi resolvido, mas não tiver certeza, o ticket aparece aqui para alguém confirmar.',
  },
  cliente: { titulo: 'Nenhum ticket esperando o cliente', descricao: DESCRICAO_PADRAO_VAZIO },
  resolvidos: { titulo: 'Nenhum ticket resolvido ainda', descricao: DESCRICAO_PADRAO_VAZIO },
  todos: { titulo: 'Nenhum ticket ainda', descricao: DESCRICAO_PADRAO_VAZIO },
}

function filtroDaUrl(valor: string | null): FiltroLista {
  return FILTROS.includes(valor as FiltroLista) ? (valor as FiltroLista) : 'equipe'
}

/**
 * Fila de tickets. A pergunta que ela responde é "de quem é a vez?": abre em
 * "Aguardando equipe", com quem espera há mais tempo no topo. No celular cada
 * ticket é um cartão; no computador, uma linha densa — como no hero do DS.
 */
export function DemandasPage() {
  const [params, setParams] = useSearchParams()
  const filtro = filtroDaUrl(params.get('status'))
  const [busca, setBusca] = useState(() => params.get('q') ?? '')
  // Filtros no endereço (ver lib/filtrosTickets): o link copiado abre a mesma
  // lista. `?meus=1` é o que o Início manda na visão Técnico.
  const { soWhatsApp, semResponsavel, meus, clienteId, responsavelId, prioridade, etapaId: etapaDaUrl } = lerFiltros(params)
  const mudarFiltros = (mudanca: Partial<FiltrosTickets>) => setParams(gravarFiltros(params, mudanca), { replace: true })
  const [maisFiltros, setMaisFiltros] = useState(() => temMaisFiltros(lerFiltros(params)))
  const [novaAberta, setNovaAberta] = useState(false)

  const { data: demandas, isLoading, isError } = useDemandas({ situacao: 'todas' })
  const { tickets, etapas } = useTicketsComStatus(demandas)
  // Endereços antigos trazem `?etapa=nova` (nome, não id): etapa que não existe
  // é ignorada, em vez de esvaziar a lista.
  const etapaId = etapas.some((e) => e.id === etapaDaUrl) ? etapaDaUrl : ''
  const { data: clientes } = useClientes()
  const { data: usuarios } = useUsers()
  const { can } = usePermissoes()
  const { user } = useAuth()
  const podeEditar = can('atendimento', 'editar')
  // O relógio da espera anda sozinho: a cor muda aos 15 e aos 60 minutos.
  const agora = useAgora(30_000)

  // Lote: seleção na lista e as quatro ações em cima do que está marcado.
  const [modoSelecao, setModoSelecao] = useState(false)
  const [marcados, setMarcados] = useState<string[]>([])
  const [acaoDoLote, setAcaoDoLote] = useState<'resolver' | 'reabrir' | 'responsavel' | 'prioridade' | null>(null)
  const [comentario, setComentario] = useState('')
  const [prioridadeDoLote, setPrioridadeDoLote] = useState<Prioridade>('media')
  const [responsavelDoLote, setResponsavelDoLote] = useState('')
  const [loteFeito, setLoteFeito] = useState<{
    texto: string
    aviso: string | null
    anteriores: ItemDoLote[]
    /** O desfazer só existe quando houve troca de etapa. */
    podeDesfazer: boolean
  } | null>(null)
  const lote = useGravarLote()
  const desfazer = useDesfazerLote()
  const [erroDoLote, setErroDoLote] = useState<string | null>(null)
  // Para onde vão os tickets do lote: a primeira etapa final e a primeira aberta.
  const etapaResolver = useMemo(() => etapaDestino(etapas, null, 'resolver'), [etapas])
  const etapaAberta = useMemo(() => primeiraEtapaAberta(etapas), [etapas])

  const mudarFiltro = (f: FiltroLista) => {
    const novo = new URLSearchParams(params)
    novo.set('status', f)
    setParams(novo, { replace: true })
  }

  const lidos = useMemo(() => tickets.map((t) => ({ t, l: lerTicket(t, agora) })), [tickets, agora])

  // Filtros que não são de status: aplicados antes, para os contadores dos
  // filtros refletirem a busca atual.
  const candidatos = useMemo(() => {
    const termo = semAcento(busca.trim())
    return lidos.filter(({ t }) => {
      const d = t.demanda
      if (soWhatsApp && !t.wa) return false
      if (semResponsavel && d.responsavel_id) return false
      if (meus && (!user?.id || d.responsavel_id !== user.id)) return false
      if (clienteId && d.cliente_id !== clienteId) return false
      if (responsavelId && d.responsavel_id !== responsavelId) return false
      if (prioridade && d.prioridade !== prioridade) return false
      if (etapaId && d.etapa_id !== etapaId) return false
      if (!termo) return true
      return [d.codigo, d.titulo, d.descricao, d.cliente?.nome, d.responsavel?.nome, t.wa?.textoOrigem]
        .some((v) => v && semAcento(v).includes(termo))
    })
  }, [lidos, busca, soWhatsApp, semResponsavel, meus, user?.id, clienteId, responsavelId, prioridade, etapaId])

  const contagem = useMemo(() => {
    const c: Record<FiltroLista, number> = {
      equipe: 0, atrasados: 0, confirmar: 0, cliente: 0, resolvidos: 0, todos: candidatos.length,
    }
    candidatos.forEach(({ t, l }) => {
      c[filaDoStatus(t.status)] += 1
      if (l.atrasado) c.atrasados += 1
      if (l.paraConfirmar) c.confirmar += 1
    })
    return c
  }, [candidatos])

  const visiveis = useMemo(() => {
    const lista = candidatos.filter(({ t, l }) => (
      filtro === 'atrasados' ? l.atrasado : filtro === 'confirmar' ? l.paraConfirmar : passaNoFiltro(t.status, filtro)
    ))
    return lista.sort((a, b) => {
      const ra = a.t.status === 'resolvido'
      const rb = b.t.status === 'resolvido'
      if (ra !== rb) return ra ? 1 : -1
      const ta = new Date(a.l.inicioEspera).getTime()
      const tb = new Date(b.l.inicioEspera).getTime()
      // Abertos: quem espera há mais tempo primeiro. Resolvidos: os mais recentes.
      return ra ? tb - ta : ta - tb
    })
  }, [candidatos, filtro])

  const resumo = resumoDaFila(visiveis.map(({ l }) => l))

  const temFiltroExtra = Boolean(busca || soWhatsApp || semResponsavel || meus || clienteId || responsavelId || prioridade || etapaId)
  const limparFiltros = () => {
    setBusca('')
    const novo = gravarFiltros(params, FILTROS_VAZIOS)
    novo.delete('q')
    setParams(novo, { replace: true })
  }

  const botaoNovo = podeEditar && (
    <button type="button" onClick={() => setNovaAberta(true)} className="btn btn-primary">
      <Plus aria-hidden /> Novo ticket
    </button>
  )

  // Candidatos do lote: o que está visível com o filtro atual, no formato da regra pura.
  const candidatosDoLote = useMemo<CandidatoEmLote[]>(
    () =>
      visiveis.map(({ t }) => ({
        id: t.demanda.id,
        codigo: t.demanda.codigo,
        titulo: t.demanda.titulo,
        status: t.status,
        etapaId: t.demanda.etapa_id,
        confianca: t.wa?.sugestao?.confianca ?? null,
        motivo: t.wa?.sugestao?.motivo ?? null,
      })),
    [visiveis],
  )

  const marcar = (id: string, marcado: boolean) =>
    setMarcados((m) => (
      marcado ? (m.includes(id) ? m : [...m, id]) : m.filter((x) => x !== id)
    ))

  // Trocou o filtro: o que saiu da lista sai da seleção, senão o lote gravaria
  // ticket que a pessoa não está mais vendo.
  const idsNaLista = useMemo(() => new Set(candidatosDoLote.map((c) => c.id)), [candidatosDoLote])
  if (marcados.some((id) => !idsNaLista.has(id))) {
    setMarcados((atual) => atual.filter((id) => idsNaLista.has(id)))
  }

  const sairDaSelecao = () => {
    setModoSelecao(false)
    setMarcados([])
    setAcaoDoLote(null)
    setComentario('')
  }

  /** "Confirmar as sugestões da Íris": só as de confiança alta vêm marcadas. */
  const marcarSugestoesDaIris = () => {
    setModoSelecao(true)
    setMarcados(marcadosDasSugestoesIris(candidatosDoLote))
  }

  const confirmarLote = async (plano: PlanoDoLote) => {
    if (!acaoDoLote || !podeEditar) return
    // Guarda: sem etapa de destino não se grava nada. `etapa_id: null` tiraria o
    // ticket da fila dele, que é pior do que não fazer o lote.
    const etapaDoLote = acaoDoLote === 'resolver' ? etapaResolver : acaoDoLote === 'reabrir' ? etapaAberta : null
    if ((acaoDoLote === 'resolver' || acaoDoLote === 'reabrir') && !etapaDoLote?.id) {
      setErroDoLote(
        acaoDoLote === 'resolver'
          ? 'Não há etapa final configurada neste funil, então não dá para resolver em lote.'
          : 'Não há etapa aberta configurada neste funil, então não dá para reabrir em lote.',
      )
      return
    }
    const patch: Record<string, unknown> =
      etapaDoLote ? { etapa_id: etapaDoLote.id }
      : acaoDoLote === 'prioridade' ? { prioridade: prioridadeDoLote }
      : { responsavel_id: responsavelDoLote || null }
    setErroDoLote(null)
    try {
      const r = await lote.mutateAsync({
        itens: plano.vao.map((c) => ({ id: c.id, codigo: c.codigo, etapaId: c.etapaId })),
        patch,
        acao: acaoDoLote === 'resolver' || acaoDoLote === 'reabrir' ? acaoDoLote : 'atualizar',
        comentario: acaoDoLote === 'resolver' || acaoDoLote === 'reabrir' ? comentario.trim() || undefined : undefined,
      })
      setAcaoDoLote(null)
      setComentario('')
      setLoteFeito({
        texto: r.resumo,
        aviso: r.comentariosFalhos.length > 0
          ? `${r.comentariosFalhos.length === 1 ? 'O comentário de 1 ticket não foi gravado' : `O comentário de ${r.comentariosFalhos.length} tickets não foi gravado`}.`
          : null,
        anteriores: r.anteriores,
        podeDesfazer: acaoDoLote === 'resolver' || acaoDoLote === 'reabrir',
      })
      setMarcados([])
      setModoSelecao(false)
    } catch {
      // Mensagem do banco não ajuda quem está na tela; o que importa é que nada
      // foi gravado e que dá para tentar de novo.
      setErroDoLote('Não consegui gravar o lote. Tente de novo em instantes.')
    }
  }

  const desfazerLote = async () => {
    if (!loteFeito) return
    try {
      const r = await desfazer.mutateAsync(loteFeito.anteriores)
      if (r.falhos.length > 0) {
        setErroDoLote(
          r.falhos.length === 1
            ? '1 ticket não voltou para a etapa anterior. Abra o ticket e confira.'
            : `${r.falhos.length} tickets não voltaram para a etapa anterior. Abra-os e confira.`,
        )
      }
      setLoteFeito(null)
    } catch {
      setErroDoLote('Não consegui desfazer. Tente de novo em instantes.')
    }
  }

  return (
    <PageContainer className="gap-5 md:gap-6">
      <PageHeader
        title="Tickets"
        description="Cada pedido de cliente vira um ticket. Os que estão esperando a equipe aparecem primeiro."
        action={botaoNovo}
      />

      <AtendimentoTabs />

      <section aria-label="Buscar e filtrar" className="grid gap-3">
        <label className="search relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            className="input pl-9 text-base sm:text-sm"
            placeholder="Buscar cliente, pedido, número ou mensagem"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar tickets"
          />
        </label>

        {/* Filtros de status — a decisão principal da tela. Rolam de lado no celular. */}
        <div
          role="group"
          aria-label="Filtrar por status"
          className="-mx-4 flex snap-x snap-proximity scroll-px-4 gap-2 overflow-x-auto px-4 pb-0.5 scrollbar-hide sm:mx-0 sm:scroll-px-0 sm:flex-wrap sm:px-0 md:gap-1.5"
        >
          {FILTROS.filter((f) => f !== 'confirmar' || contagem.confirmar > 0 || filtro === 'confirmar').map((f) => (
            <ChipFiltro
              key={f}
              ativo={f === filtro}
              alerta={f === 'atrasados'}
              contador={contagem[f]}
              onClick={() => mudarFiltro(f)}
            >
              {ROTULO_FILTRO[f]}
            </ChipFiltro>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip ativo={soWhatsApp} onClick={() => mudarFiltros({ soWhatsApp: !soWhatsApp })}>Do WhatsApp</Chip>
          <Chip ativo={semResponsavel} onClick={() => mudarFiltros({ semResponsavel: !semResponsavel, meus: false })}>Sem responsável</Chip>
          <Chip ativo={meus} onClick={() => mudarFiltros({ meus: !meus, semResponsavel: false })}>Meus</Chip>
          <button
            type="button"
            onClick={() => setMaisFiltros((v) => !v)}
            aria-expanded={maisFiltros}
            className="btn btn-ghost btn-sm"
          >
            Mais filtros
            <ChevronDown className={cn('transition-transform duration-base', maisFiltros && 'rotate-180')} aria-hidden />
          </button>
          {temFiltroExtra && (
            <button type="button" onClick={limparFiltros} className="btn btn-ghost btn-sm">
              <X aria-hidden /> Limpar
            </button>
          )}
        </div>

        {/* Lote: no celular o modo de seleção liga por aqui (alvo de 44 px). */}
        {podeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="md:hidden">
              <BotaoSelecionar
                ativo={modoSelecao}
                onClick={() => (modoSelecao ? sairDaSelecao() : setModoSelecao(true))}
              />
            </span>
            {filtro === 'confirmar' && candidatosDoLote.length > 0 && (
              <button type="button" onClick={marcarSugestoesDaIris} className="btn btn-outline h-11 px-3 text-[13.5px] focus-ds md:h-8">
                <Sparkles aria-hidden /> Confirmar as sugestões da Íris
              </button>
            )}
          </div>
        )}

        {maisFiltros && (
          <div className="grid animate-row-in gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <SelectDs value={clienteId} onChange={(e) => mudarFiltros({ clienteId: e.target.value })} aria-label="Cliente">
              <option value="">Todos os clientes</option>
              {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </SelectDs>
            <SelectDs value={responsavelId} onChange={(e) => mudarFiltros({ responsavelId: e.target.value })} aria-label="Responsável">
              <option value="">Todos os responsáveis</option>
              {(usuarios ?? []).filter((u) => u.ativo).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </SelectDs>
            <SelectDs value={prioridade} onChange={(e) => mudarFiltros({ prioridade: e.target.value as Prioridade | '' })} aria-label="Prioridade">
              <option value="">Todas as prioridades</option>
              {(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>)}
            </SelectDs>
            <SelectDs value={etapaId} onChange={(e) => mudarFiltros({ etapaId: e.target.value })} aria-label="Etapa">
              <option value="">Todas as etapas</option>
              {etapas.map((e) => <option key={e.id} value={e.id}>{rotuloEtapa(e, etapas)}</option>)}
            </SelectDs>
          </div>
        )}
      </section>

      <section aria-label="Lista de tickets" className="grid gap-2">
        {!isLoading && !isError && visiveis.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-[12.5px] text-muted-foreground">
            <span className="font-medium" aria-live="polite">
              <b className="font-[650] text-fg-1">{resumo.total}</b> {resumo.total === 1 ? 'ticket' : 'tickets'} ·{' '}
              {resumo.pedemAcao > 0
                ? <b className={cn('font-[650]', resumo.temAtraso ? 'text-danger' : 'text-fg-1')}>{resumo.textoAcao}</b>
                : resumo.textoAcao}
            </span>
            <span className="inline-flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden />
                {filtro === 'resolvidos' ? 'Mais recentes primeiro' : 'Quem espera há mais tempo primeiro'}
              </span>
              {/* Exporta o que está na tela, com os filtros de agora — como no Clients. */}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => downloadCSV(nomeArquivoTickets(new Date()), toCSV(linhasParaExportar(visiveis.map(({ t }) => t))))}
              >
                <Download aria-hidden /> Exportar CSV
              </button>
            </span>
          </div>
        )}

        {isLoading && <EsqueletoLista linhas={5} />}

        {isError && (
          <div role="alert" className="rounded-lg border border-card-border bg-card p-4 text-sm text-muted-foreground">
            Não foi possível carregar os tickets. Atualize a página; se continuar, use "Reportar problema".
          </div>
        )}

        {!isLoading && !isError && visiveis.length === 0 && (
          <EmptyState
            icon={temFiltroExtra ? SearchX : Inbox}
            title={temFiltroExtra ? 'Nenhum ticket com esses filtros' : VAZIO[filtro].titulo}
            description={
              temFiltroExtra ? 'Confira a grafia, busque pelo número do ticket ou limpe os filtros.' : VAZIO[filtro].descricao
            }
            action={
              temFiltroExtra ? (
                <button type="button" onClick={limparFiltros} className="btn btn-secondary">
                  Limpar filtros
                </button>
              ) : filtro !== 'equipe' ? (
                <button type="button" onClick={() => mudarFiltro('equipe')} className="btn btn-secondary">
                  Ver os que esperam a equipe
                </button>
              ) : (
                botaoNovo
              )
            }
          />
        )}

        {!isLoading && !isError && visiveis.length > 0 && modoSelecao && podeEditar && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-card-border bg-card px-3 text-[13px] text-fg-2">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--foreground)]"
              checked={marcados.length > 0 && marcados.length === visiveis.length}
              ref={(el) => {
                if (el) el.indeterminate = marcados.length > 0 && marcados.length < visiveis.length
              }}
              onChange={() => setMarcados(marcados.length === visiveis.length ? [] : visiveis.map(({ t }) => t.demanda.id))}
            />
            <span>
              {marcados.length === visiveis.length ? 'Desmarcar todos deste filtro' : `Selecionar todos deste filtro (${visiveis.length})`}
            </span>
          </label>
        )}

        {!isLoading && !isError && visiveis.length > 0 && (
          <ListaTickets>
            {visiveis.map(({ t }) => (
              <LinhaTicket
                key={t.demanda.id}
                ticket={t}
                agora={agora}
                selecao={
                  podeEditar && modoSelecao
                    ? {
                        marcado: marcados.includes(t.demanda.id),
                        onMarcar: (marcado: boolean) => marcar(t.demanda.id, marcado),
                        // A linha acompanha a ação que está sendo confirmada: o
                        // que já está resolvido não vai para "Resolver", e o
                        // aberto não vai para "Reabrir".
                        desabilitado:
                          acaoDoLote === 'resolver' ? t.status === 'resolvido'
                          : acaoDoLote === 'reabrir' ? t.status !== 'resolvido'
                          : false,
                      }
                    : undefined
                }
              />
            ))}
          </ListaTickets>
        )}
      </section>

      {/* Sem nada marcado a barra não aparece: ela só abre um cartão vazio. */}
      {modoSelecao && podeEditar && marcados.length > 0 && (
        <BarraDeLote
          total={marcados.length}
          carregando={lote.isPending}
          podeEditar={podeEditar}
          podeResolver={Boolean(etapaResolver?.id)}
          podeReabrir={Boolean(etapaAberta?.id)}
          onAcao={(a) => setAcaoDoLote(a)}
          onLimpar={sairDaSelecao}
        />
      )}

      {acaoDoLote !== null && podeEditar && (
        <CartaoDeLote
          key={acaoDoLote}
          open
          acao={acaoDoLote ?? 'resolver'}
          candidatos={candidatosDoLote.filter((c) => marcados.includes(c.id))}
          marcados={marcados}
          comentario={comentario}
          onComentario={setComentario}
          prioridade={prioridadeDoLote}
          onPrioridade={setPrioridadeDoLote}
          responsavelId={responsavelDoLote}
          onResponsavel={setResponsavelDoLote}
          responsaveis={(usuarios ?? []).map((u) => ({ id: u.id, nome: u.nome }))}
          ocupado={lote.isPending}
          podeEditar={podeEditar}
          onFechar={() => setAcaoDoLote(null)}
          onConfirmar={(plano) => void confirmarLote(plano)}
        />
      )}

      {loteFeito && (
        <AvisoDoLote
          texto={loteFeito.texto}
          aviso={loteFeito.aviso}
          onDesfazer={loteFeito.podeDesfazer ? () => void desfazerLote() : null}
          onFechar={() => setLoteFeito(null)}
        />
      )}

      {erroDoLote && (
        <AvisoDoLote texto={`Não deu: ${erroDoLote}`} onFechar={() => setErroDoLote(null)} />
      )}

      <DemandaForm open={novaAberta} onClose={() => setNovaAberta(false)} />
    </PageContainer>
  )
}

/** Filtro de status (DS `.fchip`): ativo em tinta escura; "Atrasados" em vermelho. */
function ChipFiltro({
  ativo, alerta = false, contador, onClick, children,
}: {
  ativo: boolean
  alerta?: boolean
  contador: number
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border pl-3.5 pr-2 text-[13.5px] font-semibold focus-ds',
        'transition-[background-color,border-color,color] duration-fast ease-std',
        'md:h-7 md:rounded-md md:pl-2.5 md:pr-1.5 md:text-[12.5px]',
        ativo
          ? 'border-foreground bg-foreground text-background'
          : cn('border-stroke-subtle bg-card hover:border-stroke-default hover:bg-muted', alerta ? 'text-danger' : 'text-fg-2'),
      )}
    >
      {children}
      <span
        className={cn(
          'count',
          ativo ? 'bg-[color-mix(in_srgb,var(--background)_22%,transparent)] text-background' : alerta && contador > 0 && 'is-danger',
        )}
      >
        {contador}
      </span>
    </button>
  )
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={ativo} onClick={onClick} className="chip focus-ds max-sm:h-11">
      {children}
    </button>
  )
}
