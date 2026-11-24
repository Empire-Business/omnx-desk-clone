import { useMemo } from 'react'
import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useTodasPermissoes,
  useDefinirPermissao,
  PERFIS_EDITAVEIS,
  RECURSOS,
  type AcaoPermissao,
} from '@/hooks/usePermissoes'

/** Rótulo amigável de cada perfil (o valor cru vem de `users.perfil`). */
const PERFIL_LABEL: Record<string, string> = {
  gerente: 'Gestor',
  estrategista: 'Estrategista',
  atendimento: 'Atendimento',
  admin_cobranca: 'Gestor de cobrança',
  agente_chat: 'Atendente de conversas',
  agente_cobranca: 'Agente de cobrança',
  cliente: 'Cliente (portal)',
}

const OPCOES: Array<{ valor: AcaoPermissao | ''; label: string }> = [
  { valor: '', label: 'Sem acesso' },
  { valor: 'ver', label: 'Ver' },
  { valor: 'editar', label: 'Ver e editar' },
  { valor: 'admin', label: 'Administrar' },
]

/**
 * Matriz de permissões por app (Fase 2). Cada célula é o que aquele perfil pode
 * fazer naquele recurso. O perfil `admin` não aparece: tem curinga permanente,
 * que é o que impede um ajuste errado aqui trancar o dono da conta para fora.
 */
export function PermissoesMatriz() {
  const { data: regras, isLoading } = useTodasPermissoes()
  const definir = useDefinirPermissao()

  // (perfil, recurso) -> ação atual
  const atual = useMemo(() => {
    const m = new Map<string, AcaoPermissao>()
    for (const r of regras ?? []) m.set(`${r.perfil}|${r.recurso}`, r.acao)
    return m
  }, [regras])

  if (isLoading) {
    return <div className="h-64 shimmer rounded-xl" />
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ShieldCheck className="h-3.5 w-3.5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Permissões por app</h3>
          <p className="text-xs text-muted-foreground">
            O que cada tipo de usuário pode fazer em cada área. Vale para quem tem o perfil
            correspondente. Administradores enxergam tudo e não aparecem aqui.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2.5 text-left font-medium text-muted-foreground">
                Área
              </th>
              {PERFIS_EDITAVEIS.map((p) => (
                <th key={p} className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                  {PERFIL_LABEL[p] ?? p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {RECURSOS.map((r) => (
              <tr key={r.chave}>
                <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-foreground whitespace-nowrap">
                  {r.label}
                </td>
                {PERFIS_EDITAVEIS.map((p) => {
                  const valor = atual.get(`${p}|${r.chave}`) ?? ''
                  return (
                    <td key={p} className="px-3 py-2">
                      <select
                        value={valor}
                        disabled={definir.isPending}
                        onChange={(e) =>
                          definir.mutate({
                            perfil: p,
                            recurso: r.chave,
                            acao: (e.target.value || null) as AcaoPermissao | null,
                          })
                        }
                        className={cn(
                          'w-full rounded-lg border bg-background px-2 py-1.5 text-xs text-foreground',
                          'focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50',
                          valor ? 'border-input' : 'border-dashed border-border text-muted-foreground',
                        )}
                      >
                        {OPCOES.map((o) => (
                          <option key={o.valor} value={o.valor}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {definir.error && (
        <p className="rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-xs text-danger">
          Não foi possível salvar: {(definir.error as Error).message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        A mudança vale no próximo carregamento da tela de quem for afetado.
      </p>
    </div>
  )
}
