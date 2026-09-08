import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useEntregas } from '@/hooks/useEntregas'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { DeliveryStatus } from '@/types/database'

const STATUS_FILTERS: Array<{ value: DeliveryStatus | 'todos'; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'aguardando_aprovacao', label: 'Aguardando' },
  { value: 'em_revisao', label: 'Em revisão' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'reprovado', label: 'Reprovado' },
  { value: 'publicado', label: 'Publicado' },
]

export function PortalEntregasPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState<DeliveryStatus | 'todos'>(
    (searchParams.get('status') as DeliveryStatus) ?? 'todos',
  )

  useEffect(() => {
    const paramStatus = searchParams.get('status') as DeliveryStatus | null
    if (paramStatus && STATUS_FILTERS.some((f) => f.value === paramStatus)) {
      setStatus(paramStatus)
    }
  }, [searchParams])

  const { data: assignment } = useQuery({
    queryKey: ['my-assignment', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('client_assignments')
        .select('client_id')
        .eq('user_id', user!.id)
        .limit(1)
        .single()
      return data
    },
    enabled: Boolean(user?.id),
  })

  const clientId = assignment?.client_id

  const { data: all } = useEntregas(clientId ? { clientId } : undefined)
  const { data: filtered, isLoading } = useEntregas(
    clientId
      ? { clientId, ...(status !== 'todos' ? { status } : {}) }
      : undefined,
  )

  const counts = (all ?? []).reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1
    return acc
  }, {})

  function handleStatusChange(val: DeliveryStatus | 'todos') {
    setStatus(val)
    if (val === 'todos') {
      setSearchParams({})
    } else {
      setSearchParams({ status: val })
    }
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Minhas Entregas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {all ? `${all.length} entrega${all.length !== 1 ? 's' : ''} no total` : 'Carregando...'}
        </p>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleStatusChange(value)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
              status === value
                ? 'gradient-primary text-primary-foreground shadow-sm'
                : 'glass-card text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-2xs font-bold',
                status === value
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {value === 'todos' ? (all?.length ?? 0) : (counts[value] ?? 0)}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="glass-card divide-y divide-border overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 shimmer" />
          ))}
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <EmptyState
          icon={FileCheck}
          title="Nenhuma entrega encontrada"
          description={
            status !== 'todos'
              ? 'Nenhuma entrega com este status.'
              : 'Você ainda não possui entregas.'
          }
        />
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Título
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground md:table-cell">
                  Entregável
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground lg:table-cell">
                  Prazo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((delivery) => (
                <tr
                  key={delivery.id}
                  onClick={() => navigate(`/portal/entregas/${delivery.id}`)}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{delivery.titulo}</p>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <p className="text-sm text-muted-foreground">{delivery.deliverables.nome}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={delivery.status} size="sm" />
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <p className="text-sm text-muted-foreground">
                      {delivery.prazo
                        ? new Date(delivery.prazo).toLocaleDateString('pt-BR')
                        : '—'}
                    </p>
                  </td>
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
