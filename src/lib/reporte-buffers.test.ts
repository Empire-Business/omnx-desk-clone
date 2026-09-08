import { describe, it, expect, beforeAll } from 'vitest'
import { instalarCapturaDeContexto, lerBufferConsole, lerBufferRede } from './reporte-buffers'

/**
 * O que estes testes protegem: o reporte de erro só é útil se os logs chegarem
 * de verdade e sem segredo dentro. As duas coisas quebram silenciosamente —
 * um interceptor que não registra e um mascaramento que não mascara parecem
 * iguais em produção, até alguém abrir o ticket e achar o campo vazio (ou um
 * token exposto).
 */
describe('captura de contexto do reporte', () => {
  beforeAll(() => {
    instalarCapturaDeContexto()
    // Segunda chamada de propósito: se não fosse idempotente, cada log passaria
    // a aparecer duas vezes (wrapper encadeado em wrapper).
    instalarCapturaDeContexto()
  })

  it('registra o que passou pelo console', () => {
    console.log('mensagem de teste')
    console.error('estourou aqui')

    const buffer = lerBufferConsole()
    const mensagens = buffer.map((e) => e.mensagem)

    expect(mensagens).toContain('mensagem de teste')
    expect(mensagens).toContain('estourou aqui')
    expect(buffer.find((e) => e.mensagem === 'estourou aqui')?.nivel).toBe('error')
  })

  it('não duplica entradas quando instalado mais de uma vez', () => {
    console.log('linha única')
    const vezes = lerBufferConsole().filter((e) => e.mensagem === 'linha única').length
    expect(vezes).toBe(1)
  })

  it('mascara senha, token e Authorization antes de guardar', () => {
    console.log('login falhou', { email: 'a@b.com', senha: 'MinhaSenha123' })
    console.log('Authorization: Bearer abc123def456ghi')
    console.log('resposta', { access_token: 'eyJhbGciOi.eyJzdWIiOiIx.dBjftJeZ4CV' })

    const texto = lerBufferConsole().map((e) => e.mensagem).join('\n')

    expect(texto).not.toContain('MinhaSenha123')
    expect(texto).not.toContain('abc123def456ghi')
    expect(texto).not.toContain('eyJhbGciOi.eyJzdWIiOiIx.dBjftJeZ4CV')
    // O e-mail continua: é o que identifica quem teve o problema.
    expect(texto).toContain('a@b.com')
  })

  it('serializa erro e objeto sem quebrar', () => {
    console.error(new Error('falha grave'))
    const circular: Record<string, unknown> = { nome: 'x' }
    circular.self = circular // referência circular quebra JSON.stringify
    console.log('objeto circular', circular)

    const texto = lerBufferConsole().map((e) => e.mensagem).join('\n')
    expect(texto).toContain('Error: falha grave')
    expect(texto).toContain('objeto circular')
  })

  it('registra requisições de rede com status e duração', async () => {
    // Um data: URL evita depender de rede no teste — e o interceptor registra
    // igual, porque ele embrulha o fetch, não o transporte.
    try {
      await fetch('data:text/plain,ok')
    } catch {
      // Se o ambiente não resolver data:, o caminho de erro do interceptor é
      // exercitado — e ele também precisa registrar, que é o que checamos abaixo.
    }

    const rede = lerBufferRede()
    expect(rede.length).toBeGreaterThan(0)
    const ultima = rede[rede.length - 1]
    expect(ultima.metodo).toBe('GET')
    expect(ultima.url).toContain('data:text/plain')
    expect(typeof ultima.duracao_ms).toBe('number')
  })

  it('mantém o buffer limitado (não vira dump da sessão inteira)', () => {
    for (let i = 0; i < 300; i++) console.log(`linha ${i}`)
    expect(lerBufferConsole().length).toBeLessThanOrEqual(120)
    // E mantém as MAIS RECENTES: é o que aconteceu perto do erro que importa.
    expect(lerBufferConsole().at(-1)?.mensagem).toBe('linha 299')
  })
})
