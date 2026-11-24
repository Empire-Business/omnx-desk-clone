import { useState } from 'react'
import { Plug, Eye, EyeOff, Loader2, Check, CheckCircle2, XCircle, AlertCircle, Trash2 } from 'lucide-react'
import { useEmpireIntegracao } from '@/hooks/useEmpireIntegracao'
import { CrmOmnxIntegracaoCard } from './CrmOmnxIntegracaoCard'
import { usePermissoes } from '@/hooks/usePermissoes'
import { cn } from '@/lib/utils'

const DEFAULT_BASE_URL = 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1'

/**
 * Seção "Integrações" → card Empire (CRM de vendas).
 * Cola/rotaciona o secret por conta (multi-tenant), testa a conexão e permite revogar.
 * O secret nunca volta ao browser — vai direto para o cofre (Vault) via RPC.
 */
export function IntegracoesSection() {
  const { can } = usePermissoes()
  const isAdmin = can('configuracoes', 'admin')
  const { status, loading, saving, testing, salvar, testar, revogar } = useEmpireIntegracao()

  const [secret, setSecret] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [saved, setSaved] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [teste, setTeste] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleSalvar() {
    setErro(null); setTeste(null)
    if (secret.trim().length < 8) { setErro('Cole o secret que o admin gerou no painel Empire.'); return }
    const r = await salvar(secret, baseUrl || undefined)
    if (!r.ok) { setErro(r.error ?? 'Falha ao salvar.'); return }
    setSecret(''); setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  async function handleTestar() {
    setErro(null); setTeste(null)
    const r = await testar()
    setTeste({ ok: r.ok, msg: r.ok ? 'Conexão confirmada! O Empire aceitou o secret.' : (r.error ?? 'Falha no teste.') })
  }

  async function handleRevogar() {
    setErro(null); setTeste(null)
    if (!confirm('Remover o secret da integração com o Empire? As vendas deixarão de sincronizar até você cadastrar um novo.')) return
    const r = await revogar()
    if (!r.ok) setErro(r.error ?? 'Falha ao remover.')
  }

  if (!isAdmin) {
    return (
      <div className="glass-card p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-warning" />
          <p className="text-sm text-muted-foreground">Apenas administradores podem configurar integrações.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card space-y-5 p-3 sm:p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <Plug className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Integrações</h2>
      </div>

      {/* Card Empire */}
      <div className="rounded-xl border border-border p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold text-foreground">Empire (CRM de vendas)</p>
              {!loading && (
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                  status?.connected ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                )}>
                  {status?.connected ? <><CheckCircle2 className="h-3 w-3" /> Conectado</> : <><XCircle className="h-3 w-3" /> Não conectado</>}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Envia toda venda fechada para o dashboard Empire da sua conta. O secret é gerado no painel Empire
              (Administração → Integrações → omnx-desk) e colado aqui.
            </p>
          </div>
        </div>

        {/* Base URL — avançado, escondido por padrão: o normal é NÃO mexer. */}
        <details className="rounded-lg border border-border/60 bg-muted/20">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground">
            Avançado — endereço do Empire (não precisa mexer)
          </summary>
          <div className="space-y-1.5 border-t border-border/60 p-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">URL base do Empire</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={status?.base_url || DEFAULT_BASE_URL}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <p className="text-xs text-muted-foreground">
              É o endereço pra onde as vendas são enviadas. Já vem preenchido com o padrão correto —
              <strong> deixe em branco</strong>. Só altere se o Empire estiver noutro endereço.
            </p>
          </div>
        </details>

        {/* Secret */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {status?.connected ? 'Novo secret (para rotacionar)' : 'Secret da integração'}
          </label>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(e) => { setSecret(e.target.value); setErro(null) }}
              placeholder={status?.connected ? '•••••••• (já cadastrado — cole um novo só se for trocar)' : 'Cole o secret do Empire'}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <button type="button" onClick={() => setShowSecret(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {erro && (
          <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5">
            <AlertCircle className="h-4 w-4 text-danger shrink-0" />
            <p className="text-sm text-danger">{erro}</p>
          </div>
        )}
        {teste && (
          <div className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2.5',
            teste.ok ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5'
          )}>
            {teste.ok ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" /> : <XCircle className="h-4 w-4 text-danger shrink-0" />}
            <p className={cn('text-sm', teste.ok ? 'text-success' : 'text-danger')}>{teste.msg}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={handleSalvar}
            disabled={saving || secret.trim().length === 0}
            className="gradient-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? 'Salvo' : status?.connected ? 'Salvar novo secret' : 'Conectar'}
          </button>
          <button
            onClick={handleTestar}
            disabled={testing || (!status?.connected && secret.trim().length === 0)}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Testar conexão
          </button>
          {status?.connected && (
            <button
              onClick={handleRevogar}
              className="flex items-center gap-2 rounded-lg border border-danger/30 bg-transparent px-3 py-2 text-sm font-medium text-danger hover:bg-danger/5"
            >
              <Trash2 className="h-4 w-4" /> Remover
            </button>
          )}
        </div>

        {status?.updated_at && (
          <p className="text-xs text-muted-foreground">
            Última atualização: {new Date(status.updated_at).toLocaleString('pt-BR')} · versão {status.rotation_version}
          </p>
        )}
      </div>

      {/* Card CRM OMNX (ponte de vendas nos dois sentidos) */}
      <CrmOmnxIntegracaoCard />
    </div>
  )
}
