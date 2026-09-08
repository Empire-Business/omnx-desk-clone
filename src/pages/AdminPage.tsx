import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageSquare,
  DollarSign,
  Plug,
  Settings,
  Eye,
  EyeOff,
  Copy,
  Check,
  Save,
  Smartphone,
  Handshake,
  FileBarChart,
  Building2,
  UserCog,
  Key,
  Shield,
  ChevronRight,
  Zap,
  Sliders,
  ShieldCheck,
} from 'lucide-react'
import { PermissoesMatriz } from '@/components/admin/PermissoesMatriz'
import { useAppSettings, useSaveAppSetting } from '@/hooks/useAppSettings'
import { useInstances } from '@/hooks/useChat'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn, formatPhone } from '@/lib/utils'
import type { InstanceCategoria } from '@/types/database'
import { instanceCorHex } from '@/lib/instanceColors'

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsTab = 'chat' | 'cobranca' | 'permissoes' | 'integracoes' | 'sistema'

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'cobranca', label: 'Cobrança', icon: DollarSign },
  { id: 'permissoes', label: 'Permissões', icon: ShieldCheck },
  { id: 'integracoes', label: 'Integrações', icon: Plug },
  { id: 'sistema', label: 'Sistema', icon: Settings },
]

const QUICK_LINKS = [
  { label: 'Interações', description: 'Histórico de interações com clientes', icon: Handshake, to: '/interacoes' },
  { label: 'Relatórios', description: 'Relatórios e métricas da plataforma', icon: FileBarChart, to: '/relatorios' },
  { label: 'Departamentos', description: 'Gestão de departamentos e equipes', icon: Building2, to: '/departamentos' },
  { label: 'Colaboradores', description: 'Cadastro e permissões de colaboradores', icon: UserCog, to: '/colaboradores' },
  { label: 'API & Webhooks', description: 'Chaves de API e webhooks outbound', icon: Key, to: '/api-webhooks' },
  { label: 'Auditoria', description: 'Log de auditoria e ações do sistema', icon: Shield, to: '/auditoria' },
]

// ─── Reusable components ──────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: {
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
        checked ? 'bg-primary' : 'bg-muted',
      )}
      role="switch"
      aria-checked={checked}
    >
      <span className={cn(
        'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition duration-200',
        checked ? 'translate-x-5' : 'translate-x-0',
      )} />
    </button>
  )
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {children}
      </label>
      {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
    </div>
  )
}

function InputField({ label, value, onChange, type = 'text', placeholder, suffix, hint }: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  suffix?: string
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all',
            suffix && 'pr-14',
          )}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function SaveButton({ onClick, saving, saved }: {
  onClick: () => void
  saving: boolean
  saved: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="gradient-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
    >
      {saving ? (
        <>
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
          Salvando…
        </>
      ) : saved ? (
        <><Check className="h-4 w-4" /> Salvo!</>
      ) : (
        <><Save className="h-4 w-4" /> Salvar alterações</>
      )}
    </button>
  )
}

function ToggleRow({ title, description, checked, onChange }: {
  title: string
  description: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card/40 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

function useSettingsState(settings: Record<string, string> | undefined) {
  const [local, setLocal] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings) setLocal(settings)
  }, [settings])

  function get(key: string, fallback = ''): string {
    return local[key] ?? fallback
  }

  function set(key: string, value: string) {
    setSaved(false)
    setLocal((prev) => ({ ...prev, [key]: value }))
  }

  return { get, set, local, saved, setSaved }
}

// ─── Instance Categoria Manager ───────────────────────────────────────────────

const CATEGORIA_OPTIONS: { value: InstanceCategoria | ''; label: string }[] = [
  { value: '', label: 'Sem categoria' },
  { value: 'suporte', label: 'Suporte' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'entrega', label: 'Entrega' },
]

function InstanceCategoriaManager() {
  const { data: instances = [], refetch } = useInstances(null)
  const [updating, setUpdating] = useState<string | null>(null)

  async function handleUpdate(instanceId: string, patch: Record<string, unknown>) {
    setUpdating(instanceId)
    await supabase.from('whatsapp_instances').update(patch).eq('id', instanceId)
    setUpdating(null)
    refetch()
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Configure visibilidade, categoria e cor de cada instância. Instâncias inativas não aparecem no seletor de envio.
      </p>
      {instances.map(inst => (
        <div key={inst.id} className="flex flex-col gap-3 rounded-lg border border-border px-3 py-2.5 bg-card sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="h-3 w-3 shrink-0 rounded-full ring-2 ring-background"
              style={{ backgroundColor: instanceCorHex(inst.cor) }}
              aria-hidden
            />
            <Smartphone className={cn('h-4 w-4 shrink-0', inst.ativo ? 'text-success' : 'text-muted-foreground')} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{inst.nome}</p>
              {inst.numero_whatsapp && (
                <p className="text-xs font-mono text-muted-foreground">{formatPhone(inst.numero_whatsapp)}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              value={inst.categoria ?? ''}
              onChange={(e) => handleUpdate(inst.id, { categoria: (e.target.value || null) as InstanceCategoria | null })}
              disabled={updating === inst.id}
              className={cn(
                'rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring transition-colors',
                updating === inst.id && 'opacity-50',
              )}
            >
              {CATEGORIA_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <Toggle
              checked={inst.ativo}
              onChange={() => handleUpdate(inst.id, { ativo: !inst.ativo })}
              disabled={updating === inst.id}
            />
          </div>
        </div>
      ))}
      {instances.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">Nenhuma instância cadastrada.</p>
      )}
    </div>
  )
}

// ─── Settings Card Wrapper ────────────────────────────────────────────────────

function SettingsBlock({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdminPage() {
  const [tab, setTab] = useState<SettingsTab>('chat')
  const navigate = useNavigate()
  const { data: settings } = useAppSettings()
  const saveSetting = useSaveAppSetting()
  const ss = useSettingsState(settings)
  const [saving, setSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function saveSettings(keys: string[]) {
    setSaving(true)
    try {
      for (const key of keys) {
        await saveSetting.mutateAsync({ chave: key, valor: ss.get(key) })
      }
      ss.setSaved(true)
      setTimeout(() => ss.setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Painel administrativo"
        description="Acesso rápido aos módulos de gestão e configurações globais da plataforma."
      />

      {/* ── Acesso rápido ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Zap className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Acesso rápido</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((tool) => (
            <button
              key={tool.to}
              onClick={() => navigate(tool.to)}
              className="glass-card flex items-center gap-3 p-4 text-left hover:bg-muted/30 hover:border-primary/20 transition-all group"
            >
              <div className="rounded-lg bg-primary/10 p-2.5 shrink-0 group-hover:bg-primary/20 transition-colors">
                <tool.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{tool.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{tool.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
            </button>
          ))}
        </div>
      </section>

      {/* ── Configurações ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sliders className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Configurações</h2>
        </div>

        {/* Tabs */}
        <div className="glass-card p-1 inline-flex overflow-x-auto scrollbar-hide">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                tab === t.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Painel */}
        <div className="glass-card p-5 sm:p-6 space-y-6 animate-fade-in">

          {/* ── Chat ── */}
          {tab === 'chat' && (
            <>
              <SettingsBlock title="Chat" description="Tempos de resposta, mensagens automáticas e identificação do agente.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <InputField
                    label="SLA primeira resposta"
                    value={ss.get('chat_sla_primeira_resposta', '5')}
                    onChange={(v) => ss.set('chat_sla_primeira_resposta', v)}
                    type="number"
                    placeholder="5"
                    suffix="min"
                  />
                  <InputField
                    label="SLA resolução"
                    value={ss.get('chat_sla_resolucao', '24')}
                    onChange={(v) => ss.set('chat_sla_resolucao', v)}
                    type="number"
                    placeholder="24"
                    suffix="horas"
                  />
                </div>

                <InputField
                  label="Auto-encerrar conversas inativas após"
                  value={ss.get('chat_auto_close_hours', '48')}
                  onChange={(v) => ss.set('chat_auto_close_hours', v)}
                  type="number"
                  placeholder="48"
                  suffix="horas"
                />

                <div className="space-y-1.5">
                  <FieldLabel>Mensagem de boas-vindas padrão</FieldLabel>
                  <textarea
                    value={ss.get('chat_greeting_message', '')}
                    onChange={(e) => ss.set('chat_greeting_message', e.target.value)}
                    placeholder="Olá! Seja bem-vindo. Como posso ajudá-lo?"
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <FieldLabel>Identificação do agente</FieldLabel>
                  <ToggleRow
                    title="Mostrar nome no painel"
                    description="Exibe o nome do agente nos balões de mensagem enviada"
                    checked={ss.get('chat_mostrar_nome_agente_painel', 'true') === 'true'}
                    onChange={() =>
                      ss.set('chat_mostrar_nome_agente_painel', ss.get('chat_mostrar_nome_agente_painel', 'true') === 'true' ? 'false' : 'true')
                    }
                  />
                  <ToggleRow
                    title="Mostrar nome no WhatsApp"
                    description="Prefixa o nome do agente no texto enviado ao cliente"
                    checked={ss.get('chat_mostrar_nome_agente_wpp', 'false') === 'true'}
                    onChange={() =>
                      ss.set('chat_mostrar_nome_agente_wpp', ss.get('chat_mostrar_nome_agente_wpp', 'false') === 'true' ? 'false' : 'true')
                    }
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <SaveButton
                    onClick={() => saveSettings([
                      'chat_sla_primeira_resposta',
                      'chat_sla_resolucao',
                      'chat_auto_close_hours',
                      'chat_greeting_message',
                      'chat_mostrar_nome_agente_painel',
                      'chat_mostrar_nome_agente_wpp',
                    ])}
                    saving={saving}
                    saved={ss.saved}
                  />
                </div>
              </SettingsBlock>

              <div className="border-t border-border" />

              <SettingsBlock title="Instâncias WhatsApp" description="Defina categoria, cor e status de cada instância conectada.">
                <InstanceCategoriaManager />
              </SettingsBlock>
            </>
          )}

          {/* ── Cobrança ── */}
          {tab === 'cobranca' && (
            <SettingsBlock title="Cobrança" description="Janela de envio e intervalos da régua de cobrança.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InputField
                  label="Horário início"
                  value={ss.get('cobranca_horario_inicio', '08:00')}
                  onChange={(v) => ss.set('cobranca_horario_inicio', v)}
                  type="time"
                />
                <InputField
                  label="Horário fim"
                  value={ss.get('cobranca_horario_fim', '18:00')}
                  onChange={(v) => ss.set('cobranca_horario_fim', v)}
                  type="time"
                />
              </div>

              <InputField
                label="Máx. envios por hora por instância"
                value={ss.get('cobranca_max_envios_hora', '30')}
                onChange={(v) => ss.set('cobranca_max_envios_hora', v)}
                type="number"
                placeholder="30"
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InputField
                  label="Intervalo mínimo entre envios"
                  value={ss.get('cobranca_intervalo_min', '30')}
                  onChange={(v) => ss.set('cobranca_intervalo_min', v)}
                  type="number"
                  placeholder="30"
                  suffix="seg"
                />
                <InputField
                  label="Intervalo máximo entre envios"
                  value={ss.get('cobranca_intervalo_max', '120')}
                  onChange={(v) => ss.set('cobranca_intervalo_max', v)}
                  type="number"
                  placeholder="120"
                  suffix="seg"
                />
              </div>

              <div className="flex justify-end pt-2">
                <SaveButton
                  onClick={() => saveSettings([
                    'cobranca_horario_inicio',
                    'cobranca_horario_fim',
                    'cobranca_max_envios_hora',
                    'cobranca_intervalo_min',
                    'cobranca_intervalo_max',
                  ])}
                  saving={saving}
                  saved={ss.saved}
                />
              </div>
            </SettingsBlock>
          )}

          {/* ── Integrações ── */}
          {tab === 'integracoes' && (
            <SettingsBlock title="Integrações" description="Credenciais de serviços externos e URLs de webhook.">
              <div className="space-y-1.5">
                <FieldLabel>OpenRouter API Key</FieldLabel>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={ss.get('openrouter_api_key', '')}
                    onChange={(e) => ss.set('openrouter_api_key', e.target.value)}
                    placeholder="sk-or-..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-12 text-sm text-foreground font-mono placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  <button
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <InputField
                label="UAZAPI Server URL"
                value={ss.get('uazapi_server_url', 'https://empirebusiness.uazapi.com')}
                onChange={(v) => ss.set('uazapi_server_url', v)}
                placeholder="https://empirebusiness.uazapi.com"
              />

              <div className="space-y-1.5">
                <FieldLabel hint="somente leitura">Webhook URL</FieldLabel>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value="https://wuzmckatbmlpkdxtfhqr.supabase.co/functions/v1/uazapi-webhook"
                    readOnly
                    className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground font-mono cursor-default"
                  />
                  <button
                    onClick={() => copyToClipboard('https://wuzmckatbmlpkdxtfhqr.supabase.co/functions/v1/uazapi-webhook', 'webhook')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition-colors',
                      copied === 'webhook'
                        ? 'bg-success/10 text-success border-success/30'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                    )}
                  >
                    {copied === 'webhook' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied === 'webhook' ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <SaveButton
                  onClick={() => saveSettings(['openrouter_api_key', 'uazapi_server_url'])}
                  saving={saving}
                  saved={ss.saved}
                />
              </div>
            </SettingsBlock>
          )}

          {/* ── Permissões por app (Fase 2) ── */}
          {tab === 'permissoes' && <PermissoesMatriz />}

          {/* ── Sistema ── */}
          {tab === 'sistema' && (
            <SettingsBlock title="Sistema" description="Identidade do app e políticas de retenção. Afeta todos os usuários.">
              <InputField
                label="Nome do aplicativo"
                value={ss.get('app_name', 'OMNX Desk')}
                onChange={(v) => ss.set('app_name', v)}
                placeholder="OMNX Desk"
              />

              <div className="space-y-1.5">
                <FieldLabel hint="detectado automaticamente">Fuso horário</FieldLabel>
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground">
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </div>
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Período de retenção de dados</FieldLabel>
                <select
                  value={ss.get('data_retention_days', '365')}
                  onChange={(e) => ss.set('data_retention_days', e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="90">90 dias</option>
                  <option value="180">180 dias</option>
                  <option value="365">1 ano</option>
                  <option value="730">2 anos</option>
                  <option value="0">Indefinido</option>
                </select>
              </div>

              <div className="flex justify-end pt-2">
                <SaveButton
                  onClick={() => saveSettings(['app_name', 'data_retention_days'])}
                  saving={saving}
                  saved={ss.saved}
                />
              </div>
            </SettingsBlock>
          )}

        </div>
      </section>
    </div>
  )
}
