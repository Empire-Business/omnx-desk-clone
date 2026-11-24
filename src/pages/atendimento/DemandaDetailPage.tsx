import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  CircleAlert, CircleCheck, CircleDashed, ExternalLink, Hand, History, Hourglass, MessageSquare, RotateCcw, Send, Timer, Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AbasRolaveis } from '@/components/ui/AbasRolaveis'
import {
  ConversaDoTicketPainel, conversaTemFalha, linkDoChat, textoDaMensagem,
} from '@/components/atendimento/ConversaDoTicket'
import {
  AvatarCliente, ResponsavelTicket, SeloWhatsApp, SelectDs, StatusTicketBadge, useAcessoAoChat, useAgora,
} from '@/components/atendimento/TicketUi'
import { useClientes } from '@/hooks/useClientes'
import { useUsers } from '@/hooks/useUsers'
import {
  useDemanda, useAtendimentoTipos, useAtendimentoEtapas, useAtualizarDemanda,
  useExcluirDemanda, useComentarios, useComentar, useHistoricoDemanda,
  useOrigemWhatsAppDemanda, useRecusarSugestaoIris, useSegmentoAtendimento,
  type Aprovacao, type CamposEditaveisDemanda, type EventoHistorico, type Prioridade,
} from '@/hooks/useAtendimento'
import { useConversaDoTicket } from '@/hooks/useAtendimentoTickets'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useAuth } from '@/contexts/AuthContext'
import {
  dataHora, ROTULO_APROVACAO, ROTULO_PRIORIDADE, situacaoPrazo,
} from '@/lib/atendimento'
import {
  autorDoHistorico, descreverConfianca, etapaDestino, EXPLICACAO_STATUS_TICKET, inicioDaEspera, primeiraEtapaAberta,
  rotuloEtapa, rotuloNomeEtapa, statusDoTicket, textoPrazoTicket, ticketResolvido, ultimaMensagemDaConversa,
  type EtapaBasica, type StatusTicket,
} from '@/lib/ticketStatus'
import {
  esperaCronometrada, faixaDeEspera, minutosDesde, pontosDoResumo, prazoVencido, textoCronometro, textoDuracao,
  ticketAtrasado,
} from '@/lib/ticketEspera'
import { clienteEscreveuDepois, lerSugestao, textoHistoricoSugestao, textoRazaoSugestao } from '@/lib/sugestaoIris'
import { cn } from '@/lib/utils'
import { tiposSelecionaveisAtendimento } from '@/lib/formatosAtendimento'

const ROTULO_CAMPO: Record<string, string> = {
  etapa: 'a etapa',
  responsavel: 'o responsável',
  prazo: 'o prazo',
  prioridade: 'a prioridade',
  aprovacao: 'a aprovação',
}

/** Traduz o valor gravado no histórico (enum ou nome de etapa) para a tela. */
function valorLegivel(campoHist: string, valor: string | null, etapas: readonly EtapaBasica[]): string {
  if (valor === null || valor === '') return '—'
  if (campoHist === 'etapa') return rotuloNomeEtapa(valor, etapas)
  if (campoHist === 'prioridade') return ROTULO_PRIORIDADE[valor as Prioridade] ?? valor
  if (campoHist === 'aprovacao') return ROTULO_APROVACAO[valor as Aprovacao] ?? valor
  return valor
}

/**
 * Frase do histórico: "Íris marcou como resolvido", "Ana reabriu o ticket"…
 * `semAutor`: a frase já diz quem agiu ("Sugestão da Íris: …"); quem confirmou
 * ou recusou entra no detalhe.
 */
function fraseDoHistorico(
  h: EventoHistorico,
  etapas: readonly EtapaBasica[],
): { acao: string; detalhe?: string; semAutor?: boolean } {
  if (h.campo === 'sugestao_ia') {
    const nome = h.autor?.nome?.trim()
    return { acao: textoHistoricoSugestao(h.valor_para), detalhe: nome ? `por ${nome}` : undefined, semAutor: true }
  }
  if (h.campo === 'etapa') {
    const final = (nome: string | null) => Boolean(nome && etapas.find((e) => e.nome === nome)?.is_final)
    if (final(h.valor_para) && !final(h.valor_de)) return { acao: 'marcou como resolvido' }
    if (final(h.valor_de) && !final(h.valor_para)) {
      return { acao: 'reabriu o ticket', detalhe: `na etapa ${valorLegivel('etapa', h.valor_para, etapas)}` }
    }
  }
  return {
    acao: `mudou ${ROTULO_CAMPO[h.campo] ?? h.campo}`,
    detalhe: `de ${valorLegivel(h.campo, h.valor_de, etapas)} para ${valorLegivel(h.campo, h.valor_para, etapas)}`,
  }
}

/**
 * Ficha do ticket, no desenho do detalhe do hero do DS.
 *
 * O topo diz o status, o número, há quanto tempo o cliente espera e quem
 * cuida (ou "Sem responsável", com "Assumir"). Em tickets do WhatsApp vêm o
 * "Resumo da Íris", a faixa de resolução automática (com "Não resolveu") e a
 * conversa ao lado — no celular, numa aba. No celular, "Reabrir | Resolver"
 * ficam fixos no rodapé, ao alcance do polegar. Cada campo salva sozinho ao
 * mudar, enviando só aquele campo — campos de sincronização nunca são enviados.
 */
export function DemandaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: demanda, isLoading, isError } = useDemanda(id)
  const origemWhatsApp = useOrigemWhatsAppDemanda(id)
  const acessoChat = useAcessoAoChat()
  const origem = origemWhatsApp.data
  const conversa = useConversaDoTicket(origem?.wa_origem_mensagem_id, acessoChat)
  const { data: clientes } = useClientes()
  const { data: usuarios } = useUsers()
  const { data: tipos } = useAtendimentoTipos()
  const { data: etapas = [] } = useAtendimentoEtapas()
  const { data: comentarios } = useComentarios(id)
  const { data: historico } = useHistoricoDemanda(id)
  const { segmento } = useSegmentoAtendimento()
  const { user } = useAuth()
  const agora = useAgora(30_000)

  const atualizar = useAtualizarDemanda()
  const recusarSugestao = useRecusarSugestaoIris()
  const excluir = useExcluirDemanda()
  const comentar = useComentar()
  const { can } = usePermissoes()

  const [texto, setTexto] = useState('')
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)
  const [abaCelular, setAbaCelular] = useState<'ticket' | 'conversa'>('ticket')

  const podeEditar = can('atendimento', 'editar')
  const podeExcluir = can('atendimento', 'admin')

  if (isLoading) {
    return (
      <PageContainer largura="larga" className="gap-4">
        <div aria-busy="true" className="grid gap-4">
          <span className="sr-only">Carregando ticket…</span>
          <div aria-hidden className="grid gap-2">
            <span className="sk h-3 w-40" />
            <span className="sk h-7 w-2/3" />
          </div>
          <div aria-hidden className="sk h-24 rounded-lg" />
          <div aria-hidden className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <span className="sk h-80 rounded-lg" />
            <span className="sk h-80 rounded-lg" />
          </div>
        </div>
      </PageContainer>
    )
  }

  if (isError || !demanda) {
    return (
      <PageContainer largura="leitura">
        <div className="rounded-lg border border-card-border bg-card p-4 text-sm text-muted-foreground">
          Ticket não encontrado — ele pode ter sido excluído.{' '}
          <Link to="/tickets" className="font-semibold text-link hover:underline">Voltar para os tickets</Link>
        </div>
      </PageContainer>
    )
  }

  const salvar = (campos: CamposEditaveisDemanda) => atualizar.mutate({ id: demanda.id, ...campos })
  const doWhatsApp = Boolean(origem?.wa_origem_mensagem_id)
  const dadosConversa = conversa.data
  const etapaFinal = demanda.etapa ? demanda.etapa.is_final : null
  const resolvido = ticketResolvido({ etapaFinal, concluidaEm: demanda.concluida_em })
  const status = statusDoTicket({
    etapaId: demanda.etapa_id,
    etapaFinal,
    concluidaEm: demanda.concluida_em,
    primeiraEtapaAbertaId: primeiraEtapaAberta(etapas)?.id ?? null,
    origemWhatsApp: doWhatsApp,
    reabertaEm: origem?.wa_reaberta_em ?? null,
    ultimaMensagemDe: ultimaMensagemDaConversa(dadosConversa?.conversa?.aguardandoResposta),
  })
  const destino = etapaDestino(etapas, demanda.etapa_id, resolvido ? 'reabrir' : 'resolver')
  const linkChat = acessoChat ? linkDoChat(dadosConversa?.conversa?.contatoId) : null
  const evidencias = Array.isArray(origem?.wa_resolucao_evidencias) ? origem.wa_resolucao_evidencias : []
  const pelaIris = resolvido && doWhatsApp && origem?.wa_resolucao_metodo === 'ia' && !origem.wa_resolvida_manualmente
  // numeric do Postgres pode chegar como texto; converte antes de descrever.
  const confianca = descreverConfianca(
    origem?.wa_resolucao_confianca == null ? null : Number(origem.wa_resolucao_confianca),
  )
  // Sugestão da Íris: só vale enquanto o ticket está aberto (o banco a limpa
  // quando a etapa muda; aqui não dependemos disso).
  const sugestao = doWhatsApp && !resolvido ? lerSugestao(origem) ?? null : null
  const certezaSugestao = descreverConfianca(sugestao?.confianca)
  const escreveuDepois = Boolean(sugestao) && clienteEscreveuDepois(sugestao?.em, dadosConversa?.conversa?.ultimaMsgClienteEm)
  // Na conversa, marca as mensagens da resolução; sem resolução, as da sugestão.
  const evidenciasDaConversa = evidencias.length > 0 || !sugestao ? evidencias : sugestao.evidencias
  const evidenciasSaoSugestao = evidencias.length === 0 && Boolean(sugestao) && evidenciasDaConversa.length > 0
  const mostrarConversa = doWhatsApp && acessoChat
  const usaAprovacao = !doWhatsApp && segmento.metricas.includes('aguardandoAprovacao')

  // Quem resolveu à mão: o último evento que levou a uma etapa final.
  const eventoResolucao = (historico ?? []).find(
    (h) => h.campo === 'etapa' && Boolean(etapas.find((e) => e.nome === h.valor_para)?.is_final),
  )
  const nomeQuemResolveu = eventoResolucao?.autor?.nome ?? null

  // Espera e atraso (só apresentação).
  const inicioEspera = inicioDaEspera(status, {
    criadoEm: demanda.created_at,
    concluidaEm: demanda.concluida_em,
    reabertaEm: origem?.wa_reaberta_em,
    ultimaMsgClienteEm: dadosConversa?.conversa?.ultimaMsgClienteEm,
    conversaAtualizadaEm: dadosConversa?.conversa?.atualizadaEm,
  })
  const minutosEspera = minutosDesde(inicioEspera, agora)
  const atrasado = ticketAtrasado({ status, prazo: demanda.prazo, minutos: minutosEspera }, agora)
  const temFalha = conversaTemFalha(dadosConversa)
  const nomeCliente = demanda.cliente?.nome ?? 'Sem cliente'
  const nomeContato = dadosConversa?.conversa?.contatoNome?.trim() || null

  // "Assumir": o mesmo caminho do campo Responsável (mesma permissão e mesma
  // gravação), só que com você. Só aparece se você é uma pessoa ativa da lista.
  const euNaEquipe = Boolean(user?.id && (usuarios ?? []).some((u) => u.id === user.id && u.ativo))
  const podeAssumir = podeEditar && !demanda.responsavel_id && euNaEquipe

  const resolverOuReabrir = () => { if (destino) salvar({ etapa_id: destino.id }) }

  const enviarComentario = (e: FormEvent) => {
    e.preventDefault()
    if (!texto.trim()) return
    comentar.mutate({ demandaId: demanda.id, texto: texto.trim() }, { onSuccess: () => setTexto('') })
  }

  const textoOrigem = dadosConversa?.origem ? textoDaMensagem(dadosConversa.origem) : null
  const pontos = pontosDoResumo({
    status,
    responsavel: demanda.responsavel?.nome,
    temResponsavel: Boolean(demanda.responsavel_id),
    prazoVencido: prazoVencido(demanda.prazo, agora),
    venceHoje: situacaoPrazo(demanda) === 'hoje',
    envioFalhou: temFalha,
    atrasado,
  })

  const botaoPrincipal = (classe?: string) => podeEditar && (
    <button
      type="button"
      onClick={resolverOuReabrir}
      disabled={atualizar.isPending || !destino}
      title={resolvido ? 'Reabrir o ticket' : 'Marcar como resolvido'}
      className={cn('btn', resolvido ? 'btn-secondary' : 'btn-primary', classe)}
    >
      {atualizar.isPending ? <span className="btn-spin" aria-hidden /> : resolvido ? <RotateCcw aria-hidden /> : <CircleCheck aria-hidden />}
      {resolvido ? 'Reabrir' : 'Resolver'}
    </button>
  )

  // ── Blocos ─────────────────────────────────────────────────────────────

  const blocoOrigem = doWhatsApp && (
    <Cartao titulo="O que o cliente pediu" tom="nota">
      {!acessoChat ? (
        <p className="m-0 text-sm text-muted-foreground">
          Este ticket veio do WhatsApp. Para ver a mensagem do cliente, é preciso ter acesso a Conversas.
        </p>
      ) : conversa.isLoading ? (
        <span aria-hidden className="sk block h-10 rounded-md" />
      ) : textoOrigem ? (
        <>
          <blockquote className="m-0 whitespace-pre-wrap break-words text-[15px] leading-[1.5] text-foreground">“{textoOrigem}”</blockquote>
          <p className="m-0 mt-2 text-[12px] text-muted-foreground">
            {nomeContato ?? demanda.cliente?.nome ?? 'Cliente'}
            {dadosConversa?.origem ? ` · ${dataHora(dadosConversa.origem.criado_em)}` : ''}
          </p>
        </>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">
          {dadosConversa?.situacao === 'apagada'
            ? 'A mensagem original não está mais disponível.'
            : 'Não foi possível abrir a mensagem do cliente.'}
        </p>
      )}
    </Cartao>
  )

  const blocoDetalhes = (
    <>
      <Cartao titulo="Detalhes">
        <div className="grid gap-4">
          <div className="field">
            <label htmlFor="det-responsavel">Responsável</label>
            <SelectDs
              id="det-responsavel"
              disabled={!podeEditar}
              value={demanda.responsavel_id ?? ''}
              onChange={(e) => salvar({ responsavel_id: e.target.value || null })}
            >
              <option value="">Sem responsável</option>
              {(usuarios ?? []).filter((u) => u.ativo).map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </SelectDs>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="field">
              <label htmlFor="det-prioridade">Prioridade</label>
              <SelectDs
                id="det-prioridade"
                disabled={!podeEditar}
                value={demanda.prioridade}
                onChange={(e) => salvar({ prioridade: e.target.value as Prioridade })}
              >
                {(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => (
                  <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>
                ))}
              </SelectDs>
            </div>
            <div className="field">
              <label htmlFor="det-prazo">Prazo</label>
              <input
                id="det-prazo"
                type="date"
                className="input text-base sm:text-sm"
                disabled={!podeEditar}
                value={demanda.prazo ?? ''}
                onChange={(e) => salvar({ prazo: e.target.value || null })}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="det-cliente">Cliente</label>
            <SelectDs
              id="det-cliente"
              disabled={!podeEditar || doWhatsApp}
              value={demanda.cliente_id ?? ''}
              onChange={(e) => salvar({ cliente_id: e.target.value || null })}
            >
              <option value="">Sem cliente</option>
              {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </SelectDs>
            {doWhatsApp && <span className="hint">O cliente vem da conversa e não pode ser trocado.</span>}
          </div>

          <div className="field">
            <label htmlFor="det-tipo">Tipo</label>
            <SelectDs
              id="det-tipo"
              disabled={!podeEditar}
              value={demanda.tipo_id ?? ''}
              onChange={(e) => salvar({ tipo_id: e.target.value || null })}
            >
              <option value="">Sem tipo</option>
              {tiposSelecionaveisAtendimento(tipos ?? [], demanda.tipo_id).map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </SelectDs>
          </div>

          <div className="field">
            <label htmlFor="det-etapa">Etapa</label>
            <SelectDs
              id="det-etapa"
              disabled={!podeEditar}
              value={demanda.etapa_id ?? ''}
              onChange={(e) => e.target.value && salvar({ etapa_id: e.target.value })}
            >
              {/* "Sem etapa" só aparece se o ticket já estiver assim — não é um destino. */}
              {!demanda.etapa_id && <option value="" disabled>Sem etapa</option>}
              {etapas.map((et) => <option key={et.id} value={et.id}>{rotuloEtapa(et, etapas)}</option>)}
            </SelectDs>
          </div>
        </div>
      </Cartao>

      {usaAprovacao && (
        <details className="group rounded-lg border border-card-border bg-card p-4" open={demanda.aprovacao !== 'nao_enviado'}>
          <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-[650] text-foreground md:min-h-0">
            Aprovação do cliente
          </summary>
          <div className="mt-3 grid gap-4">
            <div className="field">
              <label htmlFor="det-aprovacao">Situação</label>
              <SelectDs
                id="det-aprovacao"
                disabled={!podeEditar}
                value={demanda.aprovacao}
                onChange={(e) => salvar({ aprovacao: e.target.value as Aprovacao })}
              >
                {(Object.keys(ROTULO_APROVACAO) as Aprovacao[]).map((a) => (
                  <option key={a} value={a}>{ROTULO_APROVACAO[a]}</option>
                ))}
              </SelectDs>
            </div>
            <div className="field">
              <label htmlFor="det-aprovacao-obs">O que o cliente falou</label>
              <textarea
                id="det-aprovacao-obs"
                className="textarea text-base sm:text-sm"
                rows={3}
                disabled={!podeEditar}
                defaultValue={demanda.aprovacao_obs ?? ''}
                onBlur={(e) => {
                  if (e.target.value !== (demanda.aprovacao_obs ?? '')) salvar({ aprovacao_obs: e.target.value || null })
                }}
              />
            </div>
          </div>
        </details>
      )}
    </>
  )

  const blocoAnotacoes = (
    <Cartao titulo={doWhatsApp ? 'Anotações sobre o ticket' : 'O que precisa ser feito'} idTitulo="demanda-descricao-titulo">
      <div className="field">
        <textarea
          id="demanda-descricao"
          aria-labelledby="demanda-descricao-titulo"
          className="textarea text-base sm:text-sm"
          rows={3}
          disabled={!podeEditar}
          defaultValue={demanda.descricao ?? ''}
          placeholder="O que o cliente precisa, combinados, observações…"
          onBlur={(e) => {
            if (e.target.value !== (demanda.descricao ?? '')) salvar({ descricao: e.target.value || null })
          }}
        />
        <span className="hint">Salvo automaticamente quando você sai do campo.</span>
      </div>
    </Cartao>
  )

  const blocoComentarios = (
    <Cartao titulo="Comentários da equipe" icone={MessageSquare} subtitulo="O cliente não vê.">
      <ul className="m-0 grid list-none gap-2 p-0">
        {(comentarios ?? []).length === 0 && (
          <li className="text-sm text-muted-foreground">Nenhum comentário ainda.</li>
        )}
        {(comentarios ?? []).map((c) => (
          <li key={c.id} className="rounded-lg border border-dashed border-note-border bg-note px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-[650] text-note-fg">{c.autor?.nome ?? 'Pessoa removida'}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{dataHora(c.created_at)}</span>
            </div>
            <p className="m-0 mt-1 whitespace-pre-wrap text-[13.5px] leading-[1.45] text-foreground">{c.texto}</p>
          </li>
        ))}
      </ul>

      {podeEditar && (
        <form onSubmit={enviarComentario} className="mt-3 flex items-end gap-2">
          <textarea
            className="textarea min-h-[44px] text-base sm:text-sm"
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escrever um comentário…"
            aria-label="Novo comentário"
          />
          <button
            type="submit"
            disabled={comentar.isPending || !texto.trim()}
            className="btn btn-primary shrink-0"
          >
            {comentar.isPending ? <span className="btn-spin" aria-hidden /> : <Send aria-hidden />}
            Enviar
          </button>
        </form>
      )}
    </Cartao>
  )

  const blocoHistorico = (
    <Cartao titulo="Histórico" icone={History}>
      <ol className="m-0 grid list-none gap-2 p-0">
        {(historico ?? []).map((h) => {
          const frase = fraseDoHistorico(h, etapas)
          return (
            <li key={h.id} className="flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
              <span className="font-mono text-[11.5px] text-muted-foreground">{dataHora(h.created_at)}</span>
              {!frase.semAutor && (
                <span className="font-semibold text-foreground">{autorDoHistorico(h.autor?.nome, doWhatsApp)}</span>
              )}
              <span className="text-foreground">{frase.acao}</span>
              {frase.detalhe && <span className="text-muted-foreground">{frase.detalhe}</span>}
            </li>
          )
        })}
        <li className="flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
          <span className="font-mono text-[11.5px] text-muted-foreground">{dataHora(demanda.created_at)}</span>
          {doWhatsApp ? (
            <>
              <span className="font-semibold text-foreground">Íris</span>
              <span className="text-foreground">criou o ticket a partir de uma mensagem do WhatsApp</span>
            </>
          ) : (
            <span className="text-foreground">Ticket criado</span>
          )}
        </li>
      </ol>
    </Cartao>
  )

  return (
    <PageContainer largura="larga" className="gap-4 md:gap-5">
      <PageHeader
        backTo="/tickets"
        breadcrumb={[
          { label: 'Tickets', href: '/tickets' },
          { label: demanda.codigo },
        ]}
        title={demanda.titulo}
        description={`${nomeCliente} · aberto em ${dataHora(demanda.created_at)}`}
        action={(podeEditar || linkChat || podeExcluir) && (
          <>
            {/* No celular, Resolver/Reabrir moram na barra fixa do rodapé. */}
            {botaoPrincipal('max-md:hidden')}
            {linkChat && (
              <Link to={linkChat} className="btn btn-secondary">
                <ExternalLink aria-hidden /> Abrir em Conversas
              </Link>
            )}
            {podeExcluir && (
              <button
                type="button"
                onClick={() => setConfirmarExclusao(true)}
                className="btn btn-ghost hover:bg-danger-light hover:text-danger"
              >
                <Trash2 aria-hidden /> Excluir
              </button>
            )}
          </>
        )}
      />

      {/* ── Quem, status, espera e responsável (DS `.det-h`) ───────────── */}
      <section aria-label="Situação do ticket" className="grid gap-2.5 rounded-lg border border-card-border bg-card px-4 py-3 md:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <AvatarCliente nome={nomeCliente} chave={demanda.cliente_id} tamanho="sm" />
          <b className="min-w-0 truncate text-[13.5px] font-[650] text-foreground">{nomeCliente}</b>
          {nomeContato && <span className="min-w-0 truncate">· {nomeContato}</span>}
          {doWhatsApp && <SeloWhatsApp className="ml-auto" />}
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[12.5px] text-muted-foreground">
          <StatusTicketBadge key={`${status}-${atrasado}`} status={status} pelaIris={pelaIris} atrasado={atrasado} grande animar />
          <Separador />
          <span className="mono text-[11.5px] text-fg-4">{demanda.codigo}</span>
          {minutosEspera !== null && status !== 'resolvido' && (
            <>
              <Separador />
              <CronometroEspera status={status} inicio={inicioEspera} />
            </>
          )}
          <Separador />
          <ResponsavelTicket id={demanda.responsavel_id} nome={demanda.responsavel?.nome} className="text-[12.5px]" />
          {podeAssumir && (
            <button
              type="button"
              onClick={() => user?.id && salvar({ responsavel_id: user.id })}
              disabled={atualizar.isPending}
              className="btn btn-secondary btn-sm"
              title="Ficar responsável por este ticket"
            >
              <Hand aria-hidden /> Assumir
            </button>
          )}
          {(demanda.prioridade === 'alta' || demanda.prioridade === 'urgente') && (
            <span className={cn('tag', demanda.prioridade === 'urgente' ? 'tag-danger' : 'tag-warning')}>
              {ROTULO_PRIORIDADE[demanda.prioridade]}
            </span>
          )}
          {demanda.prazo && !resolvido && (
            <span className={cn('whitespace-nowrap', prazoVencido(demanda.prazo, agora) ? 'font-semibold text-danger' : situacaoPrazo(demanda) === 'hoje' ? 'font-semibold text-warning' : '')}>
              {textoPrazoTicket(demanda.prazo, agora)}
            </span>
          )}
        </div>

        <p className="m-0 text-[13px] text-muted-foreground">
          {EXPLICACAO_STATUS_TICKET[status]}
          {doWhatsApp && !resolvido && origem?.wa_resolucao_metodo !== undefined && (
            <>
              {' '}A Íris fecha este ticket sozinha quando a conversa mostra, com certeza, que o pedido foi resolvido. Quando fica
              em dúvida, ela pede a confirmação de alguém aqui. Se resolveu por fora, clique em Resolver.
            </>
          )}
        </p>

        {podeEditar && !destino && etapas.length > 0 && (
          <p className="m-0 text-[12.5px] text-muted-foreground">
            {resolvido
              ? 'Não há outra etapa aberta para reabrir este ticket.'
              : 'Não há etapa final configurada para resolver este ticket.'}{' '}
            Peça a um administrador para revisar as etapas em Configuração.
          </p>
        )}

        {atualizar.isError && (
          <p role="alert" className="m-0 flex items-start gap-2 rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Não foi possível salvar o ticket. {atualizar.error instanceof Error ? atualizar.error.message : 'Tente novamente.'}
          </p>
        )}
        {origemWhatsApp.isError && (
          <p role="alert" className="m-0 text-sm text-danger">
            Não foi possível ver se este ticket veio do WhatsApp. O resto da ficha funciona normalmente.
          </p>
        )}
      </section>

      {/* ── Resumo da Íris (DS `.isum`) ────────────────────────────────── */}
      {doWhatsApp && (
        <section
          aria-label="Resumo da Íris"
          className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 rounded-lg bg-[color-mix(in_srgb,var(--iris-light)_55%,var(--card))] px-4 py-3 shadow-[inset_0_0_0_1px_var(--iris-line)] md:px-5"
        >
          <span className="iris-mark sm mt-0.5" aria-hidden />
          <div className="min-w-0">
            <b className="block text-[12px] font-[650] tracking-[.01em] text-iris-fg">Resumo da Íris</b>
            <p className="m-0 mb-1.5 mt-px text-[13.5px] leading-[1.45] text-fg-1">
              A Íris abriu este ticket a partir de uma mensagem {nomeContato ? `de ${nomeContato}` : 'do cliente'} no WhatsApp
              {dadosConversa?.origem ? `, em ${dataHora(dadosConversa.origem.criado_em)}` : ''}.
            </p>
            <ul className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0">
              {pontos.map((p) => (
                <li key={p.texto} className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-2">
                  {p.tom === 'alerta'
                    ? <CircleAlert className="h-3.5 w-3.5 text-warning" aria-hidden />
                    : <CircleCheck className="h-3.5 w-3.5 text-iris-fg" aria-hidden />}
                  {p.texto}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Sugestão da Íris: ela acha que resolveu, mas pede confirmação ─ */}
      {sugestao && (
        <section aria-labelledby="sugestao-iris-titulo" className="iris-band grid-cols-[auto_minmax(0,1fr)]">
          <span className="iris-mark" aria-hidden />
          <div className="grid min-w-0 gap-1">
            <h2 id="sugestao-iris-titulo" className="m-0 text-[13.5px] font-[650] [font-stretch:100%] text-iris-fg">
              A Íris acha que este pedido foi resolvido
            </h2>
            {sugestao.motivo && (
              <p className="m-0 whitespace-pre-wrap break-words text-[13.5px] leading-[1.45] text-fg-2">
                <b className="font-semibold text-fg-1">Motivo:</b> {sugestao.motivo}
              </p>
            )}
            <p className="m-0 text-[13.5px] leading-[1.45] text-fg-2">
              <b className="font-semibold text-fg-1">Por que ela não fechou sozinha:</b> {textoRazaoSugestao(sugestao.razao)}
            </p>
            {mostrarConversa && sugestao.evidencias.length > 0 && (
              <p className="m-0 text-[13px] text-fg-2">
                {sugestao.evidencias.length === 1
                  ? 'A mensagem que levou a esta sugestão está marcada na conversa.'
                  : `As ${sugestao.evidencias.length} mensagens que levaram a esta sugestão estão marcadas na conversa.`}
              </p>
            )}
            {escreveuDepois && (
              <p role="status" className="m-0 flex items-start gap-1.5 text-[13px] font-semibold text-warning">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                O cliente escreveu depois desta sugestão. Leia a conversa antes de confirmar.
              </p>
            )}
            <span className="block font-mono text-[11px] text-muted-foreground">
              {[`sugerido em ${dataHora(sugestao.em)}`, certezaSugestao ? `certeza ${certezaSugestao}` : null]
                .filter(Boolean).join(' · ')}
            </span>
            {podeEditar && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={resolverOuReabrir}
                  disabled={atualizar.isPending || recusarSugestao.isPending || !destino}
                  className="btn btn-primary btn-sm"
                  title="Concordo: marcar o ticket como resolvido"
                >
                  {atualizar.isPending ? <span className="btn-spin" aria-hidden /> : <CircleCheck aria-hidden />}
                  Confirmar resolução
                </button>
                <button
                  type="button"
                  onClick={() => recusarSugestao.mutate(demanda.id)}
                  disabled={atualizar.isPending || recusarSugestao.isPending}
                  className="btn btn-secondary btn-sm"
                  title="Não resolveu: o ticket continua aberto e a sugestão some"
                >
                  {recusarSugestao.isPending ? <span className="btn-spin" aria-hidden /> : <CircleDashed aria-hidden />}
                  Manter aberto
                </button>
              </div>
            )}
            {recusarSugestao.isError && (
              <p role="alert" className="m-0 mt-1 flex items-start gap-2 rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Não foi possível manter o ticket aberto.{' '}
                {recusarSugestao.error instanceof Error ? recusarSugestao.error.message : 'Tente novamente.'}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Faixa de resolução / reabertura ────────────────────────────── */}
      {pelaIris && (
        <div className="iris-band grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto]">
          <span className="iris-mark" aria-hidden />
          <div className="min-w-0">
            <h2 className="m-0 text-[13.5px] font-[650] [font-stretch:100%] text-iris-fg">Resolvido automaticamente pela Íris</h2>
            {origem?.wa_resolucao_motivo && (
              <p className="m-0 mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-[1.45] text-fg-2">
                <b className="font-semibold text-fg-1">Motivo:</b> {origem.wa_resolucao_motivo}
              </p>
            )}
            {evidencias.length > 0 && (
              <p className="m-0 mt-0.5 text-[13px] text-fg-2">
                {evidencias.length === 1
                  ? 'A mensagem que confirmou a solução está marcada na conversa.'
                  : `As ${evidencias.length} mensagens que confirmaram a solução estão marcadas na conversa.`}
              </p>
            )}
            <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
              {[demanda.concluida_em ? dataHora(demanda.concluida_em) : null, confianca ? `certeza ${confianca}` : null]
                .filter(Boolean).join(' · ')}
            </span>
          </div>
          {podeEditar && destino && (
            <button
              type="button"
              onClick={resolverOuReabrir}
              disabled={atualizar.isPending}
              className="btn btn-secondary btn-sm col-start-2 justify-self-start sm:col-start-auto"
              title="A Íris se enganou? Reabra o ticket"
            >
              <RotateCcw aria-hidden /> Não resolveu
            </button>
          )}
        </div>
      )}
      {resolvido && !pelaIris && (
        <div className="iris-band band-manual grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto]">
          <CircleCheck className="h-6 w-6 text-success" aria-hidden />
          <div className="min-w-0">
            <h2 className="m-0 text-[13.5px] font-[650] [font-stretch:100%] text-success">
              Resolvido{nomeQuemResolveu ? ` por ${nomeQuemResolveu}` : doWhatsApp && origem?.wa_resolvida_manualmente ? ' pela equipe' : ''}
            </h2>
            {demanda.concluida_em && (
              <span className="mt-1 block font-mono text-[11px] text-muted-foreground">{dataHora(demanda.concluida_em)}</span>
            )}
          </div>
          {podeEditar && destino && (
            <button
              type="button"
              onClick={resolverOuReabrir}
              disabled={atualizar.isPending}
              className="btn btn-ghost btn-sm col-start-2 justify-self-start max-md:hidden sm:col-start-auto"
            >
              <RotateCcw aria-hidden /> Reabrir
            </button>
          )}
        </div>
      )}
      {status === 'reaberto' && origem?.wa_reaberta_em && (
        <p className="m-0 flex items-center gap-2 rounded-lg bg-st-reopen px-4 py-2.5 text-[13.5px] font-medium text-st-reopen-fg">
          <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
          Reaberto em {dataHora(origem.wa_reaberta_em)}.
        </p>
      )}

      {/* ── Abas no celular: ticket | conversa ─────────────────────────── */}
      {mostrarConversa && (
        <AbasRolaveis
          rotulo="Ver"
          className="lg:hidden"
          itens={[
            { id: 'ticket', rotulo: 'Ticket', ativo: abaCelular === 'ticket', onClick: () => setAbaCelular('ticket') },
            {
              id: 'conversa',
              rotulo: temFalha ? 'Conversa · não enviada' : 'Conversa',
              ativo: abaCelular === 'conversa',
              onClick: () => setAbaCelular('conversa'),
            },
          ]}
        />
      )}

      {mostrarConversa ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <ConversaDoTicketPainel
            dados={dadosConversa}
            carregando={conversa.isLoading}
            evidencias={evidenciasDaConversa}
            evidenciasDaSugestao={evidenciasSaoSugestao}
            className={cn(
              'h-[70dvh] min-h-[360px] lg:sticky lg:top-4 lg:h-[calc(100dvh-8rem)] lg:min-h-[480px] lg:self-start',
              abaCelular !== 'conversa' && 'hidden lg:flex',
            )}
          />
          <aside aria-label="Ticket" className={cn('grid min-w-0 content-start gap-4', abaCelular !== 'ticket' && 'hidden lg:grid')}>
            {blocoOrigem}
            {blocoDetalhes}
            {blocoAnotacoes}
            {blocoComentarios}
            {blocoHistorico}
          </aside>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 content-start gap-4">
            {blocoOrigem}
            {blocoAnotacoes}
            {blocoComentarios}
            {blocoHistorico}
          </div>
          <aside aria-label="Detalhes do ticket" className="grid min-w-0 content-start gap-4">{blocoDetalhes}</aside>
        </div>
      )}

      {/* ── Celular: Reabrir | Resolver fixos acima da barra inferior ───── */}
      {podeEditar && (
        <div
          className="fixed inset-x-0 bottom-[calc(var(--bnav-h)+var(--safe-b))] z-30 flex gap-2 border-t border-border bg-card px-3 py-2.5 pr-[84px] animate-row-in md:hidden"
          role="group"
          aria-label="Ações do ticket"
        >
          <button
            type="button"
            onClick={resolverOuReabrir}
            disabled={!resolvido || atualizar.isPending || !destino}
            className="btn btn-secondary btn-lg flex-1"
          >
            {atualizar.isPending && resolvido ? <span className="btn-spin" aria-hidden /> : <RotateCcw aria-hidden />}
            Reabrir
          </button>
          <button
            type="button"
            onClick={resolverOuReabrir}
            disabled={resolvido || atualizar.isPending || !destino}
            className="btn btn-primary btn-lg flex-1"
          >
            {atualizar.isPending && !resolvido ? <span className="btn-spin" aria-hidden /> : <CircleCheck aria-hidden />}
            Resolver
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmarExclusao}
        onClose={() => setConfirmarExclusao(false)}
        onConfirm={() => {
          excluir.mutate(demanda.id, { onSuccess: () => navigate('/tickets') })
        }}
        title={`Excluir ${demanda.codigo}?`}
        description="O ticket, os comentários e o histórico serão apagados de vez. Não há como desfazer."
        confirmLabel="Excluir ticket"
      />
    </PageContainer>
  )
}

function Separador() {
  return <span aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-full bg-stroke-strong" />
}

/** Cartão de seção da ficha (rótulo pequeno em cima, como o `rail-h` do DS). */
function Cartao({
  titulo, subtitulo, icone: Icone, tom, idTitulo, children,
}: {
  titulo: string
  subtitulo?: string
  icone?: typeof History
  /** `nota` = pedido do cliente, com o fundo de nota do DS. */
  tom?: 'nota'
  idTitulo?: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        'min-w-0 rounded-lg border p-4',
        tom === 'nota' ? 'border-note-border bg-note' : 'border-card-border bg-card',
      )}
    >
      <h2
        id={idTitulo}
        className={cn(
          'm-0 flex items-center gap-1.5 text-[12px] font-[650] tracking-[.02em] [font-stretch:100%]',
          tom === 'nota' ? 'text-note-fg' : 'text-muted-foreground',
        )}
      >
        {Icone && <Icone className="h-3.5 w-3.5" aria-hidden />}
        {titulo}
      </h2>
      {subtitulo && <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">{subtitulo}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

/**
 * Cronômetro de espera do topo da ficha. Quando a vez é da equipe numa
 * conversa, anda de segundo em segundo e esquenta (âmbar 15 min, vermelho
 * 60 min); nos outros casos mostra só há quanto tempo.
 */
function CronometroEspera({ status, inicio }: { status: StatusTicket; inicio: string }) {
  const corre = esperaCronometrada(status)
  const agora = useAgora(corre ? 1_000 : 30_000)
  const segundos = Math.max(0, Math.floor((agora.getTime() - new Date(inicio).getTime()) / 1000))
  if (Number.isNaN(segundos)) return null
  const minutos = Math.floor(segundos / 60)
  const faixa = faixaDeEspera(status, minutos) ?? 1

  if (status === 'aguardando_cliente') {
    return (
      <span className="wait" data-l={1} title="Tempo esperando o cliente responder">
        <Hourglass aria-hidden />
        Esperando o cliente há {textoDuracao(minutos)}
      </span>
    )
  }
  if (!corre || minutos >= 24 * 60) {
    return (
      <span className="wait" data-l={faixa} title="Desde quando o ticket espera a equipe">
        <Timer aria-hidden />
        Esperando há {textoDuracao(minutos)}
      </span>
    )
  }
  return (
    <span className="wait" data-l={faixa} title="Tempo esperando a equipe responder" role="timer" aria-live="off">
      <Timer aria-hidden />
      Esperando há <span>{textoCronometro(segundos)}</span>
    </span>
  )
}
