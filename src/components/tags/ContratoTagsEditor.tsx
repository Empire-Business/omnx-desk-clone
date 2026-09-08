import { useMemo, useRef, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { TagBadge } from './TagBadge'
import {
  useTags,
  useContratoTags,
  useCriarTag,
  useAplicarTag,
  useRemoverTagDoContrato,
  corParaTag,
  type Tag,
} from '@/hooks/useTags'

/**
 * Editor de tags de um contrato: tags aplicadas (chips removíveis) + um campo
 * para buscar/aplicar do catálogo ou criar uma nova na hora. Persiste na hora
 * (mutations dedicadas — não passa pelo form do contrato).
 */
export function ContratoTagsEditor({ contratoId }: { contratoId: string }) {
  const { data: doContrato = [] } = useContratoTags(contratoId)
  const { data: catalogo = [] } = useTags()
  const criar = useCriarTag()
  const aplicar = useAplicarTag()
  const remover = useRemoverTagDoContrato()

  const [busca, setBusca] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const idsAtuais = useMemo(() => new Set(doContrato.map((t) => t.id)), [doContrato])
  const termo = busca.trim().toLowerCase()

  const sugestoes = useMemo(
    () =>
      catalogo
        .filter((t) => !idsAtuais.has(t.id))
        .filter((t) => (termo ? t.nome.toLowerCase().includes(termo) : true))
        .slice(0, 24),
    [catalogo, idsAtuais, termo],
  )

  const existeExata = catalogo.some((t) => t.nome.toLowerCase() === termo)
  const podeCriar = termo.length > 0 && !existeExata
  const ocupado = criar.isPending || aplicar.isPending

  async function aplicarExistente(tag: Tag) {
    await aplicar.mutateAsync({ contratoId, tagId: tag.id })
    setBusca('')
    inputRef.current?.focus()
  }

  async function criarEAplicar() {
    if (!podeCriar || ocupado) return
    const tag = await criar.mutateAsync({ nome: busca.trim() })
    await aplicar.mutateAsync({ contratoId, tagId: tag.id })
    setBusca('')
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (podeCriar) criarEAplicar()
    else if (sugestoes.length >= 1) aplicarExistente(sugestoes[0])
  }

  return (
    <div className="space-y-4">
      {/* Aplicadas */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aplicadas</p>
        <div className="flex flex-wrap gap-1.5">
          {doContrato.length === 0 ? (
            <span className="text-sm text-muted-foreground">Nenhuma tag ainda.</span>
          ) : (
            doContrato.map((t) => (
              <TagBadge key={t.id} tag={t} onRemove={() => remover.mutate({ contratoId, tagId: t.id })} />
            ))
          )}
        </div>
      </div>

      {/* Buscar / criar */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 transition-shadow focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar ou criar tag…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {podeCriar && (
            <button
              type="button"
              onClick={criarEAplicar}
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-primary/50 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: corParaTag(busca.trim()) }} />
              Criar “{busca.trim()}”
            </button>
          )}
          {sugestoes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => aplicarExistente(t)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.cor }} />
              {t.nome}
            </button>
          ))}
          {sugestoes.length === 0 && !podeCriar && (
            <span className="text-xs text-muted-foreground">
              {termo ? 'Essa tag já está aplicada.' : 'Digite para criar a primeira tag.'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/** Botão discreto "+ tag" para acionar o editor (usado quando o contrato não tem tags). */
export function AddTagHint() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary">
      <Plus className="h-3 w-3" /> tag
    </span>
  )
}
