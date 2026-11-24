import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { Plus, Trash2, Check, Tag as TagIcon, MoreHorizontal, GripVertical, X, Inbox, Search, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ContratosTabs } from '@/components/contratos/ContratosTabs'
import { usePermissoes } from '@/hooks/usePermissoes'
import { cn } from '@/lib/utils'
import { useContratos, type Contrato } from '@/hooks/useComissoes'
import {
  useTags,
  useCriarTag,
  useAtualizarTag,
  useDeletarTag,
  useAplicarTag,
  useAplicarTagEmMassa,
  useRemoverTagDoContrato,
  corParaTag,
  TAG_PALETTE,
  type Tag,
} from '@/hooks/useTags'

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Tira acentos para a busca casar do jeito que a pessoa digita: "jose" acha
 * "José", "goncalves" acha "Gonçalves". Mesma regra da lista de contratos.
 */
function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Iniciais do cliente para o avatar (primeiro + último nome). */
function iniciais(nome: string): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '—'
  const a = partes[0][0] ?? ''
  const b = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (a + b).toUpperCase()
}

// Opções de status (mesmo modelo da lista de contratos: gravado em status_secundario).
const STATUS_OPCOES = [
  { valor: 'Não iniciado', label: 'Não iniciado' },
  { valor: 'ATIVO', label: 'Ativo' },
  { valor: 'PAUSADO', label: 'Pausado' },
  { valor: 'INADIMPLENTE', label: 'Inadimplente' },
  { valor: 'CANCELADO', label: 'Cancelado' },
  { valor: 'CONCLUÍDO', label: 'Concluído' },
]

function statusLabel(valor: string): string {
  return STATUS_OPCOES.find((o) => o.valor === valor)?.label ?? valor
}

export function TagsAdminPage() {
  const { can, carregando: carregandoPermissoes } = usePermissoes()
  // Fase 2: pergunta "pode neste recurso?" em vez de "qual e o perfil?".
  if (!carregandoPermissoes && !can('contratos', 'admin'))
    return <Navigate to="/contratos" replace />
  return <TagsBoard />
}

// ─── Avatar do cliente ──────────────────────────────────────────────────────────
function Avatar({ nome, size = 28 }: { nome: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-background"
      style={{ width: size, height: size, backgroundColor: corParaTag(nome || 'x'), fontSize: size * 0.38 }}
      aria-hidden
    >
      {iniciais(nome)}
    </span>
  )
}

// ─── Board ────────────────────────────────────────────────────────────────────
function TagsBoard() {
  const { data: tags = [], isLoading: loadingTags } = useTags()
  const { data: contratos = [], isLoading: loadingContratos } = useContratos()
  const criar = useCriarTag()
  const aplicar = useAplicarTag()

  const [novo, setNovo] = useState('')
  const [ativo, setAtivo] = useState<Contrato | null>(null)
  const [busca, setBusca] = useState('')
  // "Ativo" já vem ligado por padrão.
  const [statusSel, setStatusSel] = useState<string[]>(['ATIVO'])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Aplica busca (nome do cliente) + filtro de status antes de agrupar.
  const contratosFiltrados = useMemo(() => {
    const q = semAcento(busca.trim())
    const statusUpper = statusSel.map((s) => s.toUpperCase())
    return contratos.filter((c) => {
      if (statusUpper.length > 0) {
        const st = (c.status_secundario ?? c.status ?? '').toUpperCase()
        if (!statusUpper.includes(st)) return false
      }
      if (q && !semAcento(c.cliente_nome ?? '').includes(q)) return false
      return true
    })
  }, [contratos, busca, statusSel])

  // Agrupa contratos por tag e separa os sem nenhuma tag.
  const { colunas, semTag } = useMemo(() => {
    const porTag = new Map<string, Contrato[]>()
    for (const t of tags) porTag.set(t.id, [])
    const sem: Contrato[] = []
    for (const c of contratosFiltrados) {
      const ts = c.tags ?? []
      if (ts.length === 0) {
        sem.push(c)
        continue
      }
      for (const t of ts) {
        const arr = porTag.get(t.id)
        if (arr) arr.push(c)
      }
    }
    // Colunas ordenadas: mais numerosas primeiro, depois por nome.
    const cols = tags
      .map((t) => ({ tag: t, itens: porTag.get(t.id) ?? [] }))
      .sort((a, b) => b.itens.length - a.itens.length || a.tag.nome.localeCompare(b.tag.nome, 'pt-BR'))
    return { colunas: cols, semTag: sem }
  }, [tags, contratosFiltrados])

  async function criarTag(e: React.FormEvent) {
    e.preventDefault()
    const nome = novo.trim()
    if (!nome || criar.isPending) return
    await criar.mutateAsync({ nome })
    setNovo('')
  }

  function handleDragStart(e: DragStartEvent) {
    setAtivo((e.active.data.current?.contrato as Contrato) ?? null)
  }

  async function handleDragEnd(e: DragEndEvent) {
    setAtivo(null)
    const { active, over } = e
    if (!over) return
    const c = active.data.current?.contrato as Contrato | undefined
    const tagId = String(over.id)
    if (!c) return
    // Já tem essa tag? Arrastar só adiciona — nunca remove da origem.
    if ((c.tags ?? []).some((t) => t.id === tagId)) return
    await aplicar.mutateAsync({ contratoId: c.id, tagId })
  }

  const carregando = loadingTags || loadingContratos
  const totalFiltrado = contratosFiltrados.length

  return (
    <div className="animate-fade-in space-y-4 sm:space-y-5">
      <PageHeader
        title="Etiquetas de contrato"
        description="Cada coluna é uma etiqueta. Arraste um contrato para uma coluna para aplicar a etiqueta."
      />
      <ContratosTabs />

      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Criar nova tag */}
        <form onSubmit={criarTag} className="flex items-center gap-2">
          <div className="flex w-full sm:w-52 items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring">
            <TagIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              placeholder="Nova tag…"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {novo.trim() && (
              <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-background" style={{ backgroundColor: corParaTag(novo.trim()) }} />
            )}
          </div>
          <button
            type="submit"
            disabled={!novo.trim() || criar.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Criar
          </button>
        </form>

        <div className="ml-auto flex items-center gap-2">
          {/* Contador */}
          <span className="hidden text-xs text-muted-foreground sm:inline">
            <strong className="tabular-nums text-foreground">{totalFiltrado}</strong> contrato{totalFiltrado === 1 ? '' : 's'}
          </span>
          {/* Busca */}
          <div className="flex w-full sm:w-60 items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pelo nome do cliente…"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {busca && (
              <button type="button" onClick={() => setBusca('')} className="shrink-0 text-muted-foreground hover:text-foreground" title="Limpar busca">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {/* Filtro de status */}
          <StatusFiltro value={statusSel} onChange={setStatusSel} />
        </div>
      </div>

      {carregando ? (
        <div className="flex gap-3 overflow-x-auto">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[70dvh] w-72 shrink-0 shimmer rounded-xl" />)}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="kanban-scroll flex gap-3 overflow-x-auto pb-3">
            <SemTagColuna itens={semTag} tags={tags} />
            {colunas.map(({ tag, itens }) => (
              <TagColuna key={tag.id} tag={tag} itens={itens} />
            ))}
            {colunas.length === 0 && (
              <div className="flex w-72 shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                <TagIcon className="h-6 w-6 opacity-40" />
                Nenhuma tag ainda.<br />Crie a primeira acima.
              </div>
            )}
          </div>
          <DragOverlay dropAnimation={null}>
            {ativo && (
              <div className="w-64 cursor-grabbing rounded-lg border border-primary/50 bg-card p-2.5 shadow-2xl ring-2 ring-primary/20">
                <div className="flex items-center gap-2">
                  <Avatar nome={ativo.cliente_nome ?? ''} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{ativo.cliente_nome}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{ativo.produto_nome ?? '—'}</p>
                  </div>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}

// ─── Filtro de status (multi-seleção) ──────────────────────────────────────────
function StatusFiltro({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [aberto, setAberto] = useState(false)

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  const label =
    value.length === 0 ? 'Todos os status' : value.length === 1 ? statusLabel(value[0]) : `${value.length} status`

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors',
          value.length > 0
            ? 'border-primary/40 bg-primary/5 text-foreground'
            : 'border-input bg-background text-foreground hover:bg-muted',
        )}
      >
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        {label}
        {value.length > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
            {value.length}
          </span>
        )}
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-full z-40 mt-1.5 w-52 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl">
            <button
              type="button"
              onClick={() => onChange([])}
              className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border">
                {value.length === 0 && <Check className="h-3 w-3 text-foreground" />}
              </span>
              Todos os status
            </button>
            {STATUS_OPCOES.map((o) => {
              const on = value.includes(o.valor)
              return (
                <button
                  key={o.valor}
                  type="button"
                  onClick={() => toggle(o.valor)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                    )}
                  >
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  {o.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Coluna "Sem tags" (fixa, com seleção em massa) ────────────────────────────
function SemTagColuna({ itens, tags }: { itens: Contrato[]; tags: Tag[] }) {
  const aplicarMassa = useAplicarTagEmMassa()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [escolher, setEscolher] = useState(false)

  const selecionados = itens.filter((c) => sel.has(c.id))
  const todosMarcados = itens.length > 0 && selecionados.length === itens.length

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTodos() {
    setSel(todosMarcados ? new Set() : new Set(itens.map((c) => c.id)))
  }

  async function aplicar(tag: Tag) {
    setEscolher(false)
    const ids = selecionados.map((c) => c.id)
    if (ids.length === 0) return
    await aplicarMassa.mutateAsync({ contratoIds: ids, tagId: tag.id })
    setSel(new Set())
  }

  return (
    <div className="md:sticky md:left-0 z-20 flex w-[85vw] max-w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[6px_0_16px_-8px_rgba(0,0,0,0.25)]">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Inbox className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold text-foreground">Sem tags</h3>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
            {itens.length}
          </span>
        </div>
        {itens.length > 0 && (
          <button
            type="button"
            onClick={toggleTodos}
            className="text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
          >
            {todosMarcados ? 'Limpar' : 'Selecionar todos'}
          </button>
        )}
      </div>

      {/* Barra de ação em massa */}
      {selecionados.length > 0 && (
        <div className="relative flex items-center justify-between gap-2 border-b border-primary/20 bg-primary/5 px-3 py-2">
          <span className="text-xs font-semibold text-foreground">{selecionados.length} selecionado(s)</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSel(new Set())}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => setEscolher((v) => !v)}
              disabled={aplicarMassa.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <TagIcon className="h-3 w-3" /> Aplicar tag
            </button>
          </div>
          {escolher && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setEscolher(false)} />
              <div className="absolute right-2 top-full z-40 mt-1 max-h-64 w-56 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-xl">
                {tags.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhuma tag criada.</p>
                ) : (
                  tags
                    .slice()
                    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => aplicar(t)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.cor }} />
                        <span className="truncate">{t.nome}</span>
                      </button>
                    ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="kanban-scroll flex-1 space-y-1 overflow-y-auto p-2" style={{ maxHeight: '70dvh' }}>
        {itens.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground/70">Todos os contratos já têm tag. 🎉</p>
        ) : (
          itens.map((c) => {
            const marcado = sel.has(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                aria-pressed={marcado}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                  marcado ? 'border-primary/50 bg-primary/10' : 'border-transparent bg-background hover:border-border hover:bg-muted/50',
                )}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                    marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                  )}
                >
                  {marcado && <Check className="h-3 w-3" />}
                </span>
                <Avatar nome={c.cliente_nome ?? ''} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium leading-tight text-foreground">{c.cliente_nome}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{c.produto_nome ?? '—'}</span>
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Coluna de uma tag ─────────────────────────────────────────────────────────
function TagColuna({ tag, itens }: { tag: Tag; itens: Contrato[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: tag.id })
  const total = itens.reduce((s, c) => s + Number(c.valor_total ?? 0), 0)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-[85vw] max-w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-muted/20 transition-all',
        isOver && 'border-primary/40 bg-primary/5 ring-2 ring-primary/20',
      )}
    >
      {/* Cabeçalho com a cor da tag */}
      <div
        className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5"
        style={{ backgroundColor: `${tag.cor}14`, borderTop: `3px solid ${tag.cor}` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background" style={{ backgroundColor: tag.cor }} />
          <h3 className="truncate text-sm font-semibold text-foreground" title={tag.descricao ?? undefined}>{tag.nome}</h3>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background/80 px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
            {itens.length}
          </span>
        </div>
        <ColunaMenu tag={tag} />
      </div>
      {total > 0 && (
        <div className="border-b border-border/40 px-3 py-1.5 text-[11px] tabular-nums text-muted-foreground">
          {fmtBRL(total)}
        </div>
      )}
      <div className="kanban-scroll flex-1 space-y-1.5 overflow-y-auto p-2" style={{ maxHeight: '70dvh', minHeight: 96 }}>
        {itens.length === 0 ? (
          <div className={cn(
            'flex h-24 items-center justify-center rounded-lg border-2 border-dashed text-center text-xs transition-colors',
            isOver ? 'border-primary/40 text-primary' : 'border-border/50 text-muted-foreground/60',
          )}>
            {isOver ? 'Solte aqui para aplicar' : 'Arraste contratos para cá'}
          </div>
        ) : (
          itens.map((c) => <CardContrato key={c.id} c={c} tagId={tag.id} />)
        )}
      </div>
    </div>
  )
}

// ─── Cartão de contrato (arrastável) ───────────────────────────────────────────
function CardContrato({ c, tagId }: { c: Contrato; tagId: string }) {
  const remover = useRemoverTagDoContrato()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${tagId}:${c.id}`,
    data: { contrato: c },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group relative rounded-lg border border-border/70 bg-card p-2.5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md',
        isDragging && 'opacity-30',
      )}
    >
      <div className="flex items-center gap-2">
        <Avatar nome={c.cliente_nome ?? ''} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{c.cliente_nome}</p>
          <p className="truncate text-[11px] text-muted-foreground">{c.produto_nome ?? '—'}</p>
        </div>
        {/* Alça de arraste — aparece no hover */}
        <button
          {...listeners}
          {...attributes}
          className="shrink-0 cursor-grab rounded p-0.5 text-muted-foreground/0 transition-colors hover:bg-muted hover:text-muted-foreground active:cursor-grabbing group-hover:text-muted-foreground/50"
          title="Arrastar para outra tag"
          aria-label="Arrastar contrato"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
          {fmtBRL(Number(c.valor_total ?? 0))}
        </span>
        <button
          type="button"
          onClick={() => remover.mutate({ contratoId: c.id, tagId })}
          className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground/0 transition-colors hover:bg-danger-light hover:text-danger group-hover:text-muted-foreground/60"
          title="Remover esta tag do contrato"
        >
          Remover
        </button>
      </div>
    </div>
  )
}

// ─── Menu de gestão da tag (cabeçalho da coluna) ───────────────────────────────
function ColunaMenu({ tag }: { tag: Tag }) {
  const atualizar = useAtualizarTag()
  const deletar = useDeletarTag()
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState(tag.nome)
  const [descricao, setDescricao] = useState(tag.descricao ?? '')

  function salvarNome() {
    const limpo = nome.trim()
    if (limpo && limpo !== tag.nome) atualizar.mutate({ id: tag.id, nome: limpo })
    else setNome(tag.nome)
  }

  function salvarDescricao() {
    if ((descricao.trim() || null) !== (tag.descricao ?? null)) atualizar.mutate({ id: tag.id, descricao })
  }

  function excluir() {
    const aviso = `Excluir a tag "${tag.nome}"? Ela será removida de todos os contratos que a usam.`
    if (confirm(aviso)) {
      setAberto(false)
      deletar.mutate(tag.id)
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
        title="Gerenciar tag"
        aria-label="Gerenciar tag"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-8 z-40 w-64 space-y-3 rounded-xl border border-border bg-popover p-3 shadow-xl">
            {/* Nome */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nome</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onBlur={salvarNome}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setNome(tag.nome)
                }}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
              />
            </div>

            {/* Cor */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cor</label>
              <div className="grid grid-cols-6 gap-1.5">
                {TAG_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => atualizar.mutate({ id: tag.id, cor: c })}
                    className="flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-transparent transition hover:ring-border"
                    style={{ backgroundColor: c }}
                    aria-label={`Cor ${c}`}
                  >
                    {c === tag.cor && <Check className="h-3.5 w-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Descrição</label>
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                onBlur={salvarDescricao}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setDescricao(tag.descricao ?? '')
                }}
                placeholder="Opcional…"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
              />
            </div>

            {/* Excluir */}
            <button
              type="button"
              onClick={excluir}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-danger/30 px-2 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger-light"
            >
              <Trash2 className="h-4 w-4" /> Excluir tag
            </button>
          </div>
        </>
      )}
    </div>
  )
}
