import { useState } from 'react'
import { Building2, Loader2, CheckCircle2, AlertCircle, Copy, Check, KeyRound } from 'lucide-react'
import { useIsMasterAdmin, useProvisionTenant, type ProvisionData } from '@/hooks/useProvisionTenant'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { VerificacaoDuasEtapas } from '@/components/seguranca/VerificacaoDuasEtapas'

/**
 * Tela "Empresas" — só o admin do tenant MESTRE vê. Cria uma empresa nova
 * (tenant + 1º admin). Esse admin depois entra e adiciona a própria equipe.
 */
export function EmpresasPage() {
  const { isMaster, mfaPendente, loading, recarregar } = useIsMasterAdmin()
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
      <PageContainer largura="formulario">
        <div role="status" aria-label="Carregando" className="space-y-4">
          <div className="sk h-10 w-2/3 rounded-md" />
          <div className="sk h-56 rounded-lg" />
        </div>
      </PageContainer>
    )
  }

  if (!isMaster && mfaPendente) {
    return (
      <PageContainer largura="formulario">
        <VerificacaoDuasEtapas obrigatoria onConfirmada={recarregar} />
      </PageContainer>
    )
  }

  if (!isMaster) {
    return (
      <PageContainer largura="formulario">
        <div className="glass-card flex items-center gap-3 p-4 sm:p-6">
          <AlertCircle className="h-5 w-5 text-warning" />
          <p className="text-sm text-muted-foreground">
            Esta área é exclusiva do administrador da empresa mestre.
          </p>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer largura="formulario">
      <PageHeader
        title="Empresas"
        description="Crie uma empresa nova. Ela nasce isolada: o administrador dela só enxerga os próprios dados."
      />

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
              className="btn btn-secondary"
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
          className="btn btn-primary btn-lg w-full sm:w-auto"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
          {saving ? 'Criando empresa…' : 'Criar empresa'}
        </button>
      </div>
    </PageContainer>
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
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input"
      />
    </div>
  )
}
