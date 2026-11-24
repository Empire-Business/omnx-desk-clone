import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  User,
  Palette,
  Bell,
  Eye,
  EyeOff,
  Check,
  Camera,
  Loader2,
  Pencil,
  Lock,
  AlertCircle,
} from 'lucide-react'
import { Smartphone, Download, CheckCircle, PlusSquare, ArrowUpFromLine, BellRing, Plug, Building2, ShieldCheck, DatabaseBackup } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { AbasRolaveis } from '@/components/ui/AbasRolaveis'
import { BrandSection } from '@/components/configuracoes/BrandSection'
import { IntegracoesSection } from '@/components/configuracoes/IntegracoesSection'
import { RamoEmpresaSection } from '@/components/configuracoes/RamoEmpresaSection'
import { ExportarDadosSection } from '@/components/configuracoes/ExportarDadosSection'
import { AvisoVersaoNova } from '@/components/configuracoes/AvisoVersaoNova'
import { useIsMasterAdmin } from '@/hooks/useProvisionTenant'
import { VerificacaoDuasEtapas } from '@/components/seguranca/VerificacaoDuasEtapas'
import { useLicenca } from '@/hooks/useLicenca'
import { cn } from '@/lib/utils'
import { BRAND } from '@/config/brand'

// ─── Section types ───────────────────────────────────────────────────────────

type Section = 'perfil' | 'aparencia' | 'marca' | 'ramo' | 'integracoes' | 'mobile' | 'notificacoes' | 'duas-etapas' | 'dados'

interface NavItem {
  id: Section
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
  /** Some com a licença negada (credenciais de integração ficam travadas). */
  usaLicenca?: boolean
}

const navItems: NavItem[] = [
  { id: 'perfil', label: 'Perfil', icon: User },
  { id: 'aparencia', label: 'Aparência', icon: Palette },
  { id: 'marca', label: 'Marca', icon: Palette },
  // Ramo é dado da empresa (como a marca), não preferência de um app —
  // por isso saiu da configuração do Atendimento e veio para cá.
  { id: 'ramo', label: 'Ramo da empresa', icon: Building2, adminOnly: true },
  { id: 'integracoes', label: 'Integrações', icon: Plug, adminOnly: true, usaLicenca: true },
  { id: 'mobile', label: 'Versão Mobile', icon: Smartphone },
  { id: 'notificacoes', label: 'Notificações', icon: Bell },
  { id: 'duas-etapas', label: 'Verificação em duas etapas', icon: ShieldCheck },
  // Sempre aberta, inclusive com a licença negada (contrato da licença §4).
  { id: 'dados', label: 'Exportar dados', icon: DatabaseBackup, adminOnly: true },
]

const PERFIL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  agente: 'Agente',
  atendimento: 'Atendimento',
  estrategista: 'Estrategista',
  cliente: 'Cliente',
}

// ─── Reusable components ─────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="glass-card space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="t-h3 text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  )
}

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
        'focus-ds relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-fast before:absolute before:-inset-2.5 before:content-[\'\'] disabled:opacity-50 disabled:cursor-not-allowed',
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

function SettingRow({
  label,
  desc,
  children,
}: {
  label: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-stroke-subtle p-4">
      <div className="space-y-0.5 pr-4">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {desc && <p className="text-[13px] text-muted-foreground">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[12.5px] font-semibold text-fg-2">
      {children}
    </label>
  )
}

// ─── Notification preferences ────────────────────────────────────────────────

interface NotifPrefItem {
  key: string
  label: string
  desc: string
}

const NOTIF_PREFS: NotifPrefItem[] = [
  { key: 'notif_chat', label: 'Mensagens das conversas', desc: 'Quando chegar mensagem nova em Conversas' },
  { key: 'notif_cobranca', label: 'Respostas de cobrança', desc: 'Quando um cliente responder uma cobrança' },
  { key: 'notif_sla', label: 'Prazo de resposta estourado', desc: 'Quando o tempo combinado para responder passar' },
  { key: 'notif_relatorios', label: 'Relatórios semanais', desc: 'Resumo semanal da operação por e-mail' },
]

type EmailFreq = 'imediato' | 'resumo_diario' | 'desativado'

const EMAIL_FREQ_OPTIONS: { value: EmailFreq; label: string }[] = [
  { value: 'imediato', label: 'Imediato' },
  { value: 'resumo_diario', label: 'Resumo diario' },
  { value: 'desativado', label: 'Desativado' },
]

// ─── Profile Section ─────────────────────────────────────────────────────────

function ProfileSection() {
  const { user } = useAuth()
  const [nome, setNome] = useState(user?.nome ?? '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [fotoUrl, setFotoUrl] = useState(user?.foto_url ?? null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  useEffect(() => {
    setNome(user?.nome ?? '')
    setFotoUrl(user?.foto_url ?? null)
  }, [user?.nome, user?.foto_url])

  const initials = user?.nome
    ? user.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'ED'

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/avatar.${ext}`

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)

      // Add cache buster
      const url = `${publicUrl}?t=${Date.now()}`

      await supabase.from('users').update({ foto_url: url }).eq('id', user.id)
      setFotoUrl(url)
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleRemovePhoto() {
    if (!user) return
    setUploading(true)
    try {
      await supabase.from('users').update({ foto_url: null }).eq('id', user.id)
      setFotoUrl(null)
    } finally {
      setUploading(false)
    }
  }

  async function handleSaveName() {
    if (!user || !nome.trim() || nome === user.nome) return
    setSaving(true)
    try {
      await supabase.from('users').update({ nome: nome.trim() }).eq('id', user.id)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    setPwError(null)

    if (!currentPassword) {
      setPwError('Informe sua senha atual.')
      return
    }
    if (newPassword.length < 6) {
      setPwError('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('As senhas não coincidem.')
      return
    }

    setPwSaving(true)
    try {
      // Verify current password by re-signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email ?? '',
        password: currentPassword,
      })
      if (signInError) {
        setPwError('Senha atual incorreta.')
        return
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (updateError) {
        setPwError(updateError.message)
        return
      }

      setPwSaved(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPwSaved(false), 3000)
    } catch {
      setPwError('Erro ao alterar a senha. Tente novamente.')
    } finally {
      setPwSaving(false)
    }
  }

  const pwValid = currentPassword.length > 0 && newPassword.length >= 6 && newPassword === confirmPassword

  return (
    <SectionCard icon={User} title="Perfil">
      <div className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-5">
          <div className="relative group">
            {fotoUrl ? (
              <img
                src={fotoUrl}
                alt={user?.nome ?? 'Avatar'}
                className="h-20 w-20 rounded-full object-cover border-2 border-border"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-muted text-primary text-2xl font-bold border-2 border-border">
                {initials}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-void/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              ) : (
                <Camera className="h-5 w-5 text-white" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Foto de perfil</p>
            <p className="text-xs text-muted-foreground">JPG, PNG ou WebP. Max 2MB.</p>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-xs font-medium text-primary hover:underline cursor-pointer"
              >
                {fotoUrl ? 'Alterar' : 'Enviar foto'}
              </button>
              {fotoUrl && (
                <button
                  onClick={handleRemovePhoto}
                  disabled={uploading}
                  className="text-xs font-medium text-danger hover:underline cursor-pointer"
                >
                  Remover
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Name edit */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Nome</FieldLabel>
            <div className="flex gap-2">
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className={cn(
                  'flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                )}
              />
              <button
                onClick={handleSaveName}
                disabled={saving || !nome.trim() || nome === user?.nome}
                className={cn(
                  'flex h-[42px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors cursor-pointer',
                  saved
                    ? 'bg-success text-white'
                    : 'gradient-primary text-primary-foreground disabled:opacity-40',
                )}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saved ? (
                  <><Check className="h-4 w-4" /> Salvo</>
                ) : (
                  <><Pencil className="h-4 w-4" /> Salvar</>
                )}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>E-mail</FieldLabel>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
              {user?.email ?? '--'}
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Perfil de acesso</FieldLabel>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
              {user?.perfil ? (PERFIL_LABEL[user.perfil] ?? user.perfil) : '--'}
            </div>
          </div>
        </div>

        {/* Password change */}
        <div className="space-y-4 border-t border-border pt-6">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Alterar senha</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Senha atual */}
            <div className="space-y-1.5 sm:col-span-2">
              <FieldLabel>Senha atual</FieldLabel>
              <div className="relative">
                <input
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setPwError(null) }}
                  placeholder="Digite sua senha atual"
                  className="input w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Nova senha */}
            <div className="space-y-1.5">
              <FieldLabel>Nova senha</FieldLabel>
              <div className="relative">
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPwError(null) }}
                  placeholder="Mínimo 6 caracteres"
                  className="input w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirmar senha */}
            <div className="space-y-1.5">
              <FieldLabel>Confirme a nova senha</FieldLabel>
              <div className="relative">
                <input
                  type={showConfirmPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPwError(null) }}
                  placeholder="Repita a nova senha"
                  className={cn(
                    'w-full rounded-lg border bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 transition-colors',
                    confirmPassword && confirmPassword !== newPassword
                      ? 'border-danger focus:border-danger focus:ring-danger/30'
                      : 'border-border focus:border-primary focus:ring-primary/30'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="text-xs text-danger">As senhas não coincidem</p>
              )}
            </div>
          </div>

          {/* Error message */}
          {pwError && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-danger shrink-0" />
              <p className="text-sm text-danger">{pwError}</p>
            </div>
          )}

          {/* Save button */}
          <div className="flex justify-end">
            <button
              onClick={handleChangePassword}
              disabled={pwSaving || !pwValid}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-all cursor-pointer',
                pwSaved
                  ? 'bg-success text-white'
                  : 'gradient-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {pwSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Alterando...
                </>
              ) : pwSaved ? (
                <>
                  <Check className="h-4 w-4" />
                  Senha alterada!
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Alterar senha
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

// ─── Mobile Install Section ─────────────────────────────────────────────────

function MobileInstallSection({ pwa }: { pwa: ReturnType<typeof usePWAInstall> }) {
  const [mobileTab, setMobileTab] = useState<'android' | 'ios'>('android')
  const [showFallback, setShowFallback] = useState(false)
  const push = usePushNotifications()

  async function handleInstallClick() {
    if (pwa.canInstall) {
      await pwa.install()
    } else {
      setShowFallback(true)
      setTimeout(() => setShowFallback(false), 5000)
    }
  }

  return (
    <SectionCard icon={Smartphone} title="Versão Mobile">
      <div className="space-y-5">
        {/* Status banner */}
        {pwa.isInstalled ? (
          <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
            <CheckCircle className="h-5 w-5 text-success shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">App instalado!</p>
              <p className="text-xs text-muted-foreground">
                {pwa.isStandalone
                  ? `Você está usando o ${BRAND.appName} como aplicativo.`
                  : `O ${BRAND.appName} está instalado. Abra pelo ícone na tela inicial.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary-muted p-4">
            <Download className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Instale o {BRAND.appName} no seu celular</p>
              <p className="text-xs text-muted-foreground">
                Use como um app nativo — ícone na tela inicial, tela cheia e notificações.
              </p>
            </div>
          </div>
        )}

        {/* Install button — always visible when not installed */}
        {!pwa.isInstalled && (
          <>
            <button
              onClick={handleInstallClick}
              className="btn btn-primary btn-lg w-full"
            >
              <Download className="h-5 w-5" />
              Instalar agora
            </button>
            {showFallback && (
              <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 animate-fade-in">
                <AlertCircle className="h-4 w-4 text-warning shrink-0" />
                <p className="text-xs text-muted-foreground">
                  {pwa.isIOS
                    ? 'No iPhone, use o botão de compartilhar do Safari e toque em "Adicionar à Tela de Início".'
                    : 'Use o menu do navegador (3 pontinhos) e toque em "Instalar aplicativo" ou "Adicionar a tela inicial".'}
                </p>
              </div>
            )}
          </>
        )}

        {/* Tabs: Android / iOS */}
        {!pwa.isInstalled && (
          <div className="space-y-4">
            <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
              <button
                onClick={() => setMobileTab('android')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                  mobileTab === 'android'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.523 2.227l1.29-2.1a.4.4 0 00-.14-.541.4.4 0 00-.541.14L16.82 1.87a7.124 7.124 0 00-4.82-1.87 7.124 7.124 0 00-4.82 1.87L5.868-.274a.4.4 0 00-.541-.14.4.4 0 00-.14.541l1.29 2.1A7.276 7.276 0 003 8.5h18a7.276 7.276 0 00-3.477-6.273zM8.5 6.5a1 1 0 110-2 1 1 0 010 2zm7 0a1 1 0 110-2 1 1 0 010 2zM3 10v8.5a1.5 1.5 0 001.5 1.5H6v3a1.5 1.5 0 003 0v-3h6v3a1.5 1.5 0 003 0v-3h1.5a1.5 1.5 0 001.5-1.5V10H3zm-2.5.5a1.5 1.5 0 013 0v6a1.5 1.5 0 01-3 0v-6zm22 0a1.5 1.5 0 013 0v6a1.5 1.5 0 01-3 0v-6z"/>
                </svg>
                Android
              </button>
              <button
                onClick={() => setMobileTab('ios')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                  mobileTab === 'ios'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                iPhone / iPad
              </button>
            </div>

            {/* Android tutorial */}
            {mobileTab === 'android' && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Como instalar no Android:</p>
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary text-xs font-bold">1</div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">Abra no Google Chrome</p>
                    <p className="text-xs text-muted-foreground">Acesse o {BRAND.appName} pelo navegador Chrome no seu celular</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary text-xs font-bold">2</div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">Toque no menu (3 pontinhos ⋮)</p>
                    <p className="text-xs text-muted-foreground">No canto superior direito do Chrome</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary text-xs font-bold">3</div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">Toque em "Instalar aplicativo"</p>
                    <p className="text-xs text-muted-foreground">Ou "Adicionar à tela inicial", dependendo da versão</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/10 text-success text-xs font-bold">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">Pronto!</p>
                    <p className="text-xs text-muted-foreground">O ícone do {BRAND.appName} aparecerá na sua tela inicial</p>
                  </div>
                </div>
                <div className="rounded-lg border border-primary/20 bg-primary-muted px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Dica:</strong> Se o banner "Adicionar a tela inicial" aparecer automaticamente na parte inferior, basta tocar nele!
                  </p>
                </div>
              </div>
            )}

            {/* iOS tutorial */}
            {mobileTab === 'ios' && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Como instalar no iPhone / iPad:</p>
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary text-xs font-bold">1</div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">Abra no Safari</p>
                    <p className="text-xs text-muted-foreground">É obrigatório usar o Safari — Chrome e outros navegadores não instalam apps no iOS</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary text-xs font-bold">2</div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      Toque em <ArrowUpFromLine className="h-4 w-4 text-primary" /> Compartilhar
                    </p>
                    <p className="text-xs text-muted-foreground">O botão fica na barra inferior do Safari (quadrado com seta para cima)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary text-xs font-bold">3</div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      Toque em <PlusSquare className="h-4 w-4 text-primary" /> Adicionar à Tela de Início
                    </p>
                    <p className="text-xs text-muted-foreground">Role para baixo no menu se não aparecer de primeira</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary text-xs font-bold">4</div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">Confirme o nome e toque em "Adicionar"</p>
                    <p className="text-xs text-muted-foreground">O nome já vem preenchido como "{BRAND.appName}"</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/10 text-success text-xs font-bold">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">Pronto!</p>
                    <p className="text-xs text-muted-foreground">O ícone do {BRAND.appName} aparecerá na sua tela inicial. Abre em tela cheia!</p>
                  </div>
                </div>
                <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
                  <p className="text-xs text-warning">
                    <strong>Importante:</strong> No iOS, apenas o Safari permite instalar apps na tela inicial. Se você está usando Chrome, Firefox ou outro navegador, copie o link e abra no Safari.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Features grid */}
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vantagens do app</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { label: 'Tela cheia', desc: 'Sem barra do navegador, em tela inteira' },
              { label: 'Ícone na tela inicial', desc: 'Acesso rápido com um toque' },
              { label: 'Avisos no celular', desc: 'Receba alertas mesmo com app fechado' },
              { label: 'Atualização automática', desc: 'Sempre na versão mais recente' },
            ].map((feat) => (
              <div key={feat.label} className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/20 p-3">
                <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">{feat.label}</p>
                  <p className="text-xs text-muted-foreground">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Push Notifications toggle */}
        {push.supported && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center gap-3">
              <BellRing className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Avisos no celular</p>
                <p className="text-xs text-muted-foreground">
                  Receba alertas de novas mensagens mesmo com o app fechado
                </p>
              </div>
              {push.isSubscribed ? (
                <button
                  onClick={push.unsubscribe}
                  disabled={push.loading}
                  className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-danger-light hover:text-danger hover:border-danger/40 transition-colors disabled:opacity-50"
                >
                  {push.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Desativar'}
                </button>
              ) : (
                <button
                  onClick={push.subscribe}
                  disabled={push.loading}
                  className="btn btn-primary btn-sm"
                >
                  {push.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Ativar'}
                </button>
              )}
            </div>
            {push.isSubscribed && (
              <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
                <CheckCircle className="h-4 w-4 text-success shrink-0" />
                <p className="text-xs text-success">Avisos ativos neste aparelho</p>
              </div>
            )}
            {push.permission === 'denied' && (
              <div className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger-light px-3 py-2">
                <AlertCircle className="h-4 w-4 text-danger shrink-0" />
                <p className="text-xs text-danger">
                  Permissão bloqueada. Abra as configurações do navegador para permitir notificações.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  )
}

export function ConfiguracoesPage() {
  const { theme, toggleTheme } = useTheme()
  const { can } = usePermissoes()

  const pwa = usePWAInstall()
  // `?secao=marca` abre direto na seção (o cartão "Marca, ramo e integrações" dos Ajustes usa isso).
  const [searchParams] = useSearchParams()
  const [section, setSection] = useState<Section>(() => {
    const pedida = searchParams.get('secao')
    return navItems.some((item) => item.id === pedida) ? (pedida as Section) : 'perfil'
  })

  const licenca = useLicenca()
  // Aviso de versão nova: só para quem administra a instalação (empresa principal).
  const { isMaster, mfaPendente } = useIsMasterAdmin()
  const visibleNavItems = navItems.filter((item) =>
    (!item.adminOnly || can('configuracoes', 'admin')) && !(item.usaLicenca && licenca.nega))

  // Local notification preferences (stored in localStorage for now)
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('empiredesk_notif_prefs')
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  })
  const [emailFreq, setEmailFreq] = useState<EmailFreq>(() => {
    return (localStorage.getItem('empiredesk_email_freq') as EmailFreq) || 'imediato'
  })

  function toggleNotif(key: string) {
    setNotifPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('empiredesk_notif_prefs', JSON.stringify(next))
      return next
    })
  }

  function handleEmailFreqChange(freq: EmailFreq) {
    setEmailFreq(freq)
    localStorage.setItem('empiredesk_email_freq', freq)
  }

  return (
    <PageContainer>
      <PageHeader
        title="Meu perfil"
        description="Seus dados, aparência e avisos. Quem administra também vê aqui a marca, o ramo e as integrações da empresa."
      />

      {can('configuracoes', 'admin') && (isMaster || mfaPendente) && <AvisoVersaoNova />}

      {/* Celular e tablet pequeno: seções em abas roláveis */}
      <AbasRolaveis
        className="md:hidden"
        rotulo="Seções de configurações"
        itens={visibleNavItems.map((item) => ({ id: item.id, rotulo: item.label, icone: item.icon, ativo: section === item.id, onClick: () => setSection(item.id) }))}
      />

      <div className="flex flex-col gap-3 md:flex-row md:gap-6">
        {/* Menu lateral (a partir de 768 px) */}
        <aside className="hidden w-52 shrink-0 md:block">
          <nav className="glass-card flex flex-col space-y-1 p-2">
            {visibleNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={cn(
                  'focus-ds flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-fast',
                  section === item.id
                    ? 'bg-primary-muted text-primary'
                    : 'text-muted-foreground hover:bg-bg-1 hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 space-y-4 lg:space-y-6">
          {/* ── Perfil ── */}
          {section === 'perfil' && <ProfileSection />}

          {/* ── Aparência ── */}
          {section === 'aparencia' && (
            <SectionCard icon={Palette} title="Aparência">
              <div className="space-y-4">
                <SettingRow label="Modo escuro" desc="Alterna entre tema claro e escuro">
                  <Toggle checked={theme === 'dark'} onChange={toggleTheme} />
                </SettingRow>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => theme === 'dark' && toggleTheme()}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all',
                      theme === 'light'
                        ? 'border-primary bg-primary-muted'
                        : 'border-border hover:border-border/80'
                    )}
                  >
                    <div className="h-10 w-full rounded-md border border-border bg-white" />
                    <span className="text-xs font-medium text-foreground">Claro</span>
                  </button>
                  <button
                    onClick={() => theme === 'light' && toggleTheme()}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all',
                      theme === 'dark'
                        ? 'border-primary bg-primary-muted'
                        : 'border-border hover:border-border/80'
                    )}
                  >
                    <div className="h-10 w-full rounded-md border border-border bg-zinc-900" />
                    <span className="text-xs font-medium text-foreground">Escuro</span>
                  </button>
                </div>
              </div>
            </SectionCard>
          )}

          {/* ── Marca ── */}
          {section === 'marca' && <BrandSection />}

          {/* ── Ramo da empresa ── */}
          {section === 'ramo' && (
            <SectionCard icon={Building2} title="Ramo da empresa">
              <RamoEmpresaSection />
            </SectionCard>
          )}

          {/* ── Integrações ── */}
          {section === 'integracoes' && !licenca.nega && <IntegracoesSection />}

          {/* ── Verificação em duas etapas ── */}
          {section === 'duas-etapas' && <VerificacaoDuasEtapas />}

          {/* ── Exportar dados (sempre aberta) ── */}
          {section === 'dados' && can('configuracoes', 'admin') && <ExportarDadosSection />}

          {/* ── Versão Mobile ── */}
          {section === 'mobile' && (
            <MobileInstallSection pwa={pwa} />
          )}

          {/* ── Notificacoes ── */}
          {section === 'notificacoes' && (
            <SectionCard icon={Bell} title="Notificações">
              <div className="space-y-4">
                {/* Email frequency */}
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">Frequência de e-mail</p>
                    <p className="text-xs text-muted-foreground">
                      Como você deseja receber notificações por e-mail
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {EMAIL_FREQ_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleEmailFreqChange(opt.value)}
                        className={cn(
                          'btn btn-sm',
                          emailFreq === opt.value ? 'btn-primary' : 'btn-secondary'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Per-type toggles */}
                <div className="space-y-1">
                  <p className="text-eyebrow mb-2">
                    Tipos de notificação
                  </p>
                  {NOTIF_PREFS.map((item) => (
                    <SettingRow key={item.key} label={item.label} desc={item.desc}>
                      <Toggle
                        checked={notifPrefs[item.key] !== false}
                        onChange={() => toggleNotif(item.key)}
                      />
                    </SettingRow>
                  ))}
                </div>

                <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    As preferências de notificação são salvas neste aparelho.
                  </p>
                </div>
              </div>
            </SectionCard>
          )}

        </main>
      </div>
    </PageContainer>
  )
}
