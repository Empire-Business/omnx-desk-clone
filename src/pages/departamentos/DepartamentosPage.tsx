import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2,
  Plus,
  Users,
  MessageSquare,
  Clock,
  ChevronRight,
  Circle,
  Crown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { useDepartments } from '@/hooks/useChat'
import { useDeptAgentAssignmentsByUser } from '@/hooks/useChat'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'

export default function DepartamentosPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { can } = usePermissoes()
  const { data: departments = [], isLoading: loadingDepts } = useDepartments()
  const { data: myAssignments = [], isLoading: loadingAssignments } = useDeptAgentAssignmentsByUser(user?.id ?? '')

  const isLoading = loadingDepts || loadingAssignments || !user

  const isAdmin = can('departamentos', 'admin')
  const isGerente = user?.perfil === 'gerente'

  // Gerente: auto-redirect to their department if they have exactly one
  useEffect(() => {
    if (isGerente && myAssignments.length === 1) {
      navigate(`/departamentos/${myAssignments[0].department_id}`, { replace: true })
    }
  }, [isGerente, myAssignments, navigate])

  // Filter which departments to show
  const visibleDepts = isAdmin
    ? departments
    : departments.filter(d => myAssignments.some(a => a.department_id === d.id))

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <PageHeader
        title="Departamentos"
        description={isAdmin ? 'Gerencie todos os departamentos da empresa.' : 'Seus departamentos gerenciados.'}
        action={
          isAdmin ? (
            <Link
              to="/chat/departamentos"
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Gerenciar departamentos</span>
              <span className="sm:hidden">Gerenciar</span>
            </Link>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : visibleDepts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <Building2 className="h-12 w-12 opacity-30" />
          <p className="text-sm">Nenhum departamento disponível.</p>
          {isAdmin && (
            <Link to="/chat/departamentos" className="text-xs text-primary hover:underline">
              Criar departamento
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleDepts.map((dept) => {
            const myAssignment = myAssignments.find(a => a.department_id === dept.id)
            const isMyDept = Boolean(myAssignment)
            const isGerenteOfDept = myAssignment?.is_gerente

            return (
              <Link
                key={dept.id}
                to={`/departamentos/${dept.id}`}
                className={cn(
                  'group relative flex flex-col rounded-xl border bg-card p-5 transition-all duration-200',
                  'hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5',
                  isMyDept ? 'border-primary/20' : 'border-border',
                )}
              >
                {/* Status dot */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex items-center gap-2">
                    {isGerenteOfDept && (
                      <span className="flex items-center gap-1 rounded-full bg-warning-light px-2 py-0.5 text-xs font-medium text-warning">
                        <Crown className="h-3 w-3" /> Gerente
                      </span>
                    )}
                    <span className={cn(
                      'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                      dept.ativo
                        ? 'bg-success-light text-success'
                        : 'bg-muted text-muted-foreground',
                    )}>
                      <Circle className="h-2 w-2 fill-current" />
                      {dept.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>

                {/* Name */}
                <h3 className="text-base font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                  {dept.nome}
                </h3>

                {/* Meta */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mb-4">
                  <span className="capitalize">{dept.distribuicao?.replace('_', ' ')}</span>
                  {dept.sla_primeira_resposta_minutos && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {dept.sla_primeira_resposta_minutos}min SLA
                    </span>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-auto flex items-center justify-between pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    Ver dashboard
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
