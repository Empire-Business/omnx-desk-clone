import { useState } from 'react'
import { Users, Upload, Plus, Eye, Pause, Play, X, CheckCircle, Send, Loader2 } from 'lucide-react'
import { CobrancaConversasPage } from './CobrancaConversasPage'
import {
  useDevedores,
  useDevedor,
  useCreateDevedor,
  useUpdateDevedorStatus,
  useImportDevedores,
  useCobrancaInstances,
  useCobrancaReguas,
  useManualSend,
  type CobrancaDevedor,
} from '@/hooks/useCobranca'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { cn, formatPhone } from '@/lib/utils'

function fmtBRL(value: number | null) {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(s: string) {
  const m: Record<string, string> = { ativa: 'Ativa', pausada: 'Pausada', encerrada: 'Encerrada', pago: 'Pago' }
  return m[s] ?? s
}

function statusBadge(s: string) {
  switch (s) {
    case 'ativa': return 'bg-info-light text-info'
    case 'pausada': return 'bg-warning-light text-warning'
    case 'encerrada': return 'bg-muted text-muted-foreground'
    case 'pago': return 'bg-success-light text-success'
    default: return 'bg-muted text-muted-foreground'
  }
}

function sendStatusBadge(s: string) {
  switch (s) {
    case 'enviado': return 'bg-success-light text-success'
    case 'enviando': return 'bg-info-light text-info'
    case 'falha': return 'bg-danger-light text-danger'
    default: return 'bg-muted text-muted-foreground'
  }
}

// ---- Detail modal ----

function DevedorDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useDevedor(id)
  const updateStatus = useUpdateDevedorStatus()
  const manualSend = useManualSend()

  const nextStatuses: Array<{ status: CobrancaDevedor['status']; label: string }> = [
    { status: 'ativa', label: 'Reativar' },
    { status: 'pausada', label: 'Pausar' },
    { status: 'encerrada', label: 'Encerrar' },
    { status: 'pago', label: 'Marcar pago' },
  ]

  return (
    <Modal open title={data?.nome ?? 'Devedor'} onClose={onClose} size="lg">
      {isLoading || !data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 shimmer rounded" />)}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">WhatsApp</p>
              <p className="font-medium text-foreground">{formatPhone(data.numero_whatsapp)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Valor da dívida</p>
              <p className="font-medium text-foreground">{fmtBRL(data.valor_divida)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vencimento</p>
              <p className="font-medium text-foreground">
                {data.data_vencimento ? new Date(data.data_vencimento).toLocaleDateString('pt-BR') : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Próximo envio</p>
              <p className="font-medium text-foreground">{fmtDate(data.proximo_envio_em)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Passo atual</p>
              <p className="font-medium text-foreground">{data.passo_atual}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', statusBadge(data.status))}>
                {statusLabel(data.status)}
              </span>
            </div>
            {data.descricao_divida && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Descrição</p>
                <p className="font-medium text-foreground">{data.descricao_divida}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {data.status === 'ativa' && (
              <button
                disabled={manualSend.isPending}
                onClick={() => manualSend.mutate(data.id)}
                className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {manualSend.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Enviar agora
              </button>
            )}
            {nextStatuses
              .filter((s) => s.status !== data.status)
              .map((s) => (
                <button
                  key={s.status}
                  disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate({ id: data.id, status: s.status })}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {s.label}
                </button>
              ))}
          </div>

          {data.cobranca_sends && data.cobranca_sends.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-foreground">Histórico de envios</h4>
              <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-left">
                      <th className="px-3 py-2 text-muted-foreground">Passo</th>
                      <th className="px-3 py-2 text-muted-foreground">Status</th>
                      <th className="px-3 py-2 text-muted-foreground">Enviado em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...data.cobranca_sends]
                      .sort((a, b) => new Date(b.enviado_em).getTime() - new Date(a.enviado_em).getTime())
                      .map((s) => (
                        <tr key={s.id}>
                          <td className="px-3 py-2 text-foreground">{s.passo}</td>
                          <td className="px-3 py-2">
                            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 font-medium', sendStatusBadge(s.status_envio))}>
                              {s.status_envio}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtDate(s.enviado_em)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ---- New devedor modal ----

const EMPTY_FORM = {
  instance_id: '',
  regua_id: '',
  nome: '',
  numero_whatsapp: '',
  valor_divida: '',
  descricao_divida: '',
  data_vencimento: '',
}

function NovoDevedorModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const { data: instances } = useCobrancaInstances()
  const { data: reguas } = useCobrancaReguas()
  const createDevedor = useCreateDevedor()

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.instance_id || !form.nome || !form.numero_whatsapp) return
    await createDevedor.mutateAsync({
      instance_id: form.instance_id,
      regua_id: form.regua_id || undefined,
      nome: form.nome,
      numero_whatsapp: form.numero_whatsapp,
      valor_divida: form.valor_divida ? parseFloat(form.valor_divida) : undefined,
      descricao_divida: form.descricao_divida || undefined,
      data_vencimento: form.data_vencimento || undefined,
    })
    onClose()
  }

  const inputCls = 'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'

  return (
    <Modal open title="Novo devedor" onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome *</label>
            <input className={inputCls} value={form.nome} onChange={set('nome')} placeholder="Nome do devedor" required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">WhatsApp *</label>
            <input className={inputCls} value={form.numero_whatsapp} onChange={set('numero_whatsapp')} placeholder="5511999999999" required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor da dívida (R$)</label>
            <input className={inputCls} type="number" step="0.01" value={form.valor_divida} onChange={set('valor_divida')} placeholder="0,00" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Instância *</label>
            <select className={inputCls} value={form.instance_id} onChange={set('instance_id')} required>
              <option value="">Selecione...</option>
              {instances?.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Régua de cobrança</label>
            <select className={inputCls} value={form.regua_id} onChange={set('regua_id')}>
              <option value="">Nenhuma</option>
              {reguas?.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data de vencimento</label>
            <input className={inputCls} type="date" value={form.data_vencimento} onChange={set('data_vencimento')} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição da dívida</label>
            <textarea
              className={cn(inputCls, 'resize-none')}
              rows={2}
              value={form.descricao_divida}
              onChange={set('descricao_divida')}
              placeholder="Descrição opcional..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createDevedor.isPending}
            className="gradient-primary rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {createDevedor.isPending ? 'Criando...' : 'Criar devedor'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ---- Import CSV modal ----

function ImportCsvModal({ onClose }: { onClose: () => void }) {
  const [csv, setCsv] = useState('')
  const [instanceId, setInstanceId] = useState('')
  const [reguaId, setReguaId] = useState('')
  const { data: instances } = useCobrancaInstances()
  const { data: reguas } = useCobrancaReguas()
  const importDevedores = useImportDevedores()

  const inputCls = 'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!instanceId || !reguaId || !csv.trim()) return
    const rows = csv
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [nome, numero_whatsapp, valor] = l.split(',').map((s) => s.trim())
        return { nome, numero_whatsapp, valor_divida: valor ? parseFloat(valor) : undefined }
      })
      .filter((r) => r.nome && r.numero_whatsapp)

    await importDevedores.mutateAsync({ rows, instance_id: instanceId, regua_id: reguaId })
    onClose()
  }

  return (
    <Modal open title="Importar CSV" description="Uma linha por devedor: nome,numero,valor" onClose={onClose} size="md">
      <form onSubmit={handleImport} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Instância *</label>
          <select className={inputCls} value={instanceId} onChange={(e) => setInstanceId(e.target.value)} required>
            <option value="">Selecione...</option>
            {instances?.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Régua de cobrança *</label>
          <select className={inputCls} value={reguaId} onChange={(e) => setReguaId(e.target.value)} required>
            <option value="">Selecione...</option>
            {reguas?.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Dados CSV</label>
          <textarea
            className={cn(inputCls, 'resize-none font-mono text-xs')}
            rows={8}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={'João Silva,5511999999999,1500.00\nMaria Souza,5511888888888,750.50'}
            required
          />
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={importDevedores.isPending}
            className="gradient-primary rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {importDevedores.isPending ? 'Importando...' : 'Importar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ---- Main page ----

type DevedoresTab = 'devedores' | 'conversas'

const DEVEDORES_TABS: { value: DevedoresTab; label: string }[] = [
  { value: 'devedores', label: 'Devedores' },
  { value: 'conversas', label: 'Conversas' },
]

export function DevedoresPage() {
  const [tab, setTab] = useState<DevedoresTab>('devedores')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterInstance, setFilterInstance] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNovo, setShowNovo] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const filter = {
    status: filterStatus || undefined,
    instance_id: filterInstance || undefined,
  }

  const { data: devedores, isLoading } = useDevedores(filter)
  const { data: instances } = useCobrancaInstances()
  const updateStatus = useUpdateDevedorStatus()
  const manualSend = useManualSend()

  const selectCls = 'rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 animate-fade-in">
      <PageHeader
        title="Devedores"
        description="Gerencie a lista de devedores em cobrança"
        action={
          tab === 'devedores' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Upload className="h-4 w-4" />
                Importar CSV
              </button>
              <button
                onClick={() => setShowNovo(true)}
                className="gradient-primary flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                <Plus className="h-4 w-4" />
                Novo devedor
              </button>
            </div>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {DEVEDORES_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'conversas' && <CobrancaConversasPage />}

      {tab === 'devedores' && <>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className={selectCls}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Todos os status</option>
            <option value="ativa">Ativa</option>
            <option value="pausada">Pausada</option>
            <option value="encerrada">Encerrada</option>
            <option value="pago">Pago</option>
          </select>
          <select
            className={selectCls}
            value={filterInstance}
            onChange={(e) => setFilterInstance(e.target.value)}
          >
            <option value="">Todas as instâncias</option>
            {instances?.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 shimmer rounded-lg" />)}
          </div>
        ) : !devedores || devedores.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nenhum devedor encontrado"
            description="Crie um novo devedor ou importe uma lista CSV."
            action={
              <button
                onClick={() => setShowNovo(true)}
                className="gradient-primary rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Novo devedor
              </button>
            }
          />
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 sm:px-4 py-3 text-xs font-medium text-muted-foreground">Nome</th>
                    <th className="hidden sm:table-cell px-3 sm:px-4 py-3 text-xs font-medium text-muted-foreground">WhatsApp</th>
                    <th className="px-3 sm:px-4 py-3 text-xs font-medium text-muted-foreground">Valor</th>
                    <th className="hidden md:table-cell px-3 sm:px-4 py-3 text-xs font-medium text-muted-foreground">Próximo envio</th>
                    <th className="hidden lg:table-cell px-3 sm:px-4 py-3 text-xs font-medium text-muted-foreground">Passo</th>
                    <th className="px-3 sm:px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-3 sm:px-4 py-3 text-xs font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {devedores.map((d) => (
                    <tr key={d.id} className="entity-card-hover transition-colors">
                      <td className="px-3 sm:px-4 py-3 font-medium text-foreground">{d.nome}</td>
                      <td className="hidden sm:table-cell px-3 sm:px-4 py-3 text-muted-foreground">{formatPhone(d.numero_whatsapp)}</td>
                      <td className="px-3 sm:px-4 py-3 text-foreground">{fmtBRL(d.valor_divida)}</td>
                      <td className="hidden md:table-cell px-3 sm:px-4 py-3 text-muted-foreground">{fmtDate(d.proximo_envio_em)}</td>
                      <td className="hidden lg:table-cell px-3 sm:px-4 py-3 text-center text-muted-foreground">{d.passo_atual}</td>
                      <td className="px-3 sm:px-4 py-3">
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', statusBadge(d.status))}>
                          {statusLabel(d.status)}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            title="Ver detalhes"
                            onClick={() => setSelectedId(d.id)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {d.status === 'ativa' && (
                            <button
                              title="Enviar agora"
                              disabled={manualSend.isPending}
                              onClick={() => manualSend.mutate(d.id)}
                              className="rounded p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          )}
                          {d.status === 'ativa' && (
                            <button
                              title="Pausar"
                              disabled={updateStatus.isPending}
                              onClick={() => updateStatus.mutate({ id: d.id, status: 'pausada' })}
                              className="rounded p-1.5 text-muted-foreground hover:bg-warning-light hover:text-warning transition-colors disabled:opacity-50"
                            >
                              <Pause className="h-4 w-4" />
                            </button>
                          )}
                          {d.status === 'pausada' && (
                            <button
                              title="Reativar"
                              disabled={updateStatus.isPending}
                              onClick={() => updateStatus.mutate({ id: d.id, status: 'ativa' })}
                              className="rounded p-1.5 text-muted-foreground hover:bg-info-light hover:text-info transition-colors disabled:opacity-50"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                          )}
                          {d.status !== 'pago' && d.status !== 'encerrada' && (
                            <button
                              title="Marcar pago"
                              disabled={updateStatus.isPending}
                              onClick={() => updateStatus.mutate({ id: d.id, status: 'pago' })}
                              className="rounded p-1.5 text-muted-foreground hover:bg-success-light hover:text-success transition-colors disabled:opacity-50"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                          {d.status !== 'encerrada' && (
                            <button
                              title="Encerrar"
                              disabled={updateStatus.isPending}
                              onClick={() => updateStatus.mutate({ id: d.id, status: 'encerrada' })}
                              className="rounded p-1.5 text-muted-foreground hover:bg-danger-light hover:text-danger transition-colors disabled:opacity-50"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedId && <DevedorDetailModal id={selectedId} onClose={() => setSelectedId(null)} />}
        {showNovo && <NovoDevedorModal onClose={() => setShowNovo(false)} />}
        {showImport && <ImportCsvModal onClose={() => setShowImport(false)} />}
      </>}
    </div>
  )
}
