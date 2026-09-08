import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Trash2, ExternalLink, Upload, FileText, Download, History, Sparkles, Check, Link as LinkIcon, X, Plus, Users, RotateCcw } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  useContrato,
  useUpdateContrato,
  useDeleteContrato,
  useCreateContrato,
  useConsultores,
  useAnexos,
  useUploadAnexo,
  useDeleteAnexo,
  getAnexoDownloadUrl,
  useAuditContrato,
  usePdfExtractions,
  useExtractPdf,
  useApplyExtraction,
  useProdutosComissao,
  useProdutosList,
  type Contrato,
  type ContratoAnexo,
  type ContratoPagamento,
} from '@/hooks/useComissoes'
import { ContratoTagsEditor } from '@/components/tags/ContratoTagsEditor'
import { supabase } from '@/lib/supabase'
function fmtBRL(v: number | null | undefined) {
  if (v === null || v === undefined) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function onlyDigits(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

/** Só datas no formato YYYY-MM-DD viram data válida na célula; senão, vazio. */
function dataOuVazio(v: string | null | undefined): string {
  const s = (v ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

/**
 * Sentinela de "sem data real" (convenção herdada do Notion). Contratos assim ficam
 * fora das métricas e não geram comissão — a guarda vive em `calcular_comissoes_contrato`.
 */
const DATA_SENTINELA = '1900-01-01'

function ehSentinela(v: string | null | undefined): boolean {
  const s = dataOuVazio(v)
  return s !== '' && s <= DATA_SENTINELA
}

/** Soma `k` meses a uma data YYYY-MM-DD (mantém o dia). Vazio se a data for inválida. */
function addMeses(v: string | null | undefined, k: number): string {
  const s = dataOuVazio(v)
  if (!s) return ''
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1 + k, d)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Monta uma prévia das parcelas a partir dos campos soltos que o contrato já tem
 * (entrada, valor da parcela, nº de parcelas, forma, vencimento...). Usada só
 * enquanto a coluna `pagamentos` estiver vazia, pra tabela não nascer em branco.
 */
function derivarPagamentos(c: Partial<Contrato>): ContratoPagamento[] {
  const linhas: ContratoPagamento[] = []
  const forma = c.forma_pagamento ?? ''

  const entrada = c.entrada != null ? Number(c.entrada) : 0
  if (entrada > 0) {
    linhas.push({
      sinal: 'Entrada',
      data: dataOuVazio(c.pg_entrada) || dataOuVazio(c.data_fechamento),
      valor: entrada,
      forma,
      plataforma: '',
    })
  }

  const n = c.num_parcelas ?? 0
  let vParcela = c.valor_parcela != null ? Number(c.valor_parcela) : 0
  // Sem valor de parcela explícito? Distribui o que sobra do total depois da entrada,
  // pra soma da tabela bater com o "Valor total" do contrato.
  if (n > 0 && !(vParcela > 0)) {
    const total = c.valor_total != null ? Number(c.valor_total) : 0
    const resto = total - entrada
    if (resto > 0) vParcela = resto / n
  }
  if (n > 0 && vParcela > 0) {
    for (let i = 0; i < n; i++) {
      linhas.push({
        sinal: n === 1 ? 'Parcela' : `Parcela ${i + 1}`,
        // 1ª parcela 1 mês após a assinatura, e assim por diante. Não usa `vencimento`
        // (que no import veio como assinatura + 12 meses = renovação, não início).
        data: addMeses(c.data_fechamento, i + 1),
        valor: vParcela,
        forma,
        plataforma: '',
      })
    }
  }

  // Se nada foi derivado mas há um valor total, mostra ao menos uma linha.
  if (linhas.length === 0 && c.valor_total != null && Number(c.valor_total) > 0) {
    linhas.push({
      sinal: 'Pagamento',
      data: dataOuVazio(c.data_fechamento),
      valor: Number(c.valor_total),
      forma,
      plataforma: '',
    })
  }

  return linhas
}

/** Uma linha conta como "entrada" quando o sinal menciona entrada. */
function ehEntrada(sinal: string | null | undefined): boolean {
  return (sinal ?? '').toLowerCase().includes('entrada')
}

/**
 * A tabela de pagamentos é a fonte da verdade: daqui saem os campos-resumo do
 * contrato (valor total, entrada, nº de parcelas, valor da parcela), que ficam
 * somente-leitura na tela.
 */
function resumirPagamentos(ps: ContratoPagamento[]): {
  valor_total: number
  entrada: number | null
  num_parcelas: number
  valor_parcela: number | null
} {
  const entradas = ps.filter((p) => ehEntrada(p.sinal))
  const parcelas = ps.filter((p) => !ehEntrada(p.sinal))
  const total = ps.reduce((s, p) => s + (Number(p.valor) || 0), 0)
  const entrada = entradas.reduce((s, p) => s + (Number(p.valor) || 0), 0)
  const valoresParcela = parcelas.map((p) => Number(p.valor) || 0)
  const todasIguais = valoresParcela.length > 0 && valoresParcela.every((v) => v === valoresParcela[0])
  return {
    valor_total: total,
    entrada: entrada > 0 ? entrada : null,
    // nunca zera: a comissão divide por num_parcelas, então mínimo 1.
    num_parcelas: Math.max(parcelas.length, 1),
    valor_parcela: todasIguais ? valoresParcela[0] : null,
  }
}

// Status interno do contrato (fonte única). `valor` fica gravado em status_secundario.
const STATUS_INTERNO_OPCOES = [
  { valor: 'Não iniciado', label: 'Não iniciado' },
  { valor: 'ATIVO',        label: 'Ativo' },
  { valor: 'PAUSADO',      label: 'Pausado' },
  { valor: 'INADIMPLENTE', label: 'Inadimplente' },
  { valor: 'CANCELADO',    label: 'Cancelado' },
  { valor: 'CONCLUÍDO',    label: 'Concluído' },
]

/** Status primário (enum do banco) derivado do status interno. */
function statusPrimarioDet(valor: string | null): Contrato['status'] {
  const v = valor ?? ''
  if (/CANCEL/i.test(v)) return 'cancelado'
  if (/CONCL/i.test(v)) return 'concluido'
  if (/INICIAD/i.test(v)) return 'rascunho' as Contrato['status']
  return 'ativo'
}

export function ContratoDetailPage() {
  const { id: rawId } = useParams<{ id: string }>()
  const isNovo = rawId === 'novo'
  const id = isNovo ? undefined : rawId

  const navigate = useNavigate()
  const { data: contrato, isLoading } = useContrato(id)
  const { data: consultores } = useConsultores()
  const { data: produtosComissao } = useProdutosComissao()
  const { data: produtosCatalogo } = useProdutosList()
  const update = useUpdateContrato()
  const create = useCreateContrato()
  const del = useDeleteContrato()
  const [tab, setTab] = useState<'detalhes' | 'anexos' | 'historico' | 'ia'>('detalhes')

  const [form, setForm] = useState<Partial<Contrato>>(
    isNovo
      ? {
          cliente_nome: '',
          status: 'ativo',
          status_secundario: 'ATIVO',
          num_parcelas: 1,
          percentual_aplicado: 0,
          valor_total: 0,
          data_fechamento: new Date().toISOString().slice(0, 10),
        }
      : {},
  )
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (contrato) {
      setForm(contrato)
      setDirty(false)
    }
  }, [contrato])

  // Pagamentos puxados do onboarding (null = ainda não buscou; [] = buscou e não achou).
  const [pagamentosOnboarding, setPagamentosOnboarding] = useState<ContratoPagamento[] | null>(null)
  const [puxando, setPuxando] = useState(false)
  const [avisoPuxar, setAvisoPuxar] = useState<{ tipo: 'erro' | 'ok'; msg: string } | null>(null)

  // Busca (sem aplicar) a lista de pagamentos da venda do onboarding, por WhatsApp/e-mail.
  async function buscarPagamentosOnboarding(
    whats: string | null | undefined,
    mail: string | null | undefined,
  ): Promise<ContratoPagamento[] | null> {
    const tel = onlyDigits(whats)
    const email = (mail ?? '').trim().toLowerCase()
    const filtros: string[] = []
    if (tel.length >= 8) filtros.push(`cliente_whatsapp.ilike.%${tel.slice(-8)}%`)
    if (email) filtros.push(`cliente_email.ilike.${email}`)
    if (filtros.length === 0) return null
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => { select: (c: string) => { or: (f: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: { pagamentos: ContratoPagamento[] }[] | null; error: { message: string } | null }> } } } }
    })
      .from('vendas_pendentes')
      .select('pagamentos, criado_em')
      .or(filtros.join(','))
      .order('criado_em', { ascending: false })
      .limit(1)
    if (error) throw new Error(error.message)
    const pags = Array.isArray(data?.[0]?.pagamentos) ? (data![0].pagamentos as ContratoPagamento[]) : []
    if (pags.length === 0) return null
    return pags.map((p) => ({
      data: (p.data ?? '').slice(0, 10),
      valor: Number(p.valor) || 0,
      forma: p.forma ?? '',
      plataforma: p.plataforma ?? '',
      sinal: p.sinal ?? '',
    }))
  }

  // Auto: ao abrir um contrato ainda sem lista de pagamentos salva, puxa sozinho do onboarding.
  useEffect(() => {
    if (isNovo || !contrato) return
    if ((contrato.pagamentos ?? []).length > 0) return
    if (pagamentosOnboarding !== null) return
    let cancel = false
    buscarPagamentosOnboarding(contrato.whatsapp, contrato.email)
      .then((pags) => { if (!cancel) setPagamentosOnboarding(pags ?? []) })
      .catch(() => { if (!cancel) setPagamentosOnboarding([]) })
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contrato, isNovo])

  function set<K extends keyof Contrato>(key: K, value: Contrato[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  async function onSave() {
    if (isNovo) {
      if (!form.cliente_nome) { alert('Nome do cliente é obrigatório.'); return }
      const novo = await create.mutateAsync({
        cliente_nome: form.cliente_nome,
        produto_nome: form.produto_nome ?? null,
        estrategista_id: form.estrategista_id ?? null,
        data_fechamento: form.data_fechamento ?? new Date().toISOString().slice(0, 10),
        valor_total: form.valor_total ?? 0,
        num_parcelas: form.num_parcelas ?? 1,
        percentual_aplicado: form.percentual_aplicado ?? 0,
        status: form.status ?? 'ativo',
        observacoes: form.observacoes ?? null,
        ...form,
      })
      // O e-mail de "contrato assinado" é disparado por um trigger no banco
      // sempre que o link do Clicksign passa a existir — não importa a tela.
      navigate(`/contratos/${novo.id}`)
      return
    }
    if (!id) return
    // A tabela manda: salva a lista de pagamentos (real ou a prévia derivada dos
    // campos) junto com os campos-resumo, pra o que aparece na tela ser o que grava.
    const pagsFinais = (form.pagamentos && form.pagamentos.length > 0)
      ? form.pagamentos
      : (pagamentosOnboarding && pagamentosOnboarding.length > 0)
        ? pagamentosOnboarding
        : derivarPagamentos(form)
    const patch: Partial<Contrato> & { id: string } = {
      id,
      ...form,
      pagamentos: pagsFinais,
      ...resumirPagamentos(pagsFinais),
    }
    delete (patch as Partial<Contrato>).criado_em
    delete (patch as Partial<Contrato>).atualizado_em
    delete (patch as Partial<Contrato>).importado_em
    delete (patch as Partial<Contrato>).notion_ultima_edicao
    const linkAntes = (contrato?.link_clicksign ?? '').trim()
    const linkDepois = (form.link_clicksign ?? '').trim()
    // Contrato assinado (link Clicksign adicionado agora) → ativa automaticamente,
    // desde que ainda esteja parado em rascunho/"Não iniciado".
    if (!linkAntes && linkDepois) {
      const statusSec = (patch.status_secundario ?? '').toUpperCase()
      if (!statusSec || statusSec === 'NÃO INICIADO' || (patch.status as string) === 'rascunho') {
        patch.status = 'ativo'
        patch.status_secundario = 'ATIVO'
      }
    }
    await update.mutateAsync(patch)
    setDirty(false)
    // O e-mail de aviso sai por um trigger no banco quando o link do Clicksign
    // passa a existir — não é mais disparado manualmente pela tela.
  }

  async function onDelete() {
    if (!id) return
    if (!confirm('Excluir este contrato? As comissões previstas serão removidas.')) return
    try {
      await del.mutateAsync(id)
      navigate('/contratos/lista')
    } catch (e) {
      // Ex.: contrato com comissão paga é bloqueado por gatilho no banco.
      alert((e as Error).message || 'Não foi possível excluir o contrato.')
    }
  }

  if (!isNovo && (isLoading || !contrato)) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="h-8 w-64 shimmer rounded-lg" />
        <div className="h-96 shimmer rounded-lg" />
      </div>
    )
  }

  const f = form as Contrato
  const isPending = update.isPending || create.isPending
  const regraComissao = produtosComissao?.find(
    (p) => p.produto_id === f.produto_id || (!!f.produto_nome && p.products?.nome === f.produto_nome),
  )

  // Lista de parcelas de pagamento. Se a coluna `pagamentos` ainda estiver vazia
  // (contrato antigo/importado), montamos uma prévia a partir dos campos soltos que
  // já existem (entrada, valor da parcela, forma etc.). A prévia vira lista real
  // assim que o usuário edita/adiciona/salva. Futuramente vem do onboarding.
  const pagamentosSalvos: ContratoPagamento[] = f.pagamentos ?? []
  const temSalvos = pagamentosSalvos.length > 0
  const temOnboarding = !temSalvos && !!pagamentosOnboarding && pagamentosOnboarding.length > 0
  const pagamentosDerivados = derivarPagamentos(f)
  const usandoDerivados = !temSalvos && !temOnboarding && pagamentosDerivados.length > 0
  // Prioridade: o que já foi salvo > o que veio automático do onboarding > a prévia dos campos antigos.
  const pagamentos = temSalvos
    ? pagamentosSalvos
    : temOnboarding
      ? (pagamentosOnboarding as ContratoPagamento[])
      : pagamentosDerivados
  // A tabela é a fonte da verdade: estes campos-resumo saem dela (só leitura na tela).
  const resumo = resumirPagamentos(pagamentos)
  const totalPagamentos = resumo.valor_total
  // Grava a lista E recalcula os campos-resumo num único update, pra nunca divergirem.
  function commitPagamentos(novos: ContratoPagamento[]) {
    setForm((prev) => ({ ...prev, pagamentos: novos, ...resumirPagamentos(novos) }))
    setDirty(true)
  }
  function setPagamento(i: number, campo: keyof ContratoPagamento, val: string) {
    const novos = pagamentos.map((p, j) =>
      j === i ? { ...p, [campo]: campo === 'valor' ? Number(val.replace(',', '.')) || 0 : val } : p,
    )
    commitPagamentos(novos)
  }
  function addPagamento() {
    commitPagamentos([...pagamentos, { data: '', valor: 0, forma: '', plataforma: '', sinal: '' }])
  }
  function removePagamento(i: number) {
    commitPagamentos(pagamentos.filter((_, j) => j !== i))
  }
  function fixarPagamentos() {
    commitPagamentos(pagamentos)
  }

  // Botão manual: refaz a busca no onboarding e aplica na tabela.
  async function puxarDoOnboarding() {
    setAvisoPuxar(null)
    setPuxando(true)
    try {
      const pags = await buscarPagamentosOnboarding(f.whatsapp, f.email)
      if (!pags) {
        setAvisoPuxar({ tipo: 'erro', msg: 'Não encontrei nenhuma venda no onboarding com pagamentos pra este cliente.' })
        return
      }
      commitPagamentos(pags)
      setAvisoPuxar({ tipo: 'ok', msg: `${pags.length} pagamento(s) trazido(s) do onboarding. Confira e salve.` })
    } catch (e) {
      setAvisoPuxar({ tipo: 'erro', msg: `Erro ao buscar a venda: ${(e as Error).message}` })
    } finally {
      setPuxando(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in pb-12">
      <button
        onClick={() => {
          // Volta para a URL anterior (a lista mantém os filtros na query string).
          // Fallback para a lista limpa quando não há histórico interno (ex.: link direto).
          if (window.history.length > 1) navigate(-1)
          else navigate('/contratos/lista')
        }}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para contratos
      </button>

      <PageHeader
        title={isNovo ? 'Novo contrato' : (contrato?.cliente_nome ?? '—')}
        description={
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {contrato?.notion_numero && <span>#{contrato.notion_numero}</span>}
            {contrato?.notion_page_id && (
              <a
                href={`https://www.notion.so/${contrato.notion_page_id.replace(/-/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                Notion <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {contrato?.importado_em && (
              <span>· Importado em {new Date(contrato.importado_em).toLocaleString('pt-BR')}</span>
            )}
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            {!isNovo && (
              <button
                onClick={onDelete}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-danger hover:bg-danger-light"
              >
                <Trash2 className="h-4 w-4" /> Excluir
              </button>
            )}
            <button
              onClick={onSave}
              disabled={(!dirty && !isNovo) || isPending}
              className="flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {isPending ? 'Salvando…' : (isNovo ? 'Criar contrato' : 'Salvar')}
            </button>
          </div>
        }
      />

      {!isNovo && (
        <div className="flex items-center gap-1 border-b border-border">
          {([
            ['detalhes', 'Detalhes', null],
            ['anexos', 'Anexos', <FileText key="f" className="h-3.5 w-3.5" />],
            ['ia', 'Extração IA', <Sparkles key="s" className="h-3.5 w-3.5" />],
            ['historico', 'Histórico', <History key="h" className="h-3.5 w-3.5" />],
          ] as const).map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      )}

      {!isNovo && tab === 'anexos' && id && <AnexosTab contratoId={id} linkClicksign={f.link_clicksign ?? null} onLinkChange={(v) => set('link_clicksign', v)} />}
      {!isNovo && tab === 'ia' && id && <ExtracaoIATab contratoId={id} />}
      {!isNovo && tab === 'historico' && id && <HistoricoTab contratoId={id} consultores={consultores ?? []} />}

      {(isNovo || tab === 'detalhes') && <>

      <Section title="Cliente">
        <Field label="Nome do cliente *">
          <Input value={f.cliente_nome ?? ''} onChange={(v) => set('cliente_nome', v)} />
        </Field>
        <Field label="Empresa">
          <Input value={f.empresa ?? ''} onChange={(v) => set('empresa', v)} />
        </Field>
        <Field label="CPF / CNPJ">
          <Input value={f.cpf_cnpj ?? ''} onChange={(v) => set('cpf_cnpj', v)} />
        </Field>
        <Field label="WhatsApp">
          <Input value={f.whatsapp ?? ''} onChange={(v) => set('whatsapp', v)} />
        </Field>
        <Field label="E-mail">
          <Input value={f.email ?? ''} onChange={(v) => set('email', v)} />
        </Field>
        <Field label="Instagram">
          <Input value={f.instagram ?? ''} onChange={(v) => set('instagram', v)} />
        </Field>
        <Field label="Nicho">
          <Input value={f.nicho ?? ''} onChange={(v) => set('nicho', v)} />
        </Field>
        <Field label="Faturamento (faixa)">
          <Input value={f.faturamento ?? ''} onChange={(v) => set('faturamento', v)} />
        </Field>
        <Field label="Endereço" wide>
          <Input value={f.endereco ?? ''} onChange={(v) => set('endereco', v)} />
        </Field>
        <Field label="Posicionamento" wide>
          <Textarea value={f.posicionamento ?? ''} onChange={(v) => set('posicionamento', v)} />
        </Field>
        <Field label="Resumo" wide>
          <Textarea value={f.resumo ?? ''} onChange={(v) => set('resumo', v)} />
        </Field>
      </Section>

      <div className={`glass-card p-5 space-y-4 ${f.pagador_diferente ? 'border-2 border-warning/50 bg-warning/5' : ''}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!f.pagador_diferente}
            onChange={(e) => set('pagador_diferente', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm">
            <span className="flex items-center gap-1.5 font-bold text-foreground">
              <Users className="h-4 w-4 text-warning" /> Pagamento feito por outra pessoa
            </span>
            <span className="block text-xs text-muted-foreground">O contrato está no nome do cliente, mas quem efetuou o pagamento é outra pessoa/empresa.</span>
          </span>
        </label>
        {f.pagador_diferente && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Nome de quem pagou">
              <Input value={f.pagador_nome ?? ''} onChange={(v) => set('pagador_nome', v)} />
            </Field>
            <Field label="CPF / CNPJ de quem pagou">
              <Input value={f.pagador_cpf_cnpj ?? ''} onChange={(v) => set('pagador_cpf_cnpj', v)} />
            </Field>
            <Field label="Relação com o cliente">
              <Input value={f.pagador_relacao ?? ''} onChange={(v) => set('pagador_relacao', v)} />
            </Field>
            <Field label="Observação" wide>
              <Textarea value={f.pagador_observacao ?? ''} onChange={(v) => set('pagador_observacao', v)} />
            </Field>
          </div>
        )}
      </div>

      <Section title="Contrato">
        <Field label="Produto">
          <Select
            value={f.produto_nome ?? ''}
            onChange={(v) => {
              const prod = produtosCatalogo?.find((p) => p.nome === v)
              setForm((prev) => ({ ...prev, produto_nome: v || null, produto_id: prod?.id ?? null }))
              setDirty(true)
            }}
          >
            <option value="">—</option>
            {f.produto_nome && !produtosCatalogo?.some((p) => p.nome === f.produto_nome) && (
              <option value={f.produto_nome}>{f.produto_nome}</option>
            )}
            {(produtosCatalogo ?? []).map((p) => (
              <option key={p.id} value={p.nome}>{p.nome}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={f.status_secundario ?? ''}
            onChange={(v) => {
              const val = v || null
              set('status_secundario', val)
              set('status', statusPrimarioDet(val))
            }}
          >
            {STATUS_INTERNO_OPCOES.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Data do contrato">
          <Input type="date" value={f.data_fechamento?.slice(0, 10) ?? ''} onChange={(v) => set('data_fechamento', v)} />
          {ehSentinela(f.data_fechamento) && (
            <p className="mt-1 text-xs text-warning">
              Sem data real — este contrato fica fora das métricas e não gera comissão até você preencher.
            </p>
          )}
        </Field>
        <Field label="Data de assinatura">
          <Input
            type="date"
            value={f.data_assinatura?.slice(0, 10) ?? ''}
            onChange={(v) => set('data_assinatura', v || null)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Preenchida sozinha quando o Clicksign é anexado. Ajuste à mão se o contrato foi
            assinado por fora.
          </p>
        </Field>
        <Field label="Data de pagamento">
          <Input
            type="date"
            value={f.data_pagamento?.slice(0, 10) ?? ''}
            onChange={(v) => set('data_pagamento', v || null)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            É por ela que a lista de contratos é ordenada. Acompanha a entrada do cronograma
            de pagamentos; se você corrigir aqui, o valor digitado é mantido.
          </p>
        </Field>
        <Field label="Origem da venda" wide>
          <OrigemVenda
            interna={f.venda_interna}
            onChange={(origem) => {
              set('venda_interna', origem === 'interno')
            }}
          />
        </Field>
        <Field label="Link Clicksign" wide>
          <Input value={f.link_clicksign ?? ''} onChange={(v) => set('link_clicksign', v)} />
        </Field>
        {id && (
          <Field label="Tags" wide>
            <ContratoTagsEditor contratoId={id} />
          </Field>
        )}
      </Section>

      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-foreground">Pagamentos</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={puxarDoOnboarding}
              disabled={puxando}
              className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
              title="Busca a venda deste cliente no onboarding e traz os pagamentos (forma, plataforma, datas)"
            >
              <Download className="h-3.5 w-3.5" /> {puxando ? 'Buscando…' : 'Puxar do onboarding'}
            </button>
            <button
              type="button"
              onClick={addPagamento}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar parcela
            </button>
          </div>
        </div>

        {avisoPuxar && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${avisoPuxar.tipo === 'ok' ? 'border-success/40 bg-success/10 text-foreground' : 'border-danger/40 bg-danger-light text-danger'}`}>
            {avisoPuxar.msg}
          </div>
        )}

        {/* Resumo — calculado a partir da tabela (a tabela é a fonte da verdade) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ResumoCard label="Valor total" value={fmtBRL(resumo.valor_total)} destaque />
          <ResumoCard label="Entrada" value={resumo.entrada != null ? fmtBRL(resumo.entrada) : '—'} />
          <ResumoCard label="Nº de parcelas" value={String(resumo.num_parcelas)} />
          {resumo.num_parcelas > 1 && (
            <ResumoCard label="Valor da parcela" value={resumo.valor_parcela != null ? fmtBRL(resumo.valor_parcela) : 'variados'} />
          )}
        </div>

        {temOnboarding && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-foreground">
            <span className="flex-1">
              Pagamentos trazidos automaticamente do onboarding (com forma, plataforma e datas). Confira a tabela e clique em “Confirmar” pra salvar no contrato.
            </span>
            <button
              type="button"
              onClick={fixarPagamentos}
              className="shrink-0 rounded-full bg-success px-3 py-1 text-xs font-medium text-white hover:bg-success/90"
            >
              Confirmar
            </button>
          </div>
        )}

        {usandoDerivados && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-info/30 bg-info-light/40 px-3 py-2 text-xs text-info">
            <span className="flex-1">
              Estes valores foram montados a partir dos campos antigos do contrato. Confira a tabela abaixo e clique em “Confirmar” pra fixar as parcelas.
            </span>
            <button
              type="button"
              onClick={fixarPagamentos}
              className="shrink-0 rounded-full bg-info px-3 py-1 text-xs font-medium text-white hover:bg-info/90"
            >
              Confirmar
            </button>
          </div>
        )}

        {pagamentos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            Nenhuma parcela cadastrada. Use “Adicionar parcela” — em breve isso será preenchido automaticamente pelo onboarding.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Sinal</th>
                  <th className="px-2 py-2 font-medium">Data</th>
                  <th className="px-2 py-2 font-medium text-right">Valor (R$)</th>
                  <th className="px-2 py-2 font-medium">Forma</th>
                  <th className="px-2 py-2 font-medium">Plataforma</th>
                  <th className="px-2 py-2 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagamentos.map((p, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5"><CellInput value={p.sinal} onChange={(v) => setPagamento(i, 'sinal', v)} placeholder="Entrada" /></td>
                    <td className="px-2 py-1.5"><CellInput type="date" value={(p.data ?? '').slice(0, 10)} onChange={(v) => setPagamento(i, 'data', v)} /></td>
                    <td className="px-2 py-1.5"><CellInput type="number" align="right" value={p.valor ?? ''} onChange={(v) => setPagamento(i, 'valor', v)} placeholder="0" /></td>
                    <td className="px-2 py-1.5"><CellInput value={p.forma} onChange={(v) => setPagamento(i, 'forma', v)} placeholder="PIX" /></td>
                    <td className="px-2 py-1.5"><CellInput value={p.plataforma} onChange={(v) => setPagamento(i, 'plataforma', v)} /></td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => removePagamento(i)}
                        className="p-1 rounded hover:bg-danger-light text-muted-foreground hover:text-danger"
                        title="Remover parcela"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Faturamento e bônus — ficam junto do financeiro */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Faturamento bruto (R$)</label>
            <Input type="number" step="0.01" value={f.fat_bruto ?? ''} onChange={(v) => set('fat_bruto', v === '' ? null : Number(v))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Bônus</label>
            <Input value={f.bonus ?? ''} onChange={(v) => set('bonus', v)} />
          </div>
        </div>

        {/* Regra de comissão — só entrada manual quando o produto não tem regra cadastrada */}
        {!regraComissao && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">% de comissão</label>
            <Input type="number" step="0.01" value={f.percentual_aplicado ?? 0} onChange={(v) => set('percentual_aplicado', Number(v))} />
            <span className="block text-xs text-muted-foreground">
              Produto sem regra cadastrada em Produtos &amp; Comissão — informe o % manualmente.
            </span>
          </div>
        )}
      </div>

      <Section title="Pessoas envolvidas">
        <Field label="Estrategista (mapeado)">
          <Select
            value={f.estrategista_id ?? ''}
            onChange={(v) => {
              set('estrategista_id', v || null)
              if (v) {
                const c = consultores?.find((x) => x.id === v)
                if (c) set('estrategista_nome_raw', c.nome)
              }
            }}
          >
            <option value="">— não atribuído —</option>
            {consultores?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </Field>
        <Field label="Estrategista (Notion — texto cru)">
          <Input value={f.estrategista_nome_raw ?? ''} onChange={(v) => set('estrategista_nome_raw', v)} />
        </Field>
        <Field label="Vendedor">
          <Input value={f.vendedor ?? ''} onChange={(v) => set('vendedor', v)} />
        </Field>
        <Field label="Treinador(a)">
          <Input value={f.treinador ?? ''} onChange={(v) => set('treinador', v)} />
        </Field>
      </Section>

      <Section title="Métricas e acompanhamento">
        <Field label="Seguidores início">
          <Input type="number" step="0.01" value={f.seguidores_inicio ?? ''} onChange={(v) => set('seguidores_inicio', v === '' ? null : Number(v))} />
        </Field>
        <Field label="Seguidores fim">
          <Input type="number" step="0.01" value={f.seguidores_fim ?? ''} onChange={(v) => set('seguidores_fim', v === '' ? null : Number(v))} />
        </Field>
        <Field label="Crescimento seguidores">
          <Input type="number" step="0.01" value={f.crescimento_seguidores ?? ''} onChange={(v) => set('crescimento_seguidores', v === '' ? null : Number(v))} />
        </Field>
        <Field label="Vídeos postados">
          <Input type="number" value={f.videos_postados ?? ''} onChange={(v) => set('videos_postados', v === '' ? null : Number(v))} />
        </Field>
        <Field label="Entregas no prazo">
          <Input type="number" value={f.entregas_no_prazo ?? ''} onChange={(v) => set('entregas_no_prazo', v === '' ? null : Number(v))} />
        </Field>
        <Field label="Entregas totais">
          <Input type="number" value={f.entregas_totais ?? ''} onChange={(v) => set('entregas_totais', v === '' ? null : Number(v))} />
        </Field>
        <Field label="NPS - VIP">
          <Input value={f.nps_vip ?? ''} onChange={(v) => set('nps_vip', v)} />
        </Field>
      </Section>

      <Section title="Observações">
        <Field label="Observações internas" wide>
          <Textarea value={f.observacoes ?? ''} onChange={(v) => set('observacoes', v)} rows={4} />
        </Field>
      </Section>

      {contrato && (
        <div className="rounded-md bg-info-light p-3 text-xs text-info">
          Resumo financeiro atual: <strong>{fmtBRL(contrato.valor_total)}</strong> em <strong>{contrato.num_parcelas}</strong> parcelas
          {contrato.valor_parcela !== null && <> de <strong>{fmtBRL(contrato.valor_parcela)}</strong></>}
          {contrato.percentual_aplicado > 0 && <> · {contrato.percentual_aplicado}% de comissão</>}.
        </div>
      )}

      </>}

      {dirty && (
        <div className="fixed bottom-4 right-4 rounded-full bg-warning px-4 py-2 text-sm font-medium text-warning-foreground shadow-lg">
          Alterações não salvas
        </div>
      )}
    </div>
  )
}

// =====================
// Aba Anexos
// =====================
function AnexosTab({ contratoId, linkClicksign, onLinkChange }: { contratoId: string; linkClicksign: string | null; onLinkChange: (v: string | null) => void }) {
  const { data: anexos, isLoading } = useAnexos(contratoId)
  const upload = useUploadAnexo()
  const del = useDeleteAnexo()
  const updateContrato = useUpdateContrato()
  const [categoria, setCategoria] = useState<ContratoAnexo['categoria']>('contrato')
  const [linkEditing, setLinkEditing] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await upload.mutateAsync({ contratoId, file, categoria })
    } catch (err) {
      alert(`Erro no upload: ${(err as Error).message}`)
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function onDownload(a: ContratoAnexo) {
    try {
      const url = await getAnexoDownloadUrl(a.storage_path)
      window.open(url, '_blank')
    } catch (err) {
      alert(`Erro: ${(err as Error).message}`)
    }
  }

  async function saveLink() {
    const trimmed = linkDraft.trim()
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      alert('A URL deve começar com http:// ou https://')
      return
    }
    try {
      await updateContrato.mutateAsync({ id: contratoId, link_clicksign: trimmed || null })
      onLinkChange(trimmed || null)
      setLinkEditing(false)
      // O e-mail de aviso sai por um trigger no banco quando o link passa a existir.
    } catch (err) {
      alert(`Erro ao salvar link: ${(err as Error).message}`)
    }
  }

  async function removeLink() {
    if (!confirm('Remover o link do Clicksign?')) return
    try {
      await updateContrato.mutateAsync({ id: contratoId, link_clicksign: null })
      onLinkChange(null)
    } catch (err) {
      alert(`Erro: ${(err as Error).message}`)
    }
  }

  return (
    <div className="glass-card p-5 space-y-4">
      {linkClicksign && !linkEditing && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-info-light/40 p-3">
          <FileText className="h-4 w-4 text-info shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Link do Clicksign</p>
            <a href={linkClicksign} target="_blank" rel="noopener noreferrer" className="text-xs text-info underline truncate block">{linkClicksign}</a>
          </div>
          <button
            onClick={() => { setLinkDraft(linkClicksign); setLinkEditing(true) }}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            title="Editar"
          >
            <LinkIcon className="h-4 w-4" />
          </button>
          <button
            onClick={removeLink}
            disabled={updateContrato.isPending}
            className="p-1.5 rounded hover:bg-danger-light text-muted-foreground hover:text-danger"
            title="Remover link"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {linkEditing && (
        <div className="flex flex-col sm:flex-row gap-2 rounded-lg border border-border p-3">
          <input
            type="url"
            placeholder="https://app.clicksign.com/..."
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
          <button
            onClick={saveLink}
            disabled={updateContrato.isPending}
            className="rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {updateContrato.isPending ? 'Salvando…' : 'Salvar link'}
          </button>
          <button
            onClick={() => setLinkEditing(false)}
            className="rounded-full border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancelar
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as ContratoAnexo['categoria'])}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="contrato">Contrato (Clicksign etc.)</option>
          <option value="comprovante_entrada">Comprovante de entrada</option>
          <option value="nota_fiscal">Nota fiscal</option>
          <option value="outro">Outro</option>
        </select>
        <label className="flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer">
          <Upload className="h-4 w-4" />
          {upload.isPending ? 'Enviando…' : 'Enviar arquivo'}
          <input ref={inputRef} type="file" className="hidden" onChange={onPick} disabled={upload.isPending} />
        </label>
        {!linkClicksign && !linkEditing && (
          <button
            onClick={() => { setLinkDraft(''); setLinkEditing(true) }}
            className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <LinkIcon className="h-4 w-4" />
            Adicionar por link
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="h-24 shimmer rounded-lg" />
      ) : !anexos || anexos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {linkClicksign ? 'Nenhum arquivo enviado — use o link do Notion acima.' : 'Nenhum anexo ainda.'}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{a.nome_original}</p>
                <p className="text-xs text-muted-foreground">
                  {a.categoria} · {a.tamanho_bytes ? Math.round(a.tamanho_bytes / 1024) + ' KB' : '—'}
                  {' · '}{new Date(a.enviado_em).toLocaleString('pt-BR')}
                </p>
              </div>
              <button onClick={() => onDownload(a)} className="p-1.5 rounded hover:bg-muted" title="Baixar">
                <Download className="h-4 w-4" />
              </button>
              <button
                onClick={() => { if (confirm(`Remover "${a.nome_original}"?`)) del.mutate(a) }}
                className="p-1.5 rounded hover:bg-danger-light text-muted-foreground hover:text-danger"
                title="Excluir"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// =====================
// Aba Extração IA
// =====================
function ExtracaoIATab({ contratoId }: { contratoId: string }) {
  const { data: extractions, isLoading } = usePdfExtractions(contratoId)
  const { data: anexos } = useAnexos(contratoId)
  const extract = useExtractPdf()
  const apply = useApplyExtraction()

  const temPdf = (anexos ?? []).some(
    (a) => a.categoria === 'contrato' && (a.mime_type?.includes('pdf') ?? a.nome_original.toLowerCase().endsWith('.pdf')),
  )

  async function rodarExtracao() {
    try {
      await extract.mutateAsync({ contratoId })
    } catch (err) {
      alert(`Erro: ${(err as Error).message}`)
    }
  }

  async function aplicar(extractionId: string, dados: Record<string, unknown>) {
    if (!confirm('Aplicar os campos extraídos no contrato? Os campos vazios não serão sobrescritos.')) return
    try {
      await apply.mutateAsync({ extractionId, contratoId, dados })
    } catch (err) {
      alert(`Erro: ${(err as Error).message}`)
    }
  }

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">Extração automática do PDF</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            A IA lê o PDF anexado (categoria "Contrato") e extrai os campos. Você revisa e aplica.
          </p>
        </div>
        <button
          onClick={rodarExtracao}
          disabled={!temPdf || extract.isPending}
          className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          title={temPdf ? '' : 'Suba um PDF na aba Anexos primeiro'}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {extract.isPending ? 'Lendo PDF…' : 'Extrair do PDF'}
        </button>
      </div>

      {!temPdf && (
        <p className="text-xs text-muted-foreground italic">
          Nenhum PDF de contrato anexado ainda. Vá na aba <strong>Anexos</strong>, selecione categoria "Contrato (Clicksign etc.)" e envie o arquivo.
        </p>
      )}

      {isLoading ? (
        <div className="h-24 shimmer rounded-lg" />
      ) : !extractions || extractions.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma extração executada ainda.</p>
      ) : (
        <ul className="space-y-3">
          {extractions.map((e) => {
            const dados = e.dados_extraidos as Record<string, unknown>
            const aplicado = Boolean(e.aplicado_em)
            return (
              <li key={e.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {new Date(e.criado_em).toLocaleString('pt-BR')} · {e.modelo}
                    {e.tokens_input && <> · {e.tokens_input}+{e.tokens_output} tokens</>}
                  </span>
                  {aplicado ? (
                    <span className="inline-flex items-center gap-1 text-success text-xs font-medium">
                      <Check className="h-3.5 w-3.5" /> Aplicado em {new Date(e.aplicado_em!).toLocaleDateString('pt-BR')}
                    </span>
                  ) : (
                    <button
                      onClick={() => aplicar(e.id, dados)}
                      disabled={apply.isPending}
                      className="rounded-full bg-success px-2.5 py-1 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-40"
                    >
                      Aplicar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {Object.entries(dados).filter(([k]) => k !== '_confidence').map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="text-foreground font-medium truncate">
                        {v === null || v === undefined || v === '' ? <em className="text-muted-foreground/50">∅</em> : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// =====================
// Aba Histórico
// =====================
const FIELD_LABELS: Record<string, string> = {
  // Cliente
  cliente_nome: 'Nome do cliente',
  empresa: 'Empresa',
  cpf_cnpj: 'CPF / CNPJ',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  instagram: 'Instagram',
  nicho: 'Nicho',
  faturamento: 'Faturamento',
  endereco: 'Endereço',
  posicionamento: 'Posicionamento',
  resumo: 'Resumo',
  // Contrato
  produto_nome: 'Produto',
  status: 'Status',
  status_secundario: 'Status secundário',
  data_fechamento: 'Data de assinatura',
  vencimento: 'Vencimento',
  plano_dias: 'Plano (dias)',
  semanas: 'Semanas',
  renovacao: 'Renovação',
  valor_parcela: 'Valor da parcela',
  num_parcelas: 'Nº de parcelas',
  valor_total: 'Valor total',
  percentual_aplicado: '% comissão',
  entrada: 'Entrada',
  pg_entrada: 'PG entrada',
  forma_pagamento: 'Forma de pagamento',
  fat_bruto: 'Fat. bruto',
  bonus: 'Bônus',
  link_clicksign: 'Link Clicksign',
  venda_interna: 'Venda interna',
  venda_diretoria: 'Venda diretoria',
  // Pessoas
  estrategista_id: 'Estrategista (mapeado)',
  estrategista_nome_raw: 'Estrategista (texto)',
  vendedor: 'Vendedor',
  treinador: 'Treinador(a)',
  // Métricas
  seguidores_inicio: 'Seguidores (início)',
  seguidores_fim: 'Seguidores (fim)',
  crescimento_seguidores: 'Crescimento seguidores',
  videos_postados: 'Vídeos postados',
  entregas_no_prazo: 'Entregas no prazo',
  entregas_totais: 'Entregas totais',
  nps_vip: 'NPS VIP',
  // Pagamento por terceiro
  pagador_diferente: 'Pagamento por terceiro',
  pagador_nome: 'Pagador (nome)',
  pagador_cpf_cnpj: 'Pagador (CPF/CNPJ)',
  pagador_relacao: 'Pagador (relação)',
  pagador_observacao: 'Pagador (observação)',
  // Outros
  observacoes: 'Observações',
  pagamentos: 'Pagamentos',
  cliente_id: 'Cliente (sistema)',
}

type Consultor = { id: string; nome: string }

interface AuditGroup {
  ts: string
  userName: string | null
  items: import('@/hooks/useComissoes').AuditEntry[]
}

function groupAuditEntries(entries: import('@/hooks/useComissoes').AuditEntry[]): AuditGroup[] {
  const groups: AuditGroup[] = []
  for (const entry of entries) {
    const last = groups[groups.length - 1]
    const diff = last ? Math.abs(new Date(entry.alterado_em).getTime() - new Date(last.ts).getTime()) : Infinity
    if (last && entry.alterado_por === last.items[0].alterado_por && diff < 4000) {
      last.items.push(entry)
    } else {
      groups.push({ ts: entry.alterado_em, userName: entry.usuario?.nome ?? null, items: [entry] })
    }
  }
  return groups
}

function resolveValue(campo: string, valor: string | null, consultores: Consultor[]): string {
  if (valor === null || valor === undefined) return '—'
  if (campo === 'estrategista_id') {
    const c = consultores.find((x) => x.id === valor)
    return c ? c.nome : valor
  }
  if (campo === 'venda_interna' || campo === 'venda_diretoria') {
    return valor === 'true' ? 'Sim' : valor === 'false' ? 'Não' : valor
  }
  if ((campo === 'valor_total' || campo === 'valor_parcela' || campo === 'entrada' || campo === 'fat_bruto') && valor) {
    const n = parseFloat(valor)
    if (!isNaN(n)) return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  if (valor.length > 80) return valor.slice(0, 80) + '…'
  return valor
}

// Campos que precisam ser convertidos do texto do audit de volta ao tipo da coluna.
const AUDIT_NUM_FIELDS = new Set([
  'valor_total', 'valor_parcela', 'entrada', 'fat_bruto', 'num_parcelas', 'percentual_aplicado',
  'plano_dias', 'semanas', 'seguidores_inicio', 'seguidores_fim', 'crescimento_seguidores',
  'videos_postados', 'entregas_no_prazo', 'entregas_totais',
])
const AUDIT_BOOL_FIELDS = new Set(['venda_interna', 'venda_diretoria', 'pagador_diferente'])

/** Converte o valor gravado (texto) no audit de volta ao tipo esperado pela coluna. */
function coerceAuditValue(campo: string, valor: string | null): unknown {
  if (valor === null) return null
  if (AUDIT_NUM_FIELDS.has(campo)) { const n = Number(valor); return Number.isNaN(n) ? null : n }
  if (AUDIT_BOOL_FIELDS.has(campo)) return valor === 'true'
  if (campo === 'pagamentos') { try { return JSON.parse(valor) } catch { return valor } }
  return valor
}

function HistoricoTab({ contratoId, consultores }: { contratoId: string; consultores: Consultor[] }) {
  const { data: entries, isLoading } = useAuditContrato(contratoId)
  const groups = groupAuditEntries(entries ?? [])
  const update = useUpdateContrato()

  // Reverte a alteração mais recente: devolve cada campo ao valor_antigo registrado no audit.
  async function reverter(group: AuditGroup) {
    const updates = group.items.filter((e) => e.operacao === 'UPDATE' && e.campo)
    if (updates.length === 0) return
    const labels = updates.map((e) => FIELD_LABELS[e.campo!] ?? e.campo).join(', ')
    if (!confirm(`Reverter a última alteração? ${updates.length === 1 ? 'O campo' : 'Os campos'} (${labels}) voltará ao valor anterior.`)) return
    const patch: Record<string, unknown> = {}
    for (const e of updates) patch[e.campo!] = coerceAuditValue(e.campo!, e.valor_antigo)
    await update.mutateAsync({ id: contratoId, ...(patch as Partial<import('@/hooks/useComissoes').Contrato>) })
  }

  return (
    <div className="glass-card p-5 space-y-1">
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 shimmer rounded-lg" />)}</div>
      ) : !entries || entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Sem histórico ainda. Edite qualquer campo pra começar a registrar.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((group, gi) => {
            const isInsert = group.items.some((e) => e.operacao === 'INSERT')
            const isDelete = group.items.some((e) => e.operacao === 'DELETE')
            const updates = group.items.filter((e) => e.operacao === 'UPDATE' && e.campo)

            return (
              <li key={gi} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isInsert && (
                      <span className="inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                        Contrato criado
                      </span>
                    )}
                    {isDelete && (
                      <span className="inline-flex items-center rounded-full bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger">
                        Contrato excluído
                      </span>
                    )}
                    {!isInsert && !isDelete && (
                      <span className="inline-flex items-center rounded-full bg-info/15 px-2 py-0.5 text-xs font-semibold text-info">
                        {updates.length} {updates.length === 1 ? 'alteração' : 'alterações'}
                      </span>
                    )}
                    {group.userName && (
                      <span className="text-xs text-muted-foreground">por <strong className="text-foreground">{group.userName}</strong></span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {gi === 0 && updates.length > 0 && !isInsert && !isDelete && (
                      <button
                        onClick={() => reverter(group)}
                        disabled={update.isPending}
                        title="Reverter esta alteração"
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" /> Reverter
                      </button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(group.ts).toLocaleString('pt-BR')}
                    </span>
                  </div>
                </div>

                {updates.length > 0 && (
                  <ul className="space-y-1 pt-1 border-t border-border/60">
                    {updates.map((e) => (
                      <li key={e.id} className="grid grid-cols-[140px_1fr] gap-2 text-xs items-start">
                        <span className="font-medium text-foreground truncate">{FIELD_LABELS[e.campo!] ?? e.campo}</span>
                        <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <span className="text-muted-foreground line-through truncate max-w-[160px]">
                            {resolveValue(e.campo!, e.valor_antigo, consultores)}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-success font-medium truncate max-w-[160px]">
                            {resolveValue(e.campo!, e.valor_novo, consultores)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-5 space-y-4">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {children}
      </div>
    </div>
  )
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${wide ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}

function Input({
  value, onChange, type = 'text', step, min,
}: {
  value: string | number
  onChange: (v: string) => void
  type?: string
  step?: string
  min?: string
}) {
  return (
    <input
      type={type}
      step={step}
      min={min}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
    />
  )
}

function Textarea({ value, onChange, rows = 2 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
    />
  )
}

/** Card de resumo (só leitura) calculado a partir da tabela de Pagamentos. */
function ResumoCard({ label, value, destaque }: { label: string; value: string; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${destaque ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-base font-bold tabular-nums ${destaque ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  )
}

/** Seletor segmentado da origem da venda (Normal / Time interno). */
function OrigemVenda({
  interna, onChange,
}: {
  interna: boolean | null | undefined
  onChange: (origem: 'normal' | 'interno') => void
}) {
  const atual: 'normal' | 'interno' = interna ? 'interno' : 'normal'
  const opcoes: { key: 'normal' | 'interno'; label: string }[] = [
    { key: 'normal', label: 'Normal' },
    { key: 'interno', label: 'Time interno' },
  ]
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            atual === o.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function CellInput({
  value, onChange, type = 'text', placeholder, align = 'left',
}: {
  value: string | number
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  align?: 'left' | 'right'
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full min-w-[6rem] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs text-foreground hover:border-border focus:border-primary focus:bg-background focus:outline-none ${align === 'right' ? 'text-right tabular-nums' : ''}`}
    />
  )
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
    >
      {children}
    </select>
  )
}
