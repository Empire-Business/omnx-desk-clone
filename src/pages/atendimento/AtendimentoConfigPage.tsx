import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Check, Plus, Trash2, TriangleAlert, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { AtendimentoTabs } from '@/components/atendimento/AtendimentoTabs'
import { SelectDs } from '@/components/atendimento/TicketUi'
import {
  useAtendimentoTipos, useAtendimentoEtapas, useSalvarTipo, useSalvarEtapa, useExcluirEtapa,
  type AtendimentoEtapa, type AtendimentoTipo,
} from '@/hooks/useAtendimento'
import { usePermissoes } from '@/hooks/usePermissoes'
import { classeEtapa, CORES_ETAPA } from '@/lib/atendimento'
import { cn } from '@/lib/utils'
import { formatoAposentado } from '@/lib/formatosAtendimento'

/** Campo do DS; 16 px no celular para o iPhone não dar zoom ao tocar. */
const campo = 'input text-base sm:text-sm'

function EsqueletoItens() {
  return (
    <ul aria-hidden className="m-0 mt-4 grid list-none gap-3 p-0">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3">
          <span className="sk h-5 rounded-full" style={{ width: `${30 + i * 12}%` }} />
          <span className="sk ml-auto h-5 w-14 rounded-full" />
        </li>
      ))}
    </ul>
  )
}

/**
 * Configuração do app: tipos de solicitação e etapas do fluxo.
 *
 * Trocando esses dois conjuntos, o mesmo app serve empresas de serviços, uma
 * clínica ou um escritório sem mudar código.
 */
export function AtendimentoConfigPage() {
  const { can, carregando } = usePermissoes()

  if (carregando) return null
  if (!can('atendimento', 'admin')) return <Navigate to="/" replace />

  return (
    <PageContainer className="gap-5 md:gap-6">
      <PageHeader
        title="Configuração dos tickets"
        description="Defina as etapas pelas quais um ticket passa e os tipos de pedido que sua operação atende."
      />

      <AtendimentoTabs />

      {/* O ramo da empresa saiu daqui: é dado da conta, não deste app.
          Fica em Configurações → Ramo da empresa. O ponteiro existe porque
          quem já conhecia a tela viria procurar o seletor aqui. */}
      <p className="m-0 max-w-[72ch] text-sm text-muted-foreground">
        O ramo da empresa (Serviços, Clínica, Escritório) — que define os nomes, as abas e
        os indicadores — agora fica em{' '}
        <Link to="/configuracoes" className="font-semibold text-link hover:underline">
          Configurações → Ramo da empresa
        </Link>
        .
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <SecaoEtapas />
        <SecaoTipos />
      </div>
    </PageContainer>
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

  // Só leitura: avisa quando a configuração atrapalha resolver/reabrir e a
  // criação automática dos tickets do WhatsApp (que precisa de uma etapa aberta
  // e uma final).
  const lista = etapas ?? []
  const finais = lista.filter((e) => e.is_final).length
  const abertas = lista.length - finais
  const aviso = isLoading || lista.length === 0
    ? null
    : finais === 0
      ? 'Nenhuma etapa está marcada como final. Sem ela, nenhum ticket pode ser resolvido — nem à mão, nem pela Íris.'
      : abertas === 0
        ? 'Todas as etapas estão marcadas como final. É preciso ao menos uma etapa aberta para os tickets novos.'
        : finais > 1
          ? 'Há mais de uma etapa final. A Íris sempre usa a primeira; todas aparecem como "Resolvido" na tela.'
          : null

  return (
    <section className="min-w-0 rounded-lg border border-card-border bg-card p-4 md:p-5">
      <h2 className="t-h4 m-0 text-foreground">Etapas do ticket</h2>
      <p className="m-0 mt-1 text-sm text-muted-foreground">
        Viram as colunas do quadro, na ordem em que aparecem aqui. A etapa marcada como
        <strong className="font-semibold"> final</strong> é a que dá o ticket por resolvido. Mudar essa
        marcação muda na hora o status dos tickets que já estão na etapa.
      </p>
      {aviso && (
        <p role="alert" className="m-0 mt-3 flex items-start gap-2 rounded-md bg-warning-light px-3 py-2 text-sm text-foreground">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          {aviso}
        </p>
      )}

      {isLoading ? (
        <EsqueletoItens />
      ) : (
        <ul className="m-0 mt-4 list-none divide-y divide-stroke-weak p-0">
          {(etapas ?? []).map((etapa) => (
            <li key={etapa.id} className="flex min-h-11 items-center gap-2 py-1.5">
              <span
                className={cn(
                  'min-w-0 truncate rounded-full px-2 py-0.5 text-[12.5px] font-semibold',
                  classeEtapa(etapa.cor),
                )}
              >
                {etapa.nome}
              </span>

              <button
                type="button"
                onClick={() => marcarFinal(etapa)}
                aria-pressed={etapa.is_final}
                className={cn(
                  'ml-auto inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold transition-colors duration-fast focus-ds md:h-7 md:px-2.5',
                  etapa.is_final
                    ? 'bg-success-light text-success'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                title={
                  etapa.is_final
                    ? 'Esta etapa resolve o ticket. Clique para desmarcar.'
                    : 'Marcar como etapa que resolve o ticket'
                }
              >
                {etapa.is_final ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                Final
              </button>

              <button
                type="button"
                onClick={() => remover(etapa)}
                className="btn btn-ghost btn-icon btn-sm shrink-0 hover:bg-danger-light hover:text-danger"
                title={`Excluir ${etapa.nome}`}
                aria-label={`Excluir etapa ${etapa.nome}`}
              >
                <Trash2 aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {erro && (
        <p role="alert" className="m-0 mt-3 rounded-md bg-danger-light px-3 py-2 text-sm text-danger">{erro}</p>
      )}

      <form onSubmit={adicionar} className="mt-4 flex flex-wrap items-center gap-2">
        <input
          className={cn(campo, 'min-w-[140px] flex-1')}
          placeholder="Nova etapa (ex.: Roteiro)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-label="Nome da nova etapa"
        />
        <span className="w-32 shrink-0">
          <SelectDs value={cor} onChange={(e) => setCor(e.target.value)} aria-label="Cor da etapa">
            {CORES_ETAPA.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </SelectDs>
        </span>
        <button
          type="submit"
          disabled={salvar.isPending || !nome.trim()}
          className="btn btn-primary max-sm:w-full"
        >
          {salvar.isPending ? <span className="btn-spin" aria-hidden /> : <Plus aria-hidden />} Adicionar
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
    if (!nome.trim() || formatoAposentado(nome)) return
    const ordem = ((tipos ?? []).at(-1)?.ordem ?? 0) + 10
    salvar.mutate({ nome: nome.trim(), ordem }, { onSuccess: () => setNome('') })
  }

  // Tipo não se exclui, se desativa: demandas antigas continuam apontando para
  // ele, e apagar deixaria o histórico sem saber o que foi entregue.
  const alternar = (tipo: AtendimentoTipo) => salvar.mutate({ ...tipo, ativo: !tipo.ativo })

  // Formatos retirados nunca aparecem nos novos tickets, mesmo ativos no
  // banco; ficam separados para não parecerem opções disponíveis.
  const emUso = (tipos ?? []).filter((tipo) => !formatoAposentado(tipo.nome))
  const retirados = (tipos ?? []).filter((tipo) => formatoAposentado(tipo.nome))
  const nomeRetirado = formatoAposentado(nome)

  return (
    <section className="min-w-0 rounded-lg border border-card-border bg-card p-4 md:p-5">
      <h2 className="t-h4 m-0 text-foreground">Tipos de solicitação</h2>
      <p className="m-0 mt-1 text-sm text-muted-foreground">
        O que sua operação atende. Um tipo desativado some do formulário, mas continua
        aparecendo nos tickets antigos.
      </p>

      {isLoading ? (
        <EsqueletoItens />
      ) : (
        <ul className="m-0 mt-4 list-none divide-y divide-stroke-weak p-0">
          {emUso.map((tipo) => (
            <li key={tipo.id} className="flex min-h-11 items-center gap-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'm-0 truncate text-sm font-medium',
                    tipo.ativo ? 'text-foreground' : 'text-muted-foreground line-through',
                  )}
                >
                  {tipo.nome}
                </p>
                {tipo.descricao && (
                  <p className="m-0 truncate text-[12.5px] text-muted-foreground">{tipo.descricao}</p>
                )}
              </div>
              <button type="button" onClick={() => alternar(tipo)} className="btn btn-ghost btn-sm shrink-0">
                {tipo.ativo ? 'Desativar' : 'Reativar'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {retirados.length > 0 && (
        <details className="mt-3 rounded-md bg-bg-2 px-3 py-2 ring-hairline">
          <summary className="flex min-h-11 cursor-pointer items-center text-[12.5px] font-semibold text-muted-foreground md:min-h-0">
            Formatos retirados ({retirados.length})
          </summary>
          <p className="m-0 mt-2 text-[12.5px] text-muted-foreground">
            Não aparecem mais nos novos tickets. Continuam guardados só para que os
            tickets antigos mostrem o que foi pedido.
          </p>
          <ul className="m-0 mt-1 pl-4 text-[12.5px] text-muted-foreground">
            {retirados.map((tipo) => <li key={tipo.id}>{tipo.nome}</li>)}
          </ul>
        </details>
      )}

      <form onSubmit={adicionar} className="mt-4 flex flex-wrap items-center gap-2">
        <input
          className={cn(campo, 'min-w-[140px] flex-1')}
          placeholder="Novo tipo (ex.: Suporte técnico)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-label="Nome do novo tipo"
        />
        <button
          type="submit"
          disabled={salvar.isPending || !nome.trim() || nomeRetirado}
          className="btn btn-primary max-sm:w-full"
        >
          {salvar.isPending ? <span className="btn-spin" aria-hidden /> : <Plus aria-hidden />} Adicionar
        </button>
      </form>
      {nomeRetirado && (
        <p className="m-0 mt-1.5 text-[12.5px] text-muted-foreground">
          Esse formato foi retirado e não aparece nos novos tickets.
        </p>
      )}
    </section>
  )
}
