import { useState } from 'react'
import { Building2, Loader2, CheckCircle2, AlertCircle, Copy, Check, KeyRound } from 'lucide-react'
import { useIsMasterAdmin, useProvisionTenant, type ProvisionData } from '@/hooks/useProvisionTenant'
import { cn } from '@/lib/utils'

/**
 * Tela "Empresas" — só o admin do tenant MESTRE vê. Cria uma empresa nova
 * (tenant + 1º admin). Esse admin depois entra e adiciona a própria equipe.
 */
export function EmpresasPage() {
  const { isMaster, loading } = useIsMasterAdmin()
  const { provision, saving } = useProvisionTenant()

  const [empresaNome, setEmpresaNome] = useState('')
  const [adminNome, setAdminNome] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ProvisionData | null>(null)
  // Nome guardado à parte: a resposta do provisionamento devolve só o essencial
  // (id, slug e link de acesso) — nenhuma senha vai para a tela.
  const [criada, setCriada] = useState('')
  const [copiado, setCopiado] = useState(false)

  async function handleCriar() {
    setErro(null)
    setResultado(null)
    if (!empresaNome.trim()) { setErro('Informe o nome da empresa.'); return }
    if (!adminNome.trim()) { setErro('Informe o nome do admin.'); return }
    if (!adminEmail.includes('@')) { setErro('E-mail do admin inválido.'); return }

    const r = await provision({
      empresa_nome: empresaNome.trim(),
      admin_nome: adminNome.trim(),
      admin_email: adminEmail.trim().toLowerCase(),
    })
    if (!r.ok) { setErro(r.error ?? 'Falha ao criar a empresa.'); return }
    setCriada(empresaNome.trim())
    setResultado(r.data ?? null)
    setEmpresaNome(''); setAdminNome(''); setAdminEmail('')
  }

  async function copiarAcesso() {
    if (!resultado?.login_url) return
    const txt = resultado.login_url
    try {
      await navigator.clipboard.writeText(txt)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!isMaster) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <div className="glass-card flex items-center gap-3 p-4 sm:p-6">
          <AlertCircle className="h-5 w-5 text-warning" />
          <p className="text-sm text-muted-foreground">
            Esta área é exclusiva do administrador da empresa mestre.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Empresas</h1>
          <p className="text-sm text-muted-foreground">
            Crie uma empresa nova. Ela nasce isolada — o admin dela só enxerga os próprios dados.
          </p>
        </div>
      </div>

      {/* Resultado */}
      {resultado && (
        <div className="glass-card space-y-3 border border-success/30 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-semibold">Empresa "{criada}" criada!</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <KeyRound className="h-4 w-4" /> Link de primeiro acesso do admin:
            </div>
            <p className="mt-1 break-all font-mono text-xs text-foreground">
              {resultado.login_url ?? 'Não foi possível gerar o link — peça ao admin para usar \'Esqueci minha senha\'.'}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Mande esse link ao admin da empresa. Ele entra por ele, define a própria senha e
            cadastra a equipe em <strong>Colaboradores</strong>. O link é de uso único e expira
            em cerca de 1 hora.
          </p>
          {resultado.login_url && (
            <button
              onClick={copiarAcesso}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
            >
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copiar link de acesso
            </button>
          )}
        </div>
      )}

      {/* Formulário */}
      <div className="glass-card space-y-4 p-4 sm:p-6">
        <Campo label="Nome da empresa" value={empresaNome} onChange={setEmpresaNome} placeholder="Ex: Alpha Consultoria" />
        <Campo label="Nome do admin" value={adminNome} onChange={setAdminNome} placeholder="Ex: Maria Silva" />
        <Campo label="E-mail do admin" value={adminEmail} onChange={setAdminEmail} placeholder="admin@empresa.com" type="email" />

        {erro && (
          <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
            <p className="text-sm text-danger">{erro}</p>
          </div>
        )}

        <button
          onClick={handleCriar}
          disabled={saving}
          className="gradient-primary flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
          {saving ? 'Criando empresa…' : 'Criar empresa'}
        </button>
      </div>
    </div>
  )
}

function Campo({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground',
          'placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30',
        )}
      />
    </div>
  )
}
