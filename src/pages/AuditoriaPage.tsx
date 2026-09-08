import { useState } from 'react'
import {
  Shield, Search, Filter, ChevronDown, User, Clock, FileText,
  AlertCircle, LogIn, LogOut, Plus, Pencil, Trash2, Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuditLogs } from '@/hooks/useAuditLog'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuditFilters {
  acao?: string
  entidade?: string
  from?: string
  to?: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ACAO_OPTIONS = [
  { value: '', label: 'Todas as ações' },
  { value: 'create', label: 'Criar' },
  { value: 'update', label: 'Atualizar' },
  { value: 'delete', label: 'Excluir' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
]

const ENTIDADE_OPTIONS = [
  { value: '', label: 'Todas as entidades' },
  { value: 'delivery', label: 'Entrega' },
  { value: 'client', label: 'Cliente' },
  { value: 'conversation', label: 'Conversa' },
  { value: 'user', label: 'Usuário' },
  { value: 'bot', label: 'Bot' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'api_key', label: 'API Key' },
  { value: 'campaign', label: 'Campanha' },
  { value: 'template', label: 'Template' },
]

const ACAO_BADGE: Record<string, { label: string; classes: string; icon: React.ElementType }> = {
  create:  { label: 'Criar',     classes: 'bg-success-light text-success', icon: Plus },
  update:  { label: 'Atualizar', classes: 'bg-primary-muted text-primary', icon: Pencil },
  delete:  { label: 'Excluir',   classes: 'bg-danger-light text-danger',   icon: Trash2 },
  login:   { label: 'Login',     classes: 'bg-info-light text-info',       icon: LogIn },
  logout:  { label: 'Logout',    classes: 'bg-info-light text-info',       icon: LogOut },
}

const PERFIL_BADGE: Record<string, string> = {
  admin:        'bg-danger-light text-danger',
  estrategista: 'bg-primary-muted text-primary',
  designer:     'bg-warning-light text-warning',
  social_media: 'bg-info-light text-info',
  cliente:      'bg-success-light text-success',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function truncateJson(obj: Record<string, unknown>, maxLen = 120): string {
  const str = JSON.stringify(obj)
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

// ─── Shimmer ────────────────────────────────────────────────────────────────

function Shimmer() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="glass-card h-14 rounded-xl" />
      <div className="glass-card h-96 rounded-xl" />
    </div>
  )
}

// ─── Expandable Details Row ─────────────────────────────────────────────────

function DetailsCell({ detalhes }: { detalhes: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)
  const hasContent = Object.keys(detalhes).length > 0
  const jsonStr = JSON.stringify(detalhes, null, 2)

  if (!hasContent) {
    return <span className="text-muted-foreground text-xs">--</span>
  }

  return (
    <div className="max-w-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group"
      >
        <Eye className="h-3 w-3" />
        <span className="font-mono truncate max-w-[200px]">
          {expanded ? 'Recolher' : truncateJson(detalhes)}
        </span>
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>
      {expanded && (
        <pre className="mt-2 rounded-lg bg-muted/50 border border-border p-3 text-[11px] font-mono text-foreground overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
          {jsonStr}
        </pre>
      )}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export function AuditoriaPage() {
  const [filters, setFilters] = useState<AuditFilters>({})

  const activeFilters: AuditFilters = {
    ...(filters.acao ? { acao: filters.acao } : {}),
    ...(filters.entidade ? { entidade: filters.entidade } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
  }

  const { data: logs = [], isLoading } = useAuditLogs(
    Object.keys(activeFilters).length > 0 ? activeFilters : undefined,
  )

  const hasActiveFilters = !!(filters.acao || filters.entidade || filters.from || filters.to)

  function clearFilters() {
    setFilters({})
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 animate-fade-in">
      <PageHeader
        title="Auditoria"
        description="Registro completo de ações realizadas no sistema."
      />

      {/* ── Filter Bar ──────────────────────────────────────────────── */}
      <div className="glass-card p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-end gap-3 sm:gap-4">
          {/* Ação */}
          <div className="space-y-1.5 min-w-[160px]">
            <label className="flex items-center gap-1.5 font-mono text-[11px] tracking-wider uppercase text-muted-foreground">
              <Filter className="h-3 w-3" />
              Ação
            </label>
            <select
              value={filters.acao ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, acao: e.target.value || undefined }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
            >
              {ACAO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Entidade */}
          <div className="space-y-1.5 min-w-[180px]">
            <label className="flex items-center gap-1.5 font-mono text-[11px] tracking-wider uppercase text-muted-foreground">
              <FileText className="h-3 w-3" />
              Entidade
            </label>
            <select
              value={filters.entidade ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, entidade: e.target.value || undefined }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
            >
              {ENTIDADE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Período: De */}
          <div className="space-y-1.5 min-w-[160px]">
            <label className="flex items-center gap-1.5 font-mono text-[11px] tracking-wider uppercase text-muted-foreground">
              <Clock className="h-3 w-3" />
              De
            </label>
            <input
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
            />
          </div>

          {/* Período: Até */}
          <div className="space-y-1.5 min-w-[160px]">
            <label className="flex items-center gap-1.5 font-mono text-[11px] tracking-wider uppercase text-muted-foreground">
              <Clock className="h-3 w-3" />
              Até
            </label>
            <input
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
            />
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <Shimmer />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="Nenhum registro encontrado"
          description={
            hasActiveFilters
              ? 'Nenhum log corresponde aos filtros aplicados. Tente ajustar os critérios de busca.'
              : 'Ainda não há registros de auditoria no sistema.'
          }
          action={
            hasActiveFilters ? (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
              >
                <Search className="h-4 w-4" />
                Limpar filtros
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Results count */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            <span>
              <strong className="text-foreground">{logs.length}</strong> registro{logs.length !== 1 ? 's' : ''} encontrado{logs.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Table */}
          <div className="glass-card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 sm:px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    Data/Hora
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    Usuário
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    Ação
                  </th>
                  <th className="hidden md:table-cell px-3 sm:px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    Entidade
                  </th>
                  <th className="hidden lg:table-cell px-3 sm:px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    Detalhes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => {
                  const acaoConfig = ACAO_BADGE[log.acao] ?? {
                    label: log.acao,
                    classes: 'bg-muted text-muted-foreground',
                    icon: FileText,
                  }
                  const AcaoIcon = acaoConfig.icon
                  const perfilClasses = PERFIL_BADGE[log.user_perfil] ?? 'bg-muted text-muted-foreground'

                  return (
                    <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                      {/* Data/Hora */}
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-mono text-muted-foreground">
                          {formatDateTime(log.criado_em)}
                        </span>
                      </td>

                      {/* Usuário */}
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted shrink-0">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {log.user_nome}
                            </p>
                            <span
                              className={cn(
                                'inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-mono tracking-wider uppercase font-medium',
                                perfilClasses,
                              )}
                            >
                              {log.user_perfil}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Ação */}
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-mono tracking-wider uppercase font-medium',
                            acaoConfig.classes,
                          )}
                        >
                          <AcaoIcon className="h-3 w-3" />
                          {acaoConfig.label}
                        </span>
                      </td>

                      {/* Entidade */}
                      <td className="hidden md:table-cell px-3 sm:px-4 py-3 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <p className="text-sm text-foreground">{log.entidade}</p>
                          {log.entidade_id && (
                            <p className="text-[10px] font-mono text-muted-foreground truncate max-w-[140px]">
                              {log.entidade_id}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Detalhes */}
                      <td className="hidden lg:table-cell px-3 sm:px-4 py-3">
                        <DetailsCell detalhes={log.detalhes} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default AuditoriaPage
