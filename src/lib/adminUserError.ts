const mensagens: Record<string, string> = {
  unauthorized: 'Sua sessão expirou. Entre novamente para cadastrar a pessoa.',
  forbidden: 'Seu acesso não permite cadastrar colaboradores.',
  perfil_forbidden: 'Somente administradores podem criar outro administrador.',
  tenant_invalid: 'Não foi possível confirmar sua empresa. Atualize a página ou procure a administração.',
  department_invalid: 'Selecione um departamento válido.',
  department_forbidden: 'O departamento selecionado não está disponível na sua empresa.',
  nome_invalid: 'Informe um nome válido, com até 200 caracteres.',
  email_invalid: 'Informe um e-mail válido.',
  perfil_invalid: 'Selecione um perfil de acesso válido.',
  body_invalid: 'Confira os dados do cadastro e tente novamente.',
  email_ja_cadastrado: 'Este e-mail já está cadastrado. Confira a lista de colaboradores.',
  profile_save_failed: 'Não foi possível concluir o perfil do colaborador. Tente novamente.',
  recovery_failed: 'Não foi possível gerar o link para definir a senha. Tente novamente.',
  create_failed_cleanup_pending: 'O cadastro ficou pendente. Procure a administração antes de tentar novamente.',
}

/** Aceita somente códigos conhecidos; detalhes internos da função não vão para a tela. */
export async function mensagemErroCriarUsuario(error: unknown, data: unknown): Promise<string> {
  let payload = data
  if (error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
    try { payload = await error.context.clone().json() } catch { /* Resposta de proxy/rede sem JSON. */ }
  }
  const codigo = payload && typeof payload === 'object' && 'error' in payload ? payload.error : null
  return typeof codigo === 'string' && Object.hasOwn(mensagens, codigo)
    ? mensagens[codigo]
    : 'Não foi possível cadastrar o colaborador. Confira sua conexão e tente novamente.'
}
