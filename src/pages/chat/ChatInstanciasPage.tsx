import { useState } from 'react'
import { Plus, Trash2, Wifi, WifiOff, QrCode, Ban } from 'lucide-react'
import { usePermissoes } from '@/hooks/usePermissoes'
import { cn, formatPhone } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  useInstances,
  useCreateInstance,
  useUpdateInstance,
  useDeleteInstance,
} from '@/hooks/useChat'
import type { WaInstance } from '@/hooks/useChat'
import { useMyInstanceIds } from '@/hooks/useUsers'

const STATUS_CONFIG: Record<
  WaInstance['status'],
  { label: string; badge: string; icon: React.ElementType }
> = {
  conectado: { label: 'Conectado', badge: 'bg-success-light text-success', icon: Wifi },
  desconectado: { label: 'Desconectado', badge: 'bg-danger-light text-danger', icon: WifiOff },
  aguardando_qr: { label: 'Aguardando QR', badge: 'bg-warning-light text-warning', icon: QrCode },
  banido: { label: 'Banido', badge: 'bg-danger-light text-danger', icon: Ban },
}

const INSTANCE_COLORS = [
  { label: 'Sem cor', value: '' },
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Roxo', value: '#a855f7' },
  { label: 'Laranja', value: '#f97316' },
  { label: 'Rosa', value: '#ec4899' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Ciano', value: '#06b6d4' },
  { label: 'Amarelo', value: '#eab308' },
]

interface InstanceFormData {
  nome: string
  instance_id: string
  numero_whatsapp: string
  cor: string
  ocultar_grupos: boolean
}

const EMPTY_FORM: InstanceFormData = {
  nome: '',
  instance_id: '',
  numero_whatsapp: '',
  cor: '',
  ocultar_grupos: false,
}

interface InstanceFormProps {
  initial?: InstanceFormData
  onSubmit: (data: InstanceFormData) => void
  loading: boolean
  submitLabel: string
}

function InstanceForm({ initial = EMPTY_FORM, onSubmit, loading, submitLabel }: InstanceFormProps) {
  const [form, setForm] = useState<InstanceFormData>(initial)

  function set<K extends keyof InstanceFormData>(field: K, value: InstanceFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Nome</label>
        <input
          required
          value={form.nome}
          onChange={(e) => set('nome', e.target.value)}
          placeholder="Ex: Principal"
          className={cn(
            'w-full rounded-lg border border-input bg-background px-3 py-2',
            'text-sm placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
          )}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Instance ID</label>
        <input
          required
          value={form.instance_id}
          onChange={(e) => set('instance_id', e.target.value)}
          placeholder="Ex: empire-main"
          className={cn(
            'w-full rounded-lg border border-input bg-background px-3 py-2',
            'text-sm placeholder:text-muted-foreground font-mono',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
          )}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Número WhatsApp
        </label>
        <input
          value={form.numero_whatsapp}
          onChange={(e) => set('numero_whatsapp', e.target.value)}
          placeholder="Ex: 5511999998888"
          className={cn(
            'w-full rounded-lg border border-input bg-background px-3 py-2',
            'text-sm placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
          )}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Cor</label>
        <div className="flex flex-wrap gap-2">
          {INSTANCE_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => set('cor', c.value)}
              className={cn(
                'h-7 w-7 rounded-full border-2 transition-all',
                form.cor === c.value ? 'border-foreground scale-110' : 'border-transparent',
                !c.value && 'bg-muted border-input',
              )}
              style={c.value ? { backgroundColor: c.value } : undefined}
              title={c.label}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-input bg-background/50 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Ocultar grupos</p>
          <p className="text-xs text-muted-foreground">
            Quando ativo, conversas de grupos do WhatsApp não aparecem na lista.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={form.ocultar_grupos}
          onClick={() => set('ocultar_grupos', !form.ocultar_grupos)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none',
            form.ocultar_grupos ? 'bg-primary' : 'bg-muted',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition duration-200',
              form.ocultar_grupos ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </button>
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

export default function ChatInstanciasPage() {
  const { can } = usePermissoes()
  // Conectar/desconectar numero e operacao de administracao do Chat.
  const isAdmin = can('chat', 'admin')
  const { data: myInstanceIds } = useMyInstanceIds()
  const { data: instances = [], isLoading } = useInstances(myInstanceIds)
  const createMutation = useCreateInstance()
  const updateMutation = useUpdateInstance()
  const deleteMutation = useDeleteInstance()
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleToggleAtivo(instance: WaInstance, e: React.MouseEvent) {
    e.stopPropagation()
    if (!isAdmin) return
    setTogglingId(instance.id)
    updateMutation.mutate(
      { id: instance.id, ativo: !instance.ativo },
      { onSettled: () => setTogglingId(null) },
    )
  }

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<WaInstance | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WaInstance | null>(null)

  function handleCreate(form: InstanceFormData) {
    createMutation.mutate(
      {
        nome: form.nome,
        instance_id: form.instance_id,
        cor: form.cor || null,
        ocultar_grupos: form.ocultar_grupos,
      },
      { onSuccess: () => setCreateOpen(false) },
    )
  }

  function handleUpdate(form: InstanceFormData) {
    if (!editTarget) return
    updateMutation.mutate(
      {
        id: editTarget.id,
        nome: form.nome,
        instance_id: form.instance_id,
        numero_whatsapp: form.numero_whatsapp || null,
        cor: form.cor || null,
        ocultar_grupos: form.ocultar_grupos,
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
        title="Instâncias WhatsApp"
        description="Gerencie as conexões WhatsApp do OMNXChat."
        action={
          isAdmin ? (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Nova instância
            </button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : instances.length === 0 ? (
        <EmptyState
          icon={Wifi}
          title="Nenhuma instância cadastrada"
          description="Crie uma instância para começar a usar o OMNXChat."
          action={
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              Nova instância
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:gap-4 lg:gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {instances.map((instance) => {
            const config = STATUS_CONFIG[instance.status]
            const StatusIcon = config.icon
            return (
              <div
                key={instance.id}
                className={cn(
                  'glass-card p-5',
                  isAdmin ? 'entity-card-hover cursor-pointer' : 'cursor-default',
                )}
                onClick={() => isAdmin && setEditTarget(instance)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-foreground flex items-center gap-2">
                      {instance.cor && (
                        <span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: instance.cor }} />
                      )}
                      {instance.nome}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {instance.instance_id}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                      config.badge,
                    )}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {config.label}
                  </span>
                </div>

                {instance.numero_whatsapp && (
                  <p className="mt-3 text-sm text-muted-foreground">{formatPhone(instance.numero_whatsapp)}</p>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isAdmin ? (
                      <button
                        onClick={(e) => handleToggleAtivo(instance, e)}
                        disabled={togglingId === instance.id}
                        role="switch"
                        aria-checked={instance.ativo}
                        className={cn(
                          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50',
                          instance.ativo ? 'bg-primary' : 'bg-muted',
                        )}
                        title={instance.ativo ? 'Desativar instância' : 'Ativar instância'}
                      >
                        <span
                          className={cn(
                            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition duration-200',
                            instance.ativo ? 'translate-x-4' : 'translate-x-0',
                          )}
                        />
                      </button>
                    ) : null}
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        instance.ativo
                          ? 'bg-success-light text-success'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {instance.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget(instance)
                      }}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger-light hover:text-danger transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nova instância" size="md">
        <InstanceForm
          onSubmit={handleCreate}
          loading={createMutation.isPending}
          submitLabel="Criar instância"
        />
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Editar instância"
        size="md"
      >
        {editTarget && (
          <InstanceForm
            initial={{
              nome: editTarget.nome,
              instance_id: editTarget.instance_id,
              numero_whatsapp: editTarget.numero_whatsapp ?? '',
              cor: editTarget.cor ?? '',
              ocultar_grupos: editTarget.ocultar_grupos ?? false,
            }}
            onSubmit={handleUpdate}
            loading={updateMutation.isPending}
            submitLabel="Salvar alterações"
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir instância"
        description={`Tem certeza que deseja excluir a instância "${deleteTarget?.nome}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
