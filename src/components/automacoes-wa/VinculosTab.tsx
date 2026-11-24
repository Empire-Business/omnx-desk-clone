import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Check, Loader2, MessageCircle, RefreshCw, Search, Undo2, User, UserX, Users, X,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { mensagemErroWa } from '@/hooks/useAutomacoesWa'
import {
  useBuscarClientesVinculo, useDecidirVinculo, useRecalcularVinculos, useUltimaExecucaoVinculos, useVinculos,
} from '@/hooks/useVinculosWa'
import {
  type AcaoVinculo, type CanalVinculo, type FiltroVinculos, type SugestaoVinculo, type TipoCanalWa,
  forcaSugestao, frasesEvidencia, numerosComGruposOcultos, resumoCanais, rotuloOrigem, rotuloTipoCanal, situacaoCanal,
  textoInstancias, textoMensagens,
} from '@/lib/automacoesWaVinculos'
import { cn } from '@/lib/utils'
import { Aviso, Dica, EsqueletoAba, MensagemErro, Secao } from './comum'
import { botaoPrimario, botaoSecundario, campo, foco } from './estilos'

/** Botão pequeno das linhas. */
const botaoLinha = cn(botaoSecundario, 'px-2.5 py-1.5 text-xs')
const botaoLinhaPrimario = cn(botaoPrimario, 'px-2.5 py-1.5 text-xs')
/** Quantas linhas aparecem antes do "Mostrar mais". */
const PAGINA = 40

const FILTROS: { valor: FiltroVinculos; rotulo: string; dica: string }[] = [
  { valor: 'ativos', rotulo: 'Ativos em 30 dias', dica: 'Conversas com mensagem nos últimos 30 dias.' },
  { valor: 'pendentes', rotulo: 'Falta decidir', dica: 'Ativas em 30 dias e ainda sem dono: ninguém disse de qual cliente são.' },
  { valor: 'todos', rotulo: 'Todas', dica: 'Todas as conversas, inclusive as paradas há muito tempo.' },
]

const TIPOS: { valor: TipoCanalWa | null; rotulo: string }[] = [
  { valor: null, rotulo: 'Grupos e privadas' },
  { valor: 'grupo', rotulo: 'Só grupos' },
  { valor: 'privado', rotulo: 'Só conversas privadas' },
]

function dataHora(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(d).replace(',', ' às')
}

/** Frase do aviso depois de decidir. */
function fraseFeito(c: CanalVinculo, acao: AcaoVinculo, cliente?: string): string {
  switch (acao) {
    case 'aceitar':
    case 'trocar': return `${c.nome} agora é de ${cliente ?? 'o cliente escolhido'}.`
    case 'adicionar': return `${cliente ?? 'O cliente'} também foi ligado a ${c.nome}.`
    case 'rejeitar': return `${c.nome}: sugestão recusada.`
    case 'interno': return `${c.nome} ficou marcado como ${c.tipo === 'grupo' ? 'grupo interno da equipe' : 'pessoa da equipe'}.`
    case 'nao_cliente': return `${c.nome} ficou marcado como "não é cliente".`
    case 'reabrir': return `${c.nome} voltou para "falta decidir".`
  }
}

/**
 * Aba "Vínculos": diz de qual cliente é cada grupo e cada conversa privada.
 * Só o que está ligado a um cliente entra na análise de satisfação, no relatório
 * e no que o assistente sabe sobre o cliente. Só admin e gerente.
 */
export function VinculosTab() {
  const { user } = useAuth()
  const gestao = user?.perfil === 'admin' || user?.perfil === 'gerente'
  if (!gestao) {
    return (
      <Secao titulo="Vínculos de conversas">
        <p className="text-sm text-muted-foreground">Só administradores e gerentes podem ver e decidir os vínculos das conversas.</p>
      </Secao>
    )
  }
  return <ConteudoVinculos />
}

/**
 * Vindo do alerta "grupo sem cliente" (?contato=<id do contato>&nome=<nome do
 * grupo>): mostra só aquele grupo. O contato do alerta pode ser outra cópia do
 * mesmo grupo (outro número), por isso o nome também vale.
 */
function filtrarPorParametro(canais: CanalVinculo[], contato: string | null, nome: string | null): CanalVinculo[] {
  if (!contato && !nome) return canais
  const porContato = contato ? canais.filter((c) => c.contato_id === contato) : []
  if (porContato.length > 0) return porContato
  const n = (nome ?? '').trim().toLowerCase()
  return n ? canais.filter((c) => c.nome.trim().toLowerCase() === n) : []
}

function ConteudoVinculos() {
  const [params, setParams] = useSearchParams()
  const contatoParam = params.get('contato')
  // Só para achar o grupo (nunca exibido): até 80 caracteres.
  const nomeParam = params.get('nome')?.slice(0, 80) ?? null
  const focado = Boolean(contatoParam || nomeParam)
  const [filtro, setFiltro] = useState<FiltroVinculos>(focado ? 'todos' : 'ativos')
  const [tipo, setTipo] = useState<TipoCanalWa | null>(focado ? 'grupo' : null)
  const [limite, setLimite] = useState(PAGINA)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [escolhendo, setEscolhendo] = useState<CanalVinculo | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const consulta = useVinculos(filtro, tipo)
  const decidir = useDecidirVinculo()
  const recalcular = useRecalcularVinculos()
  const execucao = useUltimaExecucaoVinculos()

  const agir = (c: CanalVinculo, acao: AcaoVinculo, cliente?: { id: string; nome: string }) => {
    setErro(null)
    setAviso(null)
    setOcupado(c.contato_id)
    decidir.mutate({ contato_id: c.contato_id, acao, client_id: cliente?.id ?? null }, {
      onSuccess: () => setAviso(fraseFeito(c, acao, cliente?.nome)),
      onError: (e) => setErro(mensagemErroWa(e, 'Não foi possível salvar. Tente de novo.')),
      onSettled: () => setOcupado(null),
    })
  }

  const rodarRecalculo = () => {
    setErro(null)
    setAviso(null)
    recalcular.mutate(undefined, {
      onSuccess: (r) => {
        if (!r.ok) { setErro(r.error || 'Não foi possível recalcular agora.'); return }
        const novos = r.gravados ?? 0
        setAviso(novos === 0
          ? 'Sugestões conferidas: nada novo por enquanto.'
          : `Sugestões atualizadas: ${novos === 1 ? '1 novidade' : `${novos} novidades`}${r.confirmados ? ` (${r.confirmados} ligadas automaticamente pelo telefone ou por já estarem ligadas em Conversas)` : ''}.`)
      },
      onError: () => setErro('Não foi possível recalcular agora. Tente de novo em alguns minutos.'),
    })
  }

  const canais = filtrarPorParametro(consulta.data ?? [], contatoParam, nomeParam)
  const verTodas = () => {
    setParams((p) => { p.delete('contato'); p.delete('nome'); return p }, { replace: true })
    setFiltro('ativos')
    setTipo(null)
  }
  const resumo = resumoCanais(canais)
  const ocultos = numerosComGruposOcultos(canais)
  const temOcultos = canais.some((c) => c.tipo === 'grupo' && c.ocultar_grupos)
  const visiveis = canais.slice(0, limite)
  const ultima = execucao.data?.criado_em ? dataHora(execucao.data.criado_em) : ''

  return (
    <div className="space-y-4">
      <Secao
        titulo="Vínculos de conversas"
        descricao="Diga de qual cliente é cada grupo e cada conversa. Só o que estiver ligado a um cliente entra na análise de satisfação, no relatório diário e no que o assistente sabe sobre o cliente. A escolha vale para todos os números da empresa."
        acao={
          <button type="button" onClick={rodarRecalculo} disabled={recalcular.isPending} className={botaoLinha}>
            <RefreshCw className={cn('h-3.5 w-3.5', recalcular.isPending && 'animate-spin')} aria-hidden />
            {recalcular.isPending ? 'Recalculando…' : 'Recalcular sugestões'}
          </button>
        }>
        <div className="flex flex-wrap items-center gap-2">
          <Segmentos rotulo="Quais conversas" opcoes={FILTROS.map((f) => ({ valor: f.valor, rotulo: f.rotulo, dica: f.dica }))}
            valor={filtro} onChange={(v) => { setFiltro(v); setLimite(PAGINA) }} />
          <Segmentos rotulo="Tipo de conversa" opcoes={TIPOS.map((t) => ({ valor: t.valor ?? 'ambos', rotulo: t.rotulo }))}
            valor={tipo ?? 'ambos'} onChange={(v) => { setTipo(v === 'ambos' ? null : v as TipoCanalWa); setLimite(PAGINA) }} />
        </div>
        <Dica>
          {FILTROS.find((f) => f.valor === filtro)?.dica}{' '}
          {ultima ? `Sugestões automáticas atualizadas em ${ultima}.` : 'As sugestões automáticas são atualizadas todo dia às 6h30.'}
        </Dica>

        {focado && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <span>
              {canais[0]?.nome
                ? <>Mostrando só o grupo do alerta: <strong className="font-medium">{canais[0].nome}</strong>.</>
                : 'Mostrando só o grupo do alerta.'}
            </span>
            <button type="button" className={botaoLinha} onClick={verTodas}>Ver todas as conversas</button>
          </div>
        )}

        {temOcultos && (
          <Aviso>
            {ocultos.length === 1
              ? <>O número <strong>{ocultos[0]}</strong> está com “Ocultar grupos” ligado</>
              : ocultos.length > 1
                ? <>Os números <strong>{ocultos.join(', ')}</strong> estão com “Ocultar grupos” ligado</>
                : <>Algum número está com “Ocultar grupos” ligado</>}
            : a equipe não vê esses grupos em Conversas, e por isso muitos grupos de clientes ficaram sem vínculo. Aqui eles aparecem mesmo assim.
          </Aviso>
        )}

        <MensagemErro texto={erro ?? (consulta.isError ? mensagemErroWa(consulta.error, 'Não foi possível carregar as conversas.') : null)} />
        <p role="status" aria-live="polite" className={cn('text-sm text-success', !aviso && 'sr-only')}>{aviso}</p>

        {consulta.isLoading ? (
          <EsqueletoAba />
        ) : consulta.isError && canais.length === 0 ? (
          <button type="button" onClick={() => consulta.refetch()} className={botaoSecundario}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Tentar de novo
          </button>
        ) : canais.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-success" aria-hidden />
            {filtro === 'pendentes' ? 'Nada para decidir agora. Tudo em dia.' : 'Nenhuma conversa neste filtro.'}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {resumo.total === 1 ? '1 conversa' : `${resumo.total} conversas`}
              {resumo.semDecisao > 0 && <> · <strong className="font-medium text-foreground">{resumo.semDecisao} sem decisão</strong></>}
              {resumo.comSugestao > 0 && <> ({resumo.comSugestao} com sugestão)</>}
              {resumo.clientes > 0 && <> · {resumo.clientes} já ligadas a cliente</>}
            </p>
            <ul className="divide-y divide-border">
              {visiveis.map((c) => (
                <LinhaCanal key={c.contato_id} canal={c} ocupado={ocupado === c.contato_id}
                  onAgir={(acao, cliente) => agir(c, acao, cliente)} onOutroCliente={() => setEscolhendo(c)} />
              ))}
            </ul>
            {canais.length > limite && (
              <button type="button" className={botaoSecundario} onClick={() => setLimite((l) => l + PAGINA)}>
                Mostrar mais ({canais.length - limite})
              </button>
            )}
          </>
        )}
      </Secao>

      <DialogoOutroCliente canal={escolhendo} onFechar={() => setEscolhendo(null)}
        onEscolher={(acao, cliente) => { if (escolhendo) agir(escolhendo, acao, cliente); setEscolhendo(null) }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filtros em "pílulas" (rádios de verdade por baixo)
// ---------------------------------------------------------------------------

function Segmentos<T extends string>({ rotulo, opcoes, valor, onChange }: {
  rotulo: string
  opcoes: { valor: T; rotulo: string; dica?: string }[]
  valor: T
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full bg-muted/50 p-1">
      {opcoes.map((o) => {
        const sel = o.valor === valor
        return (
          <button key={o.valor} type="button" role="radio" aria-checked={sel} title={o.dica}
            onClick={() => onChange(o.valor)}
            className={cn(
              'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              sel ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              foco,
            )}>
            {o.rotulo}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Uma conversa
// ---------------------------------------------------------------------------

function LinhaCanal({ canal: c, ocupado, onAgir, onOutroCliente }: {
  canal: CanalVinculo
  ocupado: boolean
  onAgir: (acao: AcaoVinculo, cliente?: { id: string; nome: string }) => void
  onOutroCliente: () => void
}) {
  const situacao = situacaoCanal(c)
  const Icone = c.tipo === 'grupo' ? Users : User
  const instancias = textoInstancias(c)
  const rotuloInterno = c.tipo === 'grupo' ? 'Grupo interno' : 'É da equipe'

  return (
    <li className="space-y-2 py-3" aria-busy={ocupado}>
      <div className="flex min-w-0 items-start gap-2.5">
        <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{c.nome}</span>
            <SeloSituacao situacao={situacao} />
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{rotuloTipoCanal(c)}</span>
            <span aria-hidden>·</span>
            <span>{textoMensagens(c.msgs_30d)}</span>
            {instancias && <><span aria-hidden>·</span><span>{instancias}</span></>}
            {c.ocultar_grupos && <><span aria-hidden>·</span><span>escondido em Conversas</span></>}
            <Link to={`/conversas?contato=${encodeURIComponent(c.contato_id)}`}
              className={cn('inline-flex items-center gap-1 rounded font-medium text-primary underline-offset-4 hover:underline', foco)}>
              <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Abrir conversa<span className="sr-only"> {c.nome}</span>
            </Link>
          </p>
        </div>
        {ocupado && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Salvando" />}
      </div>

      <div className="space-y-2 pl-6">
        {situacao === 'interno_sistema' && (
          <p className="text-sm text-muted-foreground">
            Grupo interno do relatório diário ou do assistente. Nunca entra na análise de clientes.
          </p>
        )}

        {situacao === 'cliente' && (
          <>
            <ul className="space-y-0.5">
              {c.clientes.map((cl) => (
                <li key={cl.id} className="text-sm text-foreground">
                  Cliente: <strong className="font-medium">{cl.nome}</strong>{' '}
                  <span className="text-xs text-muted-foreground">({rotuloOrigem(cl.origem, cl.revisado)})</span>
                </li>
              ))}
            </ul>
            <Acoes ocupado={ocupado}>
              <button type="button" className={botaoLinha} disabled={ocupado} onClick={onOutroCliente}>
                <Search className="h-3.5 w-3.5" aria-hidden /> Trocar cliente<span className="sr-only">: {c.nome}</span>
              </button>
              <button type="button" className={botaoLinha} disabled={ocupado} onClick={() => onAgir('interno')}>
                {rotuloInterno}<span className="sr-only">: {c.nome}</span>
              </button>
              <button type="button" className={botaoLinha} disabled={ocupado} onClick={() => onAgir('nao_cliente')}>
                <UserX className="h-3.5 w-3.5" aria-hidden /> Não é cliente<span className="sr-only">: {c.nome}</span>
              </button>
            </Acoes>
          </>
        )}

        {(situacao === 'interno' || situacao === 'nao_cliente') && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              {situacao === 'interno'
                ? (c.tipo === 'grupo' ? 'Marcado como grupo interno da equipe.' : 'Marcado como pessoa da equipe.')
                : 'Marcado como “não é cliente”.'}{' '}
              Não entra na análise.
            </p>
            <button type="button" className={botaoLinha} disabled={ocupado} onClick={() => onAgir('reabrir')}>
              <Undo2 className="h-3.5 w-3.5" aria-hidden /> Desfazer<span className="sr-only">: {c.nome}</span>
            </button>
          </div>
        )}

        {(situacao === 'sugestao' || situacao === 'pendente') && (
          <>
            {c.sugestoes.map((s) => (
              <Sugestao key={s.id} sugestao={s} ocupado={ocupado} nomeCanal={c.nome}
                onAceitar={() => onAgir('aceitar', { id: s.id, nome: s.nome })}
                onRecusar={c.sugestoes.length > 1 ? () => onAgir('rejeitar', { id: s.id, nome: s.nome }) : undefined} />
            ))}
            {situacao === 'pendente' && (
              <p className="text-sm text-muted-foreground">Sem sugestão automática. Escolha o cliente ou diga o que é esta conversa.</p>
            )}
            <Acoes ocupado={ocupado}>
              <button type="button" className={botaoLinha} disabled={ocupado} onClick={onOutroCliente}>
                <Search className="h-3.5 w-3.5" aria-hidden />
                {situacao === 'sugestao' ? 'Outro cliente' : 'Escolher cliente'}<span className="sr-only">: {c.nome}</span>
              </button>
              <button type="button" className={botaoLinha} disabled={ocupado} onClick={() => onAgir('interno')}>
                {rotuloInterno}<span className="sr-only">: {c.nome}</span>
              </button>
              <button type="button" className={botaoLinha} disabled={ocupado} onClick={() => onAgir('nao_cliente')}>
                <UserX className="h-3.5 w-3.5" aria-hidden /> Não é cliente<span className="sr-only">: {c.nome}</span>
              </button>
            </Acoes>
          </>
        )}
      </div>
    </li>
  )
}

function Acoes({ children, ocupado }: { children: ReactNode; ocupado: boolean }) {
  return <div className={cn('flex flex-wrap items-center gap-2', ocupado && 'opacity-70')}>{children}</div>
}

function Sugestao({ sugestao: s, nomeCanal, ocupado, onAceitar, onRecusar }: {
  sugestao: SugestaoVinculo
  nomeCanal: string
  ocupado: boolean
  onAceitar: () => void
  onRecusar?: () => void
}) {
  const frases = frasesEvidencia(s.evidencias, s.origem)
  const forca = forcaSugestao(s.score)
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-foreground">
          Sugestão: <strong className="font-medium">{s.nome}</strong>{' '}
          <span className={cn('ml-1 rounded-full px-2 py-0.5 text-[12px] font-medium',
            forca === 'forte' ? 'bg-success-light text-success'
              : forca === 'media' ? 'bg-note text-note-fg'
                : 'bg-muted text-muted-foreground')}>
            {forca === 'forte' ? 'sinal forte' : forca === 'media' ? 'sinal médio' : 'sinal fraco'}
          </span>
        </p>
        <button type="button" className={botaoLinhaPrimario} disabled={ocupado} onClick={onAceitar}>
          <Check className="h-3.5 w-3.5" aria-hidden /> Aceitar<span className="sr-only">: {nomeCanal} é de {s.nome}</span>
        </button>
        {onRecusar && (
          <button type="button" className={botaoLinha} disabled={ocupado} onClick={onRecusar}>
            <X className="h-3.5 w-3.5" aria-hidden /> Não é este<span className="sr-only">: {s.nome}</span>
          </button>
        )}
      </div>
      {frases.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
          {frases.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
    </div>
  )
}

function SeloSituacao({ situacao }: { situacao: ReturnType<typeof situacaoCanal> }) {
  const cfg = {
    interno_sistema: { texto: 'Interno', classe: 'bg-muted text-muted-foreground' },
    interno: { texto: 'Equipe', classe: 'bg-muted text-muted-foreground' },
    nao_cliente: { texto: 'Não é cliente', classe: 'bg-muted text-muted-foreground' },
    cliente: { texto: 'Ligado a cliente', classe: 'bg-success-light text-success' },
    sugestao: { texto: 'Tem sugestão', classe: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
    pendente: { texto: 'Falta decidir', classe: 'bg-note text-note-fg' },
  }[situacao]
  return <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium', cfg.classe)}>{cfg.texto}</span>
}

// ---------------------------------------------------------------------------
// "Outro cliente": busca por nome / empresa
// ---------------------------------------------------------------------------

function DialogoOutroCliente({ canal, onFechar, onEscolher }: {
  canal: CanalVinculo | null
  onFechar: () => void
  onEscolher: (acao: AcaoVinculo, cliente: { id: string; nome: string }) => void
}) {
  return (
    <Modal open={canal !== null} onClose={onFechar} size="md"
      title={canal ? `De qual cliente é “${canal.nome}”?` : 'Escolher cliente'}
      description="Procure pelo nome do cliente, da empresa ou pela razão social.">
      {/* key: cada vez que abre, a busca começa do zero. */}
      {canal && <BuscaCliente key={canal.contato_id} canal={canal} onEscolher={onEscolher} />}
    </Modal>
  )
}

function BuscaCliente({ canal, onEscolher }: {
  canal: CanalVinculo
  onEscolher: (acao: AcaoVinculo, cliente: { id: string; nome: string }) => void
}) {
  const [texto, setTexto] = useState('')
  const [busca, setBusca] = useState('')
  const [manter, setManter] = useState(false)
  // Espera a pessoa parar de digitar (não consulta a cada tecla).
  useEffect(() => {
    const t = setTimeout(() => setBusca(texto), 300)
    return () => clearTimeout(t)
  }, [texto])
  const resultado = useBuscarClientesVinculo(busca)
  const jaTem = canal.clientes.length > 0
  const atuais = new Set(canal.clientes.map((c) => c.id))

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-foreground">Cliente</span>
        <input type="search" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={80}
          placeholder="Digite pelo menos 2 letras" className={cn(campo, 'w-full')} />
      </label>
      {jaTem && canal.tipo === 'grupo' && (
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" checked={manter} onChange={(e) => setManter(e.target.checked)} className="mt-1" />
          <span>
            Manter também {canal.clientes.length === 1 ? <strong className="font-medium">{canal.clientes[0].nome}</strong> : 'os clientes atuais'}
            <span className="block text-xs text-muted-foreground">Use quando o grupo é de dois clientes ao mesmo tempo.</span>
          </span>
        </label>
      )}

      {busca.trim().length < 2 ? (
        <Dica>Comece a digitar para ver os clientes.</Dica>
      ) : resultado.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Procurando…</p>
      ) : resultado.isError ? (
        <MensagemErro texto={mensagemErroWa(resultado.error, 'Não foi possível procurar agora.')} />
      ) : (resultado.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum cliente encontrado com esse nome.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border" aria-label="Clientes encontrados">
          {(resultado.data ?? []).map((cl) => (
            <li key={cl.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{cl.nome}</p>
                <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  {cl.empresa && <span className="truncate">{cl.empresa}</span>}
                  {cl.vigente && <span className="text-success">contrato em andamento</span>}
                  {!cl.ativo && <span>cliente inativo</span>}
                </p>
              </div>
              {atuais.has(cl.id) ? (
                <span className="text-xs text-muted-foreground">já ligado</span>
              ) : (
                <button type="button" className={botaoLinhaPrimario}
                  onClick={() => onEscolher(jaTem && manter ? 'adicionar' : 'trocar', { id: cl.id, nome: cl.nome })}>
                  Escolher<span className="sr-only"> {cl.nome}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
