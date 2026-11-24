import { useEffect, useState, type ReactNode } from 'react'
import { Check, Flag, Loader2, RotateCcw, UserRound, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ROTULO_PRIORIDADE } from '@/lib/atendimento'
import type { Prioridade } from '@/hooks/useAtendimento'
import { cn } from '@/lib/utils'
import {
  descreverConfianca,
  marcadosNoCartao,
  planejarLote,
  type AcaoDoPlano,
  type AcaoEmLote,
  type CandidatoEmLote,
  type PlanoDoLote,
} from '@/lib/ticketsEmLote'

/**
 * Peças do lote de tickets no visual do DS: a caixa de marcar da linha, o
 * botão "Selecionar" do celular, a barra fixa do lote, o cartão de confirmação
 * e o aviso de desfazer. Nada aqui fala com o banco: recebe dados e devolve
 * intenção (é a `DemandasPage` quem grava, por `useTicketsEmLote`).
 */

/** Caixa de marcar com alvo de toque de 44 px (o visual do DS pede no celular). */
export function CaixaDeSelecao({
  marcado,
  onMarcar,
  rotulo,
  className,
}: {
  marcado: boolean
  onMarcar: (marcado: boolean) => void
  rotulo: string
  className?: string
}) {
  return (
    <label
      className={cn(
        'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg md:h-6 md:w-6',
        'focus-within:ring-2 focus-within:ring-foreground/30',
        className,
      )}
      // O clique na caixa não abre o ticket nem dispara o clique da linha.
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={marcado}
        onChange={(e) => onMarcar(e.target.checked)}
        aria-label={rotulo}
        className="h-5 w-5 cursor-pointer accent-foreground"
      />
    </label>
  )
}

/** Botão "Selecionar" (celular): liga o modo de seleção sem sair da lista. */
export function BotaoSelecionar({ ativo, onClick }: { ativo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className="btn btn-outline h-11 px-3 text-[13.5px] focus-ds md:h-8"
    >
      {ativo ? 'Cancelar' : 'Selecionar'}
    </button>
  )
}

/** Barra fixa do lote: o total e as quatro ações. */
export type AcaoDaBarra = 'resolver' | 'reabrir' | 'responsavel' | 'prioridade'

export function BarraDeLote({
  total,
  onAcao,
  onLimpar,
  carregando,
  podeResolver = true,
  podeReabrir = true,
  podeEditar = true,
}: {
  total: number
  onAcao: (acao: AcaoDaBarra) => void
  onLimpar: () => void
  carregando?: boolean
  /** Sem etapa final configurada, "Resolver" fica desligado. */
  podeResolver?: boolean
  /** Sem etapa aberta, "Reabrir" fica desligado. */
  podeReabrir?: boolean
  podeEditar?: boolean
}) {
  const acoes: { acao: AcaoDaBarra; rotulo: string; icone: ReactNode; disponivel: boolean }[] = [
    { acao: 'resolver', rotulo: 'Resolver', icone: <Check className="h-4 w-4" aria-hidden />, disponivel: podeEditar && podeResolver },
    { acao: 'reabrir', rotulo: 'Reabrir', icone: <RotateCcw className="h-4 w-4" aria-hidden />, disponivel: podeEditar && podeReabrir },
    { acao: 'responsavel', rotulo: 'Responsável', icone: <UserRound className="h-4 w-4" aria-hidden />, disponivel: podeEditar },
    { acao: 'prioridade', rotulo: 'Prioridade', icone: <Flag className="h-4 w-4" aria-hidden />, disponivel: podeEditar },
  ]
  return (
    <div
      role="region"
      aria-label="Ações do lote de tickets"
      className={cn(
        'fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-[min(760px,100%)] flex-wrap items-center gap-2',
        'rounded-xl border border-card-border bg-card p-2.5 shadow-lg',
        'pb-[max(0.625rem,env(safe-area-inset-bottom))]',
      )}
    >
      <span className="min-w-0 flex-1 px-1 text-[13.5px] font-semibold">
        {total === 1 ? '1 ticket selecionado' : `${total} tickets selecionados`}
      </span>
      {acoes.map((a) => (
        <button
          key={a.acao}
          type="button"
          disabled={!a.disponivel || carregando}
          onClick={() => onAcao(a.acao)}
          data-acao={a.acao}
          className="btn btn-outline h-11 px-3 text-[13px] focus-ds disabled:opacity-50 md:h-8"
        >
          {a.icone}
          {a.rotulo}
        </button>
      ))}
      <button
        type="button"
        onClick={onLimpar}
        className="btn btn-ghost h-11 w-11 justify-center focus-ds md:h-8 md:w-8"
        aria-label="Limpar seleção"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export interface CartaoDeLoteProps {
  open: boolean
  acao: AcaoEmLote | 'responsavel' | 'prioridade'
  candidatos: readonly CandidatoEmLote[]
  marcados: readonly string[]
  comentario: string
  onComentario: (texto: string) => void
  prioridade?: Prioridade
  onPrioridade?: (p: Prioridade) => void
  responsavelId?: string
  onResponsavel?: (id: string) => void
  responsaveis?: { id: string; nome: string }[]
  ocupado?: boolean
  /** Sem permissão de editar, o cartão mostra o plano e não deixa confirmar. */
  podeEditar?: boolean
  onFechar: () => void
  onConfirmar: (plano: PlanoDoLote) => void
}

/** A ação do cartão vira a ação da regra: prioridade e responsável não mexem em etapa. */
function acaoDoPlano(acao: CartaoDeLoteProps['acao']): AcaoDoPlano {
  return acao === 'resolver' || acao === 'reabrir' ? acao : 'atribuir'
}

const TITULO: Record<CartaoDeLoteProps['acao'], string> = {
  resolver: 'Resolver os tickets selecionados',
  reabrir: 'Reabrir os tickets selecionados',
  responsavel: 'Atribuir responsável',
  prioridade: 'Mudar a prioridade',
}

/**
 * Cartão de confirmação do lote: quantos e quais, o que fica de fora, o aviso
 * do "aguardando equipe" e o comentário opcional — igual para todos.
 */
export function CartaoDeLote({
  open,
  acao,
  candidatos,
  marcados,
  comentario,
  onComentario,
  prioridade = 'media',
  onPrioridade,
  responsavelId = '',
  onResponsavel,
  responsaveis = [],
  ocupado,
  podeEditar = true,
  onFechar,
  onConfirmar,
}: CartaoDeLoteProps) {
  // O cartão só é montado quando abre (quem o usa monta sob condição), então o
  // retrato de quem estava marcado é o do primeiro render — sem efeito de sincronia.
  // O padrão da regra vale já na abertura: "aguardando equipe" não entra em
  // "Resolver" nem que a pessoa tenha marcado todos pelo atalho do filtro.
  const [marcadosAgora, setMarcadosAgora] = useState<string[]>(
    () => marcadosNoCartao(marcados, candidatos, acaoDoPlano(acao)),
  )

  const escolhidos = candidatos.filter((c) => marcadosAgora.includes(c.id))
  const plano = planejarLote(escolhidos, acaoDoPlano(acao))
  // O aviso do "aguardando equipe" sai dos candidatos, não do plano: eles vêm
  // desmarcados, então não estão no plano e o aviso sumiria.
  const aguardandoNoCartao = candidatos.filter((c) => c.status === 'aguardando_equipe')
  // Sem nada no plano não há o que gravar; sem responsável escolhido, "Aplicar" não vale.
  const podeConfirmar = podeEditar && !ocupado && plano.vao.length > 0 &&
    (acao !== 'responsavel' || Boolean(responsavelId))

  return (
    <Modal
      open={open}
      onClose={onFechar}
      title={TITULO[acao]}
      description={
        acao === 'resolver' || acao === 'reabrir'
          ? 'Nada sai para o cliente no WhatsApp: a etapa muda e o histórico guarda quem mudou.'
          : 'A mudança vale para os tickets marcados.'
      }
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onFechar} className="btn btn-ghost h-11 px-3 focus-ds">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirmar(plano)}
            disabled={!podeConfirmar}
            className="btn btn-primary h-11 px-4 focus-ds disabled:opacity-50"
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {acao === 'resolver' ? 'Resolver' : acao === 'reabrir' ? 'Reabrir' : 'Aplicar'}
          </button>
        </div>
      }
    >
      <div className="grid gap-3 text-[13.5px]">
        <p className="text-fg-2">
          <b className="text-foreground">
            {marcadosAgora.length === 1 ? '1 ticket' : `${marcadosAgora.length} tickets`}
          </b>
          {' '}marcados. Destes, {plano.vao.length === 1 ? '1 vai mudar' : `${plano.vao.length} vão mudar`}
          {plano.pulados.length > 0 && ` e ${plano.pulados.length} ${plano.pulados.length === 1 ? 'fica' : 'ficam'} de fora`}.
        </p>

        {aguardandoNoCartao.length > 0 && acao === 'resolver' && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[13px] text-warning">
            {aguardandoNoCartao.length === 1
              ? '1 ticket está aguardando a equipe (o cliente mandou a última mensagem) e vem desmarcado por padrão.'
              : `${aguardandoNoCartao.length} tickets estão aguardando a equipe (o cliente mandou a última mensagem) e vêm desmarcados por padrão.`}
          </p>
        )}

        <ul className="grid max-h-[38vh] gap-1 overflow-y-auto rounded-lg border border-card-border p-2">
          {candidatos.map((c) => {
            const marcado = marcadosAgora.includes(c.id)
            return (
              <li key={c.id} className="flex items-center gap-2">
                <CaixaDeSelecao
                  marcado={marcado}
                  rotulo={`Incluir o ticket ${c.codigo}`}
                  onMarcar={(v) => setMarcadosAgora((atual) => (
                    v ? [...new Set([...atual, c.id])] : atual.filter((id) => id !== c.id)
                  ))}
                />
                <span className="min-w-0 flex-1 truncate">
                  <span className="mono text-[11.5px] text-fg-4">{c.codigo}</span>
                  {' '}
                  <span className="truncate">{c.titulo ?? ''}</span>
                </span>
                {c.confianca != null && (
                  <span className="shrink-0 text-[12px] text-muted-foreground">
                    Íris {descreverConfianca(c.confianca)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        {acao === 'prioridade' && (
          <label className="grid gap-1 text-[13px]">
            <span className="font-semibold">Nova prioridade</span>
            <select
              value={prioridade}
              onChange={(e) => onPrioridade?.(e.target.value as Prioridade)}
              className="input h-11 focus-ds"
            >
              {(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => (
                <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>
              ))}
            </select>
          </label>
        )}

        {acao === 'responsavel' && (
          <label className="grid gap-1 text-[13px]">
            <span className="font-semibold">Responsável</span>
            <select
              value={responsavelId}
              onChange={(e) => onResponsavel?.(e.target.value)}
              className="input h-11 focus-ds"
            >
              <option value="">Escolha uma pessoa…</option>
              {responsaveis.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </label>
        )}

        {acao !== 'prioridade' && acao !== 'responsavel' && (
          <label className="grid gap-1 text-[13px]">
            <span className="font-semibold">Comentário (opcional, igual para todos)</span>
            <textarea
              value={comentario}
              onChange={(e) => onComentario(e.target.value)}
              rows={3}
              placeholder="Ex.: confirmado com o cliente pelo WhatsApp"
              className="input min-h-[76px] py-2 focus-ds"
            />
            <span className="text-[12px] text-muted-foreground">
              Vai como comentário em cada ticket. O desfazer devolve a etapa; o comentário fica.
            </span>
          </label>
        )}
      </div>
    </Modal>
  )
}

/** Sem desfazer o aviso só informa: fica menos tempo para não cobrir a barra do lote. */
const SEGUNDOS_SEM_DESFAZER = 6

/** Aviso do resultado com o desfazer (10 s), como um toast do DS. */
export function AvisoDoLote({
  texto,
  aviso,
  onDesfazer,
  onFechar,
  segundos = 10,
}: {
  texto: string
  aviso?: string | null
  onDesfazer?: (() => void) | null
  onFechar: () => void
  segundos?: number
}) {
  // O aviso sempre some sozinho: com desfazer, quando a contagem acaba; sem
  // desfazer, em 6 s. Sem isso um aviso de erro (ou de prioridade/responsável)
  // ficava para sempre em cima da barra do lote, e dois se escondiam.
  const duracao = onDesfazer ? segundos : SEGUNDOS_SEM_DESFAZER
  const [restante, setRestante] = useState(duracao)
  // Aviso novo reinicia a contagem. Ajuste no render (e não num efeito) para o
  // relógio nunca aparecer com o número do lote anterior.
  const [avisoAtual, setAvisoAtual] = useState(texto)
  if (avisoAtual !== texto) {
    setAvisoAtual(texto)
    setRestante(duracao)
  }

  useEffect(() => {
    const t = setInterval(() => setRestante((r) => (r > 0 ? r - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [texto, duracao])

  useEffect(() => {
    if (restante > 0) return
    onFechar()
  }, [restante, onFechar])

  return (
    <div
      role="status"
      className={cn(
        'fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-[min(640px,100%)] flex-wrap items-center gap-2',
        'rounded-xl border border-card-border bg-card p-3 shadow-lg',
        'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
      )}
    >
      <div className="min-w-0 flex-1 text-[13.5px]">
        <span className="font-semibold">{texto}</span>
        {aviso && <span className="block text-[12.5px] text-muted-foreground">{aviso}</span>}
      </div>
      {onDesfazer && restante > 0 && (
        <button
          type="button"
          onClick={onDesfazer}
          className="btn btn-outline h-11 px-3 text-[13px] focus-ds md:h-8"
        >
          Desfazer ({restante})
        </button>
      )}
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar aviso"
        className="btn btn-ghost h-11 w-11 justify-center focus-ds md:h-8 md:w-8"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
