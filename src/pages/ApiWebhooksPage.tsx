import { useState } from 'react'
import {
  Key,
  Webhook,
  Plus,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Shield,
  Globe,
  RefreshCw,
  Clock,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { AbasRolaveis } from '@/components/ui/AbasRolaveis'
import { TabelaResponsiva } from '@/components/ui/TabelaResponsiva'
import { cn } from '@/lib/utils'
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  useDeleteApiKey,
} from '@/hooks/useApiKeys'
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useToggleWebhook,
  useWebhookLogs,
} from '@/hooks/useApiKeys'

// ─── Types ──────────────────────────────────────────────────────────────────

type Tab = 'api-keys' | 'webhooks'

interface ChaveApi {
  id: string
  nome: string
  key_prefix: string
  permissoes: string[]
  ativo: boolean
  ultimo_uso: string | null
}

interface ApiKeyForm {
  nome: string
  permissoes: string[]
  expiracao: string
}

interface WebhookForm {
  nome: string
  url: string
  eventos: string[]
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PERMISSOES = [
  { value: 'send_message', label: 'Enviar mensagens' },
  { value: 'list_conversations', label: 'Listar conversas' },
  { value: 'manage_contacts', label: 'Gerenciar contatos' },
  { value: 'create_broadcast', label: 'Criar campanhas' },
  { value: 'view_instances', label: 'Visualizar instancias' },
]

const EXPIRACAO_OPTIONS = [
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
  { value: '365', label: '365 dias' },
  { value: 'never', label: 'Nunca' },
]

const WEBHOOK_EVENTOS = [
  { value: 'message.received', label: 'Mensagem recebida' },
  { value: 'message.sent', label: 'Mensagem enviada' },
  { value: 'message.delivered', label: 'Mensagem entregue' },
  { value: 'message.read', label: 'Mensagem lida' },
  { value: 'conversation.opened', label: 'Conversa aberta' },
  { value: 'conversation.assigned', label: 'Conversa atribuida' },
  { value: 'conversation.transferred', label: 'Conversa transferida' },
  { value: 'conversation.closed', label: 'Conversa fechada' },
  { value: 'csat.received', label: 'CSAT recebido' },
  { value: 'sla.violated', label: 'SLA violado' },
  { value: 'ia.alert', label: 'Alerta IA' },
  { value: 'instance.disconnected', label: 'Instancia desconectada' },
]

// ─── Helper components ──────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
        checked ? 'bg-primary' : 'bg-muted'
      )}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-pop ring-0 transition duration-200',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  )
}

function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Nunca'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Agora'
  if (diffMin < 60) return `${diffMin}min atras`
  if (diffHour < 24) return `${diffHour}h atras`
  if (diffDay < 30) return `${diffDay}d atras`
  return date.toLocaleDateString('pt-BR')
}

function WebhookLogSection({ webhookId }: { webhookId: string }) {
  const { data: logs, isLoading } = useWebhookLogs(webhookId)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Carregando logs...
      </div>
    )
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="py-3 text-xs text-muted-foreground">
        Nenhum log encontrado.
      </div>
    )
  }

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/50 p-3"
        >
          <span
            className={cn(
              'mt-0.5 inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[12px] font-semibold',
              log.status_code !== null && log.status_code >= 200 && log.status_code < 300
                ? 'bg-success-light text-success'
                : 'bg-danger-light text-danger'
            )}
          >
            {log.status_code ?? 'Sem resposta'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {formatRelativeDate(log.criado_em)}
            </p>
            {log.response_body && (
              <p className="mt-1 truncate font-mono text-[12px] text-muted-foreground">
                {log.response_body}
              </p>
            )}
            {!log.sucesso && !log.response_body && (
              <p className="mt-1 truncate text-[12px] text-danger">
                Não foi possível entregar este evento.
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export function ApiWebhooksPage() {
  const [tab, setTab] = useState<Tab>('api-keys')

  // API Keys state
  const { data: apiKeys, isLoading: keysLoading } = useApiKeys()
  const createKey = useCreateApiKey()
  const revokeKey = useRevokeApiKey()
  const deleteKey = useDeleteApiKey()
  const [showKeyForm, setShowKeyForm] = useState(false)
  const [keyForm, setKeyForm] = useState<ApiKeyForm>({
    nome: '',
    permissoes: [],
    expiracao: '90',
  })
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)

  // Webhooks state
  const { data: webhooks, isLoading: webhooksLoading } = useWebhooks()
  const createWebhook = useCreateWebhook()
  const updateWebhook = useUpdateWebhook()
  const deleteWebhook = useDeleteWebhook()
  const toggleWebhook = useToggleWebhook()
  const [showWebhookForm, setShowWebhookForm] = useState(false)
  const [webhookForm, setWebhookForm] = useState<WebhookForm>({
    nome: '',
    url: '',
    eventos: [],
  })
  const [editingWebhookId, setEditingWebhookId] = useState<string | null>(null)
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({})

  // ─── API Key handlers ───────────────────────────────────────────────────

  function togglePermissao(perm: string) {
    setKeyForm((prev) => ({
      ...prev,
      permissoes: prev.permissoes.includes(perm)
        ? prev.permissoes.filter((p) => p !== perm)
        : [...prev.permissoes, perm],
    }))
  }

  async function handleCreateKey() {
    if (!keyForm.nome.trim()) return
    try {
      const result = await createKey.mutateAsync({
        nome: keyForm.nome,
        permissoes: keyForm.permissoes,
        expira_em: keyForm.expiracao === 'never' ? null : new Date(Date.now() + Number(keyForm.expiracao) * 86400000).toISOString(),
      })
      setCreatedKey(result.fullKey)
      createKey.reset() // a chave completa não fica no cache de mutações; só neste estado local
      setKeyForm({ nome: '', permissoes: [], expiracao: '90' })
    } catch {
      // error handled by mutation
    }
  }

  function handleDismissCreatedKey() {
    setCreatedKey(null)
    setShowKeyForm(false)
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  // ─── Webhook handlers ──────────────────────────────────────────────────

  function toggleEvento(evento: string) {
    setWebhookForm((prev) => ({
      ...prev,
      eventos: prev.eventos.includes(evento)
        ? prev.eventos.filter((e) => e !== evento)
        : [...prev.eventos, evento],
    }))
  }

  async function handleSaveWebhook() {
    if (!webhookForm.nome.trim() || !webhookForm.url.trim()) return
    try {
      if (editingWebhookId) {
        await updateWebhook.mutateAsync({
          id: editingWebhookId,
          nome: webhookForm.nome,
          url: webhookForm.url,
          eventos: webhookForm.eventos,
        })
      } else {
        await createWebhook.mutateAsync({
          nome: webhookForm.nome,
          url: webhookForm.url,
          eventos: webhookForm.eventos,
        })
      }
      setWebhookForm({ nome: '', url: '', eventos: [] })
      setShowWebhookForm(false)
      setEditingWebhookId(null)
    } catch {
      // error handled by mutation
    }
  }

  function handleEditWebhook(webhook: { id: string; nome: string; url: string; eventos: string[] }) {
    setEditingWebhookId(webhook.id)
    setWebhookForm({
      nome: webhook.nome,
      url: webhook.url,
      eventos: webhook.eventos ?? [],
    })
    setShowWebhookForm(true)
  }

  function handleCancelWebhookForm() {
    setShowWebhookForm(false)
    setEditingWebhookId(null)
    setWebhookForm({ nome: '', url: '', eventos: [] })
  }

  function toggleLogExpansion(id: string) {
    setExpandedLogs((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageHeader
        title="API e Webhooks"
        description="Gerencie chaves de API e webhooks para integrações externas."
      />
      <p className="text-sm text-muted-foreground">
        Documentação pública, sem login:{' '}
        <a href="/docs/api/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">
          API REST <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
        {' · '}
        <a href="/docs/mcp" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">
          Conectar uma IA (MCP) <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
        <br />
        A API v2 (<code>chat-api-v2</code>) e o MCP aceitam as mesmas chaves, mas <strong>não oferecem envio de mensagens</strong>: a permissão &quot;Enviar mensagens&quot; só vale na API original.
      </p>

      <AbasRolaveis
        rotulo="Seções de integração"
        itens={[
          { id: 'api-keys', rotulo: 'Chaves de API', icone: Key, ativo: tab === 'api-keys', onClick: () => setTab('api-keys') },
          { id: 'webhooks', rotulo: 'Webhooks', icone: Webhook, ativo: tab === 'webhooks', onClick: () => setTab('webhooks') },
        ]}
      />

      {/* ── API Keys Tab ── */}
      {tab === 'api-keys' && (
        <div className="space-y-4">
          {/* Created key banner */}
          {createdKey && (
            <div className="glass-card border-2 border-warning/30 bg-warning/5 p-3 sm:p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Chave de API criada com sucesso
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Copie a chave abaixo. Ela nao sera exibida novamente.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <code className="t-mono min-w-0 flex-1 break-all rounded-md border border-stroke-default bg-background px-3 py-2.5">
                  {createdKey}
                </code>
                <button
                  onClick={() => copyToClipboard(createdKey)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors shrink-0',
                    copiedKey
                      ? 'bg-success-light text-success border-success/30'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  {copiedKey ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copiedKey ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <button
                onClick={handleDismissCreatedKey}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Fechar
              </button>
            </div>
          )}

          {/* New key button / form */}
          {!showKeyForm && !createdKey && (
            <button
              onClick={() => setShowKeyForm(true)}
              className="btn btn-primary"
            >
              <Plus className="h-4 w-4" />
              Nova API Key
            </button>
          )}

          {showKeyForm && !createdKey && (
            <div className="glass-card space-y-4 p-3 sm:p-4 lg:p-6">
              <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Nova API Key</h2>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Nome
                </label>
                <input
                  type="text"
                  value={keyForm.nome}
                  onChange={(e) => setKeyForm((prev) => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex.: Integração CRM"
                  className="input w-full"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Permissoes
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {PERMISSOES.map((perm) => (
                    <label
                      key={perm.value}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors',
                        keyForm.permissoes.includes(perm.value)
                          ? 'border-primary/40 bg-primary-muted'
                          : 'border-border hover:bg-muted/30'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={keyForm.permissoes.includes(perm.value)}
                        onChange={() => togglePermissao(perm.value)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                      />
                      <span className="text-sm text-foreground">{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Expiracao
                </label>
                <select
                  value={keyForm.expiracao}
                  onChange={(e) => setKeyForm((prev) => ({ ...prev, expiracao: e.target.value }))}
                  className="input w-full"
                >
                  {EXPIRACAO_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleCreateKey}
                  disabled={createKey.isPending || !keyForm.nome.trim()}
                  className="btn btn-primary"
                >
                  {createKey.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4" />
                      Criar chave
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowKeyForm(false)
                    setKeyForm({ nome: '', permissoes: [], expiracao: '90' })
                  }}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Keys table */}
          <div>
            {keysLoading ? (
              <div role="status" aria-label="Carregando chaves" className="glass-card space-y-2 p-4">
                {[0, 1, 2].map((i) => <div key={i} className="sk h-10 rounded-md" />)}
              </div>
            ) : !apiKeys || apiKeys.length === 0 ? (
              <div className="glass-card flex flex-col items-center justify-center gap-3 py-12 text-center">
                <Key className="h-10 w-10 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium text-foreground">Nenhuma API Key</p>
                  <p className="text-xs text-muted-foreground">
                    Crie uma chave para integrar sistemas externos.
                  </p>
                </div>
              </div>
            ) : (
              <TabelaResponsiva
                rotulo="Chaves de API"
                linhas={apiKeys as ChaveApi[]}
                chave={(k) => k.id}
                colunas={[
                  { id: 'nome', titulo: 'Nome', principal: true, celula: (k) => (
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span className="font-medium text-foreground">{k.nome}</span>
                    </div>
                  ) },
                  { id: 'prefixo', titulo: 'Prefixo', celula: (k) => <code className="t-mono rounded bg-muted px-2 py-0.5 text-foreground">{k.key_prefix}...</code> },
                  { id: 'permissoes', titulo: 'Permissões', celula: (k) => (
                    <div className="flex flex-wrap gap-1">
                      {(k.permissoes ?? []).map((perm: string) => <span key={perm} className="tag">{perm}</span>)}
                    </div>
                  ) },
                  { id: 'status', titulo: 'Situação', celula: (k) => <span className={k.ativo ? 'tag tag-success' : 'tag tag-danger'}>{k.ativo ? 'Ativa' : 'Revogada'}</span> },
                  { id: 'uso', titulo: 'Último uso', celula: (k) => (
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                      <Clock className="h-3 w-3" aria-hidden />
                      {formatRelativeDate(k.ultimo_uso)}
                    </span>
                  ) },
                ]}
                acoes={(k) => (
                  <>
                    {k.ativo && (
                      <button onClick={() => revokeKey.mutateAsync(k.id)} disabled={revokeKey.isPending} className="btn btn-ghost btn-sm" title="Revogar">
                        <Shield className="h-3.5 w-3.5" aria-hidden /> Revogar
                      </button>
                    )}
                    <button onClick={() => deleteKey.mutateAsync(k.id)} disabled={deleteKey.isPending} className="btn btn-ghost btn-sm text-danger" title="Excluir" aria-label="Excluir chave">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </>
                )}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Webhooks Tab ── */}
      {tab === 'webhooks' && (
        <div className="space-y-4">
          {/* New webhook button / form */}
          {!showWebhookForm && (
            <button
              onClick={() => setShowWebhookForm(true)}
              className="btn btn-primary"
            >
              <Plus className="h-4 w-4" />
              Novo Webhook
            </button>
          )}

          {showWebhookForm && (
            <div className="glass-card space-y-4 p-3 sm:p-4 lg:p-6">
              <div className="flex items-center gap-3">
                <Webhook className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">
                  {editingWebhookId ? 'Editar Webhook' : 'Novo Webhook'}
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Nome
                  </label>
                  <input
                    type="text"
                    value={webhookForm.nome}
                    onChange={(e) =>
                      setWebhookForm((prev) => ({ ...prev, nome: e.target.value }))
                    }
                    placeholder="Ex: CRM Webhook"
                    className="input w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    URL
                  </label>
                  <input
                    type="url"
                    value={webhookForm.url}
                    onChange={(e) =>
                      setWebhookForm((prev) => ({ ...prev, url: e.target.value }))
                    }
                    placeholder="https://api.exemplo.com/webhook"
                    className="input mono w-full"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Eventos
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {WEBHOOK_EVENTOS.map((evento) => (
                    <label
                      key={evento.value}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors',
                        webhookForm.eventos.includes(evento.value)
                          ? 'border-primary/40 bg-primary-muted'
                          : 'border-border hover:bg-muted/30'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={webhookForm.eventos.includes(evento.value)}
                        onChange={() => toggleEvento(evento.value)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                      />
                      <span className="text-sm text-foreground">{evento.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSaveWebhook}
                  disabled={
                    (createWebhook.isPending || updateWebhook.isPending) ||
                    !webhookForm.nome.trim() ||
                    !webhookForm.url.trim()
                  }
                  className="btn btn-primary"
                >
                  {(createWebhook.isPending || updateWebhook.isPending) ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Globe className="h-4 w-4" />
                      {editingWebhookId ? 'Salvar alterações' : 'Criar webhook'}
                    </>
                  )}
                </button>
                <button
                  onClick={handleCancelWebhookForm}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Webhooks list */}
          {webhooksLoading ? (
            <div className="glass-card flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Carregando webhooks...
            </div>
          ) : !webhooks || webhooks.length === 0 ? (
            <div className="glass-card flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Webhook className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-foreground">Nenhum Webhook</p>
                <p className="text-xs text-muted-foreground">
                  Configure webhooks para receber eventos em tempo real.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map((webhook) => (
                <div key={webhook.id} className="glass-card p-3 sm:p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <Webhook className="h-4 w-4 text-primary shrink-0" />
                        <h3 className="text-sm font-semibold text-foreground">{webhook.nome}</h3>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium',
                            webhook.ativo
                              ? 'bg-success-light text-success'
                              : 'bg-danger-light text-danger'
                          )}
                        >
                          {webhook.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                        <code className="truncate font-mono text-xs text-muted-foreground">
                          {webhook.url}
                        </code>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {(webhook.eventos ?? []).map((evento: string) => (
                          <span
                            key={evento}
                            className="inline-flex items-center rounded-full bg-primary-muted px-2 py-0.5 text-[12px] font-medium text-primary"
                          >
                            {evento}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Toggle
                        checked={webhook.ativo}
                        onChange={() => toggleWebhook.mutate({ id: webhook.id, ativo: webhook.ativo })}
                        disabled={toggleWebhook.isPending}
                      />
                      <button
                        onClick={() => handleEditWebhook(webhook)}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                        title="Editar"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        onClick={() => deleteWebhook.mutateAsync(webhook.id)}
                        disabled={deleteWebhook.isPending}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger-light transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expandable logs */}
                  <div className="border-t border-border/50 pt-2">
                    <button
                      onClick={() => toggleLogExpansion(webhook.id)}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {expandedLogs[webhook.id] ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      Últimos registros
                    </button>

                    {expandedLogs[webhook.id] && (
                      <div className="mt-2">
                        <WebhookLogSection webhookId={webhook.id} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  )
}
