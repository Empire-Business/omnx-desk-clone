import { useState } from 'react'
import type { FormEvent } from 'react'
import { Mail } from 'lucide-react'
import { useCreateUser, useUpdateUser } from '@/hooks/useUsers'
import { useDepartments } from '@/hooks/useChat'
import type { User, UserProfile } from '@/types/database'

interface UserFormProps {
  initial?: User
  onClose: () => void
}

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const labelClass = 'block text-sm font-medium text-foreground mb-1.5'

const PROFILE_OPTIONS: { value: UserProfile; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'gerente', label: 'Gestor' },
  { value: 'atendimento', label: 'Atendimento' },
  { value: 'estrategista', label: 'Estrategista' },
]

export function UserForm({ initial, onClose }: UserFormProps) {
  const isEdit = Boolean(initial?.id)
  const { data: departments = [] } = useDepartments()

  const [form, setForm] = useState({
    nome: initial?.nome ?? '',
    email: initial?.email ?? '',
    perfil: (initial?.perfil ?? 'atendimento') as UserProfile,
    ativo: initial?.ativo ?? true,
    department_id: initial?.department_id ?? '',
    // Liberação individual do módulo Contratos: não vem do perfil, é por pessoa.
    // Antes só dava para mexer direto no banco.
    acesso_contratos: initial?.acesso_contratos ?? false,
  })

  const create = useCreateUser()
  const update = useUpdateUser()
  const mutation = isEdit ? update : create

  function set<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (isEdit && initial?.id) {
      await update.mutateAsync({
        id: initial.id,
        nome: form.nome,
        perfil: form.perfil,
        ativo: form.ativo,
        department_id: form.department_id || null,
        acesso_contratos: form.acesso_contratos,
      })
      onClose()
    } else {
      const novo = await create.mutateAsync({
        nome: form.nome,
        email: form.email,
        perfil: form.perfil,
        department_id: form.department_id || null,
      })
      alert(
        `Colaborador ${form.nome} criado!\n\n` +
          `E-mail: ${form.email}\n\n` +
          (novo.definir_senha_url
            ? `Link para ele definir a senha (uso único, expira em ~1h):\n${novo.definir_senha_url}`
            : `Peça para ele entrar por "Esqueci minha senha" na tela de login e definir a própria senha.`),
      )
      onClose()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Nome *</label>
          <input
            required
            className={inputClass}
            value={form.nome}
            onChange={(e) => set('nome', e.target.value)}
            placeholder="Nome completo"
          />
        </div>

        <div>
          <label className={labelClass}>Email *</label>
          <input
            required={!isEdit}
            type="email"
            className={inputClass}
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="usuario@omnxdesk.com"
            disabled={isEdit}
          />
          {isEdit && (
            <p className="mt-1 text-xs text-muted-foreground">
              O email não pode ser alterado após o cadastro.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Perfil *</label>
            <select
              required
              className={inputClass}
              value={form.perfil}
              onChange={(e) => set('perfil', e.target.value as UserProfile)}
            >
              {PROFILE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Departamento</label>
            <select
              className={inputClass}
              value={form.department_id}
              onChange={(e) => set('department_id', e.target.value)}
            >
              <option value="">— Nenhum —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Acesso extra ao módulo Contratos — vale por pessoa, além do que o perfil dá. */}
        {isEdit && form.perfil !== 'admin' && form.perfil !== 'gerente' && (
          <div className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5">
            <input
              id="acesso-contratos-checkbox"
              type="checkbox"
              checked={form.acesso_contratos}
              onChange={(e) => set('acesso_contratos', e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border accent-primary"
            />
            <label htmlFor="acesso-contratos-checkbox" className="cursor-pointer select-none">
              <span className="block text-sm font-medium text-foreground">
                Liberar o módulo Contratos
              </span>
              <span className="block text-xs text-muted-foreground">
                Dá acesso a Contratos a esta pessoa em específico, mesmo que o perfil dela não
                inclua. Admin e gerente já têm por padrão.
              </span>
            </label>
          </div>
        )}

        {isEdit && (
          <div className="flex items-center gap-3">
            <input
              id="ativo-checkbox"
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => set('ativo', e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
            />
            <label
              htmlFor="ativo-checkbox"
              className="text-sm font-medium text-foreground cursor-pointer select-none"
            >
              Colaborador ativo
            </label>
          </div>
        )}
      </div>

      {!isEdit && (
        <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
          <Mail className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <span>
            Ao salvar, geramos um <strong>link para ele definir a própria senha</strong>.
            Copie o link na confirmação e mande para o colaborador.
          </span>
        </div>
      )}

      {mutation.error && (
        <p className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
          {mutation.error instanceof Error
            ? mutation.error.message
            : 'Erro ao salvar colaborador'}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="gradient-primary rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {mutation.isPending
            ? 'Salvando...'
            : isEdit
              ? 'Salvar alterações'
              : 'Criar colaborador'}
        </button>
      </div>
    </form>
  )
}
