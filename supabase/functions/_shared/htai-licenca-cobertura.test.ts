import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Contrato da licença §4: com a licença negada, toda função com dado ou efeito
// responde 402 antes de trabalhar. Ficam abertas só as que o contrato manda abrir.
const ABERTAS: Record<string, string> = {
  'htai-licenca': 'a própria licença (situação e pull)',
  'htai-exportar': 'exportar os dados',
  'desk-change-password': 'login e senha',
  'iris-ajuda': 'Ajuda (só o manual público, sem dados da empresa)',
}

const raiz = join(__dirname, '..')
const funcoes = readdirSync(raiz, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(raiz, d.name, 'index.ts')))
  .map((d) => d.name)

describe('trava de licença em todas as funções', () => {
  it('a lista de funções não está vazia', () => {
    expect(funcoes.length).toBeGreaterThan(40)
  })

  it.each(funcoes)('%s: tem a trava na entrada ou está na lista de abertas', (nome) => {
    const fonte = readFileSync(join(raiz, nome, 'index.ts'), 'utf8')
    const travada = /servirComLicenca\(|travaDeLicenca\(|exigirLicenca\(/.test(fonte)
    if (nome in ABERTAS) expect(travada).toBe(false)
    else expect(travada).toBe(true)
  })

  it('nenhuma função travada chama Deno.serve direto (o invólucro faz isso)', () => {
    for (const nome of funcoes) {
      const fonte = readFileSync(join(raiz, nome, 'index.ts'), 'utf8')
      if (/servirComLicenca\(/.test(fonte)) expect(fonte).not.toMatch(/Deno\.serve\(/)
    }
  })
})
