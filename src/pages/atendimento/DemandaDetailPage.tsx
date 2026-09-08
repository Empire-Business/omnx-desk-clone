import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { History, Loader2, MessageSquare, Send, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useClientes } from '@/hooks/useClientes'
import { useUsers } from '@/hooks/useUsers'
import {
  useDemanda, useAtendimentoTipos, useAtendimentoEtapas, useAtualizarDemanda,
  useExcluirDemanda, useComentarios, useComentar, useHistoricoDemanda,
  type Aprovacao, type Prioridade,
} from '@/hooks/useAtendimento'
import { usePermissoes } from '@/hooks/usePermissoes'
import {
  classeEtapa, CLASSE_APROVACAO, CLASSE_PRAZO, CLASSE_PRIORIDADE, dataHora,
  ROTULO_APROVACAO, ROTULO_PRIORIDADE, situacaoPrazo, textoPrazo,
} from '@/lib/atendimento'
import { cn } from '@/lib/utils'

const campo =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-60'
const rotulo = 'mb-1 block text-xs font-medium text-muted-foreground'

const ROTULO_CAMPO: Record<string, string> = {
  etapa: 'Etapa',
  responsavel: 'Responsável',
  prazo: 'Prazo',
  prioridade: 'Prioridade',
  aprovacao: 'Aprovação',
}

/**
 * Detalhe da demanda: o lugar onde ela é trabalhada.
 *
 * Cada campo salva sozinho ao mudar — não há botão "Salvar". Numa tela que a
 * pessoa abre para mover uma coisa e fechar, um formulário com submit é onde o
 * trabalho se perde. O histórico embaixo é escrito pelo banco, não por esta
 * tela, então registra a mudança venha ela daqui ou do kanban.
 */
export function DemandaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: demanda, isLoading, isError } = useDemanda(id)
  const { data: clientes } = useClientes()
  const { data: usuarios } = useUsers()
  const { data: tipos } = useAtendimentoTipos()
  const { data: etapas } = useAtendimentoEtapas()
  const { data: comentarios } = useComentarios(id)
  const { data: historico } = useHistoricoDemanda(id)

  const atualizar = useAtualizarDemanda()
  const excluir = useExcluirDemanda()
  const comentar = useComentar()
  const { can } = usePermissoes()

  const [texto, setTexto] = useState('')
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)

  const podeEditar = can('atendimento', 'editar')
  const podeExcluir = can('atendimento', 'admin')

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando demanda…
      </div>
    )
  }

  if (isError || !demanda) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Demanda não encontrada — ela pode ter sido excluída.
      </div>
    )
  }

  const salvar = (campos: Record<string, unknown>) => atualizar.mutate({ id: demanda.id, ...campos })
  const situacao = situacaoPrazo(demanda)

  const enviarComentario = (e: React.FormEvent) => {
    e.preventDefault()
    if (!texto.trim()) return
    comentar.mutate(
      { demandaId: demanda.id, texto: texto.trim() },
      { onSuccess: () => setTexto('') },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backTo="/atendimento/demandas"
        breadcrumb={[
          { label: 'Atendimento', href: '/atendimento' },
          { label: 'Demandas', href: '/atendimento/demandas' },
          { label: demanda.codigo },
        ]}
        title={demanda.titulo}
        description={`${demanda.cliente?.nome ?? 'Sem cliente'} · criada em ${dataHora(demanda.created_at)}`}
        action={
          podeExcluir && (
            <button
              onClick={() => setConfirmarExclusao(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {demanda.etapa && (
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium',
              classeEtapa(demanda.etapa.cor),
            )}
          >
            {demanda.etapa.nome}
          </span>
        )}
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium',
            CLASSE_PRIORIDADE[demanda.prioridade],
          )}
        >
          {ROTULO_PRIORIDADE[demanda.prioridade]}
        </span>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium',
            CLASSE_APROVACAO[demanda.aprovacao],
          )}
        >
          {ROTULO_APROVACAO[demanda.aprovacao]}
        </span>
        <span className={cn('text-xs', CLASSE_PRAZO[situacao])}>{textoPrazo(demanda)}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-xl border border-border bg-card p-4">
            <label className={rotulo} htmlFor="demanda-descricao">O que precisa ser feito</label>
            <textarea
              id="demanda-descricao"
              className={campo}
              rows={4}
              disabled={!podeEditar}
              defaultValue={demanda.descricao ?? ''}
              placeholder="Referências, tom de voz, o que o cliente falou…"
              onBlur={(e) => {
                if (e.target.value !== (demanda.descricao ?? '')) {
                  salvar({ descricao: e.target.value || null })
                }
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              As alterações são salvas quando você sai do campo.
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
              <MessageSquare className="h-4 w-4" /> Comentários
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Conversa da equipe sobre esta demanda. O cliente não vê.
            </p>

            <ul className="mt-4 space-y-3">
              {(comentarios ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">
                  Nenhum comentário ainda. Use este espaço para combinar detalhes sem sair da demanda.
                </li>
              )}
              {(comentarios ?? []).map((c) => (
                <li key={c.id} className="rounded-lg bg-muted/40 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">
                      {c.autor?.nome ?? 'Usuário removido'}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{dataHora(c.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{c.texto}</p>
                </li>
              ))}
            </ul>

            {podeEditar && (
              <form onSubmit={enviarComentario} className="mt-4 flex items-end gap-2">
                <textarea
                  className={campo}
                  rows={2}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Escrever um comentário…"
                  aria-label="Novo comentário"
                />
                <button
                  type="submit"
                  disabled={comentar.isPending || !texto.trim()}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {comentar.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Enviar
                </button>
              </form>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
              <History className="h-4 w-4" /> Histórico
            </h2>
            <ul className="mt-3 space-y-2">
              {(historico ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">
                  Nada mudou desde que a demanda foi criada.
                </li>
              )}
              {(historico ?? []).map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                  <span className="text-muted-foreground">{dataHora(h.created_at)}</span>
                  <span className="font-medium text-foreground">
                    {h.autor?.nome ?? 'Alguém'}
                  </span>
                  <span className="text-muted-foreground">
                    alterou {ROTULO_CAMPO[h.campo] ?? h.campo} de
                  </span>
                  <span className="text-foreground">{h.valor_de ?? '—'}</span>
                  <span className="text-muted-foreground">para</span>
                  <span className="font-medium text-foreground">{h.valor_para ?? '—'}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div>
              <label className={rotulo} htmlFor="det-etapa">Etapa</label>
              <select
                id="det-etapa"
                className={campo}
                disabled={!podeEditar}
                value={demanda.etapa_id ?? ''}
                onChange={(e) => salvar({ etapa_id: e.target.value || null })}
              >
                <option value="">Sem etapa</option>
                {(etapas ?? []).map((et) => (
                  <option key={et.id} value={et.id}>{et.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={rotulo} htmlFor="det-responsavel">Responsável</label>
              <select
                id="det-responsavel"
                className={campo}
                disabled={!podeEditar}
                value={demanda.responsavel_id ?? ''}
                onChange={(e) => salvar({ responsavel_id: e.target.value || null })}
              >
                <option value="">Sem responsável</option>
                {(usuarios ?? []).filter((u) => u.ativo).map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={rotulo} htmlFor="det-prazo">Prazo</label>
              <input
                id="det-prazo"
                type="date"
                className={campo}
                disabled={!podeEditar}
                value={demanda.prazo ?? ''}
                onChange={(e) => salvar({ prazo: e.target.value || null })}
              />
            </div>

            <div>
              <label className={rotulo} htmlFor="det-prioridade">Prioridade</label>
              <select
                id="det-prioridade"
                className={campo}
                disabled={!podeEditar}
                value={demanda.prioridade}
                onChange={(e) => salvar({ prioridade: e.target.value as Prioridade })}
              >
                {(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => (
                  <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={rotulo} htmlFor="det-cliente">Cliente</label>
              <select
                id="det-cliente"
                className={campo}
                disabled={!podeEditar}
                value={demanda.cliente_id ?? ''}
                onChange={(e) => salvar({ cliente_id: e.target.value || null })}
              >
                <option value="">Sem cliente</option>
                {(clientes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={rotulo} htmlFor="det-tipo">Tipo</label>
              <select
                id="det-tipo"
                className={campo}
                disabled={!podeEditar}
                value={demanda.tipo_id ?? ''}
                onChange={(e) => salvar({ tipo_id: e.target.value || null })}
              >
                <option value="">Sem tipo</option>
                {(tipos ?? []).filter((t) => t.ativo).map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-base font-semibold text-foreground">
              Aprovação do cliente
            </h2>
            <div>
              <label className={rotulo} htmlFor="det-aprovacao">Situação</label>
              <select
                id="det-aprovacao"
                className={campo}
                disabled={!podeEditar}
                value={demanda.aprovacao}
                onChange={(e) => salvar({ aprovacao: e.target.value as Aprovacao })}
              >
                {(Object.keys(ROTULO_APROVACAO) as Aprovacao[]).map((a) => (
                  <option key={a} value={a}>{ROTULO_APROVACAO[a]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={rotulo} htmlFor="det-aprovacao-obs">
                O que o cliente falou
              </label>
              <textarea
                id="det-aprovacao-obs"
                className={campo}
                rows={3}
                disabled={!podeEditar}
                defaultValue={demanda.aprovacao_obs ?? ''}
                placeholder="Ex.: pediu para trocar a trilha e encurtar o final"
                onBlur={(e) => {
                  if (e.target.value !== (demanda.aprovacao_obs ?? '')) {
                    salvar({ aprovacao_obs: e.target.value || null })
                  }
                }}
              />
            </div>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmarExclusao}
        onClose={() => setConfirmarExclusao(false)}
        onConfirm={() => {
          excluir.mutate(demanda.id, {
            onSuccess: () => navigate('/atendimento/demandas'),
          })
        }}
        title={`Excluir ${demanda.codigo}?`}
        description="A demanda, os comentários e o histórico serão apagados de vez. Não há como desfazer."
        confirmLabel="Excluir demanda"
      />
    </div>
  )
}
