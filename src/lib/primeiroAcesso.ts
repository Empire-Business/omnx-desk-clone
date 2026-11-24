// Primeiro acesso do app instalado: a primeira conta é criada pela tela de
// entrada e vira a administradora da empresa principal (handle_new_user).
// A porta só existe enquanto o app não tem NENHUMA administradora; quem decide
// é o banco (desk_primeiro_acesso_aberto, migração 20261119180000). Aqui a tela
// só pergunta, valida o formulário e chama o cadastro do Supabase Auth.
// Na produção da empresa sempre existe administradora: a função responde false
// e o botão não aparece.
import { supabase } from '@/lib/supabase'

type RpcSemTipo = { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> }

/** Só `true` abre a porta. Erro, banco sem a migração ou resposta estranha = fechada. */
export async function buscarPrimeiroAcessoAberto(): Promise<boolean> {
  try {
    const { data, error } = await (supabase as unknown as RpcSemTipo).rpc('desk_primeiro_acesso_aberto')
    return !error && data === true
  } catch {
    return false
  }
}

export interface DadosPrimeiroAcesso {
  nome: string
  empresa: string
  email: string
  senha: string
  confirmacao: string
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Devolve a primeira mensagem de erro do formulário, ou null se está tudo certo. */
export function validarPrimeiroAcesso(d: DadosPrimeiroAcesso): string | null {
  const nome = d.nome.trim()
  const empresa = d.empresa.trim()
  if (nome.length < 2 || nome.length > 120) return 'Informe o seu nome (de 2 a 120 caracteres).'
  if (empresa.length < 2 || empresa.length > 120) return 'Informe o nome da empresa (de 2 a 120 caracteres).'
  if (!EMAIL.test(d.email.trim())) return 'Informe um e-mail válido.'
  if (d.senha.length < 8) return 'Use uma senha com pelo menos 8 caracteres.'
  if (d.senha !== d.confirmacao) return 'As senhas não coincidem.'
  return null
}

export const MENSAGEM_PRIMEIRO_ACESSO_FECHADO =
  'Este app já tem administradora, então o cadastro por esta tela está fechado. Peça um convite a ela.'

/** Erro do cadastro em português, sem detalhes técnicos. */
export function mensagemErroPrimeiroAcesso(erro: unknown): string {
  const e = (erro && typeof erro === 'object' ? erro : {}) as { code?: unknown; status?: unknown; message?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const msg = typeof e.message === 'string' ? e.message : ''
  if (code === 'primeiro_acesso_fechado') return MENSAGEM_PRIMEIRO_ACESSO_FECHADO
  if (code === 'signup_disabled' || /signups? not allowed/i.test(msg)) {
    return 'O cadastro deste app está fechado. Se você é da equipe, peça um convite à administradora.'
  }
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(msg)) {
    return 'Este e-mail já tem conta. Use "Entrar" ou "Esqueci minha senha".'
  }
  if (code === 'weak_password') return 'Essa senha é fraca. Use uma senha maior, misturando letras e números.'
  if (code === 'email_address_invalid') return 'Este e-mail não foi aceito. Confira se está certo.'
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || e.status === 429) {
    return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'
  }
  if (code === 'unexpected_failure' || (typeof e.status === 'number' && e.status >= 500)) {
    // Ex.: a licença acabou de ser ativada e o app ainda não confirmou (até 5 minutos).
    return 'Não foi possível criar a conta agora. Se o app acabou de ser instalado, espere alguns minutos e tente de novo.'
  }
  return 'Não foi possível criar a conta. Confira os dados e tente de novo.'
}

export interface ResultadoPrimeiroAcesso {
  /** Sessão aberta na hora (confirmação de e-mail desligada no Supabase). */
  sessao: { userId: string; accessToken: string } | null
}

/**
 * Confere de novo que a porta está aberta e cria a conta. Só vão nome e empresa
 * nos dados da conta: perfil e empresa de destino quem decide é o banco.
 * A confirmação de e-mail (ligada no app instalado) leva de volta ao início do app.
 */
export async function cadastrarPrimeiraConta(d: DadosPrimeiroAcesso, origem: string): Promise<ResultadoPrimeiroAcesso> {
  if (!(await buscarPrimeiroAcessoAberto())) {
    throw Object.assign(new Error(MENSAGEM_PRIMEIRO_ACESSO_FECHADO), { code: 'primeiro_acesso_fechado' })
  }
  const { data, error } = await supabase.auth.signUp({
    email: d.email.trim().toLowerCase(),
    password: d.senha,
    options: {
      data: { nome: d.nome.trim(), empresa: d.empresa.trim() },
      emailRedirectTo: `${origem}/`,
    },
  })
  if (error) throw error
  const sessao = data.session && data.user
    ? { userId: data.user.id, accessToken: data.session.access_token }
    : null
  return { sessao }
}
