import { useMemo, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRelatorioManual, type ResultadoRelatorioManual } from '@/hooks/useRelatorioManual'
import { Link } from 'react-router-dom'
import { ArrowRight, Eye, Loader2, Plus, Trash2, User, Users } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  usePainelWa, useSalvarWaAutoConfig, useWaAutoRegras, useSalvarRegra, mensagemErroWa,
  useSalvarGestor, useAlternarGestor, useExcluirGestor, usePreviaRelatorio, useGruposInternos, useSalvarGrupoInterno,
  type PreviaRelatorio, type WaAutoConfig, type WaAutoGestor,
} from '@/hooks/useAutomacoesWa'
import {
  LIMITE_GESTORES, REGRAS_ANOMALIA, filtrarGruposInternos, formataQuando, formataTelefoneExibicao, mascaraTelefone,
  mensagemErroPrevia, proximoEnvioDiario, resumoContagem, traduzErroEnvio, validarGestor, type RegraInfo,
} from '@/lib/automacoesWa'
import { cn } from '@/lib/utils'
import {
  Aviso, CampoHora, Dica, EsqueletoAba, IndicadorSalvo, Interruptor, LinhaFalta, MensagemErro, Secao,
} from './comum'
import { ROTA_ABA, botaoLink, botaoPrimario, botaoSecundario, campo, foco, hhmm } from './estilos'

/** Relatório diário: vai no privado de cada gestor da lista. Os clientes não recebem. */
export function RelatorioTab() {
  const painel = usePainelWa()
  const salvar = useSalvarWaAutoConfig()
  const [erro, setErro] = useState<string | null>(null)

  if (painel.carregando) return <EsqueletoAba />

  const cfg = painel.config
  const ligado = cfg?.relatorio_ativo ?? false
  const pendencias = painel.pendencias.filter((p) => p.automacao === 'relatorio')
  const gravar = (campos: Parameters<typeof salvar.mutate>[0]) => {
    setErro(null)
    salvar.mutate(campos, { onError: (e) => setErro(mensagemErroWa(e, 'Não foi possível salvar.')) })
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Envio do relatório diário">
        <div className="flex flex-wrap items-center gap-3">
          <Interruptor ligado={ligado} rotulo="Enviar o relatório diário"
            disabled={salvar.isPending || (!ligado && pendencias.length > 0)}
            onChange={(v) => gravar({ relatorio_ativo: v })} />
          <label htmlFor="hora-relatorio" className="text-sm font-medium text-foreground">Enviar todo dia às</label>
          <CampoHora id="hora-relatorio" rotulo="Horário do relatório diário" valor={hhmm(cfg?.relatorio_hora)}
            onSalvar={(v) => gravar({ relatorio_hora: v })} />
          <IndicadorSalvo status={salvar.status} quando={salvar.submittedAt} />
        </div>
        {pendencias.length > 0 ? (
          <LinhaFalta pendencias={pendencias} abaAtual="relatorio" />
        ) : ligado ? (
          <p className="text-sm text-foreground">
            Próximo envio: <strong className="font-medium">{formataQuando(proximoEnvioDiario(cfg?.relatorio_hora))}</strong>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Desligado. Ligue a chave para começar a enviar.</p>
        )}
        <Dica>Vai no privado de cada pessoa da lista abaixo (ou num grupo interno da equipe), com os clientes que pedem atenção. Os clientes não recebem.</Dica>
        <Link to={ROTA_ABA('alertas')} className={botaoLink}>
          Ver pontos de atenção de hoje <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
        <MensagemErro texto={erro} />
      </section>

      <QuemRecebe gestores={painel.gestores} oficial={cfg?.provider === 'zernio'} />
      <OQueEntra relatorioLigado={ligado} config={cfg} />
      <PreviaSecao />
      <EnvioManualSecao gestores={painel.gestores} ligado={ligado} instancia={cfg?.uazapi_instance_id ?? ''} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ① Quem recebe
// ---------------------------------------------------------------------------

function QuemRecebe({ gestores, oficial }: { gestores: WaAutoGestor[]; oficial: boolean }) {
  const alternar = useAlternarGestor()
  const excluir = useExcluirGestor()
  const [modo, setModo] = useState<'pessoa' | 'grupo'>('pessoa')
  const [erro, setErro] = useState<string | null>(null)
  const [apagar, setApagar] = useState<WaAutoGestor | null>(null)
  const cheio = gestores.length >= LIMITE_GESTORES
  const grupo = apagar?.tipo === 'grupo'

  return (
    <Secao numero={1} titulo={`Quem recebe (${gestores.length} de ${LIMITE_GESTORES})`}
      descricao="Cada pessoa recebe no WhatsApp dela. Um grupo interno recebe uma mensagem só, no grupo."
      acao={<IndicadorSalvo status={alternar.status} quando={alternar.submittedAt} />}>
      {gestores.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          Ninguém na lista ainda. Adicione abaixo uma pessoa ou um grupo interno.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {gestores.map((g) => {
            const ehGrupo = g.tipo === 'grupo'
            const nome = ehGrupo ? g.grupo_nome || g.nome : g.nome
            const Icone = ehGrupo ? Users : User
            return (
              <li key={g.id} className="flex items-center gap-3 py-2">
                <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icone className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {ehGrupo ? 'Grupo interno' : formataTelefoneExibicao(g.telefone ?? '')}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{g.ativo ? 'Recebe' : 'Pausado'}</span>
                <Interruptor ligado={g.ativo} rotulo={`${nome} recebe o relatório`} disabled={alternar.isPending}
                  onChange={(ativo) => alternar.mutate({ id: g.id, ativo }, { onError: (err) => setErro(mensagemErroWa(err, 'Não foi possível alterar.')) })} />
                <button type="button" onClick={() => setApagar(g)} aria-label={`Remover ${nome}`}
                  className={cn('rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-danger', foco)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {cheio ? (
        <p className="text-sm text-muted-foreground">
          A lista está cheia ({LIMITE_GESTORES}, somando pessoas e grupos). Remova alguém para adicionar outro.
        </p>
      ) : (
        <div className="space-y-3">
          <div role="group" aria-label="O que adicionar" className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={modo === 'pessoa'} onClick={() => setModo('pessoa')}
              className={cn(modo === 'pessoa' ? botaoPrimario : botaoSecundario, 'py-1.5')}>
              <Plus className="h-4 w-4" aria-hidden /> Pessoa
            </button>
            <button type="button" aria-pressed={modo === 'grupo'} onClick={() => setModo('grupo')}
              className={cn(modo === 'grupo' ? botaoPrimario : botaoSecundario, 'py-1.5')}>
              <Plus className="h-4 w-4" aria-hidden /> Grupo interno
            </button>
          </div>
          {modo === 'pessoa'
            ? <NovaPessoa onErro={setErro} />
            : <NovoGrupo jaNaLista={gestores} oficial={oficial} onErro={setErro} />}
        </div>
      )}
      <MensagemErro texto={erro} />

      <ConfirmDialog
        open={apagar !== null}
        onClose={() => setApagar(null)}
        title={`Remover ${(grupo ? apagar?.grupo_nome || apagar?.nome : apagar?.nome) ?? ''} da lista?`}
        description={grupo
          ? 'Esse grupo deixa de receber o relatório diário. Dá para adicionar de novo depois.'
          : 'Essa pessoa deixa de receber o relatório diário. Dá para adicionar de novo depois.'}
        confirmLabel="Remover"
        loading={excluir.isPending}
        onConfirm={() => apagar && excluir.mutate(apagar.id, {
          onSuccess: () => setApagar(null),
          onError: (err) => { setApagar(null); setErro(mensagemErroWa(err, 'Não foi possível remover.')) },
        })}
      />
    </Secao>
  )
}

/** "+ Pessoa": nome e WhatsApp (recebe no privado). */
function NovaPessoa({ onErro }: { onErro: (e: string | null) => void }) {
  const salvar = useSalvarGestor()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault()
    onErro(null)
    const v = validarGestor(nome, telefone)
    if (!v.ok) { onErro(v.erro); return }
    salvar.mutate({ nome: v.nome, telefone: v.telefone }, {
      onSuccess: () => { setNome(''); setTelefone('') },
      onError: (err) => onErro(mensagemErroWa(err, 'Não foi possível adicionar.')),
    })
  }

  return (
    <form onSubmit={adicionar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex-1 space-y-1 text-sm">
        <span className="text-foreground">Nome</span>
        <input className={cn(campo, 'w-full')} value={nome} maxLength={80} autoComplete="off"
          onChange={(e) => setNome(e.target.value)} placeholder="ex.: Ana" />
      </label>
      <label className="flex-1 space-y-1 text-sm">
        <span className="text-foreground">WhatsApp</span>
        <input className={cn(campo, 'w-full')} value={telefone} inputMode="tel" autoComplete="off"
          onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} placeholder="(11) 99999-8888" />
      </label>
      <button type="submit" disabled={salvar.isPending} className={botaoPrimario}>
        {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Adicionar
      </button>
    </form>
  )
}

/**
 * "+ Grupo interno": escolhe um grupo do número que envia. A lista vem do servidor
 * só com grupos SEM vínculo com cliente no Chat (e sem nome de cliente); o banco
 * confere de novo ao gravar. Ninguém sabe quem está no grupo, então o admin
 * precisa confirmar que só há pessoas da equipe.
 */
function NovoGrupo({ jaNaLista, oficial, onErro }: {
  jaNaLista: WaAutoGestor[]; oficial: boolean; onErro: (e: string | null) => void
}) {
  const lista = useGruposInternos(true)
  const salvar = useSalvarGrupoInterno()
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const opcoes = useMemo(
    () => filtrarGruposInternos(lista.data?.grupos, busca, jaNaLista.map((g) => g.grupo_jid)),
    [lista.data?.grupos, busca, jaNaLista],
  )
  const selecionado = opcoes.find((g) => g.grupo_jid === escolhido) ?? null

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault()
    onErro(null)
    if (!selecionado) { onErro('Escolha um grupo da lista.'); return }
    if (!confirmado) { onErro('Confirme que só há pessoas da equipe neste grupo.'); return }
    salvar.mutate({ grupo_jid: selecionado.grupo_jid, nome: selecionado.nome }, {
      onSuccess: () => { setEscolhido(''); setBusca(''); setConfirmado(false) },
      onError: (err) => onErro(mensagemErroWa(err, 'Não foi possível adicionar o grupo.')),
    })
  }

  const dica = (
    <Dica>
      Aparecem só grupos que não estão vinculados a um cliente em Conversas. Confira que no grupo só há pessoas da sua equipe — o relatório tem informações internas. O número que envia precisa estar no grupo.
      {' Este grupo fica visível em Conversas só para administradores e gerentes.'}
      {oficial ? ' No WhatsApp Oficial, o grupo recebe pelo número de Conversas (não oficial).' : ''}
    </Dica>
  )

  if (lista.isLoading) return <div className="h-20 animate-pulse rounded-lg bg-muted" aria-hidden />
  if (lista.isError) {
    return <MensagemErro texto={mensagemErroWa(lista.error, 'Não foi possível carregar os grupos.')} />
  }
  if (lista.data && lista.data.numero_configurado === false) {
    return (
      <Aviso acao={<Link to={ROTA_ABA('conexao')} className={botaoLink}>Ir para Conexão <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>}>
        {lista.data.aviso ?? 'Escolha o número que envia na aba Conexão para ver os grupos.'}
      </Aviso>
    )
  }

  const total = lista.data?.grupos?.length ?? 0
  return (
    <form onSubmit={adicionar} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1 text-sm">
          <span className="text-foreground">Buscar grupo</span>
          <input className={cn(campo, 'w-full')} value={busca} autoComplete="off" maxLength={80}
            onChange={(e) => setBusca(e.target.value)} placeholder="ex.: Equipe entrega" />
        </label>
        <label className="flex-1 space-y-1 text-sm">
          <span className="text-foreground">Grupo</span>
          <select className={cn(campo, 'w-full')} value={selecionado ? escolhido : ''}
            onChange={(e) => { setEscolhido(e.target.value); setConfirmado(false) }} disabled={opcoes.length === 0}>
            <option value="">{opcoes.length === 0 ? 'Nenhum grupo encontrado' : 'Escolha um grupo'}</option>
            {opcoes.map((g) => <option key={g.grupo_jid} value={g.grupo_jid}>{g.nome}</option>)}
          </select>
        </label>
        <button type="submit" disabled={salvar.isPending || !selecionado || !confirmado} className={botaoPrimario}>
          {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Adicionar grupo
        </button>
      </div>
      {selecionado && (
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={confirmado}
            onChange={(e) => setConfirmado(e.target.checked)} />
          <span>Confirmo que só há pessoas da equipe neste grupo</span>
        </label>
      )}
      {total === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum grupo interno encontrado no número que envia. Crie o grupo no WhatsApp com esse número dentro e mande uma mensagem nele para ele aparecer aqui.
        </p>
      )}
      {dica}
    </form>
  )
}

// ---------------------------------------------------------------------------
// ② O que entra no relatório (pontos de atenção)
// ---------------------------------------------------------------------------

function OQueEntra({ relatorioLigado, config }: { relatorioLigado: boolean; config: WaAutoConfig | null }) {
  const { data: regras, isLoading } = useWaAutoRegras()
  const salvarRegra = useSalvarRegra()
  const [erro, setErro] = useState<string | null>(null)
  const falha = (e: unknown) => setErro(mensagemErroWa(e, 'Não foi possível salvar.'))

  return (
    <Secao numero={2} titulo="O que entra no relatório"
      descricao="Escolha os pontos de atenção. O nome do cliente aparece sempre."
      acao={<IndicadorSalvo status={salvarRegra.status} quando={salvarRegra.submittedAt} />}>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-muted" aria-hidden />
      ) : (
        <ul className={cn('divide-y divide-border transition-opacity', !relatorioLigado && 'opacity-60')}>
          {REGRAS_ANOMALIA.map((info) => {
            const regra = regras?.find((r) => r.tipo === info.tipo)
            const ativo = regra?.ativo ?? false
            const limiar = regra?.limiar ?? info.limiarPadrao
            const gravar = (campos: { ativo?: boolean; limiar?: number }) => {
              setErro(null)
              salvarRegra.mutate({ tipo: info.tipo, ativo: campos.ativo ?? ativo, limiar: campos.limiar ?? limiar }, { onError: falha })
            }
            return (
              <li key={info.tipo} className="flex items-start gap-3 py-3">
                <Interruptor ligado={ativo} rotulo={info.rotulo} onChange={(v) => gravar({ ativo: v })} />
                <div className="min-w-0 flex-1">
                  <FraseRegra info={info} limiar={limiar} onLimiar={(n) => gravar({ limiar: n })} />
                  <p className="text-xs text-muted-foreground">{info.descricao}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {!relatorioLigado && <p className="text-xs text-muted-foreground">O relatório está desligado: estas escolhas valem quando você ligar.</p>}
      <MensagemErro texto={erro} />
      <ComoOrganizar config={config} />
    </Secao>
  )
}

/**
 * Duas opções de organização (wa_auto_config, migration 20261027100000). Cada
 * interruptor salva sozinho; a prévia e o envio leem o que está salvo.
 */
function ComoOrganizar({ config }: { config: WaAutoConfig | null }) {
  const salvar = useSalvarWaAutoConfig()
  const [erro, setErro] = useState<string | null>(null)
  const gravar = (campos: Pick<WaAutoConfig, 'relatorio_agrupar_estrategista' | 'relatorio_so_clientes_ativos'>) => {
    setErro(null)
    salvar.mutate(campos, { onError: (e) => setErro(mensagemErroWa(e, 'Não foi possível salvar.')) })
  }
  const opcoes = [
    {
      id: 'relatorio-por-estrategista',
      rotulo: 'Separar por estrategista',
      descricao: 'Os pontos de atenção saem agrupados pelo estrategista de cada cliente, com o tipo e o motivo de cada um. Quem não tem estrategista fica em “Sem estrategista”.',
      ligado: config?.relatorio_agrupar_estrategista === true,
      mudar: (v: boolean) => gravar({ relatorio_agrupar_estrategista: v }),
    },
    {
      id: 'relatorio-so-ativos',
      rotulo: 'Só clientes ativos',
      descricao: 'Entram só clientes cadastrados e ativos. Contatos sem cadastro de cliente ficam fora e aparecem só como contagem no fim da lista.',
      ligado: config?.relatorio_so_clientes_ativos === true,
      mudar: (v: boolean) => gravar({ relatorio_so_clientes_ativos: v }),
    },
  ]

  return (
    <div role="group" aria-labelledby="como-organizar-titulo" className="space-y-1 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="como-organizar-titulo" className="text-sm font-semibold text-foreground">Como organizar a lista</h3>
        <IndicadorSalvo status={salvar.status} quando={salvar.submittedAt} />
      </div>
      <ul className="divide-y divide-border">
        {opcoes.map((o) => (
          <li key={o.id} className="flex items-start gap-3 py-3">
            <Interruptor id={o.id} ligado={o.ligado} rotulo={o.rotulo} disabled={salvar.isPending} onChange={o.mudar} />
            <div className="min-w-0 flex-1">
              <label htmlFor={o.id} className="text-sm font-medium text-foreground">{o.rotulo}</label>
              <p className="text-xs text-muted-foreground">{o.descricao}</p>
            </div>
          </li>
        ))}
      </ul>
      <MensagemErro texto={erro} />
    </div>
  )
}

/** "Cliente sem resposta há mais de [4▾] horas" — o limite fica dentro da frase. */
function FraseRegra({ info, limiar, onLimiar }: { info: RegraInfo; limiar: number; onLimiar: (n: number) => void }) {
  if (!info.frase) return <p className="text-sm font-medium text-foreground">{info.rotulo}</p>
  const [antes, depois] = info.frase
  const rotulo = `Limite: ${info.rotulo}`
  const opcoes = info.opcoes && !info.opcoes.includes(limiar) ? [...info.opcoes, limiar].sort((a, b) => a - b) : info.opcoes
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
      <span>{antes}</span>
      {opcoes ? (
        <select aria-label={rotulo} className={cn(campo, 'py-1')} value={limiar} onChange={(e) => onLimiar(Number(e.target.value))}>
          {opcoes.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      ) : (
        <input key={limiar} type="number" min={1} max={info.maximo ?? 10000} aria-label={rotulo}
          className={cn(campo, 'w-20 py-1')} defaultValue={limiar}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          onBlur={(e) => {
            const n = Math.round(Number(e.target.value))
            const max = info.maximo ?? 10000
            if (!Number.isFinite(n) || n < 1 || n > max) { e.target.value = String(limiar); return }
            if (n !== limiar) onLimiar(n)
          }} />
      )}
      <span>{depois}</span>
    </p>
  )
}

// ---------------------------------------------------------------------------
// ③ Ver como fica (prévia com os dados de hoje — nada é enviado)
// ---------------------------------------------------------------------------

function PreviaSecao() {
  const gerar = usePreviaRelatorio()
  const [previa, setPrevia] = useState<PreviaRelatorio | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const ver = () => {
    setErro(null)
    gerar.mutate(undefined, {
      onSuccess: (r) => {
        if (r.ok && r.mensagem) setPrevia(r)
        else { setPrevia(null); setErro(mensagemErroPrevia(r.error)) }
      },
      onError: (e) => { setPrevia(null); setErro(mensagemErroWa(e, 'Não foi possível gerar a prévia.')) },
    })
  }

  const gestor = previa?.gestores?.[0]
  const grupoNome = previa?.grupos?.[0]
  const temGrupo = Boolean(previa?.mensagem_grupo && previa?.grupos && previa.grupos.length > 0)
  const temPessoa = Boolean(previa?.gestores && previa.gestores.length > 0)
  const [comoGrupo, setComoGrupo] = useState(false)
  // Sem pessoas na lista, mostra direto como chega no grupo.
  const verGrupo = temGrupo && (comoGrupo || !temPessoa)

  return (
    <Secao numero={3} titulo="Ver como fica"
      descricao="Monta agora, com os dados de hoje, a mensagem que a pessoa receberia. Nada é enviado.">
      <button type="button" onClick={ver} disabled={gerar.isPending} className={previa ? botaoSecundario : botaoPrimario}>
        {gerar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
        {previa ? 'Gerar de novo' : 'Ver como fica'}
      </button>
      <MensagemErro texto={erro} />

      {previa?.mensagem && (
        <div className="space-y-3">
          {previa.avisos?.map((a) => <Aviso key={a}>{traduzErroEnvio(a)}</Aviso>)}
          {temGrupo && temPessoa && (
            <div role="group" aria-label="Ver como chega" className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={!verGrupo} onClick={() => setComoGrupo(false)}
                className={cn(!verGrupo ? botaoPrimario : botaoSecundario, 'py-1.5')}>
                <User className="h-4 w-4" aria-hidden /> Na pessoa
              </button>
              <button type="button" aria-pressed={verGrupo} onClick={() => setComoGrupo(true)}
                className={cn(verGrupo ? botaoPrimario : botaoSecundario, 'py-1.5')}>
                <Users className="h-4 w-4" aria-hidden /> No grupo
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {verGrupo
              ? `Assim o grupo ${grupoNome ?? 'interno'} receberia agora (a saudação é para o grupo, sem nome de pessoa)`
              : gestor ? `Assim ${gestor} receberia agora` : 'Assim a pessoa receberia agora'}
            {!verGrupo && previa.gestores && previa.gestores.length > 1 ? ' (cada um recebe com o próprio nome)' : ''}
            {previa.contagem ? ` — ${resumoContagem(previa.contagem)}.` : '.'}
          </p>
          <div className="max-w-md whitespace-pre-wrap break-words rounded-lg rounded-tl-sm bg-success-light px-4 py-3 text-sm text-foreground">
            {verGrupo ? previa.mensagem_grupo : previa.mensagem}
          </div>
          {verGrupo && (
            <p className="text-xs text-muted-foreground">No grupo, a mensagem sai pelo número de Conversas (não oficial), com a redação variando a cada dia.</p>
          )}
        </div>
      )}
    </Secao>
  )
}

/** A prévia específica não grava histórico. O envio só começa com um clique explícito. */
function EnvioManualSecao({ gestores, ligado, instancia }: { gestores: WaAutoGestor[]; ligado: boolean; instancia: string }) {
  const { user } = useAuth()
  const grupos = gestores.filter(g => g.ativo && g.tipo === 'grupo')
  const [escolhido, setEscolhido] = useState('')
  if (user?.perfil !== 'admin' || grupos.length === 0) return null
  const id = escolhido || (grupos.length === 1 ? grupos[0].id : '')
  const alvo = grupos.find(g => g.id === id)
  return <Secao numero={4} titulo="Enviar um relatório agora" descricao="Envio pontual da Íris para um único grupo interno. O horário do diário continua igual.">
    <label className="block space-y-1 text-sm"><span>Grupo que receberá</span>
      <select className={cn(campo, 'w-full')} value={alvo?.id ?? ''} onChange={e => setEscolhido(e.target.value)}>
        <option value="">Escolha um grupo</option>
        {grupos.map(g => <option key={g.id} value={g.id}>{g.grupo_nome || g.nome}</option>)}
      </select>
    </label>
    {!ligado && <Aviso>Ligue o relatório para preparar um envio.</Aviso>}
    {alvo && <EnvioManualGrupo key={`${user.id}:${user.tenant_id}:${alvo.id}:${alvo.grupo_jid}:${instancia}`} alvo={alvo} ligado={ligado}
      storageKey={`relatorio-manual:${user.id}:${user.tenant_id}:${alvo.id}`} />}
  </Secao>
}

function EnvioManualGrupo({ alvo, ligado, storageKey }: { alvo: WaAutoGestor; ligado: boolean; storageKey: string }) {
  const previaMutation = useRelatorioManual()
  const envio = useRelatorioManual()
  const [previa, setPrevia] = useState<ResultadoRelatorioManual | null>(null)
  const [pedido, setPedido] = useState<PedidoGuardado | null>(() => lerPedidoGuardado(storageKey))
  const pedidoRef = useRef(pedido)
  const emCurso = useRef(false)
  const requestId = pedido?.id
  const pedidoIlegivel = Boolean(pedido && (!pedido.grupo || !pedido.instancia))
  const [resultado, setResultado] = useState<ResultadoRelatorioManual | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const ocupado = previaMutation.isPending || envio.isPending
  const confirmado = resultado?.accepted === true
  const encerrado = resultado?.status === 'falhou' && resultado.persisted && !resultado.incerto
  const preparar = async () => {
    setErro(null)
    try { setPrevia(await previaMutation.mutateAsync({ acao: 'prever_manual', destinatario_id: alvo.id })) }
    catch (e) { setPrevia(null); setErro(mensagemErroWa(e, 'Não foi possível preparar a prévia.')) }
  }
  const enviar = async () => {
    if (emCurso.current || ocupado || confirmado || encerrado || (!previa && !pedidoRef.current)) return
    emCurso.current = true
    setErro(null)
    // Persiste ANTES de chamar a função; falha de rede/reload nunca gera outro UUID automaticamente.
    try {
      const atual = pedidoRef.current ?? { id: crypto.randomUUID(), grupo: previa?.grupo_jid ?? '', instancia: previa?.instancia_uuid ?? '' }
      if (!atual.grupo || !atual.instancia) throw new Error('Não foi possível recuperar o pedido salvo. Confira o histórico antes de iniciar outro envio.')
      sessionStorage.setItem(storageKey, JSON.stringify(atual))
      pedidoRef.current = atual
      setPedido(atual)
      setResultado(await envio.mutateAsync({ destinatario_id: alvo.id, request_id: atual.id, confirmacao: atual }))
    } catch (e) { setErro(mensagemErroWa(e, 'Não foi possível confirmar o envio.')) }
    finally { emCurso.current = false }
  }
  return <div className="space-y-3">
    <button type="button" className={botaoSecundario} onClick={preparar} disabled={!ligado || ocupado || Boolean(requestId)}>
      {previaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preparar prévia para {alvo.grupo_nome || alvo.nome}
    </button>
    {previa?.mensagem && <>
      <p className="text-xs text-muted-foreground">{previa.destino_nome} · número {previa.instancia} · {previa.gerado_em ? formataQuando(new Date(previa.gerado_em)) : ''}. O envio consulta novamente os dados atuais.</p>
      <div className="whitespace-pre-wrap break-words rounded-lg bg-success-light p-4 text-sm">{previa.mensagem}</div>
    </>}
    {(previa || requestId) && <button type="button" className={botaoPrimario} onClick={enviar}
      disabled={(!ligado && !requestId) || ocupado || confirmado || Boolean(encerrado) || pedidoIlegivel}>
      {envio.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
      {requestId ? 'Conferir resultado do pedido' : `Enviar agora para ${alvo.grupo_nome || alvo.nome}`}
    </button>}
    {requestId && !pedidoIlegivel && !resultado && !envio.isPending && <Aviso>Há um pedido iniciado. Confira o resultado para evitar uma mensagem repetida.</Aviso>}
    {resultado && <p role="status" className="text-sm">{confirmado
      ? resultado.persisted ? 'A Íris enviou o relatório para este grupo.' : 'O provedor aceitou o relatório, mas não foi possível confirmar o histórico. Não envie novamente.'
      : resultado.incerto || resultado.status === 'pendente'
        ? 'O resultado ainda é incerto. Confira este mesmo pedido; ele não será reenviado.'
        : 'O envio falhou. Consulte a conexão e o histórico antes de preparar outro pedido.'}</p>}
    {(confirmado && resultado?.persisted || encerrado) && <button type="button" className={botaoSecundario} onClick={() => {
      sessionStorage.removeItem(storageKey); pedidoRef.current = null; setPedido(null); setResultado(null); setPrevia(null)
    }}>Preparar outro envio</button>}
    <MensagemErro texto={erro ?? (pedidoIlegivel ? 'Não foi possível recuperar o pedido salvo neste navegador. Confira o histórico antes de iniciar outro envio.' : null)} />
  </div>
}

interface PedidoGuardado { id: string; grupo: string; instancia: string }
function lerPedidoGuardado(key: string): PedidoGuardado | null {
  let raw: string | null
  try { raw = sessionStorage.getItem(key) }
  catch { return { id: 'armazenamento-indisponivel', grupo: '', instancia: '' } }
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    if (typeof p?.id === 'string' && typeof p?.grupo === 'string' && typeof p?.instancia === 'string') return p
  } catch { /* Pedido ilegível não deve liberar outro envio silenciosamente. */ }
  return { id: raw, grupo: '', instancia: '' }
}
