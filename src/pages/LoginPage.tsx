import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { OmnxLockup } from '@/components/icons/OmnxLockup'

type Mode = 'login' | 'forgot' | 'otp-send' | 'otp-verify'

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
  const { signIn, signInWithGoogle, sendOtp, verifyOtp, resetPassword } = useAuth()
  const navigate = useNavigate()

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

  async function handleGoogleLogin() {
    setError('')
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao entrar com Google.'
      )
    }
  }

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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 sm:p-6 lg:p-8 shadow-xl animate-fade-in">
        {/* Logo */}
        <div className="mb-6 sm:mb-8 text-center">
          <div className="flex justify-center">
            <OmnxLockup word="DESK" height={40} variant="dark" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {getSubtitle()}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email — shown in login, forgot, otp-send */}
          {mode !== 'otp-verify' && (
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-[13px] font-medium text-foreground tracking-wide"
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
                className="w-full rounded-sm border-[1.5px] border-input bg-muted px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:bg-card focus:shadow-[0_0_0_3px_var(--primary-glow)] transition-all"
              />
            </div>
          )}

          {/* Password — only in login mode */}
          {mode === 'login' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-[13px] font-medium text-foreground tracking-wide"
                >
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); resetState() }}
                  className="text-[13px] text-accent hover:text-accent/80 transition-colors"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-sm border-[1.5px] border-input bg-muted px-3.5 py-2.5 pr-10 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:bg-card focus:shadow-[0_0_0_3px_var(--primary-glow)] transition-all"
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
                    className="h-10 w-8 sm:h-12 sm:w-10 rounded-sm border-[1.5px] border-input bg-muted text-center text-base sm:text-lg font-semibold text-foreground focus:outline-none focus:border-ring focus:bg-card focus:shadow-[0_0_0_3px_var(--primary-glow)] transition-all"
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
            <p className="rounded-sm bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-sm bg-primary px-4 py-2.5 font-semibold text-primary-foreground tracking-wide shadow-md transition-all hover:bg-primary-hover hover:-translate-y-px hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
          >
            {getButtonLabel()}
          </button>
        </form>

        {/* Login mode: show OTP alternative */}
        {mode === 'login' && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => { setMode('otp-send'); resetState() }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Entrar com código por email
            </button>
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
              className="flex w-full items-center justify-center gap-3 rounded-sm border-[1.5px] border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted hover:-translate-y-px hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring/30"
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
                className="text-sm text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
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

        {/* Gold bottom accent */}
        <div className="mt-8 h-px bg-gradient-to-r from-accent to-transparent" />
      </div>
    </div>
  )
}
