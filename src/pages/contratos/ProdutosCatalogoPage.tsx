import { useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Plus, Package, ChevronRight, Search, Upload, Download, Trash2, RefreshCw,
  FileText, FileSignature, Check, X,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ContratosTabs } from '@/components/contratos/ContratosTabs'
import { usePermissoes } from '@/hooks/usePermissoes'
import { cn } from '@/lib/utils'
import {
  useProdutosCatalogo,
  useCriarProdutoCatalogo,
  useAtualizarProdutoCatalogo,
  type ProdutoCatalogo,
} from '@/hooks/useProdutosCatalogo'
import {
  useContratoModelos,
  useUpsertModelo,
  useDeleteModelo,
  carregarModeloArquivo,
  type ContratoModelo,
} from '@/hooks/useContratoModelos'
import { arquivoParaBase64, baixarBlob } from '@/lib/gerarContratoDocx'

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Teto do .docx. O arquivo é gravado em base64 (infla ~34%) e o banco tem CHECK de 7 MB. */
const MAX_DOCX_BYTES = 5 * 1024 * 1024

/** Valida o arquivo escolhido; devolve a mensagem de erro ou null se estiver OK. */
function validarDocx(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.docx')) {
    return 'O modelo precisa ser um arquivo .docx (Word).'
  }
  if (file.size > MAX_DOCX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    return `O arquivo tem ${mb} MB e o limite é 5 MB. Reduza as imagens do documento e tente de novo.`
  }
  return null
}

const inp =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'

/** Baixa o .docx do modelo — do banco (base64) ou do modelo-base em /public. */
async function baixarModelo(m: ContratoModelo) {
  const arq = await carregarModeloArquivo(m.id)
  const nome = arq.arquivo_nome ?? 'modelo.docx'
  if (arq.arquivo_b64) {
    const bin = atob(arq.arquivo_b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    baixarBlob(new Blob([bytes], { type: MIME_DOCX }), nome)
  } else if (arq.arquivo_nome) {
    const res = await fetch(`/modelos-contrato/${arq.arquivo_nome}`)
    baixarBlob(await res.blob(), nome)
  }
}

export function ProdutosCatalogoPage() {
  const { can, carregando: carregandoPermissoes } = usePermissoes()
  // Fase 2: pergunta "pode neste recurso?" em vez de "qual e o perfil?".
  if (!carregandoPermissoes && !can('contratos', 'admin'))
    return <Navigate to="/contratos" replace />
  return <Catalogo />
}

function Catalogo() {
  const { data: produtos, isLoading } = useProdutosCatalogo()
  const { data: modelos } = useContratoModelos()
  const criar = useCriarProdutoCatalogo()

  const [busca, setBusca] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  // Modelos agrupados por produto (null = modelo padrão, vale pra todos).
  const modelosPorProduto = useMemo(() => {
    const m = new Map<string, ContratoModelo[]>()
    for (const mod of modelos ?? []) {
      const chave = mod.produto_id ?? 'PADRAO'
      const arr = m.get(chave) ?? []
      arr.push(mod)
      m.set(chave, arr)
    }
    return m
  }, [modelos])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (produtos ?? []).filter((p) => {
      if (!mostrarInativos && !p.ativo) return false
      if (q && !p.nome.toLowerCase().includes(q) && !(p.descricao ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [produtos, busca, mostrarInativos])

  const inativos = (produtos ?? []).filter((p) => !p.ativo).length

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault()
    const nome = novoNome.trim()
    if (!nome || criar.isPending) return
    const jaExiste = (produtos ?? []).some((p) => p.nome.trim().toLowerCase() === nome.toLowerCase())
    if (jaExiste) {
      alert(`Já existe um produto chamado "${nome}".`)
      return
    }
    const criado = await criar.mutateAsync({ nome })
    setNovoNome('')
    setAberto((criado as { id: string }).id)
  }

  return (
    <div className="animate-fade-in space-y-4 sm:space-y-6">
      <PageHeader
        title="Produtos"
        description="Catálogo de produtos da empresa. É esta lista que aparece nos contratos, no formulário de venda e no gerador de contrato. Abra um produto para ver e enviar os modelos .docx dele."
      />
      <ContratosTabs />

      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleCriar} className="flex items-center gap-2">
          <div className="flex w-64 items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring">
            <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Nome do novo produto…"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!novoNome.trim() || criar.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {criar.isPending ? 'Criando…' : 'Criar'}
          </button>
        </form>

        <div className="ml-auto flex items-center gap-2">
          {inativos > 0 && (
            <button
              type="button"
              onClick={() => setMostrarInativos((v) => !v)}
              className={cn(
                'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                mostrarInativos
                  ? 'border-primary/40 bg-primary/5 text-foreground'
                  : 'border-input bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {mostrarInativos ? 'Ocultar inativos' : `Mostrar inativos (${inativos})`}
            </button>
          )}
          <div className="flex w-56 items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto…"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {busca && (
              <button type="button" onClick={() => setBusca('')} className="shrink-0 text-muted-foreground hover:text-foreground" title="Limpar busca">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {criar.error && (
        <p className="rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-sm text-danger">
          Não foi possível criar o produto: {(criar.error as Error).message}
        </p>
      )}

      {/* Lista de produtos */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 shimmer rounded-xl" />)}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-2 px-4 py-12 text-center">
          <Package className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {busca ? 'Nenhum produto encontrado para esta busca.' : 'Nenhum produto no catálogo ainda. Crie o primeiro acima.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map((p) => (
            <ProdutoLinha
              key={p.id}
              produto={p}
              modelos={modelosPorProduto.get(p.id) ?? []}
              expandido={aberto === p.id}
              onToggle={() => setAberto((atual) => (atual === p.id ? null : p.id))}
            />
          ))}
        </div>
      )}

      {/* Modelo padrão — vale para qualquer produto que não tenha modelo próprio */}
      <ModeloPadrao
        modelos={modelosPorProduto.get('PADRAO') ?? []}
        expandido={aberto === 'PADRAO'}
        onToggle={() => setAberto((atual) => (atual === 'PADRAO' ? null : 'PADRAO'))}
      />
    </div>
  )
}

// ─── Uma linha do catálogo (expansível) ────────────────────────────────────────
function ProdutoLinha({
  produto, modelos, expandido, onToggle,
}: {
  produto: ProdutoCatalogo
  modelos: ContratoModelo[]
  expandido: boolean
  onToggle: () => void
}) {
  const atualizar = useAtualizarProdutoCatalogo()
  const [nome, setNome] = useState(produto.nome)
  const [descricao, setDescricao] = useState(produto.descricao ?? '')

  function salvarNome() {
    const limpo = nome.trim()
    if (limpo && limpo !== produto.nome) atualizar.mutate({ id: produto.id, nome: limpo })
    else setNome(produto.nome)
  }

  function salvarDescricao() {
    if ((descricao.trim() || null) !== (produto.descricao ?? null)) {
      atualizar.mutate({ id: produto.id, descricao })
    }
  }

  function alternarAtivo() {
    const aviso = produto.ativo
      ? `Desativar "${produto.nome}"? Ele some dos seletores de novos contratos e vendas, mas os ${produto.contratos} contrato(s) existentes continuam intactos.`
      : `Reativar "${produto.nome}"? Ele volta a aparecer nos seletores.`
    if (confirm(aviso)) atualizar.mutate({ id: produto.id, ativo: !produto.ativo })
  }

  return (
    <div className={cn('glass-card overflow-hidden transition-colors', expandido && 'ring-1 ring-primary/20')}>
      {/* Cabeçalho clicável */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expandido}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40 sm:px-4"
      >
        <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expandido && 'rotate-90')} />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-semibold', produto.ativo ? 'text-foreground' : 'text-muted-foreground line-through')}>
            {produto.nome}
          </span>
          {produto.descricao && <span className="block truncate text-xs text-muted-foreground">{produto.descricao}</span>}
        </span>

        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
          {produto.contratos} contrato{produto.contratos === 1 ? '' : 's'}
        </span>
        <span
          className={cn(
            'hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex',
            modelos.length > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <FileSignature className="h-3 w-3" />
          {modelos.length} modelo{modelos.length === 1 ? '' : 's'}
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            produto.ativo ? 'bg-success-light text-success' : 'bg-muted text-muted-foreground',
          )}
        >
          {produto.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </button>

      {/* Conteúdo expandido */}
      {expandido && (
        <div className="space-y-4 border-t border-border bg-muted/20 px-3 py-4 sm:px-4">
          {/* Dados do produto */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nome</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onBlur={salvarNome}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setNome(produto.nome)
                }}
                className={`${inp} w-full`}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Descrição</span>
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                onBlur={salvarDescricao}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setDescricao(produto.descricao ?? '')
                }}
                placeholder="Opcional…"
                className={`${inp} w-full`}
              />
            </label>
          </div>

          {/* Modelos do produto */}
          <ModelosDoProduto produtoId={produto.id} nomeProduto={produto.nome} modelos={modelos} />

          {/* Ativar / desativar */}
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground">
              {atualizar.isPending ? 'Salvando…' : 'As alterações de nome e descrição salvam sozinhas ao sair do campo.'}
            </p>
            <button
              type="button"
              onClick={alternarAtivo}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                produto.ativo
                  ? 'border-danger/30 text-danger hover:bg-danger-light'
                  : 'border-success/30 text-success hover:bg-success-light',
              )}
            >
              {produto.ativo ? 'Desativar produto' : 'Reativar produto'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Modelos .docx de um produto ───────────────────────────────────────────────
function ModelosDoProduto({
  produtoId, nomeProduto, modelos,
}: {
  produtoId: string | null
  nomeProduto: string
  modelos: ContratoModelo[]
}) {
  const upsert = useUpsertModelo()
  const del = useDeleteModelo()

  const substituirRef = useRef<HTMLInputElement>(null)
  const [substituindo, setSubstituindo] = useState<ContratoModelo | null>(null)

  const [adicionando, setAdicionando] = useState(false)
  const [variante, setVariante] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  /** Guarda o arquivo escolhido só se ele passar na validação. */
  function escolherArquivo(file: File | null) {
    if (!file) { setArquivo(null); setErro(null); return }
    const problema = validarDocx(file)
    setErro(problema)
    setArquivo(problema ? null : file)
  }

  async function handleSubstituir(file: File) {
    if (!substituindo) return
    const problema = validarDocx(file)
    if (problema) { setErro(problema); setSubstituindo(null); return }
    setErro(null)
    const b64 = await arquivoParaBase64(file)
    await upsert.mutateAsync({
      id: substituindo.id,
      produto_id: substituindo.produto_id,
      variante: substituindo.variante,
      titulo: substituindo.titulo,
      arquivo_nome: file.name,
      arquivo_b64: b64,
    })
    setSubstituindo(null)
  }

  async function handleAdicionar() {
    if (!arquivo || upsert.isPending) return
    const b64 = await arquivoParaBase64(arquivo)
    const v = variante.trim()
    await upsert.mutateAsync({
      produto_id: produtoId,
      variante: v || null,
      titulo: `${nomeProduto}${v ? ' — ' + v : ''}`,
      arquivo_nome: arquivo.name,
      arquivo_b64: b64,
    })
    setVariante('')
    setArquivo(null)
    setAdicionando(false)
  }

  async function handleExcluir(m: ContratoModelo) {
    if (!confirm(`Excluir o modelo "${m.titulo ?? m.arquivo_nome}"?`)) return
    await del.mutateAsync(m.id)
  }

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <FileSignature className="h-3.5 w-3.5" /> Modelos de contrato (.docx)
      </h4>

      {/* input escondido usado pelo botão Substituir */}
      <input
        ref={substituirRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSubstituir(f); e.target.value = '' }}
      />

      {erro && (
        <p className="rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-xs text-danger">{erro}</p>
      )}

      {modelos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
          Nenhum modelo próprio. Ao gerar um contrato deste produto, o sistema usa o modelo padrão.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
          {modelos.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{m.variante ?? 'Sem variante'}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{m.arquivo_nome ?? '—'}</span>
              </span>
              <span className="flex shrink-0 items-center">
                <button onClick={() => baixarModelo(m)} className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Baixar">
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setSubstituindo(m); substituirRef.current?.click() }}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                  title="Substituir arquivo"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleExcluir(m)}
                  className="rounded p-1.5 text-muted-foreground/60 transition-colors hover:bg-danger/10 hover:text-danger"
                  title="Excluir modelo"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Adicionar modelo */}
      {adicionando ? (
        <div className="space-y-2 rounded-lg border border-border bg-background p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={variante}
              onChange={(e) => setVariante(e.target.value)}
              placeholder="Variante (ex.: Anual) — opcional"
              className={`${inp} w-56`}
            />
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted">
              <Upload className="h-4 w-4" /> {arquivo ? arquivo.name : 'Escolher .docx'}
              <input type="file" accept=".docx" className="hidden" onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)} />
            </label>
            <button
              type="button"
              onClick={handleAdicionar}
              disabled={!arquivo || upsert.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> {upsert.isPending ? 'Enviando…' : 'Salvar modelo'}
            </button>
            <button
              type="button"
              onClick={() => { setAdicionando(false); setArquivo(null); setVariante(''); setErro(null) }}
              className="rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            O .docx deve conter as marcações <span className="font-mono">{'{cliente_nome}'}</span>,{' '}
            <span className="font-mono">{'{cpf_cnpj}'}</span>, <span className="font-mono">{'{endereco}'}</span>,{' '}
            <span className="font-mono">{'{email}'}</span>, <span className="font-mono">{'{whatsapp}'}</span> onde os dados devem entrar.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdicionando(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar modelo .docx
        </button>
      )}
    </div>
  )
}

// ─── Bloco do modelo padrão (produto_id NULL) ──────────────────────────────────
function ModeloPadrao({
  modelos, expandido, onToggle,
}: {
  modelos: ContratoModelo[]
  expandido: boolean
  onToggle: () => void
}) {
  return (
    <div className={cn('glass-card overflow-hidden transition-colors', expandido && 'ring-1 ring-primary/20')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expandido}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40 sm:px-4"
      >
        <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expandido && 'rotate-90')} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">Modelo padrão</span>
          <span className="block truncate text-xs text-muted-foreground">
            Usado por qualquer produto que não tenha modelo próprio.
          </span>
        </span>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            modelos.length > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <FileSignature className="h-3 w-3" />
          {modelos.length} modelo{modelos.length === 1 ? '' : 's'}
        </span>
      </button>
      {expandido && (
        <div className="border-t border-border bg-muted/20 px-3 py-4 sm:px-4">
          <ModelosDoProduto produtoId={null} nomeProduto="Padrão" modelos={modelos} />
        </div>
      )}
    </div>
  )
}
