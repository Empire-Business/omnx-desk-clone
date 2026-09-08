import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Check, Loader2, Plus, Trash2, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { AtendimentoTabs } from '@/components/atendimento/AtendimentoTabs'
import {
  useAtendimentoTipos, useAtendimentoEtapas, useSalvarTipo, useSalvarEtapa, useExcluirEtapa,
  type AtendimentoEtapa, type AtendimentoTipo,
} from '@/hooks/useAtendimento'
import { usePermissoes } from '@/hooks/usePermissoes'
import { classeEtapa, CORES_ETAPA } from '@/lib/atendimento'
import { cn } from '@/lib/utils'

const campo =
  'rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

/**
 * Configuração do app: tipos de solicitação e etapas do fluxo.
 *
 * É aqui que o app deixa de ser "só para social media": trocando esses dois
 * conjuntos, o mesmo app serve uma clínica ou um escritório sem mudar código.
 */
export function AtendimentoConfigPage() {
  const { can, carregando } = usePermissoes()

  if (carregando) return null
  if (!can('atendimento', 'admin')) return <Navigate to="/atendimento" replace />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuração do Atendimento"
        description="Defina as etapas do fluxo de trabalho e os tipos de solicitação que sua operação atende."
      />

      <AtendimentoTabs />

      {/* O ramo da empresa saiu daqui: é dado da conta, não deste app.
          Fica em Configurações → Ramo da empresa. O ponteiro existe porque
          quem já conhecia a tela viria procurar o seletor aqui. */}
      <p className="text-sm text-muted-foreground">
        O ramo da empresa (Social Media, Clínica, Escritório) — que define os nomes, as abas e
        os indicadores — agora fica em{' '}
        <Link to="/configuracoes" className="font-medium text-primary hover:underline">
          Configurações → Ramo da empresa
        </Link>
        .
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <SecaoEtapas />
        <SecaoTipos />
      </div>
    </div>
  )
}

function SecaoEtapas() {
  const { data: etapas, isLoading } = useAtendimentoEtapas()
  const salvar = useSalvarEtapa()
  const excluir = useExcluirEtapa()

  const [nome, setNome] = useState('')
  const [cor, setCor] = useState('slate')
  const [erro, setErro] = useState<string | null>(null)

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    const ordem = ((etapas ?? []).at(-1)?.ordem ?? 0) + 10
    salvar.mutate(
      { nome: nome.trim(), cor, ordem, is_final: false },
      {
        onSuccess: () => { setNome(''); setCor('slate') },
        onError: (err) => setErro(err instanceof Error ? err.message : 'Não foi possível salvar.'),
      },
    )
  }

  const remover = (etapa: AtendimentoEtapa) => {
    setErro(null)
    excluir.mutate(etapa.id, {
      onError: (err) => setErro(err instanceof Error ? err.message : 'Não foi possível excluir.'),
    })
  }

  const marcarFinal = (etapa: AtendimentoEtapa) =>
    salvar.mutate({ ...etapa, is_final: !etapa.is_final })

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-display text-base font-semibold text-foreground">Etapas do fluxo</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Viram as colunas do kanban, na ordem em que aparecem aqui. A etapa marcada como
        <strong className="font-medium"> final</strong> é a que dá a demanda por entregue.
      </p>

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {(etapas ?? []).map((etapa) => (
            <li key={etapa.id} className="flex items-center gap-2 py-2">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  classeEtapa(etapa.cor),
                )}
              >
                {etapa.nome}
              </span>

              <button
                onClick={() => marcarFinal(etapa)}
                className={cn(
                  'ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
                  etapa.is_final
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground hover:bg-muted',
                )}
                title={
                  etapa.is_final
                    ? 'Esta etapa encerra a demanda. Clique para desmarcar.'
                    : 'Marcar como etapa que encerra a demanda'
                }
              >
                {etapa.is_final ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                Final
              </button>

              <button
                onClick={() => remover(etapa)}
                className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title={`Excluir ${etapa.nome}`}
                aria-label={`Excluir etapa ${etapa.nome}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {erro && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
      )}

      <form onSubmit={adicionar} className="mt-4 flex flex-wrap items-center gap-2">
        <input
          className={cn(campo, 'flex-1 min-w-[140px]')}
          placeholder="Nova etapa (ex.: Roteiro)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-label="Nome da nova etapa"
        />
        <select
          className={campo}
          value={cor}
          onChange={(e) => setCor(e.target.value)}
          aria-label="Cor da etapa"
        >
          {CORES_ETAPA.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={salvar.isPending || !nome.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </form>
    </section>
  )
}

function SecaoTipos() {
  const { data: tipos, isLoading } = useAtendimentoTipos()
  const salvar = useSalvarTipo()

  const [nome, setNome] = useState('')

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault()
    const ordem = ((tipos ?? []).at(-1)?.ordem ?? 0) + 10
    salvar.mutate({ nome: nome.trim(), ordem }, { onSuccess: () => setNome('') })
  }

  // Tipo não se exclui, se desativa: demandas antigas continuam apontando para
  // ele, e apagar deixaria o histórico sem saber o que foi entregue.
  const alternar = (tipo: AtendimentoTipo) => salvar.mutate({ ...tipo, ativo: !tipo.ativo })

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-display text-base font-semibold text-foreground">
        Tipos de solicitação
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        O que sua operação entrega. Um tipo desativado some do formulário, mas continua
        aparecendo nas demandas antigas.
      </p>

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {(tipos ?? []).map((tipo) => (
            <li key={tipo.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-sm font-medium',
                    tipo.ativo ? 'text-foreground' : 'text-muted-foreground line-through',
                  )}
                >
                  {tipo.nome}
                </p>
                {tipo.descricao && (
                  <p className="truncate text-xs text-muted-foreground">{tipo.descricao}</p>
                )}
              </div>
              <button
                onClick={() => alternar(tipo)}
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
              >
                {tipo.ativo ? 'Desativar' : 'Reativar'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={adicionar} className="mt-4 flex flex-wrap items-center gap-2">
        <input
          className={cn(campo, 'flex-1 min-w-[140px]')}
          placeholder="Novo tipo (ex.: Podcast)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-label="Nome do novo tipo"
        />
        <button
          type="submit"
          disabled={salvar.isPending || !nome.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </form>
    </section>
  )
}
