import { useState } from 'react'
import { Plus, Pencil, Trash2, Users, User, X, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  useDepartments,
  useInstances,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
  useDeptInstanceAssignments,
  useAddDeptInstance,
  useRemoveDeptInstance,
  useDeptAgentAssignments,
  useAddDeptAgent,
  useRemoveDeptAgent,
} from '@/hooks/useChat'
import type { ChatDepartment } from '@/hooks/useChat'
import { useUsers } from '@/hooks/useUsers'

const DISTRIBUICAO_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'menor_carga', label: 'Menor carga' },
]

const DIAS_SEMANA = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sab' },
]

interface DeptFormData {
  nome: string
  instance_id: string
  distribuicao: string
  sla_primeira_resposta_minutos: number
  sla_resolucao_horas: number
  mensagem_boas_vindas: string
  ativo: boolean
  horario_inicio: string
  horario_fim: string
  dias_atendimento: number[]
  mensagem_fora_horario: string
}

const EMPTY_FORM: DeptFormData = {
  nome: '',
  instance_id: '',
  distribuicao: 'manual',
  sla_primeira_resposta_minutos: 5,
  sla_resolucao_horas: 24,
  mensagem_boas_vindas: '',
  ativo: true,
  horario_inicio: '08:00',
  horario_fim: '18:00',
  dias_atendimento: [1, 2, 3, 4, 5],
  mensagem_fora_horario: '',
}

function toFormData(dept: ChatDepartment): DeptFormData {
  return {
    nome: dept.nome,
    instance_id: dept.instance_id ?? '',
    distribuicao: dept.distribuicao,
    sla_primeira_resposta_minutos: dept.sla_primeira_resposta_minutos,
    sla_resolucao_horas: dept.sla_resolucao_horas,
    mensagem_boas_vindas: dept.mensagem_boas_vindas ?? '',
    ativo: dept.ativo,
    horario_inicio: dept.horario_inicio ?? '08:00',
    horario_fim: dept.horario_fim ?? '18:00',
    dias_atendimento: dept.dias_atendimento ?? [1, 2, 3, 4, 5],
    mensagem_fora_horario: dept.mensagem_fora_horario ?? '',
  }
}

interface DeptFormProps {
  initial?: DeptFormData
  onSubmit: (data: DeptFormData) => void
  loading: boolean
  submitLabel: string
}

function DeptForm({ initial = EMPTY_FORM, onSubmit, loading, submitLabel }: DeptFormProps) {
  const [form, setForm] = useState<DeptFormData>(initial)
  const { data: instances = [] } = useInstances()

  function set<K extends keyof DeptFormData>(field: K, value: DeptFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  const inputCls = cn(
    'w-full rounded-lg border border-input bg-background px-3 py-2',
    'text-sm placeholder:text-muted-foreground',
    'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-foreground">Nome</label>
          <input
            required
            value={form.nome}
            onChange={(e) => set('nome', e.target.value)}
            placeholder="Ex: Suporte"
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Distribuição</label>
          <select
            value={form.distribuicao}
            onChange={(e) => set('distribuicao', e.target.value)}
            className={inputCls}
          >
            {DISTRIBUICAO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            SLA 1ª resposta (min)
          </label>
          <input
            type="number"
            min={1}
            value={form.sla_primeira_resposta_minutos}
            onChange={(e) => set('sla_primeira_resposta_minutos', Number(e.target.value))}
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            SLA resolução (h)
          </label>
          <input
            type="number"
            min={1}
            value={form.sla_resolucao_horas}
            onChange={(e) => set('sla_resolucao_horas', Number(e.target.value))}
            className={inputCls}
          />
        </div>

        <div className="col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Mensagem de boas-vindas
          </label>
          <textarea
            rows={3}
            value={form.mensagem_boas_vindas}
            onChange={(e) => set('mensagem_boas_vindas', e.target.value)}
            placeholder="Olá! Como posso ajudar?"
            className={cn(inputCls, 'resize-none')}
          />
        </div>

        {/* Business Hours */}
        <div className="col-span-2 border-t border-border pt-4 mt-2">
          <p className="text-sm font-semibold text-foreground mb-3">Horario de atendimento</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Horario inicio</label>
          <input
            type="time"
            value={form.horario_inicio}
            onChange={(e) => set('horario_inicio', e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Horario fim</label>
          <input
            type="time"
            value={form.horario_fim}
            onChange={(e) => set('horario_fim', e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-foreground">Dias de atendimento</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {DIAS_SEMANA.map((dia) => (
              <label
                key={dia.value}
                className={cn(
                  'flex items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors',
                  form.dias_atendimento.includes(dia.value)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={form.dias_atendimento.includes(dia.value)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      set('dias_atendimento', [...form.dias_atendimento, dia.value].sort())
                    } else {
                      set('dias_atendimento', form.dias_atendimento.filter((d) => d !== dia.value))
                    }
                  }}
                />
                {dia.label}
              </label>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Mensagem fora do horario
          </label>
          <textarea
            rows={2}
            value={form.mensagem_fora_horario}
            onChange={(e) => set('mensagem_fora_horario', e.target.value)}
            placeholder="No momento estamos fora do horário de atendimento. Retornaremos em breve!"
            className={cn(inputCls, 'resize-none')}
          />
        </div>

        <div className="col-span-2 flex items-center gap-2">
          <input
            id="dept-ativo"
            type="checkbox"
            checked={form.ativo}
            onChange={(e) => set('ativo', e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <label htmlFor="dept-ativo" className="text-sm font-medium text-foreground">
            Departamento ativo
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </form>
  )
}

// ─── Dept Instance Manager ───────────────────────────────────────────────────

function DeptInstanceManager({ departmentId }: { departmentId: string }) {
  const { data: assignments = [] } = useDeptInstanceAssignments(departmentId)
  const { data: allInstances = [] } = useInstances()
  const addMutation = useAddDeptInstance()
  const removeMutation = useRemoveDeptInstance()
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState('')

  const assignedIds = new Set(assignments.map(a => a.instance_id))
  const available = allInstances.filter(i => !assignedIds.has(i.id))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5 text-primary" />
          Instâncias ({assignments.length})
        </label>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Adicionar
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {assignments.map(a => (
          <span
            key={a.id}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground"
          >
            {a.whatsapp_instances?.nome ?? 'Instância'}
            {a.whatsapp_instances?.categoria && (
              <span className={cn(
                'rounded-full px-1 py-0.5 text-2xs',
                a.whatsapp_instances.categoria === 'suporte' && 'bg-info-light text-info',
                a.whatsapp_instances.categoria === 'financeiro' && 'bg-warning-light text-warning',
                a.whatsapp_instances.categoria === 'entrega' && 'bg-success-light text-success',
              )}>
                {a.whatsapp_instances.categoria}
              </span>
            )}
            <button
              onClick={() => removeMutation.mutate(a.id)}
              disabled={removeMutation.isPending}
              className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {assignments.length === 0 && (
          <p className="text-xs text-muted-foreground py-1">Nenhuma instância vinculada.</p>
        )}
      </div>

      {adding && (
        <div className="flex items-center gap-2 pt-1">
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Selecione...</option>
            {available.map(i => (
              <option key={i.id} value={i.id}>{i.nome} {i.categoria ? `(${i.categoria})` : ''}</option>
            ))}
          </select>
          <button
            onClick={() => {
              if (selectedId) {
                addMutation.mutate(
                  { department_id: departmentId, instance_id: selectedId },
                  { onSuccess: () => { setSelectedId(''); setAdding(false) } },
                )
              }
            }}
            disabled={!selectedId || addMutation.isPending}
            className="rounded-lg px-3 py-1.5 text-xs font-medium gradient-primary text-primary-foreground disabled:opacity-50"
          >
            {addMutation.isPending ? '...' : 'Salvar'}
          </button>
          <button
            onClick={() => { setAdding(false); setSelectedId('') }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Dept Agent Manager ─────────────────────────────────────────────────────

const PERFIL_LABELS: Record<string, string> = {
  admin: 'Admin',
  gerente: 'Gerente',
  agente: 'Agente',
  atendimento: 'Atendimento',
  estrategista: 'Estrategista',
  cliente: 'Cliente',
}

function DeptAgentManager({ departmentId }: { departmentId: string }) {
  const { data: assignments = [] } = useDeptAgentAssignments(departmentId)
  const { data: allUsers = [] } = useUsers()
  const addMutation = useAddDeptAgent()
  const removeMutation = useRemoveDeptAgent()
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState('')

  const assignedIds = new Set(assignments.map(a => a.user_id))
  const available = allUsers.filter(u => !assignedIds.has(u.id) && u.ativo)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-primary" />
          Agentes ({assignments.length})
        </label>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Adicionar
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {assignments.map(a => (
          <span
            key={a.id}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground"
          >
            {a.users?.nome ?? 'Usuário'}
            {a.users?.perfil && (
              <span className="rounded-full bg-primary-muted px-1 py-0.5 text-2xs text-primary">
                {PERFIL_LABELS[a.users.perfil] ?? a.users.perfil}
              </span>
            )}
            <button
              onClick={() => removeMutation.mutate(a.id)}
              disabled={removeMutation.isPending}
              className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {assignments.length === 0 && (
          <p className="text-xs text-muted-foreground py-1">Nenhum agente vinculado.</p>
        )}
      </div>

      {adding && (
        <div className="flex items-center gap-2 pt-1">
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Selecione um agente...</option>
            {available.map(u => (
              <option key={u.id} value={u.id}>
                {u.nome} ({PERFIL_LABELS[u.perfil] ?? u.perfil})
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (selectedId) {
                addMutation.mutate(
                  { department_id: departmentId, user_id: selectedId },
                  { onSuccess: () => { setSelectedId(''); setAdding(false) } },
                )
              }
            }}
            disabled={!selectedId || addMutation.isPending}
            className="rounded-lg px-3 py-1.5 text-xs font-medium gradient-primary text-primary-foreground disabled:opacity-50"
          >
            {addMutation.isPending ? '...' : 'Salvar'}
          </button>
          <button
            onClick={() => { setAdding(false); setSelectedId('') }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

export default function ChatDepartamentosPage() {
  const { data: departments = [], isLoading } = useDepartments()
  const { data: instances = [] } = useInstances()
  const { data: allDeptAssignments = [] } = useDeptInstanceAssignments()
  const { data: allDeptAgents = [] } = useDeptAgentAssignments()
  const createMutation = useCreateDepartment()
  const updateMutation = useUpdateDepartment()
  const deleteMutation = useDeleteDepartment()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ChatDepartment | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ChatDepartment | null>(null)

  const instanceMap = Object.fromEntries(instances.map((i) => [i.id, i.nome]))

  function handleCreate(form: DeptFormData) {
    createMutation.mutate(
      {
        nome: form.nome,
        instance_id: form.instance_id || null,
        distribuicao: form.distribuicao,
        sla_primeira_resposta_minutos: form.sla_primeira_resposta_minutos,
        sla_resolucao_horas: form.sla_resolucao_horas,
        mensagem_boas_vindas: form.mensagem_boas_vindas || null,
        ativo: form.ativo,
        horario_inicio: form.horario_inicio || null,
        horario_fim: form.horario_fim || null,
        dias_atendimento: form.dias_atendimento,
        mensagem_fora_horario: form.mensagem_fora_horario || null,
      },
      { onSuccess: () => setCreateOpen(false) },
    )
  }

  function handleUpdate(form: DeptFormData) {
    if (!editTarget) return
    updateMutation.mutate(
      {
        id: editTarget.id,
        nome: form.nome,
        instance_id: form.instance_id || null,
        distribuicao: form.distribuicao,
        sla_primeira_resposta_minutos: form.sla_primeira_resposta_minutos,
        sla_resolucao_horas: form.sla_resolucao_horas,
        mensagem_boas_vindas: form.mensagem_boas_vindas || null,
        ativo: form.ativo,
        horario_inicio: form.horario_inicio || null,
        horario_fim: form.horario_fim || null,
        dias_atendimento: form.dias_atendimento,
        mensagem_fora_horario: form.mensagem_fora_horario || null,
      },
      { onSuccess: () => setEditTarget(null) },
    )
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 p-3 sm:p-4 lg:p-6 animate-fade-in">
      <PageHeader
        title="Departamentos"
        description="Configure os departamentos para organizar o atendimento."
        action={
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo departamento</span>
            <span className="sm:hidden">Novo</span>
          </button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : departments.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum departamento cadastrado"
          description="Crie departamentos para organizar as filas de atendimento."
          action={
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              Novo departamento
            </button>
          }
        />
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Nome
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Instâncias
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Agentes
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Distribuição
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  SLA 1ª Resp.
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  SLA Resolução
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Status
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {departments.map((dept) => (
                <tr key={dept.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{dept.nome}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const deptInstances = allDeptAssignments.filter(a => a.department_id === dept.id)
                      if (deptInstances.length === 0) {
                        return dept.instance_id
                          ? <span className="text-muted-foreground">{instanceMap[dept.instance_id] ?? '—'}</span>
                          : <span className="text-muted-foreground">—</span>
                      }
                      return (
                        <div className="flex flex-wrap gap-1">
                          {deptInstances.map(a => (
                            <span key={a.id} className="inline-block rounded-full bg-primary-muted px-2 py-0.5 text-2xs font-medium text-primary">
                              {a.whatsapp_instances?.nome ?? '?'}
                            </span>
                          ))}
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const deptAgents = allDeptAgents.filter(a => a.department_id === dept.id)
                      if (deptAgents.length === 0) {
                        return <span className="text-muted-foreground">—</span>
                      }
                      return (
                        <div className="flex flex-wrap gap-1">
                          {deptAgents.map(a => (
                            <span key={a.id} className="inline-block rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-foreground">
                              {a.users?.nome ?? '?'}
                            </span>
                          ))}
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">
                    {DISTRIBUICAO_OPTIONS.find((o) => o.value === dept.distribuicao)?.label ??
                      dept.distribuicao}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {dept.sla_primeira_resposta_minutos} min
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {dept.sla_resolucao_horas} h
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        dept.ativo
                          ? 'bg-success-light text-success'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {dept.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditTarget(dept)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(dept)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger-light hover:text-danger transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo departamento"
        size="lg"
      >
        <DeptForm
          onSubmit={handleCreate}
          loading={createMutation.isPending}
          submitLabel="Criar departamento"
        />
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Editar departamento"
        size="lg"
      >
        {editTarget && (
          <div className="space-y-6">
            <DeptForm
              initial={toFormData(editTarget)}
              onSubmit={handleUpdate}
              loading={updateMutation.isPending}
              submitLabel="Salvar alterações"
            />
            <div className="border-t border-border pt-4">
              <DeptInstanceManager departmentId={editTarget.id} />
            </div>
            <div className="border-t border-border pt-4">
              <DeptAgentManager departmentId={editTarget.id} />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir departamento"
        description={`Tem certeza que deseja excluir o departamento "${deleteTarget?.nome}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
