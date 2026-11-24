import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { mensagemErroPrimeiroAcesso, validarPrimeiroAcesso } from '@/lib/primeiroAcesso'

const ROTULO = 'block text-[13px] font-medium text-foreground tracking-wide'

/**
 * Cadastro da primeira conta do app instalado. A tela de entrada só mostra este
 * formulário enquanto o app não tem administradora; o banco confere de novo no
 * cadastro e faz desta conta a administradora da empresa principal.
 */
export function PrimeiroAcessoForm({ onVoltar }: { onVoltar: () => void }) {
  const { signUpPrimeiroAcesso } = useAuth()
  const navigate = useNavigate()
  const [nome, setNome] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [enviadoPara, setEnviadoPara] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    const dados = { nome, empresa, email, senha, confirmacao }
    const invalido = validarPrimeiroAcesso(dados)
    if (invalido) {
      setErro(invalido)
      return
    }
    setEnviando(true)
    try {
      const resultado = await signUpPrimeiroAcesso(dados)
      setSenha('')
      setConfirmacao('')
      if (resultado === 'entrou') {
        navigate('/', { replace: true })
        return
      }
      setEnviadoPara(email.trim().toLowerCase())
    } catch (err) {
      setErro(mensagemErroPrimeiroAcesso(err))
    } finally {
      setEnviando(false)
    }
  }

  if (enviadoPara) {
    return (
      <div className="space-y-5">
        <p role="status" className="rounded-md bg-success-light px-3 py-2 text-sm text-success">
          Conta criada! Enviamos um link de confirmação para <span className="font-medium">{enviadoPara}</span>.
          Abra o e-mail (olhe também o spam) e clique no link para entrar no app.
        </p>
        <button type="button" onClick={onVoltar} className="btn btn-secondary btn-lg w-full">
          Voltar ao login
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <p className="text-sm text-muted-foreground">
        Este app ainda não tem administradora. A conta criada aqui vira a administradora da empresa.
        Depois disso, a equipe entra por convite de dentro do app.
      </p>

      <div className="space-y-1.5">
        <label htmlFor="pa-nome" className={ROTULO}>Seu nome</label>
        <input id="pa-nome" type="text" autoComplete="name" required maxLength={120} value={nome}
          onChange={(e) => setNome(e.target.value)} className="input w-full" disabled={enviando} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pa-empresa" className={ROTULO}>Nome da empresa</label>
        <input id="pa-empresa" type="text" autoComplete="organization" required maxLength={120} value={empresa}
          onChange={(e) => setEmpresa(e.target.value)} className="input w-full" disabled={enviando} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pa-email" className={ROTULO}>Email</label>
        <input id="pa-email" type="email" autoComplete="email" required value={email} placeholder="seu@email.com"
          onChange={(e) => setEmail(e.target.value)} className="input w-full" disabled={enviando} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pa-senha" className={ROTULO}>Senha</label>
        <div className="relative">
          <input id="pa-senha" type={mostrarSenha ? 'text' : 'password'} autoComplete="new-password" required minLength={8}
            value={senha} onChange={(e) => setSenha(e.target.value)} className="input w-full pr-10" disabled={enviando} />
          <button type="button" onClick={() => setMostrarSenha((m) => !m)} tabIndex={-1}
            aria-label={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
            {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pa-confirmacao" className={ROTULO}>Confirmar senha</label>
        <input id="pa-confirmacao" type={mostrarSenha ? 'text' : 'password'} autoComplete="new-password" required minLength={8}
          value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} className="input w-full" disabled={enviando} />
      </div>

      {erro && (
        <p role="alert" className="rounded-sm bg-danger-light px-3 py-2 text-sm text-danger">{erro}</p>
      )}

      <button type="submit" disabled={enviando} className="btn btn-primary btn-lg w-full">
        {enviando ? 'Criando a conta...' : 'Criar a conta'}
      </button>

      <button type="button" onClick={onVoltar} disabled={enviando}
        className="block w-full text-sm text-muted-foreground hover:text-foreground transition-colors">
        Voltar ao login
      </button>
    </form>
  )
}
