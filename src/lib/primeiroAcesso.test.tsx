import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Primeiro acesso (D3 do ensaio real de 19/11/2026): a tela de entrada oferece
// "Criar a primeira conta" só enquanto o banco diz que o app não tem administradora.

const estado = vi.hoisted(() => ({
  rpc: { data: true as unknown, error: null as unknown },
  chamadas: [] as string[],
  signUp: vi.fn(),
  aberto: false,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: async (nome: string) => { estado.chamadas.push(nome); return estado.rpc },
    auth: { signUp: (...args: unknown[]) => estado.signUp(...args) },
  },
}))
vi.mock('@/hooks/usePrimeiroAcesso', () => ({ usePrimeiroAcessoAberto: () => estado.aberto }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams()] }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: vi.fn(), signInWithEmpire: vi.fn(), sendOtp: vi.fn(), verifyOtp: vi.fn(), resetPassword: vi.fn(),
    signOut: vi.fn(), refreshAccess: vi.fn(), signUpPrimeiroAcesso: vi.fn(),
  }),
}))

import {
  buscarPrimeiroAcessoAberto,
  cadastrarPrimeiraConta,
  MENSAGEM_PRIMEIRO_ACESSO_FECHADO,
  mensagemErroPrimeiroAcesso,
  validarPrimeiroAcesso,
} from './primeiroAcesso'
import { LoginPage } from '@/pages/LoginPage'
import { PrimeiroAcessoForm } from '@/components/auth/PrimeiroAcessoForm'

const dados = { nome: ' Dona ', empresa: ' Empresa Teste ', email: ' Dona@Exemplo.com ', senha: 'senha-forte-1', confirmacao: 'senha-forte-1' }

afterEach(() => {
  estado.rpc = { data: true, error: null }
  estado.chamadas = []
  estado.signUp.mockReset()
  estado.aberto = false
})

describe('porta do primeiro acesso', () => {
  it('só um true do banco abre; erro, banco sem a migração ou resposta estranha = fechada', async () => {
    expect(await buscarPrimeiroAcessoAberto()).toBe(true)
    expect(estado.chamadas).toEqual(['desk_primeiro_acesso_aberto'])
    for (const r of [
      { data: null, error: { code: 'PGRST202' } },
      { data: false, error: null },
      { data: 'true', error: null },
      { data: { aberto: true }, error: null },
      { data: true, error: { code: 'htai_licenca' } },
    ]) {
      estado.rpc = r
      expect(await buscarPrimeiroAcessoAberto()).toBe(false)
    }
  })

  it('tela de entrada: o botão só aparece com a porta aberta (na produção da empresa, nunca)', () => {
    const fechada = renderToStaticMarkup(<LoginPage />)
    expect(fechada).not.toContain('Criar a primeira conta')
    expect(fechada).toContain('Entrar com código por email')
    estado.aberto = true
    expect(renderToStaticMarkup(<LoginPage />)).toContain('Criar a primeira conta')
  })

  it('formulário pede nome, empresa, e-mail e senha duas vezes e explica o que acontece', () => {
    const html = renderToStaticMarkup(<PrimeiroAcessoForm onVoltar={() => {}} />)
    for (const id of ['pa-nome', 'pa-empresa', 'pa-email', 'pa-senha', 'pa-confirmacao']) expect(html).toContain(`id="${id}"`)
    expect(html).toContain('vira a administradora da empresa')
    expect(html).toContain('autoComplete="new-password"')
    expect(html).toContain('Voltar ao login')
  })

  it('valida o formulário antes de chamar o servidor', () => {
    expect(validarPrimeiroAcesso(dados)).toBeNull()
    expect(validarPrimeiroAcesso({ ...dados, nome: ' ' })).toMatch(/seu nome/)
    expect(validarPrimeiroAcesso({ ...dados, empresa: 'x' })).toMatch(/empresa/)
    expect(validarPrimeiroAcesso({ ...dados, email: 'dona@' })).toMatch(/e-mail válido/)
    expect(validarPrimeiroAcesso({ ...dados, senha: '1234567', confirmacao: '1234567' })).toMatch(/8 caracteres/)
    expect(validarPrimeiroAcesso({ ...dados, confirmacao: 'outra-senha-1' })).toMatch(/não coincidem/)
  })

  it('cadastro manda só nome e empresa nos dados da conta (perfil e empresa de destino quem decide é o banco)', async () => {
    estado.signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null })
    expect(await cadastrarPrimeiraConta(dados, 'https://app.exemplo.com')).toEqual({ sessao: null })
    expect(estado.signUp).toHaveBeenCalledTimes(1)
    expect(estado.signUp).toHaveBeenCalledWith({
      email: 'dona@exemplo.com',
      password: 'senha-forte-1',
      options: { data: { nome: 'Dona', empresa: 'Empresa Teste' }, emailRedirectTo: 'https://app.exemplo.com/' },
    })
    const [{ options }] = estado.signUp.mock.calls[0] as [{ options: { data: Record<string, unknown> } }]
    expect(Object.keys(options.data).sort()).toEqual(['empresa', 'nome'])
  })

  it('confirmação de e-mail desligada: devolve a sessão para a tela entrar direto', async () => {
    estado.signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 'tok' } }, error: null })
    expect(await cadastrarPrimeiraConta(dados, 'https://app.exemplo.com')).toEqual({ sessao: { userId: 'u1', accessToken: 'tok' } })
  })

  it('porta fechada no meio do caminho: nem chama o cadastro', async () => {
    estado.rpc = { data: false, error: null }
    await expect(cadastrarPrimeiraConta(dados, 'https://app.exemplo.com')).rejects.toMatchObject({ code: 'primeiro_acesso_fechado' })
    expect(estado.signUp).not.toHaveBeenCalled()
  })

  it('erros do cadastro em português, sem detalhe técnico', () => {
    expect(mensagemErroPrimeiroAcesso({ code: 'primeiro_acesso_fechado' })).toBe(MENSAGEM_PRIMEIRO_ACESSO_FECHADO)
    expect(mensagemErroPrimeiroAcesso({ code: 'signup_disabled', status: 422 })).toMatch(/cadastro deste app está fechado/)
    expect(mensagemErroPrimeiroAcesso({ code: 'user_already_exists', status: 422 })).toMatch(/já tem conta/)
    expect(mensagemErroPrimeiroAcesso({ code: 'weak_password', status: 422 })).toMatch(/fraca/)
    expect(mensagemErroPrimeiroAcesso({ code: 'over_email_send_rate_limit', status: 429 })).toMatch(/Espere alguns minutos/)
    expect(mensagemErroPrimeiroAcesso({ code: 'unexpected_failure', status: 500, message: 'Database error saving new user' })).toMatch(/acabou de ser instalado/)
    expect(mensagemErroPrimeiroAcesso(new Error('qualquer coisa'))).toBe('Não foi possível criar a conta. Confira os dados e tente de novo.')
    expect(mensagemErroPrimeiroAcesso(null)).toBe('Não foi possível criar a conta. Confira os dados e tente de novo.')
  })
})
