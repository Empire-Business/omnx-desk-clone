/** Erros PostgREST/Auth nem sempre são instâncias de Error. Não serializa payloads. */
export function mensagemErro(erro: unknown): string {
  if (typeof erro === 'string') return erro
  try {
    if (erro instanceof Error) return `${erro.name}: ${erro.message}`
    if (erro && typeof erro === 'object') {
      const dados = erro as Record<string, unknown>
      const mensagem = [dados.message, dados.error_description, dados.error]
        .find((valor): valor is string => typeof valor === 'string' && valor.trim().length > 0)
      if (mensagem) {
        const codigo = typeof dados.code === 'string' ? dados.code : null
        return codigo ? `[${codigo}] ${mensagem}` : mensagem
      }
    }
  } catch { /* Objetos externos podem ter getters que lançam. */ }
  return 'Erro sem mensagem disponível'
}
