import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Loader2, PauseCircle, RefreshCw, Search, Settings2 } from 'lucide-react'
import { useAcaoTempoResposta, useEscopoTempoResposta, usePainelTempoResposta, erroTempoResposta } from '@/hooks/useTempoResposta'
import {
  MODOS_TEMPO_RESPOSTA, anoTempoResposta, dataTempoResposta, filtrarEpisodiosTempoResposta,
  lerFeriadosTempoResposta, minutosTempoResposta, situacaoTempoResposta, validarConfigTempoResposta,
  resultadosTitularesTempoResposta,
  type AcaoTempoResposta, type ConfigTempoResposta, type EpisodioTempoResposta,
  type EscopoTempoResposta, type ModoTempoResposta, type PainelTempoResposta, type TitularTempoResposta,
} from '@/lib/tempoResposta'
import { cn } from '@/lib/utils'
import { TabelaResponsiva } from '@/components/ui/TabelaResponsiva'
import { Dica, EsqueletoAba, MensagemErro, MensagemSucesso, Secao } from './comum'
import { botaoPrimario, botaoSecundario, campo, foco } from './estilos'

type Agir = (acao: AcaoTempoResposta) => Promise<void>
const rotulosEntrega: Record<string, string> = {
  enviado: 'Enviado', sent: 'Enviado', pendente: 'Aguardando envio', pending: 'Aguardando envio',
  falhou: 'Falhou', failed: 'Falhou', cancelado: 'Cancelado', cancelled: 'Cancelado',
  dispensado: 'Envio dispensado', sem_alertas: 'Envio dispensado', skipped: 'Envio dispensado', observacao: 'Somente observação',
}

export function TempoRespostaTab() {
  const escopo = useEscopoTempoResposta()
  if (escopo.isLoading) return <EsqueletoAba />
  if (escopo.isError || !escopo.data) return <Secao titulo="Tempo de resposta">
    <MensagemErro texto={erroTempoResposta(escopo.error)} />
    <button className={botaoSecundario} type="button" onClick={() => void escopo.refetch()}>Conferir acesso novamente</button>
  </Secao>
  return <PainelConectado key={`${escopo.data.actorId}:${escopo.data.tenantId}`} escopo={escopo.data} />
}

function PainelConectado({ escopo }: { escopo: EscopoTempoResposta }) {
  const [cursor, setCursor] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState('aberto')
  const [estrategista, setEstrategista] = useState('')
  const consulta = usePainelTempoResposta(escopo, cursor)
  const acao = useAcaoTempoResposta(escopo)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [configAberta, setConfigAberta] = useState(false)
  const agir: Agir = async (pedido) => {
    setErro(null); setSucesso(null)
    try { await acao.mutateAsync(pedido); setSucesso('Alteração salva e painel atualizado.') }
    catch (e) { setErro(erroTempoResposta(e)); throw e }
  }
  if (consulta.isLoading) return <EsqueletoAba />
  if (consulta.isError || !consulta.data) return <Secao titulo="Tempo de resposta" descricao="Os dados ficam ocultos enquanto não é possível confirmar o acesso e a atualização.">
    <MensagemErro texto={erroTempoResposta(consulta.error)} />
    <button className={botaoSecundario} type="button" onClick={() => void consulta.refetch()} disabled={consulta.isFetching}>
      <RefreshCw className="h-4 w-4" aria-hidden /> Tentar novamente
    </button>
  </Secao>

  const p = consulta.data
  const lista = filtrarEpisodiosTempoResposta(p.episodios, { busca, estado, estrategista })
  const pendentes = p.episodios.filter((e) => (e.qualidade === 'inconclusiva' || e.minutos_cliente === null) && e.estado === 'aberto').length
  const esperando = p.episodios.filter((e) => e.estado === 'aberto').length
  const perto = p.episodios.filter((e) => e.estado === 'aberto' && e.qualidade === 'confiavel' && e.etapa === '50').length
  const atrasados = p.episodios.filter((e) => e.estado === 'aberto' && e.qualidade === 'confiavel' && e.minutos_cliente !== null && e.minutos_cliente > 60).length
  const respondidos = lista.filter((e) => e.estado === 'respondido' && e.qualidade === 'confiavel' && e.minutos_cliente !== null)
  const noPrazo = respondidos.filter((e) => (e.minutos_cliente as number) <= 60).length
  const responsaveisPendentes = p.titulares.filter((t) => t.candidatos.length > 1 && !t.titular_id).length
  const pausasAtivas = p.pausas.filter((x) => Date.parse(x.fim) > Date.parse(p.agora)).length
  const ocupado = acao.isPending

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="tempo-resposta-titulo">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="max-w-2xl space-y-2">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"><Clock3 className="h-4 w-4" aria-hidden /> Atendimento da carteira</p>
          <h2 id="tempo-resposta-titulo" className="font-display text-2xl font-semibold tracking-tight">Tempo de resposta</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">Veja quais conversas precisam de resposta. A equipe responde normalmente; o acompanhamento das mensagens é automático após a configuração inicial. Cada espera começa na primeira mensagem do cliente; novas mensagens não reiniciam o relógio e respostas automáticas não encerram a espera humana.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={botaoSecundario} type="button" aria-expanded={configAberta} aria-controls="tempo-resposta-config" onClick={() => setConfigAberta((v) => !v)}>
            <Settings2 className="h-4 w-4" aria-hidden /> {p.config.modo === 'desligado' ? 'Começar acompanhamento' : 'Configurações'}
          </button>
          <button className={botaoSecundario} type="button" onClick={() => void consulta.refetch()} disabled={consulta.isFetching || ocupado}>
            <RefreshCw className={cn('h-4 w-4', consulta.isFetching && 'animate-spin')} aria-hidden /> Atualizar
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-5 py-3 text-xs">
        <span className="font-semibold text-foreground">{MODOS_TEMPO_RESPOSTA[p.config.modo].titulo}</span>
        <span className="text-muted-foreground">Seg–sex · 9h–12h e 13h–18h · Brasília · meta de 60 min úteis</span>
      </div>
    </section>

    <MensagemErro texto={erro} /><MensagemSucesso texto={sucesso} />
    {p.avisos.length > 0 && <div className="space-y-2 rounded-lg border border-note-border bg-note p-4" role="status">
      {p.avisos.map((a, i) => <p key={i} className="text-sm text-note-fg">{a}</p>)}
    </div>}
    {/* Manter montado ao recolher preserva rascunho; atualização automática não o substitui. */}
    <div id="tempo-resposta-config" hidden={!configAberta}>
      <ConfiguracaoTempoResposta config={p.config} agora={p.agora} ocupado={ocupado} agir={agir} />
    </div>
    <p className="text-sm text-muted-foreground">Não é preciso registrar pausas no dia a dia. Para descontar horários ocupados, cada pessoa conecta o Google Agenda no GT3 → Configurações → Minha agenda. O desconto depende da integração configurada e sincronizada; a espera do cliente continua visível.</p>
    <details className="rounded-lg border border-border bg-card">
      <summary className={cn('cursor-pointer rounded-lg px-5 py-4 text-sm font-medium', foco)}>Pausas manuais (opcional){pausasAtivas > 0 && <span className="ml-2 text-muted-foreground">· {pausasAtivas} em andamento</span>}</summary>
      <div className="border-t border-border p-4"><PausasTempoResposta painel={p} ocupado={ocupado} agir={agir} /></div>
    </details>

    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Aguardando" valor={esperando} detalhe="esperas abertas" />
        <Indicador titulo="Perto do prazo" valor={perto} detalhe="50 a 60 min úteis" tom="atencao" />
        <Indicador titulo="Prazo ultrapassado" valor={atrasados} detalhe="mais de 60 min úteis" tom="atraso" />
        <Indicador titulo="Medição pendente" valor={pendentes} detalhe="precisa de conferência" />
      </div>
      <p className="text-xs text-muted-foreground">Indicadores dos {p.episodios.length} registros desta página, antes dos filtros. Não são totais de toda a operação.</p>
    </div>

    <Secao titulo="Conversas acompanhadas" descricao={`Atualizado em ${dataTempoResposta(p.agora)}. Atualização automática a cada 30 segundos. Use Situação para consultar também as respostas concluídas.`}>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)_minmax(0,220px)]">
        <label className="space-y-1.5 text-xs font-medium" htmlFor="tempo-busca"><span>Buscar nesta página</span>
          <span className="relative block"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <input id="tempo-busca" className={cn(campo, 'w-full pl-9')} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente ou responsável" />
          </span>
        </label>
        <label className="space-y-1.5 text-xs font-medium" htmlFor="tempo-estado"><span>Situação</span>
          <select id="tempo-estado" className={cn(campo, 'block w-full')} value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todas</option><option value="aberto">Aguardando</option><option value="perto">Perto do prazo</option>
            <option value="atrasado">Prazo ultrapassado</option><option value="pendente">Medição pendente</option>
            <option value="respondido">Respondidos</option><option value="cancelado">Encerrados sem medição</option>
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-medium" htmlFor="tempo-estrategista"><span>Estrategista (casos em que participou)</span>
          <select id="tempo-estrategista" className={cn(campo, 'block w-full')} value={estrategista} onChange={(e) => setEstrategista(e.target.value)}>
            <option value="">Todos</option>{p.estrategistas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </label>
      </div>
      <Dica>O filtro inclui conversas em que a pessoa participou, mesmo antes de uma troca de responsável. O tempo mostrado é do responsável atual, apenas no seu período de responsabilidade e descontando pausas e, quando há agenda conectada, horários ocupados. A espera do cliente continua contando o expediente inteiro.</Dica>
      {respondidos.length > 0 && <p className="text-sm text-muted-foreground">Entre as {respondidos.length} respostas com medição confiável neste filtro e nesta página, <strong className="text-foreground">{Math.round(noPrazo / respondidos.length * 100)}% atenderam a meta do cliente</strong> ({noPrazo} respostas humanas). Esse percentual não mede o desempenho pessoal de quem foi selecionado.</p>}
      {lista.length === 0 ? <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {p.episodios.length ? 'Nenhum registro corresponde aos filtros nesta página.' : p.config.modo === 'desligado' ? 'O acompanhamento ainda não começou. Use Começar acompanhamento para conferir o calendário e iniciar sem enviar avisos.' : 'Nenhuma espera registrada nesta página. As novas mensagens serão acompanhadas automaticamente. Somente mensagens acompanhadas após a ativação entram na medição.'}
      </p> : <div className="divide-y divide-border">{lista.map((e) => <LinhaTempoResposta key={e.id} episodio={e} />)}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>{lista.length} de {p.episodios.length} registros da página exibidos. Os filtros não pesquisam outras páginas.</span>
        <div className="flex gap-2">
          {cursor && <button type="button" className={botaoSecundario} disabled={consulta.isFetching} onClick={() => setCursor(null)}><ArrowLeft className="h-4 w-4" aria-hidden /> Mais recentes</button>}
          {p.proximo_cursor && <button type="button" className={botaoSecundario} disabled={consulta.isFetching} onClick={() => setCursor(p.proximo_cursor)}>Próxima página <ArrowRight className="h-4 w-4" aria-hidden /></button>}
        </div>
      </div>
    </Secao>

    <details className="rounded-lg border border-border bg-card">
      <summary className={cn('cursor-pointer rounded-lg px-5 py-4 text-sm font-medium', foco)}>Ver resumo das respostas</summary>
      <div className="border-t border-border p-4"><ResultadosPorTitular episodios={filtrarEpisodiosTempoResposta(p.episodios, { busca, estado: '', estrategista })} /></div>
    </details>
    <details className="rounded-lg border border-border bg-card">
      <summary className={cn('cursor-pointer rounded-lg px-5 py-4 text-sm font-medium', foco)}>Responsáveis pelos avisos{responsaveisPendentes > 0 && <span className="ml-2 text-note-fg">· {responsaveisPendentes} clientes precisam de definição</span>}</summary>
      <div className="border-t border-border p-4"><TitularesTempoResposta itens={p.titulares} ocupado={ocupado} agir={agir} /></div>
    </details>
  </div>
}

function ResultadosPorTitular({ episodios }: { episodios: EpisodioTempoResposta[] }) {
  const resultados = resultadosTitularesTempoResposta(episodios)
  return <Secao titulo="Respostas concluídas nesta página" descricao="Resumo das respostas com medição confiável, filtrado por cliente e estrategista. O filtro Situação não se aplica a este resumo. Não representa toda a operação.">
    {resultados.length ? <TabelaResponsiva
      rotulo="Atendimento dos clientes agrupado pelo titular registrado ao encerrar a espera"
      linhas={resultados}
      chave={(r) => r.responsavelId ?? 'sem-titular'}
      colunas={[
        { id: 'titular', titulo: 'Titular', principal: true, celula: (r) => <span className="text-left"><span className="font-medium">{r.responsavel}</span><span className="mt-1 block text-[13px] font-normal text-muted-foreground">{r.respostas} respostas na amostra{r.autoriaPendente > 0 ? ` · ${r.autoriaPendente} sem autoria individual confirmada` : ''}</span></span> },
        { id: 'proprias', titulo: 'Respostas do titular', numerica: true, celula: (r) => r.respostas === r.autoriaPendente ? '—' : r.respostasProprias },
        { id: 'coberturas', titulo: 'Coberturas', numerica: true, celula: (r) => r.respostas === r.autoriaPendente ? '—' : r.coberturas },
        { id: 'meta', titulo: 'Meta do cliente atendida', numerica: true, celula: (r) => `${r.percentualNaMeta}%` },
        { id: 'cliente', titulo: 'Espera mediana do cliente', numerica: true, celula: (r) => minutosTempoResposta(r.medianaCliente) },
        { id: 'titularMed', titulo: 'Tempo mediano do titular no encerramento', numerica: true, celula: (r) => r.medianaIndividual === null ? '—' : minutosTempoResposta(r.medianaIndividual) },
      ]}
    /> : <p className="text-sm text-muted-foreground">Ainda não há respostas com medição confiável nesta amostra.</p>}
    <Dica>A meta do cliente considera a primeira resposta humana, inclusive cobertura. O tempo individual considera os períodos de responsabilidade e desconta horários ocupados quando a agenda cobre o período. Registros sem agenda podem incluir reuniões; consulte o estado da agenda nos detalhes. Uma troca não atribui toda a espera ao novo titular, e pessoas não são identificadas apenas pelo nome. Não use esta amostra como avaliação individual.</Dica>
  </Secao>
}

function Indicador({ titulo, valor, detalhe, tom }: { titulo: string; valor: number; detalhe: string; tom?: string }) {
  return <div className="rounded-lg border border-border bg-card p-4">
    <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
    <p className={cn('mt-2 t-h1 tabular-nums', tom === 'atraso' && 'text-danger', tom === 'atencao' && 'text-note-fg')}>{valor}</p>
    <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>
  </div>
}

export function LinhaTempoResposta({ episodio: e }: { episodio: EpisodioTempoResposta }) {
  const selo = situacaoTempoResposta(e)
  const confiavel = e.qualidade === 'confiavel' && e.minutos_cliente !== null
  const individualConfiavel = confiavel && e.qualidade_individual !== 'inconclusiva'
  return <article className="space-y-3 py-4">
    <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_130px_140px]">
      <div className="min-w-0 space-y-1">
        {e.client_id ? <Link to={`/clientes/${encodeURIComponent(e.client_id)}`} className={cn('rounded font-semibold text-foreground hover:text-primary', foco)}>{e.cliente}</Link> : <p className="font-semibold">{e.cliente || 'Conversa sem cliente vinculado'}</p>}
        <p className="text-xs text-muted-foreground">{e.responsavel || 'Responsável a definir'} · Desde {dataTempoResposta(e.inicio)}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', selo.tom === 'atraso' ? 'bg-danger-light text-danger' : selo.tom === 'atencao' ? 'bg-note text-note-fg' : selo.tom === 'ok' ? 'bg-success-light text-success' : 'bg-muted text-muted-foreground')}>{selo.texto}</span>
          {e.pausado && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"><PauseCircle className="h-3 w-3" aria-hidden /> Responsável em pausa · avisos em pausa</span>}
          {e.agenda_status === 'unavailable' && <span className="rounded-full bg-note px-2 py-0.5 text-xs text-note-fg">Agenda indisponível</span>}
        </div>
      </div>
      <div><p className="text-xs text-muted-foreground">Espera do cliente</p><p className="mt-1 text-lg font-semibold tabular-nums">{confiavel ? minutosTempoResposta(e.minutos_cliente) : 'Pendente'}</p></div>
      <div><p className="text-xs text-muted-foreground">Tempo do responsável atual</p><p className="mt-1 text-lg font-semibold tabular-nums">{individualConfiavel ? minutosTempoResposta(e.minutos_estrategista) : 'Pendente'}</p>
        {individualConfiavel && (e.minutos_descontados ?? 0) > 0 && <p className="text-xs text-muted-foreground">{minutosTempoResposta(e.minutos_descontados)} de pausa descontados</p>}
      </div>
    </div>
    {e.motivo && <p className="text-xs text-muted-foreground">{e.motivo}</p>}
    <details className="group rounded-lg border border-border bg-muted/10">
      <summary className={cn('cursor-pointer rounded-lg px-3 py-2 text-xs font-medium text-primary', foco)}>Ver resposta, agenda e avisos</summary>
      <div className="space-y-4 border-t border-border p-3 text-xs">
        <div><p className="font-semibold">Resposta humana</p><p className="mt-1 text-muted-foreground">{e.resposta_em ? `${e.respondente || 'Pessoa não identificada'} · ${dataTempoResposta(e.resposta_em)}` : 'Nenhuma resposta humana confirmada neste registro.'}</p></div>
        <div><p className="font-semibold">Tempo do responsável atual e agenda</p><p className="mt-1 text-muted-foreground">{individualConfiavel ? minutosTempoResposta(e.minutos_estrategista) : 'Medição pendente'} no período de responsabilidade registrado.</p>
          {e.agenda_status === 'connected' ? <p className="mt-1 text-muted-foreground">Agenda consultada: horários marcados como ocupados foram descontados. A agenda informa disponibilidade declarada, sem confirmar presença em reunião.</p>
            : e.agenda_status === 'disconnected' ? <p className="mt-1 text-muted-foreground">Agenda desconectada: os avisos voltam a considerar a espera do cliente. O tempo individual de períodos sem cobertura fica pendente.</p>
            : e.agenda_status === 'unavailable' ? <p className="mt-1 text-note-fg">Não foi possível consultar a agenda. O tempo individual fica pendente e os avisos aguardam a disponibilidade voltar.</p>
            : e.agenda_status === 'incomplete' ? <p className="mt-1 text-muted-foreground">A cobertura da agenda não pôde ser confirmada para todo este período. O tempo individual fica pendente; a espera do cliente continua visível.</p>
            : <p className="mt-1 text-muted-foreground">Sem agenda conectada ou sem informação de sincronização. Este tempo considera apenas o expediente e as pausas já registradas; não confirma a disponibilidade real da pessoa.</p>}
          {individualConfiavel && (e.minutos_descontados ?? 0) > 0 && <p className="text-muted-foreground">{minutosTempoResposta(e.minutos_descontados)} de pausa descontados, sem contar o almoço ou sobreposições duas vezes.</p>}
        </div>
        <div><p className="font-semibold">Histórico de responsabilidade</p>{e.segmentos.length ? <ul className="mt-1 space-y-1 text-muted-foreground">{e.segmentos.map((s, i) => <li key={`${s.user_id}:${s.inicio}:${i}`}>{s.nome} · {dataTempoResposta(s.inicio)} até {s.fim ? dataTempoResposta(s.fim) : 'agora'}</li>)}</ul> : <p className="mt-1 text-muted-foreground">Sem responsável confirmado para esta espera.</p>}</div>
        <div><p className="font-semibold">Avisos da Íris</p>{e.historico_alertas.length ? <ul className="mt-2 space-y-2">{e.historico_alertas.map((a) => <li key={a.id} className="rounded border border-border bg-background p-2">
          <p>{a.etapa === '60' ? 'Meta ultrapassada' : `${a.etapa} minutos`} · {rotulosEntrega[a.status] || 'Situação em conferência'} · {dataTempoResposta(a.created_at)}</p>
          {a.texto ? <details className="mt-2"><summary className={cn('cursor-pointer rounded font-medium text-primary', foco)}>Ver mensagem registrada</summary><pre className="mt-2 whitespace-pre-wrap break-words font-sans leading-relaxed text-muted-foreground">{a.texto}</pre></details> : <p className="mt-1 text-muted-foreground">Sem mensagem registrada para exibir.</p>}
        </li>)}</ul> : <p className="mt-1 text-muted-foreground">Nenhum aviso registrado nesta espera.</p>}</div>
      </div>
    </details>
  </article>
}

function ConfiguracaoTempoResposta({ config, agora, ocupado, agir }: { config: ConfigTempoResposta; agora: string; ocupado: boolean; agir: Agir }) {
  const [draft, setDraft] = useState(() => ({ ...config, textoFeriados: config.feriados.join('\n') }))
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const ano = anoTempoResposta(agora)
  const mudou = config.revisao !== draft.revisao
  const carregar = () => { setDraft({ ...config, textoFeriados: config.feriados.join('\n') }); setErro(null); setSalvo(false) }
  const salvar = async (e: FormEvent) => {
    e.preventDefault(); setErro(null); setSalvo(false)
    try {
      const feriados = lerFeriadosTempoResposta(draft.textoFeriados)
      const problema = validarConfigTempoResposta({ ...draft, feriados }, agora)
      if (problema) throw new Error(problema)
      await agir({ acao: 'salvar_config', revisao: draft.revisao, modo: draft.modo, feriados, anos_confirmados: draft.anos_confirmados })
      setSalvo(true)
    } catch (err) { setErro(erroTempoResposta(err)) }
  }
  return <Secao titulo="Configurar acompanhamento" descricao="O horário aprovado é fixo: segunda a sexta, das 9h às 12h e das 13h às 18h, no fuso de Brasília.">
    <form onSubmit={(e) => void salvar(e)} className="space-y-4">
      <fieldset className="grid gap-2 md:grid-cols-3" disabled={ocupado}>
        <legend className="mb-2 text-sm font-medium">Como o monitor deve funcionar</legend>
        {(Object.entries(MODOS_TEMPO_RESPOSTA) as Array<[ModoTempoResposta, { titulo: string; descricao: string }]>).map(([modo, texto]) => <label key={modo} className={cn('flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm', draft.modo === modo ? 'border-primary bg-primary-muted' : 'border-border')}>
          <input type="radio" name="modo-tempo" value={modo} checked={draft.modo === modo} onChange={() => { setDraft((d) => ({ ...d, modo })); setSalvo(false) }} className="mt-1 accent-primary" />
          <span><strong className="block font-medium">{texto.titulo}</strong><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{texto.descricao}</span></span>
        </label>)}
      </fieldset>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm" htmlFor="tempo-feriados"><span className="flex items-center gap-2 font-medium"><CalendarDays className="h-4 w-4" aria-hidden /> Feriados da operação</span>
          <textarea id="tempo-feriados" rows={7} className={cn(campo, 'block h-auto w-full py-2 font-mono text-[13px]')} value={draft.textoFeriados} disabled={ocupado} placeholder="AAAA-MM-DD" onChange={(e) => { setDraft((d) => ({ ...d, textoFeriados: e.target.value, anos_confirmados: [] })); setSalvo(false) }} />
          <span className="block text-xs leading-relaxed text-muted-foreground">Uma data por linha, no formato AAAA-MM-DD. Inclua os feriados nacionais e locais aplicáveis. Só as datas cadastradas serão descontadas.</span>
        </label>
        <fieldset className="space-y-3 rounded-lg bg-muted/30 p-4" disabled={ocupado}>
          <legend className="sr-only">Conferência do calendário</legend><p className="text-sm font-medium">Confira antes de começar</p>
          <p className="text-xs leading-relaxed text-muted-foreground">Confirme que a lista contempla os feriados da operação. Alterar as datas pede nova conferência. Sem o ano atual confirmado, o acompanhamento não pode ser ativado.</p>
          {[...new Set([...draft.anos_confirmados, ano, ano + 1])].sort().map((a) => <label key={a} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.anos_confirmados.includes(a)} onChange={(e) => { setDraft((d) => ({ ...d, anos_confirmados: e.target.checked ? [...new Set([...d.anos_confirmados, a])] : d.anos_confirmados.filter((v) => v !== a) })); setSalvo(false) }} className="mt-0.5 accent-primary" /><span>Conferi o calendário de {a}{a > ano && <span className="block text-xs text-muted-foreground">Prepare o próximo ano com antecedência.</span>}{a < ano && <span className="block text-xs text-muted-foreground">Ano anterior confirmado.</span>}</span></label>)}
        </fieldset>
      </div>
      <Dica>Os avisos ocorrem aos 30 e 50 minutos úteis e após ultrapassar 60. Para receber, cada pessoa precisa estar associada e habilitada no workspace do GT3. Observar não envia mensagens.</Dica>
      {config.monitorando_desde && <p className="text-xs text-muted-foreground">Acompanhamento iniciado em {dataTempoResposta(config.monitorando_desde)}. O monitor não transforma conversas antigas em atrasos novos.</p>}
      {mudou && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm"><span>{salvo ? 'Configuração salva. Carregue a versão atual para continuar editando.' : 'Existe uma versão mais recente. Seu rascunho foi preservado.'}</span><button className={botaoSecundario} type="button" onClick={carregar} disabled={ocupado}>Carregar versão atual</button></div>}
      <MensagemErro texto={erro} />
      <button className={botaoPrimario} disabled={ocupado || mudou || salvo} type="submit">{ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Salvar configuração</button>
    </form>
  </Secao>
}

function PausasTempoResposta({ painel, ocupado, agir }: { painel: PainelTempoResposta; ocupado: boolean; agir: Agir }) {
  const [pessoa, setPessoa] = useState('')
  const [duracao, setDuracao] = useState('30')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const registrar = async (e: FormEvent) => {
    e.preventDefault(); setErro(null)
    if (!pessoa || motivo.trim().length < 3) { setErro('Escolha a pessoa e descreva o motivo da pausa.'); return }
    try { await agir({ acao: 'pausa', user_id: pessoa, duracao_minutos: Number(duracao), motivo: motivo.trim() }); setMotivo('') }
    catch (err) { setErro(erroTempoResposta(err)) }
  }
  const ativas = painel.pausas.filter((p) => Date.parse(p.fim) > Date.parse(painel.agora))
  return <Secao titulo="Reuniões e indisponibilidade" descricao="Registre uma pausa a partir de agora. Ela termina automaticamente e fica no histórico; não agenda reuniões.">
    <form className="space-y-3" onSubmit={(e) => void registrar(e)}>
      <div className="grid gap-3 sm:grid-cols-[1fr_145px]">
        <label className="space-y-1 text-xs font-medium" htmlFor="tempo-pessoa-pausa"><span>Estrategista</span><select id="tempo-pessoa-pausa" className={cn(campo, 'block w-full')} required disabled={ocupado} value={pessoa} onChange={(e) => setPessoa(e.target.value)}><option value="">Selecione</option>{painel.estrategistas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>
        <label className="space-y-1 text-xs font-medium" htmlFor="tempo-duracao"><span>Duração</span><select id="tempo-duracao" className={cn(campo, 'block w-full')} disabled={ocupado} value={duracao} onChange={(e) => setDuracao(e.target.value)}>{[15, 30, 45, 60, 90, 120, 180, 240].map((min) => <option value={min} key={min}>{min} minutos</option>)}</select></label>
      </div>
      <label className="block space-y-1 text-xs font-medium" htmlFor="tempo-motivo"><span>Motivo</span><input id="tempo-motivo" className={cn(campo, 'block w-full')} required minLength={3} maxLength={300} disabled={ocupado} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: reunião de acompanhamento" /></label>
      <button className={botaoSecundario} type="submit" disabled={ocupado || !pessoa || motivo.trim().length < 3}><PauseCircle className="h-4 w-4" aria-hidden /> Iniciar pausa</button>
      <MensagemErro texto={erro} />
    </form>
    <Dica>Durante a pausa, os avisos individuais aguardam o retorno. A espera comercial do cliente continua aparecendo, para permitir cobertura da equipe.</Dica>
    <div className="border-t border-border pt-3"><h3 className="text-sm font-medium">Pausas já registradas e em andamento</h3>{ativas.length ? <ul className="mt-2 divide-y divide-border">{ativas.map((p) => <li className="flex flex-wrap items-center justify-between gap-2 py-2" key={p.id}>
      <div><p className="text-sm font-medium">{p.nome}</p><p className="text-xs text-muted-foreground">Até {dataTempoResposta(p.fim)} · {p.motivo}</p></div>
      <button className={cn(botaoSecundario, 'text-xs')} type="button" disabled={ocupado} onClick={() => void agir({ acao: 'encerrar_pausa', pausa_id: p.id }).catch(() => undefined)}>Encerrar pausa<span className="sr-only"> de {p.nome}</span></button>
    </li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">Nenhuma pausa ativa na consulta.</p>}</div>
  </Secao>
}

function TitularesTempoResposta({ itens, ocupado, agir }: { itens: TitularTempoResposta[]; ocupado: boolean; agir: Agir }) {
  const [busca, setBusca] = useState('')
  const pendentes = itens.filter((t) => t.candidatos.length > 1 && !t.titular_id).length
  const lista = itens.filter((t) => t.cliente.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR')))
  return <Secao titulo="Responsável pelos avisos" descricao="Com apenas um estrategista vinculado ao cliente, o responsável é escolhido automaticamente. Se houver mais de um, defina quem recebe os avisos. Isso não altera contratos nem a carteira.">
    {pendentes > 0 && <p className="text-sm text-note-fg">{pendentes} clientes desta lista precisam de um titular.</p>}
    <label className="block space-y-1 text-xs font-medium" htmlFor="tempo-busca-titular"><span>Buscar cliente nesta lista</span><input id="tempo-busca-titular" className={cn(campo, 'block w-full')} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do cliente" /></label>
    <div className="max-h-96 overflow-y-auto pr-1">{lista.length ? <ul className="divide-y divide-border">{lista.map((t) => <LinhaTitular key={t.client_id} item={t} ocupado={ocupado} agir={agir} />)}</ul> : <p className="py-3 text-sm text-muted-foreground">Nenhum cliente nesta lista.</p>}</div>
    <Dica>A lista oferece apenas pessoas já vinculadas ao cliente. Para mudar a equipe, abra Clientes → ficha do cliente → Responsáveis pelo cliente.</Dica>
  </Secao>
}

function LinhaTitular({ item, ocupado, agir }: { item: TitularTempoResposta; ocupado: boolean; agir: Agir }) {
  const [pessoa, setPessoa] = useState(item.titular_id ?? '')
  return <li className="space-y-2 py-3">
    <p className="text-sm font-medium">{item.cliente}</p>
    <div className="flex items-start gap-2"><select className={cn(campo, 'min-w-0 flex-1')} aria-label={`Titular de ${item.cliente}`} value={pessoa} disabled={ocupado} onChange={(e) => setPessoa(e.target.value)}>
      <option value="">{item.candidatos.length === 1 ? 'Usar o único estrategista vinculado' : 'Sem titular definido'}</option>
      {item.candidatos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
    </select><button className={botaoSecundario} type="button" disabled={ocupado || pessoa === (item.titular_id ?? '')} onClick={() => void agir({ acao: 'titular', client_id: item.client_id, user_id: pessoa || null }).catch(() => undefined)}>Salvar<span className="sr-only"> titular de {item.cliente}</span></button></div>
  </li>
}
