import { useState } from 'react'
import { Eye, EyeOff, Loader2, Check, CheckCircle2, XCircle, AlertCircle, Trash2 } from 'lucide-react'
import { useEmpireIntegracao } from '@/hooks/useEmpireIntegracao'
import { cn } from '@/lib/utils'

const EXEMPLO_URL = 'https://sdrai.omnx.pro/api/v1/integrations/desk/events/<código da conexão>'

/**
 * Card "CRM OMNX (vendas)" em Configurações → Integrações.
 * Liga a ponte de vendas nos dois sentidos: venda e contrato do Desk vão para o CRM,
 * venda fechada no CRM aparece aqui. O segredo é o mesmo cadastrado no CRM (Integrações →
 * Desk) e vai direto para o cofre (Vault) — nunca volta ao navegador.
 */
export function CrmOmnxIntegracaoCard() {
  const { status, loading, saving, salvar, revogar } = useEmpireIntegracao('crm_omnx')

  const [secret, setSecret] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [saved, setSaved] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSalvar() {
    setErro(null)
    if (secret.trim().length < 32) { setErro('O segredo precisa ter pelo menos 32 caracteres — copie o que aparece no CRM.'); return }
    const url = baseUrl.trim()
    if (!status?.connected && !url) { setErro('Cole o endereço do receptor que o CRM mostra na conexão com o Desk.'); return }
    if (url && !/^https:\/\//i.test(url)) { setErro('O endereço do CRM precisa começar com https://'); return }
    const r = await salvar(secret, url || undefined)
    if (!r.ok) { setErro(r.error ?? 'Falha ao salvar.'); return }
    setSecret(''); setBaseUrl(''); setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  async function handleRevogar() {
    setErro(null)
    if (!confirm('Desligar a ponte com o CRM OMNX? As vendas deixam de ir e vir entre os dois até você cadastrar de novo.')) return
    const r = await revogar()
    if (!r.ok) setErro(r.error ?? 'Falha ao remover.')
  }

  const campo = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30'

  return (
    <div className="rounded-xl border border-border p-4 sm:p-5 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-base font-semibold text-foreground">CRM OMNX (vendas)</p>
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
          Venda fechada no CRM aparece aqui com o selo “Veio do CRM”; venda do formulário e contrato assinado
          aqui atualizam o CRM quando o cliente existe lá. O segredo e o endereço ficam no CRM, em
          Integrações → Desk.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endereço do receptor no CRM</label>
        <input
          type="url"
          value={baseUrl}
          onChange={(e) => { setBaseUrl(e.target.value); setErro(null) }}
          placeholder={status?.base_url || EXEMPLO_URL}
          className={campo}
        />
        {status?.connected && (
          <p className="text-xs text-muted-foreground">Deixe em branco para manter o endereço atual.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {status?.connected ? 'Novo segredo (para trocar)' : 'Segredo da conexão'}
        </label>
        <div className="relative">
          <input
            type={showSecret ? 'text' : 'password'}
            value={secret}
            onChange={(e) => { setSecret(e.target.value); setErro(null) }}
            placeholder={status?.connected ? '•••••••• (já cadastrado — cole um novo só se for trocar)' : 'Cole o segredo do CRM'}
            className={cn(campo, 'pr-10')}
          />
          <button type="button" onClick={() => setShowSecret(v => !v)}
            aria-label={showSecret ? 'Esconder segredo' : 'Mostrar segredo'}
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

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={handleSalvar}
          disabled={saving || secret.trim().length === 0}
          className="gradient-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saved ? 'Salvo' : status?.connected ? 'Salvar novo segredo' : 'Conectar'}
        </button>
        {status?.connected && (
          <button
            onClick={handleRevogar}
            className="flex items-center gap-2 rounded-lg border border-danger/30 bg-transparent px-3 py-2 text-sm font-medium text-danger hover:bg-danger/5"
          >
            <Trash2 className="h-4 w-4" /> Desligar
          </button>
        )}
      </div>

      {status?.updated_at && (
        <p className="text-xs text-muted-foreground">
          Última atualização: {new Date(status.updated_at).toLocaleString('pt-BR')} · versão {status.rotation_version}
          {status.base_url ? <> · envia para {status.base_url}</> : null}
        </p>
      )}
    </div>
  )
}
