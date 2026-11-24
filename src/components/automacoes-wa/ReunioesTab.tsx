import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, CheckCircle2, Loader2, Plus, Send } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { useClientes } from '@/hooks/useClientes'
import {
  usePainelWa, useSalvarWaAutoConfig, mensagemErroWa,
  useMarcarReuniao, useReunioesAgendadas, useReunioesAnteriores, useGruposCliente, useEnviarLinkReuniao,
  type ReuniaoAgendada,
} from '@/hooks/useAutomacoesWa'
import {
  formataDataHoraBrasilia, interpretarEnvioLink, traduzErroEnvio, validarLinkReuniao, validarMarcacao, type GrupoOpcao,
} from '@/lib/automacoesWa'
import { cn } from '@/lib/utils'
import {
  AjudaTooltip, Aviso, Dica, Esqueleto, EsqueletoAba, IndicadorSalvo, Interruptor, MensagemErro, MensagemSucesso, Secao,
} from './comum'
import { ROTA_ABA, botaoLink, botaoPrimario, botaoSecundario, campo, foco } from './estilos'

const DURACOES = [15, 30, 45, 60, 90, 120]
const rotuloDuracao = (d: number) => (d < 60 ? `${d} minutos` : d === 60 ? '1 hora' : `${String(d / 60).replace('.', ',')} horas`)

/** Reuniões: marcar (ninguém é avisado) e, quando quiser, mandar o link no grupo do cliente. */
export function ReunioesTab() {
  const painel = usePainelWa()
  const salvar = useSalvarWaAutoConfig()
  const { data: clientes } = useClientes()
  const [erro, setErro] = useState<string | null>(null)
  const [marcando, setMarcando] = useState(false)
  const [ok, setOk] = useState<{ texto: string; aviso?: string } | null>(null)
  const [filtro, setFiltro] = useState<'proximas' | 'anteriores'>('proximas')

  if (painel.carregando) return <EsqueletoAba />

  const cfg = painel.config
  const ligado = cfg?.agendamento_ativo ?? false
  const semNumero = !cfg?.uazapi_instance_id
  const oficial = cfg?.provider === 'zernio'

  const nomeCliente = (id: string | null) => {
    const c = clientes?.find((x) => x.id === id)
    return c ? (c.nome || c.empresa || 'Cliente sem nome') : 'Cliente'
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Link da reunião">
        <div className="flex flex-wrap items-center gap-3">
          <Interruptor id="chave-reunioes" ligado={ligado} rotulo="Permitir enviar o link no grupo pelo WhatsApp"
            disabled={salvar.isPending}
            onChange={(v) => { setErro(null); salvar.mutate({ agendamento_ativo: v }, { onError: (e) => setErro(mensagemErroWa(e, 'Não foi possível salvar.')) }) }} />
          <label htmlFor="chave-reunioes" className="text-sm font-medium text-foreground">Permitir enviar o link no grupo pelo WhatsApp</label>
          <AjudaTooltip texto="O link sempre sai pelo WhatsApp de Conversas, mesmo que os outros envios usem o WhatsApp Oficial." />
          <IndicadorSalvo status={salvar.status} quando={salvar.submittedAt} />
        </div>
        <p className="text-sm text-muted-foreground">
          Marque a reunião e mande o link no grupo do cliente quando quiser. Marcar não manda mensagem a ninguém.
        </p>
        {semNumero && (
          <Aviso acao={<Link to={ROTA_ABA('conexao')} className={botaoLink}>Conexão</Link>}>
            {oficial ? 'Escolha o número para grupos' : 'Escolha o número que envia'} (WhatsApp de Conversas) para poder mandar o link.
          </Aviso>
        )}
        <MensagemErro texto={erro} />
      </section>

      <Secao titulo="Reuniões"
        acao={
          <button type="button" className={botaoPrimario} disabled={!ligado} onClick={() => { setOk(null); setMarcando(true) }}
            aria-describedby={!ligado ? 'motivo-marcar' : undefined}>
            <Plus className="h-4 w-4" /> Marcar reunião
          </button>
        }>
        {!ligado && <p id="motivo-marcar" className="text-xs text-muted-foreground">Ligue a chave acima para marcar reuniões e mandar links.</p>}
        {ok && (
          <div className="space-y-1">
            <MensagemSucesso texto={ok.texto} />
            {ok.aviso && <Aviso>{traduzErroEnvio(ok.aviso)}</Aviso>}
          </div>
        )}

        <div role="group" aria-label="Quais reuniões mostrar" className="flex gap-1">
          {([['proximas', 'Próximas'], ['anteriores', 'Anteriores']] as const).map(([v, r]) => (
            <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', foco,
                filtro === v ? 'border-primary bg-primary-muted text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
              {r}
            </button>
          ))}
        </div>

        {filtro === 'proximas'
          ? <ListaProximas podeEnviar={ligado && !semNumero} nomeCliente={nomeCliente} />
          : <ListaAnteriores nomeCliente={nomeCliente} />}
      </Secao>

      <Modal open={marcando} onClose={() => setMarcando(false)} title="Marcar reunião"
        description="Só coloca a reunião na agenda. O cliente não é avisado agora.">
        <MarcarForm onMarcada={(r) => { setOk(r); setMarcando(false); setFiltro('proximas') }} onCancelar={() => setMarcando(false)} />
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

function ListaProximas({ podeEnviar, nomeCliente }: { podeEnviar: boolean; nomeCliente: (id: string | null) => string }) {
  const { data: reunioes, isLoading, isError } = useReunioesAgendadas()
  const [aberta, setAberta] = useState<string | null>(null)

  if (isLoading) return <div className="space-y-2"><Esqueleto className="h-12 w-full" /><Esqueleto className="h-12 w-full" /></div>
  if (isError) return <p role="alert" className="text-sm text-danger">Não foi possível carregar as reuniões.</p>
  if (!reunioes || reunioes.length === 0) {
    return <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma reunião marcada. Use “Marcar reunião” para começar.</p>
  }
  return (
    <ul className="divide-y divide-border">
      {reunioes.map((r) => (
        <li key={r.id} className="space-y-3 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <LinhaReuniao r={r} nome={nomeCliente(r.client_id)} />
            {r.link_enviado_em ? (
              <span className="inline-flex items-center gap-1 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Link enviado em {formataDataHoraBrasilia(r.link_enviado_em)}
              </span>
            ) : aberta !== r.id ? (
              <button type="button" className={botaoSecundario} disabled={!podeEnviar} onClick={() => setAberta(r.id)}>
                <Send className="h-4 w-4" /> Enviar link no grupo
              </button>
            ) : null}
          </div>
          {aberta === r.id && !r.link_enviado_em && (
            <EnviarLinkPainel reuniao={r} nomeCliente={nomeCliente(r.client_id)} onFechar={() => setAberta(null)} />
          )}
        </li>
      ))}
    </ul>
  )
}

function ListaAnteriores({ nomeCliente }: { nomeCliente: (id: string | null) => string }) {
  const { data: reunioes, isLoading, isError } = useReunioesAnteriores()
  if (isLoading) return <div className="space-y-2"><Esqueleto className="h-12 w-full" /><Esqueleto className="h-12 w-full" /></div>
  if (isError) return <p role="alert" className="text-sm text-danger">Não foi possível carregar as reuniões.</p>
  if (!reunioes || reunioes.length === 0) {
    return <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma reunião nos últimos 60 dias.</p>
  }
  return (
    <ul className="divide-y divide-border">
      {reunioes.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
          <LinhaReuniao r={r} nome={nomeCliente(r.client_id)} />
          <span className="text-xs text-muted-foreground">{r.link_enviado_em ? 'Link enviado' : 'Link não enviado'}</span>
        </li>
      ))}
    </ul>
  )
}

function LinhaReuniao({ r, nome }: { r: ReuniaoAgendada; nome: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-foreground">{nome}</p>
      <p className="text-xs text-muted-foreground">
        {formataDataHoraBrasilia(r.scheduled_at)}
        {r.scheduled_duration_min ? ` · ${rotuloDuracao(r.scheduled_duration_min)}` : ''}
        {r.title ? ` · ${r.title}` : ''}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Marcar (dentro da janela)
// ---------------------------------------------------------------------------

function MarcarForm({ onMarcada, onCancelar }: {
  onMarcada: (r: { texto: string; aviso?: string }) => void
  onCancelar: () => void
}) {
  const { data: clientes, isLoading } = useClientes()
  const marcar = useMarcarReuniao()
  const [clientId, setClientId] = useState('')
  const [dataHora, setDataHora] = useState('')
  const [duracao, setDuracao] = useState(30)
  const [titulo, setTitulo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const opcoes = useMemo(
    () => (clientes ?? [])
      .filter((c) => c.ativo !== false)
      .map((c) => ({ id: c.id, nome: c.nome || c.empresa || 'Cliente sem nome' })),
    [clientes],
  )

  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    const v = validarMarcacao({ clientId, dataHora, duracaoMin: duracao })
    if (!v.ok) { setErro(v.erro); return }
    marcar.mutate({ ...v.valor, titulo: titulo.trim() || undefined }, {
      onSuccess: (r) => {
        if (!r.ok) { setErro(traduzErroEnvio(r.error) || 'Não foi possível marcar a reunião.'); return }
        const quando = formataDataHoraBrasilia(v.valor.scheduled_at)
        onMarcada({
          texto: r.status === 'ja_marcada'
            ? `Essa reunião já estava na agenda (${quando}).`
            : `Reunião com ${r.cliente ?? 'o cliente'} marcada para ${quando}. Nenhuma mensagem foi enviada.`,
          aviso: r.aviso,
        })
      },
      onError: (err) => setErro(mensagemErroWa(err, 'Não foi possível marcar a reunião.')),
    })
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span className="text-foreground">Cliente</span>
        {isLoading ? <Esqueleto className="h-9 w-full" /> : (
          <select className={cn(campo, 'w-full')} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Escolha o cliente</option>
            {opcoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        )}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-foreground">Data e hora (Brasília)</span>
          <input type="datetime-local" className={cn(campo, 'w-full')} value={dataHora} onChange={(e) => setDataHora(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-foreground">Duração</span>
          <select className={cn(campo, 'w-full')} value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}>
            {DURACOES.map((d) => <option key={d} value={d}>{rotuloDuracao(d)}</option>)}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-foreground">Título (opcional)</span>
        <input className={cn(campo, 'w-full')} value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)}
          placeholder="Em branco: Reunião com (nome do cliente)" />
      </label>
      <MensagemErro texto={erro} />
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={botaoSecundario} onClick={onCancelar} disabled={marcar.isPending}>Cancelar</button>
        <button type="submit" className={botaoPrimario} disabled={marcar.isPending}>
          {marcar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
          Marcar na agenda
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Enviar o link no grupo
// ---------------------------------------------------------------------------

function EnviarLinkPainel({ reuniao, nomeCliente, onFechar }: { reuniao: ReuniaoAgendada; nomeCliente: string; onFechar: () => void }) {
  const { data: gruposResp, isLoading: carregandoGrupos } = useGruposCliente(reuniao.client_id)
  const enviar = useEnviarLinkReuniao()
  const [link, setLink] = useState('')
  const [grupoId, setGrupoId] = useState('')
  const [gruposServidor, setGruposServidor] = useState<GrupoOpcao[] | null>(null)
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  // Lista do servidor no envio (escolher_grupo) tem prioridade sobre a consulta inicial.
  const grupos = gruposServidor ?? gruposResp?.grupos ?? []
  const precisaEscolher = grupos.length > 1
  const [data, hora] = formataDataHoraBrasilia(reuniao.scheduled_at).split(' às ')

  const disparar = (confirmarReenvio = false) => {
    setErro(null)
    setSucesso(null)
    const l = validarLinkReuniao(link)
    if (!l.ok) { setErro(l.erro); return }
    if (precisaEscolher && !grupoId) { setErro('Escolha em qual grupo enviar o link.'); return }
    enviar.mutate(
      {
        meeting_id: reuniao.id,
        meeting_link: l.valor ?? undefined,
        grupo_contact_id: grupoId || undefined,
        confirmar_reenvio: confirmarReenvio || undefined,
      },
      {
        onSuccess: (r) => {
          const d = interpretarEnvioLink(r)
          setConfirmar(null)
          if (d.tipo === 'enviado' || d.tipo === 'ja_enviado') setSucesso(d.texto)
          else if (d.tipo === 'escolher_grupo') { setGruposServidor(d.grupos); setGrupoId(''); setErro(d.texto) }
          else if (d.tipo === 'confirmar_reenvio') setConfirmar(d.texto)
          else setErro(traduzErroEnvio(d.texto))
        },
        onError: (e) => { setConfirmar(null); setErro(mensagemErroWa(e, 'Não foi possível enviar.')) },
      },
    )
  }

  const semGrupo = !carregandoGrupos && gruposResp?.ok !== false && grupos.length === 0

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <label className="block space-y-1 text-sm">
        <span className="text-foreground">Link da reunião (opcional)</span>
        <input className={cn(campo, 'w-full')} value={link} onChange={(e) => setLink(e.target.value)} spellCheck={false}
          inputMode="url" placeholder="https://meet.google.com/…" />
        <span className="block text-xs text-muted-foreground">Em branco, usamos a sala de reunião do próprio sistema.</span>
      </label>

      <div>
        <p className="mb-1 text-xs text-muted-foreground">Assim a mensagem chega no grupo:</p>
        <p className="max-w-md whitespace-pre-wrap break-words rounded-lg rounded-tl-sm bg-success-light px-3 py-2 text-sm text-foreground">
          {`Olá, ${nomeCliente}! Segue o link da nossa reunião de ${data || '(data)'} às ${hora || '(hora)'}:\n${link.trim() || '(link da sala de reunião)'}`}
        </p>
      </div>

      {carregandoGrupos ? (
        <Esqueleto className="h-5 w-56" />
      ) : gruposResp && !gruposResp.ok && !gruposServidor ? (
        <Aviso>{traduzErroEnvio(gruposResp.error) || 'Não foi possível ver os grupos do cliente.'}</Aviso>
      ) : semGrupo ? (
        <Aviso acao={<Link to="/conversas" className={botaoLink}>Abrir Conversas</Link>}>
          {gruposResp?.aviso ? traduzErroEnvio(gruposResp.aviso) : `${nomeCliente} ainda não tem grupo de WhatsApp ligado a ele neste número. Ligue o grupo ao cliente em Conversas.`}
        </Aviso>
      ) : precisaEscolher ? (
        <fieldset className="space-y-1">
          <legend className="text-sm text-foreground">Este cliente tem mais de um grupo. Em qual enviar?</legend>
          {grupos.map((g) => (
            <label key={g.contact_id} className="flex items-center gap-2 text-sm text-foreground">
              <input type="radio" name={`grupo-${reuniao.id}`} value={g.contact_id} checked={grupoId === g.contact_id}
                onChange={() => setGrupoId(g.contact_id)} className={foco} />
              {g.nome}
            </label>
          ))}
        </fieldset>
      ) : (
        <Dica>Vai para o grupo “{grupos[0].nome}”. O link de cada reunião só pode ser enviado uma vez.</Dica>
      )}

      {sucesso ? (
        <MensagemSucesso texto={sucesso} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={botaoPrimario} disabled={enviar.isPending || semGrupo} onClick={() => disparar(false)}>
            {enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar agora
          </button>
          <button type="button" onClick={onFechar} disabled={enviar.isPending} className={botaoSecundario}>Cancelar</button>
        </div>
      )}
      <MensagemErro texto={erro} />

      <ConfirmDialog
        open={confirmar !== null}
        onClose={() => setConfirmar(null)}
        title="O link pode já ter chegado"
        description={`${confirmar ?? ''} Só confirme se você olhou o grupo e o link não está lá.`}
        confirmLabel="Não chegou, enviar de novo"
        loading={enviar.isPending}
        onConfirm={() => disparar(true)}
      />
    </div>
  )
}
