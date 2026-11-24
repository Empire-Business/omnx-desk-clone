import { describe, expect, it } from 'vitest'
import { mensagemErroCriarUsuario } from './adminUserError'

describe('erro seguro ao cadastrar colaborador', () => {
  it('lê o código do Response em FunctionsHttpError sem consumir o original', async () => {
    const response = new Response(JSON.stringify({ error: 'perfil_forbidden', detail: 'segredo-interno' }), { status: 403 })
    expect(await mensagemErroCriarUsuario({ context: response }, null)).toBe('Somente administradores podem criar outro administrador.')
    expect(response.bodyUsed).toBe(false)
  })
  it('explica duplicidade e pendência de limpeza sem expor detalhes', async () => {
    expect(await mensagemErroCriarUsuario(null, { error: 'email_ja_cadastrado' })).toContain('já está cadastrado')
    expect(await mensagemErroCriarUsuario(null, { error: 'create_failed_cleanup_pending' })).toContain('antes de tentar novamente')
  })
  it.each([new Response('<html>segredo-interno</html>', { status: 500 }), new Response('{"error":"segredo-interno"}', { status: 500 })])('usa mensagem genérica para resposta desconhecida', async response => {
    expect(await mensagemErroCriarUsuario({ context: response, message: 'segredo-interno' }, null)).not.toContain('segredo-interno')
  })
})

it.each(['constructor', 'toString', '__proto__'])('não aceita código herdado %s', async error => {
  expect(await mensagemErroCriarUsuario(null, { error })).toBe('Não foi possível cadastrar o colaborador. Confira sua conexão e tente novamente.')
})
