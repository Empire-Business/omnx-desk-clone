import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { completeSaasSwitch, isSaasSwitchIntent } from '@/lib/saasSwitch'
import { RECURSOS } from '@/config/recursos'
import { BRAND } from '@/config/brand'
import { OmnxLockup } from '@/components/icons/OmnxLockup'
import { usePrimeiroAcessoAberto } from '@/hooks/usePrimeiroAcesso'
import { PrimeiroAcessoForm } from '@/components/auth/PrimeiroAcessoForm'

type Mode = 'login' | 'forgot' | 'otp-send' | 'otp-verify' | 'primeiro-acesso'

/**
 * Marca do login. App da família OMNX: wordmark "OMNX" + nome curto do produto
 * (visual do Clients). Outro nome de app (instalação de cliente): o selo neutro
 * do OmnxLockup, que já segue o BRAND.
 */
function MarcaLogin({ variante }: { variante: 'arte' | 'clara' }) {
  const arte = variante === 'arte'
  if (!BRAND.familiaOmnx) {
    return (
      <span className={arte ? 'login-brand login-brand-art' : 'login-brand'}>
        <OmnxLockup word={BRAND.appName} height={arte ? 30 : 32} variant={arte ? 'light' : 'dark'} />
      </span>
    )
  }
  return (
    <span className={arte ? 'login-brand login-brand-art' : 'login-brand'}>
      <img src={arte ? '/assets/logo-dark.svg' : '/assets/logo-light.svg'} alt="OMNX" />
      <small>{BRAND.produto.toUpperCase()}</small>
    </span>
  )
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(8).fill(''))
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<Mode>('login')
  const { signIn, signInWithEmpire, sendOtp, verifyOtp, resetPassword, signOut, refreshAccess } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const empireSsoStarted = useRef(false)
  const switchCompletionStarted = useRef(false)
  // Só true enquanto o app não tem administradora (o banco decide; na produção
  // da empresa é sempre false). Ver src/lib/primeiroAcesso.ts.
  const primeiroAcessoAberto = usePrimeiroAcessoAberto()

  function resetState() {
    setError('')
    setSuccess('')
    setOtpDigits(Array(8).fill(''))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)

    try {
      if (mode === 'forgot') {
        await resetPassword(email)
        setSuccess('Email de recuperação enviado! Verifique sua caixa de entrada.')
      } else if (mode === 'otp-send') {
        await sendOtp(email)
        setMode('otp-verify')
        setSuccess('Código enviado para seu email!')
      } else if (mode === 'otp-verify') {
        const token = otpDigits.join('')
        if (token.length < 8) {
          setError('Digite o código completo.')
          setSubmitting(false)
          return
        }
        await verifyOtp(email, token)
        navigate('/')
      } else {
        await signIn(email, password)
        navigate('/')
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro inesperado. Tente novamente.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleEmpireLogin = useCallback(async () => {
    setError('')
    setSubmitting(true)
    try {
      const { data: currentSession, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (currentSession.session) {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
        if (signOutError) throw signOutError
      }
      const intent = searchParams.get('sso_intent')
      const redirectTo = isSaasSwitchIntent(intent)
        ? `${window.location.origin}/login?empire_sso=complete&sso_intent=${encodeURIComponent(intent)}`
        : undefined
      await signInWithEmpire(redirectTo)
    } catch {
      setError('Não foi possível entrar com a High Ticket AI. Tente novamente.')
      setSubmitting(false)
    }
  }, [searchParams, signInWithEmpire])

  useEffect(() => {
    if (searchParams.get('empire_sso') !== '1' || empireSsoStarted.current) return
    empireSsoStarted.current = true
    void handleEmpireLogin()
  }, [handleEmpireLogin, searchParams])

  useEffect(() => {
    if (searchParams.get('empire_sso') !== 'complete' || switchCompletionStarted.current) return
    switchCompletionStarted.current = true
    const intent = searchParams.get('sso_intent')

    void (async () => {
      setSubmitting(true)
      try {
        const state = await refreshAccess()
        if (state.access?.state === 'password_change_required') {
          navigate('/trocar-senha', { replace: true })
          return
        }
        if (state.accessError || state.access?.state !== 'ok') throw new Error('access_unconfirmed')
      } catch {
        setError('Não foi possível confirmar o acesso. Tente novamente em instantes.')
        setSubmitting(false)
        return
      }
      const { data } = await supabase.auth.getSession()
      const targetTenantId = isSaasSwitchIntent(intent) && data.session?.access_token
        ? await completeSaasSwitch(intent, data.session.access_token).catch(() => null)
        : null
      const { data: profile } = targetTenantId && data.session
        ? await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('user_id', data.session.user.id)
          .maybeSingle()
        : { data: null }
      const tenantMatches = profile?.tenant_id === targetTenantId
      if (tenantMatches) {
        navigate('/', { replace: true })
        return
      }
      await signOut()
      setError('Não foi possível confirmar a conta desta plataforma. Entre novamente.')
      setSubmitting(false)
    })()
  }, [navigate, searchParams, signOut, refreshAccess])

  function handleOtpChange(index: number, value: string) {
    // Paste handling — distribute across inputs
    if (value.length > 1) {
      const chars = value.replace(/\D/g, '').slice(0, 8).split('')
      const newDigits = [...otpDigits]
      chars.forEach((char, i) => {
        if (index + i < 8) newDigits[index + i] = char
      })
      setOtpDigits(newDigits)
      const nextIndex = Math.min(index + chars.length, 7)
      otpRefs.current[nextIndex]?.focus()
      return
    }

    if (value && !/^\d$/.test(value)) return

    const newDigits = [...otpDigits]
    newDigits[index] = value
    setOtpDigits(newDigits)

    if (value && index < 7) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  function getSubtitle() {
    switch (mode) {
      case 'forgot': return 'Recuperar senha'
      case 'otp-send': return 'Entrar com código'
      case 'otp-verify': return 'Digite o código recebido'
      case 'primeiro-acesso': return 'Criar a primeira conta'
      default: return 'Faça login para continuar'
    }
  }

  function getButtonLabel() {
    if (submitting) {
      switch (mode) {
        case 'forgot': return 'Enviando...'
        case 'otp-send': return 'Enviando...'
        case 'otp-verify': return 'Verificando...'
        default: return 'Entrando...'
      }
    }
    switch (mode) {
      case 'forgot': return 'Enviar link de recuperação'
      case 'otp-send': return 'Enviar código'
      case 'otp-verify': return 'Verificar código'
      default: return 'Entrar'
    }
  }

  return (
    <div className="login-cume">
      <div className="login-card animate-fade-in">
        {/* Painel da montanha (visual copiado do OMNX Clients); some no celular */}
        <aside className="login-art" aria-hidden>
          <MarcaLogin variante="arte" />
          <div>
            <h2>Gestão do dia a dia, num só lugar.</h2>
            <p>Atendimento, contratos e entregas da sua operação.</p>
          </div>
        </aside>

        <div className="login-form">
        {/* Logo (só no celular) + título */}
        <div className="mb-6 sm:mb-8 text-center">
          <div className="mb-6 flex justify-center min-[761px]:hidden">
            <MarcaLogin variante="clara" />
          </div>
          <h1 className="login-title">Bem-vindo ao {BRAND.appName}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {getSubtitle()}
          </p>
        </div>

        {mode === 'primeiro-acesso' && (
          <PrimeiroAcessoForm onVoltar={() => { setMode('login'); resetState() }} />
        )}

        {mode !== 'primeiro-acesso' && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email — shown in login, forgot, otp-send */}
          {mode !== 'otp-verify' && (
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-[15px] font-medium text-foreground"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="input w-full"
              />
            </div>
          )}

          {/* Password — only in login mode */}
          {mode === 'login' && (
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-[15px] font-medium text-foreground"
              >
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  className="input w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="pt-1 text-right">
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); resetState() }}
                  className="text-sm font-medium text-link hover:underline transition-colors"
                >
                  Esqueci minha senha
                </button>
              </div>
            </div>
          )}

          {/* OTP code inputs */}
          {mode === 'otp-verify' && (
            <div className="space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                Enviamos um código para <span className="font-medium text-foreground">{email}</span>
              </p>
              <div className="flex justify-center gap-1.5 sm:gap-2">
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onFocus={(e) => e.target.select()}
                    className="input h-11 w-9 px-0 text-center text-lg font-semibold sm:h-12 sm:w-11"
                  />
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-sm bg-danger-light px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          {success && (
            <p className="rounded-md bg-success-light px-3 py-2 text-sm text-success">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary btn-lg w-full"
          >
            {getButtonLabel()}
          </button>
        </form>
        )}

        {/* Login mode: show OTP alternative */}
        {mode === 'login' && (
          <div className="mt-4 space-y-3 text-center">
            <div className="login-divider" role="separator"><span>ou</span></div>
            <button
              type="button"
              onClick={() => { setMode('otp-send'); resetState() }}
              className="btn btn-secondary btn-lg w-full"
            >
              Entrar com código por email
            </button>
            {RECURSOS.loginHtaiProvider && (
              <button
                type="button"
                onClick={() => void handleEmpireLogin()}
                disabled={submitting}
                className="btn btn-secondary btn-lg w-full"
              >
                <ShieldCheck className="h-4 w-4" />
                Entrar com High Ticket AI
              </button>
            )}
            {primeiroAcessoAberto && (
              <button
                type="button"
                onClick={() => { setMode('primeiro-acesso'); resetState() }}
                className="btn btn-secondary btn-lg w-full"
              >
                Criar a primeira conta
              </button>
            )}
          </div>
        )}

        {/* Google login — descomentar quando configurar OAuth no Google Cloud Console
        {mode === 'login' && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">ou</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="btn btn-secondary btn-lg w-full"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Entrar com Google
            </button>
          </>
        )}
        */}

        {/* Back to login link */}
        {(mode === 'forgot' || mode === 'otp-send' || mode === 'otp-verify') && (
          <div className="mt-6 text-center">
            {mode === 'otp-verify' && (
              <button
                type="button"
                onClick={async () => {
                  setError('')
                  setSubmitting(true)
                  try {
                    await sendOtp(email)
                    setSuccess('Novo código enviado!')
                    setOtpDigits(Array(8).fill(''))
                    otpRefs.current[0]?.focus()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Erro ao reenviar código.')
                  } finally {
                    setSubmitting(false)
                  }
                }}
                disabled={submitting}
                className="text-sm text-link hover:underline transition-colors disabled:opacity-50"
              >
                Reenviar código
              </button>
            )}
            <button
              type="button"
              onClick={() => { setMode('login'); resetState() }}
              className="mt-2 block w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Voltar ao login
            </button>
          </div>
        )}

        </div>
      </div>
      <p className="login-caption">Tecnologia que desenvolve pessoas.</p>
    </div>
  )
}
