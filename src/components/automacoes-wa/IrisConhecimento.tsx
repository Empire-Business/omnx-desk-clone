import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, ChevronDown, GraduationCap, Loader2, RefreshCw, Save, Trash2, Wrench } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  mensagemErroWa, useAlterarAprendizadoAgente, useExcluirAprendizadoAgente,
  type AprendizadoAgente,
} from '@/hooks/useAutomacoesWa'
import {
  useAprendizadosAgentePaginados, useFerramentasAgentePainel, useHistoricoMemoriaAgente,
  useMemoriasAgente, usePodeVerMemoriasAgente, usePerfilAgente, useSalvarPerfilAgente, ErroPerfilAgente,
  type FiltrosAprendizadosAgente, type PerfilAgentePainel,
} from '@/hooks/useAutomacoesWaAgentePainel'
import { formataDataCurta } from '@/lib/automacoesWa'
import {
  CATEGORIAS_APRENDIZADO, LIMITE_APRENDIZADOS_ATIVOS, rotuloCategoria,
} from '@/lib/automacoesWaAprendizado'
import { cn } from '@/lib/utils'
import { Aviso, Dica, Interruptor, MensagemErro, MensagemSucesso, Secao } from './comum'
import { botaoPrimario, botaoSecundario, campo, foco } from './estilos'

/** O perfil é editado inteiro; feedbacks curtos continuam no registro de aprendizados. */
export function PreferenciasIris({ nome }: { nome: string }) {
  const consulta = usePerfilAgente()
  return (
    <Secao titulo="Personalidade e contexto"
      descricao={`Edite o perfil completo que orienta as respostas da ${nome}. Os dois textos são salvos juntos.`}>
      {!consulta.data ? consulta.isLoading ? <Carregando /> : <>
        <MensagemErro texto={mensagemErroWa(consulta.error, 'Não foi possível carregar o perfil da Íris.')} />
        <button type="button" className={botaoSecundario} disabled={consulta.isFetching} onClick={() => void consulta.refetch()}>
          <RefreshCw className={cn('h-3.5 w-3.5', consulta.isFetching && 'animate-spin')} aria-hidden /> Tentar novamente
        </button>
      </> : <EditorPerfilIris nome={nome} perfil={consulta.data} erroConsulta={consulta.error}
        aoRecarregar={async () => {
          const resultado = await consulta.refetch()
          if (resultado.error) throw resultado.error
          if (!resultado.data) throw new Error('O servidor não retornou o perfil. Seu rascunho foi preservado.')
          return resultado.data
        }} />}
    </Secao>
  )
}

function EditorPerfilIris({ nome, perfil, erroConsulta, aoRecarregar }: {
  nome: string; perfil: PerfilAgentePainel; erroConsulta: unknown; aoRecarregar: () => Promise<PerfilAgentePainel>
}) {
  const salvar = useSalvarPerfilAgente()
  const [base, setBase] = useState(perfil)
  const [rascunho, setRascunho] = useState({ personalidade: perfil.personalidade, contexto: perfil.contexto })
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState(false)
  const [conflito, setConflito] = useState(false)
  const [recarregando, setRecarregando] = useState(false)
  const [confirmar, setConfirmar] = useState<'recarregar' | 'desfazer' | null>(null)
  const alterado = rascunho.personalidade !== base.personalidade || rascunho.contexto !== base.contexto
  const versaoDiferente = perfil.revisao !== base.revisao || perfil.versao_padrao !== base.versao_padrao
    || perfil.personalidade !== base.personalidade || perfil.contexto !== base.contexto
  const excedido = rascunho.personalidade.length > base.limites.personalidade || rascunho.contexto.length > base.limites.contexto
    || rascunho.personalidade.length + rascunho.contexto.length > base.limites.total
  const vazio = !rascunho.personalidade.trim() || !rascunho.contexto.trim()
  const ocupado = salvar.isPending || recarregando

  const carregarTexto = (valor: PerfilAgentePainel) => {
    setBase(valor)
    setRascunho({ personalidade: valor.personalidade, contexto: valor.contexto })
    setErro(null); setConflito(false); setFeito(false)
  }
  const recarregar = async () => {
    setRecarregando(true); setErro(null)
    try { carregarTexto(await aoRecarregar()) }
    catch (err) { setErro(mensagemErroWa(err, 'Não foi possível recarregar o perfil. Seu rascunho foi preservado.')) }
    finally { setRecarregando(false); setConfirmar(null) }
  }
  const gravar = (e: FormEvent) => {
    e.preventDefault()
    if (ocupado || conflito || versaoDiferente) return
    setErro(null); setFeito(false)
    if (vazio) { setErro('Preencha a personalidade e o contexto antes de salvar o perfil.'); return }
    if (excedido) { setErro('Revise o limite de caracteres indicado nos editores. Seu texto não foi cortado.'); return }
    salvar.mutate({ ...rascunho, revisao: base.revisao }, {
      onSuccess: (valor) => { carregarTexto(valor); setFeito(true) },
      onError: (err) => {
        if (err instanceof ErroPerfilAgente && err.status === 409) setConflito(true)
        else setErro(mensagemErroWa(err, 'Não foi possível salvar o perfil. Seu rascunho foi preservado.'))
      },
    })
  }
  return (
    <>
    <form onSubmit={gravar} className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{base.origem === 'padrao' ? 'Padrão em uso; ainda não personalizado' : 'Perfil personalizado em uso'}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{base.origem === 'padrao'
            ? 'Os editores mostram o padrão completo do sistema. Personalize os textos e salve para usar sua própria versão.'
            : `Última gravação por ${base.atualizado_por || 'autor não informado'}${base.atualizado_em ? ` em ${formataDataCurta(base.atualizado_em)}` : ''}.`}</p>
        </div>
        <button type="button" className={botaoSecundario} disabled={ocupado}
          onClick={() => alterado ? setConfirmar('recarregar') : void recarregar()}>
          <RefreshCw className={cn('h-3.5 w-3.5', recarregando && 'animate-spin')} aria-hidden /> Recarregar perfil
        </button>
      </div>

      {(conflito || versaoDiferente) && <Aviso>Há outra versão do perfil no servidor. Seu rascunho foi preservado. Copie o que deseja manter e use “Recarregar perfil” antes de salvar novamente.</Aviso>}
      {erroConsulta != null && <MensagemErro texto={mensagemErroWa(erroConsulta, 'Não foi possível atualizar a consulta do perfil. O texto que você está editando foi preservado.')} />}

      <CampoPerfilIris id="iris-personalidade" titulo="Personalidade" valor={rascunho.personalidade}
        descricao="Identidade, tom de voz, forma de raciocinar e de apresentar as respostas."
        limite={base.limites.personalidade} disabled={ocupado}
        aoMudar={(personalidade) => { setRascunho((atual) => ({ ...atual, personalidade })); setFeito(false); setErro(null) }} />
      <CampoPerfilIris id="iris-contexto" titulo="Contexto de trabalho" valor={rascunho.contexto}
        descricao="Contexto da operação, responsabilidades, prioridades e referências para orientar o trabalho."
        limite={base.limites.contexto} disabled={ocupado}
        aoMudar={(contexto) => { setRascunho((atual) => ({ ...atual, contexto })); setFeito(false); setErro(null) }} />

      <Dica>Os textos salvos orientam as próximas respostas da {nome}. Não alteram permissões, regras de segurança ou destinos de mensagens. O perfil fica separado dos registros de aprendizado e da memória dos clientes.</Dica>
      {excedido && <MensagemErro texto="O perfil ultrapassa o limite permitido. Reduza os campos indicados antes de salvar; nenhum trecho foi cortado." />}
      <MensagemErro texto={erro} />
      {feito && !alterado && <MensagemSucesso texto={`Perfil salvo. A ${nome} passa a usar esses textos nas próximas respostas.`} />}

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
        <p role="status" className={cn('text-xs', alterado ? 'font-medium text-note-fg' : 'text-muted-foreground')}>
          {salvar.isPending ? 'Salvando perfil…' : recarregando ? 'Recarregando perfil…' : conflito || versaoDiferente ? 'Rascunho preservado · recarregue o perfil para continuar' : alterado ? 'Alterações ainda não salvas' : base.origem === 'salvo' ? 'Perfil salvo · sem alterações pendentes' : 'Padrão carregado · sem alterações pendentes'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={botaoSecundario} disabled={!alterado || ocupado} onClick={() => setConfirmar('desfazer')}>Desfazer alterações</button>
          <button type="submit" disabled={ocupado || vazio || excedido || conflito || versaoDiferente || (!alterado && base.origem === 'salvo')} className={botaoPrimario}>
            {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} Salvar perfil
          </button>
        </div>
      </div>

    </form>
      <ConfirmDialog open={confirmar !== null} onClose={() => { if (!ocupado) setConfirmar(null) }}
        title={confirmar === 'recarregar' ? 'Recarregar o perfil do servidor?' : 'Desfazer as alterações?'}
        description={confirmar === 'recarregar'
          ? 'Os dois editores serão preenchidos com a versão atual do servidor. As alterações não salvas serão descartadas. Copie antes os trechos que deseja manter.'
          : 'Os dois editores voltarão ao perfil que você carregou. As alterações não salvas serão descartadas.'}
        confirmLabel={confirmar === 'recarregar' ? 'Recarregar perfil' : 'Desfazer alterações'} loading={recarregando}
        onConfirm={() => {
          if (confirmar === 'recarregar') void recarregar()
          else { setRascunho({ personalidade: base.personalidade, contexto: base.contexto }); setErro(null); setFeito(false); setConfirmar(null) }
        }} />
    </>
  )
}

function CampoPerfilIris({ id, titulo, descricao, valor, limite, disabled, aoMudar }: {
  id: string; titulo: string; descricao: string; valor: string; limite: number; disabled: boolean; aoMudar: (valor: string) => void
}) {
  const excedido = valor.length > limite
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <label htmlFor={id} className="text-base font-semibold text-foreground">{titulo}</label>
          <p id={`${id}-descricao`} className="mt-1 text-xs leading-relaxed text-muted-foreground">{descricao}</p>
        </div>
        <span id={`${id}-contador`} className={cn('text-xs tabular-nums', excedido ? 'font-medium text-danger' : 'text-muted-foreground')}>
          {valor.length.toLocaleString('pt-BR')} / {limite.toLocaleString('pt-BR')} caracteres{excedido ? ' · limite excedido' : ''}
        </span>
      </div>
      <textarea id={id} className={cn(campo, 'h-auto min-h-[28rem] w-full resize-y py-2 leading-6', excedido && 'border-danger/40')}
        rows={20} value={valor} disabled={disabled} required aria-invalid={excedido}
        aria-describedby={`${id}-descricao ${id}-contador`} onChange={(e) => aoMudar(e.target.value)} />
    </div>
  )
}

export function FerramentasIris() {
  const consulta = useFerramentasAgentePainel()
  const itens = consulta.data ?? []
  return (
    <Secao titulo="Ferramentas da Íris"
      descricao="Consultas e ações oferecidas pelo servidor. O acesso efetivo depende de quem pergunta e do canal usado."
      acao={<button type="button" className={botaoSecundario} disabled={consulta.isFetching} onClick={() => void consulta.refetch()}><RefreshCw className={cn('h-3.5 w-3.5', consulta.isFetching && 'animate-spin')} aria-hidden /> Atualizar</button>}>
      <Dica>Use “Pessoas e canais” para definir quem pode conversar com a Íris, quais clientes cada pessoa enxerga e quais grupos estão liberados. As ferramentas respeitam esses acessos.</Dica>
      {consulta.isLoading ? <Carregando /> : consulta.error ? <MensagemErro texto={mensagemErroWa(consulta.error, 'Não foi possível carregar o catálogo de ferramentas do servidor.')} />
        : itens.length === 0 ? <Vazio texto="O servidor não retornou ferramentas disponíveis para esta configuração." /> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {itens.map((item) => (
              <article key={item.nome} className="space-y-2 rounded-lg border border-border p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2"><Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /><code className="break-all text-xs text-foreground">{item.nome}</code></span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[12px] text-muted-foreground">{item.altera_dados ? 'Pode registrar mudanças' : 'Consulta'}</span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.descricao}</p>
              </article>
            ))}
          </div>
        )}
    </Secao>
  )
}

export function AprendizadosIris({ nome }: { nome: string }) {
  const [categoria, setCategoria] = useState('')
  const [estado, setEstado] = useState('todos')
  const [origem, setOrigem] = useState('')
  const filtros: FiltrosAprendizadosAgente = {
    ...(categoria ? { categoria } : {}),
    ...(estado !== 'todos' ? { ativo: estado === 'ativos' } : {}),
    ...(origem === 'tela' || origem === 'whatsapp' ? { origem } : {}),
  }
  const lista = useAprendizadosAgentePaginados(true, filtros)
  const ativos = useAprendizadosAgentePaginados(true, { ativo: true })
  const alterar = useAlterarAprendizadoAgente()
  const excluir = useExcluirAprendizadoAgente()
  const [erro, setErro] = useState<string | null>(null)
  const [apagar, setApagar] = useState<AprendizadoAgente | null>(null)
  const itens = lista.data?.pages.flatMap((p) => p.itens) ?? []
  const total = lista.data?.pages[0]?.total ?? null
  const totalAtivos = ativos.data?.pages[0]?.total ?? null
  const cheio = totalAtivos !== null && totalAtivos >= LIMITE_APRENDIZADOS_ATIVOS
  return (
    <Secao titulo="Registro de aprendizados"
      descricao={`Correções e preferências ensinadas explicitamente à ${nome}. Inclui registros ativos e desativados, com origem, autor e data.`}
      acao={<span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{totalAtivos === null ? 'Preferências da equipe' : `${totalAtivos} preferências ativas`}</span>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-muted-foreground">Categoria
          <select className={cn(campo, 'block w-full')} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas as categorias</option>
            {CATEGORIAS_APRENDIZADO.map((c) => <option key={c} value={c}>{rotuloCategoria(c)}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">Estado
          <select className={cn(campo, 'block w-full')} value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="todos">Ativos e desativados</option><option value="ativos">Só ativos</option><option value="desativados">Só desativados</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">Origem
          <select className={cn(campo, 'block w-full')} value={origem} onChange={(e) => setOrigem(e.target.value)}>
            <option value="">Todas as origens</option><option value="whatsapp">WhatsApp</option><option value="tela">Tela</option>
          </select>
        </label>
      </div>
      {lista.isLoading ? <Carregando /> : lista.error ? <MensagemErro texto={mensagemErroWa(lista.error, 'Não foi possível carregar os aprendizados.')} />
        : lista.data?.pages[0]?.disponivel === false ? <Aviso>O armazenamento de aprendizados ainda não está disponível nesta instalação.</Aviso>
          : itens.length === 0 ? <Vazio texto="Nenhum aprendizado encontrado para esses filtros. O perfil de “Personalidade e contexto” é salvo separadamente." /> : (
            <>
              <p className="text-xs text-muted-foreground">{itens.length}{total !== null ? ` de ${total}` : ''} registros carregados · do mais recente para o mais antigo</p>
              <ul className="divide-y divide-border">
                {itens.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start gap-3 py-3">
                    <span className="mt-0.5 rounded-lg bg-muted p-2 text-muted-foreground" aria-hidden><GraduationCap className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1 basis-52 space-y-1.5">
                      <p className={cn('break-words text-sm leading-relaxed', a.ativo ? 'text-foreground' : 'text-muted-foreground')}>{a.instrucao}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {rotuloCategoria(a.categoria)} · {a.criado_por_nome || 'Autor não registrado'} · {a.origem === 'tela' ? 'Tela' : 'WhatsApp'} · {formataDataCurta(a.created_at)}
                        {!a.ativo && ` · desativado${a.desativado_em ? ` em ${formataDataCurta(a.desativado_em)}` : ''}`}
                      </p>
                    </div>
                    <span className={cn('rounded-full px-2 py-0.5 text-[12px]', a.ativo ? 'bg-success-light text-success' : 'bg-muted text-muted-foreground')}>{a.ativo ? 'Ativo' : 'Desativado'}</span>
                    <Interruptor ligado={a.ativo} rotulo={`Seguir a preferência: ${a.instrucao.slice(0, 60)}`} disabled={alterar.isPending || (!a.ativo && cheio)}
                      onChange={(ativo) => { setErro(null); alterar.mutate({ id: a.id, ativo }, { onError: (e) => setErro(mensagemErroWa(e, 'Não foi possível alterar.')) }) }} />
                    <button type="button" aria-label={`Apagar preferência: ${a.instrucao.slice(0, 60)}`} onClick={() => setApagar(a)}
                      className={cn('rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-danger', foco)}><Trash2 className="h-4 w-4" aria-hidden /></button>
                  </li>
                ))}
              </ul>
              <Mais disponivel={lista.hasNextPage} carregando={lista.isFetchingNextPage} aoClicar={() => void lista.fetchNextPage()} />
            </>
          )}
      <Dica>Os feedbacks registrados pela equipe orientam as respostas enquanto ativos. Não há treinamento automático a partir de toda conversa. Para preservar um registro sem segui-lo, desative a preferência. O perfil de “Personalidade e contexto” é editado separadamente.</Dica>
      <MensagemErro texto={erro} />
      <ConfirmDialog open={apagar !== null} onClose={() => setApagar(null)} title="Apagar esta preferência?"
        description={`A ${nome} deixa de seguir a instrução e o registro é removido. Para manter o histórico, use o interruptor para desativar.`}
        confirmLabel="Apagar" loading={excluir.isPending}
        onConfirm={() => apagar && excluir.mutate(apagar.id, { onSuccess: () => setApagar(null), onError: (e) => { setApagar(null); setErro(mensagemErroWa(e, 'Não foi possível apagar.')) } })} />
    </Secao>
  )
}

export function MemoriasIris() {
  const acesso = usePodeVerMemoriasAgente()
  const lista = useMemoriasAgente(acesso.data === true)
  const [historicoId, setHistoricoId] = useState<string | null>(null)
  const itens = lista.data?.pages.flatMap((p) => p.itens) ?? []
  return (
    <Secao titulo="Memória por cliente"
      descricao="Resumos do relacionamento, pendências e eventos usados como contexto pela Íris. Essa memória é diferente das preferências ensinadas pela equipe.">
      {acesso.isLoading ? <Carregando /> : acesso.error ? <MensagemErro texto={mensagemErroWa(acesso.error, 'Não foi possível conferir o acesso às memórias.')} />
        : acesso.data !== true ? <Aviso>A consulta às memórias exige perfil de gestão e permissão de administração da Íris.</Aviso>
          : lista.isLoading ? <Carregando /> : lista.error ? <MensagemErro texto={mensagemErroWa(lista.error, 'Não foi possível carregar as memórias.')} />
            : lista.data?.pages[0]?.disponivel === false ? <Aviso>O armazenamento de memória por cliente ainda não está disponível nesta instalação.</Aviso>
              : itens.length === 0 ? <Vazio texto="Ainda não há memória por cliente. Os resumos aparecem depois que a análise de relacionamento processa clientes com canais confirmados." /> : (
                <>
                  <p className="text-xs text-muted-foreground">{itens.length}{lista.data?.pages[0]?.total != null ? ` de ${lista.data.pages[0].total}` : ''} clientes carregados</p>
                  <div className="space-y-3">
                    {itens.map((m) => (
                      <article key={m.client_id} className="space-y-3 rounded-lg border border-border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Link to={`/clientes/${m.client_id}`} className={cn('text-sm font-semibold text-foreground hover:underline', foco)}>{m.cliente_nome || 'Cliente sem nome disponível'}</Link>
                          <span className="text-xs text-muted-foreground">{m.processado_em ? `Atualizada em ${formataDataCurta(m.processado_em)}` : 'Aguardando primeira análise'}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full bg-muted px-2 py-1">Satisfação: {rotuloEstado(m.satisfacao)}</span>
                          <span className="rounded-full bg-muted px-2 py-1">Risco: {rotuloEstado(m.risco)}</span>
                          <span className="rounded-full bg-muted px-2 py-1">{(m.pendencias ?? []).filter((p) => p.status !== 'resolvida').length} pendências abertas</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{m.resumo?.trim() || 'Ainda não há resumo salvo para este cliente.'}</p>
                        {m.motivo && <p className="text-xs leading-relaxed text-muted-foreground">{m.motivo}</p>}
                        {(m.pendencias?.length > 0 || m.eventos?.length > 0) && <details className="text-sm">
                          <summary className={cn('cursor-pointer text-muted-foreground', foco)}>Pendências e eventos registrados</summary>
                          <ul className="mt-2 space-y-2 border-l border-border pl-3 text-xs text-muted-foreground">
                            {(m.pendencias ?? []).map((p, i) => <li key={`p-${i}`}>{p.tema_curto} · {p.status === 'resolvida' ? 'resolvida' : 'aberta'}{p.desde ? ` · desde ${dataMemoria(p.desde)}` : ''}</li>)}
                            {(m.eventos ?? []).map((e, i) => <li key={`e-${i}`}>{dataMemoria(e.data)} · {e.resumo_curto}</li>)}
                          </ul>
                        </details>}
                        <button type="button" className={botaoSecundario} onClick={() => setHistoricoId(historicoId === m.client_id ? null : m.client_id)} aria-expanded={historicoId === m.client_id}>
                          <BookOpen className="h-3.5 w-3.5" aria-hidden /> {historicoId === m.client_id ? 'Fechar histórico' : 'Ver histórico da memória'}
                        </button>
                        {historicoId === m.client_id && <HistoricoMemoriaIris clientId={m.client_id} />}
                      </article>
                    ))}
                  </div>
                  <Mais disponivel={lista.hasNextPage} carregando={lista.isFetchingNextPage} aoClicar={() => void lista.fetchNextPage()} />
                </>
              )}
    </Secao>
  )
}

function HistoricoMemoriaIris({ clientId }: { clientId: string }) {
  const consulta = useHistoricoMemoriaAgente(clientId)
  const itens = consulta.data?.pages.flatMap((p) => p.itens) ?? []
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <p className="text-xs font-medium text-foreground">Mudanças registradas no relacionamento</p>
      {consulta.isLoading ? <Carregando /> : consulta.error ? <MensagemErro texto={mensagemErroWa(consulta.error, 'Não foi possível carregar o histórico.')} />
        : consulta.data?.pages[0]?.disponivel === false ? <Aviso>O histórico de memória ainda não está disponível nesta instalação.</Aviso>
          : itens.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma versão anterior registrada. O histórico é criado quando a análise identifica mudanças no relacionamento.</p> : <>
            <ol className="space-y-3">
              {itens.map((item) => <li key={item.id} className="border-l-2 border-border pl-3">
                <p className="text-xs text-muted-foreground">{formataDataCurta(item.criado_em)} · {rotuloEstado(item.satisfacao)} · risco {rotuloEstado(item.risco)}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{item.resumo?.trim() || 'Sem resumo nessa versão.'}</p>
                {item.motivo && <p className="mt-1 text-xs text-muted-foreground">{item.motivo}</p>}
              </li>)}
            </ol>
            <Mais disponivel={consulta.hasNextPage} carregando={consulta.isFetchingNextPage} aoClicar={() => void consulta.fetchNextPage()} />
          </>}
    </div>
  )
}

function rotuloEstado(valor: string): string {
  return ({ satisfeito: 'satisfeito', neutro: 'neutro', atencao: 'atenção', insatisfeito: 'insatisfeito', sem_dados: 'sem dados', baixo: 'baixo', medio: 'médio', alto: 'alto' } as Record<string, string>)[valor] ?? valor
}

function dataMemoria(valor: string): string {
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  return dia ? `${dia[3]}/${dia[2]}/${dia[1]}` : valor
}

function Mais({ disponivel, carregando, aoClicar }: { disponivel: boolean; carregando: boolean; aoClicar: () => void }) {
  return disponivel ? <button type="button" className={botaoSecundario} disabled={carregando} onClick={aoClicar}>
    {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />} Carregar mais
  </button> : null
}

function Carregando() { return <p className="text-sm text-muted-foreground" role="status">Carregando…</p> }
function Vazio({ texto }: { texto: string }) { return <p className="rounded-lg border border-dashed border-border px-4 py-5 text-sm leading-relaxed text-muted-foreground">{texto}</p> }
