import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ArrowRightLeft, Check, ChevronDown, History, Loader2, Plus, Users, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  agruparHistoricoResponsaveis, carregarHistoricoResponsaveis, carregarResponsaveis, decidirResponsavel,
  parametrosResponsavel, podeRepetirPedidoResponsavel, type AcaoResponsavel, type EventoResponsavel, type PedidoResponsavel,
  type TipoResponsavel, type TransporteResponsaveis, type VinculoResponsavel,
} from '@/lib/responsaveisCliente'

const banco = supabase as unknown as TransporteResponsaveis
const campo = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50'
const botao = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
const rotuloTipo = (tipo: TipoResponsavel) => tipo === 'estrategista' ? 'Estrategista' : 'Atendimento'
function dataLegivel(valor: string) {
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? 'Data não disponível' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}
export async function atualizarCarteiras(qc: ReturnType<typeof useQueryClient>) {
  await Promise.all(['users', 'clients', 'client-responsaveis', 'chat', 'automacoes-wa', 'dashboard-data'].map((chave) => qc.invalidateQueries({ queryKey: [chave] })))
}

export function ResponsaveisCliente({ clientId, clienteNome, podeEditar }: { clientId: string; clienteNome: string; podeEditar: boolean }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const id = useId()
  const [form, setForm] = useState<{ acao: AcaoResponsavel; tipo: TipoResponsavel; antigo: VinculoResponsavel | null } | null>(null)
  const [novo, setNovo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [pedido, setPedido] = useState<PedidoResponsavel | null>(null)
  const [aviso, setAviso] = useState('')
  const [erroLocal, setErroLocal] = useState('')
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const [maisEventos, setMaisEventos] = useState<EventoResponsavel[]>([])
  const [cursor, setCursor] = useState<number | null | undefined>(undefined)
  const consulta = useQuery({
    queryKey: ['client-responsaveis', user?.id, clientId], enabled: Boolean(user && clientId), staleTime: 0, gcTime: 0,
    queryFn: () => carregarResponsaveis(banco, clientId),
  })
  const mudanca = useMutation({
    mutationFn: (p: PedidoResponsavel) => decidirResponsavel(banco, p),
    onSuccess: async () => {
      setForm(null); setPedido(null); setMaisEventos([]); setCursor(undefined)
      setAviso('Responsáveis atualizados. A alteração ficou registrada no histórico.')
      await atualizarCarteiras(qc)
    },
  })
  const mais = useMutation({
    mutationFn: (antes: number) => carregarHistoricoResponsaveis(banco, clientId, antes),
    onSuccess: (r) => { setMaisEventos((atual) => [...atual, ...r.eventos]); setCursor(r.proximo_cursor) },
  })
  function abrir(acao: AcaoResponsavel, antigo: VinculoResponsavel | null = null) {
    setForm({ acao, tipo: antigo?.tipo ?? 'estrategista', antigo }); setNovo(''); setMotivo('')
    setPedido(null); setErroLocal(''); setAviso(''); mudanca.reset()
  }
  function revisar() {
    if (!form || !consulta.data) return
    try {
      const p: PedidoResponsavel = { clientId, acao: form.acao, tipo: form.tipo,
        assignmentId: form.antigo?.id ?? null, userId: form.acao === 'encerrar' ? null : novo,
        motivo: motivo.trim(), revisao: consulta.data.revisao, idempotencia: crypto.randomUUID() }
      parametrosResponsavel(p)
      setErroLocal(''); setPedido(p)
    } catch (e) { setErroLocal(e instanceof Error ? e.message : 'Confira os dados da alteração.') }
  }
  async function atualizar() {
    if (mudanca.isPending) return
    setForm(null); setPedido(null); mudanca.reset(); setMaisEventos([]); setCursor(undefined); setErroLocal('')
    await consulta.refetch()
  }
  const c = consulta.data
  const pessoas = c?.usuarios_elegiveis.filter((p) => p.tipos.includes(form?.tipo ?? 'estrategista')
    && !c.atuais.some((a) => a.user_id === p.id && a.tipo === form?.tipo)) ?? []
  const pessoaNova = c?.usuarios_elegiveis.find((p) => p.id === novo)
  const eventos = [...new Map([...(c?.historico ?? []), ...maisEventos].map((e) => [e.id, e])).values()]
  const proximo = cursor === undefined ? c?.historico_proximo_cursor : cursor
  const erro = mudanca.error ?? consulta.error
  const precisaAtualizar = mudanca.isError && !podeRepetirPedidoResponsavel(mudanca.error)

  return <section className="rounded-2xl border border-border bg-card p-4 sm:p-6" aria-labelledby={`${id}-titulo`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id={`${id}-titulo`} className="flex items-center gap-2 text-base font-bold"><Users className="h-5 w-5 text-primary" aria-hidden /> Responsáveis pelo cliente</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Quem acompanha este cliente no dia a dia. A carteira da Íris usa os vínculos atuais de estrategista.</p>
      </div>
      {podeEditar && !form && c && <button type="button" className={botao} onClick={() => abrir('adicionar')}><Plus className="h-4 w-4" aria-hidden /> Adicionar à equipe</button>}
    </div>
    {consulta.isLoading && <p className="mt-4 flex items-center gap-2 text-sm" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando responsáveis…</p>}
    {c && <div className="mt-4 grid gap-3 md:grid-cols-2">
      {c.atuais.map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3">
        <div className="min-w-0"><p className="font-semibold break-words">{a.usuario_nome}</p><p className="text-xs text-muted-foreground">{rotuloTipo(a.tipo)}{!a.usuario_ativo ? ' · usuário inativo, revise o vínculo' : ''}</p></div>
        {podeEditar && !form && <div className="flex flex-wrap gap-2">
          <button type="button" className={botao} onClick={() => abrir('trocar', a)} aria-label={`Trocar ${rotuloTipo(a.tipo).toLowerCase()} ${a.usuario_nome}`}><ArrowRightLeft className="h-4 w-4" aria-hidden /> Trocar</button>
          <button type="button" className={botao} onClick={() => abrir('encerrar', a)} aria-label={`Encerrar vínculo de ${a.usuario_nome}`}><X className="h-4 w-4" aria-hidden /> Encerrar vínculo</button>
        </div>}
      </div>)}
      {!c.atuais.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground md:col-span-2">Nenhum responsável atribuído. {podeEditar ? 'Use “Adicionar à equipe” para escolher o primeiro estrategista.' : 'Peça à administração para conferir esta carteira.'}</p>}
    </div>}
    {form && c && <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h3 className="font-semibold">{form.acao === 'adicionar' ? 'Adicionar pessoa à equipe' : form.acao === 'trocar' ? `Trocar ${rotuloTipo(form.tipo).toLowerCase()}` : 'Encerrar vínculo'}</h3>
      {!pedido ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {form.acao === 'adicionar' && <div><label htmlFor={`${id}-tipo`} className="mb-1 block text-sm font-medium">Função no cliente</label><select id={`${id}-tipo`} className={campo} value={form.tipo} onChange={(e) => { setForm({ ...form, tipo: e.target.value as TipoResponsavel }); setNovo(''); setErroLocal('') }}><option value="estrategista">Estrategista</option><option value="atendimento">Atendimento</option></select></div>}
        {form.antigo && <p className="text-sm sm:col-span-2">Responsável atual: <strong>{form.antigo.usuario_nome}</strong> · {rotuloTipo(form.tipo)}</p>}
        {form.acao !== 'encerrar' && <div className={form.acao === 'trocar' ? 'sm:col-span-2' : ''}><label htmlFor={`${id}-novo`} className="mb-1 block text-sm font-medium">{form.acao === 'trocar' ? 'Novo responsável' : 'Pessoa da equipe'}</label><select id={`${id}-novo`} className={campo} value={novo} onChange={(e) => { setNovo(e.target.value); setErroLocal('') }}><option value="">Selecione uma pessoa</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>{!pessoas.length && <p className="mt-1 text-sm text-muted-foreground">Nenhuma outra pessoa elegível. Confira os colaboradores ativos e suas permissões.</p>}</div>}
        <div className="sm:col-span-2"><label htmlFor={`${id}-motivo`} className="mb-1 block text-sm font-medium">Motivo da alteração</label><textarea id={`${id}-motivo`} className={campo} rows={2} minLength={3} maxLength={500} value={motivo} onChange={(e) => { setMotivo(e.target.value); setErroLocal('') }} placeholder="Ex.: redistribuição da carteira da equipe" /><p className="mt-1 text-xs text-muted-foreground">Esse motivo ficará no histórico do cliente. Evite senhas ou informações pessoais desnecessárias.</p></div>
        {form.acao === 'adicionar' && <p className="text-sm text-muted-foreground sm:col-span-2">Adicionar mantém os demais responsáveis. Para substituir alguém, use “Trocar”.</p>}
        <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="button" className={`${botao} bg-primary text-primary-foreground hover:bg-primary/90`} disabled={motivo.trim().length < 3 || (form.acao !== 'encerrar' && !pessoaNova)} onClick={revisar}>Revisar alteração <ArrowRight className="h-4 w-4" aria-hidden /></button><button type="button" className={botao} onClick={() => setForm(null)}>Cancelar</button></div>
      </div> : <div className="mt-3 space-y-3">
        <p className="text-sm">Cliente: <strong>{clienteNome}</strong></p>
        <p className="text-base font-semibold">{form.antigo?.usuario_nome ?? 'Novo vínculo'} <span aria-label="para">→</span> {form.acao === 'encerrar' ? 'Vínculo encerrado' : pessoaNova?.nome}</p>
        <p className="text-sm">{rotuloTipo(form.tipo)} · Motivo: {pedido.motivo}</p>
        <p className="rounded-lg border border-border bg-background p-3 text-sm">{form.acao === 'trocar' ? 'O vínculo anterior será encerrado e o novo será criado na mesma alteração.' : form.acao === 'encerrar' ? 'Esse vínculo deixará de fazer parte da equipe atual.' : 'A pessoa será adicionada à equipe atual.'} O histórico será preservado. <strong>Contratos e comissões não serão alterados.</strong></p>
        <div className="flex flex-wrap gap-2"><button type="button" className={`${botao} bg-primary text-primary-foreground hover:bg-primary/90`} disabled={mudanca.isPending || precisaAtualizar} onClick={() => mudanca.mutate(pedido)}>{mudanca.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}{mudanca.isPending ? 'Confirmando…' : precisaAtualizar ? 'Atualize os dados para continuar' : mudanca.isError ? 'Tentar o mesmo pedido novamente' : 'Confirmar alteração'}</button><button type="button" className={botao} disabled={mudanca.isPending} onClick={() => { setPedido(null); mudanca.reset() }}>Voltar e editar</button><button type="button" className={botao} disabled={mudanca.isPending} onClick={() => { setForm(null); setPedido(null); mudanca.reset() }}>Cancelar</button></div>
      </div>}
    </div>}
    {erroLocal && <p className="mt-3 text-sm text-danger" role="alert">{erroLocal}</p>}
    {erro && <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 p-3" role="alert"><p className="text-sm text-danger">{erro instanceof Error ? erro.message : 'Não foi possível conferir os responsáveis.'}</p><button type="button" className={`${botao} mt-2`} disabled={consulta.isFetching || mudanca.isPending} onClick={() => void atualizar()}>Atualizar dados</button></div>}
    {aviso && <p className="mt-3 text-sm text-success" role="status">{aviso}</p>}
    {c && <div className="mt-5 border-t border-border pt-4">
      <button type="button" className="flex items-center gap-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={historicoAberto} aria-controls={`${id}-historico`} onClick={() => setHistoricoAberto(!historicoAberto)}><History className="h-4 w-4" aria-hidden /> Histórico de responsáveis <ChevronDown className={`h-4 w-4 ${historicoAberto ? 'rotate-180' : ''}`} aria-hidden /></button>
      {historicoAberto && <div id={`${id}-historico`} className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">{c.historico_desde ? `Registros disponíveis desde ${dataLegivel(c.historico_desde)}.` : 'As próximas alterações serão registradas aqui.'} Vínculos antigos não informam quando uma troca aconteceu. O nome do cliente não substitui esse histórico.</p>
        {!eventos.length && <p className="text-sm text-muted-foreground">Nenhuma alteração registrada neste histórico.</p>}
        <ol className="space-y-3">{agruparHistoricoResponsaveis(eventos).map((g) => <li key={g.id} className="rounded-lg border border-border p-3"><p className="text-sm font-semibold">{g.incompleto ? 'Troca de responsável · registro continua na página anterior' : `${g.antes?.usuario_nome ?? 'Novo vínculo'} → ${g.depois?.usuario_nome ?? 'Vínculo encerrado'}`}</p><p className="mt-1 text-xs text-muted-foreground">{rotuloTipo((g.depois ?? g.antes)?.tipo ?? 'estrategista')} · {dataLegivel(g.ocorrido_em)} · {g.ator_nome ?? 'Operação de sistema'}</p>{g.motivo && <p className="mt-2 text-sm break-words">{g.motivo}</p>}{g.origem === 'legado_dml' && <p className="mt-1 text-xs text-muted-foreground">Registrado por outro fluxo da plataforma.</p>}</li>)}</ol>
        {proximo != null && <button type="button" className={botao} disabled={mais.isPending} onClick={() => mais.mutate(proximo)}>{mais.isPending ? 'Carregando…' : 'Carregar alterações anteriores'}</button>}
        {mais.error && <p role="alert" className="text-sm text-danger">Não foi possível carregar mais registros. Tente novamente.</p>}
      </div>}
    </div>}
  </section>
}
