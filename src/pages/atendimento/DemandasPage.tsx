import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Headphones, Loader2, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { AtendimentoTabs } from '@/components/atendimento/AtendimentoTabs'
import { DemandaForm } from '@/components/atendimento/DemandaForm'
import { useClientes } from '@/hooks/useClientes'
import { useUsers } from '@/hooks/useUsers'
import {
  useDemandas,
  useAtendimentoEtapas,
  useSegmentoAtendimento,
  type FiltrosDemanda,
  type Prioridade,
} from '@/hooks/useAtendimento'
import { usePermissoes } from '@/hooks/usePermissoes'
import {
  classeEtapa, CLASSE_APROVACAO, CLASSE_PRAZO, CLASSE_PRIORIDADE,
  ROTULO_APROVACAO, ROTULO_PRIORIDADE, situacaoPrazo, textoPrazo,
} from '@/lib/atendimento'
import { cn } from '@/lib/utils'

const campo =
  'rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

/** Lista de demandas com busca e filtros. É a tela de "achar aquela demanda". */
export function DemandasPage() {
  const [filtros, setFiltros] = useState<FiltrosDemanda>({ situacao: 'abertas' })
  const [busca, setBusca] = useState('')
  const [novaAberta, setNovaAberta] = useState(false)

  const { data: demandas, isLoading, isError } = useDemandas({ ...filtros, busca })
  const { data: etapas } = useAtendimentoEtapas()
  const { data: clientes } = useClientes()
  const { data: usuarios } = useUsers()
  const { can } = usePermissoes()
  const { segmento } = useSegmentoAtendimento()

  const podeEditar = can('atendimento', 'editar')
  const tituloLista = segmento.rotuloItens.charAt(0).toUpperCase() + segmento.rotuloItens.slice(1)
  const temFiltro =
    Boolean(busca) ||
    Boolean(filtros.etapaId || filtros.clienteId || filtros.responsavelId || filtros.prioridade) ||
    filtros.situacao !== 'abertas'

  const set = (patch: Partial<FiltrosDemanda>) => setFiltros((f) => ({ ...f, ...patch }))

  return (
    <div className="space-y-6">
      <PageHeader
        title={tituloLista}
        description={`Tudo que foi pedido, com prazo e responsável. Busque por título, código ou pelo nome do ${segmento.rotuloCliente}.`}
        action={
          podeEditar && (
            <button
              onClick={() => setNovaAberta(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {segmento.acaoNovo}
            </button>
          )
        }
      />

      <AtendimentoTabs />

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={cn(campo, 'w-full pl-9')}
            placeholder={`Buscar por título, código (${segmento.prefixoCodigo}-00012) ou descrição`}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar demandas"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />

          <select
            className={campo}
            value={filtros.situacao ?? 'abertas'}
            onChange={(e) => set({ situacao: e.target.value as FiltrosDemanda['situacao'] })}
            aria-label="Situação"
          >
            <option value="abertas">Em aberto</option>
            <option value="concluidas">Concluídas</option>
            <option value="todas">Todas</option>
          </select>

          <select
            className={campo}
            value={filtros.etapaId ?? ''}
            onChange={(e) => set({ etapaId: e.target.value || undefined })}
            aria-label="Etapa"
          >
            <option value="">Todas as etapas</option>
            {(etapas ?? []).map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>

          <select
            className={campo}
            value={filtros.clienteId ?? ''}
            onChange={(e) => set({ clienteId: e.target.value || undefined })}
            aria-label="Cliente"
          >
            <option value="">Todos os {segmento.rotuloCliente}s</option>
            {(clientes ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>

          <select
            className={campo}
            value={filtros.responsavelId ?? ''}
            onChange={(e) => set({ responsavelId: e.target.value || undefined })}
            aria-label="Responsável"
          >
            <option value="">Todos os responsáveis</option>
            {(usuarios ?? []).filter((u) => u.ativo).map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>

          <select
            className={campo}
            value={filtros.prioridade ?? ''}
            onChange={(e) => set({ prioridade: (e.target.value || undefined) as Prioridade })}
            aria-label="Prioridade"
          >
            <option value="">Todas as prioridades</option>
            {(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => (
              <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>
            ))}
          </select>

          {temFiltro && (
            <button
              onClick={() => {
                setFiltros({ situacao: 'abertas' })
                setBusca('')
              }}
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Não foi possível carregar as demandas.
        </div>
      )}

      {!isLoading && !isError && (demandas ?? []).length === 0 && (
        <EmptyState
          icon={Headphones}
          title={
            temFiltro
              ? `Nenhuma ${segmento.rotuloItem} com esses filtros`
              : `Nenhuma ${segmento.rotuloItem} ainda`
          }
          description={
            temFiltro
              ? 'Tente limpar os filtros ou buscar por outro termo.'
              : segmento.textoVazio
          }
          action={
            temFiltro ? (
              <button
                onClick={() => {
                  setFiltros({ situacao: 'abertas' })
                  setBusca('')
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                Limpar filtros
              </button>
            ) : (
              podeEditar && (
                <button
                  onClick={() => setNovaAberta(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <Plus className="h-4 w-4" /> {segmento.acaoNovo}
                </button>
              )
            )
          }
        />
      )}

      {!isLoading && !isError && (demandas ?? []).length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {(demandas ?? []).map((d) => {
            const situacao = situacaoPrazo(d)
            return (
              <li key={d.id}>
                <Link
                  to={`/atendimento/demandas/${d.id}`}
                  className="flex flex-col gap-2 p-4 hover:bg-muted/40 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{d.codigo}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-medium',
                          CLASSE_PRIORIDADE[d.prioridade],
                        )}
                      >
                        {ROTULO_PRIORIDADE[d.prioridade]}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-medium text-foreground">{d.titulo}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.cliente?.nome ?? 'Sem cliente'}
                      {d.tipo?.nome ? ` · ${d.tipo.nome}` : ''}
                      {d.responsavel?.nome ? ` · ${d.responsavel.nome}` : ' · sem responsável'}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {d.aprovacao !== 'nao_enviado' && (
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-medium',
                          CLASSE_APROVACAO[d.aprovacao],
                        )}
                      >
                        {ROTULO_APROVACAO[d.aprovacao]}
                      </span>
                    )}
                    {d.etapa && (
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-medium',
                          classeEtapa(d.etapa.cor),
                        )}
                      >
                        {d.etapa.nome}
                      </span>
                    )}
                    <span className={cn('text-xs', CLASSE_PRAZO[situacao])}>{textoPrazo(d)}</span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <DemandaForm open={novaAberta} onClose={() => setNovaAberta(false)} />
    </div>
  )
}
