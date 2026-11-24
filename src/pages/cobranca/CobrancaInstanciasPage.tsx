import { useState } from 'react'
import { Server, Plus, Pencil, Trash2 } from 'lucide-react'
import {
  useCobrancaInstances,
  useCreateInstance,
  useUpdateInstance,
  useDeleteInstance,
  type CobrancaInstance,
} from '@/hooks/useCobranca'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { cn, formatPhone } from '@/lib/utils'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useNumerosComToken } from '@/hooks/useUazapiTokens'
import { TokenDoNumero } from '@/components/whatsapp/TokenDoNumero'

const inputCls = 'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'

type FormState = {
  nome: string
  instance_id: string
  numero_whatsapp: string
  horario_inicio: string
  horario_fim: string
  envios_hora_max: string
  intervalo_min_segundos: string
  intervalo_max_segundos: string
  ativo: boolean
}

const EMPTY_FORM: FormState = {
  nome: '',
  instance_id: '',
  numero_whatsapp: '',
  horario_inicio: '08:00',
  horario_fim: '20:00',
  envios_hora_max: '60',
  intervalo_min_segundos: '30',
  intervalo_max_segundos: '120',
  ativo: true,
}

function instanceToForm(i: CobrancaInstance): FormState {
  return {
    nome: i.nome,
    instance_id: i.instance_id,
    numero_whatsapp: i.numero_whatsapp ?? '',
    horario_inicio: i.horario_inicio,
    horario_fim: i.horario_fim,
    envios_hora_max: String(i.envios_hora_max),
    intervalo_min_segundos: String(i.intervalo_min_segundos),
    intervalo_max_segundos: String(i.intervalo_max_segundos),
    ativo: i.ativo,
  }
}

// ---- Instance modal ----

function InstanceModal({
  instance,
  onClose,
}: {
  instance?: CobrancaInstance
  onClose: () => void
}) {
  const [form, setForm] = useState<FormState>(instance ? instanceToForm(instance) : EMPTY_FORM)
  const createInstance = useCreateInstance()
  const updateInstance = useUpdateInstance()
  // Token da UAZAPI deste número no cofre (só administrador; o banco confere de novo).
  const { can } = usePermissoes()
  const podeToken = Boolean(instance) && can('cobranca', 'admin')
  const { data: comToken } = useNumerosComToken(podeToken, 'cobranca')

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      nome: form.nome,
      instance_id: form.instance_id,
      numero_whatsapp: form.numero_whatsapp || null,
      horario_inicio: form.horario_inicio,
      horario_fim: form.horario_fim,
      envios_hora_max: parseInt(form.envios_hora_max, 10),
      intervalo_min_segundos: parseInt(form.intervalo_min_segundos, 10),
      intervalo_max_segundos: parseInt(form.intervalo_max_segundos, 10),
      ativo: form.ativo,
      status: instance?.status ?? 'desconectado',
    }
    if (instance) {
      await updateInstance.mutateAsync({ id: instance.id, ...payload })
    } else {
      await createInstance.mutateAsync(payload)
    }
    onClose()
  }

  const isLoading = createInstance.isPending || updateInstance.isPending

  return (
    <Modal
      open
      title={instance ? 'Editar número' : 'Novo número'}
      onClose={onClose}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome *</label>
            <input className={inputCls} value={form.nome} onChange={set('nome')} placeholder="Ex: Principal" required />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Instance ID *</label>
            <input className={inputCls} value={form.instance_id} onChange={set('instance_id')} placeholder="evolution-instance-name" required />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Número WhatsApp</label>
            <input className={inputCls} value={form.numero_whatsapp} onChange={set('numero_whatsapp')} placeholder="5511999999999" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Horário início</label>
            <input className={inputCls} type="time" value={form.horario_inicio} onChange={set('horario_inicio')} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Horário fim</label>
            <input className={inputCls} type="time" value={form.horario_fim} onChange={set('horario_fim')} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Envios por hora (máx)</label>
            <input className={inputCls} type="number" min="1" value={form.envios_hora_max} onChange={set('envios_hora_max')} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Intervalo mín (seg)</label>
            <input className={inputCls} type="number" min="1" value={form.intervalo_min_segundos} onChange={set('intervalo_min_segundos')} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Intervalo máx (seg)</label>
            <input className={inputCls} type="number" min="1" value={form.intervalo_max_segundos} onChange={set('intervalo_max_segundos')} required />
          </div>
          <div className="flex items-center">
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={set('ativo')}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-foreground">Número ativo</span>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="gradient-primary rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isLoading ? 'Salvando...' : instance ? 'Salvar alterações' : 'Cadastrar número'}
          </button>
        </div>
      </form>
      {instance && podeToken && (
        <TokenDoNumero tipo="cobranca" instanciaId={instance.id} salvo={comToken?.has(instance.id) ?? false} />
      )}
    </Modal>
  )
}

// ---- Instance card ----

function InstanceCard({ instance }: { instance: CobrancaInstance }) {
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const deleteInstance = useDeleteInstance()

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-foreground">{instance.nome}</h3>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', instance.ativo ? 'bg-success-light text-success' : 'bg-muted text-muted-foreground')}>
              {instance.ativo ? 'Ativo' : 'Inativo'}
            </span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground')}>
              {instance.status}
            </span>
          </div>
          <p className="font-mono text-xs text-muted-foreground">{instance.instance_id}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setShowEdit(true)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowDelete(true)}
            className="rounded p-1.5 text-muted-foreground hover:bg-danger-light hover:text-danger transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">WhatsApp</p>
          <p className="font-medium text-foreground">{formatPhone(instance.numero_whatsapp) ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Horário</p>
          <p className="font-medium text-foreground">{instance.horario_inicio} – {instance.horario_fim}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Envios/hora máx</p>
          <p className="font-medium text-foreground">{instance.envios_hora_max}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Intervalo (seg)</p>
          <p className="font-medium text-foreground">{instance.intervalo_min_segundos}–{instance.intervalo_max_segundos}</p>
        </div>
      </div>

      {showEdit && <InstanceModal instance={instance} onClose={() => setShowEdit(false)} />}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={() => deleteInstance.mutate(instance.id)}
        title="Excluir número"
        description={`Deseja excluir o número "${instance.nome}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        loading={deleteInstance.isPending}
      />
    </div>
  )
}

// ---- Main page ----

export function CobrancaInstanciasPage() {
  const [showNova, setShowNova] = useState(false)
  const { data: instances, isLoading } = useCobrancaInstances()

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 animate-fade-in">
      <PageHeader
        title="Números de WhatsApp"
        description="Números de WhatsApp usados para enviar cobranças"
        action={
          <button
            onClick={() => setShowNova(true)}
            className="gradient-primary flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            Novo número
          </button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 shimmer rounded-xl" />)}
        </div>
      ) : !instances || instances.length === 0 ? (
        <EmptyState
          icon={Server}
          title="Nenhum número cadastrado"
          description="Cadastre um número de WhatsApp para começar a enviar cobranças."
          action={
            <button
              onClick={() => setShowNova(true)}
              className="gradient-primary rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Novo número
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {instances.map((i) => <InstanceCard key={i.id} instance={i} />)}
        </div>
      )}

      {showNova && <InstanceModal onClose={() => setShowNova(false)} />}
    </div>
  )
}
