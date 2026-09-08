import { useState } from 'react'
import { GitBranch, ChevronDown, ChevronUp, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import {
  useCobrancaReguas,
  useCreateRegua,
  useUpdateRegua,
  useDeleteRegua,
  useCreatePasso,
  useDeletePasso,
  type CobrancaReguaWithPassos,
  type CobrancaReguaPasso,
} from '@/hooks/useCobranca'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils'

const inputCls = 'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'

// ---- Nova régua modal ----

function NovaReguaModal({ onClose }: { onClose: () => void }) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const createRegua = useCreateRegua()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return
    await createRegua.mutateAsync({ nome: nome.trim(), descricao: descricao.trim() || undefined })
    onClose()
  }

  return (
    <Modal open title="Nova régua" onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome *</label>
          <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Cobrança padrão 30 dias" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição</label>
          <textarea
            className={cn(inputCls, 'resize-none')}
            rows={2}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descrição opcional..."
          />
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createRegua.isPending}
            className="gradient-primary rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {createRegua.isPending ? 'Criando...' : 'Criar régua'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ---- Adicionar passo inline form ----

function AddPassoForm({ regua, onDone }: { regua: CobrancaReguaWithPassos; onDone: () => void }) {
  const [dias, setDias] = useState('1')
  const [mensagem, setMensagem] = useState('')
  const [usarIa, setUsarIa] = useState(false)
  const createPasso = useCreatePasso()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mensagem.trim()) return
    const maxOrdem = regua.cobranca_regua_passos.reduce((m, p) => Math.max(m, p.ordem), 0)
    await createPasso.mutateAsync({
      regua_id: regua.id,
      ordem: maxOrdem + 1,
      dias_apos_anterior: parseInt(dias, 10) || 1,
      mensagem_template: mensagem.trim(),
      usar_ia_variacao: usarIa,
    })
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Novo passo</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Dias após anterior</label>
          <input
            className={inputCls}
            type="number"
            min="0"
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            required
          />
        </div>
        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setUsarIa((v) => !v)}
              className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors', usarIa ? 'bg-primary' : 'bg-muted-foreground/30')}
            >
              <span className={cn('inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform', usarIa ? 'translate-x-4.5' : 'translate-x-0.5')} />
            </button>
            <span className="text-xs text-muted-foreground">Usar IA variação</span>
          </label>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Mensagem template *</label>
        <textarea
          className={cn(inputCls, 'resize-none text-xs')}
          rows={3}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          placeholder="Olá {nome}, sua dívida de {valor} venceu em {vencimento}..."
          required
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={createPasso.isPending}
          className="gradient-primary rounded-lg px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {createPasso.isPending ? 'Salvando...' : 'Salvar passo'}
        </button>
      </div>
    </form>
  )
}

// ---- Passo row ----

function PassoRow({ passo }: { passo: CobrancaReguaPasso }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deletePasso = useDeletePasso()

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
        {passo.ordem}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {passo.dias_apos_anterior === 0 ? 'Imediato' : `${passo.dias_apos_anterior} dia${passo.dias_apos_anterior !== 1 ? 's' : ''} após anterior`}
          </span>
          {passo.usar_ia_variacao && (
            <span className="rounded-full bg-info-light px-2 py-0.5 text-xs font-medium text-info">IA variação</span>
          )}
        </div>
        <p className="text-xs text-foreground line-clamp-2">{passo.mensagem_template}</p>
      </div>
      <button
        onClick={() => setConfirmDelete(true)}
        className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-danger-light hover:text-danger transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deletePasso.mutate({ id: passo.id, regua_id: passo.regua_id })}
        title="Excluir passo"
        description="Deseja excluir este passo? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        loading={deletePasso.isPending}
      />
    </div>
  )
}

// ---- Régua card ----

function ReguaCard({ regua }: { regua: CobrancaReguaWithPassos }) {
  const [expanded, setExpanded] = useState(false)
  const [showAddPasso, setShowAddPasso] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const updateRegua = useUpdateRegua()
  const deleteRegua = useDeleteRegua()

  const passos = [...regua.cobranca_regua_passos].sort((a, b) => a.ordem - b.ordem)

  return (
    <div className="glass-card overflow-hidden">
      <div
        className="flex cursor-pointer items-center gap-4 p-5"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-foreground">{regua.nome}</h3>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', regua.ativo ? 'bg-success-light text-success' : 'bg-muted text-muted-foreground')}>
              {regua.ativo ? 'Ativo' : 'Inativo'}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {passos.length} passo{passos.length !== 1 ? 's' : ''}
            </span>
          </div>
          {regua.descricao && <p className="mt-0.5 text-xs text-muted-foreground">{regua.descricao}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            title={regua.ativo ? 'Desativar' : 'Ativar'}
            onClick={() => updateRegua.mutate({ id: regua.id, ativo: !regua.ativo })}
            disabled={updateRegua.isPending}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {regua.ativo ? <ToggleRight className="h-5 w-5 text-success" /> : <ToggleLeft className="h-5 w-5" />}
          </button>
          <button
            title="Excluir régua"
            onClick={() => setConfirmDelete(true)}
            className="rounded p-1.5 text-muted-foreground hover:bg-danger-light hover:text-danger transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <div className="ml-1 text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-5 pb-5 pt-4 space-y-3">
          {passos.length === 0 && !showAddPasso && (
            <p className="text-sm text-muted-foreground">Nenhum passo cadastrado ainda.</p>
          )}
          {passos.map((p) => <PassoRow key={p.id} passo={p} />)}

          {showAddPasso ? (
            <AddPassoForm regua={regua} onDone={() => setShowAddPasso(false)} />
          ) : (
            <button
              onClick={() => setShowAddPasso(true)}
              className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="h-4 w-4" />
              Adicionar passo
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteRegua.mutate(regua.id)}
        title="Excluir régua"
        description={`Deseja excluir a régua "${regua.nome}"? Todos os passos serão removidos.`}
        confirmLabel="Excluir"
        loading={deleteRegua.isPending}
      />
    </div>
  )
}

// ---- Main page ----

export function ReguasPage() {
  const [showNova, setShowNova] = useState(false)
  const { data: reguas, isLoading } = useCobrancaReguas()

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 animate-fade-in">
      <PageHeader
        title="Réguas de cobrança"
        description="Configure as sequências de mensagens automáticas"
        action={
          <button
            onClick={() => setShowNova(true)}
            className="gradient-primary flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            Nova régua
          </button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 shimmer rounded-xl" />)}
        </div>
      ) : !reguas || reguas.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="Nenhuma régua cadastrada"
          description="Crie uma régua para definir a sequência de mensagens de cobrança."
          action={
            <button
              onClick={() => setShowNova(true)}
              className="gradient-primary rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Nova régua
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {reguas.map((r) => <ReguaCard key={r.id} regua={r} />)}
        </div>
      )}

      {showNova && <NovaReguaModal onClose={() => setShowNova(false)} />}
    </div>
  )
}
