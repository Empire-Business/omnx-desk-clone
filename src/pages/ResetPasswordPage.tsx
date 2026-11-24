import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { changeOwnPassword, passwordChangeMessage, type PasswordIdentity, type PasswordChangeBody } from '@/lib/passwordChangeRequest'

export function ResetPasswordPage({ obrigatoria = false }: { obrigatoria?: boolean }) {
  const { user, loading, passwordAccess, passwordAccessError, sessionIdentity, refreshAccess } = useAuth()
  const [retryError, setRetryError] = useState(false)
  if (loading && !sessionIdentity) return <div role="status" className="p-8 text-center">Confirmando sua sessão…</div>
  if (passwordAccessError || (obrigatoria && passwordAccess?.state === 'ok' && !user && !loading)) {
    return <div className="mx-auto max-w-md space-y-4 p-8">
      <p role="alert">Não foi possível confirmar seu acesso. Sua sessão não foi encerrada.</p>
      <button type="button" onClick={() => { setRetryError(false); void refreshAccess().catch(() => setRetryError(true)) }}>Conferir acesso novamente</button>
      {retryError && <p role="alert">A confirmação continua indisponível. Tente novamente em instantes.</p>}
      <Link className="block underline" to="/login">Voltar ao login</Link>
    </div>
  }
  if (!sessionIdentity || passwordAccess?.state === 'invalid_session') return <div className="mx-auto max-w-md space-y-4 p-8">
    <p role="alert">Entre na sua conta ou solicite um novo link de recuperação para definir a senha.</p>
    <Link className="underline" to="/login">Ir para o login</Link>
  </div>
  if (obrigatoria && passwordAccess?.state === 'ok' && user) return <Navigate to="/" replace />
  return <PasswordForm key={`${sessionIdentity.userId}:${sessionIdentity.sessionId}`} identity={sessionIdentity}
    obrigatoria={obrigatoria || passwordAccess?.state === 'password_change_required'} />
}

function PasswordForm({ identity, obrigatoria }: { identity: PasswordIdentity; obrigatoria: boolean }) {
  const { refreshAccess } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [nonce, setNonce] = useState('')
  const [needsCurrentPassword, setNeedsCurrentPassword] = useState(false)
  const [needsCode, setNeedsCode] = useState(false)
  const [codeNotice, setCodeNotice] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [proof, setProof] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const busy = useRef(false)
  const mounted = useRef(true)
  const navigate = useNavigate()
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  function clearSecrets() {
    setPassword(''); setConfirmPassword(''); setCurrentPassword(''); setNonce('')
  }

  async function confirmAccess() {
    const state = await refreshAccess(identity)
    if (!mounted.current) return
    if (state.access?.state === 'ok' && state.user) navigate('/', { replace: true })
    else setError('A troca ainda precisa ser confirmada pelo servidor. O acesso permanece protegido.')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy.current) return
    setError('')
    if (!proof && (password.length < 8 || password !== confirmPassword)) {
      setError(password.length < 8 ? 'Use uma senha com pelo menos 8 caracteres.' : 'As senhas não coincidem.')
      return
    }
    if (!proof && needsCurrentPassword && !currentPassword) {
      setError('Informe sua senha atual para confirmar a troca.')
      return
    }
    if (!proof && needsCode && !/^\d{6,12}$/.test(nonce)) {
      setError('Informe o código de confirmação com 6 a 12 dígitos.')
      return
    }
    busy.current = true
    setSubmitting(true)
    if (!proof) setSaved(false)
    const body: PasswordChangeBody = proof ? { completion_proof: proof } : {
      password, ...(needsCurrentPassword ? { current_password: currentPassword } : {}), ...(needsCode ? { nonce } : {}),
    }
    // Nunca persiste senha ou comprovante em storage, cache ou logs.
    clearSecrets()
    try {
      const result = await changeOwnPassword(identity, body)
      if (!mounted.current) return
      if (result.passwordUpdated) setSaved(true)
      if (result.proof) setProof(result.proof)
      if (result.ok) {
        setProof(null)
        await confirmAccess()
      } else {
        if (result.error === 'current_password_required' || result.error === 'current_password_mismatch') setNeedsCurrentPassword(true)
        if (result.error === 'reauthentication_needed') setNeedsCode(true)
        if (result.error === 'confirmation_expired' || result.error === 'confirmation_invalid') setProof(null)
        setError(passwordChangeMessage(result.error))
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Não foi possível confirmar a troca.')
    } finally {
      busy.current = false
      if (mounted.current) setSubmitting(false)
    }
  }

  async function sendCode() {
    if (busy.current) return
    busy.current = true; setSubmitting(true); setError(''); setCodeNotice(''); clearSecrets()
    try {
      const result = await changeOwnPassword(identity, { reauthenticate: true })
      if (!mounted.current) return
      if (result.reauthenticationSent) setCodeNotice('Código enviado para confirmar sua identidade. Confira seu e-mail ou telefone cadastrado.')
      else setError(passwordChangeMessage(result.error))
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Não foi possível solicitar o código.')
    } finally { busy.current = false; if (mounted.current) setSubmitting(false) }
  }

  async function checkAccess() {
    if (busy.current) return
    busy.current = true; setSubmitting(true); setError('')
    try { await confirmAccess() }
    catch { if (mounted.current) setError('Não foi possível confirmar seu acesso. Tente novamente em instantes.') }
    finally { busy.current = false; if (mounted.current) setSubmitting(false) }
  }

  return <div className="flex min-h-dvh items-center justify-center bg-background p-4">
    <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-5 shadow-pop sm:p-8">
      <div className="space-y-2">
        <h1 className="t-h2 text-foreground">{obrigatoria ? 'Defina uma nova senha para continuar' : 'Defina sua nova senha'}</h1>
        <p className="text-sm text-muted-foreground">{obrigatoria ? 'Sua conta precisa substituir a senha inicial. Escolha uma senha só sua.' : 'Escolha uma senha diferente da anterior.'}</p>
        <p className="text-xs text-muted-foreground">A troca mantém esta sessão e encerra as outras sessões da sua conta.</p>
      </div>
      {saved && <p role="status" className="text-sm">A senha foi salva. Estamos confirmando a liberação do acesso.</p>}
      {needsCode && !proof && <div className="space-y-2">
        <button type="button" disabled={submitting} onClick={() => { void sendCode() }} className="btn btn-ghost -ml-3 text-sm">Enviar código de confirmação</button>
        {codeNotice && <p role="status" className="text-sm">{codeNotice}</p>}
      </div>}
      <form onSubmit={submit} className="space-y-5">
        {!proof && <>
          {needsCurrentPassword && <label className="block space-y-1 text-sm" htmlFor="currentPassword"><span>Senha atual</span>
            <input id="currentPassword" type="password" autoComplete="current-password" required maxLength={4096} disabled={submitting}
              value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="input w-full" />
          </label>}
          <label className="block space-y-1 text-sm" htmlFor="password"><span>Nova senha</span>
            <input id="password" type="password" autoComplete="new-password" required minLength={8} maxLength={4096} disabled={submitting}
              value={password} onChange={e => setPassword(e.target.value)} className="input w-full" />
          </label>
          <label className="block space-y-1 text-sm" htmlFor="confirmPassword"><span>Confirmar senha</span>
            <input id="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={4096} disabled={submitting}
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="input w-full" />
          </label>
          {needsCode && <label className="block space-y-1 text-sm" htmlFor="confirmationCode"><span>Código de confirmação</span>
            <input id="confirmationCode" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6,12}" maxLength={12} disabled={submitting}
              value={nonce} onChange={e => setNonce(e.target.value.replace(/\D/g, ''))} className="input w-full" />
          </label>}
        </>}
        {error && <p role="alert" className="rounded bg-danger-light p-3 text-sm text-danger">{error}</p>}
        <button type="submit" disabled={submitting} className="btn btn-primary btn-lg w-full">
          {submitting ? 'Confirmando…' : proof ? 'Confirmar liberação do acesso' : 'Salvar nova senha'}
        </button>
      </form>
      <button type="button" disabled={submitting} onClick={() => { void checkAccess() }} className="btn btn-ghost -ml-3 text-sm">Conferir acesso sem reenviar a senha</button>
      <Link className="btn btn-ghost -ml-3 text-sm" to="/login">Voltar ao login</Link>
    </div>
  </div>
}
