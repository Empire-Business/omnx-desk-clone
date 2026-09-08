import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useEntregas } from '@/hooks/useEntregas'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { DeliveryWithDetails } from '@/types/database'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function toLocalDateString(dateStr: string): string {
  // Parse YYYY-MM-DD safely without timezone shift
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function buildCalendarDays(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = firstDay.getDay() // 0 = Sunday
  const totalDays = lastDay.getDate()

  const cells: Array<Date | null> = []

  // Leading nulls
  for (let i = 0; i < startDow; i++) cells.push(null)

  // Actual days
  for (let d = 1; d <= totalDays; d++) {
    cells.push(new Date(year, month, d))
  }

  // Trailing nulls to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  return cells
}

// ---------------------------------------------------------------------------
// Mini delivery chip inside a calendar cell
// ---------------------------------------------------------------------------
interface DayChipProps {
  delivery: DeliveryWithDetails
}

function DayChip({ delivery }: DayChipProps) {
  const navigate = useNavigate()
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigate(`/portal/entregas/${delivery.id}`)
      }}
      title={delivery.titulo}
      className="w-full truncate rounded bg-primary/10 px-1.5 py-0.5 text-left text-2xs font-medium text-primary hover:bg-primary/20 transition-colors"
    >
      {delivery.titulo}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PortalCalendarioPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

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

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  // Build lookup: "YYYY-MM-DD" → DeliveryWithDetails[]
  const byDate = (entregas ?? []).reduce<Record<string, DeliveryWithDetails[]>>(
    (acc, d) => {
      if (!d.prazo) return acc
      const key = toLocalDateString(d.prazo)
      acc[key] = [...(acc[key] ?? []), d]
      return acc
    },
    {},
  )

  const withoutDate = (entregas ?? []).filter((d) => !d.prazo)

  const calendarDays = buildCalendarDays(viewYear, viewMonth)

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Calendário de Entregas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visualize suas entregas organizadas por prazo.
        </p>
      </div>

      {/* Month navigator */}
      <div className="glass-card overflow-hidden overflow-x-auto">
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 border-b border-border">
          <button
            onClick={prevMonth}
            className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <h2 className="text-base font-bold text-foreground">
            {MONTHS_PT[viewMonth]} {viewYear}
          </h2>

          <button
            onClick={nextMonth}
            className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-2xs font-semibold text-muted-foreground uppercase tracking-wide"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {isLoading ? (
          <div className="grid grid-cols-7 gap-px bg-border">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-24 bg-card shimmer" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-px bg-border">
            {calendarDays.map((date, idx) => {
              if (!date) {
                return <div key={`empty-${idx}`} className="h-24 bg-card/50" />
              }

              const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
              const dayItems = byDate[key] ?? []
              const isToday = key === todayKey

              return (
                <div
                  key={key}
                  className={cn(
                    'min-h-[96px] bg-card p-1.5 flex flex-col gap-1',
                    isToday && 'bg-primary/5',
                  )}
                >
                  <span
                    className={cn(
                      'self-end flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                      isToday
                        ? 'gradient-primary text-primary-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {dayItems.slice(0, 3).map((d) => (
                      <DayChip key={d.id} delivery={d} />
                    ))}
                    {dayItems.length > 3 && (
                      <span className="text-2xs text-muted-foreground pl-1">
                        +{dayItems.length - 3} mais
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Deliveries without a date */}
      {!isLoading && withoutDate.length > 0 && (
        <div className="glass-card p-3 sm:p-4 lg:p-5">
          <h2 className="text-sm font-bold text-foreground mb-3">
            Sem data definida
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-2xs font-bold text-muted-foreground">
              {withoutDate.length}
            </span>
          </h2>
          <div className="divide-y divide-border">
            {withoutDate.map((delivery) => (
              <button
                key={delivery.id}
                onClick={() => navigate(`/portal/entregas/${delivery.id}`)}
                className="flex w-full items-center justify-between gap-4 py-3 text-left hover:bg-muted/40 -mx-1 px-1 rounded-lg transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {delivery.titulo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {delivery.deliverables.nome}
                  </p>
                </div>
                <StatusBadge status={delivery.status} size="sm" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
