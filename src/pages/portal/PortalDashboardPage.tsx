import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileCheck, Clock, CheckCircle, Radio, ArrowRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useEntregas } from '@/hooks/useEntregas'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import type { DeliveryStatus } from '@/types/database'

export function PortalDashboardPage() {
  const { user } = useAuth()

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

  const { data: entregas, isLoading } = useEntregas(
    assignment?.client_id ? { clientId: assignment.client_id } : undefined,
  )

  const counts = (entregas ?? []).reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1
    return acc
  }, {})

  const recent = (entregas ?? []).slice(0, 5)

  const kpis: Array<{
    label: string
    value: number
    icon: React.ElementType
    color: string
    bg: string
    status?: DeliveryStatus
    href: string
  }> = [
    {
      label: 'Total de entregas',
      value: entregas?.length ?? 0,
      icon: FileCheck,
      color: 'text-area-delivery',
      bg: 'bg-area-delivery-muted',
      href: '/portal/entregas',
    },
    {
      label: 'Aguardando aprovação',
      value: counts['aguardando_aprovacao'] ?? 0,
      icon: Clock,
      color: 'text-warning',
      bg: 'bg-warning-light',
      status: 'aguardando_aprovacao',
      href: '/portal/entregas?status=aguardando_aprovacao',
    },
    {
      label: 'Aprovadas',
      value: counts['aprovado'] ?? 0,
      icon: CheckCircle,
      color: 'text-success',
      bg: 'bg-success-light',
      status: 'aprovado',
      href: '/portal/entregas?status=aprovado',
    },
    {
      label: 'Publicadas',
      value: counts['publicado'] ?? 0,
      icon: Radio,
      color: 'text-area-delivery',
      bg: 'bg-area-delivery-muted',
      status: 'publicado',
      href: '/portal/entregas?status=publicado',
    },
  ]

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 animate-fade-in">
      {/* Welcome */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">
          Olá, {user?.nome?.split(' ')[0] ?? 'Cliente'}!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aqui está um resumo das suas entregas.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const isClickable = Boolean(kpi.status)
          const inner = (
            <div className="glass-card flex items-start gap-4 p-5 transition-all hover:shadow-lg">
              <div className={`rounded-lg p-2.5 ${kpi.bg}`}>
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                {isLoading ? (
                  <div className="mt-1 h-7 w-12 shimmer rounded" />
                ) : (
                  <p className="mt-1 text-2xl font-bold text-foreground">{kpi.value}</p>
                )}
              </div>
              {isClickable && (
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              )}
            </div>
          )

          return isClickable ? (
            <Link key={kpi.label} to={kpi.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={kpi.label}>{inner}</div>
          )
        })}
      </div>

      {/* Recent deliveries */}
      <div className="glass-card p-3 sm:p-4 lg:p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-4">
          <h2 className="text-base font-bold text-foreground">Entregas recentes</h2>
          <Link
            to="/portal/entregas"
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
          >
            Ver todas
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 shimmer rounded-lg" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma entrega encontrada.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {recent.map((delivery) => (
              <Link
                key={delivery.id}
                to={`/portal/entregas/${delivery.id}`}
                className="flex items-center justify-between py-3 gap-4 hover:bg-muted/40 -mx-1 px-1 rounded-lg transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {delivery.titulo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {delivery.prazo
                      ? `Prazo: ${new Date(delivery.prazo).toLocaleDateString('pt-BR')}`
                      : 'Sem prazo'}
                  </p>
                </div>
                <StatusBadge status={delivery.status} size="sm" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="flex justify-center">
        <Link
          to="/portal/entregas"
          className="gradient-primary inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
        >
          Ver todas as entregas
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
