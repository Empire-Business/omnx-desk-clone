import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Circle, Info, MinusCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { AbaWa, EstadoAutomacao, Pendencia } from '@/lib/automacoesWa'
import { cn } from '@/lib/utils'
import { ROTA_ABA, botaoLink, campo, foco } from './estilos'

/**
 * Peças visuais do app Automações WhatsApp: um só jeito de botão, campo,
 * interruptor, selo e aviso em todas as abas.
 */

export function Secao({
  titulo, descricao, numero, acao, children, className,
}: {
  titulo: string
  descricao?: ReactNode
  /** Passo numerado (①, ②…) quando a tela é um roteiro. */
  numero?: number
  acao?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-4 rounded-lg border border-card-border bg-card p-4 sm:p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          {numero !== undefined && (
            <span aria-hidden className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-iris-light text-xs font-semibold text-iris-fg">
              {numero}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="t-h4 text-foreground">
              {numero !== undefined && <span className="sr-only">Passo {numero}: </span>}
              {titulo}
            </h2>
            {descricao && <p className="mt-0.5 text-[13.5px] text-muted-foreground">{descricao}</p>}
          </div>
        </div>
        {acao}
      </div>
      {children}
    </section>
  )
}

export function Interruptor({
  ligado, onChange, disabled, rotulo, id,
}: { ligado: boolean; onChange: (v: boolean) => void; disabled?: boolean; rotulo: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={disabled}
      onClick={() => onChange(!ligado)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-fast before:absolute before:-inset-2.5 before:content-[\'\'] disabled:cursor-not-allowed disabled:opacity-50',
        // Desligado: trilho cinza médio (contraste ≥ 3:1 no claro e no escuro).
        ligado ? 'bg-iris' : 'bg-fg-4',
        foco,
      )}
    >
      <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', ligado ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  )
}

export function MensagemErro({ texto }: { texto: string | null | undefined }) {
  if (!texto) return null
  return <p role="alert" className="text-sm text-danger">{texto}</p>
}

export function MensagemSucesso({ texto }: { texto: string | null | undefined }) {
  return (
    <p role="status" className={cn('text-sm text-success', !texto && 'sr-only')}>
      {texto && <CheckCircle2 className="mr-1.5 inline h-4 w-4 align-[-3px]" />}
      {texto}
    </p>
  )
}

/** Linha cinza de ajuda (ⓘ), no lugar de faixas amarelas. */
export function Dica({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-[13px] text-muted-foreground', className)}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> <span>{children}</span>
    </p>
  )
}

/** Aviso que pede ação (âmbar). Use pouco: só quando algo vai deixar de funcionar. */
export function Aviso({ children, acao, tom = 'atencao' }: { children: ReactNode; acao?: ReactNode; tom?: 'atencao' | 'erro' }) {
  return (
    <div className={cn('flex flex-wrap items-start gap-2 rounded-lg border px-3 py-2 text-sm',
      tom === 'erro'
        ? 'border-danger/40 bg-danger-light text-danger'
        : 'border-note-border bg-note text-note-fg')}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{children}</span>
      {acao}
    </div>
  )
}

/** Retângulo cinza pulsando enquanto os dados chegam. */
export function Esqueleto({ className }: { className?: string }) {
  return <div aria-hidden className={cn('sk rounded-md', className)} />
}

export function EsqueletoAba() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only" role="status">Carregando…</span>
      <Esqueleto className="h-28 w-full rounded-lg" />
      <Esqueleto className="h-44 w-full rounded-lg" />
    </div>
  )
}

/**
 * "Salvando…" / "✓ Salvo" ao lado de um campo que grava sozinho.
 * Passe o `status` e o `submittedAt` da mutação dona daquele campo.
 */
export function IndicadorSalvo({ status, quando, className }: {
  status: 'idle' | 'pending' | 'success' | 'error'
  quando?: number
  className?: string
}) {
  // O "✓ Salvo" some 2,5 s depois de cada gravação (marcada por `quando`).
  const [expirou, setExpirou] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (status !== 'success') return
    const t = setTimeout(() => setExpirou(quando), 2500)
    return () => clearTimeout(t)
  }, [status, quando])
  const recente = status === 'success' && expirou !== quando
  const texto = status === 'pending' ? 'Salvando…' : status === 'success' && recente ? '✓ Salvo' : ''
  return (
    <span role="status" aria-live="polite"
      className={cn('inline-block min-w-[4.5rem] text-[12.5px]', status === 'success' ? 'text-success' : 'text-muted-foreground', className)}>
      {texto}
    </span>
  )
}

/** Selo de situação de uma automação. */
export function SeloEstado({ estado }: { estado: EstadoAutomacao }) {
  const cfg = {
    ligado: { texto: 'Ligado', classe: 'border-transparent bg-success-light text-success', Icone: CheckCircle2 },
    desligado: { texto: 'Desligado', classe: 'border-border bg-muted text-muted-foreground', Icone: MinusCircle },
    ligado_sem_envio: { texto: 'Ligado, mas não vai sair', classe: 'border-transparent bg-danger-light text-danger', Icone: AlertTriangle },
    falta_configurar: { texto: 'Falta configurar', classe: 'border-note-border bg-note text-note-fg', Icone: Circle },
  }[estado.tipo]
  const { Icone } = cfg
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium', cfg.classe)}>
      <Icone className="h-3.5 w-3.5" aria-hidden /> {cfg.texto}
    </span>
  )
}


const NOME_ABA: Record<AbaWa, string> = {
  'tempo-resposta': 'Tempo de resposta',
  inicio: 'Primeiros passos', conexao: 'Conexão', relatorio: 'Aviso diário', alertas: 'Pontos de atenção', assistente: 'Íris', resumo: 'Resumo semanal', reunioes: 'Reuniões', historico: 'Histórico', vinculos: 'Grupos e clientes',
}

/**
 * "Falta: escolher o número que envia [Conexão] e cadastrar quem recebe [Relatório diário]".
 * A aba atual não vira link (a pessoa já está nela).
 */
export function LinhaFalta({ pendencias, abaAtual }: { pendencias: Pendencia[]; abaAtual: AbaWa }) {
  if (pendencias.length === 0) return null
  const unicas = pendencias.filter((p, i) => pendencias.findIndex((x) => x.texto === p.texto) === i)
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-sm text-note-fg">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="font-medium">Falta:</span>
      {unicas.map((p, i) => (
        <span key={p.texto}>
          {p.texto}
          {p.aba !== abaAtual && (
            <> (<Link to={ROTA_ABA(p.aba)} className={botaoLink}>{NOME_ABA[p.aba]}</Link>)</>
          )}
          {i < unicas.length - 2 ? ', ' : i === unicas.length - 2 ? ' e ' : ''}
        </span>
      ))}
    </p>
  )
}

/** Ícone ⓘ com explicação no passar do mouse / foco. */
export function AjudaTooltip({ texto, rotulo = 'Mais informações' }: { texto: string; rotulo?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={rotulo} className={cn('inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground md:h-6 md:w-6', foco)}>
          <Info className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{texto}</TooltipContent>
    </Tooltip>
  )
}

export interface OpcaoCartao<T extends string> {
  valor: T
  titulo: string
  descricao: string
  /** Letra pequena (ex.: "via UAZAPI"). */
  detalhe?: string
  desabilitado?: boolean
  /** Por que está desabilitado. */
  motivo?: string
}

/**
 * Escolha única em cartões. Por baixo são rádios de verdade (setas do teclado
 * trocam a opção; o leitor de tela anuncia "1 de 2, selecionado").
 */
export function CartoesEscolha<T extends string>({
  nome, legenda, valor, opcoes, onChange, disabled,
}: {
  nome: string
  legenda: string
  valor: T
  opcoes: OpcaoCartao<T>[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2" disabled={disabled}>
      <legend className="sr-only">{legenda}</legend>
      {opcoes.map((o) => {
        const sel = valor === o.valor
        return (
          <label key={o.valor}
            className={cn(
              'relative flex cursor-pointer flex-col gap-1 rounded-lg border p-4 transition-colors duration-fast',
              'has-[:focus-visible]:shadow-[var(--focus)]',
              sel ? 'border-iris bg-iris-light' : 'border-stroke-default hover:bg-bg-1',
              o.desabilitado && 'cursor-not-allowed opacity-60 hover:bg-transparent',
            )}>
            <input type="radio" name={nome} value={o.valor} checked={sel} disabled={o.desabilitado}
              onChange={() => onChange(o.valor)} className="sr-only" />
            <span className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{o.titulo}</span>
              {sel && (
                <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-iris-fg">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Selecionado
                </span>
              )}
            </span>
            <span className="text-sm text-muted-foreground">{o.descricao}</span>
            {o.desabilitado && o.motivo && <span className="text-[12.5px] font-medium text-muted-foreground">{o.motivo}</span>}
            {o.detalhe && <span className="text-[12px] text-muted-foreground">{o.detalhe}</span>}
          </label>
        )
      })}
    </fieldset>
  )
}

/**
 * Horário que grava ao sair do campo (ou com Enter) — não a cada tecla, para
 * não salvar "0", "09", "09:0"… no meio da digitação.
 */
export function CampoHora({ valor, onSalvar, rotulo, disabled, id }: {
  valor: string
  onSalvar: (v: string) => void
  rotulo: string
  disabled?: boolean
  id?: string
}) {
  return (
    <input key={valor} id={id} type="time" aria-label={rotulo} disabled={disabled} defaultValue={valor}
      className={cn(campo, 'w-32')}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      onBlur={(e) => { const v = e.target.value; if (v && v !== valor) onSalvar(v) }} />
  )
}
