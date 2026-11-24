import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, Loader2, MinusCircle, RefreshCw, Send, XCircle } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useInstances, type WaInstance } from '@/hooks/useChat'
import {
  useSalvarWaAutoConfig, mensagemErroWa, usePainelWa,
  useWaIntegracaoStatus, useSalvarTokenWa, useTestarEnvioWa, useWaModelos, useAcaoModelosWa,
  type WaAutoConfig, type WaIntegracaoStatus,
} from '@/hooks/useAutomacoesWa'
import {
  IDIOMAS_MODELO, PROVEDOR_AMIGAVEL, QUEM_RECEBE_MODELO, formataDataHoraBrasilia, infoStatusModelo,
  mascaraTelefone, modeloPronto, traduzErroEnvio, type ModeloWa, type Provedor, type TipoModeloWa, type TomStatusModelo,
} from '@/lib/automacoesWa'
import { normalizaTelefoneBR } from '@/lib/telefone'
import { E164 } from '@/lib/waMensagem'
import { cn } from '@/lib/utils'
import {
  Aviso, CartoesEscolha, Dica, Esqueleto, EsqueletoAba, IndicadorSalvo, MensagemErro, MensagemSucesso, Secao,
} from './comum'
import { botaoLink, botaoPrimario, botaoSecundario, campo } from './estilos'

type GravarConfig = (campos: Partial<Omit<WaAutoConfig, 'id'>>) => void

const TITULO_MODELO: Record<TipoModeloWa, string> = {
  relatorio: 'Relatório diário',
  resumo: 'Resumo semanal',
  link: 'Link da reunião',
}

export function ConexaoTab() {
  const painel = usePainelWa()
  const salvarProvedor = useSalvarWaAutoConfig()
  const [erro, setErro] = useState<string | null>(null)
  const [trocarPara, setTrocarPara] = useState<Provedor | null>(null)

  if (painel.carregando) return <EsqueletoAba />

  const cfg = painel.config
  const provider: Provedor = cfg?.provider ?? 'uazapi'
  const oficial = provider === 'zernio'
  const algoLigado = Boolean(cfg?.relatorio_ativo || cfg?.resumo_ativo || cfg?.agendamento_ativo)
  const conectado = oficial ? painel.conexao.zernioConectado : Boolean(cfg?.uazapi_instance_id)
  const relatorioAprovado = modeloPronto(painel.modelos, 'relatorio', cfg?.template_relatorio)

  const gravarProvedor = (p: Provedor) => {
    setErro(null)
    salvarProvedor.mutate({ provider: p }, { onError: (e) => setErro(mensagemErroWa(e, 'Não foi possível salvar.')) })
  }
  const escolher = (p: Provedor) => {
    if (p === provider) return
    if (algoLigado) setTrocarPara(p)
    else gravarProvedor(p)
  }

  return (
    <div className="space-y-4">
      <Secao numero={1} titulo="Por onde as mensagens saem"
        acao={<IndicadorSalvo status={salvarProvedor.status} quando={salvarProvedor.submittedAt} />}>
        <CartoesEscolha<Provedor>
          nome="provedor"
          legenda="Por onde as mensagens saem"
          valor={provider}
          onChange={escolher}
          disabled={salvarProvedor.isPending}
          opcoes={(['uazapi', 'zernio'] as const).map((p) => ({
            valor: p,
            titulo: PROVEDOR_AMIGAVEL[p].nome,
            descricao: PROVEDOR_AMIGAVEL[p].resumo,
            detalhe: PROVEDOR_AMIGAVEL[p].via,
          }))}
        />
        <MensagemErro texto={erro} />
      </Secao>

      {oficial ? (
        <>
          <ConectarOficial status={painel.zernioStatus} />
          {cfg?.agendamento_ativo && (
            <Secao titulo="Número para grupos (WhatsApp de Conversas)"
              descricao="O link da reunião sai por ele no grupo do cliente, mesmo usando o WhatsApp Oficial.">
              <SeletorNumero valor={cfg.uazapi_instance_id} rotulo="Número para grupos" />
            </Secao>
          )}
          <TextosSecao numero={3} config={cfg} />
        </>
      ) : (
        <Secao numero={2} titulo="Número que envia" descricao="Escolha um dos WhatsApps já conectados em Conversas.">
          <SeletorNumero valor={cfg?.uazapi_instance_id ?? null} rotulo="Número que envia" />
          <details className="group rounded-lg border border-border px-3 py-2 text-sm">
            <summary className="cursor-pointer select-none text-muted-foreground">Avançado</summary>
            <div className="mt-3"><TokenUazapi /></div>
          </details>
        </Secao>
      )}

      <TesteSecao
        numero={oficial ? 4 : 3}
        oficial={oficial}
        bloqueio={!conectado
          ? (oficial ? 'Conecte o WhatsApp Oficial primeiro (passo 2).' : 'Escolha o número que envia primeiro (passo 2).')
          : oficial && !relatorioAprovado
            ? 'Disponível quando o texto do relatório diário for aprovado pela Meta (passo 3).'
            : null}
      />

      <ConfirmDialog
        open={trocarPara !== null}
        onClose={() => setTrocarPara(null)}
        title={`Trocar para o ${trocarPara ? PROVEDOR_AMIGAVEL[trocarPara].nome : ''}?`}
        description={`As automações ligadas passam a sair por ele já no próximo envio. Confira a conexão e envie um teste depois da troca.${
          trocarPara === 'zernio' && cfg?.resumo_ativo && cfg.resumo_destino === 'grupo'
            ? ' Atenção: o resumo semanal no grupo não sai pelo WhatsApp Oficial — mude para o privado na aba Resumo semanal.'
            : ''}`}
        confirmLabel="Trocar"
        loading={salvarProvedor.isPending}
        onConfirm={() => { if (trocarPara) gravarProvedor(trocarPara); setTrocarPara(null) }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Número do WhatsApp do Chat (UAZAPI)
// ---------------------------------------------------------------------------

function rotuloInstancia(i: WaInstance) {
  const desligado = i.status !== 'conectado' ? ' (desconectado)' : ''
  return `${i.nome}${i.numero_whatsapp ? ` — ${i.numero_whatsapp}` : ''}${desligado}`
}

function SeletorNumero({ valor, rotulo }: { valor: string | null; rotulo: string }) {
  const { data: instancias, isLoading } = useInstances(null)
  const salvar = useSalvarWaAutoConfig()
  const [erro, setErro] = useState<string | null>(null)

  if (isLoading) return <Esqueleto className="h-9 w-72 max-w-full" />

  const lista = instancias ?? []
  if (lista.length === 0 && !valor) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border px-3 py-3 text-sm">
        <span className="text-muted-foreground">Nenhum WhatsApp conectado em Conversas ainda.</span>
        <Link to="/conversas" className={botaoLink}>Conectar um número em Conversas</Link>
      </div>
    )
  }

  const escolhida = lista.find((i) => i.instance_id === valor)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className={cn(campo, 'w-full max-w-sm')} aria-label={rotulo} value={valor ?? ''} disabled={salvar.isPending}
          onChange={(e) => {
            setErro(null)
            salvar.mutate({ uazapi_instance_id: e.target.value || null }, { onError: (err) => setErro(mensagemErroWa(err, 'Não foi possível salvar.')) })
          }}>
          <option value="">Escolha um número</option>
          {lista.map((i) => <option key={i.id} value={i.instance_id}>{rotuloInstancia(i)}</option>)}
          {valor && !escolhida && <option value={valor}>Número salvo antes (código {valor.slice(0, 12)})</option>}
        </select>
        <IndicadorSalvo status={salvar.status} quando={salvar.submittedAt} />
      </div>
      {escolhida && escolhida.status !== 'conectado' && (
        <Aviso acao={<Link to="/conversas" className={botaoLink}>Abrir Conversas</Link>}>
          Este número está desconectado em Conversas. Reconecte lendo o QR Code para as mensagens saírem.
        </Aviso>
      )}
      <MensagemErro texto={erro} />
    </div>
  )
}

function StatusChave({ status, carregando }: { status: WaIntegracaoStatus | null | undefined; carregando: boolean }) {
  if (carregando) return <Esqueleto className="h-5 w-48" />
  if (status?.connected) {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-success">
        <CheckCircle2 className="h-4 w-4" aria-hidden /> Conectado desde {formataDataHoraBrasilia(status.updated_at)}
      </p>
    )
  }
  return null
}

/** Token próprio da UAZAPI (opcional — sem ele, usamos o do número escolhido no Chat). */
function TokenUazapi() {
  const { data: status, isLoading } = useWaIntegracaoStatus('uazapi')
  const salvarToken = useSalvarTokenWa()
  const [token, setToken] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState<string | null>(null)
  const podeSalvar = token.trim().length > 0 && !salvarToken.isPending

  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium text-foreground">Token próprio da UAZAPI (opcional)</p>
        <p className="text-xs text-muted-foreground">Normalmente não precisa: usamos o do número escolhido acima. Fica guardado num cofre e não aparece mais na tela.</p>
      </div>
      <StatusChave status={status} carregando={isLoading} />
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault()
        if (!podeSalvar) return
        setErro(null); setSalvo(null)
        salvarToken.mutate({ provider: 'uazapi', token, baseUrl: baseUrl || undefined }, {
          onSuccess: () => { setToken(''); setSalvo('Token salvo com segurança.') },
          onError: (err) => setErro(mensagemErroWa(err, 'Não foi possível salvar.')),
        })
      }}>
        <label className="space-y-1 text-sm">
          <span className="text-foreground">{status?.connected ? 'Trocar token' : 'Token'}</span>
          <input type="password" autoComplete="new-password" spellCheck={false} className={cn(campo, 'w-full')}
            value={token} onChange={(e) => setToken(e.target.value)} placeholder="Cole aqui" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-foreground">Endereço da API</span>
          <input className={cn(campo, 'w-full')} spellCheck={false} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={status?.base_url ?? 'https://suaempresa.uazapi.com'} />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className={botaoSecundario} disabled={!podeSalvar}>
            {salvarToken.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar token
          </button>
        </div>
      </form>
      <Dica>O token precisa ser do mesmo número escolhido acima.</Dica>
      <MensagemSucesso texto={salvo} />
      <MensagemErro texto={erro} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// WhatsApp Oficial (Zernio): chave de acesso + código da conta
// ---------------------------------------------------------------------------

function ConectarOficial({ status }: { status: WaIntegracaoStatus | null }) {
  const salvarToken = useSalvarTokenWa()
  const [editando, setEditando] = useState(false)
  const [token, setToken] = useState('')
  const [accountId, setAccountId] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  const conectado = Boolean(status?.connected)
  const mostrarFormulario = !conectado || editando
  const motivo = !token.trim()
    ? 'Cole a chave de acesso para conectar.'
    : !accountId.trim()
      ? 'Informe o código da conta para conectar.'
      : null

  const conectar = () => {
    if (motivo || salvarToken.isPending) return
    setErro(null); setSucesso(null)
    salvarToken.mutate(
      { provider: 'zernio', token, baseUrl: baseUrl || undefined, accountId },
      {
        onSuccess: () => { setToken(''); setEditando(false); setSucesso('WhatsApp Oficial conectado.') },
        onError: (e) => setErro(mensagemErroWa(e, 'Não foi possível conectar.')),
      },
    )
  }

  return (
    <Secao numero={2} titulo="Conectar o WhatsApp Oficial"
      descricao={mostrarFormulario ? 'Cole a chave de acesso e o código da conta que aparecem no painel da Zernio. A chave fica guardada num cofre e não aparece mais na tela.' : undefined}>
      {conectado && !editando && (
        <div className="flex flex-wrap items-center gap-3">
          <StatusChave status={status} carregando={false} />
          <button type="button" className={botaoSecundario} onClick={() => { setEditando(true); setSucesso(null) }}>Trocar chave</button>
        </div>
      )}

      {mostrarFormulario && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); conectar() }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-foreground">Chave de acesso</span>
              <input type="password" autoComplete="new-password" spellCheck={false} className={cn(campo, 'w-full')}
                value={token} onChange={(e) => setToken(e.target.value)} placeholder="Cole aqui" />
            </label>
            <div className="space-y-1 text-sm">
              <label htmlFor="zernio-conta" className="text-foreground">Código da conta</label>
              <input id="zernio-conta" className={cn(campo, 'w-full')} spellCheck={false} value={accountId}
                onChange={(e) => setAccountId(e.target.value)} placeholder="ex.: 65f1c0a2b3…" />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Onde encontro?</summary>
                <p className="mt-1">No painel da Zernio, abra a conta do WhatsApp e copie o ID dela.</p>
              </details>
            </div>
          </div>
          <details className="rounded-lg border border-border px-3 py-2 text-sm">
            <summary className="cursor-pointer select-none text-muted-foreground">Avançado</summary>
            <label className="mt-3 block max-w-md space-y-1">
              <span className="text-foreground">Endereço da API</span>
              <input className={cn(campo, 'w-full')} spellCheck={false} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={status?.base_url ?? 'https://zernio.com/api/v1'} />
            </label>
          </details>
          <Dica>A chave e o código da conta precisam ser do mesmo número de WhatsApp que vai enviar.</Dica>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={botaoPrimario} disabled={Boolean(motivo) || salvarToken.isPending}
              aria-describedby={motivo ? 'motivo-conectar' : undefined}>
              {salvarToken.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Conectar
            </button>
            {editando && (
              <button type="button" className={botaoSecundario} onClick={() => { setEditando(false); setToken(''); setErro(null) }}>Cancelar</button>
            )}
            {motivo && <span id="motivo-conectar" className="text-xs text-muted-foreground">{motivo}</span>}
          </div>
        </form>
      )}
      <MensagemSucesso texto={sucesso} />
      <MensagemErro texto={erro} />
    </Secao>
  )
}

// ---------------------------------------------------------------------------
// Textos aprovados pela Meta (só no WhatsApp Oficial)
// ---------------------------------------------------------------------------

const SELO: Record<TomStatusModelo, { classe: string; Icone: typeof CheckCircle2 }> = {
  ok: { classe: 'border-success/30 bg-success-light text-success', Icone: CheckCircle2 },
  espera: { classe: 'border-note-border bg-note text-note-fg', Icone: Clock },
  erro: { classe: 'border-danger/40 bg-danger-light text-danger', Icone: XCircle },
  neutro: { classe: 'border-border bg-muted text-muted-foreground', Icone: MinusCircle },
}

function TextosSecao({ numero, config }: { numero: number; config: WaAutoConfig | null }) {
  const { data, isLoading } = useWaModelos(true)
  const acao = useAcaoModelosWa()
  const salvarAvancado = useSalvarWaAutoConfig()
  const [erro, setErro] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [confirmar, setConfirmar] = useState<TipoModeloWa[] | null>(null)
  const [andamento, setAndamento] = useState<string | null>(null)

  const modelos = data?.modelos ?? []
  const faltam = modelos.filter((m) => infoStatusModelo(m.status).podeCriar).map((m) => m.tipo)

  const gravar: GravarConfig = (campos) => {
    setErro(null)
    salvarAvancado.mutate(campos, { onError: (e) => setErro(mensagemErroWa(e, 'Não foi possível salvar.')) })
  }

  const verificar = () => {
    setErro(null); setAvisos([]); setAndamento('status')
    acao.mutate({ acao: 'status' }, {
      onSuccess: (r) => { if (!r.ok) setErro(r.error ?? 'Não deu certo. Tente de novo.'); setAvisos(r.avisos ?? []) },
      onError: (e) => setErro(mensagemErroWa(e, 'Não foi possível falar com a Zernio.')),
      onSettled: () => setAndamento(null),
    })
  }

  /** Pede a aprovação de um ou mais textos, um de cada vez (uma confirmação só). */
  const pedir = async (tipos: TipoModeloWa[]) => {
    setConfirmar(null); setErro(null); setAvisos([])
    const novosAvisos: string[] = []
    for (const tipo of tipos) {
      setAndamento(`criar:${tipo}`)
      try {
        const r = await acao.mutateAsync({ acao: 'criar', tipo })
        if (!r.ok) { setErro(r.error ?? 'Não deu certo. Tente de novo.'); break }
        if (r.status === 'ja_existia') novosAvisos.push(`${TITULO_MODELO[tipo]}: este texto já existia na sua conta — mostramos a situação dele.`)
        novosAvisos.push(...(r.avisos ?? []))
      } catch (e) {
        setErro(mensagemErroWa(e, 'Não foi possível falar com a Zernio.'))
        break
      }
    }
    setAvisos(novosAvisos)
    setAndamento(null)
  }

  return (
    <Secao numero={numero} titulo="Textos aprovados pela Meta"
      descricao="No WhatsApp Oficial, cada mensagem automática usa um texto pronto que a Meta aprova antes (leva de minutos até 24 horas)."
      acao={
        <div className="flex flex-wrap gap-2">
          {faltam.length > 0 && (
            <button type="button" className={botaoPrimario} disabled={acao.isPending} onClick={() => setConfirmar(faltam)}>
              {andamento?.startsWith('criar') && <Loader2 className="h-4 w-4 animate-spin" />}
              Pedir aprovação de todos
            </button>
          )}
          <button type="button" className={botaoSecundario} disabled={acao.isPending || isLoading} onClick={verificar}>
            {andamento === 'status' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Verificar aprovação
          </button>
        </div>
      }>
      {isLoading ? (
        <div className="space-y-3"><Esqueleto className="h-20 w-full" /><Esqueleto className="h-20 w-full" /><Esqueleto className="h-20 w-full" /></div>
      ) : data && !data.ok && modelos.length === 0 ? (
        <MensagemErro texto={data.error ?? 'Não foi possível carregar os textos.'} />
      ) : (
        <ul className="space-y-3">
          {modelos.map((m) => (
            <CartaoTexto key={m.tipo} modelo={m} ocupado={acao.isPending}
              pedindo={andamento === `criar:${m.tipo}`} onPedir={() => setConfirmar([m.tipo])} />
          ))}
        </ul>
      )}

      {avisos.map((a) => <Aviso key={a}>{traduzErroEnvio(a)}</Aviso>)}
      <MensagemErro texto={erro} />

      {config && (
        <details className="rounded-lg border border-border px-3 py-2 text-sm">
          <summary className="cursor-pointer select-none text-muted-foreground">Avançado</summary>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="idioma-textos" className="text-foreground">Idioma dos textos</label>
              <select id="idioma-textos" className={campo} value={config.template_idioma ?? 'pt_BR'}
                onChange={(e) => gravar({ template_idioma: e.target.value })}>
                {IDIOMAS_MODELO.map((i) => <option key={i.valor} value={i.valor}>{i.rotulo}</option>)}
                {!IDIOMAS_MODELO.some((i) => i.valor === config.template_idioma) && (
                  <option value={config.template_idioma}>{config.template_idioma}</option>
                )}
              </select>
              <IndicadorSalvo status={salvarAvancado.status} quando={salvarAvancado.submittedAt} />
            </div>
            <p className="text-xs text-muted-foreground">
              Usar um texto próprio já aprovado (só se a sua empresa tem um com as mesmas informações, na mesma ordem).
              Quando um texto da lista acima for aprovado, o sistema passa a usá-lo sozinho.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {(['template_relatorio', 'template_resumo', 'template_link'] as const).map((chave) => (
                <label key={`${chave}-${config[chave] ?? ''}`} className="space-y-1">
                  <span className="text-xs text-foreground">
                    {chave === 'template_relatorio' ? 'Relatório diário' : chave === 'template_resumo' ? 'Resumo semanal' : 'Link da reunião'}
                  </span>
                  <input className={cn(campo, 'w-full')} placeholder={chave === 'template_relatorio' ? 'ex.: omnx_aviso_diario_v2' : 'Nome do modelo aprovado'} defaultValue={config[chave] ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value.trim().toLowerCase() || null
                      if (v !== config[chave]) gravar({ [chave]: v } as Partial<Record<typeof chave, string | null>>)
                    }} />
                </label>
              ))}
            </div>
          </div>
        </details>
      )}

      <ConfirmDialog
        open={confirmar !== null}
        onClose={() => setConfirmar(null)}
        title={confirmar && confirmar.length > 1 ? `Pedir aprovação de ${confirmar.length} textos?` : 'Pedir aprovação deste texto?'}
        description="Os textos vão para a Meta analisar. A resposta sai em até 24 horas; depois clique em “Verificar aprovação”."
        confirmLabel="Pedir aprovação"
        loading={acao.isPending}
        onConfirm={() => { if (confirmar) void pedir(confirmar) }}
      />
    </Secao>
  )
}

function CartaoTexto({ modelo, ocupado, pedindo, onPedir }: {
  modelo: ModeloWa
  ocupado: boolean
  pedindo: boolean
  onPedir: () => void
}) {
  const info = infoStatusModelo(modelo.status)
  const { classe, Icone } = SELO[info.tom]
  return (
    <li className="space-y-2 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{TITULO_MODELO[modelo.tipo]}</p>
          <p className="text-xs text-muted-foreground">Quem recebe: {QUEM_RECEBE_MODELO[modelo.tipo]}</p>
        </div>
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', classe)}>
          <Icone className="h-3.5 w-3.5" aria-hidden /> {info.rotulo}
        </span>
      </div>

      {info.tom !== 'ok' && <p className="text-xs text-muted-foreground">{info.explicacao}</p>}
      {modelo.motivo && <p className="text-sm text-danger">Motivo: {modelo.motivo}</p>}
      {modelo.texto_diferente && (
        <Aviso>Já existe um texto com este nome na sua conta, mas diferente. Ele não é usado pelos envios automáticos — fale com o suporte.</Aviso>
      )}

      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <details className="min-w-0 flex-1 text-sm">
          <summary className="cursor-pointer select-none text-muted-foreground">Ver texto</summary>
          <p className="mt-2 max-w-md whitespace-pre-wrap break-words rounded-lg rounded-tl-sm bg-success-light px-3 py-2 text-sm text-foreground">
            {modelo.previa}
          </p>
        </details>
        <details className="min-w-0 flex-1 text-sm">
          <summary className="cursor-pointer select-none text-muted-foreground">Detalhes técnicos</summary>
          <dl className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <div>Nome: <code className="rounded bg-muted px-1">{modelo.nome}</code></div>
            <div>Idioma: {modelo.idioma}</div>
            {modelo.consultado_em && <div>Consultado em {formataDataHoraBrasilia(modelo.consultado_em)}</div>}
            <div>
              {modelo.em_uso
                ? 'Os envios automáticos usam este texto.'
                : modelo.nome_configurado
                  ? `Os envios usam hoje outro texto: ${modelo.nome_configurado}.`
                  : 'Nenhum texto configurado para este envio ainda.'}
            </div>
            {modelo.observacao && <div>{modelo.observacao}</div>}
          </dl>
        </details>
      </div>

      {info.podeCriar && (
        <button type="button" className={botaoSecundario} disabled={ocupado} onClick={onPedir}>
          {pedindo && <Loader2 className="h-4 w-4 animate-spin" />} Pedir aprovação
        </button>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Teste de envio
// ---------------------------------------------------------------------------

function TesteSecao({ numero, oficial, bloqueio }: { numero: number; oficial: boolean; bloqueio: string | null }) {
  const testar = useTestarEnvioWa()
  const [telefone, setTelefone] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  const enviar = () => {
    setErro(null); setSucesso(null)
    const { telefone: e164, aviso } = normalizaTelefoneBR(telefone)
    if (!e164 || aviso || !E164.test(e164)) {
      setErro('WhatsApp inválido. Use o DDD e o número, por exemplo (11) 99999-8888.')
      return
    }
    // Sem "variaveis": na oficial, o servidor preenche o texto com os exemplos.
    testar.mutate({ telefone: e164 }, {
      onSuccess: (r) => {
        if (r.ok) setSucesso('Mensagem enviada! Confira o seu WhatsApp.')
        else setErro(traduzErroEnvio(r.error) || 'O envio não deu certo.')
      },
      onError: (e) => setErro(mensagemErroWa(e, 'Não foi possível enviar.')),
    })
  }

  return (
    <Secao numero={numero} titulo="Enviar um teste"
      descricao={`Manda uma mensagem de exemplo para o seu WhatsApp. Até 5 por hora.${oficial ? ' Na oficial, ela usa o texto do relatório diário.' : ''}`}>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); enviar() }}>
        <label className="space-y-1 text-sm">
          <span className="text-foreground">Seu WhatsApp</span>
          <input className={cn(campo, 'block w-56')} inputMode="tel" autoComplete="tel-national" value={telefone}
            disabled={Boolean(bloqueio)} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} placeholder="(11) 99999-8888" />
        </label>
        <button type="submit" className={botaoPrimario} disabled={Boolean(bloqueio) || testar.isPending || !telefone.trim()}
          aria-describedby={bloqueio ? 'motivo-teste' : undefined}>
          {testar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar teste
        </button>
      </form>
      {bloqueio && <p id="motivo-teste" className="text-xs text-muted-foreground">{bloqueio}</p>}
      <MensagemSucesso texto={sucesso} />
      <MensagemErro texto={erro} />
    </Secao>
  )
}
