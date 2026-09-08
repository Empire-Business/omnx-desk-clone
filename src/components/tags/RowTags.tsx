import { useState } from 'react'
import { X } from 'lucide-react'
import { TagBadge } from './TagBadge'
import { ContratoTagsEditor, AddTagHint } from './ContratoTagsEditor'
import type { Tag } from '@/hooks/useTags'

/**
 * Tags compactas na linha da lista: até `max` chips + indicador "+N".
 * Sem tags, mostra um "+ tag" discreto (visível no hover da linha).
 * Clicar abre um popover ancorado no chip com o editor completo.
 * O popover NÃO fecha ao clicar fora nem ao rolar a tela — só pelo X interno.
 * Todos os cliques param a propagação para não navegar até o contrato.
 */
export function RowTags({
  contratoId,
  tags,
}: {
  contratoId: string
  /** Mantido por compatibilidade com quem já passa o nome; não é mais usado. */
  clienteNome?: string
  tags: Tag[]
  /** Mantido por compatibilidade; a exibição agora é sempre em pilha. */
  max?: number
}) {
  const [open, setOpen] = useState(false)
  // Tags chegam da mais antiga para a mais recente: a 1ª (mais antiga) fica na
  // frente; as demais espiam atrás, como um baralho. No fim, o total.
  const [frente, ...atras] = tags
  const paginas = atras.slice(0, 3)

  return (
    <div className="relative inline-flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="group/tags inline-flex shrink-0 items-center gap-1.5 align-middle"
        title="Gerenciar tags"
      >
        {tags.length === 0 ? (
          <span className="opacity-0 transition-opacity group-hover:opacity-100">
            <AddTagHint />
          </span>
        ) : (
          <>
            <span className="relative inline-flex items-center">
              {/* tag mais antiga, na frente — fundo sólido tapa os pills de trás */}
              <span className="relative z-20 rounded-full bg-background drop-shadow-sm">
                <TagBadge tag={frente} />
              </span>
              {/* baralho: as próximas espiam à direita e se abrem no hover */}
              {paginas.map((t, i) => (
                <span
                  key={t.id}
                  title={t.nome}
                  className="-ml-2.5 h-[18px] w-[18px] rounded-full shadow-sm ring-2 ring-background transition-[margin] duration-200 ease-out group-hover/tags:ml-0.5"
                  style={{ backgroundColor: t.cor, zIndex: 19 - i }}
                  aria-hidden
                />
              ))}
            </span>
            {tags.length > 1 && (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-muted px-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {tags.length}
              </span>
            )}
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-border bg-popover p-3 text-left shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tags</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Fechar"
              aria-label="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ContratoTagsEditor contratoId={contratoId} />
        </div>
      )}
    </div>
  )
}
