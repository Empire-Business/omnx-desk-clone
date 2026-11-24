import { useMemo } from 'react'
import { Users } from 'lucide-react'
import { PAPEIS } from '@/config/papeis'
import { RECURSOS, useTodasPermissoes, type AcaoPermissao } from '@/hooks/usePermissoes'

const ROTULO_ACAO: Record<AcaoPermissao, string> = {
  ver: 'ver',
  editar: 'editar',
  admin: 'administrar',
}

/**
 * Leitura (sem editar nada) de "quem é quem": cada papel, o que faz, o papel
 * parecido no OMNX Clients e as áreas que ele alcança hoje pela matriz abaixo.
 * Só lê `permissoes_app`; para mudar, use a matriz.
 */
export function PapeisResumo() {
  const { data: regras, isLoading } = useTodasPermissoes()

  const porPerfil = useMemo(() => {
    const m = new Map<string, Array<{ rotulo: string; acao: AcaoPermissao }>>()
    for (const r of regras ?? []) {
      const recurso = RECURSOS.find((x) => x.chave === r.recurso)
      if (!recurso || !r.acao) continue
      const lista = m.get(r.perfil) ?? []
      lista.push({ rotulo: recurso.label, acao: r.acao })
      m.set(r.perfil, lista)
    }
    return m
  }, [regras])

  return (
    <section aria-labelledby="papeis-titulo" className="mb-6 space-y-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Users className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div>
          <h3 id="papeis-titulo" className="text-sm font-semibold text-foreground">Papéis</h3>
          <p className="text-xs text-muted-foreground">
            Quem é quem no Desk e o papel parecido no OMNX Clients. Só leitura: as regras estão na matriz logo abaixo.
          </p>
        </div>
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {PAPEIS.map((p) => {
          const areas = porPerfil.get(p.perfil) ?? []
          return (
            <li key={p.perfil} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-[14px] font-semibold text-foreground">{p.rotulo}</b>
                <span className="tag" title="Papel parecido no OMNX Clients">Clients: {p.equivalenteClients}</span>
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">{p.descricao}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.perfil === 'admin' ? (
                  <span className="tag tag-success">Todas as áreas</span>
                ) : isLoading ? (
                  <span className="sk h-5 w-24" aria-hidden />
                ) : areas.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {p.emUso ? 'Nenhuma área liberada na matriz.' : 'Sem usuários hoje e sem áreas liberadas.'}
                  </span>
                ) : (
                  areas.map((a) => (
                    <span key={a.rotulo} className="tag">
                      {a.rotulo} · {ROTULO_ACAO[a.acao]}
                    </span>
                  ))
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
