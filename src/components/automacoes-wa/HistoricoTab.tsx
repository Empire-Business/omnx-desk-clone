import { useState } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useWaAutoEnvios, type WaAutoEnvio } from '@/hooks/useAutomacoesWa'
import { ENVIADO_POR, formataDataCurta, formataTelefoneExibicao, traduzErroEnvio } from '@/lib/automacoesWa'
import { cn } from '@/lib/utils'
import { TabelaResponsiva } from '@/components/ui/TabelaResponsiva'
import {
  Esqueleto,
} from './comum'
import { foco } from './estilos'

const TIPO: Record<WaAutoEnvio['tipo'], string> = {
  relatorio_diario: 'Relatório diário',
  resumo_semanal: 'Resumo semanal',
  agendamento_link: 'Link da reunião',
  teste: 'Teste',
}
const STATUS: Record<WaAutoEnvio['status'], string> = {
  pendente: 'Na fila', enviado: 'Enviado', falhou: 'Falhou', simulado: 'Prévia (não enviada)',
}

type Filtro = 'todos' | WaAutoEnvio['tipo']
const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'relatorio_diario', rotulo: 'Relatório' },
  { valor: 'resumo_semanal', rotulo: 'Resumo' },
  { valor: 'agendamento_link', rotulo: 'Links' },
  { valor: 'teste', rotulo: 'Testes' },
]

export function HistoricoTab() {
  const { data, isLoading, isError } = useWaAutoEnvios()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [verPrevias, setVerPrevias] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <span className="sr-only" role="status">Carregando…</span>
        {[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-10 w-full" />)}
      </div>
    )
  }
  if (isError) return <p role="alert" className="text-sm text-danger">Não foi possível carregar o histórico.</p>

  const linhas = (data ?? [])
    .filter((e) => verPrevias || e.status !== 'simulado')
    .filter((e) => filtro === 'todos' || e.tipo === filtro)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-1">
          {FILTROS.map((f) => (
            <button key={f.valor} type="button" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}
              className={cn('inline-flex min-h-11 items-center rounded-full border px-3 text-[13px] font-medium transition-colors duration-fast md:min-h-8', foco,
                filtro === f.valor ? 'border-iris bg-iris-light text-iris-fg' : 'border-border text-muted-foreground hover:text-foreground')}>
              {f.rotulo}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={verPrevias} onChange={(e) => setVerPrevias(e.target.checked)} className={foco} />
          Mostrar prévias
        </label>
      </div>

      {linhas.length === 0 ? (
        <EmptyState title="Nenhum envio por aqui"
          description={filtro === 'todos'
            ? 'Quando as automações começarem a enviar, cada mensagem aparece aqui.'
            : 'Nenhum envio deste tipo ainda. Escolha “Todos” para ver os outros.'} />
      ) : (
        <TabelaResponsiva
          rotulo="Últimos 50 envios da Íris"
          linhas={linhas}
          chave={(e) => String(e.id)}
          colunas={[
            { id: 'quando', titulo: 'Quando', principal: true, celula: (e) => formataDataCurta(e.created_at) },
            { id: 'tipo', titulo: 'Tipo', celula: (e) => TIPO[e.tipo] ?? e.tipo },
            { id: 'para', titulo: 'Para', celula: (e) => e.destino_nome || formataTelefoneExibicao(e.destino) },
            { id: 'por', titulo: 'Enviado por', celula: (e) => ENVIADO_POR[e.provider] ?? e.provider },
            {
              id: 'situacao', titulo: 'Situação',
              celula: (e) => (
                <span className={cn('text-left', e.status === 'falhou' ? 'font-medium text-danger' : e.status === 'enviado' ? 'text-success' : 'text-muted-foreground')}>
                  {STATUS[e.status] ?? e.status}
                  {e.erro && <span className="block text-[13px] font-normal text-danger">{traduzErroEnvio(e.erro)}</span>}
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  )
}
