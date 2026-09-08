import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      navigate('/')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao redefinir senha.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-xl animate-fade-in">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">
            EMPIRE<span className="text-accent">.</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Defina sua nova senha
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-[13px] font-medium text-foreground tracking-wide"
            >
              Nova senha
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-sm border-[1.5px] border-input bg-muted px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:bg-card focus:shadow-[0_0_0_3px_var(--primary-glow)] transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="confirmPassword"
              className="block text-[13px] font-medium text-foreground tracking-wide"
            >
              Confirmar senha
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-sm border-[1.5px] border-input bg-muted px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:bg-card focus:shadow-[0_0_0_3px_var(--primary-glow)] transition-all"
            />
          </div>

          {error && (
            <p className="rounded-sm bg-danger-light px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-sm bg-primary px-4 py-2.5 font-semibold text-primary-foreground tracking-wide shadow-md transition-all hover:bg-primary-hover hover:-translate-y-px hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
          >
            {submitting ? 'Salvando...' : 'Redefinir senha'}
          </button>
        </form>

        <div className="mt-8 h-px bg-gradient-to-r from-accent to-transparent" />
      </div>
    </div>
  )
}
