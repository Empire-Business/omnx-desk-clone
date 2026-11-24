import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Bot, FlaskConical, Hand, Loader2, Plug, Plus, Send, Settings2, ShieldCheck, Sparkles, Trash2, User, Users, Wrench } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { supabase } from '@/lib/supabase'
import { useInstances } from '@/hooks/useChat'
import {
  mensagemErroWa, usePainelWa, useSalvarWaAutoConfig, useGruposInternos,
  useMembrosAgente, useSalvarMembroAgente, useAlterarMembroAgente, useExcluirMembroAgente,
  useGruposAgente, useSalvarGrupoAgente, useAlterarGrupoAgente, useTrocarNumerosGrupoAgente, useExcluirGrupoAgente,
  useExecucoesAgente, useCandidatosAgente, useStatusConexaoAgente, useProtegerConexaoAgente, useSimularAgente,
  useBoasVindasAgente, type CandidatoAgente, type GrupoAgente, type MembroAgente,
  type RespostaSimulacao,
} from '@/hooks/useAutomacoesWa'
import {
  AVISO_ACESSO_TOTAL, AVISO_GRUPO_INVISIVEL, LIMITE_GRUPOS_AGENTE, LIMITE_MEMBROS_AGENTE, MAX_NUMEROS_GRUPO,
  estadoAssistente, formataDataCurta, formataTelefoneExibicao, formatarCustoUsd, mascaraTelefone, montarNumerosGrupo,
  rotuloResultadoExecucao, textoEscopo, validarMembroAgente,
} from '@/lib/automacoesWa'
import { NOME_AGENTE_PADRAO, rodapesGrupo, rodapesPrivado, validarNomeAgente } from '@/lib/automacoesWaAgente'
import { cn } from '@/lib/utils'
import { Aviso, Dica, EsqueletoAba, IndicadorSalvo, Interruptor, MensagemErro, MensagemSucesso, Secao } from './comum'
import { EquipeWhatsappSecao } from './EquipeWhatsappSecao'
import { AprendizadosIris, FerramentasIris, MemoriasIris, PreferenciasIris } from './IrisConhecimento'
import { IrisGt3Autorizacao } from './IrisGt3Autorizacao'
import { botaoPrimario, botaoSecundario, campo, foco } from './estilos'

const PERFIS: Record<string, string> = {
  admin: 'Admin', gerente: 'Gestor', estrategista: 'Estrategista', atendimento: 'Atendimento',
  agente_chat: 'Atendente de conversas', agente_cobranca: 'Cobrança', admin_cobranca: 'Admin cobrança',
}

const SECOES_IRIS = [
  { id: 'configuracao', nome: 'Personalidade e contexto', Icone: Settings2 },
  { id: 'ferramentas', nome: 'Ferramentas', Icone: Wrench },
  { id: 'memoria', nome: 'Memória e aprendizados', Icone: BookOpen },
  { id: 'acessos', nome: 'Pessoas e canais', Icone: Users },
  { id: 'gt3', nome: 'Integração GT3', Icone: Plug },
  { id: 'atividade', nome: 'Teste e atividade', Icone: FlaskConical },
] as const

/** Área da Íris. A rota antiga "assistente" continua como atalho. */
export function AssistenteTab() {
  const [params, setParams] = useSearchParams()
  const painel = usePainelWa()
  const membros = useMembrosAgente()
  const grupos = useGruposAgente()
  const candidatos = useCandidatosAgente()

  if (painel.carregando || membros.isLoading || grupos.isLoading) return <EsqueletoAba />

  const cfg = painel.config
  const porUsuario = new Map((candidatos.data ?? []).map((c) => [c.user_id, c]))
  const secao = SECOES_IRIS.find((s) => s.id === params.get('secao'))?.id ?? 'configuracao'
  const nome = cfg?.agente_nome || NOME_AGENTE_PADRAO

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-card px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/70 text-foreground" aria-hidden>
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Assistente da equipe</p>
            <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">Íris</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">Defina como ela responde, acompanhe o que foi ensinado e consulte a memória dos clientes.</p>
            <Link to="/seguranca#ia" className="mt-2 inline-block text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">Como os dados são usados pela IA</Link>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
          <span className={cn('h-1.5 w-1.5 rounded-full', cfg?.agente_ativo ? 'bg-emerald-500' : 'bg-muted-foreground')} aria-hidden />
          {cfg?.agente_ativo ? 'Ligada' : 'Desligada'} · {nome}
        </div>
      </header>

      <nav aria-label="Configurações da Íris" className="flex gap-1 overflow-x-auto border-b border-border">
        {SECOES_IRIS.map(({ id, nome: rotulo, Icone }) => (
          <button key={id} type="button" aria-current={secao === id ? 'page' : undefined}
            onClick={() => setParams((atuais) => { const novos = new URLSearchParams(atuais); novos.set('secao', id); return novos }, { replace: true })}
            className={cn('flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-medium transition-colors', foco,
              secao === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icone className="h-3.5 w-3.5" aria-hidden /> {rotulo}
          </button>
        ))}
      </nav>

      {secao === 'configuracao' && <>
        <Topo membrosAtivos={(membros.data ?? []).filter((m) => m.ativo).length}
          gruposAtivos={(grupos.data ?? []).filter((g) => g.ativo).length}
          nomesEquipe={(candidatos.data ?? []).map((c) => c.nome)} />
      </>}
      <div hidden={secao !== 'configuracao'}><PreferenciasIris nome={nome} /></div>
      {secao === 'gt3' && <IrisGt3Autorizacao />}
      {secao === 'ferramentas' && <FerramentasIris />}
      {secao === 'memoria' && <><AprendizadosIris nome={nome} /><MemoriasIris /></>}
      {secao === 'acessos' && <>
        <ProtegerConexao />
        <Pessoas membros={membros.data ?? []} candidatos={candidatos.data ?? []} carregandoEquipe={candidatos.isLoading}
          erroEquipe={candidatos.error ? mensagemErroWa(candidatos.error, 'Não foi possível carregar a equipe.') : null}
          ativo={cfg?.agente_ativo === true} />
        <EquipeWhatsappSecao candidatos={candidatos.data ?? []} carregando={candidatos.isLoading} />
        <Grupos grupos={grupos.data ?? []} ativo={cfg?.agente_ativo === true} gruposLigados={cfg?.agente_grupos === true}
          instanciaPadrao={cfg?.uazapi_instance_id ?? null} />
        <ComoChamar />
      </>}
      {secao === 'atividade' && <><Simular candidatos={candidatos.data ?? []} /><Historico porUsuario={porUsuario} /></>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ligar, nome e onde responde
// ---------------------------------------------------------------------------

function useNomesClientes() {
  return useQuery({
    queryKey: ['wa-agente', 'nomes-clientes'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('nome').limit(5000)
      if (error) throw error
      return (data ?? []).map((c) => c.nome as string | null)
    },
  })
}

function Topo({ membrosAtivos, gruposAtivos, nomesEquipe }: { membrosAtivos: number; gruposAtivos: number; nomesEquipe: string[] }) {
  const painel = usePainelWa()
  const salvar = useSalvarWaAutoConfig()
  const clientes = useNomesClientes()
  const cfg = painel.config
  const [erro, setErro] = useState<string | null>(null)
  const [nome, setNome] = useState(cfg?.agente_nome ?? NOME_AGENTE_PADRAO)
  const [contato, setContato] = useState(cfg?.agente_nome_contato ?? '')
  useEffect(() => { setNome(cfg?.agente_nome ?? NOME_AGENTE_PADRAO); setContato(cfg?.agente_nome_contato ?? '') }, [cfg?.agente_nome, cfg?.agente_nome_contato])

  const ativo = cfg?.agente_ativo === true
  const privado = cfg?.agente_privado !== false
  const emGrupos = cfg?.agente_grupos === true
  const estado = estadoAssistente({ ativo, privado, grupos: emGrupos, membrosAtivos, gruposAtivos })
  const semColunas = cfg !== null && cfg !== undefined && cfg.agente_ativo === undefined
  const gravar = (campos: Parameters<typeof salvar.mutate>[0]) => {
    setErro(null)
    salvar.mutate(campos, { onError: (e) => setErro(mensagemErroWa(e, 'Não foi possível salvar.')) })
  }
  const salvarNome = (e: React.FormEvent) => {
    e.preventDefault()
    const v = validarNomeAgente(nome, nomesEquipe, clientes.data ?? [])
    if (!v.ok) { setErro(v.erro); return }
    const c = contato.trim()
    if (c.length > 60) { setErro('O nome do contato pode ter até 60 caracteres.'); return }
    gravar({ agente_nome: v.nome, agente_nome_contato: c || null })
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4" aria-label="Assistente da equipe">
      {semColunas && (
        <Aviso>O banco ainda não tem as tabelas do assistente. Peça para aplicar a atualização antes de configurar.</Aviso>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Interruptor ligado={ativo} rotulo="Ligar o assistente" disabled={salvar.isPending || semColunas}
          onChange={(v) => gravar({ agente_ativo: v })} />
        <span className="text-sm font-medium text-foreground">Assistente da equipe no WhatsApp</span>
        <IndicadorSalvo status={salvar.status} quando={salvar.submittedAt} />
      </div>
      <p className={cn('text-sm', estado.tipo === 'falta' ? 'text-danger' : 'text-muted-foreground')}>
        {estado.tipo === 'desligado' && 'Desligado. Ninguém recebe resposta. Desligar tem efeito imediato.'}
        {estado.tipo === 'ligado' && `${estado.resumo}.`}
        {estado.tipo === 'falta' && `Ligado, mas falta ${estado.motivo}.`}
      </p>
      <Dica>
        Responde perguntas da equipe sobre os clientes da carteira de cada um: pontos de atenção, satisfação, contratos e histórico.
        Lê, responde e aprende com o feedback da equipe (e ajusta o aviso diário quando pedem); não manda nada para clientes. Clientes e números desconhecidos não recebem resposta.
      </Dica>

      <form onSubmit={salvarNome} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="space-y-1 text-sm">
          <span className="text-foreground">Nome do assistente</span>
          <input className={cn(campo, 'w-full')} value={nome} maxLength={24} autoComplete="off"
            onChange={(e) => setNome(e.target.value)} placeholder={NOME_AGENTE_PADRAO} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-foreground">Nome do contato do número <span className="text-muted-foreground">(opcional)</span></span>
          <input className={cn(campo, 'w-full')} value={contato} maxLength={60} autoComplete="off"
            onChange={(e) => setContato(e.target.value)} placeholder="como aparece ao digitar @" />
        </label>
        <button type="submit" disabled={salvar.isPending} className={botaoSecundario}>Salvar nome</button>
      </form>
      <Dica>
        Use só letras (3 a 24) e um nome que não seja de ninguém da equipe nem de cliente. Dica: ponha o nome de perfil do número
        igual ao nome do assistente — é ele que aparece quando alguém digita @ no grupo.
      </Dica>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Onde ele responde</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Interruptor ligado={privado} rotulo="Responder no privado" disabled={salvar.isPending || semColunas}
              onChange={(v) => gravar({ agente_privado: v })} />
            No privado (qualquer mensagem de quem está na lista)
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Interruptor ligado={emGrupos} rotulo="Responder em grupos internos" disabled={salvar.isPending || semColunas}
              onChange={(v) => gravar({ agente_grupos: v })} />
            Em grupos internos (só quando chamado)
          </label>
        </div>
      </fieldset>
      <label className="flex flex-wrap items-center gap-2 text-sm text-foreground">
        Até
        <input type="number" min={1} max={200} className={cn(campo, 'w-20')} defaultValue={cfg?.agente_limite_hora ?? 30}
          key={cfg?.agente_limite_hora ?? 30}
          onBlur={(e) => {
            const n = Math.round(Number(e.target.value))
            if (Number.isFinite(n) && n >= 1 && n <= 200 && n !== cfg?.agente_limite_hora) gravar({ agente_limite_hora: n })
          }} />
        perguntas por pessoa por hora
      </label>
      <MensagemErro texto={erro} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Proteger conexão (token no webhook de cada número)
// ---------------------------------------------------------------------------

function ProtegerConexao() {
  const status = useStatusConexaoAgente()
  const proteger = useProtegerConexaoAgente()
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const lista = status.data?.instancias ?? []

  return (
    <Secao titulo="Proteger conexão"
      descricao="Cada número precisa de uma chave secreta no endereço que recebe as mensagens. Sem isso, alguém poderia se passar por um membro da equipe.">
      {status.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
        : status.data && !status.data.ok ? <MensagemErro texto={status.data.error ?? 'Não foi possível ver os números.'} />
          : lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum número conectado.</p> : (
            <ul className="divide-y divide-border">
              {lista.map((n) => (
                <li key={n.instance_uuid} className="flex flex-wrap items-center gap-3 py-2">
                  <ShieldCheck className={cn('h-4 w-4 shrink-0', n.protegida ? 'text-success' : 'text-muted-foreground')} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{n.nome ?? n.instance_id}</p>
                    <p className="text-xs text-muted-foreground">
                      {n.protegida ? `Protegido${n.ultimo_uso_em ? ` · última mensagem ${formataDataCurta(n.ultimo_uso_em)}` : ''}` : 'Sem proteção'}
                      {!n.token_configurado && ' · sem token do número no servidor'}
                    </p>
                  </div>
                  <button type="button" className={cn(n.protegida ? botaoSecundario : botaoPrimario, 'py-1.5')}
                    disabled={proteger.isPending || !n.token_configurado}
                    onClick={() => {
                      setMsg(null)
                      proteger.mutate(n.instance_uuid, {
                        onSuccess: (r) => setMsg(r.ok
                          ? { ok: true, texto: r.rotacao ? 'Chave trocada. A antiga vale mais 10 minutos.' : 'Número protegido.' }
                          : { ok: false, texto: r.error ?? 'Não foi possível proteger.' }),
                      })
                    }}>
                    {proteger.isPending && proteger.variables === n.instance_uuid ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {n.protegida ? 'Trocar chave' : 'Proteger'}
                  </button>
                </li>
              ))}
            </ul>
          )}
      {msg && (msg.ok ? <MensagemSucesso texto={msg.texto} /> : <MensagemErro texto={msg.texto} />)}
    </Secao>
  )
}

// ---------------------------------------------------------------------------
// Pessoas
// ---------------------------------------------------------------------------

function Pessoas({
  membros, candidatos, carregandoEquipe, erroEquipe, ativo,
}: { membros: MembroAgente[]; candidatos: CandidatoAgente[]; carregandoEquipe: boolean; erroEquipe: string | null; ativo: boolean }) {
  const salvar = useSalvarMembroAgente()
  const alterar = useAlterarMembroAgente()
  const excluir = useExcluirMembroAgente()
  const boasVindas = useBoasVindasAgente()
  const [erro, setErro] = useState<string | null>(erroEquipe)
  const [ok, setOk] = useState<string | null>(null)
  const [userId, setUserId] = useState('')
  const [telefone, setTelefone] = useState('')
  const [apagar, setApagar] = useState<MembroAgente | null>(null)
  const porUsuario = new Map(candidatos.map((c) => [c.user_id, c]))
  const disponiveis = candidatos.filter((c) => !membros.some((m) => m.user_id === c.user_id))
  const escolhido = porUsuario.get(userId)

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null); setOk(null)
    const v = validarMembroAgente(userId, telefone, membros)
    if (!v.ok) { setErro(v.erro); return }
    salvar.mutate({ user_id: userId, telefone: v.telefone }, {
      onSuccess: () => { setUserId(''); setTelefone('') },
      onError: (err) => setErro(mensagemErroWa(err, 'Não foi possível adicionar.')),
    })
  }

  return (
    <Secao titulo={`Quem pode falar com ele (${membros.length} de ${LIMITE_MEMBROS_AGENTE})`}
      descricao="Só essas pessoas recebem resposta. Cada uma vê só os clientes da própria carteira (a mesma regra do sistema).">
      {membros.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">Ninguém na lista ainda.</p>
      ) : (
        <ul className="divide-y divide-border">
          {membros.map((m) => {
            const c = porUsuario.get(m.user_id)
            const nome = c?.nome ?? 'Pessoa da equipe'
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-2">
                <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <User className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {formataTelefoneExibicao(m.telefone)}
                    {c && ` · ${PERFIS[c.perfil] ?? c.perfil} · ${textoEscopo(c)}`}
                  </p>
                </div>
                <button type="button" className={cn(botaoSecundario, 'py-1.5')}
                  disabled={!ativo || !m.ativo || !!m.boas_vindas_em || boasVindas.isPending}
                  title={m.boas_vindas_em ? 'Já recebeu as boas-vindas' : !ativo ? 'Ligue o assistente primeiro' : undefined}
                  onClick={() => {
                    setErro(null); setOk(null)
                    boasVindas.mutate({ membro_id: m.id }, {
                      onSuccess: (r) => r.ok
                        ? setOk(r.status === 'ja_enviado' ? `${nome} já tinha recebido as boas-vindas.` : `Boas-vindas enviadas para ${nome}.`)
                        : setErro(r.error ?? 'Não foi possível enviar.'),
                    })
                  }}>
                  <Hand className="h-4 w-4" aria-hidden /> {m.boas_vindas_em ? 'Boas-vindas enviadas' : 'Mandar boas-vindas'}
                </button>
                <Interruptor ligado={m.ativo} rotulo={`${nome} pode falar com o assistente`} disabled={alterar.isPending}
                  onChange={(v) => alterar.mutate({ id: m.id, ativo: v }, { onError: (err) => setErro(mensagemErroWa(err, 'Não foi possível alterar.')) })} />
                <button type="button" onClick={() => setApagar(m)} aria-label={`Remover ${nome}`}
                  className={cn('rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-danger', foco)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={adicionar} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="space-y-1 text-sm">
          <span className="text-foreground">Pessoa da equipe</span>
          <select className={cn(campo, 'w-full')} value={userId} onChange={(e) => setUserId(e.target.value)} disabled={carregandoEquipe}>
            <option value="">{carregandoEquipe ? 'Carregando…' : 'Escolha…'}</option>
            {disponiveis.map((c) => (
              <option key={c.user_id} value={c.user_id}>{c.nome} — {PERFIS[c.perfil] ?? c.perfil}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-foreground">WhatsApp dela</span>
          <input className={cn(campo, 'w-full')} value={telefone} inputMode="tel" autoComplete="off"
            onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} placeholder="(11) 99999-8888" />
        </label>
        <button type="submit" disabled={salvar.isPending} className={botaoPrimario}>
          {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
        </button>
      </form>
      {escolhido && (
        <p className="text-xs text-muted-foreground">
          {escolhido.nome} ({PERFIS[escolhido.perfil] ?? escolhido.perfil}) {textoEscopo(escolhido)}
          {escolhido.ve_tudo ? '' : ' — o assistente só fala desses clientes com ela'}.
        </p>
      )}
      <MensagemErro texto={erro} />
      <MensagemSucesso texto={ok} />

      <ConfirmDialog open={apagar !== null} onClose={() => setApagar(null)}
        title="Remover da lista?" description="Essa pessoa deixa de receber respostas do assistente. Dá para adicionar de novo depois."
        confirmLabel="Remover" loading={excluir.isPending}
        onConfirm={() => apagar && excluir.mutate(apagar.id, {
          onSuccess: () => setApagar(null),
          onError: (err) => { setApagar(null); setErro(mensagemErroWa(err, 'Não foi possível remover.')) },
        })} />
    </Secao>
  )
}

// ---------------------------------------------------------------------------
// Grupos internos
// ---------------------------------------------------------------------------

function nomeInstancia(insts: { id: string; nome: string; numero_whatsapp: string | null }[], id: string): string {
  const i = insts.find((x) => x.id === id)
  return i ? `${i.nome}${i.numero_whatsapp ? ` (final ${i.numero_whatsapp.replace(/\D/g, '').slice(-4)})` : ''}` : 'Número removido'
}

function Grupos({
  grupos, ativo, gruposLigados, instanciaPadrao,
}: { grupos: GrupoAgente[]; ativo: boolean; gruposLigados: boolean; instanciaPadrao: string | null }) {
  const internos = useGruposInternos(true)
  const { data: instancias = [] } = useInstances(null)
  const salvar = useSalvarGrupoAgente()
  const alterar = useAlterarGrupoAgente()
  const trocar = useTrocarNumerosGrupoAgente()
  const excluir = useExcluirGrupoAgente()
  const boasVindas = useBoasVindasAgente()
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [apagar, setApagar] = useState<GrupoAgente | null>(null)
  const [confirmarTotal, setConfirmarTotal] = useState<{ grupo: GrupoAgente } | { novo: true } | null>(null)

  // Novo grupo
  const padraoUuid = instancias.find((i) => i.instance_id === instanciaPadrao)?.id ?? ''
  const [jid, setJid] = useState('')
  const [principal, setPrincipal] = useState('')
  const [reservas, setReservas] = useState<string[]>([])
  const [acessoTotal, setAcessoTotal] = useState(false)
  useEffect(() => { if (!principal && padraoUuid) setPrincipal(padraoUuid) }, [padraoUuid, principal])

  const nomes = useMemo(() => new Map((internos.data?.grupos ?? []).map((g) => [g.grupo_jid, g.nome])), [internos.data])
  const opcoes = (internos.data?.grupos ?? []).filter((g) => !grupos.some((x) => x.grupo_jid === g.grupo_jid))
  const cheio = grupos.length >= LIMITE_GRUPOS_AGENTE

  const adicionar = () => {
    setErro(null); setOk(null)
    if (!jid) { setErro('Escolha o grupo.'); return }
    const n = montarNumerosGrupo(principal, reservas)
    if (!n.ok) { setErro(n.erro); return }
    salvar.mutate({ grupo_jid: jid, acesso_total: acessoTotal, numeros: n.linhas }, {
      onSuccess: () => { setJid(''); setReservas([]); setAcessoTotal(false) },
      onError: (err) => setErro(mensagemErroWa(err, 'Não foi possível liberar o grupo.')),
    })
  }

  const trocarNumeros = (g: GrupoAgente, novoPrincipal: string, novasReservas: string[]) => {
    const n = montarNumerosGrupo(novoPrincipal, novasReservas)
    if (!n.ok) { setErro(n.erro); return }
    trocar.mutate({ grupoId: g.id, numeros: n.linhas }, { onError: (err) => setErro(mensagemErroWa(err, 'Não foi possível trocar os números.')) })
  }

  return (
    <Secao titulo={`Grupos internos (${grupos.length} de ${LIMITE_GRUPOS_AGENTE})`}
      descricao="No grupo, ele só responde quando chamado: @menção, resposta a uma mensagem dele ou o nome dele na frase.">
      {!gruposLigados && <Aviso>As respostas em grupos estão desligadas lá em cima. Os grupos abaixo ficam em espera.</Aviso>}
      <Dica>{AVISO_GRUPO_INVISIVEL} Sem "Todos no grupo veem tudo", ele só fala dos clientes que TODOS do grupo podem ver; se houver alguém de fora da equipe, não fala de cliente nenhum.</Dica>

      {grupos.length > 0 && (
        <ul className="divide-y divide-border">
          {grupos.map((g) => {
            const nome = g.nome || nomes.get(g.grupo_jid) || 'Grupo interno'
            const principalG = g.numeros[0]?.instance_uuid ?? ''
            const reservasG = g.numeros.slice(1).map((n) => n.instance_uuid)
            return (
              <li key={g.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Users className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.acesso_total ? 'Todos no grupo veem tudo' : 'Interseção das carteiras de quem está no grupo'}
                      {g.participantes_externos ? ` · ${g.participantes_externos} pessoa(s) de fora da equipe` : ''}
                    </p>
                  </div>
                  <button type="button" className={cn(botaoSecundario, 'py-1.5')}
                    disabled={!ativo || !gruposLigados || !g.ativo || !!g.boas_vindas_em || boasVindas.isPending}
                    onClick={() => {
                      setErro(null); setOk(null)
                      boasVindas.mutate({ grupo_id: g.id }, {
                        onSuccess: (r) => r.ok
                          ? setOk(r.status === 'ja_enviado' ? 'Esse grupo já tinha recebido as boas-vindas.' : 'Boas-vindas enviadas no grupo.')
                          : setErro(r.error ?? 'Não foi possível enviar.'),
                      })
                    }}>
                    <Hand className="h-4 w-4" aria-hidden /> {g.boas_vindas_em ? 'Boas-vindas enviadas' : 'Mandar boas-vindas'}
                  </button>
                  <Interruptor ligado={g.ativo} rotulo={`Responder no grupo ${nome}`} disabled={alterar.isPending}
                    onChange={(v) => alterar.mutate({ id: g.id, ativo: v }, { onError: (err) => setErro(mensagemErroWa(err, 'Não foi possível alterar.')) })} />
                  <button type="button" onClick={() => setApagar(g)} aria-label={`Remover ${nome}`}
                    className={cn('rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-danger', foco)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-3 pl-11 text-sm">
                  <label className="flex items-center gap-2">
                    <span className="text-muted-foreground">Número principal</span>
                    <select className={campo} value={principalG} disabled={trocar.isPending}
                      onChange={(e) => trocarNumeros(g, e.target.value, reservasG.filter((r) => r !== e.target.value))}>
                      {!principalG && <option value="">Escolha…</option>}
                      {instancias.map((i) => <option key={i.id} value={i.id}>{nomeInstancia(instancias, i.id)}</option>)}
                    </select>
                  </label>
                  <SeletorReservas instancias={instancias} principal={principalG} reservas={reservasG} disabled={trocar.isPending}
                    onChange={(r) => trocarNumeros(g, principalG, r)} />
                  <label className="flex items-center gap-2 text-foreground">
                    <Interruptor ligado={g.acesso_total} rotulo={`Todos no grupo ${nome} veem tudo`} disabled={alterar.isPending}
                      onChange={(v) => (v ? setConfirmarTotal({ grupo: g })
                        : alterar.mutate({ id: g.id, acesso_total: false }, { onError: (err) => setErro(mensagemErroWa(err, 'Não foi possível alterar.')) }))} />
                    Todos no grupo veem tudo (qualquer pessoa do grupo pode perguntar)
                  </label>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {cheio ? (
        <p className="text-sm text-muted-foreground">Limite de {LIMITE_GRUPOS_AGENTE} grupos atingido.</p>
      ) : internos.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando grupos…</p>
      ) : internos.error ? (
        <MensagemErro texto={mensagemErroWa(internos.error, 'Não foi possível carregar os grupos.')} />
      ) : internos.data?.numero_configurado === false ? (
        <Aviso>{internos.data.aviso ?? 'Escolha o número na aba Conexão para ver os grupos.'}</Aviso>
      ) : (
        <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
          <p className="text-sm font-medium text-foreground">Liberar um grupo interno</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-foreground">Grupo (só os sem vínculo com cliente)</span>
              <select className={cn(campo, 'w-full')} value={jid} onChange={(e) => setJid(e.target.value)}>
                <option value="">{opcoes.length ? 'Escolha…' : 'Nenhum grupo interno disponível'}</option>
                {opcoes.map((g) => <option key={g.grupo_jid} value={g.grupo_jid}>{g.nome}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-foreground">Número principal</span>
              <select className={cn(campo, 'w-full')} value={principal}
                onChange={(e) => { setPrincipal(e.target.value); setReservas((r) => r.filter((x) => x !== e.target.value)) }}>
                <option value="">Escolha…</option>
                {instancias.map((i) => <option key={i.id} value={i.id}>{nomeInstancia(instancias, i.id)}</option>)}
              </select>
            </label>
          </div>
          <SeletorReservas instancias={instancias} principal={principal} reservas={reservas} onChange={setReservas} />
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={acessoTotal} className="h-4 w-4"
              onChange={(e) => (e.target.checked ? setConfirmarTotal({ novo: true }) : setAcessoTotal(false))} />
            Todos no grupo veem tudo (qualquer pessoa do grupo pode perguntar)
          </label>
          {acessoTotal && <Aviso>{AVISO_ACESSO_TOTAL}</Aviso>}
          <Dica>Confirme que no grupo só há pessoas da equipe. Os números escolhidos precisam estar no grupo e protegidos.</Dica>
          <button type="button" onClick={adicionar} disabled={salvar.isPending} className={botaoPrimario}>
            {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Liberar grupo
          </button>
        </div>
      )}
      <MensagemErro texto={erro} />
      <MensagemSucesso texto={ok} />

      <ConfirmDialog open={confirmarTotal !== null} onClose={() => setConfirmarTotal(null)}
        title="Todos no grupo veem tudo?"
        description={`${AVISO_ACESSO_TOTAL} Ligue só se o grupo tiver apenas pessoas de confiança da equipe.`}
        confirmLabel="Ligar" loading={alterar.isPending}
        onConfirm={() => {
          const c = confirmarTotal
          if (!c) return
          if ('novo' in c) { setAcessoTotal(true); setConfirmarTotal(null); return }
          alterar.mutate({ id: c.grupo.id, acesso_total: true }, {
            onSuccess: () => setConfirmarTotal(null),
            onError: (err) => { setConfirmarTotal(null); setErro(mensagemErroWa(err, 'Não foi possível alterar.')) },
          })
        }} />
      <ConfirmDialog open={apagar !== null} onClose={() => setApagar(null)}
        title="Parar de responder neste grupo?" description="O assistente deixa de responder no grupo. Dá para liberar de novo depois."
        confirmLabel="Remover" loading={excluir.isPending}
        onConfirm={() => apagar && excluir.mutate(apagar.id, {
          onSuccess: () => setApagar(null),
          onError: (err) => { setApagar(null); setErro(mensagemErroWa(err, 'Não foi possível remover.')) },
        })} />
    </Secao>
  )
}

function SeletorReservas({
  instancias, principal, reservas, onChange, disabled,
}: {
  instancias: { id: string; nome: string; numero_whatsapp: string | null }[]
  principal: string
  reservas: string[]
  onChange: (r: string[]) => void
  disabled?: boolean
}) {
  const livres = instancias.filter((i) => i.id !== principal && !reservas.includes(i.id))
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Reservas:</span>
      {reservas.length === 0 && <span className="text-muted-foreground">nenhuma</span>}
      {reservas.map((r, i) => (
        <span key={r} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
          {i + 1}. {nomeInstancia(instancias, r)}
          <button type="button" disabled={disabled} aria-label="Tirar reserva" className={cn('rounded-full px-1 hover:text-danger', foco)}
            onClick={() => onChange(reservas.filter((x) => x !== r))}>×</button>
        </span>
      ))}
      {livres.length > 0 && reservas.length < MAX_NUMEROS_GRUPO - 1 && (
        <select className={cn(campo, 'py-1 text-xs')} value="" disabled={disabled}
          onChange={(e) => e.target.value && onChange([...reservas, e.target.value])} aria-label="Adicionar número reserva">
          <option value="">+ reserva</option>
          {livres.map((i) => <option key={i.id} value={i.id}>{nomeInstancia(instancias, i.id)}</option>)}
        </select>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Como chamar (prévia literal)
// ---------------------------------------------------------------------------

function ComoChamar() {
  const painel = usePainelWa()
  const { data: instancias = [] } = useInstances(null)
  const cfg = painel.config
  const nome = cfg?.agente_nome || NOME_AGENTE_PADRAO
  const numero = instancias.find((i) => i.instance_id === cfg?.uazapi_instance_id)?.numero_whatsapp ?? null
  const grupo = rodapesGrupo({ nome, nomeContato: cfg?.agente_nome_contato ?? null, telefoneNumero: numero })[0]
  return (
    <Secao titulo="Como a equipe chama o assistente"
      descricao="Esse texto vai, sem mudar uma letra, no fim do relatório diário de quem está na lista (e no grupo liberado).">
      <div className="grid gap-3 md:grid-cols-2">
        <figure className="space-y-1">
          <figcaption className="text-xs font-medium text-muted-foreground">No privado</figcaption>
          <p className="rounded-lg bg-[#d9fdd3] px-3 py-2 text-sm text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]">{rodapesPrivado()[0]}</p>
        </figure>
        <figure className="space-y-1">
          <figcaption className="text-xs font-medium text-muted-foreground">No grupo interno</figcaption>
          <p className="rounded-lg bg-[#d9fdd3] px-3 py-2 text-sm text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]">{grupo}</p>
        </figure>
      </div>
      <Dica>Também responde a "ajuda", "menu" ou "o que você faz?". No WhatsApp Oficial (modelo aprovado pela Meta) o rodapé não vai.</Dica>
    </Secao>
  )
}

// ---------------------------------------------------------------------------
// Simular pergunta
// ---------------------------------------------------------------------------

function Simular({ candidatos }: { candidatos: CandidatoAgente[] }) {
  const simular = useSimularAgente()
  const [userId, setUserId] = useState('')
  const [pergunta, setPergunta] = useState('')
  const [r, setR] = useState<RespostaSimulacao | null>(null)

  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    setR(null)
    simular.mutate({ pergunta: pergunta.trim(), user_id: userId }, { onSuccess: setR })
  }

  return (
    <Secao titulo="Simular pergunta" descricao="Responde aqui como se a pessoa tivesse perguntado no privado. Preferências e ajustes do aviso são apenas simulados. A execução e o custo aparecem na atividade; nada é enviado no WhatsApp.">
      <form onSubmit={enviar} className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="text-foreground">Perguntar como</span>
          <select className={cn(campo, 'w-full sm:w-80')} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Escolha a pessoa…</option>
            {candidatos.map((c) => <option key={c.user_id} value={c.user_id}>{c.nome} — {textoEscopo(c)}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-foreground">Pergunta</span>
          <textarea className={cn(campo, 'h-auto min-h-[72px] w-full py-2')} maxLength={1000} value={pergunta}
            onChange={(e) => setPergunta(e.target.value)} placeholder="ex.: Quais clientes estão sem resposta hoje?" />
        </label>
        <button type="submit" disabled={simular.isPending || !userId || !pergunta.trim()} className={botaoPrimario}>
          {simular.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Simular
        </button>
      </form>
      {r && !r.ok && <MensagemErro texto={r.error ?? 'Não foi possível simular.'} />}
      {r?.ok && (
        <div className="space-y-2">
          {r.resposta
            ? <p className="whitespace-pre-wrap rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground"><Bot className="mr-1 inline h-4 w-4" aria-hidden />{r.resposta}</p>
            : <MensagemErro texto={r.falha ?? 'Sem resposta.'} />}
          <p className="text-xs text-muted-foreground">
            <Sparkles className="mr-1 inline h-3 w-3" aria-hidden />
            Ferramentas: {r.ferramentas?.length ? r.ferramentas.join(', ') : 'nenhuma'} · {r.passos ?? 0} passo(s) ·
            {' '}{(r.tokens?.entrada ?? 0) + (r.tokens?.saida ?? 0)} tokens · {formatarCustoUsd(r.custo_usd)} · {Math.round((r.duracao_ms ?? 0) / 100) / 10}s
            {r.escopo && ` · ${r.escopo.restrito ? 'sem acesso a clientes' : textoEscopo({ ve_tudo: r.escopo.total, clientes: r.escopo.clientes })}`}
          </p>
        </div>
      )}
    </Secao>
  )
}

// ---------------------------------------------------------------------------
// Histórico (sem conteúdo)
// ---------------------------------------------------------------------------

function Historico({ porUsuario }: { porUsuario: Map<string, CandidatoAgente> }) {
  const ex = useExecucoesAgente()
  const lista = ex.data ?? []
  const custoTotal = lista.reduce((s, e) => s + (Number(e.custo_usd) || 0), 0)
  return (
    <Secao titulo="Últimas respostas" descricao="Só o resultado, as ferramentas e o custo — o texto das perguntas e respostas não fica aqui.">
      {ex.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma resposta ainda.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{lista.length} mais recentes · {formatarCustoUsd(custoTotal)} no total</p>
          <ul className="divide-y divide-border">
            {lista.map((e) => {
              const r = rotuloResultadoExecucao(e.resultado)
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">{formataDataCurta(e.created_at)}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {(e.user_id && porUsuario.get(e.user_id)?.nome) || (e.canal === 'grupo' ? 'Alguém no grupo' : 'Equipe')}
                    <span className="text-muted-foreground"> · {e.canal === 'simulacao' ? 'simulação' : e.canal ?? '—'}</span>
                  </span>
                  <span className={cn('text-xs', r.tom === 'ok' && 'text-success', r.tom === 'erro' && 'text-danger',
                    r.tom === 'atencao' && 'text-note-fg', r.tom === 'neutro' && 'text-muted-foreground')}>{r.rotulo}</span>
                  <span className="w-full pl-28 text-xs text-muted-foreground sm:w-auto sm:pl-0">
                    {e.ferramentas?.length ? e.ferramentas.join(', ') : 'sem ferramentas'} · {formatarCustoUsd(e.custo_usd)}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Secao>
  )
}
