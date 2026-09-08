import { useState } from 'react'
import { ArrowRightLeft, Users, Building } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { useUsers } from '@/hooks/useUsers'
import { useDepartments, useTransferConversation } from '@/hooks/useChat'

interface TransferDialogProps {
  open: boolean
  onClose: () => void
  conversationId: string
  currentAgenteId?: string | null
  currentDepartmentId?: string | null
}

export function TransferDialog({
  open,
  onClose,
  conversationId,
  currentAgenteId,
  currentDepartmentId,
}: TransferDialogProps) {
  const [tab, setTab] = useState<'agente' | 'departamento'>('agente')
  const [selectedAgente, setSelectedAgente] = useState<string>('')
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')

  const { data: users = [] } = useUsers()
  const { data: departments = [] } = useDepartments()
  const transferMutation = useTransferConversation()

  // Filter to all active users that can receive conversations
  const agents = users.filter(
    (u) =>
      u.ativo &&
      ['admin', 'gerente', 'atendimento', 'estrategista'].includes(u.perfil) &&
      u.id !== currentAgenteId,
  )

  const availableDepts = departments.filter(
    (d) => d.ativo && d.id !== currentDepartmentId,
  )

  function handleTransfer() {
    if (tab === 'agente' && selectedAgente) {
      transferMutation.mutate(
        { id: conversationId, agente_id: selectedAgente },
        { onSuccess: onClose },
      )
    } else if (tab === 'departamento' && selectedDepartment) {
      transferMutation.mutate(
        { id: conversationId, department_id: selectedDepartment, agente_id: null },
        { onSuccess: onClose },
      )
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Atribuir conversa" size="md">
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => setTab('agente')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors',
              tab === 'agente'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Users className="h-4 w-4" />
            Estrategista
          </button>
          <button
            onClick={() => setTab('departamento')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors',
              tab === 'departamento'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Building className="h-4 w-4" />
            Departamento
          </button>
        </div>

        {/* Agent list */}
        {tab === 'agente' && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum estrategista disponível
              </p>
            ) : (
              agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgente(agent.id)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                    selectedAgente === agent.id
                      ? 'bg-primary-muted border border-primary/30'
                      : 'hover:bg-muted/50 border border-transparent',
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary font-semibold text-xs">
                    {agent.nome
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {agent.nome}
                    </p>
                    <p className="text-2xs text-muted-foreground">{agent.perfil}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Department list */}
        {tab === 'departamento' && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {availableDepts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum departamento disponível
              </p>
            ) : (
              availableDepts.map((dept) => (
                <button
                  key={dept.id}
                  onClick={() => setSelectedDepartment(dept.id)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                    selectedDepartment === dept.id
                      ? 'bg-primary-muted border border-primary/30'
                      : 'hover:bg-muted/50 border border-transparent',
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Building className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {dept.nome}
                    </p>
                    <p className="text-2xs text-muted-foreground">
                      SLA: {dept.sla_primeira_resposta_minutos}min · {dept.sla_resolucao_horas}h
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleTransfer}
            disabled={
              transferMutation.isPending ||
              (tab === 'agente' && !selectedAgente) ||
              (tab === 'departamento' && !selectedDepartment)
            }
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground disabled:opacity-50 transition-opacity"
          >
            <ArrowRightLeft className="h-4 w-4" />
            {transferMutation.isPending ? 'Atribuindo...' : 'Atribuir'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
