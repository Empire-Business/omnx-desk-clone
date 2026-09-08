import { useState } from 'react'
import { Phone, Users, Plus, Trash2, Smartphone, Building2 } from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'
import {
  useInstanceAssignments,
  useCreateInstanceAssignment,
  useDeleteInstanceAssignment,
  useAssignments,
  useCreateAssignment,
  useDeleteAssignment,
} from '@/hooks/useUsers'
import { useInstances, useDepartments, useDeptAgentAssignmentsByUser, useAddDeptAgent, useRemoveDeptAgent } from '@/hooks/useChat'
import { useClientes } from '@/hooks/useClientes'
import type { User } from '@/types/database'

interface UserAccessPanelProps {
  user: User
}

export function UserAccessPanel({ user }: UserAccessPanelProps) {
  const [addingInstance, setAddingInstance] = useState(false)
  const [addingClient, setAddingClient] = useState(false)
  const [addingDept, setAddingDept] = useState(false)
  const [selectedInstanceId, setSelectedInstanceId] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedTipo, setSelectedTipo] = useState<'estrategista' | 'atendimento'>('atendimento')
  const [selectedDeptId, setSelectedDeptId] = useState('')
  const [selectedIsGerente, setSelectedIsGerente] = useState(false)

  // Instance assignments
  const { data: instanceAssignments = [] } = useInstanceAssignments(user.id)
  const createInstanceAssignment = useCreateInstanceAssignment()
  const deleteInstanceAssignment = useDeleteInstanceAssignment()
  const { data: allInstances = [] } = useInstances(null) // null = all instances

  // Client assignments
  const { data: allAssignments = [] } = useAssignments()
  const clientAssignments = allAssignments.filter(a => a.user_id === user.id)
  const createClientAssignment = useCreateAssignment()
  const deleteClientAssignment = useDeleteAssignment()
  const { data: allClients = [] } = useClientes()

  // Department assignments
  const { data: deptAssignments = [] } = useDeptAgentAssignmentsByUser(user.id)
  const addDeptAgent = useAddDeptAgent()
  const removeDeptAgent = useRemoveDeptAgent()
  const { data: allDepts = [] } = useDepartments()

  // Available instances/clients/depts (not yet assigned)
  const assignedInstanceIds = new Set(instanceAssignments.map(a => a.instance_id))
  const availableInstances = allInstances.filter(i => !assignedInstanceIds.has(i.id))

  const assignedClientIds = new Set(clientAssignments.map(a => a.client_id))
  const availableClients = allClients.filter(c => !assignedClientIds.has(c.id))

  const assignedDeptIds = new Set(deptAssignments.map(a => a.department_id))
  const availableDepts = allDepts.filter(d => d.ativo && !assignedDeptIds.has(d.id))

  const isAdminOrGerente = user.perfil === 'admin' || user.perfil === 'gerente'
  const showDepts = ['atendimento', 'gerente'].includes(user.perfil)

  return (
    <div className="space-y-5 pt-2">
      {/* Instance Access */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Smartphone className="h-4 w-4 text-primary" />
            Instâncias WhatsApp
          </h4>
          {!addingInstance && (
            <button
              onClick={() => setAddingInstance(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Adicionar
            </button>
          )}
        </div>

        {isAdminOrGerente && (
          <p className="text-xs text-muted-foreground mb-2 bg-muted/50 rounded-md px-2 py-1.5">
            Admins e gerentes têm acesso a todas as instâncias automaticamente.
          </p>
        )}

        {/* Assigned instances list */}
        <div className="space-y-1">
          {instanceAssignments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 bg-card"
            >
              <div className="flex items-center gap-2.5">
                <Phone className="h-3.5 w-3.5 text-success" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground">
                      {a.whatsapp_instances?.nome}
                    </p>
                    {a.whatsapp_instances?.categoria && (
                      <span className={cn(
                        'rounded-full px-1.5 py-0.5 text-2xs font-medium',
                        a.whatsapp_instances.categoria === 'suporte' && 'bg-info-light text-info',
                        a.whatsapp_instances.categoria === 'financeiro' && 'bg-warning-light text-warning',
                        a.whatsapp_instances.categoria === 'entrega' && 'bg-success-light text-success',
                      )}>
                        {a.whatsapp_instances.categoria}
                      </span>
                    )}
                  </div>
                  {a.whatsapp_instances?.numero_whatsapp && (
                    <p className="text-xs font-mono text-muted-foreground">
                      {formatPhone(a.whatsapp_instances.numero_whatsapp)}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => deleteInstanceAssignment.mutate(a.id)}
                disabled={deleteInstanceAssignment.isPending}
                className="rounded-md p-1 text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                title="Remover acesso"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {instanceAssignments.length === 0 && !isAdminOrGerente && (
            <p className="text-xs text-muted-foreground py-2">
              Nenhuma instância atribuída. O usuário não verá conversas.
            </p>
          )}
        </div>

        {/* Add instance form */}
        {addingInstance && (
          <div className="mt-2 flex items-center gap-2">
            <select
              value={selectedInstanceId}
              onChange={(e) => setSelectedInstanceId(e.target.value)}
              className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione uma instância...</option>
              {availableInstances.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.nome} {inst.numero_whatsapp ? `(${formatPhone(inst.numero_whatsapp)})` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                if (selectedInstanceId) {
                  createInstanceAssignment.mutate(
                    { user_id: user.id, instance_id: selectedInstanceId },
                    { onSuccess: () => { setSelectedInstanceId(''); setAddingInstance(false) } },
                  )
                }
              }}
              disabled={!selectedInstanceId || createInstanceAssignment.isPending}
              className="rounded-lg px-3 py-1.5 text-xs font-medium gradient-primary text-primary-foreground disabled:opacity-50"
            >
              {createInstanceAssignment.isPending ? '...' : 'Salvar'}
            </button>
            <button
              onClick={() => { setAddingInstance(false); setSelectedInstanceId('') }}
              className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Department Access */}
      {showDepts && (
        <>
          <div className="border-t border-border" />
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Building2 className="h-4 w-4 text-warning" />
                Departamentos
              </h4>
              {!addingDept && (
                <button
                  onClick={() => setAddingDept(true)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Adicionar
                </button>
              )}
            </div>

            <div className="space-y-1">
              {deptAssignments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 bg-card"
                >
                  <div className="flex items-center gap-2.5">
                    <Building2 className="h-3.5 w-3.5 text-warning" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {a.chat_departments?.nome ?? 'Departamento removido'}
                      </p>
                      {a.is_gerente && (
                        <span className="text-xs text-warning font-medium">Gerente</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeDeptAgent.mutate(a.id)}
                    disabled={removeDeptAgent.isPending}
                    className="rounded-md p-1 text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                    title="Remover do departamento"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {deptAssignments.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  Nenhum departamento atribuído.
                </p>
              )}
            </div>

            {addingDept && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={selectedDeptId}
                    onChange={(e) => setSelectedDeptId(e.target.value)}
                    className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Selecione um departamento...</option>
                    {availableDepts.map((d) => (
                      <option key={d.id} value={d.id}>{d.nome}</option>
                    ))}
                  </select>
                  {user.perfil === 'gerente' && (
                    <label className="flex items-center gap-1.5 text-xs text-foreground whitespace-nowrap cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIsGerente}
                        onChange={(e) => setSelectedIsGerente(e.target.checked)}
                        className="h-3.5 w-3.5 accent-warning"
                      />
                      Gerente
                    </label>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (selectedDeptId) {
                        addDeptAgent.mutate(
                          { user_id: user.id, department_id: selectedDeptId, is_gerente: user.perfil === 'gerente' ? selectedIsGerente : false },
                          { onSuccess: () => { setSelectedDeptId(''); setSelectedIsGerente(false); setAddingDept(false) } },
                        )
                      }
                    }}
                    disabled={!selectedDeptId || addDeptAgent.isPending}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium gradient-primary text-primary-foreground disabled:opacity-50"
                  >
                    {addDeptAgent.isPending ? '...' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => { setAddingDept(false); setSelectedDeptId(''); setSelectedIsGerente(false) }}
                    className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Client Access */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 text-accent" />
            Clientes vinculados
          </h4>
          {!addingClient && (
            <button
              onClick={() => setAddingClient(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Adicionar
            </button>
          )}
        </div>

        {/* Assigned clients list */}
        <div className="space-y-1">
          {clientAssignments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 bg-card"
            >
              <div className="flex items-center gap-2.5">
                <Users className="h-3.5 w-3.5 text-accent" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {a.clients?.nome ?? 'Cliente removido'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.tipo === 'estrategista' ? 'Estrategista' : 'Atendimento'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => deleteClientAssignment.mutate(a.id)}
                disabled={deleteClientAssignment.isPending}
                className="rounded-md p-1 text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                title="Remover vínculo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {clientAssignments.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">
              Nenhum cliente vinculado.
            </p>
          )}
        </div>

        {/* Add client form */}
        {addingClient && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione um cliente...</option>
                {availableClients.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              <select
                value={selectedTipo}
                onChange={(e) => setSelectedTipo(e.target.value as 'estrategista' | 'atendimento')}
                className="w-32 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="atendimento">Atendimento</option>
                <option value="estrategista">Estrategista</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (selectedClientId) {
                    createClientAssignment.mutate(
                      { user_id: user.id, client_id: selectedClientId, tipo: selectedTipo },
                      { onSuccess: () => { setSelectedClientId(''); setAddingClient(false) } },
                    )
                  }
                }}
                disabled={!selectedClientId || createClientAssignment.isPending}
                className="rounded-lg px-3 py-1.5 text-xs font-medium gradient-primary text-primary-foreground disabled:opacity-50"
              >
                {createClientAssignment.isPending ? '...' : 'Salvar'}
              </button>
              <button
                onClick={() => { setAddingClient(false); setSelectedClientId('') }}
                className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
