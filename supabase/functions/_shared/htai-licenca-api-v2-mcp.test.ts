// Contrato da licença §4 nas duas portas de API do Chat: a trava roda antes de ler
// a chave, então instalação sem licença recebe 402 (e não 401) — com o mesmo corpo
// por motivo das outras funções, que vem de _shared/htai-licenca.ts.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const raiz = fileURLToPath(new URL('../../../', import.meta.url))
const fonte = (funcao: string) => readFileSync(`${raiz}supabase/functions/${funcao}/index.ts`, 'utf8')

describe('API v2 e MCP atrás da trava de licença', () => {
  for (const funcao of ['chat-api-v2', 'desk-mcp']) {
    it(`${funcao}: travaDeLicenca na entrada, antes de ler a chave`, () => {
      const src = fonte(funcao)
      expect(src).toMatch(/import \{ travaDeLicenca \} from '\.\.\/_shared\/htai-licenca\.ts'/)
      const trava = src.indexOf('await travaDeLicenca(')
      expect(trava).toBeGreaterThan(-1)
      expect(trava).toBeLessThan(src.indexOf('extrairChave(req.headers)'))
    })
  }
})
