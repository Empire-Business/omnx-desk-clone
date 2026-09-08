import { useState, useMemo, useRef, useEffect, Children } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Pencil, Plus, Package, Mail, Phone, Building2, Tag, Users, Trash2, UserPlus,
  MessageSquare, MapPin, Instagram, Globe, DollarSign, FileText, Calendar,
  TrendingUp, BarChart3, Award, ExternalLink, ClipboardList, Hash, Briefcase,
  Target, StickyNote, Smartphone, ChevronLeft, ChevronRight as ChevronRightIcon,
  Wallet, Headphones,
} from 'lucide-react'
import { useCliente, useCreateContract, useUpdateContract, useDeleteContract } from '@/hooks/useClientes'
import { useProdutosByClient, useCreateProduto } from '@/hooks/useProdutos'
import { useAssignments, useCreateAssignment, useDeleteAssignment, useUsers } from '@/hooks/useUsers'
import { useClientAvatars, useCurrentFollowers } from '@/hooks/useInstagramStats'
import { useContratosByCliente, type Contrato } from '@/hooks/useComissoes'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { ClienteForm } from '@/components/clientes/ClienteForm'
import { useClientContacts } from '@/hooks/useClientContacts'
import { ClienteRetrospecto, NotaBadge } from '@/components/clientes/ClienteRetrospecto'
import { AbaFinanceiro, AbaConversas, AbaDemandas } from '@/components/clientes/ClienteVisao360'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useConversasDoCliente, useDemandasDoCliente } from '@/hooks/useClienteVinculos'
import { parcelasDoContrato, type ContratoFluxo } from '@/pages/contratos/fluxoFuturo'
import { cn } from '@/lib/utils'
import type { ClientContract } from '@/types/database'

function ProdutoCard({ product, onClick }: { product: { id: string; nome: string; descricao: string | null; deliverables: unknown[] }; onClick: () => void }) {
  const deliverables = product.deliverables as Array<{ id: string }>
  return (
    <button onClick={onClick} className="glass-card entity-card-hover w-full text-left p-4 flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-area-acquisition-muted">
        <Package className="h-4 w-4 text-area-acquisition" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm text-foreground truncate">{product.nome}</p>
        {product.descricao && <p className="text-xs text-muted-foreground mt-0.5 truncate">{product.descricao}</p>}
        <span className="mt-1.5 inline-block rounded-full bg-primary-muted px-2 py-0.5 text-2xs font-medium text-primary">
          {deliverables.length} entregável{deliverables.length !== 1 ? 'is' : ''}
        </span>
      </div>
    </button>
  )
}

function InfoField({ icon: Icon, label, value, href }: { icon: React.ElementType; label: string; value: string | number | null | undefined; href?: string }) {
  const hasValue = value != null && value !== '' && value !== 0
  const display = hasValue ? String(value) : null
  return (
    <div className={cn(
      'group/field flex items-center gap-3 py-2 px-2 -mx-2 rounded-md transition-colors',
      hasValue && 'hover:bg-muted/40',
    )}>
      <Icon className={cn(
        'h-3.5 w-3.5 shrink-0',
        hasValue ? 'text-muted-foreground group-hover/field:text-primary transition-colors' : 'text-muted-foreground/30',
      )} />
      <p className="text-xs text-muted-foreground/80 w-24 shrink-0 truncate">{label}</p>
      <div className="min-w-0 flex-1 text-right">
        {!display ? (
          <span className="text-sm text-muted-foreground/30">—</span>
        ) : href ? (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 max-w-full text-sm font-medium text-primary hover:underline">
            <span className="truncate">{display}</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
          </a>
        ) : (
          <p className="text-sm font-medium text-foreground break-words leading-snug">{display}</p>
        )}
      </div>
    </div>
  )
}

function InfoCardHeader({
  icon: Icon, title, accent = 'primary', action,
}: {
  icon: React.ElementType
  title: string
  accent?: 'primary' | 'accent' | 'success' | 'warning'
  action?: React.ReactNode
}) {
  const colorMap = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-accent text-accent-foreground',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/15 text-warning',
  }[accent]
  return (
    <div className="flex items-center justify-between pb-3 border-b border-border/60">
      <h3 className="flex items-center gap-2 font-display text-sm font-bold text-foreground tracking-tight">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', colorMap)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {title}
      </h3>
      {action}
    </div>
  )
}

function SectionTitle({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Icon className="h-4 w-4 text-accent" />
        {title}
      </h3>
      {children}
    </div>
  )
}

const statusColors: Record<string, string> = {
  'ATIVO': 'bg-success-light text-success',
  'INADIMPLENTE': 'bg-danger/10 text-danger',
  'FASE DE RENOVAÇÃO': 'bg-warning/10 text-warning',
  'CANCELADO': 'bg-muted text-muted-foreground',
  'PAUSADO': 'bg-muted text-muted-foreground',
}

function ContractCard({ contract, isAdmin, onEdit, onDelete }: {
  contract: ClientContract; isAdmin: boolean
  onEdit: () => void; onDelete: () => void
}) {
  const statusClass = statusColors[contract.status ?? ''] ?? 'bg-primary-muted text-primary'
  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm text-foreground">{contract.produto || 'Contrato'}</p>
          {contract.status && (
            <span className={cn('mt-1 inline-block rounded-full px-2.5 py-0.5 text-2xs font-medium', statusClass)}>
              {contract.status}
            </span>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="rounded-md p-1.5 text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {contract.faturamento_bruto && (
          <div><p className="text-2xs text-muted-foreground">Fat. Bruto</p><p className="text-sm font-medium text-foreground">{contract.faturamento_bruto}</p></div>
        )}
        {contract.valor_parcela && (
          <div><p className="text-2xs text-muted-foreground">Parcela</p><p className="text-sm text-foreground">{contract.num_parcelas ? `${contract.num_parcelas}x ` : ''}{contract.valor_parcela}</p></div>
        )}
        {contract.valor_entrada && (
          <div><p className="text-2xs text-muted-foreground">Entrada</p><p className="text-sm text-foreground">{contract.valor_entrada}</p></div>
        )}
        {contract.forma_pagamento && (
          <div><p className="text-2xs text-muted-foreground">Pagamento</p><p className="text-sm text-foreground">{contract.forma_pagamento}</p></div>
        )}
        {contract.plano_dias && (
          <div><p className="text-2xs text-muted-foreground">Plano</p><p className="text-sm text-foreground">{contract.plano_dias} dias</p></div>
        )}
        {contract.data_vencimento && (
          <div><p className="text-2xs text-muted-foreground">Vencimento</p><p className="text-sm text-foreground">{contract.data_vencimento}</p></div>
        )}
        {contract.data_renovacao && (
          <div><p className="text-2xs text-muted-foreground">Renovação</p><p className="text-sm text-foreground">{contract.data_renovacao}</p></div>
        )}
        {contract.data_assinatura && (
          <div><p className="text-2xs text-muted-foreground">Assinatura</p><p className="text-sm text-foreground">{contract.data_assinatura}</p></div>
        )}
        {contract.data_pg_entrada && (
          <div><p className="text-2xs text-muted-foreground">PG Entrada</p><p className="text-sm text-foreground">{contract.data_pg_entrada}</p></div>
        )}
        {contract.vendedor && (
          <div><p className="text-2xs text-muted-foreground">Vendedor</p><p className="text-sm text-foreground">{contract.vendedor}</p></div>
        )}
        {contract.especialista && (
          <div><p className="text-2xs text-muted-foreground">Especialista</p><p className="text-sm text-foreground">{contract.especialista}</p></div>
        )}
        {contract.treinador && (
          <div><p className="text-2xs text-muted-foreground">Treinador(a)</p><p className="text-sm text-foreground">{contract.treinador}</p></div>
        )}
        {contract.funil && (
          <div><p className="text-2xs text-muted-foreground">Funil</p><p className="text-sm text-foreground">{contract.funil}</p></div>
        )}
      </div>

      {/* Performance metrics */}
      {(contract.seguidores_inicio || contract.seguidores_fim || contract.videos_postados || contract.entregas_totais || contract.nps) && (
        <div className="pt-2 border-t border-border">
          <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Performance</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {contract.seguidores_inicio != null && (
              <div><p className="text-2xs text-muted-foreground">Seguidores (início)</p><p className="text-sm text-foreground">{contract.seguidores_inicio.toLocaleString('pt-BR')}</p></div>
            )}
            {contract.seguidores_fim != null && (
              <div><p className="text-2xs text-muted-foreground">Seguidores (fim)</p><p className="text-sm text-foreground">{contract.seguidores_fim.toLocaleString('pt-BR')}</p></div>
            )}
            {contract.crescimento_seguidores != null && (
              <div><p className="text-2xs text-muted-foreground">Crescimento</p><p className={cn('text-sm font-medium', (contract.crescimento_seguidores ?? 0) > 0 ? 'text-success' : 'text-danger')}>{(contract.crescimento_seguidores ?? 0) > 0 ? '+' : ''}{contract.crescimento_seguidores?.toLocaleString('pt-BR')}</p></div>
            )}
            {contract.videos_postados != null && (
              <div><p className="text-2xs text-muted-foreground">Vídeos postados</p><p className="text-sm text-foreground">{contract.videos_postados}</p></div>
            )}
            {contract.entregas_totais != null && (
              <div><p className="text-2xs text-muted-foreground">Entregas</p><p className="text-sm text-foreground">{contract.entregas_prazo ?? 0}/{contract.entregas_totais} no prazo</p></div>
            )}
            {contract.nps && (
              <div><p className="text-2xs text-muted-foreground">NPS</p><p className="text-sm text-foreground">{contract.nps}</p></div>
            )}
            {contract.semanas != null && (
              <div><p className="text-2xs text-muted-foreground">Semanas</p><p className="text-sm text-foreground">{contract.semanas}</p></div>
            )}
          </div>
        </div>
      )}

      {/* Extras */}
      {(contract.bonus || contract.upgrade || contract.cancelamento || contract.link_clicksign) && (
        <div className="pt-2 border-t border-border space-y-1.5">
          {contract.link_clicksign && (
            <a href={contract.link_clicksign} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              <FileText className="h-3 w-3" /> Contrato (ClickSign) <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {contract.bonus && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Bônus:</span> {contract.bonus}</p>}
          {contract.upgrade && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Upgrade:</span> {contract.upgrade}</p>}
          {contract.cancelamento && <p className="text-xs text-danger"><span className="font-medium">Cancelamento:</span> {contract.cancelamento}</p>}
        </div>
      )}

      {/* Internal flags */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {contract.venda_interna && <span className="rounded-full bg-primary-muted px-2 py-0.5 text-2xs font-medium text-primary">Venda interna</span>}
        {contract.venda_diretoria && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-2xs font-medium text-accent">Venda diretoria</span>}
        {contract.financeiro_ok && <span className="rounded-full bg-success-light px-2 py-0.5 text-2xs font-medium text-success">Financeiro OK</span>}
        {contract.email_enviado && <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">Email enviado</span>}
      </div>
    </div>
  )
}

function SideCardCarousel({ children }: { children: React.ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const items = Children.toArray(children)
  const total = items.length
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(1)

  // Calcula quantos cards cabem por "página" baseado na largura do container
  useEffect(() => {
    function update() {
      const el = scrollerRef.current
      if (!el) return
      const w = el.clientWidth
      if (w >= 1024) setPerPage(3)
      else if (w >= 640) setPerPage(2)
      else setPerPage(1)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const canPrev = page > 0
  const canNext = page < totalPages - 1

  function go(dir: 1 | -1) {
    const next = Math.min(Math.max(page + dir, 0), totalPages - 1)
    setPage(next)
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      {/* Controls + indicator */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Detalhes do cliente
        </h2>
        <div className="flex items-center gap-2">
          {totalPages > 1 && (
            <>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setPage(i)
                      scrollerRef.current?.scrollTo({ left: i * scrollerRef.current.clientWidth, behavior: 'smooth' })
                    }}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === page ? 'w-6 bg-primary' : 'w-1.5 bg-border hover:bg-muted-foreground/40',
                    )}
                    aria-label={`Ir pra página ${i + 1}`}
                  />
                ))}
              </div>
              <span className="text-2xs text-muted-foreground tabular-nums">
                {page + 1}/{totalPages}
              </span>
            </>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => go(-1)}
              disabled={!canPrev}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card transition-all',
                canPrev
                  ? 'text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary'
                  : 'opacity-40 cursor-not-allowed',
              )}
              aria-label="Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => go(1)}
              disabled={!canNext}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card transition-all',
                canNext
                  ? 'text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary'
                  : 'opacity-40 cursor-not-allowed',
              )}
              aria-label="Próxima"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Scroller */}
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth gap-3 sm:gap-4 pb-2 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
      >
        {items.map((child, i) => (
          <div
            key={i}
            className={cn(
              'snap-start shrink-0',
              perPage === 1 ? 'w-full' :
              perPage === 2 ? 'w-[calc(50%-0.5rem)]' :
                              'w-[calc(33.333%-0.667rem)]',
            )}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  )
}

function formatBRL(n: number | null | undefined) {
  if (n == null) return null
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(d: string | null | undefined) {
  if (!d) return null
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleDateString('pt-BR')
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ativo: { bg: 'bg-success/15', text: 'text-success', label: 'Ativo' },
  cancelado: { bg: 'bg-danger/15', text: 'text-danger', label: 'Cancelado' },
  concluido: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Concluído' },
}

function ContratoRichCard({
  contrato, onOpen, liveFollowers,
}: {
  contrato: Contrato
  onOpen: () => void
  liveFollowers?: number | null
}) {
  const status = STATUS_STYLES[contrato.status] ?? STATUS_STYLES.ativo
  const totalSlots = (contrato.entregas_totais ?? 0)
  const noPrazo = (contrato.entregas_no_prazo ?? 0)
  const entregasPct = totalSlots > 0 ? Math.round((noPrazo / totalSlots) * 100) : null

  // Crescimento de seguidores: prefere a contagem ao vivo (snapshot Instagram), depois `seguidores_fim` manual
  const seguidoresFim = liveFollowers ?? contrato.seguidores_fim ?? null
  const crescimentoLive = (contrato.seguidores_inicio != null && seguidoresFim != null)
    ? seguidoresFim - contrato.seguidores_inicio
    : (contrato.crescimento_seguidores ?? null)
  const crescimentoIsLive = liveFollowers != null && contrato.seguidores_inicio != null

  return (
    <div className="glass-card relative overflow-hidden p-5 space-y-4">
      <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/5 blur-3xl" />

      {/* Header */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-sm text-foreground truncate">
              {contrato.produto_nome || 'Contrato'}
            </h4>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wider', status.bg, status.text)}>
              {status.label}
            </span>
            {contrato.status_secundario && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-2xs font-semibold text-warning">
                {contrato.status_secundario}
              </span>
            )}
          </div>
          {contrato.notion_numero && (
            <p className="mt-0.5 text-2xs text-muted-foreground">#{contrato.notion_numero}</p>
          )}
        </div>
        <button
          onClick={onOpen}
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-2xs font-medium text-foreground hover:bg-muted hover:text-primary transition-colors"
          title="Abrir no Comissões"
        >
          Abrir <ExternalLink className="h-3 w-3" />
        </button>
      </div>

      {/* Resumo do contrato (texto livre do Notion) */}
      {contrato.resumo && (
        <div className="relative rounded-lg border-l-4 border-primary/40 bg-primary/5 px-3 py-2">
          <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Resumo</p>
          <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{contrato.resumo}</p>
        </div>
      )}

      {/* Financeiro hero */}
      <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-3">
          <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">Valor total</p>
          <p className="text-lg font-extrabold text-foreground tabular-nums leading-tight mt-0.5">
            {formatBRL(contrato.valor_total) ?? '—'}
          </p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">Parcela</p>
          <p className="text-sm font-bold text-foreground tabular-nums leading-tight mt-0.5">
            {contrato.num_parcelas > 0 ? `${contrato.num_parcelas}× ` : ''}{formatBRL(contrato.valor_parcela) ?? '—'}
          </p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">Entrada</p>
          <p className="text-sm font-bold text-foreground tabular-nums leading-tight mt-0.5">
            {formatBRL(contrato.entrada) ?? '—'}
          </p>
        </div>
        {contrato.percentual_aplicado > 0 && (
          <div className="rounded-xl bg-gradient-to-br from-success/10 to-success/5 border border-success/20 p-3">
            <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold inline-flex items-center gap-1">
              Comissão <span className="text-success font-bold">{contrato.percentual_aplicado}%</span>
            </p>
            <p className="text-sm font-bold text-success tabular-nums leading-tight mt-0.5">
              {formatBRL(contrato.valor_total * contrato.percentual_aplicado / 100) ?? '—'}
            </p>
          </div>
        )}
      </div>

      {/* Datas */}
      {(contrato.data_fechamento || contrato.vencimento || contrato.renovacao || contrato.plano_dias || contrato.pg_entrada) && (
        <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          {contrato.data_fechamento && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" /> Assinatura: <span className="text-foreground font-medium">{formatDate(contrato.data_fechamento)}</span>
            </span>
          )}
          {contrato.pg_entrada && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <DollarSign className="h-3 w-3" /> PG Entrada: <span className="text-foreground font-medium">{formatDate(contrato.pg_entrada) ?? contrato.pg_entrada}</span>
            </span>
          )}
          {contrato.vencimento && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" /> Vence: <span className="text-foreground font-medium">{formatDate(contrato.vencimento)}</span>
            </span>
          )}
          {contrato.renovacao && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" /> Renovação: <span className="text-foreground font-medium">{formatDate(contrato.renovacao) ?? contrato.renovacao}</span>
            </span>
          )}
          {contrato.plano_dias && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" /> Plano: <span className="text-foreground font-medium">{contrato.plano_dias}d</span>
              {contrato.semanas != null && <span className="text-muted-foreground">({contrato.semanas} sem.)</span>}
            </span>
          )}
        </div>
      )}

      {/* Bônus / Upgrade */}
      {contrato.bonus && (
        <div className="relative rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 flex items-start gap-2">
          <Award className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-2xs uppercase tracking-wider text-warning font-bold">Bônus / Upgrade</p>
            <p className="text-xs text-foreground mt-0.5">{contrato.bonus}</p>
          </div>
        </div>
      )}

      {/* Equipe */}
      {(contrato.estrategista_nome_raw || contrato.vendedor || contrato.treinador) && (
        <div className="relative pt-3 border-t border-border/60">
          <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Equipe</p>
          <div className="flex flex-wrap gap-1.5">
            {contrato.estrategista_nome_raw && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-2xs font-medium text-accent">
                <Award className="h-3 w-3" /> Estrat.: {contrato.estrategista_nome_raw}
              </span>
            )}
            {contrato.vendedor && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
                <Briefcase className="h-3 w-3" /> Vend.: {contrato.vendedor}
              </span>
            )}
            {contrato.treinador && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-2xs font-medium text-success">
                <Users className="h-3 w-3" /> Treinador(a): {contrato.treinador}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Performance */}
      {(contrato.seguidores_inicio || contrato.seguidores_fim || contrato.videos_postados || totalSlots > 0 || contrato.nps_vip) && (
        <div className="relative pt-3 border-t border-border/60">
          <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Performance
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(contrato.seguidores_inicio != null && seguidoresFim != null) && (
              <div className="rounded-lg bg-muted/40 p-2">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-2xs text-muted-foreground">Seguidores</p>
                  {crescimentoIsLive && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-success uppercase tracking-wider">
                      <span className="h-1 w-1 rounded-full bg-success animate-pulse" />
                      ao vivo
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-foreground tabular-nums">
                  {contrato.seguidores_inicio.toLocaleString('pt-BR')} → {seguidoresFim.toLocaleString('pt-BR')}
                </p>
                {crescimentoLive != null && (
                  <p className={cn(
                    'text-2xs font-bold tabular-nums',
                    crescimentoLive > 0 ? 'text-success' : crescimentoLive < 0 ? 'text-danger' : 'text-muted-foreground',
                  )}>
                    {crescimentoLive > 0 ? '+' : ''}{crescimentoLive.toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            )}
            {contrato.videos_postados != null && (
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-2xs text-muted-foreground">Vídeos</p>
                <p className="text-base font-bold text-foreground tabular-nums">{contrato.videos_postados}</p>
              </div>
            )}
            {totalSlots > 0 && (
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-2xs text-muted-foreground">Entregas</p>
                <p className="text-xs font-bold text-foreground tabular-nums">{noPrazo}/{totalSlots} no prazo</p>
                {entregasPct != null && (
                  <div className="mt-1 h-1 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        entregasPct >= 80 ? 'bg-success' : entregasPct >= 50 ? 'bg-warning' : 'bg-danger',
                      )}
                      style={{ width: `${entregasPct}%` }}
                    />
                  </div>
                )}
              </div>
            )}
            {contrato.nps_vip && (
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-2xs text-muted-foreground">NPS VIP</p>
                <p className="text-sm font-bold text-foreground">{contrato.nps_vip}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pagamento + flags */}
      <div className="relative flex flex-wrap items-center gap-1.5">
        {contrato.forma_pagamento && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-foreground">
            <DollarSign className="h-3 w-3" />
            {contrato.forma_pagamento}
          </span>
        )}
        {contrato.fat_bruto != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-2xs font-medium text-success">
            Fat. bruto: {formatBRL(contrato.fat_bruto)}
          </span>
        )}
        {contrato.venda_interna && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">Venda interna</span>}
        {contrato.venda_diretoria && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-2xs font-medium text-accent">Diretoria</span>}
        {contrato.link_clicksign && (
          <a
            href={contrato.link_clicksign}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-2xs font-medium text-primary hover:bg-muted transition-colors"
          >
            <FileText className="h-3 w-3" /> ClickSign <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>

      {contrato.observacoes && (
        <p className="relative text-xs text-muted-foreground border-l-2 border-border pl-2 italic">
          {contrato.observacoes}
        </p>
      )}
    </div>
  )
}

// Contract form fields
const contractFields = [
  { key: 'produto', label: 'Produto', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: ['ATIVO', 'INADIMPLENTE', 'FASE DE RENOVAÇÃO', 'CANCELADO', 'PAUSADO'] },
  { key: 'valor_entrada', label: 'Valor Entrada', type: 'text' },
  { key: 'num_parcelas', label: 'Nº Parcelas', type: 'number' },
  { key: 'valor_parcela', label: 'Valor Parcela', type: 'text' },
  { key: 'faturamento_bruto', label: 'Fat. Bruto', type: 'text' },
  { key: 'forma_pagamento', label: 'Forma Pagamento', type: 'text' },
  { key: 'plano_dias', label: 'Plano (dias)', type: 'number' },
  { key: 'data_assinatura', label: 'Data Assinatura', type: 'date' },
  { key: 'data_pg_entrada', label: 'PG Entrada', type: 'date' },
  { key: 'data_vencimento', label: 'Vencimento', type: 'date' },
  { key: 'data_renovacao', label: 'Renovação', type: 'date' },
  { key: 'vendedor', label: 'Vendedor', type: 'text' },
  { key: 'especialista', label: 'Especialista', type: 'text' },
  { key: 'treinador', label: 'Treinador(a)', type: 'text' },
  { key: 'funil', label: 'Funil', type: 'text' },
  { key: 'link_clicksign', label: 'Link ClickSign', type: 'text' },
  { key: 'bonus', label: 'Bônus', type: 'text' },
  { key: 'upgrade', label: 'Upgrade', type: 'text' },
  { key: 'cancelamento', label: 'Cancelamento', type: 'text' },
  { key: 'seguidores_inicio', label: 'Seguidores (início)', type: 'number' },
  { key: 'seguidores_fim', label: 'Seguidores (fim)', type: 'number' },
  { key: 'videos_postados', label: 'Vídeos postados', type: 'number' },
  { key: 'entregas_prazo', label: 'Entregas no prazo', type: 'number' },
  { key: 'entregas_totais', label: 'Entregas totais', type: 'number' },
  { key: 'nps', label: 'NPS', type: 'text' },
  { key: 'semanas', label: 'Semanas', type: 'number' },
] as const

function ContractFormModal({ initial, clientId, onClose }: { initial?: ClientContract; clientId: string; onClose: () => void }) {
  const isEdit = Boolean(initial?.id)
  const create = useCreateContract()
  const update = useUpdateContract()
  const [form, setForm] = useState<Record<string, string | number | boolean>>(() => {
    if (!initial) return { client_id: clientId }
    const obj: Record<string, string | number | boolean> = {}
    for (const f of contractFields) {
      const v = initial[f.key as keyof ClientContract]
      if (v != null) obj[f.key] = v as string | number | boolean
    }
    obj.venda_interna = initial.venda_interna ?? false
    obj.venda_diretoria = initial.venda_diretoria ?? false
    obj.financeiro_ok = initial.financeiro_ok ?? false
    obj.email_enviado = initial.email_enviado ?? false
    return obj
  })

  const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = { ...form, client_id: clientId }
    // Convert empty strings to null
    for (const [k, v] of Object.entries(payload)) {
      if (v === '') delete payload[k]
    }
    if (isEdit && initial?.id) {
      await update.mutateAsync({ id: initial.id, ...payload } as Partial<ClientContract> & { id: string })
    } else {
      await create.mutateAsync(payload as Partial<ClientContract> & { client_id: string })
    }
    onClose()
  }

  const mutation = isEdit ? update : create

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {contractFields.map(f => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-foreground mb-1">{f.label}</label>
            {f.type === 'select' ? (
              <select
                className={inputClass}
                value={String(form[f.key] ?? '')}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
              >
                <option value="">Selecione...</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                className={inputClass}
                value={String(form[f.key] ?? '')}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: f.type === 'number' ? (e.target.value ? Number(e.target.value) : '') : e.target.value }))}
              />
            )}
          </div>
        ))}
      </div>

      {/* Boolean flags */}
      <div className="grid grid-cols-2 gap-3">
        {(['venda_interna', 'venda_diretoria', 'financeiro_ok', 'email_enviado'] as const).map(key => (
          <label key={key} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form[key])}
              onChange={e => setForm(prev => ({ ...prev, [key]: e.target.checked }))}
              className="rounded border-input"
            />
            {key === 'venda_interna' ? 'Venda interna' : key === 'venda_diretoria' ? 'Venda diretoria' : key === 'financeiro_ok' ? 'Financeiro OK' : 'Email enviado'}
          </label>
        ))}
      </div>

      {mutation.error && (
        <p className="text-sm text-danger">{mutation.error instanceof Error ? mutation.error.message : 'Erro'}</p>
      )}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">Cancelar</button>
        <button type="submit" disabled={mutation.isPending}
          className="gradient-primary rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
          {mutation.isPending ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar contrato'}
        </button>
      </div>
    </form>
  )
}

export function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [produtoModalOpen, setProdutoModalOpen] = useState(false)
  const [produtoForm, setProdutoForm] = useState({ nome: '', descricao: '' })
  const [contractModalOpen, setContractModalOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<ClientContract | undefined>()
  // Visão 360 (§6 do brief): além do que já vivia aqui (contratos, produtos,
  // contatos), o cadastro central mostra o que o cliente tem nos outros apps —
  // financeiro, conversas e demandas.
  const [activeTab, setActiveTab] = useState<
    'contratos' | 'produtos' | 'financeiro' | 'conversas' | 'demandas' | 'contatos'
  >('contratos')

  const { data: client, isLoading } = useCliente(id ?? '')
  const { data: products } = useProdutosByClient(id ?? '')
  const { data: clientContacts } = useClientContacts(id)
  const { data: avatarMap } = useClientAvatars()
  const { data: followersMap } = useCurrentFollowers()
  const { data: contratosRich = [] } = useContratosByCliente(id)
  const avatarUrl = id ? avatarMap?.get(id) ?? null : null
  const liveFollowers = id ? followersMap?.get(id) ?? null : null
  const createProduto = useCreateProduto()
  const deleteContract = useDeleteContract()

  // Team assignments
  const { user: authUser } = useAuth()
  const { can } = usePermissoes()
  // Aqui `isAdmin` decide quem gerencia o time do cliente e a nota — é
  // atribuição de responsável, não administração do sistema.
  const isAdmin = can('clientes.atribuir', 'editar')
  const { data: allAssignments = [] } = useAssignments()
  const clientAssignments = allAssignments.filter(a => a.client_id === id)
  const { data: allUsers = [] } = useUsers()
  const createAssignment = useCreateAssignment()
  const deleteAssignment = useDeleteAssignment()
  const [addingMember, setAddingMember] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedTipo, setSelectedTipo] = useState<'estrategista' | 'atendimento'>('atendimento')

  const assignedUserIds = new Set(clientAssignments.map(a => a.user_id))
  const availableUsers = allUsers.filter(u => !assignedUserIds.has(u.id) && u.ativo)

  // Quem pode escrever retrospecto: admin, gerente ou estrategista vinculado
  const isEstrategistaDoCliente = clientAssignments.some(a => a.user_id === authUser?.id && a.tipo === 'estrategista')
  const canWriteRetrospecto = isAdmin || isEstrategistaDoCliente

  const contracts = client?.client_contracts ?? []

  // Vínculos nos outros apps — os contadores das abas novas. Ficam aqui (e não
  // dentro de cada aba) para o número aparecer antes de a pessoa clicar: é o
  // contador que revela que existe algo esperando ali.
  const { data: conversasDoCliente = [] } = useConversasDoCliente(id)
  const { data: demandasDoCliente = [] } = useDemandasDoCliente(id)
  const demandasAbertas = demandasDoCliente.filter(d => !d.concluida_em).length
  // O cast existe porque `pagamentos` chega como Json do Supabase, enquanto o
  // cálculo do fluxo declara a forma concreta da parcela. Os campos que importam
  // (id, status, pagamentos, datas) são os mesmos nos dois lados.
  const contratosFluxo = contratosRich as unknown as ContratoFluxo[]
  const parcelasDoCliente = useMemo(
    () => contratosFluxo.reduce((total, c) => total + parcelasDoContrato(c).length, 0),
    [contratosFluxo],
  )

  // Lista unificada de produtos: tabela `products` (legada) + produto_nome dos contratos ricos (Comissões)
  const produtosUnificados = useMemo(() => {
    const nomes = new Set<string>()
    for (const p of products ?? []) if (p.nome) nomes.add(p.nome)
    for (const c of contratosRich) if (c.produto_nome) nomes.add(c.produto_nome)
    return Array.from(nomes)
  }, [products, contratosRich])

  if (isLoading) {
    return <div className="glass-card h-64 shimmer" />
  }
  if (!client) {
    return <div className="text-muted-foreground">Cliente não encontrado.</div>
  }

  async function handleCreateProduto() {
    if (!produtoForm.nome || !id) return
    await createProduto.mutateAsync({ client_id: id, nome: produtoForm.nome, descricao: produtoForm.descricao || undefined })
    setProdutoModalOpen(false)
    setProdutoForm({ nome: '', descricao: '' })
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <PageHeader
        title={client.nome}
        backTo="/clientes"
        breadcrumb={[{ label: 'Clientes', href: '/clientes' }, { label: client.nome }]}
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => {
              const whatsapp = client.whatsapp || client.telefone
              if (whatsapp) {
                navigate(`/chat?novaConversa=1&nome=${encodeURIComponent(client.nome)}&whatsapp=${encodeURIComponent(whatsapp)}`)
              } else {
                navigate(`/chat?cliente=${encodeURIComponent(client.nome)}`)
              }
            }}
              className="flex items-center gap-2 rounded-lg gradient-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Abrir Chat</span>
            </button>
            <button onClick={() => setEditOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">Editar</span>
            </button>
          </div>
        }
      />

      {/* Hero header: avatar + nome + KPIs */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-5 sm:p-6">
        <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          {/* Avatar */}
          <div className="shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={client.nome}
                className="h-20 w-20 sm:h-24 sm:w-24 rounded-full object-cover border-4 border-card shadow-lg"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/30 text-2xl sm:text-3xl font-extrabold text-primary border-4 border-card shadow-lg">
                {client.nome.replace(/\[.*?\]/g, '').trim().split(/\s+/).filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <NotaBadge clientId={client.id} nota={client.nota ?? null} canEdit={isAdmin} />
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider',
                client.ativo ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
              )}>
                <span className={cn('h-1.5 w-1.5 rounded-full', client.ativo ? 'bg-success animate-pulse' : 'bg-muted-foreground/40')} />
                {client.ativo ? 'Ativo' : 'Inativo'}
              </span>
              {client.segmento && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-2xs font-semibold text-primary">
                  <Tag className="h-3 w-3" />
                  {client.segmento}
                </span>
              )}
              {client.nicho && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-2xs font-semibold text-primary">
                  <Target className="h-3 w-3" />
                  {client.nicho}
                </span>
              )}
            </div>
            {client.empresa && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                {client.empresa}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {client.whatsapp && (
                <a
                  href={`https://wa.me/${client.whatsapp.replace(/\D/g, '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-foreground hover:text-success transition-colors"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-success" />
                  <span className="font-mono">{client.whatsapp}</span>
                </a>
              )}
              {client.instagram && (
                <a
                  href={client.instagram.startsWith('http') ? client.instagram : `https://instagram.com/${client.instagram.replace('@', '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-foreground hover:text-pink-500 transition-colors"
                >
                  <Instagram className="h-3.5 w-3.5 text-pink-500" />
                  @{client.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/+$/, '')}
                </a>
              )}
              {client.email && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  {client.email}
                </span>
              )}
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
            <div className="rounded-xl border border-border bg-card/60 backdrop-blur px-3 py-2 text-center min-w-[80px]">
              <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">Contratos</p>
              <p className="text-xl font-extrabold text-foreground tabular-nums leading-tight">{contracts.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/60 backdrop-blur px-3 py-2 text-center min-w-[80px]">
              <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">Produtos</p>
              <p className="text-xl font-extrabold text-foreground tabular-nums leading-tight">{produtosUnificados.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/60 backdrop-blur px-3 py-2 text-center min-w-[80px]">
              <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">Equipe</p>
              <p className="text-xl font-extrabold text-foreground tabular-nums leading-tight">{clientAssignments.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,460px)]">
        {/* Side cards: Info + Contact + Details + Retrospecto + Team — em carrossel à direita */}
        <div className="order-2 xl:order-2 min-w-0"><SideCardCarousel>
          {/* Basic info card */}
          <div className="group rounded-2xl border border-border bg-card p-4 space-y-2 transition-all hover:border-primary/30 hover:shadow-md">
            <InfoCardHeader icon={Building2} title="Informações" accent="primary" />
            <div className="space-y-0.5">
              <InfoField icon={Building2} label="Empresa" value={client.empresa} />
              <InfoField icon={Briefcase} label="Razão Social" value={client.razao_social} />
              <InfoField icon={Hash} label="CPF/CNPJ" value={client.cnpj} />
              <InfoField icon={Tag} label="Segmento" value={client.segmento} />
              <InfoField icon={Target} label="Nicho" value={client.nicho} />
            </div>
          </div>

          {/* Contact card */}
          <div className="group rounded-2xl border border-border bg-card p-4 space-y-2 transition-all hover:border-accent/30 hover:shadow-md">
            <InfoCardHeader icon={MessageSquare} title="Contato" accent="accent" />
            <div className="space-y-0.5">
              <InfoField icon={Mail} label="Email" value={client.email}
                href={client.email ? `mailto:${client.email}` : undefined} />
              <InfoField icon={Phone} label="Telefone" value={client.telefone} />
              <InfoField icon={MessageSquare} label="WhatsApp" value={client.whatsapp}
                href={client.whatsapp ? `https://wa.me/${client.whatsapp.replace(/\D/g, '')}` : undefined} />
              <InfoField icon={Instagram} label="Instagram" value={client.instagram}
                href={client.instagram?.startsWith('http') ? client.instagram : client.instagram ? `https://instagram.com/${client.instagram.replace('@', '')}` : undefined} />
            </div>
          </div>

          {/* Details card */}
          <div className="group rounded-2xl border border-border bg-card p-4 space-y-2 transition-all hover:border-warning/30 hover:shadow-md">
            <InfoCardHeader icon={StickyNote} title="Detalhes" accent="warning" />
            <div className="space-y-0.5">
              <InfoField icon={MapPin} label="Endereço" value={client.endereco} />
              <InfoField icon={DollarSign} label="Faturamento" value={client.faturamento} />
              <InfoField icon={Globe} label="Posicionamento" value={client.posicionamento} />
              <InfoField icon={StickyNote} label="Notas" value={client.notas} />
            </div>
          </div>

          {/* Retrospecto / Anotações */}
          <ClienteRetrospecto clientId={client.id} canWrite={canWriteRetrospecto} />

          {/* Team / Equipe responsável */}
          <div className="group rounded-2xl border border-border bg-card p-4 space-y-2 transition-all hover:border-success/30 hover:shadow-md">
            <InfoCardHeader
              icon={Users}
              title="Estrategista vinculado"
              accent="success"
              action={isAdmin && !addingMember ? (
                <button
                  onClick={() => setAddingMember(true)}
                  className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
                >
                  <UserPlus className="h-3 w-3" />
                  Vincular
                </button>
              ) : undefined}
            />

            <div className="space-y-2">
              {clientAssignments.map(a => {
                const isStrat = a.tipo === 'estrategista'
                return (
                  <div
                    key={a.id}
                    className={cn(
                      'group/member flex items-center justify-between rounded-xl border px-3 py-2.5 transition-colors',
                      isStrat
                        ? 'border-primary/20 bg-primary/5 hover:bg-primary/10'
                        : 'border-success/20 bg-success/5 hover:bg-success/10',
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2',
                        isStrat ? 'bg-primary/20 text-primary ring-primary/30' : 'bg-success/20 text-success ring-success/30',
                      )}>
                        {a.users?.nome?.charAt(0)?.toUpperCase() ?? '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{a.users?.nome ?? 'Usuário removido'}</p>
                        <p className={cn(
                          'text-[10px] font-bold uppercase tracking-wider',
                          isStrat ? 'text-primary' : 'text-success',
                        )}>
                          {isStrat ? 'Estrategista' : 'Atendimento'}
                        </p>
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => deleteAssignment.mutate(a.id)}
                        disabled={deleteAssignment.isPending}
                        className="rounded-md p-1.5 text-muted-foreground opacity-0 group-hover/member:opacity-100 hover:text-danger hover:bg-danger/10 transition-all disabled:opacity-50"
                        title="Remover vínculo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
              {clientAssignments.length === 0 && !addingMember && (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-4 text-center">
                  <Users className="h-5 w-5 mx-auto text-muted-foreground/50 mb-1" />
                  <p className="text-xs text-muted-foreground">Nenhum especialista vinculado.</p>
                  {isAdmin && (
                    <button
                      onClick={() => setAddingMember(true)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <UserPlus className="h-3 w-3" /> Vincular agora
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Add member form (admin only) */}
            {isAdmin && addingMember && (
              <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <select
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecione um usuário...</option>
                  {availableUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.nome} ({u.perfil})</option>
                  ))}
                </select>
                <select
                  value={selectedTipo}
                  onChange={e => setSelectedTipo(e.target.value as 'estrategista' | 'atendimento')}
                  className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="atendimento">Atendimento</option>
                  <option value="estrategista">Estrategista</option>
                </select>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => { setAddingMember(false); setSelectedUserId('') }}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (selectedUserId && id) {
                        createAssignment.mutate(
                          { user_id: selectedUserId, client_id: id, tipo: selectedTipo },
                          { onSuccess: () => { setSelectedUserId(''); setAddingMember(false) } },
                        )
                      }
                    }}
                    disabled={!selectedUserId || createAssignment.isPending}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold gradient-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {createAssignment.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </SideCardCarousel></div>

        {/* Tabs section: Contracts + Products + Outros contatos — coluna principal à esquerda */}
        <div className="order-1 xl:order-1 min-w-0 space-y-3 sm:space-y-4 lg:space-y-6">
          {/* Tabs nav */}
          <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
            {([
              { id: 'contratos', label: 'Contratos', icon: ClipboardList, count: contratosRich.length + contracts.length },
              { id: 'produtos', label: 'Produtos', icon: Package, count: produtosUnificados.length },
              { id: 'financeiro', label: 'Financeiro', icon: Wallet, count: parcelasDoCliente },
              { id: 'conversas', label: 'Conversas', icon: MessageSquare, count: conversasDoCliente.length },
              { id: 'demandas', label: 'Demandas', icon: Headphones, count: demandasAbertas },
              { id: 'contatos', label: 'Outros contatos', icon: Smartphone, count: clientContacts?.length ?? 0 },
            ] as const).map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  <span className={cn(
                    'rounded-full px-1.5 py-0.5 text-2xs font-semibold',
                    isActive ? 'bg-primary-muted text-primary' : 'bg-muted text-muted-foreground',
                  )}>
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Tab: Contratos */}
          {activeTab === 'contratos' && (
          <div className="space-y-4">
            {/* Contratos ricos (tabela `contratos` - módulo Comissões) */}
            {contratosRich.length > 0 && (
              <div>
                <SectionTitle icon={ClipboardList} title={`Contratos (${contratosRich.length})`}>
                  <button
                    onClick={() => navigate('/contratos/novo')}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Novo no Comissões
                  </button>
                </SectionTitle>
                <div className="grid grid-cols-1 gap-3 sm:gap-4">
                  {contratosRich.map(c => (
                    <ContratoRichCard
                      key={c.id}
                      contrato={c}
                      liveFollowers={liveFollowers?.followers}
                      onOpen={() => navigate(`/contratos/${c.id}`)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Contratos legados (tabela `client_contracts`) — só aparece se ainda existirem */}
            {contracts.length > 0 && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    <ClipboardList className="h-3 w-3" />
                    Legados ({contracts.length})
                    <span className="rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning normal-case">
                      origem antiga
                    </span>
                  </h3>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:gap-4">
                  {contracts.map(c => (
                    <ContractCard
                      key={c.id}
                      contract={c}
                      isAdmin={isAdmin}
                      onEdit={() => { setEditingContract(c); setContractModalOpen(true) }}
                      onDelete={() => { if (confirm('Remover este contrato?')) deleteContract.mutate({ id: c.id, client_id: c.client_id }) }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {contratosRich.length === 0 && contracts.length === 0 && (
              <div className="glass-card flex flex-col items-center justify-center py-8 text-center">
                <ClipboardList className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhum contrato cadastrado.</p>
                <button
                  onClick={() => navigate('/contratos/novo')}
                  className="mt-3 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Criar contrato no Comissões
                </button>
                {isAdmin && (
                  <button
                    onClick={() => { setEditingContract(undefined); setContractModalOpen(true) }}
                    className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Adicionar contrato legado (não recomendado)
                  </button>
                )}
              </div>
            )}
          </div>
          )}

          {/* Tab: Financeiro — parcelas do cronograma dos contratos ativos */}
          {activeTab === 'financeiro' && <AbaFinanceiro contratos={contratosFluxo} />}

          {/* Tab: Conversas — o que vive no app de Chat */}
          {activeTab === 'conversas' && <AbaConversas clientId={id} />}

          {/* Tab: Demandas — o que vive no app de Atendimento */}
          {activeTab === 'demandas' && <AbaDemandas clientId={id} />}

          {/* Tab: Produtos */}
          {activeTab === 'produtos' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Package className="h-4 w-4 text-accent" />
                Produtos ({produtosUnificados.length})
              </h3>
              <button onClick={() => setProdutoModalOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors">
                <Plus className="h-3.5 w-3.5" />
                Adicionar produto (entregáveis)
              </button>
            </div>

            {/* Produtos vindos de contratos (Comissões) — sem entregáveis */}
            {(() => {
              const fromContracts = produtosUnificados.filter(nome => !(products ?? []).some(p => p.nome === nome))
              if (fromContracts.length === 0) return null
              return (
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Em contratos
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {fromContracts.map(nome => {
                      const contratosDoProduto = contratosRich.filter(c => c.produto_nome === nome)
                      return (
                        <div key={nome} className="rounded-lg border border-border bg-card p-3 flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <Package className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm text-foreground truncate">{nome}</p>
                            <p className="text-2xs text-muted-foreground mt-0.5">
                              {contratosDoProduto.length} contrato{contratosDoProduto.length !== 1 ? 's' : ''} ativo{contratosDoProduto.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Produtos legados com entregáveis */}
            {products && products.length > 0 && (
              <div>
                <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                  Com entregáveis
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {products.map(p => (
                    <ProdutoCard key={p.id} product={p} onClick={() => navigate(`/produtos/${p.id}`)} />
                  ))}
                </div>
              </div>
            )}

            {produtosUnificados.length === 0 && (
              <div className="glass-card flex flex-col items-center justify-center py-10 text-center">
                <Package className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhum produto cadastrado ainda.</p>
              </div>
            )}
          </div>
          )}

          {/* Tab: Outros contatos (chat_contacts) */}
          {activeTab === 'contatos' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Smartphone className="h-4 w-4 text-accent" />
                  Outros contatos ({clientContacts?.length ?? 0})
                </h3>
              </div>
              {clientContacts && clientContacts.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {clientContacts.map(c => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/chat?contato=${c.id}`)}
                      className="glass-card entity-card-hover w-full text-left p-4 flex items-center gap-3"
                    >
                      {c.foto_url ? (
                        <img src={c.foto_url} alt={c.nome ?? c.numero_whatsapp}
                          className="h-10 w-10 rounded-full object-cover border border-border shrink-0"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-muted shrink-0">
                          <Smartphone className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-foreground truncate">
                          {c.nome ?? 'Sem nome'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{c.numero_whatsapp}</p>
                      </div>
                      <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="glass-card flex flex-col items-center justify-center py-10 text-center">
                  <Smartphone className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Nenhum contato de WhatsApp vinculado.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Conversas iniciadas no chat com este cliente aparecem aqui.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit client modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar cliente" size="lg">
        <ClienteForm initial={client} onClose={() => setEditOpen(false)} />
      </Modal>

      {/* Contract modal */}
      <Modal open={contractModalOpen} onClose={() => setContractModalOpen(false)} title={editingContract ? 'Editar contrato' : 'Novo contrato'} size="lg">
        <ContractFormModal
          initial={editingContract}
          clientId={id ?? ''}
          onClose={() => setContractModalOpen(false)}
        />
      </Modal>

      {/* New produto modal */}
      <Modal open={produtoModalOpen} onClose={() => setProdutoModalOpen(false)} title="Novo produto" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nome *</label>
            <input required value={produtoForm.nome} onChange={e => setProdutoForm(p => ({ ...p, nome: e.target.value }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ex: Social Media Premium" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Descrição</label>
            <textarea value={produtoForm.descricao} onChange={e => setProdutoForm(p => ({ ...p, descricao: e.target.value }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={3} placeholder="Descrição do produto..." />
          </div>
          {createProduto.error && (
            <p className="text-sm text-danger">{createProduto.error instanceof Error ? createProduto.error.message : 'Erro'}</p>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setProdutoModalOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">Cancelar</button>
            <button onClick={handleCreateProduto} disabled={!produtoForm.nome || createProduto.isPending}
              className="gradient-primary rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
              {createProduto.isPending ? 'Criando...' : 'Criar produto'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
