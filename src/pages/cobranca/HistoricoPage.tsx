import { useState } from 'react'
import { History } from 'lucide-react'
import { useCobrancaSends } from '@/hooks/useCobranca'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn, formatPhone } from '@/lib/utils'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sendStatusBadge(s: string) {
  switch (s) {
    case 'enviado': return 'bg-success-light text-success'
    case 'enviando': return 'bg-info-light text-info'
    case 'falha': return 'bg-danger-light text-danger'
    default: return 'bg-muted text-muted-foreground'
  }
}

export function HistoricoPage() {
  const [filterStatus, setFilterStatus] = useState('')
  const { data: sends, isLoading } = useCobrancaSends()

  const filtered = sends
    ? filterStatus
      ? sends.filter((s) => s.status_envio === filterStatus)
      : sends
    : []

  const selectCls = 'rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 animate-fade-in">
      <PageHeader
        title="Histórico de envios"
        description="Últimos 200 envios registrados"
      />

      <div className="flex items-center gap-3">
        <select
          className={selectCls}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="enviado">Enviado</option>
          <option value="enviando">Enviando</option>
          <option value="falha">Falha</option>
        </select>
        {sends && (
          <p className="text-xs text-muted-foreground">
            {filterStatus ? `${filtered.length} de ${sends.length}` : `${sends.length}`} envio{sends.length !== 1 ? 's' : ''} — últimos 200
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 shimmer rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nenhum envio encontrado"
          description={filterStatus ? 'Tente remover o filtro de status.' : 'Ainda não há envios registrados.'}
        />
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 sm:px-4 py-3 text-xs font-medium text-muted-foreground">Devedor</th>
                  <th className="hidden sm:table-cell px-3 sm:px-4 py-3 text-xs font-medium text-muted-foreground">WhatsApp</th>
                  <th className="hidden md:table-cell px-3 sm:px-4 py-3 text-xs font-medium text-muted-foreground">Passo</th>
                  <th className="px-3 sm:px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-3 sm:px-4 py-3 text-xs font-medium text-muted-foreground">Enviado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-3 sm:px-4 py-3 font-medium text-foreground">
                      {s.cobranca_devedores?.nome ?? '—'}
                    </td>
                    <td className="hidden sm:table-cell px-3 sm:px-4 py-3 text-muted-foreground">
                      {formatPhone(s.cobranca_devedores?.numero_whatsapp) ?? '—'}
                    </td>
                    <td className="hidden md:table-cell px-3 sm:px-4 py-3 text-center text-muted-foreground">{s.passo}</td>
                    <td className="px-3 sm:px-4 py-3">
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', sendStatusBadge(s.status_envio))}>
                        {s.status_envio}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-muted-foreground">{fmtDate(s.enviado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
