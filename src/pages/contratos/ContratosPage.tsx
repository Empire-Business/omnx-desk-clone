import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, X, Trash2, Search, ChevronLeft, ChevronRight, ChevronDown, FileDown, CheckSquare, Square, ArrowDown, ArrowUp, ArrowUpDown, Repeat, Users, Package, Hash, CalendarRange, DollarSign, Tag as TagIcon, CircleDot } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ContratosTabs } from '@/components/contratos/ContratosTabs'
import {
  useContratos,
  useCreateContrato,
  useDeleteContrato,
  useUpdateContrato,
  useClientesList,
  useProdutosList,
  useConsultores,
  useProdutosComissao,
  type Contrato,
} from '@/hooks/useComissoes'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ehRecorrentePorParcelas } from './recorrencia'
import { useTags, useAplicarTagEmMassa, type Tag } from '@/hooks/useTags'
import { RowTags } from '@/components/tags/RowTags'
import { FilterChip, OptionPicker, CHIP_INPUT } from '@/components/filters/FilterChip'
import { ExportContratosDialog } from '@/components/contratos/ExportContratosDialog'

function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

/**
 * Formata uma data vinda de coluna DATE ("YYYY-MM-DD") em pt-BR SEM conversão de
 * fuso. Usar `new Date("2026-06-01")` interpretaria como meia-noite UTC e, no
 * horário do Brasil (UTC-3), exibiria o dia anterior — por isso lemos a string.
 */
/**
 * Sentinela de "sem data real" (convenção herdada do Notion). Contrato assim fica
 * fora das métricas e não gera comissão até alguém preencher a data verdadeira.
 */
const DATA_SENTINELA = '1900-01-01'

function fmtDataBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = iso.slice(0, 10)
  if (s <= DATA_SENTINELA) return 'Sem data'
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return '—'
  return `${d}/${m}/${y}`
}

/** Recorrente = 6 parcelas ou mais no total (a entrada/sinal não conta). */
function isRecorrente(c: Contrato): boolean {
  return ehRecorrentePorParcelas(c.num_parcelas)
}

// Inicial e cor determinística para o avatar do cliente (mesmo nome → mesma cor).
const AVATAR_CORES = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500',
]
function avatarCor(nome: string): string {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0
  return AVATAR_CORES[h % AVATAR_CORES.length]
}
function inicial(nome: string): string {
  const t = (nome ?? '').trim()
  return t ? t[0].toUpperCase() : '?'
}

// Status interno do contrato (fonte única — antes vinha do Notion, agora só o interno).
// `valor` é o que fica gravado em contratos.status_secundario; `label` é o texto exibido.
const STATUS_OPCOES = [
  { valor: 'Não iniciado', label: 'Não iniciado' },
  { valor: 'ATIVO',        label: 'Ativo' },
  { valor: 'PAUSADO',      label: 'Pausado' },
  { valor: 'INADIMPLENTE', label: 'Inadimplente' },
  { valor: 'CANCELADO',    label: 'Cancelado' },
  { valor: 'CONCLUÍDO',    label: 'Concluído' },
] as const

// Filtro de status que vem ligado por padrão: só o que está "em andamento".
const STATUS_DEFAULT = ['ATIVO', 'Não iniciado']

/**
 * Tira acentos para a busca casar do jeito que a pessoa digita: "jose" acha
 * "José", "goncalves" acha "Gonçalves". Sem isso a busca por nome parece quebrada.
 */
function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Rótulo amigável a partir do valor gravado. */
function statusLabel(valor: string | null | undefined): string {
  const v = (valor ?? '').toUpperCase()
  return STATUS_OPCOES.find((s) => s.valor.toUpperCase() === v)?.label ?? (valor || '—')
}

/** Status primário (enum do banco) derivado do status interno. */
function statusPrimario(valor: string | null): 'ativo' | 'pausado' | 'cancelado' | 'concluido' {
  const v = valor ?? ''
  if (/CANCEL/i.test(v)) return 'cancelado'
  if (/CONCL/i.test(v)) return 'concluido'
  if (/PAUS/i.test(v)) return 'pausado'
  if (/INICIAD/i.test(v)) return 'rascunho' as 'ativo' // "Não iniciado" → rascunho no banco (aceito pelo constraint)
  return 'ativo'
}

// Cor por status — pílula colorida e bem visível
function statusClasses(s: string | null | undefined): string {
  switch ((s ?? '').toUpperCase()) {
    case 'ATIVO':        return 'bg-success text-white border-success'
    case 'PAUSADO':      return 'bg-orange-500 text-white border-orange-500'
    case 'INADIMPLENTE': return 'bg-danger text-white border-danger'
    case 'CANCELADO':    return 'bg-danger-light text-danger border-danger/40'
    case 'CONCLUÍDO':    return 'bg-emerald-100 text-emerald-700 border-emerald-300'
    case 'NÃO INICIADO': return 'bg-muted text-muted-foreground border-border'
    default:             return 'bg-muted text-muted-foreground border-border'
  }
}

function StatusPill({ contratoId, value }: { contratoId: string; value: string | null }) {
  const update = useUpdateContrato()
  const cls = statusClasses(value)
  // Garante que um valor legado (fora das opções) ainda apareça no seletor.
  const opcoes = STATUS_OPCOES.some((o) => o.valor.toUpperCase() === (value ?? '').toUpperCase())
    ? STATUS_OPCOES
    : [{ valor: value ?? '', label: statusLabel(value) }, ...STATUS_OPCOES]
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Select
        value={value || undefined}
        disabled={update.isPending}
        onValueChange={(v) => update.mutate({ id: contratoId, status_secundario: v, status: statusPrimario(v) })}
      >
        <SelectTrigger
          className={cn(
            'h-auto w-auto gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
            '[&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-70 [&>svg]:ml-0',
            cls,
          )}
        >
          <SelectValue placeholder={statusLabel(value)}>{statusLabel(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {opcoes.filter((o) => o.valor).map((o) => <SelectItem key={o.valor} value={o.valor}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

const PAGE_SIZE = 40

// Ordenação: chave é "campo_direção". Todas as colunas da tabela ordenam.
type SortKey =
  | 'pagamento_desc' | 'pagamento_asc'
  | 'data_desc' | 'data_asc'
  | 'nome_asc' | 'nome_desc'
  | 'produto_asc' | 'produto_desc'
  | 'valor_desc' | 'valor_asc'
  | 'parcelas_desc' | 'parcelas_asc'
  | 'status_asc' | 'status_desc'
const SORT_LABEL: Record<SortKey, string> = {
  pagamento_desc: 'Pagamento mais recente', pagamento_asc: 'Pagamento mais antigo',
  data_desc: 'Assinatura mais recente', data_asc: 'Assinatura mais antiga',
  nome_asc: 'Nome A-Z', nome_desc: 'Nome Z-A',
  produto_asc: 'Produto A-Z', produto_desc: 'Produto Z-A',
  valor_desc: 'Maior valor', valor_asc: 'Menor valor',
  parcelas_desc: 'Mais parcelas', parcelas_asc: 'Menos parcelas',
  status_asc: 'Status A-Z', status_desc: 'Status Z-A',
}
// Opções mostradas no dropdown compacto (as demais são acessadas clicando nas colunas).
const SORT_DROPDOWN: SortKey[] = ['pagamento_desc', 'pagamento_asc', 'data_desc', 'data_asc', 'nome_asc', 'nome_desc', 'valor_desc', 'valor_asc']
// Direção ao clicar numa coluna ainda não ordenada.
const DEFAULT_DIR: Record<string, 'asc' | 'desc'> = {
  pagamento: 'desc', data: 'desc', valor: 'desc', parcelas: 'desc', nome: 'asc', produto: 'asc', status: 'asc',
}
// Ordenação padrão da lista: pela data de pagamento (decisão do dono, 04/08/2026).
const SORT_PADRAO: SortKey = 'pagamento_desc'

interface Filtros {
  estrategistaId: string
  status: string[]   // vazio = todos os status
  produto: string
  valorMin: string
  valorMax: string
  de: string
  ate: string
  tags: string[]     // IDs de tags selecionadas (vazio = ignora); OR entre elas
  parcelas: string   // nº exato de parcelas (vazio = ignora)
}

// ---- Helpers de período (usam o fuso local do navegador) ----
function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
type AtalhoPeriodo = 'mes' | 'mesPassado' | '6meses' | 'ano'
function periodoAtalho(tipo: AtalhoPeriodo): { de: string; ate: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (tipo) {
    case 'mes':        return { de: ymd(new Date(y, m, 1)),     ate: ymd(new Date(y, m + 1, 0)) }
    case 'mesPassado': return { de: ymd(new Date(y, m - 1, 1)), ate: ymd(new Date(y, m, 0)) }
    case '6meses':     return { de: ymd(new Date(y, m - 5, 1)), ate: ymd(new Date(y, m + 1, 0)) }
    case 'ano':        return { de: ymd(new Date(y, 0, 1)),     ate: ymd(new Date(y, 11, 31)) }
  }
}

const isStatusDefault = (s: string[]) => s.length === STATUS_DEFAULT.length && STATUS_DEFAULT.every((v) => s.includes(v))

export function ContratosPage() {
  const { data: contratos, isLoading } = useContratos()
  const { data: consultores } = useConsultores()
  const { data: allTags = [] } = useTags()
  const update = useUpdateContrato()
  const aplicarTagMassa = useAplicarTagEmMassa()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [open, setOpen] = useState(false)
  // Estado inicial hidratado da URL — sobrevive a F5 e ao voltar de um card.
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const [page, setPage] = useState(() => Number(searchParams.get('p')) || 1)
  const [filtros, setFiltros] = useState<Filtros>(() => ({
    estrategistaId: searchParams.get('estrat') ?? '',
    // Sem parâmetro → padrão "ativos". 'all' (ou vazio) → todos os status.
    status: ((): string[] => {
      const s = searchParams.get('status')
      if (s === null) return [...STATUS_DEFAULT]
      if (s === 'all' || s === '') return []
      return s.split(',').filter(Boolean)
    })(),
    produto: searchParams.get('produto') ?? '',
    valorMin: searchParams.get('vmin') ?? '',
    valorMax: searchParams.get('vmax') ?? '',
    de: searchParams.get('de') ?? '',
    ate: searchParams.get('ate') ?? '',
    tags: (searchParams.get('tags') ?? '').split(',').filter(Boolean),
    parcelas: searchParams.get('parc') ?? '',
  }))
  const [sort, setSort] = useState<SortKey>(() => {
    const s = searchParams.get('sort')
    return s && s in SORT_LABEL ? (s as SortKey) : SORT_PADRAO
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exportOpen, setExportOpen] = useState(false)

  const patchFiltro = (patch: Partial<Filtros>) => { setFiltros((f) => ({ ...f, ...patch })); setPage(1) }

  // Espelha o estado atual na URL (sem empilhar histórico).
  useEffect(() => {
    const p = new URLSearchParams()
    if (query) p.set('q', query)
    if (filtros.estrategistaId) p.set('estrat', filtros.estrategistaId)
    if (filtros.status.length === 0) p.set('status', 'all')
    else if (!isStatusDefault(filtros.status)) p.set('status', filtros.status.join(','))
    if (filtros.produto) p.set('produto', filtros.produto)
    if (filtros.valorMin) p.set('vmin', filtros.valorMin)
    if (filtros.valorMax) p.set('vmax', filtros.valorMax)
    if (filtros.de) p.set('de', filtros.de)
    if (filtros.ate) p.set('ate', filtros.ate)
    if (filtros.tags.length) p.set('tags', filtros.tags.join(','))
    if (filtros.parcelas) p.set('parc', filtros.parcelas)
    if (sort !== SORT_PADRAO) p.set('sort', sort)
    if (page > 1) p.set('p', String(page))
    setSearchParams(p, { replace: true })
  }, [query, filtros, sort, page, setSearchParams])

  const produtosUnicos = useMemo(() => {
    const set = new Set<string>()
    contratos?.forEach((c) => { if (c.produto_nome) set.add(c.produto_nome) })
    return Array.from(set).sort()
  }, [contratos])

  // Só quem realmente tem a função de estrategista (useConsultores traz também admin/gerente).
  const estrategistas = useMemo(() => (consultores ?? []).filter((c) => c.perfil === 'estrategista'), [consultores])

  const filtersActive = useMemo(() => Boolean(
    filtros.estrategistaId || filtros.produto || filtros.valorMin || filtros.valorMax ||
    filtros.de || filtros.ate || filtros.tags.length > 0 || filtros.parcelas ||
    (filtros.status.length > 0 && !isStatusDefault(filtros.status)),
  ), [filtros])

  const filtered = useMemo(() => {
    if (!contratos) return []
    const q = semAcento(query.trim())
    return contratos.filter((c) => {
      if (q && !semAcento(c.cliente_nome ?? '').includes(q)) return false
      if (filtros.estrategistaId && c.estrategista_id !== filtros.estrategistaId) return false
      if (filtros.status.length > 0 && !filtros.status.includes(c.status_secundario ?? c.status ?? '')) return false
      if (filtros.produto && c.produto_nome !== filtros.produto) return false
      if (filtros.valorMin && Number(c.valor_total) < Number(filtros.valorMin)) return false
      if (filtros.valorMax && Number(c.valor_total) > Number(filtros.valorMax)) return false
      if (filtros.tags.length > 0) {
        const ids = new Set((c.tags ?? []).map((t) => t.id))
        if (!filtros.tags.some((id) => ids.has(id))) return false
      }
      if (filtros.parcelas && Number(c.num_parcelas) !== Number(filtros.parcelas)) return false
      if (filtros.de && (c.data_fechamento?.slice(0, 10) ?? '') < filtros.de) return false
      if (filtros.ate && (c.data_fechamento?.slice(0, 10) ?? '') > filtros.ate) return false
      return true
    })
  }, [contratos, query, filtros])

  /**
   * Quantos contratos casam com a busca mas estão escondidos pelo filtro de status.
   * A lista abre filtrada em ATIVO + Não iniciado, então procurar por alguém com
   * contrato cancelado/pausado/concluído devolvia vazio — e parecia que a busca
   * por nome não funcionava.
   */
  const ocultosPorStatus = useMemo(() => {
    const q = semAcento(query.trim())
    if (!q || filtros.status.length === 0 || !contratos) return 0
    return contratos.filter((c) => {
      if (!semAcento(c.cliente_nome ?? '').includes(q)) return false
      return !filtros.status.includes(c.status_secundario ?? c.status ?? '')
    }).length
  }, [contratos, query, filtros.status])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' })
    const us = sort.lastIndexOf('_')
    const field = sort.slice(0, us)
    const dir = sort.slice(us + 1) as 'asc' | 'desc'
    const cmp = (a: Contrato, b: Contrato): number => {
      switch (field) {
        case 'nome':     return collator.compare(a.cliente_nome ?? '', b.cliente_nome ?? '')
        case 'produto':  return collator.compare(a.produto_nome ?? '', b.produto_nome ?? '')
        // Ordena pela mesma data que a coluna exibe; sem assinatura vai para o fim.
        case 'data': {
          const aa = a.data_assinatura ?? ''
          const ba = b.data_assinatura ?? ''
          if (!aa && !ba) return 0
          if (!aa) return dir === 'asc' ? 1 : -1
          if (!ba) return dir === 'asc' ? -1 : 1
          return aa.localeCompare(ba)
        }
        // Contrato sem data de pagamento vai para o fim da lista nos dois sentidos:
        // string vazia ordenaria antes de qualquer data e enterraria o que interessa.
        case 'pagamento': {
          const ap = a.data_pagamento ?? ''
          const bp = b.data_pagamento ?? ''
          if (!ap && !bp) return 0
          if (!ap) return dir === 'asc' ? 1 : -1
          if (!bp) return dir === 'asc' ? -1 : 1
          return ap.localeCompare(bp)
        }
        case 'valor':    return Number(a.valor_total ?? 0) - Number(b.valor_total ?? 0)
        case 'parcelas': return (a.num_parcelas ?? 0) - (b.num_parcelas ?? 0)
        case 'status':   return collator.compare(statusLabel(a.status_secundario ?? a.status), statusLabel(b.status_secundario ?? b.status))
        default:         return 0
      }
    }
    arr.sort((a, b) => (dir === 'asc' ? cmp(a, b) : -cmp(a, b)))
    return arr
  }, [filtered, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageItems = sorted.slice(pageStart, pageStart + PAGE_SIZE)

  // Soma dos valores dos contratos filtrados (mostrada no rodapé).
  const somaValores = useMemo(() => filtered.reduce((acc, c) => acc + Number(c.valor_total ?? 0), 0), [filtered])

  // Estado de ordenação para os cabeçalhos clicáveis.
  const sortUs = sort.lastIndexOf('_')
  const sortField = sort.slice(0, sortUs)
  const sortDir = sort.slice(sortUs + 1) as 'asc' | 'desc'
  const thSort = (campo: string) => ({
    active: sortField === campo,
    dir: (sortField === campo ? sortDir : null) as 'asc' | 'desc' | null,
    onClick: () => {
      const next = sortField === campo ? (sortDir === 'asc' ? 'desc' : 'asc') : (DEFAULT_DIR[campo] ?? 'asc')
      setSort(`${campo}_${next}` as SortKey); setPage(1)
    },
  })

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleSelectAllPage() {
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = pageItems.every((c) => next.has(c.id))
      if (allSelected) pageItems.forEach((c) => next.delete(c.id))
      else pageItems.forEach((c) => next.add(c.id))
      return next
    })
  }
  async function bulkStatus(novoStatus: string) {
    if (selected.size === 0) return
    if (!confirm(`Alterar status de ${selected.size} contratos para "${statusLabel(novoStatus)}"?`)) return
    for (const id of selected) {
      await update.mutateAsync({ id, status_secundario: novoStatus, status: statusPrimario(novoStatus) })
    }
    setSelected(new Set())
  }
  async function bulkTransferEstrategista(novoId: string) {
    if (selected.size === 0) return
    const nome = consultores?.find((c) => c.id === novoId)?.nome ?? '?'
    if (!confirm(`Transferir ${selected.size} contratos para "${nome}"?`)) return
    for (const id of selected) {
      await update.mutateAsync({ id, estrategista_id: novoId })
    }
    setSelected(new Set())
  }
  async function bulkAplicarTag(tagId: string) {
    if (selected.size === 0) return
    await aplicarTagMassa.mutateAsync({ contratoIds: [...selected], tagId })
    setSelected(new Set())
  }
  /** Nome do estrategista a partir do id — usado no CSV exportado. */
  const estrategistaNome = (id: string | null) =>
    id ? (consultores?.find((c) => c.id === id)?.nome ?? '') : ''

  // Reseta os filtros para o padrão (status "em andamento"), mantendo a busca.
  const resetFiltros = () => {
    setFiltros({ estrategistaId: '', status: [...STATUS_DEFAULT], produto: '', valorMin: '', valorMax: '', de: '', ate: '', tags: [], parcelas: '' })
    setPage(1)
  }
  // Limpa tudo, inclusive a busca.
  const limparTudo = () => { resetFiltros(); setQuery('') }
  const algumFiltro = filtersActive || !isStatusDefault(filtros.status) || Boolean(query)

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <PageHeader
        title="Contratos"
        description="Cadastro de contratos fechados que geram comissão."
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/contratos/novo')}
              className="flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus className="h-4 w-4" /> Novo contrato
            </button>
          </div>
        }
      />

      <ContratosTabs />

      <div className="glass-card p-4 sm:p-5 space-y-3">
        {/* Linha 1 — busca + ordenar/exportar/contador */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1) }}
              placeholder="Buscar pelo nome do cliente…"
              className="w-full rounded-full border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground sm:ml-auto">
            <Select value={sort} onValueChange={(v) => { setSort(v as SortKey); setPage(1) }}>
              <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full border-border text-xs text-muted-foreground [&>svg]:opacity-60">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <SelectValue>{SORT_LABEL[sort]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SORT_DROPDOWN.map((k) => (
                  <SelectItem key={k} value={k}>{SORT_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={() => setExportOpen(true)}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30"
            >
              <FileDown className="h-3.5 w-3.5" /> Exportar
            </button>
            <span className="whitespace-nowrap tabular-nums px-1 font-medium text-foreground">
              {filtered.length}
              {(query || filtersActive) && contratos && filtered.length !== contratos.length && (
                <span className="text-muted-foreground"> / {contratos.length}</span>
              )}
            </span>
          </div>
        </div>

        {/* Linha 2 — barra de filtros (estilo Linear/Notion) */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusFilterChip filtros={filtros} patch={patchFiltro} />
          <TagsFilterChip filtros={filtros} patch={patchFiltro} allTags={allTags} />
          <PickerFilterChip
            icon={<Users className="h-3.5 w-3.5" />} label="Estrategista"
            value={filtros.estrategistaId}
            valueLabel={estrategistas.find((c) => c.id === filtros.estrategistaId)?.nome}
            options={estrategistas.map((c) => ({ value: c.id, label: c.nome }))}
            onChange={(v) => patchFiltro({ estrategistaId: v })}
          />
          <PickerFilterChip
            icon={<Package className="h-3.5 w-3.5" />} label="Produto"
            value={filtros.produto}
            valueLabel={filtros.produto || undefined}
            options={produtosUnicos.map((p) => ({ value: p, label: p }))}
            onChange={(v) => patchFiltro({ produto: v })}
          />
          <ParcelasFilterChip filtros={filtros} patch={patchFiltro} />
          <PeriodoFilterChip filtros={filtros} patch={patchFiltro} />
          <ValorFilterChip filtros={filtros} patch={patchFiltro} />

          {algumFiltro && (
            <button
              onClick={limparTudo}
              className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Limpar tudo
            </button>
          )}
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
              <CheckSquare className="h-4 w-4" />
              {selected.size} selecionado{selected.size === 1 ? '' : 's'}
            </span>
            <span className="mx-0.5 h-4 w-px bg-primary/20" aria-hidden />

            <Select value="" onValueChange={(v) => { if (v) bulkStatus(v) }}>
              <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full border-border bg-background px-3 text-xs [&>svg]:opacity-60">
                <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Alterar status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPCOES.map((s) => <SelectItem key={s.valor} value={s.valor}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value="" onValueChange={(v) => { if (v) bulkTransferEstrategista(v) }}>
              <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full border-border bg-background px-3 text-xs [&>svg]:opacity-60">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Transferir p/" />
              </SelectTrigger>
              <SelectContent>
                {estrategistas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>

            <BulkTagButton allTags={allTags} onApply={bulkAplicarTag} />

            <button
              onClick={() => setSelected(new Set())}
              className="ml-auto inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Limpar seleção
            </button>
          </div>
        )}

        {/* A lista abre filtrada por status; sem este aviso, buscar um cliente com
            contrato cancelado devolvia vazio e parecia busca quebrada. */}
        {ocultosPorStatus > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <span className="text-foreground">
              <strong className="tabular-nums">{ocultosPorStatus}</strong>{' '}
              {ocultosPorStatus === 1 ? 'contrato corresponde' : 'contratos correspondem'} à sua
              busca, mas {ocultosPorStatus === 1 ? 'está' : 'estão'} fora do filtro de status.
            </span>
            <button
              type="button"
              onClick={() => patchFiltro({ status: [] })}
              className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Mostrar todos os status
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 shimmer rounded-lg" />)}</div>
        ) : !contratos || contratos.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nenhum contrato cadastrado.</p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nenhum contrato encontrado com os filtros atuais.</p>
        ) : (
          <div className="w-full">
            {/* table-fixed + larguras percentuais: a tabela se ajusta à tela em vez de
                empurrar scroll lateral. Todo conteúdo longo trunca. */}
            <table className="w-full table-fixed text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-left">
                  <Th className="w-8 pl-1">
                    <button onClick={toggleSelectAllPage} className="text-muted-foreground hover:text-foreground align-middle">
                      {pageItems.length > 0 && pageItems.every((c) => selected.has(c.id))
                        ? <CheckSquare className="h-4 w-4" />
                        : <Square className="h-4 w-4" />}
                    </button>
                  </Th>
                  {/* Colunas somem por ordem de importância conforme a tela encolhe —
                      sem isso, a nona coluna empurrava a tabela para o scroll lateral. */}
                  <Th><SortBtn {...thSort('nome')}>Cliente</SortBtn></Th>
                  {/* Larguras enxutas nas colunas do meio: o nome do cliente é o que
                      precisa de espaço, e o status fica encostado no fim da linha. */}
                  <Th className="hidden md:table-cell w-[14%]"><SortBtn {...thSort('produto')}>Produto</SortBtn></Th>
                  <Th className="hidden xl:table-cell w-[8%]"><SortBtn {...thSort('data')}>Assinatura</SortBtn></Th>
                  <Th className="hidden sm:table-cell w-[9%]"><SortBtn {...thSort('pagamento')}>Pagamento</SortBtn></Th>
                  <Th className="text-right w-[11%]"><SortBtn {...thSort('valor')} className="justify-end w-full">Valor</SortBtn></Th>
                  <Th className="hidden lg:table-cell text-center w-[7%]"><SortBtn {...thSort('parcelas')} className="justify-center w-full">Parcelas</SortBtn></Th>
                  <Th className="w-[12%] text-right"><SortBtn {...thSort('status')} className="justify-end w-full">Status</SortBtn></Th>
                  <Th className="w-8"></Th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c) => {
                  const valor = Number(c.valor_total)
                  return (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/contratos/${c.id}`)}
                      className="group cursor-pointer transition-colors hover:bg-muted/50 [&>td]:border-b [&>td]:border-border/60"
                    >
                      <td className="py-3 pl-1 pr-2 align-middle" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => toggleSelect(c.id)} className="text-muted-foreground hover:text-foreground align-middle">
                          {selected.has(c.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="py-3 pr-3 align-middle">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white', avatarCor(c.cliente_nome))}>
                            {inicial(c.cliente_nome)}
                          </span>
                          <div className="min-w-0">
                            {/* O nome encolhe e trunca; as tags não deformam (shrink-0)
                                — com table-fixed elas ficavam espremidas e tortas. */}
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-medium text-foreground">{c.cliente_nome}</span>
                              <span className="shrink-0 leading-none">
                                <RowTags contratoId={c.id} clienteNome={c.cliente_nome} tags={c.tags ?? []} />
                              </span>
                            </div>
                            {c.notion_numero && (
                              <div className="text-[11px] text-muted-foreground font-mono tabular-nums">#{c.notion_numero}</div>
                            )}
                            {/* O que as colunas escondidas diriam, junto do nome — para a
                                tela estreita não perder produto nem data de pagamento. */}
                            <div className="md:hidden text-[11px] text-muted-foreground truncate">
                              {c.produto_nome ?? 'sem produto'}
                              <span className="sm:hidden">
                                {' · '}
                                {c.data_pagamento ? fmtDataBR(c.data_pagamento) : 'sem pagamento'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell py-3 pr-3 align-middle text-muted-foreground truncate" title={c.produto_nome ?? undefined}>{c.produto_nome ?? '—'}</td>
                      {/* Assinatura é data_assinatura mesmo. Antes esta coluna exibia
                          data_fechamento (a data do contrato) sob o rótulo "Assinatura",
                          e contrato em rascunho aparecia como se tivesse sido assinado. */}
                      <td className="hidden xl:table-cell py-3 pr-3 align-middle text-muted-foreground whitespace-nowrap tabular-nums">{c.data_assinatura ? fmtDataBR(c.data_assinatura) : '—'}</td>
                      <td className="hidden sm:table-cell py-3 pr-3 align-middle text-muted-foreground whitespace-nowrap tabular-nums">{c.data_pagamento ? fmtDataBR(c.data_pagamento) : '—'}</td>
                      <td className={cn('py-3 pr-3 align-middle text-right font-medium tabular-nums', valor > 0 ? 'text-foreground' : 'text-muted-foreground')}>{fmtBRL(valor)}</td>
                      <td className="hidden lg:table-cell py-3 pr-3 align-middle text-center">
                        {isRecorrente(c) ? (
                          <span title="Cliente recorrente (6 parcelas ou mais)"
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium tabular-nums">
                            <Repeat className="h-3 w-3" /> {c.num_parcelas}x
                          </span>
                        ) : (
                          <span className="text-muted-foreground tabular-nums">{c.num_parcelas}x</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 align-middle overflow-hidden">
                        <div className="flex justify-end">
                          <StatusPill contratoId={c.id} value={c.status_secundario ?? c.status} />
                        </div>
                      </td>
                      <td className="py-3 pr-1 align-middle text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <DeleteBtn id={c.id} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {/* Rodapé fora da tabela: com colunas que somem por breakpoint, um tfoot
                com colSpan desalinharia do valor em quase toda largura de tela. */}
            <div className="flex items-center justify-between gap-3 pt-3 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{filtered.length}</span> contrato{filtered.length === 1 ? '' : 's'}
              </span>
              <span className="font-semibold text-foreground tabular-nums">{fmtBRL(somaValores)}</span>
            </div>
          </div>
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Mostrando {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} de {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3 text-sm tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Próxima página"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {open && <NovoContratoModal onClose={() => setOpen(false)} />}

      <ExportContratosDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        contratos={filtered}
        selecionados={selected}
        estrategistaNome={estrategistaNome}
        statusLabel={statusLabel}
      />
    </div>
  )
}

// Cabeçalho de coluna padronizado.
function Th({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <th className={cn('sticky top-0 z-10 bg-card border-b border-border pb-2.5 pt-1 pr-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', className)}>
      {children}
    </th>
  )
}

function SortBtn({ active, dir, onClick, className, children }: { active: boolean; dir: 'asc' | 'desc' | null; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn('inline-flex items-center gap-1 hover:text-foreground transition-colors', active && 'text-foreground', className)}>
      {children}
      {dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  )
}

function DeleteBtn({ id }: { id: string }) {
  const del = useDeleteContrato()
  return (
    <button onClick={() => { if (confirm('Excluir este contrato? As comissões previstas serão removidas.')) del.mutate(id) }}
      className="p-1.5 rounded-md hover:bg-danger-light text-muted-foreground hover:text-danger transition-colors" title="Excluir">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
/** Botão de ação em massa: escolher 1 tag e aplicar aos contratos selecionados. */
function BulkTagButton({ allTags, onApply }: { allTags: Tag[]; onApply: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  const termo = q.trim().toLowerCase()
  const lista = [...allTags]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .filter((t) => (termo ? t.nome.toLowerCase().includes(termo) : true))
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <TagIcon className="h-3.5 w-3.5 text-muted-foreground" /> Aplicar tag
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1.5 w-56 rounded-xl border border-border bg-popover p-2 shadow-xl">
            {allTags.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhuma tag criada.</p>
            ) : (
              <>
                <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-input bg-background px-2.5 py-1.5">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar tag…"
                    autoFocus
                    className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
                <div className="kanban-scroll max-h-56 space-y-0.5 overflow-y-auto">
                  {lista.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { onApply(t.id); setOpen(false) }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.cor }} />
                      <span className="truncate">{t.nome}</span>
                    </button>
                  ))}
                  {lista.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">Nada encontrado.</p>}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function StatusFilterChip({ filtros, patch }: { filtros: Filtros; patch: (p: Partial<Filtros>) => void }) {
  const isDefault = isStatusDefault(filtros.status)
  const valueLabel = isDefault
    ? 'Em andamento'
    : filtros.status.length === 0
      ? 'Todos'
      : filtros.status.length === 1
        ? statusLabel(filtros.status[0])
        : `${filtros.status.length} selecionados`
  const toggle = (v: string) => {
    const has = filtros.status.includes(v)
    patch({ status: has ? filtros.status.filter((s) => s !== v) : [...filtros.status, v] })
  }
  return (
    <FilterChip
      icon={<CircleDot className="h-3.5 w-3.5" />} label="Status" active={!isDefault} valueLabel={valueLabel}
      onClear={() => patch({ status: [...STATUS_DEFAULT] })} panelClass="w-60"
    >
      {() => (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPCOES.map((s) => {
              const on = filtros.status.includes(s.valor)
              return (
                <button key={s.valor} type="button" onClick={() => toggle(s.valor)}
                  className={cn('h-7 rounded-full border px-2.5 text-xs font-medium transition-colors',
                    on ? statusClasses(s.valor) : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30')}>
                  {s.label}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
            <button type="button" onClick={() => patch({ status: [] })}
              className={cn('h-7 rounded-full border px-2.5 text-xs font-medium transition-colors',
                filtros.status.length === 0 ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              Todos os status
            </button>
            <button type="button" onClick={() => patch({ status: [...STATUS_DEFAULT] })}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Padrão
            </button>
          </div>
        </div>
      )}
    </FilterChip>
  )
}

function TagsFilterChip({ filtros, patch, allTags }: { filtros: Filtros; patch: (p: Partial<Filtros>) => void; allTags: Tag[] }) {
  const toggle = (id: string) => {
    const has = filtros.tags.includes(id)
    patch({ tags: has ? filtros.tags.filter((t) => t !== id) : [...filtros.tags, id] })
  }
  const n = filtros.tags.length
  const valueLabel = n === 1 ? (allTags.find((t) => t.id === filtros.tags[0])?.nome ?? '1') : n > 1 ? `${n} tags` : undefined
  return (
    <FilterChip icon={<TagIcon className="h-3.5 w-3.5" />} label="Tags" active={n > 0} valueLabel={valueLabel}
      onClear={() => patch({ tags: [] })} panelClass="w-64">
      {() => (
        allTags.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma tag criada ainda.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => {
              const on = filtros.tags.includes(t.id)
              return (
                <button key={t.id} type="button" onClick={() => toggle(t.id)}
                  className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
                    on ? '' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30')}
                  style={on ? { backgroundColor: `${t.cor}1a`, color: t.cor, borderColor: `${t.cor}55` } : undefined}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.cor }} />
                  {t.nome}
                </button>
              )
            })}
          </div>
        )
      )}
    </FilterChip>
  )
}

function PickerFilterChip({
  icon, label, value, valueLabel, options, onChange,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  valueLabel?: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
}) {
  return (
    <FilterChip icon={icon} label={label} active={Boolean(value)} valueLabel={valueLabel}
      onClear={() => onChange('')} panelClass="w-60">
      {(close) => (
        <OptionPicker options={options} value={value} placeholder={`Todos`} onPick={(v) => { onChange(v); close() }} />
      )}
    </FilterChip>
  )
}

function ParcelasFilterChip({ filtros, patch }: { filtros: Filtros; patch: (p: Partial<Filtros>) => void }) {
  return (
    <FilterChip icon={<Hash className="h-3.5 w-3.5" />} label="Parcelas" active={Boolean(filtros.parcelas)}
      valueLabel={filtros.parcelas ? `${filtros.parcelas}x` : undefined} onClear={() => patch({ parcelas: '' })} panelClass="w-48">
      {() => (
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">Nº de parcelas exato</label>
          <input type="number" min="1" step="1" placeholder="ex.: 12" value={filtros.parcelas} autoFocus
            onChange={(e) => patch({ parcelas: e.target.value })} className={CHIP_INPUT} />
        </div>
      )}
    </FilterChip>
  )
}

function PeriodoFilterChip({ filtros, patch }: { filtros: Filtros; patch: (p: Partial<Filtros>) => void }) {
  const atalhoAtivo = (tipo: AtalhoPeriodo) => {
    const { de, ate } = periodoAtalho(tipo)
    return filtros.de === de && filtros.ate === ate
  }
  const mesAtual = (() => {
    if (!filtros.de || !filtros.ate) return ''
    const [y, m, d] = filtros.de.split('-')
    if (d !== '01') return ''
    const ult = new Date(Number(y), Number(m), 0).getDate()
    if (filtros.ate.slice(8, 10) !== String(ult).padStart(2, '0')) return ''
    if (filtros.ate.slice(0, 7) !== `${y}-${m}`) return ''
    return `${y}-${m}`
  })()
  const active = Boolean(filtros.de || filtros.ate)
  const valueLabel = active ? `${filtros.de ? fmtDataBR(filtros.de) : '…'} → ${filtros.ate ? fmtDataBR(filtros.ate) : '…'}` : undefined
  return (
    <FilterChip icon={<CalendarRange className="h-3.5 w-3.5" />} label="Período" active={active} valueLabel={valueLabel}
      onClear={() => patch({ de: '', ate: '' })} panelClass="w-72">
      {() => (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {([['mes', 'Este mês'], ['mesPassado', 'Mês passado'], ['6meses', '6 meses'], ['ano', 'Este ano']] as const).map(([tipo, lbl]) => (
              <button key={tipo} type="button" onClick={() => patch(periodoAtalho(tipo))}
                className={cn('h-7 rounded-full border px-3 text-xs font-medium transition-colors',
                  atalhoAtivo(tipo) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30')}>
                {lbl}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">De</label>
              <input type="date" value={filtros.de} onChange={(e) => patch({ de: e.target.value })} className={CHIP_INPUT} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Até</label>
              <input type="date" value={filtros.ate} onChange={(e) => patch({ ate: e.target.value })} className={CHIP_INPUT} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Mês inteiro</label>
            <input type="month" value={mesAtual} onChange={(e) => {
              const ym = e.target.value
              if (!ym) { patch({ de: '', ate: '' }); return }
              const [y, m] = ym.split('-').map(Number)
              patch({ de: ymd(new Date(y, m - 1, 1)), ate: ymd(new Date(y, m, 0)) })
            }} className={CHIP_INPUT} />
          </div>
        </div>
      )}
    </FilterChip>
  )
}

function ValorFilterChip({ filtros, patch }: { filtros: Filtros; patch: (p: Partial<Filtros>) => void }) {
  const active = Boolean(filtros.valorMin || filtros.valorMax)
  const valueLabel = active
    ? `${filtros.valorMin ? fmtBRL(Number(filtros.valorMin)) : '…'} – ${filtros.valorMax ? fmtBRL(Number(filtros.valorMax)) : '…'}`
    : undefined
  return (
    <FilterChip icon={<DollarSign className="h-3.5 w-3.5" />} label="Valor" active={active} valueLabel={valueLabel}
      onClear={() => patch({ valorMin: '', valorMax: '' })} panelClass="w-60">
      {() => (
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">Valor (R$)</label>
          <div className="flex items-center gap-1.5">
            <input type="number" step="0.01" placeholder="mín." value={filtros.valorMin} onChange={(e) => patch({ valorMin: e.target.value })} className={CHIP_INPUT} />
            <span className="text-xs text-muted-foreground">–</span>
            <input type="number" step="0.01" placeholder="máx." value={filtros.valorMax} onChange={(e) => patch({ valorMax: e.target.value })} className={CHIP_INPUT} />
          </div>
        </div>
      )}
    </FilterChip>
  )
}


function NovoContratoModal({ onClose }: { onClose: () => void }) {
  const create = useCreateContrato()
  const { data: clientes } = useClientesList()
  const { data: produtos } = useProdutosList()
  const { data: consultores } = useConsultores()
  const { data: prodCom } = useProdutosComissao()

  const [clienteId, setClienteId] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [produtoId, setProdutoId] = useState('')
  const [estrategistaId, setEstrategistaId] = useState('')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [valor, setValor] = useState('')
  const [parcelas, setParcelas] = useState('1')
  const [pct, setPct] = useState('0')
  const [obs, setObs] = useState('')

  const MANUAL = '__manual__'
  const NENHUM = '__nenhum__'

  function applyProduto(pid: string) {
    setProdutoId(pid)
    const pc = prodCom?.find((x) => x.produto_id === pid)
    if (pc) {
      setPct(String(pc.percentual_padrao))
      setParcelas(String(pc.parcelas_padrao))
    }
  }

  function applyCliente(cid: string) {
    setClienteId(cid)
    const c = clientes?.find((x) => x.id === cid)
    if (c) setClienteNome(c.nome)
  }

  async function submit() {
    if (!clienteNome || !estrategistaId || !valor) return
    const produto = produtos?.find((p) => p.id === produtoId)
    await create.mutateAsync({
      cliente_id: clienteId || null,
      cliente_nome: clienteNome,
      produto_id: produtoId || null,
      produto_nome: produto?.nome ?? null,
      estrategista_id: estrategistaId,
      data_fechamento: data,
      valor_total: Number(valor),
      num_parcelas: Number(parcelas),
      percentual_aplicado: Number(pct),
      status: 'ativo',
      observacoes: obs || null,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-lg glass-card p-5 space-y-4 bg-card my-auto">
        <div className="flex items-start justify-between">
          <h3 className="text-base font-bold text-foreground">Novo contrato</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Cliente (cadastrado)">
            <Select value={clienteId || MANUAL} onValueChange={(v) => v === MANUAL ? setClienteId('') : applyCliente(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={MANUAL}>— manual —</SelectItem>
                {clientes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Nome do cliente *">
            <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="Produto">
            <Select value={produtoId || NENHUM} onValueChange={(v) => v === NENHUM ? setProdutoId('') : applyProduto(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>—</SelectItem>
                {produtos?.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Estrategista *">
            <Select value={estrategistaId || NENHUM} onValueChange={(v) => setEstrategistaId(v === NENHUM ? '' : v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>—</SelectItem>
                {consultores?.filter((c) => c.perfil === 'estrategista').map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Data de assinatura *">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="Valor total (R$) *">
            <input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="Nº de parcelas">
            <input type="number" min="1" value={parcelas} onChange={(e) => setParcelas(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="% comissão">
            <input type="number" step="0.01" value={pct} onChange={(e) => setPct(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
        </div>

        <Field label="Observações">
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </Field>

        <div className="rounded-md bg-info-light p-3 text-xs text-info">
          Regra automática: contratos fechados <strong>até dia 15</strong> começam a pagar comissão no <strong>mês seguinte</strong>;
          fechados a partir do dia 16 começam <strong>dois meses depois</strong>.
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md text-sm border border-border hover:bg-muted">Cancelar</button>
          <button onClick={submit} disabled={create.isPending}
            className="px-3 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            Cadastrar
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}
